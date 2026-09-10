# 006: Generation pills in Browse Sets
Status: shipped
Date: 2026-09-10 · Session: S89
Renumbered from 005: a concurrent session shipped an unrelated "005: 3D energy tokens" design
and merged to main first — see `005-3d-energy-tokens.md`. D22/D23 below are likewise renumbered
D24/D25 in DECISIONS.md for the same reason.

## Problem
Browse Sets panel (native-deck-builder-set-browser.js) only shows the current Standard-legal
sets plus an "other" bucket, sourced from a hand-maintained `LEGAL_SET_REGISTRY`. User wants nine
more pills, "Generation 9" through "Generation 1", each loading every set from that TCG era so
older/rotated cards are browsable too.

## Constraints
- Reuse the existing pill → category → tabs/dropdown render flow (native-deck-builder-set-browser.js);
  no new panel or route.
- Card data still comes from TCGdex (`api.tcgdex.net`); no new dependency (D4/D18 precedent).
- Gen 9 = Scarlet & Violet series only, explicitly excluding Mega Evolution (user's explicit call).
- Ignore POP sets, "Other", and "Misc" categories (user's explicit call).
- Classic sets = Generation 1 (user's explicit call).

## Current state
- `client/src/setup/deck-builder/core/set-browser.mjs` — `LEGAL_SET_REGISTRY` (hand-maintained
  array of `{series, setId, name?, category?}`), `fetchLegalStandardSets()` resolves each entry
  via `fetchSetRecord` (TCGdex `/sets/{id}`), sorts newest-first, appends a synthetic Energy tab.
- `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-set-browser.js`
  — owns `sets`/`loaded`/`activeCategory` state for a *single* dataset, two pills ("Standard
  2026-27" / "other") toggle `activeCategory` and filter the one loaded `sets` array client-side.
  Tabs expand lazily into `fetchSetCards(setId)`.
- TCGdex groups every set under a `series` (confirmed live: `GET /v2/en/series` → id/name pairs
  `base, gym, neo, lc, ecard, ex, pop, tk, dp, pl, hgss, col, bw, mc, xy, sm, swsh, sv, tcgp, me`)
  and `GET /v2/en/series/{id}` returns `{id, name, sets: [{id, name, ...}]}` — a ready-made
  "every set in this era" endpoint, confirmed live via browser fetch this session.

## Options
**Data source for generation sets.** A) Hand-maintain a `GENERATION_SET_REGISTRY` array like
`LEGAL_SET_REGISTRY`, one row per set. B) Use TCGdex's own `series` grouping dynamically.
Pick: B — TCGdex's series boundaries already match the pkmncards.com era headers almost exactly
(verified against the live pkmncards.com/sets/ listing this session), a hand-built registry for
~150 historical sets is a large error surface for zero benefit, and it makes "ignore POP/Other/
Misc" free: those are their own separate TCGdex series (`pop`, `mc`, `misc`), never mixed into an
era series, so excluding series ids also excludes them without per-set filtering.

**Generation → series mapping** (user-decided this session):
| Gen | TCGdex series |
|---|---|
| 9 | `sv` |
| 8 | `swsh` |
| 7 | `sm` |
| 6 | `xy` |
| 5 | `bw` |
| 4 | `dp`, `pl` |
| 3 | `ecard`, `ex` |
| 2 | `neo` |
| 1 | `base`, `gym` |

Excluded entirely (not reachable from any pill): `me` (Mega Evolution — user's explicit Gen9
exclusion), `pop`, `mc`, `tk`, `misc`, `lc` (Legendary Collection), `col` (Call of Legends —
explicit: HGSS-era stays out of Gen4), `hgss`, `tcgp` (digital-only, not a physical-TCG era).

**Panel state shape.** A) Keep one `sets` array, refetch/overwrite on every pill click. B) Cache
per-category (`Map<categoryId, {sets, loaded, loading}>`). Pick: B — generation fetches hit the
network (series list + per-set record); a user flipping between pills repeatedly (which the
existing UX already invites — filter-while-browsing) shouldn't re-fetch every time, and the
existing `cardsBySet`/`pendingBySet` per-set-card caches are unaffected either way (set ids are
globally unique across generations).

## Design
### `set-browser.mjs` additions
```js
export const GENERATION_SERIES = {
  9: ['sv'], 8: ['swsh'], 7: ['sm'], 6: ['xy'], 5: ['bw'],
  4: ['dp', 'pl'], 3: ['ecard', 'ex'], 2: ['neo'], 1: ['base', 'gym'],
};
export const GENERATIONS = [9, 8, 7, 6, 5, 4, 3, 2, 1]; // display order

const seriesRecordCache = new Map(); // seriesId -> Promise<{id,name,sets:[{id,name,...}]}>
async function fetchSeriesRecord(seriesId) { /* fetchJson(`${TCGDEX_BASE}/series/${seriesId}`), memoized */ }

// Every set belonging to a generation, newest first, same shape fetchLegalStandardSets returns
// (setId, name, seriesId, releaseDate, logo, symbol, cardCount, category: 'generation').
export async function fetchGenerationSets(generation) {
  const seriesIds = GENERATION_SERIES[generation] || [];
  const seriesRecords = await Promise.all(seriesIds.map((id) => fetchSeriesRecord(id).catch(() => null)));
  const setStubs = seriesRecords.filter(Boolean).flatMap((rec) =>
    (rec.sets || []).map((s) => ({ setId: s.id, series: rec.id })));
  // resolve each stub to a full record via the existing fetchSetRecord cache, same
  // shape/filter/sort as fetchLegalStandardSets (cardCount > 0, releaseDate desc).
}
```
`fetchSetRecord`'s existing `setRecordCache` is reused unchanged (cache key is `series/setId`,
and TCGdex set ids are unique across series so no collisions).

