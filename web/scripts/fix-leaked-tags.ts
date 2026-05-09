/**
 * Salvages entries where Claude bled XML-style tool output into vibe_phrase.
 * Pattern: vibe_phrase = "<actual_phrase></vibe_phrase>\n<parameter name="personality_blurb">...</...>"
 *
 * Splits the leaked content back into vibe_phrase and personality_blurb.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const LIBRARY = path.resolve(__dirname, '..', 'data', 'library.json');

interface Entry {
  id: string;
  tags?: {
    vibe_phrase: string;
    personality_blurb: string;
    [key: string]: unknown;
  };
}

const data = JSON.parse(await fs.readFile(LIBRARY, 'utf8')) as Entry[];

let fixed = 0;
for (const e of data) {
  if (!e.tags) continue;
  const vp = e.tags.vibe_phrase;
  if (!vp.includes('<')) continue;

  // Try to extract: "phrase</something>\n<parameter name="personality_blurb">blurb..."
  const m = vp.match(
    /^(.+?)<\/[^>]+>\s*<parameter\s+name="personality_blurb">([\s\S]+?)(?:<\/parameter>|$)/
  );
  if (m) {
    const newPhrase = m[1].trim();
    const newBlurb = m[2].trim().replace(/<\/parameter>$/, '').trim();
    e.tags.vibe_phrase = newPhrase;
    if (!e.tags.personality_blurb || (e.tags.personality_blurb as unknown) === null) {
      e.tags.personality_blurb = newBlurb;
    }
    fixed++;
  } else {
    // Just strip everything after the first "<"
    e.tags.vibe_phrase = vp.split('<')[0].trim();
    fixed++;
  }
}

await fs.writeFile(LIBRARY, JSON.stringify(data, null, 2));
console.log(`fixed ${fixed} entries`);
