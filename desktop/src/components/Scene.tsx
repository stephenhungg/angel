import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { Room } from '@/components/Room';
import { Avatar, type AvatarHandle } from '@/components/Avatar';
import { ActionRunner } from '@/components/ActionRunner';
import { Player } from '@/components/Player';
import { DeskMonitor } from '@/components/DeskMonitor';
import { AnimationTestPanel } from '@/components/AnimationTestPanel';
import {
  InteractableDebugMarkers,
  InteractablePicker,
  InteractablePromptHUD,
  PlayerInteractKeyHandler,
} from '@/components/InteractableOverlay';
import { CalibrationOverlay, CalibrationRaycaster, CalibrationGhostPreview } from '@/components/CalibrationOverlay';
import { isChairAnchor, yawToFace } from '@/lib/anchors';
import { useAngelStore } from '@/stores/angel';
import { listVrms, type VrmMatch } from '@/lib/vrmMatcher';

// Original placeholder VRM, restored from git after the swipe-pipeline
// merge clobbered it. The abison-curated pool (cottagecore, academia,
// tech-minimal, cyber) all ship with arms-up bind poses that bleed through
// our Mixamo retarget when an idle clip doesn't drive every arm bone — this
// model behaves cleanly with Idle.fbx, so it's the safe fallback.
const FALLBACK_VRM = '/vrm/2068967230566994300.vrm';
const FALLBACK_ROOM = '/room.glb';

type SceneProps = {
  /** show debug HUD overlay (room/vrm load state, position, etc.) */
  debug?: boolean;
};

/** Place the avatar at a sensible spawn point once the room is ready. We
 * override the room's `center` anchor with a left-side offset so the player
 * (who spawns near the door) has a clear sightline of her, and rotate her
 * 180° to face that direction. */
const AVATAR_SPAWN_POS: [number, number, number] = [-1.5, 0, -0.2];
const AVATAR_SPAWN_YAW = Math.PI;

function SpawnAvatarAtAnchor({
  avatarRef,
}: {
  avatarRef: React.MutableRefObject<AvatarHandle | null>;
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
      root.position.set(...AVATAR_SPAWN_POS);
      root.rotation.y = AVATAR_SPAWN_YAW;
      console.info('[scene] spawned avatar at', AVATAR_SPAWN_POS, 'yaw', AVATAR_SPAWN_YAW.toFixed(2));
      window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [avatarRef]);
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

/**
 * Passive body-tracking — when the avatar is idle (no scripted action,
 * no walking, no sitting clip), smoothly rotate her body yaw to face the
 * user. Pairs with AvatarLookAtPlayer (eyes/head) so she actively gives
 * the user attention even when nothing's been said. Bails out the moment
 * any tool-driven action takes over so we don't fight scripted rotation.
 */
const BODY_TRACK_SPEED = 2.4; // rad/s of damping pull toward target yaw
const BODY_TRACK_DEADZONE = 0.045; // rad ~2.6° below which we don't bother
const BODY_TRACK_MIN_DIST = 0.18; // m below which atan2 jitter dominates
const TWO_PI = Math.PI * 2;

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return d;
}

