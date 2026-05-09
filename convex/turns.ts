/**
 * turns.ts — dialogue history mirror. nia is source of truth for memory; this
 * is the lightweight realtime feed for /admin and cross-device scrollback.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

async function findUserId(ctx: any, externalUserId: string): Promise<Id<'users'> | null> {
  const u = await ctx.db
    .query('users')
    .withIndex('by_authId', (q: any) => q.eq('authId', externalUserId))
    .unique();
  return u?._id ?? null;
}

export const appendTurn = mutation({
  args: {
    userId: v.string(),
    turnId: v.optional(v.string()),
    role: v.string(),
    content: v.string(),
    emotion: v.optional(v.string()),
    toolCalls: v.optional(
      v.array(
        v.object({
          tool: v.string(),
          args: v.any(),
          result: v.optional(v.any()),
        }),
      ),
    ),
    latencyMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await findUserId(ctx, args.userId);
    if (!userId) return null;
    return await ctx.db.insert('turns', {
      userId,
      role: args.role,
      text: args.content,
      emotion: args.emotion,
      toolCalls: args.toolCalls,
      timestamp: Date.now(),
    });
  },
});

export const recentTurns = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await findUserId(ctx, args.userId);
    if (!userId) return [];
    const n = args.limit ?? 50;
    return await ctx.db
      .query('turns')
      .withIndex('by_userId_time', (q) => q.eq('userId', userId))
      .order('desc')
      .take(n);
  },
});

export const allRecentTurns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 100;
    return await ctx.db.query('turns').order('desc').take(n);
  },
});
