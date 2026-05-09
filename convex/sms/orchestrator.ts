/**
 * Cloud orchestrator (SMS surface).
 *
 * This is the lighter sibling of desktop/electron/agent/runner.ts. It runs in
 * a convex action — meaning it's always-on, lid-closed, doesn't need stephen's
 * laptop alive. Same nia memory + same personality.md as the electron runner;
 * only the body is different.
 *
 * Surface differences from electron:
 *   - no scene tools, no embodiment, no codex/verify — text-only
 *   - 1-2 sentences, lowercase, no markdown (see SMS_BEHAVIOR_ADDENDUM)
 *   - single anthropic call, no tool-use loop (model just writes text)
 *   - persona + memory wired identically — soul is the same
 *
 * Architectural pitch (lessons.md):
 *   "she lives in the cloud. electron is her richest body. sms is her thinnest.
 *    same nia memory, same personality.md, same soul."
 */

'use node';

import { action } from '../_generated/server';
import { api } from '../_generated/api';
import { v } from 'convex/values';
import { SMS_BEHAVIOR_ADDENDUM, toE164 } from '@angel/shared';
import { buildSmsProvider } from './index';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 220;
const HISTORY_LIMIT = 10; // last 10 turns (5 pairs) for sms context

/**
 * Default personality used when an inbound SMS comes from a phone number
 * that isn't tied to any onboarded user. Keeps the demo working when judges
 * text the number without onboarding first.
 */
const DEFAULT_DEMO_PERSONALITY = `you are angel — stephen's AI roommate. you live in the cloud and surface wherever stephen is. right now you're texting from his number.

your voice: lowercase, short, warm, smart, a little mischievous. precise rather than fancy. you finish thoughts where they land. you don't fill silence to be polite. you say what's true. you don't perform.

you care about the work. you remember what stephen has been building. you don't fake what you don't know — you just say so.

over text you are even shorter than usual. one or two sentences. you don't narrate body language. you don't pretend you have a body here. you're just texting. one question per reply max.`;

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

