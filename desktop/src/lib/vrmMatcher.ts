/**
 * vrmMatcher.ts — pick the avatar body the user matched into.
 *
 * The swipe deck draws from 426 library cards (vroid hub portraits) for the
 * personality/centroid math. The room ships 5 abison-curated VRM bodies
 * + the original placeholder (manifest.json):
 *   - cottagecore.vrm     (A1, soft warm)
 *   - tech-minimal.vrm    (A2, precise + sleek)
 *   - cyber.vrm           (A3, electric edge)
 *   - academia.vrm        (A4, measured + sophisticated)
 *   - alt-abison-5.vrm    (alt, casual hangout)
 *
 * After the swipe centroid lands, we pick the VRM whose authored "trait
 * fingerprint" is closest to the user's numeric centroid. The MATCH (id,
 * name, blurb, previewUrl, fingerprint) drives the reveal cascade.
 *
 * Bind-pose drift fix: All five abison VRMs ship with non-T-pose bind
 * poses out of VRoid Studio (arms angled, shoulders rotated). The Mixamo
 * retargeter assumed clean T-pose at rest, so bones the active idle didn't
 * drive (shoulders especially) read as "arms in the air". This is now
 * neutralized in `vrm-load.ts#normalizeHumanoidToTPose` — every VRM is
 * forced to identity-local on its normalized humanoid skeleton at load
 * time, giving Mixamo a clean T-pose to animate from. So the per-VRM
 * `vrmUrl` below points to the actual matched character, and the body
 * picker (Scene.tsx#VrmBodyPicker) can swap between all five live.
 *
 * Personality (voice, dialogue, vibe phrase, palette) still comes from the
 * heroCard the user actually swiped on — those two sources are deliberately
 * separable so a 6th VRM dropping in later doesn't require any swipe-side
 * changes.
 */

import type { NumericTraits } from '@angel/shared';

export interface VrmMatch {
  id: string;
  slot: 'A1' | 'A2' | 'A3' | 'A4' | 'alt';
  vrmUrl: string;
  previewUrl: string;
  /** the avatar's in-world name (from manifest.vrm_meta_title or its romaji). */
  name: string;
  /** one-line body descriptor — surfaced in the reveal cascade. */
  blurb: string;
  /** authored 0–10 trait fingerprint per the manifest's slot_rationale. */
  fingerprint: NumericTraits;
}

const VRMS: VrmMatch[] = [
  {
    id: 'cottagecore',
    slot: 'A1',
    vrmUrl: '/vrm/cottagecore.vrm',
    previewUrl: '/vrm/cottagecore.png',
    name: 'cecil',
    blurb: 'soft warmth + quiet attention.',
    // warm pastel palette, summery flowy silhouette → high warmth, low edge,
    // mid playfulness, low sophistication
    fingerprint: { warmth: 9, energy: 4, edge: 2, sophistication: 5, playfulness: 6 },
  },
  {
    id: 'tech-minimal',
    slot: 'A2',
    vrmUrl: '/vrm/tech-minimal.vrm',
    previewUrl: '/vrm/tech-minimal.png',
    name: 'ayu',
    blurb: 'precision + late-night softness.',
    // sleek monochrome (white/black/silver), single accent → mid warmth,
    // high sophistication, mid edge
    fingerprint: { warmth: 4, energy: 5, edge: 5, sophistication: 8, playfulness: 4 },
  },
  {
    id: 'cyber',
    slot: 'A3',
    vrmUrl: '/vrm/cyber.vrm',
    previewUrl: '/vrm/cyber.png',
    name: 'sample',
    blurb: 'electric edge + watchful calm.',
    // racing-checkered y2k vibe → low warmth, high energy, max edge,
    // high playfulness
    fingerprint: { warmth: 4, energy: 8, edge: 9, sophistication: 5, playfulness: 8 },
  },
  {
    id: 'academia',
    slot: 'A4',
    vrmUrl: '/vrm/academia.vrm',
    previewUrl: '/vrm/academia.png',
    name: 'izumi',
    blurb: 'measured restraint + quiet care.',
    // library-girl uniform, jumper dress, side braid → mid warmth, low
    // energy + edge, max sophistication
    fingerprint: { warmth: 5, energy: 3, edge: 3, sophistication: 9, playfulness: 4 },
  },
  {
    id: 'alt-abison-5',
    slot: 'alt',
    vrmUrl: '/vrm/alt-abison-5.vrm',
    previewUrl: '/vrm/alt-abison-5.png',
    name: 'ikuno',
    blurb: 'casual cozy + just hanging out.',
    // brown bob, HEAVY DUTY hoodie, deep-blue eyes → balanced warm, mid
    // energy, low edge, low sophistication, high playfulness
    fingerprint: { warmth: 6, energy: 6, edge: 4, sophistication: 4, playfulness: 7 },
  },
];

/** Set of VRM URLs that the body picker accepts. Used by personaPersist
 *  to recognize valid persisted choices vs stale ones. */
export const VALID_VRM_URLS = new Set<string>(VRMS.map((v) => v.vrmUrl));

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
 * Pick the VRM whose fingerprint is nearest the user's centroid. Pure
 * Euclidean distance over the 5d trait vector. Always returns something
 * since `VRMS` is non-empty.
 */
export function chooseVrm(traits: NumericTraits): VrmMatch {
  let best = VRMS[0]!;
  let bestD = Infinity;
  for (const v of VRMS) {
    const d = distance(traits, v.fingerprint);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/** Expose the catalog for debugging / "what other VRMs exist" UIs. */
export function listVrms(): readonly VrmMatch[] {
  return VRMS;
}
