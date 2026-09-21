# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 236
Focus: Render — TCG Live-style full-screen 3D coin-flip ceremony for the opening call and in-game flips.
Active: none.
Next: User visual check of the ceremony (dim + centered coin tumble + result) on a live 2-browser match;
  run `coin-flip-visual-test.mjs` against `SERVER_AUTHORITATIVE=1`.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Coin ceremony (S236/D94): `client/src/setup/rules/coin-flip-ceremony.js` is the ONE flip presentation
  (dim + centered 3D coin via `css/coin/*`). Both `playTurnOrderCoinAnimation` and `flipBoardCoin` call
  it; `flipMatCoin` is gone. Never re-add `filter`/`isolation`/`opacity` to `.coin-3d`/`.coin-face`.
- Both seats show the same coin: the opener's `coinId` rides the `turnOrderCall` handshake and is echoed
  in `turnOrderResult` (bounded display-only string; the server still owns the result, D10). In-game
  flips relay `coinFlipCeremony` and are auto-random; `pickRandomCoin` is gone — use `pickDefaultCoin`.
- Stadium tilt (S235/D93): `#stadium` is parent-owned, so it cannot inherit `#battleMat`'s tilt;
  `apply-table-tilt.js` re-expresses the mat pivot via pure `stadiumTilt`. `--stadium-width` must not
  come back (`aspect-ratio: var(--card-aspect)` sizes it).
- Coin material CSS (S234/D92): `client/src/css/coin/` is the one styling source; picker + iframes only
  `@import url('./coin/coin.css')` + sizing.
- `pnpm lint` is pre-existing red (CRLF vs prettier `endOfLine`, plus 12 `no-empty` in rules-bridge.js);
  only NEW rule errors count.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S236 feature(render): shared full-screen 3D coin-flip ceremony; opening + in-game routed through it,
  server-echoed `coinId` for both seats; full suite 2658/2658. (D94)
- S235 fix(board-ui): Stadium card drawn in the table's tilted plane at in-play card size (new pure
  `stadiumTilt`); commit 5e3e7e3 on main.
- S234 feature: coin material CSS — shared `css/coin/` + `coin-effects.mjs`; commit 1183757 on main.
