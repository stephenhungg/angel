/**
 * POST /api/synthesize-personality
 * Streaming. Returns the synthesized personality.md as it generates.
 *
 * Input: { numericTraits, traits, archetype, dialogueSamples[], userName? }
 * Output: SSE stream of { kind: 'token'|'done'|'error', data }
 *
 * Falls back to a cached personality_examples/*.md if the LLM call fails.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import type { AestheticArchetype, NumericTraits, PersonaTraits } from '@angel/shared';

interface Body {
  numericTraits: NumericTraits;
  traits: PersonaTraits;
  archetype: AestheticArchetype;
  dialogueSamples: string[];
  bodyDescription?: string;
  userName?: string;
}

const PROMPT_PATH = path.resolve(
  process.cwd(),
  '../desktop/electron/agent/personality_synthesis.prompt.md',
);
const FALLBACK_DIR = path.resolve(
  process.cwd(),
  '../desktop/electron/agent/personality_examples',
);

function loadPrompt(): string {
  try {
    return fs.readFileSync(PROMPT_PATH, 'utf-8');
  } catch {
    return ''; // empty prompt as last resort
  }
}

const MACRO_FROM_ARCHETYPE: Record<AestheticArchetype, 'cute' | 'pretty' | 'hot'> = {
  A1: 'cute', // cottagecore
  A2: 'pretty', // tech-minimal
  A3: 'hot', // y2k cyber
  A4: 'pretty', // dark academia
};

const ARCHETYPE_DESCRIPTION: Record<AestheticArchetype, string> = {
  A1: 'cottagecore — flowy dress, warm pastels, soft hair',
  A2: 'tech-minimal — sleek hoodie, monochrome, sharp bob',
  A3: 'y2k cyber — crop + cargos, chrome accents, dyed hair',
  A4: 'dark academia — cardigan + collar, vintage glasses',
};

function fallbackFor(archetype: AestheticArchetype): string {
  // map archetype to one of the cached examples
  const file = ({
    A1: '06_cute_warm_playful.md',
    A2: '07_pretty_sharp_competent.md',
    A3: '08_hot_confident_burning.md',
    A4: '04_composed_dreamy.md',
  } as const)[archetype];
  try {
    return fs.readFileSync(path.join(FALLBACK_DIR, file), 'utf-8');
  } catch {
    return 'angel is here. she watches more than she speaks. she will know if you skip dinner.';
  }
}

function buildPrompt(body: Body): string {
  const tmpl = loadPrompt();
  const macro = MACRO_FROM_ARCHETYPE[body.archetype];
  const samples = body.dialogueSamples.slice(0, 3);
  while (samples.length < 3) samples.push('…');
  const desc = body.bodyDescription ?? ARCHETYPE_DESCRIPTION[body.archetype];

  // Normalize 0-10 vector to 0.0-1.0 as expected by the prompt
  const n = (x: number) => (x / 10).toFixed(2);

  return tmpl
    .replace('{{MACRO}}', macro)
    .replace('{{WARMTH}}', n(body.numericTraits.warmth))
    .replace('{{ENERGY}}', n(body.numericTraits.energy))
    .replace('{{EDGE}}', n(body.numericTraits.edge))
    .replace('{{SOPHISTICATION}}', n(body.numericTraits.sophistication))
    .replace('{{EARNESTNESS}}', n(10 - body.numericTraits.edge)) // earnestness ~ inverse of edge
    .replace('{{AESTHETIC}}', body.archetype)
    .replace('{{BODY_DESCRIPTION}}', desc)
    .replace('{{SAMPLE_1}}', samples[0]!)
    .replace('{{SAMPLE_2}}', samples[1]!)
    .replace('{{SAMPLE_3}}', samples[2]!);
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      `data: ${JSON.stringify({ kind: 'token', data: fallbackFor(body.archetype) })}\n\ndata: ${JSON.stringify({ kind: 'done' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const prompt = buildPrompt(body);
  const client = new Anthropic({ apiKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        const resp = await client.messages.stream({
          model: 'claude-sonnet-4-6', // sonnet 4.6 — fast + good enough for synthesis
          max_tokens: 1400,
          temperature: 1.0,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of resp) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            send({ kind: 'token', data: event.delta.text });
          }
        }
        send({ kind: 'done' });
      } catch (err) {
        // hard fallback: dump cached example
        const cached = fallbackFor(body.archetype);
        send({ kind: 'token', data: cached });
        send({ kind: 'done', fallback: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
