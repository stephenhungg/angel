# tool registry

## tool definitions (orchestrator)

### communication

#### `say(text, emotion)`
what she says aloud (subtitle + animalese).
- `text: string` — natural language, kept short
- `emotion: enum` — happy | neutral | thinking | excited | smug | soft | focused

renderer effect: subtitle reveals char-by-char with animalese blips, mouth pulses, face blendshape sets to emotion preset.

### embodiment

#### `walkTo(waypoint)`
move avatar to a named waypoint.
- `waypoint: enum` — desk | couch | window | door | center

renderer effect: walk anim plays, position lerps over time, emits `arrived` event on completion. orchestrator waits for `arrived` before chaining tools that depend on location.

#### `expression(face)`
override face blendshape independent of emotion.
- `face: enum` — smile | smirk | wink | concentrate | surprise | yawn | nod

#### `react(emotion)`
update emotion state without speaking. ambient mood shift.
- `emotion: enum` — same set as say()

writes to convex.emotion → renderer subscribes.

### execution

#### `delegate(task_intent, repo?)`
hand off coding work to codex executor.
- `task_intent: string` — natural-language description of what to do
- `repo: string?` — optional repo path; defaults to user's current project

flow:
1. task translator (haiku) converts intent → clean codex prompt with repo context
2. main process spawns `codex exec` headless
3. stdout streams via local ws → renderer monitor
4. on completion, verifier reality-checks
5. orchestrator gets `{success, evidence}` and narrates outcome

returns: `{ task_id, success, evidence, output_summary }`

#### `browse(intent)`
delegate browser work to playwright agent.
- `intent: string` — natural-language description of web task

flow:
1. browser executor (playwright mcp or browserbase) handles the intent
2. screenshot stream → renderer can show on monitor
3. verifier checks expected outcome

returns: `{ success, screenshots, extracted_data? }`

#### `parallel(tasks[])`  *(v1 stretch goal — only if time permits)*
run multiple delegate tasks in parallel via git worktrees.
- `tasks: { intent, repo }[]`

flow:
1. main creates N worktrees from base branch
2. spawns N codex instances, each on its own worktree
3. each streams to a separate monitor in the room (3 monitors on the desk)
4. all complete → merge results

returns: `{ results: TaskResult[] }`

#### `deploy(target)`
trigger deploy via api.
- `target: enum` — vercel | fly | render

flow:
1. main calls deploy api with auth
2. polls until live url returns 200
3. opens in-world browser plane to live url

returns: `{ url, status }`

### memory

#### `remember(fact, type?)`
write to long-term memory (nia).
- `fact: string` — what to remember
- `type: enum?` — episodic | semantic | preference (default: episodic)

batched: orchestrator emits these freely, main flushes to nia every 30s.

#### `recall(query)`
retrieve from memory.
- `query: string` — natural-language query

returns top-k matches from nia. usually triggered implicitly via system prompt's `recent_memory` injection, but tool exposed for explicit lookup.

### environment

#### `inspectRoom(target?)`
look at something in the room.
- `target: string?` — what to focus on (e.g., "desk", "the photo on the wall")

returns: description of what's in view. for ambient observations like "your guitar's been in the corner for a week."

#### `nudgeVector(delta)`  *(v1 stretch goal)*
update persona vector based on implicit feedback.
- `delta: vector(768)` — small nudge

writes to convex, triggers (faked-for-demo) outfit/aesthetic shift.

## tool selection logic

orchestrator decides which tools to call based on user input + state. rough heuristics in system prompt:

- **user asks for code/deploy work** → `delegate` (always with `say` first to narrate)
- **user asks to look something up online** → `browse`
- **user shares info worth keeping** → `remember`
- **user enters room or starts conversation** → `react` to set mood, optionally `say` greeting
- **user assigns task that needs location** → `say` ack → `walkTo` → wait for arrived → `delegate`

## sequencing rules

1. `say` is sync from orchestrator's perspective — fires animalese + subtitle, returns immediately
2. `walkTo` is async — emits `arrived` event when complete; orchestrator should not chain dependent tools until arrived
3. `delegate` is async with progress — streams stdout over ws, completes minutes later
4. multiple `say` calls in one turn are allowed but discouraged; prefer one rich utterance
5. `react` can be combined with `say` (emotion sets face during say's subtitle reveal)

## error handling

every tool returns `{ success: bool, error?: string }`. orchestrator must handle errors gracefully:
- if `delegate` fails, narrate the failure honestly ("hmm, that didn't work — wanna look at the error together?")
- if `browse` fails, fall back to `delegate` w/ scraping intent
- if `walkTo` fails (waypoint blocked), stay put and acknowledge ("oh, can't quite get there")

**never narrate success on failure.** soul anchor invariant #2.

## tool registry as data

orchestrator's system prompt loads this file as the source of truth. updates here propagate. v2 will read this dynamically; v1 hardcodes at startup.
