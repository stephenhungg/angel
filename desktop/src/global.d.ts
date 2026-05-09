/// <reference types="vite/client" />

import type {
  SceneAction,
  SceneActionComplete,
  AgentState,
  ClaimTokenPayload,
} from '@angel/shared';

export type ToolName =
  | 'chat'
  | 'walk_to'
  | 'action_complete'
  | 'memory_recall'
  | 'verify'
  | 'deploy';

export type Unsubscribe = () => void;

export type ChatToken = {
  id: string;
  text: string;
  done?: boolean;
};

export type StatePatch = Partial<AgentState> & { mood?: number; energy?: number; trust?: number };

declare global {
  interface Window {
    angel: {
      invokeTool: <T = unknown>(name: ToolName | string, args?: Record<string, unknown>) => Promise<T>;
      onAction: (cb: (action: SceneAction) => void) => Unsubscribe;
      onChat: (cb: (token: ChatToken) => void) => Unsubscribe;
      onState: (cb: (patch: StatePatch) => void) => Unsubscribe;
      onClaim: (cb: (payload: ClaimTokenPayload) => void) => Unsubscribe;
      reportActionComplete: (result: SceneActionComplete) => void;
      getInitialClaim: () => Promise<ClaimTokenPayload | null>;
      platform: NodeJS.Platform;
    };
  }
}

export {};
