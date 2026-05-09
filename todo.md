# hackathon todo — may 9 2026

## context lock

- **track:** always-on agents (nia + tensorlake)
- **submission deadline: 6:00 pm SHARP** via https://forms.gle/fkoFXRo3L2MVkkz87 — needs deployed url + repo + team emails
- **deployed url = vercel swipe webapp** (not electron — localhost is disqualifying)
- **bg autonomy demo seeded** for 30% scoring weight: scheduled "while you were away..." event
- **judging:** 6:10 pm, 3 min in-person slot per team
- **team:** stephen + matthew

## phase 1: spike (9:15 am – 11:15 am)

- [ ] init monorepo: `angel/web` (next.js) + `angel/desktop` (electron + vite + r3f)
- [ ] **spike A:** vrm in r3f walking between waypoints
  - [ ] load vroid avatar (vrm)
  - [ ] load mixamo idle + walk anim, retarget to vrm
  - [ ] `walkTo(position)` lerps + plays anim
  - [ ] arrived event fires
- [ ] **spike B:** codex headless stdout stream
  - [ ] `codex exec` invocation from node main process
  - [ ] capture stdout
  - [ ] stream over local websocket
  - [ ] renderer receives + displays
- [ ] **spike C:** html-on-plane in r3f for desk monitor
  - [ ] drei `<Html>` portal
  - [ ] readable text from typical camera angle
  - [ ] update content live
- [ ] **commit decision at 11:15 am:** all three green → continue. any red → activate kill-switch.

## phase 2: parallel build (11:15 am – 3:30 pm — lunch at desk 12:30-1pm)

### lane A — web onboarding (codex agent or stephen)
- [ ] next.js app scaffold on vercel
- [ ] landing page (chunky cartoon font, miside-coded)
- [ ] swipe component (3 rounds × 4 cards each)
- [ ] archetype card data (4 archetypes per round, see PERSONA.md)
- [ ] clip embeddings via openai api
- [ ] weighted centroid + pca → 768d vector
- [ ] voice cluster assignment (1 of 6)
- [ ] write to convex.users
- [ ] "download angel.app" cta → triggers electron launch

### lane B — electron + 3d room (matthew)
- [ ] electron + vite + react scaffold
- [ ] r3f scene
- [ ] load sketchfab bedroom asset
- [ ] load vroid avatar (your chosen demo persona)
- [ ] waypoints: desk, couch, window, door (named scene transforms)
- [ ] `walkTo(waypoint)` w/ anim
- [ ] desk monitor mesh w/ html portal
- [ ] in-world browser plane w/ iframe
- [ ] convex client subscriptions
- [ ] subtitle hud (chunky cartoon font, fade in/out)
- [ ] animalese player (web audio, sample bank)
- [ ] text input + push-to-talk mic toggle

### lane C — convex + nia + state (codex agent)
- [ ] convex schema (see CONVEX_SCHEMA.md)
- [ ] mutations: setEmotion, setLocation, setTask, logEvolution, appendTurn
- [ ] queries: getAgentState, getCurrentTask, recentTurns
- [ ] convex auth (oauth or magic link)
- [ ] nia client w/ AngelMemory interface
- [ ] seed fake history (8-10 entries, see PERSONA.md)

### lane D — orchestrator + executors (codex agent or stephen)
- [ ] main process orchestrator: claude sonnet 4.6 client
- [ ] system prompt template (loads soul_anchor.md + persona traits + reflective_summary.md + recent memory)
- [ ] tool definitions (see TOOLS.md)
- [ ] task translator: claude haiku 4.5 (intent → codex prompt)
- [ ] codex spawner + ws bridge
- [ ] verifier: scripted checks + haiku reality-check
- [ ] stt: deepgram client
- [ ] ipc handlers (renderer → orchestrator)
- [ ] tool result → renderer (walkTo, monitor stream, browser open)

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
