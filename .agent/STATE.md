# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 100
Focus: Dawn (searchDeck) picking 3 Basics instead of one Basic + one Stage 1 + one Stage 2.
Active: done. Root cause: parseSearchDeckParams special-cased Dawn's text into one 3-pick
  searchDeck step with what='Basic/Stage1/Stage2 Pokémon'; matchesSearch's combined-stage branch
  (search-match.mjs) matched ANY Pokémon regardless of stage, so the multiSelect picker let 3
  Basics through. Fix: new 'searchDeckSequence' step (3 stage-tagged single-card sub-steps) +
  runSearchSequenceStep executor (trainer-execution.js) chaining 3 single-card searches via
  suppressShuffle, shuffling once at the end; matchesSearch gained exact stage-1/stage-2 filters
  (previously fell through to `return true` — matched any Pokémon). 2 new regression tests;
  1299/1299 pnpm test green (was 1297).
Next: maintenance due (S100, multiple of 10) — run maintain.md if next session has room. User to
  live-verify Dawn's UI flow (3 sequential single-card pickers, one shuffle at the end) — this
  session verified via unit tests only, no Playwright/browser check for this card. Still open:
  live-verify I37 in a real 2P game (Judge/Iono/N/Research — check sync log for zero
  hint_mismatch). Confirm `?e2e=1` bot `loadDeckList`+`debugMode(true)` rule bypass. Grand Tree
  stray "evolved X into Y" chat line on rejected evolve (cosmetic). I34 turn-desync residual
  (1/10 soak). S71/S73 mat-click flows and design 005/006 smoke-checks not browser-verified.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- matchesSearch (shared/engine/rules/search-match.mjs) previously had no stage-1/stage-2-only
  branch and silently matched ANY Pokémon for such queries (S100). Any new "Stage N Pokémon"
  search text should hit the new exact-stage branch — verify with matchesSearch unit tests, not
  by eyeballing the picker.
- joinGame setup is serialized on pushActionQueue (S99). Anything else that resets opponent state
  asynchronously while the server may be pushing to this socket must do the same, or replays land
  mid-reset. A hung applyPeerAction now also blocks the next join's setup.
- `?e2e=1` + `window.__ptcg` is safe to drive a REAL decklist through (D29): build-deck.js only
  stamps synthetic-Basic defaults onto `set === 'e2e'` fixture rows. Stage-dependent e2e
  misbehaviour → check this guard first.
- Grand Tree's Stage1->Stage2 same-activation chain is a real printed exception (D30,
  `bypassJustEvolvedGate`). Don't re-add the just-evolved gate there without re-reading the card.
- Live checks: user checks CSS/visuals on localhost (memory `feedback_css_preview.md`); drive
  netcode/rules checks via Playwright + `?e2e=1` (see join-deck-sync-test.mjs,
  manual-verify-i24.mjs), server via `pnpm -C server start` (check :4000 for stale node first).
  Hidden sidebox buttons: click via `page.evaluate(() => el.click())`, not `page.click`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S100 2026-09-11 patch(fix): Dawn's combined Basic/Stage1/Stage2 search — now 3 sequential
  single-card searches, one shuffle at the end; matchesSearch gained exact stage filters.
- S99 2026-09-11 fix(netcode): room-join deck desync — joinGame setup serialized on pushActionQueue.
- S98 2026-09-11 fix(netcode): I37 — awaited moveCardBundle + real shuffle in the 4
  hand-shuffle trainer effects; I36 closed as working-as-intended.
