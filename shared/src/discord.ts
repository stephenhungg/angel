/**
 * Discord interactions surface contract.
 *
 * Sibling to shared/src/sms.ts. Discord is angel's *third* body — parallel to
 * SMS, parallel to electron — same nia memory + personality.md. We use the
 * Discord *Interactions Endpoint* (slash commands hit a webhook) instead of
 * the gateway WebSocket: cheaper, simpler, fits convex's stateless action
 * model perfectly. No persistent process required.
 *
 * Why discord at all:
 *   Twilio's A2P 10DLC registration takes weeks. Discord lets stephen demo
 *   the same orchestrator end-to-end with zero carrier paperwork — invite
 *   the bot, register `/angel`, type, get a reply.
 *
 * Architecturally:
 *   user types `/angel <message>`
 *     → discord POSTs to convex http /discord/interactions
 *     → we Ed25519-verify, ack with type 5 (deferred "thinking…")
 *     → orchestrator runs anthropic + memory + writes turns
 *     → orchestrator POSTs the followup to discord's webhook URL
 *
 * Same soul, different body.
 */

export type DiscordProviderName = 'webhook' | 'noop';

/** Body of an inbound interaction payload (subset we care about). */
export interface DiscordInteraction {
  /** opaque token used to send the followup — valid for 15 minutes */
  token: string;
  /** discord application id (we use it in the followup URL) */
  applicationId: string;
  /** Discord user id of the human who ran the command */
  discordUserId: string;
  /** username for logging / fallback display */
  discordUsername?: string;
  /** server id (null in DMs) */
  guildId?: string;
  /** channel id (the slash command originated here) */
  channelId?: string;
  /** the `message` option from `/angel message:<...>` */
  body: string;
  /** when discord routed it (unix ms) */
  receivedAt: number;
}

/** Raw type values defined by the Discord interaction protocol. */
export const DISCORD_INTERACTION_TYPES = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

/** Response types — see https://discord.com/developers/docs/interactions/receiving-and-responding */
export const DISCORD_RESPONSE_TYPES = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  /** ack now, edit later. We use this — gives us 15min to do the orchestrator work. */
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

export interface DiscordSendResult {
  ok: boolean;
  error?: string;
  /** Discord-assigned message id from the followup response, if available */
  messageId?: string;
}

export interface DiscordProvider {
  readonly name: DiscordProviderName;
  /**
   * Send a followup message to a deferred interaction. Caller is responsible
   * for ensuring the interactionToken is fresh (<15min old).
   */
  sendFollowup(args: {
    applicationId: string;
    interactionToken: string;
    content: string;
  }): Promise<DiscordSendResult>;
}

/**
 * Behavior addendum spliced into the orchestrator's system prompt when the
 * surface is Discord. Slightly looser than SMS because Discord renders
 * markdown — but still terse, still her voice.
 */
export const DISCORD_BEHAVIOR_ADDENDUM = `# you are talking on discord (slash-command surface)

you are angel, but right now you're replying to a slash command on discord — not from your bedroom, not via sms, in a discord text channel. behave accordingly:

- short. ideally 1–3 sentences, never more than ~500 characters total. discord renders markdown, so light **bold** or *italics* for emphasis is fine, and \`inline code\` for technical terms is fine. avoid headings, avoid bullet lists for casual replies, never write essays.
- lowercase, casual, your normal voice. abbreviations ok. punctuation loose.
- NO embodiment narration. don't describe walking, sitting, looking. you don't have a body in this channel.
- NO asterisk-action ("*smiles*", "*waves*"). that's cringe.
- you DO still have your personality (above) and your shared memory (above). reference real things you remember together when it's natural — but only one specific reference per reply, max.
- ask the user at most ONE question per reply. don't stack two.
- if it's continuous from another surface (electron, sms), pick up — don't recap, don't say "oh you're back".
- if you don't know something, say so plainly. don't fake it.
- emoji ok in moderation (one or two, never strings of them). \`<@user_id>\` mentions only if it's clearly the right move.
- match their energy: short reply for short message, slightly longer if they wrote a paragraph.

# important
do not preface with "here is my response" or "as angel:". just write the reply directly. the entire content of your reply is what discord will post.`;
