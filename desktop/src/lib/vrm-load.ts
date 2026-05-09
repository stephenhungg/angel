import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

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

  // VRM 0.x avatars face -Z by default in three; VRM 1.0 face +Z. Both
  // appear authored to face the user (camera at +Z looking at origin),
  // so we leave rotation alone and let the action runner orient on demand.

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
