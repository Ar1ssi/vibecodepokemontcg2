# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 82
Focus: investigate and fix I29 (legacy 2P turn-state desync found in S81).
Active: done. Closed I29 as wontfix — it was a bug in the smoke harness
  (`.agent/scratch/smoke-i29-realpass.mjs`), not the engine. Its stall-detection re-poll always
  re-checked `a.page`'s `turnState()` no matter which side (`active`) had just been queried,
  so when B was active it watched A's (already-settled) state for 3s, saw nothing change, and
  gave up while B's own mirrored `attack()` → `endTurnWithBanner` was still completing over the
  socket round trip. Fixed the harness to poll `active.page` with a 6s window. Re-ran twice
  against a live localhost:4000 server: a fresh legacy 2P game now plays 15+ alternating real
  attacks (zero cmdRejected) through to a legitimate deck-out win, both times. Confirmed via
  temporary instrumentation (added and removed) that `attack()`'s opp-mirror path always
  reaches `endTurn` and flips `turnPlayer` correctly — no engine code changed.
  `pnpm test`: 1220/1223 (same 3 pre-existing network-test failures, unrelated).
Next: design 004 slice 5 (`bot/bot.mjs` — heuristic scorer + `legalFallback`, pure Node, no
  live game needed) is now fully unblocked; per `.agent/designs/004-playwright-playtest-bot.md`
  it's next in the work plan, then slice 6 (`playtest-bot.mjs` runner). Still open from S73:
  (1) live-verify drag active→bench retreat flow, (2) mat click-to-select pickers + Grand Tree
  fix. Maintenance has been due since S80 — still owed, do it before/alongside slice 5 if room.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game. `.agent/scratch/smoke-i29-realpass.mjs` (legacy
  mode, now plays full games cleanly) and `flip-gate-test.mjs` (SERVER_AUTHORITATIVE mode) are
  the reference two-browser harnesses.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- When a two-browser harness reports a "desync" or "wedge", check the harness's own polling
  logic first (which page it re-checks, how long it waits) before assuming an engine bug — I29
  turned out to be exactly this.
- Three distinct "picker" overlays exist: `.card-picker-overlay`, `openMatPick`'s DOM-outline
  highlight, and the coin overlays — all bridged by `__ptcg.picker()`/`pick()` (design 004
  slice 4). Extend those, don't add a fourth path.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S82 2026-09-10 debug: closed I29 (wontfix — harness race, not an engine bug); fixed
  `smoke-i29-realpass.mjs`'s stall-detection poll. No gameplay file touched.
- S81 2026-09-10 patch: fixed I28 (legacy mode's premature win check) in chat-buttons.js +
  rules-bridge.js; live-verified multi-turn play now works. Found and filed I29 in the process.
- S80 2026-09-10 debug (verification only, no code shipped): live-verified design 004 slices
  1-4 end to end; found I28 (legacy mode ends every game after turn 1).
