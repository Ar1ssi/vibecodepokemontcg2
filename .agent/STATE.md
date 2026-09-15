# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 141
Focus: debug — card double-click preview did nothing in multiplayer (SERVER_AUTHORITATIVE).
Active: fixed on branch claude/mp-card-preview (worktree), NOT committed. doubleClick falls back to
  apply-view's img.card via preview-card.mjs; imageClick no longer throws on server cards.
  Suite 1456/1456; live 2P repro .agent/scratch/mp-preview-repro.mjs (SERVER_AUTHORITATIVE, :4137) PASS.
  S140 drop fix is committed locally on branch claude/trainer-board-drop (7 files), NOT pushed.
Next: user decides merge of claude/trainer-board-drop + claude/mp-card-preview; then sync primary.
  I48 (hand double-rendered under SERVER_AUTHORITATIVE) likely also explains I47.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox/worktree (not persisted). Playwright's
  pinned browser revision (1.63.0) may not match a pre-installed one — on sandbox use
  `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). :4000 is often another session's
  server — run your own with `PORT=<free>` (server honours it). Server-rendered cards live only in
  apply-view's registry (`img.card`, `data-instance-id`); `mouseClick.card` / `window.__ptcg.zone`
  read the legacy arrays and miss them — wait on rendered DOM in harnesses.
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `pnpm lint` fails repo-wide on CRLF; lint a diff with
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Holo `--pointer-*` CSS vars mean the LIGHT position (from card angle), not the cursor (D34).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S141 2026-09-16 debug: multiplayer card preview works for server-rendered cards (uncommitted).
- S140 2026-09-16 debug: drops onto cards in board/stadium/covers resolve (local commit, unpushed).
- S139 2026-09-16 patch: trainer board zone is now a mat-layout zone — bb03ea6 on main; PR #131 merged.
