# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 124
Focus: feature — design 008 (TCG Live attack preview), slice 4
Active: done. Component 4 (click-events.js gating) + Component 7 (sidebox button routing) built.
  New pure `client/src/setup/rules/attack-preview-gate.js` (`shouldOpenAttackPreview`) covers R1/R2/D6's
  decision logic and is unit-tested for all 6 verification-plan cases. `imageClick()`'s final else
  branch and both sidebox attackButtons now open `openAttackPreview()` when rules mode is on;
  bench/ability wiring stays `hasAbility: false` until slice 5. Commit 2b1f463.
Next: slice 5 — ability zones (D5) + bench overlay wiring (D6), per `NEXTSTEPS.md`. Run `pnpm
  test`/`pnpm lint` first (not run this session per user instruction) before starting. Slice 6
  (deleting the Attack Window panel) must stay last or rules mode is unplayable in between.
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
- S124 2026-09-14 feature: design 008 slice 4 — click-events.js gating + sidebox attack routing.
- S123 2026-09-14 review: design 008 reviewed; decisions D1–D4 + findings R1–R9 recorded.
- S122 2026-09-14 feature: overlapping prize cards layout matching playmat.
