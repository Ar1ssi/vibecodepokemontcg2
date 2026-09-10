# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 93
Focus: merging concurrently-opened PRs into main (#97 Grand Tree fix, #98 Trainer/turn rules,
  now #99 e2e debug mode for testing bots).
Active: done. PR #99: "debug mode" for testers/CPU bots — summon any cards, break all rules,
  purely for Playwright card-functionality testing. Turned out to be almost entirely already
  built behind the existing `?e2e=1` scripting bridge (Archive D21): `window.__ptcg.
  loadDeckList(deckRows)` already loads any card list of any size (no 20-card minimum exists
  anywhere, client or server); `canPerformAction` (rules-state.mjs) already no-ops to
  `{allowed:true}` for every action once `rulesState.enabled` is false, which the bridge
  already exposed live via `window.__ptcg.rulesState`. Closed the one real gap:
  `forceRulesEnabledForMultiplayer` (rules-bridge.js) used to snap rules back on at every 2P
  room join, which would fight a bot that disables rules for a bot-vs-bot debug game. Added a
  pure `multiplayerLocksRulesEnabled(isTwoPlayer, e2eMode)` helper (client/src/setup/general/
  e2e-mode.mjs) and used it to exempt e2e mode at both the settings-checkbox guard and the
  force-on call in rules-bridge.js. Added `window.__ptcg.debugMode(enabled)` (e2e-api.js) as
  the discoverable one-call toggle instead of requiring bots to poke the raw exposed
  rulesState object. D27 records the full finding + rationale. 1281/1281 pass. Full detail in
  journal S93.
Next: user should confirm on localhost with `?e2e=1` (PTCG_E2E=1 or non-production NODE_ENV)
  that a bot can `loadDeckList` an arbitrary short/odd deck and `debugMode(true)` to play cards
  outside normal turn/cost/phase rules — not live-verified in-browser (2P + e2e needs a
  two-page harness run, not a single-tab preview; see watch-outs). Also smoke-check both S92
  fixes on localhost: play an Item then a Supporter in the same turn (Supporter should still be
  allowed), and confirm the first player now draws on turn 1. Also retest Grand Tree's Stage-2
  chain against PR #97 (S91): if it still fails, check for the new "⛔ Grand Tree: could not
  evolve..." chat message — report it verbatim, it names which side (deck card vs host) the
  guard rejected. If it fails with NO message and the card still vanishes for both players, the
  guard isn't the cause — get a fresh sync log and check whether `evolveCard.js` ever sets
  `targetCard.image.attached` on the Stage-1 base (it currently doesn't, only
  `targetCard.attached` — a card-level vs image-level flag mismatch, a plausible next lead).
  Still open from S82/S88: I34 (turn-desync residual, 1/10 soak failures) — see journal S88 for
  the lead. Still open from S71/S73: mat-click pick/cancel/Escape flow, stray-click
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
- The `?e2e=1` bridge (`window.__ptcg`, e2e-api.js) is a scripting API over the local player's
  own board, armed server-side only outside production (Archive D21). It already exposes the
  live mutable `rulesState` object by reference — `debugMode()` (S93) just wraps that plus
  persistence; don't re-derive a second rules-bypass mechanism.
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs`/
  `parseRetreatArgs` (sync-action-args.mjs) before adding a parameter to any legacy action.
- Session/decision numbers collide often across concurrent branches (S73/S73, D21/D21 this
  merge) — before rewriting STATE/DECISIONS on a merge, diff against origin/main's own copy
  first and renumber the incoming side, don't just pick one.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S93 2026-09-11 feature: e2e/debug mode for bot card testing — see Active above (D27).
- S92 2026-09-11 patch: Item plays no longer trip the Supporter-per-turn gate; turn 1 now draws
  (user override of the official skip-first-draw rule).
- S91 2026-09-10 debug(rules): Grand Tree stage-2-chain re-resolves host zone/index live +
  failure messaging (D26, PR #97). Does not yet have a confirmed live fix — see Next above.
