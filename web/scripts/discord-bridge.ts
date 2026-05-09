/**
 * angel — discord gateway bridge.
 *
 * Long-running standalone Bun process. Opens a persistent WebSocket to the
 * Discord gateway, listens for MESSAGE_CREATE events, decides whether each
 * message should trigger a reply (mention | reply-to-bot | DM | listen
 * channel), and forwards the message to the convex orchestrator over HTTP.
 *
 * The orchestrator runs claude + memory and posts the reply back to discord
 * via the bot token — this bridge does NOT post replies. It's just the
 * always-on listener that the convex http surface can't be (convex http
 * actions are stateless, and the gateway needs a persistent connection).
 *
 * Companion to convex/discord/interactions.ts (the slash-command entrypoint).
 * Slash commands keep working — this adds the natural conversational surface
 * on top.
 *
 * Reference: heavily inspired by tenzin/src/commands/discord.ts. Trigger
 * logic mirrors `guildTriggerReason` there. Gateway lifecycle mirrors the
 * connect / heartbeat / resume code there.
 *
 * Env vars (.env or shell):
 *   DISCORD_BOT_TOKEN          — required; from Discord Developer Portal → Bot
 *   CONVEX_URL                 — required; e.g. https://xxx.convex.site
 *   DISCORD_LISTEN_CHANNELS    — optional; comma-separated channel IDs where
 *                                we respond to *every* non-bot message
 *   DISCORD_BRIDGE_SECRET      — optional; matches convex's same env var to
 *                                gate the /discord/passive-message endpoint
 *   DISCORD_BRIDGE_DEBUG       — optional; "1" to log every gateway event
 *
 * Run:
 *   bun run discord:bridge
 *
 * Reminder: the bot needs the MESSAGE_CONTENT privileged intent enabled in
 * the Discord Developer Portal (Bot tab → Privileged Gateway Intents). Without
 * it, message.content is empty for messages that don't @-mention the bot, so
 * mention-triggers still work but listen channels won't.
 */

import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import WebSocket from 'ws';

// Load .env files in order of preference. Web workspace .env.local first
// (matches `next dev`), then repo root .env, then defaults.
function loadEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env.local'),
    resolve(process.cwd(), '../.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) loadDotenv({ path, override: false });
  }
}
loadEnv();

