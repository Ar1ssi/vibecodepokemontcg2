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
