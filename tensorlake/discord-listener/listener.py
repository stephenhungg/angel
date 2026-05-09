"""
angel — Tensorlake-hosted Discord listener.

This is the always-on, sponsor-track-receipt agent for the Tensorlake portion
of the Nia + Tensorlake "Always-On Agents" track.

# What it does (one paragraph)

Every 60 seconds, Tensorlake's cron scheduler fires `discord_listener` —
which runs in an isolated Tensorlake sandbox. The function:

  1. Reads durable per-channel cursors from Convex
     (GET /discord/listener-cursor/get) — "where did I leave off?".
  2. Polls the Discord REST API for messages newer than each cursor on every
     watched channel + the bot's open DMs.
  3. Decides whether each new message should trigger a reply (DM | bot
     mention | listen channel) — same logic as the gateway bridge, but
     polling-based instead of WebSocket.
  4. POSTs each triggering message to convex /discord/passive-message,
     which schedules the orchestrator action to call Claude + post the
     reply via the bot token.
  5. Advances the cursor in Convex (POST /discord/listener-cursor/set).

# Why Tensorlake (the sponsor receipt)

  - Background execution: Tensorlake's cron scheduler invokes this agent
    every 60s, no laptop needed.
  - Stateful execution: Convex stores the per-channel `lastMessageId`
    cursors — durable across crashes, restarts, redeploys. Tensorlake's
    own per-request state is empty between firings (by design), so we
    treat Convex as the agent's external memory layer.
  - Sandbox environment: each invocation runs in a fresh isolated sandbox
    with the Discord + Convex secrets injected.
  - Runs while no one is watching: zero coupling to stephen's laptop, the
    web app, or the desktop client.

# Architecture trade-off

Why polling not WebSocket? Tensorlake's @application is invocation-based
(HTTP entry, optionally cron-triggered), not a long-running process. It
boots a sandbox per invocation and tears it down. Holding open a Discord
gateway WebSocket would require a single persistent process, which is
exactly what Tensorlake doesn't model. Polling is the idiomatic Tensorlake
shape: short, deterministic, replayable, and observable in their dashboard.

The convex-side WebSocket bridge (web/scripts/discord-bridge.ts) still
exists for sub-second latency demos. The two listeners are
complementary: convex's bridge gives instant reply latency; Tensorlake
gives "no laptop, no fly.io, runs in the cloud forever, demonstrates
durable scheduled agentic infra."

# Deploy

  pip install tensorlake
  export TENSORLAKE_API_KEY=tl_apiKey_...
  tl secrets set \
      DISCORD_BOT_TOKEN=... \
      DISCORD_BOT_USER_ID=... \
      CONVEX_URL=https://necessary-leopard-395.convex.site \
      DISCORD_LISTEN_CHANNELS=123,456 \
      DISCORD_BRIDGE_SECRET=...   # optional, must match convex env
  tl deploy tensorlake/discord-listener/listener.py

  # then arm the cron (60s minimum):
  curl -X POST \
      -H "Authorization: Bearer $TENSORLAKE_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"cron_expression":"* * * * *"}' \
      https://api.tensorlake.ai/applications/angel_discord_listener/cron-schedules

See README.md for full deploy walkthrough.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from tensorlake.applications import application, function

DISCORD_API_BASE = "https://discord.com/api/v10"

# Per-channel poll cap — Discord allows up to 100. We use 20 to keep the
# request cheap and avoid hammering Discord if we fall behind. Even at 60s
# cron cadence + 20msg/round, we can drain 1200 msg/min/channel, far above
# any realistic chat rate.
POLL_LIMIT = 20

# Hard cap on how many channels we'll poll in one invocation. Tensorlake
# functions have a default timeout; we want each invocation to finish
# comfortably within 60s so it doesn't overlap the next firing.
MAX_CHANNELS_PER_INVOCATION = 25


# ──────────────────────────────────────────────────────────────────────
# tiny http helpers — stdlib only so the tensorlake image stays minimal
# ──────────────────────────────────────────────────────────────────────


def _http(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: float = 10.0,
) -> tuple[int, dict[str, Any] | list[Any] | str | None]:
    """Minimal urllib wrapper. Returns (status, parsed-json-or-text-or-None)."""
    data = None
    h = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h.setdefault("content-type", "application/json")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            ct = resp.headers.get("content-type", "")
            if "json" in ct:
                try:
                    return resp.status, json.loads(raw) if raw else None
                except json.JSONDecodeError:
                    return resp.status, raw
            return resp.status, raw or None
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace") if err.fp else ""
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        return err.code, parsed
    except urllib.error.URLError as err:
        return 0, f"network error: {err}"


# ──────────────────────────────────────────────────────────────────────
# convex cursor state — durable memory layer
# ──────────────────────────────────────────────────────────────────────


def convex_get_cursors(convex_base: str, secret: str | None) -> dict[str, str]:
    """Read all known per-channel cursors. Returns { channelId: lastMessageId }."""
    headers: dict[str, str] = {}
    if secret:
        headers["x-bridge-secret"] = secret
    status, payload = _http(
        "GET", f"{convex_base}/discord/listener-cursor/get", headers=headers
    )
    if status != 200 or not isinstance(payload, dict):
        print(f"[cursor.get] {status} {payload!r}")
        return {}
    cursors_obj = payload.get("cursors") or {}
    out: dict[str, str] = {}
    if isinstance(cursors_obj, dict):
        for channel_id, row in cursors_obj.items():
            if isinstance(row, dict) and isinstance(row.get("lastMessageId"), str):
                out[channel_id] = row["lastMessageId"]
    return out


def convex_set_cursor(
    convex_base: str,
    secret: str | None,
    channel_id: str,
    last_message_id: str,
    invocation_id: str,
) -> bool:
    """Advance the high-water mark for one channel. Returns True on success."""
    headers: dict[str, str] = {}
    if secret:
        headers["x-bridge-secret"] = secret
    status, payload = _http(
        "POST",
        f"{convex_base}/discord/listener-cursor/set",
        headers=headers,
        body={
            "channelId": channel_id,
            "lastMessageId": last_message_id,
            "invocationId": invocation_id,
        },
    )
    if status != 200:
        print(f"[cursor.set] {channel_id} {status} {payload!r}")
        return False
    return True


def convex_relay_message(
    convex_base: str,
    secret: str | None,
    *,
    message_id: str,
    channel_id: str,
    guild_id: str | None,
    author_id: str,
    author_username: str | None,
    content: str,
    trigger: str,
) -> bool:
    """Hand a triggering message to convex's orchestrator. Fire-and-mostly-forget."""
    headers: dict[str, str] = {}
    if secret:
        headers["x-bridge-secret"] = secret
    status, payload = _http(
        "POST",
        f"{convex_base}/discord/passive-message",
        headers=headers,
        body={
            "messageId": message_id,
            "channelId": channel_id,
            "guildId": guild_id,
            "authorId": author_id,
            "authorUsername": author_username,
            "content": content,
            "trigger": trigger,
        },
    )
    if status != 200:
        print(f"[relay] {channel_id} msg={message_id} {status} {payload!r}")
        return False
    return True


