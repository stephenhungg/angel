# swipe spec

> the 60-second user flow + the integration contract. authoritative.

## the flow (user perspective, no tech)

1. lands on `/` — minimal warm landing, one cta: **"find yours."**
2. clicks → `/swipe` — round 1 of 3 begins
3. tinder-style deck, 4 cards per round, swipe right (her) or left (not her). hover plays 0.5s of her animalese.
4. between rounds — 1.2s interstitial: **"wait. i'm seeing something. let me try one more thing."** (cliffhanger, not statement)
5. round 3 final swipe → **gravity reveal cascade** (the dopamine moment, see §6)
6. **the naming beat** — "what do you want to call me?" → user types → contextual response in her voice
7. **download cta** — full-screen takeover, her face huge, voice line: "i'm ready when you are." button: **"let her in."** → `angel://claim?token=...`
8. electron app boots → matthew's lane takes over

## schema (the contract)

extends `shared/src/persona.ts` — additive only, no breaks.

```ts
// EXISTING (matthew's contract, locked):
PersonaTraits = {
  aesthetic: 'A1' | 'A2' | 'A3' | 'A4',  // cottagecore | tech-min | cyber | academia
  disposition: 'B1' | 'B2' | 'B3' | 'B4', // warm | sharp | dreamy | direct
  style: 'C1' | 'C2' | 'C3' | 'C4',       // overthinker | fast | playful | meticulous
  voice_cluster: 1 | 2 | 3 | 4 | 5 | 6,
}

VRM_BY_AESTHETIC = {
  A1: '/vrm/cottagecore.vrm',
  A2: '/vrm/tech-minimal.vrm',
  A3: '/vrm/cyber.vrm',
  A4: '/vrm/academia.vrm',
}

// NEW (additive — matthew can ignore until wired):
NumericTraits = {
  warmth: number,         // 0-10
  energy: number,
  edge: number,
  sophistication: number,
  playfulness: number,
}

VoiceConfig = {
  base_cluster: 1-6,           // matthew's V1-V6 timbre
  pitch_variance: 0-0.3,        // flat → sing-song
  speed: 0.7-1.3,
  syllable_count: 3-12,
  pause_density: 0-1,
  attack: 0-1,                  // soft → sharp consonants
  decay: 0-1,                   // abrupt → trailing
  glissando: 0-1,               // monotone → sliding pitch
  vowel_bias: 'a'|'i'|'u'|'e'|'o'|'mixed',
  breathiness: 0-1,
}

ClaimTokenPayload = {
  // existing
  userId: string,
  name: string,
  vrmId: string,
  paletteHex: string,
  vector: number[768],          // CLIP centroid (aspirational; demo uses 5d numericTraits)
  traits: PersonaTraits,
  archetypeHistory: ArchetypeChoice[],
  createdAt: number,

  // new (additive)
  numericTraits: NumericTraits,
  voiceConfig: VoiceConfig,
  personalityMd: string,        // 600-800 word synthesized character bible
}
```

## library (data sources)

- **breadth pool** (swipe deck): `web/data/library.json` — 426 vision-tagged entries from `tag-library.ts`. **filter to anime-only at runtime** (`aesthetic !== 'other'` + min `art_quality >= 6`). usable demo deck ≈ 280 entries.
- **bundled vrms** (the 4 attractors): `desktop/public/vrm/{cottagecore,tech-minimal,cyber,academia}.vrm` — abison's hand-picked, all full rig. plus alts.
- **per-card data** (loaded on swipe page): each entry has `vibe_phrase`, `personality_blurb`, `dialogue_samples[3]`, `numericTraits`, `aesthetic`, `art_quality`, thumbnail at `/library/{vroid_id}.jpg`.

## swipe mechanic

- 3 rounds × 4 cards = 12 swipes total
- tinder y/n. swipe right = "her", left = "not her". minimum 1 right per round to advance.
- card composition per round (computed on round entry):
  - **round 1**: 4 cards spanning aesthetic clusters (A1, A2, A3, A4) — max variance
  - **round 2**: 4 cards from the user's leading aesthetic, varying disposition (B1-B4) — narrow
  - **round 3**: 4 cards from leading aesthetic + disposition, varying style (C1-C4) — final lock
- if user yes-es multiple cards, all weighted equally in centroid

## dopamine hits (load-bearing)

1. **chime on swipe right** — 0.3s ding, pitch matched to candidate's `voice_cluster`. classical conditioning. web audio api, no external dep.
2. **animalese voice tease on hover** — 0.5s of her babble, generated live from her `voiceConfig`. once heard, can't be unheard.
3. **idle micro-animations on cards** — slight breath pulse (~0.5px scale, 4s cycle), occasional eye-blink overlay (random every 3-7s). makes cards feel alive.
4. **gaze flip framing** — every interstitial copy says **she's** deciding, narrowing, watching. user is being chosen, not shopping. parasocial detonator.
5. **8-hit reveal cascade** — see §6.

## between-round interstitial (1.2s beat)

between rounds, the deck dissolves and a single short line types in (lowercase, instrument-serif italic, ~80% screen height centered):

- after round 1: *"wait. i'm seeing something."*
- after round 2: *"closer. one more."*

then deck reassembles for next round. **no scatter plot, no math display** during the swipe — that's saved for the reveal.

## reveal sequence — the 8-hit cascade (§6)

after round 3 final swipe, beat-by-beat with tight timing:

