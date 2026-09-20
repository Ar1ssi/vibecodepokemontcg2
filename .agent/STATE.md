# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 207
Focus: pkmncards trainer parse-coverage, worktree `vibe-pkmncards-parse` (`task/pkmncards-parse`):
  fix cards `parseTrainerEffect()` cannot recognize (the "unrecognizable" bucket).
Active: unrecognizable 402 → 25 across the 1,348 unique cards (98.1%). Slices 1–5 parse-only
  (existing steps); slices 6–14 added ~57 NEW step families end-to-end (parser + `describeStep` in
  `shared/engine/rules/trainer-effects.mjs`; client in
  `client/src/setup/rules/trainer-execution.js`), plus a PASSIVE_KEYWORDS expansion. Part A wired
  the 4 Lost Zone cards to the existing `lostZone` zone. Part B rail: mirrors both piles on the
  right (outside #battleMat), click opens the zone, counts via `occupiedZoneCount`, and ACCEPTS
  DRAG/DROP via a new explicit `[data-drop-zone]` target path in
  `client/src/setup/image-logic/drag.js` (rail reuses the board's own dragOver/dragLeave/drop;
  user-mismatch drops refused). In-mat `#lostZoneCover` kept visible (user choice). Verified:
  node --check clean, rail test 11/11, full suite 2441/2441, audit buckets unchanged, eslint
  clean. Buckets: guided 698 / passive-only 321 / automated 295 / unhandled-step 9 /
  unrecognizable 25. Full step list in the journal (S207 cont. 5–13). COMMITTED as 9349173;
  PR #176 open vs main.
Next: (1) MANUAL BROWSER CHECK of rail drag/drop — cross-iframe HTML5 DnD is unverified (no
  Playwright run; drag starts in a playmat iframe, drops on the host rail). (2) behavioral browser
  check of the new client trainer steps ('/shared/...' specifiers -> not headless; static guard at
  `client/src/setup/rules/__tests__/trainer-step-parity.test.mjs`). (3) merge PR #176 (carries the
  two prior parse commits c2acf55/79e8084 too). SERVER-EXTENSION BACKLOG at the end of
  `.agent/journal/2026-09.md` and in docs/pkmncards-trainer-parse-and-lost-zone.md §8. Remaining 25
  are one-offs (rock-paper-scissors, use-an-opponent's-card, ~20 singles). NOTE: no free screen
  band — the 6%-wide rail overlays the right 6% of the sidebox.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` here is a junction to `../vibecodepokemontcg2-main/node_modules` (added S207); full `node --test` across shared/client/server/bot works, as does eslint (CRLF prettier noise only). Delete the junction if the main checkout moves.
- `parseTrainerEffect` regexes must accept both `Pokémon` and ASCII `Pokemon` — use `pok[ée]mon`.
- Tools: the server engine (`shared/engine/effects/trainer.mjs`) bypasses the parser and emits
  `attachTool`; tool passives are wired by `tool-combat.mjs`. Parser tool coverage only affects
  the client announce path.
- Server executor (`shared/engine/effects/executor.mjs`) supports only a subset of step types and
  skips the rest; all S207 new steps + `damageCounters`/`moveEnergy`/`variableDraw` are client-only.
  Full backlog at the end of the journal (S207 cont. 4).
- On the base branch `pnpm test` = D75 globs, 2145/2145 green; lint bar is the two-rule npx form.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S207: pkmncards trainer audit + 14 coverage slices incl. ~57 new step families; unrecognizable 402→25 (98.1%), full suite 2437/2437. Lost Zone rail added right of the mat.
- S206 merge: PRs #171/#172/#173 on `main`; 2145/2145, lint delta nil.
