# 051: Build & Battle game mode (Phantasmal Flames box)
Status: draft — awaiting user approval (feature.md phase 2 gate)
Date: 2026-09-28 · Session: S328

## Problem
The simulator only plays 60-card Standard decks built from the whole card pool. The user wants a
"Build & Battle" mode: open a Phantasmal Flames Build & Battle Box (one of four 40-card decks at
1/4 each, plus four Phantasmal Flames booster packs), build a 40-card deck from exactly those cards,
then play it with the Prerelease rules (4 Prizes). It runs in its own browser tab, like the deck
builder (design 050).

Box facts (pokemon.com news "Get a Pokémon TCG: Mega Evolution—Phantasmal Flames Build & Battle Box
Early", read 2026-09-28): four Phantasmal Flames booster packs; a 40-card ready-to-play deck "featuring
key cards from current and prior sets"; one of four foil promos — Ceruledge MEP 14, Zacian MEP 15,
Flygon MEP 16, Toxtricity MEP 17 (TCGdex ids mep-014…mep-017, verified live); Prerelease format =
"a 40-card deck with four Prize cards set aside at the start of play". Release 2025-11-14.

## Constraints
- No build step, no new dependency (PROJECT.md). Same-origin tabs, validated `postMessage` (D183).
- Builder state lives in localStorage; the game tab never writes deck cards (D183). Both tabs share
  the library key `ptcg-sim.deck-library.v1`.
- Rules engine is pure and DOM-free; every engine/state change ships with a failing-first test
  (CLAUDE.md § Code standard). Prize count today is a literal `6` in `shared/engine/setup.mjs:104`
  and a default in `client/src/actions/general/setup-deal.mjs:2`; deck size 60 is checked only by
  the deck builder (`deck-validation.mjs:32-36`), never by the server.
- Card data is looked up, never recalled (CLAUDE.md rule 7). Set data comes from TCGdex through the
  proxy (D164) and is baked by a generator script the way starter decks are (`scripts/generate-starter-decks.mjs`).
- Card text/rulings that mention "6 Prize cards" (e.g. the `prizesRemaining==6` bonus read at
  `shared/engine/effects/executor.mjs:876`) stay as printed: with 4 Prizes they simply never apply.
  That is the correct Prerelease ruling, not a bug.
- Small private scale (PROJECT.md): pack opening is client-side, seeded, reproducible; no anti-cheat.

## Current state (read this session)
- `server/server.js:229-237` — `/` and `/deck-builder` both render `index` (the latter with
  `builderWindow: true`); `client/index.ejs:4-5` sets the title from it and `body.deck-builder-window`.
- `client/src/setup/deck-builder/core/builder-window.mjs` — `resolveBuilderRole(pathname)` →
  `'editor'` only for `/deck-builder`; `buildBuilderMessage` / `parseBuilderMessage` with the
  `load-deck { target, deckId, rows }` payload (rows = `[qty, name, type, url, number?, set?, tcgId?]`).
- `client/src/initialization/document-event-listeners/sidebox/deck-builder-window.js` —
  `openDeckBuilderWindow()` (named tab `ptcgDeckBuilder`, navigate only when blank),
  `installDeckBuilderHost({ apply, getHostState })`, `connectToHost()`.
- `client/src/initialization/document-event-listeners/sidebox/native-deck-builder.js` — the builder
  controller: `initializeNativeDeckBuilder({ role })`, `gameLink` seam (`createLocalGameLink` /
  `createRemoteGameLink` :163-210), `deckToSimRows` :101-124, `loadCurrentDeck` :1307-1321,
  `validateDeck(deck, detectDeckFormat(deck))` :1185, `addCard` call sites :474/:905/:1171/:1291,
  pane tabs Search/Browse/Customize :451-453, `applyBuilderMessage` :1615-1647 (host side:
  `load-deck` → `deckLibrary.setActiveDeck` + `loadDeckData`), `persistLastUsedSession` :445,
  `restoreLastUsedDeckImpl` :1655 (runs on room join, `socket-event-listeners.js:356`).
- `client/src/setup/deck-constructor/import.js:18-44` — `loadDeckData(user, deckData, emit)`:
  sets `systemState.*DeckData`, chat line "<user> loaded deck", `processAction(user, emit,
  'loadDeckData', [deckData])`. `exchange-data.js:9-17` — `exchangeData(user, username, deckData,
  cardBack, coachingMode, callback, matId, emit)` (multiplayer room join).
- `server/server.js:936-960` — `pushAction` handler: `extractDeckData(action, parameters)`
  (`server/game/shadow.mjs:83-94`, `loadDeckData` → `parameters[0]`, `exchangeData` →
  `parameters[1]`) → `gameRoom.handleCommand(socket.id, { type: 'loadDeck', payload: { deckData } })`
  → `dealOpeningHandsIfReady`. `shared/engine/reduce.mjs:10058-10107` — `case 'loadDeck'` mints
  cards, sets `player.deckList`, emits `deckLoaded`. `reduce.mjs:8654-8660` — `case 'setup'` →
  `setupGame(draft, { firstPlayerId, rng })`. `shared/engine/setup.mjs:67-111` — shuffles, deals
  `Math.min(7, …)` hand and `Math.min(6, …)` prizes; `firstPrizeWins` option is the precedent for a
  setup option. `server/game/room.mjs:571-625` — `resetGame` rebuilds state with `createGameState`
  and replays `loadDeck { deckData }` per kept player. `shared/engine/state.mjs:66-90` —
  `createGameState({ gameId, seed, players, rulesEnabled })`. `shared/engine/view.mjs:191` — the
  per-player view carries `rulesEnabled`.
- Win check `reduce.mjs:1656` (`prizes.length <= owed`) and every prize effect (`attack-steps.mjs`,
  `trainer-steps.mjs`) read `prizes.length`; nothing else assumes 6. `client/src/css/self-containers.css:55-59,590-603`
  sizes `#prizes` by percentages; `prize-fan.mjs` has no literal 6 (grep).
- `client/src/actions/zones/hand-actions.js:14-40` — legacy (rules-off) deal: `setupDealPlan(count)`.
- `client/src/setup/deck-builder/core/deck-validation.mjs` — `DECK_FORMATS {POCKET, TCG}`,
  `TCG_DECK_RULES {deckSize 60, maxCopiesPerCard 4}`, `validateDeck(decklist, selectedFormat)` →
  `{ isValid, errors, totalCards, requiredCards, formatName, selectedFormat }`; Basic-Pokémon,
  copy-limit (Basic Energy exempt), ACE SPEC/Radiant/Prism checks.
- `client/src/setup/deck-builder/core/deck-library.mjs` — record `{ id, name, createdAt, updatedAt,
  cards, sleeveId, coinId, matId, wallpaperId, sprites }`; `createDeckInLibrary(library, name, cards,
  now, options)`; `parseLibrary` normalizes. `deck-state.mjs` — `addCard(deck, card)` /
  `removeCard(deck, card)` on the `{ [name]: { cards: [{ data, count }], totalCount } }` map.
- `client/src/setup/deck-builder/core/set-browser.mjs:1515-1579` — `STARTER_DECK_CATALOG` +
  `getStarterDecks()` (baked `starter-decks.generated.mjs`); seeded into the library by
  `native-deck-builder-library.js:114-180` (`seedStarterDecks`).
- `scripts/generate-starter-decks.mjs` — `SET_MAP` (printed code → TCGdex id), `TRAINER_IDS`,
  `parseLine("4 Charcadet PFL 19" | "3 Hilda")`, `normalizeCard(card, qty)`, fetch by id from
  TCGdex. `core/modern-energy.mjs` — `buildModernBasicEnergy('Basic Fire Energy', qty)` → SVE row.
- `shared/engine/rng.mjs:38` — `createRng(seed)` → `{ next, int(n), shuffle(array) }`, pure.
- TCGdex live check (2026-09-28): `sets/me02` = Phantasmal Flames, 130 cards (94 official + 36 secret),
  per-card `rarity` only on `/cards/{id}` (not on the set listing). Rarity tally: Common 43,
  Uncommon 31, Rare 10, Double rare 10, Ultra Rare 17, Illustration rare 13, Special illustration
  rare 5, Mega Hyper Rare 1. Set-level `cardCount.reverse` = 84 = Common+Uncommon+Rare.
- Existing bug found while reading (fix pinned in slice 1, flag in commit): `generate-starter-decks.mjs`
  `TRAINER_IDS` maps `Fighting Gong` → `me01-117` (that is Forest of Vitality; Fighting Gong is
  `me01-116`), `Firebreather` → `me02-088` (Dizzying Valley; Firebreather is `me02-089`) and
  `Academy at Night` → `me02-093` (Sacred Charm). `starter-decks.generated.mjs` therefore ships
  those three wrong cards (grep confirms one row each).

## Options
1. **Where the mode lives.** A: a third builder-window mode at `/build-and-battle` (same `index.ejs`,
   builder role, tab named `ptcgBuildBattle`) — reuses the deck pane, library, sleeves/coins/mats,
   Play/`load-deck` seam. B: a panel inside the game tab's sidebox — cramped, and design 050 just
   moved building out of it. C: a separate light page — needs decoupling design 050 rejected.
   **Pick A.** The user asked for a separate tab; A is the 050 architecture with a mode switch.
2. **Set data for pack opening.** A: bake `me02` (130 records with rarity/category/stage/types/hp)
   into a generated module via a script like `generate-starter-decks.mjs`. B: fetch 130 card details
   through the proxy on first open (IndexedDB cached after). **Pick A**: deterministic, testable
   offline, ~55 KB, and the four decks need baking anyway. B is the fallback for future boxes only if
   size becomes a problem.
3. **Randomness.** A: `Math.random`. B: `createRng(seed)` from the engine, seed shown in the UI as
   "Box #<seed>" and accepted as `?seed=<n>`. **Pick B**: a reload restores the same box, tests are
   exact, e2e is deterministic, two friends can open the same box.
4. **Pack composition model.** A: uniform random 10 of 130. B: slot model matching the printed
   structure and published pull rates. **Pick B** (table under Design § Pack model). Rates from
   tcgprotectors.com "Phantasmal Flames Pull Rates: 10,000 Packs Analyzed" (Double Rare 20.1%,
   Ultra Rare 8.06%, Illustration Rare 10.97%, Special Illustration Rare 1.25%, Mega Hyper Rare
   0.079%, one Reverse Holo guaranteed, 10 cards) cross-checked with pokebeach.com's "Illustration
   Rare in the second Reverse Holo slot ~11%, SIR ~1%". Physical packs also hold one Basic Energy
   and a code card; neither is simulated because Basic Energy is unlimited in this mode (option 6).
5. **Getting "4 Prizes" into the engine.** A: infer from deck size (40 → 4) — silent, a 41-card
   deck would flip to 6. B: an explicit `format` (`'tcg' | 'build-battle'`) carried on `load-deck` →
   `loadDeckData` → `pushAction` → the `loadDeck` command → `player.deckFormat`; `setupGame` derives
   the prize count. C: a new room-options socket event — a second channel to keep consistent
   with rematch/replay. **Pick B**: it rides the existing deck path, lands in `commandLog` (undo
   replay and `resetGame` re-send it), and a mismatch is detected at the second `loadDeck`.
6. **Basic Energy supply.** Prerelease events supply Basic Energy freely; the box deck's Energy is
   fixed but players may swap counts. **Pick: unlimited Basic Energy** (the eight SVE prints via
   `buildModernBasicEnergy`), never counted against the pool, still counted toward 40.
7. **Saving the built deck.** A: keep it only in the mode's own storage and Play with
   `deckId: null`. B: save it as a library deck with a new record field `format`. **Pick B**: the
   game tab's restore-on-room-join (`restoreLastUsedDeckImpl`) reads the last-used library deck; with
   A a room join after Play would overwrite the 40-card deck with the last 60-card one. The standard
   builder then shows the deck with a 40 counter and a "Build & Battle" badge; it does not enforce the
   pool there (documented limitation).
8. **Format mismatch between two players.** A: last load wins. B: the second `loadDeck` with a
   different format is rejected with `error: 'format_mismatch'` and a chat line on both sides.
   **Pick B**: never silently deal 6 Prizes to a 40-card deck.
9. **Deck lists.** The four 40-card lists were gathered from web-search snippets of the PokéBeach
   forum thread "Phantasmal Flames Build & Battle Box decks" (thread 156492) — Bulbapedia and
   PokéBeach return 403 to this environment, so the lists are NOT verified against a page. Each sums
   to 40. The generator pins printings by the rule "Phantasmal Flames regular print if the card is in
   me02, else the newest Standard-legal regular print", verified against TCGdex live 2026-09-28.
   **Slice 1's first step is to verify the four lists against Bulbapedia** (the user, or a session
   with browser access) and correct `DECK_SOURCES` before generating. Decided for the user: the promo
   is one of the deck's copies of its Pokémon (real boxes ship the promo inside the 40).
