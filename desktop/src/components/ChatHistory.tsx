/**
 * components/ChatHistory.tsx — collapsible history drawer.
 *
 * Slides up from the bottom of the screen on hover-near-bottom or when the
 * user presses Tab. Shows the last 50 turns from `useAngelStore.chat` with
 * role labels, fully-revealed text, and emotion glyph.
 *
 * Aesthetic:
 *   - Glass panel with persona-tinted top border
 *   - Cherry Bomb display heading "history.", DM Mono body
 *   - Each turn: role chip (USER / ANGEL / SYSTEM) + emotion sigil + text
 *   - Smooth spring slide via framer-motion
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAngelStore } from '../stores/angel';
import type { Emotion } from '@angel/shared';

const HISTORY_LIMIT = 50;
const PEEK_THRESHOLD_PX = 28;

const EMOTION_GLYPH: Record<Emotion, string> = {
  neutral: '·',
  happy: '✺',
  excited: '✦',
  thinking: '∾',
  smug: '♢',
  soft: '◌',
  focused: '◆',
  concerned: '◊',
};

export function ChatHistory() {
  const chat = useAngelStore((s) => s.chat);
  const persona = useAngelStore((s) => s.persona);
  const accent = persona?.paletteHex ?? 'var(--angel-accent)';

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => chat.slice(-HISTORY_LIMIT), [chat]);

  // edge-of-screen hover triggers open
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      if (pinned) return;
      const fromBottom = window.innerHeight - ev.clientY;
      if (fromBottom <= PEEK_THRESHOLD_PX) setOpen(true);
      else if (fromBottom > 360) setOpen(false);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [pinned]);

  // Tab toggles pinned-open
  useEffect(() => {
    const onTab = (ev: KeyboardEvent) => {
      if (ev.key !== 'Tab' || ev.metaKey || ev.ctrlKey) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      ev.preventDefault();
      setPinned((p) => {
        const next = !p;
        setOpen(next);
        return next;
      });
    };
    window.addEventListener('keydown', onTab);
    return () => window.removeEventListener('keydown', onTab);
  }, []);

  // auto-scroll to bottom when new message arrives + drawer is open
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length, open]);

  return (
    <>
      {/* hover hint strip — peeks 4px tall when closed */}
      <AnimatePresence>
        {!open && visible.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              left: 24,
              right: 24,
              bottom: 0,
              height: 4,
              borderRadius: '4px 4px 0 0',
              background: `linear-gradient(90deg, transparent, ${accent}66, transparent)`,
              zIndex: 18,
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer"
            initial={{ y: 320, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            onMouseLeave={() => {
              if (!pinned) setOpen(false);
            }}
            style={{
              position: 'fixed',
              left: 24,
              right: 24,
              bottom: 18,
              height: 280,
              zIndex: 19,
              borderRadius: 16,
              background: 'rgba(13, 10, 20, 0.86)',
              border: `1px solid ${accent}55`,
              boxShadow: `0 24px 56px -22px ${accent}99, 0 0 0 1px rgba(255,255,255,0.04) inset`,
              backdropFilter: 'blur(16px) saturate(140%)',
              WebkitBackdropFilter: 'blur(16px) saturate(140%)',
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
              overflow: 'hidden',
            }}
          >
            {/* heading */}
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                padding: '12px 18px 8px',
                borderBottom: `1px solid ${accent}22`,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  letterSpacing: '0.02em',
                  color: 'var(--angel-fg)',
                }}
              >
                history
                <span style={{ color: accent }}>.</span>
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  opacity: 0.55,
                  display: 'flex',
                  gap: 14,
                }}
              >
                <span>{visible.length} turn{visible.length === 1 ? '' : 's'}</span>
                <span>{pinned ? 'pinned' : 'tab to pin'}</span>
              </div>
            </div>

            {/* scrollback */}
            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px 18px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                color: 'var(--angel-fg)',
                scrollbarColor: `${accent}55 transparent`,
                scrollbarWidth: 'thin',
              }}
            >
              {visible.length === 0 ? (
                <div style={{ opacity: 0.4, fontStyle: 'italic', textAlign: 'center', marginTop: 60 }}>
                  no turns yet — say something.
                </div>
              ) : (
                visible.map((m) => {
                  const sigil = m.emotion ? EMOTION_GLYPH[m.emotion] : null;
                  const roleColor =
                    m.role === 'user' ? 'var(--angel-fg-muted)' : m.role === 'angel' ? accent : 'rgba(255,255,255,0.4)';
                  return (
                    <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', lineHeight: 1.45 }}>
                      <span
                        style={{
                          minWidth: 56,
                          fontSize: 9,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: roleColor,
                          fontWeight: 500,
                          paddingTop: 2,
                        }}
                      >
                        {m.role}
                      </span>
                      {sigil && (
                        <span style={{ color: roleColor, fontSize: 14, flex: '0 0 auto', paddingTop: 1 }}>
                          {sigil}
                        </span>
                      )}
                      <span style={{ flex: 1, opacity: m.done ? 1 : 0.65 }}>
                        {m.text}
                        {!m.done && '…'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default ChatHistory;
