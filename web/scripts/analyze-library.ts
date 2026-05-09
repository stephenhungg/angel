/**
 * Post-tagging analysis. Reads library.json and prints:
 *   - total tagged
 *   - art_quality distribution
 *   - 5 best entries (full tags)
 *   - 3 worst entries (full tags + diagnosis)
 *   - vibe_phrase originality check
 *   - token totals (estimated from per-entry counts)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface AvatarTags {
  warmth: number;
  energy: number;
  edge: number;
  sophistication: number;
  playfulness: number;
  aesthetic: string;
  age_vibe: string;
  hair_color: string;
  palette: string[];
  vibe_phrase: string;
  personality_blurb: string;
  dialogue_samples: string[];
  energy_descriptor: string;
  suggested_voice_cluster: number;
  suggested_room_palette: string[];
  suggested_animation_bias: string;
  art_quality: number;
  distinctive_features: string[];
}

interface Entry {
  id: string;
  name?: string;
  tags?: AvatarTags;
  error?: string;
  input_tokens?: number;
  output_tokens?: number;
}

const LIBRARY = path.resolve(__dirname, '..', 'data', 'library.json');

async function main() {
  const raw = await fs.readFile(LIBRARY, 'utf8');
  const data = JSON.parse(raw) as Entry[];

  const tagged = data.filter((e) => e.tags);
  const errored = data.filter((e) => e.error);
  console.log(`total: ${data.length}  tagged: ${tagged.length}  errored: ${errored.length}`);

  // art_quality distribution
  const buckets = new Array(11).fill(0);
  for (const e of tagged) buckets[Math.min(10, Math.max(0, Math.round(e.tags!.art_quality)))]++;
  console.log('\nart_quality histogram:');
  buckets.forEach((c, i) => {
    if (c > 0) console.log(`  ${i.toString().padStart(2)}: ${'█'.repeat(c).slice(0, 60)} ${c}`);
  });
  const passing = tagged.filter((e) => e.tags!.art_quality >= 6).length;
  console.log(`\ndemo-deck eligible (q>=6): ${passing} / ${tagged.length}`);

  // tokens
  const inT = tagged.reduce((a, e) => a + (e.input_tokens ?? 0), 0);
  const outT = tagged.reduce((a, e) => a + (e.output_tokens ?? 0), 0);
  // claude-haiku-4-5 pricing: $1/MTok input, $5/MTok output (approx)
  const cost = (inT / 1_000_000) * 1 + (outT / 1_000_000) * 5;
  console.log(`tokens: in=${inT.toLocaleString()}  out=${outT.toLocaleString()}  ~$${cost.toFixed(2)}`);

  // 5 best
  const ranked = [...tagged].sort((a, b) => b.tags!.art_quality - a.tags!.art_quality);
  console.log('\n──────── 5 best ────────');
  for (const e of ranked.slice(0, 5)) printEntry(e);

  // 3 worst (lowest art_quality among tagged + any errors)
  console.log('\n──────── 3 worst (low art_quality) ────────');
  const worst = [...tagged].sort((a, b) => a.tags!.art_quality - b.tags!.art_quality).slice(0, 3);
  for (const e of worst) printEntry(e);

  // generic-vibe-phrase audit
  console.log('\n──────── vibe_phrase audit ────────');
  const phrases = tagged.map((e) => e.tags!.vibe_phrase.toLowerCase());
  const dupes = new Map<string, number>();
  for (const p of phrases) dupes.set(p, (dupes.get(p) ?? 0) + 1);
  const repeated = [...dupes.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  if (repeated.length === 0) {
    console.log('  no duplicate vibe_phrases — full uniqueness');
  } else {
    console.log(`  duplicates (${repeated.length}):`);
    for (const [p, c] of repeated.slice(0, 10)) console.log(`    "${p}" × ${c}`);
  }
  // generic word check
  const generic = ['warm and friendly', 'cute', 'mysterious', 'cool', 'pretty'];
  const genericHits = phrases.filter((p) => generic.some((g) => p === g || p === g + ' girl'));
  console.log(`  generic phrases: ${genericHits.length}`);

  // AI-slop dialogue check
  const slopMarkers = [
    'how can i help',
    'i am here for you',
    'i am happy to',
    'let me know if',
    'i would be happy',
    'as an ai',
    'on this beautiful',
    "let's embark",
    'i am excited to',
  ];
  const slopHits: { id: string; line: string }[] = [];
  for (const e of tagged) {
    for (const line of e.tags!.dialogue_samples) {
      const low = line.toLowerCase();
      if (slopMarkers.some((m) => low.includes(m))) slopHits.push({ id: e.id, line });
    }
  }
  console.log(`\n  AI-slop dialogue lines: ${slopHits.length}`);
  for (const s of slopHits.slice(0, 5)) console.log(`    [${s.id.slice(0, 8)}] "${s.line}"`);

  // errors
  if (errored.length > 0) {
    console.log('\n──────── errors ────────');
    const counts = new Map<string, number>();
    for (const e of errored) {
      const k = (e.error ?? '').slice(0, 40);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, c] of counts) console.log(`  ${c}× ${k}`);
  }
}

function printEntry(e: Entry) {
  const t = e.tags!;
  console.log(`\n[${e.id.slice(0, 12)}] ${e.name ?? '(no name)'}  q=${t.art_quality}`);
  console.log(`  vibe_phrase: "${t.vibe_phrase}"`);
  console.log(`  energy_descriptor: "${t.energy_descriptor}"`);
  console.log(`  aesthetic: ${t.aesthetic}  age: ${t.age_vibe}  hair: ${t.hair_color}`);
  console.log(`  warmth=${t.warmth} energy=${t.energy} edge=${t.edge} soph=${t.sophistication} play=${t.playfulness}`);
  console.log(`  palette: ${t.palette.join(' ')}`);
  console.log(`  personality: ${t.personality_blurb}`);
  console.log(`  dialogue:`);
  for (const d of t.dialogue_samples) console.log(`    – "${d}"`);
  console.log(`  voice_cluster: ${t.suggested_voice_cluster}  anim: ${t.suggested_animation_bias}  room: ${t.suggested_room_palette.join(' ')}`);
  console.log(`  features: ${t.distinctive_features.slice(0, 6).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
