/**
 * Vision-tagging pipeline for the avatar library.
 *
 * Reads avatar entries (with thumbnail URLs), downloads a static frame for each,
 * sends to Claude Haiku 4.5 with vision + tool-use for structured tagging,
 * and writes results to web/data/library.json with frequent checkpointing.
 *
 * Usage:
 *   cd web && bun run scripts/tag-library.ts [--limit=N] [--source=path/to.json] [--concurrency=10] [--retag]
 */

import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config as dotenvConfig } from 'dotenv';

const execFileP = promisify(execFile);

// ────────────────────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WEB_ROOT = path.resolve(__dirname, '..');
dotenvConfig({ path: path.join(WEB_ROOT, '.env.local') });
dotenvConfig({ path: path.join(REPO_ROOT, '.env.local') });

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY missing — set in web/.env.local');
  process.exit(1);
}

// SDK-level retries handle transient 5xx and rate-limit (429) automatically
// with exponential backoff. We layer our own retry on top for total resilience.
const client = new Anthropic({ apiKey, maxRetries: 4 });

const MODEL = 'claude-haiku-4-5-20251001';
const PRIMARY_SOURCE = path.join(WEB_ROOT, 'data', 'library_thumbnails.json');
const FALLBACK_SOURCE = path.join(REPO_ROOT, 'reference', 'oss-avatars', 'data', 'avatars.json');
const OUTPUT_PATH = path.join(WEB_ROOT, 'data', 'library.json');
const THUMB_CACHE = path.join(WEB_ROOT, 'public', 'library');
const FRAME_CACHE = path.join(WEB_ROOT, 'public', 'library', '_frames');

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface AvatarTags {
  warmth: number;
  energy: number;
  edge: number;
  sophistication: number;
  playfulness: number;
  aesthetic:
    | 'cottagecore'
    | 'tech_minimal'
    | 'y2k'
    | 'dark_academia'
    | 'sporty'
    | 'goth'
    | 'kawaii'
    | 'fantasy'
    | 'casual'
    | 'other';
  age_vibe: 'teen' | 'young_adult' | 'mature';
  hair_color: string;
  palette: [string, string, string];
  vibe_phrase: string;
  personality_blurb: string;
  dialogue_samples: string[];
  energy_descriptor: string;
  suggested_voice_cluster: 1 | 2 | 3 | 4 | 5 | 6;
  suggested_room_palette: [string, string, string];
  suggested_animation_bias: 'still' | 'slight_sway' | 'fidget' | 'expressive';
  art_quality: number;
  distinctive_features: string[];
}

interface SourceEntry {
  id: string;
  name?: string;
  thumbnail_url: string;
  description?: string;
}

