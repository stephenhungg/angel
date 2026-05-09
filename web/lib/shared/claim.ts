/**
 * Claim token contract — web → electron handoff via `angel://claim?token=<jwt>`.
 * JWT signed with HS256, JWT_SECRET shared via .env between web and desktop.
 */

import type { NumericTraits, PersonaTraits, VoiceConfig } from './persona';

export interface ClaimTokenPayload {
  userId: string;
  vrmId: string;
  paletteHex: string;
  name: string;
  traits: PersonaTraits;
  iat: number; // issued at (unix sec)
  exp: number; // expires at (unix sec) — 5 min ttl

  // additive (optional) — added by swipe v2 pipeline
  numericTraits?: NumericTraits;
  voiceConfig?: VoiceConfig;
  personalityMd?: string;
}

export const CLAIM_TTL_SECONDS = 300; // 5 min
export const PROTOCOL = 'angel';
