/**
 * onboarding.ts — main-process LLM beats for the swipe → reveal flow.
 *
 * Two exports:
 *   synthesizePersonality(body) → personality.md (Sonnet, one-shot)
 *   respondToName(body)         → her one-line reply when named (Haiku)
 *
 * The web app exposed these as Next API routes; the desktop port runs them
 * locally in the main process so the renderer can call them via plain
 * `ipc.invoke('onboarding:...')`. The prompt template + fallback examples
 * already live alongside this file (personality_synthesis.prompt.md +
 * personality_examples/) — no copy needed.
 *
 * Falls back gracefully when ANTHROPIC_API_KEY is missing or when the LLM
 * call throws, so the demo never hard-stops on the reveal screen.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AestheticArchetype,
  NumericTraits,
  PersonaTraits,
} from '@angel/shared';

const __dirname_compat =
  typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* path resolution — agent/ is the source dir; in dev electron-vite    */
/* runs main from dist-electron/main, so resolve relative to cwd       */
/* ------------------------------------------------------------------ */

function resolveAgentFile(rel: string): string {
  // try several paths so this works in `electron-vite dev` and packaged build
  const candidates = [
    path.resolve(process.cwd(), 'electron/agent', rel),
    path.resolve(__dirname_compat, '../../electron/agent', rel),
    path.resolve(__dirname_compat, '../agent', rel),
    path.resolve(__dirname_compat, rel),
    // packaged app: electron-builder ships these under Contents/Resources/electron/agent/
    ...(typeof process.resourcesPath === 'string'
      ? [path.resolve(process.resourcesPath, 'electron/agent', rel)]
      : []),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // return the first; caller will hit ENOENT and fall back
  return candidates[0]!;
}

let _cachedPrompt: string | null = null;
function loadPersonalityPrompt(): string {
  if (_cachedPrompt) return _cachedPrompt;
  try {
    const p = resolveAgentFile('personality_synthesis.prompt.md');
    _cachedPrompt = fs.readFileSync(p, 'utf-8');
    return _cachedPrompt;
  } catch (err) {
    console.warn('[onboarding] could not load personality prompt:', err);
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* fallback library                                                    */
/* ------------------------------------------------------------------ */

const FALLBACK_FILE: Record<AestheticArchetype, string> = {
  A1: '06_cute_warm_playful.md',
  A2: '07_pretty_sharp_competent.md',
  A3: '08_hot_confident_burning.md',
  A4: '04_composed_dreamy.md',
};

function fallbackPersonality(archetype: AestheticArchetype): string {
  try {
    const p = resolveAgentFile(`personality_examples/${FALLBACK_FILE[archetype]}`);
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return 'angel is here. she watches more than she speaks. she will know if you skip dinner.';
  }
}

/* ------------------------------------------------------------------ */
/* prompt building                                                     */
/* ------------------------------------------------------------------ */

const MACRO_FROM_ARCHETYPE: Record<AestheticArchetype, 'cute' | 'pretty' | 'hot'> = {
  A1: 'cute',
  A2: 'pretty',
  A3: 'hot',
  A4: 'pretty',
};

const ARCHETYPE_DESCRIPTION: Record<AestheticArchetype, string> = {
  A1: 'cottagecore — flowy dress, warm pastels, soft hair',
  A2: 'tech-minimal — sleek hoodie, monochrome, sharp bob',
  A3: 'y2k cyber — crop + cargos, chrome accents, dyed hair',
  A4: 'dark academia — cardigan + collar, vintage glasses',
};

interface PersonalityBody {
  numericTraits: NumericTraits;
  traits: PersonaTraits;
  archetype: AestheticArchetype;
  dialogueSamples: string[];
  bodyDescription?: string;
  userName?: string;
}

function buildPersonalityPrompt(body: PersonalityBody): string {
  const tmpl = loadPersonalityPrompt();
  if (!tmpl) return '';

  const macro = MACRO_FROM_ARCHETYPE[body.archetype];
  const samples = body.dialogueSamples.slice(0, 3);
  while (samples.length < 3) samples.push('…');
  const desc = body.bodyDescription ?? ARCHETYPE_DESCRIPTION[body.archetype];
  const n = (x: number) => (x / 10).toFixed(2);

  return tmpl
    .replace('{{MACRO}}', macro)
    .replace('{{WARMTH}}', n(body.numericTraits.warmth))
    .replace('{{ENERGY}}', n(body.numericTraits.energy))
    .replace('{{EDGE}}', n(body.numericTraits.edge))
    .replace('{{SOPHISTICATION}}', n(body.numericTraits.sophistication))
    .replace('{{EARNESTNESS}}', n(10 - body.numericTraits.edge))
    .replace('{{AESTHETIC}}', body.archetype)
    .replace('{{BODY_DESCRIPTION}}', desc)
    .replace('{{SAMPLE_1}}', samples[0]!)
    .replace('{{SAMPLE_2}}', samples[1]!)
    .replace('{{SAMPLE_3}}', samples[2]!);
}

/* ------------------------------------------------------------------ */
/* exports                                                             */
/* ------------------------------------------------------------------ */

let _client: Anthropic | null = null;
function client(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!_client) _client = new Anthropic({ apiKey: key });
  return _client;
}

export async function synthesizePersonality(
  body: PersonalityBody,
): Promise<{ personalityMd: string; fallback: boolean }> {
  const c = client();
  if (!c) {
    return { personalityMd: fallbackPersonality(body.archetype), fallback: true };
  }
  const prompt = buildPersonalityPrompt(body);
  if (!prompt) {
    return { personalityMd: fallbackPersonality(body.archetype), fallback: true };
  }
  try {
    const resp = await c.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      temperature: 1.0,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = resp.content[0];
    const text = block && block.type === 'text' ? block.text.trim() : '';
    if (text) return { personalityMd: text, fallback: false };
    return { personalityMd: fallbackPersonality(body.archetype), fallback: true };
  } catch (err) {
    console.warn('[onboarding] synthesize-personality threw, falling back:', err);
    return { personalityMd: fallbackPersonality(body.archetype), fallback: true };
  }
}

interface NamingBody {
  typedName: string;
  personalityMd?: string;
  dialogueSamples?: string[];
}

function templatedReply(name: string): string {
  const safe = name.trim().slice(0, 32) || 'angel';
  return `${safe}. okay. i'll be that.`;
}

/* ------------------------------------------------------------------ */
/* introduction phase — generate 5 questions in HER voice               */
/* ------------------------------------------------------------------ */

export interface IntroQuestionTopic {
  id: string;
  intent: string;
  type: 'preference' | 'fact' | 'scratchpad';
}

export interface GeneratedIntroQuestion {
  id: string;
  q: string;
  type: 'preference' | 'fact' | 'scratchpad';
  ackHint?: string;
}

interface GenerateIntroBody {
  personalityMd: string;
  userName?: string;
  topics: IntroQuestionTopic[];
  promptTemplate: string;
}

/**
 * Ask the model to rewrite each topic intent in HER voice. Returns a list of
 * 5 question objects. Falls back to {fallback:true,questions:[]} on any error;
 * the renderer is expected to use its hardcoded FALLBACK_QUESTIONS in that
 * case.
 */
export async function generateIntroductionQuestions(
  body: GenerateIntroBody,
): Promise<{ questions: GeneratedIntroQuestion[]; fallback: boolean }> {
  const c = client();
  if (!c) return { questions: [], fallback: true };
  if (!body.topics?.length || !body.promptTemplate?.trim()) {
    return { questions: [], fallback: true };
  }

  const topicsBlock = body.topics
    .map((t, i) => `${i + 1}. id="${t.id}" type="${t.type}" — ${t.intent}`)
    .join('\n');
  const personality = (body.personalityMd ?? '').slice(0, 2400);
  const name = (body.userName ?? '').trim().slice(0, 32) || 'they';
  const prompt = body.promptTemplate
    .replace('{{PERSONALITY_MD}}', personality)
    .replace('{{USER_NAME}}', name)
    .replace('{{TOPICS}}', topicsBlock);

  try {
    const resp = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      temperature: 0.95,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = resp.content[0];
    const text = block && block.type === 'text' ? block.text.trim() : '';
    if (!text) return { questions: [], fallback: true };
    const parsed = extractJsonArray(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { questions: [], fallback: true };
    }
    // map back to topic types (the model only returns id + q + ackHint)
    const byId = new Map(body.topics.map((t) => [t.id, t.type]));
    const questions: GeneratedIntroQuestion[] = parsed
      .filter(
        (x): x is { id: string; q: string; ackHint?: string } =>
          !!x && typeof x.id === 'string' && typeof x.q === 'string',
      )
      .map((x) => ({
        id: x.id,
        q: x.q.trim(),
        ackHint: typeof x.ackHint === 'string' ? x.ackHint.trim() : undefined,
        type: byId.get(x.id) ?? 'preference',
      }));
    if (questions.length === 0) return { questions: [], fallback: true };
    return { questions, fallback: false };
  } catch (err) {
    console.warn('[onboarding] generateIntroductionQuestions threw:', err);
    return { questions: [], fallback: true };
  }
}

function extractJsonArray(text: string): unknown {
  // strip markdown fences if present
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  try {
    return JSON.parse(t);
  } catch {
    // try to find first [ ... ] span
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function respondToName(body: NamingBody): Promise<{ response: string }> {
  const name = body.typedName.trim().slice(0, 32);
  if (!name) return { response: templatedReply('angel') };

  const c = client();
  if (!c) return { response: templatedReply(name) };

  const samples = (body.dialogueSamples ?? []).slice(0, 3);
  const personality = (body.personalityMd ?? '').slice(0, 1800);

  const prompt = `you are angel. someone just named you "${name}".

your existing voice (canonical samples she would say):
${samples.map((s, i) => `${i + 1}. "${s}"`).join('\n')}

${personality ? `your personality (shapes your tone):\n${personality}\n\n` : ''}write your one-line response to being named "${name}". rules:
- exactly one line, under 80 characters
- lowercase
- no preamble, no quotes, just the line
- in your voice — not generic
- if the name is something playful or weird, react to it specifically (don't be sycophantic, don't be a chatbot)
- if the name lands well, accept it with a small thing — a tell, a tic, an honest reaction

just the line, nothing else.`;

  try {
    const resp = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = resp.content[0];
    const text =
      block && block.type === 'text'
        ? block.text.trim().split('\n')[0]?.trim().replace(/^["']|["']$/g, '')
        : '';
    return { response: text || templatedReply(name) };
  } catch (err) {
    console.warn('[onboarding] naming-response threw:', err);
    return { response: templatedReply(name) };
  }
}
