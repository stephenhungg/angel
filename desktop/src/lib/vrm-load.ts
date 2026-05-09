import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

/**
 * Detect a baked 180°-around-Y rotation on the VRM's scene-root nodes
 * (a quirk of VRoid Studio's recent VRM 0.x exports — cottagecore /
 * tech-minimal / cyber / academia / alt-abison-5 all ship root nodes
 * with `rotation: [0, 1, 0, 0]`). The placeholder VRM doesn't have this
 * flip and faces -Z natively.
 *
 * Returns `true` if any direct child of `vrm.scene` carries the 180°-Y
 * quaternion. We intentionally **do not** modify the VRM's scene tree
 * or the humanoid rig — the rig captured its rest world rotations at
 * construction time *with* the flip in place, and the Mixamo retargeter's
 * X/Z mirror is consistent with that captured frame, so animations work
 * cleanly when we leave it alone. Instead, the Avatar component reads
 * this flag and inserts an inner wrapping group with a 180°-Y rotation
 * to canonicalize the visible forward direction to -Z. That keeps the
 * outer wrapping group (which `ActionRunner` mutates for sit/walk/face
 * yaw) and `yawToFace` semantics the same across every body.
 */
function detectBakedFlip(vrm: VRM): boolean {
  const isFlipQuat = (q: THREE.Quaternion): boolean =>
    Math.abs(q.x) < 1e-3 &&
    Math.abs(q.y - 1) < 1e-3 &&
    Math.abs(q.z) < 1e-3 &&
    Math.abs(q.w) < 1e-3;
  return vrm.scene.children.some((c) => isFlipQuat(c.quaternion));
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

  // detect VRoid's baked 180°-Y root flip (see detectBakedFlip docstring)
  // and stash the result on `vrm.scene.userData` so the Avatar component
  // can insert a compensating wrapper group. Avoids touching the rig
  // (which would invalidate its captured rest world rotations).
  const hadBakedFlip = detectBakedFlip(vrm);
  (vrm.scene.userData as { angelBakedFlip?: boolean }).angelBakedFlip = hadBakedFlip;

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
