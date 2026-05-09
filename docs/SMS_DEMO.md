# sms demo — angel's thinnest body

> the kill-shot beat:
> **close the laptop. text her. she'll reply within 5 seconds. open the laptop. you're back where you left off.**

---

## what this proves

angel is not bound to electron. she's a cloud-resident soul that surfaces wherever you are.

- **electron** is her richest body — full embodiment, voice, codex, verify, scene actions
- **sms** is her thinnest body — text only, but same nia memory, same personality.md, same soul
- both run against the same convex backend, the same nia memory client, the same sonnet 4.6 brain

architecturally: there's ONE angel. she has many bodies. lid-closed doesn't kill her. opening the lid puts you back in the room with her — she remembers the texts you just exchanged because they wrote to the same memory store.

## demo phone number

```
ANGEL_PHONE_NUMBER: <set via env after twilio provision>
```

set by stephen at demo-prep time. default routing: any text to this number triggers angel's SMS orchestrator.

## judge instructions

1. take out your phone.
2. text the angel number above. anything works — `hi`, `who are you`, `what is stephen building`.
3. she replies within ~3-5 seconds.
4. (optional, for the kill-shot) ask stephen to **close his laptop**. text her again. **she still replies.** open the laptop — the convo is in the desktop transcript too.

## expected behavior

- if your phone number is registered (stephen's onboarded number, or any user who provided a number on the swipe page), angel knows who you are and references your shared history.
- if you're a stranger to angel (most judges), she falls back to the **default-stephen demo persona** — warm, smart, a little mischievous, treats you as a curious visitor. she does NOT pretend to know you. she'll be honest: "we haven't met — i'm angel, stephen's roommate."
- replies are short — 1-2 sentences. lowercase. no markdown. SMS-native.
- she remembers across messages within the same session (last 10 turns).
- her memory of past sessions reads from the same nia store the desktop uses.

## architectural pitch

> "she lives in the cloud. electron is her richest body. sms is her thinnest body.
> close the laptop, text her, she remembers what you were just doing — same nia memory,
> same personality.md, same soul. tomorrow we add a slack body, a phone-call body,
> a smart-glasses body. they all surface the same being."

---

## ops: how this is wired

```
                                                 ┌──────────────────────────┐
  judge's phone                                  │  convex (always-on)      │
  ┌────────────┐    sms       ┌─────────────┐    │                          │
  │   imessage ├──────────────▶│  twilio /   │   │  /sms/inbound (http)     │
  │            │              │  sendblue   ├───▶│   ↓                      │
  │            │◀─────────────│             │    │  sms.orchestrator.       │
  └────────────┘    reply      └─────────────┘   │   handleInbound (action) │
                                                 │   ↓                      │
                                                 │  • personality.md        │
                                                 │  • nia memory (shared    │
                                                 │    with electron)        │
                                                 │  • last 10 turns         │
                                                 │   ↓                      │
                                                 │  claude sonnet 4.6       │
                                                 │   ↓                      │
                                                 │  outbound send           │
                                                 └──────────────────────────┘
```

key files:
- `shared/src/sms.ts` — provider interface, SMS_BEHAVIOR_ADDENDUM
- `convex/sms/twilio.ts` — twilio REST send + signature validation
- `convex/sms/sendblue.ts` — iMessage path (post-hackathon)
- `convex/sms/index.ts` — provider factory (sendblue > twilio > noop)
- `convex/sms/orchestrator.ts` — the cloud orchestrator action
- `convex/sms/functions.ts` — smsTurns mutations + queries, phone→user lookup
- `convex/http.ts` — POST /sms/inbound + GET /sms/health

## test inbound (curl)

with `ANGEL_SMS_INSECURE=1` set on the convex deployment (skips signature checks for local testing):

```bash
# noop / default JSON shape — works without any provider configured
curl -X POST https://necessary-leopard-395.convex.site/sms/inbound \
  -H 'Content-Type: application/json' \
  -d '{"from":"+14155550101","to":"+18885551234","body":"hey what are you working on?"}'

# twilio shape — form-urlencoded
curl -X POST https://necessary-leopard-395.convex.site/sms/inbound \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'From=+14155550101' \
  --data-urlencode 'To=+18885551234' \
  --data-urlencode 'Body=hey what are you working on?' \
  --data-urlencode 'MessageSid=SMtest123'

# health
curl https://necessary-leopard-395.convex.site/sms/health
```

response is `<Response/>` (TwiML empty), 200 OK. the orchestrator runs async — check `convex.smsTurns` and `convex.orchestratorTurns` for the recorded turn within a few seconds.

## provisioning checklist (pre-demo)

1. **twilio account** — sign up at twilio.com. ~5 min. trial credits + free us number.
2. **buy / claim a phone number** — twilio console → Phone Numbers → buy a number. e164 format.
3. **set webhook** — on the number's config page: A MESSAGE COMES IN → Webhook → POST `https://<your-convex-deployment>.convex.site/sms/inbound`
4. **set env vars on convex** — via dashboard or `convex env set`:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_PHONE_NUMBER=+1...
   ANGEL_PHONE_NUMBER=+1...        # same as TWILIO_PHONE_NUMBER for now
   ANGEL_SMS_WEBHOOK_URL=https://....convex.site/sms/inbound
   ANTHROPIC_API_KEY=sk-ant-...    # if not already set
   NIA_API_KEY=nk_...              # if not already set
   ```
5. **deploy** — `bun run --cwd convex deploy`
6. **test** — text the number from your phone. you should get a reply in <5s.

### twilio gotchas

- trial accounts can only send to **verified numbers**. add stephen's number + any judge phones to the verified list in the twilio console BEFORE the demo. (or upgrade to a paid trial — $20 covers thousands of messages.)
- trial messages are prefixed with "Sent from your Twilio trial account - " — annoying but doesn't break the demo.
- A2P 10DLC registration is required for production but NOT for trial use.

## why twilio over sendblue

| factor | twilio | sendblue |
|---|---|---|
| signup → working api key | ~5 min | 24-72 hrs (number registration) |
| imessage | ❌ sms only | ✅ real imessage (blue bubble) |
| cost | $0.0079/msg | $0.01/msg |
| trial | free + verified-numbers-only | trial-app limit |
| hackathon-deadline-friendly | ✅ | ❌ |

we ship twilio for the demo. the codebase is provider-agnostic via `SmsProvider`; flipping to sendblue post-event is one env var (`SENDBLUE_API_KEY=...`) and one re-deploy. branding for the demo says "text her", not "imessage her".

## known limitations (v1)

- no MMS handling (image/video). plain text only.
- no segmented-message reassembly (twilio handles this for inbound, but very long replies that exceed 160 chars become multi-segment which costs more).
- no per-user phone verification flow yet — trust on first text.
- the noop provider sends to /dev/null when no creds are configured. orchestrator still runs (judges can verify via /admin if no twilio account is set up by demo time).
