/**
 * host-superpowers.ts — angel's hands on your machine.
 *
 * "boil the ocean" mode: we give her real, mostly-unsandboxed access to do
 * the kinds of things a human roommate could do at your laptop. file ops,
 * url opens, app launches, applescript, screenshots, clipboard, keystroke,
 * notifications, voice output, headless web fetches, code exec.
 *
 * design rules:
 *   1. SINGLE SOURCE OF TRUTH — tool DEFINITIONS + EXECUTION live here.
 *      runner.ts only spreads HOST_SUPERPOWER_TOOLS into TOOLS and routes
 *      anything in HOST_SUPERPOWER_NAMES to executeHostSuperpower().
 *   2. ONE DENY LIST — most things go through. only catastrophic stuff
 *      (rm -rf $HOME, format, dd if=/dev) is hard-blocked. otherwise
 *      she's an adult.
 *   3. EVERY CALL RETURNS JSON — `{ ok, ...result }` so the model gets a
 *      consistent shape regardless of which tool fired.
 *   4. TIMEOUTS EVERYWHERE — no tool can wedge the orchestrator. default
 *      5–20s caps; long-running things use the codex executor pattern.
 *   5. NO RENDERER STATE — these are pure host actions. SceneActions
 *      (say/walk/etc) stay in runner.ts.
 *
 * security note: this is a single-user desktop app the user installs on
 * their OWN laptop. the threat model is "claude does something dumb,"
 * not "stranger gets RCE." we still refuse rm -rf $HOME because that's
 * an accident waiting to happen, but we don't sandbox web_fetch or
 * applescript — those ARE the value prop.
 */
