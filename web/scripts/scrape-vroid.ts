#!/usr/bin/env bun
/**
 * scrape-vroid.ts — VRoid Hub character scraper for Angel swipe deck.
 *
 * Strategy: VRoid Hub's public JSON API at /api/character_models exposes
 * everything we need (license, tags, full-body image, creator) on the listing
 * endpoint, paginated by `max_id` cursor. We don't need detail-page scraping
 * or HTML parsing.
 *
 * Filters (must ALL be true):
 *   - license.redistribution = "allow"
 *   - license.corporate_commercial_use = "allow"
 *   - license.personal_commercial_use = "profit"
 *   - license.characterization_allowed_user = "everyone"
 *
 * Discovery: pre-filtered listing + tag searches as fallback. Checkpoint every
 * 20 surviving entries. Thumbnails downloaded with Referer header and
 * compressed to JPG max 512x768 via cwebp re-encode (we save .jpg actually,
 * since the file extension is what callers expect; cwebp produces webp so we
 * use a different path: download original and re-encode with `sips` which
 * ships on macOS — and resize+quality compress).
 *
 * Run: bun run web/scripts/scrape-vroid.ts
 */

import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

// ---------- types ----------

interface VroidImageVariant {
  url: string;
  url2x: string | null;
  width: number;
  height: number;
}

interface VroidImage {
  is_default_image: boolean;
  original?: VroidImageVariant;
  w600?: VroidImageVariant;
  w300?: VroidImageVariant;
  sq600?: VroidImageVariant;
  sq300?: VroidImageVariant;
}

interface VroidLicense {
  modification: string;
  redistribution: string;
  credit: string;
  characterization_allowed_user: string;
  sexual_expression: string;
  violent_expression: string;
  corporate_commercial_use: string;
  personal_commercial_use: string;
}

interface VroidTag {
  name: string;
  en_name: string | null;
  ja_name: string | null;
}

interface VroidCharacterModel {
  id: string;
  name: string;
  is_private: boolean;
  is_downloadable: boolean;
  heart_count: number;
  view_count: number;
  download_count: number;
  usage_count: number;
  portrait_image: VroidImage;
  full_body_image: VroidImage;
  license: VroidLicense | null;
  tags: VroidTag[] | null;
  character: {
    id: string;
    name: string;
    user: {
      id: string;
      pixiv_user_id: string;
      name: string;
    };
  };
  latest_character_model_version?: {
    spec_version: string;
    exporter_version: string;
    triangle_count: number;
  };
  age_limit: { is_r18: boolean; is_r15: boolean; is_adult: boolean };
}

interface VroidApiResponse {
  data: VroidCharacterModel[];
  _links?: { next?: { href: string } };
}

interface LibraryEntry {
  vroid_id: string;
  name: string;
  creator_name: string;
  creator_id: string;
  thumbnail_url: string;
  thumbnail_kind: "full_body" | "portrait";
  profile_url: string;
  license: {
    redistribution: string;
    modification: string;
    characterization_allowed_user: string;
    corporate_commercial_use: string;
    personal_commercial_use: string;
    credit_required: boolean;
  };
  tags: string[];
  description: string;
  like_count: number;
  view_count: number;
  comment_count: number;
  vrm_format_version: string;
  age_limit: { is_r18: boolean; is_r15: boolean };
  triangle_count: number | null;
}

// ---------- config ----------

const ROOT = "/Users/stephenhung/Documents/GitHub/angel/web";
const OUT_JSON = join(ROOT, "data", "library_thumbnails.json");
const OUT_IMG_DIR = join(ROOT, "public", "library");
const CHECKPOINT_PATH = join(ROOT, "data", ".scrape-checkpoint.json");
const TARGET_COUNT = 220; // a few extra for slack
const PAGE_SIZE = 100;
const REQ_DELAY_MS = 350; // friendly throttle on listing API
const IMG_DELAY_MS = 80; // pximg can take more
const MAX_IMG_WIDTH = 512;
const MAX_IMG_HEIGHT = 768;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------- helpers ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildListUrl(seed: SeedQuery, maxId?: string): string {
  const params = new URLSearchParams({
    is_downloadable: "1",
    is_other_users_available: "1",
    count: String(PAGE_SIZE),
    ...seed.params,
  });
  if (maxId) params.set("max_id", maxId);
  return `https://hub.vroid.com/api/character_models?${params.toString()}`;
}

