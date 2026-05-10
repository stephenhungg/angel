/**
 * IntroductionPhase — chat-style flow where she asks the user a small set of
 * questions in HER voice (generated from her personality.md) and writes each
 * answer into nia (per-user namespace) so the orchestrator has REAL user
 * context from session one.
 *
 * Mounted between reveal and room. Skipped if settings.json says
 * introCompleted=true OR if the user clicks "skip — i'll learn as we go".
 *
 * Pipeline:
 *   1. on mount → call window.angel.introGenerateQuestions(personality, topics)
 *      → returns 5 questions written in her voice. fall back to FALLBACK_QUESTIONS
 *      if generation fails (no key, parse error, etc).
 *   2. greet (hardcoded opener using persona.name).
 *   3. for each question → user types → ack + next question, ingest the
 *      answer into nia + memoryMirror via window.angel.introIngestAnswer.
 *   4. closing line → markIntroComplete → onComplete().
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAngelStore } from '@/stores/angel';
import { markIntroComplete } from '@/lib/settings';
import {
  INTRODUCTION_TOPICS,
  FALLBACK_QUESTIONS,
  FALLBACK_ACKS,
  QUESTION_GENERATION_PROMPT,
  type IntroQuestion,
} from '@/lib/introduction-script';

interface Props {
  onComplete: () => void;
}

type Turn =
  | { id: string; role: 'angel'; text: string }
  | { id: string; role: 'user'; text: string };

const PHASES = ['booting', 'greeting', 'asking', 'closing', 'done'] as const;
type Phase = (typeof PHASES)[number];

export function IntroductionPhase({ onComplete }: Props) {
  const persona = useAngelStore((s) => s.persona);
  const personaName = persona?.name;
  const paletteHex = persona?.paletteHex ?? '#ec6592';
  const personalityMd = persona?.personalityMd ?? '';

  const [questions, setQuestions] = useState<IntroQuestion[]>([]);
  const [phase, setPhase] = useState<Phase>('booting');
  const [qIndex, setQIndex] = useState(0); // 0..questions.length-1 while phase==='asking'
  const [thread, setThread] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const greetingLine = useMemo(() => buildGreeting(personaName), [personaName]);
  const closingLine = useMemo(() => buildClosing(), []);
  const total = questions.length || INTRODUCTION_TOPICS.length;
  const currentQuestion = phase === 'asking' ? questions[qIndex] : null;
  const displayedProgress = phase === 'asking' ? qIndex + 1 : phase === 'closing' || phase === 'done' ? total : 0;

  // BOOT: load questions (from claude if personalityMd present, else fallback),
  // then greet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let qs: IntroQuestion[] = [];
      if (personalityMd && personalityMd.trim().length > 80) {
        try {
          const resp = await window.angel.introGenerateQuestions({
            personalityMd,
            userName: personaName,
            topics: INTRODUCTION_TOPICS,
            promptTemplate: QUESTION_GENERATION_PROMPT,
          });
          if (!resp.fallback && resp.questions.length > 0) {
            qs = resp.questions as IntroQuestion[];
          }
        } catch (err) {
          console.warn('[introduction] question generation failed:', err);
        }
      }
      if (qs.length === 0) {
        console.info('[introduction] using fallback questions');
        qs = FALLBACK_QUESTIONS;
      }
      if (cancelled) return;
      setQuestions(qs);
      setPhase('greeting');
      setThread([{ id: 'greet', role: 'angel', text: greetingLine }]);
    })();
    return () => {
      cancelled = true;
    };
    // intentionally only re-run when persona changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalityMd, personaName]);

  // autoscroll to bottom on every thread change
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.length]);

  // refocus the input after each angel message lands
  useEffect(() => {
    if (!busy && phase !== 'booting') inputRef.current?.focus();
  }, [busy, phase, qIndex]);

  async function handleSend(): Promise<void> {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);

    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };
    setThread((t) => [...t, userTurn]);
    setDraft('');

    if (phase === 'greeting') {
      // user's "yes / let's go" — start asking
      const first = questions[0];
      if (!first) {
        setBusy(false);
        return;
      }
      await wait(420);
      setThread((t) => [
        ...t,
        { id: `a-${Date.now()}`, role: 'angel', text: first.q },
      ]);
      setQIndex(0);
      setPhase('asking');
      setBusy(false);
      return;
    }

    if (phase === 'asking' && currentQuestion) {
      try {
        await window.angel.introIngestAnswer({
          questionId: currentQuestion.id,
          question: currentQuestion.q,
          answer: text,
          type: currentQuestion.type,
        });
      } catch (err) {
        console.warn('[introduction] ingestAnswer failed:', err);
      }

      const ack = currentQuestion.ackHint?.trim() || pickAck();
      const nextIdx = qIndex + 1;
      const isLast = nextIdx >= questions.length;

      await wait(360);
      if (isLast) {
        setThread((t) => [
          ...t,
          {
            id: `a-${Date.now()}`,
            role: 'angel',
            text: `${ack}. ${closingLine}`,
          },
        ]);
        setPhase('closing');
        await finishAndAdvance();
      } else {
        const next = questions[nextIdx];
        setThread((t) => [
          ...t,
          { id: `ack-${Date.now()}`, role: 'angel', text: ack },
          { id: `q-${Date.now() + 1}`, role: 'angel', text: next.q },
        ]);
        setQIndex(nextIdx);
        setBusy(false);
      }
    }
  }

  async function finishAndAdvance(): Promise<void> {
    try {
      await markIntroComplete();
    } catch (err) {
      console.warn('[introduction] markIntroComplete failed:', err);
    }
    await wait(1500);
    setPhase('done');
    onComplete();
  }

  async function handleSkip(): Promise<void> {
    setBusy(true);
    try {
      await markIntroComplete();
    } catch {
      /* ignore */
    }
    onComplete();
  }

  function handleQuickYes(): void {
    setDraft('yes');
    setTimeout(() => {
      void handleSend();
    }, 0);
  }

  return (
    <main
      className="onboarding-root min-h-screen kawaii-bg text-ink-near flex flex-col relative overflow-hidden"
      data-testid="introduction-phase"
    >
      {/* progress strip */}
      <div className="relative gutter pt-7 z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="font-mono uppercase tracking-[0.18em] text-[10px] text-sakura-700">
            {phase === 'booting'
              ? 'she\'s thinking about what to ask…'
              : phase === 'greeting'
                ? "she's about to ask you a few things"
                : phase === 'closing' || phase === 'done'
                  ? "she's done — for now"
                  : `${displayedProgress} of ${total} · she's getting to know you`}
          </div>
          {phase !== 'closing' && phase !== 'done' && (
            <button
              type="button"
              onClick={handleSkip}
              className="font-sans text-[12px] text-muted-secondary hover:text-sakura-700 underline-offset-4 hover:underline"
            >
              skip — she'll learn as we go
            </button>
          )}
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-pill bg-sakura-100">
          <motion.div
            initial={false}
            animate={{ width: `${(displayedProgress / total) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full rounded-pill"
            style={{ background: paletteHex }}
          />
        </div>
      </div>

      <section className="relative flex-1 flex flex-row gap-8 gutter pt-10 pb-8 z-10 max-w-[980px] mx-auto w-full">
        {/* her side: portrait + name */}
        <aside className="hidden tablet:flex w-[200px] flex-col items-center gap-4 pt-2">
          <div
            className="w-[140px] h-[140px] rounded-full ring-4 ring-white shadow-[0_10px_24px_rgba(199,78,122,0.18)] overflow-hidden flex items-center justify-center"
            style={{
              background: `radial-gradient(circle at 35% 30%, ${paletteHex}33, ${paletteHex}88)`,
            }}
          >
            <span
              className="font-display italic text-[68px] leading-none text-white"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.18)' }}
            >
              {(personaName?.[0] ?? 'a').toLowerCase()}
            </span>
          </div>
          <div className="text-center">
            <div className="font-display italic text-[22px] text-sakura-800">
              {personaName ?? 'angel'}
            </div>
            <div className="font-mono uppercase tracking-[0.18em] text-[9px] text-muted-secondary">
              learning · live
            </div>
          </div>
        </aside>

        {/* thread */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
            {phase === 'booting' && (
              <div className="self-start max-w-[60%] rounded-2xl rounded-tl-md bg-white border border-hairline px-4 py-3">
                <span className="inline-flex items-center gap-2 font-mono text-[11px] text-muted-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-sakura-500 animate-pulse" />
                  thinking…
                </span>
              </div>
            )}
            <AnimatePresence initial={false}>
              {thread.map((t) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className={
                    t.role === 'angel'
                      ? 'self-start max-w-[80%] rounded-2xl rounded-tl-md bg-white border border-hairline px-4 py-3 shadow-[0_2px_0_rgba(199,78,122,0.05)]'
                      : 'self-end max-w-[80%] rounded-2xl rounded-tr-md text-white px-4 py-3'
                  }
                  style={
                    t.role === 'user'
                      ? { background: paletteHex }
                      : undefined
                  }
                >
                  <p className="m-0 font-sans text-[14px] leading-[1.55] whitespace-pre-wrap">
                    {t.text}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={threadEndRef} />
          </div>

          {/* composer */}
          {phase !== 'booting' && phase !== 'closing' && phase !== 'done' && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={
                    phase === 'greeting'
                      ? 'yes — or just say something'
                      : 'type your answer · enter to send · shift+enter for newline'
                  }
                  disabled={busy}
                  className="flex-1 resize-none rounded-2xl border border-hairline bg-white px-4 py-3 font-sans text-[14px] text-ink-near focus:outline-none focus:border-sakura-400 disabled:opacity-60"
                />
                {phase === 'greeting' ? (
                  <button
                    type="button"
                    onClick={handleQuickYes}
                    disabled={busy}
                    className="self-stretch rounded-pill bg-sakura-500 px-6 font-sans text-[14px] font-semibold text-white shadow-[0_4px_0_rgba(199,78,122,0.35)] hover:bg-sakura-600 disabled:opacity-60"
                  >
                    let's go
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={busy || !draft.trim()}
                    className="self-stretch rounded-pill bg-sakura-500 px-6 font-sans text-[14px] font-semibold text-white shadow-[0_4px_0_rgba(199,78,122,0.35)] hover:bg-sakura-600 disabled:opacity-60"
                  >
                    {busy ? '…' : 'send'}
                  </button>
                )}
              </div>
              <span className="font-sans text-[11px] text-muted-secondary">
                your answers go straight into her memory. she'll remember them
                next session — and the one after.
              </span>
            </div>
          )}

          {(phase === 'closing' || phase === 'done') && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.18em] text-[10px] text-sakura-700">
                <span className="h-1.5 w-1.5 rounded-full bg-sakura-500 animate-pulse" />
                opening the room…
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function buildGreeting(name: string | undefined): string {
  if (!name) return 'before we do anything together i want to know you. that ok?';
  return `hi ${name}. before we do anything together i want to know you. that ok?`;
}

function buildClosing(): string {
  return "okay. that's enough for now. i'll keep learning as we go. let's get to work.";
}

function pickAck(): string {
  return FALLBACK_ACKS[Math.floor(Math.random() * FALLBACK_ACKS.length)];
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