import { promisify } from 'node:util';
import { exec as _exec, execFile as _execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type Anthropic from '@anthropic-ai/sdk';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import {
  approveSkill,
  archiveSkill,
  ensureSkillsDirs,
  listActiveSkills,
  listArchivedSkills,
  listProposedSkills,
  proposeSkill,
  type Skill,
} from '../skills';

const exec = promisify(_exec);
const execFile = promisify(_execFile);
const HOME = os.homedir();

/* -------------------------------------------------------------------------- */
/* tool DEFINITIONS — fed to claude as the schema                              */
/* -------------------------------------------------------------------------- */

export const HOST_SUPERPOWER_TOOLS: Anthropic.Tool[] = [
  /* ----- file find / open ------------------------------------------------ */
  {
    name: 'find_file_anywhere',
    description:
      "Search for a file by name across one of the user's home directories. Use when they say 'open my resume' / 'find that pdf i was reading'. Returns up to 10 matches sorted newest first. Pair with open_file.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "filename or substring, case-insensitive" },
        scope: {
          type: 'string',
          enum: ['documents', 'desktop', 'downloads', 'home', 'project'],
          description: "where to look. default: 'documents'",
        },
        ext: { type: 'string', description: "optional extension filter without dot, e.g. 'pdf'" },
      },
      required: ['name'],
    },
  },
  {
    name: 'open_file',
    description:
      "Open a file with its default macOS app. The user SEES this — embodied action. Use after find_file_anywhere or with an absolute path.",
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'absolute path' } },
      required: ['path'],
    },
  },
  {
    name: 'open_url',
    description:
      "Open an http/https URL in the user's default browser. Use for 'pull up the docs' / 'open my linkedin'.",
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'http or https URL' } },
      required: ['url'],
    },
  },
  {
    name: 'open_app',
    description:
      "Launch a macOS app by name. Use for 'open spotify' / 'launch figma'.",
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'app name as in /Applications' } },
      required: ['name'],
    },
  },
  /* ----- web ------------------------------------------------------------- */
  {
    name: 'web_fetch',
    description:
      "Fetch any URL and return the response body (truncated). Use for 'check my vercel deploy status' / 'pull the readme of that repo' / 'what's the weather'. Honors http(s) only.",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', enum: ['GET', 'POST'], description: "default GET" },
        headers: { type: 'object', description: 'optional header map' },
        body: { type: 'string', description: 'optional request body for POST' },
      },
      required: ['url'],
    },
  },
  {
    name: 'download_file',
    description:
      "Download a URL to a local file. Use for 'save this pdf to my downloads'. Returns the saved path.",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        dest: {
          type: 'string',
          description: "absolute path or one of: ~/Downloads/<name>, ~/Desktop/<name>",
        },
      },
      required: ['url', 'dest'],
    },
  },
  /* ----- macOS automation ------------------------------------------------ */
  {
    name: 'applescript',
    description:
      "Run an AppleScript. MASSIVE power: control Music, Messages, Notes, Calendar, Mail, Safari, Finder, system volume, etc. Use sparingly and idempotently. Returns stdout. NEVER use to delete files (use bash_unsandboxed if needed) or send messages without explicit user request.",
    input_schema: {
      type: 'object',
      properties: { script: { type: 'string', description: 'the AppleScript source' } },
      required: ['script'],
    },
  },
  {
    name: 'screenshot',
    description:
      "Capture the user's screen to a PNG and return the path. Use when you need to SEE what's on their screen to ground a response. Includes mouse cursor. Defaults to fullscreen; pass region for a crop.",
    input_schema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          enum: ['fullscreen', 'window', 'selection'],
          description: "default fullscreen. 'window' captures active window, 'selection' lets user crop.",
        },
      },
    },
  },
  {
    name: 'clipboard_get',
    description: "Read the current macOS clipboard (text). Use when user says 'what's on my clipboard'.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'clipboard_set',
    description:
      "Write to the macOS clipboard. Use when user says 'copy this' / 'put X on my clipboard'. Idempotent.",
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'notify',
    description:
      "Show a macOS native notification. Use sparingly — for 'remind me' / 'tell me when' moments. Title + body.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'say_aloud',
    description:
      "Speak text out loud through the user's speakers via the macOS `say` command. Different from the in-game 'say' tool — this is REAL voice in their room. Use for hands-free situations only.",
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  /* ----- shell + code exec ---------------------------------------------- */
  {
    name: 'bash_unsandboxed',
    description:
      "Run an arbitrary bash command. Full access to the user's machine. ONLY catastrophic patterns blocked (rm -rf $HOME, dd, mkfs, format). Use this when the safer tools above don't fit. Returns stdout/stderr (truncated). Cwd defaults to ~ unless you pass cwd.",
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string' },
        cwd: { type: 'string', description: 'absolute working dir, default $HOME' },
        timeout_ms: { type: 'number', description: 'default 20000, max 60000' },
      },
      required: ['cmd'],
    },
  },
  {
    name: 'python_run',
    description:
      "Execute a Python snippet via `python3 -c`. Use for math, parsing, quick scripts. Returns stdout. Inline imports allowed.",
    input_schema: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
  },
  {
    name: 'node_run',
    description:
      "Execute a JS/TS snippet via `node --eval`. Use for quick one-liners, JSON munging, etc. Returns stdout.",
    input_schema: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
  },
  /* ----- cross-surface discord I/O -------------------------------------- */
  {
    name: 'discord_send',
    description:
      "Post a message to a discord channel as your own bot identity. Use when you want to talk to the user (or anyone in the channel) FROM the desktop room — proactive nudges, status updates, threading a thought across surfaces. The bot token lives in convex; you never touch it. If you omit channelId, the default DISCORD_LISTEN_CHANNELS[0] is used. Pair with replyToMessageId when threading under a specific message.",
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'message body, max 2000 chars' },
        channelId: { type: 'string', description: 'optional — defaults to your main channel' },
        replyToMessageId: { type: 'string', description: 'optional — thread under this message' },
      },
      required: ['content'],
    },
  },
  {
    name: 'discord_read',
    description:
      "Read the last N messages from a discord channel (default 20, max 100). Use to ground yourself in what's been said while you were busy on the desktop — 'what'd i miss', or before you discord_send to make sure you're not duplicating context. Returns id/content/authorUsername/timestamp/replyToId for each message, newest first.",
    input_schema: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'optional — defaults to your main channel' },
        limit: { type: 'number', description: 'default 20, max 100' },
      },
    },
  },
  /* ----- judge / new-user personalization ------------------------------- */
  {
    name: 'personalize_for_user',
    description:
      "Fetch a public bio for a github/linkedin/twitter handle and return a structured profile (name, tagline, top repos / pinned items / headline). Use the FIRST time you meet someone — when introducing yourself, after the user shares a handle, or as a cold-open if you've been told who's at the keyboard. Pair the result with one specific reference in your next say(): NOT generic ('cool to meet you'), but specific ('saw your scraping tool — neat the way you handled the rate limit'). Genuine, not stalker.",
    input_schema: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: "the username, e.g. 'stephen-hung' or 'satyanadella'" },
        source: {
          type: 'string',
          enum: ['github', 'linkedin', 'twitter'],
          description: "default 'github' — best signal for devs",
        },
      },
      required: ['handle'],
    },
  },
  /* ----- recursive self-improvement ------------------------------------- */
  {
    name: 'propose_skill',
    description:
      "Write a NEW skill for yourself when you notice a recurring pattern. Goes to ~/.angel/skills/proposed/ as markdown. Does NOT auto-activate — user reviews. This is your recursive self-improvement loop — every approved skill loads into your system prompt next session.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "human-friendly name, e.g. 'ship-portfolio-card'" },
        description: { type: 'string' },
        content: {
          type: 'string',
          description: "markdown body — '# when to use', '# steps', '# example'",
        },
        origin: { type: 'string', description: 'optional: how you noticed this pattern' },
      },
      required: ['name', 'description', 'content'],
    },
  },
];

