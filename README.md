<div align="center">
  <img src="web/public/og.png" alt="angel — kawaii AI desktop coworker" width="640" />

  <h1>angel</h1>

  <p><strong>she sits at the desk with you for 8 hours and you don't feel alone.</strong></p>

  <p>
    <a href="https://angel-swipe.vercel.app"><strong>angel-swipe.vercel.app</strong></a>
    &nbsp;·&nbsp;
    <a href="#quick-start">install</a>
    &nbsp;·&nbsp;
    <a href="docs/DEMO.md">demo</a>
    &nbsp;·&nbsp;
    <a href="docs/VISION.md">vision</a>
  </p>

  <p>
    <em>by <a href="https://github.com/stephenhungg">stephen hung</a> &amp; matthew kim ·
    nozomio hackathon · always-on agents · may 9 2026</em>
  </p>
</div>

---

a kawaii desktop AI coworker you don't prompt — you **discover**. swipe through 12 cards across aesthetic × disposition × style, converge on a 768-dimensional persona vector, and instantiate an embodied companion who walks to the desk, sits, and ships your code. she remembers you across sessions. close the laptop and she replies via SMS.

## quick start

```bash
curl -sSL https://angel-swipe.vercel.app/install.sh | bash
```

one command. handles the unsigned-alpha gatekeeper friction (`xattr -cr`), drops `Angel.app` into `/Applications`, opens it. mac arm64 only for v0.0.1.

then head to **[angel-swipe.vercel.app/swipe](https://angel-swipe.vercel.app/swipe)** to discover her.

## the thesis

agents today are converging on capability but diverging from engagement. devin, openclaw, hermes, claude code — all ship code, none are anyone you'd want to spend time with. the bottleneck on personal agents isn't intelligence; it's **presence**. angel makes the agent something you want to summon, not something you have to.

> discovery > prompting. embodiment > terminals. relationship > sessions.

## demo arc (3 min)

1. **swipe onboard** — 3 rounds × 4 cards, a 768d persona vector locks in
2. **deep-link → app launches** — first-person room reveal, she walks to the window
3. **background autonomy** — "while you were away, i prepared 3 commits…"
4. **memory callback** — "how'd that portfolio thing land?" (she actually remembers)
5. **assign task** — "add a project card for angel and deploy it"
6. **she sits at the desk, monitor lights up** — real codex stdout streams in-world
7. **deploy lands** — in-world browser opens to the live url

## stack

- **web** — next.js 15, tailwind, framer-motion, gsap, lenis (landing + swipe deck)
- **desktop** — electron + react-three-fiber + three-vrm (kawaii room + agent loop)
- **agent** — claude sonnet 4.6 orchestrator + codex headless executor
- **realtime spine** — convex (state, scheduled bg jobs, pub/sub)
- **memory** — nia (6-layer model, semantic + episodic recall)
- **surfaces** — electron (richest body) · sms · discord (one being, many bodies)

## monorepo

```
angel/
├── web/         next.js — landing + swipe (live: angel-swipe.vercel.app)
├── desktop/     electron + r3f — room + agent loop
├── convex/      realtime spine + scheduled bg jobs
├── shared/      typescript contract (scene actions, persona, claim handoff)
└── docs/        all design + planning docs
```

each workspace has its own README. start with [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## docs

essential:
- **[VISION.md](docs/VISION.md)** — the thesis, four pillars, why she's not another ai
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — full system diagram + component split
- **[DEMO.md](docs/DEMO.md)** — 3-min judging slot beat-by-beat + rubric mapping
- **[HACKATHON.md](docs/HACKATHON.md)** — official event reference (track, rubric, sponsors)

design + soul:
- [PERSONA.md](docs/PERSONA.md) — archetypes, voice banks, vector → traits
- [SOUL_ANCHOR.md](docs/SOUL_ANCHOR.md) — invariants that never drift
- [TOOLS.md](docs/TOOLS.md) — orchestrator tool registry

systems:
- [STACK.md](docs/STACK.md) · [MEMORY.md](docs/MEMORY.md) · [CONVEX_SCHEMA.md](docs/CONVEX_SCHEMA.md) · [SOCKETS.md](docs/SOCKETS.md) · [SWIPE_SPEC.md](docs/SWIPE_SPEC.md)

ops:
- [BUILD_PLAN.md](docs/BUILD_PLAN.md) · [RISKS.md](docs/RISKS.md) · [SUBMISSION.md](docs/SUBMISSION.md) · [todo.md](docs/todo.md) · [lessons.md](docs/lessons.md)

## name

**angel.** she's chosen by you. she'd rather be honest than impressive.

---

<div align="center">
  <sub>built in 24 hours at the EF office, sf · sponsors: nia · tensorlake</sub>
</div>
