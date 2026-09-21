# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 250
Focus: four user-reported bug fixes — lethal ability damage-counter KO, Tool-only attach, Bench play gate, Tarragon parse.
Active: clean on main at 38eb815 (pushed to origin/main).
Next: resume Live-parity extras (hand chevron, edge wisps); maintenance due at S260.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 023: glows hand-playable + ability + attack + stadium; colour from ONE palette (`card-glow-colors.mjs`: Energy type colour, Supporter red, Item/Tool blue, Stadium green, Pokémon cyan) via `.has-glow` + inline `--glow-rgb`. Never add per-colour CSS classes. Slice 5 (authoritative) built at `.agent/designs/023-card-playability-glows.md`; `live-card-sources.mjs` is the one card/node resolver for both render paths.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is unpaid" — fails at HEAD too (verified via stash), unrelated to design 023. Suite is otherwise 2820/2821.
- Mat FX (S236/D94): one dispatch — add an effect = an `EVENT_FX` row in advisory-animations.mjs + a registry entry in `netcode/mat-fx/index.js`. Kill switch: localStorage `ptcg-fx-off`='1' or `body.fx-off`.
- Stadium tilt (S235/D93): `#stadium` is parent-owned (CSS in index.css, NOT the container sheets); `--stadium-width` no longer exists.
- `pnpm lint` is pre-existing red (CRLF vs prettier `endOfLine`; 2 pre-existing `no-useless-escape` errors in trainer-effects.mjs); only NEW rule errors count.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S250 patch: lethal ability/trainer damage counters KO (damageCountersPlaced marker swept by reduce.mjs through handleKnockout); attachCard validates Energy/Tool/Pokémon only; moveCard hand→bench/active requires a Pokémon (+client drag guard); Tarragon parsed as a 4-card combo filter. Files: trainer-steps.mjs, reduce.mjs, trainer-effects.mjs, move-card.js, trainer-execution.js (+5 tests).
- S249 patch: Mega Greninja ex Ninja Spinner prompts to return a {W} Energy to hand for +80 damage (`attackReturnEnergyBonus`).
- S248 patch: Flip the Script gated on `flags.koedLastOppTurn`; Aura Jab `attackAttachSpread` choice loop.