function AvatarBodyTrackUser({
  avatarRef,
}: {
  avatarRef: React.MutableRefObject<AvatarHandle | null>;
}) {
  useFrame((_, dt) => {
    const root = avatarRef.current?.getRoot();
    if (!root) return;

    const s = useAngelStore.getState();
    // bail when something else owns rotation:
    //  - a scripted SceneAction is mid-flight
    //  - she's walking (the walker drives yaw to motion direction)
    //  - she's playing a non-idle clip (sitting / typing / wave / thinking)
    //  - she's seated at a chair anchor (sitting pose has a fixed facing)
    if (s.current) return;
    if (s.state.isWalking) return;
    if (s.currentClip !== 'idle') return;
    if (isChairAnchor(s.state.location)) return;

    const p = s.player;
    const dx = p.x - root.position.x;
    const dz = p.z - root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < BODY_TRACK_MIN_DIST) return; // user standing on her — skip

    const targetYaw = yawToFace(dx, dz);
    const delta = shortestAngle(root.rotation.y, targetYaw);
    if (Math.abs(delta) < BODY_TRACK_DEADZONE) return;

    // critically-damped lerp: never overshoots, eases in.
    const k = Math.min(1, dt * BODY_TRACK_SPEED);
    root.rotation.y += delta * k;
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
  const calibrationOpen = useAngelStore((s) => s.calibrationOpen);
  const avatarRef = useRef<AvatarHandle | null>(null);
  const sceneWrapRef = useRef<HTMLDivElement | null>(null);
  const [roomRoot, setRoomRoot] = useState<THREE.Object3D | null>(null);
  const [debugInfo, setDebugInfo] = useState({ vrm: false, room: false });

  const vrmUrl = persona?.vrmUrl ?? FALLBACK_VRM;

  const handleRoomLoad = useCallback((r: THREE.Object3D) => {
    setRoomRoot(r);
    setDebugInfo((d) => (d.room ? d : { ...d, room: true }));
  }, []);

  // flat list of room mesh colliders, recomputed only when the room scene
  // root changes. Shared between Player physics and the calibration raycaster.
  const colliders = useMemo<THREE.Object3D[]>(() => {
    if (!roomRoot) return [];
    const list: THREE.Object3D[] = [];
    roomRoot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) list.push(o);
    });
    return list;
  }, [roomRoot]);

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
          <Room url={FALLBACK_ROOM} onLoad={handleRoomLoad} />
        </Suspense>

        {/* avatar lives outside the room's Suspense so a slow/missing room
            never hides her. */}
        <Suspense fallback={null}>
          <Avatar ref={avatarRef} vrmUrl={vrmUrl} />
        </Suspense>

        {/* far-below safety floor — only catches the player if they fall
            through the room's floor; deep enough not to z-fight visible geo */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -2, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#0d0a14" roughness={1} metalness={0} />
        </mesh>

        <ContactShadows
          position={[0, 0.012, 0]}
          opacity={0.45}
          blur={2.4}
          scale={5}
          far={2.5}
          resolution={1024}
          color="#1a0c1f"
        />

        <ActionRunner avatarRef={avatarRef} roomRoot={roomRoot} />
        <SpawnAvatarAtAnchor avatarRef={avatarRef} />
        <AvatarLookAtPlayer avatarRef={avatarRef} />
        <AvatarBodyTrackUser avatarRef={avatarRef} />
        <Player roomRoot={roomRoot} locked={pointerLocked} />

        {/* interactables — only render the wireframe markers while the
            calibration HUD is open. During normal play, in-world prompts
            are enough; the orbs were too noisy. */}
        <InteractablePicker />
        <InteractableDebugMarkers visible={calibrationOpen} />
        <CalibrationRaycaster colliders={colliders} />
        <CalibrationGhostPreview />

        {/* desk monitor — codex stdout streams here when angel is delegating
            (the 30% bg-execution rubric). position is rough; tune live or
            replace with an `Anchor_Monitor` empty in room.glb. */}
        <DeskMonitor position={[-1.85, 1.08, -1.05]} rotationY={Math.PI / 2} scale={0.36} />

        {/* track vrm load state into the HUD */}
        <VrmLoadProbe avatarRef={avatarRef} onChange={(b) => setDebugInfo((d) => (d.vrm === b ? d : { ...d, vrm: b }))} />
      </Canvas>

      <PointerLockBridge canvasParentRef={sceneWrapRef} />

      {!pointerLocked && <PointerLockPrompt />}
      {pointerLocked && <Crosshair />}
      <InteractablePromptHUD />
      <PlayerInteractKeyHandler />
      <CalibrationOverlay />
      {/* debug surfaces only during the esc/menu state — they'd clutter
          the in-game view otherwise */}
      {debug && !pointerLocked && <SceneDebugBadge {...debugInfo} />}
      {debug && !pointerLocked && <AnimationTestPanel avatarRef={avatarRef} />}
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

/**
 * The "esc tab" — when pointer-lock is released, the world dims and a
 * MiSide-coded pause menu floats centered. Chunky persona-accent border,
 * dark plum card, sparkle corners, big display name as the title, controls
 * laid out as labelled key-chips.
 *
 * Stays pointer-events: none on the backdrop so the global click-to-lock
 * bridge still fires from anywhere on screen.
 */
function PointerLockPrompt() {
  const persona = useAngelStore((s) => s.persona);
  const stateEmotion = useAngelStore((s) => s.state.emotion);
  const swapVrm = useAngelStore((s) => s.swapVrm);
  const accent = persona?.paletteHex ?? '#ff7eb6';

  const controls: Array<{ keys: string[]; label: string }> = [
    { keys: ['W', 'A', 'S', 'D'], label: 'move' },
    { keys: ['mouse'], label: 'look' },
    { keys: ['shift'], label: 'sprint' },
    { keys: ['E'], label: 'interact' },
    { keys: ['T'], label: 'talk' },
    { keys: ['R'], label: 'respawn' },
    { keys: ['K'], label: 'calibrate' },
    { keys: ['esc'], label: 'menu' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(ellipse at center, rgba(13,10,20,0.55), rgba(13,10,20,0.88) 70%)',
        backdropFilter: 'blur(6px) saturate(120%)',
        WebkitBackdropFilter: 'blur(6px) saturate(120%)',
        zIndex: 50,
        cursor: 'pointer',
        pointerEvents: 'none', // bubble click to scene wrap so PointerLockBridge handles it
        animation: 'angel-fade-in 220ms ease',
      }}
    >
      <div
        style={{
          position: 'relative',
          minWidth: 460,
          maxWidth: 560,
          padding: '34px 44px 30px',
          borderRadius: 28,
          background:
            'linear-gradient(180deg, rgba(28, 16, 36, 0.95) 0%, rgba(20, 12, 28, 0.95) 100%)',
          border: `3px solid ${accent}`,
          boxShadow: [
            '0 24px 60px -12px rgba(0,0,0,0.7)',
            `0 0 60px -10px ${accent}`,
            '0 0 0 4px rgba(255,255,255,0.04) inset',
            '0 1px 0 rgba(255,255,255,0.14) inset',
          ].join(', '),
          textAlign: 'center',
        }}
      >
        {/* corner sparkles — MiSide-coded kawaii decoration */}
        <CornerSparkle accent={accent} style={{ top: -12, left: -12 }} />
        <CornerSparkle accent={accent} style={{ top: -12, right: -12 }} />
        <CornerSparkle accent={accent} style={{ bottom: -12, left: -12 }} />
        <CornerSparkle accent={accent} style={{ bottom: -12, right: -12 }} />

        {/* tag chip — chapter-title vibe */}
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 10,
            letterSpacing: '0.34em',
            textTransform: 'uppercase',
            color: accent,
            opacity: 0.9,
            marginBottom: 6,
          }}
        >
          ♡ paused
        </div>

        {/* big chunky title — the persona is the menu's identity */}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 64,
            lineHeight: 1,
            letterSpacing: '0.01em',
            color: 'var(--angel-fg)',
            textShadow: `0 2px 0 rgba(0,0,0,0.45), 0 0 28px ${accent}66`,
          }}
        >
          {persona?.name ?? 'angel'}
          <span style={{ color: accent }}>.</span>
        </div>

        {/* persona traits subtitle */}
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--angel-fg-muted)',
            marginTop: 10,
            marginBottom: 22,
          }}
        >
          {persona
            ? `${persona.traits.aesthetic} · ${persona.traits.disposition} · ${persona.traits.style} · ${stateEmotion}`
            : 'discovered, not designed'}
        </div>

        {/* CTA — chunky persona-accent pill with a 4px dropdown shadow that
            screams "video game button". Pulsing softly to invite the click. */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 28px',
            borderRadius: 999,
            background: accent,
            color: '#1a0c1f',
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            letterSpacing: '0.02em',
            boxShadow: [
              '0 1px 0 rgba(255,255,255,0.5) inset',
              `0 0 36px -4px ${accent}`,
              '0 4px 0 rgba(0,0,0,0.32)',
            ].join(', '),
            animation: 'angel-pulse 2.4s ease-in-out infinite',
          }}
        >
          ▶ click to play
        </div>

        {/* divider */}
        <div
          style={{
            margin: '26px auto 14px',
            height: 1,
            width: '70%',
            background: `linear-gradient(90deg, transparent, ${accent}66, transparent)`,
          }}
        />

        {/* body picker — swap which VRM she's wearing without losing
            personality. Useful for testing all 5 curated bodies against the
            same persona. The currently-loaded vrm gets a glowing accent ring. */}
        <VrmBodyPicker
          currentVrmUrl={persona?.vrmUrl}
          onSelect={(match) => swapVrm(match.vrmUrl)}
          accent={accent}
        />

        {/* divider 2 */}
        <div
          style={{
            margin: '14px auto 18px',
            height: 1,
            width: '70%',
            background: `linear-gradient(90deg, transparent, ${accent}66, transparent)`,
          }}
        />

        {/* controls grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px 28px',
          }}
        >
          {controls.map(({ keys, label }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                fontFamily: 'var(--font-ui)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'var(--angel-fg-muted)',
                }}
              >
                {label}
              </span>
              <span style={{ display: 'flex', gap: 4 }}>
                {keys.map((k) => (
                  <KeyChip key={k} label={k} accent={accent} />
                ))}
              </span>
            </div>
          ))}
        </div>

        {/* rediscover — wipes saved persona + swipe state, sends back to
            title. Pointer-events on so it's clickable through the otherwise
            click-through pause backdrop. */}
        <button
          type="button"
          data-no-lock
          onClick={(e) => {
            e.stopPropagation();
            void import('@/lib/personaPersist').then((m) => m.rediscoverAngel());
          }}
          style={{
            marginTop: 22,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'transparent',
            border: `1px solid ${accent}55`,
            color: 'var(--angel-fg-muted)',
            fontFamily: 'var(--font-ui)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            pointerEvents: 'auto',
            transition: 'border-color 180ms ease, color 180ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = accent;
            e.currentTarget.style.color = 'var(--angel-fg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = `${accent}55`;
            e.currentTarget.style.color = 'var(--angel-fg-muted)';
          }}
        >
          ↺ rediscover
        </button>
      </div>
    </div>
  );
}

