/**
 * CalibrationOverlay v2 — form-based interactable calibration.
 *
 * Three coordinated parts:
 *
 *   1. CalibrationRaycaster — in-canvas. Emits aim-hit info and routes
 *      canvas clicks to the click-to-select picker (OBB raycast).
 *   2. CalibrationGhostPreview — in-canvas. Renders the dashed approach→seat
 *      lines, floor decals at approach points, and a translucent humanoid
 *      capsule at the seat (or first approach if no seat). Pure primitives,
 *      no VRM load.
 *   3. CalibrationOverlay — DOM. The right-docked form panel: identity,
 *      hitbox (OBB), approach points, seat, pick radius, test, save.
 *
 * UX:
 *   K          — toggle the editor
 *   click      — select an interactable in 3D
 *   form edits — update the live transform immediately
 *   Test verb  — enqueues an interact_with so you can watch the avatar
 *   Save       — writes overrides to localStorage AND fires an IPC to bake
 *                interactables.default.json (gracefully no-ops outside Electron)
 */
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import {
  clearOverrides,
  exportTransforms,
  getInteractables,
  getOverrides,
  loadOverridesFromLocalStorage,
  pickInteractableByOBB,
  saveOverridesToLocalStorage,
  setInteractableTransform,
  type Interactable,
  type InteractableAction,
  type InteractablePatch,
  type Vec3T,
} from '@/lib/interactables';
import { useAngelStore } from '@/stores/angel';
import { ipc } from '@/lib/ipc';

/* -------------------------------------------------------------------------- */
/* shared aim-state — stashed by the raycaster, read by the form panel        */
/* -------------------------------------------------------------------------- */

type AimHit = { point: THREE.Vector3; meshName: string | null } | null;
const aimHitRef: { current: AimHit } = { current: null };

const TWO_PI = Math.PI * 2;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/* -------------------------------------------------------------------------- */
/* in-canvas — aim raycaster + click-to-select bridge                         */
/* -------------------------------------------------------------------------- */

/** In-canvas: per-frame raycast for aim readout and Fit-to-mesh, AND a
 *  one-time pointer-down listener that converts canvas clicks into "select
 *  the OBB you clicked on" while the editor is open. */
