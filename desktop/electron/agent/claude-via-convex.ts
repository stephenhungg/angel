/**
 * claude-via-convex.ts — proxy claude calls through the convex deployment.
 *
 * the v0.0.2+ .dmg ships without ANTHROPIC_API_KEY. instead it points at
 * the production convex deployment (CONVEX_URL is hardcoded in main.ts /
 * .env), and convex holds the anthropic key. one action call ≈ one
 * `messages.create()`. tool-use loops drive multiple action calls.
 *
 * the response shape is byte-for-byte the same JSON anthropic returns —
 * which is exactly what the @anthropic-ai/sdk's `messages.create()` resolves
 * to. callers can treat this as `Anthropic.Message`.
 *
 * fallback: if CONVEX_URL is unset OR the action call throws, we surface
 * the error to the caller (runner.ts) which already drops to the mock
 * orchestrator on any anthropic-side failure.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type Anthropic from '@anthropic-ai/sdk';

let _client: ConvexHttpClient | null | undefined;

function getClient(): ConvexHttpClient | null {
  if (_client !== undefined) return _client;
  const url =
    process.env.CONVEX_URL?.trim() ?? process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    _client = null;
    return null;
  }
  try {
    _client = new ConvexHttpClient(url);
    return _client;
  } catch (err) {
    console.warn('[claude-via-convex] failed to init convex client:', err);
    _client = null;
    return null;
  }
}

export interface ClaudeCallParams {
  model: string;
  maxTokens: number;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  temperature?: number;
}

/**
 * call claude via the convex proxy action. resolves to the anthropic
 * messages.create response shape (Anthropic.Message). throws on any error
 * — caller is responsible for graceful fallback.
 */
export async function claudeViaConvex(
  params: ClaudeCallParams,
): Promise<Anthropic.Message> {
  const c = getClient();
  if (!c) {
    throw new Error(
      'CONVEX_URL not set — cannot proxy claude call. set CONVEX_URL or ANTHROPIC_API_KEY in the desktop env.',
    );
  }
  const result = await c.action(api.llm.proxy.callClaude, {
    model: params.model,
    maxTokens: params.maxTokens,
    system: params.system,
    messages: params.messages as unknown[],
    tools: params.tools as unknown[] | undefined,
    temperature: params.temperature,
  });
  // the convex action returns the raw anthropic JSON response, which has
  // the same shape as Anthropic.Message. cast directly.
  return result as Anthropic.Message;
}

/** quick check used by runner.ts to decide proxy mode availability. */
export function convexProxyAvailable(): boolean {
  return getClient() !== null;
}
