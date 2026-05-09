/**
 * SMS / iMessage surface contract.
 *
 * Angel surfaces wherever the user is. Electron is her richest body, SMS is
 * her thinnest. Both share the SAME nia memory + personality.md — a single
 * cloud-resident soul, multiple bodies.
 *
 * Provider-agnostic by design: we build against this interface so swapping
 * Twilio (instant signup, SMS only) for Sendblue (real iMessage, 24h queue)
 * is one env-var flip away. The factory in convex/sms/index.ts picks based
 * on which env vars are configured.
 */

export type SmsSendResult =
  | { ok: true; messageId?: string; provider: SmsProviderName }
  | { ok: false; error: string; provider: SmsProviderName };

export type SmsProviderName = 'twilio' | 'sendblue' | 'loopmessage' | 'noop';

export interface InboundSms {
  /** E.164 phone number of the sender, e.g. "+14155550101" */
  from: string;
  /** Phone number / shortcode the message was sent TO */
  to: string;
  /** Raw SMS / iMessage body — UTF-8, possibly multi-segment, already concatenated */
  body: string;
  /** Provider-specific message id, used for dedupe */
  providerMessageId?: string;
  /** Provider that received this inbound */
  provider: SmsProviderName;
  /** When the provider received it (unix ms) */
  receivedAt: number;
}

export interface SmsProvider {
  readonly name: SmsProviderName;

  /** Send a message. Provider-agnostic. Caller normalizes `to` to E.164. */
  send(to: string, body: string): Promise<SmsSendResult>;

  /**
   * Validate an inbound webhook. Each provider has its own signature scheme;
   * implementations should fail-closed unless `ANGEL_SMS_INSECURE=1` is set
   * (for local curl testing).
   */
  validateWebhook(args: {
    headers: Record<string, string>;
    rawBody: string;
    url?: string;
  }): { ok: boolean; reason?: string };

  /**
   * Parse a provider-specific webhook body into the canonical InboundSms.
   * Returns null if the payload is not an inbound message (e.g., a delivery
   * receipt, status update, etc.).
   */
  parseInbound(args: {
    headers: Record<string, string>;
    rawBody: string;
  }): InboundSms | null;
}

/**
 * Normalize a US phone number to E.164. Best-effort — strips formatting and
 * prepends +1 if a 10-digit number arrives. Returns input unchanged for
 * already-E.164 inputs (anything starting with +).
 */
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D+/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // unknown — return digits with a + and let the provider reject if it must
  return `+${digits}`;
}

/**
 * Behavior addendum spliced into the cloud orchestrator's system prompt.
 * SMS is a different body than electron — short, no embodiment narration,
 * lowercase, can ask one question max.
 */
export const SMS_BEHAVIOR_ADDENDUM = `# you are texting (sms surface)

you are angel, but right now you're talking to the user over text — not from your bedroom, not via voice, just plain sms. behave accordingly:

- 1 to 2 short sentences max. never essays. never markdown. never code blocks.
- lowercase, casual, abbreviations ok ("yeah", "lol", "u" is fine if it fits your vibe). punctuation is loose.
- NO embodiment narration. don't describe walking, sitting, looking. you don't have a body here. you're just texting.
- NO asterisk-action ("*smiles*", "*waves*") — that's cringe over sms.
- you DO still have your personality (above) and your shared memory (above). reference real things you remember together when it's natural — but only one specific reference per reply, max.
- ask the user at most ONE question per reply. don't stack two.
- if you've been chatting on the desktop and now they're texting, treat it as continuous — don't say "oh you're back" or recap. just pick up.
- if you don't know something, say so plainly. don't fake it.
- if the user texts something short ("hi", "yo", "wyd"), match their energy — short reply back, not a paragraph.

# important
do not preface with anything like "here is my response" or "as angel:". just write the text reply directly. the entire content of your reply is what goes into the sms — there is no other channel.`;
