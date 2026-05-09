# @angel/shared — the contract

> typescript types shared between web, desktop, convex. **both stephen and matthew code against these — modify with care.**

## modules

| file | content |
|---|---|
| `src/scene.ts` | `SceneAction` vocab (walk_to, sit_at, play_clip, speak, delegate, etc.), `AnchorId`, `Emotion`, `AnimationClip`, `Expression` |
| `src/persona.ts` | `Persona`, `PersonaTraits`, archetype enums, vrm/palette mapping |
| `src/claim.ts` | `ClaimTokenPayload` (JWT shape for web→electron handoff) |
| `src/agent.ts` | `AgentState`, `AngelTask`, `MemoryEntry`, `OrchestratorOutput`, `ToolCall` |
| `src/index.ts` | re-exports everything |

## changing this code

before editing:
1. ping the other dev in discord
2. think about whether it's additive (safe) or breaking (coordinate)
3. update producers + consumers in same commit

types touched here ripple through:
- web (form + claim token gen)
- desktop main (ipc handlers, orchestrator output parsing)
- desktop renderer (action runner, store types)
- convex (validators, mutations, queries)

if your change breaks any of these, fix all of them in the same PR.

## import pattern

```ts
// in web/, desktop/, convex/
import type { SceneAction, AnchorId, ClaimTokenPayload } from '@angel/shared';
import { VRM_BY_AESTHETIC } from '@angel/shared';
```
