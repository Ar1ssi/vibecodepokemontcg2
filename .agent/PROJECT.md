# Project — stable facts beyond CLAUDE.md. Read before feature work or when confused. Cap: 80 lines.

## Architecture (≤10 lines — how the pieces talk; MAP.md owns the directory list)
- Express + Socket.IO server (`server/server.js`) handles static file serving, EJS rendering, authentication, and 2-player state synchronization.
- Frontend (`client/index.ejs`, `client/src/front-end.js`) manages board state, deck builder UI, and rules mode engine.
- Rules mode (`client/src/setup/rules/`) enforces Pokémon TCG turn structures, attack/trainer mechanics, card interactions, and mulligans.
- SQLite (`server/database/db.sqlite`) provides database storage; initialized dynamically if directory is missing on boot.

## Constraints & non-goals (hard requirements; things deliberately unsupported)
- Server must be able to boot and create database directory dynamically for ephemeral host compatibility (e.g. Render).
- Pure logic / rules tests run via native Node.js test runner (`node --test`) on plain `.mjs` modules with **no jsdom** — they use stub card objects. `jsdom` is a devDependency used only by `integration-test.mjs`.
- Decks stored in `localStorage` detach session editor state upon page reload to prevent accidental overwrites.
- No build step. Browser loads native ESM (`client/index.ejs:20`); deploy is `pnpm install` then `node server/server.js` (`render.yaml`). A proposal needing a bundler must justify itself in DECISIONS.md first. (S2)
- Scale: small, mostly private. A handful of concurrent games, players known to each other. Prefer the simple mechanism over the scalable one whenever they conflict. (S2)
- Losing in-progress games on a server restart is acceptable. No durable game log, no crash recovery, no rehydration. (S2)
- Non-goals unless a decision reopens them: clustering/horizontal scaling, user accounts or auth, rate limiting, adversarial anti-cheat hardening. (S2)

## Glossary (domain terms with exact meanings — misreading one produces wrong code)
- Rules mode: Guided game state enforcement engine for card effects, attack costs, and turns.
- My Decks: Local browser deck storage and management library (`ptcg-sim.deck-library.v1`).
- SyncInstance / CardHint: Unique identifiers and fallback mechanisms to resolve card identity across 2P socket synchronization. (Both exist to patch client-authoritative index drift; design 001 retires them for a server-minted `instanceId`.)

## Landmines (cross-cutting gotchas, ≤15; area-specific ones belong in .agent/areas/)
<!-- format: symptom → actual cause → what to do instead -->
- ESLint fails with thousands of errors → Windows CRLF line endings (`\r\n`) trigger Prettier Delete `\r` rule errors → convert files to LF or format via Prettier before linting.
- DB fails to initialize on cloud host → host directory wiped on restart → maintain `fs.mkdirSync(dbDir, { recursive: true })` before `sqlite3.Database` creation in `server.js`.
- Card interaction fails in 2P mode → relay card index became stale → use `resolveCardIndex` with `syncInstance` / `cardId` hints instead of index.
- Reloading page overwrites saved deck → editor binding remained attached → keep active deck selection session-only and detach on page load/clear.
- Logic works for one player but mirrors wrong for the other → `'self'`/`'opp'` are point-of-view, not identity, and `systemState.initiator` is derived from a CSS class (`global-variables.js:44`) → never send either over the wire; convert to an absolute player id at the boundary.
- Two boards differ in HP/status but `syncCheck` reports "in sync" → damage, special conditions, and ability-used markers are stored only on the DOM node (`card.image.damageCounter` etc.), so they were invisible to the hash → read them via `card-state.mjs` helpers, never straight off `card.image`.
- "Energy already attached this turn" fires with no real second attach (S70) → `flags[user].energyAttached` is only ever set by `rules-bridge.js` `hookEnergyAttach`'s `checkEnergyAdds`, which watches the `attachedCards` staging zone — but a real hand→active/bench attach never populates that zone, so the flag is set (and its false-positive warning thrown) only when a Pokémon's Energy is *detached* into that zone (KO, hand/deck return, etc.), not on genuine new attaches → the once-per-turn attach limit is not actually gated off real attaches; treat any change here as touching dead/miswired enforcement, not a working gate.