# ──────────────────────────────────────────────────────────────────────
# discord rest helpers
# ──────────────────────────────────────────────────────────────────────


def discord_fetch_channel_messages(
    bot_token: str, channel_id: str, after_id: str | None
) -> list[dict[str, Any]]:
    """GET /channels/{id}/messages — returns oldest-first after sort."""
    params = {"limit": str(POLL_LIMIT)}
    if after_id:
        params["after"] = after_id
    qs = urllib.parse.urlencode(params)
    url = f"{DISCORD_API_BASE}/channels/{channel_id}/messages?{qs}"
    status, payload = _http(
        "GET", url, headers={"authorization": f"Bot {bot_token}"}, timeout=10.0
    )
    if status != 200 or not isinstance(payload, list):
        print(f"[discord.messages] {channel_id} {status} {payload!r}")
        return []
    # Discord returns newest-first; flip to oldest-first so we process in order
    # and the cursor advances monotonically.
    msgs = list(payload)
    msgs.sort(key=lambda m: int(m.get("id", "0")))
    return msgs


def discord_seed_cursor(bot_token: str, channel_id: str) -> str | None:
    """First-ever poll on a channel — fetch the latest message id and seed the
    cursor without relaying anything. We only want to react to messages sent
    AFTER we started watching, not historical chat."""
    url = f"{DISCORD_API_BASE}/channels/{channel_id}/messages?limit=1"
    status, payload = _http(
        "GET", url, headers={"authorization": f"Bot {bot_token}"}, timeout=10.0
    )
    if status != 200 or not isinstance(payload, list) or not payload:
        return None
    return payload[0].get("id") if isinstance(payload[0], dict) else None


