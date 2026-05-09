# hackathon todo — may 9 2026

## context lock

- **track:** always-on agents (nia + tensorlake)
- **submission deadline: 6:00 pm SHARP** via https://forms.gle/fkoFXRo3L2MVkkz87 — needs deployed url + repo + team emails
- **deployed url = vercel swipe webapp** (not electron — localhost is disqualifying)
- **bg autonomy demo seeded** for 30% scoring weight: scheduled "while you were away..." event
- **judging:** 6:10 pm, 3 min in-person slot per team
- **team:** stephen + matthew

## scaffold (DONE ✓)

- [x] github repo at https://github.com/stephenhungg/angel (private, matthew invited as collaborator)
- [x] monorepo: `web/` `desktop/` `convex/` `shared/` `docs/`
- [x] bun workspaces config in root `package.json`
- [x] `.env.example` with all required secrets
- [x] `shared/src/{scene,persona,claim,agent}.ts` types — the contract, import as `@angel/shared`
- [x] CONTRIBUTING.md with ownership map + trunk-based workflow
- [x] per-workspace READMEs

## phase 1: spike (9:15 am – 11:15 am)

- [ ] both: clone + `bun install` at root
- [ ] both: copy `.env.example` → `.env.local`, share JWT_SECRET in discord
- [ ] **spike A:** vrm walking — `desktop/src/components/Avatar.tsx` + `desktop/src/lib/retarget.ts`
  - [ ] vroid avatar in `desktop/public/vrm/test.vrm`
  - [ ] mixamo idle + walk fbx in `desktop/public/animations/`
  - [ ] retarget mixamo → vrm humanoid bones
  - [ ] `walkTo(position)` lerps + plays anim
  - [ ] arrived event fires (typed via `SceneActionComplete` from `@angel/shared`)
- [ ] **spike B:** codex stream — `desktop/electron/tools/codex.ts`
  - [ ] `codex exec` from node main process
  - [ ] capture stdout
  - [ ] stream over ipc/ws to renderer
  - [ ] renderer receives + displays
- [ ] **spike C:** html-on-plane — `desktop/src/components/Scene.tsx`
  - [ ] drei `<Html>` portal w/ `transform` + `distanceFactor`
  - [ ] readable text from typical camera angle
  - [ ] live content update via zustand
- [ ] **commit decision at 11:15 am:** all three green → continue. any red → activate kill-switch in BUILD_PLAN.md.

## phase 2: parallel build (11:15 am – 3:30 pm — lunch at desk 12:30-1pm)

### lane A — `web/` (stephen) — DEPLOYABLE URL EARLY
- [ ] next.js 15 app router + tailwind in `web/src/app/`
- [ ] landing page (chunky cartoon font, miside-coded)
- [ ] swipe component (3 rounds × 4 cards each — see `PERSONA.md`)
- [ ] archetype card data + reference images in `web/public/archetypes/`
- [ ] clip embeddings via openai api (centralized in `web/src/lib/embeddings.ts`)
- [ ] weighted centroid + pca → 768d vector
- [ ] voice cluster assignment (1 of 6)
- [ ] write to convex.users via `saveOnboarding` mutation
- [ ] generate JWT claim token (`web/src/lib/claim.ts`, uses `@angel/shared` types)
- [ ] "download angel" cta → `angel://claim?token=...` deep link
- [ ] **`vercel --prod` deploy by 12:30pm** — banked submission url

### lane B — `desktop/src/` (matthew) — RENDERER
- [ ] electron-vite scaffold
- [ ] `Scene.tsx` — canvas, lights, camera, `<Environment preset="apartment" />`
- [ ] `Room.tsx` — useGLTF for `desktop/public/room.glb`, expose anchors
- [ ] `Avatar.tsx` — vrm load + animation mixer
- [ ] `ActionRunner.tsx` — consumes ipc scene actions (typed via `@angel/shared`)
- [ ] `ChatOverlay.tsx` — speech bubble, input, animalese player
- [ ] `StateBars.tsx` — convex subscription, mood/energy/trust
- [ ] `stores/angel.ts` — zustand store
- [ ] `lib/{ipc,vrm-load,retarget,expressions,anchors}.ts`
- [ ] subtitle hud (chunky cartoon font, fade in/out)
- [ ] animalese player (web audio, sample bank by `traits.voice_cluster`)
- [ ] text input + (optional) push-to-talk mic

### lane C — `convex/` (codex agent / stephen)
- [ ] `convex/schema.ts` (see `CONVEX_SCHEMA.md`)
- [ ] `convex/users.ts` — saveOnboarding, getUser
- [ ] `convex/agentState.ts` — setEmotion, setLocation, setWalkingState
- [ ] `convex/tasks.ts` — createTask, updateTaskStatus
- [ ] `convex/turns.ts` — appendTurn, recentTurns
- [ ] `convex/evolution.ts` — logEvolution
- [ ] `convex/memory.ts` — `AngelMemory` interface w/ nia backend
- [ ] **`convex/crons.ts` — bg jobs (always-on track requirement, 30%!)**
- [ ] convex auth
- [ ] seed fake history (8-10 entries, see `PERSONA.md`)

