# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 236
Focus: Mat cosmetic effects (design 022) — all 7 slices built, awaiting the user's visual check.
Active: none. Work is on branch claude/mat-cosmetic-effects-dee363 (worktree meowth-last-ditch-catch-bug-091339), 7 commits, NOT pushed/merged.
Next: User eyeballs each effect on localhost under SERVER_AUTHORITATIVE=1 (+ reduced-motion pass), then merge to main and sync the primary folder.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Mat FX (S236/D94): one dispatch — add an effect = an `EVENT_FX` row in advisory-animations.mjs + a registry entry in
  `netcode/mat-fx/index.js`. Kill switch: localStorage `ptcg-fx-off`='1' or `body.fx-off`. Event payloads differ from
  the design's guesses (see design 022 Deviations); `damageUpdated` carries `dealt`, not `delta`.
- The primary checkout has UNCOMMITTED edits (STATE.md, index.css, rules-bridge.js) and an untracked copy of design 022;
  the worktree copy of 022 is the live one. Resolve before merging.
- Stadium tilt (S235/D93): `#stadium` is parent-owned; `--stadium-width` no longer exists (don't reintroduce it).
- Coin effects (S234/D92): `client/src/css/coin/` is the ONE source of coin styling; never put
  `filter`/`isolation`/`opacity` on `.coin-3d`/`.coin-face` (status idle keyframes obey this too).
- `pnpm lint` is pre-existing red (CRLF vs prettier `endOfLine`); only NEW rule errors count.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S236 feature: mat cosmetic effects slices 0-6 (combat, KO burst, status, lifecycle, ambience, flow); 2704/2704 tests;
  branch claude/mat-cosmetic-effects-dee363, unpushed.
- S235 fix(board-ui): Stadium card drawn in the table's tilted plane at in-play card size; commit 5e3e7e3 on main.
- S234 feature: coin material CSS — shared `css/coin/` + `coin-effects.mjs`; commit 1183757 on main.
