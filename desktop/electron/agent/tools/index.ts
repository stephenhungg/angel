/**
 * tools/index.ts — re-exports the orchestrator's external-action tools and
 * exposes `isAgenticAvailable()` so runner.ts (and the main process) can
 * report capability state without poking at internals.
 *
 * Two tools live here:
 *   - executeCodex   : ship code via codex CLI (or deterministic mock)
 *   - verify         : evidence-based truth-checks (tests/build/http/file/haiku)
 *
 * Both write to stdout-stream callbacks; the wiring of those callbacks into
 * IPC channels (`desk:codex_stream`, `desk:codex_complete`,
 * `tools:verify_result`) lives in `agent/runner.ts`.
 */
export {
  executeCodex,
  isCodexAvailable,
  newJob as newCodexJob,
} from './codex';
export type {
  CodexJob,
  CodexResult,
  CodexExecOptions,
} from './codex';

export { verify } from './verifier';
export type { VerifyCheck, VerifyResult } from './verifier';

import { isCodexAvailable } from './codex';

export interface AgenticCapability {
  codexBinary: boolean;
  /** when false, delegate falls back to the mock executor */
  liveDelegate: boolean;
  /** when false, haiku_review uses a stdout-heuristic fallback */
  haikuVerifier: boolean;
}

export function getAgenticCapability(): AgenticCapability {
  const codex = isCodexAvailable();
  const haiku = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return {
    codexBinary: codex,
    liveDelegate: codex,
    haikuVerifier: haiku,
  };
}
