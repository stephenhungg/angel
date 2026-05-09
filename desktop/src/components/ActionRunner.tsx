import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RefObject } from 'react';
import type { AnchorId, SceneAction } from '@angel/shared';

import { useAngelStore } from '@/stores/angel';
import { resolveAnchor, isChairAnchor } from '@/lib/anchors';
import type { AvatarHandle } from '@/components/Avatar';
import { ipc } from '@/lib/ipc';
import { resolveCollision } from '@/lib/collision';
import { getInteractable } from '@/lib/interactables';

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

/** avatar's collision capsule radius. smaller than the player's so she can
 * slip into chair anchors without bumping the desk leg. */
const AVATAR_COLLIDER_RADIUS = 0.25;
/** considered "arrived" when within this distance of the target xz */
const ARRIVE_EPS = 0.08;
/** safety cap so a stuck-on-furniture path can't run forever */
const WALK_TIMEOUT_S = 8;

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
  const enqueue = useAngelStore((s) => s.enqueue);
  const setStoreState = useAngelStore((s) => s.setState);
  const showBubble = useAngelStore((s) => s.showBubble);
  const clearBubble = useAngelStore((s) => s.clearBubble);
  const appendChat = useAngelStore((s) => s.appendChat);
  const setClip = useAngelStore((s) => s.setClip);

  const ctxRef = useRef<RunCtx | null>(null);
  const currentLocationRef = useRef<AnchorId>('center');
  // tracks the action id that scheduled a typing-chain return so a
  // cancel/replace can suppress the stale timer without ref-count bookkeeping
  const currentActionAtTimeoutRef = useRef<string | null>(null);

  // collect collider meshes from the room once it's loaded so the avatar's
  // walks can slide along walls rather than clip through them
  const collidersRef = useRef<THREE.Object3D[]>([]);
  useEffect(() => {
    if (!roomRoot) {
      collidersRef.current = [];
      return;
    }
    const list: THREE.Object3D[] = [];
    roomRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) list.push(obj);
    });
    collidersRef.current = list;
  }, [roomRoot]);

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
        // Priority order for resolving the target:
        //   1. posOverride — emitted by interact_with macro, honors calibrated coords
        //   2. anchor === 'user' — live player position (legacy compatibility)
        //   3. anchor name → resolveAnchor (legacy room empty / fallback)
        if (current.posOverride) {
          ctx.toPos.set(...current.posOverride);
          ctx.toRotY = current.yawOverride ?? ctx.toRotY;
        } else if (current.anchor === 'user') {
          const player = useAngelStore.getState().player;
          const dx = player.x - root.position.x;
          const dz = player.z - root.position.z;
          const distToPlayer = Math.hypot(dx, dz);
          const STOP_SHORT = 1.0;
          if (distToPlayer > STOP_SHORT + ARRIVE_EPS) {
            const t = (distToPlayer - STOP_SHORT) / distToPlayer;
            ctx.toPos.set(
              root.position.x + dx * t,
              root.position.y,
              root.position.z + dz * t,
            );
          } else {
            ctx.toPos.copy(root.position);
          }
          ctx.toRotY = Math.atan2(player.x - ctx.toPos.x, player.z - ctx.toPos.z);
        } else {
          const anchor = resolveAnchor(current.anchor, roomRoot);
          ctx.toPos = anchor.position.clone();
          ctx.toRotY = anchor.rotationY;
        }
        const dist = ctx.fromPos.distanceTo(ctx.toPos);
        const speed = SPEED_M_S[current.speed ?? 'normal'];
        ctx.totalDuration = Math.max(WALK_TIMEOUT_S, (dist / speed) * 1.6);
        avatarRef.current?.play('walking', 200);
        setClip('walking');
        setStoreState({
          isWalking: true,
          walkTarget: current.anchor === 'user' ? null : current.anchor,
        });
        break;
      }
      case 'walk_to_user': {
        // resolve LIVE — not at queue time. The player may have moved
        // between when the brain emitted the action and when it executes.
        const player = useAngelStore.getState().player;
        const stopShort = current.stopDistance ?? 1.4;
        const dx = player.x - root.position.x;
        const dz = player.z - root.position.z;
        const distToPlayer = Math.hypot(dx, dz);
        if (distToPlayer > stopShort + ARRIVE_EPS) {
          const t = (distToPlayer - stopShort) / distToPlayer;
          ctx.toPos.set(
            root.position.x + dx * t,
            root.position.y,
            root.position.z + dz * t,
          );
        } else {
          ctx.toPos.copy(root.position);
        }
        ctx.toRotY = Math.atan2(player.x - ctx.toPos.x, player.z - ctx.toPos.z);
        const dist = ctx.fromPos.distanceTo(ctx.toPos);
        const speed = SPEED_M_S[current.speed ?? 'normal'];
        ctx.totalDuration = Math.max(WALK_TIMEOUT_S, (dist / speed) * 1.6);
        avatarRef.current?.play('walking', 200);
        setClip('walking');
        setStoreState({ isWalking: true, walkTarget: null });
        break;
      }
      case 'sit_at': {
        // chair guard — refuse to sit on non-chair anchors (window, door,
        // bookshelf...). Logs and degrades to an idle pose.
        if (!isChairAnchor(current.anchor)) {
          console.warn('[scene] refused sit_at on non-chair anchor', current.anchor);
          if (current.posOverride) {
            root.position.set(...current.posOverride);
            if (current.yawOverride != null) root.rotation.y = current.yawOverride;
          } else {
            const anchor = resolveAnchor(current.anchor, roomRoot);
            root.position.copy(anchor.position);
            root.rotation.y = anchor.rotationY;
          }
          avatarRef.current?.play('idle', 250);
          setClip('idle');
          setStoreState({ isWalking: false, location: current.anchor });
          currentLocationRef.current = current.anchor;
          ctx.totalDuration = 0.3;
          break;
        }
        // snap to the override position (preferred — calibrated coords)
        // or fall back to the legacy anchor system.
        if (current.posOverride) {
          root.position.set(...current.posOverride);
          if (current.yawOverride != null) root.rotation.y = current.yawOverride;
        } else {
          const anchor = resolveAnchor(current.anchor, roomRoot);
          root.position.copy(anchor.position);
          root.rotation.y = anchor.rotationY;
        }
        ctx.fromPos.copy(root.position);
        ctx.toPos.copy(root.position);
        avatarRef.current?.play('sitting', 250);
        setClip('sitting');
        setStoreState({ isWalking: false, location: current.anchor });
        currentLocationRef.current = current.anchor;
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
        // typing flow auto-chain: sit_to_type → typing(loop) → type_to_sit
        // so the brain only has to emit one play_clip:'typing'. If the
        // transitions aren't loaded the chain falls through to plain typing.
        if (current.clip === 'typing') {
          const handle = avatarRef.current;
          const totalMs = current.durationMs ?? 5000;
          ctx.totalDuration = totalMs / 1000;
          (async () => {
            if (!handle) return;
            await handle.playOnce('sit_to_type', 180);
            handle.play('typing', 220);
            setClip('typing');
            // schedule the type→sit return so the avatar isn't stuck typing
            const remainingMs = Math.max(800, totalMs - 1400);
            window.setTimeout(() => {
              if (currentActionAtTimeoutRef.current === current.id) {
                handle.playOnce('type_to_sit', 220).then(() => {
                  handle.play('sitting', 220);
                });
              }
            }, remainingMs);
          })();
          currentActionAtTimeoutRef.current = current.id;
          break;
        }
        avatarRef.current?.play(current.clip, 200);
        setClip(current.clip);
        ctx.totalDuration = (current.durationMs ?? 800) / 1000;
        break;
      }
      case 'face': {
        let targetWorldPos: THREE.Vector3;
        if (current.target === 'user') {
          // read live player position so face(user) tracks WASD movement
          // instead of pointing at the old hardcoded +Z spawn assumption
          const player = useAngelStore.getState().player;
          targetWorldPos = new THREE.Vector3(player.x, player.y, player.z);
        } else {
          const anchor = resolveAnchor(current.target as AnchorId, roomRoot);
          targetWorldPos = anchor.position;
        }
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
      case 'interact_with': {
        // macro: expand into a sequence based on the interactable's verb.
        // The actual choreography is the hardcoded animation chain below;
        // we enqueue child actions and immediately complete this one.
        const it = getInteractable(current.interactableId);
        if (!it) {
          console.warn('[interact_with] unknown interactable', current.interactableId);
          ctx.totalDuration = 0;
          break;
        }
        const expanded = expandInteract(current, it.id, it.kind, it.anchorId, it.pairedChairId);
        if (expanded.length > 0) {
          // push to the front (well, back — but no actions should be queued
          // behind interact_with by design) so the chain runs immediately
          enqueue(expanded);
        }
        // mark this interact_with as instantly done; popNext will pull the
        // first child action next frame
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
  }, [current, avatarRef, roomRoot, setStoreState, showBubble, appendChat, setClip, enqueue]);

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
      case 'walk_to':
      case 'walk_to_user': {
        // For walk_to_user we ALSO want the target to track the player live
        // (they may have moved since action began). Recompute toPos every
        // frame for that case.
        if (current.type === 'walk_to_user') {
          const player = useAngelStore.getState().player;
          const stopShort = current.stopDistance ?? 1.4;
          const dxP = player.x - root.position.x;
          const dzP = player.z - root.position.z;
          const distP = Math.hypot(dxP, dzP);
          if (distP > stopShort + ARRIVE_EPS) {
            const t2 = (distP - stopShort) / distP;
            ctx.toPos.set(root.position.x + dxP * t2, root.position.y, root.position.z + dzP * t2);
          }
          ctx.toRotY = Math.atan2(player.x - ctx.toPos.x, player.z - ctx.toPos.z);
        }

        // velocity-driven walk with capsule collision. moves toward the
        // target each frame, slides along walls if blocked, and rotates to
        // face the direction of motion.
        const speed = SPEED_M_S[current.speed ?? 'normal'];
        const dx = ctx.toPos.x - root.position.x;
        const dz = ctx.toPos.z - root.position.z;
        const distToTarget = Math.hypot(dx, dz);

        const arrived = distToTarget < ARRIVE_EPS;
        const timedOut = elapsed >= ctx.totalDuration;
        if (arrived || timedOut) {
          console.info('[walk] done', {
            type: current.type,
            anchor: current.type === 'walk_to' ? current.anchor : 'user',
            arrived,
            timedOut,
            elapsed: elapsed.toFixed(2),
            from: ctx.fromPos.toArray().map((n) => n.toFixed(2)),
            to: ctx.toPos.toArray().map((n) => n.toFixed(2)),
            final: root.position.toArray().map((n) => n.toFixed(2)),
          });
          if (arrived) {
            root.position.x = ctx.toPos.x;
            root.position.z = ctx.toPos.z;
          }
          root.rotation.y = ctx.toRotY;
          avatarRef.current?.play('idle', 200);
          setClip('idle');
          if (current.type === 'walk_to_user' || current.anchor === 'user') {
            setStoreState({ isWalking: false, walkTarget: null });
          } else {
            setStoreState({ isWalking: false, walkTarget: null, location: current.anchor });
            currentLocationRef.current = current.anchor;
          }
          finish(current);
          break;
        }

        // step toward target this frame
        const stepLen = Math.min(distToTarget, speed * dt);
        const dirX = dx / distToTarget;
        const dirZ = dz / distToTarget;
        const next = root.position.clone();
        next.x += dirX * stepLen;
        next.z += dirZ * stepLen;

        const corrected = resolveCollision({
          current: root.position,
          target: next,
          radius: AVATAR_COLLIDER_RADIUS,
          colliders: collidersRef.current,
        });
        root.position.x = corrected.x;
        root.position.z = corrected.z;

        // face direction of actual motion (after collision) so she pivots
        // along walls rather than facing through them
        const moveDx = corrected.x - ctx.fromPos.x;
        const moveDz = corrected.z - ctx.fromPos.z;
        const lookDir = Math.atan2(
          ctx.toPos.x - root.position.x,
          ctx.toPos.z - root.position.z,
        );
        // mostly aim at the target, but blend in motion direction so she
        // doesn't moon-walk against a wall
        const motionLen = Math.hypot(moveDx, moveDz);
        const motionDir = motionLen > 0.05 ? Math.atan2(moveDx, moveDz) : lookDir;
        // blend look-at and motion-direction in shortest-angle space so we
        // never get a 180° flip when the two angles straddle ±π
        const targetYaw = lookDir + shortestAngleDelta(lookDir, motionDir) * 0.4;
        const yawDelta = shortestAngleDelta(root.rotation.y, targetYaw);
        root.rotation.y += yawDelta * Math.min(1, dt * 8);
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
      case 'interact_with':
        // already expanded into child actions; complete the placeholder
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

/* -------------------------------------------------------------------------- */
/* interact_with macro expansion                                              */
/* -------------------------------------------------------------------------- */

let _expandSeq = 0;
const newId = (suffix: string) => `expand_${Date.now().toString(36)}_${(_expandSeq++).toString(36)}_${suffix}`;

/**
 * Translate an `interact_with` action into the underlying animation chain.
 * Knows how to compose walk_to → face → sit_at → play_clip(typing) for the
 * "sit and type" verb, and simpler chains for the rest.
 */
function expandInteract(
  src: Extract<SceneAction, { type: 'interact_with' }>,
  interactableId: string,
  kind: string,
  anchorId: AnchorId | undefined,
  pairedChairId: string | undefined,
): SceneAction[] {
  const verb = src.verb;
  const out: SceneAction[] = [];
  const fallbackAnchor: AnchorId = anchorId ?? 'center';

  /** Read the calibrated approach anchor (or worldPos fallback) off an
   *  interactable. This is the single source of truth — the legacy
   *  resolveAnchor system is bypassed entirely so calibrated overrides
   *  always win. */
  function approachOf(id: string): { pos: [number, number, number]; yaw: number } | null {
    const it = getInteractable(id);
    if (!it) return null;
    if (it.approachAnchor) {
      return {
        pos: [it.approachAnchor.pos.x, it.approachAnchor.pos.y, it.approachAnchor.pos.z],
        yaw: it.approachAnchor.yaw,
      };
    }
    return { pos: [it.worldPos.x, 0, it.worldPos.z], yaw: 0 };
  }

  if (verb === 'sit_and_type') {
    const chairId = pairedChairId ?? interactableId;
    const a = approachOf(chairId);
    const chair = getInteractable(chairId);
    const chairAnchor = (chair?.anchorId ?? fallbackAnchor) as AnchorId;
    out.push(
      {
        id: newId('walk'),
        type: 'walk_to',
        anchor: chairAnchor,
        speed: 'normal',
        ...(a ? { posOverride: a.pos, yawOverride: a.yaw } : {}),
      },
      {
        id: newId('sit'),
        type: 'sit_at',
        anchor: chairAnchor,
        ...(a ? { posOverride: a.pos, yawOverride: a.yaw } : {}),
      },
      { id: newId('type'), type: 'play_clip', clip: 'typing', durationMs: src.durationMs ?? 8000 },
    );
  } else if (verb === 'sit' || verb === 'sit_playful') {
    const a = approachOf(interactableId);
    out.push(
      {
        id: newId('walk'),
        type: 'walk_to',
        anchor: fallbackAnchor,
        speed: 'normal',
        ...(a ? { posOverride: a.pos, yawOverride: a.yaw } : {}),
      },
      {
        id: newId('sit'),
        type: 'sit_at',
        anchor: fallbackAnchor,
        ...(a ? { posOverride: a.pos, yawOverride: a.yaw } : {}),
      },
    );
    if (verb === 'sit_playful') {
      out.push({ id: newId('clip'), type: 'play_clip', clip: 'sitting_playful', durationMs: 4000 });
    }
  } else if (verb === 'look_out' || verb === 'browse') {
    const a = approachOf(interactableId);
    out.push({
      id: newId('walk'),
      type: 'walk_to',
      anchor: fallbackAnchor,
      speed: 'normal',
      ...(a ? { posOverride: a.pos, yawOverride: a.yaw } : {}),
    });
    if (verb === 'browse') {
      out.push({ id: newId('read'), type: 'play_clip', clip: 'reading', durationMs: 4000 });
    } else {
      out.push({ id: newId('thk'), type: 'play_clip', clip: 'thinking', durationMs: 2400 });
    }
  } else if (verb === 'open' || verb === 'lay_down') {
    const a = approachOf(interactableId);
    out.push({
      id: newId('walk'),
      type: 'walk_to',
      anchor: fallbackAnchor,
      speed: 'normal',
      ...(a ? { posOverride: a.pos, yawOverride: a.yaw } : {}),
    });
  }

  console.info('[interact_with] expanded', interactableId, kind, verb, '→', out.length, 'actions');
  return out;
}