10. **Reveal FX.** A: mat-fx scene. B: CSS-only flip with a stagger. **Pick B** now; a house-style
    scene (fx-designer) is a follow-up if wanted.

## Design
### Routes, roles, window
- `server/server.js`: `GET /build-and-battle` (and the trailing-slash redirect, mirroring
  `/deck-builder`) renders `index` with `{ builderWindow: true, builderMode: 'build-battle' }`.
  `client/index.ejs`: `<body class="deck-builder-window build-battle-window">`, title
  "Build & Battle | PTCG-sim".
- `builder-window.mjs`: `BUILD_BATTLE_WINDOW_NAME = 'ptcgBuildBattle'`,
  `BUILD_BATTLE_WINDOW_PATH = '/build-and-battle'`; `resolveBuilderRole` returns `'editor'` for both
  paths; new `resolveBuilderMode(pathname) -> 'standard' | 'build-battle'`. `load-deck` payload
  gains optional `format: 'tcg' | 'build-battle'` (absent → `'tcg'`; any other value → message
  rejected). `DECK_FORMAT_VALUES = ['tcg', 'build-battle']` exported for both validators.
- `deck-builder-window.js`: `openBuildBattleWindow()` — same body as `openDeckBuilderWindow` with the
  B&B name/path. Slim Deck tab (`client/index.ejs:193-203`, `import-deck.js:65-67`) gets a second
  button `#openBuildBattleButton` "Build & Battle" sharing the pop-up-blocked text.

