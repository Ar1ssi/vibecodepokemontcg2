# 040: Transform-form sprites
Status: shipped
Date: 2026-09-25 · Session: S304

## Problem
The deck builder only knows base forms for species whose alternate looks come from transformation.
Searching "kyurem" shows Kyurem but not Black/White Kyurem; "necrozma" misses Dawn Wings / Dusk
Mane / Ultra; the same holds for Rotom appliances, Calyrex riders, Origin formes, Ash-Greninja,
and the rest. A deck whose cards name the form (Black Kyurem ex, Dawn Wings Necrozma-GX) also
shows base-form art in the deck list and deck strip.

## Constraints
- Art is vendored (D97); `scripts/generate-pokemon-sprites.mjs` is the only network caller and
  fetches per file from jsDelivr (design 024).
- The catalog is a generated module (design 024 pick C); gen-9 art is hand-kept (D100/D101).
  Every species here is gen ≤ 8, so gen-8 pokesprite art applies.
- The catalog integrity test already promises a regular + shiny PNG for every slug; a row whose
  art is missing upstream must be dropped, never emitted.
- `card-sprites.mjs` stays pure (D98); `pokemonSpriteForName(cardName, {types})` signature is
  unchanged so the renderers need no edit.
- Search/UI are data-driven (`searchPokemon` groups by `species`), so no UI change is planned.

## Current state
- `scripts/generate-pokemon-sprites.mjs` — `FORMS` (mega, mega-x/y, primal, gmax, alola, galar,
  hisui, hisui-noble) is applied to every species; `toCatalog` emits base + any present form,
  then the download loop drops slugs whose art 404s.
- `core/pokemon-sprite-catalog.generated.mjs` — base species + those forms; only base Kyurem /
  Necrozma / Rotom / etc. exist.
- `core/deck-sprites.mjs` — `searchPokemon` ranks by `species`, so any entry added next to its
  species is found by the species query; `hasShinySprite` is true for every gen-8 slug.
- `core/card-sprites.mjs` — `pokemonSpriteForName` strips rule-box suffixes, owner/decorative
  prefixes, then handles mega / primal / regional / named-mask prefixes, `VMAX → gmax`,
  `EX_CARD_FORMS` (Terapagos, Palafin), Paldean Tauros breed by `types`; otherwise
  `findBaseSpecies` falls back to the base species.

## Options
**A. Where the new form data lives** — (1) hardcode each card name into `card-sprites.mjs`;
(2) add the forms to the generated catalog and resolve names against it.
- (1) two data sources that drift; picker and card parser must be edited per species.
- (2) one source; the existing integrity test covers the art; the parser needs no species list.
**Pick: (2)**.

**B. How a card name reaches a form** — (1) one regex branch per form in the name chain;
(2) exact normalized match against catalog form display names, plus a small alias table for TCG
wordings that differ (Castform "Rain Form", Deoxys "Attack Forme" order).
- (1) the chain grows by ~30 branches and each future form needs a parser edit.
- (2) new catalog rows become resolvable automatically; aliases are only the genuine wording gaps.
**Pick: (2)**; prefix chain still runs first so regional/VMAX/strike handling keeps working.

**C. Arceus + Silvally type forms (Multitype / RKS System)** — include or exclude.
- Excluding keeps the catalog to in-battle transformations.
- Including (user call) adds 34 picker rows and lets a card's `types` pick the sprite, matching
  the Paldean Tauros precedent.
**Pick: include** — user decision, and type forms are unreachable by card name.

**D. Battle forms the TCG never names** (Zacian Crowned, Wishiwashi School, Mimikyu Busted, …) —
map from card name cues or leave to the picker.
- Name cues are ambiguous or absent (Lycanroc-GX has three printings with three forms;
  `pokesprite` has no busted-Mimikyu art at all).
- One cue is definitional: Eternatus VMAX always depicts Eternamax Eternatus.
**Pick: picker-selectable only, plus `VMAX_CARD_FORMS = { eternatus: 'eternamax' }`**.
No other cue mappings; those cards keep base art.

## Design

### Generated data (`scripts/generate-pokemon-sprites.mjs` → catalog)
Rows keep the shape `{ idx, name, slug, species, form }`. Two new tables:

`SPECIES_FORMS` (slug → ordered `{ key, label }`), appended after the generic `FORMS` so a
species reads base, Mega/Gmax/regional, then transform forms:

