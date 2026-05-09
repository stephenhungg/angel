import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerProtocolHandler, parseClaimFromArgs } from './persona/claim';
import type { SceneAction, SceneActionComplete, ClaimTokenPayload } from '@angel/shared';
import { runMockOrchestrator, registerMockHandlers, bootAutonomyBeat } from './agent/mock';
import { synthesizePersonality, respondToName } from './agent/onboarding';
import {
  runOrchestrator,
  isAvailable as isBrainAvailable,
  setMemory,
  runBootGreeting,
} from './agent/runner';
import {
  buildMemory,
  memoryStatus,
  setSeedComplete,
  DEFAULT_USER_ID,
  getMemory,
} from './agent/memory';
import { seedDemoHistory } from './agent/memory/seed';
import {
  createTensorlakeClient,
  isTensorlakeConfigured,
  type TensorlakeClient,
} from './agent/tensorlake/client';
import {
  runPortfolioObservation,
  pickGreetingLine,
  setObservationMemoryWriter,
  type BgObservation,
} from './agent/tensorlake/bg-jobs';
import { registerSwipeIpc, setPersonaApplier } from './swipe-ipc';

/**
 * Tiny .env.local loader — reads desktop/.env.local before any module that
 * touches process.env (e.g., the Anthropic SDK). Skips comments + blanks.
 * Doesn't override existing real env vars (so CI / shell exports win).
 */
function loadDotEnvLocal(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    // when packaged, app.getAppPath() points at resources/app — drop a copy there if needed
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const text = fs.readFileSync(file, 'utf8');
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        // strip optional matching surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] == null) process.env[key] = value;
      }
      console.info('[env] loaded', file);
    } catch (err) {
      console.warn('[env] failed to load', file, err);
    }
  }
}

loadDotEnvLocal();

const isDev = !!process.env.ELECTRON_RENDERER_URL || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let pendingClaim: ClaimTokenPayload | null = null;

/* ------------------------------------------------------------------ */
/* Tensorlake (always-on agents track sponsor) — bg observation state  */
/* ------------------------------------------------------------------ */

let tensorlakeClient: TensorlakeClient | null = null;
let lastObservation: BgObservation | null = null;
let lastObservationAt: number | null = null;
let observationInFlight: Promise<BgObservation | null> | null = null;

/** Run the portfolio observation pipeline once, cache result for IPC.
 *  Never throws — returns null on failure (the demo's spoken greeting
 *  falls back to its canned line). */
async function runTensorlakeBgJob(): Promise<BgObservation | null> {
  if (!tensorlakeClient) tensorlakeClient = createTensorlakeClient();
  try {
    const obs = await runPortfolioObservation(tensorlakeClient);
    lastObservation = obs;
    lastObservationAt = Date.now();
    console.info(
      '[tensorlake] portfolio observation complete (backend=%s, findings=%d)',
      obs.backend,
      obs.findings.length,
    );
    return obs;
  } catch (err) {
    console.warn('[tensorlake] portfolio observation failed (non-fatal):', err);
    return null;
  }
}

const __dirname_compat =
  typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

function preloadPath(): string {
  // built layout: dist-electron/main/index.js  +  dist-electron/preload/index.js
  return path.resolve(__dirname_compat, '../preload/index.js');
}

