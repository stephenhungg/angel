/**
 * components/ChatInput.tsx — top-of-screen chat input with persona placeholder,
 * Esc-to-interrupt, and hold-spacebar push-to-talk.
 *
 * Design notes (frontend_aesthetics rule):
 *   - Cherry Bomb One headline, DM Mono input, persona-tinted accent glow
 *     (--accent var, fed by useAngelStore.applyClaim).
 *   - Animated focus state: input border pulses gently with persona accent.
 *   - Mic button: when active, ring pulses + tiny waveform from voice partial.
 *   - PTT spacebar capture is opt-in: only fires when input is NOT focused
 *     (otherwise typing a space would trigger the mic — bad).
 *
 * Wiring: subscribes to `useConversationStore` for inputDraft/mic/voice
 * partial; reads persona from `useAngelStore` (renderer plan's source).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAngelStore } from '../stores/angel';
import { useConversationStore } from '../stores/conversation';
import { isSTTAvailable, startSTT, type STTSession } from '../lib/stt';
import { fireInterrupt } from '../lib/interrupt';
import { getPlaceholder } from '../lib/personaApply';

const PTT_AUTO_SUBMIT_MS = 2500;

export function ChatInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const sttSessionRef = useRef<STTSession | null>(null);
  const pttDownAtRef = useRef<number>(0);
  const lastTranscriptRef = useRef<string>('');

  const persona = useAngelStore((s) => s.persona);
  const inputDraft = useConversationStore((s) => s.inputDraft);
  const setInputDraft = useConversationStore((s) => s.setInputDraft);
  const submitTurn = useConversationStore((s) => s.submitTurn);
  const phase = useConversationStore((s) => s.phase);
  const micActive = useConversationStore((s) => s.micActive);
  const setMicActive = useConversationStore((s) => s.setMicActive);
  const voicePartial = useConversationStore((s) => s.voiceTranscriptPartial);
  const setVoicePartial = useConversationStore((s) => s.setVoiceTranscriptPartial);
  const transition = useConversationStore((s) => s.transition);

  // Rotate placeholder every 60s (per disposition bank). Memo on persona.
  const placeholder = useMemo(
    () => getPlaceholder(persona?.traits ?? null),
    // dep on userId so it changes only when persona swaps; getPlaceholder
    // self-rotates by minute internally.
    [persona?.userId],
  );

  // ---- mic / PTT handlers ----------------------------------------------

  const startMic = () => {
    if (micActive) return;
    if (!isSTTAvailable()) {
      console.warn('[ChatInput] Web Speech API unavailable; PTT disabled');
      return;
    }
    setMicActive(true);
    pttDownAtRef.current = performance.now();
    transition('mic_press');

    sttSessionRef.current = startSTT({
      onPartial: (text) => {
        lastTranscriptRef.current = text;
        setVoicePartial(text);
        // mirror partial into the input draft so the user sees what's heard
        setInputDraft(text);
      },
      onFinal: (text) => {
        lastTranscriptRef.current = text;
      },
      onError: (err) => {
        console.warn('[ChatInput] STT error:', err);
      },
    });
  };

  const stopMic = async (autoSubmit = false) => {
    if (!micActive) return;
    const sess = sttSessionRef.current;
    sttSessionRef.current = null;
    setMicActive(false);
    transition('mic_release');
    setVoicePartial('');

    let finalText = lastTranscriptRef.current;
    try {
      if (sess) finalText = (await sess.stop()) || finalText;
    } catch (err) {
      console.warn('[ChatInput] STT stop threw:', err);
    }

    if (finalText) setInputDraft(finalText);

    // Long PTT (>2.5s with content) auto-submits; short PTT just fills draft.
    const heldMs = performance.now() - pttDownAtRef.current;
    if (autoSubmit || (heldMs >= PTT_AUTO_SUBMIT_MS && finalText.length >= 2)) {
      submitTurn(finalText);
    }
  };

  const cancelMic = () => {
    if (!micActive) return;
    sttSessionRef.current?.abort();
    sttSessionRef.current = null;
    setMicActive(false);
    setVoicePartial('');
    transition('reset');
  };

  // ---- global PTT spacebar ---------------------------------------------

  useEffect(() => {
    let spaceDown = false;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== ' ') return;
      // skip if user is typing in any text field
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) return;
      if (spaceDown || ev.repeat) return;
      spaceDown = true;
      ev.preventDefault();
      startMic();
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key !== ' ') return;
      if (!spaceDown) return;
      spaceDown = false;
      ev.preventDefault();
      void stopMic();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- focus assist on '/' --------------------------------------------

  useEffect(() => {
    const onSlash = (ev: KeyboardEvent) => {
      if (ev.key !== '/' || ev.metaKey || ev.ctrlKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      ev.preventDefault();
      inputRef.current?.focus();
      transition('focus_input');
    };
    window.addEventListener('keydown', onSlash);
    return () => window.removeEventListener('keydown', onSlash);
  }, [transition]);

  // ---- input handlers --------------------------------------------------

  const onInputKey = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      const text = inputDraft.trim();
      if (text) submitTurn(text);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (micActive) cancelMic();
      else void fireInterrupt('user_esc');
      inputRef.current?.blur();
    }
  };

  // ---- render ---------------------------------------------------------

  const isThinking = phase === 'thinking' || phase === 'filler' || phase === 'submitting';
  const accent = persona?.paletteHex ?? 'var(--angel-accent)';

  return (
    <div
      className="angel-chat-input-shell"
      style={{
        position: 'fixed',
        top: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 28,
        background: 'rgba(13, 10, 20, 0.66)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: `1.5px solid ${accent}55`,
        boxShadow: `0 14px 36px -16px ${accent}88, 0 0 0 1px rgba(255,255,255,0.04) inset`,
        minWidth: 460,
        maxWidth: '70vw',
        transition: 'border-color 240ms ease, box-shadow 240ms ease',
      }}
    >
      {/* leading glyph */}
      <motion.div
        animate={{ rotate: isThinking ? 360 : 0, opacity: isThinking ? 1 : 0.7 }}
        transition={{
          rotate: { repeat: isThinking ? Infinity : 0, duration: 1.6, ease: 'linear' },
          opacity: { duration: 0.2 },
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}44 70%, transparent 75%)`,
          flex: '0 0 auto',
          marginLeft: 4,
        }}
        aria-hidden
      />

      <input
        ref={inputRef}
        value={inputDraft}
        onChange={(e) => setInputDraft(e.target.value)}
        onKeyDown={onInputKey}
        onFocus={() => transition('focus_input')}
        placeholder={micActive ? voicePartial || 'listening…' : placeholder}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--angel-fg)',
          fontFamily: 'var(--font-ui)',
          fontSize: 15,
          letterSpacing: '0.01em',
          padding: '4px 0',
          minWidth: 0,
          boxShadow: 'none',
        }}
      />

      {/* mic button */}
      <button
        type="button"
        aria-label={micActive ? 'release mic' : 'hold to talk'}
        onMouseDown={(ev) => {
          ev.preventDefault();
          startMic();
        }}
        onMouseUp={(ev) => {
          ev.preventDefault();
          void stopMic();
        }}
        onMouseLeave={() => {
          if (micActive) void stopMic();
        }}
        onTouchStart={(ev) => {
          ev.preventDefault();
          startMic();
        }}
        onTouchEnd={(ev) => {
          ev.preventDefault();
          void stopMic();
        }}
        style={{
          position: 'relative',
          width: 34,
          height: 34,
          borderRadius: 999,
          border: `1px solid ${accent}99`,
          background: micActive ? `${accent}33` : 'rgba(255,255,255,0.04)',
          color: micActive ? accent : 'var(--angel-fg-muted)',
          cursor: 'pointer',
          flex: '0 0 auto',
          padding: 0,
          display: 'grid',
          placeItems: 'center',
          transition: 'background 200ms ease, color 200ms ease, transform 120ms ease',
        }}
      >
        <MicGlyph color={micActive ? accent : 'var(--angel-fg-muted)'} />
        <AnimatePresence>
          {micActive && (
            <motion.span
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: -2,
                borderRadius: 999,
                border: `2px solid ${accent}`,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>
      </button>

      <kbd
        title="hold space to talk · / to focus · esc to interrupt"
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--angel-fg-muted)',
          opacity: 0.5,
          padding: '2px 6px',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          flex: '0 0 auto',
          marginRight: 2,
        }}
      >
        ↵
      </kbd>
    </div>
  );
}

function MicGlyph({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="4" height="6.5" rx="2" />
      <path d="M3 7v0.5a4 4 0 0 0 8 0V7" />
      <path d="M7 11.5v1" />
    </svg>
  );
}

export default ChatInput;
