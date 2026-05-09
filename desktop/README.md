# @angel/desktop — electron app (room + agent)

> electron + vite + react + r3f. owners: matthew (renderer) + stephen (main process).

## what lives here

| path | owner | purpose |
|---|---|---|
| `electron/main.ts` | stephen | window, ipc, agent spawn |
| `electron/preload.ts` | stephen | contextBridge api → `window.angel.*` |
| `electron/agent/` | stephen | orchestrator (sonnet 4.6), task translator (haiku), prompt builder, output parser |
| `electron/tools/` | stephen | codex spawner, playwright, fs, shell |
| `electron/persona/claim.ts` | stephen | parse + verify deep-link JWT, fetch convex, cache |
| `src/App.tsx` + `src/main.tsx` | matthew | react entry |
| `src/components/Scene.tsx` | matthew | canvas, lights, camera |
| `src/components/Room.tsx` | matthew | glb loader, anchor exposure |
| `src/components/Avatar.tsx` | matthew | vrm + animation mixer |
| `src/components/ActionRunner.tsx` | matthew | consumes ipc scene actions |
| `src/components/ChatOverlay.tsx` | matthew | speech bubble + input |
| `src/components/StateBars.tsx` | matthew | mood/energy/trust hud |
| `src/lib/vrm-load.ts` | matthew | vrm loader helper |
| `src/lib/retarget.ts` | matthew | mixamo bone → vrm humanoid bone |
| `src/lib/expressions.ts` | matthew | blink, lipsync, look-at |
| `src/lib/anchors.ts` | matthew | anchor name → world position |
| `src/lib/ipc.ts` | both | typed wrapper around `window.angel` |
| `src/stores/angel.ts` | matthew | zustand: persona, state, action queue, chat history |
| `public/room.glb` | matthew | sketchfab room asset |
| `public/vrm/*.vrm` | matthew | vroid avatars (one per archetype) |
| `public/animations/*.fbx` | matthew | mixamo clips |

## scripts

```bash
bun run dev          # electron-vite hot reload
bun run build        # electron-builder packaging
bun run typecheck
```

## env

needs `.env.local` with:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (codex)
- `NEXT_PUBLIC_CONVEX_URL` + `CONVEX_DEPLOY_KEY`
- `NIA_API_KEY`
- `JWT_SECRET` (must match web)

## the contract

main and renderer talk via:
- **ipc invoke** for sync calls — `window.angel.invokeTool(name, args)`
- **ipc events** for streams — `window.angel.onAction(cb)`, `onChat(cb)`, `onState(cb)`

types live in `shared/src/scene.ts` and `shared/src/agent.ts`. **both sides import from `@angel/shared`.**

## the demo flow (e2e)

1. user clicks "download angel" on web → deep link → electron `app.on('open-url')`
2. main parses + verifies JWT → fetches convex user → caches persona
3. renderer loads vrm by `traits.aesthetic`, applies palette
4. orchestrator system prompt assembled (soul anchor + persona + reflective summary + nia recent)
5. **bg autonomy seed:** main pre-emits a `say` action on launch — "while you were away, i prepared 3 commits..."
6. user types/speaks → main → orchestrator → tool calls → ipc events → renderer updates scene
7. `delegate` tool → task translator → codex spawn → stdout streams to monitor mesh → verifier → orchestrator narrates outcome
