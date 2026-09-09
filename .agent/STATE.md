# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 68
Focus: Closed I19, then flipped SERVER_AUTHORITATIVE (D17) on user's explicit go-ahead.
Active: I19 — `revealCards`/`hideCards`/`revealShortcut`/`hideShortcut` reclassified
  'server_command' in DISPOSITION_TABLE; new COMMAND_SCHEMAS + reduce.mjs cases flip
  `card.revealed` on the sender's OWN zone only (`draft.players[playerId]`, position-addressed
  like takePrizesByIndex — D16). Opponent-triggered reveal (legacy honor-system path)
  intentionally left ungated. Then D17: `render.yaml`'s `SERVER_AUTHORITATIVE` set `'0' -> '1'`.
  `server.js`'s own default (no env var) is still OFF — only the prod deploy config changed.
Next: production now boots server-authoritative on next deploy. Watch for I25-class display
  staleness or anything the flip-gate's synthetic play didn't cover, once real games run against
  it. Everything is uncommitted, no branch, per standing instruction — render.yaml included.
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
- S68b 2026-09-10 chore(002 D17): SERVER_AUTHORITATIVE flipped on in render.yaml. User's call,
  3.12 exit test passing, all known flip-time gaps (I25/I27/I19) closed.
- S68 2026-09-10 fix(002 I19): closed I19. Reveal/hide now real server_commands, own-zone-only
  (D16). 1208/1208 pnpm test, pnpm test:2p ALL PASS (flag off).
- S67 2026-09-09 fix(002 I27): closed I27. `dealOrder` broadcast now carries the authoritative
  starter; client's coin flip (and its peer mirror) use it instead of guessing. 1197/1197 pnpm test.
