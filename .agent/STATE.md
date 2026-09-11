# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 101
Focus: stale rules session after leaving a room mid-game; false "out of sync" warning when alone.
Active: done. (1) resetRulesSession ran only from the Reset/Restart buttons, so Leave Room / join
  kept the old phase, turn player and openingSetupReadyForCoinFlip: new room showed "YOUR TURN —
  main phase" and a stale ready flag could auto-start a game. Fix: new document event
  'room-changed' dispatched from Leave Room, joinGame and the server_restart lobby path;
  rules-bridge resets the session on it (not gated on rulesState.enabled). (2) Legacy reconnect
  asks the peer for its action log; alone in a room nobody answered, the 5s timeout posted the
  desync warning. Fix: server answers requestPeerLog itself with an empty peerLog when no other
  socket is in the room. Regression: room-change-reset-test.mjs (Playwright) — 3 FAIL before,
  6/6 after; join-deck-sync-test 4/4; pnpm test 1299/1299.
Next: maintenance due (carried from S100) — run maintain.md if next session has room. User to
  live-verify Dawn's UI flow (3 sequential single-card pickers, one shuffle). Still open:
  live-verify I37 in a real 2P game (check sync log for zero hint_mismatch). Grand Tree stray
  "evolved X into Y" chat line on rejected evolve (cosmetic). I34 turn-desync residual (1/10
  soak). Prod netcode mode: a Render log reading "Netcode mode: legacy" contradicts render.yaml's
  SERVER_AUTHORITATIVE='1' — user to confirm the dashboard env var.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Room exit/entry must dispatch document 'room-changed' (S101). Any new path that leaves or
  enters a room (kick, timeout, lobby redirect) must dispatch it too, or the rules session leaks
  into the next room. rules-bridge's resetRulesSession is closure-scoped — the event is the seam.
- joinGame setup is serialized on pushActionQueue (S99). Anything else that resets opponent state
  asynchronously while the server may be pushing to this socket must do the same.
- `pnpm test:2p`-style Playwright harnesses need a server; if :4000 is held by the user's own dev
  server, run a second one with `PORT=4100 node server/server.js` and `PTCG_URL=http://localhost:4100`
  instead of killing theirs. context.setOffline does NOT drop a localhost websocket — force a
  reconnect via `(await import('/src/state.js')).socket.disconnect()/connect()`.
- matchesSearch (shared/engine/rules/search-match.mjs) has exact stage-1/stage-2 branches (S100);
  verify new "Stage N Pokémon" search text with unit tests, not by eyeballing the picker.
- Live checks: user checks CSS/visuals on localhost (memory `feedback_css_preview.md`); drive
  netcode/rules checks via Playwright + `?e2e=1`. Hidden sidebox buttons: click via
  `page.evaluate(() => el.click())`, not `page.click`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S101 2026-09-11 fix(netcode/rules): room change resets the rules session; server answers a
  peer-log request itself when the requester is alone (no false desync warning).
- S100 2026-09-11 patch(fix): Dawn's combined Basic/Stage1/Stage2 search — 3 sequential
  single-card searches, one shuffle at the end; matchesSearch gained exact stage filters.
- S99 2026-09-11 fix(netcode): room-join deck desync — joinGame setup serialized on pushActionQueue.
