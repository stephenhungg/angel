/**
 * library.ts — load + filter the vision-tagged library, compose swipe rounds.
 *
 * Ported from web/lib/library.ts so the electron app drives the swipe flow
 * locally. Source data is the same library.json (426 entries, vision-tagged
 * vroid-hub anime girls). We bundle it into the renderer at build time.
 *
 * Filtering: vroid hub origins (numeric IDs) + art_quality >= 6 +
 *            aesthetic !== 'other' → ~280 demo-eligible candidates.
 */

import libraryRaw from '@/data/library.json';
import type { LibraryEntry, NumericTraits, AestheticArchetype } from '@angel/shared';

const ALL: LibraryEntry[] = libraryRaw as unknown as LibraryEntry[];

/** Vroid hub IDs are 19-digit numeric strings. Oss-avatars use uuids. */
function isVroidHubId(id: string): boolean {
  return /^\d{15,20}$/.test(id);
}

/** Demo-eligible deck: vroid hub anime girls with q>=6, no 'other' aesthetic. */
export const DEMO_LIBRARY: LibraryEntry[] = ALL.filter(
  (e) =>
    e.tags &&
    isVroidHubId(e.id) &&
    e.tags.art_quality >= 6 &&
    e.tags.aesthetic !== 'other',
);

/** Map an aesthetic enum to the A1-A4 archetype slot the contract uses. */
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

/** 5d numeric trait vector from a single library entry. */
export function vectorOf(entry: LibraryEntry): NumericTraits {
  return {
    warmth: entry.tags.warmth,
    energy: entry.tags.energy,
    edge: entry.tags.edge,
    sophistication: entry.tags.sophistication,
    playfulness: entry.tags.playfulness,
  };
}

/** Euclidean distance between two 5d trait vectors. */
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
 * Pick 4 cards for a round.
 *   round 1: max-variance — one card per A1/A2/A3/A4 slot
 *   round 2-3: 4 cards near the current centroid, deterministic shuffle
 *
 * Deterministic per (round, sessionId) so reloads see the same deck.
 */
export function composeRound(
  round: 1 | 2 | 3,
  seed: string,
  centroid: NumericTraits | null,
  alreadySeen: Set<string>,
): LibraryEntry[] {
  const pool = DEMO_LIBRARY.filter((e) => !alreadySeen.has(e.id));
  const rng = mulberry32(hashSeed(seed) + round);

  if (round === 1 || !centroid) {
    const byArch: Record<AestheticArchetype, LibraryEntry[]> = { A1: [], A2: [], A3: [], A4: [] };
    for (const e of pool) byArch[archetypeOf(e)].push(e);
    const picks: LibraryEntry[] = [];
    for (const slot of ['A1', 'A2', 'A3', 'A4'] as const) {
      const bucket = byArch[slot];
      if (!bucket.length) continue;
      bucket.sort((a, b) => b.tags.art_quality - a.tags.art_quality);
      const top = bucket.slice(0, 8);
      const idx = Math.floor(rng() * top.length);
      picks.push(top[idx]!);
    }
    return picks;
  }

  // round 2 + 3: cards near current centroid, prefer variety
  const ranked = pool
    .map((e) => ({ e, d: distance(centroid, vectorOf(e)) }))
    .sort((a, b) => a.d - b.d);
  const top = ranked.slice(0, 16).map((r) => r.e);
  const out: LibraryEntry[] = [];
  while (out.length < 4 && top.length) {
    const i = Math.floor(rng() * top.length);
    out.push(top.splice(i, 1)[0]!);
  }
  return out;
}

/** Centroid of yes-swipes only. Defaults to neutral 5/5/5/5/5 if empty. */
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
