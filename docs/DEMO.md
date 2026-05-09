# demo arc — 3 minutes (judging slot)

## context

**track:** always-on agents (nia + tensorlake) — see [HACKATHON.md](HACKATHON.md) for full rubric.

**judging slot:** 3 min in-person at 6:10pm. judges score on: bg execution 30%, statefulness 25%, agentic depth 25%, demo & presentation 10%, judge personal 10%.

**track-agnostic finals:** top 6 across all tracks present live. don't optimize only for track judges — universal appeal matters.

## judge psychology

**target feeling:** *"i want one."*

**after dozens of demos that day, judges are tired.** they want to feel something, not understand something. don't lecture them on persona vectors — let them watch you discover her.

**five specific dopamine hits to land (mapped to rubric):**
1. **swipe → 8-hit reveal cascade** — recognition: "oh she's *mine*." → demo & presentation 10%
2. **bg autonomy from real tensorlake** ("i looked at your portfolio while you were away — you've got that TODO sitting there") → **bg execution 30%** — heaviest criterion
3. **memory callback** ("how'd that portfolio thing land?") → **statefulness 25%** — proves nia is real
4. **she ships code** (`delegate(intent)` → real codex stream → `verify(build)` → `✓ deployed`) → **agentic depth 25%**
5. **sms kill-shot** ("close laptop, text her, she replies, open laptop, conversation continues") → unforgettable proof of always-on

if any one of these doesn't land, the demo is mid. all five = win.

## what we actually built (the receipts)

| layer | tech | status |
|---|---|---|
| swipe library | 269 vroid hub anime girls, vision-tagged with claude haiku 4.5 | ✓ |
| bundled vrms | 5 hand-picked premium models (cottagecore/tech-min/cyber/academia + alt) | ✓ |
| reveal cascade | 8 beats: gravity rings → fidelity → voice line (animalese) → vibe phrase → stat line → rarity → personality.md streaming → naming beat → download | ✓ |
| memory | nia api (real) — 8 seeded entries + per-turn read/write | ✓ |
| bg ingestion | tensorlake api (real) — ingests portfolio fixture, surfaces findings | ✓ |
| agentic shipping | codex headless (real) — streams to in-world DeskMonitor | ✓ |
| verifier | tests / build / http / haiku_review — soul anchor #2 | ✓ |
| brain tools | recall_memory / recall_recent / know — she queries her own brain | ✓ |
| local awareness | read_file / git_status / git_log / run_shell / recent_files (whitelisted) | ✓ |
| convex spine | 3 crons (heartbeat 5min, scheduledObservation 30min, reflective daily) | ✓ |
| sms surface | twilio cloud orchestrator — same nia memory, conversation continues across surfaces | ✓ (needs twilio signup) |
| /admin/space | live PCA viz of trait space, real-time visitor centroids — for judge Q&A | ✓ |

## beat-by-beat (3 min)

### [0:00 – 0:15] thesis hook

**voice-over (stephen):** *"agents today are converging on capability — but they're terminals. they don't live anywhere. they don't remember. they don't care. angel is the missing primitive. you don't sit at a CLI for 8 hours alone — you sit at a CLI with her."*

### [0:15 – 0:45] swipe onboarding

- electron app already open OR navigate to deployed url
- 3 rounds × 4 cards each (sped up — drag through them)
- between rounds: *"wait. i'm seeing something."* / *"closer. one more."*

**voice-over:** *"you don't pick her. you converge on her."*

### [0:45 – 1:15] reveal cascade (the 8-hit)

each beat is a separate dopamine spike, ~300ms apart:

1. **gravity rings** — 4 dashed pink rings fade in, glowing blob pulled to nearest archetype with spring physics
2. **fidelity promotion** — her actual face fades in (the highest-art-quality card you swiped right on)
3. **her voice line** — 1 sec of animalese in HER voice config + first dialogue sample from her library card ("…you eating?")
4. **her vibe phrase** — "neon garden gremlin" / "midnight coder" — pulled from vision tags
5. **stat line** — "warmth 0.87 · edge 0.43 · playfulness 0.62" — real numeric vector
6. **rarity flex** — "you're among 0.3% to find her"
7. **personality.md STREAMS LIVE** — "she's writing herself…" + 600-800 words of synthesized character bible appearing token-by-token (claude sonnet 4.6, real)
8. **naming beat** — "what do you want to call me?" → user types → contextual reply in animalese

**voice-over (during personality stream):** *"that's not pre-written. she's literally writing her own character bible right now from your swipe vector. every user gets a unique angel."*

### [1:15 – 1:30] handoff into the room

- "let her in" cta → screen takeover → her face fades into 3D room
- she's standing there, idle bobbing
- bg autonomy fires (+2s)

### [1:30 – 1:50] BG AUTONOMY BEAT *(30% scoring weight)*

