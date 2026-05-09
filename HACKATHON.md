# nozomio hackathon — canonical reference

> single source of truth pulled from the official guide. cross-reference everywhere else.

## event

- **name:** nozomio hackathon
- **date:** may 9, 2026 (san francisco)
- **venue:** entrepreneurs first office
- **discord:** https://discord.gg/KSERFyh6
- **wifi:** Entrepreneur Firsts-Guest / `501Folsom!`

## schedule (real)

| time  | event |
|-------|-------|
| 8:00 am | doors + breakfast |
| 8:30 am | nozomio + sponsors intro talk |
| **9:15 am** | **hacking starts** |
| 12:00 pm | hyperspell speaker session |
| 12:30 pm | lunch |
| 3:00 pm | speaker session |
| **6:00 pm** | **submissions close (sharp)** + dinner |
| 6:10 pm | in-person judging (3 min/team) |
| 7:30 pm | judging concludes + winners announced |
| 8:00 pm | relax |

## our track: always-on agents

**sponsors:** nia + tensorlake

**brief:** "build an agent that runs continuously in the background, remembers what it has learned across sessions, and acts without a human prompting it. the bar is high: removing either the background execution or the stateful memory should break your demo."

**dream shape:** "an agent that wakes up on its own and knows everything it has done before."

**examples (for inspiration):**
- research agent that monitors a topic, tracks reading history, sends weekly briefs that get sharper
- support agent w/ durable per-customer memory across months
- overnight PR reviewer that clears the queue before standup
- personal agent on calendar + email, remembers what you asked last tuesday, learns preferences over time

**how angel maps:**
- runs locally, wakes on schedule, processes events while user is away (✓ bg execution)
- nia stores episodic + preference memory across sessions, callbacks reference past interactions (✓ statefulness)
- if you remove nia → memory callback dies → trust collapses → demo breaks (✓ "removing memory breaks demo")
- if you remove the bg execution loop → no "while you were away" beat → autonomy criterion fails (✓ "removing bg breaks demo")

## judging rubric — always-on agents

| criterion | weight | what 5 looks like |
|---|---|---|
| **genuine background execution** | 30% | deeply autonomous; multi-source triggers; graceful recovery; runs reliably over hours |
| **statefulness** | 25% | memory is load-bearing; removing it would break the demo entirely |
| **agentic depth** | 25% | full agentic loop: plans, executes, reflects, recovers, improves autonomously |
| **demo & presentation** | 10% | story + demo make the case unforgettably |
| **judge's personal rating** | 10% | "this genuinely excites me; i want to see it succeed" |

## judging method

- **track-agnostic final ranks** — top 6 across ALL tracks present live to entire room. top 3 win, regardless of track.
- judges score individually, average is your final grade.
- you compete against everyone, not just your track.
- **implication:** even though we picked always-on, the demo must hit hard for non-track judges too. universal appeal matters.

## submission

- form: https://forms.gle/fkoFXRo3L2MVkkz87
- one submission per team
- needs:
  - **deployed demo link** (NOT localhost — disqualifying)
  - github repo url
  - team names + emails
- **6:00 pm sharp** — late = not accepted
- at least one teammate present 6:10pm for judging

## rules

- max 3 participants per team (we have 2: stephen + matthew — solo is welcome too)
- **no re-using personal projects** — angel must be built today
- submit before 6pm
- cheating disqualifies immediately
- top 6 must be present at awards
- **one track per team** — we are locked into always-on agents

## prizes

| place | prize |
|---|---|
| 1st | M5 Macbook Pros + guaranteed Arlan job interview + credits |
| 2nd | M4 Mac Mini + credits + $500 |
| 3rd | AirPods Pros + credits + $300 |
| top 10 | 1 month Hinge premium |
| other | first class trip to vegas + sponsor interviews + stussy gear |

## available credits (claim during the day)

| sponsor | offering | how to claim |
|---|---|---|
| nia | TBD | check at desk |
| insforge | $100/user | https://insforge.dev/promo/NIA — claim pro plan |
| tensorlake | free all day | usable directly |
| reacher | free all day | "Reacher Nozomio Hackathon Setup" pdf |
| convex | free deployments, no card | https://convex.dev (relevant link in pdf) |
| hyperspell | free all day | direct |
| vercel v0 | $30, first 200 ppl | code `NOZOMIO-V0` |
| openai codex + api | $50 each | speak to **tatiana** for codex creds |
| devin | $100 coupon | https://forms.gle/USxbQJxoPQ1AGMG4A → sign up at https://app.devin.ai/signup |

**we should claim:** convex (free), nia (track sponsor), tensorlake (track sponsor), openai codex ($50), vercel ($30 if available). skip: insforge (we use convex), reacher/hyperspell (different tracks), devin (we use codex).

## sponsors at angel's center

- **nia** (track + main) — context augmentation MCP server. 15+ semantic search tools. indexes repos, docs, PDFs, Slack, Drive, local files. *11.3% lower hallucination vs alternatives.* nia oracle = autonomous research agent for multi-source workflows. cross-session context.
- **tensorlake** (track) — stateful sandbox compute, 150ms cold starts, durable memory as primitive (not RAG-bolt-on), bg execution via schedules/webhooks/events.
- **convex** — realtime spine, typescript-native, no cache invalidation hell.
- **vercel** — submission url host.
- **openai codex** — embodied executor.

## the angel pitch (3-min slot)

opening line: *"agents are converging on capability but diverging from engagement. angel is the missing primitive — discovered, not designed."*

beats:
1. swipe → vector convergence (discovery)
2. download → app opens → "while you were away..." beat (**bg execution, 30%**)
3. memory callback ("how'd that portfolio thing land?") (**statefulness, 25%**)
4. assign task → walks to desk → real codex stdout streams → ✓ deployed (**agentic depth, 25%**)
5. closer: "agents converge on capability. presence is the moat."

## anti-goals (do NOT)

- localhost demo url (disqualifying)
- skip bg execution beat (kills 30%)
- forget memory callback (kills 25%)
- explain architecture on stage (kills demo & presentation)
- exceed 3 minutes (judges cut you off)

## team

- stephen hung — webapp + agent backend + convex + nia
- matthew (jabison on discord) — electron + r3f + vrm + scene actions + chat overlay

## emails for submission form

- stephen: founders@kalilabs.ai (per CLAUDE.md)
- matthew: TBD — confirm before submission
