# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 137
Focus: patch — lone host auto-started a solo game in a SERVER_AUTHORITATIVE room.
Active: fixed on branch fix/solo-host-auto-setup (worktree ../vibecode-wt-solo-setup), NOT committed.
  GameRoom.isReadyToDeal() (server/game/room.mjs) now gates server.js's opening 'setup': needs
  2 seats + 2 loaded decks. Regression test in room.test.mjs. Suite 1448/1448.
  Live socket repro (scratchpad lone-host-repro.mjs): main deals host alone + never deals the
  opponent; fix deals nobody until the opponent loads, then both.
Next: user decides commit/PR/merge; then sync primary checkout. Investigate I47 (test:flip red on main).
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox/worktree (not persisted). Playwright's
  pinned browser revision (1.63.0) may not match a pre-installed one — on sandbox use
  `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only — user says legacy mode doesn't matter
  (S137; supersedes "test both modes"). `test:flip` needs its own server on :4100; :4000 is
  often another session's server, so never trust an e2e run against it.
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `pnpm lint` fails repo-wide on CRLF + `no-undef` on `.mjs`; lint a diff with
  `npx eslint --rule 'linebreak-style: off' <files>`. `eslint --fix` applies prettier formatting.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Holo `--pointer-*` CSS vars mean the LIGHT position (from card angle), not the cursor (D34).
  A mask-image host without CORS hides the foil entirely — extend INK_MASK_CORS_HOSTS only after
  checking the host's Access-Control-Allow-Origin header.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S137 2026-09-16 patch: solo host no longer auto-dealt under SERVER_AUTHORITATIVE (uncommitted branch).
- S136 2026-09-15 feature: TCG Live-style holofoil (fixed light, ink mask) — PR #130, merged 9729902.
  + patch: Primal Kyogre + Groudon sleeves cropped (no white margins), pushed to main directly.
- S135 2026-09-15 feature: ability-guidance accuracy + Mega/Primal Spirit Link turn-end rule.
