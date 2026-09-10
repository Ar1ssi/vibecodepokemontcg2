# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 95
Focus: live-verify Grand Tree's evolve-search behavior in this isolated worktree (user request:
  confirm Froakie played -> Grand Tree searches/evolves Frogadier -> chains to Greninja ex, and
  the stadium only works the turn after Froakie enters play).
Active: done, including a correction mid-session. Verified via `?e2e=1` + `window.__ptcg` (real
  client action path, real user decklist, Solo mode both sides). Found+fixed D29 (build-deck.js
  was calling stampE2eCard on every card under `?e2e=1`, not just the synthetic fixture deck,
  corrupting real decks' stage data before TCGdex enrichment could set it). Initially misread the
  Stage 1->Stage 2 same-activation chain failing as a bug (I38) — user corrected: Grand Tree's
  real printed text (confirmed via TCGdex sv07-136) explicitly allows chaining that second evolve
  in one activation. Fixed properly (D30): new `bypassJustEvolvedGate` option threaded
  canEvolve->moveCard->moveCardBundle (same pattern as the existing `isRareCandy` hint), applied
  only at Grand Tree's two Stage-2 chain call sites. Re-verified live: Froakie(turn N)->Grand Tree
  (turn N+1)->Frogadier->Greninja ex, one activation, no rejection, deck shuffled correctly.
Next: worth a quick pass: the stray "Blue evolved X into Y" chat line that still prints even when
  a *different* evolution attempt is legitimately rejected (e.g. the Basic's own same-turn-played
  gate) — cosmetic log-ordering issue, no state corruption, just a misleading line; not touched
  this session. Maintenance still due (Session 96, from prior note) — run
  `.agent/workflows/maintain.md` if the next session has room.
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
  Relies on a document-level capture-phase click listener outrunning click-events.js/drag.js.
- CSS/visual verification in this repo: don't drive the Browser pane yourself for that — user
  checks localhost manually (feedback_css_preview.md). Functional/rules verification (like this
  session's Grand Tree check) is fine to drive directly via the `?e2e=1` bridge — far more
  reliable than pixel-clicking the board (the play area renders inside an iframe; DOM refs
  resolve but on-screen coordinates need iframe-offset translation and images may not paint in
  the sandboxed browser at all).
- A relayed action that throws inside `acceptAction` leaves NO sync-log entry (console.error
  only) — a recv with no following resolve/abort line means "threw", not "skipped" (design 007).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S95 2026-09-11 debug: live-verified Grand Tree evolve-chain via e2e bridge; fixed D29
  (stampE2eCard over-scope); filed I38 (Stage2 auto-chain always rejected).
- S94 2026-09-11 fix(netcode): legacy 2P mirror desync on benched Pokémon from deck search —
  see journal (D28, design 007).
- S93 2026-09-11 feature: e2e/debug mode for bot card testing (D27).