### Data (generated once, committed)
- `scripts/lib/decklist-lines.mjs` — extracted from `generate-starter-decks.mjs`: `SET_MAP` (+ `SSP: 'sv08'`,
  `MEP: 'mep'`), `TRAINER_IDS` (with the three ids corrected: `Fighting Gong: 'me01-116'`,
  `Firebreather: 'me02-089'`, `Academy at Night: 'me02-093'` → re-verify by name in the script:
  the fetcher throws if `card.name !== expected name`), `parseLine`, `normalizeCard`, `fetchCard`,
  `resolveDeck`. `generate-starter-decks.mjs` imports it; `starter-decks.generated.mjs` is regenerated
  (the three wrong rows become the intended cards).
- `scripts/generate-build-battle-box.mjs` writes
  `client/src/setup/deck-builder/core/build-battle/build-battle.generated.mjs`:
  `export const BUILD_BATTLE_SET_CARDS = { me02: SetCard[] }` where
  `SetCard = { id, name, supertype, localId, image, images:{small,large}, set:{id,name,releaseDate},
  rarity, category, stage|null, types:string[], hp|null }` (`normalizeCard` + the five extra
  fields), 130 rows sorted by localId; and `export const BUILD_BATTLE_DECKS = { 'phantasmal-flames':
  { ceruledge: DeckRow[], zacian, flygon, toxtricity } }` with `DeckRow = SetCard-shape + qty`.
  `DECK_SOURCES` (line format as the starter script; PFL = me02, MEG = me01, promo lines `MEP n`):
  - ceruledge (40): `4 Charcadet PFL 19`, `1 Ceruledge MEP 14`, `3 Ceruledge PFL 20`, `1 Moltres PFL 14`,
    `3 Firebreather`, `2 Lillie's Determination`, `3 Hilda`, `4 Energy Retrieval`, `2 Ultra Ball`,
    `1 Switch`, `16 Basic Fire Energy`.
  - flygon (40): `4 Trapinch PFL 51`, `2 Vibrava PFL 52`, `1 Flygon MEP 16`, `2 Flygon PFL 53`,
    `2 Gligar PFL 49`, `2 Gliscor PFL 50`, `2 Hilda`, `2 Dawn`, `3 Lillie's Determination`,
    `2 Rare Candy`, `2 Fighting Gong`, `2 Premium Power Pro`, `2 Dusk Ball`, `1 Switch`,
    `11 Basic Fighting Energy`.
  - zacian (40): `1 Zacian MEP 15`, `2 Zacian PFL 45`, `4 Milcery PFL 43`, `4 Alcremie PFL 44`,
    `1 Mimikyu PFL 42`, `3 Lillie's Determination`, `2 Hilda`, `2 Brock's Scouting`,
    `1 Iris's Fighting Spirit`, `2 Drayton`, `1 Switch`, `2 Ultra Ball`, `2 Wondrous Patch`,
    `13 Basic Psychic Energy`.
  - toxtricity (40): `2 Toxel PFL 67`, `1 Toxtricity MEP 17`, `1 Toxtricity PFL 68`, `2 Absol PFL 63`,
    `3 Sandile PFL 64`, `2 Krokorok PFL 65`, `3 Krookodile PFL 66`, `3 Grimsley's Move`,
    `3 Lillie's Determination`, `2 Brock's Scouting`, `2 Rare Candy`, `2 Dusk Ball`, `1 Switch`,
    `1 Energy Recycler`, `12 Basic Darkness Energy`.
  - Trainer ids (TCGdex live 2026-09-28): Firebreather me02-089, Lillie's Determination me01-119,
    Hilda sv10.5b-084, Energy Retrieval sv10.5b-082, Ultra Ball me01-131, Switch me01-130, Dawn
    me02-087, Rare Candy me01-125, Fighting Gong me01-116, Premium Power Pro me01-124, Dusk Ball
    sv08-175, Brock's Scouting sv09-146, Iris's Fighting Spirit sv09-149, Drayton sv08-174,
    Wondrous Patch me02-094, Grimsley's Move me02-090, Energy Recycler sv10-164.
