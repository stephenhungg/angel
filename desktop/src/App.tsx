import { useEffect } from 'react';

import { Scene } from '@/components/Scene';
import { ChatOverlay } from '@/components/ChatOverlay';
import { Subtitle } from '@/components/Subtitle';
import { StateBars } from '@/components/StateBars';
import { useAngelStore } from '@/stores/angel';
import { ipc } from '@/lib/ipc';
import { unlockAudio } from '@/lib/animalese';
import { setupConversationLayer } from '@/lib/conversationLayer';
import type { SceneAction } from '@angel/shared';

/** Composition root. Wires the IPC bridge → store, mounts 3D + HUD. */
export function App() {
  const enqueue = useAngelStore((s) => s.enqueue);
  const setStoreState = useAngelStore((s) => s.setState);
  const appendChat = useAngelStore((s) => s.appendChat);
  const patchChat = useAngelStore((s) => s.patchChat);
  const applyClaim = useAngelStore((s) => s.applyClaim);
  const persona = useAngelStore((s) => s.persona);
  const stateEmotion = useAngelStore((s) => s.state.emotion);

  // bridge → store
  useEffect(() => {
    const offAction = ipc.onAction((action: SceneAction) => {
      enqueue(action);
    });
    const offChat = ipc.onChat((token) => {
      // chat:token from main → just history mirror; the speech bubble is
      // driven by 'speak' SceneActions through the action runner.
      if (token.text) {
        appendChat({
          id: token.id,
          role: 'angel',
          text: token.text,
          done: token.done ?? true,
        });
      } else if (token.done) {
        patchChat(token.id, { done: true });
      }
    });
    const offState = ipc.onState((patch) => {
      setStoreState(patch as Parameters<typeof setStoreState>[0]);
    });
    const offClaim = ipc.onClaim((claim) => {
      applyClaim(claim);
    });

    void ipc.getInitialClaim().then((claim) => {
      if (claim) applyClaim(claim);
    });

    // unlock audio on first user gesture (Chromium policy)
    const onFirstClick = () => {
      void unlockAudio();
      window.removeEventListener('pointerdown', onFirstClick);
    };
    window.addEventListener('pointerdown', onFirstClick);

    // L2 conversation layer: Esc-interrupt, filler, bg autonomy, persona
    // cascade, animalese DI. Single setup call wires every dependency.
    const disposeLayer = setupConversationLayer({
      heartbeatMs: 60_000, // demo cadence — bump to 300_000 for prod
    });

    return () => {
      offAction();
      offChat();
      offState();
      offClaim();
      window.removeEventListener('pointerdown', onFirstClick);
      disposeLayer();
    };
  }, [enqueue, appendChat, patchChat, setStoreState, applyClaim]);

  return (
    <>
      <div className="scene-root">
        <Scene debug />
      </div>
      <div className="hud">
        {/* titlebar identity */}
        <header
          style={{
            position: 'absolute',
            top: 48,
            left: 36,
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            color: 'var(--angel-fg)',
            letterSpacing: '0.02em',
            textShadow: '0 2px 18px rgba(0,0,0,0.7)',
            pointerEvents: 'none',
          }}
        >
          {persona?.name ? (
            <>
              {persona.name}
              <span style={{ color: 'var(--angel-accent)' }}>.</span>
            </>
          ) : (
            <>
              angel<span style={{ color: 'var(--angel-accent)' }}>.</span>
            </>
          )}
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 11,
              opacity: 0.55,
              marginTop: 6,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {persona
              ? `${persona.traits.aesthetic} · ${persona.traits.disposition} · ${persona.traits.style} · ${stateEmotion}`
              : 'discovered, not designed'}
          </div>
        </header>

        <Subtitle />
        <StateBars />
        <ChatOverlay />
      </div>
    </>
  );
}
