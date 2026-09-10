# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 70
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
  Branch/PR: not yet opened this session — next step.
Next: open PR for this fix (branch off main, push, gh pr create). Also: maintenance due
  (Session 70 is a multiple of 10 — run .agent/workflows/maintain.md next session).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `apply-view.js`, `authoritative-dispatch.js` and `card-stats.js` must stay Node-importable.
  Never statically import `click-events.js`, `drag.js`, `process-action.js`, or anything
  reaching `state.js` — inject instead. `rules-state.mjs` IS safe (shared/engine, localStorage
  guarded) and is now statically imported by `apply-view.js`.
- Never re-dispatch `rules-turn-began` for display refresh: `rules-bridge.js` hangs legacy
  knockout/deck-out adjudication off that event, which the server now owns. Use
  `rules-turn-view-applied` (added S66) for any future display-only reconciliation off a view.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient, so comparing their contents across two clients
  always false-positives — compare counts instead, and never `deck` (it has no array at all).
- A `server_command` action gates its own legacy body on `user === 'self' && emit` (own-side,
  locally-initiated only) — this is also the security boundary for anything that flips
  server-owned per-card state (e.g. `card.revealed`, D16): don't add cross-player addressing to
  a gate without a real permission model behind it.
- `flip-gate-test.mjs` needs a hand-started server:
  `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js` then `PTCG_URL=http://localhost:4100`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S70 2026-09-10 fix: energy cards not auto-discarding on KO + false "already attached this
  turn" on manual discard (legacy rules-mode). See Focus above.
- S69 2026-09-10 feat(deck-builder): Energy tab added to Browse Sets (D18).
- S68b 2026-09-10 chore(002 D17): SERVER_AUTHORITATIVE flipped on in render.yaml. User's call,
  3.12 exit test passing, all known flip-time gaps (I25/I27/I19) closed.