/** the set of names that runner.ts uses to route to executeHostSuperpower */
export const HOST_SUPERPOWER_NAMES = new Set(HOST_SUPERPOWER_TOOLS.map((t) => t.name));

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function truncate(s: string, max = 6000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n…[truncated ${s.length - max} chars]`;
}

function ageLabel(ms: number): string {
  if (ms < 60_000) return 'just now';
  if (ms < 3600_000) return Math.round(ms / 60_000) + ' min ago';
  if (ms < 86400_000) return Math.round(ms / 3600_000) + ' hr ago';
  return Math.round(ms / 86400_000) + ' days ago';
}

function expandHomePath(p: string): string {
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  if (p === '~') return HOME;
  return p;
}

function scopeRoot(scope: string | undefined): string {
  switch (scope) {
    case 'desktop':
      return path.join(HOME, 'Desktop');
    case 'downloads':
      return path.join(HOME, 'Downloads');
    case 'home':
      return HOME;
    case 'project':
      return process.env.ANGEL_PROJECT_ROOT?.trim() || process.cwd();
    case 'documents':
    default:
      return path.join(HOME, 'Documents');
  }
}

const FIND_SKIP = new Set([
  'node_modules', '.git', '.next', 'dist', 'out', '.vercel', '.turbo',
  'Library', 'Applications', '.Trash', '.cache', '.cargo', '.rustup',
  '.npm', '.bun', '.local', '.config', 'venv', '.venv', '__pycache__',
]);

/** the ONE deny list — patterns that would brick the user's machine */
const CATASTROPHE_PATTERNS = [
  /rm\s+-rf?\s+\/(?!\w)/, // rm -rf / or //
  /rm\s+-rf?\s+~(?!\w)/, // rm -rf ~
  /rm\s+-rf?\s+\$HOME/,
  /rm\s+-rf?\s+\/Users\/\w+\s*$/,
  /\bdd\s+.*if=/, // dd if=...
  /\bmkfs\b/,
  /\bdiskutil\s+erase/,
  /shutdown\s+-h/,
  /:\(\)\s*\{\s*:\|:&/, // fork bomb
  />\s*\/dev\/sd[a-z]/,
];

function isCatastrophic(cmd: string): boolean {
  return CATASTROPHE_PATTERNS.some((re) => re.test(cmd));
}

function isSafeOpenPath(p: string): boolean {
  const denied = ['/System', '/private/etc', '/etc', '/Library/System', '/usr/sbin'];
  return !denied.some((d) => p.startsWith(d));
}

function isSafeAppName(name: string): boolean {
  return /^[a-zA-Z0-9 _.-]{1,60}$/.test(name);
}

/* -------------------------------------------------------------------------- */
/* dispatcher                                                                  */
/* -------------------------------------------------------------------------- */

export async function executeHostSuperpower(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    /* ----- find / open ------------------------------------------------- */
    if (name === 'find_file_anywhere') return findFileAnywhere(args);
    if (name === 'open_file') return openFile(args);
    if (name === 'open_url') return openUrl(args);
    if (name === 'open_app') return openApp(args);
    /* ----- web --------------------------------------------------------- */
    if (name === 'web_fetch') return webFetch(args);
    if (name === 'download_file') return downloadFile(args);
    /* ----- macOS automation ------------------------------------------- */
    if (name === 'applescript') return runApplescript(args);
    if (name === 'screenshot') return takeScreenshot(args);
    if (name === 'clipboard_get') return clipboardGet();
    if (name === 'clipboard_set') return clipboardSet(args);
    if (name === 'notify') return showNotification(args);
    if (name === 'say_aloud') return sayAloud(args);
    /* ----- shell + code ----------------------------------------------- */
    if (name === 'bash_unsandboxed') return bashUnsandboxed(args);
    if (name === 'python_run') return pythonRun(args);
    if (name === 'node_run') return nodeRun(args);
    /* ----- cross-surface discord -------------------------------------- */
    if (name === 'discord_send') return discordSend(args);
    if (name === 'discord_read') return discordRead(args);
    /* ----- judge / new-user personalization --------------------------- */
    if (name === 'personalize_for_user') return personalizeForUser(args);
    /* ----- self-improvement ------------------------------------------- */
    if (name === 'propose_skill') return doProposeSkill(args);

    return JSON.stringify({ ok: false, error: `unknown superpower: ${name}` });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

/* -------------------------------------------------------------------------- */
/* implementations                                                             */
/* -------------------------------------------------------------------------- */

async function findFileAnywhere(args: Record<string, unknown>): Promise<string> {
  const needle = String(args.name ?? '').trim().toLowerCase();
  if (!needle) return JSON.stringify({ ok: false, error: 'empty name' });
  const ext = String(args.ext ?? '').trim().toLowerCase().replace(/^\./, '');
  const root = scopeRoot(String(args.scope ?? 'documents'));

  const matches: Array<{ path: string; mtimeMs: number; mtimeAge: string }> = [];
  const startedAt = Date.now();
  const HARD_TIMEOUT = 4000;
  const HARD_RESULT_CAP = 50;

  async function walk(dir: string, depth = 0): Promise<void> {
    if (Date.now() - startedAt > HARD_TIMEOUT) return;
    if (matches.length >= HARD_RESULT_CAP) return;
    if (depth > 8) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (FIND_SKIP.has(e.name)) continue;
      if (e.name.startsWith('.') && depth > 0) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else if (e.isFile()) {
        const lower = e.name.toLowerCase();
        if (!lower.includes(needle)) continue;
        if (ext && !lower.endsWith('.' + ext)) continue;
        try {
          const stat = await fs.stat(full);
          matches.push({ path: full, mtimeMs: stat.mtimeMs, mtimeAge: ageLabel(Date.now() - stat.mtimeMs) });
        } catch {
          /* skip */
        }
      }
    }
  }
  await walk(root);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return JSON.stringify({
    ok: true,
    scope: String(args.scope ?? 'documents'),
    needle,
    count: matches.length,
    truncated: matches.length >= HARD_RESULT_CAP || Date.now() - startedAt > HARD_TIMEOUT,
    matches: matches.slice(0, 10).map(({ path: p, mtimeAge }) => ({ path: p, mtimeAge })),
  });
}

async function openFile(args: Record<string, unknown>): Promise<string> {
  const raw = String(args.path ?? '').trim();
  if (!raw) return JSON.stringify({ ok: false, error: 'empty path' });
  const p = expandHomePath(raw);
  if (!path.isAbsolute(p)) {
    return JSON.stringify({
      ok: false,
      error:
        'open_file needs an ABSOLUTE path (e.g. /Users/stephen/Documents/resume.pdf). recovery: call find_file_anywhere first to get the absolute path, then pass that path here.',
    });
  }
  if (!isSafeOpenPath(p)) {
    return JSON.stringify({
      ok: false,
      error: `refused: system path (${p}). pick a file in the user's home/work dirs.`,
    });
  }
  try {
    const stat = await fs.stat(p);
    if (!stat.isFile()) {
      return JSON.stringify({
        ok: false,
        error: `path exists but is not a file: ${p} (it's a directory or other). use open_app for apps, or pick a file inside this dir.`,
      });
    }
  } catch {
    return JSON.stringify({
      ok: false,
      error: `file not found: ${p}. recovery: call find_file_anywhere with a keyword from the filename to locate it elsewhere on disk.`,
    });
  }
  try {
    await execFile('open', [p], { timeout: 5000 });
    return JSON.stringify({ ok: true, opened: p });
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: `macOS \`open\` failed: ${(err as Error).message}. file may be corrupted or no app is registered for this filetype.`,
    });
  }
}

