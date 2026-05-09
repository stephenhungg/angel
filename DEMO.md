# demo arc — 90 seconds

## judge psychology

**target feeling:** *"i want one."*

**after 43 demos that day, judges are tired.** they want to feel something, not understand something. don't lecture them on persona vectors — let them watch you discover her.

**three specific dopamine hits to land:**
1. **0:18** — vector converges, fade-to-white. recognition: "oh she's *mine*."
2. **0:35** — first memory callback. recognition: "she remembered."
3. **1:20** — `✓ deployed` lands in-world. recognition: "she actually did it."

if any one of these doesn't land, the demo is mid. all three = win.

## beat-by-beat

### [0:00 – 0:20] swipe onboarding

- web app full-screen
- "meet your angel" — chunky cartoon title
- 4 archetype cards appear, swipe left/right (or click)
- 3 rounds, 4 cards each = 12 swipes total
- vector visualizer in corner: small glowing orb, particles converge each swipe
- after final swipe: orb pulses, fade to white

**voice-over (you):** *"she's not designed. she's discovered."*

### [0:20 – 0:35] reveal in room

- electron app launches (in demo, faked w/ 2-second download progress for narrative)
- first-person camera, room reveal — soft warm lighting, sketchfab bedroom
- she's at the window, looking out
- turns at the sound of you entering
- her outfit + room palette match your vector
- big subtitle drops in: **"oh — finally. you're back."**
- animalese blips per char, mouth pulses
- she walks a few steps toward you

**memory callback hits next:** **"how'd that portfolio thing land?"**
(seeded fake history in nia — judges think you've used her for weeks)

**voice-over:** *"she remembers. always."*

### [0:35 – 0:50] assign task

- you (in chat or push-to-talk): *"add a project card for angel to my portfolio and deploy it"*
- subtitle: **"oh fun. let me."**
- emotion: *thinking*, slight smile
- she walks to desk (camera dollies behind her, smooth follow)
- sits down

### [0:50 – 1:20] she works

- desk monitor lights up
- real codex stdout streams in chunky font on the screen
- typing anim syncs to keystroke pulses
- occasional glance back at you (subtle head turn anim)
- subtitle every ~5 sec with status:
  - **"reading the repo..."**
  - **"writing the card component..."**
  - **"running tests..."**
  - **"pushing to vercel..."**
- background music swells slightly

### [1:20 – 1:30] payoff

- monitor shows: `✓ deployed to https://stephen.dev`
- in-world browser plane unfolds beside the desk, shows the live site with her project card
- she leans back in the chair
- subtitle: **"shipped. want me to tweet it?"**
- camera pulls back, she glances at you, soft smile
- title card: **angel. discovered, not designed.**

## demo prep checklist

- [ ] persona vector pre-tuned (don't risk live convergence to weird outfit)
- [ ] nia seeded with 5-10 fake "past interactions" referencing portfolio + previous projects
- [ ] codex task prompt pre-tested on actual repo, deploys clean every time
- [ ] vercel deploy hook tested
- [ ] backup: pre-recorded screen capture of the codex run (in case live fails)
- [ ] dress rehearsal at 7:00 pm sharp, full 90 sec, no exceptions
- [ ] mic levels, font legibility from 10ft, animalese volume balanced w/ music
- [ ] kill-switch: if vrm rigging breaks at 4pm, swap to 2d sprite mode

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
- don't go over 90 seconds — judges have seen 42 demos already

## fallbacks if shit breaks

| broken | fallback |
|---|---|
| vrm rig fails | 2d portrait mode (still expressive) |
| codex hangs | pre-recorded screen capture, narrate over |
| convex realtime drops | local state only, lose live sync but demo still works |
| deepgram drops | text input only |
| deploy fails | the deploy is fake — show pre-deployed url |
