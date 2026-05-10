/**
 * swipe-ipc.ts — IPC handlers for the in-electron onboarding (swipe + reveal).
 *
 * Mirrors the behaviour of web's API routes (/api/embed, /api/synthesize-personality,
 * /api/naming-response, /api/claim) but executes in the main process so the
 * renderer can call them via `window.angel.*`.
 *
 * Wired by main.ts via registerSwipeIpc(mainWindow).
 */

import { ipcMain, type BrowserWindow } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AestheticArchetype,
  ClaimTokenPayload,
  DispositionArchetype,
  LibraryEntry,
  NumericTraits,
  PersonaTraits,
  StyleArchetype,
  VoiceCluster,
  VoiceConfig,
} from '@angel/shared';
import { PALETTE_BY_AESTHETIC, VRM_BY_AESTHETIC } from '@angel/shared';

/* ------------------------------------------------------------------ */
/* library load + filter (port of desktop/src/lib/library.ts logic)    */
/* ------------------------------------------------------------------ */

const __dirname_compat =
  typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

function loadLibrary(): LibraryEntry[] {
  const candidates = [
    // dev: electron-vite serves source from ../../electron/data/
    path.resolve(__dirname_compat, '../../electron/data/library.json'),
    // built layout: dist-electron/main/index.js → resources alongside
    path.resolve(__dirname_compat, '../data/library.json'),
    // fallback: process.cwd()/electron/data/library.json
    path.resolve(process.cwd(), 'electron/data/library.json'),
    // fallback: process.cwd()/desktop/electron/data/library.json
    path.resolve(process.cwd(), 'desktop/electron/data/library.json'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw) as LibraryEntry[];
    } catch (err) {
      console.warn('[swipe-ipc] failed to parse', file, err);
    }
  }
  console.error(
    '[swipe-ipc] library.json not found. run `bun run scripts/sync-library.ts` from desktop/.',
  );
  return [];
}

function isVroidHubId(id: string): boolean {
  return /^\d{15,20}$/.test(id);
}

const ALL = loadLibrary();
const DEMO_LIBRARY: LibraryEntry[] = ALL.filter(
  (e) =>
    e.tags && isVroidHubId(e.id) && e.tags.art_quality >= 6 && e.tags.aesthetic !== 'other',
);
const BY_ID = new Map<string, LibraryEntry>(DEMO_LIBRARY.map((e) => [e.id, e]));

const AESTHETIC_TO_ARCHETYPE: Record<LibraryEntry['tags']['aesthetic'], AestheticArchetype> = {
  cottagecore: 'A1',
  kawaii: 'A1',
  fantasy: 'A1',
  tech_minimal: 'A2',
  sporty: 'A2',
  casual: 'A2',
  y2k: 'A3',
  goth: 'A3',
  dark_academia: 'A4',
  other: 'A1',
};

function archetypeOf(entry: LibraryEntry): AestheticArchetype {
  return AESTHETIC_TO_ARCHETYPE[entry.tags.aesthetic] ?? 'A1';
}

function distance(a: NumericTraits, b: NumericTraits): number {
  const d2 =
    (a.warmth - b.warmth) ** 2 +
    (a.energy - b.energy) ** 2 +
    (a.edge - b.edge) ** 2 +
    (a.sophistication - b.sophistication) ** 2 +
    (a.playfulness - b.playfulness) ** 2;
  return Math.sqrt(d2);
}

function centroidOf(yesPicks: LibraryEntry[]): NumericTraits {
  if (yesPicks.length === 0) {
    return { warmth: 5, energy: 5, edge: 5, sophistication: 5, playfulness: 5 };
  }
  const sum = yesPicks.reduce<NumericTraits>(
    (acc, e) => ({
      warmth: acc.warmth + e.tags.warmth,
      energy: acc.energy + e.tags.energy,
      edge: acc.edge + e.tags.edge,
      sophistication: acc.sophistication + e.tags.sophistication,
      playfulness: acc.playfulness + e.tags.playfulness,
    }),
    { warmth: 0, energy: 0, edge: 0, sophistication: 0, playfulness: 0 },
  );
  const n = yesPicks.length;
  return {
    warmth: sum.warmth / n,
    energy: sum.energy / n,
    edge: sum.edge / n,
    sophistication: sum.sophistication / n,
    playfulness: sum.playfulness / n,
  };
}