const TOKEN = process.env.DISCORD_BOT_TOKEN?.trim();
// Convex HTTP actions live on the .convex.site host (not .convex.cloud, which
// is the function-call endpoint). Coerce either value to the http host.
const CONVEX_URL = (
  process.env.CONVEX_URL?.trim() ||
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
  'https://necessary-leopard-395.convex.site'
).replace('.convex.cloud', '.convex.site');
const LISTEN_CHANNELS = new Set(
  (process.env.DISCORD_LISTEN_CHANNELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const BRIDGE_SECRET = process.env.DISCORD_BRIDGE_SECRET?.trim();
const DEBUG = process.env.DISCORD_BRIDGE_DEBUG === '1';

if (!TOKEN) {
  console.error('[bridge] DISCORD_BOT_TOKEN is required');
  process.exit(1);
}

const PASSIVE_ENDPOINT = `${CONVEX_URL.replace(/\/$/, '')}/discord/passive-message`;
const GATEWAY_URL_BASE = 'wss://gateway.discord.gg/?v=10&encoding=json';

// Intents bitmask: GUILDS | GUILD_MESSAGES | DIRECT_MESSAGES | MESSAGE_CONTENT
// = 1 + 512 + 4096 + 32768 = 37377
const INTENTS = 1 | 512 | 4096 | 32768;

// Discord gateway opcodes (subset we actually handle).
const Op = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

// Close codes that mean "do NOT reconnect — fix something first".
// 4004 auth failed, 4010 invalid shard, 4011 sharding required, 4012 invalid api,
// 4013 invalid intents, 4014 disallowed intents (privileged not enabled).
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

type GatewayPayload = {
  op: number;
  d: any;
  s: number | null;
  t: string | null;
};

interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string;
  bot?: boolean;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  content: string;
  mentions: DiscordUser[];
  referenced_message?: { author?: DiscordUser } | null;
}

// --- runtime state ---
let ws: WebSocket | null = null;
let botUserId: string | null = null;
let botUsername: string | null = null;
let sessionId: string | null = null;
let lastSequence: number | null = null;
let resumeGatewayUrl: string | null = null;
let heartbeatIntervalMs = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatJitterTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatAcked = true;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let running = true;

function debug(...args: unknown[]): void {
  if (DEBUG) console.log('[bridge:debug]', ...args);
}

function sendWs(data: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendIdentify(): void {
  console.log('[bridge] IDENTIFY (intents:', INTENTS, ')');
  sendWs({
    op: Op.IDENTIFY,
    d: {
      token: TOKEN,
      intents: INTENTS,
      properties: {
        os: process.platform,
        browser: 'angel-bridge',
        device: 'angel-bridge',
      },
    },
  });
}

function sendResume(): void {
  console.log(`[bridge] RESUME session=${sessionId} seq=${lastSequence}`);
  sendWs({
    op: Op.RESUME,
    d: { token: TOKEN, session_id: sessionId, seq: lastSequence },
  });
}

function sendHeartbeat(): void {
  sendWs({ op: Op.HEARTBEAT, d: lastSequence });
  heartbeatAcked = false;
  debug('heartbeat sent, seq=', lastSequence);
}

function startHeartbeat(): void {
  stopHeartbeat();
  // first heartbeat at random jitter inside the interval (per discord spec)
  heartbeatJitterTimer = setTimeout(() => {
    heartbeatJitterTimer = null;
    sendHeartbeat();
  }, Math.random() * heartbeatIntervalMs);
  heartbeatTimer = setInterval(() => {
    if (!heartbeatAcked) {
      console.warn('[bridge] heartbeat not acked — closing socket to force reconnect');
      try {
        ws?.close(4000, 'Heartbeat timeout');
      } catch {
        /* ignore */
      }
      return;
    }
    sendHeartbeat();
  }, heartbeatIntervalMs);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (heartbeatJitterTimer) clearTimeout(heartbeatJitterTimer);
  heartbeatJitterTimer = null;
}

/**
 * Decide whether to respond to this message and why.
 * Mirrors tenzin's `guildTriggerReason`. Returns null if we should ignore it.
 */
function triggerReason(msg: DiscordMessage): string | null {
  // never respond to ourselves or other bots
  if (botUserId && msg.author?.id === botUserId) return null;
  if (msg.author?.bot) return null;

  // DMs always get a response (no guild_id means DM channel)
  if (!msg.guild_id) return 'dm';

  // explicit reply to a bot message
  if (botUserId && msg.referenced_message?.author?.id === botUserId) {
    return 'reply_to_bot';
  }

  // mention via the parsed mentions array
  if (botUserId && msg.mentions?.some((m) => m.id === botUserId)) {
    return 'mention';
  }

  // mention in raw content (fallback in case mentions array isn't populated)
  if (botUserId && msg.content?.includes(`<@${botUserId}>`)) {
    return 'mention_in_content';
  }
  if (botUserId && msg.content?.includes(`<@!${botUserId}>`)) {
    return 'mention_in_content';
  }

  // listen channel — respond to every non-bot message
  if (LISTEN_CHANNELS.has(msg.channel_id)) return 'listen_channel';

  return null;
}

/** Strip our own bot mention from the content so the prompt is clean. */
function stripSelfMention(content: string): string {
  if (!botUserId) return content;
  const re = new RegExp(`<@!?${botUserId}>`, 'g');
  return content.replace(re, '').replace(/\s+/g, ' ').trim();
}

async function forwardToConvex(args: {
  msg: DiscordMessage;
  trigger: string;
  cleanedContent: string;
}): Promise<void> {
  const { msg, trigger, cleanedContent } = args;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (BRIDGE_SECRET) headers['x-bridge-secret'] = BRIDGE_SECRET;

  const body = {
    messageId: msg.id,
    channelId: msg.channel_id,
    guildId: msg.guild_id,
    authorId: msg.author.id,
    authorUsername: msg.author.global_name ?? msg.author.username,
    content: cleanedContent,
    trigger,
  };

  console.log(
    `[bridge] forward → convex ` +
      `trigger=${trigger} ch=${msg.channel_id} author=${msg.author.username} ` +
      `len=${cleanedContent.length}`,
  );

  try {
    const resp = await fetch(PASSIVE_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(
        `[bridge] convex returned ${resp.status}: ${text.slice(0, 240)}`,
      );
      return;
    }
    debug('convex ack:', await resp.text().catch(() => ''));
  } catch (err) {
    console.error('[bridge] convex fetch failed:', (err as Error).message);
  }
}

async function handleMessageCreate(msg: DiscordMessage): Promise<void> {
  const trigger = triggerReason(msg);
  if (!trigger) {
    debug(
      `MESSAGE_CREATE ignored ch=${msg.channel_id} author=${msg.author?.username}`,
    );
    return;
  }

  const cleaned = stripSelfMention(msg.content ?? '');
  if (!cleaned) {
    // mention with no other content → respond with a default ack so the
    // user knows we're alive instead of silently dropping
    debug('mention with empty body, sending default greeting');
    await forwardToConvex({
      msg,
      trigger,
      cleanedContent: 'hey',
    });
    return;
  }

  await forwardToConvex({ msg, trigger, cleanedContent: cleaned });
}

function handleDispatch(eventName: string, data: any): void {
  switch (eventName) {
    case 'READY':
      sessionId = data.session_id;
      resumeGatewayUrl = data.resume_gateway_url;
      botUserId = data.user.id;
      botUsername = data.user.username;
      console.log(
        `[bridge] READY as ${botUsername} (${botUserId}); session=${sessionId}`,
      );
      console.log(`[bridge] guilds: ${(data.guilds ?? []).length}`);
      if (LISTEN_CHANNELS.size > 0) {
        console.log(
          `[bridge] listen channels: ${[...LISTEN_CHANNELS].join(', ')}`,
        );
      }
      break;

    case 'RESUMED':
      console.log('[bridge] RESUMED — session re-established');
      break;

    case 'MESSAGE_CREATE':
      console.log(
        `[bridge] MESSAGE_CREATE ch=${data.channel_id} ` +
          `author=${data.author?.username} guild=${data.guild_id ?? 'DM'} ` +
          `len=${(data.content ?? '').length}`,
      );
      handleMessageCreate(data as DiscordMessage).catch((err) =>
        console.error('[bridge] handleMessageCreate failed:', err),
      );
      break;

    default:
      debug('dispatch:', eventName);
  }
}

function handlePayload(payload: GatewayPayload): void {
  if (payload.s !== null) lastSequence = payload.s;

  switch (payload.op) {
    case Op.HELLO:
      heartbeatIntervalMs = payload.d.heartbeat_interval;
      console.log(`[bridge] HELLO heartbeat_interval=${heartbeatIntervalMs}ms`);
      startHeartbeat();
      if (sessionId && lastSequence !== null) {
        sendResume();
      } else {
        sendIdentify();
      }
      break;

    case Op.HEARTBEAT_ACK:
      heartbeatAcked = true;
      debug('HEARTBEAT_ACK');
      break;

    case Op.HEARTBEAT:
      // server-requested heartbeat
      sendHeartbeat();
      break;

    case Op.RECONNECT:
      console.log('[bridge] RECONNECT requested by gateway — closing');
      try {
        ws?.close(4000, 'Reconnect requested');
      } catch {
        /* ignore */
      }
      break;

    case Op.INVALID_SESSION: {
      const resumable = payload.d === true;
      console.warn(`[bridge] INVALID_SESSION resumable=${resumable}`);
      if (!resumable) {
        sessionId = null;
        lastSequence = null;
      }
      setTimeout(() => {
        if (resumable && sessionId) sendResume();
        else sendIdentify();
      }, 1000 + Math.random() * 4000);
      break;
    }

    case Op.DISPATCH:
      if (payload.t) handleDispatch(payload.t, payload.d);
      break;

    default:
      debug('unhandled op:', payload.op);
  }
}

function scheduleReconnect(delayMs: number): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (running) connect();
  }, delayMs);
}

