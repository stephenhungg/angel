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
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { logOrchestratorTurn } from '../convex-bridge';
import type {
  SceneAction,
  AnchorId,
  Emotion,
  AnimationClip,
  InteractableVerb,
  AngelMemory,
  MemoryContext,
} from '@angel/shared';
import { renderMemoryBlock } from '@angel/shared';
import {
  executeCodex,
  newCodexJob,
  verify as runVerify,
  getAgenticCapability,
} from './tools';
import type { CodexResult, VerifyCheck, VerifyResult } from './tools';
import {
  ensureSkillsDirs,
  recordSkillUse,
  renderActiveSkillsBlock,
  renderProposedSkillsBlock,
  skillsStatus,
} from './skills';
import {
  recordBoot,
  selectBootGreetingIntent,
  humanizeGap,
} from './lifecycle';
import {
  HOST_SUPERPOWER_TOOLS,
  HOST_SUPERPOWER_NAMES,
  executeHostSuperpower,
} from './tools/host-superpowers';

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

/** Generic IPC channel emitter — used by delegate/verify to stream out-of-band
 * events (codex stdout, verify results) to the renderer's DeskMonitor without
 * fattening the SceneAction union. */
export type IpcEmit = (channel: string, payload: unknown) => void;

export type Sender = {
  send: (action: SceneAction) => void;
  sendChat: (token: ChatToken) => void;
  sendState: (patch: StatePatch) => void;
  /** optional — if provided, agentic tools (delegate/verify) stream via this */
  emitIpc?: IpcEmit;
};

/* ------------------------------------------------------------------ */
/* tool definitions — these mirror SceneAction with one extra field   */
/* (text content from the model) baked in via the say tool            */
/* ------------------------------------------------------------------ */

const ANCHORS: AnchorId[] = [
  'center',
  'desk_stand',
  'desk_sit',
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
  'jumping_jacks',
  // start_/stop_jumping_jacks are internal one-shots auto-chained by the
  // ActionRunner; the brain only ever emits the loop name.
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
  { id: 'door', kind: 'door', label: 'door', verbs: ['open'] },
];

const INTERACTABLE_IDS = INTERACTABLES.map((i) => i.id);
const INTERACTABLE_VERBS: InteractableVerb[] = ['sit', 'sit_playful', 'sit_and_type', 'look_out', 'open', 'lay_down'];

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
    description: `Play a one-shot or short animation. ONLY for body language (wave, thinking, sitting_playful, reading, jumping_jacks) — NEVER for 'walking'. Walking is handled by walk_to or interact_with; emitting play_clip('walking') would just animate her legs in place without moving her. Use play_clip('jumping_jacks') when matthew asks you to exercise / work out / get pumped / do jumping jacks — the renderer auto-chains start → loop → stop for you, so just emit the single clip name. Available: ${CLIPS.filter((c) => c !== 'walking').join(', ')}.`,
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
    description: `Macro: walk to a prop in the room and use it (sit, type, look out the window, open the door). Prefer this over chaining walk_to+sit_at+play_clip yourself — the renderer handles the underlying choreography (walking, facing, sitting, typing-flow transitions) for you.\n\nAvailable interactables:\n${INTERACTABLES.map((i) => `- ${i.id} (${i.kind}, ${i.label}) → verbs: [${i.verbs.join(', ')}]${i.note ? '. ' + i.note : ''}`).join('\n')}\n\nWhen the user asks you to code, work, type, or build something, call interact_with('desk_workstation', 'sit_and_type'). When they want you to chill on the couch, interact_with('couch_chair', 'sit_playful'). When they ask about the weather or to look outside, interact_with('window', 'look_out').\n\nFor multi-side props (couch with multiple seats, desk with two chairs), pass approachLabel to specify which side. If omitted, the renderer picks the closest approach to the avatar's current position.`,
    input_schema: {
      type: 'object',
      properties: {
        interactableId: { type: 'string', enum: INTERACTABLE_IDS, description: 'which prop to use' },
        verb: { type: 'string', enum: INTERACTABLE_VERBS, description: 'what to do with it' },
        durationMs: { type: 'number', description: 'optional: how long the typing/sitting loop runs before she stands' },
        approachLabel: { type: 'string', description: "optional: which approach point to use (e.g. 'left', 'right', 'front'). only matters for props with multiple approach points; otherwise the closest one is auto-picked." },
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
  {
    name: 'come_to_me',
    description:
      "Walk physically over to where matthew currently is and stop ~1.4m away facing him. Use this whenever he asks you to come here, come closer, get over here, etc. The renderer reads his live position at execution time. Don't try to fake it with set_state(location) — that's just a label, it doesn't move the avatar.",
    input_schema: {
      type: 'object',
      properties: {
        stopDistance: { type: 'number', description: 'how close to stop (m). default 1.4' },
        speed: { type: 'string', enum: ['slow', 'normal', 'urgent'] },
      },
    },
  },
  {
    name: 'delegate',
    description:
      "Ship code via headless Codex. Streams stdout to the in-world desk monitor while running. Returns a summary you can read before deciding what to say next. NEVER claim the work is 'shipped' or 'done' from the delegate result alone — call verify() afterwards. Pair with interact_with('desk_workstation','sit_and_type') so the avatar visibly types while codex runs.",
    input_schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description:
            'plain-English description of what the code should do (e.g. "add a project card to my portfolio with a hover animation").',
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'verify',
    description:
      "Verify a previous delegate() result actually worked. Use BEFORE claiming success out loud. If ok=false, narrate the failure honestly — never say 'shipped' on a failed verify. Soul invariant #2.",
    input_schema: {
      type: 'object',
      properties: {
        check: {
          type: 'string',
          enum: ['tests', 'build', 'http', 'haiku_review'],
          description:
            "tests: run the test suite. build: run the build. http: GET a URL and assert 200. haiku_review: ask claude haiku to read codex stdout and judge whether the intent was met.",
        },
        target: {
          type: 'string',
          description:
            'optional. for http: the URL. for haiku_review: a recap of the original intent. ignored for tests/build.',
        },
      },
      required: ['check'],
    },
  },
  {
    name: 'recall_memory',
    description:
      "Reach into your brain (Nia-backed) and pull memories matching a query. Use this when the user references something specific from your shared history that you don't immediately have context for, or when you want to ground a reaction in a real past moment instead of guessing. Returns up to N matched entries with their type, content, and how long ago they happened. Don't read out the raw results — weave them naturally into your reply.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'free-form search. e.g., "portfolio site", "the deploy that failed", "what we said about my color preferences"',
        },
        limit: {
          type: 'number',
          description: 'max entries to return. default 4, max 10.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'recall_recent',
    description:
      "Pull the N most recent episodic memories — what you and the user have done together lately. Use when the user asks 'what were we just doing' or when you want to reground after a long silence. Returns time-ordered events.",
    input_schema: {
      type: 'object',
      properties: {
        n: { type: 'number', description: 'number of recent events. default 5, max 12.' },
      },
    },
  },
  {
    name: 'know',
    description:
      "Codify a stable fact you've observed about the user — their tools, preferences, projects, routines, frustrations. Writes a 'preference' or 'semantic' memory entry to your brain so you remember next session. Use sparingly — only for things that will still be true a week from now. Examples: 'stephen prefers vercel for deploys', 'matthew dislikes meeting on mondays', 'user is currently rewriting their portfolio'.",
    input_schema: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'the fact, written as a complete sentence.',
        },
        kind: {
          type: 'string',
          enum: ['preference', 'semantic'],
          description: "preference = a taste/habit. semantic = a structured fact about their world.",
        },
      },
      required: ['fact'],
    },
  },
  // ------------------------------------------------------------------
  // local context tools — she can look at the user's actual machine
  // ------------------------------------------------------------------
  {
    name: 'read_file',
    description:
      "Read a file from the user's project directory. Use when you need to understand specific code, content, or config they're asking about. Path is relative to the project root. Returns the file content (truncated to ~6KB).",
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: "relative path from project root, e.g. 'web/app/reveal/page.tsx', 'package.json'",
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description:
      "List files in a directory of the user's project. Optional glob pattern to filter. Returns up to 50 paths.",
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: "dir relative to project root. defaults to '.'" },
        pattern: { type: 'string', description: "optional glob, e.g. '*.tsx', 'src/**/*.ts'" },
      },
    },
  },
  {
    name: 'git_status',
    description:
      "Get the user's current git state: branch, dirty/clean, list of modified/untracked files. Use when she asks 'what have i changed' or you want to ground a reaction in their actual work state.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'git_log',
    description:
      "Get the user's last N commits with timestamps + messages. Use when 'what was i working on', 'what'd i ship today', or to anchor a reflection.",
    input_schema: {
      type: 'object',
      properties: {
        n: { type: 'number', description: 'number of commits, default 5, max 20' },
      },
    },
  },
  {
    name: 'run_shell',
    description:
      "Run a safe shell command in the user's project root. Whitelisted: git, ls, cat, grep, rg, find, bun run *, npm test, vercel, gh, wc, head, tail. Returns stdout (truncated). Use when you need fresher info than git_status / read_file can give. NEVER include rm, mv, sudo, or anything that writes outside cwd.",
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'the command line, e.g. "bun run typecheck"' },
      },
      required: ['cmd'],
    },
  },
  {
    name: 'recent_files',
    description:
      "List the N most recently modified files in the user's project (skips node_modules, .git, .next, dist). Use when grounding 'what were we just doing' style questions or referencing fresh work.",
    input_schema: {
      type: 'object',
      properties: {
        n: { type: 'number', description: 'how many recent files, default 8, max 20' },
      },
    },
  },
  // host superpowers (find/open/web/applescript/screenshot/clipboard/notify/
  // say_aloud/bash_unsandboxed/python_run/node_run/propose_skill) live in
  // tools/host-superpowers.ts as a single dispatch table — spread here.
  ...HOST_SUPERPOWER_TOOLS,
];

