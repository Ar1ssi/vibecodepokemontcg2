# 069: Deck suggestions tab (tournament data from Limitless)
Status: draft — waiting on the user's calls in "Open questions"
Date: 2026-10-15 · Session: cloud, branch claude/jolly-edison-bm3xkm

## Problem
The Standard deck builder only finds cards you already know to search for. Players building a
meta deck (or brewing around one Pokémon) want to see what strong players actually run next to
their cards: the missing staples, normal counts, common techs, and odd picks worth cutting.
Limitless TCG publishes every Regional, International, Special Event and Worlds decklist, so the
data exists. Nothing in the repo reads it yet.

## Constraints
- No build step, native ESM in the browser, no bundler (PROJECT.md). Small, private scale: pick
  the simple mechanism (PROJECT.md).
- Pure logic in `core/`, DOM in `sidebox/native-deck-builder-*.js` (D96). Pure modules get
  `node --test` coverage with stub cards, no jsdom (PROJECT.md).
- The builder runs in its own tab; deck writes go through `gameLink` and the library rules of
  D183. A new tab is a panel controller like the Browse Sets panel. It does not touch the game tab.
- Card identity: the builder's deck is `{ [name]: { cards: [{ data, count }], totalCount } }` with
  TCGdex records as `data` (core/deck-state.mjs). The 4-copy rule groups by `officialCardName` (D64).
- Card text and set mappings are looked up, never recalled (CLAUDE.md directive 7). Limitless set
  codes map to TCGdex through `resolveTcgdexSetId` / `buildSetCardIdCandidates`
  (shared/engine/rules/legacy-set-ids.mjs). That table already holds MEE and 30C, which the smaller
  `SET_MAP` in scripts/lib/decklist-lines.mjs lacks.
- Being a polite client of Limitless: robots.txt is `Disallow:` (nothing blocked, read
  2026-10-15). The legal notice says nothing about scraping. Their public API
  (docs.limitlesstcg.com/developer.html) covers only online Limitless Play events, not
  Regionals. We fetch rarely and slowly, cache the raw pages, never hotlink their images, and
  credit "Tournament data: Limitless TCG" in the tab.

## Current state (read this session)
- `client/src/setup/deck-builder/core/deck-state.mjs`: deck shape and `addCard`/`removeCard`.
- `client/src/setup/deck-builder/core/deck-validation.mjs:82`: `officialCardName(card)`.
- `client/src/initialization/document-event-listeners/sidebox/native-deck-builder.js`:
  `switchMode(mode)` (~line 537) toggles the Search, Browse and Customize tabs and panels. The
  Browse Sets controller `initializeNativeDeckBuilderSetBrowser({ panelEl, getQuantities,
  getOwned, onAddCard, onPreviewCard })` is the pattern to copy (`onAddCard` calls `addCard`,
  sets `deckDirty`, then `render()`).
- `client/index.ejs:257-266`: the mode-tab buttons (`nativeDeckBuilderTabSearch` … `TabCustomize`).
- `client/src/setup/deck-builder/core/tcgdex-cache.mjs`: IndexedDB cache for TCGdex records (D102).
- `scripts/lib/decklist-lines.mjs`: bake-time TCGdex fetch and `normalizeCard` for decklist lines
  (used by the starter-deck and B&B generators). It throws on name drift.
- Limitless HTML, probed 2026-10-15:
  - `/tournaments?time=2526&show=100` has one `<tr>` per event (date, name, players, winner) and
    a `data-format` attribute (`standard` | `standard-jp` | `expanded-jp`). The 2025-26 season has
    53 events: 26 Regionals, 7 Special Events, 5 Champions League, NAIC/EUIC/LAIC/OCIC and Worlds.
  - `/tournaments/<id>` holds the standings. Each row links `/players/<n>`, the archetype
    `/decks/<archetypeId>[?variant=n]` and the list `/decks/list/<listId>`.
  - `/tournaments/<id>/decklists` holds all lists on one page (Louisville: 21 MB, 547 lists,
    14 003 card rows). Each list opens with `<div class="decklist-toggle" data-target="decklist-N">1st
    Riley McKay</div>`, and each card is
    `<div class="decklist-card" data-set="TWM" data-number="130">…card-count">3<…card-name">Dragapult ex<`.
    Basic Energy shows up as `MEE <n>` rows. So each event costs two requests.

