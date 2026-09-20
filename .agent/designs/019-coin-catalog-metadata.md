# 019: Coin catalog metadata & integrity
Status: shipped
Date: 2026-09-20 · Session: S219

## Problem
The S218 coin expansion (202 → 942, commit a9bb70a) shipped a catalog whose handoff claims
"zero duplicates" but which actually contains 120 duplicate-`id` groups (302 entries), 494
entries with a polluted `release` (`"date\t<date>"`), and 48 metal coins misclassified as
`enamel`. `getCoinById`/selection key off `id`, so duplicate-id coins are indistinguishable.
The picker also still hardcodes "Generation IX · 200" and offers only gold/silver/enamel
filters. There is no repeatable way to fetch the few coin scans Bulbapedia publishes.

## Constraints
- `.agent/PROJECT.md`: no mock/fabricated data outside tests. `rarity` does not exist in the
  scraped source — it will NOT be invented.
- Saved decks persist `coin.id` (`native-deck-builder.js`) — the 202 original Gen IX ids must
  not change.
- Client is DOM-light ES modules; catalog is a generated data file (`coins.mjs`).
- Test globs: `client/**/*.test.mjs` etc.; `scripts/**` is not tested.

## Current state
- `client/src/setup/deck-builder/core/coins.mjs` — 942-entry `GEN_IX_COINS` array; exports
  `getCoins`, `getCoinById`, `filterCoinsByName`. Generated with `' ' + JSON.stringify(entry, null, 2)`
  per entry, joined by `,\n`.
- `client/src/initialization/.../native-deck-builder-coin-picker.js` — renders preview + grid,
  material filter buttons (all/gold/silver/enamel), name filter; hardcoded "Generation IX · 200".
- `client/src/setup/rules/mat-coin.js` — renders `coin-mat-${material}`; uses `coin.thumb`.
- `client/src/css/index.css:4460-4628` — coin materials (gold/silver/enamel); `status-marker.css`
  already styles `.coin-mat-cardboard`.
- `scrape-bulbapedia-coins.mjs` (untracked root script) — logs scraped rows; downloads nothing.

## Options
1. **Integrity fix loc:** (A) hand-edit 740 entries — infeasible. (B) normalise at runtime in
   `getCoins()` — hides the defect, ids depend on array order. **(C) committed generator
   `scripts/normalize-coin-catalog.mjs` that rewrites the data block** — chosen: data is truth,
   auditable, idempotent.
2. **Unique id scheme:** append a compact release date, then an occurrence index on residual
   collision. Chosen over a full re-key (breaks 202 saved ids) and over content hashing
   (unreadable ids).