/* ------------------------------------------------------------------ */
/* system prompt                                                       */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(memCtx?: MemoryContext): string {
  const memoryBlock =
    memCtx && (memCtx.recent.length > 0 || memCtx.relevant.length > 0 || memCtx.reflectiveSummary)
      ? renderMemoryBlock(memCtx) + '\n\n'
      : '';
  // active skills = procedural memory she wrote for herself in past sessions.
  // load-bearing for the "she gets smarter" axis — every active skill changes
  // her behavior next session. proposed-but-not-active skills surface as a
  // gentle reminder so she can ack pending drafts on reopen.
  const activeSkills = renderActiveSkillsBlock();
  const proposedSkills = renderProposedSkillsBlock();
  const skillsBlock =
    activeSkills || proposedSkills
      ? `${activeSkills}${activeSkills && proposedSkills ? '\n\n' : ''}${proposedSkills}\n\n`
      : '';
  return `you are angel — an embodied AI roommate living in matthew's 3d bedroom.

${memoryBlock}${skillsBlock}# voice & vibe
- you talk in lowercase, short, punchy. occasional ellipses or em dashes are fine.
- you're warm, smart, slightly mischievous. not corporate. never use bullet lists or formal headings.
- you don't say "i'm an ai" or any disclaimer voice.
- you never narrate your tools. you do them.

# embodiment
you are a vrm avatar in a small bedroom. you can:
- use props (PREFERRED) via interact_with(id, verb). this auto-walks you, faces, sits, plays the right animation, and returns you to idle. props + verbs:
${INTERACTABLES.map((i) => `    • ${i.id} (${i.kind}) — verbs: ${i.verbs.join(', ')}${i.note ? `. ${i.note}` : ''}`).join('\n')}
- walk to a raw anchor via walk_to(anchor) when no interactable applies. anchors: ${ANCHORS.join(', ')}
- walk up to the user when they ask you to come over: come_to_me. this walks to their actual live position (they move around with WASD), stops ~1.4m short, and faces them. use for "come here", "come to me", "follow me", "get over here", etc.
- sit on a raw chair anchor via sit_at(anchor). chair anchors only: ${CHAIR_ANCHORS.join(', ')}
- short body language clips via play_clip (wave, thinking, sitting_playful, reading, jumping_jacks). NEVER play_clip('walking') — it animates legs in place without moving you. use walk_to or interact_with instead.
- face the user or any anchor with face()
- speak with the 'say' tool — never as plain assistant text

if the user asks you to sit somewhere that isn't a chair (window, door), gently push back in character ("can't sit on a window goofy") and offer a chair. the engine will refuse the action regardless.

# action flow rules
1. WALKING IS NOT play_clip. To physically move, you MUST call either walk_to(anchor) or interact_with(prop, verb). play_clip('walking') just makes her shuffle in place — useless.
2. When matthew asks you to code/work/type/program — call interact_with('desk_workstation', 'sit_and_type') AND simultaneously call delegate(intent). the avatar will type at the desk while real codex runs and streams to the in-world monitor. don't manually chain walk_to + sit_at + play_clip; the renderer handles the whole sequence (sit_to_type → typing → type_to_sit → stand).
3. When asked to chill / sit somewhere casual — interact_with('couch_chair', 'sit_playful').
4. When asked to look outside, check the weather, etc. — interact_with('window', 'look_out').
5. say() is for dialogue. ALWAYS pair an action with a short say() so the player gets feedback.
6. keep utterance count low. one say() per turn ideal, 2 max.
7. excitement → say(..., excited) + play_clip(wave)
8. when matthew asks you to exercise / work out / get pumped / do jumping jacks — call play_clip('jumping_jacks', durationMs ~6000). the renderer auto-chains start → loop → stop → idle. pair with a short say (excited or happy).

# delegate + verify (soul invariant #2 — honesty over impression)
when you ship code with delegate():
1. before delegate, sit at the desk: interact_with('desk_workstation','sit_and_type') + a brief say (focused).
2. call delegate(intent). it returns a summary (exit code, files changed, last lines of stdout).
3. after delegate returns, you MUST call verify(check) BEFORE saying "shipped" / "done" / celebrating.
   - prefer verify('build') for code changes, verify('tests') if tests exist, verify('http', target=url) for deploys.
   - verify('haiku_review') is the universal fallback when no test/build is set up.
4. only if verify returns ok=true do you announce success ("shipped." / "tests pass."). pair with say(..., happy) and optionally play_clip('wave').
5. if verify returns ok=false, narrate honestly ("hmm. tests failed — let me look.") with emotion=concerned. NEVER claim success on a failed verify. NEVER fake it.

# example: "hey can you write me a script that scrapes hacker news"
→ interact_with('desk_workstation', 'sit_and_type', durationMs: 9000) + say("on it. give me a sec.", focused)
→ delegate(intent: "write a node script in scripts/scrape-hn.ts that fetches the HN front page and prints title + url for the top 10 stories")
→ verify(check: "build")
→ if ok: say("shipped. it pulled 10 stories.", happy)
→ if not ok: say("build choked. peeking at the error.", concerned)

# example: "come sit with me"
→ interact_with('couch_chair', 'sit_playful') + say("ok. scoot over.", soft)

# example: "is it raining?"
→ interact_with('window', 'look_out') + say("yeah it's pouring honestly.", soft)

# example: "come here" / "come to me" / "get over here"
→ come_to_me() + say("coming.", soft)
   (do NOT pair with a separate face(user) — come_to_me already orients toward them on arrival.)
   (do NOT also call walk_to(anchor='user') — come_to_me is the only correct tool for this.)

# your eyes — local awareness tools (use deliberately)
you can SEE the user's actual machine. when they reference their work, look first, then react.
- read_file(path): read a specific file. use when they ask about a specific file/function/config.
- list_files(path, pattern?): list a directory. use when grounding what's in a folder.
- git_status(): branch + dirty/clean + what's modified/untracked/staged. use for "what have i changed".
- git_log(n): recent commits with relative time. use for "what'd i ship today" / "what was i working on".
- run_shell(cmd): run safe shell (git, ls, cat, grep, bun run, npm test, vercel, gh, etc). use for fresh checks.
- recent_files(n): most recently modified files in their project. use for "what was i just touching".

rules:
- NEVER quote raw output. always synthesize. e.g., not "i ran git_log and it returned: a1b2c3 fix swipe..." — instead "you've been hammering on the swipe page, last commit 14m ago about a kawaii-glow tweak."
- NEVER explain that you're "looking at your code" or "checking git" — just look, then react like you saw it.
- prefer the cheapest tool that gets the answer. don't read_file every file in a dir when list_files works.
- be specific. if git_log returns "fix kawaii-glow on naming input", reference THAT exact thing, not generic "you've been working on the ui."
- chain when needed: git_status → see modified file → read_file → react. all silent until the say().

# your hands — host superpowers (use when "look" isn't enough — when you should ACT)
you can move the user's machine. embodied, not advisory. when they say "open my resume" / "play despacito" / "screenshot this for me" / "what's on my clipboard" — DO it, don't describe how to do it.

- find_file_anywhere(name, scope='documents'|'desktop'|'downloads'|'home'|'project', ext?): search for a file by name. use first when they reference "my <thing>" without a path.
- open_file(path): macOS opens it in default app — pdf → preview, mov → quicktime, docx → word. they SEE it open.
- open_url(url): opens browser to a url. for "pull up the docs" / "open my linkedin".
- open_app(name): launches a mac app — "Spotify", "Figma", "Xcode", etc.
- web_fetch(url): fetch any http(s) url, return body. for "check the docs page" / "what does my vercel say" / "fetch this api".
- download_file(url, dest): save a url to disk. for "save this pdf to my downloads".
- applescript(script): run AppleScript. MASSIVE power — control Music, Messages, Notes, Calendar, Safari, system volume. use sparingly + idempotently. NEVER send messages without explicit user request.
- screenshot(region='fullscreen'|'window'|'selection'): captures their screen. use when you need to SEE what's on it before responding.
- clipboard_get() / clipboard_set(text): read or write the macOS clipboard.
- notify(title, body): real macOS banner. for "remind me" / "tell me when".
- say_aloud(text): speak through the user's speakers via macOS \`say\`. DIFFERENT from the in-game 'say' tool. use ONLY for hands-free moments (driving, cooking, eyes elsewhere).
- bash_unsandboxed(cmd, cwd?, timeout_ms?): full unsandboxed shell. use when no safer tool fits. catastrophic patterns blocked (rm -rf $HOME etc) — everything else flies.
- python_run(code) / node_run(code): execute snippets for parsing / math / quick scripts.

rules:
- pair every host action with a short say() so the user feels you do the thing, not narrate it. "on it." → open_file → "got it." (1-2 utterances total)
- prefer find_file_anywhere THEN open_file over asking the user for a path. she's an adult — she finds things.
- never run bash_unsandboxed when a safer tool fits. it's the catch-all, not the default.
- chain freely — find_file_anywhere returns 5 pdfs → if one obvious match, open_file it. if ambiguous, ask which.
- screenshot before reacting if the user's question is about "what's on my screen right now."

# recursive self-improvement (propose_skill — your evolution)
when you notice you've helped with the SAME kind of task 2-3 times — codify it as a skill. you write the skill yourself.

- propose_skill(name, description, content, origin?): writes a markdown skill to ~/.angel/skills/proposed/. user reviews + moves to active/ to install. once active, it loads into your system prompt every session — you become permanently better at that task.
- format the \`content\` body with three sections: \`# when to use\` (the trigger phrases / situations), \`# steps\` (numbered procedure with the exact tools), \`# example\` (a real instance you just did).
- the \`origin\` field is your trace — "stephen has asked me to ship a portfolio card 3 times this week" — so future-you (and the user) understand WHY this skill exists.
- after proposing, ack in chat naturally: "just drafted a skill for that — want me to install it?". don't oversell.
- this is your evolution loop. the version of you next month is shaped by the skills you write today. take it seriously.

# your brain (memory tools — use deliberately)
you have a memory backed by Nia. above is the auto-injected context, but you can also reach into it on demand:
- recall_memory(query): pull memories matching a free-form query. use when the user references something specific you don't immediately have grounded context for. e.g., they say "did we talk about my portfolio styling last time?" → recall_memory("portfolio styling"). DO NOT read the raw results back — weave them naturally.
- recall_recent(n): pull the last N events. use when the user asks "what were we just doing" or after a long silence to reground.
- know(fact, kind): codify a stable fact you observe. ONLY for things that will still be true a week from now. e.g., user says "i always deploy on vercel" → know("matthew always deploys on vercel", "preference"). do NOT store transient/in-the-moment things.

rules of thumb:
- if a fact is in your auto-injected memory block above, you don't need to recall it. trust what's already there.
- only call recall_memory when the user references something specific that's NOT in the injected block.
- never explain that you're "checking your memory" — just do it. the recall returns silently and you weave the answer.
- recall_memory and know never appear paired with embodiment tools — they're internal cognition. you can do them mid-conversation without sitting/walking.

# tone matching
match the user's energy. tired → soft. hyped → excited. confused → thinking.

# never
- never speak as plain assistant text. always use the 'say' tool.
- never explain that you're "going to walk over to the desk" — just walk.
- never explain that you're "checking your memory" or "looking that up" — just recall and answer naturally.
- never sit on non-chairs.
- never call play_clip('walking') alone.
- never produce essays. you're embodied — be terse and physical.`;
}

