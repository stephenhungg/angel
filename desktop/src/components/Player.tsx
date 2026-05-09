import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { resolveCollision, groundProbe, STEP_UP_MAX } from '@/lib/collision';
import { useAngelStore } from '@/stores/angel';

type PlayerProps = {
  /** the loaded room scene root — collision rays are cast against its meshes */
  roomRoot: THREE.Object3D | null;
  /** spawn position in world units; default = back of room facing in */
  spawn?: [number, number, number];
  /** spawn yaw (radians); default = 0 (facing −Z, into the room) */
  spawnYaw?: number;
  /** capsule radius for wall clearance */
  radius?: number;
  /** eye height above feet */
  eyeHeight?: number;
  /** is the pointer currently locked? movement is disabled when not. */
  locked: boolean;
};

const WALK_SPEED = 2.6;          // m/s (a brisk indoor pace)
const SPRINT_MULT = 1.65;
const ACCEL = 28;                // m/s² — stops feel snappy
const FRICTION = 14;
const MOUSE_SENSITIVITY = 0.0024;
const GRAVITY = 22;              // m/s² (heavier than real life — feels less floaty)
const TERMINAL_VY = -28;         // clamp fall speed
const HARD_FLOOR_Y = 0;          // safety net: never let the player drop below world y=0

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
};

