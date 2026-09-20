# Coin Catalog — Handoff

**Sessions**: 218 (expansion) · 219 (integrity + metadata)
**Status**: ✓ Complete — 939-entry normalized catalog, metadata/filter UI, download tooling
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
4. **Added image tooling**: `scripts/download-coin-images.mjs` + `core/coin-image-manifest.mjs`
   download available Bulbapedia scans to `client/src/assets/coins/historical/` and write a
   manifest. It never edits the catalog — linking is a reviewed, manual step.
5. **Tests**: extended the coin catalog test and added `coin-metadata`, `coin-normalize`,
   `coin-image-manifest` suites. `pnpm test` = 2553 pass.

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
| **Real art** | 214 | 202 local Gen IX files + 12 remote Bulbapedia scans |
| **Placeholders** | 725 | `src/assets/coins/bulbapedia/{ID}.jpg` — no scan published |
| **Total** | 939 | |

`isPlaceholderCoin(coin)` is true iff the url contains `/coins/bulbapedia/` — the picker's
"Only with images" filter and `getCoinStats` use it.

---

## How to extend

### Add / edit coins
1. Edit the array in `coins.mjs` (or generate entries), then
   `node scripts/normalize-coin-catalog.mjs` to enforce unique ids + clean fields.
2. Run `pnpm test` (the catalog test asserts count, unique ids, allowed materials, clean release).

### Fetch newly published scans
```bash
node scripts/download-coin-images.mjs --dry-run           # list candidates
node scripts/download-coin-images.mjs                     # download to client/src/assets/coins/historical/
node scripts/download-coin-images.mjs --limit 5 --from-file rows.json   # offline/partial
```
Then review `client/src/assets/coins/historical/manifest.json` and point the matching coin's
`url`/`thumb` at the local file (`src/assets/coins/historical/<file>`). Do **not** put real art
under `bulbapedia/`, or it will be treated as a placeholder.

### Add metadata filters
All facet logic lives in `filterCoins`; the picker only maps UI controls onto it.

---

## Known limitations / remaining work
- **725 coins lack scans.** Bulbapedia publishes ~12; the rest need collectors, PTCGO/eBay
  archives, or manual sourcing. No fabricated art.
- **No `rarity` field.** The source has none; it was deliberately not invented. Variant counts
  per release (`groupCoinsByRelease`) are the honest substitute.
- **Live `download-coin-images.mjs` wiki scrape is unverified in some environments** — the
  Playwright navigation to `bulbapedia.bulbagarden.net` hung in S219; the pure parsing/manifest
  logic and a real `archives.bulbagarden.net` image fetch are verified.
- **Graceful card-style fallback UI** for missing images is still not implemented (the picker
  shows a "No scan available yet" note; broken-image icons remain in the grid).
- `client/src/setup/deck-builder/core/coins.mjs.bak-urls` is a stale tracked backup — delete it (I67).

## References
- Design: `.agent/designs/019-coin-catalog-metadata.md`
- Normalizer: `scripts/normalize-coin-catalog.mjs`
- Downloader: `scripts/download-coin-images.mjs` · helper `client/src/setup/deck-builder/core/coin-image-manifest.mjs`
- Picker: `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-coin-picker.js`
- Tests: `client/src/setup/deck-builder/__tests__/{sleeves,coin-metadata,coin-normalize,coin-image-manifest}.test.mjs`
