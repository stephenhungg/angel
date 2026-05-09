/**
 * library.ts — load + filter the vision-tagged library, compose swipe rounds.
 *
 * source of truth: web/data/library.json (426 entries, vision-tagged)
 * filtering: vroid hub origins only (numeric IDs) + art_quality >= 6 + aesthetic !== 'other'
 * runtime: ~280 demo-eligible anime girls.
 */

import libraryRaw from '@/data/library.json';
import type { LibraryEntry, NumericTraits, AestheticArchetype } from '@angel/shared';

const ALL: LibraryEntry[] = libraryRaw as unknown as LibraryEntry[];

/**
 * Vroid hub IDs are 19-digit numeric strings. Oss-avatars use uuids.
 * We only want anime girls — vroid hub only.
 */
function isVroidHubId(id: string): boolean {
  return /^\d{15,20}$/.test(id);
}

/**
 * The demo-eligible deck: vroid hub anime girls with q>=6, no 'other' aesthetic.
 */
export const DEMO_LIBRARY: LibraryEntry[] = ALL.filter(
  (e) =>
    e.tags &&
    isVroidHubId(e.id) &&
    e.tags.art_quality >= 6 &&
    e.tags.aesthetic !== 'other',
);

/**
 * Map an aesthetic enum to the A1-A4 archetype slot matthew's contract uses.
 */
const AESTHETIC_TO_ARCHETYPE: Record<LibraryEntry['tags']['aesthetic'], AestheticArchetype> = {
  cottagecore: 'A1',
  kawaii: 'A1',
  fantasy: 'A1',
  tech_minimal: 'A2',
  sporty: 'A2',
  casual: 'A2',
  y2k: 'A3',
  goth: 'A3',
  dark_academia: 'A4',
  other: 'A1', // fallback
};

export function archetypeOf(entry: LibraryEntry): AestheticArchetype {
  return AESTHETIC_TO_ARCHETYPE[entry.tags.aesthetic] ?? 'A1';
}

/**
 * Compute a 5d numeric trait vector from a single library entry.
 */
export function vectorOf(entry: LibraryEntry): NumericTraits {
  return {
    warmth: entry.tags.warmth,
    energy: entry.tags.energy,
    edge: entry.tags.edge,
    sophistication: entry.tags.sophistication,
    playfulness: entry.tags.playfulness,
  };
}

/**
 * Cosine-ish similarity between two 5d vectors. Higher = closer.
 */
function distance(a: NumericTraits, b: NumericTraits): number {
  const d2 =
    (a.warmth - b.warmth) ** 2 +
    (a.energy - b.energy) ** 2 +
    (a.edge - b.edge) ** 2 +
    (a.sophistication - b.sophistication) ** 2 +
    (a.playfulness - b.playfulness) ** 2;
  return Math.sqrt(d2);
}

/**
 * Pick 4 cards for a round. Strategy:
 *   round 1: max-variance — one card per archetype slot (A1, A2, A3, A4),
 *            FRESH RANDOM each session so the deck never repeats
 *   round 2: narrow — 4 cards near the centroid, top-8 pool (was 16)
 *   round 3: lock  — 4 cards even tighter, top-6 pool, weighted toward nearest
 *
 * randomized per call (Math.random) — no seed determinism. reloading the
 * page during the flow gives a fresh deck.
 */
export function composeRound(
  round: 1 | 2 | 3,
  _seed: string, // kept for signature compat — no longer used
  centroid: NumericTraits | null,
  alreadySeen: Set<string>,
): LibraryEntry[] {
  const pool = DEMO_LIBRARY.filter((e) => !alreadySeen.has(e.id));

  if (round === 1 || !centroid) {
    // one card per archetype, max-variance, randomized each call
    const byArch: Record<AestheticArchetype, LibraryEntry[]> = { A1: [], A2: [], A3: [], A4: [] };
    for (const e of pool) byArch[archetypeOf(e)].push(e);
    const picks: LibraryEntry[] = [];
    for (const slot of ['A1', 'A2', 'A3', 'A4'] as const) {
      const bucket = byArch[slot];
      if (!bucket.length) continue;
      // bias toward higher art_quality, then random pick from top quartile
      bucket.sort((a, b) => b.tags.art_quality - a.tags.art_quality);
      const topN = Math.max(1, Math.floor(bucket.length * 0.5));
      const top = bucket.slice(0, topN);
      const idx = Math.floor(Math.random() * top.length);
      picks.push(top[idx]!);
    }
    return picks;
  }

  // rounds 2 + 3: cards near current centroid. tighter pool than before.
  // round 2 → top 8, round 3 → top 6 (locked-in feel).
  const poolSize = round === 2 ? 8 : 6;
  const ranked = pool
    .map((e) => ({ e, d: distance(centroid, vectorOf(e)) }))
    .sort((a, b) => a.d - b.d);
  const top = ranked.slice(0, poolSize).map((r) => r.e);
  const out: LibraryEntry[] = [];
  while (out.length < 4 && top.length) {
    // weighted random toward nearer cards: square-bias selection
    const r = Math.random() ** 1.6; // skews toward 0 → earlier (closer) indices
    const i = Math.min(top.length - 1, Math.floor(r * top.length));
    out.push(top.splice(i, 1)[0]!);
  }
  return out;
}