export function CalibrationRaycaster({ colliders }: { colliders: THREE.Object3D[] }) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dirRef = useRef(new THREE.Vector3());
  const setSelected = useAngelStore((s) => s.setSelectedCalibrationId);

  // per-frame aim probe (reuses the colliders for surface picking)
  useFrame(() => {
    if (!useAngelStore.getState().calibrationOpen) {
      aimHitRef.current = null;
      return;
    }
    camera.getWorldDirection(dirRef.current);
    raycaster.set(camera.position, dirRef.current);
    raycaster.far = 14;
    const hits = raycaster.intersectObjects(colliders, true);
    if (hits.length > 0) {
      const h = hits[0];
      aimHitRef.current = { point: h.point.clone(), meshName: h.object?.name ?? null };
    } else {
      aimHitRef.current = null;
    }
  });

  // click-to-select OBB
  useEffect(() => {
    const dom = gl.domElement;
    const onPointerDown = (ev: PointerEvent) => {
      if (!useAngelStore.getState().calibrationOpen) return;
      // ignore clicks on the editor panel itself (it stops propagation, but
      // also any clicks routed through the dimming layer)
      if ((ev.target as HTMLElement)?.closest?.('[data-calib-panel]')) return;
      // build a screen-space ray from the click coords, NOT camera forward.
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const it = pickInteractableByOBB(raycaster.ray.origin, raycaster.ray.direction, 14);
      if (it) {
        setSelected(it.id);
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    dom.addEventListener('pointerdown', onPointerDown);
    return () => dom.removeEventListener('pointerdown', onPointerDown);
  }, [gl, camera, raycaster, setSelected]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* in-canvas — ghost preview, decals, dashed connectors                       */
/* -------------------------------------------------------------------------- */

/** Renders translucent decoration for each interactable while the editor is
 *  open: floor ring at every approach, dashed line approach→seat, and a
 *  ghost capsule at the seat (or first approach). The selected interactable
 *  draws bolder. */
export function CalibrationGhostPreview() {
  const open = useAngelStore((s) => s.calibrationOpen);
  const selectedId = useAngelStore((s) => s.selectedCalibrationId);
  const _tickFlag = useCalibrationTick();
  void _tickFlag;
  if (!open) return null;
  const items = getInteractables();
  return (
    <group>
      {items.map((it) => (
        <CalibrationItemDecor key={it.id} it={it} selected={it.id === selectedId} />
      ))}
    </group>
  );
}

function CalibrationItemDecor({ it, selected }: { it: Interactable; selected: boolean }) {
  // colors from the room palette — accent for selected, dim purple for the rest
  const color = selected ? '#ffe066' : '#9b6dff';
  const opacity = selected ? 0.9 : 0.4;
  const seat = it.seat ?? (it.approaches[0] ? { pos: it.approaches[0].pos, yaw: it.approaches[0].yaw } : null);

  return (
    <group>
      {/* approach point markers (floor ring + yaw arrow) */}
      {it.approaches.map((a, i) => (
        <group key={i} position={[a.pos.x, 0.005, a.pos.z]} rotation={[0, a.yaw, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.28, 0.34, 32]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} />
          </mesh>
          {/* yaw arrow — small triangle pointing in +z (the facing dir) */}
          <mesh position={[0, 0.001, 0.34]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.08, 0.18, 3]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} />
          </mesh>
        </group>
      ))}

      {/* dashed connectors approach → seat (or bbox center if no seat) */}
      {selected &&
        it.approaches.map((a, i) => {
          const target = seat?.pos ?? it.bbox.center;
          return <DashedLine key={`l${i}`} from={a.pos} to={target} color={color} />;
        })}

      {/* ghost capsule at seat (or first approach) */}
      {selected && seat && <GhostCapsule pos={seat.pos} yaw={seat.yaw} color={color} />}
    </group>
  );
}

function DashedLine({ from, to, color }: { from: THREE.Vector3; to: THREE.Vector3; color: string }) {
  // a faux-dashed line via a row of small box segments along the from→to
  // path. avoids the lineDashedMaterial computeLineDistances() dance and
  // reads great on either floor color.
  const segs = useMemo(() => {
    const a = new THREE.Vector3(from.x, 0.05, from.z);
    const b = new THREE.Vector3(to.x, 0.05, to.z);
    const total = a.distanceTo(b);
    const n = Math.max(2, Math.floor(total / 0.18));
    const out: Array<{ pos: [number, number, number]; len: number; yaw: number }> = [];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let i = 0; i < n; i++) {
      const tA = (i + 0.05) / n;
      const tB = (i + 0.65) / n;
      const pa = a.clone().lerp(b, tA);
      const pb = a.clone().lerp(b, tB);
      const mid = pa.clone().lerp(pb, 0.5);
      out.push({ pos: [mid.x, 0.05, mid.z], len: pa.distanceTo(pb), yaw });
    }
    return out;
  }, [from.x, from.z, to.x, to.z]);
  return (
    <group>
      {segs.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, s.yaw, 0]}>
          <boxGeometry args={[0.03, 0.005, s.len]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function GhostCapsule({ pos, yaw, color }: { pos: THREE.Vector3; yaw: number; color: string }) {
  // simple humanoid silhouette: a tall capsule body + small sphere head + a
  // tiny cone behind for the back-of-head facing direction. semi-transparent.
  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.7, 0]}>
        <capsuleGeometry args={[0.18, 0.7, 6, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* facing-direction beak — points along +z to match the approach yaw */}
      <mesh position={[0, 1.4, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.06, 0.18, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Fast force-rerender on a low rate so the form fields and decor re-paint
 * when fields change in the form (we mutate registry in place; no React
 * state drives the visuals). 12 Hz is plenty. */
function useCalibrationTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => (n + 1) % 1_000_000), 80);
    return () => window.clearInterval(id);
  }, []);
  return tick;
}

/* -------------------------------------------------------------------------- */
/* DOM panel                                                                  */
/* -------------------------------------------------------------------------- */

