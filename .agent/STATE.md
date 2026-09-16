# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 146
Focus: Trainer effects + evolution stats server-side; I35/I49/I50 closed (branch feature/trainer-play-effects, not merged).
Active: none.
Next: merge PR #136, then the I51/I52 PR (untested at user request: run pnpm test + a live bot game before merge). Then I47.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox/worktree (not persisted). Playwright's
  pinned browser revision (1.63.0) may not match a pre-installed one — on sandbox use
  `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). :4000 is often another session's
  server — run your own with `PORT=<free>`. Server-rendered cards carry `data-instance-id` + `img.card`;
  legacy images never enter server-drawn zones' DOM (D36), so DOM queries see server cards only.
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json.
  `pnpm lint` fails repo-wide on CRLF; lint a diff with
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Evolutions stay attached under the Basic: read HP/attacks/stats through evolvedView (D40), write damage to the root.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S145 2026-09-16 patch: I50 — evolved Pokémon use their Evolution stats; Rare Candy checks its line (branch, unmerged).
- S144 2026-09-16 feature: Trainer drops run effects server-side; all 31 missing step kinds + play conditions (branch, unmerged).
- S143 2026-09-16 feature: 8 custom Pokémon playmats added with 2x upscale and 1.9394:1 mat crop.
