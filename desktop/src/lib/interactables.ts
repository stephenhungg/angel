/**
 * Interactables v2 — the semantic layer over the room's geometry.
 *
 * v2 differs from v1 by giving every prop a real *oriented bounding box*
 * (OBB) instead of a sphere, multiple *approach points* instead of one
 * implicit approach anchor, and an explicit *seat* anchor for chairs.
 * This separation finally lets us:
 *   - render a tight wireframe around real furniture in calibration mode,
 *   - route the avatar around solid props with the pathfinder,
 *   - dock her cleanly at the seat without colliding with the chair mesh.
 *
 * Legacy v1 overrides in localStorage are auto-migrated on first load.
 *
 * Source-of-truth precedence (lowest → highest):
 *   1. INTERACTABLES_DEFAULT (this file).
 *   2. autoDiscoverFromRoom (mesh-name fuzzy bind from room.glb).
 *   3. interactables.default.json (committed snapshot of calibration).
 *   4. localStorage overrides (per-machine fine-tuning).
 */
import * as THREE from 'three';
import type { AnchorId } from '@angel/shared';

export type InteractableKind =
  | 'chair'
  | 'desk'
  | 'computer'
  | 'window'
  | 'door'
  | 'bed';

/**
 * Verbs an interactable can support. Most surface the same name to the user
 * ("[E] sit") but the engine routes them to the right animation chain.
 */
export type InteractableAction =
  | 'sit'
  | 'sit_playful'
  | 'sit_and_type'
  | 'look_out'
  | 'open'
  | 'lay_down'
  | 'use';

/* -------------------------------------------------------------------------- */
/* primitive shapes                                                           */
/* -------------------------------------------------------------------------- */

/** Oriented bounding box around the prop. Yaw rotates around world Y. */
export type OBB = {
  center: THREE.Vector3;
  halfExtents: THREE.Vector3; // x, y, z half-widths in object-local axes
  yaw: number; // rotation around world Y, radians
};

/** A pre-arrival stand point: where the avatar's feet land just BEFORE the
 * sit / look action begins. Multiple per interactable lets a desk
 * have a "left side" and "right side" entry, etc. */
export type ApproachPoint = {
  pos: THREE.Vector3;
  yaw: number;
  label?: string;
};

/* -------------------------------------------------------------------------- */
/* Interactable                                                               */
/* -------------------------------------------------------------------------- */

export type Interactable = {
  id: string;
  kind: InteractableKind;
  /** human label shown in HUD prompts */
  label: string;

  /** physical bounding box of the prop (visual + furniture-passthrough). */
  bbox: OBB;
  /** every supported pre-arrival stand point. order = priority for
   *  tie-breaking when two are equally close to the avatar. */
  approaches: ApproachPoint[];
  /** for chairs only: the locked seated pose where the avatar / player ends
   *  up after the sit transition. usually inside or above the bbox. */
  seat?: { pos: THREE.Vector3; yaw: number };
  /** sphere radius for E-key proximity gate + camera reticle picking. */
  pickRadius: number;

  /** primary action — used as the default E-prompt label */
  primaryAction: InteractableAction;
  /** every supported action — order matters for prompt cycling */
  actions: InteractableAction[];
  /** for desks/computers: the chair to actually occupy */
  pairedChairId?: string;
  /** legacy ANCHOR id for free walk_to(anchor) compat */
  anchorId?: AnchorId;
  /** filled in by auto-discovery if a matching mesh was found in room.glb */
  meshName?: string;
};

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* -------------------------------------------------------------------------- */
/* defaults                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Hardcoded baseline. The autoDiscover pass replaces `bbox.center` (and
 * tags `meshName`) when a matching mesh exists in the room glb; manual
 * calibration overrides stomp both.
 */