export function CalibrationOverlay() {
  const open = useAngelStore((s) => s.calibrationOpen);
  const setOpen = useAngelStore((s) => s.setCalibrationOpen);
  const player = useAngelStore((s) => s.player);
  const selectedId = useAngelStore((s) => s.selectedCalibrationId);
  const setSelected = useAngelStore((s) => s.setSelectedCalibrationId);
  const enqueue = useAngelStore((s) => s.enqueue);

  const [aimReadout, setAimReadout] = useState<string>('—');
  const [toast, setToast] = useState<string | null>(null);
  const tick = useCalibrationTick(); // forces re-render when registry mutates
  void tick;

  const items = getInteractables();
  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

  // K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyK') return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (e.repeat) return;
      const next = !useAngelStore.getState().calibrationOpen;
      setOpen(next);
      if (!next) setSelected(null);
      if (document.pointerLockElement) document.exitPointerLock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen, setSelected]);

  // poll aim readout while open (cheap, only when panel is shown)
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      const h = aimHitRef.current;
      setAimReadout(
        !h
          ? '—'
          : `(${h.point.x.toFixed(2)}, ${h.point.y.toFixed(2)}, ${h.point.z.toFixed(2)})${h.meshName ? '  ·  ' + h.meshName : ''}`,
      );
    }, 100);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1500);
  }

  const node = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        pointerEvents: 'none',
        fontFamily: 'var(--font-ui, ui-monospace, monospace)',
      }}
    >
      {/* dimming layer — clicks here go to the canvas (OBB picker) so the
          user can click-to-select an interactable. We only block player
          input via the DimLayer's pointer-events: none. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(13, 10, 20, 0.32)',
          pointerEvents: 'none',
        }}
      />

      {/* side panel */}
      <div
        data-calib-panel
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100vh',
          width: 380,
          background: 'rgba(13, 10, 20, 0.97)',
          borderLeft: '1px solid rgba(255,126,182,0.4)',
          color: 'var(--angel-fg, #f6efff)',
          padding: '20px 22px',
          overflowY: 'auto',
          pointerEvents: 'auto',
          boxShadow: '-12px 0 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 22, letterSpacing: '0.04em', fontFamily: 'var(--font-display, serif)' }}>
            calibration
          </div>
          <button onClick={() => setOpen(false)} style={btn('ghost')}>
            close · K
          </button>
        </div>
        <div style={tagline}>click props in the world to select · edit live</div>

        {/* live readouts */}
        <div style={readoutBlock}>
          <Row label="you" value={`(${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)})  yaw ${player.yaw.toFixed(2)}`} />
          <Row label="aim" value={aimReadout} />
        </div>

        {/* list of interactables */}
        <SectionTitle>interactables</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it) => {
            const isSel = it.id === selectedId;
            return (
              <button
                key={it.id}
                onClick={() => setSelected(it.id)}
                style={{
                  ...btn(isSel ? 'primary' : 'row'),
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  padding: '8px 10px',
                }}
              >
                <span style={{ fontSize: 13, color: isSel ? '#0d0a14' : 'inherit' }}>
                  {it.id}
                  <span style={{ opacity: 0.55, marginLeft: 6, fontSize: 10 }}>· {it.kind}</span>
                </span>
                <span style={{ fontSize: 10, opacity: 0.65, color: isSel ? 'rgba(13,10,20,0.7)' : 'inherit' }}>
                  bbox ({it.bbox.center.x.toFixed(2)}, {it.bbox.center.y.toFixed(2)}, {it.bbox.center.z.toFixed(2)})
                  {it.meshName ? `  · ${it.meshName}` : ''}
                </span>
              </button>
            );
          })}
        </div>

        {/* selected-interactable form */}
        {selected && (
          <SelectedForm
            it={selected}
            playerYaw={player.yaw}
            playerPos={[player.x, 0, player.z]}
            onFlash={flash}
            onTest={(verb) =>
              enqueue({
                id: `calib_test_${Date.now().toString(36)}`,
                type: 'interact_with',
                interactableId: selected.id,
                verb,
                durationMs: 5000,
              })
            }
          />
        )}

        {/* footer — save + reset */}
        <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px dashed rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={async () => {
              saveOverridesToLocalStorage();
              const snapshot = exportTransforms();
              const result = await ipc.invoke<{ ok: boolean; path?: string }>('saveInteractableDefaults', { snapshot });
              if (result?.ok) flash(`saved → ${result.path ?? 'defaults file'}`);
              else flash('saved to localStorage (defaults IPC unavailable)');
            }}
            style={btn('save')}
          >
            save &amp; export defaults
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(JSON.stringify(getOverrides(), null, 2));
                  flash('copied overrides JSON');
                } catch {
                  flash('clipboard blocked — see console');
                  console.info('[calibration] overrides', getOverrides());
                }
              }}
              style={{ ...btn('ghost'), flex: 1 }}
            >
              copy overrides
            </button>
            <button
              onClick={() => {
                loadOverridesFromLocalStorage();
                flash('reloaded saved overrides');
              }}
              style={{ ...btn('ghost'), flex: 1 }}
            >
              reload
            </button>
          </div>
          <button
            onClick={() => {
              if (!confirm('Clear all saved overrides and revert to defaults?')) return;
              clearOverrides();
              flash('cleared');
            }}
            style={btn('danger')}
          >
            reset all
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
          click on a prop in the world to select. drag-fix the bbox numerically,
          add as many approach points as you need (couches have multiple seats).
          the seat field is where the avatar locks when she sits — usually a
          touch above the floor and inside the bbox. test the calibration by
          picking a verb and clicking <b>run</b>.
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 90,
            transform: 'translateX(-50%)',
            padding: '8px 14px',
            background: 'rgba(155, 109, 255, 0.95)',
            color: '#0d0a14',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            borderRadius: 4,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );

  return createPortal(node, document.body);
}

