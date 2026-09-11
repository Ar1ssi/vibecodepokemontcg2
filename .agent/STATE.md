# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 106
Focus: feature (follow-up to S105) — the Pokémon/Trainers/Energy summary-bar filter now also
  narrows the Browse Sets panel's card grid, not just the deck list.
Active: done. TCGdex's `/sets/{id}` card list carries no category field (only the per-card
  detail endpoint does, one request each — too expensive per set). Added
  `fetchCardSupertypeIndex()` (set-browser.mjs): lazy, cached-once id→supertype map from three
  `/cards?category=Pokemon|Trainer|Energy` sweeps (same endpoint shape D18 already used for the
  Energy tab). `fetchSetCards` tags every card from it; Energy-tab cards get `supertype:'Energy'`
  directly (no lookup needed, already known). New `filterCardsBySupertype()` applied alongside
  the existing name filter in native-deck-builder-set-browser.js's `render()`; new
  `setSupertypeFilter()` controller method called from native-deck-builder.js's `render()` every
  time so Browse Sets always mirrors `deckListFilter` (S105's state). +5 tests, pnpm test
  1320/1320. Not browser-verified (no jsdom harness for this UI-wiring layer, pre-existing gap).
Next: user should smoke-check on localhost — click a summary segment, confirm both the deck list
  AND Browse Sets' expanded-set card grids narrow to that supertype. Carried over: I41 (legacy
  rejoin, no opening hand, 1 sample, untriaged); I39 flip-gate-test fails on current main
  (pre-existing); I37 live 2P check; I34 turn-desync residual; Grand Tree cosmetic chat line;
  EX/e-Card era getCardType tables unaudited (S104 only covered Black & White/HGSS). Maintenance
  due (carried from S100).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- Sync-check must hash what the owner's view shows (hashOwnerViewZones), never raw state, and
  skips the compare on a stateVersion mismatch (I42) — don't drop either guard.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`). Verify a diff's own files with targeted
  `npx eslint <files>` and read past the CRLF noise; don't fix the repo-wide config in passing.
- `native-deck-builder-*.js` (the whole native deck builder UI-wiring layer) has zero unit tests
  — no jsdom harness exists for it in this repo. Pure logic it calls into (deck-state.mjs,
  card-sort.mjs, set-browser.mjs, etc.) IS unit-tested; keep new deck-builder logic there and
  keep the *.js UI files thin callers, so behavior stays testable even though the wiring isn't.
- TCGdex `/cards?category=X` returns its FULL list in one response (no pagination) — Pokemon is
  ~20k rows, Trainer ~3k, Energy much smaller. Fine as a one-time lazy/cached fetch (D18, S106);
  don't call it per-card or per-set-expand, only once per session via the cached index/promise.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S106 2026-09-12 feature: Browse Sets card grid now also respects the summary-bar supertype
  filter — see Active above.
- S105 2026-09-12 feature: deck builder summary segments are now click-to-filter buttons for the
  deck list.
- S104 2026-09-12 patch: fixed 3 bugs behind "old-set imports show as Unknown".
