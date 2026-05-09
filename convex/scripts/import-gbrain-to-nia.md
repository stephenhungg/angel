# gbrain → nia ingestion

> one-shot pipeline to mirror stephen's gbrain (48k pages) into nia so cloud agents (matthew's machine, scheduled daemons, sms surface) can query stephen's life context without reaching gbrain's local mcp directly.

## how it works

```
GBRAIN POSTGRES (stephen's mac, localhost:5433)
        ↓ gbrain export --dir ./stephen-brain
MARKDOWN FILES (48k pages, structured by type)
        ↓ git init && git push
PRIVATE GITHUB REPO  (stephenhungg/stephen-brain)
        ↓ nia sdk.sources.create({ url })
NIA INDEX            (queryable from anywhere)
```

nia treats the github repo as a source, indexes it, and serves semantic search to any agent calling its api. gbrain stays on stephen's mac as the canonical write-side. nia is the read-side mirror for distributed access.

## one-time setup steps

### 1. export gbrain to markdown

(already kicked off — runs in background)
```bash
mkdir -p ~/Documents/GitHub/stephen-brain
cd ~/Documents/GitHub/stephen-brain
~/Documents/GitHub/gbrain/bin/gbrain export --dir .
```

estimated time: 5-15 min for 48k pages.

### 2. create private github repo for the brain

```bash
cd ~/Documents/GitHub/stephen-brain
git init
git add -A
git commit -m "feat: initial gbrain export — $(date +%Y-%m-%d)"
gh repo create stephenhungg/stephen-brain --private --source=. --remote=origin --push
```

### 3. add as nia source

```ts
// run once from a node script or quick repl
import { NiaSDK } from "nia-ai-ts";

const sdk = new NiaSDK({ apiKey: process.env.NIA_API_KEY! });

await sdk.sources.create({
  url: "https://github.com/stephenhungg/stephen-brain",
  // nia auto-detects type=repository, indexes markdown
});

console.log("nia is now indexing your brain. check status at app.trynia.ai");
```

nia indexing time depends on size — 48k pages could take 30+ min. run early.

### 4. query nia from any angel client

```ts
// in convex/memory.ts or anywhere with NIA_API_KEY
const sdk = new NiaSDK({ apiKey: process.env.NIA_API_KEY! });

// in AngelMemory.recall()
const results = await sdk.search({
  query: "stephen's portfolio site project",
  sources: ["stephenhungg/stephen-brain", `angel/${userId}`],
  limit: 5,
});
```

## ongoing sync (post-hackathon)

for v2, schedule a daily cron that:
1. runs `gbrain export --dir .` (gbrain supports incremental output)
2. `git add -A && git commit -m "sync $(date)" && git push`
3. nia auto-reindexes the repo on push

set up via convex scheduled function or github action.

## privacy considerations

- repo is **private** — only stephen's github account + nia's indexing service can read
- gbrain export respects `--exclude` filters if any pages are flagged private (TODO: confirm w/ gbrain docs)
- nia api key in `.env.local`, never committed
- do NOT make this repo public — contains 48k pages of personal data including emails, people, projects

## when to use vs skip

**use when:**
- demo user is stephen (his real history makes callbacks bulletproof)
- judges might ask "is this real memory?" and you want to prove yes
- v1 hackathon: ingest once at start of day, demo at end

**skip when:**
- demo user is a stranger (use synthetic seeded history instead)
- privacy-sensitive demo (don't want to surface email contents on stage)
- v2+ multi-tenant: each user's gbrain (if they have one) ingests under their own user namespace

## v1 (today) status checklist

- [x] gbrain export started (background)
- [ ] git init + push to stephenhungg/stephen-brain
- [ ] add nia source via sdk
- [ ] verify nia indexed (check app.trynia.ai)
- [ ] test query: `recall("portfolio")` returns gbrain content
- [ ] wire `convex/memory.ts` `AngelMemory.recall()` to query both `stephen-brain` source + per-user angel source
