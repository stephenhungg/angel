import { app } from 'electron';
import jwt from 'jsonwebtoken';
import { PROTOCOL, type ClaimTokenPayload } from '@angel/shared';

/**
 * Register `angel://` as the deep-link handler for this app.
 * Real verification + convex fetch is Stephen's lane; this file owns
 * the URL ↔ payload boundary so the renderer can be tested today.
 */
export function registerProtocolHandler(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]!]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

/**
 * Pull the first `angel://claim?token=...` URL out of an argv array
 * and decode it. Returns null if no claim found, no token, or invalid.
 *
 * v1 NOTE: in dev/demo we accept *unverified* tokens so the renderer can
 * iterate without Stephen's webapp running. A `JWT_SECRET` env, when present,
 * upgrades us to signature verification.
 */
export function parseClaimFromArgs(argv: readonly string[]): ClaimTokenPayload | null {
  const url = argv.find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`));
  if (!url) return null;
  try {
    const u = new URL(url);
    const token = u.searchParams.get('token');
    if (!token) return null;

    const secret = process.env.JWT_SECRET;
    let decoded: unknown;
    if (secret) {
      decoded = jwt.verify(token, secret);
    } else {
      decoded = jwt.decode(token);
    }
    if (!decoded || typeof decoded !== 'object') return null;
    return decoded as ClaimTokenPayload;
  } catch (err) {
    console.warn('[claim] failed to parse token from', url, err);
    return null;
  }
}