function rendererIndex(): string {
  return path.resolve(__dirname_compat, '../renderer/index.html');
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0a14',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    // One-shot boot greeting — only when the real brain is alive (so the
    // line is generated against actual Nia recall, never a canned demo
    // beat). The primer in runner.ts tells Sonnet to greet briefly and
    // ONLY reference memory that's actually present, never to invent
    // "while you were away" activity. If brain isn't available, stay
    // silent — no canned fallback, no mock greeting.
    if (mainWindow && isBrainAvailable()) {
      const sender = {
        send: (a: SceneAction) => mainWindow?.webContents.send('scene:action', a),
        sendChat: (t: { id: string; text: string; done?: boolean }) =>
          mainWindow?.webContents.send('chat:token', t),
        sendState: (p: Record<string, unknown>) =>
          mainWindow?.webContents.send('state:update', p),
      };
      void runBootGreeting({ ...sender, userId: DEFAULT_USER_ID });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(rendererIndex());
  }

  // If a claim arrived before the window existed, deliver it now.
  if (pendingClaim) {
    mainWindow.webContents.send('claim:received', pendingClaim);
    pendingClaim = null;
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ------------------------------------------------------------------ */
/* IPC route table                                                     */
/* ------------------------------------------------------------------ */

ipcMain.handle('tool:invoke', async (_evt, payload: { name: string; args?: Record<string, unknown> }) => {
  const { name, args = {} } = payload ?? {};
  switch (name) {
    case 'chat': {
      const text = String(args.text ?? '').trim();
      if (!text) return { ok: false, error: 'empty text' };
      const ctx = {
        text,
        userId: DEFAULT_USER_ID,
        send: (action: SceneAction) => mainWindow?.webContents.send('scene:action', action),
        sendChat: (token: { id: string; text: string; done?: boolean }) =>
          mainWindow?.webContents.send('chat:token', token),
        sendState: (patch: Record<string, unknown>) =>
          mainWindow?.webContents.send('state:update', patch),
        // generic IPC pipe so delegate/verify can stream out-of-band events
        // (`desk:codex_stream`, `desk:codex_complete`, `tools:verify_result`)
        // straight to the renderer's DeskMonitor.
        emitIpc: (channel: string, payload: unknown) =>
          mainWindow?.webContents.send(channel, payload),
      };
      if (isBrainAvailable()) {
        // fire and forget — runner handles its own errors and falls back
        // to mock on auth/network failure
        void runOrchestrator(ctx);
      } else {
        runMockOrchestrator(ctx);
      }
      return { ok: true };
    }
    case 'action_complete': {
      // renderer reports completion of a scene action — relay to orchestrator
      const result = args as unknown as SceneActionComplete;
      // mock orchestrator doesn't await per-action; real orchestrator (Stephen) hooks here.
      void result;
      return { ok: true };
    }
    case 'saveInteractableDefaults': {
      // Persist the renderer's calibration snapshot to a JSON file in
      // desktop/public so it ships in the repo. The renderer also keeps
      // a localStorage copy for per-machine fine-tuning; the JSON file is
      // the durable, source-of-truth seed every machine boots from.
      try {
        const snapshot = (args as { snapshot?: unknown }).snapshot ?? {};
        const target = resolveDefaultsPath();
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(snapshot, null, 2), 'utf8');
        console.info('[main] saved interactables defaults →', target);
        return { ok: true, path: target } as const;
      } catch (err) {
        console.warn('[main] saveInteractableDefaults failed', err);
        return { ok: false, error: String(err) } as const;
      }
    }
    case 'onboarding:synthesize-personality': {
      try {
        return await synthesizePersonality(args as Parameters<typeof synthesizePersonality>[0]);
      } catch (err) {
        console.warn('[main] synthesize-personality failed', err);
        return { personalityMd: '', fallback: true, error: String(err) };
      }
    }
    case 'onboarding:naming-response': {
      try {
        return await respondToName(args as Parameters<typeof respondToName>[0]);
      } catch (err) {
        console.warn('[main] naming-response failed', err);
        return { response: '' };
      }
    }
    case 'memory_recall':
    case 'verify':
    case 'deploy':
    default:
      return { ok: false, error: `tool ${name} not implemented in mock` };
  }
});

/** Where calibration defaults live. In dev this is the in-tree
 *  `desktop/public/interactables.default.json`; in a packaged build we
 *  fall back to the user-data dir so we don't try to write into the
 *  read-only resources folder. */
function resolveDefaultsPath(): string {
  if (isDev) {
    return path.resolve(process.cwd(), 'public', 'interactables.default.json');
  }
  return path.resolve(app.getPath('userData'), 'interactables.default.json');
}

ipcMain.handle('claim:get-initial', async () => {
  return pendingClaim;
});

ipcMain.handle('tensorlake:status', async () => {
  return {
    available: tensorlakeClient !== null,
    backend: isTensorlakeConfigured() ? 'tensorlake' : 'mock',
    keyConfigured: isTensorlakeConfigured(),
    lastJobAt: lastObservationAt ?? undefined,
    lastObservation: lastObservation ?? undefined,
  } as const;
});

ipcMain.handle('tensorlake:rerun', async () => {
  // Lets /admin/space (or a CMD+I overlay) trigger a fresh observation —
  // useful for the live demo when judges ask "is it really doing the work?".
  observationInFlight = runTensorlakeBgJob();
  const obs = await observationInFlight;
  return {
    ok: obs !== null,
    backend: obs?.backend ?? null,
    findings: obs?.findings ?? [],
    suggestion: obs?.suggestion ?? '',
    producedAt: obs?.producedAt ?? null,
  };
});

ipcMain.handle('brain:status', async () => {
  const mem = await memoryStatus().catch((err) => ({
    backend: 'local' as const,
    seedComplete: false,
    entryCount: 0,
    ok: false,
    details: String((err as Error)?.message ?? err),
  }));
  return {
    source: isBrainAvailable() ? 'claude' : 'mock',
    keyConfigured: isBrainAvailable(),
    orchestrator: isBrainAvailable(),
    memory: mem,
  } as const;
});

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock(process.argv);
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const claim = parseClaimFromArgs(argv);
    if (claim) {
      if (mainWindow) mainWindow.webContents.send('claim:received', claim);
      else pendingClaim = claim;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerProtocolHandler();
    registerMockHandlers();

    // Onboarding (swipe + reveal) IPC: embed, synthesize, naming_response, complete.
    // The complete handler hands the persona to claim:received so applyClaim
    // fires through the existing personaApply cascade (boot greeting +2s, etc).
    registerSwipeIpc(() => mainWindow);
    setPersonaApplier((persona) => {
      const win = mainWindow;
      if (!win) {
        pendingClaim = persona;
        return;
      }
      win.webContents.send('claim:received', persona);
    });

    // boot-time claim from initial argv (windows/linux deep link)
    const bootClaim = parseClaimFromArgs(process.argv);
    if (bootClaim) pendingClaim = bootClaim;

    // Build memory client (Nia if NIA_API_KEY set, else local fallback) and
    // seed the demo history. This must complete BEFORE the window opens so
    // the boot greeting's recall hits seeded entries.
    try {
      const memory = buildMemory(DEFAULT_USER_ID);
      setMemory(memory);
      const wrote = await seedDemoHistory(memory, DEFAULT_USER_ID);
      setSeedComplete(true);
      console.info('[main] memory ready, seed', wrote ? 'written' : 'already-present');
    } catch (err) {
      console.error('[main] memory bootstrap failed:', err);
      setSeedComplete(false);
    }

    // Wire the tensorlake → memory bridge so completed bg observations get
    // logged as type='observation', source='tensorlake' entries. The
    // orchestrator can then recall them later ("i checked your portfolio
    // earlier and noticed X") — that's the statefulness rubric.
    setObservationMemoryWriter(async (entry) => {
      try {
        const mem = getMemory();
        await mem.remember({
          userId: DEFAULT_USER_ID,
          type: entry.type,
          content: entry.content,
          timestamp: entry.timestamp,
          metadata: { source: entry.metadata.source },
        });
      } catch (err) {
        console.warn('[tensorlake→memory] write failed (non-fatal):', err);
      }
    });

    // Kick off the portfolio bg job concurrently with window creation.
    // The ready-to-show handler awaits this promise to thread real
    // findings into the boot greeting; if it isn't done in time, the
    // greeting falls back to the canned line gracefully.
    tensorlakeClient = createTensorlakeClient();
    observationInFlight = runTensorlakeBgJob();

    await createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    });
  });

  // mac deep-link path
  app.on('open-url', (event, url) => {
    event.preventDefault();
    const claim = parseClaimFromArgs([url]);
    if (claim) {
      if (mainWindow) mainWindow.webContents.send('claim:received', claim);
      else pendingClaim = claim;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
