/**
 * lib/stt.ts — speech-to-text wrapper.
 *
 * v1: Web Speech API (window.SpeechRecognition / webkitSpeechRecognition).
 *   - Browser-native in Chromium → works inside Electron with no extra deps.
 *   - No API key, no cost, no network roundtrip via main.
 *   - Push-to-talk semantics: caller calls start() on key/button down,
 *     then stop() on release. We expose interim + final transcripts.
 *
 * v2 (stretch, only if time + Web Speech feels laggy): Deepgram nova-3
 *   streaming via main process. The shape of `startSTT` returned here is
 *   intentionally identical so the swap is single-import.
 *
 * Per docs/RISKS.md #10: text-only is the safe default. Voice is bonus.
 */

export type STTOpts = {
  /** fired with running interim transcript while speaking */
  onPartial?: (text: string) => void;
  /** fired once with the final transcript when stop() is called */
  onFinal?: (text: string) => void;
  /** fired on unrecoverable error (mic perms, no api, etc.) */
  onError?: (err: string) => void;
  /** BCP-47 language tag, default en-US */
  lang?: string;
};

export interface STTSession {
  /** stop the session and resolve with the final transcript */
  stop(): Promise<string>;
  /** abort without resolving — used by interrupt */
  abort(): void;
  /** is the session still listening */
  isActive(): boolean;
}

/* ------------------------------------------------------------------ */
/* feature detection                                                   */
/* ------------------------------------------------------------------ */

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
    length: number;
  }>;
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

export function isSTTAvailable(): boolean {
  return getCtor() !== null;
}

/* ------------------------------------------------------------------ */
/* start a session                                                     */
/* ------------------------------------------------------------------ */

export function startSTT(opts: STTOpts = {}): STTSession {
  const Ctor = getCtor();

  // Graceful no-op session if Web Speech isn't available.
  if (!Ctor) {
    opts.onError?.('Web Speech API not available in this environment');
    return {
      stop: async () => '',
      abort: () => {},
      isActive: () => false,
    };
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = opts.lang ?? 'en-US';
  if (recognition.maxAlternatives !== undefined) recognition.maxAlternatives = 1;

  let active = true;
  let finalTranscript = '';
  let stopResolver: ((text: string) => void) | null = null;

  recognition.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      if (!result) continue;
      const alt = result[0];
      const text = alt.transcript;
      if (result.isFinal) {
        finalTranscript += text;
      } else {
        interim += text;
      }
    }
    const partial = (finalTranscript + interim).trim();
    if (partial) opts.onPartial?.(partial);
  };

  recognition.onerror = (ev) => {
    const code = ev.error ?? 'unknown';
    if (code === 'aborted' || code === 'no-speech') return; // benign
    opts.onError?.(code);
  };

  recognition.onend = () => {
    active = false;
    const text = finalTranscript.trim();
    if (text) opts.onFinal?.(text);
    if (stopResolver) {
      stopResolver(text);
      stopResolver = null;
    }
  };

  try {
    recognition.start();
  } catch (err) {
    opts.onError?.(String(err));
    active = false;
  }

  return {
    stop(): Promise<string> {
      if (!active) return Promise.resolve(finalTranscript.trim());
      return new Promise<string>((resolve) => {
        stopResolver = resolve;
        try {
          recognition.stop();
        } catch {
          /* ignore */
        }
      });
    },
    abort(): void {
      active = false;
      stopResolver = null;
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    },
    isActive(): boolean {
      return active;
    },
  };
}
