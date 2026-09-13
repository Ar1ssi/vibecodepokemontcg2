# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 111
Focus: patch (abilities) — fix Meowth ex Last-Ditch Catch search destination routing
Active: done. `parseAbilitySearchParams` previously inspected `lower.includes('onto your bench')`
  across the full ability string, falsely routing searched cards to 'bench' on "when you play this
  Pokémon from your hand onto your Bench" triggers. `move-card.js` blocked Supporters/Items from being
  placed on bench, causing cards to stay in the deck when shuffled. Scoped destination parsing to the
  search clause and stripped trigger phrasing in `shared/engine/rules/abilities.mjs`. Added regression
  test in `shared/engine/rules/__tests__/evolution.test.mjs`. Tests pass.
Next: verify in live multiplayer match.
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
- S111 2026-09-13 patch: scoped ability search destination parsing away from played-to-bench triggers (Meowth ex).
- S110 2026-09-13 fix: support EX/ex Pokémon in evolution chains, Rare Candy, and stadium searches.
- S109 2026-09-13 fix: resolved Rare Candy mat pick GUI failing to advance to evolution selection.
