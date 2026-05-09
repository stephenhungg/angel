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
