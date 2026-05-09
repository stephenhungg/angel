import * as THREE from 'three';
import type { AnchorId } from '@angel/shared';

/**
 * Anchor table.
 *
 * Source-of-truth precedence:
 *   1. Named empties in `room.glb` → `Anchor_<Name>` matches first.
 *   2. This hardcoded fallback table — used until the Blender pass.
 *
 * Coords assume the room model is ~5m × 5m, origin at floor-center, +Z facing
 * the doorway. Tune live in browser by changing values here and saving — vite
 * hot-reload picks them up.
 */

export type AnchorTransform = {
  /** world-space position the avatar's feet should occupy at the anchor */
  position: THREE.Vector3;
  /** Y-axis rotation (radians) the avatar should face when arrived */
  rotationY: number;
  /** if this is a sit anchor, what clip auto-fires on arrival */
  sit?: boolean;
  /** human label for debug HUD */
  label: string;
};

export const ANCHOR_FALLBACKS: Record<AnchorId, AnchorTransform> = {
  center: {
    position: new THREE.Vector3(0, 0, 0),
    rotationY: 0,
    label: 'center of room',
  },
  desk_stand: {
    position: new THREE.Vector3(-1.6, 0, -1.2),
    rotationY: -Math.PI / 2, // facing the desk wall
    label: 'desk (standing)',
  },
  desk_sit: {
    position: new THREE.Vector3(-1.6, 0, -1.05),
    rotationY: -Math.PI / 2,
    sit: true,
    label: 'desk chair',
  },
  bookshelf: {
    position: new THREE.Vector3(1.8, 0, -1.2),
    rotationY: Math.PI / 2,
    label: 'bookshelf',
  },
  window: {
    position: new THREE.Vector3(0, 0, -1.8),
    rotationY: Math.PI, // facing out the window
    label: 'window',
  },
  couch_stand: {
    position: new THREE.Vector3(1.4, 0, 1.1),
    rotationY: -Math.PI / 4,
    label: 'couch (standing)',
  },
  couch_sit: {
    position: new THREE.Vector3(1.4, 0, 1.0),
    rotationY: -Math.PI / 4,
    sit: true,
    label: 'couch (sitting)',
  },
  door: {
    position: new THREE.Vector3(0, 0, 2.0),
    rotationY: 0, // facing into the room
    label: 'door',
  },
};

/** Lookup an anchor by id; if a `room` Object3D is provided, prefer its
 * named empty (case-insensitive `Anchor_<id>` or `<id>`) over the fallback. */
export function resolveAnchor(id: AnchorId, root?: THREE.Object3D | null): AnchorTransform {
  const fallback = ANCHOR_FALLBACKS[id];
  if (!root) return fallback;

  const candidates = [
    `Anchor_${id}`,
    `Anchor_${id.replace(/_/g, '')}`,
    `anchor_${id}`,
    id,
    id.toLowerCase(),
  ];
  for (const name of candidates) {
    const obj = root.getObjectByName(name);
    if (!obj) continue;
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    const worldQuat = new THREE.Quaternion();
    obj.getWorldQuaternion(worldQuat);
    const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
    return {
      ...fallback,
      position: worldPos,
      rotationY: euler.y,
    };
  }
  return fallback;
}

/** All anchor ids — handy for debug HUDs / dropdowns. */
export const ALL_ANCHORS: AnchorId[] = [
  'center',
  'desk_stand',
  'desk_sit',
  'bookshelf',
  'window',
  'couch_stand',
  'couch_sit',
  'door',
];
