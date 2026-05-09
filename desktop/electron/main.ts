import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerProtocolHandler, parseClaimFromArgs } from './persona/claim';
import type { SceneAction, SceneActionComplete, ClaimTokenPayload } from '@angel/shared';
import { runMockOrchestrator, registerMockHandlers, bootAutonomyBeat } from './agent/mock';

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
      runMockOrchestrator({
        text,
        send: (action: SceneAction) => mainWindow?.webContents.send('scene:action', action),
        sendChat: (token) => mainWindow?.webContents.send('chat:token', token),
        sendState: (patch) => mainWindow?.webContents.send('state:update', patch),
      });
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