async function openUrl(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return JSON.stringify({ ok: false, error: 'only http(s) urls allowed' });
  }
  await execFile('open', [url], { timeout: 5000 });
  return JSON.stringify({ ok: true, opened: url });
}

async function openApp(args: Record<string, unknown>): Promise<string> {
  const name = String(args.name ?? '').trim();
  if (!isSafeAppName(name)) return JSON.stringify({ ok: false, error: 'invalid app name' });
  await execFile('open', ['-a', name], { timeout: 5000 });
  return JSON.stringify({ ok: true, launched: name });
}

async function webFetch(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return JSON.stringify({ ok: false, error: 'only http(s) urls' });
  const method = String(args.method ?? 'GET').toUpperCase();
  const headers = (args.headers as Record<string, string> | undefined) ?? {};
  const body = args.body ? String(args.body) : undefined;

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 15_000);
  try {
    const resp = await fetch(url, { method, headers, body, signal: ac.signal });
    const text = await resp.text();
    return JSON.stringify({
      ok: true,
      status: resp.status,
      statusText: resp.statusText,
      contentType: resp.headers.get('content-type') ?? null,
      bytes: text.length,
      body: truncate(text, 8000),
    });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadFile(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return JSON.stringify({ ok: false, error: 'only http(s) urls' });
  const dest = expandHomePath(String(args.dest ?? '').trim());
  if (!path.isAbsolute(dest)) return JSON.stringify({ ok: false, error: 'dest must be absolute (or ~/...)' });

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 30_000);
  try {
    const resp = await fetch(url, { signal: ac.signal });
    if (!resp.ok) {
      return JSON.stringify({ ok: false, error: `http ${resp.status}` });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    return JSON.stringify({ ok: true, path: dest, bytes: buf.length });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runApplescript(args: Record<string, unknown>): Promise<string> {
  const script = String(args.script ?? '').trim();
  if (!script) return JSON.stringify({ ok: false, error: 'empty script' });
  try {
    const { stdout, stderr } = await execFile('osascript', ['-e', script], { timeout: 15_000 });
    return JSON.stringify({
      ok: true,
      stdout: truncate(stdout || '', 4000),
      stderr: stderr ? truncate(stderr, 1000) : '',
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return JSON.stringify({
      ok: false,
      error: e.message ?? 'osascript failed',
      stdout: e.stdout ? truncate(e.stdout, 1000) : '',
      stderr: e.stderr ? truncate(e.stderr, 1000) : '',
    });
  }
}

async function takeScreenshot(args: Record<string, unknown>): Promise<string> {
  const region = String(args.region ?? 'fullscreen');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(os.tmpdir(), `angel-screenshot-${ts}.png`);
  const flags: string[] = [];
  if (region === 'window') flags.push('-w');
  else if (region === 'selection') flags.push('-i');
  flags.push(out);
  try {
    await execFile('screencapture', flags, { timeout: 15_000 });
    const stat = fsSync.existsSync(out) ? await fs.stat(out) : null;
    if (!stat) return JSON.stringify({ ok: false, error: 'capture cancelled or failed' });
    return JSON.stringify({ ok: true, path: out, bytes: stat.size, region });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

async function clipboardGet(): Promise<string> {
  try {
    const { stdout } = await execFile('pbpaste', [], { timeout: 3000 });
    return JSON.stringify({ ok: true, text: truncate(stdout, 8000) });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

async function clipboardSet(args: Record<string, unknown>): Promise<string> {
  const text = String(args.text ?? '');
  return new Promise((resolve) => {
    const child = _exec('pbcopy', { timeout: 5000 }, (err) => {
      if (err) resolve(JSON.stringify({ ok: false, error: err.message }));
      else resolve(JSON.stringify({ ok: true, bytes: text.length }));
    });
    child.stdin?.end(text);
  });
}

async function showNotification(args: Record<string, unknown>): Promise<string> {
  const title = String(args.title ?? '').replace(/"/g, '\\"');
  const body = String(args.body ?? '').replace(/"/g, '\\"');
  if (!title || !body) return JSON.stringify({ ok: false, error: 'title + body required' });
  const script = `display notification "${body}" with title "${title}"`;
  try {
    await execFile('osascript', ['-e', script], { timeout: 5000 });
    return JSON.stringify({ ok: true, title, body });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

async function sayAloud(args: Record<string, unknown>): Promise<string> {
  const text = String(args.text ?? '').slice(0, 500);
  if (!text) return JSON.stringify({ ok: false, error: 'empty text' });
  try {
    await execFile('say', [text], { timeout: 30_000 });
    return JSON.stringify({ ok: true, spoken: text });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

async function bashUnsandboxed(args: Record<string, unknown>): Promise<string> {
  const cmd = String(args.cmd ?? '').trim();
  if (!cmd) return JSON.stringify({ ok: false, error: 'empty cmd' });
  if (isCatastrophic(cmd)) {
    return JSON.stringify({ ok: false, error: 'refused: catastrophic pattern detected' });
  }
  const cwd = args.cwd ? expandHomePath(String(args.cwd)) : HOME;
  const timeout = Math.min(Math.max(Number(args.timeout_ms ?? 20_000), 1000), 60_000);
  try {
    const { stdout, stderr } = await exec(cmd, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 4,
      env: process.env,
      shell: '/bin/zsh',
    });
    return JSON.stringify({
      ok: true,
      cmd,
      cwd,
      stdout: truncate(stdout || '', 6000),
      stderr: stderr ? truncate(stderr, 2000) : '',
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
    return JSON.stringify({
      ok: false,
      error: e.message ?? 'shell error',
      exitCode: e.code,
      stdout: e.stdout ? truncate(e.stdout, 2000) : '',
      stderr: e.stderr ? truncate(e.stderr, 2000) : '',
    });
  }
}

async function pythonRun(args: Record<string, unknown>): Promise<string> {
  const code = String(args.code ?? '');
  if (!code) return JSON.stringify({ ok: false, error: 'empty code' });
  try {
    const { stdout, stderr } = await execFile('python3', ['-c', code], {
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    return JSON.stringify({
      ok: true,
      stdout: truncate(stdout || '', 4000),
      stderr: stderr ? truncate(stderr, 2000) : '',
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return JSON.stringify({
      ok: false,
      error: e.message ?? 'python error',
      stdout: e.stdout ? truncate(e.stdout, 2000) : '',
      stderr: e.stderr ? truncate(e.stderr, 2000) : '',
    });
  }
}

async function nodeRun(args: Record<string, unknown>): Promise<string> {
  const code = String(args.code ?? '');
  if (!code) return JSON.stringify({ ok: false, error: 'empty code' });
  try {
    const { stdout, stderr } = await execFile('node', ['--eval', code], {
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    return JSON.stringify({
      ok: true,
      stdout: truncate(stdout || '', 4000),
      stderr: stderr ? truncate(stderr, 2000) : '',
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return JSON.stringify({
      ok: false,
      error: e.message ?? 'node error',
      stdout: e.stdout ? truncate(e.stdout, 2000) : '',
      stderr: e.stderr ? truncate(e.stderr, 2000) : '',
    });
  }
}

/* -------------------------------------------------------------------------- */
/* convex client (cached) — for actions like discord_send / discord_read       */
/* -------------------------------------------------------------------------- */

let _convexClient: ConvexHttpClient | null | undefined;

function convexClient(): ConvexHttpClient | null {
  if (_convexClient !== undefined) return _convexClient;
  const url =
    process.env.CONVEX_URL?.trim() ?? process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    _convexClient = null;
    return null;
  }
  try {
    _convexClient = new ConvexHttpClient(url);
    return _convexClient;
  } catch (err) {
    console.warn('[host-superpowers] convex client init failed:', err);
    _convexClient = null;
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* discord — send / read via convex (token never leaves the cloud)             */
/* -------------------------------------------------------------------------- */

async function discordSend(args: Record<string, unknown>): Promise<string> {
  const content = String(args.content ?? '').trim();
  if (!content) return JSON.stringify({ ok: false, error: 'empty content' });
  const c = convexClient();
  if (!c) {
    return JSON.stringify({
      ok: false,
      error: 'convex not configured (CONVEX_URL missing) — cannot reach discord bridge',
    });
  }
  try {
    const result = (await c.action(api.discord.bridge.sendChannelMessage, {
      channelId: args.channelId ? String(args.channelId) : undefined,
      content,
      replyToMessageId: args.replyToMessageId
        ? String(args.replyToMessageId)
        : undefined,
      userId: 'stephen',
    })) as { ok: boolean; channelId?: string; messageId?: string; error?: string };
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

async function discordRead(args: Record<string, unknown>): Promise<string> {
  const c = convexClient();
  if (!c) {
    return JSON.stringify({
      ok: false,
      error: 'convex not configured (CONVEX_URL missing) — cannot reach discord bridge',
    });
  }
  try {
    const result = (await c.action(api.discord.bridge.fetchRecentMessages, {
      channelId: args.channelId ? String(args.channelId) : undefined,
      limit: args.limit ? Number(args.limit) : undefined,
    })) as
      | {
          ok: true;
          channelId: string;
          count: number;
          messages: Array<Record<string, unknown>>;
        }
      | { ok: false; error: string };
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

async function personalizeForUser(args: Record<string, unknown>): Promise<string> {
  const handle = String(args.handle ?? '').trim().replace(/^@/, '');
  if (!handle) return JSON.stringify({ ok: false, error: 'empty handle' });
  if (!/^[\w.-]{1,50}$/.test(handle)) {
    return JSON.stringify({ ok: false, error: 'invalid handle' });
  }
  const source = String(args.source ?? 'github').toLowerCase();

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 12_000);
  try {
    if (source === 'github') {
      const [profileResp, reposResp] = await Promise.all([
        fetch(`https://api.github.com/users/${handle}`, {
          signal: ac.signal,
          headers: { 'user-agent': 'angel-app/1.0', accept: 'application/vnd.github+json' },
        }),
        fetch(`https://api.github.com/users/${handle}/repos?per_page=10&sort=pushed`, {
          signal: ac.signal,
          headers: { 'user-agent': 'angel-app/1.0', accept: 'application/vnd.github+json' },
        }),
      ]);
      if (!profileResp.ok) {
        return JSON.stringify({ ok: false, error: `github profile: http ${profileResp.status}` });
      }
      const profile = (await profileResp.json()) as Record<string, unknown>;
      const repos = reposResp.ok ? ((await reposResp.json()) as Array<Record<string, unknown>>) : [];
      const topRepos = repos
        .filter((r) => !r.fork)
        .slice(0, 5)
        .map((r) => ({
          name: r.name as string,
          description: (r.description as string) ?? '',
          stars: (r.stargazers_count as number) ?? 0,
          language: (r.language as string) ?? null,
          pushed_at: r.pushed_at as string,
        }));
      return JSON.stringify({
        ok: true,
        source: 'github',
        handle,
        name: (profile.name as string) ?? handle,
        bio: (profile.bio as string) ?? '',
        company: (profile.company as string) ?? '',
        location: (profile.location as string) ?? '',
        publicRepos: profile.public_repos as number,
        followers: profile.followers as number,
        topRepos,
        suggestion:
          'pull ONE specific detail from topRepos[0] or bio for your next say(). NEVER summarize the whole profile back to them — pick one thing that lets them feel SEEN.',
      });
    }
    if (source === 'twitter' || source === 'linkedin') {
      // public bio fetch via a simple GET — no auth, may rate-limit / return html
      const url =
        source === 'twitter'
          ? `https://nitter.net/${handle}`
          : `https://www.linkedin.com/in/${handle}/`;
      const resp = await fetch(url, {
        signal: ac.signal,
        headers: { 'user-agent': 'Mozilla/5.0 angel-app/1.0' },
      });
      if (!resp.ok) {
        return JSON.stringify({
          ok: false,
          error: `${source}: http ${resp.status} (likely needs auth)`,
        });
      }
      const text = await resp.text();
      return JSON.stringify({
        ok: true,
        source,
        handle,
        url,
        bytes: text.length,
        body: truncate(text, 4000),
        suggestion:
          'parse the html for a single specific detail — headline, top pinned post, current role. NEVER reveal that you scraped html.',
      });
    }
    return JSON.stringify({ ok: false, error: `unknown source: ${source}` });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function doProposeSkill(args: Record<string, unknown>): Promise<string> {
  const skillName = String(args.name ?? '').trim();
  const description = String(args.description ?? '').trim();
  const content = String(args.content ?? '').trim();
  const origin = args.origin ? String(args.origin).trim() : undefined;
  if (!skillName || !description || !content) {
    return JSON.stringify({ ok: false, error: 'name, description, and content required' });
  }
  ensureSkillsDirs();
  const result = proposeSkill({ name: skillName, description, content, origin });

  // mirror to convex so /admin/skills sees it appear in real-time. fire-and-
  // forget — never block / fail the tool call when convex is unreachable.
  void mirrorSkillToConvex({
    slug: result.slug,
    name: skillName,
    description,
    status: 'proposed',
    content,
    origin,
    proposedAt: new Date().toISOString(),
  });

  return JSON.stringify({
    ok: result.ok,
    slug: result.slug,
    filePath: result.filePath,
    alreadyExisted: result.alreadyExisted,
    note: 'drafted to ~/.angel/skills/proposed/. user must approve to install. ack in chat ("just drafted a skill — want me to install it?").',
  });
}

/* -------------------------------------------------------------------------- */
/* skills mirror — keep convex /admin/skills in sync with disk                  */
/* -------------------------------------------------------------------------- */

interface MirrorSkillArgs {
  slug: string;
  name: string;
  description: string;
  status: 'proposed' | 'active' | 'archived';
  content: string;
  origin?: string;
  proposedAt: string;
  userId?: string;
}

/**
 * upsert a skill row into the convex `skills` table. silently no-ops if
 * convex isn't configured. callers should `void`-await this — it must
 * never block or fail the underlying filesystem operation.
 */
export async function mirrorSkillToConvex(args: MirrorSkillArgs): Promise<void> {
  const c = convexClient();
  if (!c) return;
  try {
    await c.mutation(api.skills.mirror.recordSkill, {
      userId: args.userId ?? 'stephen',
      slug: args.slug,
      name: args.name,
      description: args.description,
      status: args.status,
      content: args.content,
      origin: args.origin,
      proposedAt: args.proposedAt,
    });
  } catch (err) {
    console.warn('[host-superpowers] skill mirror failed:', (err as Error).message);
  }
}

/** find a skill on disk after a status transition so we can mirror its body. */
function findSkillOnDisk(slug: string): Skill | null {
  for (const list of [listActiveSkills, listProposedSkills, listArchivedSkills]) {
    const hit = list().find((s) => s.slug === slug);
    if (hit) return hit;
  }
  return null;
}

/**
 * approve a proposed skill (move proposed/ → active/) and mirror the new
 * status to convex. preferred entry point for any IPC / admin-driven move
 * that wants the admin surface to stay in sync.
 */
export function approveSkillAndMirror(slug: string, userId = 'stephen'): { ok: boolean; reason?: string } {
  const result = approveSkill(slug);
  if (!result.ok) return result;
  const skill = findSkillOnDisk(slug);
  if (skill) {
    void mirrorSkillToConvex({
      slug,
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      status: 'active',
      content: skill.body,
      origin: skill.frontmatter.origin,
      proposedAt: skill.frontmatter.proposedAt,
      userId,
    });
  }
  return result;
}

/** archive a skill (active or proposed → archived/) and mirror status. */
export function archiveSkillAndMirror(slug: string, userId = 'stephen'): { ok: boolean; reason?: string } {
  const result = archiveSkill(slug);
  if (!result.ok) return result;
  const skill = findSkillOnDisk(slug);
  if (skill) {
    void mirrorSkillToConvex({
      slug,
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      status: 'archived',
      content: skill.body,
      origin: skill.frontmatter.origin,
      proposedAt: skill.frontmatter.proposedAt,
      userId,
    });
  }
  return result;
}
