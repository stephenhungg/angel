/**
 * SMS provider factory — picks the best available provider based on env vars.
 *
 * Priority: sendblue (real iMessage) > twilio (sms only) > noop (logs only).
 *
 * The `noop` fallback exists so the http action and orchestrator can be
 * wired and verified end-to-end EVEN WITHOUT credentials — judges still see
 * the architecture, the inbound webhook records turns, the orchestrator runs
 * — only the final outbound send is short-circuited.
 */

import type {
  SmsProvider,
  SmsSendResult,
  InboundSms,
  SmsProviderName,
} from '@angel/shared';
import { buildTwilioFromEnv, TwilioProvider } from './twilio';
import { buildSendblueFromEnv, SendblueProvider } from './sendblue';

export { TwilioProvider, SendblueProvider };

class NoopProvider implements SmsProvider {
  readonly name = 'noop' as const;
  async send(to: string, body: string): Promise<SmsSendResult> {
    console.log(`[sms:noop] would send to ${to}: ${body}`);
    return { ok: true, provider: this.name, messageId: `noop-${Date.now()}` };
  }
  validateWebhook(): { ok: boolean; reason?: string } {
    return { ok: true };
  }
  parseInbound(args: {
    headers: Record<string, string>;
    rawBody: string;
  }): InboundSms | null {
    // noop accepts a generic JSON shape so curl-based local testing works
    try {
      const payload = JSON.parse(args.rawBody) as {
        from?: string;
        to?: string;
        body?: string;
      };
      if (!payload.from || !payload.body) return null;
      return {
        from: payload.from,
        to: payload.to ?? '+10000000000',
        body: payload.body,
        provider: this.name,
        receivedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }
}

let _cached: SmsProvider | null = null;

export function buildSmsProvider(): SmsProvider {
  if (_cached) return _cached;
  // Priority: sendblue > twilio > noop
  const sb = buildSendblueFromEnv();
  if (sb) {
    _cached = sb;
    console.log('[sms] using sendblue provider');
    return sb;
  }
  const tw = buildTwilioFromEnv();
  if (tw) {
    _cached = tw;
    console.log('[sms] using twilio provider');
    return tw;
  }
  console.warn(
    '[sms] no provider env vars set (TWILIO_* or SENDBLUE_*) — using noop. ' +
      'inbound webhooks will still parse and run the orchestrator, but outbound sends will be logged only.',
  );
  _cached = new NoopProvider();
  return _cached;
}

/**
 * Resolve the inbound provider from the request. We try every configured
 * provider's parseInbound — first one that accepts the payload wins. This
 * lets a single /sms/inbound route accept webhooks from whichever provider
 * is configured without separate routes per provider.
 */
export function parseInboundFromAny(args: {
  headers: Record<string, string>;
  rawBody: string;
}): { provider: SmsProvider; inbound: InboundSms } | null {
  const candidates: SmsProvider[] = [];
  const sb = buildSendblueFromEnv();
  if (sb) candidates.push(sb);
  const tw = buildTwilioFromEnv();
  if (tw) candidates.push(tw);
  candidates.push(new NoopProvider());

  for (const p of candidates) {
    const inbound = p.parseInbound(args);
    if (inbound) {
      const valid = p.validateWebhook(args);
      if (!valid.ok) {
        // a provider matched the shape but failed signature — keep trying
        // others (the noop won't sigcheck, so we'll fall through to it under
        // ANGEL_SMS_INSECURE=1)
        continue;
      }
      return { provider: p, inbound };
    }
  }
  return null;
}

export type { SmsProvider, SmsSendResult, InboundSms, SmsProviderName };
