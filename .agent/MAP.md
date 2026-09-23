# Map — where things live. First stop when locating code; grep comes after, wholesale reading never.
<!-- One line per module: `path — what it is; entry: <file>`. Update on any structure change.
     Cap 120 lines: when over, collapse a subtree into .agent/areas/<x>.md and keep one line here
     pointing at it. `(?)` marks unverified bootstrap guesses — verify on first visit, then remove. -->

.agent/ — agent harness: state, workflows, designs, journal (human manual: .agent/README.md)
client/ — client application (EJS layout, CSS styles, client JS, deck builder, rules engine); entry: client/src/front-end.js
server/ — backend server (Express HTTP server, Socket.IO multiplayer sync, SQLite DB); entry: server/server.js
docs/ — project documentation (card types taxonomy, rule specs); entry: docs/card-types-taxonomy.md
scripts/ — admin and asset utility scripts (stadium audit, pkmncards scraper + attack/ability corpus audit, mat generator)
tools/ — internal dev tools, sync log comparison, asset mappings
client/src/css/deck-builder-live.css — deck builder's PTCG Live theme (D: S252); ALL rules scoped
  under `.db-live` (on #nativeDeckBuilderWorkspace) — that class is what overrides index.css on
  specificity, so @import order never matters and nothing needs !important. `.db-light` re-tokenizes
  to the pre-Live grey palette. Token block at the top is the only thing the two themes differ by.
client/src/setup/deck-builder/core/builder-theme.mjs — theme resolve/persist (dark default)
client/src/setup/deck-builder/core/deck-counter.mjs — "x / 60" counter model from a validateDeck result
client/src/setup/deck-builder/core/card-filters.mjs — search filter pills (card class / energy type /
  Trainer subtype); OR within a group, AND across groups; reuses energy-token-assets.mjs's type vocabulary
client/src/setup/deck-builder/core/deck-sprites.mjs — deck Pokémon sprite slots (design 024, D97):
  up to 2 `{slug, shiny}` per deck (D99), catalog search and vendored-art URL building; catalog data in
  pokemon-sprite-catalog.generated.mjs (905 gen-8 base forms), art in client/src/assets/pokemon/gen8/,
  both refreshed by scripts/generate-pokemon-sprites.mjs; plus hand-kept pokemon-sprite-catalog-gen9.mjs
  (fan art, regular only, D100) with art in client/src/assets/pokemon/gen9/regular/. UI: renderDeckSprites/renderSpritePicker in
  native-deck-builder-renderers.js + native-deck-builder-sprite-picker.js (popover state only)
client/src/setup/deck-builder/core/card-sprites.mjs — card → sprite (design 025, D98): cardSpriteFor
  parses Pokémon names to species + Mega/Primal/Gmax/regional form, Item/Tool Trainers to pokesprite item
  art (item-sprite-catalog.generated.mjs, art in client/src/assets/items/, via
  scripts/generate-item-sprites.mjs); resolveDisplaySprites auto-fills the 2 deck sprites from the deck
client/src/setup/deck-builder/core/box-wallpapers.mjs — 16 Gen V PC Box wallpapers (banner + body PNGs in
  client/src/assets/box-wallpapers/), per-deck `wallpaperId`; PC Box look = css/deck-builder-pc-box.css
  (scoped `.db-live:not(.db-light)`, Rodin woff2 in client/src/assets/fonts/)
client/src/setup/deck-builder/core/coins.mjs — coin catalog (939, unique ids); normalize via
  scripts/normalize-coin-catalog.mjs; filterCoins/groupCoinsByRelease/getCoinStats; scans fetched to
  client/src/assets/coins/historical/ by scripts/download-coin-images.mjs (manifest only, no auto-link);
  coin-effects.mjs + client/src/css/coin/ = material/finish resolver + shared fixed-light foil CSS for the
  picker and mat token (D92; derived holofoil/mirror finish, luminance relief mask)

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
client/src/setup/netcode/mat-fx/ — mat cosmetic effects (design 022, D94; polish design 026, D103: WAAPI via sampleKeyframes, particles.mjs, fx-colors.mjs, impact queue in combat-pose): dispatcher.mjs (guards), index.js (registry), combat/status/lifecycle/flow(.js + *-pose.mjs), origins.mjs (pre-diff snapshots), entry.js + entry-kind/entry-pose.mjs (Mega/Tera signature entries, design 027, D104);
  primitives in image-logic/mat-fx.mjs; css/mat-fx.css (parent overlays) + css/mat-ambient.css (iframe ambience) + status-marker.css idle keyframes; deck-constructor/mat-tilt.mjs
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

## Rules engine — pure, DOM-free, headless-tested (~8,900 lines; portable to Node)
shared/engine/rules/rules-state.mjs — `rulesState` + `canPerformAction()` legality gate (line 597)
shared/engine/rules/attack-engine.mjs — `computeAttackDamage`, `canPayAttackCost`
shared/engine/rules/special-energy-parse.mjs — special-energy text → structured effect steps (`parseSpecialEnergyEffects`) + pure execution helpers used by `computeAttackDamage` (damage bonus/penalty/reduction) and `effectiveHp` (+HP); audit `scripts/audit-all-special-energy.mjs` (S220)
shared/engine/rules/special-conditions.mjs — server card conditions: rotation field + Poison/Burn marker keys (D45); every reducer/effect write goes through it
shared/engine/rules/trainer-effects.mjs — text → structured trainer step parser
shared/engine/rules/trainer-play-conditions.mjs — `trainerPlayBlockReason` (turn-1 Supporter, same Stadium, printed play conditions); used by reduce.mjs legality and the bot's e2e-options.mjs
shared/engine/rules/evolved-pokemon.mjs — `evolvedView` (in-play Pokémon read as its top Evolution card), Rare Candy line tracing, Trainer target counts; used by reduce.mjs, trainer-steps.mjs, the bot
shared/engine/rules/server-energy.mjs — `serverEnergyDescriptor`: how the server prices attached Energy; the bot uses it too
shared/engine/effects/executor.mjs — resumable step runner; core step kinds inline, the rest delegated to trainer-steps.mjs
shared/engine/effects/trainer-steps.mjs — server handlers for the other trainer step kinds; multi-choice progress lives in resumeToken.context
shared/engine/rules/abilities.mjs + ability-step-plan.mjs - ability parse + ordered step plan (resume seam); Ancient Traits (`ancientTraitIn`: Δ/θ/Ω/α markers or spelled "Delta …") tag EVERY step `trait:'alpha'|'omega'|'delta'|'theta'` with `isAncientTraitAbility` so "no Abilities" gates skip them (App. 23/D72); audit `scripts/audit-all-ancient-traits.mjs` over `out/pkmn-ancient-trait-cards.json` (shared splitter `scripts/lib/split-card-text.mjs`)
shared/engine/rules/stadium-effects.mjs - pure stadium classify/parse/apply (`applyStadiumEffect`) + `stadiumActivationStatus` (the inspector stadium Use gate, design 018); server executor in shared/engine/effects/stadium.mjs
shared/engine/rules/damage-parser.mjs - attack text → damage math; `isGxAttack` name classifier
shared/engine/rules/attack-steps.mjs + effects/attack-steps.mjs - attack text → ordered executor steps (`parseAttackSteps`, design 030/031) and their server handlers; reduce.mjs runs them before/after damage
shared/engine/rules/attack-markers.mjs - timed attack markers on cards (`card.attackMarkers`: immunity, prevention/reduction, next-turn bonus, deferred KO, retaliate); read by computeAttackDamage, cleared on retreat/KO/evolve (design 031)
shared/engine/rules/attack-copy.mjs - copy-attack parser (`parseCopyAttack`); reduce.mjs offers the copied attack before coins (`offerCopiedAttack`, design 031)
shared/engine/rules/rules-turnorder.mjs — deterministic coin-flip caller selection (flag-OFF 2P only since design 013)
shared/engine/rules/turn-order-flip.mjs — pure opening-coin helpers in absolute playerId space: `flipCoinFace`, `pickCoinCaller`, `resolveStarterPlayerId`; the server authority's side of the coin call (D50)
shared/engine/rules/legacy-set-ids.mjs — short set code to TCGdex set id mapping
shared/engine/rules/card-classify.mjs — single card-classification contract: `isRuleBoxPokemon`, `prizesForKO`, ex/GX/V/VMAX/VSTAR/Tera/Mega/Tag-Team/V-Union/Prism/Radiant/ACE-SPEC/LEGEND/Basic-Energy predicates; ko-flow re-exports, search-match/stadium-effects/tool-combat/reduce use it (rulebook 30c Phase 0); also understands TCGdex `energyType`/`rarity` fallbacks so client deck cards classify without `subtypes` (30c Phase 3); the `cardHasRuleBox` aliases are gone — `isRuleBoxPokemon` is the only rule-box definition (30c 4.2); `isTeamFlareHyperGearCard` is the App. 24 opponent-attaching Tool marker (30c 5.1)

## Rules engine — DOM-coupled glue (NOT portable; the migration's cost centre)
client/src/setup/rules/rules-bridge.js — 2324 lines; orchestrates rules via document.dispatchEvent + HUD
client/src/setup/rules/trainer-execution.js — 1549 lines; resolves effects through synchronous UI pickers
client/src/actions/chat-buttons/chat-buttons.js — 4573 lines; attack/pass/retreat monolith

## State / zones
shared/engine/cards.mjs — pure `Card` model, `mintInstanceId`, DOM-free (replaces DOM-based Card identity); `isBasicPokemon` treats LEGEND/V-UNION/Restored/BREAK as non-Basic (30c 5.4)
shared/engine/state.mjs — pure `GameState` model (8 zones/player, neutral stadium), zone accessors, `hashState`; per-player `oncePerGame: { vstarUsed, gxUsed }` survives `advanceTurn` (rulebook 30c 1.2); `discardCardToPlayerZone` routes Prism Star discards to the Lost Zone (30c 3.5)
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
client/src/**/__tests__/*.mjs — plain `node --test`, no jsdom; `pnpm test` (1223 tests, S85)
two-player-sync-test.mjs — Playwright two-browser sync harness (legacy mode, `pnpm test:2p`)
flip-gate-test.mjs — Playwright two-browser full game under SERVER_AUTHORITATIVE=1: design 002's
  3.12 flip gate (`pnpm test:flip`; needs a hand-started authoritative server on PTCG_URL)
test-card-inspector-e2e.mjs — Playwright two-browser design-013 card-inspector gate
  (`pnpm test:inspector`; needs a hand-started authoritative server on PTCG_URL). Step 9 clicks the
  attack panel with REAL input (locator.click), so it catches pointer-capture regressions el.click() hides
*-audit.mjs (root) — one-off card/attack/trainer/stadium coverage audits
bot/bot.mjs, bot/heuristic-scorer.mjs — design 004 slice 5: pure-Node playtest bot (never-crash
  scaffold + greedy scorer), driven by playtest-bot.mjs via __ptcg observe/options/act
playtest-bot.mjs (root) — design 004 slice 6: the playtest runner. Two Playwright pages, bot vs.
  bot, legacy mode by default (`node server/server.js` on :4000, then `node playtest-bot.mjs
  --games=N --seed=S`); dumps a replayable trace to out/playtest/ on any failure. Found a real bug
  on first live run (I30, ISSUES.md) — see design 004 slice 6's Acceptance note.