- `core/build-battle/box-catalog.mjs` (pure, hand-kept):
  `BUILD_BATTLE_BOXES = [{ key: 'phantasmal-flames', name: 'Phantasmal Flames Build & Battle Box',
  setId: 'me02', packCount: 4, packModel: ME_PACK_MODEL, decks: [
  { key:'ceruledge', name:'Ceruledge', promoId:'mep-014', energy:'Basic Fire Energy', sprites:['ceruledge','charcadet'] },
  { key:'zacian', name:'Zacian', promoId:'mep-015', energy:'Basic Psychic Energy', sprites:['zacian','alcremie'] },
  { key:'flygon', name:'Flygon', promoId:'mep-016', energy:'Basic Fighting Energy', sprites:['flygon','gliscor'] },
  { key:'toxtricity', name:'Toxtricity', promoId:'mep-017', energy:'Basic Darkness Energy', sprites:['toxtricity','krookodile'] } ] }]`;
  `getBuildBattleBox(key)`; `BASIC_ENERGY_LABELS` = the eight `Basic <Type> Energy` labels.
  Sprite slugs must exist in the sprite catalog (test, as `starter-deck-sprites.test.mjs` does).

### Pack model (`core/build-battle/pack-opening.mjs`, pure)
`ME_PACK_MODEL = { size: 10, slots: [
  { pools: ['Common'], count: 4 },
  { pools: ['Uncommon'], count: 3 },
  { count: 1, table: [['reverse', 1]] },
  { count: 1, table: [['Illustration rare', 0.1097], ['Special illustration rare', 0.0125], ['reverse', 0.8778]] },
  { count: 1, table: [['Double rare', 0.201], ['Ultra Rare', 0.0806], ['Mega Hyper Rare', 0.0008], ['Rare', 0.7176]] } ] }`.
