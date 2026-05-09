/**
 * POST /api/embed
 * Input: { picks: Array<{ vroid_id, decision, round }> }
 * Output: { numericTraits, voiceConfig, traits, archetype, vrmUrl, paletteHex }
 *
 * Server-side compute. Reads library.json. No external API calls (no CLIP for v1).
 * The numeric centroid is the source of truth for the personality vector.
 */

import { NextResponse } from 'next/server';
import { centroidOf, nearestArchetype, DEMO_LIBRARY } from '@/lib/library';
import { voiceConfigFromTraits } from '@/lib/voice-config';
import { saveOnboarding } from '@/lib/convex';
import {
  PALETTE_BY_AESTHETIC,
  VRM_BY_AESTHETIC,
  type AestheticArchetype,
  type DispositionArchetype,
  type StyleArchetype,
  type LibraryEntry,
  type NumericTraits,
} from '@angel/shared';

interface PickInput {
  vroid_id: string;
  decision: 'yes' | 'no';
  round: 1 | 2 | 3;
}

const BY_ID = new Map<string, LibraryEntry>(DEMO_LIBRARY.map((e) => [e.id, e]));

/* ----- categorical derivation from numeric centroid ----- */

function dispositionFromTraits(t: NumericTraits): DispositionArchetype {
  // B1 warm+grounding | B2 sharp+playful | B3 gentle+dreamy | B4 direct+competent
  if (t.warmth >= 6 && t.energy <= 5) return 'B1';
  if (t.edge >= 6 && t.playfulness >= 6) return 'B2';
  if (t.warmth >= 5 && t.energy <= 4 && t.sophistication <= 6) return 'B3';
  return 'B4';
}

function styleFromTraits(t: NumericTraits): StyleArchetype {
  // C1 overthinker | C2 fast | C3 playful jokes | C4 meticulous
  if (t.sophistication >= 6 && t.energy <= 5) return 'C1';
  if (t.energy >= 7 && t.edge >= 5) return 'C2';
  if (t.playfulness >= 7) return 'C3';
  return 'C4';
}

function voiceClusterFromTraits(t: NumericTraits): 1 | 2 | 3 | 4 | 5 | 6 {
  if (t.warmth >= 7 && t.edge <= 4) return t.energy >= 6 ? 5 : 1;
  if (t.playfulness >= 7 && t.energy >= 6) return 3;
  if (t.sophistication >= 7 && t.energy <= 4) return 4;
  if (t.edge >= 7) return 6;
  return 2;
}

/* ----- handler ----- */

export async function POST(request: Request) {
  let body: { picks?: PickInput[]; userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const picks = body.picks ?? [];
  const yesEntries = picks
    .filter((p) => p.decision === 'yes')
    .map((p) => BY_ID.get(p.vroid_id))
    .filter((x): x is LibraryEntry => Boolean(x));

  if (yesEntries.length === 0) {
    return NextResponse.json({ error: 'no yes-swipes' }, { status: 400 });
  }

  const numericTraits = centroidOf(yesEntries);
  const archetype: AestheticArchetype = nearestArchetype(numericTraits);
  const voiceCluster = voiceClusterFromTraits(numericTraits);
  const voiceConfig = voiceConfigFromTraits(numericTraits, voiceCluster);

  const traits = {
    aesthetic: archetype,
    disposition: dispositionFromTraits(numericTraits),
    style: styleFromTraits(numericTraits),
    voice_cluster: voiceCluster,
  };

  // hero card = highest-art-quality yes-swipe. her vibe phrase + dialogue + face
  // become her actual identity in the reveal — not 1-of-4 hardcoded labels.
  const heroCard = [...yesEntries].sort(
    (a, b) => b.tags.art_quality - a.tags.art_quality,
  )[0]!;
  const heroVoiceConfig = voiceConfigFromTraits(
    {
      warmth: heroCard.tags.warmth,
      energy: heroCard.tags.energy,
      edge: heroCard.tags.edge,
      sophistication: heroCard.tags.sophistication,
      playfulness: heroCard.tags.playfulness,
    },
    heroCard.tags.suggested_voice_cluster,
  );

  // mirror partial onboarding into convex (no personalityMd yet — that's
  // computed downstream). fire-and-forget. if userId is missing we skip;
  // /api/claim handles the final canonical write.
  if (body.userId) {
    void saveOnboarding({
      userId: body.userId,
      vector: [
        numericTraits.warmth,
        numericTraits.energy,
        numericTraits.edge,
        numericTraits.sophistication,
        numericTraits.playfulness,
      ],
      traits,
      archetypeHistory: [
        { round: 3, archetypeId: archetype, timestamp: Date.now() },
      ],
      paletteHex: PALETTE_BY_AESTHETIC[archetype],
      vrmId: VRM_BY_AESTHETIC[archetype],
      numericTraits,
      voiceConfig,
    }).catch(() => {
      /* never block /api/embed */
    });
  }

  return NextResponse.json({
    numericTraits,
    voiceConfig,
    traits,
    archetype,
    vrmUrl: VRM_BY_AESTHETIC[archetype],
    paletteHex: PALETTE_BY_AESTHETIC[archetype],
    // canonical samples for personality synthesis + her first words
    dialogueSamples: heroCard.tags.dialogue_samples,
    // hero card — drives the reveal screen's named region + portrait + voice line
    heroCard: {
      id: heroCard.id,
      name: heroCard.name,
      thumbnailUrl: `/library/${heroCard.id}.jpg`,
      vibePhrase: heroCard.tags.vibe_phrase,
      personalityBlurb: heroCard.tags.personality_blurb,
      energyDescriptor: heroCard.tags.energy_descriptor,
      dialogueSamples: heroCard.tags.dialogue_samples,
      voiceConfig: heroVoiceConfig,
      palette: heroCard.tags.palette,
      aesthetic: heroCard.tags.aesthetic,
      hairColor: heroCard.tags.hair_color,
    },
    // fingerprint of who they swiped — used in observability
    yesIds: yesEntries.map((e) => e.id),
  });
}
