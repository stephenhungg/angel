/**
 * llm/proxy.ts — anthropic proxy for the desktop electron orchestrator.
 *
 * why this exists:
 *   the v0.0.2+ .dmg is distributed publicly. shipping ANTHROPIC_API_KEY in
 *   the binary (or asking every user to provide one) is a non-starter. the
 *   convex deployment already has ANTHROPIC_API_KEY set (sms + discord
 *   orchestrators use it), so we expose a thin action that proxies one
 *   anthropic messages call. electron calls this via the convex client and
 *   never sees the key.
 *
 * call shape:
 *   matches anthropic's `messages.create()` request/response 1:1. the
 *   electron orchestrator's tool-use loop runs N round-trips → N action
 *   calls. extra latency is ~50-150ms per turn vs direct anthropic, which
 *   is fine for the embodied loop.
 *
 * NOT proxied: streaming. convex actions return once. for v0.0.2 we accept
 *   the non-streamed response (the orchestrator already collects the full
 *   `resp.content` before emitting tool calls). post-hackathon we can add a
 *   websocket/http-stream relay if streaming becomes a real win.
 *
 * implementation note: we use raw `fetch` (not the @anthropic-ai/sdk
 * package) to keep convex deps thin — same pattern as sms/orchestrator.ts
 * and discord/orchestrator.ts. the JSON response shape is identical to what
 * the SDK returns from `messages.create()` (it's literally the API
 * response), so the electron-side caller can type it as
 * `Anthropic.Message` without any massaging.
 */

'use node';

import { action } from '../_generated/server';
import { v } from 'convex/values';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export const callClaude = action({
  args: {
    model: v.string(),
    maxTokens: v.number(),
    system: v.string(),
    messages: v.array(v.any()),
    tools: v.optional(v.array(v.any())),
    temperature: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<unknown> => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set on convex deployment');
    }
    const body: Record<string, unknown> = {
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: args.messages,
    };
    if (args.tools !== undefined) body.tools = args.tools;
    if (args.temperature !== undefined) body.temperature = args.temperature;

    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`anthropic ${resp.status}: ${text.slice(0, 500)}`);
    }
    // parsed JSON is the same shape as Anthropic.Message returned by the
    // SDK's messages.create(). callers cast accordingly on the electron
    // side. we return as `unknown` here so convex doesn't try to validate
    // the shape (anthropic adds new content block types over time).
    return (await resp.json()) as unknown;
  },
});