const ARCHETYPE_CENTROIDS: Record<AestheticArchetype, NumericTraits> = (() => {
  const groups: Record<AestheticArchetype, LibraryEntry[]> = { A1: [], A2: [], A3: [], A4: [] };
  for (const e of DEMO_LIBRARY) groups[archetypeOf(e)].push(e);
  const out: Record<AestheticArchetype, NumericTraits> = {} as never;
  for (const slot of ['A1', 'A2', 'A3', 'A4'] as const) {
    out[slot] = centroidOf(groups[slot]);
  }
  return out;
})();

function nearestArchetype(centroid: NumericTraits): AestheticArchetype {
  let best: AestheticArchetype = 'A1';
  let bestD = Infinity;
  for (const slot of ['A1', 'A2', 'A3', 'A4'] as const) {
    const d = distance(centroid, ARCHETYPE_CENTROIDS[slot]);
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* trait → categorical + voice (port of api/embed)                     */
/* ------------------------------------------------------------------ */

function dispositionFromTraits(t: NumericTraits): DispositionArchetype {
  if (t.warmth >= 6 && t.energy <= 5) return 'B1';
  if (t.edge >= 6 && t.playfulness >= 6) return 'B2';
  if (t.warmth >= 5 && t.energy <= 4 && t.sophistication <= 6) return 'B3';
  return 'B4';
}

function styleFromTraits(t: NumericTraits): StyleArchetype {
  if (t.sophistication >= 6 && t.energy <= 5) return 'C1';
  if (t.energy >= 7 && t.edge >= 5) return 'C2';
  if (t.playfulness >= 7) return 'C3';
  return 'C4';
}

function voiceClusterFromTraits(t: NumericTraits): VoiceCluster {
  if (t.warmth >= 7 && t.edge <= 4) return t.energy >= 6 ? 5 : 1;
  if (t.playfulness >= 7 && t.energy >= 6) return 3;
  if (t.sophistication >= 7 && t.energy <= 4) return 4;
  if (t.edge >= 7) return 6;
  return 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(t: number, a: number, b: number): number {
  return a + (b - a) * t;
}

function vowelFromTraits(t: NumericTraits): VoiceConfig['vowel_bias'] {
  if (t.playfulness >= 7) return 'i';
  if (t.warmth >= 7) return 'a';
  if (t.sophistication >= 7) return 'e';
  if (t.edge >= 7) return 'u';
  return 'mixed';
}

function voiceConfigFromTraits(t: NumericTraits, suggested?: VoiceCluster): VoiceConfig {
  const n = (x: number) => clamp(x / 10, 0, 1);
  const w = n(t.warmth);
  const e = n(t.energy);
  const ed = n(t.edge);
  const s = n(t.sophistication);
  const p = n(t.playfulness);
  return {
    base_cluster: suggested ?? voiceClusterFromTraits(t),
    pitch_variance: lerp(w * 0.7 + p * 0.3, 0.05, 0.28),
    speed: lerp(e, 0.78, 1.22),
    syllable_count: Math.round(lerp(p * 0.6 + e * 0.4, 4, 11)),
    pause_density: lerp(1 - e, 0.05, 0.85),
    attack: lerp(ed, 0.2, 0.95),
    decay: lerp(1 - ed, 0.2, 0.85),
    glissando: lerp(w * 0.5 + p * 0.5, 0.1, 0.85),
    vowel_bias: vowelFromTraits(t),
    breathiness: lerp(w * 0.7 + (1 - ed) * 0.3, 0.05, 0.7),
  };
}

/* ------------------------------------------------------------------ */
/* synthesis prompt + fallbacks                                        */
/* ------------------------------------------------------------------ */

const PROMPT_PATHS = [
  path.resolve(__dirname_compat, '../../electron/agent/personality_synthesis.prompt.md'),
  path.resolve(__dirname_compat, '../agent/personality_synthesis.prompt.md'),
  path.resolve(process.cwd(), 'electron/agent/personality_synthesis.prompt.md'),
  path.resolve(process.cwd(), 'desktop/electron/agent/personality_synthesis.prompt.md'),
];
const FALLBACK_DIRS = [
  path.resolve(__dirname_compat, '../../electron/agent/personality_examples'),
  path.resolve(__dirname_compat, '../agent/personality_examples'),
  path.resolve(process.cwd(), 'electron/agent/personality_examples'),
  path.resolve(process.cwd(), 'desktop/electron/agent/personality_examples'),
];

function loadPrompt(): string {
  for (const file of PROMPT_PATHS) {
    if (fs.existsSync(file)) {
      try {
        return fs.readFileSync(file, 'utf-8');
      } catch {
        /* try next */
      }
    }
  }
  return '';
}

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

function fallbackFor(archetype: AestheticArchetype): string {
  const file = ({
    A1: '06_cute_warm_playful.md',
    A2: '07_pretty_sharp_competent.md',
    A3: '08_hot_confident_burning.md',
    A4: '04_composed_dreamy.md',
  } as const)[archetype];
  for (const dir of FALLBACK_DIRS) {
    const f = path.join(dir, file);
    if (fs.existsSync(f)) {
      try {
        return fs.readFileSync(f, 'utf-8');
      } catch {
        /* try next */
      }
    }
  }
  return 'angel is here. she watches more than she speaks. she will know if you skip dinner.';
}

interface SynthArgs {
  numericTraits: NumericTraits;
  traits: PersonaTraits;
  archetype: AestheticArchetype;
  dialogueSamples: string[];
  bodyDescription?: string;
}

function buildSynthPrompt(body: SynthArgs): string {
  const tmpl = loadPrompt();
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
/* IPC payload types                                                   */
/* ------------------------------------------------------------------ */

interface PickInput {
  vroid_id: string;
  decision: 'yes' | 'no';
  round: 1 | 2 | 3;
}

interface EmbedRequest {
  picks: PickInput[];
}

interface EmbedResponse {
  numericTraits: NumericTraits;
  voiceConfig: VoiceConfig;
  traits: PersonaTraits;
  archetype: AestheticArchetype;
  vrmUrl: string;
  paletteHex: string;
  dialogueSamples: string[];
  heroCard: {
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
  };
  yesIds: string[];
}

interface NamingArgs {
  typedName: string;
  personalityMd?: string;
  dialogueSamples?: string[];
}

/* ------------------------------------------------------------------ */
/* persona application (after-claim wiring)                            */
/* ------------------------------------------------------------------ */

type PersonaApplier = (claim: ClaimTokenPayload) => void;

let _onPersonaComplete: PersonaApplier | null = null;
export function setPersonaApplier(fn: PersonaApplier): void {
  _onPersonaComplete = fn;
}

/* ------------------------------------------------------------------ */
/* register handlers                                                   */
/* ------------------------------------------------------------------ */

export function registerSwipeIpc(getWindow: () => BrowserWindow | null): void {
  // ---- swipe:embed ----
  ipcMain.handle('swipe:embed', async (_evt, body: EmbedRequest): Promise<EmbedResponse> => {
    const yesEntries = (body?.picks ?? [])
      .filter((p) => p.decision === 'yes')
      .map((p) => BY_ID.get(p.vroid_id))
      .filter((x): x is LibraryEntry => Boolean(x));

    if (yesEntries.length === 0) {
      throw new Error('no yes-swipes');
    }

    const numericTraits = centroidOf(yesEntries);
    const archetype = nearestArchetype(numericTraits);
    const voiceCluster = voiceClusterFromTraits(numericTraits);
    const voiceConfig = voiceConfigFromTraits(numericTraits, voiceCluster);

    const traits: PersonaTraits = {
      aesthetic: archetype,
      disposition: dispositionFromTraits(numericTraits),
      style: styleFromTraits(numericTraits),
      voice_cluster: voiceCluster,
    };

    const heroCard = [...yesEntries].sort(
      (a, b) => b.tags.art_quality - a.tags.art_quality,
    )[0]!;
    const heroVoiceConfig = voiceConfigFromTraits(
      {
        warmth: heroCard.tags.warmth,
        energy: heroCard.tags.energy,
        edge: heroCard.tags.edge,
        sophistication: heroCard.tags.sophistication,
        playfulness: heroCard.tags.playfulness,
      },
      heroCard.tags.suggested_voice_cluster,
    );

    return {
      numericTraits,
      voiceConfig,
      traits,
      archetype,
      vrmUrl: VRM_BY_AESTHETIC[archetype],
      paletteHex: PALETTE_BY_AESTHETIC[archetype],
      dialogueSamples: heroCard.tags.dialogue_samples,
      heroCard: {
        id: heroCard.id,
        name: heroCard.name,
        thumbnailUrl: `/library/_portraits/${heroCard.id}.jpg`,
        vibePhrase: heroCard.tags.vibe_phrase,
        personalityBlurb: heroCard.tags.personality_blurb,
        energyDescriptor: heroCard.tags.energy_descriptor,
        dialogueSamples: heroCard.tags.dialogue_samples,
        voiceConfig: heroVoiceConfig,
        palette: heroCard.tags.palette,
        aesthetic: heroCard.tags.aesthetic,
        hairColor: heroCard.tags.hair_color,
      },
      yesIds: yesEntries.map((e) => e.id),
    };
  });

  // ---- swipe:synthesize ----
  // Streams personality.md tokens via 'swipe:synthesize_token' events.
  // Returns when stream completes (or falls back).
  ipcMain.handle(
    'swipe:synthesize',
    async (_evt, args: SynthArgs & { streamId: string }): Promise<{ ok: boolean; fallback?: boolean }> => {
      const win = getWindow();
      const send = (token: string) =>
        win?.webContents.send('swipe:synthesize_token', { streamId: args.streamId, token });
      const sendDone = (fallback: boolean) =>
        win?.webContents.send('swipe:synthesize_done', { streamId: args.streamId, fallback });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        const cached = fallbackFor(args.archetype);
        send(cached);
        sendDone(true);
        return { ok: true, fallback: true };
      }

      const prompt = buildSynthPrompt(args);
      const client = new Anthropic({ apiKey });

      try {
        const resp = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1400,
          temperature: 1.0,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of resp) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            send(event.delta.text);
          }
        }
        sendDone(false);
        return { ok: true };
      } catch (err) {
        console.warn('[swipe:synthesize] failed, using fallback:', err);
        const cached = fallbackFor(args.archetype);
        send(cached);
        sendDone(true);
        return { ok: true, fallback: true };
      }
    },
  );

  // ---- swipe:naming_response ----
  ipcMain.handle(
    'swipe:naming_response',
    async (_evt, args: NamingArgs): Promise<{ response: string }> => {
      const name = (args?.typedName ?? '').trim().slice(0, 32);
      const templated = (n: string) => `${n.trim() || 'angel'}. okay. i&rsquo;ll be that.`;
      if (!name) return { response: templated('angel') };

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return { response: templated(name) };

      const samples = (args.dialogueSamples ?? []).slice(0, 3);
      const personality = (args.personalityMd ?? '').slice(0, 1800);

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
        return { response: text || templated(name) };
      } catch (err) {
        console.warn('[swipe:naming_response] failed:', err);
        return { response: templated(name) };
      }
    },
  );

  // ---- swipe:complete ----
  // Renderer hands us the persona payload (claim-shape). We hand it to
  // the registered applier (which calls applyPersonaManual → seeds the
  // angel store + fires the boot greeting cascade after +2s).
  ipcMain.handle(
    'swipe:complete',
    async (_evt, persona: ClaimTokenPayload): Promise<{ ok: boolean }> => {
      try {
        if (_onPersonaComplete) {
          _onPersonaComplete(persona);
        } else {
          // fallback: re-emit through claim:received so renderer still picks it up
          getWindow()?.webContents.send('claim:received', persona);
        }
        return { ok: true };
      } catch (err) {
        console.error('[swipe:complete] failed:', err);
        return { ok: false };
      }
    },
  );

  console.info('[swipe-ipc] registered (library entries: %d)', DEMO_LIBRARY.length);
}
