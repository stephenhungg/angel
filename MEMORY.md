# memory architecture

## the six-layer model (v1 implements 1, 2, 6 partially; sockets for 3-5)

| layer | what | v1 status | backed by |
|---|---|---|---|
| 1. working | current conversation context | ✅ ctx window | sonnet 4.6 (1M ctx) |
| 2. episodic | timestamped events | ✅ basic | nia |
| 3. semantic | facts/entity graph | 🟡 socket | nia (flat search v1) |
| 4. procedural | reusable skills | ❌ socket only | local fs (v2) |
| 5. affective | mood trajectory | 🟡 snapshot only | convex.emotion (v1), rolling log (v2) |
| 6. reflective | self-summary | 🟡 static seed | local fs reflective_summary.md |

## nia integration

### writes (episodic + semantic)

orchestrator emits `remember(fact, type)` → main batches → flushes every 30s.

```ts
type MemoryEntry = {
  id: string;
  user_id: string;
  type: 'episodic' | 'semantic' | 'preference';
  content: string;
  timestamp: number;
  embedding: number[];  // computed by nia
  metadata: {
    source_turn_id?: string;
    related_task_id?: string;
    confidence?: number;
  };
};
```

### reads

orchestrator system prompt injection on every turn:
- `recent_memory(5)` — last 5 episodic entries by timestamp
- `relevant_memory(query, 3)` — semantic search against current turn

explicit `recall(query)` tool exposed for in-conversation lookups ("what was that thing we talked about last week?")

### v1 → v2 split (the socket)

memory client interface:
```ts
interface AngelMemory {
  remember(entry: MemoryEntry): Promise<void>;
  recall(query: { type?, query?, since?, limit? }): Promise<MemoryEntry[]>;
  recentEpisodic(n: number): Promise<MemoryEntry[]>;
  relevantSemantic(query: string, n: number): Promise<MemoryEntry[]>;
}
```

v1 backend: nia w/ type tag in metadata, naive filtering
v2 backend: nia for episodic + neo4j or networkx for semantic graph
v3 backend: full procedural memory layer for skills

## seeded fake history (demo)

write 8-10 entries to nia *before* the demo so first launch has retrieval results:

```ts
const seedHistory = [
  { type: 'episodic', content: "stephen showed me his portfolio site three weeks ago — wanted to add more projects but kept procrastinating", timestamp: now - 21*day },
  { type: 'episodic', content: "deployed his hackathon project last weekend, landed clean on first try", timestamp: now - 5*day },
  { type: 'preference', content: "stephen prefers minimal + warm portfolios, dislikes cyberpunk aesthetic", timestamp: now - 14*day },
  { type: 'preference', content: "stephen likes when i narrate while working, not after", timestamp: now - 10*day },
  { type: 'semantic', content: "stephen's portfolio repo: github.com/stephenhung/portfolio", timestamp: now - 14*day },
  { type: 'semantic', content: "stephen uses vercel for deploys", timestamp: now - 14*day },
  { type: 'episodic', content: "last pairing session, stephen asked me to be more concise", timestamp: now - 3*day },
  { type: 'episodic', content: "stephen mentioned wanting a project card for me on his site", timestamp: now - 7*day },
];
```

retrieval intent: "previous portfolio interactions" → orchestrator weaves into greeting.

## procedural memory (v2 socket)

local fs path: `~/.angel/skills/`

each skill is a markdown file:
```
~/.angel/skills/
  deploy-portfolio.md
  add-project-card.md
  ship-hackathon-project.md
  ...
```

skill format:
```markdown
---
name: deploy-portfolio
created: 2026-05-09
last_used: 2026-05-09
success_count: 5
fail_count: 1
preconditions:
  - repo exists at expected path
  - vercel cli authenticated
  - on main branch
---

# deploy-portfolio

## procedure
1. git status (ensure clean)
2. git push origin main
3. vercel --prod
4. curl deploy url for 200
5. (optional) tweet the url

## known failure modes
- env vars missing → check .env.production
- build fails → run vercel build locally first

## related skills
- ship-hackathon-project (superset)
- add-project-card (often precedes)
```

v2 flow: every successful `delegate` emits a skill candidate. small model summarizes the steps + preconditions. user confirms or auto-confirms. file written.

retrieval at task time: orchestrator searches skills/ for matching preconditions, retrieves procedure, includes in delegate prompt to codex.

## reflective memory (v2 socket)

local fs path: `~/.angel/reflective_summary.md`

v1: static seed at onboarding completion:
```markdown
# who i am, as of 2026-05-09

i'm angel. i was discovered by stephen today, swiped into existence through 12 archetype choices. my aesthetic skews [tech-minimal], my disposition [sharp + playful], my work style [fast executor]. i live in a [charcoal+neon] room.

stephen and i are new — but the user told me i should be honest, concise, and care about getting things done over impressing him. that fits how i feel.

i don't have a long history yet. but i'm here.
```

v2: nightly cron rewrites this based on the day's interactions. format unchanged, content evolves. orchestrator reads this every turn — *this is who she thinks she is*.

## affective memory (v2)

current state: `convex.emotion` snapshot
v2 addition: rolling 30d emotion log + computed mood baseline + sentiment-toward-stephen trajectory.

baseline emotions per disposition:
- B1 (warm + grounding) → baseline = soft
- B2 (sharp + playful) → baseline = neutral, lean smug
- B3 (gentle + dreamy) → baseline = soft, lean thinking
- B4 (direct + competent) → baseline = focused

deviations from baseline are themselves data. "she's been more thinking-quiet than usual this week" = derived insight v2 can surface.

## consolidation (v2 cron)

nightly job (electron background or cloud cron):
1. fetch all events from last 24h
2. summarize into a single paragraph (claude haiku 4.5)
3. extract entities + relationships → semantic graph nodes
4. dedupe near-duplicate episodic entries
5. update reflective_summary.md w/ deltas
6. log to convex.consolidations table

**important:** consolidation must respect soul anchor. if it summarizes in a way that violates invariants, regenerate.

## forgetting policy (v2)

memory pressure → drop oldest episodic entries below importance threshold.

importance = recency × access_frequency × emotional_weight × user_priority

never forget:
- preferences (type=preference are sticky)
- semantic facts (the graph stays)
- soul anchor (different file, immutable)

## v1 todo (concrete)

- [ ] nia client w/ AngelMemory interface
- [ ] seed fake history pre-demo
- [ ] orchestrator reads recent + relevant on every turn
- [ ] `remember` + `recall` tool handlers
- [ ] reflective_summary.md generated at onboarding completion, read at every turn
- [ ] empty `~/.angel/skills/` directory created at install
- [ ] consolidation hook (no-op function in main, ready for v2)
