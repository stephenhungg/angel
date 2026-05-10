import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

/**
 * Cancel VRoid Studio's baked 180°-around-Y rotation on the VRM's scene
 * root nodes (cottagecore / tech-minimal / cyber / academia /
 * alt-abison-5 all ship root nodes with `rotation: [0, 1, 0, 0]`; the
 * placeholder VRM doesn't, which is why it always worked).
 *
 * Symptom when not corrected:
 *   - the avatar faces +Z when @pixiv/three-vrm helpers and the
 *     Mixamo retargeter all assume -Z (so it stands backward)
 *   - applying the retargeter's X/Z mirror through a rig whose rest
 *     captures already include the 180° flip double-mirrors the
 *     animation → arms/legs land in the wrong frame
 *
 * Why the sync-time and external-wrapper attempts failed:
 *   - Setting normalized rig bones to identity is a no-op: pixiv's rig
 *     formula is `rawLocal = invParentRest * rigLocal * parentRest *
 *     boneRotation`, which collapses to `boneRotation` (the original
 *     bind pose) when rigLocal is identity.
 *   - Wrapping `vrm.scene` in an outer 180°-Y group rotates the visual
 *     but the rig's `_parentWorldRotations` (captured at construction)
 *     still see the bone parent at 180°-Y, so the sync formula applies
 *     animations through a stale frame and produces wrong arm/leg
 *     orientations.
 *
 * The fix that actually works:
 *   1. Reset every flipped scene-root child's quaternion to identity.
 *   2. Update world matrices so the raw bones reflect the un-flipped
 *      state (their `matrixWorld` is read by the rig builder).
 *   3. Construct a fresh `VRMHumanoidRig(humanoid._rawHumanBones)`. The
 *      constructor's `_setupTransforms` walks each raw bone, captures
 *      its current `matrixWorld`-decomposed rotation as
 *      `parentWorldRotations` and `boneRotations`, and builds a fresh
 *      normalized bone tree. Three-vrm doesn't expose a public
 *      "rebuild" so we grab the constructor reference off the existing
 *      `_normalizedHumanBones.constructor` (same class).
 *   4. Swap `humanoid._normalizedHumanBones` to the new rig.
 *   5. CRITICAL: the AnimationMixer resolves bones by name from
 *      `vrm.scene`. The original rig root was added to `vrm.scene` by
 *      VRMLoaderPlugin (see three-vrm.module.js line 2129); we need to
 *      detach it and attach the new rig root in its place, otherwise
 *      the mixer keeps driving stale-rest bones from the old rig.
 *   6. Run `vrm.update(0)` once so the new rest propagates to the raw
 *      humanoid before the next animation frame.
 *
 * Idempotent. No-op for VRMs already in canonical orientation (no
 * children carry the 180°-Y quaternion).
 */
function unflipBakedRotation(vrm: VRM): void {
  const isFlipQuat = (q: THREE.Quaternion): boolean =>
    Math.abs(q.x) < 1e-3 &&
    Math.abs(q.y - 1) < 1e-3 &&
    Math.abs(q.z) < 1e-3 &&
    Math.abs(q.w) < 1e-3;

  let unwoundCount = 0;
  for (const child of vrm.scene.children) {
    if (isFlipQuat(child.quaternion)) {
      child.quaternion.identity();
      unwoundCount += 1;
    }
  }
  if (unwoundCount === 0) return;

  vrm.scene.updateMatrixWorld(true);

  // three-vrm internals — these private fields are stable across 2.x/3.x
  // (verified against three-vrm.module.js for the version in node_modules):
  //   _rawHumanBones      → VRMRig built from the GLTF humanoid bones
  //   _normalizedHumanBones → VRMHumanoidRig built FROM _rawHumanBones
  //                          (captures parentWorldRotations + boneRotations)
  type HumanoidInternals = {
    _rawHumanBones: unknown;
    _normalizedHumanBones: { root: THREE.Object3D; constructor: new (raw: unknown) => unknown };
  };
  const humanoid = vrm.humanoid as unknown as HumanoidInternals | null;
  if (!humanoid?._normalizedHumanBones || !humanoid?._rawHumanBones) {
    console.warn('[vrm-load] humanoid internals unavailable — three-vrm shape changed; skipping rig rebuild');
    return;
  }

  const oldNormalizedRig = humanoid._normalizedHumanBones;
  const oldRigRoot = oldNormalizedRig.root;
  const VRMHumanoidRigCtor = oldNormalizedRig.constructor;

  // Detach the stale rig from vrm.scene so AnimationMixer's
  // name-resolution doesn't keep finding its bones first.
  if (oldRigRoot.parent) oldRigRoot.parent.remove(oldRigRoot);

  let rebuilt: { root: THREE.Object3D } | null = null;
  try {
    rebuilt = new VRMHumanoidRigCtor(humanoid._rawHumanBones) as { root: THREE.Object3D };
  } catch (err) {
    // restore old rig if construction blew up so we don't leave the VRM
    // in a half-broken state
    vrm.scene.add(oldRigRoot);
    console.warn('[vrm-load] failed to rebuild humanoid rig; reverting to baked-flip state', err);
    return;
  }

  humanoid._normalizedHumanBones = rebuilt as never;
  vrm.scene.add(rebuilt.root);
  vrm.update(0);

  console.info(
    '[vrm-load] unflipped',
    unwoundCount,
    'scene root child(ren); rebuilt + swapped normalized humanoid rig',
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

  // un-flip VRoid's baked 180°-Y root rotation and rebuild the humanoid
  // rig in place so the AnimationMixer drives the freshly-captured rest
  // (see unflipBakedRotation docstring for the full reasoning).
  unflipBakedRotation(vrm);

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
