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

## phase 1 — spike (9:15 am – 11:15 am, 2 hr)

validate the three highest-risk unknowns *before* committing to anything:

1. **vrm in r3f walking between waypoints** — load vroid avatar, swap mixamo idle/walk anim, walk to a target. if not green by 1pm, switch to 2d portrait mode.
2. **codex headless stdout stream** — `codex exec` with prompt → capture stdout → stream over local ws. confirm reliable on this machine today.
3. **html-on-plane in r3f for desk monitor** — drei `<Html>` portal showing live text. validate it renders at proper scale + readability.

**deliverable:** three working spike demos. no styling, ugly, but functional.

## phase 2 — parallel build (11:15 am – 3:30 pm, 4 hr 15 min — includes lunch break)

eat lunch at desk 12:30-1pm. don't lose 30min walking to a real lunch.

split into 4 lanes:

### lane A — web onboarding (codex agent or stephen)
- next.js app on vercel — **deployed early, this is the submission link**
- swipe ui (3 rounds × 4 archetypes)
- archetype cards (pre-made imgs + descriptions)
- clip embedding per archetype, weighted centroid on swipe history
- pca on accumulated centroids → 768d persona vector
- voice cluster assignment (1 of 6 banks)
- write to convex.users on completion
- "download angel.app" cta → triggers electron deep link via `angel://claim?token=...`

### lane B — electron + 3d room (matthew)
- electron + vite + react + r3f scaffold
- load sketchfab bedroom + vroid avatar
- waypoints: desk, couch, window, door (named transforms in scene)
- `walkTo(waypoint)` function — lerp position + play walk anim
- desk monitor mesh — `<Html>` portal
- in-world browser plane — `<Html>` w/ iframe
- subscribe to convex.emotion / location / task
- subtitle hud (chunky font, fade in/out)
- animalese player (web audio, sample bank per persona)
- text input + push-to-talk mic toggle

### lane C — convex + nia + tools (codex agent)
- convex schema (see CONVEX_SCHEMA.md)
- mutations: setEmotion, setLocation, setTask, logEvolution
- queries: subscribe to user state
- nia integration: episodic write, semantic search
- tool router (orchestrator → handlers)
- seed fake history in nia (5-10 entries)
- **bg execution stub:** scheduled job that writes "she did stuff while you were gone" event every N min — for always-on track criterion

### lane D — orchestrator + executors (codex agent or stephen)
- main process orchestrator: claude sonnet 4.6 client w/ tool defs
- system prompt template loading persona vector → traits
- task translator (haiku 4.5)
- codex spawner + stdout ws bridge to renderer
- verifier: scripted checks + haiku reality-check
- stt: deepgram client (input only) — *can cut for v1*

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
