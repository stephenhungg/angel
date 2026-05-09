/* eslint-disable no-console */
/**
 * e2e-test.ts — playwright sanity sweep against the deployed url.
 *
 * Walks the demo arc end-to-end:
 *   landing → /swipe → 3 rounds of right-swipes → /reveal cascade →
 *   naming input → claim CTA href.
 *
 * Saves screenshots to ./e2e-screenshots/, captures all console errors
 * + network 4xx/5xx, prints a punch list at the end.
 *
 * Run:  bunx tsx scripts/e2e-test.ts
 *       (or)  bunx playwright open  to inspect manually
 */

import { chromium, type Page, type ConsoleMessage, type Request, type Response } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const URL =
  process.env.E2E_URL ??
  'https://angel-swipe-gx3oo9o4f-stephen-hungs-projects-d01c13ef.vercel.app';

const SCREENSHOT_DIR = path.join(__dirname, 'e2e-screenshots');

interface Issue {
  kind: 'console' | 'pageerror' | 'network' | 'missing' | 'flow';
  msg: string;
  url?: string;
  status?: number;
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const issues: Issue[] = [];
  let shotIndex = 0;
  const shot = async (label: string) => {
    const file = path.join(
      SCREENSHOT_DIR,
      `${String(++shotIndex).padStart(2, '0')}-${label}.png`,
    );
    try {
      await page.screenshot({ path: file, fullPage: false });
      console.log(`📸 ${file}`);
    } catch (err) {
      console.warn('screenshot failed:', err);
    }
  };