## Walk-through (the idea in plain words)
1. **Collect.** A script downloads the standings and decklists pages for each official Standard
   event in the window, about 2 requests per event. The raw HTML is cached locally (gitignored).
2. **Normalize.** Each card line (`TWM 130 Dragapult ex`) resolves to a TCGdex print, then to a
   *functional key*, so reprints and alt arts of the same card count as one card.
3. **Bake.** One compact JSON file goes into the repo (about 1 MB for a rotation), the way starter
   decks and B&B boxes are baked today. The app never calls Limitless at runtime.
4. **Match.** When you open the Suggest tab, the browser finds the tournament lists that contain
   the most of your deck (nearest neighbours), weighting better placings and more recent events
   more heavily.
5. **Explain.** Across those neighbours it counts how often each card appears, and how many
   copies, then sorts the results into buckets: *missing staples*, *count tweaks*, *tech options*
   and *unusual picks*. Each row carries its evidence ("in 92% of 214 similar lists, usually 4").
   An empty deck shows the meta instead: top archetypes by share, with one-click "start from this list".

## Options
1. **Data source.**
   A) Scrape limitlesstcg.com official events: exactly what was asked (Regionals and above). It
      means HTML parsing, which can break when their markup changes.
   B) Limitless Play API: JSON, no key, but only online grassroots events. Higher volume, weaker
      signal, and not what was asked.
   C) Both.
   **Pick A**, keeping B as a possible later addition behind the same dataset schema. HTML drift
   fails loudly at bake time (parser tests run on fixtures, and the bake refuses a page that
   yields 0 lists). It never breaks the app.
2. **Where the data lives.**
   A) Baked JSON committed to the repo, refreshed by running a script: no runtime dependency,
      works offline, matches the starter-deck and B&B pattern (D186). Data goes stale until someone
      reruns it.
   B) The server scrapes on a schedule and stores results in SQLite: always fresh, but adds a cron,
      a failure mode on Render's ephemeral disk, and load on Limitless from every deploy.
   C) The client scrapes in the browser: blocked by CORS and impolite.
   **Pick A.** A refresh is one command, and a weekly GitHub Action that opens a PR can come later
   (open question 3).
3. **How suggestions are computed.**
   A) Archetype-first: classify the deck into a Limitless archetype, then report that
      archetype's card rates. Easy to explain, but Limitless's archetype rules are behind an API
      key, and hybrid or rogue decks fit badly.
   B) Nearest-neighbour lists: score every list by how much of *your* deck it contains, keep the top
      K, and aggregate card rates over them. Handles partial decks ("4 Dreepy" already finds
      Dragapult lists), variants and hybrids, needs no training, and stays explainable.
   C) A trained model (embeddings or association rules): opaque, needs tuning infrastructure, and
      gives no real gain at about 10k lists.
   **Pick B.** We still record each list's Limitless archetype id, which supplies the "Looks like:
   Dragapult" label and the empty-deck meta view.
4. **Card identity across prints.**
   A) Exact print (set+number): splits Iono PAL from Iono PAF, so counts come out wrong.
   B) Name only: merges different Pokémon that share a name (e.g. two "Pikachu ex" with different attacks).
   C) Functional key: Trainers and Energy use `officialCardName` (the D64 rule). Pokémon use name plus
      sorted attack names plus sorted ability names from the TCGdex record.
   **Pick C.** The key comes from one pure function shared by the bake script and the client.
