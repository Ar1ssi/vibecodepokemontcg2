# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 73
Focus: patch — dragging active Pokémon onto bench now triggers a real retreat (energy-cost
  discard, gates, swap) instead of a raw zone move.
Active: closed. Root cause: `drag.js`'s `drop()` always routed active↔bench drags through
  `moveCardBundle(..., 'move', ...)`, which just splices zones (see `moveCard.js`
  `autoMoveActiveBenchCard`) — no retreat-cost check, no energy discard, no
  paralysis/asleep/stadium gating. `chat-buttons.js` already had a full `retreat()` (button
  path) but it always auto-picked "first free bench Pokémon", with no way to say which bench
  card the swap targets.
  Fix: gave `retreat(user, emit, targetBenchImage)` an optional third param — resolves to a
  server `benchInstanceId` for the authoritative dispatch path
  (`dispatchAuthoritativeAction('retreat', {commandArgs: [id]})`, already supported server-side
  and by `dual-run-bridge.js`'s translator, just never called with an id before) and to the
  matching zone-array entry for the legacy swap path. In `drag.js`, added a branch in `drop()`
  ahead of the generic move logic: `mouseClick.zoneId === 'active' && dZoneId === 'bench' &&
  !draggedImage.attached` now calls `retreat(mouseClick.cardUser, true, event.target)` instead
  of falling into `moveCardBundle`.
  Files: `client/src/actions/chat-buttons/chat-buttons.js`, `client/src/setup/image-logic/drag.js`.
  Verified: `pnpm test` — 1208/1208 pass, no regressions. Server-side retreat-with-benchInstanceId
  behavior was already covered by existing tests (commands.test.mjs, dual-run-bridge.test.mjs).
  NOT verified live in-browser — this repo's convention is the user checks localhost manually
  (see watch-outs); no DOM/drag test harness exists in this repo to add an automated
  drag-and-drop regression test for the client glue itself (chat-buttons.js/drag.js have zero
  existing tests, both being DOM-coupled).
Next: user should manually drag active→bench in localhost and confirm the energy-discard
  prompt/behavior fires and the correct bench card is promoted. Also still open from S71/S72
  (mat click-to-select pickers + Grand Tree fix): user does a live check in the browser for
  those changes too (see journal S71/S72 for what to verify).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- New: `openMatPick()` in client/src/setup/rules/trainer-execution.js is the pattern for any
  future "pick an in-play Pokémon" step — reuse it, don't re-add a modal picker for that case.
  It relies on `card.image` already being the live DOM node and on a document-level
  capture-phase click listener outrunning click-events.js/drag.js's own listeners; if a future
  refactor moves those to Shadow DOM or a different capture root this will silently stop gating.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md` (outside this repo, in the
  agent's memory dir). Still fine to use the Browser pane for non-visual checks.
- `apply-view.js`, `authoritative-dispatch.js` and `card-stats.js` must stay Node-importable.
  Never statically import `click-events.js`, `drag.js`, `process-action.js`, or anything
  reaching `state.js` — inject instead. `rules-state.mjs` IS safe and statically imported.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient — compare counts instead, never `deck`.
- `flip-gate-test.mjs` needs a hand-started server:
  `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js` then `PTCG_URL=http://localhost:4100`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S73 2026-09-10 fix(bench,retreat): drag active→bench now runs the retreat flow (energy
  cost, gates) instead of a raw move.
- S72 2026-09-10 fix(rules): Grand Tree evolve-onto-host + Stage 2 chain fixed (D20). Not yet
  browser-verified.
- S71 2026-09-10 feat(rules-ui): mat click-to-select replaces modal picker for all
  in-play-Pokémon trainer-effect targets (D19). Not yet browser-verified.
