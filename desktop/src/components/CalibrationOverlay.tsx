/**
 * CalibrationOverlay — live in-app interactable placement tool.
 *
 *   1. Hit K to toggle. While open: pointer lock releases, WASD freezes,
 *      a side panel lists every interactable.
 *   2. Click a row to "select" that interactable.
 *   3. Capture buttons:
 *        FROM FEET     — sets worldPos to your current player position.
 *        FROM AIM      — raycasts from camera forward, drops the worldPos
 *                        on the first mesh you're looking at (great for
 *                        objects on table tops or walls).
 *        APPROACH HERE — saves your current position+yaw as the avatar's
 *                        approach anchor for that interactable.
 *   4. Save → writes overrides to localStorage so they persist across restarts.
 *   5. Copy JSON → puts the full snapshot on your clipboard so you can paste
 *      it into chat with the model and ask it to bake new defaults.
 *
 * The companion `CalibrationRaycaster` lives inside the canvas (needs access
 * to camera + colliders) and exposes the latest aim hit through a ref.
 */
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import {
  clearOverrides,
  exportTransforms,
  getInteractables,
  getOverrides,
  loadOverridesFromLocalStorage,
  saveOverridesToLocalStorage,
  setInteractableTransform,
  type InteractableAction,
} from '@/lib/interactables';
import { useAngelStore } from '@/stores/angel';

/* -------------------------------------------------------------------------- */
/* shared aim-state — the raycaster (in-canvas) writes here, the panel reads  */
/* -------------------------------------------------------------------------- */

type AimHit = { point: THREE.Vector3; meshName: string | null } | null;

const aimHitRef: { current: AimHit } = { current: null };

/** Lives inside the canvas. Per frame, raycasts camera-forward against the
 *  room colliders and stashes the first hit for the side panel to consume. */
export function CalibrationRaycaster({ colliders }: { colliders: THREE.Object3D[] }) {
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dirRef = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    if (!useAngelStore.getState().calibrationOpen) {
      aimHitRef.current = null;
      return;
    }
    camera.getWorldDirection(dirRef.current);
    raycaster.set(camera.position, dirRef.current);
    raycaster.far = 12;
    const hits = raycaster.intersectObjects(colliders, true);
    if (hits.length > 0) {
      const h = hits[0];
      aimHitRef.current = { point: h.point.clone(), meshName: h.object?.name ?? null };
    } else {
      aimHitRef.current = null;
    }
    void dt;
  });
  return null;
}

/* -------------------------------------------------------------------------- */
/* DOM overlay panel                                                          */
/* -------------------------------------------------------------------------- */

