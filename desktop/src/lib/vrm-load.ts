import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

/**
 * Detect & cancel a baked 180°-around-Y root rotation in the VRM scene
 * tree, then patch the normalized humanoid rig's captured rest world
 * rotations *in place* so the live rig reflects the corrected orientation.
 *
 * Why this exists: VRoid Studio's recent VRM 0.x exports (cottagecore /
 * tech-minimal / cyber / academia / alt-abison-5) ship every root scene
 * node with `rotation: [0, 1, 0, 0]` — that's the quaternion for a 180°
 * rotation around Y. `@pixiv/three-vrm`'s `VRMLoaderPlugin` doesn't
 * unwind it, so the avatar lands facing +Z when @pixiv's helpers all
 * assume -Z. Visible symptoms when not corrected:
 *   - the avatar's body faces away from the camera at idle
 *   - Mixamo X/Z mirror in `retarget.ts` (designed for the canonical
 *     -Z VRM 0.x forward) ends up doubly wrong → animations look like
 *     the model is reaching upward / behind itself
 *
 * The placeholder VRM (`2068967230566994300.vrm`) was authored without
 * the baked root rotation, which is why it always worked.
 *
 * Fix:
 *   1. Walk the immediate children of `vrm.scene`. Any node whose
 *      quaternion is the 180°-around-Y quaternion gets reset to identity,
 *      restoring the canonical -Z forward orientation.
 *   2. The `VRMHumanoidRig` (three-vrm.module.js line 1762) was already
 *      constructed at VRM-load time with stale rest world rotations
 *      that include the 180° flip. Rebuilding the rig (toggling
 *      `autoUpdateHumanBones`) creates a *detached* new rig that the
 *      AnimationMixer can't find by name — so we patch the existing
 *      rig's `_parentWorldRotations` and `_boneRotations` maps in place
 *      to reflect the post-un-flip state. This is the rig the mixer
 *      already drives, so animations apply through the correct rest now.
 *
 * Idempotent. Safe to call on every VRM — the placeholder simply has no
 * rotated children, so it's a no-op there.
 */
function normalizeHumanoidToTPose(vrm: VRM): void {
  // 180° around Y as a unit quaternion: (0, 1, 0, 0) — sin(90°)=1 around
  // axis Y, cos(90°)=0 for w. Tolerate float drift.
  const isFlipQuat = (q: THREE.Quaternion): boolean => {
    return (
      Math.abs(q.x) < 1e-3 &&
      Math.abs(q.y - 1) < 1e-3 &&
      Math.abs(q.z) < 1e-3 &&
      Math.abs(q.w) < 1e-3
    );
  };

  let unwoundCount = 0;
  for (const child of vrm.scene.children) {
    if (isFlipQuat(child.quaternion)) {
      child.quaternion.identity();
      unwoundCount += 1;
    }
  }

  if (unwoundCount === 0) return;

  // refresh world matrices so the rig re-capture below reads the
  // post-un-flip state.
  vrm.scene.updateMatrixWorld(true);

  // patch the live rig's rest captures. We have to reach into private
  // state because @pixiv/three-vrm doesn't expose a "re-capture rest"
  // method publicly (toggling `autoUpdateHumanBones` builds a new rig
  // that's detached from the scene tree, which breaks AnimationMixer
  // name resolution). The keys we touch are stable across 3.x:
  //   - `_normalizedHumanBones`        : the rig instance
  //   - `_parentWorldRotations`        : Record<boneName, Quaternion>
  //   - `_boneRotations`               : Record<boneName, Quaternion>
  // See three-vrm.module.js lines 1704-1768 (VRMHumanoidRig) for the
  // construction-time capture this mirrors.
  const humanoid = vrm.humanoid as unknown as {
    _normalizedHumanBones?: {
      _parentWorldRotations?: Record<string, THREE.Quaternion>;
      _boneRotations?: Record<string, THREE.Quaternion>;
    };
    getRawBoneNode?: (n: string) => THREE.Object3D | null;
    getBoneNode?: (n: string) => THREE.Object3D | null;
  } | null;
  if (!humanoid) return;
  const rig = humanoid._normalizedHumanBones;
  const getRaw = humanoid.getRawBoneNode ?? humanoid.getBoneNode;
  if (!rig || !rig._parentWorldRotations || !rig._boneRotations || !getRaw) {
    console.warn('[vrm-load] cannot patch rig rest — three-vrm internals shape changed');
    return;
  }

  const tmpVec = new THREE.Vector3();
  let patchedBones = 0;
  for (const boneName of Object.keys(rig._parentWorldRotations)) {
    const rawNode = getRaw.call(humanoid, boneName) as THREE.Object3D | null;
    if (!rawNode) continue;
    rawNode.updateWorldMatrix(true, false);

    // re-capture parent's world rotation
    const parentWorld = new THREE.Quaternion();
    if (rawNode.parent) {
      rawNode.parent.matrixWorld.decompose(tmpVec, parentWorld, tmpVec);
    }
    rig._parentWorldRotations[boneName].copy(parentWorld);

    // re-capture bone's local rotation (= bind pose local)
    rig._boneRotations[boneName].copy(rawNode.quaternion);

    patchedBones += 1;
  }

  // sync once so the very first frame already renders correctly oriented.
  vrm.update(0);
  console.info(
    '[vrm-load] unwound 180°-Y root rotation on',
    unwoundCount,
    'scene child(ren); patched',
    patchedBones,
    'rig rest captures',
  );
}

