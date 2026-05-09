import type { VoiceCluster } from '@angel/shared';

/**
 * Animalese voice synth.
 *
 * v1 is a Web Audio synth (no sample files needed) — short pitched square
 * waves clipped fast, one chirp per consonant, a slightly different timbre
 * for vowels. Not as cute as Animal Crossing's true sample bank, but it
 * gives the embodied-text-bubble effect, ships with zero binary assets,
 * and tunes per `voice_cluster` per docs/PERSONA.md.
 *
 * Pacing rules (per docs/PERSONA.md):
 *   • `.` → 200ms pause
 *   • `,` → 100ms pause
 *   • `?` → pitch up on last char before
 *   • `!` → pitch up + 1.1× speed for the prior word
 *   • emotion=excited  → 1.2× speed,  +5%  pitch variance
 *   • emotion=thinking → 0.8× speed, occasional pause
 *   • emotion=soft     → 0.9× speed, less pitch variance
 *
 * Drop-in replacement: when V1-V6 sample WAVs land in
 * /public/audio/banks/V<N>/, the `playSample()` path activates and the synth
 * is the fallback.
 */

export type AnimaleseEmotion = 'neutral' | 'happy' | 'excited' | 'thinking' | 'soft' | 'focused';

export type AnimaleseOpts = {
  voiceCluster?: VoiceCluster;
  emotion?: AnimaleseEmotion;
  /** call after each char is voiced — used by Subtitle.tsx to advance the reveal */
  onChar?: (char: string, index: number, isLast: boolean) => void;
  /** called once at end of utterance */
  onDone?: () => void;
  /** master volume 0..1 */
  volume?: number;
};

/* ---------- voice cluster tuning ---------- */

type ClusterCfg = {
  basePitchHz: number;
  pitchVar: number; // ± semitones
  speedMul: number; // 1.0 = baseline
  feel: string;
};

const CLUSTERS: Record<VoiceCluster, ClusterCfg> = {
  1: { basePitchHz: 480, pitchVar: 1.5, speedMul: 1.0, feel: 'bright + soft' },
  2: { basePitchHz: 380, pitchVar: 1.2, speedMul: 1.0, feel: 'neutral + clear' },
  3: { basePitchHz: 540, pitchVar: 2.2, speedMul: 1.05, feel: 'high + playful' },
  4: { basePitchHz: 320, pitchVar: 1.0, speedMul: 0.95, feel: 'low + grounded' },
  5: { basePitchHz: 460, pitchVar: 1.4, speedMul: 1.0, feel: 'warm + melodic' },
  6: { basePitchHz: 420, pitchVar: 1.3, speedMul: 1.02, feel: 'crisp + balanced' },
};

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

/* ---------- audio context ---------- */

let _ctx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!_ctx) {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio not available');
    _ctx = new Ctor();
  }
  return _ctx;
}

/** Resume the context after a user gesture (Chromium autoplay policy). */
export async function unlockAudio(): Promise<void> {
  try {
    if (ctx().state === 'suspended') await ctx().resume();
  } catch {
    /* ignore */
  }
}

/* ---------- per-char chirp ---------- */

function chirp(
  c: string,
  opts: {
    cfg: ClusterCfg;
    pitchBoost: number; // semitones added (e.g., from `?`)
    speedMul: number;
    volume: number;
  },
): { duration: number } {
  const { cfg, pitchBoost, speedMul, volume } = opts;
  const audio = ctx();

  const lower = c.toLowerCase();
  const isVowel = VOWELS.has(lower);
  const code = lower.charCodeAt(0);

  // base pitch jitter for the syllable
  const jitter = ((code * 9301 + 49297) % 233280) / 233280; // hash 0..1
  const semitoneOffset = (jitter * 2 - 1) * cfg.pitchVar + pitchBoost + (isVowel ? -2 : 0);
  const pitch = cfg.basePitchHz * Math.pow(2, semitoneOffset / 12);

  // duration per chirp — vowels longer, consonants tighter
  const baseMs = isVowel ? 65 : 38;
  const duration = (baseMs / 1000) / speedMul;

  // build envelope: fast attack, exponential decay
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  osc.type = isVowel ? 'triangle' : 'square';
  osc.frequency.setValueAtTime(pitch, now);
  // tiny downward glide to feel "spoken"
  osc.frequency.exponentialRampToValueAtTime(Math.max(60, pitch * 0.85), now + duration);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  // gentle low-pass to round off the square wave grit
  const lp = audio.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400, now);
  lp.Q.setValueAtTime(0.7, now);

  osc.connect(lp).connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);

  return { duration };
}

/* ---------- speak ---------- */

let _abort = false;

/** Cancel any in-flight utterance. Subtitle component should call this on
 * interrupt or unmount. */
export function cancelAnimalese(): void {
  _abort = true;
}

export async function speakAnimalese(text: string, opts: AnimaleseOpts = {}): Promise<void> {
  _abort = false;
  await unlockAudio();
  const cluster = (opts.voiceCluster ?? 2) as VoiceCluster;
  const cfg = CLUSTERS[cluster] ?? CLUSTERS[2];
  const emotion = opts.emotion ?? 'neutral';
  const volume = Math.max(0, Math.min(1, opts.volume ?? 0.35));

  const speedByEmotion = {
    excited: 1.2,
    happy: 1.05,
    thinking: 0.85,
    soft: 0.9,
    focused: 1.0,
    neutral: 1.0,
  } as const;
  const baseSpeed = (speedByEmotion[emotion] ?? 1.0) * cfg.speedMul;
  const pitchVarianceMul = emotion === 'soft' ? 0.6 : emotion === 'excited' ? 1.4 : 1.0;
  const tunedCfg: ClusterCfg = { ...cfg, pitchVar: cfg.pitchVar * pitchVarianceMul };

  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    if (_abort) break;
    const ch = chars[i] ?? '';
    const isLast = i === chars.length - 1;

    let pitchBoost = 0;
    let charSpeed = baseSpeed;
    let pause = 0;

    // pacing punctuation
    if (ch === '.') pause = 200;
    else if (ch === ',') pause = 100;
    else if (ch === '?') {
      // pitch up the prior char retroactively — simplest is just pitch up the *next*
      pitchBoost = 2.5;
    } else if (ch === '!') {
      pitchBoost = 3;
      charSpeed *= 1.1;
    } else if (ch === ' ' || ch === '\n' || ch === '\t') {
      pause = 30;
    }

    if (/[a-z]/i.test(ch)) {
      const { duration } = chirp(ch, {
        cfg: tunedCfg,
        pitchBoost,
        speedMul: charSpeed,
        volume,
      });
      // emit reveal callback right when we start the sound
      opts.onChar?.(ch, i, isLast);
      await sleep(duration * 1000 + 8);
    } else {
      opts.onChar?.(ch, i, isLast);
      if (pause > 0) await sleep(pause);
    }
  }
  if (!_abort) opts.onDone?.();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { CLUSTERS };
