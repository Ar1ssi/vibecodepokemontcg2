# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 133
Focus: patch (board-ui) — enhance playmat zones vector sharpness and edge contrast
Active: done. Removed fixed width/height from SVG root, added geometricPrecision,
  boosted stroke-width to 2.2px, and embedded dual-stage feDropShadow contrast filter.
  Verified crisp rendering across light and dark artwork via Playwright. All tests pass.
Next: user visual review in browser.
Blocked: nothing.

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
- S133 2026-09-15 patch: enhance playmat zones vector sharpness and edge contrast.
- S132 2026-09-15 patch: Fire Type custom mat; double-click attached card opens carousel.
- S131 2026-09-14 review+patch: design 009 build fixed + merged to main.
