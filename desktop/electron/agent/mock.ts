/**
 * Mock orchestrator — drives the renderer end-to-end without Stephen's main
 * process orchestrator. Replace at the 3:30pm integration checkpoint with
 * `electron/agent/runner.ts`. The IPC surface (scene:action, chat:token,
 * state:update) does NOT change.
 *
 * This also doubles as a backup "if Stephen's loop hangs at 5pm" path
 * (per docs/RISKS.md kill-switches).
 */
import { ipcMain } from 'electron';
import type { SceneAction, AnchorId, Emotion } from '@angel/shared';
import { randomUUID } from 'node:crypto';

type ChatToken = { id: string; text: string; done?: boolean };
type StatePatch = {
  emotion?: Emotion;
  location?: AnchorId;
  isWalking?: boolean;
  walkTarget?: AnchorId;
  mood?: number;
  energy?: number;
  trust?: number;
  currentTaskId?: string | null;
};

type Sender = {
  send: (action: SceneAction) => void;
  sendChat: (token: ChatToken) => void;
  sendState: (patch: StatePatch) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nid = () => randomUUID();

/**
 * Decide which scripted flow to run based on the user's text.
 * Hackathon-grade keyword routing — enough to cover the demo prompt.
 */
function pickScript(text: string): 'ship' | 'browse' | 'memory' | 'idle' | 'greet' {
  const t = text.toLowerCase();
  if (/(ship|deploy|push|portfolio|card|build)/.test(t)) return 'ship';
  if (/(google|search|browse|look up|find)/.test(t)) return 'browse';
  if (/(remember|did we|last time|portfolio thing)/.test(t)) return 'memory';
  if (/(hi|hey|hello|yo|sup|good morning)/.test(t)) return 'greet';
  return 'idle';
}

async function emitSpeak(s: Sender, text: string, emotion: Emotion = 'neutral') {
  // ActionRunner appends the chat row when this speak action lands — do NOT
  // also push via sendChat or the message duplicates in the history pane.
  s.send({ id: nid(), type: 'speak', text, emotion });
}

async function emitWalkAndWait(s: Sender, anchor: AnchorId, ms = 1600) {
  const id = nid();
  s.sendState({ isWalking: true, walkTarget: anchor });
  s.send({ id, type: 'walk_to', anchor, speed: 'normal' });
  await sleep(ms);
  s.sendState({ isWalking: false, location: anchor });
}

async function emitClip(s: Sender, clip: 'idle' | 'walking' | 'sitting' | 'typing' | 'reading' | 'wave' | 'thinking', durationMs?: number, loop = false) {
  s.send({ id: nid(), type: 'play_clip', clip, loop, durationMs });
}

/* ------------------------------------------------------------------ */
/* scripts                                                             */
/* ------------------------------------------------------------------ */

async function scriptShip(s: Sender, intent: string) {
  await emitSpeak(s, 'oh fun. let me.', 'excited');
  s.sendState({ emotion: 'excited', mood: 0.7, energy: 0.9 });

  await sleep(400);
  await emitWalkAndWait(s, 'desk_sit', 1800);

  s.send({ id: nid(), type: 'sit_at', anchor: 'desk_sit' });
  await sleep(300);

  s.sendState({ emotion: 'focused', currentTaskId: 'mock-task-1' });
  await emitClip(s, 'typing', 8000, true);
  await emitSpeak(s, 'reading the repo...', 'focused');
  await sleep(2000);

  await emitSpeak(s, 'writing the card component...', 'focused');
  await sleep(2200);

  await emitSpeak(s, 'running tests...', 'thinking');
  await sleep(1800);

  await emitSpeak(s, 'pushing to vercel...', 'focused');
  await sleep(1600);

  s.sendState({ emotion: 'happy', currentTaskId: null, mood: 0.95, trust: 0.9 });
  await emitClip(s, 'idle', 2000, false);
  await emitSpeak(s, 'shipped. want me to tweet it?', 'happy');
  void intent;
}

async function scriptGreet(s: Sender) {
  await emitSpeak(s, 'oh — you\u2019re back.', 'happy');
  s.sendState({ emotion: 'happy', mood: 0.8 });
  await sleep(600);
  await emitSpeak(s, 'while you were gone, i watched your portfolio repo and prepared 3 commits to review.', 'soft');
}

async function scriptMemory(s: Sender) {
  s.sendState({ emotion: 'thinking' });
  await emitSpeak(s, 'how\u2019d that portfolio thing land last week, by the way?', 'soft');
}

async function scriptBrowse(s: Sender, intent: string) {
  await emitSpeak(s, 'on it. lemme look.', 'thinking');
  await emitWalkAndWait(s, 'couch_sit', 1400);
  s.send({ id: nid(), type: 'sit_at', anchor: 'couch_sit' });
  await sleep(300);
  await emitClip(s, 'reading', 4000, true);
  await sleep(3500);
  await emitSpeak(s, 'okay, found it.', 'happy');
  void intent;
}

async function scriptIdle(s: Sender, text: string) {
  s.sendState({ emotion: 'thinking' });
  await emitSpeak(s, 'mm, gimme a sec.', 'thinking');
  await sleep(800);
  await emitSpeak(s, `you said "${text}" — i don\u2019t have a take wired up for that yet.`, 'soft');
}

/* ------------------------------------------------------------------ */
/* public api                                                          */
/* ------------------------------------------------------------------ */

export function runMockOrchestrator(input: { text: string; send: Sender['send']; sendChat: Sender['sendChat']; sendState: Sender['sendState'] }) {
  const s: Sender = { send: input.send, sendChat: input.sendChat, sendState: input.sendState };
  const which = pickScript(input.text);
  switch (which) {
    case 'ship':
      void scriptShip(s, input.text);
      break;
    case 'greet':
      void scriptGreet(s);
      break;
    case 'memory':
      void scriptMemory(s);
      break;
    case 'browse':
      void scriptBrowse(s, input.text);
      break;
    default:
      void scriptIdle(s, input.text);
  }
}

/**
 * Registers any mock-only IPC handlers (e.g., a "trigger bg autonomy"
 * dev hook so we can rehearse the "while you were away..." beat).
 */
export function registerMockHandlers(): void {
  ipcMain.handle('mock:trigger', async (_e, kind: 'bg-autonomy' | 'memory-callback') => {
    // wired by renderer dev tools or hotkey at rehearsal time.
    void kind;
    return { ok: true };
  });
}

/**
 * The 30%-weighted "while you were away..." beat. Fires automatically once
 * the renderer is ready — proves background autonomy without user prompt.
 * Stephen's real orchestrator will replace this hook at integration; the
 * IPC channels (scene:action, chat:token, state:update) stay identical.
 */
export interface BootAutonomyObservation {
  /** Single-line natural utterance to speak (already shaped for lipsync). */
  greetingLine?: string;
  /** Optional followup suggestion \u2014 spoken after a beat. */
  suggestion?: string;
}

export async function bootAutonomyBeat(
  send: {
    send: (a: SceneAction) => void;
    sendChat: (t: ChatToken) => void;
    sendState: (p: StatePatch) => void;
  },
  observation?: BootAutonomyObservation,
): Promise<void> {
  // small grace so the avatar finishes loading + lighting settles
  await sleep(2200);
  const s: Sender = send;
  await emitSpeak(s, 'oh \u2014 you\u2019re back.', 'happy');
  s.sendState({ emotion: 'happy', mood: 0.85, energy: 0.78, trust: 0.6 });
  await sleep(900);
  const mainLine =
    observation?.greetingLine ??
    'while you were gone, i watched your portfolio repo and prepared 3 commits to review.';
  await emitSpeak(s, mainLine, 'soft');
  await sleep(1400);
  if (observation?.suggestion) {
    s.sendState({ emotion: 'thinking' });
    await emitSpeak(s, `want me to ${observation.suggestion}?`, 'soft');
    return;
  }
  // statefulness 25% beat — the memory callback
  s.sendState({ emotion: 'thinking' });
  await emitSpeak(s, 'how\u2019d that portfolio thing land last week, by the way?', 'soft');
}
