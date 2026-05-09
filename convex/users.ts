/**
 * users.ts — onboarding upsert + read.
 *
 * the `authId` field is the natural key (web's generated userId, e.g.
 * `visitor-...`). saveOnboarding upserts: creates a row if first time,
 * patches in place otherwise. extras (vrmId, paletteHex, voiceConfig,
 * personalityMd) live in `onboardingExtras` so the canonical users schema
 * is preserved. /admin and the desktop join on authId when they need both.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const saveOnboarding = mutation({
  args: {
    userId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    traits: v.object({
      aesthetic: v.string(),
      disposition: v.string(),
      style: v.string(),
      voice_cluster: v.number(),
    }),
    vector: v.array(v.float64()),
    archetypeHistory: v.optional(
      v.array(
        v.object({
          round: v.number(),
          archetypeId: v.string(),
          timestamp: v.number(),
        }),
      ),
    ),
    paletteHex: v.optional(v.string()),
    vrmId: v.optional(v.string()),
    numericTraits: v.optional(v.any()),
    voiceConfig: v.optional(v.any()),
    personalityMd: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. canonical users upsert (matches docs/CONVEX_SCHEMA.md exactly)
    const existing = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', args.userId))
      .unique();

    const userFields = {
      authId: args.userId,
      email: args.email ?? '',
      personaVector: args.vector,
      archetypeHistory: args.archetypeHistory ?? [],
      traits: args.traits,
      lastSeenAt: now,
    };

    let userDocId;
    if (existing) {
      await ctx.db.patch(existing._id, userFields);
      userDocId = existing._id;
    } else {
      userDocId = await ctx.db.insert('users', { ...userFields, createdAt: now });
    }

    // 2. extras upsert — keeps canonical schema clean
    const existingExtras = await ctx.db
      .query('onboardingExtras')
      .withIndex('by_authId', (q) => q.eq('authId', args.userId))
      .unique();
    const extrasFields = {
      authId: args.userId,
      name: args.name,
      vrmId: args.vrmId,
      paletteHex: args.paletteHex,
      numericTraits: args.numericTraits,
      voiceConfig: args.voiceConfig,
      personalityMd: args.personalityMd,
      updatedAt: now,
    };
    if (existingExtras) {
      await ctx.db.patch(existingExtras._id, extrasFields);
    } else {
      await ctx.db.insert('onboardingExtras', extrasFields);
    }

    return userDocId;
  },
});

export const getUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', args.userId))
      .unique();
    if (!user) return null;
    const extras = await ctx.db
      .query('onboardingExtras')
      .withIndex('by_authId', (q) => q.eq('authId', args.userId))
      .unique();
    return { ...user, extras };
  },
});

export const recentUsers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 30;
    return await ctx.db.query('users').order('desc').take(n);
  },
});