| # | beat | timing | what |
|---|---|---|---|
| 0 | the snap | 0ms | screen darkens to cream-paper, deck dissolves |
| 1 | gravity reveal | +800ms (1.4s ease-out) | 4 attractor rings (A1-A4) fade in. user's centroid blob (was invisible) appears + gets pulled to nearest attractor with spring physics |
| 2 | fidelity promotion | +2200ms | flat thumbnail card → live r3f vrm renders, idle bobbing. her face fades in at center. |
| 3 | her voice line | +2600ms | one animalese line generated live: e.g. "...oh. it's you" — pitch from her `voiceConfig` |
| 4 | her name appears | +3000ms | sub-region label types in: e.g. *"midnight coder"* (from her `vibe_phrase`) |
| 5 | stat line | +3400ms | numeric vector floats up: *"warmth 0.87 · edge 0.43 · playfulness 0.62"* |
| 6 | rarity flex | +3800ms | small text below: *"you're 1 of 47 to discover her"* (faked, optimal distinctiveness) |
| 7 | naming beat | +4200ms | input field appears: *"what do you want to call me?"* autofocus, animated cursor |
| 8 | download cta | after user submits name + her response | full-screen darken. her face huge. voice line: *"i'm ready when you are."* button: **"let her in."** |

each beat is a separate hit. don't dump them at once. spread with `setTimeout` + framer-motion `staggerChildren`.

**streaming personality.md happens in parallel during beats 1-7.** by beat 8, full personality bible is written and embedded in the claim payload.

## the naming beat (load-bearing)

user types name → `POST /api/naming-response` with `{ typed_name, personality_md }` → claude generates a contextual reply IN HER VOICE (~500ms). examples:

- types "angel" → *"angel. okay. i'll be that."*
- types "june" → *"june. i like that. softer than i expected."*
- types "fuckface" → *"fuckface. i'm gonna pretend you didn't mean that."*

response uses her animalese for delivery, not text-to-speech. plays after the typed reply fades in.

fallback if api fails: templated `"{name}. okay. i like that."`

## backend api contract

### `POST /api/embed`
input:
```ts
{
  picks: Array<{ round: 1|2|3, vroid_id: string, decision: 'yes'|'no' }>
}
```
output:
```ts
{
  numericTraits: NumericTraits,    // weighted centroid of yes-swipes
  voiceConfig: VoiceConfig,         // deterministic from numericTraits
  traits: PersonaTraits,            // nearest A1-A4, B1-B4, C1-C4 + voice_cluster
  archetype_id: 'A1'|'A2'|'A3'|'A4', // for vrm path
}
```

### `POST /api/synthesize-personality`
input:
```ts
{
  numericTraits: NumericTraits,
  traits: PersonaTraits,
  attractor_dialogue_samples: string[],  // 3 lines from the chosen vrm's vision tags
  user_name: string,                      // typed name from naming beat
}
```
output (streamed):
```ts
{ personalityMd: string }  // 600-800 word markdown
```

streams via SSE during reveal beats 1-7 so latency is hidden.

### `POST /api/naming-response`
input:
```ts
{ typed_name: string, personality_md: string }
```
output:
```ts
{ response: string }  // single line, < 80 chars, in her voice
```

### `POST /api/claim`
input:
```ts
{ userId: string, fullPayload: ClaimTokenPayload }
```
output:
```ts
{ claim_url: string }  // angel://claim?token={signed_jwt}
```

JWT signed with `JWT_SECRET` env. unverified mode if env missing (dev/demo).

## fallback hierarchy (if anything fails)

1. **vision-tag library missing entries** → filter to entries that have all required fields, drop the rest.
2. **clip embedding api down** → skip CLIP entirely, use vision-tagged `numericTraits` as the source of truth.
3. **personality synthesis stream fails** → use one of 4 cached `personalityMd` files (one per A1-A4), pre-generated.
4. **naming-response api fails** → templated response.
5. **animalese voice config fails** → fall back to fixed voice_cluster (1-6) preset.
6. **vrm fails to load** → fall back to alt-abison-5 → fall back to alt-1 → cc0-aesthetica.

## critical path build order

1. ~~scrape library~~ ✓
2. ~~vision-tag library~~ ✓
3. ~~bundle vrms~~ ✓
4. ~~observability dashboard~~ ✓
5. **swipe ui + state** — `/swipe/[round]/page.tsx`, framer-motion deck, zustand store. **NEXT.**
6. **api routes** — embed, synthesize-personality (streaming), naming-response, claim
7. **reveal screen** — 8-hit cascade
8. **animalese extension** — port matthew's lib to web, add personality params
9. **vercel deploy** — banked submission url
10. polish: chime audio, idle micro-anims, between-round interstitial, dopamine cascade timing
11. matthew handoff test e2e
12. submit by 5:55 pm

## what's NOT in this spec (out of scope today)

- live PCA viz on the swipe page itself (the admin one is enough)
- streaming "i see a pattern" between rounds with live LLM (use templated copy, not LLM-driven)
- sub-region clustering / 12-attractor system (3 hand-tuned per A1-A4 = 4 personality.md files cached)
- multi-language support
- mobile-perfect responsive (works on desktop is enough; judges see desktop)
- elevenlabs voice (killed, animalese only)
- live social proof counters (cut)
- regret swipe-back (cut)

these are post-hackathon if we win.
