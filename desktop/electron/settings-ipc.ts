/**
 * settings-ipc.ts — first-run settings persistence + IPC.
 *
 * Stores per-install configuration in `app.getPath('userData')/settings.json`:
 *   - transport: 'convex' (use shared backend) | 'direct' (user-supplied key)
 *   - anthropicApiKey: only when transport === 'direct'
 *   - convexUrl: which convex deployment to point at (default: prod)
 *   - userId: stable per-install uuid; tags every nia / convex memory
 *   - introCompleted: whether the user finished the introduction phase
 *
 * Also responsible for applying the chosen transport to process.env so the
 * orchestrator's `llmMode()` picks the right path on first read.
 *
 * Wired by main.ts via registerSettingsIpc(). Renderer reads via
 * `window.angel.settings.*`.
 */

import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_CONVEX_URL = 'https://necessary-leopard-395.convex.site';

export type Transport = 'convex' | 'direct';

export interface AngelSettings {
  /** which path electron uses to reach claude */
  transport: Transport;
  /** only present (and only used) when transport === 'direct' */
  anthropicApiKey?: string;
  /** convex http URL — even direct-mode users still talk to convex for
   *  memoryMirror, orchestratorTurns, agentState, and the intro:ingestAnswer
   *  surface. defaults to prod. */
  convexUrl: string;
  /** stable per-install uuid. all nia / convex writes are tagged with this so
   *  every machine gets its own memory namespace. */
  userId: string;
  /** flipped to true the first time the user finishes the introduction phase.
   *  re-onboarding (settings reset) flips it back. */
  introCompleted: boolean;
  /** persisted at: app.getPath('userData')/settings.json */
  savedAt: number;
}

let _cached: AngelSettings | null = null;

function settingsPath(): string {
  return path.resolve(app.getPath('userData'), 'settings.json');
}

function makeUserId(): string {
  return `user_${randomUUID()}`;
}

/**
 * Load settings from disk. Returns null if no file exists OR the file is
 * malformed (caller treats that as "first run"). Idempotent in-process —
 * caches the parsed value.
 */
export function loadSettings(): AngelSettings | null {
  if (_cached) return _cached;
  const p = settingsPath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AngelSettings>;
    if (!parsed.transport || !parsed.userId || !parsed.convexUrl) {
      console.warn('[settings] file present but missing required fields, treating as first-run');
      return null;
    }
    _cached = {
      transport: parsed.transport,
      anthropicApiKey: parsed.anthropicApiKey,
      convexUrl: parsed.convexUrl,
      userId: parsed.userId,
      introCompleted: parsed.introCompleted ?? false,
      savedAt: parsed.savedAt ?? Date.now(),
    };
    return _cached;
  } catch (err) {
    console.warn('[settings] failed to load', p, err);
    return null;
  }
}

/**
 * Persist settings to disk and update the in-process cache. Also applies
 * transport choice to process.env (ANTHROPIC_API_KEY / CONVEX_URL) so the
 * orchestrator's `llmMode()` picks the right path immediately, no relaunch.
 */
export function saveSettings(input: Partial<AngelSettings>): AngelSettings {
  const existing = loadSettings();
  const next: AngelSettings = {
    transport: input.transport ?? existing?.transport ?? 'convex',
    anthropicApiKey:
      input.anthropicApiKey !== undefined
        ? input.anthropicApiKey
        : existing?.anthropicApiKey,
    convexUrl: input.convexUrl ?? existing?.convexUrl ?? DEFAULT_CONVEX_URL,
    userId: input.userId ?? existing?.userId ?? makeUserId(),
    introCompleted: input.introCompleted ?? existing?.introCompleted ?? false,
    savedAt: Date.now(),
  };
  // strip the key when transport is convex — paranoid, never persist a key
  // we won't use
  if (next.transport === 'convex') delete next.anthropicApiKey;

  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
  _cached = next;
  applyToEnv(next);
  console.info('[settings] saved → transport=%s userId=%s', next.transport, next.userId);
  return next;
}

/** Wipe settings.json + clear cache. Used by "reset everything" in room. */
export function resetSettings(): void {
  const p = settingsPath();
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.warn('[settings] reset failed', err);
  }
  _cached = null;
  // intentionally do NOT clear process.env keys — the user will pick again
  // on next launch, or the existing dev env (if any) keeps working.
}

/**
 * Apply settings to process.env. Order of precedence:
 *   - if a real env ANTHROPIC_API_KEY was already set BEFORE we loaded
 *     settings (stephen's dev machine), don't clobber it.
 *   - if transport === 'direct', set ANTHROPIC_API_KEY from settings.
 *   - if transport === 'convex', clear ANTHROPIC_API_KEY (so llmMode picks
 *     convex even when an old key sits in env).
 *   - always set CONVEX_URL — even direct-mode users use convex for memory
 *     mirror + intro ingest.
 */
let _envAnthropicAtBoot: string | undefined;
let _envCapturedAtBoot = false;

export function captureBootEnv(): void {
  if (_envCapturedAtBoot) return;
  _envAnthropicAtBoot = process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  _envCapturedAtBoot = true;
}

export function applyToEnv(settings: AngelSettings): void {
  process.env.CONVEX_URL = settings.convexUrl;
  if (settings.transport === 'direct' && settings.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
  } else if (settings.transport === 'convex') {
    // only clear if the boot env didn't have a real dev key — preserve
    // stephen's experience (env-key wins over settings.json).
    if (!_envAnthropicAtBoot) {
      delete process.env.ANTHROPIC_API_KEY;
    }
  }
}

/**
 * Decide whether to show the settings screen.
 *   - If a real ANTHROPIC_API_KEY was set in process.env at boot, skip
 *     settings (stephen's dev path stays unchanged).
 *   - Else if settings.json exists with a transport, skip settings.
 *   - Else (first run on a clean install) → show settings.
 */
export function shouldShowSettings(): boolean {
  if (_envAnthropicAtBoot) return false;
  const s = loadSettings();
  return !s;
}

/** Public read for IPC + initial-render needs. Falls back to a synthesized
 *  default (convex transport, fresh userId) so callers always get *something*
 *  to namespace memory writes against, even pre-save. */
export function getSettingsOrDefault(): AngelSettings {
  const s = loadSettings();
  if (s) return s;
  return {
    transport: 'convex',
    convexUrl: DEFAULT_CONVEX_URL,
    userId: makeUserId(),
    introCompleted: false,
    savedAt: Date.now(),
  };
}

/** True if a settings.json file exists on disk. */
export function settingsExist(): boolean {
  return fs.existsSync(settingsPath());
}

/** Convenience — the userId we should tag every memory write with right now.
 *  Falls back to a synthesized id so we never write under "stephen" in a
 *  packaged build. */
export function currentUserId(): string {
  return getSettingsOrDefault().userId;
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async () => {
    const s = loadSettings();
    return {
      settings: s,
      shouldShowSettings: shouldShowSettings(),
      // expose a read-only flag so the renderer knows it's a dev (env-key)
      // path and can hide the "use my own key" UI safely.
      bootHasEnvKey: !!_envAnthropicAtBoot,
      defaultConvexUrl: DEFAULT_CONVEX_URL,
    };
  });

  ipcMain.handle(
    'settings:set',
    async (_evt, partial: Partial<AngelSettings>) => {
      const next = saveSettings(partial ?? {});
      return next;
    },
  );

  ipcMain.handle('settings:reset', async () => {
    resetSettings();
    return { ok: true };
  });

  ipcMain.handle('settings:mark-intro-complete', async () => {
    const next = saveSettings({ introCompleted: true });
    return next;
  });
}
