# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 84
Focus: design 004 slice 6 — the playtest runner (`playtest-bot.mjs`), the design's final slice.
Active: done. Shipped `playtest-bot.mjs` (boots two Playwright pages, loops
  observe()→decide()→act() via bot/bot.mjs, drains picker(), asserts per-turn invariants,
  dumps a replayable trace on failure) + `window.__ptcg.loadDeckList()` (e2e-api.js, for the
  `--deck` option). Live-verified against a real `node server/server.js`: found and fixed two
  runner-side issues (legacy-mode turn-order race; a divergence-check race), then the bot
  immediately found a real pre-existing bug and correctly dumped a reproducible trace for it —
  filed as I30, not fixed (chat-buttons.js is a gameplay file, out of design 004's scope).
  Design 004 is now fully shipped (all 6 slices, S78-S84).
Next: I30 (legacy retreat desync — likely a quick patch: thread `targetBenchInstanceId` through
  `retreat()`'s `processAction(user, emit, 'retreat', [])` at chat-buttons.js:2367 so the peer
  replay picks the same bench card) is the natural next debug workflow — fixing it is what
  would let a real 50-game playtest-bot soak pass clean. Still open from S73: (1) live-verify
  drag active→bench retreat flow, (2) mat click-to-select pickers + Grand Tree fix. Maintenance
  has been due since S80 — still owed, do it before/alongside the next feature if room.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `playtest-bot.mjs --games=N` reliably finds I30 (~4/5 fixture games) until it's fixed — that's
  not a runner regression, don't re-diagnose it from scratch. Dumps land in `out/playtest/`
  (gitignored) with `{seed, gameIndex, turn, reason, chosen, stepLog, cmdRejections}`.
- `turnState().fromServer` is meaningless in legacy mode (SERVER_AUTHORITATIVE unset, this
  repo's default) — it only ever becomes true under flip-gate-test.mjs's authoritative mode.
  Sync on turnPlayer disagreement instead (see playtest-bot.mjs's setupGame).
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- When a two-browser harness reports a "desync" or "wedge", check the harness's own polling
  logic first (which page it re-checks, how long it waits) before assuming an engine bug — I29
  (S82) and one of this session's own runner bugs were exactly this.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S84 2026-09-10 feature: shipped design 004 slice 6 (`playtest-bot.mjs`), the design's final
  slice. Live-verified; found real bug I30 (legacy retreat desync).
- S83 2026-09-10 feature: shipped design 004 slice 5 (`bot/bot.mjs`, `bot/heuristic-scorer.mjs`),
  14 unit tests green, wired into `pnpm test`.
- S82 2026-09-10 debug: closed I29 (wontfix — harness race, not an engine bug); fixed
  `smoke-i29-realpass.mjs`'s stall-detection poll. No gameplay file touched.
