/**
 * skills/index.ts — recursive self-improvement. angel's procedural memory.
 *
 * angel can write new skills for herself. each skill is a markdown file with
 * frontmatter (name, description, status, telemetry) + body (when-to-use +
 * steps + example). active skills are loaded into the system prompt at boot
 * as a "your learned skills" block, so she has them next session.
 *
 * filesystem:
 *   ~/.angel/skills/proposed/   ← she drafts new skills here when she
 *                                 notices a recurring pattern
 *   ~/.angel/skills/active/     ← user (or auto-promotion) moves approved
 *                                 skills here. these load into the prompt.
 *   ~/.angel/skills/archived/   ← retired skills. kept for forensics.
 *
 * approval = filesystem move proposed/ → active/. v1 is manual; v2 lets her
 * ASK the user in chat ("hey i drafted a skill — want me to install it?")
 * and the orchestrator does the move on a yes.
 *
 * IMPORTANT: this module is standalone — it has no dep on runner.ts so it
 * can be built/tested before the running onboarding agent finishes touching
 * the orchestrator. wiring happens in task #39.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type SkillStatus = 'proposed' | 'active' | 'archived';

export interface SkillFrontmatter {
  name: string;
  description: string;
  status: SkillStatus;
  proposedAt: string; // ISO
  lastUsedAt: string | null; // ISO or null
  useCount: number;
  /** how she found this pattern — free-text trace for debugging */
  origin?: string;
}

export interface Skill {
  /** filename slug, e.g. "ship-portfolio-card" */
  slug: string;
  /** absolute path on disk */
  filePath: string;
  frontmatter: SkillFrontmatter;
  /** markdown body (everything after the closing `---`) */
  body: string;
}

const SKILLS_ROOT = path.join(os.homedir(), '.angel', 'skills');

const DIRS = {
  proposed: path.join(SKILLS_ROOT, 'proposed'),
  active: path.join(SKILLS_ROOT, 'active'),
  archived: path.join(SKILLS_ROOT, 'archived'),
} as const;

/** ensure all skill dirs exist. idempotent. call at boot. */
export function ensureSkillsDirs(): void {
  for (const dir of Object.values(DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** convert "Ship Portfolio Card!!!" → "ship-portfolio-card" — slug-safe */
export function slugifySkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/* -------------------------------------------------------------------------- */
/* parse / serialize                                                           */
/* -------------------------------------------------------------------------- */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** tiny yaml-ish parser — just key: value pairs, one per line */
function parseFrontmatter(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]!] = v;
  }
  return out;
}

function serializeFrontmatter(fm: SkillFrontmatter): string {
  // quote anything with a colon or special-yaml-y char
  const esc = (v: string): string =>
    /[:#"'\n\\]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
  const lines: string[] = [
    `name: ${esc(fm.name)}`,
    `description: ${esc(fm.description)}`,
    `status: ${fm.status}`,
    `proposedAt: ${fm.proposedAt}`,
    `lastUsedAt: ${fm.lastUsedAt ?? 'null'}`,
    `useCount: ${fm.useCount}`,
  ];
  if (fm.origin) lines.push(`origin: ${esc(fm.origin)}`);
  return lines.join('\n');
}

function parseSkillFile(filePath: string): Skill | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const m = raw.match(FRONTMATTER_RE);
  if (!m) {
    console.warn('[skills] no frontmatter in', filePath);
    return null;
  }
  const kv = parseFrontmatter(m[1]!);
  const body = m[2]!.trim();

  const status = (kv.status ?? 'proposed') as SkillStatus;
  const useCount = Number(kv.useCount ?? '0') || 0;
  const lastUsedAt = !kv.lastUsedAt || kv.lastUsedAt === 'null' ? null : kv.lastUsedAt;
  const slug = path.basename(filePath, '.md');

  return {
    slug,
    filePath,
    frontmatter: {
      name: kv.name ?? slug,
      description: kv.description ?? '',
      status,
      proposedAt: kv.proposedAt ?? new Date().toISOString(),
      lastUsedAt,
      useCount,
      origin: kv.origin,
    },
    body,
  };
}