`'reverse'` = union of Common, Uncommon, Rare. Table weights are normalized by their sum.
- `openPack({ cards, packModel, rng }) -> SetCard[]` (length `size`): per slot, per draw, pick the
  rarity (uniform within `pools`, or weighted by `table` using `rng.next()`), then `rng.int(n)` over
  the pool minus ids already in this pack; an empty candidate pool falls back to `'Rare'`, then to
  the whole set. No duplicate ids inside one pack.
- `openBox({ box, cards, rng }) -> { deckKey, packs: string[][] }`: `deckKey = box.decks[rng.int(4)].key`,
  then `packCount` packs of ids, in that RNG order (deck first, then packs, so a seed is one box).
- `poolFromBox({ box, decks, cards, opened }) -> PoolEntry[]` where `PoolEntry = { card: SetCard|DeckRow,
  count }` merged by card id: deck rows (their qty) + every pack card (+1 each); Basic Energy rows
  from the deck are dropped (unlimited supply, option 6).

### Session (`core/build-battle/build-battle-session.mjs`, pure)
- `BUILD_BATTLE_STORAGE_KEY = 'ptcg-sim.build-battle.v1'`;
  `Session = { version: 1, boxKey, seed: number, deckKey, packs: string[][], openedPacks: number,
  deckId: string|null, createdAt }`.
- `createSession({ boxKey, seed, deckKey, packs, now })`, `parseSession(json) -> Session|null`
  (rejects wrong version, unknown boxKey/deckKey, pack ids not in the set, `openedPacks` outside
  0..packCount), `saveSession(storage, session)` / `loadSession(storage)` / `clearSession(storage)`
  — every storage call in try/catch; a throwing storage means "memory only" (the controller shows the
  banner "Your box will not survive a reload").
- `parseSeed(value) -> number|null`: integer 0..2^31-1 from `?seed=`; anything else → null →
  `crypto.getRandomValues` 31-bit seed.
- `validatePoolDeck(deck, pool) -> string[]`: for every non-Basic-Energy variant (`isBasicEnergy` from
  `card-classify.mjs`), `count` ≤ pool count for that id, else "Sandile: 4 in deck, 3 in your pool";
  a card id absent from the pool → "Charizard ex is not in your pool".
- `canAddFromPool(deck, pool, card) -> boolean` (Basic Energy always true).

### Deck format (`deck-validation.mjs`, `deck-library.mjs`, `shared/engine/formats.mjs`)
- `shared/engine/formats.mjs` (new, pure): `DECK_FORMAT_TCG = 'tcg'`, `DECK_FORMAT_BUILD_BATTLE =
  'build-battle'`, `isDeckFormat(v)`, `PRIZE_COUNT_BY_FORMAT = { tcg: 6, 'build-battle': 4 }`,
  `OPENING_HAND_SIZE = 7`, `prizeCountForFormat(format) -> 6|4` (unknown → 6).
- `deck-validation.mjs`: `DECK_FORMATS.BUILD_BATTLE = 'build-battle'`; `BUILD_BATTLE_DECK_RULES =
  { formatName: 'Build & Battle', deckSize: { min: 40, max: 40 }, maxCopiesPerCard: 4 }`; the
  Pocket/TCG pool-mixing check treats `'build-battle'` like TCG. `detectDeckFormat` unchanged.
- `deck-library.mjs`: record field `format` (`'tcg'` default; `parseLibrary` coerces anything else
  to `'tcg'`); `createDeckInLibrary(..., options.format)`; `getDeckFormat(library, deckId)`.
  `native-deck-builder-library.js` exposes `getActiveDeckFormat(target)`;
  `native-deck-builder.js:1185` becomes `validateDeck(deck, deckLibrary?.getActiveDeckFormat?.(currentLoadTarget) || detectDeckFormat(deck))`
  and `deckToSimRows` is unchanged. The library list shows a "B&B 40" badge for such records.

### Engine and server
- `shared/engine/state.mjs`: player records gain `deckFormat: 'tcg'` (also in `resetGame`'s rebuilt
  player and `addPlayer`). `view.mjs` adds `deckFormat` per player next to `rulesEnabled`.
