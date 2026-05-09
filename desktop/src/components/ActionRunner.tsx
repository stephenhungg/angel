import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RefObject } from 'react';
import type { AnchorId, SceneAction } from '@angel/shared';

import { useAngelStore } from '@/stores/angel';
import { resolveAnchor } from '@/lib/anchors';
import type { AvatarHandle } from '@/components/Avatar';
import { ipc } from '@/lib/ipc';

type Props = {
  avatarRef: RefObject<AvatarHandle | null>;
  /** the loaded room root, used for anchor empty lookup */
  roomRoot: THREE.Object3D | null;
};

const SPEED_M_S: Record<'slow' | 'normal' | 'urgent', number> = {
  slow: 0.6,
  normal: 1.3,
  urgent: 2.2,
};

/** Per-action runtime — kept on the ref so we don't re-render on each frame. */
type RunCtx = {
  startedAt: number;
  // walk_to
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromRotY: number;
  toRotY: number;
  totalDuration: number; // seconds
  // wait
  waitUntil: number;
};

const _scratch = new THREE.Vector3();
const TWO_PI = Math.PI * 2;

function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  else if (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

export function ActionRunner({ avatarRef, roomRoot }: Props) {
  const queue = useAngelStore((s) => s.queue);
  const current = useAngelStore((s) => s.current);
  const popNext = useAngelStore((s) => s.popNext);
  const completeCurrent = useAngelStore((s) => s.completeCurrent);
  const setStoreState = useAngelStore((s) => s.setState);
  const showBubble = useAngelStore((s) => s.showBubble);
  const clearBubble = useAngelStore((s) => s.clearBubble);
  const appendChat = useAngelStore((s) => s.appendChat);
  const setClip = useAngelStore((s) => s.setClip);

  const ctxRef = useRef<RunCtx | null>(null);
  const currentLocationRef = useRef<AnchorId>('center');

  // when a new `current` lands, initialise context.
  useEffect(() => {
    if (!current) {
      ctxRef.current = null;
      return;
    }
    const root = avatarRef.current?.getRoot();
    if (!root) {
      // avatar not mounted yet — defer one frame
      return;
    }
    const now = performance.now() / 1000;
    const ctx: RunCtx = {
      startedAt: now,
      fromPos: root.position.clone(),
      toPos: root.position.clone(),
      fromRotY: root.rotation.y,
      toRotY: root.rotation.y,
      totalDuration: 0,
      waitUntil: now,
    };

    switch (current.type) {
      case 'walk_to': {
        const anchor = resolveAnchor(current.anchor, roomRoot);
        ctx.toPos = anchor.position.clone();
        ctx.toRotY = anchor.rotationY;
        const dist = ctx.fromPos.distanceTo(ctx.toPos);
        const speed = SPEED_M_S[current.speed ?? 'normal'];
        ctx.totalDuration = Math.max(0.4, dist / speed);
        avatarRef.current?.play('walking', 200);
        setClip('walking');
        setStoreState({ isWalking: true, walkTarget: current.anchor });
        break;
      }
      case 'sit_at': {
        const anchor = resolveAnchor(current.anchor, roomRoot);
        // snap position + rotation
        root.position.copy(anchor.position);
        root.rotation.y = anchor.rotationY;
        ctx.fromPos.copy(root.position);
        ctx.toPos.copy(root.position);
        avatarRef.current?.play('sitting', 250);
        setClip('sitting');
        setStoreState({ isWalking: false, location: current.anchor });
        currentLocationRef.current = current.anchor;
        // sitting completes after 0.4s — long enough to crossfade
        ctx.totalDuration = 0.4;
        break;
      }
      case 'stand': {
        avatarRef.current?.play('idle', 250);
        setClip('idle');
        ctx.totalDuration = 0.3;
        break;
      }
      case 'play_clip': {
        avatarRef.current?.play(current.clip, 200);
        setClip(current.clip);
        ctx.totalDuration = (current.durationMs ?? 800) / 1000;
        break;
      }
      case 'face': {
        const anchor =
          current.target === 'user'
            ? null
            : resolveAnchor(current.target as AnchorId, roomRoot);
        const targetWorldPos = anchor ? anchor.position : new THREE.Vector3(0, 1.6, 5); // user direction = +Z
        const dx = targetWorldPos.x - root.position.x;
        const dz = targetWorldPos.z - root.position.z;
        ctx.toRotY = Math.atan2(dx, dz);
        ctx.totalDuration = 0.35;
        break;
      }
      case 'speak': {
        showBubble(current.text, current.emotion);
        appendChat({
          id: current.id,
          role: 'angel',
          text: current.text,
          emotion: current.emotion,
          done: false,
        });
        if (current.emotion) setStoreState({ emotion: current.emotion });
        // duration must outlast animalese chirps + bubble fade. animalese is
        // ~55ms per voiced char + punctuation pauses; we budget 70ms/char + 700ms.
        const estMs = current.text.length * 70 + 700;
        ctx.totalDuration = Math.max(1.6, Math.min(12, estMs / 1000));
        break;
      }
      case 'set_state': {
        // SceneAction.set_state.mood is a *label* (e.g. "warm"); our bar
        // value is a number on a separate channel (state:update IPC).
        // Only the numeric bars + currentTask flow through here.
        setStoreState({
          ...(current.energy !== undefined ? { energy: current.energy } : {}),
          ...(current.trust !== undefined ? { trust: current.trust } : {}),
          ...(current.currentTask !== undefined
            ? { currentTaskId: current.currentTask ?? null }
            : {}),
        });
        ctx.totalDuration = 0.05;
        break;
      }
      case 'set_expression': {
        // expression overrides handled by Avatar via store.faceExpression — for v1 just nudge emotion.
        setStoreState({ faceExpression: current.expression });
        ctx.totalDuration = (current.durationMs ?? 600) / 1000;
        break;
      }
      case 'delegate': {
        setStoreState({ currentTaskId: current.taskId });
        ctx.totalDuration = 0.05;
        break;
      }
      case 'wait': {
        ctx.totalDuration = current.ms / 1000;
        break;
      }
      case 'cancel_queue': {
        // handled at enqueue() — already cleared
        ctx.totalDuration = 0;
        break;
      }
      default: {
        // exhaustiveness check
        const _never: never = current;
        void _never;
        ctx.totalDuration = 0.05;
      }
    }
    ctxRef.current = ctx;
  }, [current, avatarRef, roomRoot, setStoreState, showBubble, appendChat, setClip]);

  useFrame((_, dt) => {
    // pop next when idle
    if (!current && queue.length > 0) {
      popNext();
      return;
    }
    if (!current || !ctxRef.current) return;
    const ctx = ctxRef.current;
    const root = avatarRef.current?.getRoot();
    if (!root) return;
    const elapsed = performance.now() / 1000 - ctx.startedAt;
    const t = ctx.totalDuration > 0 ? Math.min(1, elapsed / ctx.totalDuration) : 1;

    switch (current.type) {
      case 'walk_to': {
        // smoothstep eases the lerp so footsteps don't snap at endpoints
        const e = t * t * (3 - 2 * t);
        root.position.lerpVectors(ctx.fromPos, ctx.toPos, e);
        const targetDelta = shortestAngleDelta(ctx.fromRotY, ctx.toRotY);
        root.rotation.y = ctx.fromRotY + targetDelta * Math.min(1, t * 1.4);
        if (t >= 1) {
          root.position.copy(ctx.toPos);
          root.rotation.y = ctx.toRotY;
          avatarRef.current?.play('idle', 200);
          setClip('idle');
          setStoreState({ isWalking: false, walkTarget: null, location: current.anchor });
          currentLocationRef.current = current.anchor;
          finish(current);
        }
        break;
      }
      case 'face': {
        const e = t * t * (3 - 2 * t);
        const delta = shortestAngleDelta(ctx.fromRotY, ctx.toRotY);
        root.rotation.y = ctx.fromRotY + delta * e;
        if (t >= 1) {
          root.rotation.y = ctx.toRotY;
          finish(current);
        }
        break;
      }
      case 'speak':
      case 'set_state':
      case 'set_expression':
      case 'delegate':
      case 'wait':
      case 'sit_at':
      case 'stand':
      case 'play_clip': {
        if (t >= 1) {
          if (current.type === 'speak') clearBubble();
          finish(current);
        }
        break;
      }
      case 'cancel_queue':
        finish(current);
        break;
    }
  });

  function finish(action: SceneAction) {
    completeCurrent();
    ipc.reportActionComplete({ id: action.id, success: true });
  }

  return null;
}
