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

## Reconciliation stack (design 001 slice 8 deleted catch-up-actions.js, resync-actions.js,
## sync-replay.mjs, request/apply-board-snapshot.js without replacement; design 002 slice 1.1
## restored reconnect recovery via a new, smaller mechanism)
client/src/setup/netcode/peer-log-catchup.js — DOM-free peer-log request/response/replay logic
client/src/setup/netcode/request-action-queue.js — counter-ordered requestAction buffer (design 002
slice 1.2); gap open past 2s falls through to peer-log-catchup instead of misapplying
client/src/setup/general/sync-logger.mjs + sync-logger-bridge.js — desync diagnostics ring buffer
client/src/setup/general/sync-action-args.mjs — normalize emit/hint/RNG args across local vs replay
client/src/setup/netcode/sync-check.js + server/game/sync-check.mjs — desync detection (design 002
slice 3.11): client heartbeat sends per-zone hashes, server names first divergent zone, recovery
routes into peer-log-catchup.js above (no second recovery mechanism). `viewBackedGetZone`
(client) and `excludeOwnerSecretZones` (server) added S64/I24: hashes read through
`apply-view.js`'s view cache, not legacy `zoneArrays` (never populated), and `deck` is dropped
from the comparison (owner-secret, O4-A/I5)
client/src/setup/netcode/authoritative-dispatch.js — gated-action dispatch primitive (design 003
slice 0): cardRegistry-sourced card hints + emitAuthoritativeCommand; processAction injected, not
imported. Fails open to the legacy body when a command cannot be translated (D12)
client/src/setup/netcode/card-stats.js — sends printed card data (hp/attacks/types/weakness/
resistance/retreatCost/stage) to the server as the `cardStats` command (D15, I26); without it the
server cannot adjudicate a knockout. Sent from build-deck.js once ensureCardData settles

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
shared/engine/cards.mjs — pure `Card` model, `mintInstanceId`, DOM-free (replaces DOM-based Card identity)
shared/engine/state.mjs — pure `GameState` model (8 zones/player, neutral stadium), zone accessors, `hashState`
shared/engine/rng.mjs — seeded `mulberry32` PRNG, deterministic replay source (Invariant 6)
shared/engine/view.mjs — `viewFor(state, playerId)` authoritative redacted view per player/spectator (H1, Invariant 5)
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
two-player-sync-test.mjs — Playwright two-browser sync harness (legacy mode, `pnpm test:2p`)
flip-gate-test.mjs — Playwright two-browser full game under SERVER_AUTHORITATIVE=1: design 002's
  3.12 flip gate (`pnpm test:flip`; needs a hand-started authoritative server on PTCG_URL)
*-audit.mjs (root) — one-off card/attack/trainer/stadium coverage audits
bot/bot.mjs, bot/heuristic-scorer.mjs — design 004 slice 5: pure-Node playtest bot (never-crash
  scaffold + greedy scorer), driven by playtest-bot.mjs via __ptcg observe/options/act
playtest-bot.mjs (root) — design 004 slice 6: the playtest runner. Two Playwright pages, bot vs.
  bot, legacy mode by default (`node server/server.js` on :4000, then `node playtest-bot.mjs
  --games=N --seed=S`); dumps a replayable trace to out/playtest/ on any failure. Found a real bug
  on first live run (I30, ISSUES.md) — see design 004 slice 6's Acceptance note.

