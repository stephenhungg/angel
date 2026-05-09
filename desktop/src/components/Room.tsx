import { useEffect, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

type RoomProps = {
  url?: string;
  /** scale override; if omitted the room is auto-fit to TARGET_FOOTPRINT */
  scale?: number;
  /** target footprint (longest horizontal dimension) in metres. We scale by
   *  horizontal extent rather than height so single-storey rooms with low
   *  ceilings stay walkable. */
  targetFootprint?: number;
  /** notify parent when the scene root is available (for anchor lookup) */
  onLoad?: (root: THREE.Object3D) => void;
};

const DEFAULT_TARGET_FOOTPRINT = 6.5; // m — comfy bedroom width

export function Room({ url = '/room.glb', scale, targetFootprint = DEFAULT_TARGET_FOOTPRINT, onLoad }: RoomProps) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);
  // pin onLoad in a ref so changing the inline closure on the parent doesn't
  // re-fire the auto-fit useEffect every render (which would re-apply
  // scale/translate every frame and cause the room to shimmy).
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  // guard so we only auto-fit once per scene asset
  const fittedRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    const root = groupRef.current;
    if (fittedRef.current === scene) return; // already fit this scene
    fittedRef.current = scene;

    let meshes = 0;
    const bbox = new THREE.Box3();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        meshes += 1;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bbox.expandByObject(mesh);
        // sketchfab anime rooms ship with PBR materials that look completely
        // black without an environment map. Make them respond to env + lights.
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((m) => {
          const mat = m as THREE.MeshStandardMaterial;
          if ('envMapIntensity' in mat) mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 1, 1.0);
          // some exports flag textures wrong; force sRGB on the base color tex
          if (mat.map && (mat.map as THREE.Texture).colorSpace === THREE.NoColorSpace) {
            mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.needsUpdate = true;
          }
        });
      }
    });

    const size = bbox.getSize(new THREE.Vector3());

    // auto-fit by horizontal footprint. Rooms ship in wildly different
    // authored units (cm vs m vs ue) — we just want the longest horizontal
    // edge to be roughly bedroom-sized so a 1.6m camera fits inside.
    if (scale == null && size.x > 0.001 && size.z > 0.001) {
      const horizontal = Math.max(size.x, size.z);
      const fit = targetFootprint / horizontal;
      root.scale.setScalar(fit);

      // re-evaluate the bbox after scaling so we can sit the floor at y=0
      // and center the room horizontally on the world origin.
      const after = new THREE.Box3().setFromObject(root);
      const center = after.getCenter(new THREE.Vector3());
      root.position.x -= center.x;
      root.position.z -= center.z;
      root.position.y -= after.min.y;

      console.info('[room] auto-fit', {
        rawSize: `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`,
        scale: fit.toFixed(3),
        finalSize: `${(size.x * fit).toFixed(2)}×${(size.y * fit).toFixed(2)}×${(size.z * fit).toFixed(2)}`,
      });
    }

    console.info('[room] loaded', { meshes, size: `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}` });
    onLoadRef.current?.(root);
  }, [scene, scale, targetFootprint]);

  return (
    <group ref={groupRef} scale={scale ?? undefined}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload('/room.glb');
