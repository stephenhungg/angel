/**
 * purge-library.ts — drop all non-anime-girl entries from library.json
 *
 * filters in order:
 *   1. drop oss-avatars (non-numeric IDs, like UUIDs from arweave/sketchfab)
 *   2. drop anything with art_quality < 7
 *   3. drop aesthetic = 'other'
 *   4. drop anything with masculine/non-girl signals in vibe/blurb (guy, grandpa, statue, doll, mecha, etc.)
 *   5. drop entries missing required fields
 *
 * source: web/data/library.json (read-write — safe to run idempotently)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const LIBRARY_PATH = path.join(ROOT, 'data', 'library.json');

const VROID_ID_RE = /^\d{15,20}$/;

// regex with strict word boundaries — only flag if phrase appears as standalone word
const SUSPICIOUS_REGEXES: RegExp[] = [
  // non-anime-girl objects/creatures
  /\bstatue\b/i, /\bdolls?\b/i, /\bmecha\b/i, /\bmascot\b/i, /\bcreature\b/i,
  /\bmonster\b/i, /\bbeast\b/i, /\brobot\b/i, /\bvoxel\b/i, /\bminecraft\b/i,
  /\bblocky\b/i, /\bpixelated\b/i, /\bclay vessel\b/i, /\bspirit[\s-]horn\b/i,
  /\bporcelain[\s-]doll\b/i,
  // masculine entities (must be unambiguous)
  /\bgrandpa\b/i, /\bgrandfather\b/i, /\bgrandpops?\b/i,
  /\b(some|the|that|a) guy\b/i, /\bdude\b/i, /\bboyfriend\b/i,
  /\bdad\b/i, /\bfather\b/i, /\buncle\b/i, /\bmister\b/i,
  /\bmale\s+(human|character|model|figure|person)\b/i,
  /\bhe\s+(is|was|has|likes|works|dresses)\b/i,
  // weird vibe signals
  /\bschool[\s-]?day\s+(quiet|guy)\b/i,
  /\bweekend\s+errands?\b/i,
];

interface Tags {
  warmth?: number;
  energy?: number;
  edge?: number;
  sophistication?: number;
  playfulness?: number;
  aesthetic?: string;
  vibe_phrase?: string;
  personality_blurb?: string;
  dialogue_samples?: string[];
  art_quality?: number;
}

interface Entry {
  id: string;
  name?: string;
  tags?: Tags;
}

function isAnimeGirlEntry(e: Entry): { keep: boolean; reason?: string } {
  const id = String(e.id ?? '');
  if (!VROID_ID_RE.test(id)) return { keep: false, reason: 'not vroid hub id' };

  const tags = e.tags;
  if (!tags) return { keep: false, reason: 'no tags' };

  const required = ['warmth', 'energy', 'edge', 'sophistication', 'playfulness', 'aesthetic', 'vibe_phrase', 'art_quality'];
  for (const f of required) {
    if (tags[f as keyof Tags] === undefined) return { keep: false, reason: `missing ${f}` };
  }

  if ((tags.art_quality ?? 0) < 6) return { keep: false, reason: `art_quality=${tags.art_quality}` };
  if (tags.aesthetic === 'other') return { keep: false, reason: 'aesthetic=other' };

  const vibe = tags.vibe_phrase ?? '';
  const blurb = tags.personality_blurb ?? '';
  const dialogue = (tags.dialogue_samples ?? []).join(' ');
  const haystack = `${vibe} ${blurb} ${dialogue}`;

  for (const re of SUSPICIOUS_REGEXES) {
    const m = haystack.match(re);
    if (m) {
      return { keep: false, reason: `flagged: "${m[0]}"` };
    }
  }

  return { keep: true };
}

function main() {
  const raw = fs.readFileSync(LIBRARY_PATH, 'utf-8');
  const entries = JSON.parse(raw) as Entry[];

  const kept: Entry[] = [];
  const dropped: Array<{ id: string; reason: string; vibe: string }> = [];
  for (const e of entries) {
    const { keep, reason } = isAnimeGirlEntry(e);
    if (keep) kept.push(e);
    else dropped.push({ id: e.id, reason: reason ?? '?', vibe: e.tags?.vibe_phrase ?? '?' });
  }

  // sort kept by art_quality desc for deterministic ordering
  kept.sort((a, b) => (b.tags?.art_quality ?? 0) - (a.tags?.art_quality ?? 0));

  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(kept, null, 0)); // minified, single line per entry too verbose
  console.log(`✓ wrote ${kept.length} entries to ${LIBRARY_PATH}`);
  console.log(`✗ dropped ${dropped.length} entries`);

  // distribution
  const byAesthetic = new Map<string, number>();
  for (const e of kept) {
    const a = e.tags?.aesthetic ?? 'unknown';
    byAesthetic.set(a, (byAesthetic.get(a) ?? 0) + 1);
  }
  console.log('\nkept by aesthetic:');
  [...byAesthetic.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // sample drops
  console.log('\nsample drops (first 15):');
  for (const d of dropped.slice(0, 15)) {
    console.log(`  [${d.reason}] ${d.vibe}`);
  }
}

main();
