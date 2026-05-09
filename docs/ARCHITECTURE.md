# architecture

## system diagram

```
┌────────────────────────────────────────────────────────────────┐
│  WEB (vercel) — landing + onboarding                           │
│  • landing page (miside-coded aesthetic)                       │
│  • swipe onboarding: 3 rounds × 4 archetypes                   │
│  • clip embeddings → centroid → PCA → 768d persona vector      │
│  • voice bank cluster assignment (1 of 6)                       │
│  • writes → CONVEX.users { vector, voice_id, traits }          │
│  • CTA → "download angel.app"                                  │
└──────────────────────────┬─────────────────────────────────────┘
                           ↓ download + login
┌────────────────────────────────────────────────────────────────┐
│  ELECTRON (local app)                                          │
│                                                                │
│  ┌────────── RENDERER (react) ─────────────────────────────┐  │
│  │  r3f scene: room, vrm avatar, waypoints, desk monitor   │  │
│  │  HUD: chunky cartoon subtitles + text input + mic       │  │
│  │  audio: animalese player, persona sample bank           │  │
│  │  subscribes → CONVEX (emotion, location, task status)   │  │
│  └─────────────────────┬───────────────────────────────────┘  │
│                        │ ipc                                  │
│  ┌─────────────────────┴── MAIN (node) ─────────────────────┐ │
│  │  ORCHESTRATOR (front brain) — claude sonnet 4.6          │ │
│  │   • persona-conditioned system prompt                    │ │
│  │   • tools: walkTo, delegate, browse, remember, react,    │ │
│  │            expression, deploy, parallel                  │ │
│  │   • <800ms p50, prefills filler if delegate is slow      │ │
│  │                                                          │ │
│  │  STT — deepgram or whisper (input only)                  │ │
│  │  TASK TRANSLATOR — small model, intent → codex prompt    │ │
│  │  CODEX EXECUTOR — headless, streams stdout via local ws  │ │
│  │  BROWSER EXECUTOR — playwright mcp / browserbase         │ │
│  │  VERIFIER — small model + scripted reality checks        │ │
│  │  TOOL HANDLERS — fs, git, deploy, in-world browser nav   │ │
│  │  STATE BRIDGE — convex writes, nia writes                │ │
│  └─────────────────────┬───────────────────────────────────┘ │
└────────────────────────┼─────────────────────────────────────┘
                         ↓
       ┌─────────────────┼─────────────────┐
       ↓                 ↓                 ↓
   ┌─────────┐       ┌─────────┐       ┌──────────┐
   │ CONVEX  │       │   NIA   │       │  CODEX   │
   │ realtime│       │ memory  │       │ headless │
   │  spine  │       │  index  │       │          │
   └─────────┘       └─────────┘       └──────────┘
```

## the two-brain split

**orchestrator (front brain)** — sonnet 4.6, runs every turn
- system prompt = persona vector → traits + voice tone
- input: user msg + nia retrieval + room state
- output: structured tool calls
  - `say(text, emotion)` → animalese + subtitle reveal + mouth pulse
  - `walkTo(waypoint)` → renderer anim
  - `delegate(task_spec)` → task translator → codex
  - `browse(intent)` → playwright agent
  - `parallel(tasks[])` → spawn N codex via worktrees
  - `remember(fact)` → write to nia
  - `react(emotion)` → convex.emotion update
  - `expression(face)` → blendshape preset
  - `deploy(target)` → vercel api + in-world browser reveal
- owns: dialogue, vibes, narration, planning, when-to-delegate

**executor (back brain)** — codex headless, only invoked on `delegate`
- gets clean task spec from translator (no persona fluff)
- streams stdout → main → renderer → in-world monitor
- on completion → verifier reality-checks → orchestrator narrates outcome

**why this split:**
- decouples soul from competence (swap codex for claude code without touching personality)
- different latency budgets (orchestrator <800ms for embodied feel, executor can take minutes)
- specialization wins (codex is better at code than browser agents)

## state ownership

| state | location | rationale |
|---|---|---|
| persona vector | convex (source) + electron (cached) | single source of truth |
| current emotion | convex | renderer subscribes for live face anim |
| current location | convex | renderer subscribes for walk triggers |
| current task + status | convex | monitor shows progress |
| evolution log | convex | every interaction = nudge event |
| codex stdout stream | local ws (main → renderer) | too high freq for convex |
| long-term memory | nia | semantic recall |
| short-term context | orchestrator's recent msgs | rolling window |
| skill library (v2) | local fs `~/.angel/skills/` | procedural memory |
| reflective summary (v2) | local fs `~/.angel/reflective_summary.md` | self-model |
| soul anchor | local fs `~/.angel/soul_anchor.md` | invariants |

## the gnarly bits

1. **orchestrator latency vs embodiment.** <800ms or immersion dies. solution: stream filler ("hmm, lemme think...") immediately.
2. **delegate handoff.** orchestrator outputs *intent*, separate task translator → codex prompt with repo context. don't let personality write code prompts.
3. **persona vector → visible traits.** vector → cluster index → prerendered outfit + room palette + voice bank. don't generate outfits live.
4. **memory write timing.** batch nia flushes every 30s.
5. **walk + delegate sequencing.** walk anim emits `arrived` event → delegate fires. sequence in main, not orchestrator.
6. **convex auth in electron.** auth tokens in main via secure-keychain, never in renderer.
7. **she lies cutely.** without verifier, codex reports false success. verifier checks fs/curl/git before she narrates.

## extensibility sockets (for v2 — see SOCKETS.md)

architecture deliberately leaves these slots empty but wired:
- skill library directory (procedural memory)
- reflective summary file (self-model)
- consolidation cron hook (sleep cycle)
- drift detector (identity stability)
- hierarchical planner (multi-step goals)
