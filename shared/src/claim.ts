/**
 * Claim token contract — web → electron handoff via `angel://claim?token=<jwt>`.
 * JWT signed with HS256, JWT_SECRET shared via .env between web and desktop.
 */

import type { PersonaTraits } from './persona.js';

export interface ClaimTokenPayload {
  userId: string;
  vrmId: string;
  paletteHex: string;
  name: string;
  traits: PersonaTraits;
  iat: number; // issued at (unix sec)
  exp: number; // expires at (unix sec) — 5 min ttl
}

export const CLAIM_TTL_SECONDS = 300; // 5 min
export const PROTOCOL = 'angel';
