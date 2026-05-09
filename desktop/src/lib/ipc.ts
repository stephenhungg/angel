import type { SceneAction, SceneActionComplete, ClaimTokenPayload } from '@angel/shared';

/**
 * Typed wrapper around the preload `window.angel` bridge. Anywhere in the
 * renderer that wants to talk to the main process should import from here,
 * not touch `window.angel` directly.
 *
 * In dev/SSR/storybook builds where preload didn't run, every call becomes a
 * no-op + console warn so component code can still mount.
 *
 * For the local-only event bus (task:status, bg:autonomy, chat:turn_complete,
 * error) see `lib/ipcEvents.ts`.
 */

type AngelBridge = Window['angel'];

function isAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { angel?: AngelBridge }).angel);
}

function bridge(): AngelBridge | null {
  return isAvailable() ? (window as unknown as { angel: AngelBridge }).angel : null;
}

function warnOnce(method: string) {
  const w = window as unknown as { __angel_warned?: Record<string, boolean> };
  w.__angel_warned = w.__angel_warned ?? {};
  if (!w.__angel_warned[method]) {
    w.__angel_warned[method] = true;
    console.warn(`[ipc] window.angel.${method} unavailable — running outside Electron preload?`);
  }
}

export const ipc = {
  async chat(text: string): Promise<{ ok: boolean; error?: string }> {
    const b = bridge();
    if (!b) {
      warnOnce('invokeTool');
      return { ok: false, error: 'no bridge' };
    }
    return b.invokeTool('chat', { text });
  },

  async invoke<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T | null> {
    const b = bridge();
    if (!b) {
      warnOnce('invokeTool');
      return null;
    }
    return b.invokeTool<T>(name, args);
  },

  reportActionComplete(result: SceneActionComplete) {
    const b = bridge();
    if (!b) {
      warnOnce('reportActionComplete');
      return;
    }
    b.reportActionComplete(result);
  },

  async getInitialClaim(): Promise<ClaimTokenPayload | null> {
    const b = bridge();
    if (!b) return null;
    return b.getInitialClaim();
  },

  /* ---------- subscribe helpers ---------- */
  onAction(cb: (a: SceneAction) => void): () => void {
    const b = bridge();
    if (!b) {
      warnOnce('onAction');
      return () => undefined;
    }
    return b.onAction(cb);
  },

  onChat(cb: (token: { id: string; text: string; done?: boolean }) => void): () => void {
    const b = bridge();
    if (!b) {
      warnOnce('onChat');
      return () => undefined;
    }
    return b.onChat(cb);
  },

  onState(cb: (patch: Record<string, unknown>) => void): () => void {
    const b = bridge();
    if (!b) {
      warnOnce('onState');
      return () => undefined;
    }
    return b.onState(cb);
  },

  onClaim(cb: (payload: ClaimTokenPayload) => void): () => void {
    const b = bridge();
    if (!b) {
      warnOnce('onClaim');
      return () => undefined;
    }
    return b.onClaim(cb);
  },

  /* ---------- tensorlake bg-job introspection (used by /admin) ---------- */
  async tensorlakeStatus(): Promise<TensorlakeStatusSummary | null> {
    const b = bridge() as unknown as { tensorlakeStatus?: () => Promise<TensorlakeStatusSummary> } | null;
    if (!b?.tensorlakeStatus) {
      warnOnce('tensorlakeStatus');
      return null;
    }
    return b.tensorlakeStatus();
  },

  async tensorlakeRerun(): Promise<TensorlakeRerunResult | null> {
    const b = bridge() as unknown as { tensorlakeRerun?: () => Promise<TensorlakeRerunResult> } | null;
    if (!b?.tensorlakeRerun) {
      warnOnce('tensorlakeRerun');
      return null;
    }
    return b.tensorlakeRerun();
  },
};

/**
 * Shape of the `tensorlake:status` IPC reply. Mirrors what main.ts returns;
 * lastObservation is the full BgObservation from
 * desktop/electron/agent/tensorlake/bg-jobs.ts.
 */
export interface TensorlakeStatusSummary {
  available: boolean;
  backend: 'tensorlake' | 'mock';
  keyConfigured: boolean;
  lastJobAt?: number;
  lastObservation?: {
    summary: string;
    findings: string[];
    suggestion: string;
    recentFiles: Array<{ path: string; modified?: string; note?: string }>;
    producedAt: number;
    backend: 'tensorlake' | 'mock';
  };
}

export interface TensorlakeRerunResult {
  ok: boolean;
  backend: 'tensorlake' | 'mock' | null;
  findings: string[];
  suggestion: string;
  producedAt: number | null;
}
