import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerProtocolHandler, parseClaimFromArgs } from './persona/claim';
import type { SceneAction, SceneActionComplete, ClaimTokenPayload } from '@angel/shared';
import { runMockOrchestrator, registerMockHandlers, bootAutonomyBeat } from './agent/mock';
import { runOrchestrator, isAvailable as isBrainAvailable } from './agent/runner';

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
    // fire the 30%-weighted bg autonomy beat: avatar greets the user on
    // launch like she was watching repo activity while they were away.
    if (mainWindow) {
      void bootAutonomyBeat({
        send: (a) => mainWindow?.webContents.send('scene:action', a),
        sendChat: (t) => mainWindow?.webContents.send('chat:token', t),
        sendState: (p) => mainWindow?.webContents.send('state:update', p),
      });
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
        send: (action: SceneAction) => mainWindow?.webContents.send('scene:action', action),
        sendChat: (token: { id: string; text: string; done?: boolean }) =>
          mainWindow?.webContents.send('chat:token', token),
        sendState: (patch: Record<string, unknown>) =>
          mainWindow?.webContents.send('state:update', patch),
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
    case 'memory_recall':
    case 'verify':
    case 'deploy':
    default:
      return { ok: false, error: `tool ${name} not implemented in mock` };
  }
});

ipcMain.handle('claim:get-initial', async () => {
  return pendingClaim;
});

ipcMain.handle('brain:status', async () => {
  return {
    source: isBrainAvailable() ? 'claude' : 'mock',
    keyConfigured: isBrainAvailable(),
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

    // boot-time claim from initial argv (windows/linux deep link)
    const bootClaim = parseClaimFromArgs(process.argv);
    if (bootClaim) pendingClaim = bootClaim;

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