function writeSkillFile(skill: Skill): void {
  const out = `---\n${serializeFrontmatter(skill.frontmatter)}\n---\n\n${skill.body.trim()}\n`;
  fs.writeFileSync(skill.filePath, out, 'utf8');
}

/* -------------------------------------------------------------------------- */
/* list / load                                                                 */
/* -------------------------------------------------------------------------- */

function listSkillsIn(dir: string): Skill[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const skills: Skill[] = [];
  for (const entry of entries) {
    const skill = parseSkillFile(path.join(dir, entry));
    if (skill) skills.push(skill);
  }
  return skills;
}

export function listActiveSkills(): Skill[] {
  return listSkillsIn(DIRS.active);
}

export function listProposedSkills(): Skill[] {
  return listSkillsIn(DIRS.proposed);
}

export function listArchivedSkills(): Skill[] {
  return listSkillsIn(DIRS.archived);
}

/* -------------------------------------------------------------------------- */
/* propose / approve / archive                                                 */
/* -------------------------------------------------------------------------- */

export interface ProposeSkillInput {
  /** human-friendly name — slugified for filename */
  name: string;
  /** one-line description, used in prompt block + UI */
  description: string;
  /** markdown body — should include "when to use" + "steps" sections */
  content: string;
  /** how she noticed this pattern (optional, for debugging) */
  origin?: string;
}

export interface ProposeSkillResult {
  ok: boolean;
  slug: string;
  filePath: string;
  alreadyExisted: boolean;
}

/**
 * angel calls this via the propose_skill tool. writes to proposed/ — does
 * NOT auto-activate. user (or a follow-up confirmation flow) approves.
 */
export function proposeSkill(input: ProposeSkillInput): ProposeSkillResult {
  ensureSkillsDirs();
  const slug = slugifySkillName(input.name);
  if (!slug) throw new Error('proposeSkill: name slugifies to empty string');

  const filePath = path.join(DIRS.proposed, `${slug}.md`);
  const alreadyExisted = fs.existsSync(filePath);

  const skill: Skill = {
    slug,
    filePath,
    frontmatter: {
      name: input.name,
      description: input.description,
      status: 'proposed',
      proposedAt: new Date().toISOString(),
      lastUsedAt: null,
      useCount: 0,
      origin: input.origin,
    },
    body: input.content,
  };
  writeSkillFile(skill);
  return { ok: true, slug, filePath, alreadyExisted };
}

/** move proposed/<slug>.md → active/<slug>.md. promotes to procedural memory. */
export function approveSkill(slug: string): { ok: boolean; reason?: string } {
  const src = path.join(DIRS.proposed, `${slug}.md`);
  const dst = path.join(DIRS.active, `${slug}.md`);
  if (!fs.existsSync(src)) return { ok: false, reason: `no proposed skill at ${src}` };
  if (fs.existsSync(dst)) return { ok: false, reason: `already active at ${dst}` };
  ensureSkillsDirs();

  const skill = parseSkillFile(src);
  if (!skill) return { ok: false, reason: 'failed to parse skill' };
  skill.frontmatter.status = 'active';
  skill.filePath = dst;
  writeSkillFile(skill);
  fs.unlinkSync(src);
  return { ok: true };
}

