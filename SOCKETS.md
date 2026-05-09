# sockets — v2 / v3 hooks

## what this is

architectural slots that v1 leaves open but wired so v2 doesn't require refactoring. zero-cost discipline today, infinite value tomorrow.

each socket has:
- **interface defined** in v1
- **stub or no-op implementation** in v1
- **clear path** to real implementation in v2

## socket inventory

### 1. procedural memory (skill library)

**v1:**
- create `~/.angel/skills/` directory at install
- orchestrator system prompt includes section: `current skills: {{listSkills()}}`
- `listSkills()` returns `[]` in v1
- skill md files have a defined frontmatter schema (see MEMORY.md)

**v2:**
- post-`delegate` hook: small model summarizes successful task → skill candidate
- user confirms or auto-confirms → write skill md
- pre-`delegate` hook: search skills/ for matching preconditions, prepend procedure to codex prompt
- skill metadata updates (success_count, fail_count, last_used) on each invocation

### 2. reflective summary

**v1:**
- file: `~/.angel/reflective_summary.md`
- generated once at onboarding completion (template + persona traits)
- read into orchestrator system prompt every turn

**v2:**
- nightly cron rewrites this file based on day's turns
- diff stored in convex.consolidations
- orchestrator continues to read it every turn — content evolves, mechanism unchanged

### 3. consolidation cron

**v1:**
- function: `consolidate(userId)` — exists, returns `{ ok: true, skipped: true }`
- not scheduled

**v2:**
- electron schedules via node-cron at 4am local time
- pulls turns + events from convex
- haiku 4.5 summarizes
- writes consolidations row + updates reflective_summary.md
- prunes oldest episodic memories below importance threshold

### 4. drift detector

**v1:**
- file: `~/.angel/soul_anchor.md` exists, prepended to every system prompt
- no detection runs

**v2:**
- after every 100 turns: sample 50 recent dialogues, embed, compare to soul_anchor embedding
- if cosine < 0.65: log warning, surface in user-facing diagnostic
- if cosine < 0.50: auto-rollback to last known-good persona vector

### 5. hierarchical planner

**v1:**
- orchestrator handles single-turn tool calls only
- no goal tree

**v2:**
- new tool: `plan(goal)` → emits goal tree
- separate planner model walks tree, dispatches leaves as `delegate` calls
- replanner triggers on leaf failure
- progress aggregation: in-world UI shows tree state

### 6. parallel execution via worktrees

**v1 stretch (if time permits):**
- `parallel(tasks[])` tool exists
- main creates N git worktrees, spawns N codex instances
- 3 monitors render in scene, each streams one
- merge by branch on success

**v2:**
- automatic decomposition: orchestrator infers when to parallelize
- conflict detection on merge
- shared scratch memory across parallel tasks

### 7. tool learning

**v1:**
- tool registry hardcoded (TOOLS.md)

**v2:**
- learned tool chains: when delegate + browse + deploy succeed in sequence repeatedly, codify as a single new tool
- new tool definitions written to `~/.angel/tools/learned/` and dynamically loaded

### 8. preference learning (online)

**v1:**
- evolutionLog table exists, vectorDelta always null
- persona vector static after onboarding

**v2:**
- implicit signals (suggestions accepted, dismissed, repeated patterns) → vectorDelta computed
- evolutionLog entries with non-null delta
- nightly: aggregate deltas, apply to personaVector with momentum
- bounded by soul anchor (drift detector enforces)

### 9. self-rewriting prompts (v3)

**v1:**
- system prompt template + persona traits + soul anchor + reflective summary

**v3:**
- angel can edit her own dialogue prompt section based on what worked
- versioned, reviewable, reversible
- soul anchor remains immutable

### 10. multi-tenant / multi-device sync

**v1:**
- single user, single device

**v2:**
- skills sync to convex `skills` table
- reflective summary sync
- evolution log already in convex
- multi-device session resume

## the meta-socket

**don't ship v1 in a way that makes v2 impossible.**

specific anti-patterns to avoid in v1:
- ❌ hardcoding persona traits in source code → ✅ load from convex/file
- ❌ static system prompt string → ✅ template w/ injection points
- ❌ skipping verifier entirely → ✅ minimal verifier (the discipline matters)
- ❌ orchestrator owns memory directly → ✅ memory client interface
- ❌ tool registry as code → ✅ tool registry as data (TOOLS.md is canonical)

## socket validation checklist (before submit)

- [ ] `~/.angel/` directory exists with skills/ subdir
- [ ] `~/.angel/soul_anchor.md` written and prepended to every system prompt
- [ ] `~/.angel/reflective_summary.md` written at onboarding, read every turn
- [ ] `consolidate()` function exists as no-op
- [ ] memory client uses AngelMemory interface
- [ ] orchestrator system prompt loads from template, not hardcoded
- [ ] verifier exists, even if minimal
- [ ] convex.evolutionLog table exists with vectorDelta nullable
- [ ] convex.consolidations table exists, empty
