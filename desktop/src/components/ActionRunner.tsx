import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { RefObject } from 'react';
import type { AnchorId, SceneAction } from '@angel/shared';

import { useAngelStore } from '@/stores/angel';
import { resolveAnchor, isChairAnchor, yawToFace } from '@/lib/anchors';
import type { AvatarHandle } from '@/components/Avatar';
import { ipc } from '@/lib/ipc';
import { resolveCollision } from '@/lib/collision';
import { getInteractable, approachByLabel, seatPoseOf } from '@/lib/interactables';
import { getColliders } from '@/lib/colliders';
import { planPath, isStraightShot, getActiveGrid } from '@/lib/pathfind';

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
const ARRIVE_EPS = 0.10;
/** distance to the next waypoint at which we advance to the one after */
const WAYPOINT_EPS = 0.18;
/** absolute upper bound — even huge walks must finish inside this many sec */
const WALK_TIMEOUT_S = 12;
/** progress increments smaller than this don't reset the stuck timer */
const PROGRESS_EPS = 0.012;
/** if no real progress for this many seconds, give up and fail the action */
const STUCK_THRESHOLD_S = 0.7;

/** Per-action runtime — kept on the ref so we don't re-render on each frame. */
type Vec2 = { x: number; z: number };
type RunCtx = {
  startedAt: number;
  // walk_to
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromRotY: number;
  toRotY: number;
  totalDuration: number; // seconds
  /** waypoints to follow, world (x,z). Last entry is the final target. */
  path: Vec2[];
  /** index of the waypoint we're currently steering toward */
  pathIdx: number;
  /** which collider layer the avatar is colliding against this walk */
  walkColliders: THREE.Object3D[];
  /** stuck-detection bookkeeping (in elapsed seconds) */
  lastProgressAt: number;
  lastDist: number;
  /** wait (legacy, retained for clarity) */
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
  // walks can slide along walls rather than clip through them. Two layers:
  //   - allColliders: every mesh; used for raw walk_to(anchor) where we
  //     don't know whether the avatar is meant to dock at furniture.
  //   - wallColliders: walls/floors/ceilings only; used for interact_with
  //     macros (posOverride present) so the avatar doesn't bump into the
  //     chair she's about to sit on.
  const allCollidersRef = useRef<THREE.Object3D[]>([]);
  const wallCollidersRef = useRef<THREE.Object3D[]>([]);
  useEffect(() => {
    if (!roomRoot) {
      allCollidersRef.current = [];
      wallCollidersRef.current = [];
      return;
    }
    allCollidersRef.current = getColliders(roomRoot, 'all');
    wallCollidersRef.current = getColliders(roomRoot, 'wall');
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
      path: [],
      pathIdx: 0,
      walkColliders: allCollidersRef.current,
      lastProgressAt: 0,
      lastDist: 0,
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
          ctx.toRotY = yawToFace(player.x - ctx.toPos.x, player.z - ctx.toPos.z);
        } else {
          const anchor = resolveAnchor(current.anchor, roomRoot);
          ctx.toPos = anchor.position.clone();
          ctx.toRotY = anchor.rotationY;
        }
        // furniture-passthrough: if the brain emitted a calibrated coord, the
        // walk is part of an interact_with macro and the avatar is meant to
        // dock at a piece of furniture — disable furniture collision so she
        // can actually reach it.
        ctx.walkColliders = current.posOverride ? wallCollidersRef.current : allCollidersRef.current;
        initWalkPath(ctx, root.position, current.speed ?? 'normal');
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
        ctx.toRotY = yawToFace(player.x - ctx.toPos.x, player.z - ctx.toPos.z);
        // walls-only collision on come-to-me. The user is the destination
        // and the user already lives in walkable space, so any furniture
        // between her and them (notably the chair/desk she's just standing
        // up from) should pass through. Walls still bound her to the room.
        ctx.walkColliders = wallCollidersRef.current;
        initWalkPath(ctx, root.position, current.speed ?? 'normal');
        avatarRef.current?.play('walking', 200);
        setClip('walking');
        setStoreState({ isWalking: true, walkTarget: null });
        break;
      }
      case 'sit_at': {
        // chair guard — refuse to sit on non-chair anchors (window, door,
        // window...). Logs and degrades to an idle pose.
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
        // jumping jacks auto-chain: start_jumping_jacks → jumping_jacks(loop)
        // → stop_jumping_jacks → idle. Brain emits one play_clip:'jumping_jacks'.
        if (current.clip === 'jumping_jacks') {
          const handle = avatarRef.current;
          const totalMs = current.durationMs ?? 5000;
          ctx.totalDuration = totalMs / 1000;
          (async () => {
            if (!handle) return;
            await handle.playOnce('start_jumping_jacks', 160);
            handle.play('jumping_jacks', 200);
            setClip('jumping_jacks');
            const remainingMs = Math.max(700, totalMs - 1400);
            window.setTimeout(() => {
              if (currentActionAtTimeoutRef.current === current.id) {
                handle.playOnce('stop_jumping_jacks', 200).then(() => {
                  handle.play('idle', 220);
                  setClip('idle');
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
        ctx.toRotY = yawToFace(dx, dz);
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
        const expanded = expandInteract(current, it.id, it.kind, it.anchorId, it.pairedChairId, current.approachLabel);
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
        // (they may have moved since action began). Recompute toPos and the
        // path's terminal waypoint every frame for that case.
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
          ctx.toRotY = yawToFace(player.x - ctx.toPos.x, player.z - ctx.toPos.z);
          // keep the final waypoint anchored to the live target
          if (ctx.path.length > 0) {
            ctx.path[ctx.path.length - 1] = { x: ctx.toPos.x, z: ctx.toPos.z };
          }
        }

        // pick the waypoint we're steering toward this frame
        const waypoint = ctx.path[ctx.pathIdx] ?? { x: ctx.toPos.x, z: ctx.toPos.z };
        const wpDx = waypoint.x - root.position.x;
        const wpDz = waypoint.z - root.position.z;
        const distToWp = Math.hypot(wpDx, wpDz);

        // arrival is judged by distance to the FINAL waypoint, regardless
        // of where we are in the path — this lets the late waypoints'
        // "close enough" eps fire even if pathfinding overshoots slightly.
        const finalWp = ctx.path[ctx.path.length - 1] ?? { x: ctx.toPos.x, z: ctx.toPos.z };
        const distToFinal = Math.hypot(
          finalWp.x - root.position.x,
          finalWp.z - root.position.z,
        );

        // stuck detection — track meaningful progress toward the final
        // target. If we haven't moved closer in STUCK_THRESHOLD_S, the
        // path is wedged against a collider and we should bail out.
        if (ctx.lastDist - distToFinal > PROGRESS_EPS) {
          ctx.lastDist = distToFinal;
          ctx.lastProgressAt = elapsed;
        }
        const stuck = elapsed - ctx.lastProgressAt > STUCK_THRESHOLD_S;

        const arrived = distToFinal < ARRIVE_EPS;
        const timedOut = elapsed >= ctx.totalDuration;
        if (arrived || timedOut || stuck) {
          console.info('[walk] done', {
            type: current.type,
            anchor: current.type === 'walk_to' ? current.anchor : 'user',
            arrived,
            timedOut,
            stuck,
            elapsed: elapsed.toFixed(2),
            from: ctx.fromPos.toArray().map((n) => n.toFixed(2)),
            to: ctx.toPos.toArray().map((n) => n.toFixed(2)),
            final: root.position.toArray().map((n) => n.toFixed(2)),
            pathLen: ctx.path.length,
            pathIdx: ctx.pathIdx,
          });
          // scripted destinations (posOverride present) are authoritative —
          // if the path-walker gives up because of furniture mis-classified
          // as wall, just teleport the rest of the way instead of cancelling
          // the chained sit_at. Free-form walk_to without an override still
          // bails (so the brain can adapt and try a different path).
          const isScripted = current.type === 'walk_to' && !!current.posOverride;
          const recovered = !arrived && (stuck || timedOut) && isScripted;
          if (arrived || recovered) {
            root.position.x = ctx.toPos.x;
            root.position.z = ctx.toPos.z;
          }
          root.rotation.y = ctx.toRotY;
          avatarRef.current?.play('idle', 200);
          setClip('idle');
          if (current.type === 'walk_to_user' || current.anchor === 'user') {
            setStoreState({ isWalking: false, walkTarget: null });
          } else {
            const ok = arrived || recovered;
            setStoreState({
              isWalking: false,
              walkTarget: null,
              location: ok ? current.anchor : currentLocationRef.current,
            });
            if (ok) currentLocationRef.current = current.anchor;
          }
          if (recovered) {
            console.info('[walk] recovered via teleport (scripted destination)', {
              distToFinal: distToFinal.toFixed(2),
              stuck,
              timedOut,
            });
          }
          // brain feedback: success when we arrived OR recovered; failure
          // only when a free-form walk got wedged so the agent can adapt.
          finish(current, arrived || recovered, { stuck, timedOut, distToFinal });
          break;
        }

        // advance to the next waypoint when we're close enough to the
        // current one. The final waypoint uses ARRIVE_EPS above so we
        // don't slam to a stop short of the target.
        if (distToWp < WAYPOINT_EPS && ctx.pathIdx < ctx.path.length - 1) {
          ctx.pathIdx += 1;
        }

        // step toward the active waypoint this frame
        const speed = SPEED_M_S[current.speed ?? 'normal'];
        const stepLen = Math.min(distToWp, speed * dt);
        if (distToWp > 1e-4) {
          const dirX = wpDx / distToWp;
          const dirZ = wpDz / distToWp;
          const next = root.position.clone();
          next.x += dirX * stepLen;
          next.z += dirZ * stepLen;

          const corrected = resolveCollision({
            current: root.position,
            target: next,
            radius: AVATAR_COLLIDER_RADIUS,
            colliders: ctx.walkColliders,
          });
          root.position.x = corrected.x;
          root.position.z = corrected.z;
        }

        // face direction of actual motion (after collision) so she pivots
        // along walls rather than facing through them. yawToFace bakes in
        // the VRM's -Z forward axis so her nose, not her back, points along
        // the walk direction.
        const moveDx = root.position.x - ctx.fromPos.x;
        const moveDz = root.position.z - ctx.fromPos.z;
        const lookDir = yawToFace(wpDx, wpDz);
        const motionLen = Math.hypot(moveDx, moveDz);
        const motionDir = motionLen > 0.05 ? yawToFace(moveDx, moveDz) : lookDir;
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

  function finish(
    action: SceneAction,
    success = true,
    failure?: { stuck: boolean; timedOut: boolean; distToFinal: number },
  ) {
    completeCurrent();
    if (success) {
      ipc.reportActionComplete({ id: action.id, success: true });
    } else {
      // failure path: cancel any chained actions that were queued behind
      // this walk (notably sit_at, which would otherwise teleport the
      // avatar to a destination she never reached). The brain gets the
      // failure signal so it can adapt.
      console.warn('[walk] failed — clearing chained queue', failure);
      useAngelStore.getState().cancelQueue();
      ipc.reportActionComplete({ id: action.id, success: false });
    }
  }

  return null;
}

/**
 * Compute the path + duration budget for a walk_to / walk_to_user.
 * Tries the occupancy-grid pathfinder first (so the avatar routes around
 * walls); falls back to a single straight-line waypoint when the grid
 * isn't baked yet or the start/goal are within line-of-sight anyway.
 *
 * Reads + writes ctx in place: ctx.path, ctx.pathIdx, ctx.totalDuration,
 * ctx.lastDist, ctx.lastProgressAt, ctx.fromPos, ctx.toPos.
 */
function initWalkPath(ctx: RunCtx, fromPosWorld: THREE.Vector3, speedKey: 'slow' | 'normal' | 'urgent') {
  const start = { x: fromPosWorld.x, z: fromPosWorld.z };
  const goal = { x: ctx.toPos.x, z: ctx.toPos.z };
  let path: Vec2[] | null = null;
  const grid = getActiveGrid();
  if (grid) {
    if (isStraightShot(grid, start, goal)) {
      path = [start, goal];
    } else {
      path = planPath(start, goal);
    }
  }
  if (!path || path.length === 0) {
    // grid not ready or unreachable — fall back to straight line. The
    // collision tick will still slide us along walls; if we get truly
    // stuck the stuck-detection will fail us cleanly.
    path = [start, goal];
  }
  ctx.path = path;
  ctx.pathIdx = path.length > 1 ? 1 : 0; // start steering toward 2nd waypoint
  ctx.lastDist = Math.hypot(goal.x - start.x, goal.z - start.z);
  ctx.lastProgressAt = 0;

  // duration budget: expected travel time (path length / speed) with a
  // sane floor (so a 30cm dock doesn't end instantly mid-step) and a
  // hard cap (so a really long path can't run more than WALK_TIMEOUT_S).
  const pathLen = pathLength(path);
  const speed = SPEED_M_S[speedKey];
  const expected = pathLen / speed + 0.4;
  ctx.totalDuration = Math.max(1.5, Math.min(WALK_TIMEOUT_S, expected * 1.4));
  console.info('[walk] init', {
    speedKey,
    speed,
    pathLen: pathLen.toFixed(2),
    waypoints: path.length,
    duration: ctx.totalDuration.toFixed(2),
  });
}

function pathLength(path: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  }
  return total;
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
  approachLabel: string | undefined,
): SceneAction[] {
  const verb = src.verb;
  const out: SceneAction[] = [];
  const fallbackAnchor: AnchorId = anchorId ?? 'center';

  /** Read the calibrated approach (where she stops BEFORE sitting),
   *  honoring approachLabel when present. Returns null when there's no
   *  explicit approach AND no seat — caller decides whether to fall back
   *  to the bbox center (which is INSIDE the chair geometry — she'll get
   *  stuck on collision). For chairs, prefer `stagingFor(id)` instead. */
  function approachOf(id: string): { pos: [number, number, number]; yaw: number } | null {
    const it = getInteractable(id);
    if (!it) return null;
    const a = approachByLabel(it, approachLabel);
    if (a) {
      return { pos: [a.pos.x, a.pos.y, a.pos.z], yaw: a.yaw };
    }
    return { pos: [it.bbox.center.x, 0, it.bbox.center.z], yaw: it.bbox.yaw };
  }

  /** Read the calibrated seat pose (where she ends up AFTER sitting).
   *  Falls back to approach if no explicit seat. */
  function seatOf(id: string): { pos: [number, number, number]; yaw: number } | null {
    const it = getInteractable(id);
    if (!it) return null;
    const seat = seatPoseOf(it);
    if (seat) return { pos: [seat.pos.x, seat.pos.y, seat.pos.z], yaw: seat.yaw };
    return approachOf(id);
  }

  /** Pre-seat staging — where she walks TO before snapping into the seat.
   *  Prefers explicit calibrated approach. If none exists, synthesizes a
   *  point ~0.55m back from the seat in the open direction (opposite the
   *  user's facing) so she lands somewhere walkable instead of bumping the
   *  chair geometry itself. The sit_at that follows snaps her exactly. */
  function stagingFor(id: string, stagingDist = 0.55): { pos: [number, number, number]; yaw: number } | null {
    const it = getInteractable(id);
    if (!it) return null;
    const a = approachByLabel(it, approachLabel);
    if (a) return { pos: [a.pos.x, a.pos.y, a.pos.z], yaw: a.yaw };
    // no explicit approach — derive from the seat. user-forward (where she
    // looks when seated) = (-sin(yaw), -cos(yaw)). open side is the inverse,
    // so staging = seat - forward * dist.
    const seat = seatPoseOf(it);
    if (seat) {
      const fx = -Math.sin(seat.yaw);
      const fz = -Math.cos(seat.yaw);
      return {
        pos: [seat.pos.x - fx * stagingDist, seat.pos.y, seat.pos.z - fz * stagingDist],
        yaw: seat.yaw,
      };
    }
    // no seat either — bbox center (current behavior, may still get stuck)
    return { pos: [it.bbox.center.x, 0, it.bbox.center.z], yaw: it.bbox.yaw };
  }

  if (verb === 'sit_and_type') {
    const chairId = pairedChairId ?? interactableId;
    // walk to a staging point in front of the chair (synthesized from the
    // seat pose if no explicit approach exists), then snap to seat. Avoids
    // bumping the chair geometry on approach when bbox.center is inside it.
    const a = stagingFor(chairId);
    const s = seatOf(chairId);
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
        ...(s ? { posOverride: s.pos, yawOverride: s.yaw } : {}),
      },
      { id: newId('type'), type: 'play_clip', clip: 'typing', durationMs: src.durationMs ?? 8000 },
    );
  } else if (verb === 'sit' || verb === 'sit_playful') {
    const a = stagingFor(interactableId);
    const s = seatOf(interactableId);
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
        ...(s ? { posOverride: s.pos, yawOverride: s.yaw } : {}),
      },
    );
    if (verb === 'sit_playful') {
      out.push({ id: newId('clip'), type: 'play_clip', clip: 'sitting_playful', durationMs: 4000 });
    }
  } else if (verb === 'look_out') {
    const a = approachOf(interactableId);
    out.push({
      id: newId('walk'),
      type: 'walk_to',
      anchor: fallbackAnchor,
      speed: 'normal',
      ...(a ? { posOverride: a.pos, yawOverride: a.yaw } : {}),
    });
    out.push({ id: newId('thk'), type: 'play_clip', clip: 'thinking', durationMs: 2400 });
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
