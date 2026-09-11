# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 103
Focus: Fix I40 (resetDealOrder unwired) and I42 (syncCheck transient false desync); I41 left open.
Active: done. I40: resetDealOrder() had no callers — wired it into rules-bridge.js's
  resetRulesSession, which already fires on the 'room-changed' document event (leave/join) and
  every Reset button, so a stale dealOrder/starter can no longer survive into the next game.
  I42: syncCheck's heartbeat now tags its zone hashes with the view's stateVersion
  (getLastRenderedVersion); server's 'syncCheck' handler in server.js skips the compare (no
  desync emitted) when gameRoom.state.stateVersion has moved past that version — a command
  landing mid-flight is a stale snapshot, not a divergence. Next 30s heartbeat re-checks against
  settled state. Evidence: pnpm test 1308/1308 (was 1307/1307 + new stateVersion-forwarding
  unit test); no regressions. Pushed to claude/fix-i40-i42-pi3x6i, PR opened.
Next: user to verify on Render (leave/rejoin a room mid-setup; watch for desync warnings across
  several 30s heartbeats while a real command lands). Maintenance due (carried from S100). Open:
  I39 flip-gate-test fails on current main (pre-existing); I41 (legacy rejoin, no opening hand,
  1 sample, untriaged). Still open from before: I37 live 2P check, I34 turn-desync residual,
  Grand Tree cosmetic chat line.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- e2e fixture decks use quantity '1' on every row, which hides quantity bugs; real decklists send
  "2"-"4". room-rejoin-reset-test.mjs loads a '4'-quantity deck for this reason.
- Sync-check must hash what the owner's view shows (hashOwnerViewZones), never raw state: any new
  redacted zone or field otherwise becomes a permanent false desync on every heartbeat. Since
  S103 it also skips the compare on a stateVersion mismatch — don't drop that guard, it's I42.
- Room exit/entry must dispatch document 'room-changed' (S101); an explicit seated Leave in
  authoritative mode resets the server game (GameRoom.resetGame). A disconnect still resumes.
  resetDealOrder() also hangs off 'room-changed' via rules-bridge.js's resetRulesSession (S103).
- Playwright servers: if :4000 is the user's dev server, use PORT=41xx + PTCG_URL. context.setOffline
  does not drop a localhost websocket; use `(await import('/src/state.js')).socket.disconnect()`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S103 2026-09-11 fix(netcode): resetDealOrder wired to room-changed (I40); syncCheck skips the
  compare on a stale stateVersion instead of false-reporting a desync (I42).
- S102 2026-09-11 fix(netcode): authoritative mode — Leave Room resets the server game; sync-check
  hashes the owner's view (no more prize false-desyncs / reload warnings); string deck quantities.
- S101 2026-09-11 fix(netcode/rules): room change resets the rules session; server answers a
  peer-log request itself when the requester is alone (legacy mode only in practice).
