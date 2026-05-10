/**
 * RevealOverlay — the 8-hit dopamine cascade. Ported from web/app/reveal/page.tsx.
 *
 * Differences from web version:
 *   - fetch('/api/embed')              → window.angel.embed(picks)
 *   - fetch('/api/synthesize-personality') SSE → window.angel.synthesize(args, onToken)
 *   - fetch('/api/naming-response')    → window.angel.namingResponse(args)
 *   - fetch('/api/claim') + redirect   → window.angel.completeOnboarding(persona) → onComplete()
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useSwipeStore } from '@/stores/swipe';
import { playAnimalese } from '@/lib/animalese';
import { SparkleField } from './SparkleField';
import {
  PALETTE_BY_AESTHETIC,
  VRM_BY_AESTHETIC,
  type AestheticArchetype,
  type ClaimTokenPayload,
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

interface RevealOverlayProps {
  onComplete: () => void;
}

export function RevealOverlay({ onComplete }: RevealOverlayProps) {
  const { history, yesPicks, archetype } = useSwipeStore();
  const [embed, setEmbed] = useState<EmbedResp | null>(null);
  const [phase, setPhase] = useState<Phase>('snap');
  const [personality, setPersonality] = useState('');
  const [typedName, setTypedName] = useState('');
  const [namingResp, setNamingResp] = useState('');
  const [fading, setFading] = useState(false);
  const advanced = useRef<Set<Phase>>(new Set());

  // Step 1: hit window.angel.embed on mount
  useEffect(() => {
    if (yesPicks.length === 0 || history.length === 0) {
      // no picks — bail directly to room (or back to onboarding via parent)
      onComplete();
      return;
    }
    const picks = history.map((h) => ({
      vroid_id: h.cardId,
      decision: h.decision,
      round: h.round,
    }));

    void (async () => {
      try {
        const data = await window.angel.embed({ picks });
        setEmbed(data);
        startSynthesis(data).catch(() => {});
      } catch {
        // fallback to local archetype
        const hero = yesPicks[0];
        const fallbackArch: AestheticArchetype = archetype ?? 'A1';
        const fallbackVoice: VoiceConfig = {
          base_cluster: 1,
          pitch_variance: 0.15,
          speed: 1,
          syllable_count: 6,
          pause_density: 0.4,
          attack: 0.5,
          decay: 0.5,
          glissando: 0.5,
          vowel_bias: 'mixed',
          breathiness: 0.3,
        };
        setEmbed({
          archetype: fallbackArch,
          vrmUrl: VRM_BY_AESTHETIC[fallbackArch],
          paletteHex: PALETTE_BY_AESTHETIC[fallbackArch],
          numericTraits: { warmth: 5, energy: 5, edge: 5, sophistication: 5, playfulness: 5 },
          voiceConfig: fallbackVoice,
          traits: { aesthetic: fallbackArch, disposition: 'B1', style: 'C1', voice_cluster: 1 },
          dialogueSamples: hero?.tags.dialogue_samples ?? ['…oh. it&rsquo;s you.', 'you eating?'],
          heroCard: hero
            ? {
                id: hero.id,
                name: hero.name,
                thumbnailUrl: `/library/_portraits/${hero.id}.jpg`,
                vibePhrase: hero.tags.vibe_phrase,
                personalityBlurb: hero.tags.personality_blurb,
                energyDescriptor: hero.tags.energy_descriptor,
                dialogueSamples: hero.tags.dialogue_samples,
                voiceConfig: fallbackVoice,
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
                voiceConfig: fallbackVoice,
                palette: ['#ddd', '#888', '#555'],
                aesthetic: 'cottagecore',
                hairColor: 'brown',
              },
          yesIds: yesPicks.map((p) => p.id),
        });
      }
    })();
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
      ['naming-input', 8500],
    ];
    const timers = timeline.map(([p, ms]) =>
      setTimeout(() => {
        if (advanced.current.has(p)) return;
        advanced.current.add(p);
        setPhase(p);
        if (p === 'voice') {
          try {
            playAnimalese(embed.heroCard.voiceConfig, 1.1);
          } catch {}
        }
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [embed]);

  async function startSynthesis(data: EmbedResp) {
    await window.angel.synthesize(
      {
        numericTraits: data.numericTraits,
        traits: data.traits,
        archetype: data.archetype,
        dialogueSamples: data.dialogueSamples,
      },
      (token: string) => {
        setPersonality((p) => p + token);
      },
    );
  }

  async function handleNameSubmit() {
    if (!typedName.trim() || !embed) return;
    setPhase('naming-response');
    try {
      const resp = await window.angel.namingResponse({
        typedName,
        personalityMd: personality,
        dialogueSamples: embed.dialogueSamples,
      });
      setNamingResp(resp.response);
      try {
        playAnimalese(embed.heroCard.voiceConfig, 1.4);
      } catch {}

      // build the persona payload (claim-shape) and apply it to the angel store
      const now = Math.floor(Date.now() / 1000);
      const persona: ClaimTokenPayload = {
        userId: crypto.randomUUID(),
        vrmId: embed.archetype,
        paletteHex: embed.paletteHex,
        name: typedName.trim().slice(0, 32) || 'angel',
        traits: embed.traits,
        iat: now,
        exp: now + 300,
        numericTraits: embed.numericTraits,
        voiceConfig: embed.voiceConfig,
        personalityMd: personality,
      };
      await window.angel.completeOnboarding(persona);

      setTimeout(() => setPhase('download'), 2200);
    } catch {
      setNamingResp(`${typedName}. okay. i'll be that.`);
      setTimeout(() => setPhase('download'), 1800);
    }
  }

  function handleLetHerIn() {
    setFading(true);
    // .7s fade then unmount → App.tsx flips into <Room>
    setTimeout(() => onComplete(), 700);
  }

  if (!embed) {
    return (
      <main className="onboarding-root min-h-screen kawaii-bg flex items-center justify-center relative overflow-hidden">
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

  const heroPortrait = embed.heroCard.thumbnailUrl;
  const slug = embed.vrmUrl.split('/').pop()!.replace('.vrm', '');
  const archetypePortrait = `/vrm-portraits/${slug}.png`;

  const firstLine =
    embed.heroCard.dialogueSamples?.[0]?.toLowerCase() ?? '…oh. it&rsquo;s you.';
  const displayName = embed.heroCard.vibePhrase;
  const narrative =
    embed.heroCard.personalityBlurb?.split(/[.!?]/)[0]?.trim().toLowerCase() ??
    NARRATIVE_BY_ARCHETYPE[embed.archetype];

  return (
    <main
      className={`onboarding-root min-h-screen kawaii-bg text-ink-near overflow-hidden relative ${
        fading ? 'onboarding-fade-out' : ''
      }`}
    >
      <SparkleField variant="ambient" density={18} />

      {visible('gravity') && !visible('fidelity') && (
        <SparkleField variant="burst" density={32} className="z-20" />
      )}

      {visible('fidelity') && phase !== 'download' && (
        <SparkleField variant="shower" density={14} className="z-[5]" />
      )}

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
                x: Math.cos((['A1', 'A2', 'A3', 'A4'].indexOf(embed.archetype) * Math.PI) / 2 + Math.PI / 4) * 180,
                y: Math.sin((['A1', 'A2', 'A3', 'A4'].indexOf(embed.archetype) * Math.PI) / 2 + Math.PI / 4) * 180,
                scale: 1,
                opacity: 1,
              }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

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

      <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 px-8 pointer-events-none">
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
                {personality.slice(0, 480) || <span className="opacity-50">…</span>}
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
            <motion.button
              type="button"
              onClick={handleLetHerIn}
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
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
