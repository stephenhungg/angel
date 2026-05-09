# contributing — how stephen + matthew work on main today

> two devs, one main branch, one hackathon. minimize merge conflicts via clear ownership.

## ownership map

| path | owner | what |
|---|---|---|
| `web/` | stephen | next.js landing + swipe onboarding + clip embeddings + persona vector → claim token |
| `desktop/electron/` | stephen | main process: orchestrator (sonnet 4.6), task translator, codex spawner, verifier, ipc handlers |
| `desktop/src/` | matthew | renderer: r3f scene, vrm avatar, action runner, chat overlay, animalese player |
| `desktop/public/` | matthew | room glb, vrm avatars, mixamo animations |
| `convex/` | stephen | schema, mutations, queries, scheduled bg jobs, nia integration |
| `shared/` | **both** (coordinate via PRs or pair) | the contract: scene actions, persona, claim token, agent state |
| `*.md` (root) | both | docs |

**rule:** if you touch a file outside your lane, ping the owner first. shared/ changes need a "yo i'm changing scene.ts" message.

## branch strategy: trunk-based on `main`

- everyone commits to `main` directly
- pull before every push: `git pull --rebase`
- atomic commits: one logical change each, conventional prefixes (`feat:`, `fix:`, `refactor:`, `docs:`)
- if you break the build: fix it within 10 min or revert
- never force push main

## conflict avoidance recipe

1. **ownership lanes are designed to never overlap** — web vs renderer vs main process vs convex are separate dirs
2. **shared/ is the only true contention point.** before editing shared/, post in discord: "editing shared/scene.ts to add `wave` action"
3. **commit small, push often** — every 15-30 min when actively coding
4. **pull before you push, every time:** `git pull --rebase origin main`
5. **resolve conflicts immediately** — don't let WIP pile up

## getting started (both)

```bash
# clone + install
git clone https://github.com/stephenhungg/angel.git
cd angel
bun install

# secrets (ask other dev for the real values)
cp .env.example .env.local
# fill in JWT_SECRET (must match across web + desktop), CONVEX_URL, API keys

# pick your lane

# stephen — web (port 3000)
bun run dev:web

# matthew — desktop (electron + vite hot reload)
bun run dev:desktop

# stephen — convex (deploy schema)
bun run dev:convex
```

## the contract: shared/

`shared/src/` is the type-level handshake between web, desktop, convex. read it first. if you need to add a field:

1. edit the type in `shared/src/`
2. update producers (whoever writes it)
3. update consumers (whoever reads it)
4. ping the other dev so they pull + adapt

key files:
- `scene.ts` — SceneAction vocab (matthew + stephen both code against this)
- `persona.ts` — persona vector + traits + asset mapping (stephen writes, matthew reads)
- `claim.ts` — JWT payload between web → electron deep link
- `agent.ts` — orchestrator output, tool calls, agent state, memory

## ai pair-coding etiquette

- both of us use claude / codex / cursor heavily
- if your agent goes off-script and edits files outside your lane, **revert and ping** the owner. don't push spaghetti.
- agents should commit through us, not directly. review every diff before push.

## hackathon-specific rules

- **at 5:00 pm, build is locked.** no merges after 5pm except polish.
- **at 5:50 pm, submit** via https://forms.gle/fkoFXRo3L2MVkkz87
- localhost is disqualifying — vercel-deployed `web/` is the submission url
- track: always-on agents

## doc workflow

major decisions update the docs at root (BUILD_PLAN.md, DEMO.md, ARCHITECTURE.md, etc.). don't let docs drift — they're our shared brain.

## post-merge sanity check

after pulling someone else's work:
```bash
bun install              # in case deps changed
bun run typecheck        # catch contract drift fast
```

## emergencies

- **broken main:** revert your last commit (`git revert HEAD`), push immediately
- **shared/ conflict:** pair on it in person or via screen-share
- **deploy fails:** check vercel dashboard, env vars, build logs in that order
- **someone's missing a deadline:** use the kill-switches in `BUILD_PLAN.md`
