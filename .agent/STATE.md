# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 79
Focus: implement design 004 slice 4 (`picker()`/`pick()` — the risk-gate slice).
Active: done. Risk gate fired as flagged: the overlay set is three kinds, not two. Added
  `getCardPickerSnapshot()`/`pickCardPickerIndices()` to card-picker.js and `picker()`/`pick()`
  to e2e-api.js. The third kind, `openMatPick` (trainer-execution.js — heal/damage-counter/
  switch/evolve-jump/move-Energy targeting), keeps no exported state and lives in a rules file
  out of this spec's scope, so it's bridged by reading the outline style `openMatPick` already
  paints on the candidate's `card.image` DOM node and resolving with `img.click()` — no gameplay
  file touched. `callCoin(face)` extended to also match `#rulesCoinEffectOverlay`'s `[data-face]`
  buttons (was `#rulesCoinCallOverlay`'s `[data-coin-call]` only).
Next: design 004 slice 5 (`bot/bot.mjs` scaffold + heuristic scorer) — pure Node, no Playwright,
  can be built and unit-tested without a live browser. Still unverified end-to-end: no live
  two-page run has exercised observe()/options()/act()/picker() together (open since S76) —
  slice 6's runner will be the first thing that actually proves slices 1-4 work live, so treat
  early runner failures there as likely bugs in 1-4, not just the runner.
  Also open from S73: (1) live-verify drag active→bench retreat, (2) mat click-to-select pickers
  + Grand Tree fix. Maintenance due at S80 (1 session away).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game — extend it rather than writing DOM-selector
  automation. `flip-gate-test.mjs` is the reference two-browser harness.
- moveCardBundle's `action` param is misleadingly named: every real call site passes `'move'`
  regardless of whether the move is a play/attach/evolve — move-card.js infers attach vs. evolve
  from `targetIndex` resolving to an existing target card, and from `movingCard.type`. Don't
  reintroduce literal 'attach'/'evolve' strings without re-reading move-card.js first.
- Three distinct "picker" overlays exist, not one: `.card-picker-overlay` (card-picker.js,
  bridged via `getCardPickerSnapshot`/`pickCardPickerIndices`), `openMatPick`'s DOM-outline
  highlight (trainer-execution.js, bridged by reading the outline + `img.click()`, no file
  changed there), and `#rulesCoinCallOverlay`/`#rulesCoinEffectOverlay` (bridged via `callCoin`).
  `__ptcg.picker()`/`pick()` dispatch across all three — extend those, don't add a fourth path.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient — compare counts instead, never `deck`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S79 2026-09-10 feature: design 004 slice 4 — `__ptcg.picker()`/`pick()`, bridging all three
  modal kinds (card-picker, mat-pick, coin overlays) from e2e-api.js only.
- S78 2026-09-10 feature: design 004 slice 3 — `__ptcg.act(option)` write path in e2e-api.js.
- S77 2026-09-10 feature: design 004 slice 2 — `__ptcg.options()` + pure e2e-options.mjs (11 tests).
