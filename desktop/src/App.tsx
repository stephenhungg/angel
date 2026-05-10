import { useEffect, useState } from 'react';

import { Scene } from '@/components/Scene';
import { ChatOverlay } from '@/components/ChatOverlay';
import { Subtitle } from '@/components/Subtitle';
import { StateBars } from '@/components/StateBars';
import { useAngelStore } from '@/stores/angel';
import { ipc } from '@/lib/ipc';
import { unlockAudio } from '@/lib/animalese';
import { setupConversationLayer } from '@/lib/conversationLayer';
import { setupPersonaPersist } from '@/lib/personaPersist';
import { TitleScreen } from '@/components/onboarding/TitleScreen';
import { OnboardingPage } from '@/components/onboarding/OnboardingPage';
import { RevealOverlay } from '@/components/onboarding/RevealOverlay';
import { useSwipeStore } from '@/stores/swipe';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { IntroductionPhase } from '@/components/introduction/IntroductionPhase';
import { readSettingsBootstrap } from '@/lib/settings';
import type { SceneAction } from '@angel/shared';
import type { AngelSettings } from '@/global';

type Phase =
  | 'booting' // checking settings + persisted persona before deciding
  | 'settings' // first-run setup (transport + key)
  | 'onboarding' // swipe deck
  | 'reveal' // dopamine cascade + naming
  | 'introduction' // she asks 5 questions in her voice → nia
  | 'room';

/** Composition root. Picks the right cold-boot phase based on:
 *   1. settings.json present? if not → 'settings' (unless dev env-key path)
 *   2. persona persisted? if yes + introCompleted → 'room', else 'introduction'
 *   3. otherwise → 'onboarding' (swipe → reveal → introduction → room)
 *
 * If a persona DISAPPEARS while in room (rediscover button wiped it), bounce
 * back to the swipe deck + reset the swipe store so the user can re-run the
 * flow from scratch.
 */
export function App() {
  const persona = useAngelStore((s) => s.persona);
  const [phase, setPhase] = useState<Phase>('booting');
  const [settings, setSettings] = useState<AngelSettings | null>(null);

  // Boot decision: read settings from main, then route.
  useEffect(() => {
    let cancelled = false;
    void readSettingsBootstrap().then((boot) => {
      if (cancelled) return;
      setSettings(boot.settings);
      if (boot.shouldShowSettings) {
        setPhase('settings');
        return;
      }
      // settings exist (or dev env-key path): pick onboarding/intro/room
      const hydrated = useAngelStore.getState().persona;
      if (hydrated) {
        if (boot.settings && !boot.settings.introCompleted) {
          setPhase('introduction');
        } else {
          setPhase('room');
        }
      } else {
        setPhase('onboarding');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // If a persona arrives via claim:received while we're elsewhere, route to
  // the right phase: room if intro is done, introduction otherwise. If the
  // persona DISAPPEARS while in room, reset the swipe store + bounce back to
  // onboarding so the user can rediscover from scratch.
  useEffect(() => {
    if (!persona) {
      if (phase === 'room') {
        try {
          useSwipeStore.getState().reset();
        } catch {
          /* ignore — store may not be hydrated yet */
        }
        setPhase('onboarding');
      }
      return;
    }
    if (phase === 'room' || phase === 'introduction') return;
    if (phase === 'settings' || phase === 'booting') return;
    if (settings?.introCompleted) {
      setPhase('room');
    } else {
      setPhase('introduction');
    }
  }, [persona, phase, settings?.introCompleted]);

  return (
    <>
      {phase === 'booting' && <BootingShim />}
      {phase === 'settings' && (
        <SettingsScreen
          mode="first-run"
          onComplete={(s) => {
            setSettings(s);
            // a returning user with a persisted persona but no intro:
            // settings just got created; route to the next logical step
            const hydrated = useAngelStore.getState().persona;
            if (hydrated && !s.introCompleted) setPhase('introduction');
            else if (hydrated && s.introCompleted) setPhase('room');
            else setPhase('onboarding');
          }}
        />
      )}
      {phase === 'onboarding' && (
        <OnboardingPage onComplete={() => setPhase('reveal')} />
      )}
      {phase === 'reveal' && (
        <RevealOverlay onComplete={() => setPhase('introduction')} />
      )}
      {phase === 'introduction' && (
        <IntroductionPhase
          onComplete={() => {
            // refresh settings from main so introCompleted=true is captured
            void readSettingsBootstrap().then((boot) => setSettings(boot.settings));
            setPhase('room');
          }}
        />
      )}
      {phase === 'room' && <RoomShell />}
    </>
  );
}

/** Tiny full-screen black shim while we async-read settings. Prevents a
 *  flash of "onboarding then settings" or vice versa. */
function BootingShim() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0d0a14',
        zIndex: 9999,
      }}
    />
  );
}

/** Original App body — the existing room tree + IPC bridge + chrome. Untouched
 *  beyond extraction; mounts only when phase === 'room'. */
function RoomShell() {
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

    // L2 conversation layer: Esc-interrupt, filler, persona cascade,
    // animalese DI. Both canned beats are HARD-OFF regardless of backend:
    //   bootGreetingDelayMs=0 → no "+2s persona-apply 'while you were
    //                            gone' greeting ever fires
    //   heartbeatMs=0         → no recurring 60s "still watching your
    //                            repo" idle chatter ever fires
    // The L2 layer was originally written as a hackathon fallback when no
    // LLM was wired; with Sonnet + Nia live, the brain owns greetings.
    const disposeLayer = setupConversationLayer({
      bootGreetingDelayMs: 0,
      heartbeatMs: 0,
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

        {/* chat overlay always mounted — its T-key handler needs to be
            live during gameplay (press T from anywhere → open chat). The
            overlay self-hides input + history while the pointer is locked,
            and reveals the input when chat is explicitly opened via T. */}
        <ChatOverlay />
      </div>
    </>
  );
}
