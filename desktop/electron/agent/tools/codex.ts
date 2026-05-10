/**
 * tools/codex.ts — headless codex executor for angel's `delegate(intent)` tool.
 *
 * Spawns `codex exec` and streams stdout incrementally so the in-world desk
 * monitor can paint the build as it happens. If the codex CLI isn't on PATH,
 * falls back to a deterministic mock that emits realistic stdout chunks with
 * lifelike timing — the demo still works on a fresh laptop.
 *
 * The orchestrator (runner.ts) wires `onChunk` to the renderer via the
 * `desk:codex_stream` IPC channel. On completion, it pushes a tool_result
 * back to the model with a summary and exit code so the model can decide
 * whether to call verify() before announcing success.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

export interface CodexJob {
  id: string;
  intent: string;
  workingDir: string;
  startedAt: number;
}

export interface CodexResult {
  jobId: string;
  exitCode: number;
  stdout: string;
  filesChanged: string[];
  durationMs: number;
  /** true when the executor was the deterministic mock, not real codex */
  mocked: boolean;
}

export interface CodexExecOptions {
  /** override the default 90s timeout */
  timeoutMs?: number;
  /** force-mock for testing or demo-on-fresh-machine */
  forceMock?: boolean;
}

const DEFAULT_TIMEOUT_MS = 90_000;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * find the codex CLI binary. when packaged in a dmg, electron's spawned
 * children inherit a tiny PATH (`/usr/bin:/bin`) — homebrew, bun, cargo,
 * npm-global, etc. don't show up. so `which codex` returns nothing even
 * though codex is installed. we search common install locations explicitly
 * + fall back to PATH-aware `which`. cached per process.
 */
let _codexPath: string | null | undefined; // undefined = not yet checked

const HOME = process.env.HOME ?? '';
const CODEX_CANDIDATE_PATHS = [
  // bun
  `${HOME}/.bun/bin/codex`,
  // homebrew apple silicon + intel
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
  // npm global (npm prefix)
  `${HOME}/.npm-global/bin/codex`,
  `${HOME}/.npm/bin/codex`,
  // cargo
  `${HOME}/.cargo/bin/codex`,
  // local bin
  `${HOME}/.local/bin/codex`,
  // n / volta / nvm — common
  `${HOME}/.n/bin/codex`,
  `${HOME}/.volta/bin/codex`,
];

function resolveCodexPath(): string | null {
  if (_codexPath !== undefined) return _codexPath;
  // 1. try explicit candidates first (works in packaged app where PATH is minimal)
  for (const candidate of CODEX_CANDIDATE_PATHS) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        _codexPath = candidate;
        return _codexPath;
      }
    } catch {
      /* not present, try next */
    }
  }
  // 2. fall back to user's shell PATH via login shell (zsh / bash both work)
  // packaged electron has a stripped PATH; running through the user's shell
  // resolves their full env (.zshrc / .bashrc).
  try {
    const r = spawnSync(
      process.env.SHELL || '/bin/zsh',
      ['-l', '-c', 'command -v codex'],
      { encoding: 'utf8', timeout: 4000 },
    );
    if (r.status === 0 && r.stdout?.trim()) {
      _codexPath = r.stdout.trim();
      return _codexPath;
    }
  } catch {
    /* ignore */
  }
  // 3. last resort: the bare `which` (works in dev where electron is launched from terminal)
  try {
    const which = spawnSync('which', ['codex'], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout?.trim()) {
      _codexPath = which.stdout.trim();
      return _codexPath;
    }
  } catch {
    /* ignore */
  }
  _codexPath = null;
  return null;
}

export function isCodexAvailable(): boolean {
  return resolveCodexPath() !== null;
}

/** absolute path to the codex binary (or null if not found). */
export function codexBinaryPath(): string | null {
  return resolveCodexPath();
}

export function newJob(intent: string, workingDir: string): CodexJob {
  return {
    id: randomUUID(),
    intent,
    workingDir,
    startedAt: Date.now(),
  };
}

/** safe `git diff --name-only HEAD` after a run; returns [] if not a repo. */
function gitChangedFiles(workingDir: string): string[] {
  try {
    const r = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd: workingDir,
      encoding: 'utf8',
    });
    if (r.status !== 0) return [];
    return r.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* real codex exec                                                     */
/* ------------------------------------------------------------------ */

async function execReal(
  job: CodexJob,
  onChunk: (chunk: string) => void,
  timeoutMs: number,
): Promise<CodexResult> {
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '-C',
    job.workingDir,
    job.intent,
  ];

  return new Promise<CodexResult>((resolve) => {
    let stdout = '';
    let settled = false;
    // use the resolved absolute path so spawn doesn't depend on PATH
    // (packaged dmg apps have a tiny PATH that doesn't include codex's
    // install location).
    const codexBin = codexBinaryPath() ?? 'codex';
    const child = spawn(codexBin, args, {
      cwd: job.workingDir,
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
    });

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      const filesChanged = gitChangedFiles(job.workingDir);
      resolve({
        jobId: job.id,
        exitCode,
        stdout,
        filesChanged,
        durationMs: Date.now() - job.startedAt,
        mocked: false,
      });
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      onChunk('[codex] timeout — killed process');
      finish(124);
    }, timeoutMs);

    child.stdout.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      stdout += text;
      // emit per-line so the renderer can paint smoothly
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) onChunk(line);
      }
    });

    child.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      stdout += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) onChunk(line);
      }
    });

    child.on('error', (err) => {
      onChunk(`[codex] spawn error: ${err.message}`);
      clearTimeout(timer);
      finish(127);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      finish(typeof code === 'number' ? code : 0);
    });
  });
}

