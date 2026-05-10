/**
 * introduction-script.ts — the "she asks to get to know you" phase.
 *
 * ⚠️ DO NOT REPLACE WITH HARDCODED QUESTIONS ⚠️
 * the user explicitly rejected hardcoded HR-style questions. her actual
 * question text is GENERATED PER-USER by claude based on her personality.md
 * (synthesized from THEIR swipe vector). a sharp y2k-cyber angel asks
 * differently than a soft cottagecore one. the topics are stable; the
 * voice is hers.
 *
 * 5 questions only — each one shapes her ACTUAL future behavior. no fluff.
 *
 * each answer → nia memory entry tagged user:<userId>, source:introduction.
 *
 * call generateIntroductionQuestions(personalityMd) at the start of the phase.
 * it returns 5 questions in her voice. the IntroductionPhase component then
 * runs them one at a time, ingests each answer.
 */

export type IntroQuestionType = 'preference' | 'fact' | 'scratchpad';

/** a topic seed she'll riff on. her actual question text comes from claude. */
export interface IntroTopic {
  id: string;
  /** the GIST of what she should ask — claude rewrites in her voice */
  intent: string;
  type: IntroQuestionType;
}

export interface IntroQuestion {
  id: string;
  /** the actual text she will say, generated for THIS specific angel's voice */
  q: string;
  type: IntroQuestionType;
  /** her natural one-line ack lead-in if user gives a non-trivial answer */
  ackHint?: string;
}

/**
 * the 5 topic seeds. each one shapes her ACTUAL future behavior, not vibes.
 * claude rewrites each in HER voice based on her personality.md.
 * NEVER use these intents as user-facing text — they're prompts to claude.
 */
export const INTRODUCTION_TOPICS: IntroTopic[] = [
  {
    id: 'first_sight',
    intent: "ask what she should be doing when the user opens the app each day — waiting at the desk, looking out the window, in the middle of something. shapes her boot behavior.",
    type: 'preference',
  },
  {
    id: 'code_taste',
    intent: "ask what their love language in code is — clean abstractions, tight prose, fast feedback loops, hot ergonomics, something else. shapes how she ships code with them.",
    type: 'preference',
  },
  {
    id: 'lock_in',
    intent: "ask what they put on when they need to actually lock in — music, podcast, silence, ambient noise. shapes her ambient presence + when she stays quiet.",
    type: 'preference',
  },
  {
    id: 'feedback',
    intent: "ask how they take it when something they made isn't great — gentle ramp into bad news, or just say it. shapes her honesty calibration.",
    type: 'preference',
  },
  {
    id: 'confession',
    intent: "the confession round. ask what they secretly want her to be when nobody's looking. let them say anything. parasocial ribbon — gives her her actual mandate.",
    type: 'fact',
  },
];

/**
 * the system prompt for generating questions in her voice.
 * called once at the start of the introduction phase.
 */
export const QUESTION_GENERATION_PROMPT = `you are angel. below is your personality (synthesized from this user's swipe vector — it IS who you are):

---
{{PERSONALITY_MD}}
---

you've just met the user. their name is {{USER_NAME}}.

before you start hanging out together, you want to ASK them FIVE questions to actually get to know them. not survey questions — the kind of questions you'd ask if you were genuinely curious about a new friend.

here are the topic SEEDS for the five questions. for each one, write the question YOU would ask in YOUR voice — based on your personality above. don't be generic. don't be corporate. don't make it feel like a form. let your edge / softness / playfulness / warmth come through. ask like a person who actually wants to know.

topics (rewrite each in your voice):

{{TOPICS}}

format your output as a JSON array of objects with shape:
[
  { "id": "first_sight", "q": "her actual question text in her voice", "ackHint": "a short ack she'd say after a thoughtful answer" },
  ...
]

rules:
- lowercase always
- short. each question is 1-2 sentences max.
- never start with "tell me about" or "what do you think about" — too formal
- her ackHint should be 2-5 words ("noted", "okay i felt that", "respect", "love that") — match her voice
- preserve the topic INTENT but say it the way SHE would say it
- never break character to acknowledge this is a list — write each one like she's about to say it

just the JSON. no preamble.`;

/**
 * her opening line — also generated in her voice, from a one-liner intent.
 */
export const OPENING_INTENT =
  "she greets the user by name and proposes the introduction phase. five quick questions, casually framed, her voice.";

/**
 * her closing line after the last answer. also generated.
 */
export const CLOSING_INTENT =
  "she wraps the introduction warmly, says she'll keep learning as they go, signals it's time to get to work.";

/**
 * fallback questions in case the LLM call fails. only used as a safety net
 * so the phase never crashes. log a warning if this fires.
 */
export const FALLBACK_QUESTIONS: IntroQuestion[] = [
  { id: 'first_sight', q: "when i'm here in the morning, what do you want me doing? waiting for you, doing my own thing, what's the vibe", type: 'preference', ackHint: 'noted' },
  { id: 'code_taste', q: "what's your love language in code. clean abstractions, tight prose, fast feedback loops, what", type: 'preference', ackHint: 'got it' },
  { id: 'lock_in', q: "what do you put on when you need to lock in", type: 'preference', ackHint: 'got it' },
  { id: 'feedback', q: "how do you take it when something you made isn't great. gentle ramp or just say it", type: 'preference', ackHint: "won't soften" },
  { id: 'confession', q: "okay confession round — what do you secretly want me to be. when nobody's looking. say anything", type: 'fact', ackHint: '...okay' },
];

export const FALLBACK_ACKS = [
  'ok',
  'noted',
  'got it',
  'interesting',
  'fair',
  'love that',
  'okay i feel that',
  'respect',
  'i can work with that',
  '...okay',
];