export const INTERACTABLES_DEFAULT: readonly Interactable[] = [
  {
    id: 'desk_chair',
    kind: 'chair',
    label: 'desk chair',
    bbox: {
      center: v3(-1.6, 0.45, -1.05),
      halfExtents: v3(0.28, 0.45, 0.28),
      yaw: -Math.PI / 2,
    },
    approaches: [
      { pos: v3(-1.25, 0, -1.05), yaw: -Math.PI / 2, label: 'front' },
    ],
    seat: { pos: v3(-1.55, 0, -1.05), yaw: -Math.PI / 2 },
    pickRadius: 0.55,
    primaryAction: 'sit',
    actions: ['sit', 'sit_and_type'],
    anchorId: 'desk_sit',
  },
  {
    id: 'desk_workstation',
    kind: 'desk',
    label: 'workstation',
    bbox: {
      center: v3(-2.0, 0.45, -1.1),
      halfExtents: v3(0.4, 0.45, 0.6),
      yaw: 0,
    },
    approaches: [
      { pos: v3(-1.25, 0, -1.05), yaw: -Math.PI / 2, label: 'chair side' },
    ],
    pickRadius: 0.85,
    primaryAction: 'sit_and_type',
    actions: ['sit_and_type'],
    pairedChairId: 'desk_chair',
    anchorId: 'desk_stand',
  },
  {
    id: 'couch_chair',
    kind: 'chair',
    label: 'couch',
    bbox: {
      center: v3(1.4, 0.4, 1.0),
      halfExtents: v3(0.5, 0.4, 0.5),
      yaw: -Math.PI / 4,
    },
    approaches: [
      { pos: v3(0.85, 0, 0.65), yaw: -Math.PI / 4, label: 'front' },
    ],
    seat: { pos: v3(1.4, 0, 1.0), yaw: -Math.PI / 4 },
    pickRadius: 0.7,
    primaryAction: 'sit',
    actions: ['sit', 'sit_playful'],
    anchorId: 'couch_sit',
  },
  {
    id: 'window',
    kind: 'window',
    label: 'window',
    bbox: {
      center: v3(0, 1.4, -2.4),
      halfExtents: v3(0.7, 0.6, 0.1),
      yaw: 0,
    },
    approaches: [{ pos: v3(0, 0, -1.8), yaw: Math.PI, label: 'inside' }],
    pickRadius: 1.0,
    primaryAction: 'look_out',
    actions: ['look_out'],
    anchorId: 'window',
  },
  {
    id: 'door',
    kind: 'door',
    label: 'door',
    bbox: {
      center: v3(0, 1.0, 2.6),
      halfExtents: v3(0.5, 1.0, 0.1),
      yaw: 0,
    },
    approaches: [{ pos: v3(0, 0, 2.0), yaw: 0, label: 'inside' }],
    pickRadius: 1.0,
    primaryAction: 'open',
    actions: ['open'],
    anchorId: 'door',
  },
];

/* -------------------------------------------------------------------------- */
/* registry                                                                   */
/* -------------------------------------------------------------------------- */

function cloneInteractable(i: Interactable): Interactable {
  return {
    ...i,
    bbox: {
      center: i.bbox.center.clone(),
      halfExtents: i.bbox.halfExtents.clone(),
      yaw: i.bbox.yaw,
    },
    approaches: i.approaches.map((a) => ({ pos: a.pos.clone(), yaw: a.yaw, label: a.label })),
    seat: i.seat && { pos: i.seat.pos.clone(), yaw: i.seat.yaw },
    actions: [...i.actions],
  };
}

let _registry: Interactable[] = INTERACTABLES_DEFAULT.map(cloneInteractable);

export function getInteractables(): readonly Interactable[] {
  return _registry;
}

export function getInteractable(id: string): Interactable | undefined {
  return _registry.find((i) => i.id === id);
}

/* -------------------------------------------------------------------------- */
/* auto-discovery (room.glb mesh → bbox)                                      */
/* -------------------------------------------------------------------------- */

const KIND_PATTERNS: Array<{ kind: InteractableKind; rx: RegExp }> = [
  { kind: 'chair', rx: /chair|stool/i },
  { kind: 'desk', rx: /desk|table\b(?!\s*lamp)/i },
  { kind: 'computer', rx: /computer|monitor|laptop|pc\b|screen/i },
  { kind: 'window', rx: /window/i },
  { kind: 'door', rx: /door|exit/i },
  { kind: 'bed', rx: /\bbed\b|mattress/i },
];

export type DiscoveryReport = {
  matchedIds: string[];
  unmatchedMeshes: string[];
  totalMeshes: number;
};

