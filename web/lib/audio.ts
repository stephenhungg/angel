'use client';

/**
 * audio.ts — web audio api helpers for swipe sound design.
 *
 * 1. playChime(entry): 0.3s ding on swipe right, pitch matched to her voice cluster
 * 2. playVoiceTease(entry): 0.5s of generated animalese on hover, params from her vector
 *
 * No external samples, no API calls. Pure synthesis.
 */

import type { LibraryEntry, VoiceConfig } from '@angel/shared';
import { voiceConfigFromEntry } from './voice-config';

let _ctx: AudioContext | null = null;
let _lastTeaseAt = 0; // throttle hover teases

function ctx(): AudioContext {
  if (typeof window === 'undefined') throw new Error('audio in ssr');
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

const CLUSTER_BASE_PITCH: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 1.15, // bright, soft
  2: 1.0, // neutral, clear
  3: 1.25, // high, playful
  4: 0.9, // low, grounded
  5: 1.1, // warm, melodic
  6: 1.05, // crisp, balanced
};

/* ----- chime (swipe right reward) ----- */

export function playChime(entry: LibraryEntry) {
  if (typeof window === 'undefined') return;
  try {
    const a = ctx();
    const cluster = entry.tags.suggested_voice_cluster;
    const basePitch = CLUSTER_BASE_PITCH[cluster] ?? 1.0;
    const root = 660 * basePitch; // E5 base
    const partials = [1, 1.5, 2.25]; // perfect-fifth + octave stack
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

/* ----- voice tease (hover preview) ----- */

const VOWEL_FREQ_MULT: Record<VoiceConfig['vowel_bias'], number[]> = {
  a: [1.0, 1.06, 1.12, 1.04, 0.98],
  i: [1.18, 1.22, 1.16, 1.2, 1.14],
  u: [0.85, 0.78, 0.82, 0.76, 0.8],
  e: [1.08, 1.04, 1.1, 1.06, 1.02],
  o: [0.92, 0.88, 0.95, 0.9, 0.86],
  mixed: [1.0, 1.12, 0.92, 1.06, 0.96],
};

export function playVoiceTease(entry: LibraryEntry) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - _lastTeaseAt < 600) return; // throttle
  _lastTeaseAt = now;

  try {
    playAnimalese(voiceConfigFromEntry(entry), 0.45);
  } catch {
    /* ignore */
  }
}

/**
 * Generate ~`maxSec` seconds of animalese using a VoiceConfig.
 * Used by hover tease + reveal screen.
 */
export function playAnimalese(config: VoiceConfig, maxSec: number) {
  if (typeof window === 'undefined') return;
  const a = ctx();
  const t0 = a.currentTime;
  const baseFreq = 440 * (CLUSTER_BASE_PITCH[config.base_cluster] ?? 1);
  const sylDur = 0.07 / config.speed;
  const pauseDur = sylDur * (0.4 + config.pause_density * 1.2);
  const totalSyl = Math.min(config.syllable_count, Math.floor(maxSec / (sylDur + pauseDur)) || 3);
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

    // simple FM carrier-mod synth syllable
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
