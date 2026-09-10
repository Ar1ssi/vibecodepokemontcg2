# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 87
Focus: debug — I32 (retreat desync) root-caused and CLOSED, both halves. Took over from two
  subagents that were stopped mid-investigation on usage grounds.
Active: done. Two distinct bugs under one issue. (1) LOCAL: `retreat()` did two untargeted moves
  (active→bench, bench→active); with 5 on the bench the first leg asks for a 6th, so the
  bench-limit gate at move-card.js:279-292 (which only applies when no `targetCard` was named)
  rejected it and left the retreating Pokémon in active beside the promoted one. Fixed with ONE
  targeted move — the gate skips targeted moves and autoMoveActiveBenchCard case 3 does the swap.
  (2) MIRROR: the peer re-ran `canPerformAction` when REPLAYING the other client's retreat; the
  gate reads per-turn state (turnPlayer, retreatedThisTurn, attackerAttacked) the mirror need not
  hold identically, so on disagreement it hit the ⛔ branch and returned — never applying the
  retreat. Proven from dumps: the peer's board was the exact pre-retreat state, not a mis-targeted
  swap. Fixed with `isMirrorReplayCall` (sync-action-args.mjs, +4 unit tests): a replayed action is
  not re-adjudicated — the acting client already decided. Also added both clients' publicZones and
  chat to failure dumps, which is what made the diagnosis possible in two runs instead of guesswork.
  Verified: coverage seed42 0/3 → 3/3 (retreats 3→11/game, actions 18→190), heuristic 3/3,
  pnpm test 1254/1257 (3 = card-identity-live, network, red on main too).
Next: I33 (filed, NOT fixed) — with I32 gone, games reach turn 10-14 and then wedge: the joiner
  passes 60x in one turn, every act reporting ok, both boards agreeing. START by fixing
  `__ptcg.act()`, which maps a client action's `undefined` return to `ok: true`, so a pass the
  rules gate BLOCKED is indistinguishable from one that worked — the dumps cannot tell you why
  until that reports honestly. Only then decide whether it is a real gate disagreement or the
  harness's own turn detection (I29's shape, closed S82 as a harness race). I31 (Trainer
  divergence, real 60-card deck) is still open and untouched; its one lead, from an abandoned
  subagent, is the `board` staging zone + `discardBoard(user, user, false, false)` on attack.
  Still open from S73: drag active→bench retreat live-verify; mat pickers + Grand Tree.
  Maintenance has been due since S80.
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
