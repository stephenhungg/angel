import { contextBridge, ipcRenderer } from 'electron';
import type { SceneAction, SceneActionComplete, ClaimTokenPayload } from '@angel/shared';

type Unsubscribe = () => void;

function on<T>(channel: string, cb: (data: T) => void): Unsubscribe {
  const handler = (_e: Electron.IpcRendererEvent, data: T) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('angel', {
  invokeTool: (name: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke('tool:invoke', { name, args: args ?? {} }),

  onAction: (cb: (action: SceneAction) => void) => on<SceneAction>('scene:action', cb),
  onChat: (cb: (token: { id: string; text: string; done?: boolean }) => void) =>
    on('chat:token', cb),
  onState: (cb: (patch: Record<string, unknown>) => void) => on('state:update', cb),
  onClaim: (cb: (payload: ClaimTokenPayload) => void) => on('claim:received', cb),

  // Bg autonomy events from main — currently the Tensorlake boot job
  // (while_you_were_away with findings + suggestion). Renderer fan-out
  // lives in src/lib/bgAutonomy.ts.
  onBgAutonomy: (
    cb: (e: { kind: string; payload?: Record<string, unknown> }) => void,
  ) => on<{ kind: string; payload?: Record<string, unknown> }>('bg:autonomy', cb),

  // Tensorlake bg-job introspection — used by /admin/space dashboard to
  // show "is tensorlake actually doing the work?" with the latest
  // observation (judges' receipt). status = read; rerun = trigger fresh.
  tensorlakeStatus: () => ipcRenderer.invoke('tensorlake:status'),
  tensorlakeRerun: () => ipcRenderer.invoke('tensorlake:rerun'),

  // agentic tools — delegate streams codex stdout, verify reports check results
  onCodexStream: (cb: (e: { jobId: string; chunk: string }) => void) =>
    on('desk:codex_stream', cb),
  onCodexComplete: (cb: (e: { jobId: string; result: unknown }) => void) =>
    on('desk:codex_complete', cb),
  onVerifyResult: (cb: (e: { check: string; ok: boolean; evidence: string }) => void) =>
    on('tools:verify_result', cb),

  reportActionComplete: (result: SceneActionComplete) =>
    ipcRenderer.invoke('tool:invoke', { name: 'action_complete', args: result }),

  getInitialClaim: (): Promise<ClaimTokenPayload | null> =>
    ipcRenderer.invoke('claim:get-initial'),

  /* ---- onboarding (swipe + reveal) ---- */

  embed: (args: { picks: Array<{ vroid_id: string; decision: 'yes' | 'no'; round: 1 | 2 | 3 }> }) =>
    ipcRenderer.invoke('swipe:embed', args),

  synthesize: (
    args: {
      numericTraits: { warmth: number; energy: number; edge: number; sophistication: number; playfulness: number };
      traits: { aesthetic: string; disposition: string; style: string; voice_cluster: number };
      archetype: string;
      dialogueSamples: string[];
    },
    onToken: (token: string) => void,
  ): Promise<{ ok: boolean; fallback?: boolean }> => {
    const streamId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onTokenEvent = (
      _e: Electron.IpcRendererEvent,
      data: { streamId: string; token: string },
    ) => {
      if (data.streamId === streamId) onToken(data.token);
    };
    ipcRenderer.on('swipe:synthesize_token', onTokenEvent);
    const cleanup = () => {
      ipcRenderer.removeListener('swipe:synthesize_token', onTokenEvent);
      ipcRenderer.removeListener('swipe:synthesize_done', onDoneEvent);
    };
    let resolveDone: (v: { ok: boolean; fallback?: boolean }) => void = () => {};
    const donePromise = new Promise<{ ok: boolean; fallback?: boolean }>((r) => {
      resolveDone = r;
    });
    const onDoneEvent = (
      _e: Electron.IpcRendererEvent,
      data: { streamId: string; fallback?: boolean },
    ) => {
      if (data.streamId !== streamId) return;
      cleanup();
      resolveDone({ ok: true, fallback: data.fallback });
    };
    ipcRenderer.on('swipe:synthesize_done', onDoneEvent);

    return ipcRenderer
      .invoke('swipe:synthesize', { ...args, streamId })
      .then(() => donePromise)
      .catch((err) => {
        cleanup();
        throw err;
      });
  },

  namingResponse: (args: {
    typedName: string;
    personalityMd?: string;
    dialogueSamples?: string[];
  }): Promise<{ response: string }> => ipcRenderer.invoke('swipe:naming_response', args),

  completeOnboarding: (persona: ClaimTokenPayload): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('swipe:complete', persona),

  /* ---- first-run settings + introduction ---- */

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:set', partial),
    reset: () => ipcRenderer.invoke('settings:reset'),
    markIntroComplete: () => ipcRenderer.invoke('settings:mark-intro-complete'),
  },

  introIngestAnswer: (args: {
    userId?: string;
    questionId: string;
    question: string;
    answer: string;
    type: 'fact' | 'preference' | 'scratchpad';
  }) => ipcRenderer.invoke('intro:ingestAnswer', args),

  introGenerateQuestions: (args: {
    personalityMd: string;
    userName?: string;
    topics: Array<{
      id: string;
      intent: string;
      type: 'fact' | 'preference' | 'scratchpad';
    }>;
    promptTemplate: string;
  }) => ipcRenderer.invoke('intro:generateQuestions', args),

  platform: process.platform,
});