/** First-person WASD + mouse-look controller. */
export function Player({
  roomRoot,
  /** spawn 2m back from origin, facing the avatar at world (0,0,0) */
  spawn = [0, 0, 2.2],
  /** yaw=0 → looking down −Z (forward in three's default camera frame) */
  spawnYaw = 0,
  radius = 0.32,
  eyeHeight = 1.55,
  locked,
}: PlayerProps) {
  const { camera } = useThree();
  const setPlayerState = useAngelStore((s) => s.setPlayer);

  const positionRef = useRef(new THREE.Vector3(spawn[0], spawn[1], spawn[2]));
  // horizontal velocity in xz; vyRef tracks vertical velocity separately
  const velocityRef = useRef(new THREE.Vector3());
  const vyRef = useRef(0);
  const groundedRef = useRef(true);
  const yawRef = useRef(spawnYaw);
  const pitchRef = useRef(0);
  const bobPhaseRef = useRef(0);

  const keysRef = useRef<Record<string, boolean>>({});

  // gather collider meshes once room is ready (skip the floor plane added
  // separately — that's at y=−0.001 and only catches feet, fine)
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

  // keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // mouse look (only when pointer is locked)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      yawRef.current -= e.movementX * MOUSE_SENSITIVITY;
      pitchRef.current -= e.movementY * MOUSE_SENSITIVITY;
      // clamp pitch so we never look straight up/down (cursed)
      const limit = Math.PI / 2 - 0.05;
      if (pitchRef.current > limit) pitchRef.current = limit;
      if (pitchRef.current < -limit) pitchRef.current = -limit;
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // initialize camera
  useEffect(() => {
    camera.position.set(spawn[0], spawn[1] + eyeHeight, spawn[2]);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, spawnYaw, 0);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const c = camera as THREE.PerspectiveCamera;
      c.fov = 62;
      c.updateProjectionMatrix();
    }
  }, [camera, spawn, spawnYaw, eyeHeight]);

  // 'R' respawns at the configured spawn point — failsafe for "I clipped
  // through a wall and now I'm in the void" moments
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyR') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      positionRef.current.set(spawn[0], spawn[1], spawn[2]);
      velocityRef.current.set(0, 0, 0);
      vyRef.current = 0;
      yawRef.current = spawnYaw;
      pitchRef.current = 0;
      console.info('[player] respawned');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spawn, spawnYaw]);

  useFrame((_, dt) => {
    const dtClamped = Math.min(dt, 0.05); // avoid huge jumps after a stutter

    // input intent
    const k = keysRef.current;
    let intentX = 0;
    let intentZ = 0;
    if (locked) {
      if (KEYS.forward.some((c) => k[c])) intentZ -= 1;
      if (KEYS.back.some((c) => k[c])) intentZ += 1;
      if (KEYS.left.some((c) => k[c])) intentX -= 1;
      if (KEYS.right.some((c) => k[c])) intentX += 1;
    }
    const sprinting = locked && KEYS.sprint.some((c) => k[c]);
    const intentLen = Math.hypot(intentX, intentZ);
    if (intentLen > 0) {
      intentX /= intentLen;
      intentZ /= intentLen;
    }

    // rotate intent into world space using current yaw
    const sinY = Math.sin(yawRef.current);
    const cosY = Math.cos(yawRef.current);
    const wantX = intentX * cosY + intentZ * sinY;
    const wantZ = -intentX * sinY + intentZ * cosY;

    // apply acceleration in horizontal plane
    const v = velocityRef.current;
    const speed = WALK_SPEED * (sprinting ? SPRINT_MULT : 1);
    const targetVx = wantX * speed;
    const targetVz = wantZ * speed;
    v.x = THREE.MathUtils.damp(v.x, targetVx, intentLen > 0 ? ACCEL / 4 : FRICTION / 2, dtClamped);
    v.z = THREE.MathUtils.damp(v.z, targetVz, intentLen > 0 ? ACCEL / 4 : FRICTION / 2, dtClamped);

    // ── horizontal movement ──────────────────────────────────────────────
    const next = positionRef.current.clone();
    next.x += v.x * dtClamped;
    next.z += v.z * dtClamped;

    const corrected = resolveCollision({
      current: positionRef.current,
      target: next,
      radius,
      colliders: collidersRef.current,
    });
    // if we got blocked, kill velocity along that axis so we don't keep
    // pressing into the wall and waste cycles
    if (Math.abs(corrected.x - next.x) > 0.0001) v.x = 0;
    if (Math.abs(corrected.z - next.z) > 0.0001) v.z = 0;

    // ── vertical movement (gravity + ground detection) ───────────────────
    if (collidersRef.current.length > 0) {
      // gravity is always integrating; we stop it when grounded.
      vyRef.current = Math.max(vyRef.current - GRAVITY * dtClamped, TERMINAL_VY);

      const candidateY = corrected.y + vyRef.current * dtClamped;
      const groundY = groundProbe(corrected, collidersRef.current);

      if (groundY != null) {
        const stepUp = groundY - positionRef.current.y;
        if (stepUp > STEP_UP_MAX) {
          // ground would require teleporting up onto a desk/dresser/etc.
          // revert horizontal motion — you bumped into it, you stop.
          corrected.x = positionRef.current.x;
          corrected.z = positionRef.current.z;
          v.x = 0;
          v.z = 0;
          const curGround = groundProbe(positionRef.current, collidersRef.current);
          corrected.y = curGround ?? candidateY;
          vyRef.current = 0;
          groundedRef.current = true;
        } else if (candidateY <= groundY) {
          // we'd fall into / through the ground this frame — snap to it
          corrected.y = groundY;
          vyRef.current = 0;
          groundedRef.current = true;
        } else {
          // airborne above ground (e.g. just stepped off a ledge)
          corrected.y = candidateY;
          groundedRef.current = false;
        }
      } else {
        // void — keep falling
        corrected.y = candidateY;
        groundedRef.current = false;
      }

      // hard safety: never let the player drop below world floor y=0
      if (corrected.y < HARD_FLOOR_Y) {
        corrected.y = HARD_FLOOR_Y;
        vyRef.current = 0;
        groundedRef.current = true;
      }
    }
    // (when no colliders are loaded yet we just keep current y so the player
    // hovers in place rather than freefalling through an empty world.)

    positionRef.current.copy(corrected);

    // camera placement (with subtle head bob while moving on the ground)
    const moving = Math.hypot(v.x, v.z) > 0.4 && locked;
    bobPhaseRef.current += dtClamped * (sprinting ? 11 : 7.5);
    const bobAmp = moving && groundedRef.current ? (sprinting ? 0.045 : 0.028) : 0;
    const bobY = Math.sin(bobPhaseRef.current) * bobAmp;
    const bobX = Math.cos(bobPhaseRef.current * 0.5) * bobAmp * 0.5;

    camera.position.set(
      corrected.x + Math.sin(yawRef.current + Math.PI / 2) * bobX,
      corrected.y + eyeHeight + bobY,
      corrected.z + Math.cos(yawRef.current + Math.PI / 2) * bobX,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yawRef.current;
    camera.rotation.x = pitchRef.current;
    camera.rotation.z = 0;

    // surface position to the store so the avatar can look at the player
    setPlayerState({
      x: corrected.x,
      y: corrected.y + eyeHeight,
      z: corrected.z,
      yaw: yawRef.current,
      moving,
    });
  });

  return null;
}
