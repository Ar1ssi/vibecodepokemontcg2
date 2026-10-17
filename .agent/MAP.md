# Map — where things live. First stop when locating code: grep it (`grep -n -i <keyword> .agent/MAP.md`), never read it whole.
<!-- One line per module: `path — what it is; entry: <file>`. Update on any structure change.
     Cap 120 lines: when over, collapse a subtree into .agent/areas/<x>.md and keep one line here
     pointing at it. `(?)` marks unverified bootstrap guesses — verify on first visit, then remove. -->

.agent/ — agent harness: state, workflows, designs, journal (human manual: .agent/README.md); spawn-or-inline cost guide: .agent/DELEGATION.md
.claude/agents/ — project subagents: slice-builder (low effort, pinned-contract slices; D171), fx-designer (high effort, board visuals/CSS in the 041–046 house style; D173)
client/ — client application (EJS layout, CSS styles, client JS, deck builder, rules engine); entry: client/src/front-end.js
server/ — Express + Socket.IO + SQLite; entry: server/server.js; game rooms in server/game/room.mjs (GameRoom runs shared/engine commands, sends per-player views); server/netcode-mode.mjs: server authority unless SERVER_AUTHORITATIVE=0|false|off|no; server/game/room-sweep.mjs: idle-room sweep plan
shared/tcgdex/ — TCGdex URL builder (browser → server proxy server/tcgdex-proxy.mjs, D164) + IndexedDB JSON cache (D102)
docs/ — project documentation (card types taxonomy, rule specs); entry: docs/card-types-taxonomy.md
scripts/ — admin and asset utility scripts (stadium audit, pkmncards scraper + attack/ability corpus audit, mat generator; pkmncards article HTML helper: scripts/lib/pkmn-article-html.mjs, D179)
scripts/audit-oracle.mjs (`pnpm audit:oracle`, ~2 min) — execution gate: runs every corpus attack/ability through the engine (lib/oracle-harness.mjs), ratchets per-family observed rates vs scripts/oracle-baseline.json (lib/oracle-gate.mjs); family claim lists in lib/executed-families.mjs (I113)
scripts/audit-ability-behaviour.mjs (`pnpm audit:abilities`, ~2 min) — ability gate: classes every corpus ability runs/partial/dead/consumed/unconsumed/unparsed (lib/ability-behaviour.mjs, reads effects/ability.mjs `resolveAbilitySteps`; passive rows via lib/ability-passive-probe.mjs reader probes, D135), ratchets per-family shares vs scripts/ability-behaviour-baseline.json (D134) and holds EXECUTED_ABILITY_FAMILIES claims to ≥50% runs+consumed (D136)
scripts/audit-trainer-behaviour.mjs (`pnpm audit:trainers`, seconds) — Trainer gate: per unique corpus Trainer, parse outcome + step kinds with no server executor + play condition (lib/trainer-behaviour.mjs) vs scripts/trainer-behaviour-baseline.json (D124)
scripts/audit-attack-behaviour.mjs (`pnpm audit:attacks`, ~2 min) — attack gate: classes every unique effect-text attack in out/pkmn-pokemon-cards.json ok/partial/ran-no-effect/engine-error from a rich-board reducer run (lib/attack-harness.mjs) + sentence cross-check (lib/attack-behaviour.mjs), ratchets each row vs scripts/attack-behaviour-baseline.json (design 036 slice 16); also unresolved damage notes, condition-true bonus replay (lib/condition-replay.mjs), lock mechanics and TCGdex typography drift (lib/text-variants.mjs, shared with audit:abilities: clause cross-check, evolved-stack probe boards, per-row `flagged` ratchet) — docs/card-parsing-and-audit-guide.md §8
scripts/audit-gx-oracle.mjs (`node scripts/audit-gx-oracle.mjs`, ~25 s) — GX-scoped oracle: every attack/ability of out/pkmn-gx-cards.json (pkmncards `is:gx`) through the same harness, per-entry executed/blind/passive/no-effect report (out/gx-oracle-audit.txt) + ratchet scripts/gx-oracle-baseline.json (design 047)
tools/ — compare-sync-logs.mjs + coin id mappings (coindl*.tsv/txt, coinmap.txt)
client/src/setup/deck-builder/ — deck builder (themes, filters, counter, sprites, wallpapers, coins) → .agent/areas/deck-builder.md
client/src/setup/netcode/ — client transport, authoritative view renderer (apply-view.js), pickers/adapters, battle log → .agent/areas/netcode.md
client/src/setup/netcode/mat-fx/ — mat cosmetic effects (D94/D103; Mega/Tera entries D118–D122[mat-fx]; evolution/devolution scenes D207, canvas stage D154) → .agent/areas/netcode.md § Mat FX
client/src/setup/netcode/mat-fx/moves/attack-sound.mjs — attack scene → sound fields (tier, contact, type) for the sampled hit (D206)
client/src/setup/netcode/mat-fx/sfx-cues.mjs + sample-bank.js + ui-cue.mjs + status-ambience.mjs + crowd.mjs + retreat-lock-watch.mjs — sampled SFX (D203, design 064): cue map, buffer bank, UI chrome cues, status loops, crowd bus
scripts/sfx/ (`pnpm sfx:import -- --src <extract dir>`) — transcodes the TCG Live SFX extract to committed client/src/assets/sfx/*.ogg + manifest.json (D203/D204); server/sfx-cache.mjs caches only hashed .ogg
scripts/fx/import-tcgl-status-fx.mjs (`pnpm fx:import-status -- --src <extract dir>`) — copies TCG Live status VFX textures, damage-counter coin and Poison/Burn badges (WebApp/assets/ui WebP) to committed client/src/assets/status-fx/, damage-counter/, status-markers/
scripts/fx/coin/ (`pnpm fx:import-coins`) and scripts/fx/deckbox/ (`pnpm fx:import-deckbox`) — import TCG Live coins (meshes, translated shaders, textures, thumbs) and all 380 deck boxes into committed client/src/assets/coins/tcgl and assets/deckbox (designs 069, 071)
scripts/tcgl-foil/ (`pnpm foil:import -- --src <extract>`, `pnpm foil:upload -- --remote r2:ptcg-foil`) — import TCG Live card foil (shaders, materials, masks) into gitignored client/src/assets/tcgl-foil/{cards,tex}; rclone to R2; r2-cors.json; foil-shot.mjs capture (design 069-tcgl-card-foil, D217)
scripts/attack-ui/ — `import-attack-ui.mjs --src <extract dir>` copies TCG Live's AttackOverlay sprites (titlebars, damage tabs, ability tag and header mask, Retreat button, GX and VSTAR bars, list frame, row tiles) to committed client/src/assets/attack-ui/; `dump-registry.py` (UnityPy) writes attack-ui.json (per-type colour/ink, VSTAR sprite names + 9-slice borders from AttackEntryAssetRegistry_AttackOverlay). index.css pins both: setup/rules/__tests__/attack-ui-assets.test.mjs
scripts/special-energy-tokens/ — `make-tokens.py <card pngs> <out> --write-client` cuts a token per Special Energy name from its card's orb (orb-circles.json, hand-checked; detect-orbs.py first pass), 2-Energy cards as two orbs, holo/reverse finish (card-refs.json) as animated SVG → client/src/assets/energy/special/ + generated move-card-bundle/special-energy-tokens.mjs; fetch-card-refs.py pulls the TCGdex art
client/src/setup/rules/card-focus.mjs — TCG Live AttackOverlay popup for your in-play Pokémon (designs 067, 074, D208, D219): CSS-3D flight from the slot to the game's focus pose, hand lowered via `.hand-lowered` on the self iframe, 500 ms click guard (D209), rows from `buildInspectorCard`, HUD Buff/Debuff/Stack/Close, TableCover backdrop; card-focus-geometry.mjs (pure: pose, flight, curves, tilt), card-focus-routing.mjs (`tapRoute`: overlay / stack view), css/card-focus.css; routed from click-events.js, Escape in keybinds.js
client/src/setup/rules/attack-options.mjs — TCG Live option rows (design 074): `buildAttackOption`, `buildAbilityOption`, `buildWeakResistBar`, type icons; skin in css/attack-options.css; pure cost/damage/effect ports in attack-ui-model.mjs
client/src/setup/rules/stack-view.mjs + stack-view-panel.mjs — TCG Live stack view (StackedCardOverlay_Landscape): carousel + info panel, css/stack-view.css; status-popup.mjs (+css) — Buff/Debuff MatchModalPopup (design 074)
client/src/setup/zones/live-zone-array.js — `liveZoneArray(user, zoneId)`: the authoritative view's cards once one is applied, else legacy getZone
client/src/setup/netcode/mat-fx/status-fx.mjs + status.js — condition apply pop / clear sparkle from TCG Live sprites; status-loop.mjs + status-loop.js — held-condition loop overlay, reconciled per card in apply-view.js `reconcileStatusLoopOverlay`; palette in client/src/css/status-fx-palette.css; status-units.mjs — Unity prefab units → card widths (tables keep E:/TCGLive_Extract/vfx_dump numbers)

## Rules engine — pure, DOM-free, headless-tested (~47,000 lines; portable to Node)
shared/engine/rules/ + shared/engine/effects/ — the pure rules modules, one line each in .agent/areas/rules-engine.md: rules-state, attack-engine, ability-combat, ability-triggers, special-energy-parse, special-conditions, trainer-effects, reveal-picks, trainer-play-conditions, tool-conditions, tool-attacks, stadium-triggers, stadium-trigger-apply, evolved-pokemon, server-energy, executor, trainer-steps, abilities, ability-step-plan, fossil, stadium-effects, damage-parser, attack-steps, attack-text, optional-cost-bonus, scaling-count, attack-markers, attack-conditions, attack-status, attack-copy, each-filter, turn-damage-bonus, rules-turnorder, turn-order-flip, turn-order-transport, baby-rule, legacy-* wording, card-classify, paradox-tags, card-markers
shared/engine/reduce.mjs — public reducer entry: `applyCommand` (shape → choice/turn gate → `validateReferences` → `validateLegality` → one `<type>Command` handler per case → post-command settles) and `undo` replay; re-exports `validateLegality`, `attackExtrasFor`. Body split by command domain into reduce/ (design 073 B, I250)
shared/engine/reduce/shared.mjs — cross-domain reducer helpers: `inPlayView`, `cardEffectiveHp`, `activeAttackMarkers`, `setGameEnded`/`isGameConcluded`/`isGameFrozen`, once-per-game and tiebreak reads, `rootsIn`
shared/engine/reduce/legality.mjs — `validateReferences` (stale view) + `validateLegality` (rules gate), `attackCostPayable`, `resolveAttacker`, attach/play/ability/once-per-game lock readers
shared/engine/reduce/attack.mjs — attack declaration: coins, Ninja Trick, declared/copied attack flows, `attackViewFor`/`attackExtrasFor` (granted, borrowed, Stadium/Tool attacks), GX/VSTAR spend; `attack` command
shared/engine/reduce/attack-damage.mjs — attack damage placement: bench damage/Thorns, target clauses and options, flat and Active-target damage, retaliation, `applyAttackTargets`
shared/engine/reduce/attack-steps.mjs — attack-time prompts and executor runs: search, discard/mill scaling, spread attaches, optional costs, `attackResumeContext`, `planAttackSteps`/`runAttackSteps`
shared/engine/reduce/attack-effect.mjs — `resolveAttackEffectPhase` (the whole attack effect phase) + `finishAttackTail`
shared/engine/reduce/knockout.mjs — `handleKnockout`, Tool on-KO effects, KO win settles, promotions, KO Energy moves, damage-counter KOs, Prize entitlement/choices; `takePrizes`/`takePrizesByIndex`/`promote`
shared/engine/reduce/turn.mjs — `resolveCheckup`, between-turns/end-of-turn effects, `advanceTurn`, `endTurnFromEffect`; `setup`/`pass`/`takeTurn`/`loadDeck`/`cardStats`
shared/engine/reduce/retreat.mjs — `computeEffectiveRetreatCost`, retreat Energy choice, `applyRetreatSwap`; `retreat` command
shared/engine/reduce/attach.mjs — `attachCard` (Energy/Tool attach and Evolution), Energy attach plan, Energy-attach and opponent-evolve triggers
shared/engine/reduce/trainer.mjs — `promoteTrainerPlay` (hand→board drop becomes playTrainer), Chaos Gym gate, Trainer turn-end/Prize-win settles; `playTrainer`/`stadium-effect`
shared/engine/reduce/ability.mjs — Call Energy, ability turn-end and outcome settles; `useAbility`/`useVStarGX`
shared/engine/reduce/board.mjs — manual board commands (move, draw, counters, conditions, zone shuffles/moves, reveal/hide, board ops), `clearFaceDownOffBoard`
shared/engine/reduce/choice.mjs — `resolveChoice`: routes a pending choice's `resumeToken.effectType` back to the domain that raised it

## Rules engine — DOM-coupled glue (NOT portable; the migration's cost centre)
client/src/setup/rules/rules-bridge.js — 3527 lines; orchestrates rules via document.dispatchEvent + HUD
client/src/setup/rules/trainer-execution.js — 2939 lines; resolves effects through synchronous UI pickers
client/src/actions/chat-buttons/chat-buttons.js — 5421 lines; attack/pass/retreat monolith

## State / zones
shared/engine/cards.mjs — pure `Card` model, `mintInstanceId`, DOM-free (replaces DOM-based Card identity); `isBasicPokemon` treats LEGEND/V-UNION/Restored/BREAK as non-Basic (30c 5.4)
shared/engine/state.mjs — pure `GameState` model (8 zones/player, neutral stadium), zone accessors, `hashState`; per-player `oncePerGame: { vstarUsed, gxUsed }` survives `advanceTurn` (rulebook 30c 1.2); `discardCardToPlayerZone` routes Prism Star discards to the Lost Zone (30c 3.5)
shared/engine/rng.mjs — seeded `mulberry32` PRNG, deterministic replay source (Invariant 6)
shared/engine/formats.mjs — deck formats ('tcg' 6 Prizes | 'build-battle' 4), `prizeCountForFormat`, `formatMismatchMessage`; `player.deckFormat` set by reduce `loadDeck` (refuses `format_mismatch`), read by setup.mjs, room.mjs rematch, client setup-deal.mjs; wire arg order in deck-constructor/deck-format-args.mjs (design 051)
shared/engine/room-format.mjs — room format propose/accept/cancel reducer `applyRoomFormatAction` (design 053); server/game/room-format-seat.mjs seat check + coin-call lock; client setup/general/room-format-view.mjs (pure) + room-format-panel.js (#roomFormatPanel)
shared/engine/view.mjs — `viewFor(state, playerId)` authoritative redacted view per player/spectator (H1, Invariant 5)
client/src/setup/zones/get-zone.js — `getZone(user, zoneId)` → { array, element, ... }; 10 zones/player, stadium neutral
shared/engine/zones/zone-hash.mjs — `hashCardList`/`hashBoardSnapshot`; `SYNC_HASH_ZONES` is 8 zones (excludes UI scratch)
shared/engine/zones/*.mjs — pure: board-snapshot, card-state, hand-sort, resolve-card-index, active-pokemon
client/src/setup/deck-constructor/card.js — `Card` class; identity is `card.image` (HTMLImageElement)
client/src/setup/deck-constructor/own-deck.mjs — `systemState.ownDeck`: the deck this player loaded (set by import.js loadDeckData on emit); leaving a room restores selfDeckData from it (I198)

## Build & Battle and Elite Trainer Box openings (designs 051–055, 057)
client/src/setup/deck-builder/core/build-battle/pack3d.mjs — pure 3D pack math: pillow shape, peel/rip/strip flight, cards out, tilt/sway, screen↔world, floor reflection bands (design 055)
client/src/initialization/document-event-listeners/sidebox/native-deck-builder-pack3d.js — WebGL pack stage (three.js, lazy `import()`), mirror layer; falls back to the DOM scene
client/src/initialization/document-event-listeners/sidebox/tabletop/ — three.js tabletop unboxing (design 073-tabletop-unboxing) on the legacy B&B stage: tabletop-scene.js mount + WebGL fallback, tabletop-app.js orchestrator, tt-*.js stage/meshes/print/audio; pure motion/layout in core/build-battle/tabletop/*.mjs
client/unboxing.html + client/src/unboxing-site/main.js — standalone `/unboxing` test bench for the tabletop (box/era/seed pickers); server/card-art-proxy.mjs — same-origin TCGdex card-image proxy for WebGL textures
client/src/setup/deck-builder/core/build-battle/box-art.generated.mjs — `BOX_ART`: every box's vendored render, booster fronts (+ measured shapes), ME cuboid faces; built by scripts/build-battle/vendor-box-art.mjs from box-art-sources.mjs (D194)
client/src/vendor/three/ — vendored three 0.185.0 (import map in index.ejs); scripts/vendor-three.mjs copies/checks it (D193)
client/src/setup/deck-builder/core/elite-trainer-box/ — Elite Trainer Box (design 057, D195): catalog, opening, collection (`ptcg-sim.collection.v1`), session (`ptcg-sim.etb.v1`), view helpers, promo rows; DOM: sidebox/native-deck-builder-etb.js (Shelf + Collection tabs)
client/src/initialization/document-event-listeners/sidebox/native-deck-builder-stage.js — the fullscreen stage both box openings play on (`createStage`)
client/src/assets/catalogs/ — deck-builder catalogs as JSON, loaded on demand (design 073): coins.json (normalize-coin-catalog.mjs), tcgl-coins.json (fx:import-coins), tcgl-sleeves.json (import-tcgl-sleeves.py), starter-decks.json (generate-starter-decks.mjs), starter-deck-catalog.json (hand-kept: names, cosmetics, Gengar/Diancie lists); loader core/catalog-loader.mjs (`loadCatalog`, `whenLoaded`, `deferredPicker`), readers coins.mjs, sleeves.mjs, starter-decks.mjs
client/src/initialization/document-event-listeners/sidebox/native-deck-builder-bb-shared.js — DOM pieces both Build & Battle flows share (box picker, box shot, unboxing mount, Pool tab); bnb-run.js is the live flow, build-battle.js the legacy one, frozen (design 073)
client/src/setup/netcode/mat-fx/coin-stage.js — TCG Live coin flips drawn with the game's own coin shaders on a lazy three.js canvas; pure math coin-stage-math.mjs, catalog tcgl-coin-catalog.mjs; host coin-flip-ceremony.js (design 069)
client/src/setup/deck-builder/core/customize-stage/ — Customize tab 3D preview of deck box, sleeve and coin (Preview All / Focused, drag-rotate); box catalog boxes.mjs; DOM picker sidebox/native-deck-builder-box-picker.js (design 071)

## Actions (~10,582 lines, ~85% DOM-coupled — every mutation goes through the DOM)
client/src/actions/move-card-bundle/ — card movement, attach, evolve; primary mutation path
client/src/actions/move-card-bundle/energy-token-assets.mjs — attached-Energy token per card: Special Energy by name (`specialEnergyTokenFor`, two-orb `energy-token-double`), else type token
client/src/actions/zones/ — deck/hand/prize/shuffle operations
client/src/actions/counters/ — damage, special condition, ability counters (DOM overlays)
client/src/actions/general/ — setup, ready, turn, reveal/hide, reset, undo
client/src/setup/foil/ — TCG Live card foil renderer: manifest (pure), pose math (pure), store (loads manifest + /api/tcgl-foil/config texture base), three.js material + view; server/tcgl-foil-config.mjs serves FOIL_TEXTURE_URL (D217)
client/src/setup/image-logic/drag.js + drag-avatar.js + drag-tilt.mjs — native HTML5 card drag/drop; the dragged card is drawn as a swinging body-level avatar (design 038, D124; physics pure in drag-tilt.mjs); a held Item/Supporter lights its board (design 046, drop-zone.mjs playsOntoBoard)

## Tests & tooling
**/__tests__/*.test.mjs — plain `node --test`, no jsdom; `pnpm test` runs them all (~6900); run one file with `node --test <path>`
scripts/prune-merged-branches.mjs — dry-run/delete remote branches fully contained in origin/main; keeps main, the current branch and open-PR refs (via gh, else --keep); needs local push rights (test: scripts/__tests__/prune-merged-branches.test.mjs)
scripts/harness-check.mjs — `pnpm harness:check`: measures every .agent budget in workflows/maintain.md plus the 30-commit maintain trigger; exit 1 = OVER (test: scripts/__tests__/harness-check.test.mjs)
scripts/e2e/two-player-sync-test.mjs — Playwright two-browser sync harness (legacy mode: needs a
  `SERVER_AUTHORITATIVE=0` server on PTCG_URL, `pnpm test:2p`)
scripts/e2e/flip-gate-test.mjs — Playwright two-browser full game under SERVER_AUTHORITATIVE=1: design 002's
  3.12 flip gate (`pnpm test:flip`; needs a hand-started authoritative server on PTCG_URL)
scripts/e2e/test-card-inspector-e2e.mjs — Playwright two-browser design-013/067 card-inspector + card-focus gate
  (`pnpm test:inspector`; needs a hand-started authoritative server on PTCG_URL). Step 9 clicks the
  attack panel with REAL input (locator.click), so it catches pointer-capture regressions el.click() hides
scripts/e2e/*-test.mjs, explore-ui.mjs, record-legacy-2p-fixture.mjs — the other hand-run Playwright/jsdom harnesses (rooms, spectator, public lobby, Build & Battle, coin flip, opening-coin `pnpm test:opening-coin`, reset `pnpm test:reset-choice`, `pnpm test:spectator`); `record-legacy-2p-fixture.mjs` refreshes the replay-harness fixture
bot/bot.mjs, bot/heuristic-scorer.mjs — design 004 slice 5: pure-Node playtest bot (never-crash
  scaffold + greedy scorer), driven by scripts/e2e/playtest-bot.mjs via __ptcg observe/options/act
scripts/e2e/playtest-bot.mjs — design 004 slice 6: the playtest runner. Two Playwright pages, bot vs.
  bot, either netcode (`node server/server.js` on :4000, then `node scripts/e2e/playtest-bot.mjs
  --games=N --seed=S`); dumps a replayable trace to out/playtest/ on any failure. Found a real bug
  on first live run (I30, ISSUES.md) — see design 004 slice 6's Acceptance note.

