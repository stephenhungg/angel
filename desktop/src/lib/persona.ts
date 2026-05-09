import type { ClaimTokenPayload, PersonaTraits } from '@angel/shared';
import { VRM_BY_AESTHETIC, PALETTE_BY_AESTHETIC } from '@angel/shared';

/**
 * Persona apply utilities — the bridge between a claim payload and the
 * three things the renderer cares about: which VRM file to load, what
 * accent color to drive CSS vars with, and what to put in the titlebar.
 *
 * The /public/vrm/ pool is keyed by aesthetic archetype (see manifest.json).
 * If a claim's archetype is missing or the VRM file fails to parse, we fall
 * back to the original placeholder VRM (restored from git after the
 * swipe-pipeline merge clobbered it). The abison pool ships with arms-up
 * bind poses that don't survive our retargeter cleanly during idle.
 */

const FALLBACK_VRM = '/vrm/2068967230566994300.vrm';

export function vrmForTraits(traits: Pick<PersonaTraits, 'aesthetic'>): string {
  const candidate = VRM_BY_AESTHETIC[traits.aesthetic];
  if (!candidate) return FALLBACK_VRM;
  return candidate;
}

export function paletteForTraits(traits: Pick<PersonaTraits, 'aesthetic'>): string {
  return PALETTE_BY_AESTHETIC[traits.aesthetic] ?? '#ff7eb6';
}

/** Apply paletteHex to the document's CSS vars + a soft halo derivative. */
export function applyPaletteToDocument(paletteHex: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--angel-accent', paletteHex);
  document.documentElement.style.setProperty('--angel-accent-soft', `${paletteHex}33`);
  // glow used by the speech-bubble border + bar shadow
  document.documentElement.style.setProperty(
    '--angel-glow',
    `0 0 24px ${paletteHex}80`,
  );
}

/** Resolve a claim into the renderer-side persona record. */
export function resolveClaim(claim: ClaimTokenPayload): {
  vrmUrl: string;
  paletteHex: string;
  name: string;
  traits: PersonaTraits;
} {
  return {
    vrmUrl: vrmForTraits(claim.traits),
    paletteHex: claim.paletteHex || paletteForTraits(claim.traits),
    name: claim.name,
    traits: claim.traits,
  };
}
