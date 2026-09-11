# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 105
Focus: feature — deck builder's Pokémon/Trainers/Energy summary segments are now clickable
  filters for the card list below them.
Active: done. Reused the already-tested `filterDeck()` (deck-state.mjs) — it existed but had no
  caller. `native-deck-builder.js`: new `deckListFilter` state (null|'pokemon'|'trainer'|
  'energy'), `render()` narrows `sortedCards` through `filterDeck` when set; summary counts stay
  unfiltered (whole-deck totals never change). `native-deck-builder-renderers.js`:
  `renderDeckSummary` segments are now `<button>`s with an `active` class + `onFilterClick`
  callback; clicking the active segment again clears the filter (toggle). CSS: button reset +
  `.active`/dark-mode active styling in index.css. pnpm test 1316/1316 (unchanged — no new pure
  logic, filterDeck already covered). Not unit-tested at this DOM-coupled UI-wiring layer itself
  (no jsdom harness anywhere in native-deck-builder-*.js, pre-existing gap).
Next: user should smoke-check on localhost — open deck builder, add a mixed deck, click each
  summary segment to confirm the list filters and the click toggles off. Carried over: I41
  (legacy rejoin, no opening hand, 1 sample, untriaged); I39 flip-gate-test fails on current main
  (pre-existing); I37 live 2P check; I34 turn-desync residual; Grand Tree cosmetic chat line;
  EX/e-Card era getCardType tables unaudited (S104 only covered Black & White/HGSS). Maintenance
  due (carried from S100).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- Sync-check must hash what the owner's view shows (hashOwnerViewZones), never raw state, and
  skips the compare on a stateVersion mismatch (I42) — don't drop either guard.
- Room exit/entry must dispatch document 'room-changed' (S101) — Leave/reset/resetDealOrder all
  hang off it (rules-bridge.js's resetRulesSession, S103).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`). Verify a diff's own files with targeted
  `npx eslint <files>` and read past the CRLF noise; don't fix the repo-wide config in passing.
- `native-deck-builder-*.js` (the whole native deck builder UI-wiring layer) has zero unit tests
  — no jsdom harness exists for it in this repo. Pure logic it calls into (deck-state.mjs,
  card-sort.mjs, card-search.mjs, etc.) IS unit-tested; keep new deck-builder logic there and
  keep the *.js UI files as thin callers, so behavior stays testable even though the wiring isn't.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S105 2026-09-12 feature: deck builder summary segments are now click-to-filter buttons — see
  Active above.
- S104 2026-09-12 patch: fixed 3 bugs behind "old-set imports show as Unknown".
- S103 2026-09-11 fix(netcode): resetDealOrder wired to room-changed (I40); syncCheck skips the
  compare on a stale stateVersion instead of false-reporting a desync (I42).
