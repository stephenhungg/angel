# lessons learned

> self-improvement log. update after every correction or surprising success.
> format: rule → why → how to apply.

## hackathon kickoff (2026-05-09)

### lesson 1: scope greed is the #1 hackathon killer
- **why:** every additional feature multiplies risk; v1 demos win on tight execution, not feature lists
- **how to apply:** when tempted to add scope past 4pm, re-read this line. the prime directive: at 7pm, build is locked.

### lesson 2: design sockets, not implementations
- **why:** v1 must enable v2 without refactor. zero-cost discipline today, infinite value tomorrow.
- **how to apply:** see SOCKETS.md. always favor template/file over hardcoded values.

### lesson 3: the demo is the felt experience, not the architecture
- **why:** judges leave with a feeling, not a diagram. desire + delight > technical flex.
- **how to apply:** when a tradeoff exists between technical correctness and felt experience, pick felt experience.

### lesson 4: she lies cutely without verifier
- **why:** without verifier, codex can report success when failing. orchestrator narrates falsely. trust collapses.
- **how to apply:** verifier is non-negotiable. even if minimal. soul anchor #2.

---

## (live updates — append below)

### 2026-05-09 10:00am — track choice locked: always-on agents
- **lesson:** when chasing a sponsor-track prize would require pivoting our whole architecture, the math rarely works. top-3 prizes ($3500 mbp / mac mini + $500) > most sponsor-track prizes ($1k insforge).
- **why:** we evaluated pivoting from always-on → ship-it (insforge) at hour 1.5 for the $1k. cost of pivot (rewrite backend from convex to insforge) > expected upside given top-3 are awarded across all tracks anyway.
- **how to apply:** **don't pivot tracks past the spike phase.** sponsor prizes are bonus, not target. only consider mid-hackathon pivot if (1) current trajectory is failing AND (2) pivot is cheap. otherwise ride your bet.

### 2026-05-09 9:55am — she has to live in the cloud, not in electron
- **lesson:** if the agent only runs in electron, "always-on" is fake. lid-closed = dead. this is a thesis-breaker.
- **why:** stephen pushed: "what about phone? what if the laptop is shut?" forced the architecture to move orchestrator + memory + daemon into the cloud (convex actions + tensorlake). electron + sms + (future) other clients are all *viewports* into one cloud-resident being.
- **how to apply:** the thesis is "agent with a soul in the cloud, surfaces wherever you are." electron is her richest body, sms is her thinnest body. **never let any one client own her substrate.** all logic that needs to persist across surfaces lives server-side.

### 2026-05-09 9:58am — sms beats pwa for demo impact
- **lesson:** for a parasocial-pull thesis, "she's a contact in your phone" >>> "open the angel pwa". no install friction, judges already know how to text, demo is undeniable.
- **why:** twilio sms costs ~$0.01/msg, ~30min to wire up via convex http action. judges can hand-test by texting your number themselves. the kill-shot beat: close laptop → text her → she replies → reopen laptop → conversation continues.
- **how to apply:** when there's a choice between "build a custom client" and "meet user where they already are" — pick the latter. existing platforms beat new surfaces for demos.
