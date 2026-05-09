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

  reportActionComplete: (result: SceneActionComplete) =>
    ipcRenderer.invoke('tool:invoke', { name: 'action_complete', args: result }),

  getInitialClaim: (): Promise<ClaimTokenPayload | null> =>
    ipcRenderer.invoke('claim:get-initial'),

  platform: process.platform,
});
