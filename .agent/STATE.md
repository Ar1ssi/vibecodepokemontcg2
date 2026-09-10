# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 81
Focus: fix I28 (legacy mode ends every 2P game after turn 1).
Active: done. Cause: `evaluateWinCondition` (chat-buttons.js) and `evaluateAndApplyWinConditions`
  (rules-bridge.js) both check "0 active + 0 bench = instant loss" for *both* sides every time a
  turn ends, but the side that hasn't had its own first turn yet legitimately has 0 Pokémon —
  Basic placement is an ordinary turn-1 action here, no separate setup-placement phase. Fixed by
  gating the `activeCounts` check behind `rulesState.turnNumber >= 3` (global ply counter, hits 3
  only once each side has had one turn) in both copies — `playerTurnCount` doesn't work since
  `endTurn` bumps the *incoming* player's count immediately, before they act. Verified: full
  `pnpm test` (1220/1223 pass; the 3 failures are the pre-existing `card-identity-live.test.mjs`
  network tests, blocked by this sandbox's egress policy, unrelated). Live-verified via
  `.agent/scratch/smoke-004-slice1-4.mjs`: a fresh 2-page game now survives past turn 1 — both
  sides place Pokémon and attack.
  Found a new, separate issue doing this: I29 — legacy 2P turn state eventually desyncs (both
  clients believe it's the other's turn simultaneously), wedging the game a few turns in. Not
  investigated — likely I24's family (legacy client-side turn mirroring). Filed, not fixed.
Next: I29 is now the live-verification blocker for design 004 slice 5/6 (can't finish a real
  multi-turn smoke game until it's understood). Otherwise design 004 slice 5 (`bot/bot.mjs`)
  is unblocked and can proceed independently (pure Node, no live game needed). Maintenance was
  due at S80 — still owed, do it before/alongside I29 if there's room.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game. `.agent/scratch/smoke-004-slice1-4.mjs` (legacy
  mode) and `flip-gate-test.mjs` (SERVER_AUTHORITATIVE mode) are the reference two-browser
  harnesses — the scratch one now plays multiple real turns, useful as a base for future checks.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`,
  and a fresh `pnpm install` (node_modules isn't pre-installed in this environment).
- I29 (new, P2): legacy 2P turn state can desync a few turns into a real game (both clients
  believe it's the other's turn) — a wedge with zero cmdRejected, likely I24's family. Blocks
  finishing a full live game smoke run.
- Three distinct "picker" overlays exist: `.card-picker-overlay`, `openMatPick`'s DOM-outline
  highlight, and the coin overlays — all bridged by `__ptcg.picker()`/`pick()` (design 004
  slice 4). Extend those, don't add a fourth path.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S81 2026-09-10 patch: fixed I28 (legacy mode's premature win check) in chat-buttons.js +
  rules-bridge.js; live-verified multi-turn play now works. Found and filed I29 in the process.
- S80 2026-09-10 debug (verification only, no code shipped): live-verified design 004 slices
  1-4 end to end; found I28 (legacy mode ends every game after turn 1).
- S79 2026-09-10 feature: design 004 slice 4 — `__ptcg.picker()`/`pick()`, bridging all three
  modal kinds (card-picker, mat-pick, coin overlays) from e2e-api.js only.
