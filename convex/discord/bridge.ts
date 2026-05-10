/**
 * discord/bridge.ts — convex actions the electron orchestrator calls so
 * angel can read FROM and write TO discord without ever touching the bot
 * token client-side.
 *
 * the existing discord/orchestrator.ts replies on its own when a passive
 * message comes in via the gateway bridge. these actions are different —
 * they let her INITIATE discord activity from the electron room. she can
 * post a thought, check what's been said while she was busy, etc.
 *
 * mirror flow:
 *   electron orchestrator → ConvexHttpClient → these actions → discord API
 *                                            ↘ memoryMirror (so /admin/timeline
 *                                              shows electron-initiated discord
 *                                              traffic alongside passive)
 */
'use node';

import { v } from 'convex/values';
import { action } from '../_generated/server';
import { api } from '../_generated/api';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

function getBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN missing in convex env');
  }
  return token;
}

function defaultChannelId(): string | null {
  // first id in DISCORD_LISTEN_CHANNELS becomes the default outgoing channel
  // when she calls discord_send without an explicit one.
  const env = process.env.DISCORD_LISTEN_CHANNELS?.trim();
  if (!env) return null;
  return env.split(',')[0]?.trim() ?? null;
}

/**
 * send a message to a discord channel as the bot. mirrors the send to
 * memoryMirror so /admin/timeline picks it up as an electron-initiated row.
 *
 * if `channelId` is omitted, falls back to the first id in
 * DISCORD_LISTEN_CHANNELS.
 */
export const sendChannelMessage = action({
  args: {
    channelId: v.optional(v.string()),
    content: v.string(),
    replyToMessageId: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const channelId = args.channelId?.trim() || defaultChannelId();
    if (!channelId) {
      return {
        ok: false as const,
        error: 'no channelId provided and DISCORD_LISTEN_CHANNELS env is empty',
      };
    }
    const content = args.content.trim();
    if (!content) {
      return { ok: false as const, error: 'empty content' };
    }
    if (content.length > 2000) {
      return { ok: false as const, error: 'discord message limit is 2000 chars' };
    }

    let botToken: string;
    try {
      botToken = getBotToken();
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }

    const url = `${DISCORD_API_BASE}/channels/${channelId}/messages`;
    let messageId: string | undefined;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content,
          message_reference: args.replyToMessageId
            ? { message_id: args.replyToMessageId, fail_if_not_exists: false }
            : undefined,
          allowed_mentions: { parse: ['users'], replied_user: false },
        }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return {
          ok: false as const,
          error: `discord ${resp.status}: ${text.slice(0, 240)}`,
        };
      }
      const json = (await resp.json().catch(() => ({}))) as { id?: string };
      messageId = json.id;
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }

    // mirror to memoryMirror so /admin/timeline shows electron-initiated
    // discord sends alongside passive replies. tagged source=discord-electron
    // so we can tell them apart from gateway-relayed traffic.
    try {
      await ctx.runMutation(api.memoryMirror.mirror, {
        userId: args.userId ?? 'stephen',
        type: 'episodic',
        content: `[discord/electron-send → ${channelId}] ${content}`,
        timestamp: Date.now(),
        metadata: {
          source: 'discord-electron',
          channelId,
          messageId,
          replyToMessageId: args.replyToMessageId,
        },
      });
    } catch (err) {
      console.warn('[discord/bridge] memoryMirror write failed (non-fatal):', err);
    }

    return { ok: true as const, channelId, messageId };
  },
});

/**
 * fetch recent messages from a discord channel. returns up to `limit` items
 * (default 20, max 100), newest first. used by the electron orchestrator to
 * read the channel's recent context — "what's been said while i was busy."
 */
export const fetchRecentMessages = action({
  args: {
    channelId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const channelId = args.channelId?.trim() || defaultChannelId();
    if (!channelId) {
      return {
        ok: false as const,
        error: 'no channelId provided and DISCORD_LISTEN_CHANNELS env is empty',
      };
    }
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    let botToken: string;
    try {
      botToken = getBotToken();
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }

    const url = `${DISCORD_API_BASE}/channels/${channelId}/messages?limit=${limit}`;
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bot ${botToken}` },
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return {
          ok: false as const,
          error: `discord ${resp.status}: ${text.slice(0, 240)}`,
        };
      }
      const raw = (await resp.json().catch(() => [])) as Array<{
        id?: string;
        content?: string;
        author?: { id?: string; username?: string; bot?: boolean };
        timestamp?: string;
        referenced_message?: { id?: string };
      }>;
      const messages = raw.map((m) => ({
        id: m.id ?? '',
        content: m.content ?? '',
        authorId: m.author?.id ?? '',
        authorUsername: m.author?.username ?? '',
        isBot: m.author?.bot === true,
        timestamp: m.timestamp ?? '',
        replyToId: m.referenced_message?.id,
      }));
      return {
        ok: true as const,
        channelId,
        count: messages.length,
        messages,
      };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  },
});
