/**
 * lib/expressionDriver.ts — emotion → VRM blendshape preset crossfader.
 *
 * Owned by L2 because emotions originate in conversation (chat:token emotion
 * field, set_expression scene actions) — but consumed by L1 (Avatar.tsx
 * useFrame). Avatar instantiates one driver per VRM and ticks it.
 *
 * Intentionally pure & class-based (not React) so it's safe to call from
 * useFrame at 60+ Hz without re-renders.
 *
 * Spec: docs/conversational-agent-layer plan, "face expression overlay".
 */

import type { Emotion } from '@angel/shared';
import type { VRM } from '@pixiv/three-vrm';

/* ------------------------------------------------------------------ */
/* presets                                                             */
/* ------------------------------------------------------------------ */

/**
 * Map an Emotion to a sparse blendshape weight preset.
 * VRM standard expressions: happy, angry, sad, relaxed, surprised, neutral.
 * (Plus aa/ih/ou/ee/oh phonemes — owned separately by lipsync.)
 *
 * Values are 0..1. Missing keys mean "go to 0" during crossfade.
 */
export const EMOTION_PRESETS: Record<Emotion, Partial<Record<string, number>>> = {
  neutral: { happy: 0, sad: 0, angry: 0, relaxed: 0.05, surprised: 0 },
  happy: { happy: 0.75, relaxed: 0.25 },
  excited: { happy: 0.55, surprised: 0.4 },
  thinking: { relaxed: 0.45, sad: 0.05 },
  smug: { happy: 0.3, relaxed: 0.15 },
  soft: { happy: 0.2, relaxed: 0.5 },
  focused: { relaxed: 0.25, surprised: 0.05 },
  concerned: { sad: 0.4, relaxed: 0.15 },
};

const ALL_NAMES: readonly string[] = ['happy', 'sad', 'angry', 'relaxed', 'surprised'] as const;

/* ------------------------------------------------------------------ */
/* driver                                                              */
/* ------------------------------------------------------------------ */

export class ExpressionDriver {
  private vrm: VRM;
  /** values currently driven onto the VRM */
  private current: Map<string, number> = new Map();
  /** target values we're fading toward */
  private target: Map<string, number> = new Map();
  /** start of current fade — performance.now() */
  private fadeStartedAt = 0;
  /** duration of current fade in ms */
  private fadeMs = 300;
  /** snapshot of current values when fade began (for lerp) */
  private fadeFrom: Map<string, number> = new Map();
  /** current emotion label for debugging / store mirror */
  public emotion: Emotion = 'neutral';

  constructor(vrm: VRM) {
    this.vrm = vrm;
    for (const n of ALL_NAMES) {
      this.current.set(n, 0);
      this.target.set(n, 0);
      this.fadeFrom.set(n, 0);
    }
    // start at neutral
    this.setEmotion('neutral', 0);
  }

  /** set target preset — kicks off a fade */
  setEmotion(emotion: Emotion, durationMs = 300): void {
    this.emotion = emotion;
    const preset = EMOTION_PRESETS[emotion] ?? {};

    this.fadeFrom = new Map(this.current);
    this.target.clear();
    for (const n of ALL_NAMES) this.target.set(n, preset[n] ?? 0);

    this.fadeMs = Math.max(0.001, durationMs);
    this.fadeStartedAt = performance.now();

    // instant set when durationMs === 0
    if (durationMs <= 0) {
      this.target.forEach((v, n) => this.current.set(n, v));
      this.applyToVrm();
    }
  }

  /** override a single blendshape (e.g., from `set_expression` scene action) */
  setOverride(name: string, weight: number, durationMs = 200): void {
    const clamped = Math.max(0, Math.min(1, weight));
    this.fadeFrom.set(name, this.current.get(name) ?? 0);
    this.target.set(name, clamped);
    this.fadeMs = Math.max(0.001, durationMs);
    this.fadeStartedAt = performance.now();
  }

  /** call from Avatar's useFrame — interpolates current → target by elapsed time */
  update(_dt: number): void {
    const now = performance.now();
    const t = Math.min(1, (now - this.fadeStartedAt) / this.fadeMs);
    const ease = easeOutCubic(t);

    for (const name of this.target.keys()) {
      const from = this.fadeFrom.get(name) ?? 0;
      const to = this.target.get(name) ?? 0;
      const blended = from + (to - from) * ease;
      this.current.set(name, blended);
    }
    this.applyToVrm();
  }

  private applyToVrm(): void {
    const mgr = this.vrm.expressionManager;
    if (!mgr) return;
    for (const [name, value] of this.current) {
      try {
        mgr.setValue(name, value);
      } catch {
        /* model may not have this preset name — ignore */
      }
    }
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
