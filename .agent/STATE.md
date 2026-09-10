# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 92
Focus: merging concurrently-opened PRs into main (#97 Grand Tree stage-2 fix landed first; this
  merge brings in #98's Trainer/turn rule fixes on top).
Active: done. (1) move-card.js playTrainer branch called markSupporterPlayed() for every
  hand->board Trainer play, not just Supporters — Items falsely tripped the one-Supporter-per-
  turn gate on the next real Supporter. Fixed by gating the call on the existing isSupporter
  check (move-card.js:237). (2) shouldAutoDrawAtTurnStart() (rules-state.mjs) skipped the draw
  on turn 1 for the player going first. That is the actual official TCG rule and was covered by
  a passing test — flagged this to the user before editing; user confirmed (AskUserQuestion) they
  want it changed anyway, so the turnNumber===1 guard is removed and turn 1 now draws normally.
  Updated the matching unit test. 1281/1281 tests pass. See journal S91.
Next: user should smoke-check both S91 fixes on localhost: play an Item then a Supporter in the
  same turn (Supporter should still be allowed), and confirm the first player now draws on turn 1.
  Also retest Grand Tree's Stage-2 chain against PR #97 (S91-main): if it still fails, check for
  the new "⛔ Grand Tree: could not evolve..." chat message — report it verbatim, it names which
  side (deck card vs host) the guard rejected. If it fails with NO message and the card still
  vanishes for both players, the guard isn't the cause — get a fresh sync log from that exact
  run and check whether `evolveCard.js` ever sets `targetCard.image.attached` on the Stage-1
  base (it currently doesn't, only `targetCard.attached` — a card-level vs image-level flag
  mismatch that's a plausible next lead). Still open from S82/S88: I34 (turn-desync residual,
  1/10 soak failures) — see journal S88 for the lead. Still open from S71/S73: mat-click pick/
  cancel/Escape flow, stray-click leak-through, opponent-side highlighting in local 2P, drag
  active→bench retreat live-verify — none browser-verified. Design 005/006 smoke-check still
  open. Maintenance due S96.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- New: `openMatPick()` in client/src/setup/rules/trainer-execution.js is the pattern for any
  future "pick an in-play Pokémon" step — reuse it, don't re-add a modal picker for that case.
  It relies on `card.image` already being the live DOM node and on a document-level
  capture-phase click listener outrunning click-events.js/drag.js's own listeners; if a future
  refactor moves those to Shadow DOM or a different capture root this will silently stop gating.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1. Verify a diff's own files with a targeted `npx eslint
  <files>` and read past the CRLF noise; don't try to fix the repo-wide config in passing.
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs`/
  `parseRetreatArgs` (sync-action-args.mjs) before adding a parameter to any legacy action.
- Session/decision numbers collide often across concurrent branches (S73/S73, D21/D21 this
  merge) — before rewriting STATE/DECISIONS on a merge, diff against origin/main's own copy
  first and renumber the incoming side, don't just pick one.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S91 2026-09-11 patch: Item plays no longer trip the Supporter-per-turn gate; turn 1 now draws
  (user override of the official skip-first-draw rule) — see Active above.
- S91-main 2026-09-10 debug(rules): Grand Tree stage-2-chain re-resolves host zone/index live +
  failure messaging (D26, PR #97). Does not yet have a confirmed live fix — see Next above.
- S90/S90b 2026-09-10 feature: design 006 — generation pills + per-generation Energy tabs in
  Browse Sets.
