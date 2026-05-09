/**
 * tools/verifier.ts — soul-anchor invariant #2 in code form.
 *
 * angel must NOT claim success without evidence. After every `delegate(intent)`
 * she calls `verify(check)` and only narrates "shipped" if `ok === true`. If
 * the check fails, she reports honestly. The orchestrator's system prompt
 * enforces the call site; this module enforces the truth.
 *
 * Five check kinds:
 *   - tests        : run the project's test command, parse pass/fail count
 *   - build        : run the project's build command, parse exit code
 *   - http         : GET a URL, assert 200 + optional substring
 *   - file_exists  : stat a path
 *   - haiku_review : claude-haiku 4.5 reads stdout + intent and returns yes/no
 */
import Anthropic from '@anthropic-ai/sdk';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface VerifyCheck {
  kind: 'tests' | 'build' | 'http' | 'file_exists' | 'haiku_review';
  args: Record<string, unknown>;
}

export interface VerifyResult {
  ok: boolean;
  evidence: string;
  details?: unknown;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function pickCommand(workingDir: string, kind: 'test' | 'build'): string[] | null {
  const pkgPath = path.join(workingDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  let pkg: { scripts?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
  const scripts = pkg.scripts ?? {};

  if (kind === 'test') {
    if (scripts.test) {
      // prefer bun if a bun.lockb sits beside package.json
      if (fs.existsSync(path.join(workingDir, 'bun.lockb'))) return ['bun', 'test'];
      return ['npm', 'test', '--silent'];
    }
    return null;
  }
  // build
  if (scripts.build) {
    if (fs.existsSync(path.join(workingDir, 'bun.lockb'))) return ['bun', 'run', 'build'];
    return ['npm', 'run', 'build', '--silent'];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* checks                                                              */
/* ------------------------------------------------------------------ */

async function checkTests(workingDir: string): Promise<VerifyResult> {
  const cmd = pickCommand(workingDir, 'test');
  if (!cmd) {
    return {
      ok: false,
      evidence: 'no `test` script in package.json — cannot verify tests',
    };
  }
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: workingDir,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1', CI: '1' },
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  // best-effort pass-count parse
  const passMatch = out.match(/(\d+)\s+pass/i) || out.match(/Tests:\s+(\d+)\s+passed/i);
  const failMatch = out.match(/(\d+)\s+fail/i) || out.match(/(\d+)\s+failed/i);
  const passes = passMatch ? Number(passMatch[1]) : 0;
  const fails = failMatch ? Number(failMatch[1]) : null;
  const ok = r.status === 0 && (fails === null || fails === 0);
  const evidence = ok
    ? `tests pass (${passes} passing)`
    : `tests failed (exit ${r.status}${fails !== null ? `, ${fails} fail` : ''})`;
  return { ok, evidence, details: { exitCode: r.status, passes, fails } };
}

async function checkBuild(workingDir: string): Promise<VerifyResult> {
  const cmd = pickCommand(workingDir, 'build');
  if (!cmd) {
    return {
      ok: false,
      evidence: 'no `build` script in package.json — cannot verify build',
    };
  }
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: workingDir,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: '1', CI: '1' },
  });
  const ok = r.status === 0;
  const evidence = ok
    ? `build succeeded (exit 0)`
    : `build failed (exit ${r.status})`;
  return { ok, evidence, details: { exitCode: r.status } };
}

async function checkHttp(args: Record<string, unknown>): Promise<VerifyResult> {
  const url = String(args.url ?? args.target ?? '');
  if (!url) return { ok: false, evidence: 'http check needs a url' };
  const expectSubstring =
    typeof args.expect === 'string' ? (args.expect as string) : undefined;
  try {
    const res = await fetch(url, { method: 'GET' });
    const status = res.status;
    if (status !== 200) {
      return { ok: false, evidence: `${url} returned ${status}`, details: { status } };
    }
    if (expectSubstring) {
      const body = await res.text();
      if (!body.includes(expectSubstring)) {
        return {
          ok: false,
          evidence: `200 OK but body missing "${expectSubstring}"`,
          details: { status, bodyLen: body.length },
        };
      }
      return {
        ok: true,
        evidence: `${url} → 200, contains "${expectSubstring}"`,
        details: { status, bodyLen: body.length },
      };
    }
    return { ok: true, evidence: `${url} → 200`, details: { status } };
  } catch (err) {
    return {
      ok: false,
      evidence: `fetch error: ${(err as Error).message}`,
    };
  }
}

async function checkFileExists(
  args: Record<string, unknown>,
  workingDir: string,
): Promise<VerifyResult> {
  const rel = String(args.path ?? args.target ?? '');
  if (!rel) return { ok: false, evidence: 'file_exists check needs a path' };
  const abs = path.isAbsolute(rel) ? rel : path.join(workingDir, rel);
  const exists = fs.existsSync(abs);
  return {
    ok: exists,
    evidence: exists ? `file exists: ${rel}` : `file missing: ${rel}`,
    details: { path: abs },
  };
}

async function checkHaikuReview(
  args: Record<string, unknown>,
): Promise<VerifyResult> {
  const intent = String(args.intent ?? args.target ?? '');
  const stdout = String(args.stdout ?? '');
  if (!intent) {
    return { ok: false, evidence: 'haiku_review needs an intent' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    // graceful fallback: heuristic over stdout
    const lower = stdout.toLowerCase();
    const looksGood =
      /\bexit 0\b/.test(lower) ||
      /\bpass\b/.test(lower) ||
      /built in /.test(lower) ||
      /\bdone\b/.test(lower);
    // "0 fail" / "0 failed" / "0 errors" all count as success markers
    const negFails = /\b0 fail/.test(lower) || /\b0 failed/.test(lower);
    const negErrors = /\b0 errors?\b/.test(lower);
    const looksBad =
      (!negErrors && /\berror\b/.test(lower)) ||
      (!negFails && /\bfail\b/.test(lower)) ||
      /\bexit [1-9]/.test(lower);
    const ok = looksGood && !looksBad;
    return {
      ok,
      evidence: `(no anthropic key) heuristic review → ${ok ? 'plausible success' : 'looks off'}`,
      details: { mode: 'heuristic' },
    };
  }

  const client = new Anthropic({ apiKey });
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system:
        'You are a strict code-review verifier. Read the user\'s intent and the agent\'s stdout, then answer ONLY with a single JSON object {"ok": boolean, "reason": string}. ok=true ONLY if the stdout shows the intent was actually accomplished (real edits, passing tests/build if relevant). If anything is missing or fishy, ok=false.',
      messages: [
        {
          role: 'user',
          content: `intent: ${intent}\n\nstdout (truncated to last 4000 chars):\n${stdout.slice(-4000)}`,
        },
      ],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
    // tolerate code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, evidence: `haiku returned non-json: ${raw.slice(0, 120)}` };
    }
    const parsed = JSON.parse(jsonMatch[0]) as { ok: boolean; reason?: string };
    return {
      ok: Boolean(parsed.ok),
      evidence: parsed.reason ?? (parsed.ok ? 'haiku says ok' : 'haiku says not ok'),
      details: { mode: 'haiku', raw },
    };
  } catch (err) {
    return {
      ok: false,
      evidence: `haiku review failed: ${(err as Error).message}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* public api                                                          */
/* ------------------------------------------------------------------ */

export async function verify(
  check: VerifyCheck,
  workingDir: string,
): Promise<VerifyResult> {
  switch (check.kind) {
    case 'tests':
      return checkTests(workingDir);
    case 'build':
      return checkBuild(workingDir);
    case 'http':
      return checkHttp(check.args);
    case 'file_exists':
      return checkFileExists(check.args, workingDir);
    case 'haiku_review':
      return checkHaikuReview(check.args);
    default:
      return { ok: false, evidence: `unknown check kind: ${(check as VerifyCheck).kind}` };
  }
}
