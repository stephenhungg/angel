/**
 * tasks.ts — agent task queue.
 *
 * orchestrator (electron) creates tasks, claude/codex executors update status,
 * /admin subscribes to running tasks for the live monitor.
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

export const createTask = mutation({
  args: {
    userId: v.string(),
    intent: v.string(),
    type: v.string(),
    translatedPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await findUserId(ctx, args.userId);
    if (!userId) return null;
    return await ctx.db.insert('tasks', {
      userId,
      intent: args.intent,
      type: args.type,
      translatedPrompt: args.translatedPrompt,
      status: 'pending',
      startedAt: Date.now(),
    });
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.id('tasks'),
    status: v.string(),
    output: v.optional(
      v.object({
        summary: v.string(),
        evidence: v.array(v.string()),
        artifactUrl: v.optional(v.string()),
      }),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.output) patch.output = args.output;
    if (args.error) patch.error = args.error;
    if (args.status === 'success' || args.status === 'failed') {
      patch.completedAt = Date.now();
    }
    await ctx.db.patch(args.taskId, patch);
  },
});

export const attachTranslatedPrompt = mutation({
  args: { taskId: v.id('tasks'), translatedPrompt: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, { translatedPrompt: args.translatedPrompt });
  },
});

export const recentTasks = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await findUserId(ctx, args.userId);
    if (!userId) return [];
    const n = args.limit ?? 20;
    return await ctx.db
      .query('tasks')
      .withIndex('by_userId_status', (q) => q.eq('userId', userId))
      .order('desc')
      .take(n);
  },
});

export const allRecentTasks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 20;
    return await ctx.db.query('tasks').order('desc').take(n);
  },
});
