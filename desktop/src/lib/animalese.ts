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

/* ------------------------------------------------------------------ */
/* swipe/reveal audio — ported from web/lib/audio.ts                   */
/* additive: existing speakAnimalese path is unchanged. these are the  */
/* short-form synth helpers used by the swipe deck (chime, hover tease)*/
/* and by the reveal cascade (voice line, naming response).            */
/* ------------------------------------------------------------------ */

import type { LibraryEntry, VoiceConfig } from '@angel/shared';
import { voiceConfigFromEntry } from './voice-config';

let _lastTeaseAt = 0;

const CLUSTER_BASE_PITCH: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 1.15, // bright, soft
  2: 1.0, // neutral, clear
  3: 1.25, // high, playful
  4: 0.9, // low, grounded
  5: 1.1, // warm, melodic
  6: 1.05, // crisp, balanced
};

/** 0.3s reward chime on swipe-right, pitch-matched to her voice cluster. */
export function playChime(entry: LibraryEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const a = ctx();
    const cluster = entry.tags.suggested_voice_cluster;
    const basePitch = CLUSTER_BASE_PITCH[cluster] ?? 1.0;
    const root = 660 * basePitch;
    const partials = [1, 1.5, 2.25];
    const dur = 0.32;
    const t0 = a.currentTime;
    const master = a.createGain();
    master.gain.value = 0;
    master.connect(a.destination);
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    for (const p of partials) {
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.value = root * p;
      const g = a.createGain();
      g.gain.value = 1 / partials.length;
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
  } catch {
    /* ignore */
  }
}

const VOWEL_FREQ_MULT: Record<VoiceConfig['vowel_bias'], number[]> = {
  a: [1.0, 1.06, 1.12, 1.04, 0.98],
  i: [1.18, 1.22, 1.16, 1.2, 1.14],
  u: [0.85, 0.78, 0.82, 0.76, 0.8],
  e: [1.08, 1.04, 1.1, 1.06, 1.02],
  o: [0.92, 0.88, 0.95, 0.9, 0.86],
  mixed: [1.0, 1.12, 0.92, 1.06, 0.96],
};

/** Hover-preview voice tease (0.5s of generated animalese, throttled). */
export function playVoiceTease(entry: LibraryEntry): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - _lastTeaseAt < 600) return;
  _lastTeaseAt = now;
  try {
    playAnimalese(voiceConfigFromEntry(entry), 0.45);
  } catch {
    /* ignore */
  }
}

/**
 * Generate ~`maxSec` seconds of animalese using a VoiceConfig.
 * Used by hover tease + reveal screen voice line + naming response.
 *
 * Note: This is a config-driven synth (FM carrier/modulator). Distinct from
 * `speakAnimalese()` above, which is the per-character chirp synth used
 * by Subtitle.tsx for ongoing dialogue.
 */
export function playAnimalese(config: VoiceConfig, maxSec: number): void {
  if (typeof window === 'undefined') return;
  const a = ctx();
  if (a.state === 'suspended') void a.resume();
  const t0 = a.currentTime;
  const baseFreq = 440 * (CLUSTER_BASE_PITCH[config.base_cluster] ?? 1);
  const sylDur = 0.07 / Math.max(0.01, config.speed);
  const pauseDur = sylDur * (0.4 + config.pause_density * 1.2);
  const totalSyl = Math.min(
    config.syllable_count,
    Math.floor(maxSec / (sylDur + pauseDur)) || 3,
  );
  const vowelMults = VOWEL_FREQ_MULT[config.vowel_bias];

  const master = a.createGain();
  master.gain.value = 0.16;
  master.connect(a.destination);

  let cursor = t0;
  for (let i = 0; i < totalSyl; i++) {
    const variance = (Math.random() - 0.5) * config.pitch_variance * 2;
    const f0 = baseFreq * (1 + variance);
    const vmult = vowelMults[i % vowelMults.length] ?? 1;
    const f1 = f0 * vmult;
    const f2 = f1 * (1 + (Math.random() - 0.5) * config.glissando * 0.4);

    const carrier = a.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(f1, cursor);
    carrier.frequency.linearRampToValueAtTime(f2, cursor + sylDur);

    const mod = a.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f1 * 2;
    const modGain = a.createGain();
    modGain.gain.value = config.breathiness * 80;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const env = a.createGain();
    env.gain.setValueAtTime(0, cursor);
    const attackTime = sylDur * (1 - config.attack) * 0.5 + 0.005;
    const decayTime = sylDur * config.decay * 0.7 + 0.01;
    env.gain.linearRampToValueAtTime(0.85, cursor + attackTime);
    env.gain.exponentialRampToValueAtTime(0.001, cursor + attackTime + decayTime);

    carrier.connect(env);
    env.connect(master);

    carrier.start(cursor);
    carrier.stop(cursor + sylDur + 0.05);
    mod.start(cursor);
    mod.stop(cursor + sylDur + 0.05);

    cursor += sylDur + pauseDur;
  }
}
