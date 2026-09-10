# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 87
Focus: debug — I32, I31 and I33 all root-caused and closed. Took over from two subagents that
  were stopped mid-investigation on usage grounds.
Active: done, three issues closed. I32 (retreat) was two bugs: `retreat()` did two untargeted
  moves so a FULL bench made move-card.js:279 reject the first leg and strand two Pokémon in
  active; and the peer re-ran `canPerformAction` when REPLAYING the retreat, silently returning
  when its per-turn state disagreed, so it never applied it at all. I31 (Trainer divergence) was
  the SAME replay defect in `attack()`, which skipped the `discardBoard()` sweep — that sweep is
  emit=false, so the peer must run its own copy during the replay, and a blocked replay loses it,
  stranding every played Trainer in the peer's `board` zone forever. Both fixed with
  `isMirrorReplayCall` (sync-action-args.mjs, +4 tests): a replayed action is never
  re-adjudicated — the acting client already decided. I33 was three HARNESS defects and no engine
  bug: `act()` read a client action's undefined return as success (a refusal is only ever a chat
  `⛔` line); the runner asked only client A whether the game had ended, though a deck-out is
  detected by whichever client fails to draw; and `gameEndedInfo` missed clients reaching
  `phase: 'ended'` without the event firing. Dump chat capture was also reading `#chatbox` while
  2P writes to `#p2Chatbox`, which is why the first attempt had nothing to go on.
  Verified: fixture coverage 9/10 on a 10-game soak and 3/3 on each of seeds 42/99/123 (was
  wedging routinely), heuristic 5/5, pnpm test 1254/1257 (3 = card-identity-live, network, red on
  main too). Real-deck runs still hit the turn cap HERE ONLY: this sandbox blocks api.tcgdex.net,
  so cards never enrich, attacks deal 0 damage and no win condition can be met.
Next: I34 (filed, NOT fixed) — the residual 1/10: both clients report `turnPlayer: 'opp'`
  simultaneously, each thinking it is the other's turn, with turnNumber drifted 13 vs 8. A real
  client-state divergence, and the same signature I29 was closed under in S82 as "a harness
  race" — that closure now looks premature. Start from the I31/I32 defect class: turn advance
  runs in `endTurn()` inside `endTurnWithBanner`, reached from both `pass()` and `attack()`, and a
  replayed action that returns early skips it. AUDIT EVERY acceptAction TARGET in chat-buttons.js
  for `canPerformAction`-on-mirror — three actions have now been caught with it. Still open from
  S73: drag active→bench retreat live-verify; mat pickers + Grand Tree. Maintenance due since S80.
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
