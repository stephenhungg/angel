# stack

## frontend (web)

| layer | choice | why |
|---|---|---|
| framework | next.js 15 (app router) | vercel deploys instant, sponsor-aligned |
| package mgr | bun | fast install, fewer hackathon footguns |
| styling | tailwind + custom cartoon font | miside-coded chunky vibe |
| animation | framer-motion | swipe + transition feel |
| embeddings | openai text-embedding-3 + clip-vit-l | clip for image archetypes, text for traits |
| host | vercel | sponsor, fast, free |

## desktop (electron)

| layer | choice | why |
|---|---|---|
| shell | electron 30 + vite | fastest to ship, chromium = compatible |
| renderer | react 19 + r3f + drei + three-vrm | r3f handles vrm cleanly; drei for waypoints, html-on-plane |
| 3d models | sketchfab (room) + vroid hub (avatar) | free, gltf/vrm native, hackathon-fast |
| anims | mixamo retargeted onto vrm | walk/idle/sit/type — free, abundant |
| audio | web audio api + animalese sample bank | client-side, zero api cost, custom feel |
| state (renderer) | zustand + convex client | minimal, reactive |
| ipc | electron contextBridge | secure, typed |

## brain layer

| component | choice | why |
|---|---|---|
| orchestrator | claude sonnet 4.6 (1M ctx) | fast, structured outputs, persona prompts hold |
| stt | deepgram nova-3 | low latency, streaming |
| task translator | claude haiku 4.5 | cheap, fast, intent → codex prompt |
| code executor | codex cli (headless `codex exec`) | sponsor, specialized for code |
| browser executor | playwright mcp | adds browser parity vs openclaw |
| verifier | claude haiku 4.5 + scripted checks | reality-grounding |

## data + memory

| layer | choice | why |
|---|---|---|
| realtime spine | convex | sponsor, reactive, websocket native |
| memory | nia | sponsor, semantic search |
| auth | convex auth | one less moving part |
| local cache | sqlite (better-sqlite3) | offline-ish capability |

## deploy + ops

| need | choice |
|---|---|
| web host | vercel |
| convex deploy | convex cloud |
| codex auth | openai key in main process keychain |
| anthropic auth | api key in main process keychain |
| electron pkg | electron-builder (skip for demo, just `npm run electron`) |

## fonts + assets

- subtitle font: cherry bomb / bagel fat one (google fonts, free)
- room: search sketchfab "anime bedroom low poly" — pick one with desk + window + couch
- avatar: vroid hub "free for commercial" filter — pick 4 archetype-aligned vrms
- animalese samples: clone github animalese.js, swap pitch banks per persona

## what we're NOT using (and why)

- **gpt-realtime-2** — cut, replaced w/ text llm + animalese (cheaper, cuter, miside-aesthetic)
- **elevenlabs tts** — cut, animalese is the move
- **langchain** — too heavy for hackathon, direct sdk calls are faster to debug
- **mongodb / supabase** — convex covers it, fewer services
- **react native / expo** — desktop-first, mobile is post-hackathon

## sponsor alignment

- nia → memory layer (track prize potential)
- convex → realtime spine
- vercel → web host
- openai → codex + embeddings (10k credits if we win)
- (insforge / hyperspell / tensorlake — see if any fit during build)
