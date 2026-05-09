# build plan

## track

**always-on agents** (sponsors: nia + tensorlake)

judging weights: bg execution 30%, statefulness 25%, agentic depth 25%, demo 10%, judge personal 10%.

⚠️ to address bg execution criterion: angel must show **autonomous activity that happens without user prompting** — e.g., "i prepared 3 commits while you were gone" notification on app open, scheduled consolidation, memory summarization that visibly runs.

## time budget

- hacking starts: **9:15 am**, may 9 2026
- **submission deadline: 6:00 pm SHARP** (NOT 8pm — 8pm is just relax time)
- in-person judging: 6:10 pm – 7:30 pm (3 min per team)
- **total build runway: 8 hours 45 min, but ship at 5:55pm to be safe**

## submission requirements (gating)

- **deployed demo link** — `localhost` is explicitly disqualifying. **the vercel-deployed swipe onboarding webapp IS the submission link.** electron app is the in-person experience at 6:10pm.
- github repo url
- team names + emails (stephen + matthew)
- one team member submits, one track per team

## the rule

if anything in the spike phase fails by 11:15am, fall back. don't sink the demo trying to debug rigging at 3pm.

## monorepo layout (already scaffolded — see /README.md)

```
angel/
├── web/              [stephen]   next.js — landing + swipe → vercel = submission url
├── desktop/
│   ├── electron/     [stephen]   main process: orchestrator, codex, verifier, ipc
│   └── src/          [matthew]   renderer: r3f scene, vrm, action runner, hud
├── convex/           [stephen]   schema, mutations, scheduled bg jobs
├── shared/           [both]      typescript contract — coordinate before editing
└── docs/             — all design docs
```

shared types live in `shared/src/{scene,persona,claim,agent}.ts`. import as `@angel/shared`. before editing shared/, ping the other dev — see [CONTRIBUTING.md](CONTRIBUTING.md).

## phase 1 — spike (9:15 am – 11:15 am, 2 hr)

validate the three highest-risk unknowns *before* committing to anything:

1. **vrm in r3f walking between waypoints** *(in `desktop/`)* — load vroid avatar, swap mixamo idle/walk anim, walk to a target. if not green by 11:15am, switch to 2d portrait mode.
2. **codex headless stdout stream** *(in `desktop/electron/tools/`)* — `codex exec` with prompt → capture stdout → stream over local ws. confirm reliable on this machine today.
3. **html-on-plane in r3f for desk monitor** *(in `desktop/src/components/`)* — drei `<Html>` portal showing live text. validate it renders at proper scale + readability.

**deliverable:** three working spike demos. no styling, ugly, but functional.

## phase 2 — parallel build (11:15 am – 3:30 pm, 4 hr 15 min — includes lunch break)

eat lunch at desk 12:30-1pm. don't lose 30min walking to a real lunch.

four lanes mapped to monorepo dirs:

### lane A — `web/` (stephen)
**goal: deployable url EARLY — this is the submission safety net**
- next.js app scaffold + tailwind
- landing page (chunky cartoon font, miside-coded)
- swipe ui (3 rounds × 4 archetypes — see `docs/PERSONA.md`)
- archetype cards (pre-made imgs + descriptions)
- clip embedding per archetype (openai api), weighted centroid on swipe history
- pca on accumulated centroids → 768d persona vector
- voice cluster assignment (1 of 6 banks)
- write to convex.users on completion
- generate JWT claim token (uses `shared/src/claim.ts`)
- "download angel.app" cta → triggers `angel://claim?token=...` deep link
- **deploy to vercel ASAP** — even with placeholder UI, get a live url banked

### lane B — `desktop/src/` (matthew)
- electron + vite + react + r3f scaffold (verify electron-vite hot reload)
- `<Scene>` w/ canvas, lights, camera (drei `<Environment preset="apartment" />`)
- `<Room>` — load sketchfab bedroom glb, find named anchor empties (see `docs/MATTHEW_CONTEXT.md` §3.2)
- `<Avatar>` — vrm via @pixiv/three-vrm + animation mixer (see §3.3)
- mixamo retarget helper in `src/lib/retarget.ts`
- `<ActionRunner>` — consumes ipc scene actions (uses `shared/src/scene.ts` types)
- `<ChatOverlay>` — speech bubble + chunky subtitle hud + animalese player
- `<StateBars>` — mood/energy/trust hud (subscribes to convex.agentState)
- zustand store in `src/stores/angel.ts` (persona, queue, chat history)
- ipc wrapper in `src/lib/ipc.ts` (typed `window.angel.*`)