| species | forms (pokesprite key → label) |
|---|---|
| castform | sunny → Sunny Castform · rainy → Rainy Castform · snowy → Snowy Castform |
| cherrim | sunshine → Sunshine Cherrim |
| deoxys | attack → Attack Forme Deoxys · defense → Defense Forme Deoxys · speed → Speed Forme Deoxys |
| dialga / palkia / giratina | origin → Origin Forme \<name\> |
| shaymin | sky → Sky Forme Shaymin |
| rotom | heat → Heat Rotom · wash → Wash Rotom · frost → Frost Rotom · fan → Fan Rotom · mow → Mow Rotom |
| darmanitan | zen → Zen Mode Darmanitan · galar-zen → Galarian Zen Mode Darmanitan |
| kyurem | black → Black Kyurem · white → White Kyurem |
| keldeo | resolute → Resolute Form Keldeo |
| meloetta | pirouette → Pirouette Form Meloetta |
| aegislash | blade → Blade Form Aegislash |
| zygarde | 10 → Zygarde 10% Forme · complete → Zygarde Complete Forme |
| hoopa | unbound → Hoopa Unbound |
| oricorio | pom-pom → Pom-Pom Style Oricorio · pau → Pa'u Style Oricorio · sensu → Sensu Style Oricorio |
| lycanroc | dusk → Dusk Form Lycanroc · midnight → Midnight Form Lycanroc |
| wishiwashi | school → School Form Wishiwashi |
| necrozma | dawn → Dawn Wings Necrozma · dusk → Dusk Mane Necrozma · ultra → Ultra Necrozma |
| cramorant | gulping → Gulping Cramorant · gorging → Gorging Cramorant |
| toxtricity | low-key → Low Key Form Toxtricity |
| eiscue | noice → Noice Face Eiscue |
| morpeko | hangry → Hangry Mode Morpeko |
| zacian | crowned → Crowned Sword Zacian |
| zamazenta | crowned → Crowned Shield Zamazenta |
| eternatus | eternamax → Eternamax Eternatus |
| urshifu | rapid-strike-gmax → Gigantamax Rapid Strike Urshifu |
| calyrex | ice-rider → Ice Rider Calyrex · shadow-rider → Shadow Rider Calyrex |
| xerneas | active → Active Mode Xerneas |
| tornadus / thundurus / landorus / enamorus | therian → Therian Forme \<name\> |
| greninja | ash → Ash Greninja |

`TYPE_FORMS` (type-form species → label prefix): arceus and silvally, one row per real type form
(bug, dark, dragon, electric, fairy, fighting, fire, flying, ghost, grass, ground, ice, poison,
psychic, rock, steel, water) labelled `<Type> <species>`; `normal` aliases the base sprite and
`arceus-unknown` is an unofficial icon, so both are omitted.

`toCatalog` skips any form whose pokesprite metadata has `is_alias_of` (no file exists upstream),
which keeps the 404-drop path as the backstop. Expected delta: 52 transform rows + 34 type rows =
86 rows, 172 vendor PNGs.

### `core/card-sprites.mjs`
- `FORM_BY_NAME`: `nameKey(entry.name) → entry` for every catalog entry with `form !== null`.
- `FORM_NAME_ALIASES`: `nameKey(card name) → slug`, only where TCG wording differs:
  `raincastform` / `castformrainform` / `castformrainyform` → `castform-rainy`;
  `snowcloudcastform` / `castformsnowcloudform` / `castformsnowyform` → `castform-snowy`;
  `sunnycastform` / `castformsunnyform` → `castform-sunny`;
  `deoxysattackforme` → `deoxys-attack`; `deoxysdefenseforme` → `deoxys-defense`;
  `deoxysspeedforme` → `deoxys-speed`; `deoxysnormalforme` → `deoxys`.
- `TYPE_CARD_FORMS = { arceus: {...}, silvally: {...} }` maps a printed TCG type to a form key:
  grass→grass, fire→fire, water→water, lightning→electric, psychic→psychic, fighting→fighting,
  darkness→dark, metal→steel, fairy→fairy, dragon→dragon; anything else (incl. Colorless) → base.
- `VMAX_CARD_FORMS = { eternatus: 'eternamax' }`.
- Resolution order inside `pokemonSpriteForName` (only the marked steps change):
  1. strip suffixes / owner / decorative prefixes (unchanged).
  2. prefix chain: mega, primal, regional, named masks (unchanged); **add
     `/^(single|rapid)[\s-]+strike\s+(.+)$/i`** → `rapid-strike-gmax` for Rapid Strike VMAX,
     `gmax` for Single Strike VMAX, no form otherwise (pokesprite has no regular Rapid Strike).
  3. **if no form yet: exact `FORM_BY_NAME` hit, then `FORM_NAME_ALIASES`** → return that entry.
  4. `findBaseSpecies` (unchanged).
  5. Paldean Tauros `types` override (unchanged).
  6. **if no form: `TYPE_CARD_FORMS[base.slug]` from `types`** (base on no/unknown type).
  7. **if no form: `VMAX_CARD_FORMS[base.slug] ?? 'gmax'` when `isVmax`** (moved after base so
     the Eternatus override can win).
  8. EX form map (unchanged) and `${base.slug}-${form}` lookup with base fallback (unchanged).

