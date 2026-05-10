/**
 * skills/mirror.ts — convex mirror of angel's recursive self-improvement
 * filesystem at ~/.angel/skills/{proposed,active,archived}/<slug>.md.
 *
 * the desktop is still source of truth — proposeSkill() in
 * desktop/electron/agent/skills/index.ts writes the markdown file. this
 * module is just a read-replica so the web /admin/skills surface can pick
 * up new proposals + status changes reactively (mid-demo: angel calls
 * propose_skill → judges see a card pulse onto /admin/skills in <1s).
 *
 * upsert is keyed by (userId, slug). status transitions (proposed → active
 * → archived) update in place + bump `bumpedAt` so the UI can sort "just
 * appeared" to the top and animate a sakura ring on the card border.
 */

import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';

/**
 * upsert a skill row by (userId, slug). called from electron whenever
 * proposeSkill / approveSkill / archiveSkill runs locally so the admin
 * surface stays in sync with disk.
 */
export const recordSkill = mutation({
  args: {
    userId: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    status: v.string(), // 'proposed' | 'active' | 'archived'
    content: v.string(),
    origin: v.optional(v.string()),
    proposedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('skills')
      .withIndex('by_userId_slug', (q) =>
        q.eq('userId', args.userId).eq('slug', args.slug),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        status: args.status,
        content: args.content,
        origin: args.origin ?? existing.origin,
        // proposedAt is immutable once set — keep the original.
        proposedAt: existing.proposedAt || args.proposedAt,
        bumpedAt: now,
      });
      return { ok: true, id: existing._id, action: 'updated' as const };
    }

    const id = await ctx.db.insert('skills', {
      userId: args.userId,
      slug: args.slug,
      name: args.name,
      description: args.description,
      status: args.status,
      content: args.content,
      origin: args.origin,
      proposedAt: args.proposedAt,
      bumpedAt: now,
    });
    return { ok: true, id, action: 'inserted' as const };
  },
});

/**
 * recent skills across all users, ordered by bumpedAt desc. drives
 * /admin/skills — small enough to fetch on every reactive update.
 */
export const recentSkills = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 30;
    return await ctx.db
      .query('skills')
      .withIndex('by_bumpedAt')
      .order('desc')
      .take(n);
  },
});

/**
 * skills filtered to one (userId, status) bucket. used by the desktop
 * smoke-tests + future per-user admin views.
 */
export const skillsByStatus = query({
  args: { userId: v.string(), status: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('skills')
      .withIndex('by_userId_status', (q) =>
        q.eq('userId', args.userId).eq('status', args.status),
      )
      .collect();
  },
});
