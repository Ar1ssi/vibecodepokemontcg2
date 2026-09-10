# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 86
Focus: patch — three real-deck gaps in design 004's playtest bot, found by running it against
  an actual 60-card list instead of the 20-card fixture.
Active: done. The fixture deck (20 all-Basics, no Energy, no Trainers) meant every prior
  acceptance run exercised about a third of the option vocabulary. One run on a real deck
  (18 Pokémon / 32 Trainer / 10 Energy) was 264 passes out of 291 actions. Three fixes:
  (1) `heuristic-scorer.mjs` had NO `playTrainer` tier — `options()` enumerated it and `act()`
  executed it, but the scorer never picked it, so half the deck was unplayable. Design 004's own
  priority list omitted it; the implementing session built what was written. Trainers now rank
  above `attach`. (2) New guard 3: a Trainer whose effect this client can't execute stays in
  hand, and priority ordering would replay it until the 60-action turn budget ran out; the runner
  now marks any `playTrainer` that left the hand count unchanged and feeds it back as
  `observation.triedThisTurn` (keyed by card NAME — hand indices shift), which the scorer skips
  for the rest of that turn. `pass` is never excluded, so the bot can't be stranded. (3) The
  runner never waited for TCGdex enrichment (slice 6 required it, it only waited for
  `deck.count >= 1`); `build-deck.js`'s existing fire-and-forget `ensureCardData` pass is now
  parked on `systemState.cardDataReady` and awaited via the new `__ptcg.cardDataReady()`, bounded
  at 60s. Also: failure dumps for pageerror/softlock/wedge carried `observation: null`, so they
  weren't replayable — they now carry `lastObservation`/`lastChosen`. +6 scorer tests (1242/1245
  green; the 3 failures are `card-identity-live.test.mjs`, network tests that fail on `main` too
  in a no-egress sandbox). Fixture deck still 3/3 live.
Next: I31 (filed this session, NOT fixed) — a real 60-card deck now reaches a legacy 2P public-
  board divergence after a Trainer is played, reproduced twice from `--seed=7`, identical
  signature both times (playTrainer succeeds → next attack trips the check → zero cmdRejected).
  Check it against I24 (same suspected family, still UNVERIFIED live) before opening a fresh
  investigation. Still open from S73: (1) live-verify drag active→bench retreat flow, (2) mat
  click-to-select pickers + Grand Tree fix. Maintenance has been due since S80.
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
