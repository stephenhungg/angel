/**
 * convex http router — the SMS inbound webhook.
 *
 * Surface:
 *   POST  /sms/inbound   — provider webhook (twilio / sendblue / noop curl)
 *   GET   /sms/health    — quick liveness check ("are we listening?")
 *
 * The webhook is provider-agnostic: it tries every configured provider's
 * parseInbound until one accepts the payload, validates the signature, and
 * then enqueues the orchestrator action (which does the actual heavy work).
 *
 * The HTTP response returns immediately (200) — orchestrator runs async via
 * scheduler so we don't hold the connection open while claude thinks.
 *
 * Twilio expects a TwiML response on success; we return an empty <Response/>
 * so it doesn't try to send its own auto-reply. Sendblue ignores the body.
 */

import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api } from './_generated/api';
import { parseInboundFromAny } from './sms/index';
import { toE164 } from '@angel/shared';

const http = httpRouter();

http.route({
  path: '/sms/inbound',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const url = request.url;
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headers[k] = v;
    });
    const rawBody = await request.text();

    const parsed = parseInboundFromAny({ headers, rawBody });
    if (!parsed) {
      console.warn('[http:/sms/inbound] no provider parsed the payload', {
        len: rawBody.length,
        contentType: headers['content-type'],
      });
      // Return 200 anyway so providers don't retry forever; we logged it.
      return twimlOk();
    }
    const { provider, inbound } = parsed;
    console.log(`[http:/sms/inbound] ${provider.name} inbound from ${inbound.from}: ${inbound.body.slice(0, 80)}`);

    // Resolve phone → user. Onboarded users have onboardingExtras.phoneNumber.
    // Unknown phones map to 'demo:<phone>' so the orchestrator still runs
    // with the default persona (nice for judges who text without onboarding).
    const phoneE164 = toE164(inbound.from);
    const lookup = await ctx.runQuery(api.sms.functions.findUserByPhone, {
      phoneNumber: phoneE164,
    });
    const userId = lookup?.authId ?? `demo:${phoneE164}`;

    // schedule the orchestrator. it runs in the action runtime (node) and
    // does the anthropic call + provider send + memory write.
    await ctx.scheduler.runAfter(0, api.sms.orchestrator.handleInbound, {
      userId,
      phoneNumber: phoneE164,
      body: inbound.body,
      providerMessageId: inbound.providerMessageId,
    });

    // Respond fast — let twilio off the hook (no pun intended).
    return twimlOk();
  }),
});

http.route({
  path: '/sms/health',
  method: 'GET',
  handler: httpAction(async () => {
    const status = {
      ok: true,
      surface: 'sms',
      providers: {
        twilio: !!process.env.TWILIO_ACCOUNT_SID,
        sendblue: !!process.env.SENDBLUE_API_KEY,
      },
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      nia: !!process.env.NIA_API_KEY,
    };
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }),
});

function twimlOk(): Response {
  // twilio acceptable empty response — sendblue ignores body
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { 'content-type': 'text/xml' },
  });
}

export default http;
