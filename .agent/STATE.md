# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 126
Focus: feature — design 008 (TCG Live attack preview), slice 6 (final)
Active: done. Deleted `buildAttackWindow()`/`#rulesAttackWindow` from `rules-bridge.js` (call
  site, function body, and the imports only it used: `listUsableActions`,
  `collectUsableAbilityCandidates`, `filterUsableAbilities`, `attack`, `resolveAttackContext`)
  and the `.rules-aw-*` CSS block from `index.css`. Verified R11's "no attacks resolved" hint was
  already live in `attack-preview.js` before deleting. Marked the stale
  `docs/card-types-taxonomy.md` appendix superseded. `pnpm test`: 1362/1365, same 3 baseline
  network failures. Commit c761d81. Design 008 is code-complete.
Next: design 008's manual verification checklist (`.agent/designs/008-tcg-live-attack-preview.md`
  § Manual Verification) has NOT been run against a live browser session (none available here) —
  do that before closing 008 out, then archive the design doc and clear it from NEXTSTEPS.md.
  Session 130 is a maintenance-due milestone — run `.agent/workflows/maintain.md` if idle then.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `shared/engine/rules/__tests__/card-identity-live.test.mjs` (3 tests) hits TCGdex over the
  network and FAILS in sandboxed sessions ("Host not in allowlist"). Baseline is 1362/1365 here;
  don't chase those three.
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`); this session also found ESLint itself unrunnable
  here (`node_modules` absent, `@eslint/js` not found) — verify a diff's own files with
  `npx eslint <files>` on a session where deps are installed, don't fix repo-wide config in passing.
- Card-preview geometry is subtler than it looks: `previewSizeForSource` sizes the pop host from
  the SOURCE rect's aspect, and the plain-image face uses `object-fit: contain` while the holo
  face uses `cover`. Anything positioned as a % of the card face will misalign (design 008 R4).
- `client/src/css/index.css.bak` is a stray, pre-existing backup file (still mentions the deleted
  Attack Window panel) — not part of the build; leave it unless the user asks to clean it up.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S126 2026-09-14 feature: design 008 slice 6 (final) — deleted the Attack Window panel + CSS.
- S125 2026-09-14 feature: design 008 slice 5 — ability zones + bench overlay wiring.
- S124 2026-09-14 feature: design 008 slice 4 — click-events.js gating + sidebox attack routing.