/** Re-bind hardcoded interactables to discovered mesh bounds when names match. */
export function autoDiscoverFromRoom(root: THREE.Object3D): DiscoveryReport {
  const matched = new Set<string>();
  const tagged: Array<{
    name: string;
    kind: InteractableKind;
    center: THREE.Vector3;
    bbox: THREE.Box3;
  }> = [];
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

  // greedy assignment — for each registry entry, pick the closest tagged
  // mesh of matching kind. We update bbox.center and meshName, but keep
  // halfExtents/yaw from defaults (calibration overrides them).
  for (const it of _registry) {
    let best: { name: string; center: THREE.Vector3; bbox: THREE.Box3; d: number } | null = null;
    for (const t of tagged) {
      if (t.kind !== it.kind) continue;
      const d = t.center.distanceTo(it.bbox.center);
      if (!best || d < best.d) best = { name: t.name, center: t.center, bbox: t.bbox, d };
    }
    if (best) {
      it.bbox.center.copy(best.center);
      // also tighten halfExtents to the discovered bbox if we never had
      // an explicit override yet (saves the user from "fit to mesh" if
      // the room's authored shape is already correct).
      const size = best.bbox.getSize(new THREE.Vector3());
      it.bbox.halfExtents.set(
        Math.max(0.1, size.x * 0.5),
        Math.max(0.1, size.y * 0.5),
        Math.max(0.1, size.z * 0.5),
      );
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
  _registry = INTERACTABLES_DEFAULT.map(cloneInteractable);
  _overrides = {};
}

/* -------------------------------------------------------------------------- */
/* live calibration overrides                                                 */
/* -------------------------------------------------------------------------- */

export type Vec3T = [number, number, number];

export type ApproachOverride = { pos: Vec3T; yaw: number; label?: string };

export type InteractableOverride = {
  bbox?: { center: Vec3T; halfExtents: Vec3T; yaw: number };
  approaches?: ApproachOverride[];
  seat?: { pos: Vec3T; yaw: number } | null; // null clears seat
  pickRadius?: number;
};

/** Patch shape exposed to consumers. All fields optional and merged. */
export type InteractablePatch = {
  bbox?: Partial<{ center: Vec3T; halfExtents: Vec3T; yaw: number }>;
  approaches?: ApproachOverride[]; // full replacement
  seat?: { pos: Vec3T; yaw: number } | null;
  pickRadius?: number;
};

const STORAGE_KEY = 'angel:interactable_overrides:v2';
const STORAGE_KEY_V1 = 'angel:interactable_overrides:v1';

let _overrides: Record<string, InteractableOverride> = {};

/** Apply a patch to the live registry entry AND merge into `_overrides`. */
export function setInteractableTransform(id: string, patch: InteractablePatch): boolean {
  const it = _registry.find((i) => i.id === id);
  if (!it) {
    console.warn('[interactables] setTransform: unknown id', id);
    return false;
  }

  if (patch.bbox) {
    if (patch.bbox.center) it.bbox.center.set(...patch.bbox.center);
    if (patch.bbox.halfExtents) it.bbox.halfExtents.set(...patch.bbox.halfExtents);
    if (patch.bbox.yaw != null) it.bbox.yaw = patch.bbox.yaw;
  }
  if (patch.approaches) {
    it.approaches = patch.approaches.map((a) => ({
      pos: new THREE.Vector3(...a.pos),
      yaw: a.yaw,
      label: a.label,
    }));
  }
  if (patch.seat !== undefined) {
    if (patch.seat === null) it.seat = undefined;
    else it.seat = { pos: new THREE.Vector3(...patch.seat.pos), yaw: patch.seat.yaw };
  }
  if (patch.pickRadius != null) it.pickRadius = patch.pickRadius;

  // merge into the override snapshot — accumulate edits across frames.
  const prev = _overrides[id] ?? {};
  const next: InteractableOverride = { ...prev };
  if (patch.bbox) {
    next.bbox = {
      center: vec3ToTuple(it.bbox.center),
      halfExtents: vec3ToTuple(it.bbox.halfExtents),
      yaw: it.bbox.yaw,
    };
  }
  if (patch.approaches) {
    next.approaches = it.approaches.map((a) => ({
      pos: vec3ToTuple(a.pos),
      yaw: a.yaw,
      label: a.label,
    }));
  }
  if (patch.seat !== undefined) {
    next.seat = it.seat ? { pos: vec3ToTuple(it.seat.pos), yaw: it.seat.yaw } : null;
  }
  if (patch.pickRadius != null) next.pickRadius = it.pickRadius;
  _overrides[id] = next;
  return true;
}

function vec3ToTuple(v: THREE.Vector3): Vec3T {
  return [v.x, v.y, v.z];
}

/** Snapshot of just the override deltas. */
export function getOverrides(): Record<string, InteractableOverride> {
  return _overrides;
}

/** Snapshot of every interactable's full current transform (for export). */
export function exportTransforms(): Record<string, Required<InteractableOverride>> {
  const out: Record<string, Required<InteractableOverride>> = {};
  for (const it of _registry) {
    out[it.id] = {
      bbox: {
        center: vec3ToTuple(it.bbox.center),
        halfExtents: vec3ToTuple(it.bbox.halfExtents),
        yaw: it.bbox.yaw,
      },
      approaches: it.approaches.map((a) => ({
        pos: vec3ToTuple(a.pos),
        yaw: a.yaw,
        label: a.label,
      })),
      seat: it.seat ? { pos: vec3ToTuple(it.seat.pos), yaw: it.seat.yaw } : null,
      pickRadius: it.pickRadius,
    };
  }
  return out;
}

/** Persist override deltas to localStorage so we resume next launch. */
export function saveOverridesToLocalStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_overrides));
    console.info('[interactables] saved', Object.keys(_overrides).length, 'overrides');
  } catch (err) {
    console.warn('[interactables] save failed', err);
  }
}

