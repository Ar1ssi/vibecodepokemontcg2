# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 91
Focus: two Trainer/turn rule bug reports from the user (patch workflow).
Active: done. (1) move-card.js playTrainer branch called markSupporterPlayed() for every
  hand->board Trainer play, not just Supporters — Items falsely tripped the one-Supporter-per-
  turn gate on the next real Supporter. Fixed by gating the call on the existing isSupporter
  check (move-card.js:237). (2) shouldAutoDrawAtTurnStart() (rules-state.mjs) skipped the draw
  on turn 1 for the player going first. That is the actual official TCG rule and was covered by
  a passing test — flagged this to the user before editing; user confirmed (AskUserQuestion) they
  want it changed anyway, so the turnNumber===1 guard is removed and turn 1 now draws normally.
  Updated the matching unit test. 1281/1281 tests pass. See journal S91.
Next: user should smoke-check both fixes on localhost: play an Item then a Supporter in the same
  turn (Supporter should still be allowed), and confirm the first player now draws on turn 1.
  Still open from S82/S88: I34 (turn-desync residual, 1/10 soak failures) — see journal S88 for
  the lead. Still open from S73: drag active->bench retreat live-verify; mat pickers + Grand Tree.
  Maintenance due S96 (S86 sweep was the last one).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1. Verify a diff's own files with a targeted `npx eslint
  <files>` and read past the CRLF noise; don't try to fix the repo-wide config in passing.
- `playtest-bot.mjs --games=N` is now a real regression gate for legacy-mode multiplayer
  desyncs, not just a bug-finder — a clean run used to be blocked on I30, now it isn't. Treat
  a new failure from it as a real finding again, not "known I30 noise."
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs`/
  `parseRetreatArgs` (sync-action-args.mjs) before adding a parameter to any legacy action.
- `turnState().fromServer` is meaningless in legacy mode (SERVER_AUTHORITATIVE unset, this
  repo's default) — it only ever becomes true under flip-gate-test.mjs's authoritative mode.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S91 2026-09-11 patch: Item plays no longer trip the Supporter-per-turn gate; turn 1 now draws
  (user override of the official skip-first-draw rule) — see Active above.
- S90/S90b 2026-09-10 feature: design 006 — generation pills + per-generation Energy tabs in
  Browse Sets.
- S89/S89b 2026-09-10 feature+patch: 3D energy tokens for attached Energy (design 005, a
  concurrent session, merged from main).
