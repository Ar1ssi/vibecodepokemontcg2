# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 71
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
  prompt/behavior fires and the correct bench card is promoted.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md` (outside this repo, in the
  agent's memory dir). Still fine to use the Browser pane for non-visual checks.
- Repeating gradients in holo CSS (`.card[data-rarity=...] .card__shine` background-image:
  `repeating-linear-gradient(...)`) alias into visible noise at small card render sizes
  (deck-list thumbnails, hand). Prefer single non-repeating gradients for any new rarity CSS;
  audit existing ones (hyper-rare.css, regular-holo.css, rainbow-alt.css) if this recurs there.
- `apply-view.js`, `authoritative-dispatch.js` and `card-stats.js` must stay Node-importable.
  Never statically import `click-events.js`, `drag.js`, `process-action.js`, or anything
  reaching `state.js` — inject instead. `rules-state.mjs` IS safe and statically imported.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient — compare counts instead, never `deck`.
- `flip-gate-test.mjs` needs a hand-started server:
  `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js` then `PTCG_URL=http://localhost:4100`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S71 2026-09-10 fix(bench,retreat): drag active→bench now runs the retreat flow (energy
  cost, gates) instead of a raw move.
- S70 2026-09-10 patch(holo): Secret/Gold Rare holo overlay was dead (CSS rule gated behind
  an attribute nothing sets); rebuilt grain-free. See journal — not yet re-verified.
- S69 2026-09-10 feat(deck-builder): Energy tab added to Browse Sets (D18).
