# demo arc — 3 minutes (judging slot)

## context

**track:** always-on agents (nia + tensorlake) — see [HACKATHON.md](HACKATHON.md) for full rubric.

**judging slot:** 3 min in-person at 6:10pm. judges score on: bg execution 30%, statefulness 25%, agentic depth 25%, demo & presentation 10%, judge personal 10%.

**track-agnostic finals:** top 6 across all tracks present live. don't optimize only for track judges — universal appeal matters.

## judge psychology

**target feeling:** *"i want one."*

**after dozens of demos that day, judges are tired.** they want to feel something, not understand something. don't lecture them on persona vectors — let them watch you discover her.

**four specific dopamine hits to land (mapped to rubric):**
1. **swipe → vector converges, fade-to-white** — recognition: "oh she's *mine*." → demo & presentation 10%
2. **bg autonomy beat** ("while you were away, i prepared 3 commits and watched your repo") → **bg execution 30%** — heaviest criterion, do not skip
3. **memory callback** ("how'd that portfolio thing land?") → **statefulness 25%** — proves removing memory breaks demo
4. **`✓ deployed` lands in-world** → **agentic depth 25%** — proves full agentic loop (plan, execute, verify, narrate)

if any one of these doesn't land, the demo is mid. all four = win.

## beat-by-beat (3 min)

### [0:00 – 0:15] thesis hook

**voice-over (stephen):** *"agents today are converging on capability — but they're terminals. they don't live anywhere. they don't remember. they don't care. angel is the missing primitive. discovered, not designed."*

### [0:15 – 0:35] swipe onboarding (web)

- vercel-deployed swipe webapp, full screen
- 3 rounds × 4 archetypes (sped up if needed)
- vector visualizer in corner converges each swipe
- after final swipe: orb pulses, fade to white

**voice-over:** *"you don't pick her. you converge on her."*

### [0:35 – 0:50] download → app launches

- "download angel.app" cta → fake 3sec download → electron app launches via `angel://` deep link
- first-person camera, room reveal — soft warm lighting
- she's at the window, looking out
- her outfit + room palette match your vector

### [0:50 – 1:10] BG AUTONOMY BEAT *(30% scoring weight)*

- she turns at the sound of you entering
- big subtitle: **"oh — you're back. while you were gone, i watched your portfolio repo and prepared 3 commits to review."**
- *(in-world detail: monitor on desk shows pre-prepared diff, ready to review — proves she was working autonomously)*

**voice-over:** *"she runs in the background. nia for memory, tensorlake for the loop. removing either of those breaks her."*

### [1:10 – 1:25] memory callback *(25% scoring weight)*

- subtitle: **"how'd that portfolio thing land last week, by the way?"**
- *(seeded fake history in nia — judges think you've used her for weeks. cross-session memory.)*

**voice-over:** *"every interaction is in nia. she gets sharper across weeks, not sessions."*

### [1:25 – 1:40] assign new task

- you: *"add a project card for angel to my portfolio and deploy it."*
- subtitle: **"oh fun. let me."**
- she walks to desk (camera dollies behind her)
- sits down

### [1:40 – 2:30] she works *(25% agentic depth)*

- desk monitor lights up — **real codex stdout streams**
- typing anim syncs to keystrokes
- subtitles every ~10 sec:
  - **"reading the repo..."**
  - **"writing the card component..."**
  - **"running tests..."**
  - **"pushing to vercel..."**
- occasional glance back at you

### [2:30 – 2:45] payoff

- monitor: `✓ deployed to https://stephen.dev`
- in-world browser plane opens to live site
- she leans back: **"shipped. want me to tweet it?"**

### [2:45 – 3:00] closer

**voice-over:** *"agents are converging on capability. the moat is presence. angel is the missing primitive — embodied, persistent, alive between sessions."*

title card: **angel. discovered, not designed.**

## demo prep checklist

- [ ] persona vector pre-tuned (don't risk live convergence to weird outfit)
- [ ] nia seeded with 5-10 fake "past interactions" referencing portfolio + previous projects
- [ ] **bg autonomy seed:** fake 3 commits ready in repo + diff visible on desk monitor at app launch
- [ ] codex task prompt pre-tested on actual repo, deploys clean every time
- [ ] vercel deploy hook tested
- [ ] backup: pre-recorded screen capture of the codex run (in case live fails)
- [ ] dress rehearsal at 5:00 pm, full 3-min runs (3x), no exceptions
- [ ] mic levels, font legibility from 10ft, animalese volume balanced w/ music
- [ ] kill-switch: if vrm rigging breaks at 1:30pm, swap to 2d portrait mode
- [ ] **submission url ready:** vercel-deployed swipe webapp link working (NOT localhost)

## script (the lines you say out loud)

1. "this is angel. you don't prompt her — you discover her."
2. *(during swipes, silent, let the visuals carry)*
3. *(after reveal)* "she's mine. nobody else has this exact one."
4. *(after callback)* "she remembers everything we've done together."
5. *(assigning task)* "hey angel — add a project card for yourself to my portfolio and deploy it."
6. *(during work)* "she's not pretending to type. that's real codex behind the monitor."
7. *(after deploy)* "shipped, live, real url."
8. **closer:** "agents are converging on capability. the moat is presence. angel is the missing primitive."

## anti-goals

- don't show the architecture diagram on stage
- don't say "persona vector" or "embedding"
- don't explain animalese
- don't apologize for anything
- **don't exceed 3 minutes** — judges cut you off
- don't skip the bg autonomy beat — that's 30% of your score

## fallbacks if shit breaks

| broken | fallback |
|---|---|
| vrm rig fails | 2d portrait mode (still expressive) |
| codex hangs | pre-recorded screen capture, narrate over |
| convex realtime drops | local state only, lose live sync but demo still works |
| deepgram drops | text input only |
| deploy fails | the deploy is fake — show pre-deployed url |
