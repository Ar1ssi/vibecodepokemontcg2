# Decisions — binding choices, one line each, newest first. Scan before designing anything;
# do not relitigate a decision without new information — build on it or surface the conflict.
# Cap 50 active lines; maintain.md moves superseded/expired ones to the Archive section.
# Format: `D<n> <YYYY-MM-DD> [scope] decision — why. (Supersedes D<m>.)`

- D10 2026-09-09 [netcode] Card identity across the dual-run boundary is translated, never punned: the server keeps minting instanceId and returns a per-player syncInstance→instanceId map at deck init; an unresolvable hint drops the command rather than guessing. Client syncInstance is 0-based per player and is NOT the server's id (design 002 O3).
- D9 2026-09-09 [netcode] Reconnect recovery is a bounded peer action-log catch-up (cap 200, 5s timeout) with a mandatory loud "reload and rejoin" failure branch — no snapshot machinery. A recovery path without a failure branch is what grew into the stack slice 8 deleted (design 002 O2).
- D8 2026-09-09 [netcode] SERVER_AUTHORITATIVE defaults OFF and is set explicitly in render.yaml; the flip is a result gated on design 002 slice 3.6's two-browser exit test, never a default. Design 001 slice 8 flipped it with three of four preconditions unmet (design 002 O1). (Supersedes the slice-8 default in D6's rollout.)
- D6 2026-09-07 [netcode] Named-payload commands validate via 5-step pipeline in pure applyCommand reducer; undo deferred as deterministic commandLog replay (design 001).
- D5 2026-09-07 [netcode] Pure Card and GameState data models use instanceId and absolute player IDs with Mulberry32 PRNG (design 001).
- D4 2026-09-07 [netcode] Shared engine lives in shared/ served at /shared without bundler or new dependencies (design 001).
- D1 2026-09-07 [stack] Node.js ES modules with native node --test runner used across workspaces. (observed)
- D2 2026-09-07 [architecture] Express + Socket.IO server with SQLite3 for 2P real-time multiplayer state sync. (observed)
- D3 2026-09-07 [rules] Rules engine uses modular JS with JSDOM for testing pure card logic and guided turn flows. (observed)


## Archive (dead decisions — kept greppable, never loaded into working context)
