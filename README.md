# angel

> get addicted to your agent so you actually get shit done.

a personal ai agent you don't prompt — you discover. swipe through generated archetypes, converge on a persona vector, and instantiate an embodied companion who lives in a 3d room on your machine, remembers you across sessions, and ships your code by walking to the desk and actually doing it.

built for the **nozomio hackathon — always-on agents track** (sponsors: nia + tensorlake) — may 9 2026, EF office, sf. submission deadline **6:00 pm sharp**, judging 6:10–7:30 pm.

see [docs/HACKATHON.md](docs/HACKATHON.md) for full event details, rubric, sponsor credits, and rules.

## the thesis

agents today are converging on capability but diverging from engagement. openclaw, hermes, devin, claude code — all ship code, none are anyone you'd want to spend time with. the bottleneck on personal agents isn't intelligence; it's *presence*. angel makes the agent something you want to summon, not something you have to.

discovery > prompting. embodiment > terminals. relationship > sessions.

## demo arc (3 min)

1. **swipe onboard** — 3 rounds × 4 archetypes, vector visualizer converges
2. **download → app launches** — first-person room reveal, she's at the window
3. **bg autonomy beat** — "while you were away, i prepared 3 commits..." (30% scoring weight)
4. **memory callback** — "how'd that portfolio thing land?" (25% scoring weight)
5. **assign task** — "add a project card for angel to my portfolio and deploy it"
6. **she walks to desk, sits, monitor lights up** — real codex stdout streams (25% agentic depth)
7. **deploy lands** — in-world browser opens to live url. "shipped. want me to tweet it?"

## stack (one-liner)

next.js web for landing+swipe. electron + r3f + three-vrm for the room. claude sonnet 4.6 orchestrator with tool calling. codex headless executor. convex realtime spine. nia memory. animalese audio + chunky subtitles, miside-coded.

## monorepo structure

```
angel/
├── web/         next.js — landing + swipe (vercel = submission url)  [stephen]
├── desktop/     electron + r3f — room + agent loop                   [matthew + stephen]
├── convex/      realtime spine + scheduled bg jobs                   [stephen]
├── shared/      typescript contract (scene actions, persona, claim)  [both]
└── docs/        all design + planning docs
```

each workspace has its own README. start with [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the workflow.

## doc index

planning + spec:
- [docs/HACKATHON.md](docs/HACKATHON.md) — official event reference (track, rubric, rules, credits)
- [docs/VISION.md](docs/VISION.md) — thesis + problem statement
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — full system diagram + component split
- [docs/STACK.md](docs/STACK.md) — concrete tech choices + why
- [docs/DEMO.md](docs/DEMO.md) — 3-min judging slot beat-by-beat + rubric mapping
- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — phases, lanes, time budget, kill-switches
- [docs/RISKS.md](docs/RISKS.md) — known unknowns + kill switches
- [docs/RESEARCH.md](docs/RESEARCH.md) — sota long-run agent delta + v1/v2/v3 path

design + soul:
- [docs/PERSONA.md](docs/PERSONA.md) — archetypes, voice banks, vector → traits
- [docs/SOUL_ANCHOR.md](docs/SOUL_ANCHOR.md) — invariants that never drift
- [docs/TOOLS.md](docs/TOOLS.md) — orchestrator tool registry spec

systems:
- [docs/MEMORY.md](docs/MEMORY.md) — nia schema + 6-layer model
- [docs/CONVEX_SCHEMA.md](docs/CONVEX_SCHEMA.md) — realtime spine tables
- [docs/SOCKETS.md](docs/SOCKETS.md) — v2/v3 architecture sockets

ops:
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — how stephen + matthew work on main
- [docs/MATTHEW_CONTEXT.md](docs/MATTHEW_CONTEXT.md) — matthew's lane reference
- [docs/todo.md](docs/todo.md) — hackathon task list (live)
- [docs/lessons.md](docs/lessons.md) — self-improvement log

## name

angel. she's chosen by you. she'd rather be honest than impressive.
