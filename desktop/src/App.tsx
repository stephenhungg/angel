import { useEffect } from 'react';

import { Scene } from '@/components/Scene';
import { ChatOverlay } from '@/components/ChatOverlay';
import { Subtitle } from '@/components/Subtitle';
import { StateBars } from '@/components/StateBars';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { useAngelStore } from '@/stores/angel';
import { ipc } from '@/lib/ipc';
import { unlockAudio } from '@/lib/animalese';
import { setupConversationLayer } from '@/lib/conversationLayer';
import { setupPersonaPersist } from '@/lib/personaPersist';
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
  const pointerLocked = useAngelStore((s) => s.pointerLocked);
  // chrome (header / state bars / chat) is hidden during gameplay so the
  // scene reads as immersive — only the menu (esc tab) shows the full HUD.
  // Subtitle stays mounted unconditionally because dialogue is part of the
  // world, not chrome.
  const showChrome = !pointerLocked;

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

    // hydrate the persona from localStorage if a previous session committed
    // one (so re-opening the app skips onboarding) + write back on future
    // commits. Needs to run after the store mounts.
    const disposePersist = setupPersonaPersist();

    return () => {
      offAction();
      offChat();
      offState();
      offClaim();
      window.removeEventListener('pointerdown', onFirstClick);
      disposeLayer();
      disposePersist();
    };
  }, [enqueue, appendChat, patchChat, setStoreState, applyClaim]);

  // Pre-room overlay: until the user has committed a persona (either via
  // the swipe flow or a saved one from a previous launch), skip the 3D
  // scene entirely and run the onboarding flow. Loading the room costs an
  // expensive VRM + glb fetch, so gating it here also makes first-launch
  // feel snappy.
  if (!persona) {
    return <Onboarding />;
  }

  return (
    <>
      <div className="scene-root">
        <Scene debug />
      </div>
      <div className="hud">
        {/* titlebar identity — chrome, only on the esc menu */}
        {showChrome && (
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
              animation: 'angel-fade-in 220ms ease',
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
        )}

        {/* dialogue — always visible. she's still talking even when you're
            in pointer-locked gameplay mode */}
        <Subtitle />

        {/* chrome — hide during gameplay for an immersive view */}
        {showChrome && <StateBars />}
        {showChrome && <ChatOverlay />}
      </div>
    </>
  );
}
