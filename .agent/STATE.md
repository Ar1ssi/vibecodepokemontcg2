# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 138
Focus: patch — authoritative multiplayer setup/reset lifecycle (S137 + S138).
Active: S138 on branch fix/setup-waits-for-ready (worktree ../vibecode-wt-setup-ready), NOT committed.
  Server deals only after BOTH players press Set Up (GameRoom.markReady via pushAction 'readyUp';
  isReadyToDeal = setup phase + 2 seats + 2 decks + both ready). A player's Reset (pushAction
  'reset', clean=false) runs resetGame, emits 'gameReset' (client clears Set Up flags + dispatches
  game-restarted) and fresh views (D35). Suite 1451/1451. Live repro (scratchpad
  setup-reset-repro.mjs): join→no deal, one Set Up→no deal, both→dealt, Reset→both 'setup', again→dealt.
Next: user decides merge; then sync primary checkout. Investigate I47 (test:flip red on main).
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
- S138 2026-09-16 patch: server waits for both Set Ups; Reset resets the server game (branch, uncommitted).
- S137 2026-09-16 patch: solo host no longer auto-dealt under SERVER_AUTHORITATIVE — f4e069e on main.
- S136 2026-09-15 feature: TCG Live-style holofoil (fixed light, ink mask) — PR #130, merged 9729902.
