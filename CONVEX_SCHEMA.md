# convex schema

## tables

### users

```ts
users: defineTable({
  // identity
  authId: v.string(),
  email: v.string(),

  // persona (set at onboarding)
  personaVector: v.array(v.float64()),  // 768d
  archetypeHistory: v.array(v.object({
    round: v.number(),
    archetypeId: v.string(),
    timestamp: v.number(),
  })),
  traits: v.object({
    aesthetic: v.string(),  // A1 | A2 | A3 | A4
    disposition: v.string(),  // B1 | B2 | B3 | B4
    style: v.string(),  // C1 | C2 | C3 | C4
    voice_cluster: v.number(),  // 1-6
  }),

  // ts
  createdAt: v.number(),
  lastSeenAt: v.number(),
})
  .index('by_authId', ['authId']);
```

### agentState

ephemeral live state — drives renderer subscriptions.

```ts
agentState: defineTable({
  userId: v.id('users'),
  emotion: v.string(),  // happy | neutral | thinking | excited | smug | soft | focused
  location: v.string(),  // desk | couch | window | door | center
  faceExpression: v.optional(v.string()),
  currentTaskId: v.optional(v.id('tasks')),
  isWalking: v.boolean(),
  walkTarget: v.optional(v.string()),
  updatedAt: v.number(),
})
  .index('by_userId', ['userId']);
```

### tasks

```ts
tasks: defineTable({
  userId: v.id('users'),
  intent: v.string(),
  translatedPrompt: v.optional(v.string()),  // post task-translator
  type: v.string(),  // delegate | browse | parallel | deploy
  status: v.string(),  // pending | running | verifying | success | failed
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  output: v.optional(v.object({
    summary: v.string(),
    evidence: v.array(v.string()),
    artifactUrl: v.optional(v.string()),
  })),
  error: v.optional(v.string()),
})
  .index('by_userId_status', ['userId', 'status']);
```

### evolutionLog

every interaction is a nudge event. (v1 logs but doesn't update vector live; v2 does.)

```ts
evolutionLog: defineTable({
  userId: v.id('users'),
  eventType: v.string(),  // interaction | feedback | preference_inferred
  vectorDelta: v.optional(v.array(v.float64())),  // implicit feedback nudge
  signal: v.string(),  // human-readable trigger
  timestamp: v.number(),
})
  .index('by_userId_time', ['userId', 'timestamp']);
```

### consolidations (v2 socket)

empty in v1. v2 fills nightly.

```ts
consolidations: defineTable({
  userId: v.id('users'),
  date: v.string(),  // YYYY-MM-DD
  summary: v.string(),
  newEntities: v.array(v.string()),
  newRelationships: v.array(v.object({ from: v.string(), to: v.string(), kind: v.string() })),
  reflectiveSummaryDiff: v.optional(v.string()),
  createdAt: v.number(),
});
```

### turns

dialogue history (lightweight; nia is source of truth for memory).

```ts
turns: defineTable({
  userId: v.id('users'),
  role: v.string(),  // user | angel | system
  text: v.string(),
  emotion: v.optional(v.string()),
  toolCalls: v.optional(v.array(v.object({
    tool: v.string(),
    args: v.any(),
    result: v.optional(v.any()),
  }))),
  timestamp: v.number(),
})
  .index('by_userId_time', ['userId', 'timestamp']);
```

## mutations

```ts
// onboarding
saveOnboarding(args: { userId, personaVector, archetypeHistory, traits })

// agent state
setEmotion(args: { userId, emotion })
setLocation(args: { userId, location })
setFaceExpression(args: { userId, face })
setWalkingState(args: { userId, isWalking, walkTarget? })

// tasks
createTask(args: { userId, intent, type })
updateTaskStatus(args: { taskId, status, output?, error? })
attachTranslatedPrompt(args: { taskId, translatedPrompt })

// evolution
logEvolution(args: { userId, eventType, vectorDelta?, signal })

// turns
appendTurn(args: { userId, role, text, emotion?, toolCalls? })
```

## queries

```ts
getUser(args: { authId }) -> User | null
getAgentState(args: { userId }) -> AgentState  // live subscription target
getCurrentTask(args: { userId }) -> Task | null
recentTurns(args: { userId, limit }) -> Turn[]
recentEvolution(args: { userId, limit }) -> EvolutionLog[]
```

## subscriptions (renderer uses these)

renderer subscribes via convex react client:
- `getAgentState` → drives face, location, walking state, emotion
- `getCurrentTask` → drives monitor visibility + task progress hud
- `recentTurns` → optional dialogue history scrollback

## auth

convex auth, oauth via google or magic link. user record auto-created on first auth.

key storage: convex auth tokens go to electron secure-keychain in main process. renderer accesses via ipc, never holds raw tokens.

## v1 → v2 / v3 evolution paths

- consolidations table empty in v1, populated nightly in v2
- evolutionLog vectorDelta is null in v1; v2 actually nudges personaVector based on accumulated deltas
- v3 adds `skills` table mirroring local fs `~/.angel/skills/` for cross-device sync

## indexing strategy

primary access patterns:
- by user (auth, dashboard) → covered by `by_authId`
- by user + recency (turns, tasks, evolution) → covered by `by_userId_time`
- live state (agentState) → single row per user, point lookup

## scale notes

- agentState writes hot during demo (every walk step) — debounce in renderer to ~10/sec max
- turns writes ~1/sec during conversation — fine
- evolutionLog writes ~1/turn — fine
- consolidations writes 1/day — fine
