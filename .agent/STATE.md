# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 91
Focus: merged main (S90b — 3D Energy tokens design 005 + generation pills design 006) into the
  evolution-ui-mat-selection branch and resolved the harness-file conflicts (renumbered this
  branch's S73→S91, D21→D26 — both collided with a concurrent session's own S73/D21). This
  session's own substance (S71 mat-click pickers D19, S72 Grand Tree double-move fix D20, S91
  Grand Tree stage-2 re-resolve + failure messaging D26) predates the merge; see journal S71/72/91.
Active: not yet re-verified. User reported the D20 fix did NOT resolve the live "Grand Tree
  stage 2 disappears" bug on a fresh PR96 deploy, then clarified: the stage-2 card disappears
  for BOTH players after "Done" is pressed in the picker — implying a real synced move that
  lands nowhere visible, not a pure local no-op (the sync log read for D26 showed zero wire
  activity, which doesn't fully square with "both players see it vanish" — root cause still
  not 100% pinned). D26's fix (PR #97) is live-pushed but not yet retested.
Next: user retests Grand Tree's Stage-2 chain against PR #97. If it still fails, check for the
  new "⛔ Grand Tree: could not evolve..." chat message — report it verbatim, it names which
  side (deck card vs host) the guard rejected. If it fails with NO message and the card still
  vanishes for both players, the guard isn't the cause — get a fresh sync log from that exact
  run and check whether `evolveCard.js` ever sets `targetCard.image.attached` on the Stage-1
  base (it currently doesn't, only `targetCard.attached` — a card-level vs image-level flag
  mismatch that's a plausible next lead). Also still open from S71: mat-click pick/cancel/
  Escape flow, stray-click leak-through, opponent-side highlighting in local 2P — none
  browser-verified. Also open from main: S82/S88 I34 (turn-desync residual), S73(main) drag
  active→bench retreat live-verify, design 005/006 smoke-check. Maintenance due S96.
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
- S91 2026-09-10 debug(rules): Grand Tree stage-2-chain re-resolves host zone/index live +
  failure messaging (D26, PR #97). Does not yet have a confirmed live fix — see Next above.
- S90/S90b 2026-09-10 feature: design 006 — generation pills + per-generation Energy tabs in
  Browse Sets (merged from main).
- S89/S89b 2026-09-10 feature+patch: 3D energy tokens for attached Energy (design 005, merged
  from main).
