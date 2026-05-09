/**
 * observability.ts — append-only logs for the /admin dashboard.
 *
 * web/lib/observability.ts calls these via name (`observability:appendSwipeEvent`
 * etc.). all four mutations are fire-and-forget — never throw upstream.
 *
 * userId is v.string() (not v.id) because anon demo-day visitors don't have a
 * users record until they finish onboarding.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ──────────────────────────────────────────────────────────────────────────
// mutations
// ──────────────────────────────────────────────────────────────────────────

export const appendSwipeEvent = mutation({
  args: {
    userId: v.string(),
    round: v.number(),
    cardId: v.string(),
    decision: v.union(v.literal('yes'), v.literal('no')),
    currentCentroid: v.array(v.number()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('swipeEvents', {
      userId: args.userId,
      round: args.round,
      cardId: args.cardId,
      decision: args.decision,
      currentCentroid: args.currentCentroid,
      timestamp: args.timestamp ?? Date.now(),
    });
  },
});

export const appendTraitVectorTrace = mutation({
  args: {
    userId: v.string(),
    round: v.number(),
    centroid: v.array(v.number()),
    distancesToMacros: v.object({
      cute: v.number(),
      pretty: v.number(),
      hot: v.number(),
    }),
    signalStrength: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('traitVectorTrace', { ...args });
  },
});

export const appendSynthesis = mutation({
  args: {
    userId: v.string(),
    inputSignals: v.any(),
    metaPromptVersion: v.string(),
    metaPromptText: v.optional(v.string()),
    outputMarkdown: v.string(),
    model: v.string(),
    temperature: v.optional(v.number()),
    latencyMs: v.number(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('personalitySynthesisLog', {
      userId: args.userId,
      inputSignals: args.inputSignals,
      metaPromptVersion: args.metaPromptVersion,
      metaPromptText: args.metaPromptText,
      outputMarkdown: args.outputMarkdown,
      model: args.model,
      temperature: args.temperature,
      latencyMs: args.latencyMs,
      timestamp: args.timestamp ?? Date.now(),
    });
  },
});

export const appendOrchestratorTurn = mutation({
  args: {
    userId: v.string(),
    turnId: v.string(),
    systemPromptHash: v.string(),
    systemPromptFull: v.optional(v.string()),
    userInput: v.string(),
    output: v.string(),
    toolsCalled: v.array(v.any()),
    latencyMs: v.number(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('orchestratorTurns', {
      userId: args.userId,
      turnId: args.turnId,
      systemPromptHash: args.systemPromptHash,
      systemPromptFull: args.systemPromptFull ?? '',
      userInput: args.userInput,
      output: args.output,
      toolsCalled: args.toolsCalled,
      latencyMs: args.latencyMs,
      timestamp: args.timestamp ?? Date.now(),
    });
  },
});

// ──────────────────────────────────────────────────────────────────────────
// queries — /admin reads from here
// ──────────────────────────────────────────────────────────────────────────

export const recentSwipes = query({
  args: { since: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 500;
    if (args.since !== undefined) {
      return await ctx.db
        .query('swipeEvents')
        .withIndex('by_time', (q) => q.gt('timestamp', args.since!))
        .order('desc')
        .take(n);
    }
    return await ctx.db.query('swipeEvents').order('desc').take(n);
  },
});

export const recentTraces = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 200;
    return await ctx.db.query('traitVectorTrace').order('desc').take(n);
  },
});

export const recentSynthesis = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;
    return await ctx.db
      .query('personalitySynthesisLog')
      .withIndex('by_time')
      .order('desc')
      .take(n);
  },
});

export const recentOrchestratorTurns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;
    return await ctx.db.query('orchestratorTurns').order('desc').take(n);
  },
});