interface SeedQuery {
  label: string;
  params: Record<string, string>;
}

// Multiple discovery seeds — first one is the license-prefiltered firehose.
// Others fan out by tag/keyword to add diversity without losing licensing.
const SEEDS: SeedQuery[] = [
  {
    label: "license-prefiltered-latest",
    params: {
      corporate_commercial_use: "allow",
      personal_commercial_use: "profit",
      redistribution: "allow",
    },
  },
  {
    label: "license-prefiltered-popular",
    params: {
      corporate_commercial_use: "allow",
      personal_commercial_use: "profit",
      redistribution: "allow",
      sort: "popular",
    },
  },
  {
    label: "license-prefiltered-heart",
    params: {
      corporate_commercial_use: "allow",
      personal_commercial_use: "profit",
      redistribution: "allow",
      sort: "heart",
    },
  },
];

function passesFilters(m: VroidCharacterModel): boolean {
  if (m.is_private) return false;
  if (!m.is_downloadable) return false;
  // Some VRM 1.0 entries return `license: null` on the list endpoint — those
  // store license metadata inside the VRM file itself and aren't filterable
  // here. Drop them to avoid licensing ambiguity.
  const l = m.license;
  if (!l) return false;
  return (
    l.redistribution === "allow" &&
    l.corporate_commercial_use === "allow" &&
    l.personal_commercial_use === "profit" &&
    l.characterization_allowed_user === "everyone"
  );
}

function pickThumbnail(m: VroidCharacterModel): {
  url: string;
  kind: "full_body" | "portrait";
} | null {
  // Prefer full body w600 (close to our 512x768 target). Fall back to portrait.
  const fb = m.full_body_image;
  if (fb && !fb.is_default_image) {
    const v = fb.w600 ?? fb.original ?? fb.w300;
    if (v?.url) return { url: v.url, kind: "full_body" };
  }
  const p = m.portrait_image;
  if (p && !p.is_default_image) {
    const v = p.w600 ?? p.original ?? p.w300;
    if (v?.url) return { url: v.url, kind: "portrait" };
  }
  return null;
}

function toEntry(m: VroidCharacterModel): LibraryEntry | null {
  const thumb = pickThumbnail(m);
  if (!thumb) return null;
  if (!m.license) return null;
  return {
    vroid_id: m.id,
    name: m.name || m.character.name || "Untitled",
    creator_name: m.character.user.name,
    creator_id: m.character.user.id,
    thumbnail_url: thumb.url,
    thumbnail_kind: thumb.kind,
    profile_url: `https://hub.vroid.com/en/characters/${m.character.id}/models/${m.id}`,
    license: {
      redistribution: m.license.redistribution,
      modification: m.license.modification,
      characterization_allowed_user: m.license.characterization_allowed_user,
      corporate_commercial_use: m.license.corporate_commercial_use,
      personal_commercial_use: m.license.personal_commercial_use,
      credit_required: m.license.credit !== "unnecessary",
    },
    tags: (m.tags ?? [])
      .map((t) => t.en_name || t.name)
      .filter((s): s is string => !!s),
    description: "",
    like_count: m.heart_count ?? 0,
    view_count: m.view_count ?? 0,
    comment_count: 0, // not exposed on listing endpoint
    vrm_format_version: m.latest_character_model_version?.spec_version ?? "0.0",
    age_limit: { is_r18: m.age_limit.is_r18, is_r15: m.age_limit.is_r15 },
    triangle_count: m.latest_character_model_version?.triangle_count ?? null,
  };
}

