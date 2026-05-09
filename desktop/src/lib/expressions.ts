import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * Procedural expression overlays. Run inside the Avatar's useFrame loop.
 * Stateless inputs, mutating side effects on the VRM instance.
 */

export type ExpressionState = {
  /** time accumulator (seconds) */
  t: number;
  /** time of next blink (seconds, on the same accumulator) */
  nextBlinkAt: number;
  /** current blink phase: 0 = open, 1 = peak closed */
  blinkPhase: number;
  /** breathing phase (radians) */
  breathPhase: number;
};

export function createExpressionState(): ExpressionState {
  return {
    t: 0,
    nextBlinkAt: 1.5 + Math.random() * 2.5,
    blinkPhase: 0,
    breathPhase: 0,
  };
}

/** Tick the procedural overlays. Should be called every frame after vrm.update. */
export function tickExpressions(vrm: VRM, state: ExpressionState, dt: number): void {
  state.t += dt;

  // ---- blink (single 200ms close-open) ---------------------------------
  if (state.blinkPhase > 0) {
    state.blinkPhase -= dt / 0.18;
    if (state.blinkPhase < 0) state.blinkPhase = 0;
  } else if (state.t >= state.nextBlinkAt) {
    state.blinkPhase = 1;
    state.nextBlinkAt = state.t + 1.8 + Math.random() * 3.5;
  }
  // VRM 1.x exposes `expressionManager`; 0.x exposes `blendShapeProxy`.
  const em = (vrm as unknown as { expressionManager?: { setValue: (n: string, v: number) => void } })
    .expressionManager;
  const bs = (vrm as unknown as { blendShapeProxy?: { setValue: (n: string, v: number) => void } })
    .blendShapeProxy;
  const setExpr = (name: string, value: number) => {
    if (em?.setValue) em.setValue(name, value);
    else if (bs?.setValue) bs.setValue(name, value);
  };
  setExpr('blink', state.blinkPhase);

  // ---- breathing (chest scale oscillation, very subtle) ----------------
  state.breathPhase += dt * 1.4; // ~14 breaths/min
  const breath = 1 + Math.sin(state.breathPhase) * 0.012;
  const humanoid = (vrm as unknown as {
    humanoid?: {
      getNormalizedBoneNode?: (n: string) => THREE.Object3D | null;
      getBoneNode?: (n: string) => THREE.Object3D | null;
    };
  }).humanoid;
  const chest =
    humanoid?.getNormalizedBoneNode?.('chest') ?? humanoid?.getBoneNode?.('chest') ?? null;
  if (chest) {
    chest.scale.set(1, breath, 1);
  }
}

/**
 * Drive `vrm.lookAt.target` toward a world position when within `maxDist`.
 * Pass `null` to clear (lookAt resets to forward).
 */
const _scratch = new THREE.Vector3();
export function applyLookAt(
  vrm: VRM,
  target: THREE.Object3D | null,
  maxDist = 4,
): void {
  const lookAt = (vrm as unknown as { lookAt?: { target: THREE.Object3D | null } }).lookAt;
  if (!lookAt) return;
  if (!target) {
    lookAt.target = null;
    return;
  }
  target.getWorldPosition(_scratch);
  const head =
    (vrm as unknown as {
      humanoid?: {
        getNormalizedBoneNode?: (n: string) => THREE.Object3D | null;
        getBoneNode?: (n: string) => THREE.Object3D | null;
      };
    }).humanoid?.getNormalizedBoneNode?.('head') ?? null;
  if (head) {
    const headPos = new THREE.Vector3();
    head.getWorldPosition(headPos);
    const dist = headPos.distanceTo(_scratch);
    lookAt.target = dist <= maxDist ? target : null;
  } else {
    lookAt.target = target;
  }
}

/**
 * Set a base mood expression (mutually exclusive with neutral). Call this
 * when emotion changes; it does NOT need to be called per frame.
 */
export function applyEmotionExpression(vrm: VRM, emotion: string): void {
  const em = (vrm as unknown as { expressionManager?: { setValue: (n: string, v: number) => void } })
    .expressionManager;
  const bs = (vrm as unknown as { blendShapeProxy?: { setValue: (n: string, v: number) => void } })
    .blendShapeProxy;
  const set = (n: string, v: number) => {
    if (em?.setValue) em.setValue(n, v);
    else if (bs?.setValue) bs.setValue(n, v);
  };
  // clear known mood blend shapes
  ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral'].forEach((n) => set(n, 0));
  switch (emotion) {
    case 'happy':
    case 'excited':
      set('happy', 0.85);
      break;
    case 'soft':
    case 'thinking':
      set('relaxed', 0.7);
      break;
    case 'concerned':
      set('sad', 0.55);
      break;
    case 'smug':
      set('happy', 0.4);
      set('relaxed', 0.3);
      break;
    case 'focused':
      set('relaxed', 0.4);
      break;
    case 'surprised':
      set('surprised', 0.7);
      break;
    default:
      set('neutral', 1);
  }
}
