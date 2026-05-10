#!/usr/bin/env bun
/**
 * sync-library.ts — copies library.json + portrait jpgs from web/ → desktop/public/library/.
 *
 * Run before `bun run dev` or `bun run build` in desktop.
 * Swipe thumbnails live under web/public/library/_portraits/<vroid-id>.jpg
 * (same paths the renderer resolves as /library/_portraits/...).
 *
 * Idempotent — only copies files that don't already exist or are stale.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(ROOT, '..');

const WEB_LIB_JSON = join(REPO_ROOT, 'web', 'data', 'library.json');
const WEB_LIB_PORTRAITS = join(REPO_ROOT, 'web', 'public', 'library', '_portraits');
const DESKTOP_LIB = join(ROOT, 'public', 'library');
const DESKTOP_LIB_JSON = join(DESKTOP_LIB, 'library.json');
const DESKTOP_LIB_PORTRAITS = join(DESKTOP_LIB, '_portraits');
// also bundled into src/ so library.ts can `import` it synchronously
const DESKTOP_SRC_DATA = join(ROOT, 'src', 'data');
const DESKTOP_SRC_LIB_JSON = join(DESKTOP_SRC_DATA, 'library.json');
// and into electron/ so the main process IPC handlers can read it too
const DESKTOP_ELECTRON_DATA = join(ROOT, 'electron', 'data');
const DESKTOP_ELECTRON_LIB_JSON = join(DESKTOP_ELECTRON_DATA, 'library.json');

function copyIfNewer(src: string, dst: string): boolean {
  if (!existsSync(src)) return false;
  if (existsSync(dst)) {
    const a = statSync(src).mtimeMs;
    const b = statSync(dst).mtimeMs;
    if (b >= a) return false;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  return true;
}

function main() {
  if (!existsSync(WEB_LIB_JSON)) {
    console.error(
      `[sync-library] web/data/library.json missing.\n` +
        `  expected at: ${WEB_LIB_JSON}\n` +
        `  hint: cd web && bun run scripts/scrape-vroid.ts (or copy library.json there).`,
    );
    process.exit(1);
  }

  mkdirSync(DESKTOP_LIB, { recursive: true });
  mkdirSync(DESKTOP_SRC_DATA, { recursive: true });
  const jsonCopied = copyIfNewer(WEB_LIB_JSON, DESKTOP_LIB_JSON);
  console.info(
    `[sync-library] library.json (public) ${jsonCopied ? 'copied' : 'up-to-date'} → ${DESKTOP_LIB_JSON}`,
  );
  const srcCopied = copyIfNewer(WEB_LIB_JSON, DESKTOP_SRC_LIB_JSON);
  console.info(
    `[sync-library] library.json (renderer) ${srcCopied ? 'copied' : 'up-to-date'} → ${DESKTOP_SRC_LIB_JSON}`,
  );
  mkdirSync(DESKTOP_ELECTRON_DATA, { recursive: true });
  const electronCopied = copyIfNewer(WEB_LIB_JSON, DESKTOP_ELECTRON_LIB_JSON);
  console.info(
    `[sync-library] library.json (electron-main) ${electronCopied ? 'copied' : 'up-to-date'} → ${DESKTOP_ELECTRON_LIB_JSON}`,
  );

  if (!existsSync(WEB_LIB_PORTRAITS)) {
    console.warn(
      `[sync-library] web/public/library/_portraits missing — skipping thumbnails. Cards will show broken images.`,
    );
    return;
  }

  mkdirSync(DESKTOP_LIB_PORTRAITS, { recursive: true });
  let copied = 0;
  let skipped = 0;
  for (const file of readdirSync(WEB_LIB_PORTRAITS)) {
    if (!file.endsWith('.jpg')) continue;
    const src = join(WEB_LIB_PORTRAITS, file);
    const dst = join(DESKTOP_LIB_PORTRAITS, file);
    if (copyIfNewer(src, dst)) copied++;
    else skipped++;
  }
  console.info(`[sync-library] _portraits: ${copied} copied, ${skipped} up-to-date.`);
}

main();
