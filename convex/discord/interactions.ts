/**
 * Discord interactions endpoint handler.
 *
 * Discord requires every interaction request to be Ed25519-signed with the
 * application's public key. Discord ALSO sends a PING (type 1) when you set
 * the Interactions Endpoint URL in the Developer Portal — if we fail to
 * verify the signature on that PING, discord refuses to set the URL.
 *
 * Three interaction types we care about:
 *   1 PING           — handshake. respond { type: 1 } (PONG).
 *   2 APPLICATION_COMMAND — `/angel message:<...>`. respond { type: 5 }
 *                     (DEFERRED), schedule the orchestrator action.
 *   3 MESSAGE_COMPONENT  — buttons/dropdowns. ignored for now.
 *
 * Returns 401 on signature failure (REQUIRED — discord won't accept the URL
 * unless invalid signatures are 401'd). Returns 503 if DISCORD_PUBLIC_KEY is
 * unset (so deploys without the env var advertise the misconfiguration
 * instead of silently 200ing every request).
 *
 * This file exports the handler as a plain function so http.ts can wire it
 * into the http router. Verification uses tweetnacl (pure JS) which works in
 * convex's default v8 runtime.
 */

import nacl from 'tweetnacl';
import type { ActionCtx } from '../_generated/server';
import { api } from '../_generated/api';
import {
  DISCORD_INTERACTION_TYPES,
  DISCORD_RESPONSE_TYPES,
} from '@angel/shared';

/** Convert a hex string to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : '0' + hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Verify a Discord interaction request. Returns true if the signature is
 * valid. False otherwise (caller MUST 401).
 */
export function verifyDiscordSignature(args: {
  signatureHex: string | null;
  timestamp: string | null;
  rawBody: string;
  publicKeyHex: string;
}): boolean {
  if (!args.signatureHex || !args.timestamp || !args.publicKeyHex) return false;
  try {
    const message = new TextEncoder().encode(args.timestamp + args.rawBody);
    const signature = hexToBytes(args.signatureHex);
    const publicKey = hexToBytes(args.publicKeyHex);
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

/* ----------------------- discord payload shapes ---------------------------- */

interface DiscordCommandOption {
  type: number;
  name: string;
  value?: string | number | boolean;
}

interface DiscordCommandInteraction {
  type: number;
  id: string;
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user?: { id: string; username?: string; global_name?: string };
  };
  user?: { id: string; username?: string; global_name?: string };
  data?: {
    name?: string;
    options?: DiscordCommandOption[];
  };
}

/* ----------------------- the handler --------------------------------------- */

/**
 * The HTTP handler — meant to be called from http.ts after reading the raw
 * body once (we MUST verify against the exact bytes, not a re-stringified
 * JSON, so the body has to be passed in as a string).
 */
export async function handleDiscordInteraction(
  ctx: ActionCtx,
  args: {
    rawBody: string;
    signatureHex: string | null;
    timestamp: string | null;
  },
): Promise<Response> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return new Response(
      JSON.stringify({
        error: 'discord not configured',
        detail: 'DISCORD_PUBLIC_KEY env var is unset on the convex deployment',
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }

  const ok = verifyDiscordSignature({
    signatureHex: args.signatureHex,
    timestamp: args.timestamp,
    rawBody: args.rawBody,
    publicKeyHex: publicKey,
  });
  if (!ok) {
    return new Response('invalid request signature', { status: 401 });
  }

  let interaction: DiscordCommandInteraction;
  try {
    interaction = JSON.parse(args.rawBody) as DiscordCommandInteraction;
  } catch {
    return new Response('bad json', { status: 400 });
  }

  // Type 1 — PING. Used by Discord to verify the endpoint URL.
  if (interaction.type === DISCORD_INTERACTION_TYPES.PING) {
    return jsonResponse({ type: DISCORD_RESPONSE_TYPES.PONG });
  }

  // Type 2 — APPLICATION_COMMAND (slash command).
  if (interaction.type === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND) {
    const commandName = interaction.data?.name ?? '';
    const messageOption = (interaction.data?.options ?? []).find(
      (o) => o.name === 'message',
    );
    const body =
      typeof messageOption?.value === 'string' ? messageOption.value : '';

    // Pull the user — `member.user` in guilds, `user` in DMs.
    const userObj = interaction.member?.user ?? interaction.user;
    const discordUserId = userObj?.id ?? '';
    const discordUsername = userObj?.global_name ?? userObj?.username;

    if (commandName !== 'angel') {
      // unknown command — surface a one-shot message and bail
      return jsonResponse({
        type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `unknown command: ${commandName}`, flags: 64 /* ephemeral */ },
      });
    }
    if (!body.trim()) {
      return jsonResponse({
        type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'pass a `message:` to /angel.', flags: 64 },
      });
    }
    if (!discordUserId) {
      return jsonResponse({
        type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "couldn't read your discord id from this interaction.", flags: 64 },
      });
    }

    // Resolve discord user → angel user. Fallback to demo:discord:<id>
    // so judges who haven't onboarded still get a working reply with the
    // default persona.
    const lookup = await ctx.runQuery(api.discord.functions.findUserByDiscordId, {
      discordUserId,
    });
    const userId = lookup?.authId ?? `demo:discord:${discordUserId}`;

    // Schedule the orchestrator (runs in node action runtime, ~5s).
    // We MUST respond to this http request in <3s or discord drops it —
    // hence the deferred ack pattern: ack now, follow up later.
    await ctx.scheduler.runAfter(0, api.discord.orchestrator.handleInteraction, {
      userId,
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
      discordUserId,
      discordUsername,
      discordChannelId: interaction.channel_id,
      discordGuildId: interaction.guild_id,
      body,
    });

    // Type 5 — DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE. Discord shows
    // "<bot> is thinking…" until we PATCH @original or POST followup.
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  // Type 3 — MESSAGE_COMPONENT (buttons, dropdowns). Not used yet.
  if (interaction.type === DISCORD_INTERACTION_TYPES.MESSAGE_COMPONENT) {
    return jsonResponse({
      type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'message components not handled yet.', flags: 64 },
    });
  }

  // Unknown type — be permissive, return 200 with no-op.
  console.warn('[discord:interactions] unhandled type', interaction.type);
  return jsonResponse({ type: DISCORD_RESPONSE_TYPES.PONG });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
