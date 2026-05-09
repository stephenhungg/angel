import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { Room } from '@/components/Room';
import { Avatar, type AvatarHandle } from '@/components/Avatar';
import { ActionRunner } from '@/components/ActionRunner';
import { Player } from '@/components/Player';
import { DeskMonitor } from '@/components/DeskMonitor';
import { useAngelStore } from '@/stores/angel';

const FALLBACK_VRM = '/vrm/2068967230566994300.vrm';
const FALLBACK_ROOM = '/room.glb';

type SceneProps = {
  /** show debug HUD overlay (room/vrm load state, position, etc.) */
  debug?: boolean;
};

/** Place the avatar at a sensible spawn anchor once the room is ready. */
function SpawnAvatarAtAnchor({
  avatarRef,
  roomRoot,
}: {
  avatarRef: React.MutableRefObject<AvatarHandle | null>;
  roomRoot: THREE.Object3D | null;
}) {
  useEffect(() => {
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      const root = avatarRef.current?.getRoot();
      if (!root) {
        if (attempts > 80) window.clearInterval(id);
        return;
      }
      import('@/lib/anchors').then(({ resolveAnchor }) => {
        const a = resolveAnchor('center', roomRoot);
        root.position.copy(a.position);
        root.rotation.y = a.rotationY;
        console.info('[scene] spawned avatar at', a.position.toArray());
      });
      window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [avatarRef, roomRoot]);
  return null;
}

/** Procedural environment map. Three's RoomEnvironment is a built-in
 * cubemap that gives PBR materials something to reflect, with no external
 * HDR fetch (so it works under the Electron CSP). */
function PMREMLighting() {
  const { gl, scene } = useThree();
  useEffect(() => {
    let mounted = true;
    let env: THREE.Texture | null = null;
    (async () => {
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      const pmrem = new THREE.PMREMGenerator(gl);
      pmrem.compileEquirectangularShader();
      env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      if (mounted) {
        scene.environment = env;
      } else {
        env.dispose();
      }
      pmrem.dispose();
    })();
    return () => {
      mounted = false;
      if (env && scene.environment === env) scene.environment = null;
      env?.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Make the avatar's head/eyes track the player. Pulled out so it can stay
 * inside the canvas with access to the Avatar handle. */
function AvatarLookAtPlayer({
  avatarRef,
}: {
  avatarRef: React.MutableRefObject<AvatarHandle | null>;
}) {
  const targetRef = useRef(new THREE.Vector3());
  useFrame(() => {
    const vrm = avatarRef.current?.getVRM();
    if (!vrm) return;
    const p = useAngelStore.getState().player;
    targetRef.current.set(p.x, p.y, p.z);
    // VRM 1.0 + 0.x both expose lookAt with a target setter
    const la = (vrm as unknown as { lookAt?: { target?: THREE.Object3D } }).lookAt;
    if (la?.target) {
      la.target.position.copy(targetRef.current);
    }
  });
  return null;
}

/** Tracks pointer-lock + click-to-lock UX. */
function PointerLockBridge({ canvasParentRef }: { canvasParentRef: React.RefObject<HTMLDivElement | null> }) {
  const setPointerLocked = useAngelStore((s) => s.setPointerLocked);
  useEffect(() => {
    const handleChange = () => {
      setPointerLocked(!!document.pointerLockElement);
    };
    document.addEventListener('pointerlockchange', handleChange);
    return () => document.removeEventListener('pointerlockchange', handleChange);
  }, [setPointerLocked]);

  useEffect(() => {
    const el = canvasParentRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      // ignore clicks on overlay UI (chat input, etc.)
      if ((e.target as HTMLElement).closest('[data-no-lock]')) return;
      const canvas = el.querySelector('canvas');
      if (!canvas) return;
      if (document.pointerLockElement) return;
      try {
        canvas.requestPointerLock();
      } catch {
        // user gesture might be invalid; ignore
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [canvasParentRef]);
  return null;
}

export function Scene({ debug = true }: SceneProps) {
  const persona = useAngelStore((s) => s.persona);
  const pointerLocked = useAngelStore((s) => s.pointerLocked);
  const avatarRef = useRef<AvatarHandle | null>(null);
  const sceneWrapRef = useRef<HTMLDivElement | null>(null);
  const [roomRoot, setRoomRoot] = useState<THREE.Object3D | null>(null);
  const [debugInfo, setDebugInfo] = useState({ vrm: false, room: false });

  const vrmUrl = persona?.vrmUrl ?? FALLBACK_VRM;

  return (
    <div ref={sceneWrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 1.55, 2.2], fov: 62, near: 0.05, far: 60 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          scene.background = new THREE.Color('#1a0f24');
          scene.fog = new THREE.Fog('#1a0f24', 7, 22);
        }}
      >
        <PMREMLighting />

        {/* warm key + cool fill so the pink anime room reads as cozy not flat */}
        <hemisphereLight args={['#ffd9c4', '#3a1a48', 0.7]} />
        <ambientLight intensity={0.3} color="#fff1e0" />
        <directionalLight
          position={[3.5, 6, 4]}
          intensity={1.9}
          color="#fff0d6"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={20}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-bias={-0.0001}
        />
        <pointLight position={[-2.4, 2, -1.2]} intensity={0.85} color="#ff7eb6" distance={7} decay={1.6} />
        <pointLight position={[1.8, 1.4, 1.0]} intensity={0.55} color="#9b6dff" distance={6} decay={1.6} />

        <Suspense fallback={null}>
          <Room url={FALLBACK_ROOM} onLoad={(r) => { setRoomRoot(r); setDebugInfo((d) => ({ ...d, room: true })); }} />
        </Suspense>

        {/* avatar lives outside the room's Suspense so a slow/missing room
            never hides her. */}
        <Suspense fallback={null}>
          <Avatar ref={avatarRef} vrmUrl={vrmUrl} />
        </Suspense>

        {/* fallback floor — visible if room.glb fails to render. transparent
            colour matches floor shadow tone so it never clashes with a
            real floor. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#231432" roughness={0.95} metalness={0} />
        </mesh>

        <ContactShadows
          position={[0, 0.005, 0]}
          opacity={0.55}
          blur={2.4}
          scale={5}
          far={3}
          resolution={1024}
          color="#1a0c1f"
        />

        <ActionRunner avatarRef={avatarRef} roomRoot={roomRoot} />
        <SpawnAvatarAtAnchor avatarRef={avatarRef} roomRoot={roomRoot} />
        <AvatarLookAtPlayer avatarRef={avatarRef} />
        <Player roomRoot={roomRoot} locked={pointerLocked} />

        {/* desk monitor — codex stdout streams here when angel is delegating
            (the 30% bg-execution rubric). position is rough; tune live or
            replace with an `Anchor_Monitor` empty in room.glb. */}
        <DeskMonitor position={[-1.85, 1.08, -1.05]} rotationY={Math.PI / 2} scale={0.36} />

        {/* track vrm load state into the HUD */}
        <VrmLoadProbe avatarRef={avatarRef} onChange={(b) => setDebugInfo((d) => (d.vrm === b ? d : { ...d, vrm: b }))} />
      </Canvas>

      <PointerLockBridge canvasParentRef={sceneWrapRef} />

      {!pointerLocked && <PointerLockPrompt />}
      <Crosshair />
      {debug && <SceneDebugBadge {...debugInfo} />}
    </div>
  );
}

function VrmLoadProbe({
  avatarRef,
  onChange,
}: {
  avatarRef: React.MutableRefObject<AvatarHandle | null>;
  onChange: (loaded: boolean) => void;
}) {
  useFrame(() => {
    onChange(!!avatarRef.current?.getVRM());
  });
  return null;
}

function PointerLockPrompt() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, rgba(13,10,20,0.55), rgba(13,10,20,0.85) 70%)',
        backdropFilter: 'blur(2px)',
        zIndex: 50,
        cursor: 'pointer',
        pointerEvents: 'none', // bubble click to scene wrap so PointerLockBridge handles it
      }}
    >
      <div
        style={{
          textAlign: 'center',
          color: 'var(--angel-fg)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.06em',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 6, color: 'var(--angel-accent)' }}>click to enter</div>
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--angel-fg-muted)',
          }}
        >
          wasd · move &nbsp;·&nbsp; mouse · look &nbsp;·&nbsp; shift · run &nbsp;·&nbsp; t · talk &nbsp;·&nbsp; r · respawn &nbsp;·&nbsp; esc · release
        </div>
      </div>
    </div>
  );
}

function Crosshair() {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 6,
        height: 6,
        marginLeft: -3,
        marginTop: -3,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.55)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 0 10px rgba(255,126,182,0.5)',
        pointerEvents: 'none',
        zIndex: 30,
      }}
    />
  );
}

function SceneDebugBadge({ vrm, room }: { vrm: boolean; room: boolean }) {
  const player = useAngelStore((s) => s.player);
  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        right: 28,
        padding: '8px 12px',
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--angel-fg-muted)',
        background: 'rgba(13,10,20,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
        backdropFilter: 'blur(6px)',
        pointerEvents: 'none',
        zIndex: 60,
        lineHeight: 1.5,
      }}
    >
      <div>
        room · <span style={{ color: room ? '#7fffaf' : '#ff7e7e' }}>{room ? 'loaded' : 'loading…'}</span>
      </div>
      <div>
        vrm · <span style={{ color: vrm ? '#7fffaf' : '#ff7e7e' }}>{vrm ? 'loaded' : 'loading…'}</span>
      </div>
      <div style={{ opacity: 0.75 }}>
        you · ({player.x.toFixed(2)}, {player.y.toFixed(2)}, {player.z.toFixed(2)})
      </div>
    </div>
  );
}
