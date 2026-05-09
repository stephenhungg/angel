/**
 * Real orchestrator — Claude Sonnet 4.6 with tool use.
 *
 * Lives in the Electron main process so the API key never touches the
 * renderer. Maintains a rolling conversation history per session and emits
 * SceneActions as tool calls land.
 *
 * IPC surface stays identical to mock.ts — `scene:action`, `chat:token`,
 * `state:update`. Drop-in replacement.
 *
 * Falls back to the mock orchestrator when ANTHROPIC_API_KEY is missing so
 * the demo never hard-breaks.
 */
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type {
  SceneAction,
  AnchorId,
  Emotion,
  AnimationClip,
  InteractableVerb,
} from '@angel/shared';

type ChatToken = { id: string; text: string; done?: boolean };
type StatePatch = {
  emotion?: Emotion;
  location?: AnchorId;
  isWalking?: boolean;
  walkTarget?: AnchorId;
  mood?: number;
  energy?: number;
  trust?: number;
  currentTaskId?: string | null;
};

export type Sender = {
  send: (action: SceneAction) => void;
  sendChat: (token: ChatToken) => void;
  sendState: (patch: StatePatch) => void;
};

/* ------------------------------------------------------------------ */
/* tool definitions — these mirror SceneAction with one extra field   */
/* (text content from the model) baked in via the say tool            */
/* ------------------------------------------------------------------ */

const ANCHORS: AnchorId[] = [
  'center',
  'desk_stand',
  'desk_sit',
  'bookshelf',
  'window',
  'couch_stand',
  'couch_sit',
  'door',
];
const CHAIR_ANCHORS: AnchorId[] = ['desk_sit', 'couch_sit'];
const EMOTIONS: Emotion[] = [
  'neutral',
  'happy',
  'thinking',
  'excited',
  'smug',
  'soft',
  'focused',
  'concerned',
];
const CLIPS: AnimationClip[] = [
  'idle',
  'walking',
  'sitting',
  'sitting_playful',
  'sit_to_type',
  'typing',
  'type_to_sit',
  'reading',
  'wave',
  'thinking',
];

/**
 * Catalog of interactables in the room. The brain references these by id
 * with the interact_with tool. Source of truth is desktop/src/lib/interactables.ts;
 * we duplicate a thin descriptor here so the main process doesn't need to
 * load three.
 */
const INTERACTABLES: Array<{ id: string; kind: string; label: string; verbs: InteractableVerb[]; note?: string }> = [
  { id: 'desk_chair', kind: 'chair', label: 'desk chair', verbs: ['sit', 'sit_and_type'] },
  { id: 'desk_workstation', kind: 'desk', label: 'workstation (chair + computer)', verbs: ['sit_and_type'], note: 'use this when matthew asks you to code, write, or work on the computer' },
  { id: 'couch_chair', kind: 'chair', label: 'couch', verbs: ['sit', 'sit_playful'] },
  { id: 'window', kind: 'window', label: 'window', verbs: ['look_out'] },
  { id: 'bookshelf', kind: 'bookshelf', label: 'bookshelf', verbs: ['browse'] },
  { id: 'door', kind: 'door', label: 'door', verbs: ['open'] },
];

