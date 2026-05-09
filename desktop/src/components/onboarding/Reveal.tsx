/**
 * Reveal — the 8-hit dopamine cascade after the swipe completes.
 *
 *  0  snap            (deck dissolves to gradient)
 *  1  gravity         (4 archetype rings, blob pulled to nearest)
 *  2  fidelity        (hero portrait fades in big)
 *  3  voice           (animalese in HER voice config)
 *  4  name            (her vibe phrase as title)
 *  5  stat            (numeric trait readout)
 *  6  rarity          ("you're among 0.X% to find her")
 *  7  personality     (her personality.md typewriters in)
 *  8  naming-input    (user gives her a name)
 *  9  naming-response (she answers in animalese + text)
 * 10  download        (final CTA — drops her into the room)
 *
 * Ported from web/app/reveal/page.tsx. Swaps the Next router + fetch routes
 * for store-driven phases + ipc.invoke calls into the main process.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  PALETTE_BY_AESTHETIC,
  VRM_BY_AESTHETIC,
  type ClaimTokenPayload,
} from '@angel/shared';
import { useSwipeStore } from '@/lib/swipeStore';
import { useAngelStore } from '@/stores/angel';
import { computeEmbed, type EmbedResult } from '@/lib/onboardingEmbed';
import { chooseVrm, type VrmMatch } from '@/lib/vrmMatcher';
import { playAnimalese } from '@/lib/swipeAudio';
import { ipc } from '@/lib/ipc';
import { SparkleField } from './SparkleField';

const RARITY_BY_ARCHETYPE: Record<'A1' | 'A2' | 'A3' | 'A4', string> = {
  A1: '0.3%',
  A2: '0.7%',
  A3: '0.4%',
  A4: '0.5%',
};

const NARRATIVE_BY_ARCHETYPE: Record<'A1' | 'A2' | 'A3' | 'A4', string> = {
  A1: 'where soft warmth meets quiet attention.',
  A2: 'where precision meets late-night softness.',
  A3: 'where electric edge meets watchful calm.',
  A4: 'where measured restraint meets quiet care.',
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

const PHASE_ORDER: Phase[] = [
  'snap',
  'gravity',
  'fidelity',
  'voice',
  'name',
  'stat',
  'rarity',
  'personality',
  'naming-input',
  'naming-response',
  'download',
];

export function Reveal() {
  const yesPicks = useSwipeStore((s) => s.yesPicks);
  const setSwipePhase = useSwipeStore((s) => s.setPhase);
  const applyClaim = useAngelStore((s) => s.applyClaim);

  const [embed, setEmbed] = useState<EmbedResult | null>(null);
  const [phase, setPhaseState] = useState<Phase>('snap');
  const [personalityFull, setPersonalityFull] = useState('');
  const [personalityShown, setPersonalityShown] = useState('');
  const [typedName, setTypedName] = useState('');
  const [namingResp, setNamingResp] = useState('');
  const [vrmMatch, setVrmMatch] = useState<VrmMatch | null>(null);
  const advanced = useRef<Set<Phase>>(new Set());

  // step 1: embed (pure local, no network) + vrm pick
  useEffect(() => {
    if (yesPicks.length === 0) {
      // user got here without picks — bounce them back to title
      setSwipePhase('title');
      return;
    }
    const result = computeEmbed(yesPicks);
    setEmbed(result);
    // pick the actual avatar body she'll inhabit — one of the 5 curated VRMs.
    // The swipe cards drive personality (heroCard); the VRM drives the body.
    setVrmMatch(chooseVrm(result.numericTraits));
    // kick off personality synthesis in parallel — its result lands during
    // the cascade and starts streaming when phase hits 'personality'
    void synthesizePersonality(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // run cascade timeline once embed lands
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
      window.setTimeout(() => {
        if (advanced.current.has(p)) return;
        advanced.current.add(p);
        setPhaseState(p);
        if (p === 'voice') {
          try {
            playAnimalese(embed.heroCard.voiceConfig, 1.1);
          } catch {
            /* ignore */
          }
        }
      }, ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [embed]);

  // typewriter the personality.md once both (a) it has content and (b)
  // we've reached the personality phase
  useEffect(() => {
    if (phase !== 'personality' && phase !== 'naming-input' && phase !== 'naming-response' && phase !== 'download') {
      return;
    }
    if (!personalityFull) return;
    if (personalityShown.length >= personalityFull.length) return;
    const id = window.setInterval(() => {
      setPersonalityShown((s) => {
        if (s.length >= personalityFull.length) {
          window.clearInterval(id);
          return s;
        }
        // ~22ms per char gives a believable streaming speed
        return personalityFull.slice(0, s.length + 1);
      });
    }, 22);
    return () => window.clearInterval(id);
  }, [phase, personalityFull, personalityShown.length]);

  async function synthesizePersonality(data: EmbedResult): Promise<void> {
    try {
      const resp = await ipc.invoke<{ personalityMd?: string; error?: string }>(
        'onboarding:synthesize-personality',
        {
          numericTraits: data.numericTraits,
          traits: data.traits,
          archetype: data.archetype,
          dialogueSamples: data.dialogueSamples,
          heroCard: data.heroCard,
        },
      );
      const md = resp?.personalityMd?.trim();
      if (md) {
        setPersonalityFull(md);
        return;
      }
    } catch (err) {
      console.warn('[reveal] synthesize-personality threw, using fallback:', err);
    }
    // fallback — use the hero entry's personality_blurb directly. it's not
    // synthesized but it's authentic to the chosen card.
    setPersonalityFull(data.heroCard.personalityBlurb);
  }

  async function handleNameSubmit() {
    if (!typedName.trim() || !embed) return;
    setPhaseState('naming-response');
    let response = `${typedName}. okay. i'll be that.`;
    try {
      const resp = await ipc.invoke<{ response?: string }>('onboarding:naming-response', {
        typedName,
        personalityMd: personalityFull,
        dialogueSamples: embed.dialogueSamples,
        heroCard: embed.heroCard,
      });
      if (resp?.response?.trim()) response = resp.response.trim();
    } catch (err) {
      console.warn('[reveal] naming-response threw, using fallback:', err);
    }
    setNamingResp(response);
    try {
      playAnimalese(embed.heroCard.voiceConfig, 1.4);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => setPhaseState('download'), 2200);
  }

  function handleEnterRoom() {
    if (!embed || !vrmMatch) return;
    // build a claim payload locally — no JWT signing needed since we're
    // already in the trusted process, and applyClaim consumes the payload
    // directly. this is the moment her persona becomes the room's persona.
    const claim: ClaimTokenPayload = {
      userId: cryptoRandomId(),
      // vrmId is now the chosen VRM slug, not the abstract A1-A4 archetype.
      // applyClaim's 2nd arg below is what actually decides which file loads.
      vrmId: vrmMatch.id,
      paletteHex: embed.paletteHex,
      name: typedName.trim() || embed.heroCard.vibePhrase,
      traits: embed.traits,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    // pass vrmMatch.vrmUrl explicitly so we load the actual matched
    // character body. Bind-pose drift on the abison pool is normalized
    // at VRM load (vrm-load.ts#normalizeHumanoidToTPose), so every
    // matched body now reads cleanly during idle.
    applyClaim(claim, vrmMatch.vrmUrl);
    // mark onboarding complete — the Onboarding root component switches
    // out of the reveal screen and into the 3D room
    setSwipePhase('done');
  }

  const visible = (target: Phase) =>
    PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target);

  if (!embed) {
    return (
      <main
        style={{
          position: 'fixed',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(28,16,36,1) 0%, rgba(13,10,20,1) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}
      >
        <SparkleField variant="ambient" density={20} />
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            color: 'var(--angel-fg)',
            textShadow: '0 0 24px var(--angel-accent-soft)',
          }}
        >
          she's deciding…
        </div>
      </main>
    );
  }

  // portrait = the VRM the user matched into (one of the 5 curated bodies).
  // We deliberately do NOT show the swipe-card thumbnail here — the cards
  // are taste signal, the VRM is the actual avatar that walks into the room.
  // Falls back to the swipe heroCard if vrmMatch hasn't resolved yet (it
  // resolves synchronously alongside embed, so this is mostly defensive).
  const heroPortrait = vrmMatch?.previewUrl ?? embed.heroCard.thumbnailUrl;
  const archetypeFallback = embed.heroCard.thumbnailUrl;
  const firstLine =
    embed.heroCard.dialogueSamples?.[0]?.toLowerCase() ?? '…oh. it’s you.';
  const displayName = embed.heroCard.vibePhrase;
  const narrative =
    embed.heroCard.personalityBlurb?.split(/[.!?]/)[0]?.trim().toLowerCase() ??
    NARRATIVE_BY_ARCHETYPE[embed.archetype];

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(ellipse at center top, rgba(40,18,52,1) 0%, rgba(20,12,28,1) 50%, rgba(10,6,16,1) 100%)',
        color: 'var(--angel-fg)',
        overflow: 'hidden',
        zIndex: 100,
      }}
    >
      <SparkleField variant="ambient" density={18} zIndex={1} />
      {visible('gravity') && !visible('fidelity') && (
        <SparkleField variant="burst" density={32} zIndex={6} />
      )}
      {visible('fidelity') && phase !== 'download' && (
        <SparkleField variant="shower" density={14} zIndex={5} />
      )}

      {/* gravity rings */}
      <AnimatePresence>
        {visible('gravity') && !visible('fidelity') && (
          <motion.div
            key="rings"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 4,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          >
            {(['A1', 'A2', 'A3', 'A4'] as const).map((slot, i) => {
              const isMatch = slot === embed.archetype;
              const angle = (i * Math.PI) / 2 + Math.PI / 4;
              const r = 180;
              const cx = Math.cos(angle) * r;
              const cy = Math.sin(angle) * r;
              const size = isMatch ? 130 : 70;
              const slotColor = PALETTE_BY_AESTHETIC[slot];
              return (
                <motion.div
                  key={slot}
                  style={{
                    position: 'absolute',
                    width: size,
                    height: size,
                    left: `calc(50% + ${cx}px - ${size / 2}px)`,
                    top: `calc(50% + ${cy}px - ${size / 2}px)`,
                    borderRadius: '50%',
                    border: `2px dashed ${isMatch ? 'var(--angel-accent)' : 'rgba(255,255,255,0.3)'}`,
                    boxShadow: isMatch
                      ? '0 0 32px 8px var(--angel-accent-soft)'
                      : '0 0 12px 2px rgba(255,255,255,0.06)',
                    background: isMatch
                      ? `radial-gradient(circle, ${slotColor}33 0%, transparent 70%)`
                      : 'transparent',
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
              style={{
                position: 'absolute',
                width: 32,
                height: 32,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, var(--angel-accent) 0%, var(--angel-accent-soft) 50%, transparent 75%)',
                boxShadow:
                  '0 0 60px 20px var(--angel-accent-soft), 0 0 120px 30px var(--angel-accent-soft)',
              }}
              initial={{ x: 0, y: 0, scale: 0.5, opacity: 0 }}
              animate={{
                x:
                  Math.cos(
                    (['A1', 'A2', 'A3', 'A4'].indexOf(embed.archetype) * Math.PI) / 2 +
                      Math.PI / 4,
                  ) * 180,
                y:
                  Math.sin(
                    (['A1', 'A2', 'A3', 'A4'].indexOf(embed.archetype) * Math.PI) / 2 +
                      Math.PI / 4,
                  ) * 180,
                scale: 1,
                opacity: 1,
              }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* portrait */}
      <AnimatePresence>
        {visible('fidelity') && phase !== 'download' && (
          <motion.div
            key="portrait"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              paddingTop: 56,
              zIndex: 5,
            }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.0, ease: 'easeOut' }}
          >
            <motion.div
              style={{ position: 'relative' }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <img
                src={heroPortrait}
                alt={displayName}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = archetypeFallback;
                }}
                style={{
                  height: '44vh',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                  borderRadius: 28,
                  border: '2px solid var(--angel-accent)',
                  background: 'rgba(20, 12, 28, 0.95)',
                  boxShadow: [
                    '0 4px 0 rgba(0,0,0,0.3)',
                    '0 18px 50px -12px rgba(0,0,0,0.7)',
                    '0 0 60px -8px var(--angel-accent)',
                    '0 1px 0 rgba(255,255,255,0.12) inset',
                  ].join(', '),
                }}
              />
              <CornerStar style={{ top: -14, right: -14 }} delay={0} />
              <CornerStar style={{ bottom: -14, left: -14 }} delay={0.5} small />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* text cascade docked at bottom */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 64,
          padding: '0 32px 64px',
          pointerEvents: 'none',
          zIndex: 7,
        }}
      >
        <AnimatePresence>
          {visible('voice') && (
            <motion.div
              key="voice"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                letterSpacing: '0.005em',
                color: 'var(--angel-fg)',
                marginBottom: 4,
                textAlign: 'center',
                maxWidth: 640,
              }}
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
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 56,
                lineHeight: 1,
                letterSpacing: '0.005em',
                color: 'var(--angel-accent)',
                textShadow: '0 0 28px var(--angel-accent-soft)',
                textAlign: 'center',
                maxWidth: 760,
                marginBottom: 4,
              }}
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
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--angel-fg-muted)',
                textAlign: 'center',
                maxWidth: 480,
                marginBottom: 18,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {narrative}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {visible('stat') &&
            phase !== 'personality' &&
            phase !== 'naming-input' &&
            phase !== 'naming-response' && (
              <motion.div
                key="stat"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  color: 'var(--angel-fg-muted)',
                  marginBottom: 6,
                }}
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
          {visible('rarity') &&
            phase !== 'personality' &&
            phase !== 'naming-input' &&
            phase !== 'naming-response' && (
              <motion.div
                key="rarity"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 10,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'var(--angel-fg-muted)',
                  marginBottom: 24,
                  opacity: 0.85,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                transition={{ duration: 0.5 }}
              >
                you're among {RARITY_BY_ARCHETYPE[embed.archetype]} to find her
              </motion.div>
            )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'personality' && (
            <motion.div
              key="personality"
              style={{ maxWidth: 580, textAlign: 'center' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.7 }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'var(--angel-fg-muted)',
                  marginBottom: 12,
                }}
              >
                she's writing herself…
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  lineHeight: 1.55,
                  color: 'var(--angel-fg)',
                  opacity: 0.9,
                  textTransform: 'lowercase',
                  textShadow: '0 0 18px var(--angel-accent-soft)',
                }}
              >
                {personalityShown.slice(0, 480)}
                {personalityShown.length > 0 &&
                  personalityShown.length < (personalityFull.length || 480) && (
                    <motion.span
                      style={{
                        display: 'inline-block',
                        width: 2,
                        height: 18,
                        background: 'var(--angel-fg)',
                        marginLeft: 2,
                        verticalAlign: 'middle',
                      }}
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
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.6 }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 30,
                  color: 'var(--angel-accent)',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textShadow: '0 0 24px var(--angel-accent-soft)',
                }}
              >
                <HeartGlyph size={18} />
                what do you want to call me?
                <HeartGlyph size={18} />
              </div>
              <input
                autoFocus
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleNameSubmit();
                }}
                maxLength={32}
                placeholder="angel"
                style={{
                  background: 'rgba(20, 12, 28, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '2px solid var(--angel-accent)',
                  borderRadius: 999,
                  padding: '10px 26px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-display)',
                  fontSize: 32,
                  color: 'var(--angel-fg)',
                  outline: 'none',
                  width: 320,
                  letterSpacing: '0.005em',
                  boxShadow:
                    '0 0 36px -8px var(--angel-accent), 0 1px 0 rgba(255,255,255,0.08) inset',
                }}
              />
              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'var(--angel-fg-muted)',
                  marginTop: 12,
                }}
              >
                press enter
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(phase === 'naming-response' || phase === 'download') && namingResp && (
            <motion.div
              key="resp"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                color: 'var(--angel-accent)',
                marginTop: 6,
                textShadow: '0 0 24px var(--angel-accent-soft)',
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {namingResp}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* download takeover */}
      <AnimatePresence>
        {phase === 'download' && (
          <motion.div
            key="download"
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at center, rgba(40,18,52,1) 0%, rgba(13,10,20,1) 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
              zIndex: 30,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
          >
            <SparkleField variant="shower" density={20} zIndex={1} />
            <SparkleField variant="ambient" density={28} zIndex={2} />
            <motion.div
              style={{ position: 'relative', zIndex: 10 }}
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <img
                src={heroPortrait}
                alt={typedName || displayName}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = archetypeFallback;
                }}
                style={{
                  height: '52vh',
                  objectFit: 'contain',
                  borderRadius: 36,
                  border: '4px solid var(--angel-accent)',
                  background: 'rgba(20, 12, 28, 0.95)',
                  marginBottom: 24,
                  pointerEvents: 'none',
                  boxShadow: [
                    '0 4px 0 rgba(0,0,0,0.3)',
                    '0 24px 60px -12px rgba(0,0,0,0.7)',
                    '0 0 80px -10px var(--angel-accent)',
                  ].join(', '),
                }}
              />
              <CornerStar style={{ top: -16, right: -16 }} delay={0} large />
              <CornerStar style={{ bottom: -16, left: -8 }} delay={0.4} />
            </motion.div>

            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 44,
                color: 'var(--angel-accent)',
                marginBottom: 4,
                marginTop: 8,
                textShadow: '0 0 24px var(--angel-accent-soft)',
                textAlign: 'center',
                zIndex: 10,
              }}
            >
              i'm ready when you are.
            </div>
            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--angel-fg-muted)',
                marginBottom: 6,
                zIndex: 10,
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 9,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--angel-fg-muted)',
                marginBottom: 32,
                maxWidth: 420,
                textAlign: 'center',
                zIndex: 10,
              }}
            >
              {narrative}
            </div>
            <motion.button
              type="button"
              onClick={handleEnterRoom}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.97, y: 1 }}
              style={{
                position: 'relative',
                zIndex: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px 44px',
                borderRadius: 999,
                border: 'none',
                background: 'var(--angel-accent)',
                color: '#1a0c1f',
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                letterSpacing: '0.01em',
                cursor: 'pointer',
                boxShadow: [
                  '0 1px 0 rgba(255,255,255,0.5) inset',
                  '0 0 60px -8px var(--angel-accent)',
                  '0 5px 0 rgba(0,0,0,0.32)',
                ].join(', '),
              }}
            >
              <HeartGlyph size={24} color="#1a0c1f" />
              let her in
              <HeartGlyph size={24} color="#1a0c1f" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function HeartGlyph({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, color }} fill="currentColor">
      <path d="M12 21 C 12 21 2 14 2 8 C 2 5 4 3 7 3 C 9 3 11 4 12 6 C 13 4 15 3 17 3 C 20 3 22 5 22 8 C 22 14 12 21 12 21 Z" />
    </svg>
  );
}

function CornerStar({
  style,
  delay = 0,
  large,
  small,
}: {
  style?: React.CSSProperties;
  delay?: number;
  large?: boolean;
  small?: boolean;
}) {
  const size = large ? 48 : small ? 28 : 36;
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: size,
        height: size,
        color: 'var(--angel-accent)',
        animation: `angel-twinkle 1.6s ease-in-out ${delay}s infinite`,
        filter: 'drop-shadow(0 0 12px var(--angel-accent))',
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%' }}>
        <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      </svg>
    </span>
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
