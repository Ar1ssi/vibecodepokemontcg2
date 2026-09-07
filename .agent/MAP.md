# Map — where things live. First stop when locating code; grep comes after, wholesale reading never.
<!-- One line per module: `path — what it is; entry: <file>`. Update on any structure change.
     Cap 120 lines: when over, collapse a subtree into .agent/areas/<x>.md and keep one line here
     pointing at it. `(?)` marks unverified bootstrap guesses — verify on first visit, then remove. -->

.agent/ — agent harness: state, workflows, designs, journal (human manual: .agent/README.md)
client/ — client application (EJS layout, CSS styles, client JS, deck builder, rules engine); entry: client/src/front-end.js
server/ — backend server (Express HTTP server, Socket.IO multiplayer sync, SQLite DB); entry: server/server.js
docs/ — project documentation (card types taxonomy, rule specs); entry: docs/card-types-taxonomy.md
scripts/ — admin and asset utility scripts (stadium audit, mat generator, scraper)
tools/ — internal dev tools, sync log comparison, asset mappings

<!-- Netcode/rules detail below verified S2 while designing 001. Deck-builder, image-logic,
     sizing, and initialization subtrees remain unmapped at this depth. -->

## Transport / netcode (client-authoritative today — design 001 replaces this)
server/server.js — pure relay: `emitToRoom()` broadcasts to room; holds room membership only, NO game state
client/src/initialization/socket-event-listeners/socket-event-listeners.js — all inbound socket handlers; sync orchestration
client/src/setup/general/process-action.js — appends to action log, increments counter, emits pushAction/requestAction
client/src/setup/general/accept-action.js — 59-entry action→function dispatch table; the command vocabulary
client/src/initialization/global-variables/global-variables.js — `socket` + `systemState`; note `initiator` getter reads a CSS class

## Reconciliation stack (band-aids; design 001 slice 8 deletes these)
client/src/setup/general/catch-up-actions.js — replay peer action log
client/src/setup/general/resync-actions.js — send own log to peer
client/src/setup/general/sync-replay.mjs — dedupe fullReplay/snapshot to stop recovery loops
client/src/setup/general/request-board-snapshot.js + apply-board-snapshot.js — full board overwrite path
client/src/setup/general/sync-logger.mjs + sync-logger-bridge.js — desync diagnostics ring buffer
client/src/setup/general/sync-action-args.mjs — normalize emit/hint/RNG args across local vs replay

## Rules engine — pure, DOM-free, headless-tested (~8,900 lines; portable to Node)
shared/engine/rules/rules-state.mjs — `rulesState` + `canPerformAction()` legality gate (line 597)
shared/engine/rules/attack-engine.mjs — `computeAttackDamage`, `canPayAttackCost`
shared/engine/rules/trainer-effects.mjs — text → structured trainer step parser
shared/engine/rules/abilities.mjs + ability-step-plan.mjs — ability parse + ordered step plan (resume seam)
shared/engine/rules/damage-parser.mjs — attack text → damage math
shared/engine/rules/rules-turnorder.mjs — deterministic coin-flip caller selection
shared/engine/rules/legacy-set-ids.mjs — short set code to TCGdex set id mapping

## Rules engine — DOM-coupled glue (NOT portable; the migration's cost centre)
client/src/setup/rules/rules-bridge.js — 2291 lines; orchestrates rules via document.dispatchEvent + HUD
client/src/setup/rules/trainer-execution.js — 1465 lines; resolves effects through synchronous UI pickers
client/src/actions/chat-buttons/chat-buttons.js — 4330 lines; attack/pass/retreat monolith

## State / zones
client/src/setup/zones/get-zone.js — `getZone(user, zoneId)` → { array, element, ... }; 10 zones/player, stadium neutral
shared/engine/zones/zone-hash.mjs — `hashCardList`/`hashBoardSnapshot`; `SYNC_HASH_ZONES` is 8 zones (excludes UI scratch)
shared/engine/zones/*.mjs — pure: board-snapshot, card-state, hand-sort, resolve-card-index, active-pokemon
client/src/setup/deck-constructor/card.js — `Card` class; identity is `card.image` (HTMLImageElement)

## Actions (~10,582 lines, ~85% DOM-coupled — every mutation goes through the DOM)
client/src/actions/move-card-bundle/ — card movement, attach, evolve; primary mutation path
client/src/actions/zones/ — deck/hand/prize/shuffle operations
client/src/actions/counters/ — damage, special condition, ability counters (DOM overlays)
client/src/actions/general/ — setup, ready, turn, reveal/hide, reset, undo

## Tests & tooling
client/src/**/__tests__/*.mjs — 41 files, plain `node --test`, no jsdom; `pnpm test` (797 tests)
two-player-sync-test.mjs — Playwright two-browser sync harness
*-audit.mjs (root) — one-off card/attack/trainer/stadium coverage audits