export function CalibrationOverlay() {
  const open = useAngelStore((s) => s.calibrationOpen);
  const setOpen = useAngelStore((s) => s.setCalibrationOpen);
  const player = useAngelStore((s) => s.player);
  const items = getInteractables();

  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? '');
  const [aimReadout, setAimReadout] = useState<string>('—');
  const [tickFlag, setTickFlag] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // K toggles
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyK') return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (e.repeat) return;
      setOpen(!useAngelStore.getState().calibrationOpen);
      // releasing/acquiring pointer lock is handled by Player.tsx watching the flag
      if (document.pointerLockElement) document.exitPointerLock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // poll aim readout while open (cheap, only when panel is shown)
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      const h = aimHitRef.current;
      if (!h) {
        setAimReadout('— (looking at nothing)');
      } else {
        setAimReadout(
          `(${h.point.x.toFixed(2)}, ${h.point.y.toFixed(2)}, ${h.point.z.toFixed(2)})${h.meshName ? '  ·  ' + h.meshName : ''}`,
        );
      }
      setTickFlag((n) => n + 1);
    }, 80);
    return () => window.clearInterval(id);
  }, [open]);

  // hotkeys when open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (e.repeat) return;
      if (e.code === 'KeyP') captureFeet();
      else if (e.code === 'KeyJ') captureAim();
      else if (e.code === 'KeyL') captureApproach();
      else if (e.code === 'KeyS' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  if (!open) return null;

  const selected = items.find((i) => i.id === selectedId);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1400);
  }

  function captureFeet() {
    if (!selected) return;
    // P captures BOTH worldPos and the approach anchor when you're standing
    // at the spot. For a chair this is exactly right ("here is the chair,
    // here is where you walk to to use it"). If you really want the prop
    // somewhere else but the approach to be where you are, use J for the
    // prop position and L for the approach.
    setInteractableTransform(selected.id, {
      worldPos: [player.x, 0, player.z],
      approachAnchor: { pos: [player.x, 0, player.z], yaw: player.yaw },
    });
    flash(`set ${selected.id} pos + approach to your feet`);
  }
  function captureAim() {
    if (!selected) return;
    const h = aimHitRef.current;
    if (!h) return flash('aim at a surface first');
    setInteractableTransform(selected.id, { worldPos: [h.point.x, h.point.y, h.point.z] });
    flash(`set ${selected.id}.worldPos = aim hit`);
  }
  function captureApproach() {
    if (!selected) return;
    setInteractableTransform(selected.id, {
      approachAnchor: { pos: [player.x, 0, player.z], yaw: player.yaw },
    });
    flash(`set ${selected.id}.approachAnchor`);
  }
  function save() {
    saveOverridesToLocalStorage();
    flash('saved overrides to localStorage');
  }
  function reload() {
    loadOverridesFromLocalStorage();
    flash('reloaded saved overrides');
  }
  function reset() {
    if (!confirm('Clear all saved overrides and revert to defaults?')) return;
    clearOverrides();
    flash('cleared overrides — restart to fully refresh');
  }
  async function copyJson(kind: 'overrides' | 'full') {
    const payload = kind === 'overrides' ? getOverrides() : exportTransforms();
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      flash(`copied ${kind} JSON to clipboard`);
    } catch {
      flash('clipboard write blocked — see console');
      console.info('[calibration]', kind, payload);
    }
  }

  void tickFlag; // re-renders happen via setTickFlag

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
      {/* dimming layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(13, 10, 20, 0.45)',
          pointerEvents: 'auto',
        }}
        onClick={() => setOpen(false)}
      />

      {/* side panel */}
      <div
        onClick={(e) => e.stopPropagation()}
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
          <button
            onClick={() => setOpen(false)}
            style={btnStyle('ghost')}
          >
            close · K
          </button>
        </div>
        <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
          drop interactables where they actually are
        </div>

        {/* live readouts */}
        <div style={readoutBlock}>
          <Row label="you" value={`(${player.x.toFixed(2)}, ${player.y.toFixed(2)}, ${player.z.toFixed(2)})  yaw ${player.yaw.toFixed(2)}`} />
          <Row label="aim" value={aimReadout} />
        </div>

        {/* list */}
        <div style={{ marginTop: 14, marginBottom: 8, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
          interactables
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it) => {
            const isSel = it.id === selectedId;
            return (
              <button
                key={it.id}
                onClick={() => setSelectedId(it.id)}
                style={{
                  ...btnStyle(isSel ? 'primary' : 'row'),
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
                  pos ({it.worldPos.x.toFixed(2)}, {it.worldPos.y.toFixed(2)}, {it.worldPos.z.toFixed(2)})
                  {it.meshName ? `  · mesh: ${it.meshName}` : ''}
                </span>
              </button>
            );
          })}
        </div>

        {/* selected actions */}
        {selected && (
          <>
            <div style={{ marginTop: 16, marginBottom: 8, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
              capture for {selected.id}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={captureFeet} style={btnStyle('action')}>
                <span style={kbd}>P</span>&nbsp;&nbsp;snap here (pos + approach)
              </button>
              <button onClick={captureAim} style={btnStyle('action')}>
                <span style={kbd}>J</span>&nbsp;&nbsp;set worldPos = where i&apos;m aiming
              </button>
              <button onClick={captureApproach} style={btnStyle('action')}>
                <span style={kbd}>L</span>&nbsp;&nbsp;set approachAnchor = (my pos, my yaw)
              </button>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
              <div style={readoutBlock}>
                <Row label="kind" value={selected.kind} />
                <Row label="actions" value={selected.actions.join(', ')} />
                {selected.approachAnchor && (
                  <Row
                    label="approach"
                    value={`(${selected.approachAnchor.pos.x.toFixed(2)}, ${selected.approachAnchor.pos.y.toFixed(2)}, ${selected.approachAnchor.pos.z.toFixed(2)})  yaw ${selected.approachAnchor.yaw.toFixed(2)}`}
                  />
                )}
                {selected.pairedChairId && <Row label="paired" value={selected.pairedChairId} />}
                <Row label="actions list" value={`${selected.actions.length}: ${selected.actions.map((a: InteractableAction) => a).join('|')}`} />
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px dashed rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={save} style={btnStyle('save')}>
            save (overrides → localStorage)
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => copyJson('overrides')} style={{ ...btnStyle('ghost'), flex: 1 }}>
              copy overrides JSON
            </button>
            <button onClick={() => copyJson('full')} style={{ ...btnStyle('ghost'), flex: 1 }}>
              copy full snapshot
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={reload} style={{ ...btnStyle('ghost'), flex: 1 }}>
              reload from storage
            </button>
            <button onClick={reset} style={{ ...btnStyle('danger'), flex: 1 }}>
              reset all
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
          chairs / floor anchors → walk to the spot, face the right way, hit P
          (saves both position and approach in one shot, so E-sit lands you
          here).
          <br />
          things on tables / walls (computer, window) → aim at the surface,
          hit J for the prop position, then walk to your standing spot, face
          it, hit L for the approach anchor.
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
/* visual atoms                                                                */
/* -------------------------------------------------------------------------- */

const readoutBlock: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, lineHeight: 1.4 }}>
      <span style={{ opacity: 0.55, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9 }}>{label}</span>
      <span style={{ fontFamily: 'ui-monospace, monospace', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

const kbd: React.CSSProperties = {
  display: 'inline-block',
  minWidth: 18,
  textAlign: 'center',
  padding: '1px 5px',
  background: 'rgba(255,255,255,0.13)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 3,
  fontSize: 10,
  marginRight: 4,
};

function btnStyle(kind: 'primary' | 'row' | 'action' | 'save' | 'danger' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
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
