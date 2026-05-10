/**
 * agentState.ts — live ephemeral state of the angel.
 *
 * one row per user. mutations patch in place so renderer subscriptions get
 * minimal-diff updates. heartbeat-style entries also write here from cron so
 * /admin shows that the convex spine is alive.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

async function findUserId(ctx: { db: any }, externalUserId: string): Promise<Id<'users'> | null> {
  const u = await ctx.db
    .query('users')
    .withIndex('by_authId', (q: any) => q.eq('authId', externalUserId))
    .unique();
  return u?._id ?? null;
}

async function upsertState(
  ctx: any,
  externalUserId: string,
  patch: Record<string, unknown>,
) {
  const userId = await findUserId(ctx, externalUserId);
  if (!userId) return null;
  const existing = await ctx.db
    .query('agentState')
    .withIndex('by_userId', (q: any) => q.eq('userId', userId))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    return existing._id;
  }
  // first write — initialize defaults so the row is valid against schema
  return await ctx.db.insert('agentState', {
    userId,
    emotion: 'neutral',
    location: 'center',
    isWalking: false,
    updatedAt: now,
    ...patch,
  });
}

export const setEmotion = mutation({
  args: { userId: v.string(), emotion: v.string() },
  handler: async (ctx, args) => upsertState(ctx, args.userId, { emotion: args.emotion }),
});

export const setLocation = mutation({
  args: { userId: v.string(), anchorId: v.string() },
  handler: async (ctx, args) => upsertState(ctx, args.userId, { location: args.anchorId }),
});

export const setFaceExpression = mutation({
  args: { userId: v.string(), face: v.string() },
  handler: async (ctx, args) =>
    upsertState(ctx, args.userId, { faceExpression: args.face }),
});

export const setWalkingState = mutation({
  args: {
    userId: v.string(),
    isWalking: v.boolean(),
    walkTarget: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    upsertState(ctx, args.userId, {
      isWalking: args.isWalking,
      walkTarget: args.walkTarget,
    }),
});

export const getCurrent = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const userId = await findUserId(ctx, args.userId);
    if (!userId) return null;
    return await ctx.db
      .query('agentState')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique();
  },
});

export const recordHeartbeat = mutation({
  args: {
    source: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const last = await ctx.db.query('heartbeats').order('desc').first();
    const counter = (last?.counter ?? 0) + 1;
    return await ctx.db.insert('heartbeats', {
      source: args.source,
      counter,
      timestamp: Date.now(),
      note: args.note,
    });
  },
});

export const recentHeartbeats = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 20;
    return await ctx.db.query('heartbeats').order('desc').take(n);
  },
});

export const lastHeartbeat = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('heartbeats').order('desc').first();
  },
});

/**
 * surfaceActivity — one-shot snapshot of every always-on surface for
 * /admin/heartbeats. Aggregates the heartbeats table by `source` and the
 * memoryMirror + bgObservations + smsTurns + discordTurns tables by their
 * intrinsic source dimension. Returns one row per surface with last-fired
 * timestamp + 24h activation count.
 *
 * Cheap because we cap each scan at the most recent ~500 rows ordered by
 * `_creationTime` desc (the implicit by_creation index). 24h is much smaller
 * than that in practice; for a hackathon this is fine.
 */
export const surfaceActivity = query({
  args: {},
  handler: async (ctx) => {
    const SCAN_LIMIT = 500;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ONE_DAY_MS;

    type Row = {
      source: string;
      lastTimestamp: number | null;
      count24h: number;
    };
    const acc = new Map<string, Row>();
    function bump(source: string, ts: number) {
      const r = acc.get(source) ?? { source, lastTimestamp: null, count24h: 0 };
      if (r.lastTimestamp === null || ts > r.lastTimestamp) r.lastTimestamp = ts;
      if (ts >= cutoff) r.count24h += 1;
      acc.set(source, r);
    }

    // 1. heartbeats — split by `source` field (cron / desktop / web / etc).
    const heartbeats = await ctx.db.query('heartbeats').order('desc').take(SCAN_LIMIT);
    for (const h of heartbeats) {
      const source = `heartbeat:${h.source}`;
      bump(source, h.timestamp);
    }

    // 2. memoryMirror — group by metadata.source so we capture sms / discord /
    //    discord-passive / introspection / scheduled-cron / tensorlake / etc.
    const memory = await ctx.db.query('memoryMirror').order('desc').take(SCAN_LIMIT);
    for (const m of memory) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const src = typeof meta.source === 'string' && meta.source ? meta.source : 'unknown';
      bump(`memory:${src}`, m.timestamp);
    }

    // 3. bgObservations — group by `kind`.
    const bg = await ctx.db.query('bgObservations').order('desc').take(SCAN_LIMIT);
    for (const b of bg) {
      bump(`bg:${b.kind}`, b.timestamp);
    }

    // 4. smsTurns — split inbound / outbound for the sms-inbound webhook.
    const sms = await ctx.db.query('smsTurns').order('desc').take(SCAN_LIMIT);
    for (const s of sms) {
      bump(`sms:${s.direction}`, s.timestamp);
    }

    // 5. discordTurns — split inbound (discord-passive) / outbound.
    const discord = await ctx.db.query('discordTurns').order('desc').take(SCAN_LIMIT);
    for (const d of discord) {
      bump(`discord:${d.direction}`, d.timestamp);
    }

    return Array.from(acc.values()).sort((a, b) => {
      const at = a.lastTimestamp ?? 0;
      const bt = b.lastTimestamp ?? 0;
      return bt - at;
    });
  },
});