function KeyChip({ label, accent }: { label: string; accent: string }) {
  const isWord = label.length > 1;
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        minWidth: isWord ? undefined : 24,
        height: 24,
        padding: isWord ? '0 8px' : 0,
        borderRadius: 6,
        background: 'rgba(255,255,255,0.08)',
        border: `1px solid ${accent}66`,
        color: 'var(--angel-fg)',
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        letterSpacing: '0.04em',
        textTransform: 'lowercase',
        boxShadow: [
          '0 1px 0 rgba(255,255,255,0.18) inset',
          '0 2px 0 rgba(0,0,0,0.35)',
        ].join(', '),
      }}
    >
      {label}
    </span>
  );
}

function CornerSparkle({ accent, style }: { accent: string; style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: 18,
        height: 18,
        display: 'grid',
        placeItems: 'center',
        color: accent,
        fontFamily: 'var(--font-display)',
        fontSize: 16,
        lineHeight: 1,
        textShadow: `0 0 10px ${accent}`,
        opacity: 0.95,
        animation: 'angel-pulse 2.6s ease-in-out infinite',
        ...style,
      }}
    >
      ✦
    </span>
  );
}

/**
 * Body picker — five tappable VRM thumbnails for swapping which model is
 * loaded into the scene. Currently-loaded one gets a glowing accent ring.
 * Personality (voice, palette, traits) stays put — only the model file
 * swaps. Useful for testing all 5 curated bodies without re-running the
 * full swipe flow each time.
 */
