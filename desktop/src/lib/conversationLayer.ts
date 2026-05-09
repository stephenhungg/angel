/**
 * lib/conversationLayer.ts — single composition root for the conversational
 * (L2) layer.
 *
 * The 12 unique files in `lib/` and `components/` are wired up via dependency
 * injection: each one owns its concern but accepts hooks for the bits the
 * renderer-buildout plan provides (animalese audio, voice banks). This file
 * is the one place where those bridges get attached.
 *
 * Idempotent. Returns a disposer that tears down all subscriptions.
 *
 * Usage (called once from App.tsx):
 *
 *   useEffect(() => {
 *     const dispose = setupConversationLayer({ heartbeatMs: 60_000 });
 *     return dispose;
 *   }, []);
 */

import { cancelAnimalese, speakAnimalese, unlockAudio } from './animalese';
import { registerAudioStopper, bindEscKey } from './interrupt';
import { registerFillerSpeaker, startFillerEngine, stopFillerEngine, type FillerController } from './filler';
import { registerVoiceBankLoader, bindPersonaApply } from './personaApply';
import { startBgAutonomy, stopBgAutonomy } from './bgAutonomy';
import { useAngelStore } from '../stores/angel';
import type { VoiceCluster } from '@angel/shared';

/* ------------------------------------------------------------------ */
/* config                                                              */
/* ------------------------------------------------------------------ */

export interface ConversationLayerOptions {
  /** background autonomy heartbeat interval in ms.
   *  prod default: 5min. dev demo: 60s. pass 0 to disable. */
  heartbeatMs?: number;
  /** boot greeting delay after persona arrival. defaults 2000ms. 0 to skip. */
  bootGreetingDelayMs?: number;
  /** mocks for the boot greeting payload */
  bootCommits?: number;
  bootRepos?: string[];
}

/* ------------------------------------------------------------------ */
/* setup                                                               */
/* ------------------------------------------------------------------ */

let _running = false;
let _disposers: Array<() => void> = [];

export function setupConversationLayer(opts: ConversationLayerOptions = {}): () => void {
  if (_running) return () => {};
  _running = true;

  /* ---- 1. animalese DI: audio stopper for interrupt + filler speaker ---- */

  // Esc / fireInterrupt fades and stops the in-flight animalese chirp loop.
  // cancelAnimalese is module-global in their impl — concurrent utterances
  // not supported, but we don't need them: filler always cancels before main
  // speak starts, and interrupt nukes everything.
  registerAudioStopper(async () => {
    cancelAnimalese();
  });

  // Filler ("hmm.", "lemme think.") plays via animalese with a soft emotion.
  // Returns a controller whose stop() fires cancelAnimalese — same global
  // mechanism, see note above.
  registerFillerSpeaker((text, _opts): FillerController => {
    const cluster = pickCluster();
    void speakAnimalese(text, {
      voiceCluster: cluster,
      emotion: 'thinking',
      volume: 0.22, // softer than main speech so it duck-mixes nicely
    }).catch((err) => console.warn('[layer] filler speak threw:', err));

    return {
      stop: async () => {
        cancelAnimalese();
      },
    };
  });

  /* ---- 2. voice bank loader (no-op for procedural synth) ---- */

  registerVoiceBankLoader(async (cluster: VoiceCluster) => {
    // Their animalese is a Web Audio synth keyed by `cluster` at speak() time.
    // No assets to fetch — but we still warm the AudioContext on first persona
    // resolve so the boot greeting fires without a permission prompt mid-line.
    void cluster;
    try {
      await unlockAudio();
    } catch (err) {
      console.warn('[layer] unlockAudio threw:', err);
    }
  });

  /* ---- 3. lifecycle bindings ---- */

  // Esc anywhere → fireInterrupt → cancelAnimalese + cancelQueue + idle settle
  _disposers.push(bindEscKey());

  // useAngelStore.persona changes → window.title + voice bank prewarm +
  // schedule bg:autonomy 'while_you_were_away' boot greeting at +2s.
  _disposers.push(
    bindPersonaApply({
      bootGreetingDelayMs: opts.bootGreetingDelayMs ?? 2000,
      bootCommits: opts.bootCommits ?? 3,
      bootRepos: opts.bootRepos ?? ['portfolio'],
    }),
  );

  // bg:autonomy events → scripted SceneAction sequences pushed into
  // useAngelStore.queue (heartbeat every heartbeatMs while idle).
  startBgAutonomy({ heartbeatMs: opts.heartbeatMs ?? 300_000 });
  _disposers.push(stopBgAutonomy);

  // Filler engine subscribes to phase changes — fires after 500ms in thinking.
  startFillerEngine();
  _disposers.push(stopFillerEngine);

  /* ---- 4. expose for devtools poking ---- */

  if (typeof window !== 'undefined') {
    (window as unknown as { __angelL2?: object }).__angelL2 = {
      cancelAnimalese,
      speakAnimalese,
      unlockAudio,
    };
  }

  console.info('[layer] conversation layer online · heartbeat:', opts.heartbeatMs ?? 300_000, 'ms');

  return dispose;
}

function dispose(): void {
  if (!_running) return;
  _running = false;
  for (const d of _disposers) {
    try {
      d();
    } catch (err) {
      console.warn('[layer] disposer threw:', err);
    }
  }
  _disposers = [];
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function pickCluster(): VoiceCluster {
  const persona = useAngelStore.getState().persona;
  return ((persona?.traits?.voice_cluster ?? 2) as VoiceCluster);
}
