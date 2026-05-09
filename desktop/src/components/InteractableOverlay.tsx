/**
 * InteractableOverlay — visual debug rendering for the interactables registry.
 *
 *   • InteractableDebugMarkers: r3f wireframe spheres + 3D billboards in-scene.
 *   • InteractablePicker: per-frame raycast from the camera; finds the nearest
 *     interactable in your reticle cone, exposes it via the angel store, and
 *     dims/highlights the matching visual marker.
 *   • InteractablePromptHUD: 2D HUD prompt that reads the picker's selection
 *     and shows "[E] sit and type" style affordance text.
 *
 * Designed so all three are mountable independently:
 *   <InteractableDebugMarkers visible={debug} />
 *   <InteractablePicker />
 *   <InteractablePromptHUD />  (DOM, outside the canvas)
 */
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { actionLabel, getInteractables, pickInteractable, type Interactable } from '@/lib/interactables';
import { useAngelStore } from '@/stores/angel';

/* -------------------------------------------------------------------------- */
/* in-scene debug markers                                                     */
/* -------------------------------------------------------------------------- */

export function InteractableDebugMarkers({ visible = true }: { visible?: boolean }) {
  const focusedId = useAngelStore((s) => s.focusedInteractable);
  const items = getInteractables();

  if (!visible) return null;

  return (
    <group>
      {items.map((it) => {
        const focused = focusedId === it.id;
        return <InteractableMarker key={it.id} it={it} focused={focused} />;
      })}
    </group>
  );
}

