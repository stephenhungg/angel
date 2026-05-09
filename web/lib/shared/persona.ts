/**
 * Persona vector + traits derived from swipe onboarding.
 * Stephen writes (web), Matthew reads (desktop).
 */

export type AestheticArchetype = 'A1' | 'A2' | 'A3' | 'A4';
// A1=cottagecore, A2=tech-minimal, A3=y2k-cyber, A4=dark-academia

export type DispositionArchetype = 'B1' | 'B2' | 'B3' | 'B4';
// B1=warm+grounding, B2=sharp+playful, B3=gentle+dreamy, B4=direct+competent

export type StyleArchetype = 'C1' | 'C2' | 'C3' | 'C4';
// C1=overthinker-narrating, C2=fast-executor, C3=playful-jokes, C4=meticulous

export type VoiceCluster = 1 | 2 | 3 | 4 | 5 | 6;

export interface PersonaTraits {
  aesthetic: AestheticArchetype;
  disposition: DispositionArchetype;
  style: StyleArchetype;
  voice_cluster: VoiceCluster;
}

export interface ArchetypeChoice {
  round: 1 | 2 | 3;
  archetypeId: string;
  timestamp: number;
}

export interface Persona {
  userId: string;
  name: string;
  vrmId: string;
  paletteHex: string;
  vector: number[]; // 768d
  archetypeHistory: ArchetypeChoice[];
  traits: PersonaTraits;
  createdAt: number;
}

/**
 * Maps archetype indices → asset paths. Both web and desktop must agree.
 *
 * Bind-pose drift on the abison-curated pool is now normalized at load
 * time by `desktop/src/lib/vrm-load.ts#normalizeHumanoidToTPose`, so each
 * archetype routes to its own VRoid character file.
 */
export const VRM_BY_AESTHETIC: Record<AestheticArchetype, string> = {
  A1: '/vrm/cottagecore.vrm',
  A2: '/vrm/tech-minimal.vrm',
  A3: '/vrm/cyber.vrm',
  A4: '/vrm/academia.vrm',
};

export const PALETTE_BY_AESTHETIC: Record<AestheticArchetype, string> = {
  A1: '#d4c5a0',
  A2: '#1a1a1a',
  A3: '#7c3aed',
  A4: '#5d3a1f',
};

/* ------------------------------------------------------------------ */
/* additive — numeric trait layer + voice config                       */
/* (added by swipe v2; matthew's existing categorical traits unchanged) */
/* ------------------------------------------------------------------ */

export interface NumericTraits {
  warmth: number; // 0-10
  energy: number;
  edge: number;
  sophistication: number;
  playfulness: number;
}

export type VowelBias = 'a' | 'i' | 'u' | 'e' | 'o' | 'mixed';

export interface VoiceConfig {
  base_cluster: VoiceCluster;
  pitch_variance: number; // 0-0.3
  speed: number; // 0.7-1.3
  syllable_count: number; // 3-12
  pause_density: number; // 0-1
  attack: number; // 0-1 (sharp consonants)
  decay: number; // 0-1 (trailing syllables)
  glissando: number; // 0-1 (sliding pitch)
  vowel_bias: VowelBias;
  breathiness: number; // 0-1
}

/**
 * Library entry shape — anime girl candidate from vroid hub.
 * Loaded from web/data/library.json, filtered to art_quality >= 6 + vroid hub IDs.
 */
export interface LibraryEntry {
  id: string;
  name: string;
  thumbnail_url: string;
  thumbnail_local: string;
  tags: {
    warmth: number;
    energy: number;
    edge: number;
    sophistication: number;
    playfulness: number;
    aesthetic:
      | 'cottagecore'
      | 'tech_minimal'
      | 'y2k'
      | 'dark_academia'
      | 'sporty'
      | 'goth'
      | 'kawaii'
      | 'fantasy'
      | 'casual'
      | 'other';
    age_vibe: 'teen' | 'young_adult' | 'mature';
    hair_color: string;
    palette: [string, string, string];
    vibe_phrase: string;
    personality_blurb: string;
    dialogue_samples: string[];
    energy_descriptor: string;
    suggested_voice_cluster: VoiceCluster;
    suggested_room_palette: [string, string, string];
    suggested_animation_bias: 'still' | 'slight_sway' | 'fidget' | 'expressive';
    art_quality: number;
    distinctive_features: string[];
  };
}
