# research — sota long-running agent delta

## what defines a sota long-running agent (2026 bar)

serious labs treat these as table stakes:

### memory — six distinct types (not one vector store)

1. **working** — current ctx window
2. **episodic** — timestamped event log, retrievable by time + similarity
3. **semantic** — extracted facts as a knowledge graph (entities + relationships, not chunks)
4. **procedural** — voyager-style skill library, reusable functions from successful task completions
5. **affective** — sentiment + relationship trajectory (not just current emotion)
6. **reflective** — periodic self-summary the agent rewrites about itself

plus: **forgetting + consolidation** — sleep cycles that summarize, dedupe, prune, rewrite memory. without this, agents degrade over time.

### cognition — beyond single-turn

- hierarchical planning (goal → subgoal tree, leaves are tool calls)
- self-reflection loops (reflexion: failure → postmortem → memory → retry with insight)
- world modeling (predict outcome before acting)

### identity stability

- soul anchor — invariants that don't change (name, core values, voice quirks)
- drift detection — sample dialogue, embed, compare to persona vector, alert on out-of-distribution shift
- versioned persona — rollback if drift goes wrong way

### self-improvement

- skill acquisition: every successful task → codify procedure as reusable function w/ preconditions
- failure learning: postmortem → searchable memory ("last time deploy failed, env vars")
- preference integration: implicit feedback updates persona vector continuously

### verification + grounding

- every tool output reality-checked (file exists? endpoint healthy? commit landed?)
- hallucination detector on agent claims

### ops layer

- model routing (cheap for easy, big for hard)
- prompt cache hygiene
- full trace observability + replay

## the honest delta table (angel v1 vs sota)

| layer | sota | angel v1 (current plan) | gap | priority |
|---|---|---|---|---|
| working memory | ctx + compaction | rolling ctx | small | low |
| episodic | timestamped log + retrieval | nia turn-by-turn | medium | med |
| semantic | knowledge graph | nia flat search | **large** | med |
| procedural (skills) | voyager skill lib | nothing | **huge** | **high** |
| affective | trajectory tracking | convex.emotion snapshot | medium | med |
| reflective | rewritten self-summary | static persona vector | **large** | **high** |
| consolidation | nightly sleep cycle | nothing | **large** | low (v2) |
| forgetting | dedupe + prune | nothing | medium | low |
| hierarchical planning | goal tree + replan | single-turn orchestrator | **large** | med |
| self-reflection | reflexion on failure | basic verifier | medium | med |
| tool learning | learned chains | hardcoded tools | large | low |
| identity stability | soul anchor + drift detect | static vector | **large** | **high** |
| verification | rigorous grounding | basic verifier | small | high |
| model routing | dynamic | static | small | low |
| observability | full traces | basic logs | small | low |

## the four biggest gaps that matter

1. **procedural memory / skill library** — without this she relearns every task. with it, she compounds. *the real moat.*
2. **reflective memory** — persona vector is set once. real long-run = self-model evolves, not just tone.
3. **identity stability primitives** — without soul anchor + drift detect, she drifts out of being *herself* the more she "evolves." kills the thesis.
4. **hierarchical planning** — single-turn orchestrator handles "add a card and deploy" but not "build me a saas over the next month."

## v1 / v2 / v3 evolution path

### v1 (today, hackathon) — design sockets, not implementations

ship the architecture w/ sockets ready, but don't implement:
- nia interface that *splits* episodic vs semantic queries (even if backend is flat) — so v2 can swap in graph
- empty `~/.angel/skills/` directory readable by orchestrator — so v2 fills it
- `~/.angel/reflective_summary.md` seeded with onboarding output — so v2 rewrites it
- consolidation hook that's a no-op — so v2 wires to cron
- minimal verifier in place — sets the pattern
- soul anchor file separate from persona vector — invariants

**the v1 honesty:** this isn't a sota long-running agent. it's a *convincing demo of one*. that's correct for 12 hours. the demo *implies* her ability to gain memory; we seed nia with fake history, scripted outfit shift, reflective summary visible somewhere in the room. judges feel the long-run thesis without having to ship it.

### v2 (post-hackathon, real work)

- voyager-style skill library — every successful `delegate` writes a skill md w/ preconditions/procedure/postconditions
- nightly consolidation: summarize day, extract entities → graph, rewrite reflective summary
- drift detector: every 100 turns, sample dialogue, embed, alert if cosine to persona < 0.7
- hierarchical planner: orchestrator emits goal tree, separate executor walks leaves
- sentiment trajectory: rolling 30d emotion log, mood baselines

### v3 (the real moat)

- learned tool chains — she codifies "deploy stephen's portfolio = git add → commit → push → vercel deploy → curl healthcheck → tweet"
- preference learning that updates persona vector *online* from implicit signals
- self-rewriting prompts — she edits her own system prompt based on what worked

## the architectural sin to avoid

**don't ship v1 in a way that makes v2 impossible.**

specifically:
- don't hardcode persona traits (read from file, even if file is generated once)
- don't bake the system prompt static (make it template + injected vector + reflective summary)
- don't skip the verifier (the discipline matters even if v1 verifier is simple)

these three decisions cost zero today and unlock everything later.

## papers + references

### memory
- **memgpt / letta** — hierarchical memory + tool-managed paging
- **mem0** — production memory layer (commercial)
- **a-mem (2024)** — adaptive memory w/ links between memories

### agents + cognition
- **generative agents (park et al, 2023)** — reflection trees + observation memories. **must-read.**
- **voyager (wang et al, 2023)** — skill library. **must-read for v2 procedural memory.**
- **reflexion (shinn et al, 2023)** — verbal self-reflection on failure
- **react (yao et al, 2022)** — reasoning + acting interleaved
- **tree of thoughts** — search over reasoning paths

### identity + drift
- **constitutional ai (anthropic)** — invariants for alignment, applicable to soul anchor
- **persona vectors literature** — sparse, mostly empirical

### evals + observability
- **langsmith / langfuse** — for v2 trace observability

## tldr

- v1 = demo. fake what you can't ship in 12 hours.
- v2 = real long-run agent. ship voyager skills, drift detection, consolidation.
- v3 = unique moat. self-improvement loops + online preference learning.
- the architecture must leave sockets open. zero-cost discipline today, infinite value tomorrow.
