# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 173
Focus: design 013 — Grand Tree search-evolve implemented in the server engine (D50).
Active: none. Work is on branch `fix/grand-tree-server-evolve` in worktree ../vibe-grandtree-server (PR open).
Next: user manually verifies Grand Tree in a live 2P game. Then I59 (server has no evolution timing),
  I58 (unimplemented stadium kinds), I56 (keybinds c/z/e/q on server cards), then audit lows
  A-6/A-10, I28 holo/mat sizing. maintenance due.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Legacy zone arrays are EMPTY under SERVER_AUTHORITATIVE 2P (verified live S171: legacy hand 0 vs view 7,
  legacy deck stale at 14). Anything reading `getZone(user, z).array` or `mouseClick.card` is broken there —
  read `getAuthoritativeZoneArray(side, zone)` / the `cardRegistry` and address cards by instanceId (D12, D47).
- Board cards live INSIDE the `selfContainer`/`oppContainer` playmat iframes (separate documents that load only
  self-/opp-containers.css + its @imported partials; index.css never reaches them). Stadium is the exception.
- Anything the legacy client does in `chat-buttons.js` for a `server_command` action (stadium, attack,
  retreat, abilities) is DEAD under the flag — the dispatch gate returns first. Fix such cards in
  `shared/engine/`, not in the client (D50).
- Netcode: test under `SERVER_AUTHORITATIVE=1` only (S137). Pick a free PORT — other sessions hold :4000/:4317.
  Live 2P probe harness: `.agent/scratch/probe.mjs <step-file>` (Playwright, joins a room, deals, runs a step module).
- `pnpm test` is an explicit file list — a new test file runs only once added to package.json. `pnpm lint` fails
  repo-wide on CRLF; lint a diff with `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
- Prize cards move only on a server-granted entitlement (D43/D46). Manual counters/conditions and deck-order ops
  are turn-player-only in rules mode. Pre-existing failing test: "trainer drop: a Trainer without synced effect text".

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S173 2026-09-18 feature: Grand Tree search-evolve + Stage 2 chain in the server engine (design 013, D50).
- S173 2026-09-18 patch: cost-symbol/untyped Energy rows render as tokens (energy-token-assets.mjs).
- S172 2026-09-18 patch: I57 discard-pile viewer reads the authoritative discard.
