# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 139
Focus: patch — trainer "board" zone given a mat-aware position (merged to main).
Active: none. S139 merged: `board` zone in every mat-layouts.mjs profile (--board-* vars), read by
  .self-board/.opp-board in both container CSS files. Visual check left to user (localhost).
  S138 (authoritative Set Up/Reset lifecycle) is on main as 01a670b.
Next: user eyeballs board zone on a mat. Investigate I47 (test:flip red on main).
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox/worktree (not persisted). Playwright's
  pinned browser revision (1.63.0) may not match a pre-installed one — on sandbox use
  `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only — user says legacy mode doesn't matter
  (S137). `test:flip` needs its own server on :4100; :4000 is often another session's server.
  Server lifecycle hooks ride the legacy `pushAction` relay (loadDeck, readyUp, reset) in server.js.
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `pnpm lint` fails repo-wide on CRLF; lint a diff with
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Holo `--pointer-*` CSS vars mean the LIGHT position (from card angle), not the cursor (D34).
  A mask-image host without CORS hides the foil entirely — extend INK_MASK_CORS_HOSTS only after
  checking the host's Access-Control-Allow-Origin header.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S139 2026-09-16 patch: trainer board zone is now a mat-layout zone — on main.
- S138 2026-09-16 patch: server waits for both Set Ups; Reset resets the server game — 01a670b on main.
- S137 2026-09-16 patch: solo host no longer auto-dealt under SERVER_AUTHORITATIVE — f4e069e on main.