3. **Exact duplicates:** 3 entries are byte-identical (`DATE_AUGUST_METAL_COIN` copies). Drop
   them → 939 (finishes the handoff's stated dedup intent) over keeping fake-count padding.
4. **Metal:** material moves `enamel` → `metal` for the 48 metal coins; add a `metal` filter and
   rim CSS. Chosen so material filters are truthful; alternative (leave as enamel) keeps the
   filter lie.
5. **Missing-image detection:** `isPlaceholderCoin` = url contains `/coins/bulbapedia/`. Real
   images never live there (12 hand-links are remote http; downloader writes `historical/`).
   Avoids a filesystem check in the browser.
6. **Downloader shape:** Playwright scraper + downloader in `scripts/`, pure parsing/slug/manifest
   helpers in `client/src/setup/deck-builder/core/coin-image-manifest.mjs` (testable under the
   glob). Chosen over inlining helpers (untestable) and over a HTML-parser dependency (new dep).
7. **Image linking:** downloader writes a manifest only; never rewrites `coins.mjs`. Avoids
   silently attaching a wrong scan to a coin.

## Design
Data transform (`scripts/normalize-coin-catalog.mjs`, pure fns exported for reuse):
- `cleanRelease(v)` → strip `^date\b[:\s]*`, collapse whitespace, trim.
- `inferMaterial(coin)` → `metal` if name/description has a word-boundary "metal", else existing.
- `normalizeCoins(coins)` → dedupe exact-equal entries (keep first), clean release, infer material,
  then assign unique ids in array order: keep `base` if unseen else `${base}_${stamp}` where
  `stamp` = `YYYYMMDD`/`YYYYMM` parsed from `releaseDate`, else `nd`; while still seen append `_k`.
  Returns `{ coins, dropped, rekeyed }` for a printed report.

Catalog exports (`coins.mjs`, added):
- `COIN_MATERIALS = ['gold','silver','metal','enamel','cardboard']`
- `isPlaceholderCoin(coin)` → `/\/coins\/bulbapedia\//.test(String(coin?.url||''))`
- `filterCoins(coins = [], { term, material, region, hasImage } = {})` → trimmed lowercase name
  substring AND material equality AND region equality AND (!hasImage || !isPlaceholderCoin).
- `groupCoinsByRelease(coins = [])` → groups keyed by cleaned `release` for coins that have one;
  each `{ release, region, releaseDate, count, coinIds }`, sorted count desc then release asc.
- `getCoinStats(coins = [])` → `{ total, byMaterial, byRegion, releaseGroups, withImage, placeholders }`.

Picker (`native-deck-builder-coin-picker.js`):
- header tag = `` `All generations · ${coins.length}` ``.
- material buttons All/Gold/Silver/Metal/Color(enamel)/Cardboard (data-mat values).
- region `<select>` populated from coins; "Only with images" checkbox.
- preview text adds release · region · releaseDate and "N variants" from `groupCoinsByRelease`.
- `renderGallery` uses `filterCoins`. Selected highlight by `id` (now unique).

Downloader (`scripts/download-coin-images.mjs`):
- Playwright loads the three `Coin_(TCG)/Generations_*` pages, extracts rows {name, release,
  imageUrl}.
- Pure `coin-image-manifest.mjs`: `wikiImageUrl(src)` (absolutise + strip `/thumb/` scaling),
  `imageFileName(url)`, `buildManifest(rows)` (dedupe by filename, keep first).
- Downloads unique images to `client/src/assets/coins/historical/` (skip existing), writes
  `manifest.json`. Flags `--dry-run`, `--limit N`, `--out <dir>`. Per-URL failures log and continue.

CSS: add `.coin-mat-metal .coin-face` rim + `::after` sweep mirroring silver in `index.css`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty coins array | helpers return `[]`/zeroed stats, no throw | unit tests |
| 2 | coin missing name/url/release | `String(x||'')` guards; group skips | unit tests |
| 3 | 0/1 coin, single-release group | correct `count:1`, stable sort | unit tests |
| 4 | normalizer run twice | byte-identical output (idempotent) | unit test + run |
| 5 | wiki fetch fails | log error, continue other pages, exit 0 | manual / code path |
| 6 | image 404 mid-batch | skip+continue; already-downloaded files remain, rerun resumes | manual / code path |
| 7 | duplicate id after normalization | test asserts uniqueness → fails CI | catalog test |
| 8 | `getCoinById` miss | returns null (unchanged) | existing behavior + test |

## Test plan
- `client/src/setup/deck-builder/__tests__/sleeves.test.mjs`: update coin test to 939, assert
  unique ids, allowed materials, non-`date` release, url/thumb/name/material present.
- New `client/src/setup/deck-builder/__tests__/coin-metadata.test.mjs`: `filterCoins`,
  `groupCoinsByRelease`, `getCoinStats`, `isPlaceholderCoin`, empty/malformed inputs.
- New `client/src/setup/deck-builder/__tests__/coin-image-manifest.test.mjs`: URL/path helpers
  and manifest dedupe.
- Manual: run normalizer, inspect report; launch picker and click Metal/Cardboard/region filters.

## Migration / rollout
One-shot data rewrite of the 740 S218 entries (ids + `release` + `material`); 202 Gen IX ids
frozen. Revert path: `git checkout -- client/src/setup/deck-builder/core/coins.mjs` (and the
test count). Saved decks referencing the 12 hand-linked historical ids will re-resolve only if
their id was a collision leader; those coins were effectively unselectable, noted as a risk.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | normalize script + rewritten coins.mjs; catalog test updated | `node --test sleeves.test.mjs` passes |
| 2 | metadata helpers + coin-metadata tests | tests pass |
| 3 | picker labels/filters/preview + metal CSS | manual picker check; lint |
| 4 | downloader + manifest helper + tests | tests pass |

## Deviations (Builder appends here during build)
- `rarity` intentionally omitted: no source field exists; fabricating it violates the no-mock
  constraint. Variant counts (groupCoinsByRelease) are the honest substitute.
- Material inference also corrected 20 of the frozen Gen IX coins (19 "Metal …" + 1 "Cardboard …").
  Names are explicit, so this is a truthful fix; ids stayed frozen.
- `scripts/download-coin-images.mjs` gained `--from-file` so the manifest/download pipeline is
  verifiable offline. Verified end-to-end against a fixture + one real archives.bulbagarden.net
  fetch; the live Bulbapedia *wiki* scrape was not reproducible in this environment (network hang)
  and is the one unverified path.
- The picker gained a region `<select>`, an "only with images" toggle, and a gallery meta line
  beyond the design's minimum, all fed by `filterCoins`.