def discord_open_dm_channels(bot_token: str) -> list[str]:
    """GET /users/@me/channels — list of currently-open DM channels for the bot.

    Discord doesn't push these on DM-create unless you have the gateway
    open, so polling /users/@me/channels is the only REST-only way to
    discover them."""
    url = f"{DISCORD_API_BASE}/users/@me/channels"
    status, payload = _http(
        "GET", url, headers={"authorization": f"Bot {bot_token}"}, timeout=10.0
    )
    if status != 200 or not isinstance(payload, list):
        print(f"[discord.dms] {status} {payload!r}")
        return []
    return [
        ch["id"]
        for ch in payload
        if isinstance(ch, dict) and isinstance(ch.get("id"), str)
        # type 1 = DM, 3 = group DM. Only DMs.
        and ch.get("type") in (1, 3)
    ]


# ──────────────────────────────────────────────────────────────────────
# trigger logic — same shape as web/scripts/discord-bridge.ts
# ──────────────────────────────────────────────────────────────────────


def message_trigger(
    msg: dict[str, Any], *, bot_user_id: str, listen_channels: set[str]
) -> tuple[bool, str, str]:
    """Decide if a Discord message should provoke a reply.

    Returns (should_reply, trigger_reason, content_with_mention_stripped).

    Rules (mirror discord-bridge.ts):
      - never reply to bots (including ourselves)
      - reply if it's a DM (no guild_id)
      - reply if the bot is @-mentioned (mentions array contains our id)
      - reply if it's a "reply" to one of our messages
      - reply if the message lives in a configured listen channel
      - otherwise ignore
    """
    author = msg.get("author") or {}
    if author.get("bot") or author.get("id") == bot_user_id:
        return False, "self_or_bot", ""

    raw = msg.get("content") or ""
    guild_id = msg.get("guild_id")
    channel_id = str(msg.get("channel_id", ""))

    # DM — no guild_id present on DM messages
    if not guild_id:
        return True, "dm", raw.strip()

    # Mentions — Discord includes a mentions[] array of user objects
    mentions = msg.get("mentions") or []
    if any(isinstance(u, dict) and u.get("id") == bot_user_id for u in mentions):
        # strip <@bot_id> and <@!bot_id> from the content for cleaner prompts
        cleaned = (
            raw.replace(f"<@{bot_user_id}>", "")
            .replace(f"<@!{bot_user_id}>", "")
            .strip()
        )
        return True, "mention", cleaned

    # Replying to one of our messages — referenced_message.author.id == us
    ref = msg.get("referenced_message")
    if isinstance(ref, dict):
        ref_author = ref.get("author") or {}
        if ref_author.get("id") == bot_user_id:
            return True, "reply_to_bot", raw.strip()

    # Listen channel — respond to every non-bot msg here
    if channel_id in listen_channels:
        return True, "listen_channel", raw.strip()

    return False, "no_trigger", ""


# ──────────────────────────────────────────────────────────────────────
# the application — invoked by tensorlake cron every 60s
# ──────────────────────────────────────────────────────────────────────


