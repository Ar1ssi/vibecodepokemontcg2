# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 235
Focus: Board UI — render the in-play Stadium card in the table's tilted plane at in-play card size.
Active: none.
Next: User visual check of the Stadium size/position across mats and with the sidebox open/closed.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Stadium tilt (S235/D93): `#stadium` is parent-owned, so it cannot inherit `#battleMat`'s tilt.
  `apply-table-tilt.js` reuses `tilt.mat.transform` with the mat pivot re-expressed in the Stadium's
  own frame via pure `stadiumTilt` (`table-tilt.mjs`); both boxes are read UNtransformed, so
  re-applying never feeds the projected rect back in. `#stadium` sizes from `--stadium-height` +
  `aspect-ratio: var(--card-aspect)`; `--stadium-width` no longer exists (don't reintroduce it).
- Concurrent `.agent` writers collided (S230/S233 vs S231/S232/S234). Re-read `git log`/`git status`
  before assuming what is on main.
- Coin effects (S234/D92): `client/src/css/coin/` is the ONE source of coin material styling; never
  put `filter`/`isolation`/`opacity` on `.coin-3d`/`.coin-face` (flattens the flip's `preserve-3d`).
- Battle-log mapper (S233/D91): `client/src/setup/netcode/server-battle-log.mjs` is the single
  server-event→text map, wired as `onAdvisoryEvent`; don't add a second text handler.
- `pnpm lint` is pre-existing red (CRLF vs prettier `endOfLine`); only NEW rule errors count.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S235 fix(board-ui): Stadium card drawn in the table's tilted plane at in-play card size (new pure
  `stadiumTilt` + per-profile mat-layout sizes + card-aspect box); 2 tests, full suite 2651/2651,
  commit 5e3e7e3 on main.
- S234 feature: coin material CSS — shared `css/coin/` + `coin-effects.mjs` (fixed light, studio env,
  per-material specular, relief mask, holofoil/mirror finishes); commit 1183757 on main.
- S233 feature: authoritative battle-log narration (design 021/I71) — pure event→text mapper +
  server `trainerPlayed`; commit 38e97ff on main.
