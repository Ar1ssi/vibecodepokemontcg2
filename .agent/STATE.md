# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 87
Focus: patch — real-deck gaps in design 004's playtest bot (found by running it against an
  actual 60-card list instead of the 20-card fixture) + a maintenance sweep in parallel.
Active: done. Fixture deck (20 all-Basics, no Trainers/Energy) meant prior runs exercised ~1/3
  of the option vocabulary. Fixed: (1) `heuristic-scorer.mjs` had no `playTrainer` tier at all;
  (2) a Trainer the client can't execute now stays in hand instead of being replayed all turn
  (`observation.triedThisTurn`); (3) the runner now awaits `__ptcg.cardDataReady()` instead of
  just `deck.count`. Added `bot/coverage-scorer.mjs` (`--scorer=coverage`, ranks by
  least-exercised mechanic) — found I31/I32 on first run. +14 tests (1250/1253, same 3
  pre-existing network failures). Maintenance sweep also ran (logged as S86): design 004
  archived, stale MAP.md/DECISIONS.md lines fixed, 2 scratch files deleted, I33 filed.
Next: I31 (Trainer play → board divergence, likely I24's family) and I32 (retreat from high
  bench index breaks the peer — start from I30's `parseRetreatArgs`), both filed, neither fixed.
  `--scorer=coverage` is RED until I32 is fixed. Still open from S73: live-verify drag
  active→bench retreat, mat pickers + Grand Tree fix. Maintenance next due S96.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, `?e2e=1` only) is the supported
  programmatic seam into a live game; `playtest-bot.mjs` (root, `--scorer=heuristic|coverage`)
  is the permanent two-browser soak harness — prefer it over a new ad-hoc smoke script.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- When a two-browser harness reports a "desync"/"wedge", check its own polling logic first —
  I29 (closed) was a harness bug; I31/I32 (open) were checked and look like real engine bugs.
- CSS/visual checks: don't drive the Browser pane yourself — user checks localhost manually.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S87 2026-09-10 patch: real-deck bot fixes (playTrainer tier, inert-Trainer guard, enrichment
  wait) + coverage-scorer brain; found I31/I32 (neither fixed).
- S86 2026-09-10 maintain: harness sweep (design 004 archived, stale docs fixed, I33 filed).
- S85 2026-09-10 patch: closed I30 (legacy retreat desync).