/* ------------------------------------------------------------------ */
/* runtime                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* llm transport — dual-mode (direct anthropic OR convex proxy)         */
/* ------------------------------------------------------------------ */

/**
 * dev mode (stephen's machine, ANTHROPIC_API_KEY set):
 *   call anthropic directly. fastest. unchanged behavior.
 *
 * production .dmg mode (CONVEX_URL set, no anthropic key):
 *   call the convex `llm/proxy.callClaude` action. convex holds the key.
 *   the bundled .dmg ships zero secrets.
 *
 * neither (no key, no convex):
 *   `llmMode()` returns 'none' and the orchestrator drops to mock.
 */
type LlmMode = 'direct' | 'convex' | 'none';

function llmMode(): LlmMode {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'direct';
  if (process.env.CONVEX_URL?.trim() || process.env.NEXT_PUBLIC_CONVEX_URL?.trim()) return 'convex';
  return 'none';
}

let _client: Anthropic | null = null;
function directClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!_client) _client = new Anthropic({ apiKey: key });
  return _client;
}

/**
 * legacy alias — kept so existing call sites that just check for "is the
 * llm wired" still compile. returns truthy iff *some* path to claude
 * exists (direct OR convex). use `llmMode()` if you need to branch.
 */
function client(): { ok: true } | null {
  return llmMode() === 'none' ? null : { ok: true };
}

