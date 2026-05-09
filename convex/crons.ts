/**
 * crons.ts — the always-on track receipts.
 *
 * three jobs run regardless of whether electron or web is open. they prove
 * to the judges that the convex spine keeps the angel "alive" while the
 * laptop is closed.
 *
 *   heartbeat              every 5 min   — uptime proof
 *   scheduledObservation   every 30 min  — "while you were away" feel
 *   reflectiveCompaction   every 24 hr   — synthesizes recent turns
 *
 * the cron handlers are `internalMutation` — invoked only by the cron
 * scheduler (and hand-fired from /admin if needed via `internal.crons.*`).
 */

import { cronJobs } from 'convex/server';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

// ──────────────────────────────────────────────────────────────────────────
// 1. heartbeat — proves convex is alive even with everything closed.
// ──────────────────────────────────────────────────────────────────────────

export const heartbeat = internalMutation({
  args: {},
  handler: async (ctx) => {
    const last = await ctx.db.query('heartbeats').order('desc').first();
    const counter = (last?.counter ?? 0) + 1;
    await ctx.db.insert('heartbeats', {
      source: 'cron',
      counter,
      timestamp: Date.now(),
      note: `cron heartbeat #${counter}`,
    });
  },
});

// ──────────────────────────────────────────────────────────────────────────
// 2. scheduledObservation — seeds the "while you were away" feel.
//    walks the user list, picks one, writes a small bg observation.
// ──────────────────────────────────────────────────────────────────────────

export const scheduledObservation = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').order('desc').take(10);
    if (users.length === 0) {
      // no users yet — still record an observation against a sentinel id so
      // /admin shows the cron is firing.
      await ctx.db.insert('bgObservations', {
        userId: 'demo-sentinel',
        kind: 'scheduled',
        summary: 'no users onboarded yet — angel is patient.',
        timestamp: Date.now(),
      });
      return;
    }
    // round-robin: use the heartbeat counter to pick a user
    const last = await ctx.db.query('heartbeats').order('desc').first();
    const idx = (last?.counter ?? 0) % users.length;
    const target = users[idx]!;
    const minsSinceSeen = Math.round(
      (Date.now() - target.lastSeenAt) / 60000,
    );
    const extras = await ctx.db
      .query('onboardingExtras')
      .withIndex('by_authId', (q) => q.eq('authId', target.authId))
      .unique();
    const display = extras?.name ?? target.authId;
    const summary =
      minsSinceSeen > 60
        ? `checked in on ${display} — last activity ${Math.round(minsSinceSeen / 60)}h ago`
        : `checked in on ${display} — last activity ${minsSinceSeen}m ago`;
    await ctx.db.insert('bgObservations', {
      userId: target.authId,
      kind: 'scheduled',
      summary,
      timestamp: Date.now(),
    });
    // also mirror into the memory feed so /admin's memory stream shows life.
    await ctx.db.insert('memoryMirror', {
      userId: target.authId,
      type: 'observation',
      content: summary,
      timestamp: Date.now(),
      metadata: { source: 'scheduled-cron' },
    });
  },
});

// ──────────────────────────────────────────────────────────────────────────
// 3. reflectiveCompaction — pulls last 50 turns, writes synthesized summary.
//    idempotent: skips if a compaction was written in the last 12h.
// ──────────────────────────────────────────────────────────────────────────

export const reflectiveCompaction = internalMutation({
  args: {},
  handler: async (ctx) => {
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const lastCompaction = await ctx.db
      .query('bgObservations')
      .order('desc')
      .filter((q) => q.eq(q.field('kind'), 'compaction'))
      .first();
    if (
      lastCompaction &&
      Date.now() - lastCompaction.timestamp < TWELVE_HOURS
    ) {
      return; // dedupe
    }

    const turns = await ctx.db.query('turns').order('desc').take(50);
    if (turns.length === 0) {
      await ctx.db.insert('bgObservations', {
        userId: 'demo-sentinel',
        kind: 'compaction',
        summary:
          'reflective compaction — no turns yet. angel is rested and ready.',
        timestamp: Date.now(),
      });
      return;
    }
    // group by user
    const byUser = new Map<string, typeof turns>();
    for (const t of turns) {
      const u = await ctx.db.get(t.userId);
      const key = u?.authId ?? 'unknown';
      const arr = byUser.get(key) ?? [];
      arr.push(t);
      byUser.set(key, arr);
    }
    for (const [authId, userTurns] of byUser.entries()) {
      const summary = `this week with ${authId}: ${userTurns.length} turns. moods seen: ${
        Array.from(
          new Set(userTurns.map((t) => t.emotion).filter(Boolean)),
        ).join(', ') || 'unspecified'
      }.`;
      await ctx.db.insert('bgObservations', {
        userId: authId,
        kind: 'compaction',
        summary,
        timestamp: Date.now(),
        payload: { turnCount: userTurns.length },
      });
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────
// schedule
// ──────────────────────────────────────────────────────────────────────────

const crons = cronJobs();

crons.interval(
  'heartbeat',
  { minutes: 5 },
  internal.crons.heartbeat,
  {},
);

crons.interval(
  'scheduledObservation',
  { minutes: 30 },
  internal.crons.scheduledObservation,
  {},
);

crons.interval(
  'reflectiveCompaction',
  { hours: 24 },
  internal.crons.reflectiveCompaction,
  {},
);

export default crons;
