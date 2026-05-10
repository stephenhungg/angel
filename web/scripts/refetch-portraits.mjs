#!/usr/bin/env node
/**
 * refetch-portraits.mjs — pull real headshots from vroid hub.
 *
 * vroid character_models api exposes `portrait_image` as a separate field
 * from `full_body_image`. the original scraper only grabbed the body shot.
 * this script reads library.json, hits the api per character, and downloads
 * portrait_image.sq600 (600x600 head crop) into _portraits/<id>.jpg.
 *
 * politeness: 200ms inter-request delay, sequential. ~37s for 184 entries.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const LIB = JSON.parse(fs.readFileSync('web/data/library.json', 'utf8'));
const OUT = 'web/public/library/_portraits';
fs.mkdirSync(OUT, { recursive: true });

const SLEEP = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, fail = 0, skip = 0;

for (let i = 0; i < LIB.length; i++) {
  const e = LIB[i];
  const dst = path.join(OUT, `${e.id}.jpg`);
  process.stdout.write(`[${i+1}/${LIB.length}] ${e.id} → `);

  try {
    const apiRes = await fetch(`https://hub.vroid.com/api/character_models/${e.id}`, {
      headers: { 'X-Api-Version': '11', 'Accept': 'application/json' },
    });
    if (!apiRes.ok) {
      console.log(`api ${apiRes.status}`);
      fail++; await sleep(SLEEP); continue;
    }
    const json = await apiRes.json();
    const portrait = json?.data?.character_model?.portrait_image;
    const src = portrait?.sq600?.url || portrait?.w600?.url || portrait?.original?.url;
    if (!src) {
      console.log('no portrait_image url');
      // fallback: keep our existing sharp crop, don't overwrite
      skip++; await sleep(SLEEP); continue;
    }

    const imgRes = await fetch(src, {
      headers: { Referer: 'https://hub.vroid.com/' },
    });
    if (!imgRes.ok) {
      console.log(`img ${imgRes.status}`);
      fail++; await sleep(SLEEP); continue;
    }

    const buf = Buffer.from(await imgRes.arrayBuffer());
    // re-encode to jpg, force 600x600 square if not already
    await sharp(buf)
      .resize(600, 600, { fit: 'cover', position: 'top' })
      .jpeg({ quality: 90 })
      .toFile(dst);

    ok++;
    console.log('✓');
  } catch (err) {
    fail++;
    console.log(`err ${err.message}`);
  }

  await sleep(SLEEP);
}

console.log('');
console.log(`done — ok: ${ok}, fail: ${fail}, skip (no portrait): ${skip}`);