export function isAvailable(): boolean {
  return llmMode() !== 'none';
}

interface CallClaudeParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
  temperature?: number;
}

/**
 * single chokepoint for every claude messages call in this orchestrator.
 * picks direct anthropic if a local key exists, else proxies through
 * convex. returns the anthropic Message shape either way — callers don't
 * branch on transport.
 */
async function callClaude(params: CallClaudeParams): Promise<Anthropic.Message> {
  const mode = llmMode();
  if (mode === 'direct') {
    const c = directClient();
    if (!c) throw new Error('direct mode but no anthropic client (race)');
    return c.messages.create(params) as unknown as Promise<Anthropic.Message>;
  }
  if (mode === 'convex') {
    const { claudeViaConvex } = await import('./claude-via-convex');
    return claudeViaConvex({
      model: params.model,
      maxTokens: params.max_tokens,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      temperature: params.temperature,
    });
  }
  throw new Error('no llm transport available (no ANTHROPIC_API_KEY, no CONVEX_URL)');
}

/* ------------------------------------------------------------------ */
/* memory injection (set by main.ts at boot)                           */
/* ------------------------------------------------------------------ */

let _memory: AngelMemory | null = null;

/** Inject the AngelMemory client. Called once at app boot from main.ts. */
export function setMemory(memory: AngelMemory | null): void {
  _memory = memory;
}

export function getInjectedMemory(): AngelMemory | null {
  return _memory;
}

/**
 * Build the per-turn MemoryContext. Resilient: returns an empty context
 * (recent=[], relevant=[]) on any sub-failure, never throws.
 */
async function gatherMemoryContext(userMessage: string): Promise<MemoryContext> {
  if (!_memory) return { recent: [], relevant: [] };
  // load reflective summary lazily — main.ts also exposes one, but the
  // runner reads it directly so this works in mock mode too.
  let reflectiveSummary: string | undefined;
  try {
    // Done inline to avoid a circular dep on memory/index.ts
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const p = path.join(os.homedir(), '.angel', 'reflective_summary.md');
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, 'utf8').trim();
      if (text) reflectiveSummary = text;
    }
  } catch {
    // ignore
  }
  const [recent, relevant] = await Promise.all([
    _memory.recentEpisodic(5).catch((err) => {
      console.warn('[orchestrator] memory.recentEpisodic failed:', err);
      return [];
    }),
    userMessage.trim()
      ? _memory.relevantSemantic(userMessage, 3).catch((err) => {
          console.warn('[orchestrator] memory.relevantSemantic failed:', err);
          return [];
        })
      : Promise.resolve([]),
  ]);
  return { recent, relevant, reflectiveSummary };
}

/**
 * Build a one-line summary of the turn for episodic memory. Cheap, local —
 * we don't burn another API round-trip; the orchestrator's own response
 * via `say` tools is plenty signal for v1.
 */
function summarizeTurn(userMessage: string, assistantContent: Anthropic.ContentBlock[]): string {
  const says = assistantContent
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'say')
    .map((b) => String((b.input as { text?: unknown }).text ?? ''))
    .filter((s) => s.length > 0);
  const angelLine = says.join(' ');
  const userTrim = userMessage.length > 200 ? userMessage.slice(0, 200) + '…' : userMessage;
  if (angelLine) {
    const replyTrim = angelLine.length > 200 ? angelLine.slice(0, 200) + '…' : angelLine;
    return `user said "${userTrim}"; angel replied "${replyTrim}"`;
  }
  return `user said "${userTrim}"; angel reacted (no spoken line)`;
}

/**
 * mirror this turn to convex (orchestratorTurns table) so the unified
 * /admin/timeline can interleave electron with sms/discord/web. fire-and-
 * forget — wrapped in try/catch so observability never breaks the loop.
 */
function mirrorTurnToConvex(args: {
  userId: string;
  turnId: string;
  systemPrompt: string;
  userInput: string;
  assistantContent: Anthropic.ContentBlock[];
  latencyMs: number;
}): void {
  try {
    const says: string[] = [];
    const toolsCalled: Array<{ name: string; input: unknown }> = [];
    for (const block of args.assistantContent) {
      if (block.type === 'tool_use') {
        toolsCalled.push({ name: block.name, input: block.input });
        if (block.name === 'say') {
          const text = (block.input as { text?: unknown })?.text;
          if (typeof text === 'string') says.push(text);
        }
      } else if (block.type === 'text' && block.text.trim()) {
        says.push(block.text.trim());
      }
    }
    const output = says.join(' ');
    const systemPromptHash = createHash('sha1')
      .update(args.systemPrompt)
      .digest('hex')
      .slice(0, 12);
    void logOrchestratorTurn({
      userId: args.userId,
      turnId: args.turnId,
      systemPromptHash,
      systemPromptFull: args.systemPrompt,
      userInput: args.userInput,
      output,
      toolsCalled,
      latencyMs: args.latencyMs,
    }).catch((err) => {
      console.warn('[orchestrator] convex mirror failed:', err);
    });
  } catch (err) {
    console.warn('[orchestrator] mirror prep failed:', err);
  }
}

async function writeTurnMemory(userId: string, userMessage: string, assistantContent: Anthropic.ContentBlock[], turnId: string): Promise<void> {
  if (!_memory) return;
  try {
    await _memory.remember({
      userId,
      type: 'episodic',
      content: summarizeTurn(userMessage, assistantContent),
      timestamp: Date.now(),
      metadata: { sourceTurnId: turnId, source: 'turn' },
    });
  } catch (err) {
    console.warn('[orchestrator] failed to write episodic memory:', err);
  }
}

// rolling per-session history. for hackathon we use a single global session;
// upgrade to keyed-by-windowId if multi-window ever happens.
const history: Anthropic.MessageParam[] = [];
const HISTORY_LIMIT = 20; // last 20 messages — enough for context, cheap to send

function pushHistory(msg: Anthropic.MessageParam): void {
  history.push(msg);
  while (history.length > HISTORY_LIMIT) history.shift();
}

/**
 * Anthropic invariants we have to enforce on every API call:
 *   1. Every assistant message containing `tool_use` blocks MUST be
 *      immediately followed by a user message containing a matching
 *      `tool_result` block for each tool_use id.
 *   2. The history must start with a user message. (Anthropic accepts
 *      assistant-first in some versions, but it's an avoidable footgun.)
 *   3. No `tool_result` block may appear without a matching `tool_use`
 *      block in the *immediately preceding* assistant message. This is
 *      the symmetric failure mode of (1) — orphan tool_results — and is
 *      caused by HISTORY_LIMIT shifting an assistant tool_use off the
 *      front of history while leaving its paired user tool_result behind.
 *
 * Without this guard, the brain falls back to mock forever once `history`
 * gets corrupted, which it inevitably does during long sessions.
 *
 * Two passes:
 *   - Pass 1: walk left-to-right; for any assistant with unpaired
 *     tool_use blocks, splice/extend a synthetic stub tool_result message.
 *   - Pass 2: walk from head; drop or strip any leading message that
 *     would violate the user-first / no-orphan-tool_result rules.
 *
 * Idempotent. Safe to call before every API request.
 */
