# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 127
Focus: merge — bring claude/cpu-testing-live-render-anr7fy up to date (origin/main, then
  claude/brave-volta-nu3duk). This branch is the test server going forward.
Active: done. Merged 39 commits of main (conflicts: playtest-bot.mjs coin-call block — kept this
  branch's `isAuthoritative()` gate, which is a strict superset of main's phase-poll version;
  journal kept both sides). Then merged brave-volta (design 008 attack preview, slices 1-6) —
  code auto-merged clean, only .agent harness docs conflicted. brave-volta's I43 renumbered to I44.
Next: run `pnpm test` and design 008's § Manual Verification checklist against a live browser
  before treating this branch as the test server. Session 130 is a maintenance-due milestone.
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
- S127 2026-09-14 merge: main (39 commits) + brave-volta (design 008) into the test-server branch.
- S126 2026-09-14 feature: design 008 slice 6 (final) — deleted the Attack Window panel + CSS.
- S124 2026-09-14 fix: unify playmat and zone geometry for sub-pixel card alignment.