function InteractableMarker({ it, focused }: { it: Interactable; focused: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const selectedId = useAngelStore((s) => s.selectedCalibrationId);
  const colors = KIND_COLORS[it.kind] ?? KIND_COLORS.use;
  // selected (in calibration) gets the gold focus color; otherwise focused
  // by reticle gets the kind's focus shade; idle gets the kind's base shade.
  const isSelected = selectedId === it.id;
  const color = isSelected ? '#ffe066' : focused ? colors.focus : colors.idle;
  const opacity = isSelected ? 0.9 : focused ? 0.6 : 0.22;

  useFrame((_, dt) => {
    const m = ringRef.current;
    if (!m) return;
    m.rotation.y += dt * (focused || isSelected ? 1.6 : 0.4);
  });

  // OBB wireframe — a unit cube scaled to halfExtents*2 inside a parent
  // group that holds the bbox center + yaw. Three's BoxGeometry is axis-
  // aligned; the parent group orientation makes the box "oriented".
  const sx = Math.max(0.05, it.bbox.halfExtents.x * 2);
  const sy = Math.max(0.05, it.bbox.halfExtents.y * 2);
  const sz = Math.max(0.05, it.bbox.halfExtents.z * 2);

  return (
    <group position={[it.bbox.center.x, it.bbox.center.y, it.bbox.center.z]} rotation={[0, it.bbox.yaw, 0]}>
      {/* OBB wireframe (the visible prop bounds) */}
      <mesh>
        <boxGeometry args={[sx, sy, sz]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} depthTest={false} />
      </mesh>
      {/* faint solid fill to give the box body without occluding the room */}
      <mesh>
        <boxGeometry args={[sx, sy, sz]} />
        <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.06 : 0.0} depthWrite={false} />
      </mesh>
      {/* spinning emphasis ring on the floor under the interactable, sized
       *  by the bbox footprint not the pickRadius so couches read as wide */}
      <mesh ref={ringRef} position={[0, -it.bbox.center.y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[
          Math.max(it.bbox.halfExtents.x, it.bbox.halfExtents.z) * 0.85,
          Math.max(it.bbox.halfExtents.x, it.bbox.halfExtents.z) * 1.0,
          32,
        ]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={isSelected ? 0.7 : focused ? 0.5 : 0.22} />
      </mesh>
      {/* floating 3D label */}
      <Billboard position={[0, sy / 2 + 0.18, 0]}>
        <Text
          fontSize={0.11}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#0d0a14"
          letterSpacing={0.05}
        >
          {it.label.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
}

const KIND_COLORS: Record<string, { idle: string; focus: string }> = {
  chair: { idle: '#9b6dff', focus: '#ffe066' },
  desk: { idle: '#ff7eb6', focus: '#ffe066' },
  computer: { idle: '#7eeaff', focus: '#ffe066' },
  window: { idle: '#7fffaf', focus: '#ffe066' },
  bookshelf: { idle: '#ffd166', focus: '#fff7c2' },
  door: { idle: '#ff9b6d', focus: '#ffe066' },
  bed: { idle: '#d8a4ff', focus: '#ffe066' },
  use: { idle: '#cccccc', focus: '#ffe066' },
};

/* -------------------------------------------------------------------------- */
/* picker (raycast)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Per-frame: shoot a ray from the camera forward, find the nearest interactable
 * in your aim cone, then ALSO check that the player is physically close enough
 * to it (the "reach"). Without this gate you could highlight + interact with
 * a chair across the room. Throttled to 12 Hz.
 */
export function InteractablePicker({
  /** how far the aim ray reaches (meters) */
  maxAimDist = 4.0,
  /** straight-line distance from player feet to the interactable, beyond
   *  which you can no longer focus / E-interact. Tighter than the aim ray
   *  so reach feels physical, not optical. */
  reach = 2.0,
}: {
  maxAimDist?: number;
  reach?: number;
} = {}) {
  const { camera } = useThree();
  const setFocused = useAngelStore((s) => s.setFocusedInteractable);
  const dirRef = useRef(new THREE.Vector3());
  const playerPosRef = useRef(new THREE.Vector3());
  const tickRef = useRef(0);

  useFrame((_, dt) => {
    tickRef.current += dt;
    if (tickRef.current < 1 / 12) return; // ~12 hz
    tickRef.current = 0;

    camera.getWorldDirection(dirRef.current);
    const hit = pickInteractable(camera.position, dirRef.current, maxAimDist);
    if (!hit) {
      setFocused(null);
      return;
    }
    // proximity gate — feet position lives in store
    const p = useAngelStore.getState().player;
    playerPosRef.current.set(p.x, p.y - 1.5, p.z); // approx feet
    const dist = playerPosRef.current.distanceTo(hit.bbox.center);
    // big props (workstation, window, bookshelf) get a slightly longer reach
    // since their hitbox center is up high or behind the interactable
    const kindReach =
      hit.kind === 'window' || hit.kind === 'bookshelf' || hit.kind === 'desk' || hit.kind === 'door'
        ? reach + 0.8
        : reach;
    if (dist > kindReach) {
      setFocused(null);
      return;
    }
    setFocused(hit.id);
  });
  return null;
}

/* -------------------------------------------------------------------------- */
/* HUD prompt (DOM)                                                           */
/* -------------------------------------------------------------------------- */

export function InteractablePromptHUD() {
  const focusedId = useAngelStore((s) => s.focusedInteractable);
  const item = useMemo(() => (focusedId ? getInteractables().find((i) => i.id === focusedId) : null), [focusedId]);
  if (!item) return null;
  const action = item.primaryAction;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 'calc(50% + 22px)',
        transform: 'translate(-50%, 0)',
        pointerEvents: 'none',
        zIndex: 35,
        background: 'rgba(13,10,20,0.8)',
        border: '1px solid rgba(255,126,182,0.4)',
        borderRadius: 6,
        padding: '6px 12px',
        fontFamily: 'var(--font-ui, monospace)',
        fontSize: 12,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--angel-fg, #fff)',
        whiteSpace: 'nowrap',
        boxShadow: '0 6px 22px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <span style={{ color: 'var(--angel-accent, #ff7eb6)', marginRight: 8 }}>[E]</span>
      <span>{actionLabel(action)}</span>
      <span style={{ marginLeft: 10, opacity: 0.5 }}>· {item.label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* E-key handler — drives player interaction                                  */
/* -------------------------------------------------------------------------- */

/**
 * Listens for E. When the focused interactable supports a player action,
 * dispatches the corresponding stance change. For the hackathon scope
 * "sitting" + "looking out window" are the supported player verbs; everything
 * else is logged so we can flesh it out fast.
 */
export function PlayerInteractKeyHandler() {
  const setSeated = useAngelStore((s) => s.setPlayerSeated);
  const seated = useAngelStore((s) => s.playerSeated);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== 'KeyE') return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      // already seated → E exits the seat
      if (seated) {
        setSeated(null);
        return;
      }
      const focusedId = useAngelStore.getState().focusedInteractable;
      if (!focusedId) return;
      const it = getInteractables().find((i) => i.id === focusedId);
      if (!it) return;
      const verb = it.primaryAction;
      if (verb === 'sit' || verb === 'sit_and_type' || verb === 'sit_playful') {
        // for player E-key, prefer the seat anchor (the locked seated pose)
        // over the approach anchor (where you stand BEFORE sitting). For
        // chairs without explicit seat we fall back to first approach.
        const seat = it.seat ?? it.approaches[0];
        setSeated({
          interactableId: it.id,
          pos: seat ? (seat.pos.toArray() as [number, number, number]) : undefined,
          yaw: seat?.yaw,
          mode: verb,
        });
      } else if (verb === 'look_out') {
        // teleport the player a step toward the window approach anchor —
        // doesn't lock them in, just plants a "you're looking outside" mood.
        const anchor = it.approaches[0];
        if (anchor) {
          // we do this through the store; Player.tsx watches lookOutTarget
          useAngelStore.getState().setLookOutTarget(anchor.pos.toArray() as [number, number, number]);
        }
      } else {
        console.info('[interact] unhandled player verb', verb, 'for', it.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seated, setSeated]);
  return null;
}