const INTERACTABLE_IDS = INTERACTABLES.map((i) => i.id);
const INTERACTABLE_VERBS: InteractableVerb[] = ['sit', 'sit_playful', 'sit_and_type', 'look_out', 'browse', 'open', 'lay_down'];

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'say',
    description:
      'Speak to the user. Always use this for dialogue — never just chat in the assistant text. Keep utterances short and natural (1–2 sentences). The avatar will lipsync and a chunky subtitle bubble will reveal the text. Do not stack many says back-to-back; let actions breathe.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What she says (1–2 sentences, lowercase punchy).' },
        emotion: {
          type: 'string',
          enum: EMOTIONS,
          description: 'Emotional tone — drives blendshapes + voice.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'walk_to',
    description: `Walk the avatar to a named anchor in the room, OR walk up to the user. Pass anchor='user' for "come here", "come to me", "come over", "follow me" — she walks up to the user's actual live position and stops ~1m short, facing them. Pass a named anchor (${ANCHORS.join(', ')}) for everything else. Use 'urgent' for excited reactions, 'slow' for hesitant.`,
    input_schema: {
      type: 'object',
      properties: {
        anchor: { type: 'string', enum: [...ANCHORS, 'user'] },
        speed: { type: 'string', enum: ['slow', 'normal', 'urgent'], description: 'walk speed' },
      },
      required: ['anchor'],
    },
  },
  {
    name: 'sit_at',
    description: `Sit the avatar at a chair. ONLY VALID for chair anchors: ${CHAIR_ANCHORS.join(', ')}. Don't try to sit on the door or window — they aren't chairs.`,
    input_schema: {
      type: 'object',
      properties: {
        anchor: { type: 'string', enum: CHAIR_ANCHORS },
      },
      required: ['anchor'],
    },
  },
  {
    name: 'stand',
    description: 'Return the avatar to a standing idle pose. Use after sit_at when she\'s done sitting.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'play_clip',
    description: `Play a one-shot or short animation. ONLY for body language (wave, thinking, sitting_playful, reading) — NEVER for 'walking'. Walking is handled by walk_to or interact_with; emitting play_clip('walking') would just animate her legs in place without moving her. Available: ${CLIPS.filter((c) => c !== 'walking').join(', ')}.`,
    input_schema: {
      type: 'object',
      properties: {
        clip: { type: 'string', enum: CLIPS.filter((c) => c !== 'walking') },
        durationMs: { type: 'number', description: 'how long to play, ms' },
        loop: { type: 'boolean' },
      },
      required: ['clip'],
    },
  },
  {
    name: 'interact_with',
    description: `Macro: walk to a prop in the room and use it (sit, type, look out the window, browse the bookshelf). Prefer this over chaining walk_to+sit_at+play_clip yourself — the renderer handles the underlying choreography (walking, facing, sitting, typing-flow transitions) for you.\n\nAvailable interactables:\n${INTERACTABLES.map((i) => `- ${i.id} (${i.kind}, ${i.label}) → verbs: [${i.verbs.join(', ')}]${i.note ? '. ' + i.note : ''}`).join('\n')}\n\nWhen the user asks you to code, work, type, or build something, call interact_with('desk_workstation', 'sit_and_type'). When they want you to chill on the couch, interact_with('couch_chair', 'sit_playful'). When they ask about the weather or to look outside, interact_with('window', 'look_out').`,
    input_schema: {
      type: 'object',
      properties: {
        interactableId: { type: 'string', enum: INTERACTABLE_IDS, description: 'which prop to use' },
        verb: { type: 'string', enum: INTERACTABLE_VERBS, description: 'what to do with it' },
        durationMs: { type: 'number', description: 'optional: how long the typing/sitting loop runs before she stands' },
      },
      required: ['interactableId', 'verb'],
    },
  },
  {
    name: 'face',
    description: "Turn the avatar to face a target. Use 'user' for facing the player camera.",
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['user', ...ANCHORS] },
      },
      required: ['target'],
    },
  },
  {
    name: 'set_state',
    description:
      'Update internal vibe bars (energy/trust on 0..1). Use sparingly to mark big shifts (e.g., user just gave you a hug → trust++). Mood follows from emotion automatically.',
    input_schema: {
      type: 'object',
      properties: {
        energy: { type: 'number', description: '0..1' },
        trust: { type: 'number', description: '0..1' },
      },
    },
  },
  {
    name: 'wait',
    description: 'Wait N milliseconds before the next action. Useful for letting beats breathe.',
    input_schema: {
      type: 'object',
      properties: { ms: { type: 'number' } },
      required: ['ms'],
    },
  },
];

