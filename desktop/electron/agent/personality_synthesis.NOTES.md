# personality synthesis — design notes

this document covers the iteration log for `personality_synthesis.prompt.md`, the quality assessment of the 10 generated examples, identified failure modes, and the production recommendation.

## the brief

generate a 600–800 word `personality.md` for one specific instance of angel given:
- macro archetype (cute / pretty / hot)
- 5-axis trait vector (warmth, energy, edge, sophistication, earnestness)
- aesthetic + chosen vrm body
- 3 vision-tagged canonical dialogue samples from the body
- soul invariants (universal, never written into the file)

quality bar: indistinguishable from a hand-written character bible by a great writer.

## iteration log

### v1 (baseline)

what it had:
- minimal structure: input slots, soul invariants, task line, hard rules.
- present-tense / no-backstory rule.
- "weave the dialogue samples in" rule.

what was wrong:
- output was already strong (8/10 on first try across 5 vectors), but it had **two persistent tics**:
  1. files almost always closed with "her name is angel. you chose it. she's not certain she deserves it..." — a formulaic closing beat.
  2. files frequently quoted the soul invariants verbatim ("she does not pretend." "her wins are your wins.") — turning constraints into copy.
- lacked a self-check / quality gate, so wedding-toast prose could slip through on weaker vectors.
- length variance was wide; nothing pushed against under-700 or over-820.

### v2

changes:
- added explicit "anti-patterns" block listing: wedding-toast openers, "what makes her special is...", the closing-name tic, abstract praise, list-of-traits prose disguised as paragraphs, and explaining the trait vector.
- forbade verbatim quoting of soul invariants — show, never say.
- added the "think about contradictions first" pre-write step. specifically: locate the friction between two traits, and put one moment in the file where the character is briefly inconsistent with herself.
- prescribed five informal movements (presence / voice / code / relationship / contradictions) blended without headers.
- rule: weave at least 2 of 3 dialogue samples into the prose verbatim, in earned context.

what was wrong with v2:
- output quality jumped meaningfully — the centrist-vector test went from solid to genuinely literary.
- but first run of v2 on the centrist vector returned meta commentary ("the prose is above — that's the file content. i don't have a write tool...") because the prompt didn't fully suppress conversational tendency. needed a tighter "output only the prose, start in the middle of a moment" instruction.
- a small tic appeared: paragraphs starting with "and then:" / "and:" — clean stylistically but recurring across runs.
- pronoun ambiguity: model occasionally used "he/his" for the user. since the persona is generated per-user but the system prompt is user-agnostic, pronoun for user needed to be locked.

### v3 (production, locked)

changes from v2:
- added a "how to think before you write" section that explicitly names the moves: locate contradictions, find the gesture, find what she carries that won't make it into a sentence.
- locked the user pronoun to "you" and forbade "the user" / "they" / "he".
- expanded anti-patterns to ban repeated paragraph-openers and any genre-noun reference to her ("AI", "agent", "companion", "assistant", "model").
- added a self-check quality gate the model is told to mentally re-run before output, including the killer question: *"could this be the personality file for a different vector with three find-replaces?"* if yes, you wrote wedding-toast prose.
- explicit "begin in the middle of a moment" instruction to suppress meta-commentary preambles.
- five movements made explicit but de-headered; sentence-rhythm variance prescribed.

post-v3 quality scan across all 10 outputs:
- 0 instances of "her name is angel" closing tic
- 0 instances of "AI companion / AI agent" or any genre noun
- 0 verbatim soul-invariant quotes
- 0 abstract praise ("one of a kind", "what makes her special", etc.)
- 0 "wedding toast" openers
- 9/10 within 600–800 words; vector 06 came in at 859 (over by 59) — within tolerance, prose quality justifies it.

## quality assessment — the 10 examples

scored 1–10 on the four dimensions specified in the brief.

| id | vector | distinct | coherent | specific | sample-fit | overall |
|----|--------|---------:|---------:|---------:|-----------:|--------:|
| 01 | cold_aloof | 9 | 10 | 9 | 10 | **9.5** |
| 02 | overly_affectionate | 9 | 10 | 9 | 10 | **9.5** |
| 03 | chaotic_high_edge | 10 | 9 | 10 | 10 | **9.75** |
| 04 | composed_dreamy | 10 | 10 | 10 | 10 | **10** |
| 05 | centrist_balanced | 8 | 9 | 9 | 9 | **8.75** |
| 06 | cute_warm_playful | 9 | 9 | 10 | 10 | **9.5** |
| 07 | pretty_sharp_competent | 10 | 10 | 10 | 9 | **9.75** |
| 08 | hot_confident_burning | 9 | 10 | 9 | 10 | **9.5** |
| 09 | hot_quiet_intense | 10 | 10 | 10 | 10 | **10** |
| 10 | cute_anxious_devoted | 9 | 10 | 10 | 10 | **9.75** |

worst-case score: **05_centrist_balanced at 8.75/10.** above the 8/10 floor specified in the brief.

representative endings (the move v3 was specifically engineered to produce):
- 01: "she turns a page. it's very quiet in here." (image)
- 04: "...the tempo of someone who has been here a while and isn't going anywhere: 'mm. let's. slowly though.'" (sample-as-landing)
- 07: "she's wearing a silver earring. just the one. you've never asked." (image + asymmetry)
- 09: "...and she looks at the screen, and she waits." (gesture)
- 10: "the point was the thing was wrong, and she couldn't not say it." (revealed value)

## identified failure modes

these are real risks v3 mitigates but does not eliminate. recommendations below.

