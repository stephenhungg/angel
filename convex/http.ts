/**
 * convex http router — inbound webhooks for every always-on surface.
 *
 * Surface:
 *   POST  /sms/inbound          — sms provider webhook (twilio / sendblue / noop)
 *   GET   /sms/health           — sms liveness check
 *   POST  /discord/interactions — discord interactions endpoint (slash commands)
 *   GET   /discord/health       — discord liveness check
 *
 * Each webhook is provider-agnostic and returns fast: heavy work runs async
 * via the scheduler so we don't hold the connection open while claude thinks.
 *
 * SMS: tries every configured provider's parseInbound until one accepts the
 * payload, validates the signature, then enqueues the sms orchestrator.
 *
 * Discord: verifies Ed25519 signature with the application public key, acks
 * with type 5 (DEFERRED) within 3s, then enqueues the discord orchestrator
 * which posts the followup webhook with the actual reply.
 *
 * Twilio expects a TwiML response on success; we return an empty <Response/>
 * so it doesn't try to send its own auto-reply. Sendblue ignores the body.
 */

import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api } from './_generated/api';
import { parseInboundFromAny } from './sms/index';
import { toE164 } from '@angel/shared';
import { handleDiscordInteraction } from './discord/interactions';

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
    // CRITICAL: fallback to "stephen" so SMS, electron, and discord all share
    // the SAME nia memory namespace. one soul, all surfaces.
    // with the default persona (nice for judges who text without onboarding).
    const phoneE164 = toE164(inbound.from);
    const lookup = await ctx.runQuery(api.sms.functions.findUserByPhone, {
      phoneNumber: phoneE164,
    });
    const userId = lookup?.authId ?? 'stephen';

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

/* ------------------------------------------------------------------ */
/* discord surface — slash commands via interactions endpoint          */
/* ------------------------------------------------------------------ */

http.route({
  path: '/discord/interactions',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    // CRITICAL: read the body as a STRING, not via .json(). Ed25519
    // verification runs on the exact bytes discord signed — re-stringifying
    // a parsed object would produce different bytes and fail verification.
    const rawBody = await request.text();
    const signatureHex = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');

    return await handleDiscordInteraction(ctx, {
      rawBody,
      signatureHex,
      timestamp,
    });
  }),
});

/**
 * Passive (gateway) message ingress. The standalone gateway bridge process
 * (web/scripts/discord-bridge.ts) hits this endpoint for every MESSAGE_CREATE
 * it decides should trigger a reply. We do the auth-light validation (shared
 * secret if configured), schedule the orchestrator action, and return 200
 * immediately — the action handles claude + posts to discord directly via
 * the bot token. The bridge does NOT post the reply; convex does.
 *
 * Auth: optional shared secret via `DISCORD_BRIDGE_SECRET`. If unset, accept
 * unauthenticated calls (acceptable for hackathon — convex's URL is hard to
 * guess and the orchestrator just generates a chat reply).
 */
http.route({
  path: '/discord/passive-message',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.DISCORD_BRIDGE_SECRET?.trim();
    if (expectedSecret) {
      const provided =
        request.headers.get('x-bridge-secret') ?? request.headers.get('authorization');
      const cleaned = provided?.replace(/^Bearer\s+/i, '').trim();
      if (cleaned !== expectedSecret) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    let payload: {
      messageId?: string;
      channelId?: string;
      guildId?: string;
      authorId?: string;
      authorUsername?: string;
      content?: string;
      trigger?: string;
    };
    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'bad json' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const channelId = payload.channelId?.trim();
    const authorId = payload.authorId?.trim();
    const content = payload.content?.trim() ?? '';
    if (!channelId || !authorId || !content) {
      return new Response(
        JSON.stringify({ ok: false, error: 'missing channelId/authorId/content' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }

    // Resolve discord user → angel user. CRITICAL: fallback to "stephen"
    // (not a per-discord-id demo persona) so that discord, electron, and sms
    // all share the SAME nia memory namespace. one soul, all surfaces.
    const lookup = await ctx.runQuery(api.discord.functions.findUserByDiscordId, {
      discordUserId: authorId,
    });
    const userId = lookup?.authId ?? 'stephen';

    console.log(
      `[http:/discord/passive-message] trigger=${payload.trigger ?? 'unknown'} ` +
        `ch=${channelId} guild=${payload.guildId ?? 'DM'} author=${payload.authorUsername ?? authorId} ` +
        `len=${content.length}`,
    );

    await ctx.scheduler.runAfter(0, api.discord.orchestrator.handlePassiveMessage, {
      userId,
      discordUserId: authorId,
      discordUsername: payload.authorUsername,
      discordChannelId: channelId,
      discordGuildId: payload.guildId,
      body: content,
      trigger: payload.trigger ?? 'unknown',
      replyToMessageId: payload.messageId,
    });

    return new Response(JSON.stringify({ ok: true, scheduled: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }),
});

/**
 * Listener cursor read — the Tensorlake-hosted polling agent calls this on
 * every cron firing to know "where did I leave off on each channel?". Returns
 * a flat record { channelId: { lastMessageId, updatedAt } }.
 *
 * Auth: the same DISCORD_BRIDGE_SECRET shared secret as /discord/passive-message
 * (when set). Read-only, so unauthenticated reads are also acceptable for the
 * hackathon if the secret isn't configured.
 */
http.route({
  path: '/discord/listener-cursor/get',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.DISCORD_BRIDGE_SECRET?.trim();
    if (expectedSecret) {
      const provided =
        request.headers.get('x-bridge-secret') ?? request.headers.get('authorization');
      const cleaned = provided?.replace(/^Bearer\s+/i, '').trim();
      if (cleaned !== expectedSecret) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    const cursors = await ctx.runQuery(api.discord.functions.getListenerCursors, {});
    return new Response(JSON.stringify({ ok: true, cursors }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }),
});

/**
 * Listener cursor write — the Tensorlake agent calls this after relaying every
 * new message in a channel, to advance the high-water mark so the next cron
 * firing doesn't re-process the same messages. Idempotent.
 *
 * Body: { channelId: string, lastMessageId: string, invocationId?: string }
 */
http.route({
  path: '/discord/listener-cursor/set',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = process.env.DISCORD_BRIDGE_SECRET?.trim();
    if (expectedSecret) {
      const provided =
        request.headers.get('x-bridge-secret') ?? request.headers.get('authorization');
      const cleaned = provided?.replace(/^Bearer\s+/i, '').trim();
      if (cleaned !== expectedSecret) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    let payload: { channelId?: string; lastMessageId?: string; invocationId?: string };
    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'bad json' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const channelId = payload.channelId?.trim();
    const lastMessageId = payload.lastMessageId?.trim();
    if (!channelId || !lastMessageId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'missing channelId/lastMessageId' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    await ctx.runMutation(api.discord.functions.setListenerCursor, {
      channelId,
      lastMessageId,
      invocationId: payload.invocationId,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }),
});

http.route({
  path: '/discord/health',
  method: 'GET',
  handler: httpAction(async () => {
    const status = {
      ok: true,
      surface: 'discord',
      configured: {
        publicKey: !!process.env.DISCORD_PUBLIC_KEY,
        applicationId: !!process.env.DISCORD_APPLICATION_ID,
        botToken: !!process.env.DISCORD_BOT_TOKEN,
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

export default http;
