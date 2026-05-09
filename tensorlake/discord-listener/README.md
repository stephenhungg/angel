# tensorlake/discord-listener

Always-on Discord listener for **angel**, hosted on Tensorlake — the
sponsor receipt for the Nia + Tensorlake "Always-On Agents" track.

## What this is

A Python `@application` deployed to Tensorlake. Their cron scheduler fires it
every 60 seconds. On each firing it:

1. Reads per-channel `lastMessageId` cursors from Convex (durable memory layer).
2. Polls Discord REST for new messages on each watched channel + the bot's open DMs.
3. For each message that should trigger a reply (DM / mention / reply-to-bot /
   listen channel) it POSTs to `convex.../discord/passive-message`, which runs
   the orchestrator (Claude + Nia memory) and posts the reply via the bot token.
4. Advances the cursor in Convex.

The agent **runs while no one is watching** — no laptop, no fly.io, no
WebSocket. It satisfies all three rubric points:

- **Background execution**: Tensorlake cron, every 60s.
- **Stateful execution**: per-channel cursors live in Convex, survive crashes,
  restarts, redeploys.
- **Sandbox environment**: each invocation gets a fresh isolated Tensorlake
  sandbox with the Discord + Convex secrets injected.

> Why polling not WebSocket? Tensorlake `@application` is invocation-based, not
> a long-running process. The complementary WebSocket bridge in
> `web/scripts/discord-bridge.ts` still exists for sub-second latency local
> demos; the Tensorlake listener is the production "no laptop" surface.

## Deploy (copy-paste, ~3 minutes)

### 1. Install the Tensorlake CLI

```bash
pip install tensorlake
export TENSORLAKE_API_KEY=tl_apiKey_xxxxxxxxxxxxxxxx
```

(Get the key from <https://cloud.tensorlake.ai> → your project → API keys.)

### 2. Set the listener's secrets in Tensorlake

These are injected as env vars into the sandbox at every invocation:

```bash
tl secrets set \
  DISCORD_BOT_TOKEN="MT...your-bot-token" \
  DISCORD_BOT_USER_ID="123456789012345678" \
  CONVEX_URL="https://necessary-leopard-395.convex.site" \
  DISCORD_LISTEN_CHANNELS="1234567890,9876543210" \
  DISCORD_BRIDGE_SECRET="$(openssl rand -hex 16)"
```

| secret | source |
|---|---|
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Bot → Token |
| `DISCORD_BOT_USER_ID` | Discord Developer Portal → General Information → Application ID (same as bot user id for app-owned bots) |
| `CONVEX_URL` | `pnpm dlx convex dashboard` → URL, swap `.convex.cloud` → `.convex.site` |
| `DISCORD_LISTEN_CHANNELS` | Comma-separated channel snowflakes the bot should respond to in (DMs always work even if this is empty) |
| `DISCORD_BRIDGE_SECRET` | Optional shared secret. **If set, must also be set on Convex with `pnpm dlx convex env set DISCORD_BRIDGE_SECRET ...`** |

Then mirror the same secret on Convex (only if you set `DISCORD_BRIDGE_SECRET`):

```bash
cd convex
pnpm dlx convex env set DISCORD_BRIDGE_SECRET "<the-same-hex>"
```

### 3. Deploy the application

```bash
cd /Users/stephenhung/Documents/GitHub/angel
tl deploy tensorlake/discord-listener/listener.py
```

This creates a Tensorlake application named `angel_discord_listener` (the
function name in `listener.py`). The dashboard URL prints when deploy
completes.

### 4. Arm the 60-second cron

```bash
cd tensorlake/discord-listener
chmod +x arm-cron.sh list-cron.sh
./arm-cron.sh
./list-cron.sh   # confirm it's there
```

Or by raw curl:

```bash
curl -X POST \
  -H "Authorization: Bearer ${TENSORLAKE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"cron_expression":"* * * * *"}' \
  https://api.tensorlake.ai/applications/angel_discord_listener/cron-schedules
```

`* * * * *` = every minute (Tensorlake's minimum). For lazier cadence use
`*/5 * * * *` (every 5 minutes).

### 5. Verify end-to-end

1. Tensorlake dashboard → Applications → `angel_discord_listener` → Executions.
   Within 60s you should see the first invocation, returning a JSON report
   like `{"ok": true, "channels": N, "relayed": 0, ...}`.
2. Convex dashboard → Tables → `discordListenerCursors`. After the first
   firing each watched channel has a row with `lastMessageId`.
3. DM the bot (or @-mention it in a listen channel). Within ~60s, angel
   replies in Discord.

## Local smoke test (no deploy)

```bash
cd tensorlake/discord-listener
pip install -r requirements.txt

# Set the same env vars locally:
export DISCORD_BOT_TOKEN=...
export DISCORD_BOT_USER_ID=...
export CONVEX_URL=https://necessary-leopard-395.convex.site
export DISCORD_LISTEN_CHANNELS=...
export DISCORD_BRIDGE_SECRET=...   # optional

python listener.py
```

Runs one polling round and prints the JSON report. Useful for confirming the
Discord token + Convex URL work before paying the deploy roundtrip.

## Tearing it down

```bash
# remove the schedule
SCHEDULE_ID=...   # from list-cron.sh
curl -X DELETE \
  -H "Authorization: Bearer ${TENSORLAKE_API_KEY}" \
  https://api.tensorlake.ai/applications/angel_discord_listener/cron-schedules/${SCHEDULE_ID}
```

## How this hits the sponsor rubric

When a judge asks "show me where Tensorlake is doing real work":

1. **Tensorlake dashboard** → Applications → `angel_discord_listener` →
   Executions. Scroll the run history: one invocation every 60s, each with
   a JSON return body showing `channels`, `relayed`, `elapsed_ms`.
2. **Convex dashboard** → `discordListenerCursors` table. Live-updating
   `updatedAt` and `invocationId` columns prove the durable memory layer.
3. **Discord** → DM the bot, watch the reply land within one cron cycle.
   The full path is visible: Tensorlake invocation → Convex cursor read →
   Discord poll → Convex orchestrator HTTP → Claude → Discord REST post →
   Convex cursor write.

That's the receipt.
