/**
 * memoryMirror.ts — convex read-replica of nia memory writes.
 *
 * nia is the primary memory store. when the nia agent's wrapper writes a
 * memory, it ALSO calls `mirror()` here so /admin and cross-device live
 * subscriptions can see the same data without going through nia (avoids the
 * network round-trip for read-heavy ui surfaces).
 *
 * userId is v.string() to match the rest of the always-on surface and to
 * support anonymous demo visitors who never finish onboarding.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const mirror = mutation({
  args: {
    userId: v.string(),
    type: v.string(), // 'episodic' | 'semantic' | 'preference' | 'observation'
    content: v.string(),
    timestamp: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('memoryMirror', {
      userId: args.userId,
      type: args.type,
      content: args.content,
      timestamp: args.timestamp ?? Date.now(),
      metadata: args.metadata,
    });
  },
});

export const recent = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;
    return await ctx.db
      .query('memoryMirror')
      .withIndex('by_userId_time', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(n);
  },
});

export const allRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;
    return await ctx.db.query('memoryMirror').order('desc').take(n);
  },
});

/**
 * bg observations (tensorlake / scheduled). exposed here because /admin
 * treats them as an extension of the memory feed. tensorlake agent calls
 * `recordBgObservation` directly.
 */
export const recordBgObservation = mutation({
  args: {
    userId: v.string(),
    kind: v.string(), // 'tensorlake' | 'scheduled' | 'compaction'
    summary: v.string(),
    sourceUrl: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('bgObservations', {
      userId: args.userId,
      kind: args.kind,
      summary: args.summary,
      sourceUrl: args.sourceUrl,
      payload: args.payload,
      timestamp: Date.now(),
    });
  },
});

export const recentBgObservations = query({
  args: { userId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 30;
    if (args.userId) {
      return await ctx.db
        .query('bgObservations')
        .withIndex('by_userId_time', (q) => q.eq('userId', args.userId!))
        .order('desc')
        .take(n);
    }
    return await ctx.db.query('bgObservations').order('desc').take(n);
  },
});
