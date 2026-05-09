/**
 * POST /api/claim
 * Input: full ClaimTokenPayload (minus iat/exp)
 * Output: { claimUrl: 'angel://claim?token=<jwt>' }
 *
 * Signs JWT with JWT_SECRET. Falls back to unverified token in dev (matthew's
 * desktop side accepts unverified for demo). 5-minute TTL.
 */

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import {
  CLAIM_TTL_SECONDS,
  PROTOCOL,
  type ClaimTokenPayload,
  type NumericTraits,
  type PersonaTraits,
  type VoiceConfig,
} from '@angel/shared';

interface Body {
  userId: string;
  vrmId: string;
  paletteHex: string;
  name: string;
  traits: PersonaTraits;
  numericTraits?: NumericTraits;
  voiceConfig?: VoiceConfig;
  personalityMd?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: ClaimTokenPayload = {
    userId: body.userId,
    vrmId: body.vrmId,
    paletteHex: body.paletteHex,
    name: body.name || 'angel',
    traits: body.traits,
    iat: now,
    exp: now + CLAIM_TTL_SECONDS,
    numericTraits: body.numericTraits,
    voiceConfig: body.voiceConfig,
    personalityMd: body.personalityMd,
  };

  const secret = process.env.JWT_SECRET;
  let token: string;
  if (secret) {
    token = jwt.sign(payload, secret, { algorithm: 'HS256' });
  } else {
    // dev fallback: encode without verification — matthew's claim.ts accepts this
    const b64 = (s: string) =>
      Buffer.from(s).toString('base64url').replace(/=+$/, '');
    token = `${b64('{"alg":"none","typ":"JWT"}')}.${b64(JSON.stringify(payload))}.`;
  }

  return NextResponse.json({
    claimUrl: `${PROTOCOL}://claim?token=${encodeURIComponent(token)}`,
    payload,
  });
}
