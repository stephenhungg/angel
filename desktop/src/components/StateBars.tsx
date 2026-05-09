import { motion } from 'framer-motion';
import { useAngelStore } from '@/stores/angel';

/**
 * Bottom-right state HUD: mood / energy / trust as chunky pixel-style bars.
 * Subscribes to store.state.{mood,energy,trust} (0..1).
 */

type BarProps = {
  label: string;
  value: number;
  hue: string;
};

function Bar({ label, value, hue }: BarProps) {
  const v = Math.max(0, Math.min(1, value));
  const cells = 14;
  const filled = Math.round(v * cells);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-ui)',
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--angel-fg-muted)',
        }}
      >
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: hue }}>
          {Math.round(v * 100)}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 3,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${hue}33`,
          borderRadius: 4,
        }}
      >
        {Array.from({ length: cells }, (_, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0.6, opacity: 0.4 }}
            animate={{
              scaleY: i < filled ? 1 : 0.5,
              opacity: i < filled ? 1 : 0.18,
            }}
            transition={{ duration: 0.22, delay: i * 0.012 }}
            style={{
              flex: 1,
              height: 14,
              background: i < filled ? hue : 'rgba(255,255,255,0.06)',
              borderRadius: 1,
              transformOrigin: 'bottom',
              boxShadow: i < filled ? `0 0 6px ${hue}88` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function StateBars() {
  const state = useAngelStore((s) => s.state);
  const persona = useAngelStore((s) => s.persona);

  return (
    <div
      style={{
        position: 'fixed',
        right: 28,
        bottom: 96,
        padding: '14px 18px',
        background: 'rgba(13,10,20,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        zIndex: 20,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          opacity: 0.45,
          marginBottom: -4,
        }}
      >
        {persona?.name ? `${persona.name}'s vitals` : 'angel · vitals'}
      </div>
      <Bar label="mood" value={state.mood} hue="#ff7eb6" />
      <Bar label="energy" value={state.energy} hue="#ffd166" />
      <Bar label="trust" value={state.trust} hue="#9b6dff" />
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 9,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          opacity: 0.4,
          paddingTop: 4,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        emotion · <span style={{ color: 'var(--angel-accent)' }}>{state.emotion}</span>
        <br />
        location ·{' '}
        <span style={{ color: 'var(--angel-fg)' }}>{state.location.replace('_', ' ')}</span>
        {state.currentTaskId ? (
          <>
            <br />
            task · <span style={{ color: 'var(--angel-accent)' }}>{state.currentTaskId.slice(0, 12)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
