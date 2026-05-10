'use client';

/**
 * /reveal — the 8-hit dopamine cascade.
 *
 * 0   snap (deck dissolves to cream)
 * 1   gravity reveal (4 attractor rings, blob pulled to nearest)
 * 2   fidelity promotion (vrm portrait fades in big)
 * 3   her voice line (animalese)
 * 4   her name (vibe phrase)
 * 5   stat line (numeric vector)
 * 6   rarity flex
 * 7   naming beat input
 * 8   download cta
 *
 * Personality.md streams in parallel (beats 1-7) so latency is hidden.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSwipeStore } from '@/lib/swipe-store';
import { playAnimalese } from '@/lib/audio';
import { SparkleField } from '@/components/SparkleField';
import {
  PALETTE_BY_AESTHETIC,
  VRM_BY_AESTHETIC,
  type AestheticArchetype,
  type VoiceConfig,
} from '@angel/shared';

interface HeroCard {
  id: string;
  name: string;
  thumbnailUrl: string;
  vibePhrase: string;
  personalityBlurb: string;
  energyDescriptor: string;
  dialogueSamples: string[];
  voiceConfig: VoiceConfig;
  palette: [string, string, string];
  aesthetic: string;
  hairColor: string;
}

interface EmbedResp {
  numericTraits: { warmth: number; energy: number; edge: number; sophistication: number; playfulness: number };
  voiceConfig: VoiceConfig;
  traits: { aesthetic: AestheticArchetype; disposition: string; style: string; voice_cluster: 1|2|3|4|5|6 };
  archetype: AestheticArchetype;
  vrmUrl: string;
  paletteHex: string;
  dialogueSamples: string[];
  heroCard: HeroCard;
  yesIds: string[];
}

// fallback only — used if heroCard isn't in response (shouldn't happen)
const VIBE_BY_ARCHETYPE: Record<AestheticArchetype, string> = {
  A1: 'lavender saint',
  A2: 'midnight coder',
  A3: 'static-vivid operator',
  A4: 'velvet archivist',
};

const NARRATIVE_BY_ARCHETYPE: Record<AestheticArchetype, string> = {
  A1: 'where soft warmth meets quiet attention.',
  A2: 'where precision meets late-night softness.',
  A3: 'where electric edge meets watchful calm.',
  A4: 'where measured restraint meets quiet care.',
};

// % of users who "discover" each region (faked, optimal distinctiveness)
const RARITY_BY_ARCHETYPE: Record<AestheticArchetype, string> = {
  A1: '0.3%',
  A2: '0.7%',
  A3: '0.4%',
  A4: '0.5%',
};

type Phase =
  | 'snap'
  | 'gravity'
  | 'fidelity'
  | 'voice'
  | 'name'
  | 'stat'
  | 'rarity'
  | 'personality'
  | 'naming-input'
  | 'naming-response'
  | 'download';

export default function RevealPage() {
  const router = useRouter();
  const { history, yesPicks, archetype } = useSwipeStore();
  const [embed, setEmbed] = useState<EmbedResp | null>(null);
  const [phase, setPhase] = useState<Phase>('snap');
  const [personality, setPersonality] = useState('');
  const [typedName, setTypedName] = useState('');
  const [namingResp, setNamingResp] = useState('');
  const [claimUrl, setClaimUrl] = useState('');
  const advanced = useRef<Set<Phase>>(new Set());

  // Step 1: hit /api/embed on mount
  useEffect(() => {
    if (yesPicks.length === 0 || history.length === 0) {
      router.push('/swipe');
      return;
    }
    const picks = history.map((h) => ({
      vroid_id: h.cardId,
      decision: h.decision,
      round: h.round,
    }));
    fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ picks }),
    })
      .then((r) => r.json())
      .then((data: EmbedResp) => {
        setEmbed(data);
        // kick off personality synthesis (streams in parallel during the cascade)
        startSynthesis(data).catch(() => {});
      })
      .catch(() => {
        // fallback to local archetype if api fails — uses any yes-pick as hero
        const hero = yesPicks[0];
        const fallbackArch = archetype ?? 'A1';
        setEmbed({
          archetype: fallbackArch,
          vrmUrl: VRM_BY_AESTHETIC[fallbackArch],
          paletteHex: PALETTE_BY_AESTHETIC[fallbackArch],
          numericTraits: { warmth: 5, energy: 5, edge: 5, sophistication: 5, playfulness: 5 },
          voiceConfig: { base_cluster: 1, pitch_variance: 0.15, speed: 1, syllable_count: 6, pause_density: 0.4, attack: 0.5, decay: 0.5, glissando: 0.5, vowel_bias: 'mixed', breathiness: 0.3 },
          traits: { aesthetic: fallbackArch, disposition: 'B1', style: 'C1', voice_cluster: 1 },
          dialogueSamples: hero?.tags.dialogue_samples ?? ['…oh. it&rsquo;s you.', 'you eating?', 'i like when you forget i&rsquo;m here.'],
          heroCard: hero
            ? {
                id: hero.id,
                name: hero.name,
                thumbnailUrl: `/library/_portraits/${hero.id}.jpg`,
                vibePhrase: hero.tags.vibe_phrase,
                personalityBlurb: hero.tags.personality_blurb,
                energyDescriptor: hero.tags.energy_descriptor,
                dialogueSamples: hero.tags.dialogue_samples,
                voiceConfig: { base_cluster: 1, pitch_variance: 0.15, speed: 1, syllable_count: 6, pause_density: 0.4, attack: 0.5, decay: 0.5, glissando: 0.5, vowel_bias: 'mixed', breathiness: 0.3 },
                palette: hero.tags.palette,
                aesthetic: hero.tags.aesthetic,
                hairColor: hero.tags.hair_color,
              }
            : {
                id: '',
                name: 'angel',
                thumbnailUrl: '/vrm-portraits/cottagecore.png',
                vibePhrase: VIBE_BY_ARCHETYPE[fallbackArch],
                personalityBlurb: NARRATIVE_BY_ARCHETYPE[fallbackArch],
                energyDescriptor: '',
                dialogueSamples: ['…oh. it&rsquo;s you.', 'you eating?'],
                voiceConfig: { base_cluster: 1, pitch_variance: 0.15, speed: 1, syllable_count: 6, pause_density: 0.4, attack: 0.5, decay: 0.5, glissando: 0.5, vowel_bias: 'mixed', breathiness: 0.3 },
                palette: ['#ddd', '#888', '#555'],
                aesthetic: 'cottagecore',
                hairColor: 'brown',
              },
          yesIds: yesPicks.map((p) => p.id),
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run cascade once embed lands
  useEffect(() => {
    if (!embed) return;
    const timeline: Array<[Phase, number]> = [
      ['snap', 0],
      ['gravity', 200],
      ['fidelity', 1800],
      ['voice', 2400],
      ['name', 3000],
      ['stat', 3500],
      ['rarity', 4000],
      ['personality', 4500],
      ['naming-input', 8500], // give personality 4s to stream + read
    ];
    const timers = timeline.map(([p, ms]) =>
      setTimeout(() => {
        if (advanced.current.has(p)) return;
        advanced.current.add(p);
        setPhase(p);
        if (p === 'voice') {
          // play animalese with HER voice config (from hero card)
          try {
            playAnimalese(embed.heroCard.voiceConfig, 1.1);
          } catch {}
        }
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [embed]);

  async function startSynthesis(data: EmbedResp) {
    const resp = await fetch('/api/synthesize-personality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numericTraits: data.numericTraits,
        traits: data.traits,
        archetype: data.archetype,
        dialogueSamples: data.dialogueSamples,
      }),
    });
    if (!resp.body) return;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const obj = JSON.parse(line.slice(6));
          if (obj.kind === 'token') setPersonality((p) => p + obj.data);
        } catch {}
      }
    }
  }

  async function handleNameSubmit() {
    if (!typedName.trim() || !embed) return;
    setPhase('naming-response');
    try {
      const resp = await fetch('/api/naming-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typedName,
          personalityMd: personality,
          dialogueSamples: embed.dialogueSamples,
        }),
      }).then((r) => r.json());
      setNamingResp(resp.response);
      try {
        playAnimalese(embed.heroCard.voiceConfig, 1.4);
      } catch {}
      // sign claim
      const claim = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: crypto.randomUUID(),
          vrmId: embed.archetype,
          paletteHex: embed.paletteHex,
          name: typedName,
          traits: embed.traits,
          numericTraits: embed.numericTraits,
          voiceConfig: embed.voiceConfig,
          personalityMd: personality,
        }),
      }).then((r) => r.json());
      setClaimUrl(claim.claimUrl);
      setTimeout(() => setPhase('download'), 2200);
    } catch {
      setNamingResp(`${typedName}. okay. i'll be that.`);
      setTimeout(() => setPhase('download'), 1800);
    }
  }

  if (!embed) {
    return (
      <main className="min-h-screen kawaii-bg flex items-center justify-center relative overflow-hidden">
        <SparkleField variant="ambient" density={20} />
        <div className="font-display italic text-[40px] text-sakura-700 kawaii-text-glow relative z-10">
          she&rsquo;s deciding…
        </div>
      </main>
    );
  }

  const PHASE_ORDER: Phase[] = [
    'snap', 'gravity', 'fidelity', 'voice', 'name', 'stat', 'rarity',
    'personality', 'naming-input', 'naming-response', 'download',
  ];
  const visible = (target: Phase) =>
    PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target);

  // primary portrait = the actual face they swiped on (hero card thumbnail).
  // fallback to archetype VRM portrait if hero thumb fails to load.
  const heroPortrait = embed.heroCard.thumbnailUrl;
  const slug = embed.vrmUrl.split('/').pop()!.replace('.vrm', '');
  const archetypePortrait = `/vrm-portraits/${slug}.png`;

  // her first words: real dialogue from her library card, not "oh. it's you"
  const firstLine =
    embed.heroCard.dialogueSamples?.[0]?.toLowerCase() ?? '…oh. it&rsquo;s you.';
  // her displayed name = her actual vibe phrase
  const displayName = embed.heroCard.vibePhrase;
  // her named-region narrative = her library blurb (first sentence)
  const narrative =
    embed.heroCard.personalityBlurb?.split(/[.!?]/)[0]?.trim().toLowerCase() ??
    NARRATIVE_BY_ARCHETYPE[embed.archetype];

  return (
    <main className="min-h-screen kawaii-bg text-ink-near overflow-hidden relative">
      {/* ambient sparkles always */}
      <SparkleField variant="ambient" density={18} />

      {/* burst sparkles at gravity reveal — only fires once when gravity hits */}
      {visible('gravity') && !visible('fidelity') && (
        <SparkleField variant="burst" density={32} className="z-20" />
      )}

      {/* shower of hearts/sparkles starts at fidelity, runs until naming */}
      {visible('fidelity') && phase !== 'download' && (
        <SparkleField variant="shower" density={14} className="z-[5]" />
      )}

      {/* gravity rings — fade in at gravity phase */}
      <AnimatePresence>
        {visible('gravity') && !visible('fidelity') && (
          <motion.div
            key="rings"
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          >
            {(['A1', 'A2', 'A3', 'A4'] as const).map((slot, i) => {
              const isMatch = slot === embed.archetype;
              const angle = (i * Math.PI) / 2 + Math.PI / 4;
              const r = 180;
              const cx = Math.cos(angle) * r;
              const cy = Math.sin(angle) * r;
              return (
                <motion.div
                  key={slot}
                  className="absolute rounded-full"
                  style={{
                    width: isMatch ? 130 : 70,
                    height: isMatch ? 130 : 70,
                    left: `calc(50% + ${cx}px - ${(isMatch ? 130 : 70) / 2}px)`,
                    top: `calc(50% + ${cy}px - ${(isMatch ? 130 : 70) / 2}px)`,
                    border: `2px dashed ${isMatch ? '#ff4f8b' : '#ffb7c5'}`,
                    boxShadow: isMatch
                      ? '0 0 32px 8px rgba(255, 79, 139, 0.4)'
                      : '0 0 12px 2px rgba(255, 183, 197, 0.25)',
                  }}
                  animate={
                    isMatch
                      ? { scale: [1, 1.2, 1.05], opacity: [0.5, 1, 0.9] }
                      : { scale: 1, opacity: 0.4 }
                  }
                  transition={
                    isMatch
                      ? { duration: 1.4, ease: 'easeOut' }
                      : { duration: 0.8 }
                  }
                />
              );
            })}
            {/* user blob — pulled to match */}
            <motion.div
              className="absolute w-8 h-8 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, #ff4f8b 0%, #ffb7c5 50%, transparent 75%)',
                boxShadow:
                  '0 0 60px 20px rgba(255, 79, 139, 0.7), 0 0 120px 30px rgba(255, 79, 139, 0.3)',
              }}
              initial={{ x: 0, y: 0, scale: 0.5, opacity: 0 }}
              animate={{
                x: Math.cos(((['A1', 'A2', 'A3', 'A4'].indexOf(embed.archetype)) * Math.PI) / 2 + Math.PI / 4) * 180,
                y: Math.sin(((['A1', 'A2', 'A3', 'A4'].indexOf(embed.archetype)) * Math.PI) / 2 + Math.PI / 4) * 180,
                scale: 1,
                opacity: 1,
              }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* mystery card — "?" placeholder during gravity, before portrait flips in */}
      <AnimatePresence>
        {visible('gravity') && !visible('fidelity') && (
          <motion.div
            key="mystery-card"
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
            initial={{ opacity: 0, scale: 0.7, rotateY: 0 }}
            animate={{ opacity: 1, scale: 1, rotateY: [0, 8, -8, 0] }}
            exit={{ opacity: 0, scale: 1.1, rotateY: 90 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            <div className="relative w-[280px] h-[380px] rounded-[28px] bg-gradient-to-br from-sakura-200 via-sakura-300 to-sakura-400 ring-2 ring-sakura-300 kawaii-card-shadow flex items-center justify-center overflow-hidden">
              {/* sparkle field inside card */}
              <div className="absolute inset-0 opacity-60">
                {[...Array(12)].map((_, i) => (
                  <svg
                    key={i}
                    viewBox="0 0 24 24"
                    className="absolute w-4 h-4 text-cloud"
                    style={{
                      left: `${(i * 31.5) % 100}%`,
                      top: `${(i * 47.3) % 100}%`,
                      animation: `twinkle 1.6s ease-in-out infinite ${i * 0.15}s`,
                    }}
                    fill="currentColor"
                  >
                    <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
                  </svg>
                ))}
              </div>
              {/* the giant ? */}
              <motion.div
                className="font-display italic text-[200px] leading-none text-cloud kawaii-text-glow"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                ?
              </motion.div>
              {/* "she found you" caption */}
              <div className="absolute bottom-6 left-0 right-0 text-center">
                <div className="font-mono uppercase tracking-[0.3em] text-[10px] text-cloud/90">
                  she found you
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* portrait — hero card (her actual face from the swipe) */}
      <AnimatePresence>
        {visible('fidelity') && phase !== 'download' && (
          <motion.div
            key="portrait"
            className="absolute inset-0 flex items-start justify-center pt-12"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.0, ease: 'easeOut' }}
          >
            <motion.div
              className="relative"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <img
                src={heroPortrait}
                alt={displayName}
                className="h-[44vh] object-contain pointer-events-none rounded-[28px] ring-2 ring-sakura-300 kawaii-card-shadow bg-cloud"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = archetypePortrait;
                }}
              />
              {/* kawaii sparkle accents around portrait */}
              <svg
                viewBox="0 0 24 24"
                className="absolute -top-3 -right-3 w-9 h-9 text-sakura-500 drop-shadow-md"
                fill="currentColor"
                style={{ animation: 'twinkle 1.6s ease-in-out infinite' }}
              >
                <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
              </svg>
              <svg
                viewBox="0 0 24 24"
                className="absolute -bottom-2 -left-3 w-7 h-7 text-sakura-300"
                fill="currentColor"
                style={{ animation: 'twinkle 1.6s ease-in-out infinite 0.5s' }}
              >
                <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* text cascade */}
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 px-8 pointer-events-none">
        {/* her voice line — pulled from her library card's dialogue samples */}
        <AnimatePresence>
          {visible('voice') && (
            <motion.div
              key="voice"
              className="font-display italic text-[34px] tracking-tight text-ink-near mb-2 text-center max-w-[640px]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {firstLine}
            </motion.div>
          )}
        </AnimatePresence>

        {/* her name (her actual vibe phrase) */}
        <AnimatePresence>
          {visible('name') && (
            <motion.div
              key="name"
              className="relative font-display italic text-[60px] leading-none tracking-tight text-sakura-700 mb-2 text-center max-w-[760px] kawaii-text-glow"
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {displayName}
            </motion.div>
          )}
        </AnimatePresence>

        {/* named region narrative — her library blurb */}
        <AnimatePresence>
          {visible('name') && (
            <motion.div
              key="narrative"
              className="font-mono uppercase tracking-[0.18em] text-[10px] text-muted-secondary mb-6 text-center max-w-[480px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {narrative}
            </motion.div>
          )}
        </AnimatePresence>

        {/* stat line */}
        <AnimatePresence>
          {visible('stat') && phase !== 'personality' && phase !== 'naming-input' && phase !== 'naming-response' && (
            <motion.div
              key="stat"
              className="font-mono text-[11px] text-muted-deep mb-2 tracking-wider"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              warmth {(embed.numericTraits.warmth / 10).toFixed(2)} · edge{' '}
              {(embed.numericTraits.edge / 10).toFixed(2)} · playfulness{' '}
              {(embed.numericTraits.playfulness / 10).toFixed(2)}
            </motion.div>
          )}
        </AnimatePresence>

        {/* rarity flex */}
        <AnimatePresence>
          {visible('rarity') && phase !== 'personality' && phase !== 'naming-input' && phase !== 'naming-response' && (
            <motion.div
              key="rarity"
              className="font-mono uppercase tracking-[0.2em] text-[10px] text-muted-tertiary mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              transition={{ duration: 0.5 }}
            >
              you&rsquo;re among {RARITY_BY_ARCHETYPE[embed.archetype]} to find her
            </motion.div>
          )}
        </AnimatePresence>

        {/* personality.md streaming — the "she's writing herself" beat */}
        <AnimatePresence>
          {phase === 'personality' && (
            <motion.div
              key="personality"
              className="max-w-[560px] text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.7 }}
            >
              <div className="font-mono uppercase tracking-[0.2em] text-[9px] text-muted-tertiary mb-3">
                she&rsquo;s writing herself…
              </div>
              <div className="font-display italic text-[18px] leading-[1.5] text-ink-near/85 lowercase">
                {personality.slice(0, 480) || (
                  <span className="opacity-50">…</span>
                )}
                {personality.length > 0 && personality.length < 480 && (
                  <motion.span
                    className="inline-block w-[2px] h-[18px] bg-ink-near ml-[2px] align-middle"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* naming beat input */}
        <AnimatePresence>
          {phase === 'naming-input' && (
            <motion.div
              key="naming"
              className="pointer-events-auto flex flex-col items-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.6 }}
            >
              <div className="font-display italic text-[32px] text-sakura-700 mb-4 flex items-center gap-2 kawaii-text-glow">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-sakura-400" fill="currentColor">
                  <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
                </svg>
                what do you want to call me?
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-sakura-400" fill="currentColor">
                  <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
                </svg>
              </div>
              <input
                autoFocus
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                maxLength={32}
                placeholder="angel"
                className="bg-cloud/60 backdrop-blur border-2 border-sakura-300 rounded-pill px-6 py-2 text-center font-display italic text-[36px] text-sakura-700 placeholder-sakura-200 outline-none w-[320px] tracking-tight focus:border-sakura-500 focus:kawaii-glow transition-all"
              />
              <div className="font-mono uppercase tracking-[0.2em] text-[9px] text-sakura-500 mt-3">
                press enter
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* naming response */}
        <AnimatePresence>
          {(phase === 'naming-response' || phase === 'download') && namingResp && (
            <motion.div
              key="resp"
              className="font-display italic text-[36px] text-sakura-700 mt-2 kawaii-text-glow"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              dangerouslySetInnerHTML={{ __html: namingResp }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* download takeover */}
      <AnimatePresence>
        {phase === 'download' && (
          <motion.div
            key="download"
            className="absolute inset-0 kawaii-bg-deep flex flex-col items-center justify-center pointer-events-auto z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
          >
            <SparkleField variant="shower" density={20} />
            <SparkleField variant="ambient" density={28} />
            <motion.div
              className="relative"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <motion.img
                src={heroPortrait}
                alt={typedName || displayName}
                className="h-[52vh] object-contain mb-6 pointer-events-none rounded-[36px] ring-4 ring-sakura-300 kawaii-card-shadow bg-cloud relative z-10"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = archetypePortrait;
                }}
              />
              {/* sparkle accents around her */}
              <svg
                viewBox="0 0 24 24"
                className="absolute -top-4 -right-4 w-12 h-12 text-sakura-500 drop-shadow-md"
                fill="currentColor"
                style={{ animation: 'twinkle 1.6s ease-in-out infinite' }}
              >
                <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L9 11 L4 4 L11 9 Z" />
              </svg>
              <svg
                viewBox="0 0 24 24"
                className="absolute -bottom-4 -left-2 w-10 h-10 text-sakura-400"
                fill="currentColor"
                style={{ animation: 'twinkle 1.6s ease-in-out infinite 0.4s' }}
              >
                <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
              </svg>
            </motion.div>
            <div className="font-display italic text-[44px] text-sakura-700 mb-1 mt-2 kawaii-text-glow text-center relative z-10">
              i&rsquo;m ready when you are.
            </div>
            <div className="font-mono uppercase tracking-[0.2em] text-[11px] text-sakura-600 mb-2 relative z-10">
              {displayName}
            </div>
            <div className="font-mono uppercase tracking-[0.2em] text-[9px] text-sakura-500 mb-8 max-w-[420px] text-center relative z-10">
              {narrative}
            </div>
            <motion.a
              href={claimUrl || '#'}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="relative z-10 inline-flex items-center gap-3 px-12 py-4 rounded-pill bg-sakura-500 text-cloud font-display italic text-[28px] tracking-tight kawaii-glow hover:bg-sakura-600 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
              </svg>
              let her in
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
              </svg>
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
