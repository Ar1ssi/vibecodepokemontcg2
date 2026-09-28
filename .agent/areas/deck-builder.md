# Area: deck builder
<!-- Cap 60 lines. Moved out of MAP.md on 2026-09-24 (S286) to keep MAP under cap. -->
Purpose: native deck builder — search, filters, counter, sprites, wallpapers, coins, themes.
Owner code: client/src/setup/deck-builder/ (core/ = pure models; native-deck-builder-*.js = DOM)

## Key files
client/src/css/deck-builder-live.css — deck builder's PTCG Live theme (D: S252); ALL rules scoped
  under `.db-live` (on #nativeDeckBuilderWorkspace) — that class is what overrides index.css on
  specificity, so @import order never matters and nothing needs !important. `.db-light` re-tokenizes
  to the pre-Live grey palette. Token block at the top is the only thing the two themes differ by.
client/src/setup/deck-builder/core/builder-theme.mjs — theme resolve/persist (dark default)
client/src/setup/deck-builder/core/deck-counter.mjs — "x / 60" counter model from a validateDeck result
client/src/setup/deck-builder/core/card-filters.mjs — TCG Live filter drawer model (design 050): format,
  reg mark, card/energy/Trainer type, stage, Special (ex/EX/GX/V/Mega/…), HP, retreat, weakness, rarity,
  expansion, Has Ability, In deck; OR within a group, AND across; `buildTcgdexFilterParams` = the server-
  narrowable subset (TCGdex narrows, client filter is the truth); chips via describeActiveFilters
client/src/setup/deck-builder/core/builder-window.mjs — the builder runs in its own tab at /deck-builder
  (same index.ejs, `body.deck-builder-window`); role resolve + validated postMessage protocol to the game
  tab. DOM glue: initialization/.../sidebox/deck-builder-window.js. In native-deck-builder.js every game
  side effect goes through `gameLink` (local on the game tab, messages from the builder tab); the game
  tab's library is read-only for deck cards (`allowDeckWrites: false`) and every library write re-reads
  storage first (two tabs share it). Deck tab = slim panel (P1/P2, card back, Open Deck Builder).
client/src/setup/deck-builder/core/build-battle/ — Build & Battle mode (design 051, D185–D189): /build-and-battle
  is a third builder-tab mode (`resolveBuilderMode`, `body.build-battle-window`). Pure: box-catalog.mjs (box →
  4 decks, promos, sprites), build-battle.generated.mjs (me02 set + 4 decks, from
  scripts/generate-build-battle-box.mjs; `--check` runs in `pnpm test:live`), pack-opening.mjs (seeded slot
  model: openPack/openBox/poolFromBox), build-battle-session.mjs (localStorage `ptcg-sim.build-battle.v1`,
  memory-only on throw; validatePoolDeck/canAddFromPool), build-battle-view.mjs (UI strings/helpers).
  DOM: sidebox/native-deck-builder-build-battle.js (Box + Pool tabs), css/deck-builder-build-battle.css.
  Unboxing scene (design 052): pure unboxing.mjs (reducer `session.unboxing`, poses, tiers, pack art) +
  box-textures.mjs; DOM sidebox/native-deck-builder-unboxing.js (CSS 3D box, tray, pack tears, reveal fan),
  css/deck-builder-unboxing.css, vendored art client/src/assets/build-battle/{box,packs}/.
  Library records carry `format` ('tcg' | 'build-battle'); a load sends the record's own format.
  Standard builder shows a B&B deck with a 40 counter but does not enforce the pool (by design).
  Decklist lines/TCGdex fetch shared with starter decks: scripts/lib/decklist-lines.mjs (throws on name drift).
client/src/setup/deck-builder/core/set-browser-filters.mjs — the same drawer filters on Browse Sets: TCGdex narrows
  each set (`set.id=eq:`), full records decide; filters TCGdex cannot narrow only scan the open set.
client/src/setup/deck-builder/core/deck-sprites.mjs — deck Pokémon sprite slots (design 024, D97):
  up to 2 `{slug, shiny}` per deck (D99), catalog search and vendored-art URL building; catalog data in
  pokemon-sprite-catalog.generated.mjs (gen-8 species + Mega/Gmax/regional/transform/type forms, design 039),
  art in client/src/assets/pokemon/gen8/,
  both refreshed by scripts/generate-pokemon-sprites.mjs; plus hand-kept pokemon-sprite-catalog-gen9.mjs
  (fan art, regular only, D100) with art in client/src/assets/pokemon/gen9/regular/. UI: renderDeckSprites/renderSpritePicker in
  native-deck-builder-renderers.js + native-deck-builder-sprite-picker.js (popover state only)
client/src/setup/deck-builder/core/card-sprites.mjs — card → sprite (design 025, D98): cardSpriteFor
  parses Pokémon names to species + Mega/Primal/Gmax/regional/transform form (exact catalog name +
  alias table, design 039) or Arceus/Silvally type by card `types`, Item/Tool Trainers to pokesprite item
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
