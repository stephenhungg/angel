import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { AnimationClip } from '@angel/shared';
import type { AvatarHandle } from '@/components/Avatar';

/** Floating debug panel for poking animations directly without going
 *  through the orchestrator. Shows up bottom-left. Hidden via prop in prod. */
type Props = {
  avatarRef: React.MutableRefObject<AvatarHandle | null>;
};

const CLIPS: { name: AnimationClip; label: string; oneShot?: boolean }[] = [
  { name: 'idle', label: 'idle' },
  { name: 'walking', label: 'walk' },
  { name: 'sitting', label: 'sit' },
  { name: 'sitting_playful', label: 'sit (playful)' },
  { name: 'sit_to_type', label: 'sit → type', oneShot: true },
  { name: 'typing', label: 'typing' },
  { name: 'type_to_sit', label: 'type → sit', oneShot: true },
  { name: 'start_jumping_jacks', label: 'jacks → start', oneShot: true },
  { name: 'jumping_jacks', label: 'jumping jacks' },
  { name: 'stop_jumping_jacks', label: 'jacks → stop', oneShot: true },
  { name: 'wave', label: 'wave', oneShot: true },
];

export function AnimationTestPanel({ avatarRef }: Props) {
  const [active, setActive] = useState<AnimationClip>('idle');
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  // wait until the document body exists before portaling — Strict Mode +
  // SSR-style guards. also gives Avatar a tick to populate the ref so the
  // panel doesn't flash empty on first render.
  useEffect(() => {
    setMounted(true);
  }, []);

  const handle = (clip: AnimationClip, oneShot?: boolean) => async () => {
    if (busy) return;
    const av = avatarRef.current;
    if (!av) return;
    setActive(clip);
    if (oneShot) {
      setBusy(true);
      try {
        await av.playOnce(clip, 180);
      } finally {
        setBusy(false);
      }
      // park on idle after one-shot transitions
      av.play('idle', 220);
      setActive('idle');
    } else {
      av.play(clip, 220);
    }
  };

  if (!mounted) return null;

  const node = (
    <div
      data-no-lock
      style={{
        position: 'fixed',
        bottom: 92,
        left: 28,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: 'rgba(13, 10, 20, 0.92)',
        border: '1px solid rgba(255,126,182,0.35)',
        borderRadius: 12,
        backdropFilter: 'blur(10px)',
        fontFamily: 'var(--font-ui)',
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--angel-fg)',
        zIndex: 9999,
        pointerEvents: 'auto',
        minWidth: 180,
        boxShadow: '0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ opacity: 0.55, fontSize: 9, marginBottom: 4, color: 'var(--angel-accent)' }}>
        animation rig
      </div>
      {CLIPS.map((c) => {
        const isActive = active === c.name;
        return (
          <button
            key={c.name}
            onClick={handle(c.name, c.oneShot)}
            disabled={busy}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: isActive
                ? '1px solid var(--angel-accent)'
                : '1px solid rgba(255,255,255,0.06)',
              background: isActive ? 'rgba(255,126,182,0.18)' : 'rgba(255,255,255,0.03)',
              color: isActive ? 'var(--angel-accent)' : 'var(--angel-fg)',
              fontFamily: 'inherit',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: busy ? 'wait' : 'pointer',
              textAlign: 'left',
              transition: 'background 140ms ease, border-color 140ms ease',
            }}
          >
            {c.label}
            {c.oneShot ? <span style={{ opacity: 0.45, marginLeft: 6 }}>·1×</span> : null}
          </button>
        );
      })}
      <div style={{ opacity: 0.4, fontSize: 9, marginTop: 4 }}>
        click · scene unaffected
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
