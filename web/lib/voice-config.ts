/**
 * voice-config.ts — deterministic mapping from numeric trait vector → animalese params.
 * Same vector = same voice every time.
 *
 * Used:
 *  - swipe card hover: 0.5s preview using the candidate's tags → VoiceConfig
 *  - reveal screen: her first line + naming-beat response uses the user's chosen attractor's config
 *  - electron orchestrator: every utterance uses the same config (claim payload includes it)
 */

import type { LibraryEntry, NumericTraits, VoiceCluster, VoiceConfig, VowelBias } from '@angel/shared';

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(t: number, a: number, b: number): number {
  return a + (b - a) * t;
}

/**
 * Pick a voice cluster from the numeric vector. Hand-tuned mapping that
 * favors the suggested cluster when available, falls back to vector-based.
 */
function clusterFromTraits(t: NumericTraits, suggested?: VoiceCluster): VoiceCluster {
  if (suggested) return suggested;
  // V1: bright soft (high warmth, low edge)
  // V2: neutral clear (mid everything)
  // V3: high playful (high playfulness + high energy)
  // V4: low grounded (high sophistication, low energy)
  // V5: warm melodic (high warmth + high energy)
  // V6: crisp balanced (high edge + mid energy)
  if (t.warmth >= 7 && t.edge <= 4) return t.energy >= 6 ? 5 : 1;
  if (t.playfulness >= 7 && t.energy >= 6) return 3;
  if (t.sophistication >= 7 && t.energy <= 4) return 4;
  if (t.edge >= 7) return 6;
  return 2;
}

function vowelFromTraits(t: NumericTraits): VowelBias {
  // very rough flavor mapping: trait extremes pick a vowel
  if (t.playfulness >= 7) return 'i';
  if (t.warmth >= 7) return 'a';
  if (t.sophistication >= 7) return 'e';
  if (t.edge >= 7) return 'u';
  return 'mixed';
}

/**
 * Convert a 5d numeric trait vector (0-10 scale) to a VoiceConfig.
 */
export function voiceConfigFromTraits(
  t: NumericTraits,
  suggestedCluster?: VoiceCluster,
): VoiceConfig {
  const n = (x: number) => clamp(x / 10, 0, 1); // normalize to 0-1
  const w = n(t.warmth);
  const e = n(t.energy);
  const ed = n(t.edge);
  const s = n(t.sophistication);
  const p = n(t.playfulness);

  return {
    base_cluster: clusterFromTraits(t, suggestedCluster),
    pitch_variance: lerp(w * 0.7 + p * 0.3, 0.05, 0.28),
    speed: lerp(e, 0.78, 1.22),
    syllable_count: Math.round(lerp(p * 0.6 + e * 0.4, 4, 11)),
    pause_density: lerp(1 - e, 0.05, 0.85),
    attack: lerp(ed, 0.2, 0.95),
    decay: lerp(1 - ed, 0.2, 0.85),
    glissando: lerp(w * 0.5 + p * 0.5, 0.1, 0.85),
    vowel_bias: vowelFromTraits(t),
    breathiness: lerp(w * 0.7 + (1 - ed) * 0.3, 0.05, 0.7),
  };
}

export function voiceConfigFromEntry(entry: LibraryEntry): VoiceConfig {
  return voiceConfigFromTraits(
    {
      warmth: entry.tags.warmth,
      energy: entry.tags.energy,
      edge: entry.tags.edge,
      sophistication: entry.tags.sophistication,
      playfulness: entry.tags.playfulness,
    },
    entry.tags.suggested_voice_cluster,
  );
}
