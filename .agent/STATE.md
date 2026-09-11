# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 98
Focus: merged PR #101 (I37/I36 fix, renumbered S95/S96/S97 -> S96/S97/S98 — collided with the
  concurrent PR #102's own S95 Grand Tree chain work) and PR #102 (Grand Tree chained Stage 2
  evolve + e2e stage-data corruption, D29/D30) into main.
Active: done. I37 FIXED: added `await` to every `moveCardBundle` call across the 4 hand-shuffle
  trainer-effect loops (trainer-execution.js — shuffleHandThenDraw/countShuffleDrawPlus/
  ionoShuffle/discardHandThenDraw) so each move's splice lands before the next iteration's
  synchronous hint-build reads the zone, and added a real `shuffleDeckAfterSearch` shuffle call
  for the three that move the hand into the deck (discardHandThenDraw discards, needs none).
  Not live-2P verified — no harness yet for these specific card effects; the fix mirrors design
  007's already-verified pattern. I36 CLOSED without a code change: traced the mirror-abort's
  blast radius (`applyPeerAction` increments `oppCounter` unconditionally regardless of the
  abort) and confirmed no desync/side-effect follows it — working as intended. PR #102 (merged
  separately, S95 below) fixed Grand Tree's Stage1->Stage2 same-activation chain (D30,
  `bypassJustEvolvedGate`) and D29 (stampE2eCard over-scope corrupting real decks' stage data
  under `?e2e=1`) — see journal S95/S98.
Next: live-verify I37's fix in a real 2P game (play Judge/Iono/N/Professor's-Research-style
  cards, check the sync log for zero `hint_mismatch`/wrong-card entries) — same shape as
  manual-verify-i24.mjs but for the hand-shuffle family, not yet built. Still open: confirm on
  localhost with `?e2e=1` that a bot can `loadDeckList`+`debugMode(true)` to bypass rules for
  card-isolation testing generally (S93's own use case). Also smoke-check S92's Trainer/turn
  fixes: play an Item then a Supporter in the same turn (Supporter should still be allowed),
  confirm the first player draws on turn 1. The stray "Blue evolved X into Y" chat line that
  still prints even when a *different* evolution attempt is legitimately rejected is a known
  cosmetic log-ordering issue from PR #102 — not fixed. Still open from S82/S88: I34
  (turn-desync residual, 1/10 soak failures). Still open from S71/S73: mat-click pick/cancel/
  Escape flow, stray-click leak-through, opponent-side highlighting in local 2P, drag
  active→bench retreat live-verify — none browser-verified. Design 005/006 smoke-check still
  open. Maintenance due S100.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- New (D29): `?e2e=1` + `window.__ptcg` is now safe to drive a REAL decklist through, not just
  `loadFixtureDeck()` — build-deck.js only stamps synthetic-Basic defaults onto `set === 'e2e'`
  fixture rows now. Before this fix, ANY e2e-mode test of a real deck silently had every
  Pokémon's stage forced to 'Basic', breaking evolution/Rare-Candy/stadium-search testing —
  if a future e2e test shows stage-dependent logic misbehaving, check this guard first.
- Grand Tree's Stage1->Stage2 same-activation chain is a REAL printed exception (TCGdex sv07-136:
  "If that Pokémon was evolved in this way, [you] may... evolve it again") — bypasses the
  just-played/already-evolved gates for that one chained step only, via the new
  `bypassJustEvolvedGate` option (D30). Don't re-add the just-evolved gate to that call site
  without re-reading the real card text first.
- `openMatPick()` in client/src/setup/rules/trainer-execution.js is the pattern for any
  future "pick an in-play Pokémon" step — reuse it, don't re-add a modal picker for that case.
  It relies on `card.image` already being the live DOM node and on a document-level
  capture-phase click listener outrunning click-events.js/drag.js's own listeners; if a future
  refactor moves those to Shadow DOM or a different capture root this will silently stop gating.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually (project memory `feedback_css_preview.md`). Functional/netcode/rules live
  checks are different and fine to drive directly: via a Playwright script (see
  `manual-verify-i24.mjs`) launched with `pnpm -C server start` (not `node server/server.js`
  directly — ERR_MODULE_NOT_FOUND outside the server workspace; check `tasklist` for a stale
  node process already on :4000 first), or via the `?e2e=1` bridge — far more reliable than
  pixel-clicking the board (the play area renders inside an iframe; DOM refs resolve but
  on-screen coordinates need iframe-offset translation and images may not paint in the
  sandboxed browser at all).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1. Verify a diff's own files with a targeted `npx eslint
  <files>` and read past the CRLF noise; don't try to fix the repo-wide config in passing.
- A relayed action that throws inside `acceptAction` leaves NO sync-log entry (console.error
  only) — a recv with no following resolve/abort line means "threw", not "skipped" (design 007).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S98 2026-09-11 fix(netcode): I37 — awaited moveCardBundle + real shuffle in the 4
  hand-shuffle trainer effects; I36 closed as working-as-intended (no code change).
- S95 2026-09-11 debug/fix: PR #102 — live-verified Grand Tree evolve-chain via e2e bridge;
  fixed D29 (stampE2eCard over-scope) and D30 (Stage1->Stage2 chain exemption).
- S94 2026-09-11 fix(netcode): legacy 2P mirror desync on benched Pokémon from deck search
  (D28, design 007).
