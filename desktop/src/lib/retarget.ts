/**
 * Mixamo .fbx → VRM humanoid retarget.
 *
 * Adapted from the canonical three-vrm reference example
 * (https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm/examples/humanoidAnimation/loadMixamoAnimation.js).
 * Direct rotation copy doesn't work because Mixamo and VRM bones rest in
 * different orientations — without rest-pose remapping the legs come out
 * upside-down and the elbows hyperextend.
 *
 * Algorithm:
 *  - For each Mixamo track, look up the corresponding VRM bone.
 *  - Capture each Mixamo bone's rest-pose world rotation + parent's rest
 *    world rotation. The animation quaternion is in the parent's space, so
 *    `qMixamo · restMixamo⁻¹` is the *rotation delta from rest*. We then
 *    re-express that delta in the parent's world frame.
 *  - For VRM 0.x avatars (which face −Z), flip X/Z components.
 *  - Hip position is scaled by (vrmHipHeight / mixamoHipHeight).
 */
import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

const MIXAMO_TO_VRM: Record<string, VRMHumanBoneName> = {
  Hips: 'hips',
  Spine: 'spine',
  Spine1: 'chest',
  Spine2: 'upperChest',
  Neck: 'neck',
  Head: 'head',
  LeftShoulder: 'leftShoulder',
  LeftArm: 'leftUpperArm',
  LeftForeArm: 'leftLowerArm',
  LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder',
  RightArm: 'rightUpperArm',
  RightForeArm: 'rightLowerArm',
  RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg',
  LeftLeg: 'leftLowerLeg',
  LeftFoot: 'leftFoot',
  LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg',
  RightLeg: 'rightLowerLeg',
  RightFoot: 'rightFoot',
  RightToeBase: 'rightToes',
};

function getVrmBoneNode(vrm: VRM, vrmBoneName: VRMHumanBoneName): THREE.Object3D | null {
  const humanoid = vrm.humanoid;
  if (!humanoid) return null;
  const fn =
    (humanoid as unknown as { getNormalizedBoneNode?: (n: string) => THREE.Object3D | null })
      .getNormalizedBoneNode ??
    (humanoid as unknown as { getBoneNode?: (n: string) => THREE.Object3D | null }).getBoneNode;
  return fn?.call(humanoid, vrmBoneName) ?? null;
}

/**
 * Retargets a Mixamo-rigged FBX clip onto a VRM. The fbx must contain its
 * mixamorig skeleton tree (used to read rest-pose orientations).
 *
 * `stripHipsXZ` (default true) zeroes out hip translation in the X/Z axes
 * — keeping vertical bob — so the ActionRunner is the single source of
 * truth for in-world translation. Without this, "Walking.fbx" drifts the
 * avatar forward inside her own group AND we move the group, double-counting.
 */
export function retargetMixamoClip(
  srcClip: THREE.AnimationClip,
  vrm: VRM,
  mixamoAsset: THREE.Object3D,
  options: { stripHipsXZ?: boolean } = {},
): THREE.AnimationClip {
  const stripHipsXZ = options.stripHipsXZ ?? true;
  const tracks: THREE.KeyframeTrack[] = [];

  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quat = new THREE.Quaternion();
  const _vec = new THREE.Vector3();

  // hip height ratio for scaling root translation
  const mixamoHips = mixamoAsset.getObjectByName('mixamorigHips') ?? findHipNode(mixamoAsset);
  const motionHipsY = mixamoHips ? mixamoHips.position.y : 100;

  const vrmHipsNode = getVrmBoneNode(vrm, 'hips');
  let vrmHipsHeight = 1.0;
  if (vrmHipsNode) {
    vrmHipsNode.getWorldPosition(_vec);
    const hipsWorldY = _vec.y;
    vrm.scene.getWorldPosition(_vec);
    const rootWorldY = _vec.y;
    vrmHipsHeight = Math.abs(hipsWorldY - rootWorldY) || 1.0;
  }
  const hipsPositionScale = vrmHipsHeight / motionHipsY;

  const isVrm0 = (vrm.meta as { metaVersion?: string })?.metaVersion === '0';

  for (const track of srcClip.tracks) {
    // track name format:  "<boneName>.<property>"
    const dot = track.name.indexOf('.');
    if (dot < 0) continue;
    const mixamoRigName = track.name.slice(0, dot);
    const propertyName = track.name.slice(dot + 1);

    const stripped = mixamoRigName.replace(/^mixamorig:?_?/i, '');
    const vrmBoneName = MIXAMO_TO_VRM[stripped];
    if (!vrmBoneName) continue;

    const vrmNode = getVrmBoneNode(vrm, vrmBoneName);
    if (!vrmNode) continue;
    const vrmNodeName = vrmNode.name;

    const mixamoRigNode = mixamoAsset.getObjectByName(mixamoRigName);
    if (!mixamoRigNode) continue;

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // capture rest-pose orientation of this Mixamo bone, and its parent's
      // rest world orientation. animation rotations sit in the parent's
      // local space; remapping = `parentRest · qAnim · restInv`.
      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      const parent = mixamoRigNode.parent;
      if (parent) parent.getWorldQuaternion(parentRestWorldRotation);
      else parentRestWorldRotation.identity();

      const values = track.values.slice() as Float32Array;
      for (let i = 0; i < values.length; i += 4) {
        _quat.fromArray(values, i);
        _quat.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        _quat.toArray(values, i);
      }

      // VRM 0.x faces -Z while the rest of three faces +Z; mirror the
      // quaternion's X and Z components for those models.
      if (isVrm0) {
        for (let i = 0; i < values.length; i += 4) {
          values[i] *= -1;       // x
          values[i + 2] *= -1;   // z
        }
      }

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          Array.from(track.times),
          Array.from(values),
        ),
      );
            } else if (track instanceof THREE.VectorKeyframeTrack && vrmBoneName === 'hips') {
              const values = track.values.slice() as Float32Array;
              for (let i = 0; i < values.length; i++) values[i] *= hipsPositionScale;
              // mirror x/z for VRM 0.x
              if (isVrm0) {
                for (let i = 0; i < values.length; i += 3) {
                  values[i] *= -1;
                  values[i + 2] *= -1;
                }
              }
              // strip in-world translation from the clip; ActionRunner
              // owns the avatar's position. We keep the y axis so vertical
              // bob during walking still reads.
              if (stripHipsXZ) {
                for (let i = 0; i < values.length; i += 3) {
                  values[i] = 0;     // x
                  values[i + 2] = 0; // z
                }
              }
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          Array.from(track.times),
          Array.from(values),
        ),
      );
    }
  }

  return new THREE.AnimationClip(srcClip.name || 'retargeted', srcClip.duration, tracks);
}

function findHipNode(asset: THREE.Object3D): THREE.Object3D | null {
  let hit: THREE.Object3D | null = null;
  asset.traverse((o) => {
    if (hit) return;
    if (/hips/i.test(o.name) && /mixamorig/i.test(o.name)) hit = o;
  });
  return hit;
}
