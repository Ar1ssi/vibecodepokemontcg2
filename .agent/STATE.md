# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 174
Focus: fix server-authoritative parsers and reducer gaps for attacks, abilities, stadiums, and trainers (PR #149).
Active: none. Work is committed and pushed on branch `feature/fix-server-authoritative-parsers` (PR #149).
Next: Review PR #149 and merge to main; then live 2P check of the coin call under SERVER_AUTHORITATIVE=1, I59 (server has no evolution timing), I56 (keybinds c/z/e/q on server cards), audit lows A-6/A-10.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `rulesState.phase` is NOT a reliable "the game has not started" test under SERVER_AUTHORITATIVE: the
  post-deal view copies the server's phase onto it (apply-view.js reconcileTurnState) before
  `both-players-ready` fires. Use the `openingStarted` latch in rules-bridge.js (D51). This is what killed
  the whole rules opening ceremony under the flag until S173.
- Legacy zone arrays are EMPTY under SERVER_AUTHORITATIVE 2P (verified live S171: legacy hand 0 vs view 7,
  legacy deck stale at 14). Anything reading `getZone(user, z).array` or `mouseClick.card` is broken there —
  read `getAuthoritativeZoneArray(side, zone)` / the `cardRegistry` and address cards by instanceId (D12, D47).
- Board cards live INSIDE the `selfContainer`/`oppContainer` playmat iframes (separate documents that load only
  self-/opp-containers.css + its @imported partials; index.css never reaches them). Stadium is the exception.
- Anything the legacy client does in `chat-buttons.js` for a `server_command` action (stadium, attack,
  retreat, abilities) is DEAD under the flag — the dispatch gate returns first. Fix such cards in
  `shared/engine/`, not in the client (D50).
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). Pick a free PORT — other sessions hold :4000/:4317.
  Live 2P probe harness: `.agent/scratch/probe.mjs <step-file>` (Playwright, joins a room, deals, runs a step
  module). A worktree needs `node_modules` junctioned in before eslint/playwright will run there.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S174 2026-09-18 feature: server-authoritative parser parity, attack status & coin flips, abilities, stadium steps, trainer drop fix (PR #149).
- S173 2026-09-18 feature: design 013 server-owned turn-order coin call (D51, D52).
- S173 2026-09-18 feature: Grand Tree search-evolve + Stage 2 chain in the server engine (design 013, D50).
