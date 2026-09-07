# Map — where things live. First stop when locating code; grep comes after, wholesale reading never.
<!-- One line per module: `path — what it is; entry: <file>`. Update on any structure change.
     Cap 120 lines: when over, collapse a subtree into .agent/areas/<x>.md and keep one line here
     pointing at it. `(?)` marks unverified bootstrap guesses — verify on first visit, then remove. -->

.agent/ — agent harness: state, workflows, designs, journal (human manual: .agent/README.md)

Project: ptcg-sim — Pokémon TCG tabletop simulator. pnpm workspace, NO bundler.
Client is native ESM served statically; server is Express + Socket.IO. Deploy: render.yaml.
<!-- Verified S1 while designing 001; covers netcode/rules/actions only. Full bootstrap still owed:
     deck-builder, image-logic, sizing, and initialization subtrees are unmapped. -->

## Entry points
client/index.ejs — HTML shell; loads socket.io 4.7.4 from CDN + `src/front-end.js` as type=module
client/src/front-end.js — client boot: sync logger, socket listeners, DOM listeners, observers
server/server.js — Express static + Socket.IO relay + SQLite export store; entry for `node server/server.js`

## Transport / netcode (client-authoritative today — design 001 replaces this)
server/server.js — pure relay: `emitToRoom()` broadcasts to room; holds room membership only, NO game state
client/src/initialization/socket-event-listeners/socket-event-listeners.js — all inbound socket handlers; sync orchestration
client/src/setup/general/process-action.js — appends to action log, increments counter, emits pushAction/requestAction
client/src/setup/general/accept-action.js — 59-entry action→function dispatch table; the command vocabulary
client/src/initialization/global-variables/global-variables.js — `socket` + `systemState` (session/meta state)

## Reconciliation stack (band-aids; design 001 slice 8 deletes these)
client/src/setup/general/catch-up-actions.js — replay peer action log
client/src/setup/general/resync-actions.js — send own log to peer
client/src/setup/general/sync-replay.mjs — dedupe fullReplay/snapshot to stop recovery loops
client/src/setup/general/request-board-snapshot.js — request/emit full board snapshot
client/src/setup/general/apply-board-snapshot.js — overwrite mirror board from snapshot
client/src/setup/general/sync-logger.mjs + sync-logger-bridge.js — desync diagnostics ring buffer
client/src/setup/general/sync-action-args.mjs — normalize emit/hint/RNG args across local vs replay

## Rules engine — pure, DOM-free, headless-tested (~8,900 lines; portable to Node)
client/src/setup/rules/*.mjs — 26 pure modules; see area notes below for the load-bearing ones
client/src/setup/rules/rules-state.mjs — `rulesState` + `canPerformAction()` legality gate (line 597)
client/src/setup/rules/attack-engine.mjs — `computeAttackDamage`, `canPayAttackCost`
client/src/setup/rules/trainer-effects.mjs — text → structured trainer step parser
client/src/setup/rules/abilities.mjs + ability-step-plan.mjs — ability parse + ordered step plan (resume seam)
client/src/setup/rules/damage-parser.mjs — attack text → damage math
client/src/setup/rules/rules-turnorder.mjs — deterministic coin-flip caller selection

## Rules engine — DOM-coupled glue (NOT portable; the migration's cost centre)
client/src/setup/rules/rules-bridge.js — 2291 lines; orchestrates rules via document.dispatchEvent + HUD
client/src/setup/rules/trainer-execution.js — 1465 lines; resolves effects through synchronous UI pickers
client/src/actions/chat-buttons/chat-buttons.js — 4330 lines; attack/pass/retreat monolith

## State / zones
client/src/setup/zones/get-zone.js — `getZone(user, zoneId)` → { array, element, ... }; DOM-coupled accessor
client/src/setup/zones/*.mjs — pure: zone-hash, board-snapshot, card-state, hand-sort, resolve-card-index, active-pokemon
client/src/setup/deck-constructor/card.js — `Card` class; identity is `card.image` (HTMLImageElement)
client/src/setup/deck-constructor/build-deck.js — builds decks, assigns `syncInstance`

## Actions (~10,582 lines, ~85% DOM-coupled — every mutation goes through the DOM)
client/src/actions/move-card-bundle/ — card movement, attach, evolve; primary mutation path
client/src/actions/zones/ — deck/hand/prize/shuffle operations
client/src/actions/counters/ — damage, special condition, ability counters (DOM overlays)
client/src/actions/general/ — setup, ready, turn, reveal/hide, reset, undo

## Tests & tooling
client/src/**/__tests__/*.mjs — 41 files, plain `node --test`, no jsdom; `pnpm test` (797 tests)
two-player-sync-test.mjs — Playwright two-browser sync harness
*-audit.mjs (root) — one-off card/attack/trainer/stadium coverage audits
