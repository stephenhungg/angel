/**
 * Interactables — the semantic layer over the room's geometry.
 *
 * The room.glb is just polygons. This module overlays each prop with a
 * typed interaction record: what kind of thing it is, where to stand to use
 * it, what verbs it supports, and how the avatar's animation chain should
 * play out.
 *
 * The same registry is consumed by:
 *   1. The PLAYER (E-key interact in Player.tsx) — raycast + UI prompt + execute.
 *   2. The AI BRAIN (interact_with tool in electron/agent/runner.ts) —
 *      brain emits `interact_with(id, action)` and the renderer macros it
 *      into a SceneAction sequence.
 *
 * Source-of-truth precedence: hardcoded registry (this file) is the floor.
 * If room.glb meshes are named like "Chair_01" or "Desk", the auto-discovery
 * pass at room load time augments / repositions matching entries.
 */
import * as THREE from 'three';
import type { AnchorId } from '@angel/shared';

export type InteractableKind =
  | 'chair'
  | 'desk'
  | 'computer'
  | 'window'
  | 'bookshelf'
  | 'door'
  | 'bed';

/**
 * Verbs an interactable can support. Most surface the same name to the user
 * ("[E] sit") but the engine routes them to the right animation chain.
 */
export type InteractableAction =
  | 'sit' // sit at this chair (loop sitting)
  | 'sit_playful' // alt sitting pose
  | 'sit_and_type' // chair + paired desk → sit + typing flow
  | 'look_out' // window → walk to + face + idle
  | 'browse' // bookshelf → walk to + face + reading
  | 'open' // door → narrate "leaving?" beat
  | 'lay_down' // bed → loop sleeping (skipped if no clip)
  | 'use'; // generic catch-all

export type Interactable = {
  id: string;
  kind: InteractableKind;
  /** human label shown in HUD prompts */
  label: string;
  /** hitbox center in world space */
  worldPos: THREE.Vector3;
  /** sphere radius for raycast-pick + AI proximity tests */
  hitRadius: number;
  /** primary action — used as the default E-prompt label */
  primaryAction: InteractableAction;
  /** every supported action — order matters for prompt cycling */
  actions: InteractableAction[];
  /** where the user/avatar's feet end up when interacting */
  approachAnchor?: { pos: THREE.Vector3; yaw: number };
  /** for desks/computers: the chair to actually occupy */
  pairedChairId?: string;
  /** if this interactable also corresponds to a named scene anchor (legacy
   *  ANCHOR system) we record it so the brain can use either lookup. */
  anchorId?: AnchorId;
  /** filled in by auto-discovery if a matching mesh was found in room.glb */
  meshName?: string;
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Hardcoded baseline. The autoDiscover pass (called from Room.tsx) replaces
 * `worldPos` and tags `meshName` if a matching mesh exists in the room glb.
 */
export const INTERACTABLES_DEFAULT: Interactable[] = [
  {
    id: 'desk_chair',
    kind: 'chair',
    label: 'desk chair',
    worldPos: v(-1.6, 0, -1.05),
    hitRadius: 0.55,
    primaryAction: 'sit',
    actions: ['sit', 'sit_and_type'],
    approachAnchor: { pos: v(-1.6, 0, -1.05), yaw: -Math.PI / 2 },
    anchorId: 'desk_sit',
  },
  {
    id: 'desk_workstation',
    kind: 'desk',
    label: 'workstation',
    // sits on the wall near the desk chair so a forward-cone raycast
    // catches it from the room interior
    worldPos: v(-2.05, 0.8, -1.1),
    hitRadius: 0.85,
    primaryAction: 'sit_and_type',
    actions: ['sit_and_type'],
    approachAnchor: { pos: v(-1.6, 0, -1.05), yaw: -Math.PI / 2 },
    pairedChairId: 'desk_chair',
    anchorId: 'desk_stand',
  },
  {
    id: 'couch_chair',
    kind: 'chair',
    label: 'couch',
    worldPos: v(1.4, 0, 1.0),
    hitRadius: 0.7,
    primaryAction: 'sit',
    actions: ['sit', 'sit_playful'],
    approachAnchor: { pos: v(1.4, 0, 1.0), yaw: -Math.PI / 4 },
    anchorId: 'couch_sit',
  },
  {
    id: 'window',
    kind: 'window',
    label: 'window',
    worldPos: v(0, 1.4, -2.4),
    hitRadius: 1.0,
    primaryAction: 'look_out',
    actions: ['look_out'],
    approachAnchor: { pos: v(0, 0, -1.8), yaw: Math.PI },
    anchorId: 'window',
  },
  {
    id: 'bookshelf',
    kind: 'bookshelf',
    label: 'bookshelf',
    worldPos: v(1.95, 1.2, -1.2),
    hitRadius: 0.85,
    primaryAction: 'browse',
    actions: ['browse'],
    approachAnchor: { pos: v(1.8, 0, -1.2), yaw: Math.PI / 2 },
    anchorId: 'bookshelf',
  },
  {
    id: 'door',
    kind: 'door',
    label: 'door',
    worldPos: v(0, 1.0, 2.6),
    hitRadius: 1.0,
    primaryAction: 'open',
    actions: ['open'],
    approachAnchor: { pos: v(0, 0, 2.0), yaw: 0 },
    anchorId: 'door',
  },
];

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

let _registry: Interactable[] = INTERACTABLES_DEFAULT.map((i) => ({ ...i, worldPos: i.worldPos.clone(), approachAnchor: i.approachAnchor && { ...i.approachAnchor, pos: i.approachAnchor.pos.clone() } }));

export function getInteractables(): readonly Interactable[] {
  return _registry;
}

export function getInteractable(id: string): Interactable | undefined {
  return _registry.find((i) => i.id === id);
}

/**
 * Auto-discovery: walk the loaded room and try to bind interactables to
 * actual meshes by name fuzzy-match. We update worldPos to each match's
 * mesh-bbox center so anchors line up with whatever room.glb is actually
 * loaded — no more "the chair is invisible because the room is scaled
 * weird".
 */
const KIND_PATTERNS: Array<{ kind: InteractableKind; rx: RegExp }> = [
  { kind: 'chair', rx: /chair|stool/i },
  { kind: 'desk', rx: /desk|table\b(?!\s*lamp)/i },
  { kind: 'computer', rx: /computer|monitor|laptop|pc\b|screen/i },
  { kind: 'window', rx: /window/i },
  { kind: 'bookshelf', rx: /bookshelf|shelf|bookcase/i },
  { kind: 'door', rx: /door|exit/i },
  { kind: 'bed', rx: /\bbed\b|mattress/i },
];

export type DiscoveryReport = {
  matchedIds: string[];
  unmatchedMeshes: string[];
  totalMeshes: number;
};

/** Re-bind hardcoded interactables to discovered mesh positions when names match. */
export function autoDiscoverFromRoom(root: THREE.Object3D): DiscoveryReport {
  const matched = new Set<string>();
  const tagged: Array<{ name: string; kind: InteractableKind; center: THREE.Vector3; bbox: THREE.Box3 }> = [];
  let totalMeshes = 0;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    totalMeshes += 1;
    const name = (mesh.name ?? '').toString();
    for (const { kind, rx } of KIND_PATTERNS) {
      if (rx.test(name)) {
        const bbox = new THREE.Box3().setFromObject(mesh);
        const center = bbox.getCenter(new THREE.Vector3());
        tagged.push({ name, kind, center, bbox });
        break;
      }
    }
  });

  // greedy assignment: for each interactable, pick the closest tagged mesh
  // of the matching kind. We allow reuse across registry entries (e.g., a
  // single 'chair' mesh can satisfy both 'desk_chair' and a future 'reading_chair'
  // if the registry has multiples) but consume one match per id.
  for (const it of _registry) {
    let best: { name: string; center: THREE.Vector3; d: number } | null = null;
    for (const t of tagged) {
      if (t.kind !== it.kind) continue;
      const d = t.center.distanceTo(it.worldPos);
      if (!best || d < best.d) best = { name: t.name, center: t.center, d };
    }
    if (best) {
      it.worldPos.copy(best.center);
      it.meshName = best.name;
      matched.add(it.id);
    }
  }

  const unmatched = tagged
    .filter((t) => !_registry.some((it) => it.meshName === t.name))
    .map((t) => `${t.kind}:${t.name}`);

  console.info('[interactables] auto-discovery', {
    matched: Array.from(matched),
    candidateCount: tagged.length,
    totalMeshes,
  });

  return { matchedIds: Array.from(matched), unmatchedMeshes: unmatched, totalMeshes };
}

