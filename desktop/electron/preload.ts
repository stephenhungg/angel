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

  platform: process.platform,
});