function VrmBodyPicker({
  currentVrmUrl,
  onSelect,
  accent,
}: {
  currentVrmUrl: string | undefined;
  onSelect: (match: VrmMatch) => void;
  accent: string;
}) {
  const vrms = listVrms();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 9,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: 'var(--angel-fg-muted)',
          opacity: 0.7,
        }}
      >
        body
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {vrms.map((v) => {
          const selected = currentVrmUrl === v.vrmUrl;
          return (
            <button
              key={v.id}
              type="button"
              data-no-lock
              title={`${v.name} · ${v.blurb}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(v);
              }}
              style={{
                position: 'relative',
                width: 56,
                height: 56,
                padding: 0,
                borderRadius: 14,
                overflow: 'hidden',
                cursor: 'pointer',
                background: 'rgba(20,12,28,0.9)',
                border: selected
                  ? `2px solid ${accent}`
                  : '2px solid rgba(255,255,255,0.08)',
                boxShadow: selected
                  ? `0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 18px -4px ${accent}, 0 4px 12px -4px rgba(0,0,0,0.6)`
                  : '0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 12px -6px rgba(0,0,0,0.5)',
                transition: 'transform 140ms ease, border-color 180ms ease, box-shadow 180ms ease',
                pointerEvents: 'auto',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                if (!selected) e.currentTarget.style.borderColor = `${accent}88`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <img
                src={v.previewUrl}
                alt={v.name}
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'top',
                  pointerEvents: 'none',
                  display: 'block',
                }}
              />
              {selected && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    bottom: 3,
                    right: 3,
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: accent,
                    boxShadow: `0 0 6px ${accent}`,
                  }}
                />
              )}
            </button>
          );
        })}
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
  const [brain, setBrain] = useState<'claude' | 'mock' | 'unknown'>('unknown');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = (await (window as unknown as {
          angel?: { invokeTool: (n: string) => Promise<{ source?: string }> };
        }).angel?.invokeTool('brain:status')) as { source?: 'claude' | 'mock' } | undefined;
        if (alive && res?.source) setBrain(res.source);
      } catch {
        /* main may not be ready yet — leave unknown */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
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
      <div>
        brain ·{' '}
        <span
          style={{
            color: brain === 'claude' ? '#9b6dff' : brain === 'mock' ? '#ffd166' : '#888',
          }}
        >
          {brain === 'unknown' ? 'checking…' : brain}
        </span>
      </div>
      <div style={{ opacity: 0.75 }}>
        you · ({player.x.toFixed(2)}, {player.y.toFixed(2)}, {player.z.toFixed(2)})
      </div>
    </div>
  );
}
