#!/usr/bin/env bun
// usage: bun run_synth.mjs <prompt_version_file> <vector_id> > out.md
// or:    bun run_synth.mjs <prompt_version_file> all <out_dir>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const [, , promptFile, vectorArg, outDirArg] = process.argv;
if (!promptFile || !vectorArg) {
  console.error("usage: bun run_synth.mjs <prompt_file> <vector_id|all> [out_dir]");
  process.exit(1);
}

const ROOT = "/Users/stephenhung/Documents/GitHub/angel/desktop/electron/agent";
const VECTORS = JSON.parse(readFileSync(`${ROOT}/_iteration_log/mock_vectors.json`, "utf8")).vectors;
const promptTemplate = readFileSync(resolve(promptFile), "utf8");

function fillPrompt(v) {
  return promptTemplate
    .replaceAll("{{MACRO}}", v.macro)
    .replaceAll("{{WARMTH}}", v.warmth.toFixed(2))
    .replaceAll("{{ENERGY}}", v.energy.toFixed(2))
    .replaceAll("{{EDGE}}", v.edge.toFixed(2))
    .replaceAll("{{SOPHISTICATION}}", v.sophistication.toFixed(2))
    .replaceAll("{{EARNESTNESS}}", v.earnestness.toFixed(2))
    .replaceAll("{{AESTHETIC}}", v.aesthetic)
    .replaceAll("{{BODY_DESCRIPTION}}", v.body)
    .replaceAll("{{SAMPLE_1}}", v.samples[0])
    .replaceAll("{{SAMPLE_2}}", v.samples[1])
    .replaceAll("{{SAMPLE_3}}", v.samples[2]);
}

function runClaude(prompt, model = "sonnet") {
  // use claude CLI in print mode with --bare to avoid CLAUDE.md auto-discovery
  // disable session persistence and skip permissions; do NOT use --bare (no auth on bare)
  const res = spawnSync(
    "claude",
    [
      "-p",
      "--model", model,
      "--no-session-persistence",
      "--dangerously-skip-permissions",
      "--disallowedTools", "Bash,Edit,Write,Read,WebFetch,WebSearch,Task,TodoWrite",
    ],
    { input: prompt, encoding: "utf8", maxBuffer: 1024 * 1024 * 16, timeout: 240_000 }
  );
  if (res.status !== 0) {
    console.error("claude exit", res.status, res.stderr);
    process.exit(1);
  }
  return res.stdout.trim();
}

function runOne(v, outPath) {
  const prompt = fillPrompt(v);
  const out = runClaude(prompt);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, out);
    console.error(`wrote ${outPath} (${out.split(/\s+/).length} words)`);
  } else {
    process.stdout.write(out);
  }
  return out;
}

if (vectorArg === "all") {
  const outDir = outDirArg || `${ROOT}/personality_examples`;
  for (const v of VECTORS) {
    runOne(v, `${outDir}/${v.id}.md`);
  }
} else {
  const v = VECTORS.find(x => x.id === vectorArg);
  if (!v) { console.error(`vector not found: ${vectorArg}`); process.exit(1); }
  runOne(v, outDirArg ? `${outDirArg}/${v.id}.md` : null);
}