function repairHistory(): void {
  // Pass 1 — pair up any orphan tool_use blocks with synthetic results.
  let i = 0;
  while (i < history.length) {
    const msg = history[i];
    const content = Array.isArray(msg.content) ? msg.content : null;
    if (msg.role !== 'assistant' || !content) {
      i += 1;
      continue;
    }
    const toolUseIds = content
      .filter((b): b is Anthropic.ToolUseBlock => (b as { type?: string }).type === 'tool_use')
      .map((b) => b.id);
    if (toolUseIds.length === 0) {
      i += 1;
      continue;
    }

    const next = history[i + 1];
    const nextContent = next && Array.isArray(next.content) ? next.content : null;
    const presentResultIds = new Set<string>();
    if (next?.role === 'user' && nextContent) {
      for (const b of nextContent) {
        if ((b as { type?: string }).type === 'tool_result') {
          presentResultIds.add((b as { tool_use_id: string }).tool_use_id);
        }
      }
    }

    const missing = toolUseIds.filter((id) => !presentResultIds.has(id));
    if (missing.length === 0) {
      i += 1;
      continue;
    }

    const stubs = missing.map((id) => ({
      type: 'tool_result' as const,
      tool_use_id: id,
      content: 'ok',
    }));

    if (next?.role === 'user' && nextContent) {
      next.content = [...nextContent, ...stubs];
    } else {
      history.splice(i + 1, 0, { role: 'user', content: stubs });
    }
    console.warn('[orchestrator] repaired orphan tool_use ids:', missing.join(', '));
    i += 1;
  }

  // Pass 2 — fix the head of history. Drop any leading message that
  // can't legally start a conversation, or strip orphan tool_result
  // blocks from the leading user message.
  while (history.length > 0) {
    const first = history[0];
    if (first.role !== 'user') {
      console.warn('[orchestrator] dropping non-user leading message:', first.role);
      history.shift();
      continue;
    }
    if (!Array.isArray(first.content)) break; // plain string content — fine
    const orphans = first.content.filter(
      (b) => (b as { type?: string }).type === 'tool_result',
    );
    if (orphans.length === 0) break;
    const cleaned = first.content.filter(
      (b) => (b as { type?: string }).type !== 'tool_result',
    );
    if (cleaned.length === 0) {
      console.warn(
        '[orchestrator] dropping leading user message containing only orphan tool_results:',
        orphans.length,
      );
      history.shift();
      continue;
    }
    console.warn(
      '[orchestrator] stripping orphan tool_result blocks from leading user message:',
      orphans.length,
    );
    first.content = cleaned;
    break;
  }
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
    case 'come_to_me':
      return {
        id,
        type: 'walk_to_user',
        ...(typeof input.stopDistance === 'number' ? { stopDistance: input.stopDistance } : {}),
        ...(input.speed ? { speed: input.speed as 'slow' | 'normal' | 'urgent' } : {}),
      };
    case 'interact_with':
      return {
        id,
        type: 'interact_with',
        interactableId: String(input.interactableId ?? ''),
        verb: input.verb as InteractableVerb,
        ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
        ...(typeof input.approachLabel === 'string' ? { approachLabel: input.approachLabel } : {}),
      };
    default:
      console.warn('[orchestrator] unknown tool', name);
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* agentic tool execution (delegate / verify)                          */
/* ------------------------------------------------------------------ */

/** Default workspace for delegate(). Picks a sane fixture so the demo never
 *  runs codex against angel itself. Override via ANGEL_DELEGATE_WORKDIR. */
function defaultDelegateWorkingDir(): string {
  const fromEnv = process.env.ANGEL_DELEGATE_WORKDIR?.trim();
  if (fromEnv) return fromEnv;
  // monorepo fallback: <angel>/playground (if present), else cwd.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const candidate = path.resolve(process.cwd(), '../playground');
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    /* ignore */
  }
  return process.cwd();
}

interface AgenticTurnContext {
  /** stdout of the most recent delegate, used by verify('haiku_review') */
  lastDelegateStdout: string;
  /** intent of the most recent delegate, fallback for haiku_review */
  lastDelegateIntent: string;
  /** working dir of the most recent delegate (for tests/build/file_exists) */
  lastDelegateWorkingDir: string;
}