/** Hydrate from localStorage on app boot. v1 → v2 migration is automatic. */
export function loadOverridesFromLocalStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, InteractableOverride>;
      let applied = 0;
      let pruned = 0;
      for (const [id, ov] of Object.entries(parsed)) {
        if (applyOverride(id, ov)) {
          applied += 1;
        } else {
          // id no longer exists in the registry (e.g. removed prop) — drop
          // it from the persisted blob so the warning doesn't fire on
          // every reload forever.
          delete parsed[id];
          pruned += 1;
        }
      }
      if (pruned > 0) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          console.info('[interactables] pruned', pruned, 'stale override(s) from storage');
        } catch {
          /* ignore quota/serialization errors */
        }
      }
      console.info('[interactables] hydrated', applied, 'v2 overrides from storage');
      return;
    }
    // v1 migration path
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as Record<
        string,
        {
          worldPos?: Vec3T;
          hitRadius?: number;
          approachAnchor?: { pos: Vec3T; yaw: number };
        }
      >;
      let count = 0;
      for (const [id, v1] of Object.entries(parsed)) {
        const it = _registry.find((i) => i.id === id);
        if (!it) continue;
        const patch: InteractablePatch = {};
        if (v1.worldPos) {
          patch.bbox = { ...patch.bbox, center: v1.worldPos };
        }
        if (v1.hitRadius != null) {
          patch.pickRadius = v1.hitRadius;
          // also widen bbox to roughly match v1 sphere if no v2 bbox lands
          patch.bbox = {
            ...patch.bbox,
            halfExtents: [v1.hitRadius * 0.7, v1.hitRadius, v1.hitRadius * 0.7],
          };
        }
        if (v1.approachAnchor) patch.approaches = [v1.approachAnchor];
        setInteractableTransform(id, patch);
        count += 1;
      }
      console.info('[interactables] migrated', count, 'v1 → v2 overrides');
      // persist the migrated state under the v2 key + drop the v1 key.
      saveOverridesToLocalStorage();
      try {
        localStorage.removeItem(STORAGE_KEY_V1);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn('[interactables] load failed', err);
  }
}

/** Pull a saved-defaults JSON in (typically loaded from
 * /interactables.default.json). Layered BEFORE localStorage. */
export function applyDefaultsSnapshot(snapshot: Record<string, InteractableOverride>): void {
  let count = 0;
  for (const [id, ov] of Object.entries(snapshot)) {
    if (applyOverride(id, ov)) count += 1;
  }
  console.info('[interactables] applied defaults snapshot', count, 'entries');
}

function applyOverride(id: string, ov: InteractableOverride): boolean {
  const patch: InteractablePatch = {};
  if (ov.bbox) patch.bbox = { ...ov.bbox };
  if (ov.approaches) patch.approaches = ov.approaches;
  if (ov.seat !== undefined) patch.seat = ov.seat;
  if (ov.pickRadius != null) patch.pickRadius = ov.pickRadius;
  return setInteractableTransform(id, patch);
}

/** Clear saved overrides + reset the registry to defaults. */
export function clearOverrides(): void {
  try {
    localStorage?.removeItem(STORAGE_KEY);
    localStorage?.removeItem(STORAGE_KEY_V1);
  } catch {
    /* ignore */
  }
  _overrides = {};
  resetInteractables();
}

/* -------------------------------------------------------------------------- */
/* lookup helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pick by camera ray. Tests against each interactable's OBB first (for
 * solid props you should be able to click directly on); falls back to the
 * pickRadius sphere for things like the window where the OBB is intentionally
 * thin and you want a generous reticle.
 */
export function pickInteractable(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDist = 3.5,
): Interactable | null {
  const dir = direction.clone().normalize();
  let best: { it: Interactable; t: number } | null = null;
  for (const it of _registry) {
    const tBox = rayOBBIntersect(origin, dir, it.bbox);
    const tSphere = raySphereIntersect(origin, dir, it.bbox.center, it.pickRadius);
    const t = tBox != null && tSphere != null ? Math.min(tBox, tSphere) : (tBox ?? tSphere);
    if (t == null || t < 0 || t > maxDist) continue;
    if (!best || t < best.t) best = { it, t };
  }
  return best?.it ?? null;
}

