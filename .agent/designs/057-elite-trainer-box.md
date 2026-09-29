# 057: Elite Trainer Box simulation (shelf, ETB unboxing, collection)
Status: building — slices 1–3 ✅; slice 4 built on the pre-054 scene (a0dc5dc7), re-port onto PR 199's 3D scene pending (Stage B); slices 5–6 open. Numbered 055 until PR 199 (design 055 = 3D packs) took that number · depends on designs 051/052 (on main) and on design 054
(the other Build & Battle boxes plan, thread "Plan other Build & Battle boxes": pack-model registry,
boosted 30th Celebration pull rates, per-set baking). 054 is that thread's number; renumber this file
at merge if the two collide.
Date: 2026-09-28 · Session: S331 (project thread "Plan Elite Trainer Box simulation")

## Problem
Designs 051/052 simulate one product: a Build & Battle Box opened as a game format. The user wants
Elite Trainer Boxes simulated "along the lines of design 052": pick an ETB, unbox it beat by beat in
the Pocket-style scene (shrink-wrap, lid, promo, sleeves, Energy, dice, coin, dividers, guide, code
card, nine packs), and keep what it held. An ETB is not a format, so what it yields is a **collection**
(the owned cards, Basic Energy, the box's sleeve and coin) that the Standard deck builder can build from
and show. Plan only; every slice is buildable by a fresh thread from this file.

## Constraints
- Same house rules as 052 (§ Constraints there apply verbatim): builder-tab scene, one clock (WAAPI
  keyframes from pure poses, `sampleKeyframes`/`animateFrames`), flares inside card bounds, opacity
  on hosts, `motionReduced()`/`fxDisabled()`/`soundDisabled()` gates, synthesized voices only, foil
  via `buildHoloCard` + `unboxingHoloRarity`, vendored product art is allowed, cosmetic scene that
  never changes what the player receives, resumable and skippable.
- **Pull rates are never defined here.** Every ETB pack rolls the pack model the shared registry
  returns for its set: `packModelFor(setId)` in `core/build-battle/box-catalog.mjs`. Design 054 owns
  that registry and switches every pack (Phantasmal Flames included) to the boosted 30th Celebration
  rates the user asked for on 2026-09-28. ETB catalog rows carry `setId` only, no table.
- Card data is the baked set module (`BUILD_BATTLE_SET_CARDS[setId]`, D186). Only `me02` is baked on
  main, so the first ETB that ships is Phantasmal Flames; every other ETB is a catalog row plus art
  once 054's generalized generator bakes its set. The shelf lists only ETBs whose set is baked.
- Card facts are looked up, never recalled (CLAUDE.md 7): promo ids come from Bulbapedia and the
  generator's name check (`fetchCard(id, expectedName)` throws on drift) verifies them at bake time.
  TCGdex is unreachable from the cloud sandbox (proxy 403 on 2026-09-28), so baking runs on a
  networked machine and `--check` stays in `pnpm test:live`.
- No engine, netcode or format change: a deck built from the collection is a Standard record.
  The B&B window and the game tab are untouched (no new tabs there, no collection writes).
- Storage: `localStorage` through guarded helpers as `build-battle-session.mjs` does; a throwing
  storage means memory-only plus a banner. Counts and ids only, never card bodies. Two builder tabs
  may share the store: every collection write re-reads storage first (area doc, library practice).
- Sleeve art stays on the pokemon-sleeve-database CDN as the catalog already does (`sleeves.mjs`);
  the ETB coins are already vendored in `coins.mjs` (`PFLETB_Mega_Charizard_X_Coin` and the other
  `*ETB_*` ids). The app has no dice or condition-marker gameplay: those are scene props only.
- Reading budget: this design reads 051 § Design, 052 in full, and the files under § Current state.

## Current state (this session's reads, main at bc46665)
- `core/build-battle/box-catalog.mjs`: `ME_PACK_MODEL` (10 slots, published me02 rates),
  `BUILD_BATTLE_BOXES` (one box, `packCount: 4`, four decks with `promoId`), `BASIC_ENERGY_LABELS`,
  `getBuildBattleBox(key)`. No lookup of a pack model by set yet.
- `core/build-battle/pack-opening.mjs`: `openPack({cards, packModel, rng})` (slot → rarity → card,
  no duplicate ids, fallbacks), `openBox({box, cards, rng})` (deck first, then packs, one RNG stream),
  `poolFromBox(...) -> PoolEntry[]` with `PoolEntry = {card, count}`; `comparePoolEntries` is
  module-private.
- `core/build-battle/build-battle-session.mjs`: `Session` v1 in `ptcg-sim.build-battle.v1`, guarded
  `save/load/clearSession`, `parseSeed`, `randomSeed`, `validatePoolDeck`, `canAddFromPool`,
  `arePacksInSet` (length must equal `box.packCount`).
- `core/build-battle/unboxing.mjs`: reducer `createUnboxing()`/`advanceUnboxing(u, event)`/
  `parseUnboxing`/`finishedUnboxing`/`nextPackToTear` with **module constants** `PACK_COUNT = 4` and
  `CARDS_PER_PACK = 10` (`:36-37`); poses `lidPose` (hinged), `wrapTearPose`, `trayRisePose(t, index)`
  with `TRAY_ITEM_COUNT = 7`, `promoLiftPose`, `packSpreadSlot(index, focus, spacingPx)` (laid out for
  four packs), `packFlyPose`, `swipeOutcome`, `swipeAwayPose`, `hitFlipPose`, `hitTierFor`,
  `unboxingHoloRarity`, `unboxingVoiceFor`, `PACK_ARTS` (four me02 fronts), `packArtIndexes(seed)`,
  `packTearEdge`, `faceMatrix3d`.
- `core/build-battle/box-textures.mjs`: `BOX_PROPORTIONS` (1 : 1.45 : 0.65), `BOX_FACE_TEXTURES`
  (front/left photos + quads), `PROCEDURAL_FACES`, `packArtSrc(key)` — one product, no key.
- `sidebox/native-deck-builder-unboxing.js` (1316 lines): `mountUnboxingScene({root, getUnboxing,
  dispatch, packs, packModel, seed, promo, onBuildDeck})`; box size from `BOX_PROPORTIONS`
  (`BOX_W = 200`), `SET_LOGO_URL`/`KEY_ART_URL` hard-coded to me02 (`:84-85`), hinged lid, tray of
  seven items (deck, promo, four packs, code card, tip sheet), spread → pocket → summary per pack,
  fullscreen stage owned by the controller.
- `sidebox/native-deck-builder-build-battle.js`: session lifecycle, `openStage`/`closeStage`
  (`#bbUnboxingStage` appended to the `.db-live` workspace, `.bb-unboxing-active` hides the UI),
  Box/Pool tabs, `unlimitedEnergyCards()` from `buildModernBasicEnergy`.
- `native-deck-builder.js:492-495, 1835-1873`: mode tabs wired by id; `switchMode(mode)`; the B&B
  branch hides Search/Browse and mounts `initializeBuildBattle`. `client/index.ejs:255-262, 297-298`:
  the B&B tabs and panels render only when `isBuildBattle`. `resolveBuilderMode` in
  `core/builder-window.mjs:39` returns `'standard' | 'build-battle'`.
- `core/sleeves.mjs`: 449 sleeves with `category`; ETB sleeves already listed, e.g. "Phantasmal Flames
  Elite Trainer Box" id `08266b9d-1d37-4ddb-a458-9adc302edb62`, "Mega Evolution Elite Trainer Box -
  Mega Lucario" `5341801a-…`, "- Mega Gardevoir" `00b68849-…`, "30th Celebration Elite Trainer Box"
  `252c488b-…`, and one per SV set. `native-deck-builder-sleeve-picker.js` renders `getSleeves()`.
- `core/coins.mjs`: `getCoins()`, ids `MEGETB_Blue_Mega_Lucario_Coin`, `MEGETB_Silver_Mega_Gardevoir_Coin`,
  `PFLETB_Mega_Charizard_X_Coin`, `ASCETB_Yellow_Mega_Dragonite_Coin`, `PORETB_Green_Zygarde_Core_Coin`,
  `CRIETB_Blue_Froakie_Coin`. `deck-library.mjs` records carry `sleeveId`, `coinId`.
- `scripts/generate-build-battle-box.mjs` + `scripts/lib/decklist-lines.mjs`: bakes `me02` and the four
  decks from decklist lines (`MEP n` → `mep-00n`, Limitless art when TCGdex has none).
- `.claude/skills/fx-preview/rec/rec-unboxing.mjs`: three-pass recorder (video + checks, strips, phone)
  with page helpers (`preparePage`, `openFreshBox`, `press`) local to the file.

## ETB reference (researched 2026-09-28; sources at the end)
| Era (sets) | Packs | Promo | Sleeves | Energy | Dice | Other | Note |
|---|---|---|---|---|---|---|---|
| Black & White (Plasma Storm/Freeze/Blast, 2013) | 7, then 8 | none | 65 from Plasma Blast | 45 | 6 dmg + 1 flip | 2 condition markers, dividers, guide | first ETBs [1] |
| XY (2014–16) | 8 | none (Shaymin-EX, Generations, first promo) | 65 | 45 | 6 + 1 | 2 condition markers, code card from Primal Clash | [1][6] |
| Sun & Moon (2017–19) | 8 | select sets | 65 | 45 | 6 + 1 | GX marker | [1] |
| Sword & Shield (2020–23) | 8 (Pokémon Center: 10) | select sets | 65 | 45 | 6 + 1 | VSTAR marker later; PC variant from Chilling Reign | [1][6] |
| Scarlet & Violet (2023–25) | 9 (PC: 11 + stamped promo) | every set | 65 | 45 | 6 + 1 | dividers, guide, code card | pack count 8 → 9 here [1][7] |
| Mega Evolution (2025–26) | 9 (PC: 11 + stamped promo) | every set | 65 | **40** | 6 dmg + 1 flip | **1 plastic coin**, 6 dividers, guide, code card; condition markers not listed | [2][3][4][5] |

Mega Evolution ETB promos (Black Star Promo, set `mep`): Mega Evolution — Riolu MEP 010 (Mega Lucario box)
and Alakazam MEP 009 (Mega Gardevoir box); Phantasmal Flames — **Charcadet MEP 022** (Illustration
Rare cut from the English set, art Teeziro) [2][3][5][8]; Ascended Heroes — N's Zekrom MEP 031;
Perfect Order — Tyrunt MEP 070; Chaos Rising — Fennekin MEP 080; Pitch Black — Zarude MEP 088; 30th
Celebration — Nidorina MEP 101 (single source, UNVERIFIED) [8]. Mega Charizard X ex is the Phantasmal
Flames **box art** (PFL 013 / 109 / 125 / 130), not its ETB promo [5].

Phantasmal Flames ETB (released 2025-11-14) [3][4][5]: 9 Phantasmal Flames packs · Charcadet MEP 022
full-art foil promo · 65 sleeves (catalog id `08266b9d-…`) · 40 Energy cards (type split not published:
UNVERIFIED, the design pins 5 of each Basic type) · 6 damage-counter dice · 1 competition-legal
coin-flip die · 1 plastic coin (catalog `PFLETB_Mega_Charizard_X_Coin`) · collector's box with 6 card
dividers · player's guide · Pokémon TCG Live code card. Pokémon Center variant: 11 packs and a second,
Pokémon Center-stamped Charcadet [4] — out of scope (no stamped art), listed under Options 6.

30th Celebration (September 2026) [9][10][11]: 5 cards per pack, every card holo, a holo Energy and a
holo Pikachu (30-card subset) in every pack; SIR ≈ 1 in 21, IR ≈ 1 in 5, Classic Collection 1 in 10,
Futuristic Rare 1 in 120. Design 054 turns these into the registry's tables; this design only needs
`packModel.size` to be honoured (5-card packs, § Design "reducer sizes").

## Options
1. **Where the ETB lives.** A: a fourth builder route `/elite-trainer-box` mirroring B&B (new window
   name, body class, mode, route). B: two tabs in the **Standard** builder window, *Shelf* and
   *Collection*, next to Search / Browse Sets / Customize. C: a separate "Products" page. **Pick B**:
   an ETB is not a format, its cards feed Standard decks, the fullscreen stage already mounts in any
   `.db-live` workspace, and no route, window name or postMessage change is needed. B&B keeps its own
   route because it is a format.
2. **What the box yields.** A: cosmetic only. B: a persistent **collection** (card counts, Basic
   Energy counts, owned sleeve and coin ids, product log) plus "owned" badges in the builder. C: B
   plus a collection-only building rule that blocks Play. **Pick B.** C would contradict D189's
   "Standard builder does not enforce a pool" and turns a cosmetic product into a rules change; a
   deck count above the owned count shows an amber badge and never blocks.
3. **When contents enter the collection.** A: at scene end. B: at box open, together with the session.
   **Pick B**: the scene is cosmetic (052), so a skipped or abandoned scene must still count; opening
   is one atomic write of collection + session, and "New ETB" never has anything to discard.
4. **Collection truth.** A: store only the product log `{key, seed}` and replay it on load. B: store
   counts, plus the log as history. **Pick B**: 054 changes pack tables, so replaying a seed later
   would silently change what the player owns.
5. **Box model.** A: one more hard-coded scene. B: a **product art descriptor** `productArt(key)` in
   `box-textures.mjs` (proportions, lid kind, faces, pack arts, logo, key art, palette) read by the
   scene, with the current B&B constants moved under `'phantasmal-flames'`. **Pick B.** Design 054
   needs the same seam for its boxes: whichever lands first defines it, the other rebases (§ Work
   plan, dependency rule). Lid: B&B stays `'hinged'`; an ETB lid is a full lift-off cover →
   `lid: 'lift'` and `liftLidPose`.
6. **Roster.** A: bake every ME-era ETB now. B: catalog rows only for baked sets (Phantasmal Flames
   today); the reference table above is the source for later rows, added when 054 bakes each set.
   **Pick B.** Pokémon Center variants (11 packs, stamped promo) are not planned: no stamped art
   exists and the extra packs alone are not worth a variant row.
7. **Energy in the box.** 40 cards of unpublished split → the row pins an explicit `[label, count][]`
   list (5 × 8 types) marked UNVERIFIED in a comment; corrected in data when the user supplies a photo.
8. **Props with no gameplay** (dice, flip die, coin, dividers, guide, code card). A: omit. B: tray
   items with one small interaction each and no state: dice tumble, coin flips once showing the
   catalog coin, sleeves pack turns to show the sleeve art, guide opens Browse Sets on the ETB's set
   after the scene, code card shows a card with a blurred code strip (never a readable code),
   dividers are a stack. **Pick B**; they are what makes it an ETB.
9. **Pack layout for nine packs.** A: the four-pack spread as is (overflows). B: `packSpreadSlot` takes
   `count` and compresses spacing to fit the stage width; CSS wraps the side packs into two rows under
   520 px. **Pick B.**
10. **Recorder.** A: copy `rec-unboxing.mjs`. B: extract its page helpers into
    `rec/lib/unboxing-drive.mjs` and add `rec-etb.mjs` on top. **Pick B** so both recorders drift together.

## Design
### Data (`core/elite-trainer-box/etb-catalog.mjs`, pure, hand-kept)
```
Etb = { key: 'phantasmal-flames-etb', name: 'Mega Evolution—Phantasmal Flames Elite Trainer Box',
  setId: 'me02', packCount: 9, promoId: 'mep-022',
  sleeveId: '08266b9d-1d37-4ddb-a458-9adc302edb62', sleeveCount: 65,
  coinId: 'PFLETB_Mega_Charizard_X_Coin',
  energy: [['Basic Grass Energy', 5], ['Basic Fire Energy', 5], ['Basic Water Energy', 5],
           ['Basic Lightning Energy', 5], ['Basic Psychic Energy', 5], ['Basic Fighting Energy', 5],
           ['Basic Darkness Energy', 5], ['Basic Metal Energy', 5]],   // 40, split UNVERIFIED
  props: { damageDice: 6, flipDie: 1, coin: 1, dividers: 6, guide: 1, codeCard: 1 },
  keyArtCardId: 'me02-013',   // Mega Charizard X ex, the box art
  art: 'phantasmal-flames-etb' }
ELITE_TRAINER_BOXES = [that row]; getEtb(key) -> Etb|null;
availableEtbs(setCards = BUILD_BATTLE_SET_CARDS) -> Etb[]   // rows whose setId is baked
```
- `box-catalog.mjs` gains `PACK_MODELS = Object.freeze({ me02: ME_PACK_MODEL })` and
  `packModelFor(setId) -> PackModel|null`. This is the seam 054 fills with the boosted tables; ETB
  code calls only `packModelFor`.
- `pack-opening.mjs` exports `comparePoolEntries` (unchanged body) for the collection's pool.
- Generated data: `scripts/generate-build-battle-box.mjs` gains `ETB_PROMO_SOURCES = {
  'phantasmal-flames-etb': '1 Charcadet MEP 22' }` and writes `export const ETB_PROMOS = {
  'phantasmal-flames-etb': DeckRow }` (the `toDeckRow` shape with `qty: 1`; `resolveDeck` throws if
  `mep-022` is not named "Charcadet"). Art: TCGdex `image` when present, else the Limitless scan
  (`decklist-lines.mjs limitlessImage`, MEP → `mep`), as the box promos already do.

### Opening (`core/elite-trainer-box/etb-opening.mjs`, pure)
- `openEtb({ etb, cards, packModel, rng }) -> { packs: string[][] }`: `etb.packCount` packs of
  `openPack({cards, packModel, rng})` ids, one RNG stream from `createRng(seed)`. No deck draw, so an
  ETB seed and a B&B seed never share a stream. `packModel` null → throws `Error('no pack model for
  <setId>')` (the shelf never offers such a row).
- `etbContents(etb, promos = {}) -> { promo: DeckRow|null, energy: [label, count][],
  sleeveId, coinId, props }` — the non-pack contents in one object for the scene and the collection.

### Collection (`core/elite-trainer-box/collection.mjs`, pure)
```
COLLECTION_STORAGE_KEY = 'ptcg-sim.collection.v1'
Collection = { version: 1, cards: Record<cardId, number>, energy: Record<label, number>,
  sleeves: string[], coins: string[], products: { key: string, seed: number, openedAt: number }[] }
createCollection() -> empty
addProduct(collection, { etb, seed, packs, contents, now }) -> Collection'   // pure, new object
   cards[id] += 1 per pack id; cards[promo.id] += 1; energy[label] += count; sleeves ∪ sleeveId;
   coins ∪ coinId; products.push({key, seed, openedAt: now}); products capped at MAX_PRODUCTS = 500
   (oldest dropped, counts kept)
parseCollection(json) -> Collection|null   // wrong version, non-integer or > MAX_COUNT (9999) counts,
   ids > 128 chars, arrays over cap, unknown labels (not in BASIC_ENERGY_LABELS) → null
saveCollection(storage, collection) -> boolean · loadCollection(storage) -> Collection
   (a missing or unparsable store = createCollection()) · clearCollection(storage)
collectionPool(collection, cardsById) -> PoolEntry[]   // {card, count}, ids without a baked card
   skipped, sorted by comparePoolEntries
ownedCount(collection, cardId) -> number · collectionStats(collection) -> { cards, unique, products }
```
Writes go through `withFreshCollection(storage, mutate)`: load, mutate, save (two tabs share it).

### Session (`core/elite-trainer-box/etb-session.mjs`, pure)
`ETB_STORAGE_KEY = 'ptcg-sim.etb.v1'`; `EtbSession = { version: 1, etbKey, seed, packs: string[][],
unboxing: Unboxing, createdAt }`; `createEtbSession({etbKey, seed, packs, packModel, now})` (unboxing
sized `{ packCount: packs.length, cardsPerPack: packModel.size }`), `parseEtbSession(json)` (unknown
`etbKey`, pack count ≠ `etb.packCount`, pack length outside `1..packModel.size`, ids not in the set,
or an `unboxing` whose sizes disagree with `packs` → null), guarded `save/load/clearEtbSession`.
One opening at a time; a session at `stage === 'done'` is cleared on the next Shelf render. Not
room-bound (an ETB is not a match; D192 does not apply). Open flow, in order: `openEtb` →
`withFreshCollection(addProduct)` → `createEtbSession` → `saveEtbSession`. A collection save that
returns false shows the memory-only banner "This box will not be kept after a reload" and the scene
still plays.

### Reducer sizes (`core/build-battle/unboxing.mjs`, generalized in place)
- `Unboxing` gains `cardsPerPack: number`; `createUnboxing({ packCount = 4, cardsPerPack = 10 } = {})`,
  `finishedUnboxing({ packCount = 4, cardsPerPack = 10 } = {})`; `packsTorn.length` is the pack count.
  `allRevealed`, `hasPackMidReveal`, `withReveal`, `revealCard`, `revealAll` read `u.cardsPerPack` and
  `u.packsTorn.length` instead of the constants. `parseUnboxing` accepts a missing `cardsPerPack`
  as 10 and rejects `revealed[i] > cardsPerPack`. `PACK_COUNT`/`CARDS_PER_PACK` stay exported as the
  B&B defaults. B&B callers pass nothing, so their states are unchanged apart from the new field.
- `unwrapDeck` keeps its name; for an ETB it is the "open the promo pouch" beat (hint text differs,
  the reducer does not).
- New poses: `liftLidPose(t) -> { translateZPx, translateYPx, rotateXDeg, opacity }` — the lid rises
  by 0.6 × box height (`EASE_LID`), tilts −8°, then from t = 0.7 slides back by 0.4 × depth and fades
  on its host to 0; `t` ∈ [0,1], `LID_LIFT_MS = 640`. `dicePose(t, index, seed) -> { translateXPx,
  translateYPx, rotateXDeg, rotateYDeg, rotateZDeg }` — six dice tumble 18 px out of the pouch with
  seeded end faces (`createRng(seed ^ 0x5bd1e995)`), `DICE_MS = 520`. `coinFlipPose(t) ->
  { rotateXDeg, translateYPx }` — one 3-turn flip, 12 px lift, `COIN_FLIP_MS = 700`.
- `packSpreadSlot(index, focus, spacing, count = 4)`: `spacing` is a number (the current B&B call,
  unchanged result) or `{ spacingPx, availableWidthPx = Infinity }`; the side packs use
  `min(spacingPx, availableWidthPx / (count - 1))` so nine packs fit the stage width.
- `trayRiseMs(itemCount) = TRAY_RISE_MS + (itemCount - 1) * TRAY_STAGGER_MS`; `TRAY_TOTAL_MS` stays
  as `trayRiseMs(TRAY_ITEM_COUNT)`.
- `unboxingVoiceFor` gains `dice → 'unbox-dice'`, `coin → 'unbox-coin'`, `sleeves → 'unbox-unwrap'`.

### Product art (`core/build-battle/box-textures.mjs`)
```
PRODUCT_ART = {
  'phantasmal-flames': { proportions: BOX_PROPORTIONS, lid: 'hinged', faces: BOX_FACE_TEXTURES,
     proceduralFaces: PROCEDURAL_FACES, packArts: PACK_ARTS, packArtSrc,
     logoUrl: 'https://assets.tcgdex.net/en/me/me02/logo.webp',
     keyArtUrl: 'https://assets.tcgdex.net/en/me/me02/125/high.webp' },
  'phantasmal-flames-etb': { proportions: { width: 1, height: 0.76, depth: 0.36 }  // UNVERIFIED:
     read off the reference render the user supplies; landscape box, lid on top,
     lid: 'lift', faces: {} (all procedural until refs exist), proceduralFaces: [all six],
     packArts: PACK_ARTS, packArtSrc, logoUrl: same, keyArtUrl: 'https://assets.tcgdex.net/en/me/me02/013/high.webp' } }
productArt(key) -> descriptor | null
```
The scene reads only the descriptor (no `BOX_PROPORTIONS`/`SET_LOGO_URL` constants). ETB face
textures, when the user drops `.agent/designs/refs/057-etb-phantasmal-flames-{top,front,left}.webp`,
ship as `client/src/assets/elite-trainer-box/phantasmal-flames/<face>.webp` (≤ 250 KB each) with quads
in `faces`, cut as 052 § Deviations slice 1 describes. Procedural ETB faces (from the retail box):
**top (lid)** — black field, the Mega Charizard X ex key art (`keyArtUrl`, `object-fit: cover`) under
the 052 slash overlay, the "MEGA EVOLUTION" gold pill and the set logo at the foot, "ELITE TRAINER BOX"
in white extended caps on a red plate at the top edge; **sides** — black with the slash streaks
continuing; **front (long side)** — the same red plate and "ELITE TRAINER BOX", "9 BOOSTER PACKS"
pill; **back** — the "Inside, you'll find:" list with the contents above, typeset, legal text as grey
lines; **bottom** — black. Palette tokens are 052's. Shrink-wrap layer as 052.

### Scene (`sidebox/native-deck-builder-unboxing.js`, extended)
`mountUnboxingScene` gains `product` (the descriptor) and `contents` (`etbContents` result, or `null`
for B&B) and `onFinish` (replaces `onBuildDeck`; B&B passes its `finishOpening`). Beats for an ETB:
1. **Sealed**: the box lies flat, tilted toward the viewer (`rotateX(-24deg)` on `.bb-box__body`), lid
   art facing up; wrap tear as 052 (`wrapTearPose` on every face's wrap layer).
2. **Lid**: `lid === 'lift'` plays `liftLidPose` on `.bb-box__lid` (a host div carrying the top face
   and four rim strips of 0.25 × depth) instead of `lidPose`; the inner tray becomes visible.
3. **Tray** (`trayRisePose(t, index)`, indexes in this order): promo pouch (0), sleeves pack (1),
   Energy stack (2), dice pouch with the flip die and the coin (3), dividers stack (4), guide (5), code
   card (6), then the nine packs (7–15) as a fanned stack. `trayRiseMs(16)`.
4. **Promo** (`unwrapDeck`): the pouch tears (`wrapTearPose`), `promoLiftPose` lifts the promo as a
   `buildHoloCard` with `unboxingHoloRarity(promo, 'normal')` (Illustration rare → tier 2 flare),
   `PROMO_HOLD_MS`, then it settles into the tray.
5. **Props** (any time after the tray, no state): sleeves pack tap → flips to the sleeve art
   (`getSleeveById(contents.sleeveId).image`) with the line "65 sleeves · in your sleeves now"; dice
   pouch tap → `dicePose` ×6 plus the flip die (7th cube, `index 6`) and `coinFlipPose` on the coin
   (`getCoinById(contents.coinId).url`); guide tap → marks `wantsGuide = true` (after the scene the
   controller opens Browse Sets on `etb.setId`); code card tap → turns over to a card back with a
   blurred strip; dividers → none. Each prop is a `button`.
6. **Packs**: `packFlyPose` ×9 into the spread (`packSpreadSlot` with `count = 9`); then per pack the
   052 cut → pocket → summary flow unchanged, packs strictly in order (`nextPackToTear`).
7. **Done**: summary of the last pack shows "Everything is in your collection: 91 cards · 40 Energy ·
   sleeves · coin" and the controls *See collection* (→ `onFinish('collection')`) and *Open another*
   (→ `onFinish('shelf')`). *Skip scene* as 052 (`finish` refused mid-pack).
Sounds: `unbox-dice` (three noise clicks 40 ms, bandpass 2.4 kHz, gain .2, delays 0/70/150),
`unbox-coin` (sine 2.6 kHz → 2.2 kHz 320 ms gain .18). Everything else reuses 052's table.

### Standard builder integration
- `client/index.ejs`: when `isBuilderWindow && !isBuildBattle`, two tabs after Browse Sets —
  `#etbTabShelf` "Shelf" and `#etbTabCollection` "Collection" — and panels `#etbShelfPanel`,
  `#etbCollectionPanel` (class `bb-panel`, `hidden`) next to the set-browser panel.
- `native-deck-builder.js`: `switchMode` learns `'shelf'` and `'collection'` (same show/hide pattern
  as `'box'`/`'pool'`); in standard editor mode it mounts `initializeEliteTrainerBox` (below) and
  passes `getOwned: () => etb.ownedCounts()` to the set browser and the search renderer.
- `sidebox/native-deck-builder-etb.js` (DOM glue, new): `initializeEliteTrainerBox({ shelfPanelEl,
  collectionPanelEl, getDeck, addToDeck, showShelf, showCollection, openSetBrowser(setId),
  onPreviewCard }) -> { refresh, ownedCounts: () => Record<cardId, number>, initialMode: () =>
  'shelf' | null }`. Owns the ETB session, the stage (`openStage`/`closeStage` moved out of the B&B
  controller into a shared `sidebox/native-deck-builder-stage.js` `createStage(workspaceEl, label)`
  → `{ open, close, el }`, used by both), and the scene mount with `product: productArt(etb.art)`,
  `contents: etbContents(etb)`, `packModel: packModelFor(etb.setId)`.
  - **Shelf**: one card per `availableEtbs()` row: procedural mini box (top face), name, "9 packs ·
    Charcadet promo · 65 sleeves · 40 Energy · dice · coin", seed input (`?etb=<key>&seed=` prefills;
    `parseSeed`), *Open* button (`#etbOpen-<key>`), disabled while a session is in flight. In flight:
    "Your <name> is being opened" plus *Resume* (re-opens the stage on the saved state) — a reload
    lands here and resumes at once when the stage was open.
  - **Collection**: header stats ("91 cards · 42 unique · 1 box opened"), *Reset collection*
    (`window.confirm('Remove every card, sleeve and coin your boxes gave you? Decks stay in My
    Decks.')` → `clearCollection`), then the Pool-tab layout (Pokémon / Trainer / Energy groups,
    `bb-pool-card` tiles reused) with badge "n owned" and, when the deck holds the card, "m in deck";
    `m > n` turns the badge amber (`is-over`). Click → `addToDeck(card)` (Standard rules only);
    right-click → preview. Energy group lists owned Basic Energy by label with counts and adds
    `buildModernBasicEnergy(label, 1)`. Empty: "Open an Elite Trainer Box on the Shelf to start a
    collection."
  - Scene end: `onFinish('collection')` closes the stage with the 052 hand-back and shows the
    Collection tab; `onFinish('shelf')` shows the Shelf; `wantsGuide` opens Browse Sets on the set
    instead. The done session is cleared.
- Pickers: `initializeDeckBuilderSleevePicker` and `…CoinPicker` take `getOwnedIds: () => string[]`;
  owned entries get class `is-owned`, a corner badge "Owned", and sort first (`ownedFirst(items,
  ownedIds)` pure helper exported from `sleeves.mjs` and `coins.mjs`, identical bodies).
- Owned badges: `native-deck-builder-renderers.js` and `native-deck-builder-set-browser.js` render
  "×n owned" (`.native-deck-builder-owned-badge`) when `getOwned()[card.id] > 0`; no badge otherwise.
- CSS: `client/src/css/deck-builder-etb.css` (scoped `.db-live`), tokens from `deck-builder-unboxing.css`;
  lift lid, tray props, nine-pack spread, shelf cards, owned badges; `@media (max-width: 520px)`
  wraps side packs into two rows and the tray props into a grid.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty collection / no ETB opened | Collection tab shows the empty line; no owned badges anywhere; pickers unchanged | [x] collection.test row 1 (slice 1); [x] browser run (slice 3 probe) |
| 2 | malformed collection or session JSON (wrong version, count 10000, id 200 chars, unknown energy label, `revealed[i] > cardsPerPack`) | `parseCollection`/`parseEtbSession` return null → fresh collection / no resume; nothing thrown | [x] collection.test row 2, etb-session.test row 2 |
| 3 | boundaries: 0 products, 500 products (+1 drops the oldest, counts kept), pack of 5 cards (30th), 11 packs (PC row, catalog-only) | as stated; `cardsPerPack` 5 finishes at 5 reveals | [x] collection.test row 3, unboxing.test row 3b |
| 4 | *Open* pressed twice / two tabs open the same seed | the button disables on first press; the second tab re-reads storage before writing, so both openings are in the collection (two products) | [x] collection.test rows 4 + 5: `withFreshCollection` merge; [x] browser: double click → one product |
| 5 | storage throws on save (collection or session) | memory-only banner on Shelf and Collection; the scene plays; a reload loses the box | [x] etb-session.test row 5 (`saveEtbSession` false); [ ] banner text asserted (slice 3) |
| 6 | reload mid-scene (sealed / lid off / promo shown / pack 5 with 3 revealed / done) | resumes settled at that state (052 row 4); done → Shelf, session cleared | [x] slice 3 probe (wrap torn → reload → resumes on the stage); [ ] rec-etb pass 1 reload probe |
| 7 | `packModelFor(setId)` null (row for an unbaked set) | `availableEtbs` hides the row; `openEtb` throws; catalog test asserts every shipped row resolves | [x] etb-catalog.test row 7, etb-opening.test row 7 |
| 8 | promo / sleeve / coin id not in its catalog | catalog test fails (ids pinned); at runtime a missing sleeve or coin shows the prop without art and still adds the id | [x] etb-catalog.test row 8 |
| 9 | product art missing (`productArt` null) or face texture 404 | procedural faces; scene continues | [ ] browser run with textures routed to 404 |
| 10 | promo art 404 (TCGdex and Limitless) | card back with the name (052 row 10) | [ ] rec-etb with card hosts routed to 404 |
| 11 | Reset collection while a scene is open | collection emptied (the open box's cards included: confirm text says so); the scene continues; the done summary still reads what the box held | [ ] browser run |
| 12 | deck count above owned count | amber badge, Play unaffected | [x] etb-view.test row 12; browser run (1 owned · 2 in deck, amber) |
| 13 | B&B window and the game tab | no Shelf/Collection tabs, no collection reads or writes (`grep` of the B&B controller stays free of `collection.mjs`) | [x] index.ejs conditional; builder-window-markup.test row 13; browser run |
| 14 | reduced motion / `fx-off` / keyboard only / phone 390 px | as 052 rows 1, 2, 15, 16; nine packs wrap, no horizontal scroll | [ ] rec-etb pass 3 |
| 15 | pool integrity | every pack id in the summary equals `session.packs`; `collection.cards` equals the multiset of `packs` + promo after one opening; the scene never writes the collection | [x] collection.test row 15; [ ] rec-etb pass 1 probe |
| 16 | hits face down until tapped; face never shown before the flip midpoint | 052 row 14 (`backface-visibility`) | [ ] rec-etb probe |
| 17 | Skip scene from sealed | collection already holds the box; Shelf returns; one `unbox-done` voice | [x] unboxing.test row 17 (existing) + browser (Skip → Shelf, session cleared, 91 cards kept) |
| 18 | seed reproducibility | `openEtb` with seed 42 twice → identical packs; seeds 42 vs 43 differ; `openBox(42)` output unchanged by this design | [x] etb-opening.test row 18 |
| 19 | unknown `?etb=` key | Shelf ignores it (no prefill, no open) | [x] etb-view.test row 19; browser run |
| 20 | existing B&B sessions saved before this design (no `cardsPerPack`) | `parseUnboxing` fills 10; B&B tests unchanged | [x] unboxing.test row 20, build-battle-session.test row 20 |

## Test plan
Unit (`core/elite-trainer-box/__tests__/`): `etb-catalog.test.mjs` (rows 7, 8; energy sums to 40;
`sleeveId` ∈ `getSleeves()`, `coinId` ∈ `getCoins()`, `promoId` ∈ `ETB_PROMOS[key].id`,
`keyArtCardId` in the baked set), `etb-opening.test.mjs` (row 18; nine packs × `packModel.size`; no
duplicate ids per pack; every id in the set), `collection.test.mjs` (rows 1–5, 15; `addProduct` is
pure; `collectionPool` shape and order; round trip), `etb-session.test.mjs` (rows 2, 5, 20).
`core/build-battle/__tests__/unboxing.test.mjs` gains rows 3b and 20, `liftLidPose(0)` = 0 rise and
opacity 1, `liftLidPose(1)` opacity 0, `packSpreadSlot` with `count = 9` and `availableWidthPx = 900`
keeps every slot within ±450 px, `dicePose` end faces reproducible per seed, `trayRiseMs(16)`.
`box-textures.test.mjs`: `productArt('phantasmal-flames')` equals the old constants; the ETB
descriptor's faces are procedural until textures exist. Voice table: `voicesFor('unbox-dice')` ≥ 1.
CSS: `fx-kill-switch-css.test.mjs` covers `deck-builder-etb.css`. Markup (row 13):
`server/__tests__/builder-window-markup.test.mjs` renders `client/index.ejs` with the server's `ejs`
(`ejs.render(template, { importDataJSON: null, e2eAllowed: false, builderWindow: true, builderMode })`,
the locals `server.js:240-251` passes) and asserts `#etbTabShelf` is present for `builderMode`
undefined and absent for `'build-battle'` and for the game page (`builderWindow` undefined).
Video: `rec-etb.mjs` → `out/etb.webm` + strips for wrap, lift lid, tray, promo, dice, coin, spread,
cut, hit, summary, hand-back; then the user on localhost (visual-only work is exempt, CLAUDE.md).

## Migration / rollout
New storage keys (`ptcg-sim.collection.v1`, `ptcg-sim.etb.v1`); the only changed shape is
`Unboxing.cardsPerPack`, defaulted on parse (row 20). No library or engine change. Revert path: revert
the commits; both keys are ignored by older code. *Reset collection* is the player's own revert.
Dependency rule with design 054: the two seams both designs touch are `packModelFor` (`box-catalog.mjs`)
and `productArt` (`box-textures.mjs`). The design that lands first defines them exactly as written here
or there; the other rebases onto that and does not redefine them. Pull rates come only from 054.

## Work plan — slices ≤1 session, each leaving the repo green
Judgment ends above this line. Each slice is a pinned contract: a builder at low effort executes it
without choosing anything.
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Pure model ✅ | create `core/elite-trainer-box/{etb-catalog,etb-opening,collection,etb-session}.mjs` + `__tests__/{etb-catalog,etb-opening,collection,etb-session}.test.mjs`; modify `core/build-battle/box-catalog.mjs` (`PACK_MODELS`, `packModelFor`), `pack-opening.mjs` (export `comparePoolEntries`), `unboxing.mjs` (§ Reducer sizes: `cardsPerPack`, `liftLidPose`, `dicePose`, `coinFlipPose`, `packSpreadSlot` count/width, `trayRiseMs`, voices), `__tests__/unboxing.test.mjs`, `build-battle-session.test.mjs` (states carry `cardsPerPack: 10`), `mat-fx/fx-audio.mjs` (+`unbox-dice`, `unbox-coin`) and its test | § Data, § Opening, § Collection, § Session, § Reducer sizes verbatim; `etbContents(etb, promos = {})` takes the promo rows as an argument, so nothing in this slice imports `ETB_PROMOS` (slice 2 writes it; the DOM passes it in slice 3); the catalog test checks `promoId` matches `/^mep-\d{3}$/` and slice 2 adds the `ETB_PROMOS[key].id === promoId` assertion | rows 1–5, 7, 8, 15, 18, 20; `createUnboxing({packCount: 9, cardsPerPack: 5})` → `packsTorn.length 9`, done after 9 × 5 reveals; `createUnboxing()` deep-equals the old state plus `cardsPerPack: 10`; `packSpreadSlot(8, 4, {spacingPx: 220, availableWidthPx: 900}, 9).xPx` within ±450 | Charcadet MEP 022 = Phantasmal Flames ETB promo (Bulbapedia "Charcadet (Phantasmal Flames 19)", PokeBeach set guide); contents per § ETB reference [3][4] | `node --test` on the new and changed tests; `pnpm test:changed` |
| 2 Data | modify `scripts/generate-build-battle-box.mjs` (`ETB_PROMO_SOURCES`, `ETB_PROMOS` export, `--check` covers it), `build-battle.generated.mjs` (regenerated on a networked machine: TCGdex is blocked in the cloud sandbox), `scripts/__tests__/build-battle-box-live.test.mjs` (`--check` still passes), `core/build-battle/box-textures.mjs` (`PRODUCT_ART`, `productArt`; old exports kept), `__tests__/box-textures.test.mjs` (create), `sidebox/native-deck-builder-unboxing.js` (reads `product` instead of the constants; B&B passes `productArt('phantasmal-flames')`) | § Data "Generated data", § Product art verbatim | `ETB_PROMOS['phantasmal-flames-etb']` → `{ id: 'mep-022', name: 'Charcadet', supertype: 'Pokémon', rarity: 'Illustration rare', qty: 1, image: https… }`; `productArt('phantasmal-flames')` → the pre-slice constants; `productArt('nope')` → null; B&B recorder `rec-unboxing.mjs` passes unchanged | TCGdex `mep-022` name "Charcadet" (generator name check); rarity string as TCGdex returns it, verified at bake | `pnpm test:changed`; `node scripts/generate-build-battle-box.mjs --check` on the networked machine |
| 3 Shelf + Collection ✅ | create `sidebox/native-deck-builder-etb.js`, `sidebox/native-deck-builder-stage.js`, `css/deck-builder-etb.css`, `core/elite-trainer-box/etb-view.mjs` + `__tests__/etb-view.test.mjs` (shelf line text, badge text, amber rule, `?etb=` parse); modify `client/index.ejs` (tabs + panels under `isBuilderWindow && !isBuildBattle`), `native-deck-builder.js` (`switchMode` shelf/collection, mount, `getOwned` plumbing), `native-deck-builder-build-battle.js` (uses `createStage`; behavior identical), `css/__tests__/fx-kill-switch-css.test.mjs` (+ the new sheet), `server/__tests__/builder-window-markup.test.mjs` (create, § Test plan row 13) | § Standard builder integration: ids `#etbTabShelf`, `#etbTabCollection`, `#etbShelfPanel`, `#etbCollectionPanel`, `#etbOpen-<key>`; `initializeEliteTrainerBox` signature; scene mounted with `product`, `contents`, `packModel`, `onFinish`; nine packs play through the **existing** spread/pocket/summary (slice 4 restyles; here the lid still uses `lidPose` and the tray shows only promo + packs) | rows 4, 6, 11–13, 17, 19; view test: `shelfLine(etb)` → "9 packs · Charcadet promo · 65 sleeves · 40 Energy · dice · coin"; `ownedBadge(3, 4)` → "3 owned · 4 in deck" with `over: true` | — | lint clean; `pnpm test:changed`; browser: open seed 42, skip, Collection shows 91 cards |
| 4 Scene (fx-designer) ✅ | modify `sidebox/native-deck-builder-unboxing.js` (lift lid host + rim, ETB tray order and props, nine-pack spread via `packSpreadSlot(..., count)`, prop interactions, done summary/controls, `unbox-dice`/`unbox-coin` calls), `css/deck-builder-etb.css`, `css/deck-builder-unboxing.css` (procedural ETB faces from § Product art, `[data-lid="lift"]`), `box-textures.mjs` (texture quads only when `refs/057-etb-*.webp` exist; else untouched) | § Scene beats 1–7 and § Product art procedural faces verbatim; every prop a `button`; timings `LID_LIFT_MS 640`, `DICE_MS 520`, `COIN_FLIP_MS 700` | rows 9, 10, 14, 16; strips at wrap/lid/tray/promo/dice/coin/spread/cut/hit/summary; 390 px: `scrollWidth === 390` | — | lint clean; kill-switch test; strips reviewed against 052's look; user check on localhost |
| 5 Owned everywhere | modify `core/sleeves.mjs`, `core/coins.mjs` (`ownedFirst`), their tests, `sidebox/native-deck-builder-sleeve-picker.js`, `-coin-picker.js` (`getOwnedIds`, `is-owned`, "Owned" badge), `native-deck-builder-renderers.js`, `native-deck-builder-set-browser.js` (`getOwned`, "×n owned" badge), `native-deck-builder-etb.js` (`wantsGuide` → `openSetBrowser(etb.setId)`), `css/deck-builder-etb.css` | `ownedFirst(items, ownedIds) -> items` (stable: owned first, then the original order); badge class `.native-deck-builder-owned-badge`; picker option `getOwnedIds` | `ownedFirst([a,b,c], ['c'])` → `[c,a,b]`; `ownedFirst(list, [])` → same order; renderer test: card with owned 2 → badge "×2 owned", owned 0 → no badge; rows 1, 12 | — | lint clean; `pnpm test:changed`; browser: sleeve picker shows the PFL ETB sleeve first with "Owned" |
| 6 Verify | create `.claude/skills/fx-preview/rec/lib/unboxing-drive.mjs` (`preparePage`, `press`, `swipe`, `openFresh(page, {url, storageKeys, openSelector})` moved from `rec-unboxing.mjs`), `rec/rec-etb.mjs`; modify `rec/rec-unboxing.mjs` (imports the lib, output unchanged), `fx-preview/SKILL.md` (ETB paragraph: `ETB=phantasmal-flames-etb SEED=42`, `CARD_IMG` stand-in as 052) | recorder opens `/deck-builder?etb=phantasmal-flames-etb&seed=42&e2e=1`, clears both storage keys, presses `#etbOpen-phantasmal-flames-etb`, drives wrap → lid → promo → props → nine packs → summary → hand-back; writes `out/etb.webm` and `<OUT>/<beat>-{start,peak,settle}.png` | rows 6, 10, 14–16 by video and probes: collection after the run equals packs + promo (`localStorage['ptcg-sim.collection.v1']`); `rec-unboxing.mjs` still passes every check | — | both recorders PASS on seeds 42 and 18; video + strips reviewed; user check on localhost |
Banned in a slice row: "decide", "TBD", "as needed", "appropriate", "handle edge cases", "etc.".
Order: 1 → 2 → 3 → 4 → 5 → 6. Slice 4 can run in parallel with 5 after 3. If design 054 lands before
slice 1 or 2, those slices rebase onto its `packModelFor` / `productArt` and keep only what is missing.

## Deviations (Builder appends here during build)
Slice 1 (S332, branch `claude/keen-shannon-i8h98o`; 054 had not landed, so this slice defines
`PACK_MODELS`/`packModelFor` as written here):
- `liftLidPose(t, { heightPx = 76, depthPx = 36 } = {})`: the rise (0.6 × height) and slide
  (0.4 × depth) need the box's pixel size, so they are options; the pinned `t`-only call still works.
- `trayRisePose(t, index, itemCount = TRAY_ITEM_COUNT)`: a 16-item ETB tray cannot rise inside the
  7-item `TRAY_TOTAL_MS`; the third argument times it by `trayRiseMs(itemCount)`. B&B calls unchanged.
- `packSpreadSlot`: the focused pack keeps `spacingPx` for its half-width; only the side packs step by
  `min(spacingPx, availableWidthPx / (count - 1))`. With `focus = 4` all nine slots stay within
  ±450 px at 900 px; with `focus = 0` the ninth pack sits at ≈ 692 px, so slice 4 must centre the
  spread on the queue (or pass a narrower width) rather than on the focused pack.
- `parseUnboxing` bounds a stored scene to 1–36 packs and 1–20 cards a pack.
- The B&B `createSession`/`parseSession` size the scene from the box (`packCount`,
  `packModel.size`) and refuse a stored scene of another size: the old fixed `PACK_COUNT` check
  enforced this before the reducer was generalized.
- `dicePose`: face, direction jitter and resting spin come from one `seed ^ 0x5bd1e995` stream,
  three draws per die in index order; end rotations are whole quarter turns plus two tumbles.
- `parseCollection`: counts must be 1–9999 (a stored 0 is refused; `addProduct` never writes one);
  `sleeves`/`coins` are capped at 500 ids each.
Slice 2 (S332, same branch):
- `ETB_PROMOS['phantasmal-flames-etb']` is also pinned in `box-catalog.test.mjs`; `etb-catalog.test.mjs`
  asserts `ETB_PROMOS[key].id === promoId` for every row.
- TCGdex `mep-022` rarity is `"Promo"`, not `"Illustration rare"` (bake 2026-09-29). With that rarity,
  `unboxingHoloRarity(promo, 'normal')` does not give the tier 2 flare Scene beat 4 expects. Slice 4
  pins the promo's foil tier explicitly.
- `mountUnboxingScene({ product })`: null `product` draws the B&B box with CSS faces only (row 9).
Slice 3 (S332, same branch):
- The B&B and scene sheets were scoped to `body.build-battle-window` only, so the ETB scene in the
  Standard tab rendered unstyled. Both sheets now scope `:is(.build-battle-window, .etb-host)` (same
  specificity) and the Standard builder body carries `etb-host`; the kill-switch test pins it.
- The scene (`native-deck-builder-unboxing.js`, not in this slice's file list) changed as far as the
  ETB needed to play through the existing flow: `onBuildDeck` → `onFinish(destination)` (B&B passes
  `finishOpening`, which ignores it), `contents` option, `packArtIndexes(seed, packs.length)` (packs
  5–9 had no art), the ETB tray holds only the promo pouch, ETB hints, and beat 7's done text and
  controls (*See collection* / *Open another*), so an ETB never ends on "Build your deck". Skip
  scene calls `onFinish('shelf')` (row 17). Slice 4 still owns the lift lid, props and ETB faces:
  until then the ETB box draws the B&B procedural faces.
- `getOwned` plumbing and `openSetBrowser` move to slice 5, where they are first used.
- `initialMode()` returns `null` unless a box is in flight or a `?etb=` link names one; the builder
  then keeps Search.
- Once a collection or session write fails, the collection lives in this tab's memory and is not
  re-read from storage (a re-read would drop the unsaved box).
- Row 11 (Reset while a scene is open) is untested: the stage hides the Collection tab, so Reset is
  unreachable mid-scene. Row 5's banner text is a constant (`MEMORY_ONLY_TEXT`) with no browser run.
Slice 4 pins (S332, set before the build; the builder follows these where § Scene is silent):
- Promo flare: the ETB row carries `promoTier: 2` and `etbContents` returns it (TCGdex rarity is
  "Promo"). When `contents.promoTier >= 2`, beat 4's promo lift plays the hit flare and sparks the
  pocket hits use (inside the card's own bounds), at the lift's peak; the foil family stays
  `unboxingHoloRarity(promo, 'normal')`. Build & Battle (no `contents`) is unchanged.
- Nine-pack spread: with more than `PACK_COUNT` packs, `layoutSpread` calls `packSpreadSlot(index,
  focus, { spacingPx: focusWidth, availableWidthPx: spreadWidth - focusWidth }, packs.length)` and
  shifts every slot by `-xPx(last untorn pack) / 2`, so the focused pack and its queue are centred
  as a group. Four-pack Build & Battle layout is unchanged. At 390 px: `scrollWidth === 390`.
- Pack size: the scene reads cards per pack from `getUnboxing().cardsPerPack` wherever it used
  `CARDS_PER_PACK`.
- Guide: the guide prop sets a scene-local `wantsGuide`; the scene ends with
  `onFinish(destination, { wantsGuide })`. Slice 5 acts on it; the slice 3 controller ignores it.
- Lift lid: `liftLidPose(t, { heightPx: size.height, depthPx: size.depth })` on `.bb-box__lid`
  when `product.lid === 'lift'`; `lidPose` stays for `'hinged'`.
- Tray rise for the ETB: `trayRisePose(t, index, 16)` over `trayRiseMs(16)`.
Slice 4 (S332, fx-designer; same branch):
- Box tilt is CSS `rotateX(24deg) rotateY(-10deg)` (the lid is the +z face and the poses are y-up, as
  `lidTransform` is); § Scene's `rotateX(-24deg)` would show the far side from below.
- The ETB packs leave the tray on a tap ("Tap the booster packs to take them out"), not
  automatically after the promo: beat 5's props would otherwise vanish ~0.9 s after the promo. A
  reload at `deckShown` resumes on the tray.
- At narrow widths the queue tucks behind the focused pack (the fit is solved from `packSpreadSlot`),
  not two rows; at 1280 px the pinned `availableWidthPx` is used unchanged.
- Energy and dividers have no action, so they are `role="img"`, not buttons. Sleeves, code card and
  guide toggle back on a second tap; each dice throw uses `seed + throw`.
- `etbContents` also returns `sleeveCount` (the scene had it hard-coded).
- ETB face textures stay unwired until `refs/057-etb-*.webp` exist; faces are procedural.
Merge of PR 199 (S332; designs 054 every-era boxes + 055 3D packs; the user asked for its
cosmetic changes to the opening to win):
- Renumbered 055 → 057 (PR 199's 3D-pack design is 055; its follow-up reserves 056).
- Every conflicted file took PR 199's side, then the ETB deltas were re-applied. 054 landed first,
  so per § Migration its seams win: `packModelFor`/`PACK_MODELS` (slice 1) and `productArt`/
  `PRODUCT_ART` (slice 2) are gone. The ETB row carries `era` and `packModelKey` (asserted equal
  to its set's Build & Battle box); packs roll `resolvePackModel(etb.packModelKey, cards, setInfo)`,
  so me02 now rolls 054's boosted table.
- Data is lazy (design 054): `box-data.mjs` gains `loadSetData(setId)` (only baked sets). The pure
  ETB modules take data as arguments: `parseEtbSession(json, { setIds })`, `availableEtbs(boxes,
  packModels)`, `etbPackSize(etb)`. The controller loads the ETB sets and the sets of owned cards
  before it parses the session; Open waits, and a failed load shows a banner.
- `build-battle.generated.mjs` is deleted upstream: the Charcadet row moved verbatim to
  `core/elite-trainer-box/etb-promos.generated.mjs`. The generator no longer writes it, so `--check`
  does not cover it.
- The scene is PR 199's (`look` from `boxSkin`, WebGL packs). ETB passes `etbLook(etb, loaded)`
  (its set box's wrappers and palette, the ETB key art, ETB labels, no vendored faces) and keeps the
  slice 3 hooks: `contents`, `onFinish(destination)`, promo-pouch tray, ETB hints and done text.
  Slice 4's lift lid, props, promo flare, nine-pack layout and `[data-lid="lift"]` CSS did not
  survive the scene swap; Stage B re-ports them from a0dc5dc7 onto PR 199's scene.
  `deck-builder-etb.css` keeps its slice 4 prop rules for that re-port.
- `createStage(workspaceEl)` now takes the label at `open(label)` (PR 199 names the stage after the
  picked box).
- Verified after the merge: full `pnpm test` green; PR 199's `rec-unboxing.mjs` all PASS on
  Phantasmal Flames (seed 42) and Obsidian Flames; the ETB plays all nine packs to the collection
  hand-off on the DOM fallback. On WebGL the ETB spread draws in 3D, but packs 5–9 queue past the
  right edge (x up to 2063 px at 1280 px): the nine-pack centring pin is Stage B's first item.

## Sources
1. Bulbapedia, "Elite Trainer Box (TCG)" — per-era packs, sleeves, Energy, dividers, markers, first
   ETBs (Plasma Storm), Pokémon Center variants. Read through a fetch summary; counts UNVERIFIED where
   the summary contradicted itself (dividers 4 vs 6, XY Energy 40 vs 45).
   https://bulbapedia.bulbagarden.net/wiki/Elite_Trainer_Box_(TCG)
2. Bulbapedia, "Mega Evolution TCG Series merchandise" — ME ETB contents, MEP 009/010, PC packs.
   https://bulbapedia.bulbagarden.net/wiki/Mega_Evolution_TCG_Series_merchandise
3. GameStop product page, Phantasmal Flames Elite Trainer Box — full contents list (9 packs, 65
   sleeves, 40 Energy, 6 dice + flip die, plastic coin, 6 dividers, guide, code card).
   https://www.gamestop.com/toys-games/trading-cards/products/pokemon-trading-card-game-phantasmal-flames-elite-trainer-box/20027391.html
4. Zatu and Icehawk Collectibles listings — same contents; Pokémon Center version 11 packs + stamped
   Charcadet. https://zatu.com/en-us/products/pokemon-tcg-mega-evolution-phantasmal-flames-elite-trainer-box ·
   https://icehawkcollectibles.co.uk/elite-trainer-boxes/17118-phantasmal-flames-elite-trainer-box-pokemon-center.html
5. Bulbapedia, "Charcadet (Phantasmal Flames 19)" and "Mega Charizard X ex (Phantasmal Flames 13)";
   PokeBeach Phantasmal Flames set guide — Charcadet MEP 022 is the ETB promo; Mega Charizard X ex is
   box art / tin / UPC promos, not the ETB promo.
   https://bulbapedia.bulbagarden.net/wiki/Charcadet_(Phantasmal_Flames_19) ·
   https://www.pokebeach.com/2025/10/phantasmal-flames-set-guide-full-set-list-cut-cards-store-promos-products-and-more
6. pokecompare, "Pokémon ETB promo cards list" — every SV set has an ETB promo; first promo
   Shaymin-EX (Generations). https://pokecompare.com/blog/pokemon-etb-promo-cards-list
7. Amazon listing, Black Bolt Elite Trainer Box — SV-era 9 packs, 65 sleeves, 45 Energy, 7 dice.
   https://www.amazon.com/Pokemon-Scarlet-Violet-Black-Trainer/dp/B0F6PTRKTH
8. enhanced-cardmarket ETB promo list — MEP numbers per ME-era ETB (single source for Nidorina MEP 101).
   https://enhanced-cardmarket.mave.me/etb
9. PokeBeach, "30th Celebration pull rates" (2026-09) — SIR 1/21, IR 1/5, Classic Collection 1/10,
   Futuristic Rare 1/120. https://www.pokebeach.com/2026/09/30th-celebration-pull-rates-and-most-valuable-cards-worldwide-friendliest-pull-rates-of-the-modern-era
10. Kotaku, "30th Celebration set pull rates" — 5-card packs, all holo, guaranteed Pikachu and Energy.
    https://kotaku.com/pokemon-tgc-30th-celebration-set-pull-rates-rarity-rgb-mew-2000735250
11. thepcenthusiast, "30th Celebration pull rates" — set composition, products.
    https://thepcenthusiast.com/pokemon-30th-celebration-pull-rates/
Official pokemon.com product pages were unreadable from this environment (Incapsula) and are not
relied on. Nothing here is a card ruling; card ids are re-verified by the generator at bake time.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
