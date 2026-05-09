# submission form materials — fill at 5:50pm

## form url
https://forms.gle/fkoFXRo3L2MVkkz87

## fields

**team:**
- stephen hung — stephenhung@berkeley.edu
- matthew kim — matthewykim23@gmail.com

**track:**
always-on agents (nia + tensorlake)

**deployed url:**
https://angel-swipe.vercel.app

(this is the clean alias — auto-tracks the latest production deploy)

**github repo:**
https://github.com/stephenhungg/angel

**one-paragraph blurb (the elevator pitch):**

> Angel is a personal AI companion you don't prompt — you discover. Swipe through 3 rounds of vision-tagged anime girl avatars, converge on her via real vector math, and meet her writing her own character bible in real time. She lives in a 3D room on your machine: walks, sits, types, ships code via headless Codex, verifies before celebrating, and remembers everything you do together via Nia. While you were away she watched your repo through Tensorlake — the "how'd that portfolio thing land?" callback hits because she actually knew. Same memory across surfaces: text her phone, the conversation continues; reopen the laptop, you're back where you left off. The pitch isn't autonomy ("she ships your tasks") — it's presence ("she sits at the desk with you for 8 hours and you don't feel alone"). Built with Nia for memory, Tensorlake for background ingestion, Convex for always-on receipts, real Codex for shipping, and Twilio/Sendblue for the SMS body.

**alt 1-sentence pitch (if form has a TL;DR field):**

> the next agent paradigm isn't about completing more tasks — it's about not being alone for 8 hours while you do them.

## sponsor receipts (in case form asks)

| sponsor | how we used it | proof |
|---|---|---|
| Nia | semantic memory store — episodic events + relevant retrieval per turn + active recall_memory tool calls | `desktop/electron/agent/memory/nia.ts`, real api calls to apigcp.trynia.ai/v2 |
| Tensorlake | bg ingestion of user's portfolio repo — structured extraction surfaces findings in boot greeting | `desktop/electron/agent/tensorlake/{client,bg-jobs}.ts`, real api calls to api.tensorlake.ai |

## demo url for live judging

if judges want to test the live demo themselves:
- web flow: paste vercel url, full swipe + reveal works
- desktop: matthew's machine has electron running, full agentic arc demoable
- sms (if twilio configured): hand them a phone, text [angel phone number] — she replies in 5 sec

## what NOT to put in the form

- the architecture diagram (no one reads it)
- "transformer" or "embedding" or "vector space"
- apologies or caveats
- our AI tooling stack ("we used claude") — the focus is the user-facing thing

## final checklist before submitting

- [ ] vercel url loads, /swipe works, /reveal works
- [ ] team emails correct
- [ ] track selected: always-on agents
- [ ] github repo is public OR access granted to judges
- [ ] blurb pasted (above)
- [ ] **submitted by 5:55 pm** (5 min before deadline buffer)
