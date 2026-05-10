import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  SceneAction,
  AnchorId,
  Emotion,
  AnimationClip as ClipName,
  ClaimTokenPayload,
  PersonaTraits,
} from '@angel/shared';
import { applyPaletteToDocument, resolveClaim } from '@/lib/persona';

/** Renderer-local agent state (mirrors convex.agentState eventually). */
export type AgentLiveState = {
  emotion: Emotion;
  location: AnchorId;
  isWalking: boolean;
  walkTarget: AnchorId | null;
  faceExpression: string | null;
  currentTaskId: string | null;
  // continuous bars (0..1) — driven by orchestrator state patches
  mood: number;
  energy: number;
  trust: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'angel' | 'system';
  text: string;
  emotion?: Emotion;
  ts: number;
  /** when true the message is fully delivered; subtitle reveal can finish */
  done: boolean;
};

export type PersonaState = {
  userId: string;
  name: string;
  vrmUrl: string;
  paletteHex: string;
  traits: PersonaTraits;
  /** Optional — synthesized personality.md from the reveal phase. The
   *  introduction phase reads this to generate questions in HER voice. */
  personalityMd?: string;
} | null;

export type AngelStore = {
  // persona — set on claim arrival
  persona: PersonaState;
  setPersona: (p: PersonaState) => void;
  applyClaim: (claim: ClaimTokenPayload, vrmUrl?: string) => void;
  /** swap just the avatar body without touching personality. Used by the
   *  esc-menu's body picker to preview different VRMs against the same
   *  persona. Persists via setupPersonaPersist's subscription. */
  swapVrm: (vrmUrl: string, paletteHex?: string) => void;

  // chat
  chat: ChatMessage[];
  appendChat: (msg: Omit<ChatMessage, 'ts'> & { ts?: number }) => void;
  patchChat: (id: string, patch: Partial<ChatMessage>) => void;
  clearChat: () => void;

  // current speech bubble (above avatar head)
  bubble: { text: string; emotion: Emotion; visibleAt: number } | null;
  showBubble: (text: string, emotion?: Emotion) => void;
  clearBubble: () => void;

  // action queue (sequential)
  queue: SceneAction[];
  current: SceneAction | null;
  enqueue: (action: SceneAction | SceneAction[]) => void;
  popNext: () => void;
  completeCurrent: () => void;
  cancelQueue: () => void;

  // current animation clip name (for ActionRunner ↔ Avatar handoff)
  currentClip: ClipName;
  setClip: (clip: ClipName) => void;

  // mouth-shape weight 0..1 — driven by animalese chirps. Avatar reads in useFrame.
  mouthOpen: number;
  setMouthOpen: (v: number) => void;

  // live agent state
  state: AgentLiveState;
  setState: (patch: Partial<AgentLiveState>) => void;

  // first-person player state — set every frame by Player.tsx, read by
  // anything that wants to react to the player (avatar look-at, prox bubbles)
  player: { x: number; y: number; z: number; yaw: number; moving: boolean };
  setPlayer: (p: Partial<AngelStore['player']>) => void;

  // pointer lock state — UI uses this to show/hide the "click to enter" prompt
  pointerLocked: boolean;
  setPointerLocked: (v: boolean) => void;

  // interactables — id of the one currently in the player's reticle (or null)
  focusedInteractable: string | null;
  setFocusedInteractable: (id: string | null) => void;

  // player seated state — set when E-interacting with a chair-like object
  playerSeated: {
    interactableId: string;
    pos?: [number, number, number];
    yaw?: number;
    mode: 'sit' | 'sit_and_type' | 'sit_playful';
  } | null;
  setPlayerSeated: (s: AngelStore['playerSeated']) => void;

  // one-shot teleport-toward target for the look_out verb (Player consumes it)
  lookOutTarget: [number, number, number] | null;
  setLookOutTarget: (p: [number, number, number] | null) => void;

  // calibration mode (K) — releases pointer lock + freezes player movement
  calibrationOpen: boolean;
  setCalibrationOpen: (v: boolean) => void;

  // currently-selected interactable in the calibration editor (null = none)
  selectedCalibrationId: string | null;
  setSelectedCalibrationId: (id: string | null) => void;
};