- `reduce.mjs case 'loadDeck'`: `const format = isDeckFormat(payload.format) ? payload.format : 'tcg'`;
  if any OTHER player has `deckList.length > 0` and `deckFormat !== format` → return the command
  error `'format_mismatch'` in the same shape `applyCommand` uses for its other refusals (no state
  change, no event); else set `player.deckFormat = format`, and `deckLoaded` event gains `format`.
- `setup.mjs setupGame`: `const prizeCount = Math.min(prizeCountForFormat(player.deckFormat), deck.length)`;
  `OPENING_HAND_SIZE` replaces the literal 7. The comment "deal 7 hand cards and 6 prize cards" is
  rewritten.
- `room.mjs resetGame`: `kept[].deckFormat = player.deckFormat`; the replayed `loadDeck` payload is
  `{ deckData, format }`.
- `server/game/shadow.mjs`: `extractDeckFormat(action, parameters) -> 'tcg'|'build-battle'`:
  `loadDeckData` → `parameters[1]`, `exchangeData` → `parameters[6]` (appended after `matId` in the
  wire list `[username, deckData, cardBack, coachingMode, callback, matId]`), non-string/unknown → `'tcg'`. `server.js:941` passes `payload: { deckData, format }`; a
  `format_mismatch` result emits `chat` announcement to the room: "<username>'s deck is
  <Build & Battle (40 cards, 4 Prizes) | Standard (60 cards, 6 Prizes)>; both players must use the
  same format" (exact text pinned in slice 3) and does not deal.
- Client legacy path: `setup-deal.mjs` `setupDealPlan(deckCount, { format = 'tcg' })` → `prizes =
  Math.min(prizeCountForFormat(format), deckCount)`; `hand-actions.js` passes
  `systemState.deckFormat[user]`.
- Client: `systemState.deckFormat = { self: 'tcg', opp: 'tcg' }`; `loadDeckData(user, deckData, emit,
  { format = 'tcg' } = {})` sets it, chat line becomes "<user> loaded deck (Build & Battle: 40 cards,
  4 Prizes)" for the B&B format, and `processAction(user, emit, 'loadDeckData', [deckData, format])`.
  `exchangeData(..., emit, format = 'tcg')` takes the format as a 9th function argument, sends it as
  the 7th wire parameter (after `matId`) and sets `systemState.deckFormat.opp` on receipt. Host `applyBuilderMessage('load-deck')` forwards
  `payload.format`. Leaving a room keeps `deckFormat.self` (I198 governs the deck itself).

### Builder-tab controller (mode `'build-battle'`)
`initializeNativeDeckBuilder({ role, mode })`; `mode` from `resolveBuilderMode(location.pathname)`.
In B&B mode the left pane's Search and Browse tabs are hidden; two new tabs render into the same
pane: **Box** (`#buildBattleBoxPanel`) and **Pool** (`#buildBattlePoolPanel`); Customize stays.
Flow (`native-deck-builder-build-battle.js`, DOM glue, ~1 file, imports the pure modules above):
1. Boot: `loadSession`; none → Box tab shows the sealed box with "Open box" (`#buildBattleOpenBox`)
   and the seed input prefilled from `?seed=` (`#buildBattleSeed`, readonly once opened).
2. Open: `rng = createRng(seed)`, `openBox`, `createSession`, `saveSession`; create the library deck
   `"B&B <Deck name> #<seed>"` with the box deck's rows (`format: 'build-battle'`, sleeve/coin/mat null,
   `sprites` from the catalog), bind it as the active deck for `currentLoadTarget` and load it into
   the editor (`deck` map). Header line: "<Box name> · <Deck name> deck · Box #<seed>".
3. Reveal: the deck card shows the promo image (`promoId`) and the deck name; the four packs are
   `button.bb-pack` rows; clicking one (or "Open all") flips its ten `.bb-pack-card` face-up with a
   60 ms stagger (CSS `rotateY`, no mat-fx) and bumps `session.openedPacks` (`saveSession`). Opening
   is cosmetic only: the pool is fixed at box open.
4. Build: the Pool tab renders `poolFromBox` sorted by localId (Pokémon → Trainer → Energy groups
   as the result grid does) with a "n left" badge = pool count − deck count; click → `addCard` when
   `canAddFromPool`, else status "Only 3 Sandile in your pool"; right-click/remove as today. A
   fixed row of the eight Basic Energy tiles (∞ badge) uses `buildModernBasicEnergy(label, 1)`.
   The deck pane is the existing one; the counter reads "x / 40" via `validateDeck(deck,
   'build-battle')` plus `validatePoolDeck` errors appended; Play is disabled while either reports
   errors (tooltip = first error). Autosave to the bound library deck as today.
5. Play: `gameLink.loadDeck(target, rows, deckId, { format: 'build-battle' })` → `load-deck` message
   with `format`; then `play`; then `window.close()` as the standard builder does.
6. "New box" (`#buildBattleNewBox`): `confirm("Discard this pool and open a new box? Your built deck
   stays in My Decks.")` → `clearSession`, fresh seed, back to step 1. The old library deck is kept.
