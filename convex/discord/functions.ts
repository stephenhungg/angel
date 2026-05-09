/**
 * discord/functions.ts — convex mutations + queries for the Discord surface.
 *
 * Mirrors convex/sms/functions.ts. Lives in a separate file from the
 * orchestrator because the orchestrator runs as a node action and can't
 * declare query/mutation in the same module.
 */

import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';

/* ------------------------------------------------------------------ */
/* discord turn log — transcript per user                              */
/* ------------------------------------------------------------------ */

export const appendDiscordTurn = mutation({
  args: {
    userId: v.string(),
    direction: v.union(v.literal('inbound'), v.literal('outbound')),
    body: v.string(),
    discordUserId: v.string(),
    discordChannelId: v.optional(v.string()),
    discordGuildId: v.optional(v.string()),
    interactionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('discordTurns', {
      userId: args.userId,
      direction: args.direction,
      body: args.body,
      discordUserId: args.discordUserId,
      discordChannelId: args.discordChannelId,
      discordGuildId: args.discordGuildId,
      interactionToken: args.interactionToken,
      timestamp: Date.now(),
    });
  },
});

export const recentDiscordTurns = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const n = args.limit ?? 10;
    const rows = await ctx.db
      .query('discordTurns')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(n);
    return rows.map((r) => ({
      direction: r.direction,
      body: r.body,
      discordUserId: r.discordUserId,
      discordChannelId: r.discordChannelId,
      discordGuildId: r.discordGuildId,
      timestamp: r.timestamp,
    }));
  },
});

export const allRecentDiscordTurns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;
    return await ctx.db.query('discordTurns').order('desc').take(n);
  },
});

/* ------------------------------------------------------------------ */
/* discord-id → user lookup                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolve an incoming discord user id (snowflake) to a user authId. We look
 * in onboardingExtras.discordUserId. Returns the authId if found, else null.
 */
export const findUserByDiscordId = query({
  args: { discordUserId: v.string() },
  handler: async (ctx, args) => {
    const extras = await ctx.db
      .query('onboardingExtras')
      .withIndex('by_discordUserId', (q) => q.eq('discordUserId', args.discordUserId))
      .unique();
    if (extras?.authId) return { authId: extras.authId };
    return null;
  },
});

/**
 * Set / update a user's discord user id after onboarding. Idempotent.
 */
export const setDiscordUserId = mutation({
  args: {
    userId: v.string(),
    discordUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('onboardingExtras')
      .withIndex('by_authId', (q) => q.eq('authId', args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        discordUserId: args.discordUserId,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert('onboardingExtras', {
      authId: args.userId,
      discordUserId: args.discordUserId,
      updatedAt: now,
    });
  },
});

/* ------------------------------------------------------------------ */
/* listener cursors — durable state for the Tensorlake polling agent  */
/* ------------------------------------------------------------------ */

/**
 * Read all known channel cursors. The Tensorlake-hosted polling agent
 * calls this on every cron firing to know "where did I leave off on
 * each channel?".
 *
 * Returns a record { channelId: lastMessageId } for fast lookup. Channels
 * the listener watches but has never seen are absent — the agent treats
 * "absent" as "fetch most recent N and seed the cursor".
 */
export const getListenerCursors = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('discordListenerCursors').collect();
    const byChannel: Record<string, { lastMessageId: string; updatedAt: number }> = {};
    for (const r of rows) {
      byChannel[r.channelId] = {
        lastMessageId: r.lastMessageId,
        updatedAt: r.updatedAt,
      };
    }
    return byChannel;
  },
});

/**
 * Upsert the high-water mark for a single channel. Called by the Tensorlake
 * agent at the end of each poll round, after every new message has been
 * relayed to the orchestrator. Idempotent — safe to retry on failure.
 */
export const setListenerCursor = mutation({
  args: {
    channelId: v.string(),
    lastMessageId: v.string(),
    invocationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('discordListenerCursors')
      .withIndex('by_channel', (q) => q.eq('channelId', args.channelId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastMessageId: args.lastMessageId,
        updatedAt: now,
        invocationId: args.invocationId,
      });
      return existing._id;
    }
    return await ctx.db.insert('discordListenerCursors', {
      channelId: args.channelId,
      lastMessageId: args.lastMessageId,
      updatedAt: now,
      invocationId: args.invocationId,
    });
  },
});
