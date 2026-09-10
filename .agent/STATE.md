# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 97
Focus: fix I37, resolve I36, open a PR for this branch (pokemon-multiplayer-test-bef06f).
Active: done. I37 FIXED: added `await` to every `moveCardBundle` call across the 4 hand-shuffle
  trainer-effect loops (trainer-execution.js — shuffleHandThenDraw/countShuffleDrawPlus/
  ionoShuffle/discardHandThenDraw) so each move's splice lands before the next iteration's
  synchronous hint-build reads the zone, and added a real `shuffleDeckAfterSearch` shuffle call
  for the three that move the hand into the deck (discardHandThenDraw discards, needs none).
  1297/1297 pnpm test; targeted eslint clean (CRLF/prettier noise only, baseline). Not live-2P
  verified — no harness yet for these specific card effects; the fix mirrors design 007's
  already-verified pattern. I36 CLOSED without a code change: traced the mirror-abort's blast
  radius (`applyPeerAction` increments `oppCounter` unconditionally regardless of the abort) and
  confirmed no desync/side-effect follows it — working as intended. Both moved to ISSUES.md
  Closed. Branch pushed; PR not opened by this session (no `gh` CLI or GH token in this
  environment) — compare URL handed to the user.
Next: live-verify I37's fix in a real 2P game (play Judge/Iono/N/Professor's-Research-style
  cards, check the sync log for zero `hint_mismatch`/wrong-card entries) — same shape as
  manual-verify-i24.mjs but for the hand-shuffle family, not yet built. Still open: confirm on
  localhost with `?e2e=1` that a bot can `loadDeckList`+`debugMode(true)` to bypass rules for
  card-isolation testing generally (S93's own use case). Also smoke-check S92's Trainer/turn
  fixes: play an Item then a Supporter in the same turn (Supporter should still be allowed),
  confirm the first player draws on turn 1. Also retest Grand Tree's Stage-2 chain against PR
  #97 (S91-main): if it still fails with NO message and the card vanishes for both players,
  check whether `evolveCard.js` ever sets `targetCard.image.attached` on the Stage-1 base (it
  currently doesn't, only `targetCard.attached`). Still open from S82/S88: I34 (turn-desync
  residual, 1/10 soak failures). Still open from S71/S73: mat-click pick/cancel/Escape flow,
  stray-click leak-through, opponent-side highlighting in local 2P, drag active→bench retreat
  live-verify — none browser-verified. Design 005/006 smoke-check still open. Maintenance due S100.
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
- S97 2026-09-11 fix(netcode): I37 — awaited moveCardBundle + real shuffle in the 4
  hand-shuffle trainer effects; I36 closed as working-as-intended (no code change).
- S96 2026-09-11 debug: audited I37/I36, found and recorded I37's real root cause.
- S95 2026-09-11 verify: live 2P legacy check of design 007's fix — closed I24.