/* -------------------------------------------------------------------------- */
/* Selected interactable form                                                 */
/* -------------------------------------------------------------------------- */

function SelectedForm({
  it,
  playerYaw,
  playerPos,
  onFlash,
  onTest,
}: {
  it: Interactable;
  playerYaw: number;
  playerPos: Vec3T;
  onFlash: (s: string) => void;
  onTest: (verb: Exclude<InteractableAction, 'use'>) => void;
}) {
  // bbox controls
  function patch(p: InteractablePatch, msg?: string) {
    setInteractableTransform(it.id, p);
    if (msg) onFlash(msg);
  }

  function captureFromMesh() {
    if (!it.meshName) return onFlash('no mesh tagged — fit-to-mesh unavailable');
    onFlash('fit-to-mesh: select the mesh in the canvas and aim at it');
    const h = aimHitRef.current;
    if (!h) return;
    // we don't have the mesh's bounds here — use the aim hit point as the
    // bbox center and keep the existing halfExtents (user can tweak).
    patch({ bbox: { center: [h.point.x, h.point.y, h.point.z] } }, 'bbox.center = aim hit');
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
      <SectionTitle>{it.id} · {it.kind}</SectionTitle>

      {/* hitbox */}
      <SubTitle>hitbox (OBB)</SubTitle>
      <NumGrid3
        label="center"
        value={[it.bbox.center.x, it.bbox.center.y, it.bbox.center.z]}
        step={0.01}
        onChange={(v) => patch({ bbox: { center: v } })}
      />
      <NumGrid3
        label="size"
        value={[it.bbox.halfExtents.x * 2, it.bbox.halfExtents.y * 2, it.bbox.halfExtents.z * 2]}
        step={0.01}
        min={0.05}
        onChange={(v) => patch({ bbox: { halfExtents: [v[0] / 2, v[1] / 2, v[2] / 2] } })}
      />
      <NumRow
        label="yaw°"
        value={normaliseDeg(it.bbox.yaw * DEG)}
        step={1}
        onChange={(v) => patch({ bbox: { yaw: ((v * RAD) % TWO_PI) } })}
      />
      <button onClick={captureFromMesh} style={{ ...btn('action'), width: '100%', marginTop: 6 }}>
        fit-to-mesh (use aim hit as center)
      </button>

      {/* approach points */}
      <SubTitle>approach points · {it.approaches.length}</SubTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {it.approaches.map((a, i) => (
          <div key={i} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <input
                type="text"
                value={a.label ?? ''}
                placeholder="label"
                onChange={(e) => {
                  const next = it.approaches.map((x, j) => ({
                    pos: [x.pos.x, x.pos.y, x.pos.z] as Vec3T,
                    yaw: x.yaw,
                    label: j === i ? e.target.value : x.label,
                  }));
                  patch({ approaches: next });
                }}
                style={inputStyle}
              />
              <button
                onClick={() => {
                  const next = it.approaches
                    .filter((_, j) => j !== i)
                    .map((x) => ({ pos: [x.pos.x, x.pos.y, x.pos.z] as Vec3T, yaw: x.yaw, label: x.label }));
                  patch({ approaches: next }, `removed approach ${i}`);
                }}
                style={btn('danger')}
              >
                ×
              </button>
            </div>
            <NumGrid3
              label="pos"
              value={[a.pos.x, a.pos.y, a.pos.z]}
              step={0.01}
              onChange={(v) => {
                const next = it.approaches.map((x, j) => ({
                  pos: j === i ? v : ([x.pos.x, x.pos.y, x.pos.z] as Vec3T),
                  yaw: x.yaw,
                  label: x.label,
                }));
                patch({ approaches: next });
              }}
            />
            <NumRow
              label="yaw°"
              value={normaliseDeg(a.yaw * DEG)}
              step={1}
              onChange={(v) => {
                const next = it.approaches.map((x, j) => ({
                  pos: [x.pos.x, x.pos.y, x.pos.z] as Vec3T,
                  yaw: j === i ? (v * RAD) : x.yaw,
                  label: x.label,
                }));
                patch({ approaches: next });
              }}
            />
            <button
              onClick={() => {
                const next = it.approaches.map((x, j) => ({
                  pos: j === i ? (playerPos as Vec3T) : ([x.pos.x, x.pos.y, x.pos.z] as Vec3T),
                  yaw: j === i ? playerYaw : x.yaw,
                  label: x.label,
                }));
                patch({ approaches: next }, 'captured from feet');
              }}
              style={{ ...btn('action'), width: '100%', marginTop: 4 }}
            >
              capture from feet
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const next = [
              ...it.approaches.map((x) => ({
                pos: [x.pos.x, x.pos.y, x.pos.z] as Vec3T,
                yaw: x.yaw,
                label: x.label,
              })),
              { pos: playerPos, yaw: playerYaw, label: `approach ${it.approaches.length + 1}` },
            ];
            patch({ approaches: next }, 'added approach from feet');
          }}
          style={btn('row')}
        >
          + add approach (from feet)
        </button>
      </div>

      {/* seat — chair only */}
      {it.kind === 'chair' && (
        <>
          <SubTitle>seat</SubTitle>
          {it.seat ? (
            <div style={cardStyle}>
              <NumGrid3
                label="pos"
                value={[it.seat.pos.x, it.seat.pos.y, it.seat.pos.z]}
                step={0.01}
                onChange={(v) => patch({ seat: { pos: v, yaw: it.seat?.yaw ?? 0 } })}
              />
              <NumRow
                label="yaw°"
                value={normaliseDeg((it.seat.yaw ?? 0) * DEG)}
                step={1}
                onChange={(v) =>
                  patch({
                    seat: {
                      pos: [it.seat?.pos.x ?? 0, it.seat?.pos.y ?? 0, it.seat?.pos.z ?? 0],
                      yaw: v * RAD,
                    },
                  })
                }
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button
                  onClick={() => patch({ seat: { pos: playerPos, yaw: playerYaw } }, 'seat = your pose')}
                  style={{ ...btn('action'), flex: 1 }}
                >
                  capture from pose
                </button>
                <button onClick={() => patch({ seat: null }, 'cleared seat')} style={btn('danger')}>
                  ×
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => patch({ seat: { pos: playerPos, yaw: playerYaw } }, 'set seat')}
              style={btn('action')}
            >
              set seat from your pose
            </button>
          )}
        </>
      )}

      {/* pick radius */}
      <SubTitle>pick radius (E-key reach)</SubTitle>
      <RangeRow
        label={`${it.pickRadius.toFixed(2)} m`}
        value={it.pickRadius}
        min={0.1}
        max={2.0}
        step={0.05}
        onChange={(v) => patch({ pickRadius: v })}
      />

      {/* test */}
      <SubTitle>test interaction</SubTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {it.actions
          .filter((v): v is Exclude<InteractableAction, 'use'> => v !== 'use')
          .map((verb) => (
            <button key={verb} onClick={() => onTest(verb)} style={{ ...btn('action'), width: '100%', textAlign: 'left' }}>
              ▶ run · <b>{verb}</b>
            </button>
          ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* form atoms                                                                 */
/* -------------------------------------------------------------------------- */

function NumGrid3({
  label,
  value,
  step = 0.01,
  min,
  max,
  onChange,
}: {
  label: string;
  value: Vec3T;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: Vec3T) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 1fr', gap: 4, alignItems: 'center', marginBottom: 6 }}>
      <span style={fieldLabel}>{label}</span>
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <input
          key={axis}
          type="number"
          step={step}
          {...(min != null ? { min } : {})}
          {...(max != null ? { max } : {})}
          value={fmt(value[i])}
          onChange={(e) => {
            const next = [...value] as Vec3T;
            next[i] = Number(e.target.value);
            onChange(next);
          }}
          style={inputStyle}
        />
      ))}
    </div>
  );
}

function NumRow({
  label,
  value,
  step = 0.01,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 4, alignItems: 'center', marginBottom: 6 }}>
      <span style={fieldLabel}>{label}</span>
      <input
        type="number"
        step={step}
        {...(min != null ? { min } : {})}
        {...(max != null ? { max } : {})}
        value={fmt(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={inputStyle}
      />
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
      <span style={{ fontSize: 11, opacity: 0.8 }}>{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function fmt(n: number): string {
  return Number.isFinite(n) ? Number(n.toFixed(3)).toString() : '0';
}

function normaliseDeg(d: number): number {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return Number(x.toFixed(1));
}

/* -------------------------------------------------------------------------- */
/* visual atoms                                                                */
/* -------------------------------------------------------------------------- */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, lineHeight: 1.4 }}>
      <span style={{ opacity: 0.55, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9 }}>{label}</span>
      <span style={{ fontFamily: 'ui-monospace, monospace', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        marginBottom: 8,
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.45)',
      }}
    >
      {children}
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 6,
        fontSize: 9,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'rgba(255,224,102,0.7)',
      }}
    >
      {children}
    </div>
  );
}

