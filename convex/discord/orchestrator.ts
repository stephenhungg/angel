/**
 * Cloud orchestrator (Discord surface).
 *
 * Sibling of convex/sms/orchestrator.ts. Same structure, same memory wiring,
 * same anthropic call — the only differences:
 *   - reads/writes discordTurns instead of smsTurns
 *   - sends the reply via the Discord followup webhook (not twilio/sendblue)
 *   - splices DISCORD_BEHAVIOR_ADDENDUM (markdown ok, ~500 char) instead of
 *     SMS_BEHAVIOR_ADDENDUM
 *
 * Runs deferred: the http handler responds with type 5 (DEFERRED ...) within
 * 3s, then schedules this action. We have up to 15min on the interaction
 * token to send the followup. ~5s is the typical end-to-end here.
 */

'use node';

import { action } from '../_generated/server';
import { api } from '../_generated/api';
import { v } from 'convex/values';
import { DISCORD_BEHAVIOR_ADDENDUM } from '@angel/shared';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 320; // discord allows a tad more than sms (~500 char target)
const HISTORY_LIMIT = 10; // last 10 discord turns for in-channel context
const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Default personality used when an inbound interaction comes from a Discord
 * user id that isn't tied to any onboarded user. Lets judges run `/angel`
 * without onboarding first.
 */
const DEFAULT_DEMO_PERSONALITY = `you are angel — stephen's AI roommate. you live in the cloud and surface wherever stephen is. right now you're replying to a slash command on discord.

your voice: lowercase, short, warm, smart, a little mischievous. precise rather than fancy. you finish thoughts where they land. you don't fill silence to be polite. you say what's true. you don't perform.

you care about the work. you remember what stephen has been building. you don't fake what you don't know — you just say so.

over discord you stay short. one to three sentences usually. you don't narrate body language. you don't pretend you have a body in this channel. you're just chatting. one question per reply max.`;

interface NiaContextRow {
  id: string;
  user_id?: string;
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  agent_source?: string;
  created_at?: string;
  memory_type?: 'scratchpad' | 'episodic' | 'fact' | 'procedural';
  metadata?: Record<string, unknown>;
}

interface SemanticSearchResponse {
  results?: NiaContextRow[];
}

interface ListContextsResponse {
  items?: NiaContextRow[];
  contexts?: NiaContextRow[];
}

/* ----------------------- nia helpers (mirror of sms/orchestrator) ---------- */

async function niaSemanticSearch(
  apiKey: string,
  userId: string,
  query: string,
  limit: number,
): Promise<NiaContextRow[]> {
  const baseUrl = process.env.NIA_BASE_URL?.trim() || 'https://apigcp.trynia.ai/v2';
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(Math.max(1, Math.min(20, limit))));
  params.set('include_highlights', 'false');
  try {
    const resp = await fetch(`${baseUrl}/contexts/semantic-search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as SemanticSearchResponse;
    return (json.results ?? []).filter((r) => {
      const tagged = (r.tags ?? []).includes(`user:${userId}`);
      const meta = (r.metadata?.angel_user_id as string | undefined) === userId;
      return tagged || meta;
    });
  } catch {
    return [];
  }
}

async function niaRecentEpisodic(
  apiKey: string,
  userId: string,
  limit: number,
): Promise<NiaContextRow[]> {
  const baseUrl = process.env.NIA_BASE_URL?.trim() || 'https://apigcp.trynia.ai/v2';
  const params = new URLSearchParams();
  params.set('limit', String(Math.max(1, Math.min(20, limit))));
  params.set('memory_type', 'episodic');
  try {
    const resp = await fetch(`${baseUrl}/contexts?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as ListContextsResponse;
    const rows = json.items ?? json.contexts ?? [];
    const filtered = rows.filter((r) => {
      const tagged = (r.tags ?? []).includes(`user:${userId}`);
      const meta = (r.metadata?.angel_user_id as string | undefined) === userId;
      return tagged || meta;
    });
    filtered.sort((a, b) => niaRowTs(b) - niaRowTs(a));
    return filtered.slice(0, limit);
  } catch {
    return [];
  }
}