5. **Which lists count, and how much.**
   Masters division only (the strongest signal). Standard format only (`data-format="standard"`;
   Japanese events run a different card pool). The window is events since the current rotation
   date, set in the script config. Placement weight: 1st-8th 1.0, 9-16 0.85, 17-32 0.7, 33-64 0.55,
   65+ 0.4. Recency weight: `0.5 ** (ageDays / 28)`, with age measured from the newest event in the
   dataset (so a stale file doesn't distort anything).

## Design
### Files
- `scripts/limitless/parse-limitless.mjs`: pure parsers (HTML string to rows).
- `scripts/limitless/fetch-limitless.mjs`: polite fetcher. Sequential, 2 s between requests, UA
  `ptcg-sim-deck-suggest (+https://github.com/Ar1ssi/vibecodepokemontcg2)`, cache in
  `.cache/limitless/<eventId>/{standings,decklists}.html` (gitignored), and `--refresh` refetches
  only events newer than the newest cached one.
- `scripts/limitless/build-meta-dataset.mjs`: joins standings and lists, resolves cards through
  TCGdex (reusing `decklist-lines.mjs` fetch and cache), computes keys and writes the dataset.
  `pnpm meta:refresh` runs fetch then build.
- `client/src/assets/meta/limitless-standard.json`: the baked dataset (committed).
- `client/src/setup/deck-builder/core/deck-suggest/card-key.mjs`: `cardKeyOf`.
- `client/src/setup/deck-builder/core/deck-suggest/suggest.mjs`: the pure engine.
- `client/src/setup/deck-builder/core/deck-suggest/dataset.mjs`: `loadMetaDataset()` (fetch and
  validate, memoized).
- `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-suggest.js`: DOM panel.
- `client/src/css/deck-builder-suggest.css`, scoped under `.db-live` (D95).
- `client/index.ejs`: a `Suggest` mode tab and its panel (Standard builder only. B&B is pool-bound, so it gets no tab).

### Dataset schema v1
```
{ version: 1, generatedAt: ISO, source: "limitlesstcg.com", format: "standard",
  window: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" },
  events:     [ { id: 581, name: "Regional Louisville, KY", date: "2026-10-10", players: 2927 } ],
  archetypes: [ { id: 284, name: "Dragapult" } ],
  cards:      [ { key, name, kind: "pokemon"|"trainer"|"energy", print: "sv06-130" } ],
  lists:      [ { e: eventIdx, p: placing, a: archetypeIdx|-1, c: [[cardIdx, count], ...] } ] }
```
`print` is the most-played TCGdex id for that key inside the window. It is the print the Add
button fetches.

### Engine API (pure)
- `cardKeyOf(card) → string`. Trainer or Energy: `t:<officialCardName lowercased>`. Pokémon:
  `p:<name lc>|<attack names sorted, joined by ;>|<ability names sorted>`.
- `deckToKeyCounts(deck) → Map<key, count>`, which sums prints that share a key.
- `findNeighbors(keyCounts, dataset, { k = 50, minSimilarity = 0.5 }) → [{ list, similarity, weight }]`.
  Similarity = containment = Σ min(you_k, list_k) / Σ you_k. Weight = similarity² × placementWeight
  × recencyWeight. If fewer than 10 lists reach `minSimilarity`, take the 10 best anyway and set
  `confidence: 'low'`.
- `suggestCards(deck, dataset, opts) → { confidence: 'high'|'low'|'none', archetype: { name, share } | null,
  neighbors: n, missingCore: Item[], countTweaks: Item[], techs: Item[], cuts: Item[] }`, where
  `Item = { key, name, print, inclusion, typicalCount, yourCount }`.
  - inclusion = Σ w·[list has key] / Σ w. typicalCount = the weighted median count among lists that run the key.
  - missingCore: inclusion ≥ 0.75 and yourCount = 0. countTweaks: inclusion ≥ 0.75, yourCount > 0,
    |typicalCount − yourCount| ≥ 1. techs: 0.2 ≤ inclusion < 0.75 and yourCount = 0.
    cuts: yourCount > 0 and inclusion < 0.1.
  - Each bucket is sorted by inclusion (descending), then name. Empty deck → `confidence: 'none'`
    and empty buckets.
- `metaOverview(dataset) → [{ archetype, share, lists, bestList }]`: weighted share per archetype.
  `bestList` is the highest-weight list, which feeds "Start from this list".

### UI (Suggest tab)
Header: "Looks like **Dragapult** · 214 similar lists · Regionals Aug 2026 – Oct 2026", with a
low-confidence banner when one applies. There are four collapsible sections of card tiles, each
showing its evidence line and a `+` button (wired through the same `onAddCard` path as Browse
Sets; the TCGdex record for `print` comes through tcgdex-cache). Cuts get a `−` button. An empty
deck shows the meta overview. "Start from this list" replaces the open deck only after a confirm,
and only when the deck is empty or the user accepts. Footer: "Tournament data: Limitless TCG ·
updated <generatedAt>". Results recompute on every deck change (debounced 150 ms; a 10k-list
scan is a few ms).