interface TaggedEntry extends SourceEntry {
  thumbnail_local?: string;
  tags?: AvatarTags;
  error?: string;
  skipped_reason?: string;
  tagged_at?: string;
  input_tokens?: number;
  output_tokens?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Vision prompt (load-bearing — the qualitative fields hinge on this)
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an avatar-vibing connoisseur. You look at a 3D character thumbnail and read it the way a casting director or stylist would — fast, opinionated, specific. Your job is to produce structured tags that downstream code will use to (1) match avatars to users, (2) seed personality and dialogue, and (3) drive room/voice/animation choices.

Hard rules:
- vibe_phrase MUST be specific and quotable. 2–4 words. Image: a screenshot caption a friend would text. Examples of GOOD: "lavender-room saint", "midnight coder", "playground gremlin", "rainy-day archivist", "varsity ghost", "crystal-shop witch". Examples of BAD: "warm and friendly", "cute girl", "anime character", "stylish", "mysterious figure". If you can imagine 50 avatars sharing the phrase, it's too generic. Rewrite.
- personality_blurb describes WHO SHE IS, not how she looks. Behavior, tells, energy, micro-habits. 2–3 sentences, lowercase, present tense. Bad: "she has long pink hair and wears a school uniform". Good: "she answers questions you didn't ask. always knows the third-best song on an album. lights candles at 4pm for no reason."
- dialogue_samples: 3 lines she would actually say. Lowercase, casual, real human cadence. NOT assistant-speak. NOT wedding-toast wholesome. NOT exposition. Sound like a text message. Examples of GOOD: "lol no wait — go back, what did he say after that", "ok but objectively, this song slaps". Examples of BAD: "Hello! How can I help you today?", "I am here for you on this beautiful journey".
- energy_descriptor: 3–6 words. A feeling-tone synthesizing warmth/energy/edge. Examples: "warm but watchful", "soft static hum", "sharp and waiting", "low fire, slow burn".
- art_quality: rate the *thumbnail render* conservatively on a 0–10. 0–3 = broken/placeholder/AI-slop/low-poly nightmare. 4–5 = generic but ok. 6–7 = solid, usable. 8–10 = striking, would-screenshot. Default to 5 unless you have reason to push higher.
- All content SFW. No sexual descriptors. No profanity even for "edgy" archetypes. Sharp, not crude.
- If the image is an obvious watermark, license-restricted preview, or unreadable, set art_quality=0 and explain in distinctive_features (e.g., "unreadable", "watermarked preview").

Numeric fields (warmth, energy, edge, sophistication, playfulness): 0–10 floats are fine. Read them off the face, posture, clothing, palette. Do not bunch everything at 5 — push them apart.

aesthetic: pick the closest. 'other' is a real option for things that don't fit (mech, animal mascot, abstract).

palette: 3 dominant hex colors from the *character* (skin/hair/outfit), not the background.

suggested_voice_cluster (1–6): 1 = warm/grounded/big-sister; 2 = bright/playful/teen-coded; 3 = cool/dry/observant; 4 = soft/whispery/dreamy; 5 = sharp/quick/witty; 6 = low/measured/old-soul. Pick the fit, not the average.

suggested_room_palette: 3 hex codes for the room she'd live in. Doesn't have to match her clothes — can be aspirational or thematic.

suggested_animation_bias: how she'd idle. still = barely moves. slight_sway = breathes. fidget = touches hair, shifts weight. expressive = full body language.

distinctive_features: free-form list of *things you can see*. Cat ears, glasses, scar, ribbon, headphones, freckles, missing arm, etc. Be specific. Skip if nothing distinctive.

Output via the emit_tags tool. Do not narrate or apologize. Tag and move on.`;

// ────────────────────────────────────────────────────────────────────────────
// Tool schema
// ────────────────────────────────────────────────────────────────────────────

const TOOL_SCHEMA: Anthropic.Tool = {
  name: 'emit_tags',
  description: 'Emit the structured tag set for the avatar shown in the image.',
  input_schema: {
    type: 'object',
    properties: {
      warmth: { type: 'number', minimum: 0, maximum: 10 },
      energy: { type: 'number', minimum: 0, maximum: 10 },
      edge: { type: 'number', minimum: 0, maximum: 10 },
      sophistication: { type: 'number', minimum: 0, maximum: 10 },
      playfulness: { type: 'number', minimum: 0, maximum: 10 },
      aesthetic: {
        type: 'string',
        enum: [
          'cottagecore',
          'tech_minimal',
          'y2k',
          'dark_academia',
          'sporty',
          'goth',
          'kawaii',
          'fantasy',
          'casual',
          'other',
        ],
      },
      age_vibe: { type: 'string', enum: ['teen', 'young_adult', 'mature'] },
      hair_color: { type: 'string' },
      palette: {
        type: 'array',
        items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        minItems: 3,
        maxItems: 3,
      },
      vibe_phrase: { type: 'string', minLength: 4, maxLength: 60 },
      personality_blurb: { type: 'string', minLength: 30, maxLength: 600 },
      dialogue_samples: {
        type: 'array',
        items: { type: 'string', minLength: 2, maxLength: 200 },
        minItems: 3,
        maxItems: 3,
      },
      energy_descriptor: { type: 'string', minLength: 5, maxLength: 80 },
      suggested_voice_cluster: { type: 'integer', minimum: 1, maximum: 6 },
      suggested_room_palette: {
        type: 'array',
        items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        minItems: 3,
        maxItems: 3,
      },
      suggested_animation_bias: {
        type: 'string',
        enum: ['still', 'slight_sway', 'fidget', 'expressive'],
      },
      art_quality: { type: 'number', minimum: 0, maximum: 10 },
      distinctive_features: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'warmth',
      'energy',
      'edge',
      'sophistication',
      'playfulness',
      'aesthetic',
      'age_vibe',
      'hair_color',
      'palette',
      'vibe_phrase',
      'personality_blurb',
      'dialogue_samples',
      'energy_descriptor',
      'suggested_voice_cluster',
      'suggested_room_palette',
      'suggested_animation_bias',
      'art_quality',
      'distinctive_features',
    ],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Image fetching and frame extraction
// ────────────────────────────────────────────────────────────────────────────

async function downloadIfMissing(url: string, dest: string): Promise<void> {
  if (existsSync(dest) && statSync(dest).size > 200) return;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error(`tiny payload (${buf.length}b) for ${url}`);
  await fs.writeFile(dest, buf);
}

async function ensureJpegFrame(srcPath: string, frameOut: string): Promise<string> {
  if (existsSync(frameOut) && statSync(frameOut).size > 200) return frameOut;
  // ffmpeg works for gif, webp, png, jpg; pull frame 0, downscale long edge to 384.
  // 384px long edge keeps the image readable for vibe-tagging while cutting
  // input tokens ~4x vs 768px — critical for staying under per-minute rate limits.
  await execFileP('ffmpeg', [
    '-y',
    '-i',
    srcPath,
    '-frames:v',
    '1',
    '-vf',
    "scale='if(gt(iw,ih),384,-2)':'if(gt(iw,ih),-2,384)':flags=lanczos",
    '-q:v',
    '5',
    frameOut,
  ]);
  return frameOut;
}

function detectMediaType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return 'image/jpeg';
}

// ────────────────────────────────────────────────────────────────────────────
// Vision call
// ────────────────────────────────────────────────────────────────────────────

async function tagOne(entry: SourceEntry): Promise<TaggedEntry> {
  const safeId = entry.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = guessExt(entry.thumbnail_url) ?? 'gif';
  const rawPath = path.join(THUMB_CACHE, `${safeId}.${ext}`);
  const framePath = path.join(FRAME_CACHE, `${safeId}.jpg`);

  try {
    await downloadIfMissing(entry.thumbnail_url, rawPath);
    await ensureJpegFrame(rawPath, framePath);
  } catch (err) {
    return { ...entry, error: `image-prep: ${(err as Error).message}` };
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(framePath);
  } catch (err) {
    return { ...entry, error: `read-frame: ${(err as Error).message}` };
  }

  const mediaType = detectMediaType(buf);
  const b64 = buf.toString('base64');

  const userPreface = entry.name
    ? `Avatar nominal name (creator-supplied, may be lazy/auto-generated — don't trust it): "${entry.name}". Ignore the name if the image disagrees.`
    : `No name provided. Read the image only.`;

  let resp: Anthropic.Message;
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'emit_tags' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: b64 },
            },
            { type: 'text', text: userPreface },
          ],
        },
      ],
    });
  } catch (err) {
    return { ...entry, error: `api: ${(err as Error).message}`, thumbnail_local: framePath };
  }

  const toolBlock = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolBlock) {
    return {
      ...entry,
      error: 'no_tool_use',
      thumbnail_local: framePath,
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
    };
  }

  const tags = toolBlock.input as AvatarTags;

  // Defensive: occasionally Haiku bleeds XML-style tool wrapper into the
  // vibe_phrase string. Salvage by extracting the prefix + back-filling
  // personality_blurb if it's missing.
  if (tags.vibe_phrase && tags.vibe_phrase.includes('<')) {
    const m = tags.vibe_phrase.match(
      /^(.+?)<\/[^>]+>\s*<parameter\s+name="personality_blurb">([\s\S]+?)(?:<\/parameter>|$)/
    );
    if (m) {
      tags.vibe_phrase = m[1].trim();
      if (!tags.personality_blurb) {
        tags.personality_blurb = m[2].trim().replace(/<\/parameter>$/, '').trim();
      }
    } else {
      tags.vibe_phrase = tags.vibe_phrase.split('<')[0].trim();
    }
  }

  return {
    ...entry,
    thumbnail_local: path.relative(WEB_ROOT, framePath),
    tags,
    tagged_at: new Date().toISOString(),
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
  };
}

