import { useEffect, useRef, useState } from 'react';
import { useAngelStore } from '@/stores/angel';
import { cancelAnimalese, speakAnimalese, type AnimaleseEmotion } from '@/lib/animalese';
import type { Emotion, VoiceCluster } from '@angel/shared';

const ANIMALESE_EMOTIONS: ReadonlySet<string> = new Set([
  'neutral', 'happy', 'excited', 'thinking', 'soft', 'focused',
]);

function toAnimaleseEmotion(e?: Emotion): AnimaleseEmotion {
  if (!e) return 'neutral';
  if (ANIMALESE_EMOTIONS.has(e)) return e as AnimaleseEmotion;
  // map non-overlapping emotions to closest synth equivalent
  if (e === 'smug') return 'happy';
  if (e === 'concerned') return 'soft';
  return 'neutral';
}

/**
 * The chunky speech bubble. Reads from store.bubble and animates the text
 * char-by-char synced to animalese chirps. Position is fixed bottom-center —
 * a future improvement worldspace-anchors it above the avatar's head.
 */

const BUBBLE_TIMEOUT_MS = 420; // grace before auto-fade after onDone

export function Subtitle() {
  const bubble = useAngelStore((s) => s.bubble);
  const persona = useAngelStore((s) => s.persona);
  const clearBubble = useAngelStore((s) => s.clearBubble);
  const [revealed, setRevealed] = useState('');
  const [hidden, setHidden] = useState(true);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bubble) {
      setHidden(true);
      return;
    }
    const myId = `${bubble.visibleAt}:${bubble.text}`;
    if (lastIdRef.current === myId) return;
    lastIdRef.current = myId;

    setRevealed('');
    setHidden(false);
    cancelAnimalese();

    let cancelled = false;
    const cluster: VoiceCluster = (persona?.traits?.voice_cluster ?? 2) as VoiceCluster;
    const setMouth = useAngelStore.getState().setMouthOpen;
    speakAnimalese(bubble.text, {
      voiceCluster: cluster,
      emotion: toAnimaleseEmotion(bubble.emotion as Emotion),
      onChar: (c, i) => {
        if (cancelled) return;
        setRevealed(bubble.text.slice(0, i + 1));
        // pulse mouth on alphabetic chars; closes on punctuation/space
        const open = /[a-z]/i.test(c) ? (c.match(/[aeiou]/i) ? 0.85 : 0.5) : 0.05;
        setMouth(open);
      },
      onDone: () => {
        setMouth(0);
        if (cancelled) return;
        setRevealed(bubble.text);
        const t = window.setTimeout(() => {
          setHidden(true);
          clearBubble();
        }, BUBBLE_TIMEOUT_MS);
        return () => window.clearTimeout(t);
      },
    });

    return () => {
      cancelled = true;
      cancelAnimalese();
    };
  }, [bubble, persona, clearBubble]);

  if (hidden && !bubble) return null;

  const emotion = bubble?.emotion ?? 'neutral';
  const accent = `var(--angel-accent)`;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '18%',
        maxWidth: '64ch',
        padding: '18px 26px 20px',
        borderRadius: 18,
        background: 'rgba(13,10,20,0.78)',
        border: `2px solid ${accent}`,
        boxShadow: `0 18px 48px rgba(0,0,0,0.55), 0 0 28px ${accent}44`,
        backdropFilter: 'blur(10px)',
        color: 'var(--angel-fg)',
        fontFamily: 'var(--font-bubble)',
        fontSize: 30,
        letterSpacing: '0.01em',
        lineHeight: 1.18,
        textAlign: 'center',
        opacity: hidden ? 0 : 1,
        transform: `translateX(-50%) translateY(${hidden ? 12 : 0}px)`,
        transition: 'opacity 220ms ease, transform 240ms ease',
        pointerEvents: 'none',
        zIndex: 50,
      }}
      data-emotion={emotion}
    >
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: 18,
          fontFamily: 'var(--font-ui)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          padding: '2px 10px',
          background: accent,
          color: '#0d0a14',
          borderRadius: 999,
          fontWeight: 700,
        }}
      >
        {persona?.name ?? 'angel'}
        <span style={{ opacity: 0.6, marginLeft: 8 }}>· {emotion}</span>
      </div>
      <span>{revealed}</span>
      <span
        style={{
          display: 'inline-block',
          width: 14,
          marginLeft: 4,
          color: accent,
          animation: 'angel-pulse 0.9s infinite',
        }}
      >
        {revealed.length < (bubble?.text.length ?? 0) ? '▌' : ''}
      </span>
    </div>
  );
}
