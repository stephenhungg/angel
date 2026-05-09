/**
 * convex-bridge.ts — desktop ↔ convex realtime spine.
 *
 * exposes a thin set of typed wrappers so the rest of the electron main
 * process (orchestrator, memory adapter, room state writer) can publish
 * agent state, append turns, mirror memory, and create/update tasks
 * without touching the convex client directly.
 *
 * graceful degradation: if CONVEX_URL is unset (or initialization fails),
 * every wrapper logs a single warning and becomes a no-op returning a
 * sentinel value. callers should never branch on whether convex is wired.
 *
 * import sites (suggested for matthew):
 *   - electron/main.ts (boot)             → ensureConvex() to log status once
 *   - electron/agent/runner.ts (orch)     → appendTurn() per turn,
 *                                            createTask() / updateTask()
 *   - electron/agent/memory/nia.ts        → mirrorMemory() in `remember()`
 *   - electron/agent/tensorlake/client.ts → recordBgObservation() per result
 *   - any animation tick                  → publishAgentState({...})
 *
 * the bridge itself is read-mostly:  getRecentMemory(n) gives /admin and the
 * agent loop the same view of recent memory without going through nia.
 */

import { ConvexHttpClient } from 'convex/browser';

// ──────────────────────────────────────────────────────────────────────────
// singleton client
// ──────────────────────────────────────────────────────────────────────────

let client: ConvexHttpClient | null | undefined;
let warned = false;

function getClient(): ConvexHttpClient | null {
  if (client !== undefined) return client;
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    if (!warned) {
      // eslint-disable-next-line no-console
      console.warn(
        '[convex-bridge] CONVEX_URL not set — bridge is in no-op mode. ' +
          'set CONVEX_URL in desktop/.env.local to wire realtime spine.',
      );
      warned = true;
    }
    client = null;
    return null;
  }
  try {
    client = new ConvexHttpClient(url);
    // eslint-disable-next-line no-console
    console.log('[convex-bridge] connected to', url);
    return client;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[convex-bridge] failed to init', err);
    client = null;
    return null;
  }
}

/** call once at boot — logs whether convex is wired. */
export function ensureConvex(): boolean {
  return getClient() !== null;
}

async function safeMutation<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    // typed at the convex side; we keep the bridge surface loose so this
    // module never has to be regenerated when functions change shape.
    return (await c.mutation(name as never, args as never)) as T;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[convex-bridge] mutation ${name} failed`, err);
    return null;
  }
}

async function safeQuery<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    return (await c.query(name as never, args as never)) as T;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[convex-bridge] query ${name} failed`, err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// public wrappers — keep these names stable; they are the contract.
// ──────────────────────────────────────────────────────────────────────────

export interface AgentStatePatch {
  userId: string;
  emotion?: string;
  location?: string;
  faceExpression?: string;
  isWalking?: boolean;
  walkTarget?: string;
}

/**
 * publish a partial agent state update — debounce in the renderer (~10/sec
 * during walking; ~1/sec idle). each call is one of the four upserts under
 * the hood, so a full patch fires up to 4 mutations.
 */
export async function publishAgentState(patch: AgentStatePatch): Promise<void> {
  const { userId } = patch;
  const promises: Promise<unknown>[] = [];
  if (patch.emotion !== undefined)
    promises.push(safeMutation('agentState:setEmotion', { userId, emotion: patch.emotion }));
  if (patch.location !== undefined)
    promises.push(safeMutation('agentState:setLocation', { userId, anchorId: patch.location }));
  if (patch.faceExpression !== undefined)
    promises.push(
      safeMutation('agentState:setFaceExpression', { userId, face: patch.faceExpression }),
    );
  if (patch.isWalking !== undefined)
    promises.push(
      safeMutation('agentState:setWalkingState', {
        userId,
        isWalking: patch.isWalking,
        walkTarget: patch.walkTarget,
      }),
    );
  await Promise.all(promises);
}

export interface TurnInput {
  userId: string;
  turnId?: string;
  role: 'user' | 'angel' | 'system';
  content: string;
  emotion?: string;
  toolCalls?: Array<{ tool: string; args: unknown; result?: unknown }>;
  latencyMs?: number;
}

export async function appendTurn(t: TurnInput): Promise<string | null> {
  return await safeMutation<string>('turns:appendTurn', t as unknown as Record<string, unknown>);
}

export interface MemoryEntryInput {
  userId: string;
  type: 'episodic' | 'semantic' | 'preference' | 'observation';
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * mirror a memory write into convex. nia is the source of truth — this is
 * the read-replica for /admin and cross-device subscriptions. fire-and-forget.
 */
export async function mirrorMemory(entry: MemoryEntryInput): Promise<void> {
  await safeMutation('memoryMirror:mirror', entry as unknown as Record<string, unknown>);
}

export async function getRecentMemory(
  userId: string,
  limit = 50,
): Promise<Array<{ type: string; content: string; timestamp: number }> | null> {
  return await safeQuery('memoryMirror:recent', { userId, limit });
}

export interface CreateTaskInput {
  userId: string;
  intent: string;
  type: 'delegate' | 'browse' | 'parallel' | 'deploy' | string;
  translatedPrompt?: string;
}

export async function createTask(t: CreateTaskInput): Promise<string | null> {
  return await safeMutation<string>('tasks:createTask', t as unknown as Record<string, unknown>);
}

export interface UpdateTaskInput {
  taskId: string;
  status: 'pending' | 'running' | 'verifying' | 'success' | 'failed' | string;
  output?: { summary: string; evidence: string[]; artifactUrl?: string };
  error?: string;
}

export async function updateTask(u: UpdateTaskInput): Promise<void> {
  await safeMutation('tasks:updateTaskStatus', u as unknown as Record<string, unknown>);
}

export interface BgObservationInput {
  userId: string;
  kind: 'tensorlake' | 'scheduled' | 'compaction' | string;
  summary: string;
  sourceUrl?: string;
  payload?: Record<string, unknown>;
}

/** tensorlake agent calls this when bg ingestion produces a new observation. */
export async function recordBgObservation(o: BgObservationInput): Promise<void> {
  await safeMutation(
    'memoryMirror:recordBgObservation',
    o as unknown as Record<string, unknown>,
  );
}

export interface OrchestratorTurnInput {
  userId: string;
  turnId: string;
  systemPromptHash: string;
  systemPromptFull?: string;
  userInput: string;
  output: string;
  toolsCalled: unknown[];
  latencyMs: number;
}

export async function logOrchestratorTurn(t: OrchestratorTurnInput): Promise<void> {
  await safeMutation(
    'observability:appendOrchestratorTurn',
    t as unknown as Record<string, unknown>,
  );
}

/** fire a one-off heartbeat from desktop (e.g. on app focus). */
export async function recordHeartbeat(note?: string): Promise<void> {
  await safeMutation('agentState:recordHeartbeat', { source: 'desktop', note });
}

// re-export client accessor for callers that need full convex semantics
export { getClient as getConvexClient };