@application()
@function(
    secrets=[
        "DISCORD_BOT_TOKEN",
        "DISCORD_BOT_USER_ID",
        "CONVEX_URL",
        "DISCORD_LISTEN_CHANNELS",
        "DISCORD_BRIDGE_SECRET",
    ],
    timeout=55,
)
def discord_listener(_input: str = "tick") -> dict[str, Any]:
    """One poll round. Returns a small structured report so the Tensorlake
    dashboard execution history shows what happened on each firing —
    judges can scroll the run log and see actual numbers."""

    started_at = time.time()
    invocation_id = f"tl-{int(started_at)}"

    bot_token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
    bot_user_id = os.environ.get("DISCORD_BOT_USER_ID", "").strip()
    convex_base = os.environ.get("CONVEX_URL", "").strip().rstrip("/")
    listen_channels_csv = os.environ.get("DISCORD_LISTEN_CHANNELS", "").strip()
    bridge_secret = os.environ.get("DISCORD_BRIDGE_SECRET", "").strip() or None

    if not bot_token or not bot_user_id or not convex_base:
        return {
            "ok": False,
            "error": "missing one of DISCORD_BOT_TOKEN / DISCORD_BOT_USER_ID / CONVEX_URL",
            "invocation_id": invocation_id,
        }

    # Coerce convex base to the .convex.site host (HTTP actions live there,
    # not on .convex.cloud which is the function-call endpoint).
    convex_base = convex_base.replace(".convex.cloud", ".convex.site")

    listen_channels = {
        c.strip() for c in listen_channels_csv.split(",") if c.strip()
    }

    # Discover DM channels too — Discord doesn't push DM lists, so we ask.
    dm_channels = discord_open_dm_channels(bot_token)

    # All channels we might process this round. De-duped and capped.
    all_channels = list(dict.fromkeys([*listen_channels, *dm_channels]))[
        :MAX_CHANNELS_PER_INVOCATION
    ]

    if not all_channels:
        return {
            "ok": True,
            "invocation_id": invocation_id,
            "channels": 0,
            "note": "no channels to poll — set DISCORD_LISTEN_CHANNELS or DM the bot",
            "elapsed_ms": int((time.time() - started_at) * 1000),
        }

    cursors = convex_get_cursors(convex_base, bridge_secret)

    per_channel_report: list[dict[str, Any]] = []
    total_relayed = 0

    for channel_id in all_channels:
        cursor = cursors.get(channel_id)

        # Cold-start: don't replay history. Seed the cursor at the most
        # recent message so we only react to NEW chat going forward.
        if cursor is None:
            seed = discord_seed_cursor(bot_token, channel_id)
            if seed:
                convex_set_cursor(
                    convex_base, bridge_secret, channel_id, seed, invocation_id
                )
                per_channel_report.append(
                    {"channel": channel_id, "seeded": seed, "relayed": 0}
                )
            else:
                per_channel_report.append({"channel": channel_id, "seeded": None})
            continue

        msgs = discord_fetch_channel_messages(bot_token, channel_id, cursor)
        if not msgs:
            per_channel_report.append(
                {"channel": channel_id, "polled": 0, "relayed": 0}
            )
            continue

        relayed = 0
        # We always advance the cursor to the newest id we saw, even for
        # messages we chose not to relay (bot chatter, no-trigger). That way
        # we don't re-evaluate them next round.
        new_cursor = cursor
        for msg in msgs:
            msg_id = str(msg.get("id", ""))
            if not msg_id:
                continue
            new_cursor = msg_id  # msgs are sorted oldest-first

            should_reply, trigger, content = message_trigger(
                msg, bot_user_id=bot_user_id, listen_channels=listen_channels
            )
            if not should_reply or not content:
                continue

            author = msg.get("author") or {}
            ok = convex_relay_message(
                convex_base,
                bridge_secret,
                message_id=msg_id,
                channel_id=channel_id,
                guild_id=msg.get("guild_id"),
                author_id=str(author.get("id", "")),
                author_username=author.get("username"),
                content=content,
                trigger=trigger,
            )
            if ok:
                relayed += 1

        # Persist the new high-water mark so next firing skips these msgs.
        if new_cursor != cursor:
            convex_set_cursor(
                convex_base, bridge_secret, channel_id, new_cursor, invocation_id
            )

        per_channel_report.append(
            {
                "channel": channel_id,
                "polled": len(msgs),
                "relayed": relayed,
                "cursor_to": new_cursor,
            }
        )
        total_relayed += relayed

    elapsed_ms = int((time.time() - started_at) * 1000)
    print(
        f"[listener] inv={invocation_id} channels={len(all_channels)} "
        f"relayed={total_relayed} elapsed_ms={elapsed_ms}"
    )

    return {
        "ok": True,
        "invocation_id": invocation_id,
        "channels": len(all_channels),
        "relayed": total_relayed,
        "report": per_channel_report,
        "elapsed_ms": elapsed_ms,
    }


# ──────────────────────────────────────────────────────────────────────
# local smoke test — `python listener.py` to exercise one round on your
# laptop before deploying. requires the same env vars set in your shell.
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    out = discord_listener("local-smoke")
    print(json.dumps(out, indent=2))
