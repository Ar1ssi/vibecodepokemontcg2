# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 102
Focus: S101's fix did not fix Render (server-authoritative) — both symptoms reproduced and fixed.
Active: done. S101 only covered legacy mode. In authoritative mode three separate server bugs:
  (1) explicit Leave Room kept the GameRoom whenever the opponent stayed seated, so rejoining the
  same room re-sent the old game (hand, prizes, "YOUR TURN — main phase"): GameRoom.resetGame now
  frees the leaver's seat and restarts the game for whoever stays (deck reloaded from deckList,
  printed cardStats carried by syncInstance, stateVersion kept monotonic). (2) The sync-check
  heartbeat compared the client's view hashes with raw server state; owner views redact
  unrevealed prizes, so `prizes` diverged every 30s in every game, and each false desync ran the
  legacy peer-log catch-up whose 5s timeout posted "The game may be out of sync". Server now hashes
  the owner's view (hashOwnerViewZones); a real desync recovers via requestView. (3) loadDeck
  treated string quantities ("4", what real decklists send) as 1 card per row. Evidence:
  room-rejoin-reset-test.mjs 8 FAIL on baseline -> 14/14; pnpm test 1307/1307.
Next: user to verify on Render once this deploys (leave mid-game + rejoin same room; play past a
  few 30s heartbeats with a real 60-card deck). Maintenance due (carried from S100). Open: I39
  flip-gate-test fails on current main (pre-existing); I40-I42 filed below. Still open from
  before: I37 live 2P check, I34 turn-desync residual, Grand Tree cosmetic chat line.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- e2e fixture decks use quantity '1' on every row, which hides quantity bugs; real decklists send
  "2"-"4". room-rejoin-reset-test.mjs loads a '4'-quantity deck for this reason.
- Sync-check must hash what the owner's view shows (hashOwnerViewZones), never raw state: any new
  redacted zone or field otherwise becomes a permanent false desync on every heartbeat.
- Room exit/entry must dispatch document 'room-changed' (S101); an explicit seated Leave in
  authoritative mode resets the server game (GameRoom.resetGame). A disconnect still resumes.
- Playwright servers: if :4000 is the user's dev server, use PORT=41xx + PTCG_URL. context.setOffline
  does not drop a localhost websocket; use `(await import('/src/state.js')).socket.disconnect()`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S102 2026-09-11 fix(netcode): authoritative mode — Leave Room resets the server game; sync-check
  hashes the owner's view (no more prize false-desyncs / reload warnings); string deck quantities.
- S101 2026-09-11 fix(netcode/rules): room change resets the rules session; server answers a
  peer-log request itself when the requester is alone (legacy mode only in practice).
- S100 2026-09-11 patch(fix): Dawn's combined Basic/Stage1/Stage2 search — 3 sequential
  single-card searches, one shuffle at the end; matchesSearch gained exact stage filters.
