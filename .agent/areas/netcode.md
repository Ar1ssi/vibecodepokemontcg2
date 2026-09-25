# Area: netcode (client transport, authoritative view adapters, mat FX)
<!-- Cap 60 lines. Moved out of MAP.md on 2026-09-24 (S286) to keep MAP under cap.
     Server side: server/server.js (HTTP + Socket.IO) → server/game/room.mjs (GameRoom: applies
     commands to shared/engine state, sends per-player views); shadow.mjs, sync-check.mjs beside it. -->
Purpose: how client actions reach the server and how server views/events render back.

## Legacy transport (flag-off relay path)
client/src/initialization/socket-event-listeners/socket-event-listeners.js — all inbound socket handlers; sync orchestration
client/src/setup/general/process-action.js — appends to action log, increments counter, emits pushAction/requestAction
client/src/setup/general/accept-action.js — 59-entry action→function dispatch table; the command vocabulary
client/src/initialization/global-variables/global-variables.js — `socket` + `systemState`; note `initiator` getter reads a CSS class

## Reconnect / desync
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

## Authoritative adapters
client/src/setup/netcode/authoritative-dispatch.js — gated-action dispatch primitive (design 003
slice 0): cardRegistry-sourced card hints + emitAuthoritativeCommand; processAction injected, not
imported. Fails open to the legacy body when a command cannot be translated (D12)
client/src/setup/netcode/prize-picker-adapter.js — injected `prizePicker`: shows a server prize pendingChoice as the fly-up prize fan (actions/zones/prize-take-prompt.js, D46)
client/src/setup/netcode/mat-picker-adapter.js + mat-pick-request.mjs — injected `matPicker`:
  routes a server pendingChoice whose options are all in-play Pokémon (single- OR multi-pick)
  to the legacy click-the-card UI (`rules/mat-picker.js`) instead of the carousel (design 016/017,
  D59/D60); covers retreat, Escape Rope, Boss's Orders/Switch, heals, and attack snipes
client/src/setup/netcode/manual-card-commands.mjs — pure planner for the manual board tools
  (damage/conditions/rotate/type/ability marker) from a registry card; manual-card-dispatch.js emits them
client/src/setup/netcode/deck-peek.js + deck-peek-request.mjs — "look at top/bottom N cards":
  `peekDeck` socket request (server/game/room.mjs `peekDeck`, shared/engine/view.mjs `deckPeekFor`),
  shown in the card picker; picks leave the deck as moveCard commands (design 012, D49)
client/src/setup/netcode/turn-order-call.js — transport for the server-owned opening coin call:
turns `turnOrderCall`/`turnOrderResult`/`turnOrderCallRejected` into `rules-turn-order-*` DOM events and
caches the resolved flip for a late reader; registered from socket-event-listeners.js, NOT the rules
bridge, because the call arrives while setupPrizes() is still awaiting dealOrder (design 013, D50)
client/src/setup/netcode/card-stats.js — sends printed card data (hp/attacks/types/weakness/
resistance/retreatCost/stage) to the server as the `cardStats` command (D15, I26); without it the
server cannot adjudicate a knockout. Sent from build-deck.js once ensureCardData settles
client/src/setup/netcode/server-battle-log.mjs + server-battle-log.js — server advisory event →
battle-log text under server authority (design 021/I71): pure mapper composes attack-announcements.mjs,
the DOM caller appends; wired as `onAdvisoryEvent` in socket-event-listeners.js, both clients phrase
from their own `playerId`. Needs the server's `trainerPlayed` event and non-Pokémon `cardAttached`

## Mat FX
client/src/setup/netcode/mat-fx/ — mat cosmetic effects (design 022, D94; polish design 026, D103: WAAPI via sampleKeyframes, particles.mjs, fx-colors.mjs, impact queue in combat-pose): dispatcher.mjs (guards), index.js (registry), combat/status/lifecycle/flow(.js + *-pose.mjs), origins.mjs (pre-diff snapshots), entry.js + entry-kind/entry-pose/entry-art.mjs (Mega/Tera signature entries, design 027 → visuals 034, D104/D117; the Mega hex field is painted inside #battleMatSurface) + mega-orb.mjs (3D canvas keystone orb, design 035, D118) + mega-vortex.mjs (brush-stroke vortex on the orb canvas, design 036, D119) + tera-crystal.mjs (canvas Terastallization entry, design 037, D120; per-type palette D122) + tera-skin.mjs/.js (persistent Tera crystal skin, reconciled on `board-view-applied`, D121); canvas-stage.js (shared `playCanvasStage`, D154) + evolve-scene.mjs/.js (Scarlet/Violet scene for non-signature evolutions, design 041, D153; origins.mjs snapshots the old card);
  primitives in image-logic/mat-fx.mjs; css/mat-fx.css (parent overlays) + css/mat-ambient.css (iframe ambience) + status-marker.css idle keyframes; deck-constructor/mat-tilt.mjs
  Design 024 (D146–D148): fx-queue.mjs + fx-holds.mjs pace each advisory batch (dispatcher returns each plan's hold); fx-audio.mjs/.js procedural sound;
  banner.js shared banner (turn/ability/attack-name); prize/coin effects; toggles owned by image-logic/fx-settings.mjs/.js (mirrors fx-off into iframes). Combat hits still land on the lunge's impact (combat.js `afterImpact`).
