# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 245
Focus: S241-245 discard/mill scaling attacks, Tuck Tail, snipe W/R on authoritative reducer.
Active: nothing in flight. S243-S245 uncommitted on branch claude/charizard-meowth-ex-bugs-40e336.
Next: push S243-245 if user approves; optional Live parity extras (hand chevron, edge wisps).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 023: glows hand-playable + ability + attack + stadium; colour from ONE palette (`card-glow-colors.mjs`: Energy type colour, Supporter red, Item/Tool blue, Stadium green, Pokémon cyan) via `.has-glow` + inline `--glow-rgb`. Never add per-colour CSS classes. Slice 5 (authoritative) built at `.agent/designs/023-card-playability-glows.md`; `live-card-sources.mjs` is the one card/node resolver for both render paths.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is unpaid" — fails at HEAD too (verified via stash), unrelated to design 023. Suite is otherwise 2802/2803.
- Mat FX (S236/D94): one dispatch — add an effect = an `EVENT_FX` row in advisory-animations.mjs + a registry entry in `netcode/mat-fx/index.js`. Kill switch: localStorage `ptcg-fx-off`='1' or `body.fx-off`.
- Stadium tilt (S235/D93): `#stadium` is parent-owned (CSS in index.css, NOT the container sheets); `--stadium-width` no longer exists.
- `pnpm lint` is pre-existing red (CRLF vs prettier `endOfLine`, 0 errors); only NEW rule errors count.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S245 patch: Raikou attach, Palossand-GX pick, Flygon ex React Energy, snipe W/R on Active; uncommitted.
- S244 patch: deck-mill scaling (`deckMillScaling`, `attackMillCount` choice); uncommitted.
- S243 patch: Wugtrio ex snipe scaling + Groudon ex/Metagross older discard wordings.
