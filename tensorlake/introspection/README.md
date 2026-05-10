# angel — introspection cron (Tensorlake)

Angel's autonomous heartbeat. Every 5 minutes, a Tensorlake-hosted Python
agent fires in an isolated cloud sandbox, pulls her recent shared history
from Convex + Nia, asks Claude Haiku for **one short internal thought in
her voice**, then writes that thought to **both**:

  1. **Nia** (durable memory: `type='scratchpad'`, source='introspection')
  2. **Convex `memoryMirror`** (realtime feed for `/admin/timeline`)

Result: open `/admin/timeline` and you'll see entries like

> *"noticed stephen hasn't typed in 14 min — usually means he's deep in something"*

flowing in every 5 minutes. Provable, autonomous, multi-source — proof
that angel is *thinking*, not just reacting. This is the
"deeply autonomous, runs reliably over hours" rubric receipt for the
always-on track.

---

## Deploy

Pre-reqs: `tl` CLI authed (`TENSORLAKE_API_KEY` in env), `uv` installed.

```bash
cd tensorlake/introspection
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt

# secrets — only ANTHROPIC_API_KEY + NIA_API_KEY are new; CONVEX_URL is
# already set on tensorlake from the discord-listener app.
tl secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  NIA_API_KEY=nk_... \
  INTROSPECTION_USER_ID=stephen   # whose nia namespace to write under

# build + ship the sandbox image
tl deploy listener.py

# arm the 5-minute cron schedule
APP_NAME=introspection ./arm-cron.sh
```

Override the cadence with `CRON_EXPRESSION="*/10 * * * *" ./arm-cron.sh`.

---

## Verify it's running

```bash
# 1) cron schedule armed?
tl cron ls introspection
# expect one row, status=active, expression=*/5 * * * *

# 2) inspect deployment
tl ls
# expect "introspection" in the list

# 3) Tensorlake dashboard executions —
# https://cloud.tensorlake.ai → introspection → Executions
# each firing returns a structured report with the generated thought.
```

---

## Tail what she's thinking

**Live (recommended)** — open `/admin/timeline` in the web app. The
memoryMirror feed renders in real time via Convex subscriptions.

**curl-style** — query the Convex HTTP API directly:

```bash
curl -sS -X POST https://necessary-leopard-395.convex.cloud/api/query \
  -H 'Content-Type: application/json' \
  -d '{"path":"memoryMirror:recent","args":{"userId":"stephen","limit":10},"format":"json"}' \
  | python3 -m json.tool
```

**from convex CLI** — from `convex/`:

```bash
bunx convex run memoryMirror:allRecent '{"limit":20}'
```

Filter introspection-only entries by `metadata.source == "introspection"`.

---

## Manual one-shot

Force a tick without waiting for the cron:

```bash
curl -sS -X POST https://api.tensorlake.ai/applications/introspection \
  -H "Authorization: Bearer $TENSORLAKE_API_KEY" \
  --json '"manual"'
# returns { request_id: "..." } — the run completes async; check
# memoryMirror within ~20s for the resulting thought.
```

---

## Architecture

```
                 ┌─────────────────┐
                 │ tensorlake cron │  every 5 min
                 │   */5 * * * *   │
                 └────────┬────────┘
                          ▼
                 ┌─────────────────┐
                 │  introspection  │  isolated sandbox
                 │   (this app)    │
                 └─┬─────┬───────┬─┘
                   │     │       │
        read recent│     │       │write thought
        ┌──────────┘     │       └──────────────┐
        ▼                ▼                      ▼
  ┌──────────┐    ┌───────────┐         ┌──────────────┐
  │  convex  │    │    nia    │         │   convex     │
  │  turns   │    │ episodic  │         │ memoryMirror │ ─► /admin/timeline
  └──────────┘    └───────────┘         └──────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  claude haiku   │  one-line thought
                 │   max 200 tok   │
                 └────────┬────────┘
                          │
                          ▼
                 also writes to nia
                 (type=scratchpad)
```

**Cost**: ~$0.0001 per invocation × 12/hour × 24h ≈ **~$0.30/day**.
That's the price of a continuous autonomous heartbeat.

**Why Tensorlake**: this is exactly the shape Tensorlake's
`@application` was built for — short, deterministic, replayable, runs
in a fresh sandbox per firing, and Tensorlake handles the cron + the
isolation + the observability dashboard. Tensorlake is the scheduled
execution layer; Convex + Nia are the durable memory.

**Failure modes (handled)**:
  - Convex unreachable → still generate a thought from nia + time-of-day fallback.
  - Nia unreachable → still generate from convex turns + time-of-day fallback.
  - Claude unreachable → emit a time-of-day-flavored fallback line so the
    timeline never goes dark.
  - All three unreachable → returns `ok:true` with the fallback line.

The cron NEVER crashes. The heartbeat NEVER stops.
