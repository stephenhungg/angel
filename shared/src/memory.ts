/**
 * Memory contracts for Angel. Canonical definitions currently live in
 * `agent.ts`; this module exists so `export * from './memory'` in the
 * package barrel resolves and future memory-only types can land here
 * without churn across web/desktop/convex.
 */
export type { MemoryType, MemoryEntry } from './agent';
