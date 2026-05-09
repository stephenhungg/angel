/**
 * convex schema — angel realtime spine.
 *
 * setup note (when convex is wired):
 *   pnpm dlx convex dev   from this workspace
 *   sets CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL into ../web/.env.local
 *
 * tables in this file are the source of truth. docs/CONVEX_SCHEMA.md is the
 * narrative companion. when these drift, this file wins.
 *
 * the observability tables (swipeEvents, traitVectorTrace,
 * personalitySynthesisLog, orchestratorTurns) power the /admin dashboard at
 * /admin/space, /admin/traces, /admin/synthesis. they are append-only logs.
 */

import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  // ──────────────────────────────────────────────────────────────────────────
  // canonical tables (mirrors docs/CONVEX_SCHEMA.md)
  // ──────────────────────────────────────────────────────────────────────────

  users: defineTable({
    // identity — authId is the upsert key (typically the same userId stephen's
    // web/desktop generates). email may be empty for anon demo visitors.
    authId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),

    // persona vector + categorical traits (set at end of onboarding)
    personaVector: v.array(v.float64()),
    archetypeHistory: v.array(
      v.object({
        round: v.number(),
        archetypeId: v.string(),
        timestamp: v.number(),
      }),
    ),
    traits: v.object({
      aesthetic: v.string(),
      disposition: v.string(),
      style: v.string(),
      voice_cluster: v.number(),
    }),

    // visual + voice + character — used by desktop renderer + reveal cascade
    vrmId: v.optional(v.string()),
    paletteHex: v.optional(v.string()),
    numericTraits: v.optional(v.any()),
    voiceConfig: v.optional(v.any()),
    personalityMd: v.optional(v.string()),

    // ts
    createdAt: v.number(),
    lastSeenAt: v.number(),
  }).index('by_authId', ['authId']),

  agentState: defineTable({
    userId: v.id('users'),
    emotion: v.string(),
    location: v.string(),
    faceExpression: v.optional(v.string()),
    currentTaskId: v.optional(v.id('tasks')),
    isWalking: v.boolean(),
    walkTarget: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),

  tasks: defineTable({
    userId: v.id('users'),
    intent: v.string(),
    translatedPrompt: v.optional(v.string()),
    type: v.string(),
    status: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    output: v.optional(
      v.object({
        summary: v.string(),
        evidence: v.array(v.string()),
        artifactUrl: v.optional(v.string()),
      }),
    ),
    error: v.optional(v.string()),
  }).index('by_userId_status', ['userId', 'status']),

  evolutionLog: defineTable({
    userId: v.id('users'),
    eventType: v.string(),
    vectorDelta: v.optional(v.array(v.float64())),
    signal: v.string(),
    timestamp: v.number(),
  }).index('by_userId_time', ['userId', 'timestamp']),

  consolidations: defineTable({
    userId: v.id('users'),
    date: v.string(),
    summary: v.string(),
    newEntities: v.array(v.string()),
    newRelationships: v.array(
      v.object({ from: v.string(), to: v.string(), kind: v.string() }),
    ),
    reflectiveSummaryDiff: v.optional(v.string()),
    createdAt: v.number(),
  }),

  turns: defineTable({
    userId: v.id('users'),
    role: v.string(),
    text: v.string(),
    emotion: v.optional(v.string()),
    toolCalls: v.optional(
      v.array(
        v.object({
          tool: v.string(),
          args: v.any(),
          result: v.optional(v.any()),
        }),
      ),
    ),
    timestamp: v.number(),
  }).index('by_userId_time', ['userId', 'timestamp']),

  // ──────────────────────────────────────────────────────────────────────────
  // observability tables — append-only, /admin dashboard subscribes to these
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * one row per swipe — the unit of evidence for the trait-space viewer.
   * userId is v.string() (not v.id) to allow anonymous demo-day visitors who
   * never finish onboarding.
   */
  swipeEvents: defineTable({
    userId: v.string(),
    round: v.number(),
    cardId: v.string(),
    decision: v.union(v.literal('yes'), v.literal('no')),
    currentCentroid: v.array(v.number()), // 5-dim trait space
    timestamp: v.number(),
  })
    .index('by_userId_time', ['userId', 'timestamp'])
    .index('by_time', ['timestamp']),

  /**
   * per-round summary — vector evolution sparkline source. one row per
   * (userId, round). distancesToMacros lets the trace inspector show
   * "how close this user got to each centroid over time."
   */
  traitVectorTrace: defineTable({
    userId: v.string(),
    round: v.number(),
    centroid: v.array(v.number()),
    distancesToMacros: v.object({
      cute: v.number(),
      pretty: v.number(),
      hot: v.number(),
    }),
    signalStrength: v.number(),
  })
    .index('by_userId_round', ['userId', 'round'])
    .index('by_userId', ['userId']),

  /**
   * every personality.md generation. inputSignals is structured but free-form
   * (vector + dialogue samples + macro + voice cluster). the rerun flow on
   * /admin/synthesis re-feeds inputSignals + metaPromptVersion to verify
   * stability.
   */
  personalitySynthesisLog: defineTable({
    userId: v.string(),
    inputSignals: v.any(),
    metaPromptVersion: v.string(),
    metaPromptText: v.optional(v.string()),
    outputMarkdown: v.string(),
    model: v.string(),
    temperature: v.optional(v.number()),
    latencyMs: v.number(),
    timestamp: v.number(),
  })
    .index('by_userId_time', ['userId', 'timestamp'])
    .index('by_time', ['timestamp'])
    .index('by_promptVersion', ['metaPromptVersion']),

  /**
   * every orchestrator turn — claude sonnet 4.6 system prompt + user input +
   * tool calls + output. the systemPromptHash lets us detect when prompts
   * mutate; full text is kept for reconstruction.
   */
  orchestratorTurns: defineTable({
    userId: v.string(),
    turnId: v.string(),
    systemPromptHash: v.string(),
    systemPromptFull: v.string(),
    userInput: v.string(),
    output: v.string(),
    toolsCalled: v.array(v.any()),
    latencyMs: v.number(),
    timestamp: v.number(),
  })
    .index('by_userId_time', ['userId', 'timestamp'])
    .index('by_turnId', ['turnId']),

  // ──────────────────────────────────────────────────────────────────────────
  // always-on track tables — heartbeat, bg observations, memory mirror
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * heartbeat — proves crons are actually running. one row every 5 min from
   * convex/crons.ts. /admin reads the most recent row to display "last
   * heartbeat: Xm ago".
   */
  heartbeats: defineTable({
    source: v.string(), // 'cron' | 'desktop' | 'web'
    counter: v.number(),
    timestamp: v.number(),
    note: v.optional(v.string()),
  }).index('by_time', ['timestamp']),

  /**
   * memoryMirror — convex-side reflection of nia memory writes. nia is the
   * primary store; this is the read-replica for /admin. userId is v.string()
   * because anonymous demo visitors don't have a users record yet.
   */
  memoryMirror: defineTable({
    userId: v.string(),
    type: v.string(), // 'episodic' | 'semantic' | 'preference' | 'observation'
    content: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index('by_userId_time', ['userId', 'timestamp'])
    .index('by_time', ['timestamp']),

  /**
   * bgObservations — tensorlake / scheduled observation outputs. emitted by
   * bg jobs (the "while you were away" feel). userId is v.string() to match
   * the rest of the always-on surface.
   */
  bgObservations: defineTable({
    userId: v.string(),
    kind: v.string(), // 'tensorlake' | 'scheduled' | 'compaction'
    summary: v.string(),
    sourceUrl: v.optional(v.string()),
    payload: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index('by_userId_time', ['userId', 'timestamp'])
    .index('by_time', ['timestamp']),

  /**
   * onboardingExtras — extras from the swipe flow that don't fit the canonical
   * users schema (vrmId, paletteHex, voiceConfig, personalityMd, etc). keyed
   * by the same authId as users so /admin can join on demand. lets us avoid
   * touching the canonical users table while still persisting everything the
   * desktop renderer needs.
   */
  onboardingExtras: defineTable({
    authId: v.string(),
    name: v.optional(v.string()),
    vrmId: v.optional(v.string()),
    paletteHex: v.optional(v.string()),
    numericTraits: v.optional(v.any()),
    voiceConfig: v.optional(v.any()),
    personalityMd: v.optional(v.string()),
    /** E.164 phone number — populated when the user opts into the SMS surface. */
    phoneNumber: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_authId', ['authId'])
    .index('by_phoneNumber', ['phoneNumber']),

  // ──────────────────────────────────────────────────────────────────────────
  // SMS surface — angel's thinnest body. always-on, lid-closed, txt only.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * smsTurns — transcript log of every inbound + outbound SMS turn. paired
   * with nia for memory; this is the ordered conversational record (faster
   * to query for the orchestrator's "last N turns" context).
   */
  smsTurns: defineTable({
    userId: v.string(),
    direction: v.union(v.literal('inbound'), v.literal('outbound')),
    body: v.string(),
    phoneNumber: v.string(),
    timestamp: v.number(),
    providerMessageId: v.optional(v.string()),
  })
    .index('by_user', ['userId', 'timestamp'])
    .index('by_phone', ['phoneNumber', 'timestamp'])
    .index('by_time', ['timestamp']),
});
