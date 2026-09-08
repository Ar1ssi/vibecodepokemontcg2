# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 32
Focus: Netcode repair — design 002 written, verified, and approved (picks D8-D10 delegated to session)
Active: none
Next: build design 002 slice 0.1 (SERVER_AUTHORITATIVE defaults off) on a `feature/netcode-repair` branch
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- SERVER_AUTHORITATIVE defaults ON in code today but design 001's flip was never completed — the
  authoritative renderer is blind (zones are in iframes; window.__getZone is never set) and client
  syncInstance is NOT the server's instanceId. Read `.agent/designs/002-netcode-repair.md` before
  touching netcode; D8 makes the default OFF and gates the flip on slice 3.6.
- `pushAction` and `requestAction` must not be dropped: the server's own deck init is fed from the
  pushAction relay (server.js:658-674), and setup actions (exchangeData, loadDeckData, readyUp, reset) rely on it.
- Reconnect recovery does not exist in either mode (I12) — do not assume a resync will heal a desync.
- Design 002 ships as increments on ONE `feature/netcode-repair` branch, one commit per slice,
  ledger in NEXTSTEPS.md (CLAUDE.md § Token/model policy). Do not build it in one session.
- `pnpm lint` fails on Windows CRLF across the codebase; lint changed files with
  `npx eslint --rule "prettier/prettier: off" <files>`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S32 2026-09-09 feature(design): verified an external netcode audit against source, corrected its root cause, wrote design 002 (13-slice repair plan); filed I10-I14, decided D8-D10.
- S31 2026-09-08 fix: Fix 2P multiplayer desync: restore pushAction relay, trim room IDs, fix peerSocketId handshake; 991 tests & test:2p pass.
- S30 2026-09-08 patch: Hide scrollbar on board zone (#board) across self and opp container stylesheets; 991 tests green.
