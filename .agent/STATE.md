# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 91
Focus: "debug mode" for testers/CPU bots — summon any cards, break all rules, purely for
  Playwright card-functionality testing. Turned out to be almost entirely already built behind
  the existing `?e2e=1` scripting bridge (Archive D21): `window.__ptcg.loadDeckList(deckRows)`
  already loads any card list of any size (no 20-card minimum exists anywhere, client or
  server); `canPerformAction` (rules-state.mjs) already no-ops to `{allowed:true}` for every
  action once `rulesState.enabled` is false, which the bridge already exposed live via
  `window.__ptcg.rulesState`. Full detail in journal S91.
Active: done. Closed the one real gap: `forceRulesEnabledForMultiplayer` (rules-bridge.js)
  used to snap rules back on at every 2P room join, which would fight a bot that disables rules
  for a bot-vs-bot debug game. Added a pure `multiplayerLocksRulesEnabled(isTwoPlayer, e2eMode)`
  helper (client/src/setup/general/e2e-mode.mjs) and used it to exempt e2e mode at both the
  settings-checkbox guard and the force-on call in rules-bridge.js. Added
  `window.__ptcg.debugMode(enabled)` (e2e-api.js) as the discoverable one-call toggle instead of
  requiring bots to poke the raw exposed rulesState object. +1 test (e2e-mode.test.mjs),
  1281/1281 pass. D26 records the full finding + rationale.
Next: user should confirm on localhost with `?e2e=1` (PTCG_E2E=1 or non-production NODE_ENV)
  that a bot can `loadDeckList` an arbitrary short/odd deck and `debugMode(true)` to play cards
  outside normal turn/cost/phase rules — not live-verified in-browser this session (2P + e2e
  needs a two-page harness run, not a single-tab preview; see watch-outs). Still open from
  S82/S88: I34 (turn-desync residual, 1/10 soak failures) — see journal S88 for the lead. Still
  open from S73: drag active→bench retreat live-verify; mat pickers + Grand Tree. Maintenance
  due S96 (S86 sweep was the last one).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`. Same applies to anything
  needing a live 2P/e2e harness run (single-tab preview can't exercise it).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1. Verify a diff's own files with a targeted `npx eslint
  <files>` and read past the CRLF noise; don't try to fix the repo-wide config in passing.
- The `?e2e=1` bridge (`window.__ptcg`, e2e-api.js) is a scripting API over the local player's
  own board, armed server-side only outside production (Archive D21). It already exposes the
  live mutable `rulesState` object by reference — `debugMode()` (S91) just wraps that plus
  persistence; don't re-derive a second rules-bypass mechanism.
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs`/
  `parseRetreatArgs` (sync-action-args.mjs) before adding a parameter to any legacy action.
- `turnState().fromServer` is meaningless in legacy mode (SERVER_AUTHORITATIVE unset, this
  repo's default) — it only ever becomes true under flip-gate-test.mjs's authoritative mode.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S91 2026-09-11 feature: e2e/debug mode for bot card testing — see Active above (D26).
- S90/S90b 2026-09-10 feature: design 006 — generation pills + per-generation Energy tabs in
  Browse Sets.
- S89/S89b 2026-09-10 feature+patch: 3D energy tokens for attached Energy (design 005, a
  concurrent session, merged from main).