### lane C — `convex/` (codex agent / stephen)
- schema in `convex/schema.ts` (see `docs/CONVEX_SCHEMA.md`)
- mutations: setEmotion, setLocation, setTask, logEvolution, appendTurn, saveOnboarding
- queries: getAgentState, getCurrentTask, recentTurns, getUser
- convex auth (oauth or magic link)
- nia client wrapper in `convex/memory.ts` (`AngelMemory` interface)
- seed fake history (8-10 entries — see `docs/PERSONA.md`)
- **bg crons** in `convex/crons.ts` — checkUserRepos, prepareGreeting (the always-on track requirement)

### lane D — `desktop/electron/` (codex agent / stephen)
- `main.ts`: BrowserWindow + ipc + agent spawn + protocol handler `angel://`
- `preload.ts`: contextBridge `window.angel.*` api
- `agent/runner.ts`: orchestrator (sonnet 4.6) — system prompt = soul_anchor + persona + reflective_summary + nia recent
- `agent/prompt.ts`: template loader (loads `~/.angel/soul_anchor.md`, etc.)
- `agent/tools.ts`: tool defs (uses `shared/src/agent.ts` types)
- `agent/parser.ts`: structured output extraction
- `tools/codex.ts`: spawn `codex exec` headless, stream stdout via ws
- `tools/playwright.ts`: browser actions
- `tools/verifier.ts`: scripted checks + haiku reality-check
- `persona/claim.ts`: JWT parse + verify + convex fetch + cache to `app.getPath('userData')/persona.json`

## phase 3 — integration + submission prep (3:30 pm – 5:00 pm, 1.5 hr)

reconverge all four lanes:
- wire onboarding → convex → electron read on launch via claim token
- orchestrator emits tools → renderer handlers fire (walk, monitor stream, browser open)
- end-to-end test: text input → say → walk → delegate → codex → monitor → verifier → narrate
- polish: subtitle pacing, animalese feel, walk anim smoothness
- pre-record codex run as backup
- **bg autonomy demo seeded** — fake "while you were away..." notification

## phase 4 — dress rehearsal + submission (5:00 pm – 5:55 pm)

- **3 full 3-min runs, no exceptions** (judging slot is 3 min)
- mic levels, font legibility, music balance
- demo machine isolation: no notifications, fullscreen, kill spotify/slack/discord
- pre-tune persona vector to known-good outfit/voice combo (don't gamble on live swipes)
- backup video recorded
- **5:50 pm: submit via https://forms.gle/fkoFXRo3L2MVkkz87** w/ vercel demo url + github repo url + team emails
- track: **always-on agents**

## phase 5 — judging (6:10 pm – 7:30 pm)

- 3 min in-person presentation per team
- top 6 across all tracks present live in front of room
- top 3 win

## responsibility split

- **stephen:** webapp swipe (lane A) + agent backend orchestrator (lane D) + convex/nia (lane C)
- **matthew:** electron + 3d room + vrm + scene actions + chat overlay (lane B, full-time)
- codex agents fill any gap. integration check at 3:30pm sharp.

## kill-switch matrix

| if at... | this isn't working | do this |
|---|---|---|
| 11:15 am | vrm in r3f | switch to 2d portrait mode (still expressive, easier) |
| 11:15 am | codex stdout stream | use pre-recorded screen capture, narrate over |
| 11:15 am | html-on-plane | render monitor as fixed hud overlay instead of in-world |
| 1:30 pm | walk anim smooth | teleport with fade transition |
| 2:30 pm | onboarding swipe | static "select your angel" buttons (no embedding live) |
| 3:30 pm | convex realtime | local zustand only |
| 5:00 pm | anything | freeze build, polish what works, submit at 5:50 |

## the prime directive

**at 5:00 pm we stop building.** anything not working at 5pm is cut. the demo runs the locked spine + whatever's polished. **submit by 5:55 pm.** shipping > completing. **do NOT miss 6pm submission deadline.**
