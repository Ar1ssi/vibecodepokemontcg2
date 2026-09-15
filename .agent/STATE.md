# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 134
Focus: feature — deck export/import (CSV) now round-trips the active deck's sleeve + coin choice,
  not just the cards.
Active: committed (3883471), pushed to main. csv-adapter.mjs: serializeDeckToSimCsv(decklist,
  {sleeveId, coinId}) prepends `#SLEEVE,<id>` / `#COIN,<id>` comment lines (omitted when both
  absent, so a plain simulator CSV or an export with no sleeve/coin set is byte-identical to
  before); new parseCsvMeta(csvData) reads those lines back, returning {sleeveId: null,
  coinId: null} when absent; parseSimCsv now skips any leading `#`-prefixed lines before treating
  the next line as the header, instead of hardcoding row index 0 — backward compatible with
  existing 4/7-column CSVs.
  native-deck-builder.js: export button reads deckLibrary.getActiveSleeve/getActiveCoin(target)
  and passes them to serializeDeckToSimCsv; import handler calls parseCsvMeta on the uploaded text
  and, when a sleeveId/coinId is present, applies it the same way the sleeve/coin picker onChange
  handlers do — deckLibrary.setActiveSleeve/setActiveCoin, sleevePicker/coinPicker.setSelected,
  changeCardBack + `deck-sleeve-changed`/`rules-coin-changed` CustomEvent dispatch. A CSV with no
  meta lines (mat/legacy exports, hand-authored, simulator's own) leaves the current sleeve/coin
  untouched rather than clearing them.
  Mat is NOT included — no CSV-adapter equivalent exists for mats (matId lives only in
  deckLibrary + localStorage `ptcg-sim.playmat.v1`); user asked specifically for sleeves+coins.
  Tests: csv-adapter.test.mjs +9 (meta emit/omit, parseCsvMeta, parseSimCsv skip-comment,
  serialize->parse round trip) — node --test 19/19. Full suite: 1410/1410 green.
Next: none pending.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`) — verify a diff's own files with `npx eslint <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Catch-up replay sets `systemState.isCatchingUp`; `syncReplaying` is never set anywhere. Gate
  animations on `isCatchingUp`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S134 2026-09-15 feature: CSV deck export/import now carries sleeve+coin. Pushed 3883471.
- S133 2026-09-15 patch: enhance playmat zones vector sharpness and edge contrast.
- S132 2026-09-15 patch: Fire Type custom mat; double-click attached card opens carousel.