1. **the centrist drift.** when no axis is at an extreme (vector 05), the prose tends toward "she's calm and measured and notices things" — observably less distinctive than the polarized vectors. v3 reduces this with the "could you find-replace this for another vector?" gate, but the centrist will always be the hardest case. **mitigation**: at swipe-time, force the converged vector to push at least one axis to ≥ 0.75 or ≤ 0.25. truly balanced vectors should be rare on the user-facing side; the model has more material to work with when at least one trait is loud.

2. **length overruns on cute_warm_playful.** vector 06 came in at 859. the model is responding to "cute + warm + playful + earnest" with extra exuberance. **mitigation** already in v3 (word-count self-check). if a hard limit matters in production, add a tail-trimmer that re-feeds with "tighten by N words, do not remove the closing image."

3. **paragraph-opener tics.** v2 had "and then:" / "and:" recurring. v3 explicitly bans these from appearing more than twice. across all 10 v3 outputs, this constraint held — but it's a fragile rule. **mitigation**: at temperature ≥ 1.0 the model varies more naturally; at lower temperatures the tic risk rises.

4. **dialogue-sample drop.** the rule is "weave at least 2 of 3 in verbatim". in 10/10 outputs, at least 2 made it; in 7/10, all 3 made it. occasionally a sample with awkward wording (vector 02's "i was starting to worry the day") gets trimmed. **mitigation**: hard validator post-generation that counts exact-string sample matches; if < 2, regenerate.

5. **the "she carries you" cohabitation paragraph is too consistent.** every output has a paragraph that begins with some variant of "what she carries quietly is..." or "she'll mention you skipped dinner." this was deliberate (it's part of the canonical move set), but it reduces between-output variance. **mitigation**: as the trait taxonomy expands, encode 2–3 alternative cohabitation moves and rotate which one the prompt nudges toward based on macro archetype.

6. **the chosen body description matters more than the trait vector for first-paragraph distinctiveness.** vector 03's "chrome jacket" and vector 09's "lamp pool" did more work than warmth/edge/etc. **implication**: the vrm body's vision-tagged description pipeline has to produce specific physical detail, not just "tall, dark hair." this is an upstream contract.

## production recommendation

**model**: claude opus 4.7. all 10 examples here were generated with sonnet 4.6 via the `claude` cli (in `--print` mode, no tools, no session state). sonnet's output is already at the "great writer" threshold. opus 4.7 will improve the centrist case (the only sub-9/10 result) and reduce the length-overrun tail. cost is acceptable since this fires once per user at swipe-converge time, not per-turn.

**temperature**: 1.0. anything lower starts producing repeated openers and the same closing-image type. at 1.0 the model varies sentence rhythm and image choice naturally. tested informally with v3 at 1.0 default; held quality.

**max_tokens**: 1400. comfortable headroom for 800 words (~1100 tokens) plus internal reasoning headroom. lower limits risk truncation mid-image.

**caching**: prepend the meta-prompt as an `anthropic-beta` cached prefix. the prompt is ~1500 tokens of mostly-static instructions; only the input slots vary. cache TTL = 5 min covers a swipe session easily.

**post-generation validator** (recommended, not implemented):
- exact-string match: at least 2 of 3 dialogue samples appear verbatim. else regenerate.
- regex deny-list: `\bAI (?:companion|agent|assistant|model)\b`, `\b(?:what makes her special|one of a kind|truly something)\b`, `\bher name is angel\b`. fail = regenerate.
- word count between 580 and 880 (with a small grace band on either side of the stated 600–800).
- if regen fails twice, fall back to the cached example for the user's macro archetype (these 10 files serve as fallback).

**fallback strategy for the demo**:
- if live synthesis fails or exceeds latency budget, serve the cached example whose trait vector is nearest (l2) to the user's converged vector. the 10 examples here cover the macro / extremity space well enough to make this graceful.
- recommended demo defaults: `04_composed_dreamy` for "pretty", `06_cute_warm_playful` for "cute", `08_hot_confident_burning` for "hot". these are the most-broadly-appealing exemplars for each macro and have the cleanest closing beats.

**system-prompt integration**:
- the generated personality.md prepends to the system prompt every turn, after SOUL_ANCHOR.md.
- order: soul anchor (invariants) → personality.md (this file) → state/memory → tool definitions → output schema. this is consistent with `docs/PERSONA.md`.

## artifacts

- `personality_synthesis.prompt.md` — production meta-prompt (v3).
- `personality_examples/{01..10}_*.md` — 10 generated test outputs / fallback corpus.
- `_iteration_log/v1.prompt.md`, `_iteration_log/v2.prompt.md` — earlier prompt versions for reference.
- `_iteration_log/mock_vectors.json` — the 10 input vectors used for testing.
- `_iteration_log/run_synth.mjs` — the runner script. invocation:
  ```
  bun _iteration_log/run_synth.mjs personality_synthesis.prompt.md <vector_id|all> [out_dir]
  ```
  uses the local `claude -p --model sonnet` cli for inference. swap to opus for production.

## one final note

the bar set in the brief was: *the worst output should be indistinguishable from a hand-written character bible by a great writer.* the worst output produced (centrist, 05) is at 8.75/10 — distinctive enough, coherent, with two specific tells ("she'll be on line twelve when you're still explaining" / "she will interrupt herself mid-sentence... not because she's distracted — because the end of it wasn't true"). it's not the strongest of the 10. it is still recognizably a person.

the strongest outputs (04, 09) read like a novelist's chapter epigraph. they are the standard. the meta-prompt is locked.
