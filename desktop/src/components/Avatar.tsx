import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { VRM } from '@pixiv/three-vrm';
import type { AnimationClip as ClipName } from '@angel/shared';

import { loadVRM } from '@/lib/vrm-load';
import { retargetMixamoClip } from '@/lib/retarget';
import {
  applyEmotionExpression,
  applyLookAt,
  createExpressionState,
  tickExpressions,
} from '@/lib/expressions';
import { useAngelStore } from '@/stores/angel';

export type AvatarHandle = {
  /** crossfade into a named clip; missing clips silently degrade to default pose */
  play: (clip: ClipName, fadeMs?: number) => void;
  /** the loaded VRM (null while loading) */
  getVRM: () => VRM | null;
  /** wrapping group — ActionRunner mutates its position/rotation for walk lerp */
  getRoot: () => THREE.Group | null;
};

type AvatarProps = {
  vrmUrl: string;
  /** map of clip name → fbx URL. The retargeter copies rotations only. */
  clips?: Partial<Record<ClipName, string>>;
};

/* The default fbx clip table. Files that 404 are skipped silently so we can
   ship with whatever's on disk. Names matched to actual files in
   desktop/public/animations/. */
const DEFAULT_CLIPS: Partial<Record<ClipName, string>> = {
  idle: '/animations/Idle.fbx',
  walking: '/animations/Walking.fbx',
  sitting: '/animations/Sitting.fbx',
  typing: '/animations/typing%20flow/Typing.fbx',
  wave: '/animations/celebration.fbx',
};

/** Target avatar height in world units. Real-world humans are ~1.6m. The
 * avatar is auto-scaled to this on load so it's never tiny relative to a
 * room scaled in different units. */
const TARGET_AVATAR_HEIGHT = 1.62;

export const Avatar = forwardRef<AvatarHandle, AvatarProps>(function Avatar(
  { vrmUrl, clips = DEFAULT_CLIPS },
  ref,
) {
  const groupRef = useRef<THREE.Group>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<ClipName, THREE.AnimationAction>>>({});
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const expressionStateRef = useRef(createExpressionState());

  const { camera } = useThree();
  const emotion = useAngelStore((s) => s.state.emotion);
  const mouthOpenRef = useRef(0);
  useEffect(() => {
    return useAngelStore.subscribe(
      (s) => s.mouthOpen,
      (v) => {
        mouthOpenRef.current = v;
      },
    );
  }, []);

  // load vrm + clips
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await loadVRM(vrmUrl);
        if (cancelled) return;

        // NB: avatar auto-scale temporarily disabled — was producing
        // "kicked out of the house" results. Use TARGET_AVATAR_HEIGHT
        // manually if/when we want to renormalise.
        void TARGET_AVATAR_HEIGHT;

        setVrm(v);
        const mixer = new THREE.AnimationMixer(v.scene);
        mixerRef.current = mixer;

        // load each declared fbx clip in parallel; tolerate 404
        const loader = new FBXLoader();
        const entries = Object.entries(clips) as Array<[ClipName, string]>;
        const results = await Promise.allSettled(
          entries.map(async ([name, url]) => {
            try {
              const fbx = await loader.loadAsync(url);
              const src = fbx.animations?.[0];
              if (!src) return null;
              const retargeted = retargetMixamoClip(src, v, fbx);
              const action = mixer.clipAction(retargeted);
              action.setLoop(THREE.LoopRepeat, Infinity);
              return [name, action] as const;
            } catch (err) {
              console.info(`[avatar] clip "${name}" not loaded (${url})`, err);
              return null;
            }
          }),
        );
        if (cancelled) return;
        const map: Partial<Record<ClipName, THREE.AnimationAction>> = {};
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            const [name, action] = r.value;
            map[name] = action;
          }
        }
        actionsRef.current = map;

        // start idle if available
        const idle = map.idle;
        if (idle) {
          idle.play();
          currentActionRef.current = idle;
        }
      } catch (err) {
        console.error('[avatar] failed to load vrm', err);
      }
    })();
    return () => {
      cancelled = true;
      mixerRef.current?.stopAllAction();
    };
  }, [vrmUrl, clips]);

  // emotion → blend-shape preset
  useEffect(() => {
    if (!vrm) return;
    applyEmotionExpression(vrm, emotion);
  }, [vrm, emotion]);

  // per-frame: mixer + vrm + procedural overlays + look-at camera + mouth
  useFrame((_, dt) => {
    mixerRef.current?.update(dt);
    if (!vrm) return;
    vrm.update(dt);
    tickExpressions(vrm, expressionStateRef.current, dt);
    applyLookAt(vrm, camera, 4);

    // mouth lipsync — drive 'aa' viseme weight smoothed toward target
    const em = (vrm as unknown as { expressionManager?: { setValue: (n: string, v: number) => void } })
      .expressionManager;
    const bs = (vrm as unknown as { blendShapeProxy?: { setValue: (n: string, v: number) => void } })
      .blendShapeProxy;
    if (em?.setValue) em.setValue('aa', mouthOpenRef.current);
    else if (bs?.setValue) bs.setValue('a', mouthOpenRef.current);
  });

  useImperativeHandle(
    ref,
    () => ({
      play: (clip: ClipName, fadeMs = 250) => {
        const next = actionsRef.current[clip];
        if (!next) {
          // graceful degrade — fall back to idle if loaded, else keep current
          // clip running. better than dropping to T-pose mid-demo.
          const idle = actionsRef.current.idle;
          if (idle && currentActionRef.current !== idle) {
            idle.reset().fadeIn(fadeMs / 1000).play();
            currentActionRef.current?.fadeOut(fadeMs / 1000);
            currentActionRef.current = idle;
          }
          return;
        }
        if (currentActionRef.current === next) {
          if (!next.isRunning()) next.play();
          return;
        }
        next.reset();
        next.fadeIn(fadeMs / 1000);
        next.play();
        currentActionRef.current?.fadeOut(fadeMs / 1000);
        currentActionRef.current = next;
      },
      getVRM: () => vrm,
      getRoot: () => groupRef.current,
    }),
    [vrm],
  );

  return (
    <group ref={groupRef}>
      {vrm && <primitive object={vrm.scene} />}
    </group>
  );
});
