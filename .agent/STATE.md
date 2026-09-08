# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 31
Focus: Multiplayer / Fix 2P Desync & Deck/Ready Signal Exchange
Active: none
Next: maintenance / continue slice-by-slice verification
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- `pushAction` and `requestAction` must not be dropped in serverAuthoritative mode; setup actions (exchangeData, loadDeckData, readyUp, reset) rely on relay.
- `hookMultiplayerSync` in `rules-bridge.js` attaches listeners immediately; peerSocketId replies use `isReply` to prevent echo loops.
- Room IDs and usernames must always be trimmed on both client and server to prevent phantom room isolation.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S31 2026-09-08 fix: Fix 2P multiplayer desync: restore pushAction relay, trim room IDs, fix peerSocketId handshake; 991 tests & test:2p pass.
- S30 2026-09-08 patch: Hide scrollbar on board zone (#board) across self and opp container stylesheets; 991 tests green.
- S29 2026-09-08 patch: Parse Collect attack and singular draw ("draw a card"), draw card and end turn; 990 tests green.