  page.on('console', (msg: ConsoleMessage) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      issues.push({ kind: 'console', msg: `[${t}] ${msg.text()}` });
    }
  });
  page.on('pageerror', (err) => {
    issues.push({ kind: 'pageerror', msg: err.message });
  });
  page.on('requestfailed', (req: Request) => {
    issues.push({
      kind: 'network',
      msg: `requestfailed: ${req.failure()?.errorText ?? ''}`,
      url: req.url(),
    });
  });
  page.on('response', (resp: Response) => {
    const s = resp.status();
    if (s >= 400) {
      issues.push({
        kind: 'network',
        msg: `${resp.request().method()} ${s}`,
        url: resp.url(),
        status: s,
      });
    }
  });

  /* ------------------------------------------------------------------ */
  /* 1. landing                                                          */
  /* ------------------------------------------------------------------ */

  console.log(`\n=== 1. landing ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }).catch((err) => {
    issues.push({ kind: 'flow', msg: `landing nav failed: ${err.message}` });
  });
  await page.waitForTimeout(1500);
  await shot('landing');

  // try clicking through the BaitIntro (if present)
  // it usually has a "skip" or auto-advances; we wait a beat and screenshot
  await page.waitForTimeout(2500);
  await shot('post-bait-intro');

  /* ------------------------------------------------------------------ */
  /* 2. navigate to /swipe (CTA may be /discover — broken link)          */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 2. find CTA → /swipe');
  // try direct swipe link first since we know the landing has /discover (broken)
  const ctaSelectors = [
    'a[href="/swipe"]',
    'a[href="/discover"]',
    'text=/find yours/i',
    'text=/discover/i',
    'text=/get started/i',
    'text=/begin/i',
  ];
  let clicked = false;
  for (const sel of ctaSelectors) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      try {
        await el.scrollIntoViewIfNeeded({ timeout: 2000 });
        await el.click({ timeout: 4000 });
        console.log(`clicked CTA: ${sel}`);
        clicked = true;
        break;
      } catch (err) {
        console.warn(`failed to click ${sel}:`, (err as Error).message);
      }
    }
  }
  if (!clicked) {
    issues.push({ kind: 'missing', msg: 'no CTA found on landing — falling back to direct nav' });
    await page.goto(`${URL}/swipe`, { waitUntil: 'networkidle' }).catch(() => {});
  } else {
    await page.waitForTimeout(2500);
    // if the click landed on /discover we'll see a 404; force-fallback to /swipe.
    if (!page.url().includes('/swipe')) {
      issues.push({
        kind: 'flow',
        msg: `landing CTA navigated to ${page.url()} not /swipe (404 risk)`,
      });
      await shot('post-cta-not-swipe');
      await page.goto(`${URL}/swipe`, { waitUntil: 'networkidle' }).catch(() => {});
    }
  }
  await page.waitForTimeout(1500);
  await shot('swipe-r1');

  /* ------------------------------------------------------------------ */
  /* 3. swipe right 3x for each of 3 rounds (≈ 9 swipes — until /reveal) */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 3. swipe right loop');
  const maxSwipes = 18;
  for (let i = 0; i < maxSwipes; i++) {
    if (page.url().includes('/reveal')) {
      console.log('reached /reveal');
      break;
    }
    // grab the top draggable card (motion.div with cursor-grab)
    const top = page.locator('div.cursor-grab').first();
    const exists = await top.count();
    if (!exists) {
      console.log(`no draggable card visible at swipe ${i + 1}; waiting…`);
      await page.waitForTimeout(900);
      continue;
    }
    const box = await top.boundingBox();
    if (!box) {
      await page.waitForTimeout(800);
      continue;
    }
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    try {
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      // intermediate steps so framer-motion's onDrag fires
      const steps = 14;
      for (let k = 1; k <= steps; k++) {
        await page.mouse.move(sx + (200 * k) / steps, sy, { steps: 1 });
        await page.waitForTimeout(15);
      }
      await page.mouse.up();
      console.log(`swipe ${i + 1} → right (drag ${sx}→${sx + 200})`);
    } catch (err) {
      console.warn(`swipe ${i + 1} threw:`, (err as Error).message);
    }
    await page.waitForTimeout(700);

    // every 3rd swipe should trigger an interstitial; tap to advance if visible
    const interstitialBtn = page
      .locator('button:has-text("continue"), button:has-text("next"), [data-testid="interstitial"]')
      .first();
    if (await interstitialBtn.count()) {
      try {
        await interstitialBtn.click({ timeout: 1500 });
      } catch {
        /* interstitial may be auto-advance */
      }
    }
  }
  await page.waitForTimeout(2500);
  await shot('post-swipes');

  /* ------------------------------------------------------------------ */
  /* 4. wait for /reveal & cycle screenshots                             */
  /* ------------------------------------------------------------------ */

  if (!page.url().includes('/reveal')) {
    issues.push({
      kind: 'flow',
      msg: `never reached /reveal after ${maxSwipes} swipes — stuck at ${page.url()}`,
    });
    // force-nav so we can at least screenshot it
    await page.goto(`${URL}/reveal`, { waitUntil: 'networkidle' }).catch(() => {});
  }

  console.log('\n=== 4. reveal phases (screenshot every ~1s)');
  for (let i = 0; i < 9; i++) {
    await shot(`reveal-t${i}s`);
    await page.waitForTimeout(1000);
  }

  /* ------------------------------------------------------------------ */
  /* 5. naming input — type "test", press Enter, capture claim href      */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 5. naming input');
  const nameInput = page.locator('input[placeholder="angel"]').first();
  if (await nameInput.count()) {
    try {
      await nameInput.click();
      await nameInput.fill('test');
      await shot('naming-typed');
      await page.keyboard.press('Enter');
      console.log('typed "test" + Enter');
    } catch (err) {
      issues.push({ kind: 'flow', msg: `naming input failed: ${(err as Error).message}` });
    }
  } else {
    issues.push({ kind: 'missing', msg: 'naming input not found on /reveal' });
  }
  // wait for naming response + claim signing
  await page.waitForTimeout(5500);
  await shot('post-naming-response');

  // wait for download takeover (gives 2.2s after naming-response)
  await page.waitForTimeout(3500);
  await shot('download-takeover');

  /* ------------------------------------------------------------------ */
  /* 6. capture claim href                                               */
  /* ------------------------------------------------------------------ */

  console.log('\n=== 6. claim href');
  const claimAnchor = page.locator('a:has-text("let her in")').first();
  let claimHref = '';
  if (await claimAnchor.count()) {
    claimHref = (await claimAnchor.getAttribute('href')) ?? '';
    console.log(`claim href = ${claimHref.slice(0, 80)}…`);
  } else {
    issues.push({ kind: 'missing', msg: '"let her in" anchor not found' });
  }

  await browser.close();

  /* ------------------------------------------------------------------ */
  /* 7. report                                                           */
  /* ------------------------------------------------------------------ */

  const report = {
    url: URL,
    timestamp: new Date().toISOString(),
    issuesByKind: groupBy(issues, (i) => i.kind),
    totalIssues: issues.length,
    claimHref,
    screenshots: shotIndex,
  };

  await writeFile(
    path.join(__dirname, 'e2e-results.json'),
    JSON.stringify(report, null, 2),
  );

  console.log('\n=== RESULT ===');
  console.log(`total issues: ${issues.length}`);
  for (const i of issues) console.log(' -', i.kind, i.msg, i.url ?? '');
  console.log(`claim href: ${claimHref || '(none)'}`);
}

function groupBy<T, K extends string>(arr: T[], k: (t: T) => K): Record<K, T[]> {
  return arr.reduce((acc, x) => {
    const key = k(x);
    (acc[key] ||= []).push(x);
    return acc;
  }, {} as Record<K, T[]>);
}

main().catch((err) => {
  console.error('e2e crashed:', err);
  process.exit(1);
});
