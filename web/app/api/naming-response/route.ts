/**
 * POST /api/naming-response
 * Input: { typedName, personalityMd?, dialogueSamples? }
 * Output: { response: string }  // single-line line in her voice
 *
 * Uses claude haiku 4.5 for speed. Fallback to templated response.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

interface Body {
  typedName: string;
  personalityMd?: string;
  dialogueSamples?: string[];
}

function templated(name: string): string {
  const safe = name.trim().slice(0, 32) || 'angel';
  return `${safe}. okay. i&rsquo;ll be that.`;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ response: templated('angel') });
  }

  const name = body.typedName.trim().slice(0, 32);
  if (!name) return NextResponse.json({ response: templated('angel') });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ response: templated(name) });

  const samples = (body.dialogueSamples ?? []).slice(0, 3);
  const personality = (body.personalityMd ?? '').slice(0, 1800);

  const prompt = `you are angel. someone just named you "${name}".

your existing voice (canonical samples she would say):
${samples.map((s, i) => `${i + 1}. "${s}"`).join('\n')}

${personality ? `your personality (shapes your tone):\n${personality}\n\n` : ''}
write your one-line response to being named "${name}". rules:
- exactly one line, under 80 characters
- lowercase
- no preamble, no quotes, just the line
- in your voice — not generic
- if the name is something playful or weird, react to it specifically (don't be sycophantic, don't be a chatbot)
- if the name lands well, accept it with a small thing — a tell, a tic, an honest reaction

just the line, nothing else.`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
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
    return NextResponse.json({ response: text || templated(name) });
  } catch {
    return NextResponse.json({ response: templated(name) });
  }
}
