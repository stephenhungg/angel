# ANGEL — Build Context (Matthew's Lane)

> Single source of truth for the embodied agent layer. Read top-to-bottom on day one. Reference sections as needed during build.

---

## 1. THE PROJECT IN ONE PARAGRAPH

Angel is a preference-learning UX for personal AI agents that replaces prompt-box onboarding with evolutionary swiping. Users move through three rounds of generated companion archetypes; every choice updates a centroid in embedding space until the principal component of their taste converges into a stable persona vector. That vector instantiates an embodied agent: a VRM avatar living in a first-person 3D room with memory (Nia), real-time emotional state (Convex), and a tool-calling action vocabulary that lets her actually walk to the desk, sit down, and start working when given a task. Every interaction nudges the persona vector further, so the agent visibly evolves. **Thesis:** the missing primitive for personal agents isn't smarter models, it's implicit, embodied, continuously re-aligned identity.

**One-liner:** Tinder for agent alignment. Tamagotchi for agent retention.

---

## 2. ARCHITECTURE OVERVIEW

Two surfaces: webapp (cold-start) → electron app (warm presence).

```
[Web — vercel]                    [Electron — user's machine]
landing + swipe + vector  ─────►  pair via claim token
                                  loads vrm + room
                                  agent loop (codex/claude in main)
                                  computer use (fs/shell/playwright)
                                  ↕
                                [Convex — realtime state]
                                [Nia — memory/context]
```

**Stephen owns:** webapp + agent backend + convex + nia
**Matthew owns:** electron shell + r3f room + vrm avatar + scene action runner + chat overlay
**Shared contracts:** scene action vocabulary + claim token

---

## 3. YOUR LANE — what you're building

### 3.1 The electron app

