# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 33
Focus: Netcode repair — building design 002 on `feature/netcode-repair` in worktree
  `../vibecodepokemontcg2-netcode-repair`. Phase 0 (Stop the bleeding) done.
Active: none
Next: build slice 1.1 (peer-log reconnect catch-up + O2-C fallback) — see NEXTSTEPS.md
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Work happens in the worktree `../vibecodepokemontcg2-netcode-repair` on
  `feature/netcode-repair`, per CLAUDE.md worktree rules — not in the primary checkout.
  Resume there; `NEXTSTEPS.md` at its root is the slice ledger.
- `pushAction` and `requestAction` must not be dropped: the server's own deck init is fed from
  the pushAction relay (server.js:658-674), and setup actions rely on it.
- Reconnect recovery does not exist yet (I12, being fixed in slice 1.1) — do not assume a
  resync will heal a desync until that slice lands.
- Design 002 ships as increments on ONE `feature/netcode-repair` branch, one commit per slice.
  Do not build it in one session; `/clear` between slices.
- `pnpm lint` fails on Windows CRLF across the codebase; lint changed files with
  `npx eslint --rule "prettier/prettier: off" <files>`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S33 2026-09-09 feature: design 002 slices 0.1-0.2 — SERVER_AUTHORITATIVE defaults off,
  render-target guard stops the stadium-wipe and blind-renderer writes; 993 tests green.
- S32 2026-09-09 feature(design): verified an external netcode audit against source, corrected its root cause, wrote design 002 (13-slice repair plan); filed I10-I14, decided D8-D10.
- S31 2026-09-08 fix: Fix 2P multiplayer desync: restore pushAction relay, trim room IDs, fix peerSocketId handshake; 991 tests & test:2p pass.