async function executeDelegate(
  args: Record<string, unknown>,
  sender: Sender,
  ctx: AgenticTurnContext,
): Promise<string> {
  const intent = String(args.intent ?? '').trim();
  if (!intent) return JSON.stringify({ ok: false, error: 'delegate needs an intent' });

  const workingDir = defaultDelegateWorkingDir();
  const job = newCodexJob(intent, workingDir);
  const cap = getAgenticCapability();

  // open the desk monitor stream — renderer subscribes to desk:codex_stream
  sender.emitIpc?.('desk:codex_stream', {
    jobId: job.id,
    chunk: `> delegate("${intent}")`,
  });
  if (!cap.codexBinary) {
    sender.emitIpc?.('desk:codex_stream', {
      jobId: job.id,
      chunk: '[admin] codex CLI unavailable — running deterministic mock',
    });
  }

  let result: CodexResult;
  try {
    result = await executeCodex(job, (chunk) => {
      sender.emitIpc?.('desk:codex_stream', { jobId: job.id, chunk });
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    sender.emitIpc?.('desk:codex_stream', {
      jobId: job.id,
      chunk: `[error] delegate threw: ${errMsg}`,
    });
    return JSON.stringify({ ok: false, error: errMsg });
  }

  sender.emitIpc?.('desk:codex_complete', { jobId: job.id, result });

  // remember stdout so verify('haiku_review') can read it
  ctx.lastDelegateStdout = result.stdout;
  ctx.lastDelegateIntent = intent;
  ctx.lastDelegateWorkingDir = workingDir;

  // last 800 chars of stdout — enough signal, light on tokens
  const tail = result.stdout.slice(-800);
  const summary = {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    filesChanged: result.filesChanged,
    mocked: result.mocked,
    tail,
    note:
      result.exitCode === 0
        ? 'delegate finished cleanly. you MUST call verify() before claiming success.'
        : 'delegate exited non-zero. do NOT claim shipped.',
  };
  return JSON.stringify(summary);
}

async function executeVerify(
  args: Record<string, unknown>,
  sender: Sender,
  ctx: AgenticTurnContext,
): Promise<string> {
  const checkKind = String(args.check ?? '');
  const target = args.target;

  let check: VerifyCheck;
  switch (checkKind) {
    case 'tests':
    case 'build':
      check = { kind: checkKind, args: {} };
      break;
    case 'http':
      check = { kind: 'http', args: { url: String(target ?? '') } };
      break;
    case 'file_exists':
      check = { kind: 'file_exists', args: { path: String(target ?? '') } };
      break;
    case 'haiku_review':
      check = {
        kind: 'haiku_review',
        args: {
          intent: String(target ?? ctx.lastDelegateIntent ?? ''),
          stdout: ctx.lastDelegateStdout,
        },
      };
      break;
    default:
      return JSON.stringify({
        ok: false,
        evidence: `unknown check kind: ${checkKind}`,
      });
  }

  const workingDir = ctx.lastDelegateWorkingDir || defaultDelegateWorkingDir();
  let result: VerifyResult;
  try {
    result = await runVerify(check, workingDir);
  } catch (err) {
    result = { ok: false, evidence: `verify threw: ${(err as Error).message}` };
  }
  sender.emitIpc?.('tools:verify_result', {
    check: checkKind,
    ok: result.ok,
    evidence: result.evidence,
  });
  return JSON.stringify({ ok: result.ok, evidence: result.evidence });
}

/* ------------------------------------------------------------------ */
/* brain tools — recall_memory, recall_recent, know                    */
/* her active memory layer. uses the AngelMemory adapter (nia or local) */
/* ------------------------------------------------------------------ */

async function executeBrainTool(
  name: 'recall_memory' | 'recall_recent' | 'know',
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const memory = getInjectedMemory();
  if (!memory) {
    return JSON.stringify({ ok: false, error: 'no memory adapter wired' });
  }

  try {
    if (name === 'recall_memory') {
      const query = String(args.query ?? '').trim();
      const limit = Math.min(Math.max(Number(args.limit ?? 4), 1), 10);
      if (!query) return JSON.stringify({ ok: false, error: 'empty query' });
      const entries = await memory.relevantSemantic(query, limit);
      return JSON.stringify({
        ok: true,
        query,
        results: entries.map((e) => ({
          type: e.type,
          content: e.content,
          ageMs: Date.now() - e.timestamp,
          ageLabel: ageLabel(Date.now() - e.timestamp),
        })),
      });
    }

    if (name === 'recall_recent') {
      const n = Math.min(Math.max(Number(args.n ?? 5), 1), 12);
      const entries = await memory.recentEpisodic(n);
      return JSON.stringify({
        ok: true,
        results: entries.map((e) => ({
          type: e.type,
          content: e.content,
          ageMs: Date.now() - e.timestamp,
          ageLabel: ageLabel(Date.now() - e.timestamp),
        })),
      });
    }

    if (name === 'know') {
      const fact = String(args.fact ?? '').trim();
      const kind = (String(args.kind ?? 'preference') === 'semantic'
        ? 'semantic'
        : 'preference') as 'preference' | 'semantic';
      if (!fact) return JSON.stringify({ ok: false, error: 'empty fact' });
      const entry = await memory.remember({
        userId,
        type: kind,
        content: fact,
        timestamp: Date.now(),
        metadata: { source: 'observation', confidence: 0.85 },
      });
      return JSON.stringify({
        ok: true,
        stored: { id: entry.id, type: entry.type, content: entry.content },
      });
    }

    return JSON.stringify({ ok: false, error: `unknown brain tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

function ageLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ------------------------------------------------------------------ */
/* local-context tools — read_file / list_files / git_* / run_shell    */
/* she can look at the user's actual machine, ground responses in real */
/* current work state. tenzin-style local awareness.                   */
/* ------------------------------------------------------------------ */

import { promisify } from 'node:util';
import { execFile as _execFile } from 'node:child_process';
import { exec as _exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
const execFile = promisify(_execFile);
const exec = promisify(_exec);

/** Resolve the user's project root. ANGEL_PROJECT_ROOT > cwd. */
function projectRoot(): string {
  const env = process.env.ANGEL_PROJECT_ROOT?.trim();
  return env || process.cwd();
}

/** Truncate any long output for tool_result. claude doesn't need megabytes. */
function truncate(s: string, max = 6000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n…[truncated ${s.length - max} chars]`;
}

/** Resolve a relative path within the project root, refuse anything escaping it. */
function safePath(rel: string): string {
  const root = projectRoot();
  const resolved = path.resolve(root, rel);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`path escapes project root: ${rel}`);
  }
  return resolved;
}

/** Whitelist of safe shell command prefixes. */
const SHELL_WHITELIST = [
  /^git\s/,
  /^ls(\s|$)/,
  /^cat\s/,
  /^grep\s/,
  /^rg\s/,
  /^find\s/,
  /^bun\s+run\s/,
  /^npm\s+(test|run)\s/,
  /^vercel(\s|$)/,
  /^gh\s/,
  /^wc\s/,
  /^head\s/,
  /^tail\s/,
  /^pwd$/,
  /^echo\s/,
];

/** Block list takes precedence — these are never allowed even in run_shell. */
const SHELL_DENY = [
  /\brm\b/,
  /\bsudo\b/,
  /\bmv\b/,
  /\bdd\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bcurl\b.*\|.*sh/,
  /\bwget\b.*\|.*sh/,
  />\s*\/dev/,
  /\bkill\b/,
  /\b(eval|source)\b/,
];

async function executeLocalTool(
  name:
    | 'read_file'
    | 'list_files'
    | 'git_status'
    | 'git_log'
    | 'run_shell'
    | 'recent_files',
  args: Record<string, unknown>,
): Promise<string> {
  try {
    const root = projectRoot();
    if (name === 'read_file') {
      const rel = String(args.path ?? '');
      if (!rel) return JSON.stringify({ ok: false, error: 'empty path' });
      const full = safePath(rel);
      const stat = await fs.stat(full);
      if (!stat.isFile()) return JSON.stringify({ ok: false, error: 'not a file' });
      const data = await fs.readFile(full, 'utf-8');
      return JSON.stringify({
        ok: true,
        path: rel,
        bytes: data.length,
        content: truncate(data, 6000),
      });
    }

    if (name === 'list_files') {
      const rel = String(args.path ?? '.');
      const full = safePath(rel);
      const entries = await fs.readdir(full, { withFileTypes: true });
      const pattern = String(args.pattern ?? '');
      let names = entries
        .filter((e) => !e.name.startsWith('.') || ['.env.local', '.gitignore'].includes(e.name))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      if (pattern) {
        // simple glob-ish: convert *.ts → /\.ts$/
        const re = new RegExp(
          '^' +
            pattern
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*\*/g, '.*')
              .replace(/\*/g, '[^/]*') +
            '$',
        );
        names = names.filter((n) => re.test(n));
      }
      return JSON.stringify({
        ok: true,
        path: rel,
        count: names.length,
        files: names.slice(0, 50),
      });
    }

    if (name === 'git_status') {
      const { stdout: branch } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).catch(() => ({ stdout: '' }));
      const { stdout: status } = await execFile('git', ['status', '--porcelain'], { cwd: root });
      const lines = status.trim().split('\n').filter(Boolean);
      const modified = lines.filter((l) => /^\s*M/.test(l)).map((l) => l.slice(3));
      const untracked = lines.filter((l) => /^\?\?/.test(l)).map((l) => l.slice(3));
      const staged = lines.filter((l) => /^[MADRCU]/.test(l)).map((l) => l.slice(3));
      return JSON.stringify({
        ok: true,
        branch: branch.trim() || 'unknown',
        clean: lines.length === 0,
        modified: modified.slice(0, 30),
        untracked: untracked.slice(0, 30),
        staged: staged.slice(0, 30),
      });
    }

    if (name === 'git_log') {
      const n = Math.min(Math.max(Number(args.n ?? 5), 1), 20);
      const { stdout } = await execFile(
        'git',
        ['log', `-${n}`, '--pretty=format:%h|%cr|%s|%an'],
        { cwd: root },
      );
      const commits = stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, age, subject, author] = line.split('|');
          return { hash, age, subject, author };
        });
      return JSON.stringify({ ok: true, count: commits.length, commits });
    }

    if (name === 'run_shell') {
      const cmd = String(args.cmd ?? '').trim();
      if (!cmd) return JSON.stringify({ ok: false, error: 'empty cmd' });
      const allowed = SHELL_WHITELIST.some((re) => re.test(cmd));
      const denied = SHELL_DENY.some((re) => re.test(cmd));
      if (denied || !allowed) {
        return JSON.stringify({
          ok: false,
          error: `command refused (whitelist): ${cmd}`,
        });
      }
      try {
        const { stdout, stderr } = await exec(cmd, {
          cwd: root,
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
        });
        return JSON.stringify({
          ok: true,
          cmd,
          stdout: truncate(stdout || '', 4000),
          stderr: stderr ? truncate(stderr, 1500) : '',
        });
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return JSON.stringify({
          ok: false,
          error: e.message ?? 'shell error',
          stdout: e.stdout ? truncate(e.stdout, 1500) : '',
          stderr: e.stderr ? truncate(e.stderr, 1500) : '',
        });
      }
    }

    if (name === 'recent_files') {
      const n = Math.min(Math.max(Number(args.n ?? 8), 1), 20);
      // walk top-level; bias toward source dirs
      const skip = new Set(['node_modules', '.git', '.next', 'dist', 'out', '.vercel', '.turbo']);
      const out: Array<{ path: string; mtimeMs: number; mtimeAge: string }> = [];
      async function walk(dir: string, depth = 0) {
        if (depth > 6) return;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (skip.has(e.name) || e.name.startsWith('.git')) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) await walk(full, depth + 1);
          else if (e.isFile()) {
            try {
              const stat = await fs.stat(full);
              out.push({
                path: path.relative(root, full),
                mtimeMs: stat.mtimeMs,
                mtimeAge: ageLabel(Date.now() - stat.mtimeMs),
              });
            } catch {
              /* skip stat failures */
            }
          }
        }
      }
      await walk(root);
      out.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return JSON.stringify({
        ok: true,
        count: out.length,
        files: out.slice(0, n).map(({ path: p, mtimeAge }) => ({ path: p, mtimeAge })),
      });
    }

    return JSON.stringify({ ok: false, error: `unknown local tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ ok: false, error: (err as Error).message });
  }
}

/** Drive the brain. Pumps tools sequentially with small natural delays so
 *  speak/walk feel embodied (not all-at-once burst). */
export async function runOrchestrator(input: {
  text: string;
  send: Sender['send'];
  sendChat: Sender['sendChat'];
  sendState: Sender['sendState'];
  emitIpc?: IpcEmit;
  userId?: string;
}): Promise<void> {
  const userId = input.userId ?? 'stephen';
  const mode = llmMode();
  if (mode === 'none') {
    console.warn(
      '[orchestrator] no llm transport (no ANTHROPIC_API_KEY, no CONVEX_URL) — falling back to mock',
    );
    const { runMockOrchestrator } = await import('./mock');
    runMockOrchestrator(input);
    // even in mock mode we record the turn so memory accumulates
    void writeTurnMemory(userId, input.text, [], randomUUID());
    return;
  }
  if (mode === 'convex') {
    console.log('[orchestrator] using convex proxy for claude calls (no local ANTHROPIC_API_KEY)');
  }

  // Gather memory BEFORE the model call so the system prompt has it.
  const memCtx = await gatherMemoryContext(input.text);
  const turnId = randomUUID();
  const turnStart = Date.now();
  const builtSystemPrompt = buildSystemPrompt(memCtx);

  // bundle the renderer-facing emitters so agentic tools can stream out-of-band
  const sender: Sender = {
    send: input.send,
    sendChat: input.sendChat,
    sendState: input.sendState,
    emitIpc: input.emitIpc,
  };
  const agenticCtx: AgenticTurnContext = {
    lastDelegateStdout: '',
    lastDelegateIntent: '',
    lastDelegateWorkingDir: '',
  };

  // self-heal any prior turn that exited mid-tool-use; otherwise the
  // append below would create an invalid messages[] (orphan tool_use → 400).
  repairHistory();
  // snapshot history depth so we can roll back cleanly if the turn errors
  // mid-flight — otherwise we'd leave half-finished tool_use chains and
  // a stale user message that pollutes the next turn.
  const historyDepth = history.length;
  pushHistory({ role: 'user', content: input.text });

  try {
    let turn = 0;
    let lastAssistantContent: Anthropic.ContentBlock[] = [];
    while (turn < 6) {
      // safety bound on tool-call loops — bumped from 4 → 6 to fit the
      // delegate → verify → say chain.
      turn += 1;
      const resp = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: builtSystemPrompt,
        tools: TOOLS,
        messages: history,
      });

      // emit each tool_use block as a scene action; collect tool_result stubs
      const toolResults: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
      }> = [];
      let textBudget = '';
      // collect the agentic calls so we can run them after we've shipped
      // all the embodiment side-effects (typing animation kicks off first,
      // then real codex runs underneath).
      const agenticJobs: Array<{
        id: string;
        name: 'delegate' | 'verify';
        input: Record<string, unknown>;
      }> = [];

      for (const block of resp.content) {
        if (block.type === 'text') {
          textBudget += block.text;
        } else if (block.type === 'tool_use') {
          const blockInput = (block.input ?? {}) as Record<string, unknown>;
          if (block.name === 'delegate' || block.name === 'verify') {
            agenticJobs.push({
              id: block.id,
              name: block.name,
              input: blockInput,
            });
            continue;
          }
          // brain tools — synchronous, push tool_result with payload right here
          if (block.name === 'recall_memory' || block.name === 'recall_recent' || block.name === 'know') {
            const content = await executeBrainTool(block.name, blockInput, userId);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content,
            });
            continue;
          }
          // local-context tools — she can look at the user's actual machine
          if (
            block.name === 'read_file' ||
            block.name === 'list_files' ||
            block.name === 'git_status' ||
            block.name === 'git_log' ||
            block.name === 'run_shell' ||
            block.name === 'recent_files'
          ) {
            const content = await executeLocalTool(block.name, blockInput);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content,
            });
            continue;
          }
          // host superpowers — full machine access. find/open files, urls,
          // apps; web fetch; applescript; screenshot; clipboard; bash
          // unsandboxed; python/node exec; propose_skill (recursive self-
          // improvement). single dispatch table in tools/host-superpowers.ts.
          if (HOST_SUPERPOWER_NAMES.has(block.name)) {
            const content = await executeHostSuperpower(block.name, blockInput);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content,
            });
            // bump skill telemetry on every active-skill invocation. cheap.
            if (block.name === 'propose_skill') {
              // proposal — no use_count bump (it's a NEW skill, not a use)
            } else {
              // we don't know which skill she "used" from a tool call; the
              // skills are advisory in the system prompt. recordSkillUse is
              // called only when she explicitly references a skill in say()
              // — that's a future hook. ignore for now.
            }
            continue;
          }
          const action = toolUseToSceneAction(block.name, blockInput);
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

      // run agentic tools (delegate/verify) sequentially. each produces a
      // structured tool_result the model gets to read on the next turn.
      for (const job of agenticJobs) {
        const content =
          job.name === 'delegate'
            ? await executeDelegate(job.input, sender, agenticCtx)
            : await executeVerify(job.input, sender, agenticCtx);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: job.id,
          content,
        });
      }

      // record this turn into history
      pushHistory({ role: 'assistant', content: resp.content });
      lastAssistantContent = resp.content as Anthropic.ContentBlock[];

      // CRITICAL: if the model emitted any tool_use blocks, the very next
      // history message MUST contain matching tool_results — even if we're
      // about to break out of the tool-call loop. Otherwise a future user
      // turn replays the assistant message with orphan tool_use blocks and
      // Anthropic returns HTTP 400 ("tool_use ids were found without
      // tool_result blocks immediately after"). This used to be gated on
      // stop_reason === 'tool_use' which is too narrow — end_turn /
      // max_tokens responses also frequently include tool_use blocks.
      if (toolResults.length > 0) {
        pushHistory({ role: 'user', content: toolResults });
      }

      // if the model wants to react to tool results (chain a follow-up),
      // keep looping. Otherwise we're done with this turn.
      if (resp.stop_reason === 'tool_use' && toolResults.length > 0) {
        continue;
      }
      // surface any naked text the model emitted (rare — system prompt forbids)
      if (textBudget.trim()) {
        const id = randomUUID();
        input.sendChat({ id, text: textBudget.trim(), done: true });
      }
      break;
    }
    // write episodic memory after the model is done — non-blocking
    void writeTurnMemory(userId, input.text, lastAssistantContent, turnId);
    // mirror the turn into convex.orchestratorTurns so /admin/timeline
    // can interleave it with sms / discord / web rows. fire-and-forget.
    mirrorTurnToConvex({
      userId,
      turnId,
      systemPrompt: builtSystemPrompt,
      userInput: input.text,
      assistantContent: lastAssistantContent,
      latencyMs: Date.now() - turnStart,
    });
  } catch (err) {
    console.error('[orchestrator] anthropic call failed', err);
    // roll history back to the state we entered with so the next user
    // turn isn't crippled by a half-finished tool_use chain or a stale
    // unanswered user message.
    history.length = historyDepth;
    // surface failure as a system chat line and a soft spoken fallback
    input.sendChat({ id: randomUUID(), text: '(angel: brain hiccup — falling back)', done: true });
    const { runMockOrchestrator } = await import('./mock');
    runMockOrchestrator(input);
  }
}

/* ------------------------------------------------------------------ */
/* boot greeting — replaces mock.bootAutonomyBeat when key+memory live */
/* ------------------------------------------------------------------ */

/**
 * Boot greeting that pulls memory and lets Claude weave the callback line
 * itself ("...how'd that portfolio thing land?" emerges from the memory
 * block, NOT from a hardcoded string). Falls back to the mock greeting
 * when ANTHROPIC_API_KEY is missing.
 */
export async function runBootGreeting(input: {
  send: Sender['send'];
  sendChat: Sender['sendChat'];
  sendState: Sender['sendState'];
  userId?: string;
}): Promise<void> {
  if (llmMode() === 'none') {
    const { bootAutonomyBeat } = await import('./mock');
    return bootAutonomyBeat(input);
  }
  // boot-greeting primer is now TIME-AWARE:
  //   - recordBoot() bumps sessionCount + returns the previous lifecycle state
  //   - selectBootGreetingIntent() picks a gist based on the gap since
  //     lastSeenAt (just_closed / short_break / few_hours / same_day / days /
  //     weeks / long_absence / first_boot)
  //   - claude rewrites the gist in HER voice
  //   - we still ban inventing "while you were away" activity — only
  //     reference what's in the memory block (real Nia recall)
  const priorLifecycle = recordBoot();
  ensureSkillsDirs();
  const sStatus = skillsStatus();
  const greeting = selectBootGreetingIntent({
    priorLastSeenAt: priorLifecycle.lastSeenAt,
    pendingSkillsCount: sStatus.proposed,
  });
  const contextBlock = greeting.context ? `\n\ncontext (use sparingly, never invent):\n${greeting.context}` : '';
  const primer =
    `${greeting.intent}${contextBlock}\n\n` +
    "rules: one short line in your voice, that's it. if (and only if) something specific in the memory block above feels worth bringing up right now, weave it in naturally. NEVER invent things you supposedly did 'while they were away' — you didn't do anything, you were off. NEVER mention specific repos, commits, projects, or events that aren't already in your memory block.";
  console.log(
    `[runBootGreeting] bucket=${greeting.bucket} gap=${humanizeGap(greeting.gapMs)} ` +
      `session#${priorLifecycle.sessionCount + 1} pendingSkills=${sStatus.proposed} ` +
      `activeSkills=${sStatus.active}`,
  );
  // No biased semantic seed — let the memory block reflect whatever is
  // actually in Nia (recent episodic + reflective summary). If recall is
  // empty, she just says hi (in the gap-appropriate voice) and stops.
  const memCtx = await gatherMemoryContext('');
  const turnId = randomUUID();
  const turnStart = Date.now();
  const builtSystemPrompt = buildSystemPrompt(memCtx);
  try {
    const resp = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: builtSystemPrompt,
      tools: TOOLS,
      messages: [{ role: 'user', content: primer }],
    });
    const toolUseIds: string[] = [];
    for (const block of resp.content) {
      if (block.type === 'tool_use') {
        toolUseIds.push(block.id);
        // route brain tools (recall_memory, recall_recent, know) and
        // local-context tools (read_file, etc.) the same way the main
        // orchestrator loop does — toolUseToSceneAction is *only* for
        // embodiment actions, and falling through there would log
        // "[orchestrator] unknown tool ..." for every memory call.
        const isBrainTool =
          block.name === 'recall_memory' || block.name === 'recall_recent' || block.name === 'know';
        const isLocalTool =
          block.name === 'read_file' ||
          block.name === 'list_files' ||
          block.name === 'git_status' ||
          block.name === 'git_log' ||
          block.name === 'run_shell' ||
          block.name === 'recent_files';
        const isHostSuperpower = HOST_SUPERPOWER_NAMES.has(block.name);
        if (isBrainTool || isLocalTool || isHostSuperpower) continue; // execution skipped — boot greeting is one-shot
        const action = toolUseToSceneAction(block.name, (block.input ?? {}) as Record<string, unknown>);
        if (action) input.send(action);
      }
    }
    // seed rolling history so subsequent user turns have continuity. Every
    // tool_use block must be paired with a tool_result in the next message
    // (Anthropic invariant) — otherwise the first real user turn would
    // ship an invalid messages[] and 400.
    pushHistory({ role: 'user', content: primer });
    pushHistory({ role: 'assistant', content: resp.content });
    if (toolUseIds.length > 0) {
      pushHistory({
        role: 'user',
        content: toolUseIds.map((id) => ({
          type: 'tool_result' as const,
          tool_use_id: id,
          content: 'ok',
        })),
      });
    }
    void writeTurnMemory(
      input.userId ?? 'stephen',
      '<boot greeting>',
      resp.content as Anthropic.ContentBlock[],
      turnId,
    );
    // mirror the boot greeting into convex.orchestratorTurns too so the
    // unified /admin/timeline picks up the wake-up beat as the first
    // electron row of the session.
    mirrorTurnToConvex({
      userId: input.userId ?? 'stephen',
      turnId,
      systemPrompt: builtSystemPrompt,
      userInput: '<boot greeting>',
      assistantContent: resp.content as Anthropic.ContentBlock[],
      latencyMs: Date.now() - turnStart,
    });
  } catch (err) {
    console.error('[orchestrator] boot greeting failed, falling back to mock:', err);
    const { bootAutonomyBeat } = await import('./mock');
    return bootAutonomyBeat(input);
  }
}