/** Reset registry to the hardcoded baseline (for HMR / room swaps). */
export function resetInteractables(): void {
  _registry = INTERACTABLES_DEFAULT.map((i) => ({
    ...i,
    worldPos: i.worldPos.clone(),
    approachAnchor: i.approachAnchor && { ...i.approachAnchor, pos: i.approachAnchor.pos.clone() },
  }));
}

/* ------------------------------------------------------------------ */
/* lookup helpers used by Player + Brain                               */
/* ------------------------------------------------------------------ */

/**
 * Raycast from a camera direction and return the nearest interactable
 * hit within `maxDist`. Uses sphere intersection on hitRadius — cheaper
 * than mesh raycasting and more forgiving for "almost looking at it".
 */
export function pickInteractable(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDist = 3.5,
): Interactable | null {
  let best: { it: Interactable; t: number } | null = null;
  const dir = direction.clone().normalize();
  const o = origin;

  for (const it of _registry) {
    // ray-sphere intersection
    const oc = o.clone().sub(it.worldPos);
    const b = oc.dot(dir);
    const c = oc.dot(oc) - it.hitRadius * it.hitRadius;
    const disc = b * b - c;
    if (disc < 0) continue;
    const sqrtDisc = Math.sqrt(disc);
    let t = -b - sqrtDisc;
    if (t < 0) t = -b + sqrtDisc; // origin inside sphere
    if (t < 0 || t > maxDist) continue;
    if (!best || t < best.t) best = { it, t };
  }
  return best?.it ?? null;
}

/** Friendly verb for HUD prompts. */
export function actionLabel(action: InteractableAction): string {
  switch (action) {
    case 'sit':
      return 'sit';
    case 'sit_playful':
      return 'plop down';
    case 'sit_and_type':
      return 'work at desk';
    case 'look_out':
      return 'look outside';
    case 'browse':
      return 'browse';
    case 'open':
      return 'open';
    case 'lay_down':
      return 'lie down';
    case 'use':
      return 'use';
  }
}
