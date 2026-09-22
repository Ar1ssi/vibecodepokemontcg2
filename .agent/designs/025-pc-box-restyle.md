# 025: PC Box restyle — deck builder + Solo drawer
Status: approved (user S254)
Date: 2026-09-22 · Session: S254

## Problem
The deck builder (S252 PTCG Live dark theme) and the front-page Solo drawer read as generic.
The user approved a "Pokémon PC Box (3DS)" direction on the Superdesign canvas (project
fb8931cc…, drafts 7a464c8c Search, 5685dd13 Sets, e4b1204f Customize, cae6fe8c Drawer v5).
This design ports those drafts into the real UI.

## Constraints
- Deck-builder rules stay scoped under `.db-live` in `deck-builder-live.css`; no `!important` (STATE watch-out, D: S252).
- Sprite art stays vendored pixel art, always `image-rendering: pixelated` (D97).
- No behavior regressions: every existing control keeps its id and handler (tests + e2e reference ids).
- Theme toggle (`builder-theme.mjs`) keeps working: `.db-light` keeps the grey palette.
- New dependency ⇒ DECISIONS line. Nintendo/Fontworks assets committed at user's explicit request (S254).

## Current state
- `client/index.ejs:244-360` deck-builder shell; `:86-133` top tabs + `#p1Box` Solo drawer.
- `client/src/css/deck-builder-live.css` — all `.db-live` styling (tokens top of file).
- `client/src/css/index.css:593-760` — `#topButtonContainer`, `#p1Box`, `#chatbox`, `.sidebox-button-container`.
- `sidebox/native-deck-builder-renderers.js` — search grid, filter bar, deck rows, counter, summary, sprite strip/picker.
- `sidebox/native-deck-builder-library.js` — My Decks chips (renders sprites per chip).
- `sidebox/native-deck-builder.js` — wiring; cosmetics mirror (`rememberCosmetic`) for sleeve/coin/mat/sprites.
- `core/deck-library.mjs` — deck record `{cards, sleeveId, coinId, matId, sprites}`; `setDeck*` setters.
- `core/deck-sprites.mjs` — `MAX_DECK_SPRITES = 3`, catalog search, normalize/add/remove.
- `core/card-filters.mjs` — `BUILDER_FILTER_GROUPS`, energy row already icon tokens.

## Options
1. Sprite count "always two". A: change `MAX_DECK_SPRITES` to 2 (normalize drops a 3rd on next save) — simple, lossy for old 3-sprite decks. B: keep data max 3, display first 2 — lossless but picker lets you pick a hidden 3rd. **Pick A**: one rule everywhere; loss is a cosmetic slot, and the revert path (set back to 3) restores nothing lost only for unsaved decks — acceptable, noted in Migration.
2. Auto-fill when <2 chosen. A: resolve at render from deck cards (pure `resolveDisplaySprites(sprites, cards)`), never persisted. B: write auto picks into the record. **Pick A**: chosen sprites stay the user's intent; auto-fill follows deck edits for free.
3. Wallpaper storage. A: new `wallpaperId` on the deck record like `matId`. B: global preference. **Pick A**: user asked for per-deck swapping via arrows under the deck list; mirrors sleeve/coin/mat.
4. Wallpaper assets. A: commit split banner/body PNGs at native 1x, scale in CSS pixelated. B: commit 4x upscales. **Pick A**: 16x smaller files, same look.
6. Card-row sprite source (user S254: pokesprite). A: vendor pokesprite `items/` art + a generated item catalog, like D97's Pokémon art. B: hotlink jsDelivr at runtime. **Pick A**: offline, no third-party runtime dependency (D97 rationale).
7. Card → sprite parsing. A: one pure resolver `cardSpriteFor(card)` with an ordered rule list (Trainer item name → item sprite; Pokémon name → species + form). B: per-card manual map. **Pick A**, with a small override table for names the rules can't reach (e.g. "Boss's Orders" has no item; "Rare Candy" → etc/rare-candy).
5. Rodin font. A: commit full 9.8 MB TTF. B: commit Latin subset woff2 via fonttools (dev-time tool, not a runtime/package dependency). **Pick B**; fallback stack `'Rodin Condensed', 'Barlow Semi Condensed', sans-serif` (Barlow from Google Fonts).

