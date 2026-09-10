# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 74
Focus: fixed energy cards not auto-discarding on KO, and a false "already attached this turn"
  warning when manually discarding them (legacy client-side rules-mode only; SERVER_AUTHORITATIVE
  path was already correct — see below).
Active: done. Root cause: `relocateAttachedCards` (client/src/actions/move-card-bundle/
  relocate-attached-cards.js) sent a Pokémon's attached cards to the generic `attachedCards`
  staging zone whenever the host left active/bench for ANY destination — including discard/KO,
  where real TCG rules say attachments go straight to discard with no manual step. Two symptoms:
  (1) KO'd Pokémon auto-discarded itself but stranded its energy in `attachedCards`; (2) that
  energy's arrival in `attachedCards` was misread by rules-bridge.js's `hookEnergyAttach`/
  `checkEnergyAdds` (which watches that zone for "new" attaches, since real hand→active/bench
  attaches never populate it) as a fresh attach, throwing "energy already attached this turn"
  once the real per-turn flag was already set. Fix: extracted `resolveDetachedCardDestination`
  (new file `resolve-detached-card-destination.js`, DOM-free/pure — `state.js` reaches
  browser-only `io()`/`document` at module scope so it can't be pulled into a `node --test` file)
  — routes to `discard`/`lostZone` directly when that's the host's destination, `attachedCards`
  otherwise (hand/deck unchanged). 3 new tests. 1211/1211 pnpm test green (was 1208 baseline +
  the Energy-tab session's own tests not yet counted — verified full suite green after the fix).
  Confirmed server-authoritative `handleKnockout` (shared/engine/reduce.mjs:38) already discards
  attached cards correctly — this bug only affects local/dev play with the flag off (repo default).
  Landmine recorded in PROJECT.md (the once-per-turn energy-attach flag was never actually set by
  real attaches, only by this misrouted-detach path — pre-existing, out of scope here).
Next: previous session (S73) left two live-verification items open: (1) drag active→bench
  retreat flow, (2) mat click-to-select pickers + Grand Tree fix (see journal S71/S72/S73).
  Also: maintenance due (a session number crossed a multiple of 10 — run
  .agent/workflows/maintain.md next session).
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
- S74 2026-09-10 fix: energy cards not auto-discarding on KO + false "already attached this
  turn" on manual discard (legacy rules-mode). See Focus above.
- S73 2026-09-10 fix(bench,retreat): drag active→bench now runs the retreat flow (energy
  cost, gates) instead of a raw move.
- S72 2026-09-10 fix(rules): Grand Tree evolve-onto-host + Stage 2 chain fixed (D20). Not yet
  browser-verified.