### lane D — `desktop/electron/` (codex agent / stephen) — MAIN PROCESS
- [ ] `main.ts` — BrowserWindow + ipc + protocol handler `angel://`
- [ ] `preload.ts` — contextBridge `window.angel.*`
- [ ] `persona/claim.ts` — JWT verify + convex fetch + cache
- [ ] `agent/runner.ts` — sonnet 4.6 orchestrator loop
- [ ] `agent/prompt.ts` — template loader (soul_anchor + persona + reflective + nia recent)
- [ ] `agent/tools.ts` — tool defs (typed via `@angel/shared`)
- [ ] `agent/parser.ts` — structured output parser
- [ ] `tools/codex.ts` — spawn `codex exec` headless, stream
- [ ] `tools/playwright.ts` — browser automation
- [ ] `tools/verifier.ts` — scripted checks + haiku reality-check
- [ ] `~/.angel/` bootstrap (skills/, soul_anchor.md, reflective_summary.md)
- [ ] (optional) deepgram stt — *cuttable*

## phase 3: integration + submission prep (3:30 pm – 5:00 pm)

- [ ] wire onboarding → convex → electron read on launch
- [ ] orchestrator emits `say` → renderer subtitle + animalese
- [ ] orchestrator emits `walkTo` → renderer walks → arrived event → orchestrator chains
- [ ] orchestrator emits `delegate` → translator → codex → verifier → orchestrator narrates
- [ ] memory writes flow: orchestrator → main → nia (batched 30s)
- [ ] memory reads flow: nia → orchestrator system prompt
- [ ] e2e test: text input → say → walk → delegate → codex → monitor stream → verifier success → say "shipped" → in-world browser opens
- [ ] polish: subtitle pacing, animalese feel, walk smoothness, font legibility
- [ ] pre-record codex run as backup (in case live fails)

## phase 4: dress rehearsal + SUBMIT (5:00 pm – 5:55 pm)

- [ ] **3 full 3-min runs, no exceptions** (judging is 3-min slot)
- [ ] mic levels, font legibility from 10ft
- [ ] animalese volume balanced w/ ambient music
- [ ] demo machine: do-not-disturb, fullscreen, kill spotify + slack
- [ ] pre-tune persona vector (don't risk live convergence to bad outfit)
- [ ] backup video recorded
- [ ] kill spotify, discord, slack notifications
- [ ] **5:50 pm: SUBMIT** via https://forms.gle/fkoFXRo3L2MVkkz87
  - [ ] deployed url (vercel swipe webapp)
  - [ ] github repo url
  - [ ] team names + emails (stephen + matthew)
  - [ ] track: always-on agents
  - [ ] one-paragraph blurb

## phase 5: in-person judging (6:10 pm – 7:30 pm, 3 min slot)

- [ ] breathe
- [ ] queue demo on stage
- [ ] open with thesis: "agents are converging on capability, diverging from engagement. angel is the missing primitive."
- [ ] hit the 3 dopamine beats: discovery, memory callback, embodied ship
- [ ] flag bg autonomy explicitly: "she did things while we were away" — for the 30% criterion

## sockets checklist (do NOT skip)

these are zero-cost in v1 and unlock v2. spend the 5 minutes.

- [ ] `~/.angel/` directory exists with `skills/` subdir
- [ ] `~/.angel/soul_anchor.md` exists, prepended to every system prompt
- [ ] `~/.angel/reflective_summary.md` written at onboarding, read every turn
- [ ] `consolidate()` no-op function exists
- [ ] memory client uses AngelMemory interface (not direct nia calls)
- [ ] orchestrator prompt is template, not hardcoded string
- [ ] verifier exists (even minimal)
- [ ] convex.evolutionLog table exists w/ nullable vectorDelta
- [ ] convex.consolidations table exists (empty)

## scope creep guard

things you will be tempted to add at 4pm. **say no:**

- ❌ voice cloning (elevenlabs custom voice)
- ❌ live persona evolution rendering
- ❌ multi-task parallel execution (worktrees) — unless lane B finishes early
- ❌ browser tool — unless codex agent #4 has spare cycles after lane finishes
- ❌ real-time vector visualizer
- ❌ multi-language support
- ❌ mobile app
- ❌ the swipe ui having "perfect" archetype cards (good enough is good enough)

## scope creep allowed (only if before 5pm + actually working)

- ✅ secondary anim variations (sit, type, look-back)
- ✅ ambient room details (cat napping, plant in corner)
- ✅ subtle outfit shift mid-demo (scripted, fakes evolution)
- ✅ background music

## the prime directive

**at 5:00 pm, build is locked. SUBMIT BY 5:55 PM. do NOT miss 6pm.** demo runs the spine + whatever's polished. shipping > completing.

## post-hackathon (whoever's reading this monday morning)

- read RESEARCH.md for v2 plan
- read SOCKETS.md for the v1→v2 path
- if the demo won, build voyager skills next
- if it didn't, the architecture is still right — keep going
