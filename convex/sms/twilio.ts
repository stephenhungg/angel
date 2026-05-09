/**
 * Twilio SMS provider.
 *
 * Sends via REST: POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
 * with HTTP basic auth (sid : auth_token). Inbound webhook is a form-urlencoded
 * POST signed with X-Twilio-Signature (HMAC-SHA1, base64).
 *
 * Why Twilio (vs. Sendblue / LoopMessage):
 *   - sendblue + loopmessage require approval for production iMessage send
 *     (24-72h queue) — incompatible with a 6pm hackathon deadline.
 *   - twilio trial number ships in ~5 minutes, instant API key, instant send.
 *   - tradeoff: SMS not iMessage. demo brand says "text her", not "imessage her".
 *   - the provider interface is provider-agnostic; sendblue is one env-var flip
 *     away post-hackathon (see ./sendblue.ts — same shape, different transport).
 */

import type { SmsProvider, SmsSendResult, InboundSms } from '@angel/shared';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  /** Public URL convex exposes the inbound webhook at — used for signature validation. */
  webhookUrl?: string;
}

export class TwilioProvider implements SmsProvider {
  readonly name = 'twilio' as const;

  constructor(private readonly cfg: TwilioConfig) {}

  async send(to: string, body: string): Promise<SmsSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.cfg.accountSid}/Messages.json`;
    const form = new URLSearchParams();
    form.set('To', to);
    form.set('From', this.cfg.fromNumber);
    form.set('Body', body);

    const auth = base64(`${this.cfg.accountSid}:${this.cfg.authToken}`);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return {
          ok: false,
          provider: this.name,
          error: `twilio ${resp.status}: ${text.slice(0, 240)}`,
        };
      }
      const json = (await resp.json()) as { sid?: string };
      return { ok: true, provider: this.name, messageId: json.sid };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        error: `twilio fetch failed: ${(err as Error).message}`,
      };
    }
  }

  validateWebhook(args: {
    headers: Record<string, string>;
    rawBody: string;
    url?: string;
  }): { ok: boolean; reason?: string } {
    if (process.env.ANGEL_SMS_INSECURE === '1') {
      return { ok: true };
    }
    const sigHeader = lowerHeader(args.headers, 'x-twilio-signature');
    if (!sigHeader) return { ok: false, reason: 'missing X-Twilio-Signature header' };

    // twilio signature: HMAC-SHA1 of (url + sorted concatenated post params)
    const url = args.url ?? this.cfg.webhookUrl ?? '';
    if (!url) return { ok: false, reason: 'no webhook URL configured for signature verification' };

    const params = parseFormBody(args.rawBody);
    const sortedKeys = Object.keys(params).sort();
    let payload = url;
    for (const k of sortedKeys) payload += k + params[k];

    const expectedB64 = hmacSha1Base64(this.cfg.authToken, payload);
    if (expectedB64 !== sigHeader) {
      return { ok: false, reason: 'twilio signature mismatch' };
    }
    return { ok: true };
  }

  parseInbound(args: {
    headers: Record<string, string>;
    rawBody: string;
  }): InboundSms | null {
    const params = parseFormBody(args.rawBody);
    const from = params['From'];
    const to = params['To'];
    const body = params['Body'];
    const sid = params['MessageSid'] ?? params['SmsMessageSid'];
    if (!from || !body) return null;
    return {
      from,
      to: to ?? this.cfg.fromNumber,
      body,
      providerMessageId: sid,
      provider: this.name,
      receivedAt: Date.now(),
    };
  }
}

/** Build a TwilioProvider from env, or null if env is missing. */
export function buildTwilioFromEnv(): TwilioProvider | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return new TwilioProvider({
    accountSid,
    authToken,
    fromNumber,
    webhookUrl: process.env.ANGEL_SMS_WEBHOOK_URL?.trim(),
  });
}

/* -------------------- helpers (no node:crypto — convex actions support Web Crypto) -------------------- */

function base64(s: string): string {
  if (typeof btoa === 'function') return btoa(s);
  // fallback (node) — use Buffer
  return Buffer.from(s, 'utf-8').toString('base64');
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}

function hmacSha1Base64(key: string, message: string): string {
  // synchronous HMAC-SHA1 isn't available natively in Web Crypto. We compute
  // it via a tiny pure-JS implementation. Twilio uses HMAC-SHA1 specifically.
  return jsHmacSha1Base64(key, message);
}

/** Tiny pure-JS HMAC-SHA1, base64-encoded. Sized for short payloads (< 64KB). */
function jsHmacSha1Base64(key: string, message: string): string {
  const keyBytes = utf8(key);
  const msgBytes = utf8(message);
  const blockSize = 64;
  let kPadded = keyBytes.length > blockSize ? sha1(keyBytes) : keyBytes;
  if (kPadded.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(kPadded, 0);
    kPadded = padded;
  }
  const oKey = new Uint8Array(blockSize);
  const iKey = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKey[i] = kPadded[i]! ^ 0x5c;
    iKey[i] = kPadded[i]! ^ 0x36;
  }
  const inner = sha1(concat(iKey, msgBytes));
  const outer = sha1(concat(oKey, inner));
  // base64 encode the 20-byte digest
  return bytesToBase64(outer);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function sha1(data: Uint8Array): Uint8Array {
  // SHA-1, RFC 3174 — pure JS, ~70 lines. Synchronous so the validateWebhook
  // signature is too. If convex grows async webhook hooks we can swap to
  // crypto.subtle.digest('SHA-1', ...) easily.
  const ml = data.length;
  const totalLen = Math.ceil((ml + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[ml] = 0x80;
  // append big-endian 64-bit bit-length (we only support up to 2^32-1 bytes)
  const bitLen = ml * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(totalLen - 4, bitLen >>> 0, false);
  dv.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);
  for (let chunkOff = 0; chunkOff < totalLen; chunkOff += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(chunkOff + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = ((v << 1) | (v >>> 31)) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp =
        ((((a << 5) | (a >>> 27)) >>> 0) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0, false);
  ov.setUint32(4, h1, false);
  ov.setUint32(8, h2, false);
  ov.setUint32(12, h3, false);
  ov.setUint32(16, h4, false);
  return out;
}

function lowerHeader(headers: Record<string, string>, key: string): string | undefined {
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = raw.split('&');
  for (const p of parts) {
    if (!p) continue;
    const idx = p.indexOf('=');
    const k = idx === -1 ? p : p.slice(0, idx);
    const v = idx === -1 ? '' : p.slice(idx + 1);
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}
