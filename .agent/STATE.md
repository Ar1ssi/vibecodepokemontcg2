# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 94
Focus: merging concurrently-opened PRs into main (#97 Grand Tree fix, #98 Trainer/turn rules,
  #99 e2e debug mode, now #100 legacy 2P mirror desync fix).
Active: done. PR #100 (design 007): benched Pokémon from a deck search (Buddy-Buddy Poffin)
  never appeared on the peer in legacy (non-authoritative) 2P. Root cause: search effects
  relayed `shuffleZone` before the un-awaited `moveCardBundle`, so the peer's mirror applied a
  permutation of the wrong length; the old `rearrangeArray` dropped a card or left an undefined
  hole, and `resolveCardIndex` threw on the hole (swallowed by acceptAction). Fix: picker awaits
  moves before confirm (card-picker-moves.mjs); move→shuffle sites await; moveCard re-resolves
  its index before the splice; rearrangeArray keeps every card and returns an exact-permutation
  flag; shuffleZone logs `shuffleZone.indices_mismatch` instead of silently corrupting; 3
  duplicate picker move loops removed. D28 records the rationale. 1295/1295 pass. Full detail
  in journal S91(orig)/S94.
Next: user live-checks a 2P legacy game: play Buddy-Buddy Poffin / Ultra Ball / Nest Ball; peer
  must show every benched Pokémon and the sync log must show each move before its `shuffleZone`,
  with no `indices_mismatch`. Open follow-ups from that PR: I37 (hand→deck-then-shuffle paths
  unaudited), I36 (promote-abort, unexplained). Also still open: confirm on localhost with
  `?e2e=1` that a bot can `loadDeckList`+`debugMode(true)` to bypass rules (S93, not
  live-verified — needs a two-page harness run). Also smoke-check S92's Trainer/turn fixes: play
  an Item then a Supporter in the same turn (Supporter should still be allowed), confirm the
  first player draws on turn 1. Also retest Grand Tree's Stage-2 chain against PR #97 (S91-main):
  if it still fails with NO message and the card vanishes for both players, check whether
  `evolveCard.js` ever sets `targetCard.image.attached` on the Stage-1 base (it currently
  doesn't, only `targetCard.attached`). Still open from S82/S88: I34 (turn-desync residual,
  1/10 soak failures). Still open from S71/S73: mat-click pick/cancel/Escape flow, stray-click
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
  localhost manually. See project memory `feedback_css_preview.md`. Same applies to anything
  needing a live 2P/e2e harness run (single-tab preview can't exercise it).
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
- S94 2026-09-11 fix(netcode): legacy 2P mirror desync on benched Pokémon from deck search —
  see Active above (D28, design 007).
- S93 2026-09-11 feature: e2e/debug mode for bot card testing (D27).
- S92 2026-09-11 patch: Item plays no longer trip the Supporter-per-turn gate; turn 1 now draws
  (user override of the official skip-first-draw rule).
