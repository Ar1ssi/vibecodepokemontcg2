# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 69
Focus: Added an "Energy" tab to the native deck builder's Browse Sets panel (unrelated to
  netcode work above — user-requested UI feature).
Active: done. `client/src/setup/deck-builder/core/set-browser.mjs` gained `ENERGY_SET_ID`,
  `fetchLegalEnergyCards()` (cross-references global `/cards?category=Energy` TCGdex summaries
  against each Standard-legal set's cached full record to get images — see D18) and
  `fetchSetCards()` special-cases it. `fetchLegalStandardSets()` appends it last (39 cards at
  test time: 8 modern basics + 8 gold secret rares + 23 special/rare variants like
  Ignition/Spiky/Mist/Shadowy Darkness/Bubbly Water Energy). The 8 modern basics (Grass..Metal)
  are hardcoded in `getModernBasicEnergyCards()` with art hotlinked from pkmncards.com — TCGdex
  has zero image data for the "mee" (Mega Evolution Energy) support set (D18). Tab icon is the
  user-supplied colorless-energy image, saved to `client/src/assets/energy/colorless.png`,
  served statically at `/src/assets/energy/colorless.png`. Verified live: pnpm start + browser
  click-through, tab renders last in the Standard 2026-27 row, expands, images load, filter/
  add-to-deck work.
Next: nothing pending on this thread. Netcode Next (S68) still applies — see journal S68b.
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
- S69 2026-09-10 feat(deck-builder): Energy tab added to Browse Sets (D18). See Focus above.
- S68b 2026-09-10 chore(002 D17): SERVER_AUTHORITATIVE flipped on in render.yaml. User's call,
  3.12 exit test passing, all known flip-time gaps (I25/I27/I19) closed.
- S68 2026-09-10 fix(002 I19): closed I19. Reveal/hide now real server_commands, own-zone-only
  (D16). 1208/1208 pnpm test, pnpm test:2p ALL PASS (flag off).