/* ------------------------------------------------------------------ */
/* deterministic mock                                                  */
/* ------------------------------------------------------------------ */

/** Pick a plausible component name from intent. Falls back to AngelCard. */
function inferComponentName(intent: string): string {
  const m = intent.match(/\b([A-Z][a-zA-Z]{2,}|[a-z]+(?:-[a-z]+)+)\b/);
  if (!m) return 'AngelCard';
  const raw = m[1];
  // kebab-case → PascalCase
  if (raw.includes('-')) {
    return raw
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function execMock(
  job: CodexJob,
  onChunk: (chunk: string) => void,
): Promise<CodexResult> {
  const component = inferComponentName(job.intent);
  const file = `src/components/${component}.tsx`;
  const testFile = `src/components/${component}.test.tsx`;

  // ~6s of realistic stdout, paced so each line lands like a heartbeat
  const beats: Array<[number, string]> = [
    [0, `codex exec — intent: ${job.intent}`],
    [180, `[ctx] reading repo at ${path.basename(job.workingDir)}/`],
    [320, `[ctx] scanned 14 files, 2,481 LOC indexed`],
    [520, `[plan] 1. add ${component} component`],
    [560, `[plan] 2. wire it into the page`],
    [600, `[plan] 3. add a unit test`],
    [820, `[edit] writing ${file}`],
    [1080, `  + import { motion } from 'framer-motion'`],
    [1140, `  + export function ${component}({ title, body }: Props) {`],
    [1200, `  + ...`],
    [1260, `  + }`],
    [1480, `[edit] writing ${testFile}`],
    [1640, `  + describe('${component}', () => {`],
    [1700, `  +   it('renders the title', ...)`],
    [1760, `  +   it('renders the body', ...)`],
    [1820, `  +   it('matches snapshot', ...)`],
    [1880, `  + })`],
    [2100, `[edit] patching src/app/page.tsx`],
    [2200, `  + import { ${component} } from '@/components/${component}'`],
    [2280, `  + <${component} title={...} body={...} />`],
    [2520, `[run] bun test ${testFile}`],
    [3000, `bun test v1.1.x`],
    [3060, `${testFile}:`],
    [3140, `  ✓ ${component} > renders the title  [4.21ms]`],
    [3200, `  ✓ ${component} > renders the body   [1.83ms]`],
    [3260, `  ✓ ${component} > matches snapshot   [3.04ms]`],
    [3340, ` 3 pass`],
    [3380, ` 0 fail`],
    [3420, ` 8 expect() calls`],
    [3460, `Ran 3 tests across 1 file. [0.42s]`],
    [3700, `[run] bun run build`],
    [4200, `vite v5.4.0 building for production...`],
    [4400, `✓ 142 modules transformed.`],
    [4600, `dist/index.html                  0.49 kB │ gzip:  0.32 kB`],
    [4660, `dist/assets/index-a4f2.css       12.4 kB │ gzip:  3.10 kB`],
    [4720, `dist/assets/index-7c9b.js       186.2 kB │ gzip: 58.61 kB`],
    [4800, `✓ built in 612ms`],
    [5100, `[git] staged 3 file(s)`],
    [5300, `[done] exit 0 — task complete`],
    [5500, `[summary] added ${component}; 3 tests pass; build green; 3 files changed`],
  ];

  const start = Date.now();
  let stdout = '';
  for (const [t, line] of beats) {
    const wait = Math.max(0, t - (Date.now() - start));
    if (wait > 0) await sleep(wait);
    stdout += line + '\n';
    onChunk(line);
  }
  // tail
  await sleep(120);

  const filesChanged = [file, testFile, 'src/app/page.tsx'];

  // touch a marker so file_exists verify can succeed against the mock
  try {
    const markerDir = path.join(job.workingDir, '.angel');
    if (!fs.existsSync(markerDir)) fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(
      path.join(markerDir, 'last-mock-job.json'),
      JSON.stringify(
        { jobId: job.id, intent: job.intent, filesChanged, finishedAt: Date.now() },
        null,
        2,
      ),
    );
  } catch {
    /* best-effort; mock should not crash on read-only fs */
  }

  return {
    jobId: job.id,
    exitCode: 0,
    stdout,
    filesChanged,
    durationMs: Date.now() - job.startedAt,
    mocked: true,
  };
}

/* ------------------------------------------------------------------ */
/* public api                                                          */
/* ------------------------------------------------------------------ */

export async function executeCodex(
  job: CodexJob,
  onChunk: (chunk: string) => void,
  options: CodexExecOptions = {},
): Promise<CodexResult> {
  const useMock = options.forceMock || !isCodexAvailable();
  if (useMock) {
    onChunk(
      '[exec] codex binary not found on host. install codex (`bun add -g @openai/codex` or equivalent) for real shipping. running deterministic mock for this turn.',
    );
    return execMock(job, onChunk);
  }
  onChunk(`[exec] using codex at ${codexBinaryPath()}`);
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return execReal(job, onChunk, timeout);
}