## Design
Data
- `core/box-wallpapers.mjs`: `BOX_WALLPAPERS` = 16 `{id, name, banner, body}` (Forest, City, Desert, Savanna, Crag, Volcano, Snow, Cave, Beach, Seafloor, River, Sky, Checks, PokeCenter, Machine, Simple) under `/src/assets/box-wallpapers/`; `DEFAULT_WALLPAPER_ID='forest'`; `findWallpaper(id)` → entry or default; `cycleWallpaper(id, step)` wraps.
- `deck-library.mjs`: `wallpaperId` field (default null ⇒ default wallpaper), `setDeckWallpaper(library, deckId, id)`, included in `saveDeck` and load normalization.
- `deck-sprites.mjs`: `MAX_DECK_SPRITES = 2`; `resolveDisplaySprites(sprites, cards)` → exactly ≤2: chosen first, then species from deck Pokémon cards (most copies first, card name stripped of ` ex`/` V`/` VMAX`/` VSTAR`/` GX`/ owner prefixes, looked up via `searchPokemon` exact name), deduped.
- `core/card-sprites.mjs` (new): `cardSpriteFor(card)` → `{kind:'pokemon'|'item', url, label}` or null.
  - Pokémon: strip suffixes (ex, EX, GX, V, VMAX, VSTAR, BREAK, LV.X, Prime, ☆, δ), owner prefixes ("Iono's", "Team Rocket's", "Ethan's", "Cynthia's"…) and "Radiant"/"Shining"/"Dark"/"Light" prefixes, then forms: leading "Mega " / "M " + optional trailing X/Y ⇒ `<species>-mega[-x|-y]`; "Primal" ⇒ `-primal`; "VMAX" ⇒ `-gmax` when that slug exists; "Alolan/Galarian/Hisuian/Paldean" ⇒ `-alola/-galar/-hisui/-paldea`; else base species. Falls back to base when a form slug is missing from the catalog.
  - Trainer items/tools: normalized name ("Great Ball" → `ball/great`, "Choice Belt" → `hold-item/choice-belt`) looked up in a generated `item-sprite-catalog.generated.mjs`; `CARD_ITEM_OVERRIDES` for mismatches. Supporters/Stadiums/Energy ⇒ null (energy keeps its token art).
  - `scripts/generate-item-sprites.mjs` vendors pokesprite `items/` PNGs to `client/src/assets/items/` and writes the catalog (name → path).
