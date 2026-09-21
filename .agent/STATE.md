# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 248
Focus: Fezandipiti ex KO-gate + Mega Lucario ex Aura Jab spread attach.
Active: nothing in flight. S248 uncommitted on claude/fezandipiti-mega-lucario-bugs-146b4a.
Next: push S243-245 if user approves; optional Live parity extras (hand chevron, edge wisps).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 023: glows hand-playable + ability + attack + stadium; colour from ONE palette (`card-glow-colors.mjs`: Energy type colour, Supporter red, Item/Tool blue, Stadium green, Pokémon cyan) via `.has-glow` + inline `--glow-rgb`. Never add per-colour CSS classes. Slice 5 (authoritative) built at `.agent/designs/023-card-playability-glows.md`; `live-card-sources.mjs` is the one card/node resolver for both render paths.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is unpaid" — fails at HEAD too (verified via stash), unrelated to design 023. Suite is otherwise 2802/2803.
- Mat FX (S236/D94): one dispatch — add an effect = an `EVENT_FX` row in advisory-animations.mjs + a registry entry in `netcode/mat-fx/index.js`. Kill switch: localStorage `ptcg-fx-off`='1' or `body.fx-off`.
- Stadium tilt (S235/D93): `#stadium` is parent-owned (CSS in index.css, NOT the container sheets); `--stadium-width` no longer exists.
- `pnpm lint` is pre-existing red (CRLF vs prettier `endOfLine`, 0 errors); only NEW rule errors count.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S248 patch: Flip the Script gated on `flags.koedLastOppTurn`; Aura Jab `attackAttachSpread` choice loop.
- S247 patch: seated rejoin pulls requestView (joinGame.rejoinedGame); Stadium no longer blank after reload.
- S246 patch: peer rejoin no longer runs legacy reset on the authoritative opp board (empty holo frames); `opp-board-reset.mjs`; uncommitted.
