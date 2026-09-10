# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 72
Focus: S71 replaced the modal card-selection popup with mat click-to-select for every
  trainer-effect picker whose candidate is an in-play Pokémon (D19). S72 investigated + fixed a
  pre-existing Grand Tree bug the user reported separately (unrelated to S71's change, confirmed
  present before it): mixed auto-move/manual-move picker patterns caused the Stage 1 to evolve
  into a fresh bench slot instead of onto its host, and skipped the Stage 2 picker entirely (D20).
Active: closed — both changes shipped, neither browser-verified yet.
Next: user does a live check in the browser (memory: user checks localhost themselves, don't
  drive the Browser pane for this). S71 to verify: (1) clicking a highlighted mat card resolves
  the pick and clears the banner/outline; (2) Escape and Cancel both cancel cleanly; (3) a stray
  click during picking doesn't leak to the normal drag/select handlers underneath (capture-phase
  blocking in openMatPick, only reasoned from source, not run); (4) opponent-owned card
  highlighting (switchOpponent/damageCounters/discardFromOpponent paths) targets the right DOM
  node in local 2P. S72 to verify: play Grand Tree, evolve a Basic in play to Stage 1 via deck
  search, confirm it evolves onto the host (not a new bench slot) and the Stage 2 picker opens
  when a matching Stage 2 is in deck.
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
- S72 2026-09-10 fix(rules): Grand Tree evolve-onto-host + Stage 2 chain fixed (D20). Not yet
  browser-verified.
- S71 2026-09-10 feat(rules-ui): mat click-to-select replaces modal picker for all
  in-play-Pokémon trainer-effect targets (D19). Not yet browser-verified.
- S70 2026-09-10 fix(holo): Secret/Gold Rare holo overlay rebuilt grain-free after being dead;
  verified against real card art after several false-fix rounds (see S70 journal for detail).
