# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 144
Focus: fixed grey sleeves in multiplayer (stale card-back DOM-patch never matched, absolute vs relative src).
Active: none.
Next: I47 (test:flip stalls right after join, SERVER_AUTHORITATIVE) — I48 was not its cause.
  Legacy zone arrays drift from server counts (client A: 8 legacy vs 9 server hand cards).
  Also owed: a test for changeCardBack/applySleeveToPlaymat's stale-image patch (no scaffold exists yet
  for iframe/systemState-coupled DOM code — see S144 journal flag).
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
- Holo `--pointer-*` CSS vars mean the LIGHT position (from card angle), not the cursor (D34).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S144 2026-09-16 debug: grey multiplayer sleeves fixed — img.src comparison now URL-normalized.
- S143 2026-09-16 feature: 8 custom Pokémon playmats added with 2x upscale and 1.9394:1 mat crop.
- S142 2026-09-16 debug: I48 closed — no double-rendered cards in multiplayer (on main).