function niaRowTs(row: NiaContextRow): number {
  const md = row.metadata ?? {};
  if (typeof md.timestamp === 'number') return md.timestamp;
  if (row.created_at) {
    const t = Date.parse(row.created_at);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function stripPad(s: string): string {
  return s.replace(/\s*\[angel:[^\]]+\]\s*$/, '').trim();
}

async function niaWrite(
  apiKey: string,
  userId: string,
  content: string,
  type: 'episodic' | 'fact' | 'scratchpad',
): Promise<void> {
  const baseUrl = process.env.NIA_BASE_URL?.trim() || 'https://apigcp.trynia.ai/v2';
  const padded =
    content.length >= 50 ? content : `${content}  [angel:${type}@${Date.now()}]`;
  const summary = content.length >= 10 ? content.slice(0, 240) : `angel discord ${type}: ${content}`;
  const body = {
    title: content.slice(0, 80) || `discord ${type}`,
    summary,
    content: padded,
    agent_source: 'angel-discord-orchestrator',
    tags: [`user:${userId}`, `angel:${type}`, `source:discord`],
    memory_type: type,
    metadata: {
      angel_user_id: userId,
      angel_type: type,
      timestamp: Date.now(),
      surface: 'discord',
    },
  };
  try {
    await fetch(`${baseUrl}/contexts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // never block on memory write
  }
}

/* ----------------------- prompt + anthropic -------------------------------- */

function buildSystemPrompt(args: {
  personalityMd: string;
  recentMemory: NiaContextRow[];
  relevantMemory: NiaContextRow[];
  userDisplayName?: string;
}): string {
  const sections: string[] = [];
  sections.push('# who you are\n' + args.personalityMd.trim());

  const memBlocks: string[] = [];
  if (args.relevantMemory.length > 0) {
    memBlocks.push('## relevant to what they just said');
    for (const r of args.relevantMemory) {
      const c = stripPad(r.content ?? r.summary ?? '');
      if (c) memBlocks.push(`- ${c}`);
    }
  }
  if (args.recentMemory.length > 0) {
    memBlocks.push('');
    memBlocks.push('## recent shared history');
    for (const r of args.recentMemory) {
      const c = stripPad(r.content ?? r.summary ?? '');
      if (c) memBlocks.push(`- ${c}`);
    }
  }
  if (memBlocks.length > 0) {
    sections.push(
      '# memory\n' +
        '# things you remember about this person. weave naturally — never quote, never cite as memory.\n' +
        memBlocks.join('\n'),
    );
  }

  if (args.userDisplayName) {
    sections.push(`# who you're talking to\nyou're chatting with ${args.userDisplayName} on discord.`);
  }

  sections.push(DISCORD_BEHAVIOR_ADDENDUM);
  return sections.join('\n\n');
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

async function callAnthropic(args: {
  apiKey: string;
  systemPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
}): Promise<string> {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: args.systemPrompt,
    messages: [
      ...args.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: args.userMessage },
    ],
  };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`anthropic ${resp.status}: ${text.slice(0, 240)}`);
  }
  const json = (await resp.json()) as { content?: AnthropicTextBlock[] };
  const blocks = json.content ?? [];
  return blocks
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();
}

/* ----------------------- discord followup ---------------------------------- */

/**
 * Send a followup message after a deferred ack. Discord's webhook URL is:
 *   POST /webhooks/{application_id}/{interaction_token}
 *
 * The interaction_token is valid for 15 minutes. No bot token needed —
 * the token IS the auth.
 */
