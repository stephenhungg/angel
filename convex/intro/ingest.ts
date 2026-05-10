/**
 * intro/ingest.ts — convex action invoked by electron when the user answers
 * an introduction question.
 *
 * The electron client also writes the answer directly to nia + memoryMirror.
 * This action is a thin secondary surface intended for:
 *   - SMS/Discord sessions that don't have direct nia access
 *   - cloud-side analytics (count answers by user, by question)
 *   - future post-processing (eg. summarize the introduction into a single
 *     "first impressions" page in the brain)
 *
 * Today it just mirrors the same write to convex.memoryMirror so that even
 * if electron's mirror call failed (offline, retry needed), we have a server
 * record of the introduction.
 */

'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';

export const ingestAnswer = action({
  args: {
    userId: v.string(),
    questionId: v.string(),
    question: v.string(),
    answer: v.string(),
    type: v.union(v.literal('fact'), v.literal('preference'), v.literal('scratchpad')),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const memoryType =
      args.type === 'fact'
        ? 'semantic'
        : args.type === 'preference'
          ? 'preference'
          : 'observation';
    const content = `[introduction · ${args.questionId}] Q: ${args.question} A: ${args.answer}`;

    try {
      // dynamic import keeps the action lean; the api ref isn't typed in this
      // file because of the bootstrap order during convex dev/codegen.
      const { api } = await import('../_generated/api');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.runMutation((api as any).memoryMirror.mirror, {
        userId: args.userId,
        type: memoryType,
        content,
        timestamp: Date.now(),
        metadata: {
          source: 'introduction',
          questionId: args.questionId,
          question: args.question,
          rawAnswer: args.answer,
        },
      });
    } catch (err) {
      console.warn('[intro/ingest] mirror failed (non-fatal):', err);
      return { ok: false };
    }

    return { ok: true };
  },
});
