# risks

## risk hierarchy (highest to lowest)

### 🔴 critical — kill the demo if not handled

**1. vrm rig + walk anim in r3f**
- *why risky:* you haven't shipped this combo before
- *failure mode:* avatar T-poses, doesn't walk, anim doesn't blend
- *mitigation:* spike first (11:30am-1pm). if not working by 1pm, swap to 2d portrait mode immediately. don't gamble.
- *kill-switch:* 2d portrait mode w/ blendshape emotions still hits the personality beat

**2. codex headless reliability**
- *why risky:* in-world monitor depends on stdout streaming live
- *failure mode:* codex hangs, errors silently, takes 5 minutes when demo budgets 30 sec
- *mitigation:* pre-test the exact demo prompt 10x against real repo. budget should be deterministic.
- *kill-switch:* pre-recorded screen capture of clean run, narrate over it

**3. she lies cutely**
- *why risky:* without verifier, codex can report success when failing. orchestrator narrates "shipped!" → judges click → 404. instant loss.
- *failure mode:* false success narration → trust collapses
- *mitigation:* verifier is non-negotiable. scripted checks: file written? curl health 200? git commit landed?
- *kill-switch:* if verifier breaks, lock task to a deterministic pre-tested deploy that always works

### 🟡 high — degrade demo significantly

**4. orchestrator latency**
- *failure mode:* 2sec response → embodiment dies, feels like alexa
- *mitigation:* sonnet 4.6 + structured outputs. stream filler line ("hmm, lemme think...") immediately while real response generates.
- *kill-switch:* haiku 4.5 fallback (faster, less personality but fine for demo)

**5. animalese pacing feel**
- *failure mode:* sounds robotic, kills cute factor
- *mitigation:* tune sample bank, vary pitch on punctuation, slow on commas, fast on excitement. budget 1 hour to get this right.
- *kill-switch:* fall back to silent subtitle reveal w/ ambient room music

**6. convex realtime + electron auth**
- *failure mode:* renderer can't subscribe to state, room doesn't react
- *mitigation:* test auth flow early in phase 2. keychain storage in main process.
- *kill-switch:* local zustand only, lose live sync but demo runs

**7. walk → delegate sequencing**
- *failure mode:* monitor lights up while she's still walking → breaks immersion
- *mitigation:* walk anim emits `arrived` event in renderer, ipc → main, *then* delegate fires
- *kill-switch:* fixed 3-sec walk timer, fire delegate after timer

### 🟢 medium — annoying but recoverable

**8. swipe-to-vector convergence ugly**
- *failure mode:* persona vector picks weird outfit/voice combo for demo
- *mitigation:* pre-tune the demo vector. don't gamble on live swipes.
- *kill-switch:* hardcoded vector for demo run

**9. nia memory recall feels off**
- *failure mode:* memory callback retrieval picks wrong fake history → awkward beat
- *mitigation:* seed history with specific phrases that match expected query embeddings
- *kill-switch:* hardcode the callback line for demo

**10. deepgram stt latency / drops**
- *failure mode:* voice input feels laggy or fails
- *mitigation:* default to text input for demo, mic toggle as bonus
- *kill-switch:* text input only

**11. vercel deploy fails live**
- *failure mode:* "✓ deployed" never appears
- *mitigation:* pre-deploy a known-good version. demo "deploy" replaces a placeholder with real card on already-live site.
- *kill-switch:* fake deploy success, show pre-deployed url

**12. font legibility from 10ft**
- *failure mode:* judges can't read subtitles
- *mitigation:* test from across the room before stage. 64px+ font size. high contrast.
- *kill-switch:* increase font, slow reveal speed

### 🟢 low — only matters for polish

**13. mixamo bone retargeting**
- *failure mode:* avatar arms point wrong direction during walk
- *mitigation:* test specific avatar + anim combo early
- *kill-switch:* idle pose only, fade-translate between waypoints

**14. desk monitor html-on-plane scale**
- *failure mode:* text too small or warped
- *mitigation:* use drei `<Html>` w/ distanceFactor + transform=true
- *kill-switch:* render monitor as fixed hud overlay

**15. demo machine notifications**
- *failure mode:* slack notification pops up mid-demo
- *mitigation:* fullscreen do-not-disturb 10 min before demo

## the meta-risk

**16. scope creep during phase 2**
- *failure mode:* you decide at 4pm to add browser tool, parallel execution, voice cloning, or persona evolution. nothing finishes.
- *mitigation:* phase 4 (7pm) is locked. anything not integrated by then is cut. period.
- *kill-switch:* this doc. re-read RISKS.md and BUILD_PLAN.md before adding scope.

## risk decision log

(update during build as risks materialize or are killed)

- [ ] 11:30 - spike phase begins
- [ ] 1:30 - phase 2 commit decision
- [ ] 5:30 - integration begins
- [ ] 7:00 - dress rehearsal, scope locked