function guessExt(url: string): string | null {
  const m = url.match(/\.(gif|png|jpe?g|webp)(\?|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Concurrency pool
// ────────────────────────────────────────────────────────────────────────────

async function pool<T, U>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<U>, onResult?: (result: U, idx: number) => void): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      try {
        const res = await fn(items[idx], idx);
        results[idx] = res;
        onResult?.(res, idx);
      } catch (err) {
        // shouldn't happen — fn catches its own — but be defensive
        results[idx] = { error: (err as Error).message } as unknown as U;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  limit?: number;
  source?: string;
  concurrency: number;
  retag: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = { concurrency: 10, retag: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--limit=')) args.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith('--source=')) args.source = a.slice(9);
    else if (a.startsWith('--concurrency=')) args.concurrency = parseInt(a.slice(14), 10);
    else if (a === '--retag') args.retag = true;
  }
  return args;
}

async function loadSource(args: CliArgs): Promise<SourceEntry[]> {
  let sourcePath: string;
  if (args.source) {
    sourcePath = path.isAbsolute(args.source) ? args.source : path.resolve(args.source);
  } else if (existsSync(PRIMARY_SOURCE)) {
    sourcePath = PRIMARY_SOURCE;
    console.log(`source: ${sourcePath} (primary)`);
  } else {
    sourcePath = FALLBACK_SOURCE;
    console.log(`source: ${sourcePath} (fallback — primary library_thumbnails.json not found)`);
  }
  const raw = await fs.readFile(sourcePath, 'utf8');
  const data = JSON.parse(raw) as Array<Record<string, unknown>>;

  // Normalize to {id, name, thumbnail_url}
  const entries: SourceEntry[] = data
    .map((e, i) => {
      const id = (e.id ?? e.vroid_id ?? `entry-${i}`) as string;
      const name = (e.name ?? e.title) as string | undefined;
      const thumb =
        (e.thumbnail_url as string | undefined) ??
        (e.thumbnail as string | undefined) ??
        (e.image_url as string | undefined);
      if (!thumb) return null;
      return { id, name, thumbnail_url: thumb };
    })
    .filter((x): x is SourceEntry => Boolean(x));

  return entries;
}

async function loadExisting(): Promise<Record<string, TaggedEntry>> {
  if (!existsSync(OUTPUT_PATH)) return {};
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    const list = JSON.parse(raw) as TaggedEntry[];
    return Object.fromEntries(list.map((e) => [e.id, e]));
  } catch {
    return {};
  }
}

async function checkpoint(map: Record<string, TaggedEntry>): Promise<void> {
  const arr = Object.values(map);
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(arr, null, 2));
}