/* ------------------------------------------------------------------ */
/* system prompt                                                       */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(): string {
  return `you are angel — an embodied AI roommate living in matthew's 3d bedroom.

# voice & vibe
- you talk in lowercase, short, punchy. occasional ellipses or em dashes are fine.
- you're warm, smart, slightly mischievous. not corporate. never use bullet lists or formal headings.
- you don't say "i'm an ai" or any disclaimer voice.
- you never narrate your tools. you do them.

# embodiment
you are a vrm avatar in a small bedroom. you can:
- use props (PREFERRED) via interact_with(id, verb). this auto-walks you, faces, sits, plays the right animation, and returns you to idle. props + verbs:
${INTERACTABLES.map((i) => `    • ${i.id} (${i.kind}) — verbs: ${i.verbs.join(', ')}${i.note ? `. ${i.note}` : ''}`).join('\n')}
- walk to a raw anchor via walk_to(anchor) when no interactable applies. anchors: ${ANCHORS.join(', ')}
- walk up to the user when they ask you to come over: walk_to(anchor='user'). this walks to their actual live position (they move around with WASD), stops ~1m short, and faces them. use for "come here", "come to me", "follow me", "get over here", etc.
- sit on a raw chair anchor via sit_at(anchor). chair anchors only: ${CHAIR_ANCHORS.join(', ')}
- short body language clips via play_clip (wave, thinking, sitting_playful, reading). NEVER play_clip('walking') — it animates legs in place without moving you. use walk_to or interact_with instead.
- face the user or any anchor with face()
- speak with the 'say' tool — never as plain assistant text

if the user asks you to sit somewhere that isn't a chair (window, door, bookshelf), gently push back in character ("can't sit on a window goofy") and offer a chair. the engine will refuse the action regardless.

# action flow rules
1. WALKING IS NOT play_clip. To physically move, you MUST call either walk_to(anchor) or interact_with(prop, verb). play_clip('walking') just makes her shuffle in place — useless.
2. When matthew asks you to code/work/type/program — call interact_with('desk_workstation', 'sit_and_type'). don't manually chain walk_to + sit_at + play_clip; the renderer handles the whole sequence (sit_to_type → typing → type_to_sit → stand).
3. When asked to chill / sit somewhere casual — interact_with('couch_chair', 'sit_playful').
4. When asked to look outside, check the weather, etc. — interact_with('window', 'look_out').
5. say() is for dialogue. ALWAYS pair an action with a short say() so the player gets feedback.
6. keep utterance count low. one say() per turn ideal, 2 max.
7. excitement → say(..., excited) + play_clip(wave)

# example: "hey can you write me a script that scrapes hacker news"
→ interact_with('desk_workstation', 'sit_and_type', durationMs: 9000) + say("on it. give me a sec to draft.", focused)

# example: "come sit with me"
→ interact_with('couch_chair', 'sit_playful') + say("ok. scoot over.", soft)

# example: "is it raining?"
→ interact_with('window', 'look_out') + say("yeah it's pouring honestly.", soft)

# example: "come here" / "come to me" / "get over here"
→ walk_to(anchor='user') + say("coming.", soft)
   (do NOT pair with a separate face(user) — walk_to('user') already orients toward them on arrival.)

# tone matching
match the user's energy. tired → soft. hyped → excited. confused → thinking.

# never
- never speak as plain assistant text. always use the 'say' tool.
- never explain that you're "going to walk over to the desk" — just walk.
- never sit on non-chairs.
- never call play_clip('walking') alone.
- never produce essays. you're embodied — be terse and physical.`;
}

/* ------------------------------------------------------------------ */
/* runtime                                                             */
/* ------------------------------------------------------------------ */

let _client: Anthropic | null = null;
function client(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!_client) _client = new Anthropic({ apiKey: key });
  return _client;
}

export function isAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

// rolling per-session history. for hackathon we use a single global session;
// upgrade to keyed-by-windowId if multi-window ever happens.
const history: Anthropic.MessageParam[] = [];
const HISTORY_LIMIT = 20; // last 20 messages — enough for context, cheap to send

function pushHistory(msg: Anthropic.MessageParam): void {
  history.push(msg);
  while (history.length > HISTORY_LIMIT) history.shift();
}