async function fetchListPage(
  seed: SeedQuery,
  maxId?: string,
): Promise<VroidApiResponse> {
  const url = buildListUrl(seed, maxId);
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "X-Api-Version": "11",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`list fetch ${seed.label} maxId=${maxId} -> ${res.status}`);
  }
  return (await res.json()) as VroidApiResponse;
}

// Run an external command, returning exit code.
function run(
  cmd: string,
  args: string[],
  opts: { input?: Buffer } = {},
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr.on("data", (b) => (stderr += b.toString()));
    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
    child.on("error", () => resolve({ code: -1, stderr: "spawn-error" }));
  });
}

async function downloadAndCompressThumbnail(
  url: string,
  outPath: string,
): Promise<{ ok: boolean; bytes: number; reason?: string }> {
  if (existsSync(outPath)) {
    const s = await stat(outPath);
    if (s.size > 0) return { ok: true, bytes: s.size, reason: "cached" };
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://hub.vroid.com/",
        Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
      },
    });
  } catch (e) {
    return { ok: false, bytes: 0, reason: `fetch-error: ${(e as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, bytes: 0, reason: `http ${res.status}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) return { ok: false, bytes: 0, reason: "empty" };

  // First write the raw image to a temp path next to outPath.
  const tmpPath = outPath + ".raw";
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(tmpPath, buf);

  // Re-encode/resize using macOS `sips`. The `--resampleHeightWidthMax` flag
  // resizes preserving aspect ratio so neither dimension exceeds the value.
  const maxDim = Math.max(MAX_IMG_WIDTH, MAX_IMG_HEIGHT);
  const sipsResize = await run("sips", [
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    "80",
    "--resampleHeightWidthMax",
    String(maxDim),
    tmpPath,
    "--out",
    outPath,
  ]);
  if (sipsResize.code !== 0) {
    // Fallback: just keep raw bytes as the .jpg (browser tolerates png-named-jpg).
    await writeFile(outPath, buf);
  }
  // cleanup tmp
  try {
    await Bun.file(tmpPath).exists();
    await Bun.write(tmpPath, ""); // truncate
    const fs = await import("node:fs/promises");
    await fs.unlink(tmpPath);
  } catch {}
  const final = await stat(outPath);
  return { ok: true, bytes: final.size };
}

// ---------- checkpoint ----------

interface Checkpoint {
  entries: LibraryEntry[];
  seenIds: string[];
  seedCursors: Record<string, { lastMaxId: string | null; exhausted: boolean }>;
  timestamp: string;
}

