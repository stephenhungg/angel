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

export type AngelSettings = {
  transport: 'convex' | 'direct';
  anthropicApiKey?: string;
  convexUrl: string;
  userId: string;
  introCompleted: boolean;
  savedAt: number;
};

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

      /* first-run settings + introduction */
      settings: {
        get: () => Promise<{
          settings: AngelSettings | null;
          shouldShowSettings: boolean;
          bootHasEnvKey: boolean;
          defaultConvexUrl: string;
        }>;
        set: (partial: Partial<AngelSettings>) => Promise<AngelSettings>;
        reset: () => Promise<{ ok: boolean }>;
        markIntroComplete: () => Promise<AngelSettings>;
      };
      introIngestAnswer: (args: {
        userId?: string;
        questionId: string;
        question: string;
        answer: string;
        type: 'fact' | 'preference' | 'scratchpad';
      }) => Promise<{ ok: boolean; error?: string }>;
      introGenerateQuestions: (args: {
        personalityMd: string;
        userName?: string;
        topics: Array<{
          id: string;
          intent: string;
          type: 'fact' | 'preference' | 'scratchpad';
        }>;
        promptTemplate: string;
      }) => Promise<{
        questions: Array<{
          id: string;
          q: string;
          type: 'fact' | 'preference' | 'scratchpad';
          ackHint?: string;
        }>;
        fallback: boolean;
      }>;

      platform: NodeJS.Platform;
    };
  }
}

export {};
