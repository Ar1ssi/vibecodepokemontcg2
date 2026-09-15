# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 142
Focus: debug — I48, every card rendered twice under SERVER_AUTHORITATIVE.
Active: fixed on branch claude/mp-card-preview (worktree), on top of the S141 preview fix (640d462).
  Legacy paths skip the DOM of server-drawn zones (server-rendered-zones.mjs, rebuild-zone-dom.js; D-line
  in DECISIONS). Suite 1460/1460; live 2P repro .agent/scratch/mp-preview-repro.mjs: 53 dup <img>s -> 0.
  Unpushed: claude/trainer-board-drop (S140 drop fix) and claude/mp-card-preview (S141 + S142).
Next: user decides merge of both branches; then sync primary checkout. I47 (test:flip stalls after
  join) is NOT fixed by I48 — investigate next. Legacy zone arrays drift from server counts.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox/worktree (not persisted). Playwright's
  pinned browser revision (1.63.0) may not match a pre-installed one — on sandbox use
  `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). :4000 is often another session's
  server — run your own with `PORT=<free>`. Server-rendered cards carry `data-instance-id` + `img.card`;
  legacy images never enter server-drawn zones' DOM (I48 fix), so DOM queries see server cards only.
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `pnpm lint` fails repo-wide on CRLF; lint a diff with
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Holo `--pointer-*` CSS vars mean the LIGHT position (from card angle), not the cursor (D34).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S142 2026-09-16 debug: I48 closed — no double-rendered cards in multiplayer (uncommitted).
- S141 2026-09-16 debug: multiplayer card preview works for server-rendered cards (local commit 640d462).
- S140 2026-09-16 debug: drops onto cards in board/stadium/covers resolve (local commit, unpushed).
