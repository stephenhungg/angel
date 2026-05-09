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