/**
 * Load a `.vrm` file via three's GLTFLoader + the VRM plugin.
 * Disables frustum culling (skinned meshes lie about their bbox during
 * animation, so they pop out of view at certain angles otherwise).
 */
export async function loadVRM(url: string): Promise<VRM> {
  // pre-flight: HEAD the URL so a missing file produces a clear error
  // instead of GLTFLoader trying to JSON.parse the SPA's index.html and
  // throwing an opaque "Unexpected token '<'" trace.
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) {
      throw new Error(`[vrm-load] ${url} not found (HTTP ${res.status}). Did the asset get renamed?`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      throw new Error(
        `[vrm-load] ${url} returned HTML — the dev server is serving the SPA fallback, meaning the VRM file is missing from /public/vrm/.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[vrm-load]')) throw err;
    // network/CORS/etc — fall through and let the loader try anyway
  }

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);

  const vrm = (gltf.userData as { vrm?: VRM }).vrm;
  if (!vrm) {
    throw new Error(`[vrm-load] no VRM payload in ${url} — is this a VRM file?`);
  }

  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false;
    const mesh = obj as THREE.Mesh & { isMesh?: boolean };
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // ensure material is opaque-renderable; VRM exports sometimes ship with
      // alphaTest=0 + alpha-blended hair causing depth-write surprises
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      mats.forEach((m) => {
        const mm = m as THREE.MeshStandardMaterial;
        if (mm && 'envMapIntensity' in mm) mm.envMapIntensity = Math.max(mm.envMapIntensity ?? 1, 0.8);
      });
    }
  });

  // @pixiv/three-vrm normalizes both VRM 0.x and VRM 1.0 so that the
  // avatar faces world -Z when its wrapping group's `rotation.y === 0`.
  // This means a naïve `Math.atan2(dx, dz)` to "face a point" will point
  // her *back* at the target, not her face. Use `yawToFace(dx, dz)` from
  // `@/lib/anchors` for any "look toward target" yaw computation; literal
  // yaws stored on anchors / calibrations don't need the offset.

  // bind-pose normalization — see normalizeHumanoidToTPose() docstring.
  // Applied to every VRM (including the placeholder) so behavior is
  // identical across all 5 abison bodies + the working fallback. No-op for
  // VRMs already authored in T-pose.
  normalizeHumanoidToTPose(vrm);

  // log final bbox so we can see where the avatar landed
  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  console.info('[vrm-load] loaded', url, {
    metaVersion: (vrm.meta as { metaVersion?: string })?.metaVersion ?? '?',
    size: `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`,
    center: `(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
  });

  return vrm;
}

/** Convert a glTF FBX/GLB animation track name into VRM humanoid space. */
export function getVRMBoneNodeName(vrm: VRM, humanoidBoneName: string): string | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;

  // VRM 1.0 surface
  // @ts-expect-error — runtime guard, types vary across vrm 0.x / 1.x
  const bone = humanoid.getNormalizedBoneNode?.(humanoidBoneName) ?? humanoid.getBoneNode?.(humanoidBoneName);
  if (!bone) return null;
  return bone.name;
}

/** Convenience: dispose every material/geometry/texture in a VRM scene. */
export function disposeVRM(vrm: VRM): void {
  vrm.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((m) => m.dispose());
  });
}