- frameless desktop window, single page
- main process:
  - registers `angel://` protocol handler (deep link from web claim)
  - on launch with token: hits convex → fetches persona record → caches
  - spawns codex / claude-code subprocess for agent loop
  - exposes IPC for scene actions, chat tokens, state updates
  - has full fs/shell/playwright access (user's local machine)
- renderer process (r3f scene + ui):
  - loads vrm + room glb
  - runs animation mixer
  - consumes scene actions from IPC
  - renders chat overlay + state bars
  - sends user input → IPC → main → agent loop

### 3.2 The 3D room

- single glb scene (sketchfab/booth.pm, anime-styled bedroom or apartment)
- in blender, add named empties as anchors:
  - `Anchor_Desk_Sit`, `Anchor_Desk_Stand`
  - `Anchor_Bookshelf`
  - `Anchor_Window`
  - `Anchor_Couch_Sit`, `Anchor_Couch_Stand`
  - `Anchor_Door`
  - `Anchor_Center` (default idle position)
- export glb with anchors preserved
- r3f loads it, raycaster on named meshes for click interaction
- desk lamp emissive material for "focused" mood toggle

### 3.3 The VRM avatar

- loaded via `@pixiv/three-vrm`
- standardized humanoid skeleton (51 bones)
- blend shapes for expressions: `joy`, `angry`, `sad`, `relaxed`, `surprised`, `blink`, `aa/ih/ou/ee/oh` (lipsync)
- spring bones for hair/cloth physics (auto-handled by lib)
- animation library:
  - mixamo `.fbx` clips downloaded for: `walking`, `idle`, `sitting`, `typing`, `reading`, `wave`, `thinking`
  - retarget mixamo bones → vrm humanoid bones (use `three-vrm-animation-mixamo` or write 30-line remap)
  - play via `THREE.AnimationMixer`
- procedural overlays:
  - blink loop (2-5sec random interval)
  - look-at-camera when user is close
  - subtle breathing (chest scale oscillation)
  - mouth opens proportional to TTS audio amplitude

### 3.4 The scene action runner

- subscribes to IPC `scene:action` events
- maintains action queue; processes sequentially
- each action either:
  - updates avatar transform (lerp position/rotation)
  - triggers animation clip (with crossfade)
  - updates state (mood, energy, currentTask, etc.)
- emits `action:complete` events back to main → agent gets to know what happened

### 3.5 Chat overlay + state UI

- speech bubble above avatar's head when she speaks (subtitle text + audio if TTS)
- bottom-right state bars: mood, energy, trust
- top input field: "say something..." (also support voice via webrtc → whisper)
- system tray icon: stays alive when window closes
- always-on-top toggle

---

## 4. SCENE ACTION VOCABULARY (the contract)

Lock this down with Stephen — both sides code against it. Add new actions only by mutual agreement.

```ts
type AnchorId =
  | 'desk_sit' | 'desk_stand'
  | 'bookshelf' | 'window'
  | 'couch_sit' | 'couch_stand'
  | 'door' | 'center'

type Emotion = 'neutral' | 'happy' | 'focused' | 'curious' | 'concerned' | 'excited'

type SceneAction =
  | { id: string; type: 'walk_to'; anchor: AnchorId; speed?: 'slow' | 'normal' | 'urgent' }
  | { id: string; type: 'sit_at'; anchor: AnchorId }
  | { id: string; type: 'stand' }
  | { id: string; type: 'play_clip'; clip: 'typing' | 'reading' | 'thinking' | 'wave' | 'idle'; loop?: boolean; durationMs?: number }
  | { id: string; type: 'face'; target: 'user' | AnchorId }
  | { id: string; type: 'speak'; text: string; emotion?: Emotion }
  | { id: string; type: 'set_state'; mood?: string; energy?: number; trust?: number; currentTask?: string | null }
  | { id: string; type: 'set_expression'; expression: string; weight: number; durationMs?: number }
  | { id: string; type: 'delegate'; taskId: string; summary: string }   // hand off to worker, sit at desk
  | { id: string; type: 'wait'; ms: number }
  | { id: string; type: 'cancel_queue' }                                 // user interrupted, drop pending
```

**Rules:**
- every action has unique `id` (uuid). when complete, emit `action:complete` with same id.
- `walk_to` → r3f computes path (just lerp for hackathon), plays walk clip during, idle/sit on arrival
- `delegate` → walk to desk_sit, sit, play typing loop until task completes externally
- `cancel_queue` → drop all pending; play idle; turn to face user

---

## 5. CLAIM TOKEN CONTRACT (web → electron)

```ts
// payload
{
  userId: string
  vrmId: string          // which avatar to load
  paletteHex: string     // accent color for ui
  name: string           // her name
  axes: {                // for system prompt + ui display
    warmth: number, agency: number, chaos: number,
    humor: number, directness: number, ambition: number
  }
  expiresAt: number      // unix ms, 5min ttl
}

// signed jwt with shared HS256 secret in .env (JWT_SECRET)
// passed via deep link: angel://claim?token=<jwt>
```

On launch, electron:
1. parses token from `process.argv` or `app.on('open-url')`
2. verifies signature + expiry
3. fetches full persona record from convex by userId
4. caches locally in `app.getPath('userData')/persona.json`
5. loads vrm, applies palette, displays name in titlebar

---

## 6. FILE STRUCTURE — actual monorepo (already scaffolded)

```
angel/                                 # repo root
├── package.json                       # bun workspaces root
├── .env.example                       # all required env vars listed
├── README.md                          # github landing
│
├── web/                               # next.js — landing + swipe (stephen)
│   ├── src/                           #   app router pages, components
│   ├── public/archetypes/             #   archetype reference images
│   └── package.json
│
├── desktop/                           # electron app (your lane is mostly here)
│   ├── electron/                      # main process (stephen)
│   │   ├── main.ts                    #   window creation, ipc, agent spawn
│   │   ├── preload.ts                 #   contextBridge → window.angel.*
│   │   ├── agent/
│   │   │   ├── runner.ts              #   sonnet 4.6 orchestrator loop
│   │   │   ├── prompt.ts              #   system prompt builder
│   │   │   ├── tools.ts               #   tool defs (typed via @angel/shared)
│   │   │   └── parser.ts              #   structured output extraction
│   │   ├── tools/
│   │   │   ├── codex.ts               #   spawn codex exec, stream stdout
│   │   │   ├── playwright.ts          #   browser automation
│   │   │   ├── verifier.ts            #   reality-checks tool outputs
│   │   │   ├── shell.ts               #   child_process exec
│   │   │   └── fs.ts                  #   file ops
│   │   └── persona/
│   │       └── claim.ts               #   token verify + convex fetch
│   │
│   ├── src/                           # renderer (YOUR PRIMARY LANE)
│   │   ├── App.tsx
│   │   ├── main.tsx                   #   react entry
│   │   ├── components/
│   │   │   ├── Scene.tsx              #   <Canvas> + lights + camera
│   │   │   ├── Room.tsx               #   glb loader, exposes anchors
│   │   │   ├── Avatar.tsx             #   vrm + animation mixer
│   │   │   ├── ActionRunner.tsx       #   consumes ipc scene actions
│   │   │   ├── ChatOverlay.tsx        #   speech bubble + input
│   │   │   └── StateBars.tsx          #   mood/energy/trust
│   │   ├── lib/
│   │   │   ├── ipc.ts                 #   typed wrapper around window.angel
│   │   │   ├── vrm-load.ts            #   vrm loader helper
│   │   │   ├── retarget.ts            #   mixamo bone → vrm humanoid bone
│   │   │   ├── expressions.ts         #   blink, lipsync, look-at
│   │   │   └── anchors.ts             #   anchor name → world position
│   │   └── stores/
│   │       └── angel.ts               #   zustand: persona, queue, chat
│   │
│   ├── public/
│   │   ├── room.glb                   #   sketchfab room (you place this)
│   │   ├── vrm/                       #   vroid avatars (one per archetype)
│   │   └── animations/                #   mixamo .fbx clips
│   │
│   └── package.json
│
├── convex/                            # realtime spine (stephen)
│   ├── schema.ts                      #   tables — see CONVEX_SCHEMA.md
│   ├── users.ts agentState.ts tasks.ts turns.ts evolution.ts memory.ts
│   ├── crons.ts                       #   scheduled bg jobs (always-on track!)
│   └── package.json
│
├── shared/                            # ⚠️ THE CONTRACT (both, coordinate first)
│   ├── src/
│   │   ├── scene.ts                   #   SceneAction, AnchorId, Emotion, etc.
│   │   ├── persona.ts                 #   PersonaTraits, archetype enums
│   │   ├── claim.ts                   #   ClaimTokenPayload (jwt shape)
│   │   ├── agent.ts                   #   AgentState, ToolCall, MemoryEntry
│   │   └── index.ts
│   ├── tsconfig.json
│   └── package.json
│
└── docs/                              # all design + planning docs
    ├── HACKATHON.md ARCHITECTURE.md DEMO.md BUILD_PLAN.md ...
    └── (this file)
```

**important:** import shared types in your files as `@angel/shared`:
```ts
import type { SceneAction, AnchorId, Emotion } from '@angel/shared';
```

---

## 7. INSTALL — already done by stephen, you just clone

```bash
git clone https://github.com/stephenhungg/angel.git
cd angel
bun install                    # installs all workspaces
cp .env.example .env.local     # fill JWT_SECRET (ask stephen) + ANTHROPIC_API_KEY etc.
bun run dev:desktop            # spin up your lane (electron + vite hot reload)
```

deps already declared in `desktop/package.json`:
- 3d: `three @react-three/fiber @react-three/drei @pixiv/three-vrm @pixiv/three-vrm-animation`
- state: `zustand`
- realtime: `convex`
- agent: `@anthropic-ai/sdk openai playwright`
- auth: `jsonwebtoken`
- electron toolchain: `electron electron-builder electron-vite vite`

run `bun install` and they're all there. don't re-add deps unless you need a new one.

### auth
```bash
bun add jsonwebtoken
bun add -D @types/jsonwebtoken
```

### content tools (NOT npm — desktop apps)
- VRoid Studio (https://vroid.com/studio) — make/customize avatars
- Blender 3.6 LTS (https://blender.org) — add anchor empties to glb
- Mixamo (https://mixamo.com) — animation clips
- Sketchfab (https://sketchfab.com) — source room glb (filter: downloadable + cc license)

### .env.local (never commit)
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
CONVEX_URL=https://....convex.cloud
NIA_API_KEY=...
JWT_SECRET=<shared with stephen>
```

---

## 8. ELECTRON MENTAL MODEL (quick refresh)

- **main process**: node.js, has fs/shell/spawn, runs `electron/main.ts`. one per app.
- **renderer process**: chromium, has dom/webgl, runs `src/App.tsx`. one per window.
- **preload script**: bridge. runs in renderer with limited node access. exposes safe apis via `contextBridge.exposeInMainWorld`.
- **IPC**: messages between main and renderer via `ipcMain.handle` / `ipcRenderer.invoke`.

renderer code accesses local stuff via `window.angel.*` (defined in preload).

---

## 9. STEP-BY-STEP BUILD PLAN

### Phase 0 — Validate the stack (10 min, FIRST)
- [ ] `bun create electron-vite angel-app --template react-ts`
- [ ] add three + r3f + three-vrm
- [ ] drop a test.vrm in `public/vrm/`
- [ ] hardcode a minimal r3f scene loading the vrm
- [ ] `bun run dev` → window opens, vrm renders
- [ ] **if this fails, fall back to webapp version of the room (no electron)**

### Phase 1 — Scene foundation (1 hour)
- [ ] download a room glb from sketchfab (anime bedroom, glb @ 2k)
- [ ] open in blender, add named empties at anchor positions, export glb
- [ ] place glb in `public/room.glb`
- [ ] `<Room>` component: useGLTF loads it, finds anchor empties via `scene.getObjectByName`, exposes their world positions
- [ ] `<Scene>` component: Canvas + ambient + directional + environment map
- [ ] `<FirstPersonControls>`: PointerLockControls or simple orbit-like
- [ ] verify: walk camera around the room, click an object, console logs the anchor name

### Phase 2 — Avatar (1.5 hours, biggest risk)
- [ ] `<Avatar>` component: useGLTF loads vrm, VRMLoaderPlugin extracts vrm
- [ ] add vrm to scene at `Anchor_Center`
- [ ] `useFrame`: vrm.update(dt) every tick (mandatory)
- [ ] download mixamo clips (idle, walking, sitting, typing, wave, thinking) as .fbx with skin
- [ ] write retargeting helper: maps mixamo bone names → vrm humanoid bone names, copies tracks
- [ ] AnimationMixer, load all clips, expose play(name, fadeMs) function
- [ ] procedural blink: every 2-5sec, blend `blink` expression to 1.0 then back to 0
- [ ] look-at: vrm.lookAt.target = camera (when user close), else null
- [ ] verify: avatar idles, blinks, looks at camera, manually trigger walk → walks in place

### Phase 3 — Action runner (45 min)
- [ ] zustand store: `actionQueue: SceneAction[]`, `currentAction: SceneAction | null`
- [ ] `<ActionRunner>` component:
  - useFrame: if no current, pop next from queue; if current is walk, lerp transform
  - on arrival at anchor (distance < 0.1), mark complete, IPC emit, next
  - on play_clip, switch animation, set timer for completion
- [ ] hook IPC: `window.angel.onAction(action => store.push(action))`
- [ ] verify: from devtools, inject a walk action → avatar walks

### Phase 4 — IPC + electron main (45 min)
- [ ] `electron/main.ts`: BrowserWindow with frameless + custom titlebar + preload
- [ ] `electron/preload.ts`: `contextBridge.exposeInMainWorld('angel', { invokeTool, onAction, onChat, onState })`
- [ ] `ipcMain.handle('tool', async (_, { name, args }) => { /* route */ })`
- [ ] register `angel://` protocol handler, parse claim token
- [ ] `app.on('open-url')` for mac, `process.argv` for win/linux
- [ ] verify: electron launches with deep link → reads token → logs persona record from mock convex

### Phase 5 — Chat overlay + state (30 min)
- [ ] `<ChatOverlay>`: input field at top, message history middle, speech bubble above avatar
- [ ] on user submit: `window.angel.invokeTool('chat', { text })` → main dispatches to agent
- [ ] subscribe to chat tokens via IPC, append to bubble (streaming)
- [ ] `<StateBars>`: bottom-right, mood/energy/trust progress bars (framer-motion animated)
- [ ] zustand subscribes to state IPC events
- [ ] verify: type a message → main echoes a fake response → bubble appears with typing animation

### Phase 6 — Persona apply (15 min)
- [ ] on launch with claim token: fetch convex → load matching vrm by id → apply palette to ui accent
- [ ] display persona name in titlebar
- [ ] verify: pass a fake token, app loads correct vrm

### Phase 7 — Integration with Stephen (hour 5, ~3:50pm)
- [ ] real claim token from real webapp
- [ ] real agent backend (codex spawn or claude api)
- [ ] real action emission from agent → renderer

### Phase 8 — Polish (90 min)
- [ ] arrival animations: walk_to → sit auto-plays sit clip
- [ ] desk lamp toggle when mood = focused
- [ ] subtle camera bob during walk
- [ ] tts via elevenlabs (if time): main streams audio → renderer plays + drives mouth blendshape
- [ ] system tray + minimize-to-tray

### Phase 9 — Demo prep (last 30 min)
- [ ] rehearse the killer prompt twice
- [ ] record backup video
- [ ] pre-launch app, pre-paired persona

---

## 10. KEY CODE SNIPPETS

### electron/main.ts skeleton

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
})

ipcMain.handle('tool', async (_e, { name, args }) => {
  switch (name) {
    case 'chat':       return handleChat(args.text)
    case 'walk_to':    return emitAction({ type: 'walk_to', anchor: args.anchor, id: crypto.randomUUID() })
    // ...
  }
})

function emitAction(action) {
  mainWindow?.webContents.send('scene:action', action)
}
```

### electron/preload.ts

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('angel', {
  invokeTool: (name, args) => ipcRenderer.invoke('tool', { name, args }),
  onAction: (cb) => ipcRenderer.on('scene:action', (_, action) => cb(action)),
  onChat: (cb) => ipcRenderer.on('chat:token', (_, token) => cb(token)),
  onState: (cb) => ipcRenderer.on('state:update', (_, state) => cb(state)),
})
```

### vrm load helper (lib/vrm-load.ts)

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm'

export async function loadVRM(url: string): Promise<VRM> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(url)
  const vrm = gltf.userData.vrm as VRM
  vrm.scene.traverse((obj) => { obj.frustumCulled = false })
  return vrm
}
```

### Avatar component shape

```tsx
export function Avatar({ url }: { url: string }) {
  const [vrm, setVrm] = useState<VRM | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer>()

  useEffect(() => {
    loadVRM(url).then((v) => {
      setVrm(v)
      mixerRef.current = new THREE.AnimationMixer(v.scene)
      // load + retarget mixamo clips here
    })
  }, [url])

  useFrame((_, dt) => {
    mixerRef.current?.update(dt)
    vrm?.update(dt)
  })

  return vrm ? <primitive object={vrm.scene} /> : null
}
```

### Action runner shape

```tsx
export function ActionRunner({ vrm, anchors }) {
  const queue = useStore((s) => s.queue)
  const current = useStore((s) => s.current)
  const popNext = useStore((s) => s.popNext)

  useFrame((_, dt) => {
    if (!current && queue.length) popNext()
    if (!current || !vrm) return

    if (current.type === 'walk_to') {
      const target = anchors[current.anchor]
      vrm.scene.position.lerp(target.position, dt * 2)
      const distance = vrm.scene.position.distanceTo(target.position)
      if (distance < 0.1) {
        useStore.getState().completeCurrent()
        window.angel.invokeTool('action_complete', { id: current.id })
      }
    }
    // handle play_clip, sit_at, face, etc.
  })

  return null
}
```

---

## 11. THE DEMO MOMENT (3 min — judging slot)

1. **0:00** thesis: "agents are converging on capability but diverging from engagement. angel is the missing primitive — discovered, not designed."
2. **0:15** swipe round, vector convergence animation (sped up if needed)
3. **0:45** angel birth → "download angel.app" → deep link via `angel://` → electron app opens
4. **1:00** room loads, avatar present, turns to face camera, speaks first line
5. **1:10** **bg autonomy beat:** "while you were away, i prepared 3 commits and watched your portfolio repo" (addresses 30% scoring criterion)
6. **1:25** memory callback: "how'd that portfolio thing land?" (statefulness 25%)
7. **1:40** user: "add a project card for angel to my portfolio and deploy it"
8. **1:50** avatar walks to desk, sits, typing animation
9. **2:00** desk monitor streams real codex stdout
10. **2:30** task done — `✓ deployed`, in-world browser opens to live url
11. **2:45** avatar walks back: "shipped. want me to tweet it?"
12. **3:00** close: "agents converge on capability. presence is the moat. angel is the missing primitive."

---

## 12. KILL CRITERIA (updated for 6pm submission)

- **11:15 am**: if no e2e of vrm walking + monitor stream + swipe spike, fall back per BUILD_PLAN.md kill-switch matrix
- **1:30 pm**: if avatar animation is broken, fall back to 2d portrait + audio narration
- **3:30 pm**: if no e2e (swipe → vector → claim → vrm in room → task), drop electron from demo, present webapp + screen-recorded electron demo
- **5:00 pm**: hard freeze. polish only. no new features.
- **5:55 pm**: SUBMIT NO MATTER WHAT. partial demo > missed submission.

---

## 13. TRACK + SPONSOR TARGETING

**Submitted track: Always-On Agents (Nia + Tensorlake)**

Judging weights to optimize for:
- Genuine background execution 30% — the "while you were away" beat
- Statefulness 25% — nia memory + callback line
- Agentic depth 25% — orchestrator + delegate + verifier + multi-step
- Demo & presentation 10%
- Judge's personal rating 10%

Sponsors mentioned in submission text:
- **Nia** (main + track) — episodic + semantic memory, the callback
- **Tensorlake** (track) — bg execution sandbox for the always-on loop
- **Convex** — realtime spine
- **Vercel** — submission demo url
- **OpenAI Codex** — embodied executor

---

## 14. WHEN STUCK — ESCALATION

- **VRM won't load**: check three.js version, vrm needs three@^0.160. drop to a known-good combo: three@0.160, @pixiv/three-vrm@^3, @react-three/fiber@^8
- **Mixamo clip looks wrong on vrm**: bone naming mismatch. log both skeletons' bone names, manually map.
- **Electron deep link doesn't fire**: must call `app.setAsDefaultProtocolClient('angel')`. mac uses `app.on('open-url')`, win/linux uses second-instance + argv parsing.
- **IPC type errors**: define `SceneAction` types in shared `electron/types.ts` and import both sides.
- **Glb scene too dark**: add `<Environment preset="apartment" />` from drei for image-based lighting.

---

## 15. TIMELINE (real, hacking starts 9:15 am)

| Time  | Milestone |
|-------|-----------|
| 09:25 | Phase 0 spike validates — vrm renders in r3f window |
| 10:30 | Phase 1 scene loads — room glb + anchors |
| 12:00 | Phase 2 avatar animates — vrm + walk + idle anims |
| 12:30 | LUNCH (eat at desk, 30 min) |
| 13:30 | Phase 3 action runner consuming IPC |
| 14:15 | Phase 4 IPC + electron main + claim token |
| 14:45 | Phase 5 chat overlay + state bars |
| 15:00 | Phase 6 persona apply (full e2e w/ token) |
| 15:30 | **INTEGRATION CHECK with Stephen** — must have e2e by here |
| 17:00 | Phase 8 polish done |
| 17:00 | Begin dress rehearsal (3 full 3-min runs) |
| 17:50 | **SUBMIT — https://forms.gle/fkoFXRo3L2MVkkz87** |
| 18:00 | Submissions close. Eat dinner. |
| 18:10 | Judging begins (3 min slot per team) |

**DO NOT MISS 6:00 PM SUBMISSION. localhost is disqualifying — submit the vercel url.**

---

eat the elephant. one phase at a time. ping for code when blocked.
