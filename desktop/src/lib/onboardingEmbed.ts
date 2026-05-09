/**
 * onboardingEmbed.ts — pure-client port of web/app/api/embed/route.ts.
 *
 * Web hits a server route that does centroid math + categorical derivation +
 * hero-card pick. None of that work needs the network — it's all in-memory
 * over the bundled library. We just inline it in the renderer so the swipe
 * flow finishes without a roundtrip.
 *
 * Returns the same shape as /api/embed so a future Reveal component can swap
 * back to the server if we ever need to.
 */

import {
  PALETTE_BY_AESTHETIC,
  VRM_BY_AESTHETIC,
  type AestheticArchetype,
  type LibraryEntry,
  type NumericTraits,
  type PersonaTraits,
  type VoiceConfig,
} from '@angel/shared';
import { centroidOf, nearestArchetype } from './library';
import {
  dispositionFromTraits,
  styleFromTraits,
  voiceConfigFromTraits,
} from './voiceConfig';

function voiceClusterFromTraits(t: NumericTraits): 1 | 2 | 3 | 4 | 5 | 6 {
  if (t.warmth >= 7 && t.edge <= 4) return t.energy >= 6 ? 5 : 1;
  if (t.playfulness >= 7 && t.energy >= 6) return 3;
  if (t.sophistication >= 7 && t.energy <= 4) return 4;
  if (t.edge >= 7) return 6;
  return 2;
}

export interface HeroCard {
  id: string;
  name: string;
  thumbnailUrl: string;
  vibePhrase: string;
  personalityBlurb: string;
  energyDescriptor: string;
  dialogueSamples: string[];
  voiceConfig: VoiceConfig;
  palette: [string, string, string];
  aesthetic: string;
  hairColor: string;
}

export interface EmbedResult {
  numericTraits: NumericTraits;
  voiceConfig: VoiceConfig;
  traits: PersonaTraits;
  archetype: AestheticArchetype;
  vrmUrl: string;
  paletteHex: string;
  dialogueSamples: string[];
  heroCard: HeroCard;
  yesIds: string[];
}

/**
 * Build the embed result from yes-picks. Throws if yesPicks is empty (the
 * Reveal page should redirect to /swipe before reaching here).
 */
export function computeEmbed(yesPicks: LibraryEntry[]): EmbedResult {
  if (yesPicks.length === 0) {
    throw new Error('computeEmbed: no yes-swipes');
  }

  const numericTraits = centroidOf(yesPicks);
  const archetype = nearestArchetype(numericTraits);
  const voiceCluster = voiceClusterFromTraits(numericTraits);
  const voiceConfig = voiceConfigFromTraits(numericTraits, voiceCluster);

  const traits: PersonaTraits = {
    aesthetic: archetype,
    disposition: dispositionFromTraits(numericTraits),
    style: styleFromTraits(numericTraits),
    voice_cluster: voiceCluster,
  };

  // hero card = highest-art-quality yes-swipe. her vibe phrase + dialogue +
  // face become her actual identity — not 1-of-4 hardcoded labels.
  const heroEntry = [...yesPicks].sort(
    (a, b) => b.tags.art_quality - a.tags.art_quality,
  )[0]!;

  const heroVoiceConfig = voiceConfigFromTraits(
    {
      warmth: heroEntry.tags.warmth,
      energy: heroEntry.tags.energy,
      edge: heroEntry.tags.edge,
      sophistication: heroEntry.tags.sophistication,
      playfulness: heroEntry.tags.playfulness,
    },
    heroEntry.tags.suggested_voice_cluster,
  );

  const heroCard: HeroCard = {
    id: heroEntry.id,
    name: heroEntry.name,
    thumbnailUrl: `/library/${heroEntry.id}.jpg`,
    vibePhrase: heroEntry.tags.vibe_phrase,
    personalityBlurb: heroEntry.tags.personality_blurb,
    energyDescriptor: heroEntry.tags.energy_descriptor,
    dialogueSamples: heroEntry.tags.dialogue_samples,
    voiceConfig: heroVoiceConfig,
    palette: heroEntry.tags.palette,
    aesthetic: heroEntry.tags.aesthetic,
    hairColor: heroEntry.tags.hair_color,
  };

  return {
    numericTraits,
    voiceConfig,
    traits,
    archetype,
    vrmUrl: VRM_BY_AESTHETIC[archetype],
    paletteHex: PALETTE_BY_AESTHETIC[archetype],
    dialogueSamples: heroEntry.tags.dialogue_samples,
    heroCard,
    yesIds: yesPicks.map((e) => e.id),
  };
}