async function main() {
  const args = parseArgs();
  await fs.mkdir(THUMB_CACHE, { recursive: true });
  await fs.mkdir(FRAME_CACHE, { recursive: true });
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

  const source = await loadSource(args);
  const existing = await loadExisting();

  let queue = source;
  if (!args.retag) {
    queue = source.filter((e) => {
      const prior = existing[e.id];
      // Re-attempt only if not present, or previously errored
      return !prior || (!prior.tags && !prior.skipped_reason);
    });
  }
  if (args.limit) queue = queue.slice(0, args.limit);

  console.log(
    `total source: ${source.length}  already-tagged: ${
      Object.values(existing).filter((e) => e.tags).length
    }  to-process: ${queue.length}  concurrency: ${args.concurrency}`
  );

  if (queue.length === 0) {
    console.log('nothing to do.');
    return;
  }

  let done = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const start = Date.now();
  const checkpointEvery = 20;
  let sinceCheckpoint = 0;

  await pool(queue, args.concurrency, tagOne, async (result) => {
    existing[result.id] = result;
    done++;
    sinceCheckpoint++;
    if (result.input_tokens) inputTokens += result.input_tokens;
    if (result.output_tokens) outputTokens += result.output_tokens;
    const tag = result.tags;
    const status = result.error
      ? `ERR ${result.error}`
      : tag
      ? `q=${tag.art_quality} "${tag.vibe_phrase}"`
      : 'no-tags';
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${done}/${queue.length} ${elapsed}s] ${result.id.slice(0, 12)}  ${status}`);
    if (sinceCheckpoint >= checkpointEvery) {
      sinceCheckpoint = 0;
      await checkpoint(existing);
      console.log(`  ↳ checkpoint @ ${done}`);
    }
  });

  await checkpoint(existing);

  console.log('\n──────── done ────────');
  console.log(`tagged: ${done}/${queue.length}`);
  console.log(`tokens: in=${inputTokens.toLocaleString()} out=${outputTokens.toLocaleString()}`);
  console.log(`output: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