const initialState: AgentLiveState = {
  emotion: 'neutral',
  location: 'center',
  isWalking: false,
  walkTarget: null,
  faceExpression: null,
  currentTaskId: null,
  mood: 0.6,
  energy: 0.7,
  trust: 0.5,
};

export const useAngelStore = create<AngelStore>()(
  subscribeWithSelector((set) => ({
    persona: null,
    setPersona: (p) => set({ persona: p }),
    applyClaim: (claim, vrmUrl) => {
      const resolved = resolveClaim(claim);
      applyPaletteToDocument(resolved.paletteHex);
      set({
        persona: {
          userId: claim.userId,
          name: claim.name,
          vrmUrl: vrmUrl ?? resolved.vrmUrl,
          paletteHex: resolved.paletteHex,
          traits: claim.traits,
          personalityMd: claim.personalityMd,
        },
      });
    },
    swapVrm: (vrmUrl, paletteHex) =>
      set((s) => {
        if (!s.persona) return s;
        if (paletteHex) applyPaletteToDocument(paletteHex);
        return {
          persona: {
            ...s.persona,
            vrmUrl,
            ...(paletteHex ? { paletteHex } : {}),
          },
        };
      }),

    chat: [],
    appendChat: (msg) =>
      set((s) => {
        // dedupe by id — React Strict Mode double-invokes setup effects in
        // dev, which causes ActionRunner's `speak` branch to call appendChat
        // twice with the same SceneAction.id. Use patchChat to mutate an
        // existing entry; appendChat is strictly add-once-per-id.
        if (s.chat.some((m) => m.id === msg.id)) return s;
        return {
          chat: [...s.chat, { ts: Date.now(), ...msg } as ChatMessage].slice(-80),
        };
      }),
    patchChat: (id, patch) =>
      set((s) => ({
        chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      })),
    clearChat: () => set({ chat: [] }),

    bubble: null,
    showBubble: (text, emotion = 'neutral') =>
      set({ bubble: { text, emotion, visibleAt: Date.now() } }),
    clearBubble: () => set({ bubble: null }),

    queue: [],
    current: null,
    enqueue: (action) =>
      set((s) => {
        const arr = Array.isArray(action) ? action : [action];
        // `cancel_queue` clears queue + current immediately
        if (arr.some((a) => a.type === 'cancel_queue')) {
          return { queue: [], current: null };
        }
        return { queue: [...s.queue, ...arr] };
      }),
    popNext: () =>
      set((s) => {
        if (s.current || s.queue.length === 0) return s;
        const [next, ...rest] = s.queue;
        return { current: next ?? null, queue: rest };
      }),
    completeCurrent: () => set({ current: null }),
    cancelQueue: () => set({ queue: [], current: null }),

    currentClip: 'idle',
    setClip: (clip) => set({ currentClip: clip }),

    mouthOpen: 0,
    setMouthOpen: (v) => set({ mouthOpen: Math.max(0, Math.min(1, v)) }),

    state: initialState,
    setState: (patch) => set((s) => ({ state: { ...s.state, ...patch } })),

    player: { x: 0, y: 1.6, z: 2.4, yaw: Math.PI, moving: false },
    setPlayer: (p) => set((s) => ({ player: { ...s.player, ...p } })),

    pointerLocked: false,
    setPointerLocked: (v) => set({ pointerLocked: v }),

    focusedInteractable: null,
    setFocusedInteractable: (id) =>
      set((s) => (s.focusedInteractable === id ? s : { focusedInteractable: id })),

    playerSeated: null,
    setPlayerSeated: (st) => set({ playerSeated: st }),

    lookOutTarget: null,
    setLookOutTarget: (p) => set({ lookOutTarget: p }),

    calibrationOpen: false,
    setCalibrationOpen: (v) => set({ calibrationOpen: v }),

    selectedCalibrationId: null,
    setSelectedCalibrationId: (id) => set({ selectedCalibrationId: id }),
  })),
);

// expose for devtools poking during smoke tests
if (typeof window !== 'undefined') {
  (window as unknown as { __angel?: typeof useAngelStore }).__angel = useAngelStore;
}
