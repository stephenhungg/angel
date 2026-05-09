#!/usr/bin/env bun
/**
 * sync-library.ts — copies library.json + 269 jpg thumbnails from web/ → desktop/public/library/.
 *
 * Run before `bun run dev` or `bun run build` in desktop.
 * The thumbnails are gitignored in both web/ and desktop/, so they need to
 * exist on disk first. If web/public/library/ is empty, run:
 *
 *   cd web && bun run scripts/scrape-vroid.ts
 *
 * (or any equivalent that populates web/public/library/*.jpg).
 *
 * Idempotent — only copies files that don't already exist or are stale.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(ROOT, '..');

const WEB_LIB_JSON = join(REPO_ROOT, 'web', 'data', 'library.json');
const WEB_LIB_IMAGES = join(REPO_ROOT, 'web', 'public', 'library');
const DESKTOP_LIB = join(ROOT, 'public', 'library');
const DESKTOP_LIB_JSON = join(DESKTOP_LIB, 'library.json');
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

  if (!existsSync(WEB_LIB_IMAGES)) {
    console.warn(
      `[sync-library] web/public/library missing — skipping thumbnails. Cards will show broken images.`,
    );
    return;
  }

  let copied = 0;
  let skipped = 0;
  for (const file of readdirSync(WEB_LIB_IMAGES)) {
    if (!file.endsWith('.jpg')) continue;
    const src = join(WEB_LIB_IMAGES, file);
    const dst = join(DESKTOP_LIB, file);
    if (copyIfNewer(src, dst)) copied++;
    else skipped++;
  }
  console.info(`[sync-library] thumbnails: ${copied} copied, ${skipped} up-to-date.`);
}

main();