7. No opener: the existing banner and disabled Play; box opening and building still work.
Two players: each runs their own tab and box; formats meet at `loadDeck` (option 8).

### CSS
`client/src/css/deck-builder-build-battle.css`, scoped under `.db-live.build-battle-window` (token
block from `deck-builder-live.css`, no `!important`): sealed box card, pack rows, the flip, the
"n left" / ∞ badges, the disabled-Play tooltip. Phone width: pack cards wrap 5 per row.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | localStorage missing / throws (private mode) | session kept in memory; banner "Your box will not survive a reload"; building and Play work | [ ] |
| 2 | stored session malformed / unknown boxKey / deckKey / card id not in set / version ≠ 1 | `parseSession` → null; UI shows the sealed box; nothing crashes | [ ] |
| 3 | `?seed=` invalid (`abc`, `-1`, `2^31`, empty) | ignored; random seed | [ ] |
| 4 | same seed twice | identical deckKey and packs (bit-for-bit) | [ ] |
| 5 | weighted table sums ≠ 1 | normalized by total weight; 0-weight rows never picked | [ ] |
| 6 | rarity pool exhausted inside a pack (synthetic 3-card set) | falls back to Rare, then whole set; never a duplicate id within a pack; never throws | [ ] |
| 7 | me02 real data: 4 packs × 10 | every pack: 4 Common, 3 Uncommon, slot 8 ∈ reverse pool, slot 9 ∈ IR/SIR/reverse, slot 10 ∈ DR/UR/MHR/Rare; 10 distinct ids | [ ] |
| 8 | deck key distribution | 4000 seeds → each deck within 25% ± 3% | [ ] |
| 9 | Open box double-clicked | second click no-op while a session exists | [ ] |
| 10 | add beyond pool count | refused, status names the card and counts; deck unchanged | [ ] |
| 11 | 4-copy rule across promo + set print (1 mep-014 + 3 me02-020 ok; 5 Ceruledge) | ok / error "Ceruledge has 5 copies (max 4)" | [ ] |
| 12 | Basic Energy 16 copies, not in pool | valid, counted toward 40, never against the pool | [ ] |
| 13 | 39 / 40 / 41 cards | Play disabled / enabled / disabled; counter "x / 40" | [ ] |
| 14 | no Basic Pokémon after edits | error from `validateDeck`; Play disabled | [ ] |
| 15 | `load-deck` with `format` missing / `'tcg'` / `'build-battle'` / `'pocket'` | tcg / tcg / build-battle / rejected | [ ] |
| 16 | engine: 40-card deck, format build-battle | setup deals 7 hand + 4 prizes, 29 left in deck; win at 4 prizes taken | [ ] |
| 17 | engine: 60-card deck, format tcg (regression) | 7 + 6, unchanged events | [ ] |
| 18 | engine: deck of 3 cards, build-battle | prizes = 3 (min), as today with 6 | [ ] |
| 19 | second player loads a differing format | `format_mismatch`, no state change, first deck intact, chat line both sides, no deal | [ ] |
| 20 | mismatch then the second player reloads a matching deck | accepted; deal proceeds when both ready | [ ] |
| 21 | rematch (`resetGame`) after a B&B game | replayed `loadDeck` carries the format; 4 prizes again | [ ] |
| 22 | undo replay through `commandLog` | `loadDeck` payload includes `format`; replay yields 4 prizes | [ ] |
| 23 | legacy (rules off) deal with format build-battle | `setupDealPlan` → 4 prizes | [ ] |
| 24 | room join after Play (restore-on-join) | restore loads the B&B library deck with its format (last-used deck id), not a 60-card deck | [ ] |
| 25 | standard builder opens a B&B library deck | counter "x / 40", badge; pool not enforced (documented) | [ ] |
| 26 | New box with an existing built deck | confirm; on yes the old library deck stays, new session; on no nothing changes | [ ] |
| 27 | builder tab opened directly (no opener) | banner, Play disabled, box + building work | [ ] |
| 28 | pop-up blocked from the slim Deck tab | same blocked message as the deck builder button | [ ] |
| 29 | prize zone with 4 cards | renders and fans (design 045) with 4; prize picker offers 4 | [ ] e2e |
| 30 | card text "if you have exactly 6 Prize cards" under 4 prizes | never applies (as printed) — struck as correct behavior, noted in docs | [x] reasoning |
| 31 | generated data drift (TCGdex renames a card) | generator throws when `card.name` ≠ the decklist name; the committed module is the truth until regenerated | [ ] |
| 32 | starter-deck id fix | regenerated `starter-decks.generated.mjs` contains Fighting Gong, Firebreather, Academy at Night and none of Forest of Vitality / Dizzying Valley / Sacred Charm | [ ] |

