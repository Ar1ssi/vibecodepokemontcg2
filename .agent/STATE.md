# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 123
Focus: review — design 008 (TCG Live attack preview): plan review + user decisions folded in
Active: done. `.agent/designs/008-tcg-live-attack-preview.md` now carries decisions D1–D4
  (single-click trigger, keep both Retreat/Pass locations, dynamic zone sizing, unpayable
  attacks unhighlighted) and review findings R1–R9, folded into the component specs, edge-case
  table, work plan and verification plan. No product code touched. I43 filed for R8.
Next: user to answer the one open question (do abilities move onto the card overlay?), then
  implement slice 1 (`resolve-attack-context.mjs`). Design 008 is not yet approved to build.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `shared/engine/rules/__tests__/card-identity-live.test.mjs` (3 tests) hits TCGdex over the
  network and FAILS in sandboxed sessions ("Host not in allowlist"). Baseline is 1334/1337 here;
  don't chase those three.
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`). Verify a diff's own files with targeted
  `npx eslint <files>` and read past the CRLF noise; don't fix the repo-wide config in passing.
- Card-preview geometry is subtler than it looks: `previewSizeForSource` sizes the pop host from
  the SOURCE rect's aspect, and the plain-image face uses `object-fit: contain` while the holo
  face uses `cover`. Anything positioned as a % of the card face will misalign (design 008 R4).
- `native-deck-builder-*.js` (the whole native deck builder UI-wiring layer) has zero unit tests
  — no jsdom harness exists for it in this repo. Pure logic it calls into (deck-state.mjs,
  card-sort.mjs, set-browser.mjs, etc.) IS unit-tested; keep new deck-builder logic there and
  keep the *.js UI files thin callers, so behavior stays testable even though the wiring isn't.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S123 2026-09-14 review: design 008 reviewed; decisions D1–D4 + findings R1–R9 recorded.
- S122 2026-09-14 feature: overlapping prize cards layout matching playmat.
- S121 2026-09-14 feature: playmat zones SVG overlay, zone alignment & remove low-opacity highlights.