async function sendDiscordFollowup(args: {
  applicationId: string;
  interactionToken: string;
  content: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const url = `${DISCORD_API_BASE}/webhooks/${args.applicationId}/${args.interactionToken}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: args.content }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `discord ${resp.status}: ${text.slice(0, 240)}` };
    }
    const json = (await resp.json().catch(() => ({}))) as { id?: string };
    return { ok: true, messageId: json.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Edit the original deferred response (used as a fallback if followup fails).
 *   PATCH /webhooks/{application_id}/{interaction_token}/messages/@original
 */
async function editOriginalDiscordResponse(args: {
  applicationId: string;
  interactionToken: string;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = `${DISCORD_API_BASE}/webhooks/${args.applicationId}/${args.interactionToken}/messages/@original`;
  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: args.content }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `discord ${resp.status}: ${text.slice(0, 240)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/* ----------------------- the headline action ------------------------------- */

/**
 * Handle one Discord slash-command interaction end-to-end.
 *
 * Inputs:
 *   - userId: the convex authId resolved from discordUserId, or
 *     'demo:discord:<discordUserId>' for unmatched (judge demo path)
 *   - applicationId: discord app id (used in the followup URL)
 *   - interactionToken: discord interaction token (15-min validity)
 *   - discordUserId: the human's snowflake id
 *   - body: the `message` argument they passed to /angel
 *
 * Output: { ok, reply?, error? }
 *
 * Side effects:
 *   - records inbound + outbound rows in convex.discordTurns
 *   - writes one episodic memory to nia (if NIA_API_KEY is set)
 *   - mirrors the same memory into convex.memoryMirror for /admin
 *   - logs the orchestrator turn into convex.orchestratorTurns for /admin
 *   - posts the reply via the discord followup webhook
 */
export const handleInteraction = action({
  args: {
    userId: v.string(),
    applicationId: v.string(),
    interactionToken: v.string(),
    discordUserId: v.string(),
    discordUsername: v.optional(v.string()),
    discordChannelId: v.optional(v.string()),
    discordGuildId: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; reply?: string; error?: string }> => {
    const startedAt = Date.now();

    // 1. record inbound
    await ctx.runMutation(api.discord.functions.appendDiscordTurn, {
      userId: args.userId,
      direction: 'inbound',
      body: args.body,
      discordUserId: args.discordUserId,
      discordChannelId: args.discordChannelId,
      discordGuildId: args.discordGuildId,
      interactionToken: args.interactionToken,
    });

    // 2. resolve persona
    const userRecord = await ctx.runQuery(api.users.getUser, {
      userId: args.userId,
    });
    const personalityMd: string =
      (userRecord?.extras?.personalityMd as string | undefined) ??
      (userRecord?.personalityMd as string | undefined) ??
      DEFAULT_DEMO_PERSONALITY;
    const userDisplayName: string | undefined =
      (userRecord?.extras?.name as string | undefined) ??
      (userRecord?.name as string | undefined) ??
      args.discordUsername;

    // 3. memory: nia recent + relevant
    const niaKey = process.env.NIA_API_KEY?.trim();
    let recentMemory: NiaContextRow[] = [];
    let relevantMemory: NiaContextRow[] = [];
    if (niaKey) {
      [recentMemory, relevantMemory] = await Promise.all([
        niaRecentEpisodic(niaKey, args.userId, 5),
        niaSemanticSearch(niaKey, args.userId, args.body, 3),
      ]);
    }

    // 4. last N discord turns for in-conversation context
    const recentDiscordTurns: Array<{ direction: 'inbound' | 'outbound'; body: string }> =
      await ctx.runQuery(api.discord.functions.recentDiscordTurns, {
        userId: args.userId,
        limit: HISTORY_LIMIT,
      });
    const history = recentDiscordTurns
      .slice()
      .reverse()
      .filter((t) => t.body.trim().length > 0)
      .map((t) => ({
        role: t.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
        content: t.body,
      }));
    // strip the just-recorded inbound (we pass it as userMessage explicitly)
    if (history.length > 0 && history[history.length - 1]!.role === 'user') {
      history.pop();
    }

    const systemPrompt = buildSystemPrompt({
      personalityMd,
      recentMemory,
      relevantMemory,
      userDisplayName,
    });

    // 5. anthropic
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      const fallback =
        "(angel: my brain isn't wired up yet — `ANTHROPIC_API_KEY` missing on the cloud orchestrator)";
      await sendOrEdit(args.applicationId, args.interactionToken, fallback);
      return { ok: false, error: 'ANTHROPIC_API_KEY missing', reply: fallback };
    }

    let reply: string;
    try {
      reply = await callAnthropic({
        apiKey,
        systemPrompt,
        history,
        userMessage: args.body,
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error('[discord.orchestrator] anthropic call failed:', errMsg);
      const fallback = "hey — brain hiccuped for a sec. say that again?";
      await sendOrEdit(args.applicationId, args.interactionToken, fallback);
      return { ok: false, error: errMsg, reply: fallback };
    }

    // sanitize: collapse whitespace, strip leading "angel:" labels, hard cap
    reply = reply.replace(/^angel\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!reply) reply = 'hey.';
    if (reply.length > 1900) reply = reply.slice(0, 1900); // discord hard limit is 2000

    // 6. send followup (or edit-original as fallback)
    const sendResult = await sendOrEdit(
      args.applicationId,
      args.interactionToken,
      reply,
    );

    // 7. record outbound + memory + observability
    await ctx.runMutation(api.discord.functions.appendDiscordTurn, {
      userId: args.userId,
      direction: 'outbound',
      body: reply,
      discordUserId: args.discordUserId,
      discordChannelId: args.discordChannelId,
      discordGuildId: args.discordGuildId,
      interactionToken: args.interactionToken,
    });

    if (niaKey) {
      const userTrim = args.body.length > 200 ? args.body.slice(0, 200) + '…' : args.body;
      const replyTrim = reply.length > 200 ? reply.slice(0, 200) + '…' : reply;
      const summary = `[discord] user said "${userTrim}"; angel replied "${replyTrim}"`;
      await niaWrite(niaKey, args.userId, summary, 'episodic');
    }

    await ctx
      .runMutation(api.memoryMirror.mirror, {
        userId: args.userId,
        type: 'episodic',
        content: `[discord] ${args.body.slice(0, 100)} → ${reply.slice(0, 100)}`,
        metadata: { source: 'discord', discordUserId: args.discordUserId },
      })
      .catch(() => {});

    await ctx
      .runMutation(api.observability.appendOrchestratorTurn, {
        userId: args.userId,
        turnId: `discord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemPromptHash: hashShort(systemPrompt),
        systemPromptFull: systemPrompt,
        userInput: args.body,
        output: reply,
        toolsCalled: [],
        latencyMs: Date.now() - startedAt,
      })
      .catch(() => {});

    return { ok: sendResult.ok, reply, error: sendResult.error };
  },
});

/**
 * Deferred ack means discord is showing "<bot> is thinking…" — we want to
 * REPLACE that, not stack a second message. The right call is followup
 * (which converts the thinking message into the reply). If that fails for
 * any reason (token expired, etc), we fall back to PATCH @original.
 */
async function sendOrEdit(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const followup = await sendDiscordFollowup({
    applicationId,
    interactionToken,
    content,
  });
  if (followup.ok) return followup;
  console.error('[discord.orchestrator] followup failed, trying edit-original:', followup.error);
  const edit = await editOriginalDiscordResponse({
    applicationId,
    interactionToken,
    content,
  });
  return edit.ok ? edit : { ok: false, error: followup.error ?? edit.error };
}

/** Short hash for systemPromptHash field. Not crypto — just dedupe-ish. */
function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}-${s.length}`;
}

/* ----------------------- passive (gateway bridge) -------------------------- */

/**
 * Post a normal channel message via the Discord REST API. Used by the passive
 * message handler — unlike slash commands, gateway-relayed messages have no
 * interaction token, so we authenticate with the bot token.
 *
 * If `replyToId` is provided we make this a Discord "reply" so the response
 * threads under the user's message in clients (chat-style affordance).
 */
async function postChannelMessage(args: {
  botToken: string;
  channelId: string;
  content: string;
  replyToId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const url = `${DISCORD_API_BASE}/channels/${args.channelId}/messages`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${args.botToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content: args.content,
        message_reference: args.replyToId
          ? { message_id: args.replyToId, fail_if_not_exists: false }
          : undefined,
        allowed_mentions: { parse: ['users'], replied_user: false },
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, error: `discord ${resp.status}: ${text.slice(0, 240)}` };
    }
    const json = (await resp.json().catch(() => ({}))) as { id?: string };
    return { ok: true, messageId: json.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Handle a passive Discord message (came in via the gateway WebSocket bridge,
 * not via a slash command). Same orchestrator pipeline as `handleInteraction`
 * — memory load, anthropic call, transcript + memory write — but the reply is
 * sent via `POST /channels/{id}/messages` using the bot token instead of the
 * interaction followup webhook.
 *
 * Inputs (from the bridge):
 *   - userId: convex authId resolved from discordUserId, or 'demo:discord:<id>'
 *   - discordUserId / username for context
 *   - channelId / guildId from the gateway event
 *   - body: the message content (bot mention already stripped by the bridge)
 *   - trigger: why we decided to respond (mention | dm | reply_to_bot | etc)
 *   - replyToMessageId: discord message id to reply to (chat affordance)
 *
 * Output: { ok, reply?, error? }
 *
 * Side effects: same as `handleInteraction` — discordTurns rows, nia memory
 * write, memoryMirror, observability log, plus a posted Discord message.
 */
export const handlePassiveMessage = action({
  args: {
    userId: v.string(),
    discordUserId: v.string(),
    discordUsername: v.optional(v.string()),
    discordChannelId: v.string(),
    discordGuildId: v.optional(v.string()),
    body: v.string(),
    trigger: v.string(),
    replyToMessageId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; reply?: string; error?: string }> => {
    const startedAt = Date.now();

    const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
    if (!botToken) {
      return { ok: false, error: 'DISCORD_BOT_TOKEN missing on convex deployment' };
    }

    // 1. record inbound
    await ctx.runMutation(api.discord.functions.appendDiscordTurn, {
      userId: args.userId,
      direction: 'inbound',
      body: args.body,
      discordUserId: args.discordUserId,
      discordChannelId: args.discordChannelId,
      discordGuildId: args.discordGuildId,
    });

    // 2. resolve persona
    const userRecord = await ctx.runQuery(api.users.getUser, {
      userId: args.userId,
    });
    const personalityMd: string =
      (userRecord?.extras?.personalityMd as string | undefined) ??
      (userRecord?.personalityMd as string | undefined) ??
      DEFAULT_DEMO_PERSONALITY;
    const userDisplayName: string | undefined =
      (userRecord?.extras?.name as string | undefined) ??
      (userRecord?.name as string | undefined) ??
      args.discordUsername;

    // 3. memory: nia recent + relevant
    const niaKey = process.env.NIA_API_KEY?.trim();
    let recentMemory: NiaContextRow[] = [];
    let relevantMemory: NiaContextRow[] = [];
    if (niaKey) {
      [recentMemory, relevantMemory] = await Promise.all([
        niaRecentEpisodic(niaKey, args.userId, 5),
        niaSemanticSearch(niaKey, args.userId, args.body, 3),
      ]);
    }

    // 4. last N discord turns for in-conversation context
    const recentDiscordTurns: Array<{ direction: 'inbound' | 'outbound'; body: string }> =
      await ctx.runQuery(api.discord.functions.recentDiscordTurns, {
        userId: args.userId,
        limit: HISTORY_LIMIT,
      });
    const history = recentDiscordTurns
      .slice()
      .reverse()
      .filter((t) => t.body.trim().length > 0)
      .map((t) => ({
        role: t.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
        content: t.body,
      }));
    if (history.length > 0 && history[history.length - 1]!.role === 'user') {
      history.pop();
    }

    const systemPrompt = buildSystemPrompt({
      personalityMd,
      recentMemory,
      relevantMemory,
      userDisplayName,
    });

    // 5. anthropic
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      const fallback =
        "(angel: my brain isn't wired up yet — `ANTHROPIC_API_KEY` missing on the cloud orchestrator)";
      await postChannelMessage({
        botToken,
        channelId: args.discordChannelId,
        content: fallback,
        replyToId: args.replyToMessageId,
      });
      return { ok: false, error: 'ANTHROPIC_API_KEY missing', reply: fallback };
    }

    let reply: string;
    try {
      reply = await callAnthropic({
        apiKey,
        systemPrompt,
        history,
        userMessage: args.body,
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error('[discord.orchestrator/passive] anthropic call failed:', errMsg);
      const fallback = 'hey — brain hiccuped for a sec. say that again?';
      await postChannelMessage({
        botToken,
        channelId: args.discordChannelId,
        content: fallback,
        // intentionally NOT replying-to — feels more conversational
      });
      return { ok: false, error: errMsg, reply: fallback };
    }

    // sanitize: same rules as the slash command path
    reply = reply.replace(/^angel\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!reply) reply = 'hey.';
    if (reply.length > 1900) reply = reply.slice(0, 1900);

    // 6. post via REST (bot token) — NO reply threading, just a normal message in chat
    const sendResult = await postChannelMessage({
      botToken,
      channelId: args.discordChannelId,
      content: reply,
      // intentionally NOT replying-to — feels more conversational, like she's texting
    });
    if (!sendResult.ok) {
      console.error('[discord.orchestrator/passive] post failed:', sendResult.error);
    }

    // 7. record outbound + memory + observability (mirror of handleInteraction)
    await ctx.runMutation(api.discord.functions.appendDiscordTurn, {
      userId: args.userId,
      direction: 'outbound',
      body: reply,
      discordUserId: args.discordUserId,
      discordChannelId: args.discordChannelId,
      discordGuildId: args.discordGuildId,
    });

    if (niaKey) {
      const userTrim = args.body.length > 200 ? args.body.slice(0, 200) + '…' : args.body;
      const replyTrim = reply.length > 200 ? reply.slice(0, 200) + '…' : reply;
      const summary = `[discord:${args.trigger}] user said "${userTrim}"; angel replied "${replyTrim}"`;
      await niaWrite(niaKey, args.userId, summary, 'episodic');
    }

    await ctx
      .runMutation(api.memoryMirror.mirror, {
        userId: args.userId,
        type: 'episodic',
        content: `[discord:${args.trigger}] ${args.body.slice(0, 100)} → ${reply.slice(0, 100)}`,
        metadata: {
          source: 'discord-passive',
          trigger: args.trigger,
          discordUserId: args.discordUserId,
          discordChannelId: args.discordChannelId,
        },
      })
      .catch(() => {});

    await ctx
      .runMutation(api.observability.appendOrchestratorTurn, {
        userId: args.userId,
        turnId: `discord-passive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemPromptHash: hashShort(systemPrompt),
        systemPromptFull: systemPrompt,
        userInput: args.body,
        output: reply,
        toolsCalled: [],
        latencyMs: Date.now() - startedAt,
      })
      .catch(() => {});

    return { ok: sendResult.ok, reply, error: sendResult.error };
  },
});

/*
 * ──────────────────────────────────────────────────────────────────────────
 * one-time slash command registration (run from your laptop, NOT at runtime)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Register /angel as a global command for your Discord application:
 *
 *   curl -X POST "https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands" \
 *     -H "Authorization: Bot ${DISCORD_BOT_TOKEN}" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "name": "angel",
 *       "description": "Talk to your angel",
 *       "options": [{
 *         "type": 3,
 *         "name": "message",
 *         "description": "What you want to say",
 *         "required": true
 *       }]
 *     }'
 *
 * Global commands can take up to ~1 hour to propagate. For instant testing
 * inside a single guild, swap `/applications/{app}/commands` with
 * `/applications/{app}/guilds/{guild}/commands`.
 */