## Test plan
Unit (`node --test`, no DOM): `build-battle/__tests__/pack-opening.test.mjs` (rows 4–8 on the real
me02 data + a synthetic set), `build-battle-session.test.mjs` (rows 1–3, 9–12 via a throwing/fake
storage), `deck-validation.test.mjs` (+ rows 11–14 for the new format), `deck-library.test.mjs`
(format field round-trip, row 25), `builder-window.test.mjs` (row 15), `box-catalog.test.mjs`
(130 rows, exact rarity tally, 4 × 40, promo ids, every sprite slug in the catalog, row 32),
`shared/engine/__tests__/setup.test.mjs` (+ rows 16–18), `formats.test.mjs`,
`server/game/__tests__/room.test.mjs` (+ rows 19–22), `client/src/actions/general/__tests__/setup-deal.test.mjs` (row 23).
Integration: `scripts/generate-build-battle-box.mjs --check` re-fetches and diffs against the
committed module (opt-in, `pnpm test:live` group).
E2E by hand (browser pane, `?seed=42`): Deck tab → Build & Battle → open box → open 4 packs → build to
40 → Play → Solo game shows 4 prizes; then two tabs in one room with one Standard deck → mismatch
chat line; both B&B → deal with 4 prizes each. Record the observations in the design.

## Migration / rollout
No migration: library records without `format` read as `'tcg'`; `load-deck` without `format` is
`'tcg'`; `loadDeck` without `payload.format` is `'tcg'`, so an older client against a newer server
(and the reverse) plays Standard as before. Revert path: revert the slices' commits; the only
persisted artifacts are `ptcg-sim.build-battle.v1` (ignored by older code) and library decks with
`format: 'build-battle'` (older code shows them as 40/60 invalid decks, nothing breaks).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Data | create `scripts/lib/decklist-lines.mjs`, `scripts/generate-build-battle-box.mjs`, `core/build-battle/box-catalog.mjs`, `core/build-battle/build-battle.generated.mjs`, `core/build-battle/__tests__/box-catalog.test.mjs`; modify `scripts/generate-starter-decks.mjs` (import the lib, fix the 3 ids), regenerate `starter-decks.generated.mjs` | § Data: `SetCard`, `DeckRow`, `BUILD_BATTLE_BOXES`, `DECK_SOURCES` as listed; generator throws on name mismatch | me02 → 130 rows, tally {43,31,10,10,17,13,5,1}; each deck sums to 40; promo ids mep-014…017 present once; every row has id/image/supertype; sprite slugs resolve; starter file has no Forest of Vitality/Dizzying Valley/Sacred Charm | pokemon.com news (box contents, promos); PokéBeach thread 156492 snippets (lists — verify vs Bulbapedia first); TCGdex ids as listed | `node --test` on box-catalog, set-browser, starter-deck-sprites tests |
| 2 Pure | create `core/build-battle/pack-opening.mjs`, `build-battle-session.mjs`, their tests, `shared/engine/formats.mjs` + test; modify `deck-validation.mjs`, `deck-library.mjs`, `builder-window.mjs` + their tests | § Pack model, § Session, § Deck format signatures verbatim | rows 1–15, 25 | tcgprotectors 10k-pack rates; pokebeach IR/SIR slot; Prerelease 40/4 (pokemon.com); copy rule = Standard 4-copy, Basic Energy exempt (rulebook p.22, as `deck-validation.mjs` cites) | `pnpm test:changed` green |
| 3 Engine + server | modify `shared/engine/state.mjs`, `setup.mjs`, `reduce.mjs` (loadDeck), `view.mjs`, `server/game/room.mjs`, `server/game/shadow.mjs`, `server/server.js` (route + format + mismatch chat), `client/src/actions/general/setup-deal.mjs`, `client/src/actions/zones/hand-actions.js`, `client/src/state.js`, `import.js`, `exchange-data.js`; tests in `setup.test.mjs`, `room.test.mjs`, `setup-deal.test.mjs`, `exchange-data-params.test.mjs` | § Engine and server verbatim (`player.deckFormat`, `format_mismatch`, `extractDeckFormat`, `setupDealPlan(count, { format })`) | rows 16–23 | Prerelease: 4 Prizes, 7-card hand (pokemon.com news) | full `pnpm test` green |
| 4 UI | create `native-deck-builder-build-battle.js`, `css/deck-builder-build-battle.css`; modify `index.ejs`, `native-deck-builder.js` (mode + `validateDeck` format + gameLink format), `native-deck-builder-library.js` (`getActiveDeckFormat`, badge), `deck-builder-window.js`, `import-deck.js`, `initialize-sidebox.js` | § Builder-tab controller steps 1–7, § CSS, ids as named | rows 9–14, 24, 26–29 by hand (e2e list in § Test plan) | — | lint clean; e2e observations recorded |
| 5 Close | `.agent/areas/deck-builder.md` (+ B&B lines), `MAP.md` (build-battle dir, formats.mjs), `DECISIONS.md` (D185+: picks 1,2,3,5,6,7,8), `STATE.md`, design status | — | review.md pass by a fresh agent on the whole diff | — | `pnpm test` + review findings filed |

## Deviations (Builder appends here during build)

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