/**
 * Refresh the un-swiped tail of the current round's deck after a yes-swipe.
 * Called mid-round so the next cards under the user's finger get more similar
 * to what they just liked.
 *
 *   currentCards: the round's deck as it exists right now
 *   cursor: which index the user is currently looking at (already swiped 0..cursor-1)
 *   centroid: the running centroid (recomputed from yesPicks-so-far)
 *   alreadySeen: every card id ever shown across rounds
 *
 * keeps the cards already passed (cards[0..cursor-1]) and the immediate top
 * card (cards[cursor]) intact, replaces cards[cursor+1..] with closer picks.
 */
export function refreshDeckTail(
  currentCards: LibraryEntry[],
  cursor: number,
  centroid: NumericTraits | null,
  alreadySeen: Set<string>,
): LibraryEntry[] {
  if (!centroid || cursor >= currentCards.length - 1) return currentCards;

  // keep card at cursor (current top) — swap only what comes after
  const keepHead = currentCards.slice(0, cursor + 1);
  const slotsToFill = currentCards.length - keepHead.length;

  // build seen set from all already-seen + cards we're keeping
  const seen = new Set(alreadySeen);
  for (const c of keepHead) seen.add(c.id);

  const pool = DEMO_LIBRARY.filter((e) => !seen.has(e.id));
  const ranked = pool
    .map((e) => ({ e, d: distance(centroid, vectorOf(e)) }))
    .sort((a, b) => a.d - b.d);
  const top = ranked.slice(0, Math.max(slotsToFill * 3, 6)).map((r) => r.e);

  const tail: LibraryEntry[] = [];
  while (tail.length < slotsToFill && top.length) {
    const r = Math.random() ** 1.6;
    const i = Math.min(top.length - 1, Math.floor(r * top.length));
    tail.push(top.splice(i, 1)[0]!);
  }

  return [...keepHead, ...tail];
}

/**
 * Compute the user's centroid from yes-swipes only.
 */
export function centroidOf(yesPicks: LibraryEntry[]): NumericTraits {
  if (yesPicks.length === 0) {
    return { warmth: 5, energy: 5, edge: 5, sophistication: 5, playfulness: 5 };
  }
  const sum = yesPicks.reduce<NumericTraits>(
    (acc, e) => ({
      warmth: acc.warmth + e.tags.warmth,
      energy: acc.energy + e.tags.energy,
      edge: acc.edge + e.tags.edge,
      sophistication: acc.sophistication + e.tags.sophistication,
      playfulness: acc.playfulness + e.tags.playfulness,
    }),
    { warmth: 0, energy: 0, edge: 0, sophistication: 0, playfulness: 0 },
  );
  const n = yesPicks.length;
  return {
    warmth: sum.warmth / n,
    energy: sum.energy / n,
    edge: sum.edge / n,
    sophistication: sum.sophistication / n,
    playfulness: sum.playfulness / n,
  };
}

/**
 * Find the nearest A1-A4 archetype to a centroid, by averaging the centroids
 * of all library entries in each archetype.
 */
const ARCHETYPE_CENTROIDS: Record<AestheticArchetype, NumericTraits> = (() => {
  const groups: Record<AestheticArchetype, LibraryEntry[]> = { A1: [], A2: [], A3: [], A4: [] };
  for (const e of DEMO_LIBRARY) groups[archetypeOf(e)].push(e);
  const out: Record<AestheticArchetype, NumericTraits> = {} as never;
  for (const slot of ['A1', 'A2', 'A3', 'A4'] as const) {
    out[slot] = centroidOf(groups[slot]);
  }
  return out;
})();

export function nearestArchetype(centroid: NumericTraits): AestheticArchetype {
  let best: AestheticArchetype = 'A1';
  let bestD = Infinity;
  for (const slot of ['A1', 'A2', 'A3', 'A4'] as const) {
    const d = distance(centroid, ARCHETYPE_CENTROIDS[slot]);
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* tiny seeded prng — deterministic round composition per session id   */
/* ------------------------------------------------------------------ */

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