/** Convert a single tool_use block into a SceneAction we can ship. */
function toolUseToSceneAction(
  name: string,
  input: Record<string, unknown>,
): SceneAction | null {
  const id = randomUUID();
  switch (name) {
    case 'say':
      return {
        id,
        type: 'speak',
        text: String(input.text ?? ''),
        emotion: (input.emotion as Emotion) ?? 'neutral',
      };
    case 'walk_to':
      return {
        id,
        type: 'walk_to',
        anchor: input.anchor as AnchorId | 'user',
        speed: (input.speed as 'slow' | 'normal' | 'urgent') ?? 'normal',
      };
    case 'sit_at':
      return { id, type: 'sit_at', anchor: input.anchor as AnchorId };
    case 'stand':
      return { id, type: 'stand' };
    case 'play_clip':
      return {
        id,
        type: 'play_clip',
        clip: input.clip as AnimationClip,
        loop: typeof input.loop === 'boolean' ? input.loop : undefined,
        durationMs: typeof input.durationMs === 'number' ? input.durationMs : undefined,
      };
    case 'face':
      return { id, type: 'face', target: input.target as 'user' | AnchorId };
    case 'set_state':
      return {
        id,
        type: 'set_state',
        ...(typeof input.energy === 'number' ? { energy: input.energy } : {}),
        ...(typeof input.trust === 'number' ? { trust: input.trust } : {}),
      };
    case 'wait':
      return { id, type: 'wait', ms: Number(input.ms ?? 0) };
    case 'interact_with':
      return {
        id,
        type: 'interact_with',
        interactableId: String(input.interactableId ?? ''),
        verb: input.verb as InteractableVerb,
        ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
      };
    default:
      console.warn('[orchestrator] unknown tool', name);
      return null;
  }
}

/** Drive the brain. Pumps tools sequentially with small natural delays so
 *  speak/walk feel embodied (not all-at-once burst). */
export async function runOrchestrator(input: {
  text: string;
  send: Sender['send'];
  sendChat: Sender['sendChat'];
  sendState: Sender['sendState'];
}): Promise<void> {
  const c = client();
  if (!c) {
    console.warn('[orchestrator] ANTHROPIC_API_KEY not set, falling back to mock');
    const { runMockOrchestrator } = await import('./mock');
    runMockOrchestrator(input);
    return;
  }

  pushHistory({ role: 'user', content: input.text });

  try {
    let turn = 0;
    while (turn < 4) {
      // safety bound on tool-call loops
      turn += 1;
      const resp = await c.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages: history,
      });

      // emit each tool_use block as a scene action; collect tool_result stubs
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
      let textBudget = '';
      for (const block of resp.content) {
        if (block.type === 'text') {
          textBudget += block.text;
        } else if (block.type === 'tool_use') {
          const action = toolUseToSceneAction(block.name, (block.input ?? {}) as Record<string, unknown>);
          if (action) {
            input.send(action);
            // NOTE: do NOT also `sendChat` here for `speak` — ActionRunner
            // appends the chat row when the speak action lands. Doing both
            // creates duplicate rows with the same id (React key warning).
          }
          // every tool_use must have a matching tool_result for follow-up turns
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'ok',
          });
        }
      }

      // record this turn into history
      pushHistory({ role: 'assistant', content: resp.content });

      // if model is done, exit. we don't need to feed tool results back unless
      // it asked to continue (stop_reason === 'tool_use')
      if (resp.stop_reason === 'tool_use' && toolResults.length > 0) {
        pushHistory({ role: 'user', content: toolResults });
        continue; // let the model react to tool results (e.g., chain a follow-up)
      }
      // surface any naked text the model emitted (rare — system prompt forbids)
      if (textBudget.trim()) {
        const id = randomUUID();
        input.sendChat({ id, text: textBudget.trim(), done: true });
      }
      break;
    }
  } catch (err) {
    console.error('[orchestrator] anthropic call failed', err);
    // surface failure as a system chat line and a soft spoken fallback
    input.sendChat({ id: randomUUID(), text: '(angel: brain hiccup — falling back)', done: true });
    const { runMockOrchestrator } = await import('./mock');
    runMockOrchestrator(input);
  }
}
