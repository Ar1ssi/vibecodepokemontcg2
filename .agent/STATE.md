# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 95
Focus: live-verifying PR #100 (design 007, legacy 2P search-shuffle desync) per user request,
  then closing I24.
Active: done. Live 2P legacy check (SERVER_AUTHORITATIVE unset) via a 2-client Playwright
  harness (`manual-verify-i24.mjs`, new — uses shipped `?e2e=1` debug mode: `loadDeckList` with
  real Buddy-Buddy Poffin/Ultra Ball/Nest Ball + `debugMode(true)` to bypass turn order). Played
  all three; confirmed the peer sees every benched Pokémon (matches A's own bench exactly), the
  sync log's `move` (deck→bench) emit precedes its `shuffleZone` emit on every search, and zero
  `shuffleZone.indices_mismatch` entries. Closed I24 (moved to ISSUES.md Closed). Found & fixed
  in passing: a stale `node server/server.js` process from another session was already listening
  on :4000 without the debugMode commit (`pnpm -C server start` is the correct launch — plain
  `node server/server.js` fails with ERR_MODULE_NOT_FOUND outside the server workspace).
Next: I37 (hand→deck-then-shuffle paths unaudited) and I36 (promote-abort, unexplained) still
  open from design 007 — this session only exercised the deck-search family. Still open: confirm
  on localhost with `?e2e=1` that a bot can `loadDeckList`+`debugMode(true)` to bypass rules for
  card-isolation testing generally (S93's own use case, distinct from this session's search-sync
  check). Also smoke-check S92's Trainer/turn fixes: play an Item then a Supporter in the same
  turn (Supporter should still be allowed), confirm the first player draws on turn 1. Also retest
  Grand Tree's Stage-2 chain against PR #97 (S91-main): if it still fails with NO message and the
  card vanishes for both players, check whether `evolveCard.js` ever sets
  `targetCard.image.attached` on the Stage-1 base (it currently doesn't, only
  `targetCard.attached`). Still open from S82/S88: I34 (turn-desync residual, 1/10 soak
  failures). Still open from S71/S73: mat-click pick/cancel/Escape flow, stray-click
  leak-through, opponent-side highlighting in local 2P, drag active→bench retreat live-verify —
  none browser-verified. Design 005/006 smoke-check still open. Maintenance due S96.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- New: `openMatPick()` in client/src/setup/rules/trainer-execution.js is the pattern for any
  future "pick an in-play Pokémon" step — reuse it, don't re-add a modal picker for that case.
  It relies on `card.image` already being the live DOM node and on a document-level
  capture-phase click listener outrunning click-events.js/drag.js's own listeners; if a future
  refactor moves those to Shadow DOM or a different capture root this will silently stop gating.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually (project memory `feedback_css_preview.md`). Functional/netcode live checks
  are different: drive them via a Playwright script (see `manual-verify-i24.mjs`), not the
  Browser pane, and launch the server with `pnpm -C server start`, not `node server/server.js`
  directly (ERR_MODULE_NOT_FOUND outside the server workspace) — also check `tasklist` for a
  stale node process already on :4000 from another worktree/session before trusting a 200.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1. Verify a diff's own files with a targeted `npx eslint
  <files>` and read past the CRLF noise; don't try to fix the repo-wide config in passing.
- A relayed action that throws inside `acceptAction` leaves NO sync-log entry (console.error
  only) — a recv with no following resolve/abort line means "threw", not "skipped". Check the
  mirror zone for undefined slots / wrong length first (design 007).
- The `?e2e=1` bridge (`window.__ptcg`, e2e-api.js) is a scripting API over the local player's
  own board, armed server-side only outside production (Archive D21). It already exposes the
  live mutable `rulesState` object by reference — `debugMode()` (S93) just wraps that plus
  persistence; don't re-derive a second rules-bypass mechanism.
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs`/
  `parseRetreatArgs` (sync-action-args.mjs) before adding a parameter to any legacy action.
- Session/decision numbers collide often across concurrent branches — before rewriting
  STATE/DECISIONS on a merge, diff against origin/main's own copy first and renumber the
  incoming side, don't just pick one.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S95 2026-09-11 verify: live 2P legacy check of design 007's fix — closed I24.
- S94 2026-09-11 fix(netcode): legacy 2P mirror desync on benched Pokémon from deck search —
  design 007, closed live by S95.
- S93 2026-09-11 feature: e2e/debug mode for bot card testing (D27).