### `native-deck-builder-set-browser.js` changes
- Replace the two hardcoded pill buttons with a generated row: the existing "Standard 2026-27"
  and "other" pills, followed by one pill per `GENERATIONS` entry, label `Generation ${n}`,
  `data-category="gen${n}"`.
- Replace module state `sets`/`loaded`/`loading` with `categoryState = new Map()` keyed by
  category id (`'standard'`, `'other'`, `'gen9'`..`'gen1'`), each entry `{sets, loaded, loading}`.
  `standard`/`other` both read from one `fetchLegalStandardSets()` call (unchanged — they're a
  client-side filter over one payload today; keep that, store the combined payload under a
  shared `'standard'` cache entry and have `'other'` reuse it without duplicate section removal).
- `render()` and `wireEvents()` read from `categoryState.get(activeCategory)` instead of the
  module-level `sets`; `load()` becomes `loadCategory(categoryId)`, called on pill click (and once
  eagerly for `'standard'` on panel open, matching today's `load()` call site in
  native-deck-builder.js:260).
- Generation categories render as a single unlabeled group (`renderGroup('', groupSets)` — reuse
  the existing group renderer, sets already carry their own logo/name per tab) rather than the
  standard/other split, since a generation has no further sub-grouping.
- Category pill row overflows on 11 pills at 1.25vh font in a narrow sidebox — wrap the row
  (`flex-wrap: wrap`) rather than horizontal-scroll, matching how the panel already reflows for
  narrow widths elsewhere (no fixed-width containers upstream of this row).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty generation (series fetch returns no sets) | pill shows "No sets available." (existing empty-state branch in `render()`) | [x] covered: manual — reused code path, no new branch needed |
| 2 | one series in a generation 404s (e.g. `ex` down, `ecard` up) | `.catch(() => null)` drops only that series; the other's sets still render | [x] covered: `generation-sets.test.mjs` — one series rejects |
| 3 | switching pills mid-fetch (double-click gen9 then gen8) | `loading` flag on the *target* category's cache entry gates re-entry; a stale in-flight fetch for a category the user left still resolves into that category's cache entry, not into whatever is active — render() only reads `activeCategory`'s entry so a late resolve for an abandoned pill just updates cold cache | [x] covered: `generation-sets.test.mjs` — concurrent category switch |
| 4 | repeat click on the already-active pill | no-op (`setCategory` early-returns when `category === activeCategory`, unchanged from today) | [x] covered: existing behavior, untouched |
| 5 | a set id appears in two series (shouldn't per TCGdex's model, but defensive) | de-dupe by `setId` when merging series' set lists, same pattern as `fetchLegalEnergyCards`'s `seenIds` | [x] covered: `generation-sets.test.mjs` — duplicate setId across two series stubs |
| 6 | TCGdex series id typo / removed series (`/series/{id}` 404s) | same as #2 — that one series contributes zero sets, doesn't blank the whole pill | [x] covered: same test as #2 |

## Test plan
Unit tests (`node --test`, no network) in `client/src/setup/deck-builder/core/__tests__/`:
stub `global.fetch` to return canned series/set-record JSON, assert `fetchGenerationSets`
merges/dedupes/sorts/filters (`cardCount > 0`) correctly and tolerates a rejected series.
No e2e — CLAUDE.md project memory says CSS/visual verification here is user-side on localhost,
not Claude-driven browser automation; the pill click wiring itself is exercised by existing
`wireEvents`/`render` code paths already covered indirectly, and this session will hand the user
a "click Generation 1, expect Base Set 1999 first, no POP/Trainer Kit clutter" smoke check.

## Migration / rollout
n/a — additive UI, no schema/data change, no flag needed (mirrors how `LEGAL_SET_REGISTRY`
already ships un-flagged).

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `fetchGenerationSets` + `GENERATION_SERIES`/`GENERATIONS` in set-browser.mjs, unit tests | `pnpm test` green, new tests pass |
| 2 | Pill row + per-category cache refactor in native-deck-builder-set-browser.js | `pnpm test` green; user smoke-checks on localhost |

## Deviations
- 2026-09-10 (same session, user follow-up): added a synthetic "Energy" tab per generation
  pill, mirroring the Standard view's existing `ENERGY_SET_ID` tab (D18) — aggregates every
  Energy card (basic + special + rarer variants) printed across that generation's own sets,
  using the same `colorless.png` logo. Required factoring `fetchEnergyCardsForSetEntries`
  (shared match/hydrate core) out of `fetchLegalEnergyCards`, and `fetchGenerationSetStubs`
  (shared, cached per-generation set-id list) out of `fetchGenerationSets`, so
  `fetchGenerationEnergyCards(generation)` and `fetchGenerationSets(generation)` agree on
  exactly which sets a generation covers. Deliberately does NOT include the Standard view's
  `MODERN_BASIC_ENERGY_TYPES`/`EXTRA_ENERGY_CARD_REFS` extras — those exist only to backfill
  sets that rotated out of `LEGAL_SET_REGISTRY`; a generation's own set list already includes
  every set it ever had, so the normal per-set Energy-category sweep already covers rarer
  variants (gold secrets, alternate arts) without a hardcoded list. New synthetic set id
  `__energy_gen<N>__` (`generationEnergySetId`), routed in `fetchSetCards`. +4 tests.
