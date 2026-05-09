/**
 * Two-layer mesh classification for movement.
 *
 * The room's GLB has every prop and wall thrown into one bag of meshes.
 * The player capsule should bump into all of it, but the avatar shouldn't —
 * when she's walking to a calibrated approach point near the chair, the
 * chair mesh itself blocks her capsule and she "walks in place" against
 * her own destination.
 *
 * Layers:
 *   wall      — must always block movement (player + avatar). Real walls,
 *               floors, ceilings, and door frames.
 *   furniture — blocks the player; the avatar may pass through during
 *               `interact_with` macros (i.e. when posOverride is set).
 *
 * Classification is heuristic: name patterns first (cheap), thin-but-large
 * geometry second (catches generic mesh names), default = wall (safe).
 *
 * Results are cached on the mesh via a WeakMap so we don't reclassify on
 * every frame.
 */
import * as THREE from 'three';

export type ColliderLayer = 'wall' | 'furniture';

const WALL_NAME_PATTERNS: RegExp[] = [
  /wall(?!paper)/i, // 'wall' but not 'wallpaper' (which sits on a wall, not blocking on its own)
  /\bfloor\b/i,
  /\bceiling\b/i,
  /\bframe\b/i,
  /baseboard|trim|molding|skirting/i,
  /\bdoor_?frame\b/i,
  /\bjamb\b/i,
];

const FURNITURE_NAME_PATTERNS: RegExp[] = [
  /chair|stool|seat/i,
  /desk\b|table\b/i,
  /computer|monitor|laptop|pc\b|screen|keyboard|mouse_?pad/i,
  /bed|mattress|pillow|cushion|blanket/i,
  /bookshelf|shelf|bookcase|cabinet|dresser|wardrobe/i,
  /sofa|couch|ottoman|loveseat/i,
  /lamp|sconce|fixture/i,
  /\brug\b|carpet|mat\b/i,
  /plant|pot\b|vase/i,
  /book\b|item/i,
  /poster|painting|picture/i,
  /\bdoor\b(?!_?frame)/i, // door panel itself is interactable; door FRAME is wall
  /door_?knob|handle/i,
];

const _layerCache = new WeakMap<THREE.Mesh, ColliderLayer>();

/** Inspect a mesh and decide which collision layer it belongs to. */
export function classifyMesh(mesh: THREE.Mesh): ColliderLayer {
  const cached = _layerCache.get(mesh);
  if (cached) return cached;

  const layer = computeLayer(mesh);
  _layerCache.set(mesh, layer);
  return layer;
}

function computeLayer(mesh: THREE.Mesh): ColliderLayer {
  // climb up to root looking at the chain of names — VRoid-style
  // exporters often nest a furniture mesh inside a "Chair" group with
  // an opaque mesh-level name.
  const names: string[] = [];
  let cur: THREE.Object3D | null = mesh;
  while (cur && names.length < 6) {
    if (cur.name) names.push(cur.name);
    cur = cur.parent;
  }
  const fullName = names.join('/');

  // explicit furniture override beats wall (so a "wall_chair_decor" doesn't
  // accidentally classify as wall just because of the substring)
  for (const rx of FURNITURE_NAME_PATTERNS) {
    if (rx.test(fullName)) return 'furniture';
  }
  for (const rx of WALL_NAME_PATTERNS) {
    if (rx.test(fullName)) return 'wall';
  }

  // unnamed/ambiguous mesh — fall back to geometry shape.
  const bbox = new THREE.Box3().setFromObject(mesh);
  const size = bbox.getSize(new THREE.Vector3());
  const sx = size.x;
  const sy = size.y;
  const sz = size.z;
  // a typical wall is thin in one axis and large in the other two; a typical
  // furniture piece has all three axes within an order of magnitude.
  const minAxis = Math.min(sx, sy, sz);
  const maxAxis = Math.max(sx, sy, sz);
  if (minAxis < 0.2 && maxAxis > 1.5) return 'wall';
  // ceilings/floors are very flat AND very wide
  if (sy < 0.2 && Math.max(sx, sz) > 2.5) return 'wall';
  // very small things are decoration; let the avatar through.
  if (maxAxis < 0.4) return 'furniture';

  // safe default — everything else blocks the avatar too.
  return 'wall';
}

/** Build a flat list of colliders from the room scene root, filtered by
 *  layer. Pass 'all' to disable filtering (back-compat behavior). */
export function getColliders(
  root: THREE.Object3D | null,
  layer: ColliderLayer | 'all' = 'all',
): THREE.Object3D[] {
  if (!root) return [];
  const out: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (layer === 'all') {
      out.push(mesh);
      return;
    }
    if (classifyMesh(mesh) === layer) out.push(mesh);
  });
  return out;
}

/** Diagnostic — count how many meshes fall into each layer. Logged once
 *  by Room.tsx so we can spot mis-classification at a glance. */
export function summarizeLayers(root: THREE.Object3D | null): {
  wall: number;
  furniture: number;
  total: number;
  furnitureNames: string[];
} {
  if (!root) return { wall: 0, furniture: 0, total: 0, furnitureNames: [] };
  let wall = 0;
  let furniture = 0;
  let total = 0;
  const furnitureNames: string[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    total += 1;
    const l = classifyMesh(mesh);
    if (l === 'wall') wall += 1;
    else {
      furniture += 1;
      if (mesh.name) furnitureNames.push(mesh.name);
    }
  });
  return { wall, furniture, total, furnitureNames };
}
