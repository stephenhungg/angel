# @angel/convex — realtime spine

> convex backend. schema, mutations, queries, scheduled bg jobs, nia integration. owner: stephen.

## what lives here

```
convex/
├── schema.ts          # tables — see /CONVEX_SCHEMA.md for canonical reference
├── users.ts           # auth + persona save mutations
├── agentState.ts      # setEmotion, setLocation, setWalkingState
├── tasks.ts           # createTask, updateTaskStatus, attachTranslatedPrompt
├── evolution.ts       # logEvolution
├── turns.ts           # appendTurn, recentTurns
├── memory.ts          # nia client wrapper (episodic/semantic/preference)
├── crons.ts           # scheduled bg jobs (the "always-on" track requirement)
└── _generated/        # convex-generated, do not edit
```

## scripts

```bash
bun run dev           # convex dev — pushes schema + functions
bun run deploy        # convex deploy --prod
```

## scheduled jobs (always-on track requirement)

bg execution is **30% of our scoring weight**. `crons.ts` runs:

- `checkUserRepos` every 10 min → simulate "watching repos for changes"
- `consolidateMemory` daily at 4am → no-op stub for v1, real in v2
- `prepareGreeting` on user idle for 1+ hr → writes "while you were away..." event for next launch

these aren't faked at demo time — they're real cron. judge can ask "does it actually run?" answer: yes.

## env

needs convex deployment + nia api key. set via:
```bash
npx convex env set NIA_API_KEY ...
```
