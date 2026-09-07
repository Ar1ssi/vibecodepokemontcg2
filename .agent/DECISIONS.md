# Decisions — binding choices, one line each, newest first. Scan before designing anything;
# do not relitigate a decision without new information — build on it or surface the conflict.
# Cap 50 active lines; maintain.md moves superseded/expired ones to the Archive section.
# Format: `D<n> <YYYY-MM-DD> [scope] decision — why. (Supersedes D<m>.)`

- D6 2026-09-07 [netcode] Named-payload commands validate via 5-step pipeline in pure applyCommand reducer; undo deferred as deterministic commandLog replay (design 001).
- D5 2026-09-07 [netcode] Pure Card and GameState data models use instanceId and absolute player IDs with Mulberry32 PRNG (design 001).
- D4 2026-09-07 [netcode] Shared engine lives in shared/ served at /shared without bundler or new dependencies (design 001).
- D1 2026-09-07 [stack] Node.js ES modules with native node --test runner used across workspaces. (observed)
- D2 2026-09-07 [architecture] Express + Socket.IO server with SQLite3 for 2P real-time multiplayer state sync. (observed)
- D3 2026-09-07 [rules] Rules engine uses modular JS with JSDOM for testing pure card logic and guided turn flows. (observed)


## Archive (dead decisions — kept greppable, never loaded into working context)