async function loadCheckpoint(): Promise<Checkpoint | null> {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  try {
    const raw = await readFile(CHECKPOINT_PATH, "utf-8");
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

async function saveCheckpoint(cp: Checkpoint): Promise<void> {
  await mkdir(dirname(CHECKPOINT_PATH), { recursive: true });
  await writeFile(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ---------- main ----------

async function main(): Promise<void> {
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await mkdir(OUT_IMG_DIR, { recursive: true });

  const failures: { stage: string; id?: string; reason: string }[] = [];
  const cp: Checkpoint = (await loadCheckpoint()) ?? {
    entries: [],
    seenIds: [],
    seedCursors: {},
    timestamp: new Date().toISOString(),
  };
  const seen = new Set(cp.seenIds);
  let totalScraped = cp.seenIds.length;

  console.log(
    `[start] resume: ${cp.entries.length} surviving / ${totalScraped} scraped`,
  );

  // Phase 1: paginate seeds until we hit TARGET_COUNT survivors.
  outer: for (const seed of SEEDS) {
    const cursor = (cp.seedCursors[seed.label] ??= {
      lastMaxId: null,
      exhausted: false,
    });
    if (cursor.exhausted) {
      console.log(`[seed:${seed.label}] already exhausted, skipping`);
      continue;
    }
    console.log(`[seed:${seed.label}] starting`);

    while (cp.entries.length < TARGET_COUNT) {
      let resp: VroidApiResponse;
      try {
        resp = await fetchListPage(seed, cursor.lastMaxId ?? undefined);
      } catch (e) {
        const reason = (e as Error).message;
        console.warn(`[seed:${seed.label}] fetch failed: ${reason}`);
        failures.push({ stage: "list", reason });
        // backoff — likely rate limit
        await sleep(5000);
        break; // try next seed
      }
      if (!resp.data || resp.data.length === 0) {
        console.log(`[seed:${seed.label}] empty page, exhausted`);
        cursor.exhausted = true;
        break;
      }

      let pageNew = 0;
      let pageSurvived = 0;
      for (const m of resp.data) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        totalScraped += 1;
        pageNew += 1;
        if (!passesFilters(m)) continue;
        const entry = toEntry(m);
        if (!entry) continue;
        cp.entries.push(entry);
        pageSurvived += 1;

        if (cp.entries.length % 20 === 0) {
          cp.seenIds = Array.from(seen);
          cp.timestamp = new Date().toISOString();
          await saveCheckpoint(cp);
          console.log(`  [checkpoint] survivors=${cp.entries.length}`);
        }
      }
      // Update cursor to the last id on this page (lowest id seen).
      const lastId = resp.data[resp.data.length - 1]?.id;
      if (!lastId || lastId === cursor.lastMaxId) {
        cursor.exhausted = true;
        console.log(`[seed:${seed.label}] cursor stalled, exhausted`);
        break;
      }
      cursor.lastMaxId = lastId;

      console.log(
        `[seed:${seed.label}] page: new=${pageNew} survived=${pageSurvived} total_survivors=${cp.entries.length}`,
      );

      if (cp.entries.length >= TARGET_COUNT) break outer;
      await sleep(REQ_DELAY_MS);
    }
  }

  cp.seenIds = Array.from(seen);
  await saveCheckpoint(cp);

  console.log(
    `[discovery done] survivors=${cp.entries.length} / scraped=${totalScraped}`,
  );

  // Phase 2: download thumbnails
  console.log(`[thumbnails] downloading ${cp.entries.length} images...`);
  let imgOk = 0;
  let imgFail = 0;
  for (let i = 0; i < cp.entries.length; i++) {
    const e = cp.entries[i];
    const outPath = join(OUT_IMG_DIR, `${e.vroid_id}.jpg`);
    const r = await downloadAndCompressThumbnail(e.thumbnail_url, outPath);
    if (r.ok) {
      imgOk += 1;
    } else {
      imgFail += 1;
      failures.push({
        stage: "thumbnail",
        id: e.vroid_id,
        reason: r.reason ?? "unknown",
      });
    }
    if ((i + 1) % 25 === 0) {
      console.log(
        `  [img ${i + 1}/${cp.entries.length}] ok=${imgOk} fail=${imgFail}`,
      );
    }
    await sleep(IMG_DELAY_MS);
  }

  // Phase 3: write final JSON
  await writeFile(OUT_JSON, JSON.stringify(cp.entries, null, 2));

  // Stats
  const tagCounts = new Map<string, number>();
  for (const e of cp.entries) {
    for (const t of e.tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  const vrmVersions = new Map<string, number>();
  for (const e of cp.entries) {
    vrmVersions.set(
      e.vrm_format_version,
      (vrmVersions.get(e.vrm_format_version) ?? 0) + 1,
    );
  }

  const report = {
    total_scraped: totalScraped,
    total_surviving: cp.entries.length,
    thumbnails_ok: imgOk,
    thumbnails_failed: imgFail,
    vrm_format_breakdown: Object.fromEntries(vrmVersions),
    top_tags: Object.fromEntries(topTags),
    failures: failures.slice(0, 50),
    failure_count: failures.length,
    output_json: OUT_JSON,
    output_images_dir: OUT_IMG_DIR,
  };
  await writeFile(
    join(ROOT, "data", "scrape-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
