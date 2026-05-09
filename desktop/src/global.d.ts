/// <reference types="vite/client" />

import type {
  SceneAction,
  SceneActionComplete,
  AgentState,
  ClaimTokenPayload,
  AestheticArchetype,
  NumericTraits,
  PersonaTraits,
  VoiceConfig,
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

export type CodexStreamEvent = { jobId: string; chunk: string };
export type CodexCompleteEvent = { jobId: string; result: unknown };
export type VerifyResultEvent = { check: string; ok: boolean; evidence: string };

declare global {
  interface Window {
    angel: {
      invokeTool: <T = unknown>(name: ToolName | string, args?: Record<string, unknown>) => Promise<T>;
      onAction: (cb: (action: SceneAction) => void) => Unsubscribe;
      onChat: (cb: (token: ChatToken) => void) => Unsubscribe;
      onState: (cb: (patch: StatePatch) => void) => Unsubscribe;
      onClaim: (cb: (payload: ClaimTokenPayload) => void) => Unsubscribe;
      onCodexStream: (cb: (e: CodexStreamEvent) => void) => Unsubscribe;
      onCodexComplete: (cb: (e: CodexCompleteEvent) => void) => Unsubscribe;
      onVerifyResult: (cb: (e: VerifyResultEvent) => void) => Unsubscribe;
      reportActionComplete: (result: SceneActionComplete) => void;
      getInitialClaim: () => Promise<ClaimTokenPayload | null>;

      /* onboarding (swipe + reveal) */
      embed: (args: {
        picks: Array<{ vroid_id: string; decision: 'yes' | 'no'; round: 1 | 2 | 3 }>;
      }) => Promise<{
        numericTraits: NumericTraits;
        voiceConfig: VoiceConfig;
        traits: PersonaTraits;
        archetype: AestheticArchetype;
        vrmUrl: string;
        paletteHex: string;
        dialogueSamples: string[];
        heroCard: {
          id: string;
          name: string;
          thumbnailUrl: string;
          vibePhrase: string;
          personalityBlurb: string;
          energyDescriptor: string;
          dialogueSamples: string[];
          voiceConfig: VoiceConfig;
          palette: [string, string, string];
          aesthetic: string;
          hairColor: string;
        };
        yesIds: string[];
      }>;
      synthesize: (
        args: {
          numericTraits: NumericTraits;
          traits: PersonaTraits;
          archetype: AestheticArchetype;
          dialogueSamples: string[];
        },
        onToken: (token: string) => void,
      ) => Promise<{ ok: boolean; fallback?: boolean }>;
      namingResponse: (args: {
        typedName: string;
        personalityMd?: string;
        dialogueSamples?: string[];
      }) => Promise<{ response: string }>;
      completeOnboarding: (persona: ClaimTokenPayload) => Promise<{ ok: boolean }>;

      platform: NodeJS.Platform;
    };
  }
}

export {};
