import * as THREE from 'three';

/**
 * Cheap "capsule vs scene" collision test.
 *
 * For hackathon speed we don't run a full physics engine — instead we cast
 * a handful of rays out from the player's body and clamp movement along
 * each axis if a wall is too close. Classic Quake/Unity-style FPS controller
 * stuff. With multi-height samples + step-up logic + gravity it gives a
 * surprisingly real "you can't walk through walls or climb your dresser"
 * feel without cannon/rapier overhead.
 */

const RAY_DIRS_2D = (() => {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
  }
  return out;
})();

const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true as never; // BVH hint (no-op if not built)

/** vertical sample heights above feet for the horizontal capsule. ankle +
 *  waist + head catches low tables, walls, and overhead beams. */
export const DEFAULT_BODY_SAMPLES_Y = [0.3, 0.95, 1.45] as const;

/** the max vertical step the player can absorb without being blocked. a
 *  curb yes, a desk no. */
export const STEP_UP_MAX = 0.35;

export type CollisionInput = {
  /** current world position (player feet) */
  current: THREE.Vector3;
  /** desired world position after this frame's movement */
  target: THREE.Vector3;
  /** radius around the capsule we want to keep clear of walls */
  radius: number;
  /** scene meshes to collide against */
  colliders: THREE.Object3D[];
  /** sample heights above feet; defaults to ankle/waist/head */
  sampleYs?: readonly number[];
};

/**
 * Returns a corrected target. If the player would have stepped into a wall,
 * the position is slid along the wall (axis-separated check) so corners
 * don't lock you up.
 */
export function resolveCollision(input: CollisionInput): THREE.Vector3 {
  const { current, target, radius, colliders } = input;
  if (colliders.length === 0) return target.clone();

  const sampleYs = input.sampleYs ?? DEFAULT_BODY_SAMPLES_Y;
  const safe = current.clone();

  // try each axis independently so we slide along walls instead of sticking
  const tryAxis = (axis: 'x' | 'z') => {
    const candidate = safe.clone();
    candidate[axis] = target[axis];
    if (isClear(candidate, sampleYs, radius, colliders)) {
      safe[axis] = target[axis];
    }
  };

  tryAxis('x');
  tryAxis('z');
  return safe;
}

function isClear(
  pos: THREE.Vector3,
  sampleYs: readonly number[],
  radius: number,
  colliders: THREE.Object3D[],
): boolean {
  for (const sampleY of sampleYs) {
    const origin = new THREE.Vector3(pos.x, pos.y + sampleY, pos.z);
    for (const dir of RAY_DIRS_2D) {
      _ray.set(origin, dir);
      _ray.far = radius;
      const hits = _ray.intersectObjects(colliders, true);
      if (hits.length > 0 && hits[0].distance < radius) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Probe the ground beneath `pos`. Casts down from `feet + STEP_UP_MAX` so
 * that small curbs/steps register as ground but tall obstacles (like a desk
 * top higher than the cast origin) do not — preventing the "I walked over
 * the desk and got teleported up" bug.
 *
 * Returns the world y of the ground if found, else null (i.e. falling).
 */
export function groundProbe(
  pos: THREE.Vector3,
  colliders: THREE.Object3D[],
  maxDrop = 2.5,
): number | null {
  if (colliders.length === 0) return null;
  const origin = new THREE.Vector3(pos.x, pos.y + STEP_UP_MAX, pos.z);
  _ray.set(origin, new THREE.Vector3(0, -1, 0));
  _ray.far = STEP_UP_MAX + maxDrop;
  const hits = _ray.intersectObjects(colliders, true);
  if (hits.length === 0) return null;
  return hits[0].point.y;
}

/**
 * Probe the ceiling above `pos`. Used for upward velocity capping (when we
 * eventually add jumping). Returns world y of the ceiling, or null.
 */
export function ceilingProbe(
  pos: THREE.Vector3,
  eyeHeight: number,
  colliders: THREE.Object3D[],
  maxRise = 1.0,
): number | null {
  if (colliders.length === 0) return null;
  const origin = new THREE.Vector3(pos.x, pos.y + eyeHeight, pos.z);
  _ray.set(origin, new THREE.Vector3(0, 1, 0));
  _ray.far = maxRise;
  const hits = _ray.intersectObjects(colliders, true);
  if (hits.length === 0) return null;
  return hits[0].point.y;
}

/**
 * Returns true if the player capsule has wall clearance at `pos`. Used
 * outside the per-frame loop (e.g. spawn search) so we don't have to
 * hand-roll the same multi-ray sweep.
 */
export function isPositionClear(
  pos: THREE.Vector3,
  radius: number,
  colliders: THREE.Object3D[],
  sampleYs: readonly number[] = DEFAULT_BODY_SAMPLES_Y,
): boolean {
  if (colliders.length === 0) return true;
  return isClear(pos, sampleYs, radius, colliders);
}

/**
 * Spiral outward from `preferred` looking for a position with capsule
 * clearance and ground beneath it. Use at room-load time so we never spawn
 * the player inside a desk/dresser/wall.
 *
 * Tries the preferred point first, then samples on rings of increasing
 * radius (every ~30°). Returns the first clear sample, or `preferred` if
 * nothing's clear within `maxSearchRadius` (you'll still respawn cleanly
 * via R, so this never traps the user).
 */
export function findClearSpawn(
  preferred: THREE.Vector3,
  radius: number,
  colliders: THREE.Object3D[],
  opts: { maxSearchRadius?: number; rings?: number; samplesPerRing?: number } = {},
): THREE.Vector3 {
  if (colliders.length === 0) return preferred.clone();

  const maxR = opts.maxSearchRadius ?? 3.5;
  const rings = opts.rings ?? 8;
  const samples = opts.samplesPerRing ?? 12;

  // try preferred first
  const probe = new THREE.Vector3();
  const tryAt = (x: number, z: number): THREE.Vector3 | null => {
    probe.set(x, preferred.y, z);
    const ground = groundProbe(probe, colliders);
    if (ground == null) return null; // no floor here → outside the room
    probe.y = ground;
    return isPositionClear(probe, radius, colliders) ? probe.clone() : null;
  };

  const first = tryAt(preferred.x, preferred.z);
  if (first) return first;

  for (let r = 1; r <= rings; r++) {
    const dist = (maxR * r) / rings;
    for (let s = 0; s < samples; s++) {
      const a = (s / samples) * Math.PI * 2;
      const x = preferred.x + Math.cos(a) * dist;
      const z = preferred.z + Math.sin(a) * dist;
      const hit = tryAt(x, z);
      if (hit) return hit;
    }
  }
  // give up — caller's preferred point will at least let R-respawn work
  return preferred.clone();
}
