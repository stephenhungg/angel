/**
 * lib/ipcEvents.ts — extended event bus for L2 events that the existing
 * `electron/preload.ts` doesn't surface yet (task:status, bg:autonomy,
 * chat:turn_complete, error).
 *
 * Why this exists:
 *   The renderer-buildout plan owns `lib/ipc.ts` (thin invoke wrappers).
 *   This file owns the *extended* events used by the conversational-agent-layer
 *   plan — subscriptions to events the mock orchestrator can simulate locally
 *   today, and that Stephen's main process can wire into the preload bridge
 *   later without changing any consumer code.
 *
 * Consumers:
 *   - lib/personaApply.ts emits BgAutonomy on claim:resolved
 *   - lib/bgAutonomy.ts subscribes to BgAutonomy
 *   - components/DeskMonitor.tsx subscribes to TaskStatus
 *   - lib/turnFsm.ts subscribes to ChatTurnComplete
 */

import type { AngelTask, Emotion } from '@angel/shared';

/* ------------------------------------------------------------------ */
/* event payload types                                                 */
/* ------------------------------------------------------------------ */

export type TaskStatusEvent = AngelTask;

export type BgAutonomyEvent = {
  /** Kind hints which queued response sequence to play. */
  kind: 'while_you_were_away' | 'heartbeat' | 'memory_callback' | string;
  payload?: Record<string, unknown>;
};

export type ChatTurnCompleteEvent = {
  turnId: string;
  role: 'user' | 'angel' | 'system';
  fullText: string;
  emotion?: Emotion;
};

export type ErrorEvent = {
  message: string;
  recoverable: boolean;
  turnId?: string;
};

export type LocalEventMap = {
  'task:status': TaskStatusEvent;
  'bg:autonomy': BgAutonomyEvent;
  'chat:turn_complete': ChatTurnCompleteEvent;
  error: ErrorEvent;
};

export type LocalEventChannel = keyof LocalEventMap;

export type Unsubscribe = () => void;

/* ------------------------------------------------------------------ */
/* the bus                                                             */
/* ------------------------------------------------------------------ */

type Handler = (payload: unknown) => void;

const bus = new Map<LocalEventChannel, Set<Handler>>();

function getChannel(channel: LocalEventChannel): Set<Handler> {
  let set = bus.get(channel);
  if (!set) {
    set = new Set();
    bus.set(channel, set);
  }
  return set;
}

export function emitLocal<C extends LocalEventChannel>(
  channel: C,
  payload: LocalEventMap[C],
): void {
  const handlers = getChannel(channel);
  for (const fn of handlers) {
    try {
      fn(payload);
    } catch (err) {
      console.warn(`[ipcEvents] handler for ${channel} threw:`, err);
    }
  }
}

export function onLocal<C extends LocalEventChannel>(
  channel: C,
  cb: (payload: LocalEventMap[C]) => void,
): Unsubscribe {
  const handlers = getChannel(channel);
  const wrapped: Handler = (p) => cb(p as LocalEventMap[C]);
  handlers.add(wrapped);
  return () => handlers.delete(wrapped);
}

/* ------------------------------------------------------------------ */
/* convenience subscribers                                             */
/* ------------------------------------------------------------------ */

export const onTaskStatus = (cb: (e: TaskStatusEvent) => void) => onLocal('task:status', cb);
export const onBgAutonomy = (cb: (e: BgAutonomyEvent) => void) => onLocal('bg:autonomy', cb);
export const onChatTurnComplete = (cb: (e: ChatTurnCompleteEvent) => void) =>
  onLocal('chat:turn_complete', cb);
export const onError = (cb: (e: ErrorEvent) => void) => onLocal('error', cb);

export const emitTaskStatus = (e: TaskStatusEvent) => emitLocal('task:status', e);
export const emitBgAutonomy = (e: BgAutonomyEvent) => emitLocal('bg:autonomy', e);
export const emitChatTurnComplete = (e: ChatTurnCompleteEvent) => emitLocal('chat:turn_complete', e);
export const emitError = (e: ErrorEvent) => emitLocal('error', e);

/* ------------------------------------------------------------------ */
/* helpers — used by App-level wiring to attach all consumers          */
/* ------------------------------------------------------------------ */

export function subscribeAllLocal(handlers: {
  onTaskStatus?: (e: TaskStatusEvent) => void;
  onBgAutonomy?: (e: BgAutonomyEvent) => void;
  onChatTurnComplete?: (e: ChatTurnCompleteEvent) => void;
  onError?: (e: ErrorEvent) => void;
}): Unsubscribe {
  const subs: Unsubscribe[] = [];
  if (handlers.onTaskStatus) subs.push(onTaskStatus(handlers.onTaskStatus));
  if (handlers.onBgAutonomy) subs.push(onBgAutonomy(handlers.onBgAutonomy));
  if (handlers.onChatTurnComplete) subs.push(onChatTurnComplete(handlers.onChatTurnComplete));
  if (handlers.onError) subs.push(onError(handlers.onError));
  return () => subs.forEach((u) => u());
}
