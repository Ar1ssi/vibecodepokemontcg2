# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 83
Focus: design 004 slice 5 — the playtest bot (bot/bot.mjs + bot/heuristic-scorer.mjs).
Active: done. Shipped `bot/bot.mjs` (never-crash `decide()`/`legalFallback` scaffold, ported from
  the Kaggle repo's agent.py:682 shape, plus a `scorer-invalid` guard for a scorer that returns
  something not in `options`) and `bot/heuristic-scorer.mjs` (priority order
  evolve→playBasic→attach→ability→attack→retreat→pass, both design guards satisfied — guard 1 by
  the order itself, guard 2 via `parseDamage`/`activeHasUnmetCost`). 14 unit tests over recorded
  observe()+options() fixtures (`bot/__tests__/bot.test.mjs`, `heuristic-scorer.test.mjs`), all
  green, wired into `package.json`'s `test` script. No gameplay file touched — new files only.
  Updated design 004 (slice 5 marked SHIPPED S83), MAP.md (new bot/ entry).
  Ran only the new narrow tests, not the full suite/lint (user's explicit instruction this
  session) — full `pnpm test`/`pnpm lint` still owed before slice 6 ships.
Next: design 004 slice 6 (`playtest-bot.mjs` runner) is now unblocked — boots two Playwright
  pages, loops observe()→decide()→act(), drains picker(), asserts per-turn invariants. Before
  that: run full `pnpm test`/`pnpm lint` once to confirm slice 5 didn't regress anything (owed
  from this session). Still open from S73: (1) live-verify drag active→bench retreat flow,
  (2) mat click-to-select pickers + Grand Tree fix. Maintenance has been due since S80 — still
  owed, do it before/alongside slice 6 if room.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game; `bot/bot.mjs` + `bot/heuristic-scorer.mjs` are
  pure Node and expect `{ ...observe(), options: await options() }` as their input shape — the
  slice 6 runner is what assembles that merge, it doesn't exist in e2e-api.js itself.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- When a two-browser harness reports a "desync" or "wedge", check the harness's own polling
  logic first (which page it re-checks, how long it waits) before assuming an engine bug — I29
  (S82) turned out to be exactly this.
- Three distinct "picker" overlays exist: `.card-picker-overlay`, `openMatPick`'s DOM-outline
  highlight, and the coin overlays — all bridged by `__ptcg.picker()`/`pick()` (design 004
  slice 4). Extend those, don't add a fourth path.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S83 2026-09-10 feature: shipped design 004 slice 5 (`bot/bot.mjs`, `bot/heuristic-scorer.mjs`),
  14 unit tests green, wired into `pnpm test`. Slice 6 (runner) now unblocked.
- S82 2026-09-10 debug: closed I29 (wontfix — harness race, not an engine bug); fixed
  `smoke-i29-realpass.mjs`'s stall-detection poll. No gameplay file touched.
- S81 2026-09-10 patch: fixed I28 (legacy mode's premature win check) in chat-buttons.js +
  rules-bridge.js; live-verified multi-turn play now works. Found and filed I29 in the process.