function connect(): void {
  // prefer resume url if we have one (discord rotates it per session)
  const url = sessionId && resumeGatewayUrl ? resumeGatewayUrl : GATEWAY_URL_BASE;
  console.log(`[bridge] connecting to ${url}`);
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[bridge] WebSocket open');
  });

  ws.on('message', (raw: Buffer | string) => {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    let payload: GatewayPayload;
    try {
      payload = JSON.parse(text) as GatewayPayload;
    } catch (err) {
      console.error('[bridge] failed to parse gateway payload:', err);
      return;
    }
    handlePayload(payload);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    const reasonStr = reason?.toString('utf8') || '';
    console.warn(`[bridge] WebSocket closed code=${code} reason="${reasonStr}"`);
    stopHeartbeat();
    if (!running) return;

    if (FATAL_CLOSE_CODES.has(code)) {
      console.error(
        `[bridge] FATAL close code ${code}. Common cause: 4014 = MESSAGE_CONTENT ` +
          `intent not enabled in Developer Portal → Bot → Privileged Gateway Intents. ` +
          `4004 = bad bot token. Not reconnecting.`,
      );
      process.exit(1);
    }

    const canResume = sessionId && lastSequence !== null;
    if (canResume) {
      console.log('[bridge] attempting RESUME on reconnect…');
      scheduleReconnect(1000 + Math.random() * 2000);
    } else {
      sessionId = null;
      lastSequence = null;
      resumeGatewayUrl = null;
      console.log('[bridge] full reconnect (no session to resume)');
      scheduleReconnect(3000 + Math.random() * 4000);
    }
  });

  ws.on('error', (err) => {
    // close fires after error, reconnection handled there
    console.error('[bridge] WebSocket error:', err.message);
  });
}

function shutdown(signal: string): void {
  console.log(`[bridge] ${signal} — shutting down`);
  running = false;
  stopHeartbeat();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try {
    ws?.close(1000, 'shutdown');
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(0), 250);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[bridge] starting angel discord gateway bridge');
console.log(`[bridge] convex passive endpoint: ${PASSIVE_ENDPOINT}`);
if (BRIDGE_SECRET) console.log('[bridge] DISCORD_BRIDGE_SECRET configured');
console.log(
  `[bridge] listen channels: ${
    LISTEN_CHANNELS.size === 0 ? '(none — mention/DM/reply only)' : [...LISTEN_CHANNELS].join(', ')
  }`,
);
connect();
