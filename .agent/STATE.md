# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 76
Focus: implement design 004 slice 1 (`observe()` read model for the playtest bot).
Active: done. Added `window.__ptcg.observe()` in
  `client/src/setup/general/e2e-api.js` — returns `{turnPlayer, turnNumber, phase, fromServer,
  self, opp, stadium, pickerOpen}` with each Pokémon serialized via a new `serializePokemonCard`
  (reuses `getCardDamage`/`getCardSpecialCondition` from card-state.mjs and
  `resolveAttachedEnergyType` from energy-effects.mjs) and each hand card via
  `serializeHandCard` (name/supertype/type/index). No DOM nodes or live card refs cross the
  boundary — JSON-safe by construction.
Next: design 004 slice 2 (`options()` legal-move enumeration) is next per the work plan in
  `.agent/designs/004-playwright-playtest-bot.md`. Before that, slice 1's real acceptance test
  (call `observe()` on both pages mid-game via a live two-browser session, check public-field
  parity) is still unverified — only unit tests on the helpers it reuses were run this session,
  since e2e-api.js itself has no unit harness (DOM/socket-bound). Also still open from S73:
  (1) live-verify drag active→bench retreat flow, (2) mat click-to-select pickers + Grand Tree
  fix. Maintenance is due within 4 sessions (next multiple of 10 is S80).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game — extend it rather than writing DOM-selector
  automation. `flip-gate-test.mjs` is the reference two-browser harness.
- `openMatPick()` in client/src/setup/rules/trainer-execution.js is the pattern for any future
  "pick an in-play Pokémon" step — reuse it, don't re-add a modal picker for that case. It relies
  on `card.image` already being the live DOM node and on a document-level capture-phase click
  listener outrunning click-events.js/drag.js; a move to Shadow DOM would silently break it.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `apply-view.js`, `authoritative-dispatch.js` and `card-stats.js` must stay Node-importable.
  Never statically import `click-events.js`, `drag.js`, `process-action.js`, or anything reaching
  `state.js` — inject instead. `rules-state.mjs` and `energy-effects.mjs` ARE safe and statically
  imported.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient — compare counts instead, never `deck`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S76 2026-09-10 feature: design 004 slice 1 — `__ptcg.observe()` read model added to
  e2e-api.js. No gameplay files touched.
- S75 2026-09-10 docs: design 004 drafted (Playwright playtest bot). No code changed.
- main PR #93 (merged, not authored by a numbered session): player going first now draws on
  turn 1; bench→hand, deck→hand and deck→bench manual drags disabled.
