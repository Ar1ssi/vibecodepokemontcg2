# Coin Catalog — Handoff

**Sessions**: 218 (expansion) · 219 (integrity + metadata + image sourcing)
**Status**: ✓ Complete — 939 coins, unique ids, **all 939 with real art**
**Design**: `.agent/designs/019-coin-catalog-metadata.md`

---

## What was done

### S218 — expansion
- Scraped Bulbapedia coin pages (Gens I–VIII) with Playwright and merged 740 historical coins
  with the 202 existing Gen IX entries.

### S219 — integrity + metadata (finishes/fixes S218)
S218's "zero duplicates" claim was wrong: the merge shipped **120 duplicate-`id` groups (302
entries)**, a polluted `release` (`"date\t<date>"`), and metal coins classified as enamel. S219:
1. **Normalized the catalog** with a committed, idempotent generator
   (`scripts/normalize-coin-catalog.mjs`): dropped 3 byte-identical duplicates (942 → **939**),
   re-keyed 299 entries to unique ids, cleaned 491 `release` values, reclassified 49 materials.
2. **Added metadata helpers** in `coins.mjs`: `COIN_MATERIALS`, `isPlaceholderCoin`,
   `filterCoins({term,material,region,hasImage})`, `groupCoinsByRelease` (variant counts),
   `getCoinStats`.
3. **Upgraded the picker** (`native-deck-builder-coin-picker.js`): real total in the header,
   material buttons incl. **Metal**/**Cardboard**, a region filter, an "Only with images" toggle,
   and release/region/date/variant metadata on the selected coin.
4. **Added image tooling and sourced the art**: `scripts/download-coin-images.mjs` +
   `core/coin-image-manifest.mjs` scrape the coin scans Bulbapedia publishes (plain `fetch`),
   download the 120px thumbnails into `client/src/assets/coins/historical/`, and link each coin
   to its scan by matching the catalog `description` to the wiki `Description:` text. The wiki
   had 720 unique scans (S218's "~12" was wrong); **all 737 historical coins matched**, so the
   catalog now has **0 placeholders**.
5. **Tests**: extended the coin catalog test and added `coin-metadata`, `coin-normalize`,
   `coin-image-manifest` suites. `pnpm test` = 2596 pass.

---

## Current state

### Catalog: `client/src/setup/deck-builder/core/coins.mjs`
- **939 coins**, every `id` unique. 202 Gen IX ids are frozen (decks persist `coin.id`).
- Fields: `id`, `url`, `thumb`, `name`, `material`, and (historical only) `release`,
  `releaseDate`, `region`, `description`.
- Materials: `gold` 163 · `silver` 252 · `metal` 45 · `enamel` 460 · `cardboard` 19.
- **Rewrite rule**: never hand-edit the array; run `node scripts/normalize-coin-catalog.mjs`
  (idempotent; `--check` fails if normalization is needed).

### Image coverage
| Status | Count | Notes |
|---|---|---|
| **Gen IX local art** | 202 | `client/src/assets/coins/*.png` |
| **Historical local art** | 737 | `client/src/assets/coins/historical/*` (720 unique files, ~19 MB, 120px) |
| **Placeholders** | 0 | |
| **Total** | 939 | |

`isPlaceholderCoin(coin)` is true iff the url contains `/coins/bulbapedia/` — the picker's
"Only with images" filter and `getCoinStats` use it. With everything linked it now matches nothing,
but it still guards any future placeholder rows.

---

## How to extend

### Add / edit coins
1. Edit the array in `coins.mjs` (or generate entries), then
   `node scripts/normalize-coin-catalog.mjs` to enforce unique ids + clean fields.
2. Run `pnpm test` (the catalog test asserts count, unique ids, allowed materials, clean release).

### Fetch newly published scans
```bash
node scripts/download-coin-images.mjs --dry-run           # list candidates
node scripts/download-coin-images.mjs                     # download + link into the catalog
node scripts/download-coin-images.mjs --no-link           # download + manifest only
node scripts/download-coin-images.mjs --full-size         # originals instead of 120px thumbs
node scripts/download-coin-images.mjs --from-file rows.json   # offline/partial
```
The script scrapes the three Bulbapedia pages, downloads the 120px thumbnails (the picker renders
coins at 84-120px), writes `client/src/assets/coins/historical/manifest.json`, then points every
matched coin's `url`/`thumb` at the local file and rewrites `coins.mjs`. Matching is by exact, then
prefix, normalized `description`; a coin with no wiki scan stays on its placeholder. Do **not** put
real art under `bulbapedia/`, or it will be treated as a placeholder.

### Add metadata filters
All facet logic lives in `filterCoins`; the picker only maps UI controls onto it.

---

## Known limitations / remaining work
- **All art is 120px.** Good for the current 84-120px coin UI; re-run with `--full-size` if a
  larger zoom is ever added (originals are ~10x the bytes).
- **No `rarity` field.** The source has none; it was deliberately not invented. Variant counts
  per release (`groupCoinsByRelease`) are the honest substitute.
- **No graceful card-style fallback UI** for a missing image; with 0 placeholders it is moot, but
  the picker still shows a "No scan available yet" note if a placeholder is ever re-added.
- `client/src/setup/deck-builder/core/coins.mjs.bak-urls` is a stale tracked backup — delete it (I67).

## References
- Design: `.agent/designs/019-coin-catalog-metadata.md`
- Normalizer: `scripts/normalize-coin-catalog.mjs`
- Downloader: `scripts/download-coin-images.mjs` · helper `client/src/setup/deck-builder/core/coin-image-manifest.mjs`
- Picker: `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-coin-picker.js`
- Tests: `client/src/setup/deck-builder/__tests__/{sleeves,coin-metadata,coin-normalize,coin-image-manifest}.test.mjs`
