# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 85
Focus: patch — fix I30 (legacy retreat desync found by design 004's playtest bot).
Active: done. `retreat()` (chat-buttons.js) no longer sends `[]` on its final
  `processAction` call — it now sends the resolved bench index. Added `parseRetreatArgs`
  (sync-action-args.mjs), mirroring the existing `parseAttackArgs` pattern, to disambiguate
  retreat's two calling conventions: local `(user, emit, targetBenchImage)` (a DOM element,
  meaningless on the peer) vs. acceptAction's replay `(user, benchIndex, emit)`. Regression
  tests added (sync-action-args.test.mjs, +6 tests, 88/88 green in that area). Live-verified
  with `playtest-bot.mjs`: seed 10 (previously failed 4/5 games on this exact bug) now passes
  5/5; a fresh seed 20 batch passes 6/6. I30 closed; design 004 slice 6's "zero failures"
  acceptance now holds.
Next: nothing queued. Still open from S73: (1) live-verify drag active→bench retreat flow
  (now double-worth doing, since I30 touched that exact path), (2) mat click-to-select
  pickers + Grand Tree fix. Maintenance has been due since S80 — do it before/alongside the
  next feature if room.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `playtest-bot.mjs --games=N` is now a real regression gate for legacy-mode multiplayer
  desyncs, not just a bug-finder — a clean run used to be blocked on I30, now it isn't. Treat
  a new failure from it as a real finding again, not "known I30 noise."
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs` and
  the new `parseRetreatArgs` (sync-action-args.mjs) for the established disambiguation pattern
  before adding a parameter to any other legacy action.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- `turnState().fromServer` is meaningless in legacy mode (SERVER_AUTHORITATIVE unset, this
  repo's default) — it only ever becomes true under flip-gate-test.mjs's authoritative mode.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S85 2026-09-10 patch: closed I30 (legacy retreat desync) — see Active above.
- S84 2026-09-10 feature: shipped design 004 slice 6 (`playtest-bot.mjs`), the design's final
  slice. Live-verified; found I30 (fixed this session).
- S83 2026-09-10 feature: shipped design 004 slice 5 (`bot/bot.mjs`, `bot/heuristic-scorer.mjs`),
  14 unit tests green, wired into `pnpm test`.