const tagline: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.45)',
  marginBottom: 16,
};

const readoutBlock: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const cardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 3,
  color: 'inherit',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
};

const fieldLabel: CSSProperties = {
  fontSize: 9,
  opacity: 0.55,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

function btn(kind: 'primary' | 'row' | 'action' | 'save' | 'danger' | 'ghost'): CSSProperties {
  const base: CSSProperties = {
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 12,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    transition: 'background 80ms ease',
    fontFamily: 'inherit',
    color: 'inherit',
  };
  switch (kind) {
    case 'primary':
      return { ...base, background: '#ffe066', color: '#0d0a14', borderColor: '#ffe066', fontWeight: 600 };
    case 'row':
      return { ...base, background: 'rgba(255,255,255,0.04)' };
    case 'action':
      return { ...base, background: 'rgba(155,109,255,0.18)', borderColor: 'rgba(155,109,255,0.5)', textAlign: 'left' };
    case 'save':
      return { ...base, background: 'rgba(127,255,175,0.2)', borderColor: 'rgba(127,255,175,0.6)', color: '#7fffaf' };
    case 'danger':
      return { ...base, background: 'rgba(255,126,126,0.16)', borderColor: 'rgba(255,126,126,0.4)', color: '#ff9b9b' };
    case 'ghost':
    default:
      return { ...base, background: 'transparent' };
  }
}

