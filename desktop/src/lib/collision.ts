import * as THREE from 'three';

/**
 * Cheap "capsule vs scene" collision test.
 *
 * For hackathon speed we don't run a full physics engine — instead we cast
 * a handful of rays out from the player's torso/feet and clamp movement
 * along each axis if a wall is too close. This is the technique used in
 * most Quake/Unity-style FPS controllers and gives perfectly serviceable
 * wall-sliding without the overhead of cannon/rapier.
 *
 * The collider is a vertical capsule of radius `r` centered at the player's
 * feet+eyes range. Cardinal rays in 8 directions catch corners reasonably
 * well as long as the player radius is bigger than the wall's depth (true
 * for our anime room).
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

export type CollisionInput = {
  /** current world position (player feet) */
  current: THREE.Vector3;
  /** desired world position after this frame's movement */
  target: THREE.Vector3;
  /** radius around the capsule we want to keep clear of walls */
  radius: number;
  /** scene meshes to collide against */
  colliders: THREE.Object3D[];
  /** sample the rays at this height above the feet (mid-torso) */
  sampleY?: number;
};

/**
 * Returns a corrected target position. If the player would have stepped
 * into a wall the position is slid along the wall (axis-separated check).
 */
export function resolveCollision(input: CollisionInput): THREE.Vector3 {
  const { current, target, radius, colliders } = input;
  if (colliders.length === 0) return target.clone();

  const sampleY = input.sampleY ?? 0.9;
  const safe = current.clone();

  // try each axis independently so we slide along walls instead of sticking
  const tryAxis = (axis: 'x' | 'z') => {
    const candidate = safe.clone();
    candidate[axis] = target[axis];
    if (isClear(candidate, sampleY, radius, colliders)) {
      safe[axis] = target[axis];
    }
  };

  tryAxis('x');
  tryAxis('z');
  return safe;
}

function isClear(
  pos: THREE.Vector3,
  sampleY: number,
  radius: number,
  colliders: THREE.Object3D[],
): boolean {
  const origin = new THREE.Vector3(pos.x, pos.y + sampleY, pos.z);
  for (const dir of RAY_DIRS_2D) {
    _ray.set(origin, dir);
    _ray.far = radius;
    const hits = _ray.intersectObjects(colliders, true);
    if (hits.length > 0 && hits[0].distance < radius) {
      return false;
    }
  }
  return true;
}

/** Returns true if the floor is within `maxDrop` directly below `pos`. Used
 *  for sticking the player to floors that aren't perfectly flat. Returns
 *  the ground Y if found. */
export function groundProbe(
  pos: THREE.Vector3,
  colliders: THREE.Object3D[],
  fromHeight = 1.5,
  maxDrop = 3.0,
): number | null {
  const origin = new THREE.Vector3(pos.x, pos.y + fromHeight, pos.z);
  _ray.set(origin, new THREE.Vector3(0, -1, 0));
  _ray.far = fromHeight + maxDrop;
  const hits = _ray.intersectObjects(colliders, true);
  if (hits.length === 0) return null;
  return hits[0].point.y;
}