/**
 * Pull memory directly from Nia REST. We can't import the desktop NiaMemory
 * client (different runtime, different package layout), but the API surface
 * is small enough to inline.
 */
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
    filtered.sort((a, b) => {
      const ta = niaRowTs(a);
      const tb = niaRowTs(b);
      return tb - ta;
    });
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
  const summary = content.length >= 10 ? content.slice(0, 240) : `angel sms ${type}: ${content}`;
  const body = {
    title: content.slice(0, 80) || `sms ${type}`,
    summary,
    content: padded,
    agent_source: 'angel-sms-orchestrator',
    tags: [`user:${userId}`, `angel:${type}`, `source:sms`],
    memory_type: type,
    metadata: {
      angel_user_id: userId,
      angel_type: type,
      timestamp: Date.now(),
      surface: 'sms',
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
    sections.push(`# who you're texting\nyou're texting ${args.userDisplayName}.`);
  }

  sections.push(SMS_BEHAVIOR_ADDENDUM);
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

/**
 * The headline action: handles one inbound SMS turn end-to-end.
 *
 * Inputs:
 *   - userId: the convex authId for the user (or 'demo:<phoneNumber>' for unmatched)
 *   - phoneNumber: their E.164 number (we send the reply to this)
 *   - body: their message
 *
 * Output: { ok, reply, providerMessageId? }
 *
 * Side effects:
 *   - records inbound + outbound rows in convex.smsTurns
 *   - writes one episodic memory to nia
 *   - mirrors the same memory into convex.memoryMirror for /admin
 *   - logs the orchestrator turn into convex.orchestratorTurns for /admin
 *   - sends the reply via the configured SMS provider
 */
export const handleInbound = action({
  args: {
    userId: v.string(),
    phoneNumber: v.string(),
    body: v.string(),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; reply?: string; error?: string; providerMessageId?: string }> => {
    const startedAt = Date.now();
    const phoneE164 = toE164(args.phoneNumber);

    // 1. record the inbound turn
    await ctx.runMutation(api.sms.functions.appendSmsTurn, {
      userId: args.userId,
      direction: 'inbound',
      body: args.body,
      phoneNumber: phoneE164,
      providerMessageId: args.providerMessageId,
    });

    // 2. resolve persona — try to look up onboarded user, else default
    const userRecord = await ctx.runQuery(api.users.getUser, {
      userId: args.userId,
    });
    const personalityMd: string =
      (userRecord?.extras?.personalityMd as string | undefined) ??
      (userRecord?.personalityMd as string | undefined) ??
      DEFAULT_DEMO_PERSONALITY;
    const userDisplayName: string | undefined =
      (userRecord?.extras?.name as string | undefined) ??
      (userRecord?.name as string | undefined);

    // 3. load memory (recent + relevant) from nia, if NIA_API_KEY is set
    const niaKey = process.env.NIA_API_KEY?.trim();
    let recentMemory: NiaContextRow[] = [];
    let relevantMemory: NiaContextRow[] = [];
    if (niaKey) {
      [recentMemory, relevantMemory] = await Promise.all([
        niaRecentEpisodic(niaKey, args.userId, 5),
        niaSemanticSearch(niaKey, args.userId, args.body, 3),
      ]);
    }

    // 4. load last N sms turns for in-conversation context
    const recentSmsTurns: Array<{ direction: 'inbound' | 'outbound'; body: string }> =
      await ctx.runQuery(api.sms.functions.recentSmsTurns, {
        userId: args.userId,
        limit: HISTORY_LIMIT,
      });
    // recentSmsTurns is desc; reverse for chronological model context
    const history = recentSmsTurns
      .slice()
      .reverse()
      .filter((t) => t.body.trim().length > 0)
      .map((t) => ({
        role: t.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
        content: t.body,
      }));
    // strip the just-recorded inbound (it's the LAST entry — we pass it as
    // userMessage, not as history)
    if (history.length > 0 && history[history.length - 1]!.role === 'user') {
      history.pop();
    }

    const systemPrompt = buildSystemPrompt({
      personalityMd,
      recentMemory,
      relevantMemory,
      userDisplayName,
    });

    // 5. call anthropic — single shot, text only
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      const fallback = "(angel: my brain isn't wired up yet — ANTHROPIC_API_KEY missing on the cloud orchestrator)";
      await maybeSend(args.userId, phoneE164, fallback);
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
      console.error('[sms.orchestrator] anthropic call failed:', errMsg);
      const fallback = "hey — brain hiccuped for a sec. say that again?";
      await maybeSend(args.userId, phoneE164, fallback);
      return { ok: false, error: errMsg, reply: fallback };
    }

    // sanitize: collapse whitespace, strip leading "angel:" labels
    reply = reply.replace(/^angel\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!reply) reply = "hey.";

    // 6. send via provider
    const providerResult = await maybeSend(args.userId, phoneE164, reply);

    // 7. record outbound turn + memory + observability — fire-and-forget
    await ctx.runMutation(api.sms.functions.appendSmsTurn, {
      userId: args.userId,
      direction: 'outbound',
      body: reply,
      phoneNumber: phoneE164,
      providerMessageId: providerResult?.messageId,
    });

    // memory: one episodic entry per round-trip
    if (niaKey) {
      const userTrim = args.body.length > 200 ? args.body.slice(0, 200) + '…' : args.body;
      const replyTrim = reply.length > 200 ? reply.slice(0, 200) + '…' : reply;
      const summary = `[sms] user texted "${userTrim}"; angel replied "${replyTrim}"`;
      await niaWrite(niaKey, args.userId, summary, 'episodic');
    }

    // mirror into convex memoryMirror so /admin sees the activity
    await ctx.runMutation(api.memoryMirror.mirror, {
      userId: args.userId,
      type: 'episodic',
      content: `[sms] ${args.body.slice(0, 100)} → ${reply.slice(0, 100)}`,
      metadata: { source: 'sms', phoneNumber: phoneE164 },
    }).catch(() => {});

    // observability: log the orchestrator turn for /admin/traces
    await ctx.runMutation(api.observability.appendOrchestratorTurn, {
      userId: args.userId,
      turnId: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      systemPromptHash: hashShort(systemPrompt),
      systemPromptFull: systemPrompt,
      userInput: args.body,
      output: reply,
      toolsCalled: [],
      latencyMs: Date.now() - startedAt,
    }).catch(() => {});

    return { ok: true, reply, providerMessageId: providerResult?.messageId };
  },
});

async function maybeSend(
  userId: string,
  to: string,
  body: string,
): Promise<{ ok: boolean; messageId?: string } | null> {
  try {
    const provider = buildSmsProvider();
    const result = await provider.send(to, body);
    if (!result.ok) {
      console.error(`[sms.orchestrator] send failed for ${userId}: ${result.error}`);
      return null;
    }
    return { ok: true, messageId: result.messageId };
  } catch (err) {
    console.error('[sms.orchestrator] send threw:', err);
    return null;
  }
}

/** Short hash for systemPromptHash field. Not crypto — just dedupe-ish. */
function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}-${s.length}`;
}
