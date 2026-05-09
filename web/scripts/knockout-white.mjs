// turn the white background of every kawaii sticker PNG into transparency.
// run: bun run scripts/knockout-white.mjs
//
// strategy: load PNG → walk pixels → for each near-white pixel, set alpha=0;
// soft edges by ramping alpha proportional to distance from white.

import sharp from "sharp";
import { readdir } from "node:fs/promises";
import path from "node:path";

const KAWAII_DIR = path.resolve("public/kawaii");
const SUFFIX = "-t.png"; // transparent variant

// pixel is "white-ish" when r,g,b are all >= this threshold.
// 250 is more conservative — keeps light-pink + sticker outlines, only
// drops near-pure-white background pixels.
const WHITE_MIN = 250;

async function knockout(filename) {
  const input = path.join(KAWAII_DIR, filename);
  const output = path.join(
    KAWAII_DIR,
    filename.replace(/\.png$/, SUFFIX),
  );

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const out = Buffer.from(data);

  for (let i = 0; i < out.length; i += channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];

    // distance from pure white (0..255*3)
    const distFromWhite = (255 - r) + (255 - g) + (255 - b);

    if (r >= WHITE_MIN && g >= WHITE_MIN && b >= WHITE_MIN) {
      // ramp alpha: pure white → 0, near-white → partial.
      // tighter ramp (15 instead of 45) = sharper knockout, no halo.
      const ramp = Math.min(1, distFromWhite / 15);
      out[i + 3] = Math.round(255 * ramp);
    }
  }

  await sharp(out, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toFile(output);

  return { input, output, width, height };
}

const files = (await readdir(KAWAII_DIR)).filter(
  (f) => f.endsWith(".png") && !f.endsWith(SUFFIX),
);

console.log(`knocking out white from ${files.length} files…`);
for (const f of files) {
  const r = await knockout(f);
  console.log(`  ${f} → ${path.basename(r.output)}  (${r.width}×${r.height})`);
}
console.log("done.");