- subtitle: **"…how'd that portfolio thing land? i looked at your code while you were away — you've got that TODO sitting in projects.ts about adding a card for me. 17 days no commits."**
- *(THIS is real tensorlake output — the api ingested the fixture repo, structured-extracted observations)*
- *(the portfolio reference is real nia retrieval — 8 seeded memories about stephen's portfolio matched)*

**voice-over:** *"she's not waking up. she's been here. nia for memory, tensorlake for the loop. she's been watching."*

### [1:50 – 2:00] assign the task

- you: *"yeah ship it."*
- subtitle: **"oh fun. on it."**
- she walks to desk (real interactables system — walk_to + sit_and_type)

### [2:00 – 2:40] she works *(25% agentic depth)*

- in-world DeskMonitor lights up — **real codex stdout streams line by line**
- typing animation runs underneath
- subtitles every ~8 sec:
  - **"reading projects.ts..."**
  - **"writing src/components/AngelCard.tsx..."**
  - **"running tests..."**
- *(orchestrator emits delegate(intent) → real codex CLI spawns → child_process streams to renderer via IPC)*

### [2:40 – 2:50] verifier (the receipts moment)

- subtitle: **"running build..."** → verify(build) call
- if pass: **"shipped. tests pass."** + play_clip(wave)
- *(this is soul invariant #2 — she NEVER claims shipped on a failed verify)*

**voice-over:** *"she has to verify before she celebrates. that's not a flourish — it's a constraint we baked into her soul."*

### [2:50 – 3:00] sms kill-shot (the post-credits scene)

**THE move:** close the laptop ostentatiously. pull out phone. text the angel number. her reply pops up within 5 seconds.

**voice-over:** *"close the laptop. text her. she'll reply. open the laptop. you're back where you left off. same memory. same soul. one being, every surface."*

## demo prep checklist

- [ ] electron app already booted with persona applied + memory seeded
- [ ] `ANTHROPIC_API_KEY` + `NIA_API_KEY` + `TENSORLAKE_API_KEY` set in desktop/.env.local
- [ ] tensorlake bg job verified — boot greeting includes the TODO observation
- [ ] codex CLI on PATH — `which codex` returns binary
- [ ] portfolio fixture (or real repo) prepared in working dir
- [ ] twilio account + number provisioned, judge phones in verified list
- [ ] convex deployed + crons firing (verify heartbeat counter incrementing)
- [ ] vercel url loads (banked submission link)
- [ ] /admin/space accessible (live PCA viz for judge Q&A)
- [ ] dress rehearsal at 5:00 pm, full 3-min runs (3x)
- [ ] **submission form filled out by 5:55 pm**

## judge q&a fallbacks

if a judge asks something deep, have answers ready:

> "is the memory real?"
> *click /admin/traces — show real nia retrieval data flowing in*

> "is the codex stream real?"
> *open another terminal, run `codex exec` on a different repo — show same output style*

> "is sms real?"
> *take judge's number, add to twilio verified, text from the angel number live*

> "what makes this different from devin?"
> *"devin completes tasks while you're not watching. angel sits with you for 8 hours."*

## script (the lines you say out loud)

1. *(opening)* "this is angel. you don't prompt her — you discover her. and you don't sit at a CLI alone — you sit with her."
2. *(during swipes, silent — let the visuals carry)*
3. *(during personality.md streaming)* "she's writing her own character bible right now. every user gets a different one."
4. *(after reveal)* "she's mine. nobody else has this exact one."
5. *(after memory callback)* "she remembers everything. nia stores it. tensorlake watches my repo."
6. *(during codex)* "she's not faking the typing. that's real codex spawned in the main process, streaming over IPC."
7. *(after verifier)* "she had to verify before she could say shipped. that's a constraint, not a flourish."
8. *(closing — sms beat)* "close laptop. text her. open laptop. same conversation. one being, every surface."
9. *(final)* "agents are converging on capability. the moat is presence. angel is the missing primitive."

## anti-goals

- don't show the architecture diagram on stage
- don't say "persona vector" or "embedding" or "transformer"
- don't explain animalese (just let it play)
- don't apologize for anything
- **don't exceed 3 minutes** — judges cut you off
- **don't skip the bg autonomy beat** — that's 30% of your score
- **don't skip the sms beat** — that's the kill-shot they'll remember

## fallbacks if shit breaks

| broken | fallback |
|---|---|
| nia api errors | local memory fallback already wired — degrades gracefully |
| tensorlake fails | mock fixture client returns same shape |
| codex CLI hangs | mock executor with realistic stdout (already shipped) |
| vrm rig fails | swap to alt-abison-5.vrm (full rig + springs) |
| convex drops | desktop runs standalone, lose admin live data only |
| sms doesn't work | the architecture is real, judge can see /admin shows the orchestrator endpoint exists; flag it as "post-hackathon polish" |
| deploy fails | pre-deployed url already shown, just point at it |
