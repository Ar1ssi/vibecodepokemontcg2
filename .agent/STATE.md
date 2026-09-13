# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 108
Focus: patch (holo) — align holographic card spring physics and math with simeydotme/pokemon-cards-151.
Active: done. Replaced single-point spring with 3 decoupled Svelte-style springs (springRotate,
  springGlare, springBackground), fixed inverted 1D --pointer-from-center with exact 2D Euclidean distance,
  enabled .card__glare2, and stabilized interactive card hover tracking. Added holo.test.mjs (8 tests),
  pnpm test 1328/1328.
Next: smoke-check holo cards in deck builder zoom preview and card picker in browser. Carried over:
  I41 (legacy rejoin, no opening hand); I39 flip-gate-test; I37 live 2P check; I34 turn-desync residual;
  Grand Tree cosmetic chat line; EX/e-Card era getCardType tables unaudited. Maintenance due (S100).
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
- S108 2026-09-13 patch: aligned holo spring physics and math with simeydotme/pokemon-cards-151.
- S106 2026-09-12 feature: Browse Sets card grid now also respects the summary-bar supertype filter.
- S105 2026-09-12 feature: deck builder summary segments are now click-to-filter buttons for the deck list.
