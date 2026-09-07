# Project — stable facts beyond CLAUDE.md. Read before feature work or when confused. Cap: 80 lines.

## Architecture (≤10 lines — how the pieces talk; MAP.md owns the directory list)
- Express + Socket.IO server (`server/server.js`) handles static file serving, EJS rendering, authentication, and 2-player state synchronization.
- Frontend (`client/index.ejs`, `client/src/front-end.js`) manages board state, deck builder UI, and rules mode engine.
- Rules mode (`client/src/setup/rules/`) enforces Pokémon TCG turn structures, attack/trainer mechanics, card interactions, and mulligans.
- SQLite (`server/database/db.sqlite`) provides database storage; initialized dynamically if directory is missing on boot.

## Constraints & non-goals (hard requirements; things deliberately unsupported)
- Server must be able to boot and create database directory dynamically for ephemeral host compatibility (e.g. Render).
- Pure logic / rules tests run via native Node.js test runner (`node --test`) with JSDOM where DOM manipulation is required.
- Decks stored in `localStorage` detach session editor state upon page reload to prevent accidental overwrites.

## Glossary (domain terms with exact meanings — misreading one produces wrong code)
- Rules mode: Guided game state enforcement engine for card effects, attack costs, and turns.
- My Decks: Local browser deck storage and management library (`ptcg-sim.deck-library.v1`).
- SyncInstance / CardHint: Unique identifiers and fallback mechanisms to resolve card identity across 2P socket synchronization.

## Landmines (cross-cutting gotchas, ≤15; area-specific ones belong in .agent/areas/)
<!-- format: symptom → actual cause → what to do instead -->
- ESLint fails with thousands of errors → Windows CRLF line endings (`\r\n`) trigger Prettier Delete `\r` rule errors → convert files to LF or format via Prettier before linting.
- DB fails to initialize on cloud host → host directory wiped on restart → maintain `fs.mkdirSync(dbDir, { recursive: true })` before `sqlite3.Database` creation in `server.js`.
- Card interaction fails in 2P mode → relay card index became stale → use `resolveCardIndex` with `syncInstance` / `cardId` hints instead of index.
- Reloading page overwrites saved deck → editor binding remained attached → keep active deck selection session-only and detach on page load/clear.

