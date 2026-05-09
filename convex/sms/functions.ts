/**
 * sms/functions.ts — convex mutations + queries for the SMS surface.
 *
 * Splits cleanly from orchestrator.ts because the orchestrator runs as a
 * convex action ("use node") and actions can't define mutations/queries
 * inside the same file.
 */

import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';

/* ------------------------------------------------------------------ */
/* sms turn log — transcript per user                                  */
/* ------------------------------------------------------------------ */

export const appendSmsTurn = mutation({
  args: {
    userId: v.string(),
    direction: v.union(v.literal('inbound'), v.literal('outbound')),
    body: v.string(),
    phoneNumber: v.string(),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('smsTurns', {
      userId: args.userId,
      direction: args.direction,
      body: args.body,
      phoneNumber: args.phoneNumber,
      timestamp: Date.now(),
      providerMessageId: args.providerMessageId,
    });
  },
});

export const recentSmsTurns = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const n = args.limit ?? 10;
    const rows = await ctx.db
      .query('smsTurns')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(n);
    return rows.map((r) => ({
      direction: r.direction,
      body: r.body,
      phoneNumber: r.phoneNumber,
      timestamp: r.timestamp,
      providerMessageId: r.providerMessageId,
    }));
  },
});

export const allRecentSmsTurns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;
    return await ctx.db.query('smsTurns').order('desc').take(n);
  },
});

/* ------------------------------------------------------------------ */
/* phone-number → user lookup                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve an incoming phone number to a user authId. We look in
 * onboardingExtras.phoneNumber first (where saveOnboarding writes it).
 *
 * Returns the authId if found, else null.
 */
export const findUserByPhone = query({
  args: { phoneNumber: v.string() },
  handler: async (ctx, args) => {
    const extras = await ctx.db
      .query('onboardingExtras')
      .withIndex('by_phoneNumber', (q) => q.eq('phoneNumber', args.phoneNumber))
      .unique();
    if (extras?.authId) return { authId: extras.authId };
    return null;
  },
});

/**
 * Set / update a user's phone number after onboarding. Idempotent —
 * upserts the onboardingExtras row.
 */
export const setPhoneNumber = mutation({
  args: {
    userId: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('onboardingExtras')
      .withIndex('by_authId', (q) => q.eq('authId', args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { phoneNumber: args.phoneNumber, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert('onboardingExtras', {
      authId: args.userId,
      phoneNumber: args.phoneNumber,
      updatedAt: now,
    });
  },
});
