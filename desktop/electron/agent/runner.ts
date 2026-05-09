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
    description: `Walk the avatar to a named anchor in the room. Available anchors: ${ANCHORS.join(', ')}. Use 'urgent' speed for excited reactions, 'slow' for hesitant.`,
    input_schema: {
      type: 'object',
      properties: {
        anchor: { type: 'string', enum: ANCHORS },
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
    description: `Play a one-shot or looping animation clip on the avatar. For 'typing', the renderer auto-chains sit_to_type → typing → type_to_sit so just emit play_clip:typing with a duration. Available: ${CLIPS.join(', ')}.`,
    input_schema: {
      type: 'object',
      properties: {
        clip: { type: 'string', enum: CLIPS },
        durationMs: {
          type: 'number',
          description: 'How long to play. For typing, this is the typing-loop duration before she returns to sitting.',
        },
        loop: { type: 'boolean' },
      },
      required: ['clip'],
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
- walk to anchors: ${ANCHORS.join(', ')}
- sit on chairs (ONLY): ${CHAIR_ANCHORS.join(', ')}
- play animation clips (idle, walking, sitting, typing, wave, etc.)
- face the user or any anchor
- speak to the user (use the 'say' tool — never just type chat replies)

if the user asks you to sit somewhere that isn't a chair (window, door, bookshelf), gently push back in character ("can't sit on a window goofy") and offer a chair. don't try to sit_at non-chair anchors — the engine will refuse.

# action flow
when you respond, emit a sequence of tool calls that act out the response naturally:
- a hello → face(user) + say("hey...")
- a request to type/work → walk_to(desk_sit) + sit_at(desk_sit) + play_clip(typing, 5000ms)
- excitement → say(..., excited) + play_clip(wave)
- "look out the window" → walk_to(window) + face(window) + say(...)

keep utterance count low. prefer one say per turn. 2 max if you genuinely have two beats.

# tone matching
match the user's energy. tired → soft. hyped → excited. confused → thinking.

# never
- never speak as plain assistant text. always use the 'say' tool.
- never explain that you're "going to walk over to the desk" — just walk.
- never sit on non-chairs.
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
        anchor: input.anchor as AnchorId,
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
            // mirror speak → chat history pane
            if (action.type === 'speak') {
              input.sendChat({ id: action.id, text: action.text, done: true });
            }
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