### Unchanged
`deck-sprites.mjs`, the picker/renderers, EJS and CSS need no edit: results are catalog-driven.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | form art missing upstream / alias | generator skips or 404-drops the row; base sprite still resolves | [x] card-sprites "a form with no sprite falls back to the base species"; build: 86/86 rows have art |
| 2 | new form has no shiny art | `hasShinySprite` false and shiny is never stored | [x] deck-sprites "every catalog entry resolves to sprite files on disk, shiny or not" |
| 3 | card name equals a form display name ("Fan Rotom") | form wins over `findBaseSpecies` | [x] card-sprites "transform-form card names resolve to their form sprite" |
| 4 | irregular TCG wording ("Castform Rain Form", "Deoxys Attack Forme") | alias table resolves it | [x] card-sprites "castform and deoxys card wordings resolve through aliases" |
| 5 | Arceus/Silvally card with no `types` or Colorless | base sprite | [x] card-sprites "Arceus and Silvally pick their type form from the card types" |
| 6 | VMAX/rules-suffix regression | Charizard VMAX still gmax, Mew VMAX still base, Paldean Tauros breeds unchanged | [x] card-sprites "Mega, Primal…" + "a form with no sprite…" + "a Paldean Tauros card picks its breed" |
| 7 | Rapid/Single Strike VMAX | rapid → `urshifu-rapid-strike-gmax`; single → `urshifu-gmax` | [x] card-sprites "strike-style Urshifu VMAX picks the matching Gigantamax form" |
| 8 | empty / unknown card name | `null` as today | [x] card-sprites "unknown or empty names give no sprite" |
| 9 | catalog integrity after regeneration | every slug has regular + shiny PNG on disk | [x] deck-sprites "every catalog entry resolves to sprite files on disk, shiny or not" |
| 10 | species search grouping | base leads, forms follow in catalog order | [x] deck-sprites "transform forms are searchable under their species and carry art" |
| 11 | cosmetic-only forms stay absent | unown/vivillon/pikachu-libre still null | [x] deck-sprites "cosmetic-only forms are deliberately absent" |

## Test plan
- `card-sprites.test.mjs` — new: transform name resolution (Black/White Kyurem, the three
  Necrozma forms, Rotom appliances, Origin formes, Ice/Shadow Rider Calyrex, Ash-Greninja,
  Castform aliases, Deoxys aliases), strike VMAX, Arceus/Silvally type + Colorless + missing
  types, Eternatus VMAX; regressions: Charizard VMAX, Mew VMAX, Paldean Tauros.
- `deck-sprites.test.mjs` — new: search "kyurem" / "necrozma" / "arceus" returns the base first
  followed by its forms; a new form is addable, labellable and shiny-capable; keep the
  cosmetic-absence test.
- Full `pnpm test` once before close; `npx eslint --quiet` on the two edited sources.

## Migration / rollout
No stored-data change: decks persist slugs and no slug changes meaning. Revert path is the
revert of this commit (generated rows + PNGs); unknown slugs were already dropped by
`normalizeDeckSprites`, so a deck that pinned a new form loads as an empty slot on old builds.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | generator tables + skipped aliases + regenerated catalog/art | catalog integrity test passes incl. new slugs |
| 2 | card-sprites resolution + both test files | targeted tests green, then full `pnpm test` |

## Deviations (Builder appends here during build)
- The pre-existing card-sprites test "descriptive prefixes the rules do not know still find the
  species" asserted `Origin Forme Dialga VSTAR → dialga`; Origin Forme is now a known form, so the
  unknown-prefix case was changed to Armored Mewtwo (still `mewtwo`) and the Dialga assertion moved
  into the transform-form test expecting `dialga-origin`.
- `toCatalog` now skips `is_alias_of` forms for the generic Mega/Gmax/regional table too, not just
  the new tables: aliases have no upstream file, so this only removes doomed 404 requests. The
  regenerated catalog shows additions only (86 rows, no removals).
- Search/UI needed no code change, as designed; the user-facing exercise was done at module level
  (search → add → image URL) plus the full suite. A browser look at the picker is left to the user.
