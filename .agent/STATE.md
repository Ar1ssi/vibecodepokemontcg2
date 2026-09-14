# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 119
Focus: feature (board-ui) — edge-to-edge zoneless playmats and custom Kyogre mat
Active: done. Added edge-to-edge and edge-to-edge-two-player layout profiles (`matFit: 'cover'`), updated
  `apply-mat-layout.js` and `index.css` to remove arena polygon clipping and stretch artwork edge-to-edge
  without squishing, and added custom Kyogre mat to catalog. All 46 tests pass.
Next: user visual review in browser.
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
- S119 2026-09-14 feature: edge-to-edge zoneless playmat profiles and custom Kyogre mat.
- S118 2026-09-14 fix: synchronize #battleMat and card zones in side-menu-collapsed mode.
- S117 2026-09-14 fix: card preview right click feature on search tab and deck cards.