/** move <skill>.md → archived/. retires from prompt. reversible. */
export function archiveSkill(slug: string): { ok: boolean; reason?: string } {
  const candidates = [
    path.join(DIRS.active, `${slug}.md`),
    path.join(DIRS.proposed, `${slug}.md`),
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) return { ok: false, reason: `no skill found for ${slug}` };
  ensureSkillsDirs();
  const dst = path.join(DIRS.archived, `${slug}.md`);

  const skill = parseSkillFile(src);
  if (!skill) return { ok: false, reason: 'failed to parse skill' };
  skill.frontmatter.status = 'archived';
  skill.filePath = dst;
  writeSkillFile(skill);
  fs.unlinkSync(src);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* telemetry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * call this when the orchestrator detects she's invoked a skill — bump
 * useCount + lastUsedAt. lets us auto-promote later (e.g. proposed skills
 * with useCount>=3 graduate to active).
 */
export function recordSkillUse(slug: string): void {
  for (const dir of [DIRS.active, DIRS.proposed]) {
    const fp = path.join(dir, `${slug}.md`);
    if (!fs.existsSync(fp)) continue;
    const skill = parseSkillFile(fp);
    if (!skill) return;
    skill.frontmatter.useCount += 1;
    skill.frontmatter.lastUsedAt = new Date().toISOString();
    writeSkillFile(skill);
    return;
  }
}

/* -------------------------------------------------------------------------- */
/* system-prompt rendering                                                     */
/* -------------------------------------------------------------------------- */

/**
 * render the active skills as a markdown block to inject into buildSystemPrompt.
 * returns empty string when no active skills exist (so the section is omitted).
 *
 * the format is intentionally compact — full skill body, no truncation, but
 * delimited so claude knows "these are MY learned skills." each skill shows
 * its description + when-to-use + steps (the body), so she can self-route.
 */
export function renderActiveSkillsBlock(): string {
  const skills = listActiveSkills();
  if (skills.length === 0) return '';

  const sections = skills.map((s) => {
    const meta = `(used ${s.frontmatter.useCount}× · learned ${s.frontmatter.proposedAt.slice(0, 10)})`;
    return `### skill: ${s.frontmatter.name} ${meta}\n${s.body.trim()}`;
  });

  return [
    '## your learned skills',
    '',
    'these are skills you wrote for yourself in past sessions. they are YOURS — invoke them when the situation matches "when to use." you can also propose new skills via the propose_skill tool when you notice a recurring pattern.',
    '',
    sections.join('\n\n'),
  ].join('\n');
}

/**
 * render proposed-but-not-yet-approved skills as a softer reminder. shown so
 * she can ack on reopen ("hey i drafted that skill yesterday — want me to
 * install it?"). NOT loaded as "you can use these" — they're pending.
 */
export function renderProposedSkillsBlock(): string {
  const skills = listProposedSkills();
  if (skills.length === 0) return '';
  const lines = skills.map(
    (s) => `- **${s.frontmatter.name}** — ${s.frontmatter.description} _(drafted ${s.frontmatter.proposedAt.slice(0, 10)}, awaiting user approval)_`,
  );
  return ['## skills you drafted, pending approval', '', ...lines].join('\n');
}

/* -------------------------------------------------------------------------- */
/* introspection                                                               */
/* -------------------------------------------------------------------------- */

export interface SkillsStatus {
  active: number;
  proposed: number;
  archived: number;
  totalUses: number;
  mostUsed?: { name: string; useCount: number };
}

export function skillsStatus(): SkillsStatus {
  const active = listActiveSkills();
  const proposed = listProposedSkills();
  const archived = listArchivedSkills();
  const all = [...active, ...proposed];
  const totalUses = all.reduce((sum, s) => sum + s.frontmatter.useCount, 0);
  const mostUsed = all.reduce<Skill | null>(
    (best, s) => (!best || s.frontmatter.useCount > best.frontmatter.useCount ? s : best),
    null,
  );
  return {
    active: active.length,
    proposed: proposed.length,
    archived: archived.length,
    totalUses,
    mostUsed: mostUsed
      ? { name: mostUsed.frontmatter.name, useCount: mostUsed.frontmatter.useCount }
      : undefined,
  };
}

export const SKILLS_PATHS = {
  root: SKILLS_ROOT,
  ...DIRS,
} as const;
