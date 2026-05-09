import { useEffect, useRef, useState } from 'react';
import { useAngelStore } from '@/stores/angel';
import { ipc } from '@/lib/ipc';
import { unlockAudio } from '@/lib/animalese';
import { randomMessageId } from '@/lib/ids';

/**
 * Chat overlay. Bottom-of-screen input + scrollable history docked top-right.
 * Composition contract:
 *   • <App> mounts <Subtitle/> elsewhere (it owns the speech bubble).
 *   • This file owns the input box + history scrollback.
 */
export function ChatOverlay() {
  const chat = useAngelStore((s) => s.chat);
  const appendChat = useAngelStore((s) => s.appendChat);
  const persona = useAngelStore((s) => s.persona);
  const pointerLocked = useAngelStore((s) => s.pointerLocked);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasText = draft.trim().length > 0;

  // input bar is ALWAYS visible — it's the primary way to talk to her,
  // not a modal. History scrollback is still chrome-only (it'd clutter
  // the immersive view). Pointer-lock is never released by the chat —
  // T just focuses the input; Player.tsx ignores WASD + mouse-look while
  // an <input> is focused so typing doesn't move the camera/avatar.
  const showHistory = !pointerLocked;

  useEffect(() => {
    // auto-scroll to most recent
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  // global "T to talk" — focuses the chat input WITHOUT releasing
  // pointer-lock (so no esc menu pops up; user just starts typing).
  // Skips when any input/textarea is already focused so the user can
  // type the letter "t" inside the chat itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyT') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      // also stop the keypress so the 't' character doesn't get typed
      // into the input we're about to focus on the next tick.
      e.stopPropagation();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    setDraft('');
    // blur the input so Player.tsx's "is an input focused" gate releases
    // and WASD/mouse-look resume immediately. submit fires async; the
    // reply lands as a Subtitle (always-visible) regardless of focus.
    inputRef.current?.blur();

    setBusy(true);
    appendChat({ id: randomMessageId('u'), role: 'user', text, done: true });
    void unlockAudio(); // user gesture path

    try {
      await ipc.chat(text);
    } catch (err) {
      appendChat({
        id: randomMessageId('s'),
        role: 'system',
        text: `(error: ${(err as Error).message ?? err})`,
        done: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* history (top-right, dim, fades old) — esc-menu only */}
      {showHistory && (
      <div
        ref={scrollRef}
        data-no-lock
        style={{
          position: 'fixed',
          top: 92,
          right: 28,
          width: 360,
          maxHeight: 'min(420px, 50vh)',
          padding: '8px 12px',
          overflowY: 'auto',
          fontFamily: 'var(--font-ui)',
          fontSize: 12.5,
          lineHeight: 1.5,
          color: 'var(--angel-fg)',
          background: 'linear-gradient(180deg, rgba(13,10,20,0) 0%, rgba(13,10,20,0.5) 80%)',
          borderRadius: 12,
          pointerEvents: 'auto',
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 18%, #000 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 18%, #000 90%, transparent 100%)',
        }}
      >
        {chat.length === 0 && (
          <div style={{ opacity: 0.45, fontStyle: 'italic', textAlign: 'right' }}>
            say something to {persona?.name ?? 'angel'}.
          </div>
        )}
        {chat.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              margin: '6px 0',
              animation: 'angel-fade-in 220ms ease',
            }}
          >
            <span
              style={{
                fontSize: 9,
                opacity: 0.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              {m.role === 'user' ? 'you' : m.role === 'angel' ? persona?.name ?? 'angel' : 'system'}
            </span>
            <span
              style={{
                padding: '4px 10px',
                marginTop: 2,
                borderRadius: 9,
                background:
                  m.role === 'user'
                    ? 'rgba(255, 255, 255, 0.05)'
                    : m.role === 'angel'
                    ? 'rgba(255, 126, 182, 0.16)'
                    : 'rgba(255, 220, 100, 0.12)',
                border:
                  m.role === 'angel'
                    ? '1px solid var(--angel-accent-soft)'
                    : '1px solid rgba(255,255,255,0.05)',
                maxWidth: 320,
                wordBreak: 'break-word',
              }}
            >
              {m.text}
            </span>
          </div>
        ))}
      </div>
      )}

      {/* input docked bottom-center — always visible. liquid-glass apple
          style; frosted-white tint + heavy backdrop blur reads as "panel
          of glass floating on top of the room". data-no-lock stops the
          global click-to-pointer-lock from firing when the user clicks
          into the input. Movement is gated on input focus in Player.tsx. */}
      <form
        onSubmit={submit}
        data-no-lock
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 32,
          transform: 'translateX(-50%)',
          width: 'min(680px, calc(100vw - 80px))',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '7px 7px 7px 22px',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: focused
            ? '1px solid rgba(255,255,255,0.22)'
            : '1px solid rgba(255,255,255,0.12)',
          borderRadius: 999,
          boxShadow: focused
            ? [
                '0 1px 0 rgba(255,255,255,0.22) inset',
                '0 0 0 0.5px rgba(255,255,255,0.06) inset',
                '0 18px 50px -12px rgba(0,0,0,0.7)',
                '0 2px 10px rgba(0,0,0,0.35)',
                '0 0 36px -8px var(--angel-accent-soft)',
              ].join(', ')
            : [
                '0 1px 0 rgba(255,255,255,0.18) inset',
                '0 0 0 0.5px rgba(255,255,255,0.05) inset',
                '0 14px 40px -10px rgba(0,0,0,0.6)',
                '0 2px 8px rgba(0,0,0,0.3)',
              ].join(', '),
          transition: 'border-color 240ms ease, box-shadow 240ms ease',
          pointerEvents: 'auto',
          zIndex: 30,
        }}
      >
        {/* presence orb — pulsing accent core wrapped in a faint halo ring.
            this is the "she's here" indicator; persona-tinted via css var. */}
        <span
          aria-hidden
          style={{
            position: 'relative',
            width: 10,
            height: 10,
            flex: '0 0 auto',
            marginRight: 2,
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 999,
              background: 'var(--angel-accent)',
              boxShadow:
                '0 0 10px var(--angel-accent), 0 0 22px var(--angel-accent-soft)',
              animation: 'angel-pulse 1.6s ease-in-out infinite',
            }}
          />
          <span
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: 999,
              border: '1px solid var(--angel-accent-soft)',
              opacity: 0.55,
            }}
          />
        </span>

        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            busy ? '…' : `say something to ${persona?.name?.toLowerCase() ?? 'angel'}…`
          }
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 15,
            color: 'var(--angel-fg)',
            fontFamily: 'var(--font-ui)',
            padding: '11px 0',
            minWidth: 0,
            letterSpacing: '0.005em',
            boxShadow: 'none',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void submit();
            } else if (e.key === 'Escape') {
              // bail out without sending — drop draft + return focus to
              // the canvas so movement resumes. Stops the keypress here
              // so we don't trigger the global Esc → cancel-action path.
              e.preventDefault();
              e.stopPropagation();
              setDraft('');
              inputRef.current?.blur();
            }
          }}
        />

        {/* circular send arrow — fills with persona accent only when there's
            content to send. busy state swaps in a small spinner. */}
        <button
          type="submit"
          disabled={!hasText || busy}
          aria-label={busy ? 'sending' : 'send'}
          style={{
            width: 34,
            height: 34,
            flex: '0 0 auto',
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: hasText ? 'var(--angel-accent)' : 'rgba(255,255,255,0.06)',
            color: hasText ? '#0d0a14' : 'rgba(255,255,255,0.5)',
            cursor: hasText && !busy ? 'pointer' : 'default',
            boxShadow: hasText
              ? [
                  '0 1px 0 rgba(255,255,255,0.30) inset',
                  '0 0 0 0.5px rgba(255,255,255,0.06) inset',
                  '0 4px 14px -2px var(--angel-accent-soft)',
                ].join(', ')
              : [
                  '0 1px 0 rgba(255,255,255,0.10) inset',
                  '0 0 0 0.5px rgba(255,255,255,0.05) inset',
                ].join(', '),
            padding: 0,
            transition:
              'background 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 120ms ease',
          }}
        >
          {busy ? <BusySpinner /> : <ArrowUpGlyph />}
        </button>
      </form>
    </>
  );
}

function ArrowUpGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 11.5V3M7 3l-3.6 3.6M7 3l3.6 3.6"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BusySpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx={7} cy={7} r={5} stroke="currentColor" strokeWidth={1.6} fill="none" opacity={0.25} />
      <path d="M12 7a5 5 0 0 0-5-5" stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 7 7"
          to="360 7 7"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
