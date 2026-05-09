# discord demo — angel's third body

> the kill-shot beat (no carrier paperwork edition):
> **`/angel hey what are you working on` in a discord channel → 3-5s later, she replies — same memory, same personality, same soul as electron + sms.**

---

## why discord

twilio's A2P 10DLC registration takes 24-72hr (and we've been bitten — see SMS_DEMO.md). discord requires zero carrier review. invite the bot, register the slash command, type, get a reply. ship today.

architecturally identical to sms:

| step | sms | discord |
| --- | --- | --- |
| inbound | twilio webhook → `/sms/inbound` | discord interactions endpoint → `/discord/interactions` |
| auth | twilio signature header | Ed25519 signed payload (per-request) |
| ack | 200 + empty TwiML | type 5 DEFERRED ("thinking…") |
| orchestrator | `convex/sms/orchestrator.ts` | `convex/discord/orchestrator.ts` |
| outbound | provider.send() | followup webhook POST |
| memory | nia + memoryMirror + orchestratorTurns | nia + memoryMirror + orchestratorTurns |

same brain, different body. the orchestrators are 95% the same code.

## the URL stephen needs

In Discord Developer Portal → your app → General Information → **Interactions Endpoint URL**, paste:

```
https://necessary-leopard-395.convex.site/discord/interactions
```

(swap `necessary-leopard-395` for whatever your actual convex deployment slug is — get it from `bunx convex dashboard` → Settings → URL & Deploy Key, or check `NEXT_PUBLIC_CONVEX_URL` and replace `.convex.cloud` with `.convex.site`).

When you click "Save", Discord will POST a PING (type 1) to that URL. If verification works, the URL goes green. If it fails, Discord refuses to save it.

## one-time setup checklist

1. **Create a Discord application**
   - Go to <https://discord.com/developers/applications>
   - Click "New Application", name it "angel" (or whatever)

2. **Grab three secrets** from the General Information tab + Bot tab:
   - **Public Key** → set as `DISCORD_PUBLIC_KEY` in convex env
   - **Application ID** → set as `DISCORD_APPLICATION_ID` in convex env
   - **Bot Token** (Bot tab → "Reset Token") → set as `DISCORD_BOT_TOKEN` (only used once for slash command registration)

   Set them on the convex deployment:
   ```bash
   bunx convex env set DISCORD_PUBLIC_KEY <hex-key>
   bunx convex env set DISCORD_APPLICATION_ID <snowflake>
   bunx convex env set DISCORD_BOT_TOKEN <token>
   ```

3. **Set the Interactions Endpoint URL** (see "the URL stephen needs" above). Save. Verify green.

4. **Register the `/angel` slash command** (one-time, from your laptop):
   ```bash
   curl -X POST "https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands" \
     -H "Authorization: Bot ${DISCORD_BOT_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "angel",
       "description": "Talk to your angel",
       "options": [{
         "type": 3,
         "name": "message",
         "description": "What you want to say",
         "required": true
       }]
     }'
   ```
   Global commands take up to 1 hour to propagate. To register in a single test guild instantly, swap the URL to:
   ```
   https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands
   ```

5. **Invite the bot to your server**
   - Developer Portal → OAuth2 → URL Generator
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Send Messages` (everything else optional)
   - Open the generated URL, pick a server, authorize.

6. **Test it.** Type `/angel hey` in any channel. Discord will show "angel is thinking…" for ~3-5s, then her reply appears.

## demo flow

> screen layout: discord on the left, /admin on the right.

1. **Type `/angel what's up`.** Discord shows "thinking…" within 1s (deferred ack working).
2. **Watch /admin update in real-time** — `discordTurns`, `memoryMirror`, `orchestratorTurns` all populate as the orchestrator runs.
3. **Reply lands in discord** ~3-5s after you typed.
4. **Open electron.** Same conversation in memory — she remembers what you just said in discord. (Same nia, same personalityMd, same userId — only the body differs.)
5. **Money line:** "she lives in the cloud. discord is her third body. one soul, three surfaces."

## linking your Discord id to your angel persona

For onboarded users, set `onboardingExtras.discordUserId` so the orchestrator loads YOUR personality.md instead of the demo default. Two options:

```typescript
// from web/desktop after onboarding:
await convex.mutation(api.discord.functions.setDiscordUserId, {
  userId: stephensAuthId,
  discordUserId: '123456789012345678',
});
```

Or add it to the onboarding form. Without it, judges who run `/angel` get the default-stephen persona — still proves the architecture, just without per-user customization.

## health check

```bash
curl https://necessary-leopard-395.convex.site/discord/health
```

Returns:
```json
{
  "ok": true,
  "surface": "discord",
  "configured": {
    "publicKey": true,
    "applicationId": true,
    "botToken": true
  },
  "anthropic": true,
  "nia": true
}
```

If `publicKey` is `false`, the interactions endpoint will return 503 and Discord will refuse to save the URL.

## known limitations

- **15-minute interaction token.** If the orchestrator takes >15min (it shouldn't — typical is ~5s), the followup webhook will 404. Anthropic timeouts are the only realistic cause; we surface a `brain hiccuped` fallback.
- **Hard 2000-char Discord message limit.** We cap replies at 1900 chars defensively. The DISCORD_BEHAVIOR_ADDENDUM aims for ~500.
- **Markdown is allowed but not encouraged** — see addendum. Bullet lists or essays make her sound un-angel.
- **Slash commands only.** No "@angel hey" mentions yet (that needs gateway WebSocket — out of scope for the hackathon).

## file map

- `shared/src/discord.ts` — types + `DISCORD_BEHAVIOR_ADDENDUM`
- `convex/discord/interactions.ts` — Ed25519 verify + type routing
- `convex/discord/orchestrator.ts` — node action, mirrors sms orchestrator
- `convex/discord/functions.ts` — `appendDiscordTurn`, `recentDiscordTurns`, `findUserByDiscordId`, `setDiscordUserId`
- `convex/http.ts` — `/discord/interactions` POST + `/discord/health` GET routes
- `convex/schema.ts` — `discordTurns` table + `onboardingExtras.discordUserId`