/** Camera-ray pick that returns ONLY OBB hits (no sphere). Used by the
 * calibration editor where the user expects to click on the visible box. */
export function pickInteractableByOBB(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDist = 12,
): Interactable | null {
  const dir = direction.clone().normalize();
  let best: { it: Interactable; t: number } | null = null;
  for (const it of _registry) {
    const t = rayOBBIntersect(origin, dir, it.bbox);
    if (t == null || t < 0 || t > maxDist) continue;
    if (!best || t < best.t) best = { it, t };
  }
  return best?.it ?? null;
}

/** Closest approach point to a given world position (defaults to first
 *  approach if there are no spatial preferences yet). */
export function nearestApproachTo(it: Interactable, p: THREE.Vector3): ApproachPoint | null {
  if (it.approaches.length === 0) return null;
  let best: ApproachPoint | null = null;
  let bestD = Infinity;
  for (const a of it.approaches) {
    const d = a.pos.distanceToSquared(p);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Look up an approach by label; falls back to first if no match. */
export function approachByLabel(it: Interactable, label?: string): ApproachPoint | null {
  if (it.approaches.length === 0) return null;
  if (!label) return it.approaches[0];
  return it.approaches.find((a) => a.label === label) ?? it.approaches[0];
}

/** Convert OBB to an axis-aligned Box3 (loses orientation — useful only as
 * a coarse bounding-box approximation; for accurate rendering, use a yawed
 * group + a Box3Helper as in InteractableOverlay). */
export function obbToBox3(obb: OBB): THREE.Box3 {
  // we ignore yaw here — caller is expected to apply yaw via parent
  // group.rotation if exact bounds matter. Safe for grid baking.
  const min = obb.center.clone().sub(obb.halfExtents);
  const max = obb.center.clone().add(obb.halfExtents);
  return new THREE.Box3(min, max);
}

/** Test whether a world-space point is inside an OBB. */
export function obbContainsPoint(obb: OBB, p: THREE.Vector3): boolean {
  const local = p.clone().sub(obb.center);
  // un-rotate by -yaw around Y
  const c = Math.cos(-obb.yaw);
  const s = Math.sin(-obb.yaw);
  const lx = local.x * c - local.z * s;
  const lz = local.x * s + local.z * c;
  const ly = local.y;
  return (
    Math.abs(lx) <= obb.halfExtents.x &&
    Math.abs(ly) <= obb.halfExtents.y &&
    Math.abs(lz) <= obb.halfExtents.z
  );
}

/** Get the avatar's seat target for a chair-kind interactable, or null. */
export function seatPoseOf(it: Interactable): { pos: THREE.Vector3; yaw: number } | null {
  if (it.seat) return it.seat;
  // fallback for chairs without explicit seat: bbox.center projected to floor.
  if (it.kind === 'chair') {
    return { pos: new THREE.Vector3(it.bbox.center.x, 0, it.bbox.center.z), yaw: it.bbox.yaw };
  }
  return null;
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
    case 'open':
      return 'open';
    case 'lay_down':
      return 'lie down';
    case 'use':
      return 'use';
  }
}

/* -------------------------------------------------------------------------- */
/* ray intersection primitives                                                */
/* -------------------------------------------------------------------------- */

const _tmpInv = new THREE.Quaternion();
const _tmpLocalOrigin = new THREE.Vector3();
const _tmpLocalDir = new THREE.Vector3();

/** Ray vs. OBB intersection. Returns the nearest positive t along the ray
 * (in world units) or null if no hit. The OBB is treated as an AABB after
 * we transform the ray into the box's local frame (yaw around Y only). */
export function rayOBBIntersect(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  obb: OBB,
): number | null {
  // Build world → local rotation: invert a yaw-only quaternion.
  _tmpInv.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -obb.yaw);
  _tmpLocalOrigin.copy(origin).sub(obb.center).applyQuaternion(_tmpInv);
  _tmpLocalDir.copy(dir).applyQuaternion(_tmpInv);

  // slab test against [-halfExtents, +halfExtents]
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const o = _tmpLocalOrigin[axis];
    const d = _tmpLocalDir[axis];
    const h = obb.halfExtents[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < -h || o > h) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (-h - o) * inv;
    let t2 = (h - o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null;
  return tMin >= 0 ? tMin : tMax;
}

/** Ray-sphere intersection helper. */
function raySphereIntersect(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): number | null {
  const oc = origin.clone().sub(center);
  const b = oc.dot(dir);
  const c = oc.dot(oc) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = -b - sqrtDisc;
  const t2 = -b + sqrtDisc;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}
