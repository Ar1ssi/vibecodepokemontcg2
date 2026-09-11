# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 99
Focus: deck desync on room join (branch claude/deck-desync-room-join-e2de7f).
Active: done. Root cause: server.js replays the peer's cached exchangeData/loadDeckData right
  after emitting joinGame; client joinGame handler awaited getProtocolVersion before setting
  isTwoPlayer, so the replay applied mid-await (loadDeckData wrote p1OppDeckData, recv unlogged)
  and cleanActionData('opp')+reset('opp') then wiped it. Fix: joinGame setup now runs on
  pushActionQueue so replays queue behind it. Regression: join-deck-sync-test.mjs (Playwright,
  needs server on :4000) — 2/4 failing before, 4/4 after; pnpm test 1297/1297.
Next: user to live-verify on the deployed site (join a room with a deck already loaded, then
  leave+rejoin). Still open: live-verify I37 in a real 2P game (Judge/Iono/N/Research — check
  sync log for zero hint_mismatch). Confirm `?e2e=1` bot `loadDeckList`+`debugMode(true)` rule
  bypass. Smoke-check S92 Trainer/turn fixes. Grand Tree stray "evolved X into Y" chat line on
  rejected evolve (cosmetic). I34 turn-desync residual (1/10 soak). S71/S73 mat-click flows and
  design 005/006 smoke-checks not browser-verified. Maintenance due S100.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- joinGame setup is serialized on pushActionQueue (S99). Anything else that resets opponent state
  asynchronously while the server may be pushing to this socket must do the same, or replays land
  mid-reset. A hung applyPeerAction now also blocks the next join's setup.
- `?e2e=1` + `window.__ptcg` is safe to drive a REAL decklist through (D29): build-deck.js only
  stamps synthetic-Basic defaults onto `set === 'e2e'` fixture rows. Stage-dependent e2e
  misbehaviour → check this guard first.
- Grand Tree's Stage1->Stage2 same-activation chain is a real printed exception (D30,
  `bypassJustEvolvedGate`). Don't re-add the just-evolved gate there without re-reading the card.
- Live checks: user checks CSS/visuals on localhost (memory `feedback_css_preview.md`); drive
  netcode/rules checks via Playwright + `?e2e=1` (see join-deck-sync-test.mjs,
  manual-verify-i24.mjs), server via `pnpm -C server start` (check :4000 for stale node first).
  Hidden sidebox buttons: click via `page.evaluate(() => el.click())`, not `page.click`.
- `pnpm lint` fails repo-wide on CRLF + `.mjs` no-undef (baseline since S1); lint touched files
  with targeted `npx eslint <files>`. A relayed action that throws inside `acceptAction` leaves
  no sync-log entry (console.error only).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S99 2026-09-11 fix(netcode): room-join deck desync — joinGame setup serialized on pushActionQueue.
- S98 2026-09-11 fix(netcode): I37 — awaited moveCardBundle + real shuffle in the 4
  hand-shuffle trainer effects; I36 closed as working-as-intended.
- S95 2026-09-11 debug/fix: PR #102 — Grand Tree evolve-chain; D29 + D30.
