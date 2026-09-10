# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 77
Focus: implement design 004 slice 2 (`options()` legal-move enumeration).
Active: done. New `client/src/setup/general/e2e-options.mjs` — pure, Node-importable
  `enumerateOptions(board)` returning tagged options (playBasic/evolve/attach/playTrainer/
  ability/attack/retreat/pass). Every gate delegates to the real rules modules
  (canPerformAction, canEvolve, canPayAttackCost, canRetreat, filterUsableAbilities, status.mjs)
  rather than re-deriving legality. Wired as `__ptcg.options(user)` in e2e-api.js. 11 tests in
  `client/src/setup/general/__tests__/e2e-options.test.mjs` (added to the pnpm test list) — green.
  Also fixed in passing: observe() treated attached Energy as benched Pokémon and read
  `card.attachedCards`, which neither render path sets — e2e-api.js now derives both via
  boardPokemon()/attachedCardsFor() (authoritative: `attachedTo`; legacy: `image.relative`).
Next: design 004 slice 3 (`act(option)` write path) — confirm the moveCardBundle action vocabulary
  against accept-action.js before writing the switch. Still unverified from S76: slice 1's live
  two-page cross-parity check of observe() (and now options()/the attachment fix) — no automated
  e2e run has exercised the bridge. Also open from S73: (1) live-verify drag active→bench retreat,
  (2) mat click-to-select pickers + Grand Tree fix. Maintenance due at S80.
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
- S77 2026-09-10 feature: design 004 slice 2 — `__ptcg.options()` + pure e2e-options.mjs (11 tests).
- S76 2026-09-10 feature: design 004 slice 1 — `__ptcg.observe()` read model added to
  e2e-api.js. No gameplay files touched.
- main PR #93 (merged, not authored by a numbered session): player going first now draws on
  turn 1; bench→hand, deck→hand and deck→bench manual drags disabled.
