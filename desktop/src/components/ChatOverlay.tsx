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
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // auto-scroll to most recent
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  // global "T to talk" — releases pointer lock and focuses the chat input.
  // standard quake/cs convention. only fires if no input/textarea is focused
  // so it doesn't hijack typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyT') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      // wait a tick so the lock release lands first, then focus
      window.setTimeout(() => inputRef.current?.focus(), 16);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft('');
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
      // refocus to keep the conversation flowing
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* history (top-right, dim, fades old) */}
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

      {/* input docked bottom-center */}
      <form
        onSubmit={submit}
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 28,
          transform: 'translateX(-50%)',
          width: 'min(720px, calc(100vw - 80px))',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px 8px 18px',
          background: 'rgba(13,10,20,0.85)',
          border: '1px solid var(--angel-accent-soft)',
          borderRadius: 999,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 14px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02)',
          pointerEvents: 'auto',
          zIndex: 30,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: 'var(--angel-accent)',
            boxShadow: '0 0 12px var(--angel-accent)',
            animation: 'angel-pulse 1.4s infinite',
          }}
        />
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="say something..."
          disabled={busy}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 16,
            color: 'var(--angel-fg)',
            fontFamily: 'var(--font-ui)',
            padding: '10px 0',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          style={{
            padding: '8px 18px',
            borderRadius: 999,
            background: draft.trim() ? 'var(--angel-accent)' : 'rgba(255,255,255,0.04)',
            color: draft.trim() ? '#0d0a14' : 'var(--angel-fg-muted)',
            border: 'none',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 11,
            cursor: draft.trim() ? 'pointer' : 'default',
            transition: 'background 180ms ease, color 180ms ease',
          }}
        >
          {busy ? '...' : 'send'}
        </button>
      </form>
    </>
  );
}