- Deck rows (`renderDeckCards`) show the card's sprite (pixelated, 32px) between qty and name; `resolveDisplaySprites` reuses `cardSpriteFor` for species auto-fill.
Rendering
- Chips + deck header use `resolveDisplaySprites`; strip is fixed width so names align; chip width = max-content.
- Deck pane: wallpaper body tiled behind deck rows, banner behind deck header; switcher `◀ name ▶` below `#nativeDeckBuilderCardsPanel` (new `#nativeDeckBuilderWallpaperSwitch`), persists via `rememberCosmetic(target,'wallpaperId',id)` + `setDeckWallpaper`.
- CSS: `.db-live` tokens → PC Box palette (blue frame #1b53a8/#3a9fd8, checkerboard #e8f4ff/#fff, white 2px outlines, yellow #ffcb05 primary, green party); Search grid on checkerboard; tabs as Box segments; Sets tiles 46px tall wide logos, no expanded-set title/arrows; Customize sleeve grid minmax(100px), coins minmax(78px).
- Drawer (`index.css`, scoped `#p1Box`, `#topButtonContainer`): Box tabs, checkerboard log panel, glossy quick-action pills that wrap (no truncation), `#setupButton` FIGHT style, `#resetButton` RUN style, `#optionsButton` BAG style; grid layout unchanged.
- `@font-face 'Rodin Condensed'` in `index.css`, applied to deck builder + drawer.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | deck with no Pokémon cards and no sprites | strip empty, name still aligned (fixed-width strip) | [x] covered: card-sprites 'a deck with no Pokémon and no choice shows no sprites'; fixed 64px chip strip in CSS |
| 2 | unknown/invalid wallpaperId in saved record | default Forest | [x] covered: box-wallpapers 'an unknown or missing id falls back to the default wallpaper' |
| 3 | old deck with 3 sprites | shows first 2; 3rd dropped on next save | [x] covered: card-sprites 'an old three-sprite choice shows only the first two'; deck-sprites cap test |
| 4 | 1 chosen sprite + deck Pokémon | chosen first, 1 auto-filled, no duplicate species | [x] covered: card-sprites 'chosen sprites come first and are never duplicated by the fill' |
| 5 | card names that don't map to a species (e.g. "Iono's Bellibolt ex", Unown) | owner prefix stripped; no match ⇒ skipped | [x] covered: card-sprites 'owner and decorative prefixes are stripped', 'unknown or empty names give no sprite' |
| 6 | wallpaper arrow at ends | wraps both ways | [x] covered: box-wallpapers 'cycling wraps at both ends of the list' |
| 7 | wallpaper/font file 404 | colored fallback background / fallback font; no broken UI | [x] fallback bg colour #88c880 + font stack in CSS; manual (user checks localhost) |
| 8 | light theme toggle | `.db-light` still grey, PC Box art off | [x] every PC Box rule scoped `.db-live:not(.db-light)`; manual |
| 10 | "Mega Charizard X ex", "Charizard VMAX", "Galarian Zapdos V", "Radiant Charizard" | charizard-mega-x, charizard-gmax, zapdos-galar, charizard | [x] covered: card-sprites 'Mega, Primal, Gigantamax and regional forms map to their form sprite' |
| 11 | form slug missing (e.g. VMAX with no gmax art) | base species sprite | [x] covered: card-sprites 'a form with no sprite falls back to the base species' |
| 12 | Trainer with no item art (Supporter/Stadium) or unknown item | no sprite, row layout unchanged | [x] covered: deck-row-sprites 'rows without a sprite keep an empty slot so names stay aligned' |
| 13 | item sprite 404 | img removes itself (onerror), no broken glyph | [x] covered: deck-row-sprites 'each deck row carries the sprite for its card' (onerror) |
| 9 | P1/P2 targets | wallpaper per target like other cosmetics | [x] wallpaperId rides chosenCosmetics per target + setActiveWallpaper(target); manual |

## Test plan
Unit: card-sprites (form + item table), box-wallpapers (find/cycle), deck-library wallpaperId (set/save/load/default), deck-sprites (max 2, resolveDisplaySprites rows 1,3,4,5). Full suite `node --test …`. Manual: user checks localhost (memory: user verifies CSS visually).

## Migration / rollout
`wallpaperId` additive, absent ⇒ default. Sprites max 3→2 drops a 3rd slot on next save; revert = set `MAX_DECK_SPRITES` back to 3 (already-saved 2-sprite decks unaffected). CSS revert = git revert of slices 3-6.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | assets (wallpapers, Rodin woff2) + box-wallpapers.mjs + wallpaperId in deck-library | unit tests pass |
| 2 | sprites max 2 + resolveDisplaySprites + chip/header rendering | unit tests pass |
| 3 | deck builder PC Box CSS (Search) + wallpaper switcher wiring | suite green |
| 4 | Sets + Customize CSS | suite green |
| 5 | Solo drawer restyle + FIGHT/RUN/BAG buttons | suite green |
| 6 | item sprite vendoring script + catalog + `card-sprites.mjs` (forms + items) | unit tests incl. rows 10-12 |
| 7 | deck-row sprites + auto-fill uses `cardSpriteFor` | suite green |

## Deviations (Builder appends here during build)
- `resolveDisplaySprites` lives in `core/card-sprites.mjs`, not `deck-sprites.mjs`: it needs `cardSpriteFor`, and card-sprites already imports deck-sprites, so the other placement would be a circular import with a TDZ hazard on `POKEMON_SPRITE_BASE_PATH`.
- `listDecks` now also projects `cards` and `wallpaperId` so My Decks chips can auto-fill sprites.
- pokesprite has no Choice Belt art; `CARD_ITEM_OVERRIDES` maps it to `hold-item/choice-band`. A few Trainer-named key items (Super Rod, VS Seeker, Town Map, Exp. Share, Pal Pad, Dowsing Machine, Poké Flute, Old/Good Rod) are vendored alongside the item folders.
- TCGdex cards carry `trainerType`, not `subtypes`; the resolver reads both.
- PC Box CSS is a new layer file `css/deck-builder-pc-box.css` (imported after deck-builder-live.css) holding the Rodin @font-face; drawer rules appended to the end of index.css. Barlow is not loaded, so the stack falls back to IBM Plex/sans-serif after Rodin.
