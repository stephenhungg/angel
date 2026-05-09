#!/usr/bin/env bun
/**
 * scrape-vroid-user.ts — scrape ALL character models for a single VRoid Hub user.
 *
 * Unlike scrape-vroid.ts (which filters the firehose by license), this targets
 * one curated creator and grabs everything they've published — even
 * redistribution=disallow. User vouched for quality so we skip license filters.
 *
 * Outputs:
 *   - data/library_thumbnails_user_<id>.json   (entries in library_thumbnails shape)
 *   - public/library/<vroid_id>.jpg            (compressed thumbnails)
 *
 * Run: bun run scripts/scrape-vroid-user.ts <user_id>
 *      bun run scripts/scrape-vroid-user.ts 36144806
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

const USER_ID = process.argv[2];
if (!USER_ID || !/^\d+$/.test(USER_ID)) {
  console.error("usage: bun run scripts/scrape-vroid-user.ts <numeric_user_id>");
  process.exit(1);
}

const ROOT = "/Users/stephenhung/Documents/GitHub/angel/web";
const OUT_JSON = join(ROOT, "data", `library_thumbnails_user_${USER_ID}.json`);
const OUT_IMG_DIR = join(ROOT, "public", "library");
const MAX_IMG_WIDTH = 512;
const MAX_IMG_HEIGHT = 768;
const IMG_DELAY_MS = 80;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface VroidImageVariant {
  url: string;
  width: number;
  height: number;
}
interface VroidImage {
  is_default_image: boolean;
  original?: VroidImageVariant;
  w600?: VroidImageVariant;
  w300?: VroidImageVariant;
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
interface VroidTag { name: string; en_name: string | null; ja_name: string | null }
interface VroidCharacterModel {
  id: string;
  name: string | null;
  is_private: boolean;
  is_downloadable: boolean;
  heart_count: number;
  view_count: number;
  download_count: number;
  portrait_image: VroidImage;
  full_body_image: VroidImage;
  license: VroidLicense | null;
  tags: VroidTag[] | null;
  character: { id: string; name: string; user: { id: string; name: string } };
  latest_character_model_version?: {
    spec_version: string;
    triangle_count: number;
  };
  age_limit: { is_r18: boolean; is_r15: boolean; is_adult: boolean };
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
  } | null;
  tags: string[];
  description: string;
  like_count: number;
  view_count: number;
  comment_count: number;
  vrm_format_version: string;
  age_limit: { is_r18: boolean; is_r15: boolean };
  triangle_count: number | null;
}

function pickThumbnail(m: VroidCharacterModel): { url: string; kind: "full_body" | "portrait" } | null {
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
  return {
    vroid_id: m.id,
    name: m.name || m.character.name || "Untitled",
    creator_name: m.character.user.name,
    creator_id: m.character.user.id,
    thumbnail_url: thumb.url,
    thumbnail_kind: thumb.kind,
    profile_url: `https://hub.vroid.com/en/characters/${m.character.id}/models/${m.id}`,
    license: m.license
      ? {
          redistribution: m.license.redistribution,
          modification: m.license.modification,
          characterization_allowed_user: m.license.characterization_allowed_user,
          corporate_commercial_use: m.license.corporate_commercial_use,
          personal_commercial_use: m.license.personal_commercial_use,
          credit_required: m.license.credit !== "unnecessary",
        }
      : null,
    tags: (m.tags ?? []).map((t) => t.en_name || t.name).filter((s): s is string => !!s),
    description: "",
    like_count: m.heart_count ?? 0,
    view_count: m.view_count ?? 0,
    comment_count: 0,
    vrm_format_version: m.latest_character_model_version?.spec_version ?? "0.0",
    age_limit: { is_r18: m.age_limit.is_r18, is_r15: m.age_limit.is_r15 },
    triangle_count: m.latest_character_model_version?.triangle_count ?? null,
  };
}

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
    child.on("error", () => resolve({ code: -1, stderr: "spawn-error" }));
  });
}

async function downloadAndCompressThumbnail(url: string, outPath: string): Promise<{ ok: boolean; bytes: number; reason?: string }> {
  if (existsSync(outPath)) {
    const s = await stat(outPath);
    if (s.size > 1000) return { ok: true, bytes: s.size, reason: "cached" };
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
  if (!res.ok) return { ok: false, bytes: 0, reason: `http ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) return { ok: false, bytes: 0, reason: "empty" };

  const tmpPath = outPath + ".raw";
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(tmpPath, buf);

  const maxDim = Math.max(MAX_IMG_WIDTH, MAX_IMG_HEIGHT);
  const sipsResize = await run("sips", [
    "-s", "format", "jpeg",
    "-s", "formatOptions", "80",
    "--resampleHeightWidthMax", String(maxDim),
    tmpPath, "--out", outPath,
  ]);
  if (sipsResize.code !== 0) {
    await writeFile(outPath, buf);
  }
  try {
    const fs = await import("node:fs/promises");
    await fs.unlink(tmpPath);
  } catch {}
  const final = await stat(outPath);
  return { ok: true, bytes: final.size };
}

async function main() {
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await mkdir(OUT_IMG_DIR, { recursive: true });

  // Fetch user's models. The endpoint is paginated but VRoid Project has only 20.
  // Loop with max_id pagination just in case.
  const allModels: VroidCharacterModel[] = [];
  let maxId: string | undefined;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://hub.vroid.com/api/users/${USER_ID}/character_models`);
    url.searchParams.set("count", "100");
    if (maxId) url.searchParams.set("max_id", maxId);
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "X-Api-Version": "11",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      console.error(`fetch page ${page} failed: ${res.status}`);
      break;
    }
    const json = (await res.json()) as { data: VroidCharacterModel[] };
    if (!json.data || json.data.length === 0) break;
    const before = allModels.length;
    for (const m of json.data) {
      if (!allModels.some((x) => x.id === m.id)) allModels.push(m);
    }
    console.log(`[page ${page}] fetched=${json.data.length} new=${allModels.length - before} total=${allModels.length}`);
    if (json.data.length < 100) break;
    maxId = json.data[json.data.length - 1].id;
    await sleep(350);
  }

  console.log(`[discovery] ${allModels.length} models for user ${USER_ID}`);

  // Convert all to entries (no license filter — user vouched).
  const entries: LibraryEntry[] = [];
  for (const m of allModels) {
    if (m.is_private) continue;
    const e = toEntry(m);
    if (!e) {
      console.log(`  [skip] ${m.id} — no thumbnail`);
      continue;
    }
    entries.push(e);
  }

  console.log(`[entries] ${entries.length} with usable thumbnails`);

  // Download thumbnails.
  let imgOk = 0;
  let imgFail = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const outPath = join(OUT_IMG_DIR, `${e.vroid_id}.jpg`);
    const r = await downloadAndCompressThumbnail(e.thumbnail_url, outPath);
    if (r.ok) imgOk++;
    else {
      imgFail++;
      console.log(`  [img-fail] ${e.vroid_id} — ${r.reason}`);
    }
    if ((i + 1) % 5 === 0) {
      console.log(`  [img ${i + 1}/${entries.length}] ok=${imgOk} fail=${imgFail}`);
    }
    await sleep(IMG_DELAY_MS);
  }

  await writeFile(OUT_JSON, JSON.stringify(entries, null, 2));
  console.log(`\n=== done ===`);
  console.log(`  user_id: ${USER_ID}`);
  console.log(`  creator_name: ${entries[0]?.creator_name ?? "?"}`);
  console.log(`  total scraped: ${allModels.length}`);
  console.log(`  total entries: ${entries.length}`);
  console.log(`  thumbnails ok: ${imgOk}, failed: ${imgFail}`);
  console.log(`  output: ${OUT_JSON}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