## Open questions (user calls; the recommended default is first)
1. **Scope of events**: Masters, Standard, current rotation only (default) · also include JR/SR ·
   also include last season.
2. **"Start from this list"** (import an entire tournament list) in v1 (default yes), or suggestions only?
3. **Refresh**: manual `pnpm meta:refresh` (default) · weekly GitHub Action that opens a PR.
4. **Limitless Play online events** as an extra low-weight source later: no for v1 (default).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Empty deck | `confidence: 'none'`; the tab shows the meta overview | [ ] |
| 2 | Malformed or changed Limitless HTML | A parser yields 0 rows → the bake throws with the event id and URL; no dataset is written | [ ] |
| 3 | Card line whose set code TCGdex can't resolve | The bake throws, listing every unresolved `SET NUM name` (like decklist-lines name drift) | [ ] |
| 4 | Deck of only Basic Energy | Containment matches nearly everything → `confidence: 'low'` banner; still no crash | [ ] |
| 5 | Rogue deck (<10 lists ≥ 0.5) | Top 10 used, low-confidence banner shows the best similarity % | [ ] |
| 6 | Dataset fetch fails, or the JSON is invalid / the wrong version | Panel shows "Suggestions unavailable" plus the reason; the builder keeps working | [ ] |
| 7 | Add would break the 4-copy / ACE SPEC rule | Uses the existing `addCard` path; the deck counter and validation show it, as with Search | [ ] |
| 8 | Same card, different prints in the deck | Counted once via `cardKeyOf` | [ ] |
| 9 | List placing missing (unranked) | Placement weight 0.4 | [ ] |
| 10 | Rapid deck edits | Debounced recompute; the last result wins | [ ] |
| 11 | Event in window with lists not yet published | Standings without a decklists page → event skipped with a warning, not a failure | [ ] |
| 12 | Builder opened in B&B mode | No Suggest tab rendered | [ ] |

## Test plan
- Parsers: trimmed fixture HTML (one event row, three standings rows, two decklists) → exact rows.
- card-key: Iono PAL vs Iono PAF → same key. Two Pokémon that share a name but have different
  attacks → different keys. The fixture card records come from the TCGdex ids named in the test.
- suggest: a hand-built 6-list fixture dataset. Assert neighbours, inclusion, weighted median,
  each bucket's contents, and the low-confidence path.
- Manual: open /deck-builder, add 4 Dreepy, and check that the tab shows Dragapult staples.

## Migration / rollout
New files and one new tab, with no schema change to stored decks. Revert = delete the tab markup
and the files above. The dataset is a static asset. Licence and courtesy: the footer credit, no
image hotlinking, and a refresh at most weekly.

## Work plan
| Slice | Files | Signatures & data | Test cases | Rulings | Green when |
|---|---|---|---|---|---|
| 0 spike | scratch only | — | Bake Louisville (id 581): 100% of card lines resolve to TCGdex | — | Resolution report in `.agent/scratch/069/` |
| 1 parsers + fetch | `scripts/limitless/{parse,fetch}-limitless.mjs`, fixtures, `.gitignore` | `parseEventIndex(html) → [{id,name,date,players,format}]`, `parseStandings(html) → [{placing,player,archetypeId,listId}]`, `parseDecklists(html) → [{placing,player,cards:[{count,name,set,number}]}]` | Fixtures → exact arrays; 0-row page → throws | — | `node --test scripts/limitless/__tests__` |
| 2 bake | `build-meta-dataset.mjs`, `card-key.mjs`, `package.json` script, dataset JSON | Schema v1 above | card-key cases; bake on the fixture event → schema-valid JSON | TCGdex ids cited in the test | `pnpm meta:refresh` writes a valid file |
| 3 engine | `deck-suggest/{suggest,dataset}.mjs` | Engine API above | 6-list fixture → pinned buckets | — | `pnpm test:changed` |
| 4 UI | `native-deck-builder-suggest.js`, `index.ejs`, `native-deck-builder.js` (`switchMode('suggest')`), CSS | `initializeNativeDeckBuilderSuggest({ panelEl, getDeck, onAddCard, onRemoveCard, onPreviewCard })` | Visual: user localhost check | — | Tab works on localhost |

## Deviations (Builder appends here during build)
