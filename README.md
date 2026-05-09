# angel

> get addicted to your agent so you actually get shit done.

a personal ai agent you don't prompt — you discover. swipe through generated archetypes, converge on a persona vector, and instantiate an embodied companion who lives in a 3d room on your machine, remembers you across sessions, and ships your code by walking to the desk and actually doing it.

built for the **nozomio "build the future of ai agents" hackathon** — may 9 2026, sf.

## the thesis

agents today are converging on capability but diverging from engagement. openclaw, hermes, devin, claude code — all ship code, none are anyone you'd want to spend time with. the bottleneck on personal agents isn't intelligence; it's *presence*. angel makes the agent something you want to summon, not something you have to.

discovery > prompting. embodiment > terminals. relationship > sessions.

## demo arc (90 seconds)

1. **swipe onboard** — 3 rounds × 4 archetypes, vector visualizer converges
2. **download → app launches** — first-person room reveal, she's at the window
3. **she greets you with a memory callback** ("how'd that portfolio thing land?")
4. **assign task** — "add a project card for angel to my portfolio and deploy it"
5. **she walks to desk, sits, monitor lights up** — codex stdout streams, typing anim syncs, real keystrokes
6. **deploy lands** — in-world browser opens to the live url
7. **she leans back: "shipped. want me to tweet it?"**

## stack (one-liner)

next.js web for landing+swipe. electron + r3f + three-vrm for the room. claude sonnet 4.6 orchestrator with tool calling. codex headless executor. convex realtime spine. nia memory. animalese audio + chunky subtitles, miside-coded.

## doc index

- [VISION.md](VISION.md) — thesis + problem statement
- [ARCHITECTURE.md](ARCHITECTURE.md) — full system diagram + component split
- [STACK.md](STACK.md) — concrete tech choices + why
- [DEMO.md](DEMO.md) — beat-by-beat 90sec arc + judge psychology
- [BUILD_PLAN.md](BUILD_PLAN.md) — lanes, time budget, spike order
- [RISKS.md](RISKS.md) — known unknowns + kill switches
- [RESEARCH.md](RESEARCH.md) — sota delta + v1/v2/v3 path
- [PERSONA.md](PERSONA.md) — archetypes, voice banks, vector → traits
- [SOUL_ANCHOR.md](SOUL_ANCHOR.md) — invariants that never drift
- [TOOLS.md](TOOLS.md) — orchestrator tool registry spec
- [MEMORY.md](MEMORY.md) — nia schema + episodic/semantic split
- [CONVEX_SCHEMA.md](CONVEX_SCHEMA.md) — realtime spine tables
- [SOCKETS.md](SOCKETS.md) — empty-but-architected v2 hooks
- [todo.md](todo.md) — hackathon task list
- [lessons.md](lessons.md) — self-improvement log

## name

angel. she's chosen by you. she'd rather be honest than impressive.
