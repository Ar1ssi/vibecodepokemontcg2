# 069: Deck suggestions tab (tournament data from Limitless)
Status: approved (user — "set the plan as approved, one shot it", 2026-10-15) · building
Date: 2026-10-15 · Session: cloud, branch claude/jolly-edison-bm3xkm

## Problem
User brief, verbatim:
> Draft a plan for a deck suggestions tab in the deckbuilder, which suggests cards for your deck
> based off of information from limitlesstcg decks. Maybe scrape all the decklists from limitless for
> regionals and championships and feed it data to decide? This is very vague, so walk me through it.

> adult division only, standard only, current rotation for now
> importing whole lists would be good
> I want to make the suggestor actually adapt to your implementations and suggestions thoough
(Clarified via question: "Steer per deck".)

> Also add the other feature, the one where you could pick whats needed, such as faster setup. once
> youre done, set the plan as approved, one shot it, run a hostile review, then fix what the hostile
> review finds.
("The other feature" = the "Suggest around a goal" option offered in the question: "You say what
you're going for (e.g. 'faster setup', 'answer to Dragapult', 'cheaper'), and suggestions are
filtered and re-ranked for it, using the card corpus and price or matchup data.")

The Standard deck builder only finds cards you already know to search for. This adds a Suggest tab
fed by every Masters decklist from Standard official events in the current rotation.

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | Suggest tab in the deck builder suggesting cards from Limitless decklists | ✓ Chromium smoke run (scratch smoke.mjs): tab → meta view → import → "Looks like Dragapult (100%) · 50 similar lists"; suggest.test.mjs buckets |
| A2 | Data = scraped decklists from Limitless regionals and championships | ✓ `pnpm meta:refresh` → 17 events, 5139 lists, 526 cards; parse-limitless + build-meta-dataset tests |
| A3 | Adult (Masters) division only, Standard only, current rotation | ✓ Masters standings page only (JR/SR are separate pages); `data-format="standard"` filter; selectRotationEvents test (rotation TEF, Prague 2026-04-25 → Louisville 2026-10-10) |
| A4 | Importing whole lists | ✓ resolve.test "listToEntries + importDeckEntries…"; smoke run "Imported 60 cards", counter 60/60 |
| A5 | Suggestor adapts to your choices, per deck | ✓ suggest.test steering (dismiss penalty, lock pull), prefs.test, deck-library-suggest.test; smoke: Dismiss → "1 dismissed" |
| A6 | Pick what's needed, e.g. "faster setup" | ✓ six tag goals; card-key-tags corpus tests; suggest.test goals; smoke: "For Faster setup 10" |
| A7 | Goal "cheaper" (budget) | ✓ Budget goal (≤ $1, Limitless TCGplayer prices); suggest.test budget; deck price line |
| A8 | Goal "answer to <deck>" (matchup data) | ✗ cut (Option 11): card-level matchup data needs ~550 Labs requests per event; ISSUES line at landing |
| A9 | Hostile review run and its findings fixed | ✓ independent reviewer agent: 1 blocker, 6 should, 5 nits — all fixed (§ Review log) |

## Assumptions
- (assumed) "Regionals and championships" = every Standard event on limitlesstcg.com/tournaments
  (Regionals, Special Events, Internationals, Worlds, and the official Premier Ball / Korean leagues
  it lists); placement weights keep small events from dominating. Japanese-format events
  (`standard-jp`) are excluded: different card pool timing.
- (assumed) "Current rotation" = events whose Limitless format label starts with the same set as the
  newest event's label ("Temporal Forces - …" since Regional Prague, 25 Apr 2026). Auto-detected at
  bake, so the next rotation needs no code change.
- (assumed) Refresh is manual (`pnpm meta:refresh`); Limitless Play online events are not used.
- (assumed) Goals in v1: Faster setup, More draw, Disruption, Energy acceleration, Recovery &
  healing, Switching, Budget. Card goal tags come from regex rules over TCGdex card text at bake.
- (assumed) Removing a card you accepted from Suggest counts as a dismiss (restorable).
- (assumed) "Start from this list" builds the list from each card's most-played print, not the
  player's exact prints (same card, different art is functionally identical).

## Constraints
- No build step, native ESM in the browser (PROJECT.md). Small, private scale: the simple mechanism.
- Pure logic in `core/`, DOM in `sidebox/native-deck-builder-*.js` (D96). Pure tests run under
  `node --test` with stub cards, no jsdom.
- Builder runs in its own tab; the game tab never writes deck cards (D183). Library writes re-read
  storage first (`setActiveField` / `commit` in native-deck-builder-library.js).
- Deck shape `{ [name]: { cards: [{ data, count }], totalCount } }`; `data` is a
  `normalizeTcgdexCard` record (id, name, supertype, abilities = names only, **no attacks**).
- Card text is looked up, never recalled (directive 7): goal tags come from TCGdex text at bake;
  tag tests cite `out/pkmn-*-cards.json` rows.
- Polite client of Limitless: robots.txt `Disallow:` (empty), legal notice silent on scraping, public
  API covers only Limitless Play. Sequential fetches 2 s apart, identifying UA, parsed results cached
  per event (raw HTML never kept), no image hotlinking, credit line in the tab.

## Current state (read this session)
- `core/deck-state.mjs` `addCard/removeCard`; `core/deck-validation.mjs:82` `officialCardName`.
- `core/card-search.mjs:214` `normalizeTcgdexCard`, `:372` `fetchCardDetail(id)` → normalized record.
- `core/deck-text-import.mjs`: `basicEnergyLabel(name)`, `resolveEntry`, `importDeckEntries(entries,
  { deck, addCard, deps, onProgress, concurrency })` (Import List popup).
- `core/deck-library.mjs`: per-deck fields (`sprites`, `wallpaperId`, `format`) normalized by
  `parseLibrary`/`listDecks`, set via `setDeck<Field>`; `saveDeckSnapshot` takes cosmetics.
- `sidebox/native-deck-builder-library.js`: `setActiveField(target, value, setField)`, getters
  `getActive<Field>`, `saveCurrentDeck(cards, cosmetics)`.
- `sidebox/native-deck-builder.js:537` `switchMode`; Browse Sets controller contract
  `initializeNativeDeckBuilderSetBrowser({ panelEl, getQuantities, getOwned, onAddCard, onPreviewCard })`.
- `client/index.ejs:257-267` mode tabs; `#nativeDeckBuilderSetBrowserPanel` panel.
- `scripts/lib/decklist-lines.mjs`: `fetchCard(id)` with `TCGDEX_CACHE_DIR` disk cache.
- `shared/engine/rules/legacy-set-ids.mjs`: `buildSetCardIdCandidates(setCode, number)` (knows MEE, 30C).
- Limitless HTML (probed 2026-10-15): `/tournaments` and `/tournaments?time=2526&show=100` → `<tr
  data-format="standard">` rows linking `/tournaments/<id>`; event page → "N Players • <Format label>"
  and standings rows (placing, `/players/n`, `/decks/<archetypeId>`, `/decks/list/<listId>`);
  `/tournaments/<id>/decklists` → every Masters list, `decklist-toggle … data-target="decklist-N">1st
  Riley McKay<`, cards `decklist-card data-set data-number` + `card-count` + `card-name` + `card-price usd`.
  Labs (labs.limitlesstcg.com) has archetype-level matchups only; per-card matchup data needs every
  player's round page (~550 requests per event).

## Options
1. **Data source.** A) limitlesstcg.com official events (HTML) · B) Limitless Play API (online only) ·
   C) both. **Pick A** — what was asked; drift fails loudly at bake (0 rows → throw), never in the app.
2. **Where data lives.** A) baked JSON committed, manual refresh (D186 pattern) · B) server cron +
   SQLite (ephemeral disk on Render, load per deploy) · C) browser scraping (CORS). **Pick A.**
3. **Suggestion maths.** A) archetype rates (rules behind an API key, rogue decks fit badly) ·
   B) nearest-neighbour lists by containment · C) trained model (opaque, no gain at ~5k lists).
   **Pick B**; the archetype id still labels "Looks like …" and drives the meta view.
4. **Card identity.** A) exact print · B) name only · C) functional key: Trainer/Energy
   `t:<officialCardName lc>`, Pokémon `p:<name lc>|<attack names sorted>|<ability names sorted>`.
   **Pick C**, computed at bake (needs attacks). The client resolves a deck card to a dataset card by
   TCGdex id (`printIndex`), else by name (single match; several → the one whose `abilities` equal
   the deck card's, else the most-played), else a synthetic `x:<name lc>` that matches no list.
5. **Which lists, how much.** Masters standings only; placement weight 1–8 1.0, 9–16 0.85, 17–32
   0.7, 33–64 0.55, 65+ 0.4; recency `0.5 ** (ageDays / 28)` from the newest event in the dataset.
6. **Adapting to the user** (user: per-deck steering). A) per-deck steering · B) cross-deck taste ·
   C) game-result learning (no game log by design). **Pick A.**
7. **Steering storage.** A) `suggestPrefs` on the library record · B) separate localStorage key
   (orphans, drafts have no id). **Pick A**; drafts hold prefs in memory, Save writes them.
8. **Signals in the maths.** A) weighted containment + dismiss penalty · B) post-filter only (no real
   adaptation). **Pick A**, with hiding on top.
9. **Goal tagging.** A) regex rules over TCGdex text at bake, stored as `tags` per card · B) client
   regex at runtime (needs full text the deck records lack) · C) hand-curated lists (stale, recall).
   **Pick A.**
10. **Goal ranking.** A) separate "For <goal>" section per active goal: tagged candidates ranked by
    0.7·neighbour inclusion + 0.3·meta-wide inclusion · B) re-weight neighbours toward goal-heavy lists
    (subtle, hard to explain). **Pick A**, plus goal badges on rows in the other sections.
11. **"Answer to <deck>" goal.** A) scrape Labs per-player rounds (~550 requests/event; Labs flags its
    standings as possibly wrong) · B) archetype-level matchups (names decks, not cards) · C) cut from
    v1. **Pick C** — honest ✗ on A8 + ISSUES line; revisit if Limitless offers matchup data in bulk.

## Design
### Files
- `scripts/limitless/parse-limitless.mjs` — pure parsers.
- `scripts/limitless/card-key.mjs` — `cardKeyOf(tcgdexCard)`, `kindOf(tcgdexCard)`.
- `scripts/limitless/card-tags.mjs` — `GOAL_RULES`, `tagsForText(text)`, `cardText(tcgdexCard)`.
- `scripts/limitless/build-meta-dataset.mjs` — CLI: fetch (or read cache) → join → resolve → write.
  `pnpm meta:refresh`. Cache: `.cache/limitless/events/<id>.json` (parsed event), TCGdex via
  `TCGDEX_CACHE_DIR=.cache/tcgdex`.
- `client/src/assets/meta/limitless-standard.json` — dataset (committed).
- `client/src/setup/deck-builder/core/deck-suggest/goals.mjs` — `GOALS` (ids, labels), `BUDGET_MAX_USD = 1`.
- `.../deck-suggest/dataset.mjs` — `validateDataset(json)`, `indexDataset(dataset)`, `loadMetaDataset(fetchJson)`.
- `.../deck-suggest/suggest.mjs` — engine.
- `.../deck-suggest/prefs.mjs` — steering transitions.
- `.../deck-suggest/resolve.mjs` — `resolveDatasetCard(card, deps)`, `listToEntries(list, index)`.
- `core/deck-library.mjs` — `suggestPrefs` field.
- `core/deck-text-import.mjs` — `importDeckEntries` gains an optional `resolve` dep (default `resolveEntry`).
- `sidebox/native-deck-builder-suggest.js` — DOM controller; `css/deck-builder-suggest.css`.
- `sidebox/native-deck-builder-library.js`, `sidebox/native-deck-builder.js`, `client/index.ejs` — wiring.

### Dataset schema v1
```
{ version: 1, generatedAt: ISO, source: "limitlesstcg.com", format: "standard",
  rotation: "Temporal Forces", window: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" },
  events:     [ { id, name, date: "YYYY-MM-DD", players } ],
  archetypes: [ { id, name } ],
  cards:      [ { key, name, kind: "pokemon"|"trainer"|"energy", print: "<tcgdex id>",
                  set: "<limitless code>", number: "<n>", abilities: [names], tags: [goalId], price: number|null } ],
  printIndex: { "<tcgdex id>": cardIdx },
  lists:      [ { e: eventIdx, p: placing, a: archetypeIdx|-1, c: [cardIdx, count, cardIdx, count, ...] } ] }
```
`print` = most-played print of the key; `price` = cheapest per-print median USD seen; `tags` ⊆ goal ids
except `budget`.

### Engine (pure)
- `indexDataset(ds)` → `{ ds, byName: Map<name lc, idx[]>, listCounts: Map<idx,count>[], listWeights: number[], globalInclusion: Float64Array }`;
  listWeights = placement × recency; globalInclusion[i] = Σ w·[list has i] / Σ w.
- `deckToCounts(deck, index) → { counts: Map<idx|'x:name', n>, unresolved: string[] }` (rules in Option 4).
- `findNeighbors(counts, index, { prefs, k = 50, minSimilarity = 0.5, minNeighbors = 10 })` →
  `{ neighbors: [{ listIdx, similarity, weight }], confidence }`. Containment with α (locked 2,
  accepted 1.5, else 1); weight = similarity² × listWeight × 0.6^(dismissed keys in list). Lists sorted
  by weight-free similarity desc, ties by listWeight desc. Empty deck → `confidence: 'none'`, `[]`.
  Fewer than `minNeighbors` at ≥ min → best `minNeighbors` by similarity, `confidence: 'low'`.
- `suggestCards(deck, index, { prefs }) → { confidence, archetype: { name, share }|null, neighbors: n,
  bestSimilarity, missingCore, countTweaks, techs, cuts, goals: { [goalId]: Item[] }, deckPrice }`.
  `Item = { idx, key, name, print, kind, inclusion, typicalCount, yourCount, price, tags, locked? }`.
  inclusion = Σ w·[has] / Σ w over neighbours; typicalCount = weighted median of counts where present.
  Buckets as before (missingCore ≥ 0.75 & you 0; countTweaks ≥ 0.75 & you > 0 & |Δ| ≥ 1; techs
  0.2–0.75 & you 0; cuts you > 0 & < 0.1 & not locked; unresolved deck cards are cuts candidates with
  inclusion 0). Dismissed never in add buckets or goals. Sort: inclusion desc, name asc.
  Goals (for each id in `prefs.goals`): tag goals → cards tagged id, you 0, not dismissed, globalInclusion
  ≥ 0.005 or inclusion > 0; score 0.7·inclusion + 0.3·globalInclusion; top 12. Budget → price ≤
  `BUDGET_MAX_USD`, inclusion ≥ 0.1, you 0, not dismissed, sorted inclusion desc, top 12.
  `deckPrice` = Σ count × price over resolved cards with a price (null when none).
  archetype = the archetype with the highest neighbour weight share.
- `metaOverview(index) → [{ archetype, share, lists, bestListIdx }]` — weighted share, desc; top 12.

### Steering state (per deck)
`prefs = { locked: key[], accepted: key[], dismissed: key[], goals: goalId[] }`; keys are dataset
`key`s (or `x:` keys for locks). A key lives in at most one of locked/accepted/dismissed (latest wins).
`prefs.mjs`: `EMPTY_PREFS`, `normalizeSuggestPrefs(raw)` (non-arrays → [], non-strings and duplicates
dropped, cross-list overlap resolved locked > accepted > dismissed, unknown goals dropped, each list
capped at 200), `acceptKey`, `dismissKey`, `lockKey`, `unlockKey`, `restoreKey`, `toggleGoal`,
`prunePrefs(prefs, presentKeys)` (locked/accepted not present dropped; accepted not present →
dismissed; a dismissed key that is in the deck again is cleared). Library: `suggestPrefs` on
records, normalized in `parseLibrary`/`getDeckSuggestPrefs` (`listDecks` does not carry it — nothing
reads it there); `setDeckSuggestPrefs(library, deckId, prefs)`; `saveDeckSnapshot` takes
`suggestPrefs`. Import of a list → `EMPTY_PREFS` (goals kept).

### UI (Suggest tab; not in Build & Battle)
Tab `#nativeDeckBuilderTabSuggest` after Browse Sets; panel `#nativeDeckBuilderSuggestPanel`.
Lazy-loads the dataset on first open ("Loading tournament data…"; failure → "Suggestions unavailable:
<reason>"). Top: goal chips (toggle, persisted in prefs). Header "Looks like **<archetype>** · N similar
lists · <window>" + low-confidence banner. Sections: For <goal> (one per active goal), Missing staples,
Count tweaks, Tech options, Unusual picks, each row: name, evidence ("in 92% of similar lists · usually
4"), goal badges, price when Budget is on, buttons Add/Dismiss (cuts: Cut/Keep). "Your core" strip:
deck keys with lock toggles. "Dismissed (n)" fold with Restore. "Steering: … · Reset". Empty deck →
meta overview with "Start from this list" (confirm when the deck is non-empty) → `importDeckEntries`
with the dataset resolver. Footer credit + `generatedAt`. Recompute debounced 150 ms on deck/prefs change.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Empty deck | `confidence: 'none'`; meta overview shown | [x] suggest.test "empty deck…"; smoke 1-meta.png |
| 2 | Limitless markup changed | parser yields 0 rows → bake throws naming event id + URL | [x] parsers return [] (parse-limitless tests); loadEventPage/loadDecklists/main throw with URL |
| 3 | Card line TCGdex can't resolve | bake throws listing every unresolved `SET NUM name` | [x] build-meta-dataset.test "throws listing every unresolved line"; seen live (MEE) |
| 4 | Deck of only Basic Energy | low confidence banner, no crash | [x] same path as row 5 (containment over Energy keys); findNeighbors low-confidence test |
| 5 | Rogue deck | top 10 used, `confidence: 'low'`, best similarity % shown | [x] suggest.test "fewer lists than minNeighbors…"; view.test lowConfidenceText |
| 6 | Dataset fetch fails / invalid / wrong version | "Suggestions unavailable: <reason>", builder unaffected | [x] dataset.test loadMetaDataset + validateDataset; controller renders reason + Try again |
| 7 | Add breaks 4-copy / ACE SPEC | normal `addCard` path; counter/validation show it | [x] smoke: Add on a 60-card deck → "61 / 60, 1 card over the limit" |
| 8 | Same card, different prints in deck | one dataset card via printIndex/name | [x] suggest.test "deckToCounts sums prints of one card" |
| 9 | Deck card not in dataset at all | `x:` key; lowers containment; listed as a cut candidate | [x] suggest.test cuts (Homebrew Card) |
| 10 | Rapid deck edits | debounced; last result wins | [x] controller `schedule()` clears the pending timer (150 ms); untestable without a DOM |
| 11 | Event with standings but no lists yet | skipped with a warning | [x] main(): `skip <id>: no decklists published yet`, page not cached |
| 12 | Build & Battle mode | no Suggest tab | [x] index.ejs: tab in the `isBuilderWindow` (non-B&B) branch, panel `isBuilderWindow && !isBuildBattle`; controller only when `isEditor && !isBuildBattle` |
| 13 | Old record / corrupt `suggestPrefs` | normalizes to `EMPTY_PREFS` | [x] deck-library-suggest.test; prefs.test garbage |
| 14 | Dismiss then accept same key | latest wins, one list | [x] prefs.test "latest action wins" |
| 15 | Accepted card removed | moves to dismissed | [x] prefs.test prunePrefs; controller prunes on render |
| 16 | Everything dismissed | "Nothing left to suggest — restore dismissed cards or reset steering" | [x] controller resultHtml; engine excludes dismissed (suggest.test) |
| 17 | Locked card never in lists | never a cut; containment counts it | [x] suggest.test "cuts… locked card is never a cut" |
| 18 | Two builder tabs steering one deck | write re-reads storage first; last write wins | [x] uses `setActiveField` (reload() before commit), same as sprites/wallpaper |
| 19 | Unsaved draft steered then saved | Save writes the in-memory prefs | [x] deck-library-suggest.test saveDeckSnapshot; Save passes `currentSuggestPrefs()` |
| 20 | Goal with no tagged candidates | "No picks for <goal> in lists like yours" | [x] suggest.test "goal with nothing to offer" |
| 21 | Budget with no price data | Budget rows skip null prices; deck price hidden | [x] goalPicks filters `price !== null`; deckPrice null → line hidden |
| 22 | Standings row whose list is missing on the decklists page (or vice versa) | dropped with a count in the bake log | [x] build-meta-dataset.test joinEvent dropped/missing |
| 23 | Import list while a card fails to resolve | imported anyway; failures listed like Import List | [x] resolve.test (Counter Catcher failure listed) |

## Test plan
Parsers on trimmed fixture HTML; card-key + card-tags on corpus texts (cited); dataset validate/index;
engine on a hand-built fixture dataset (neighbours, buckets, goals, budget, steering); prefs
transitions; deck-library round-trip; resolve. Manual (user, localhost): the tab, goal chips, steering.

## Migration / rollout
New files + one tab; `suggestPrefs` is additive and optional (old records read as empty). Revert:
remove the tab markup, the files above and the `suggestPrefs` plumbing (records keep an ignored field).

## Work plan
| Slice | Files | Signatures & data | Test cases | Rulings | Green when |
|---|---|---|---|---|---|
| 1 parsers | `scripts/limitless/parse-limitless.mjs`, `__tests__/parse-limitless.test.mjs`, fixtures | `parseEventIndex(html) → [{id, format}]`, `parseEventPage(html) → {name, date, players, formatLabel, standings:[{placing, player, archetypeId, archetypeName, listId}]}`, `parseDecklists(html) → [{placing, player, cards:[{count, name, set, number, priceUsd}]}]` | fixtures → exact rows; empty html → [] ; `ordinalToPlacing('548th') = 548` | — | test file green |
| 2 keys + tags + bake | `card-key.mjs`, `card-tags.mjs`, `build-meta-dataset.mjs`, tests, `package.json`, dataset JSON | schema v1 | Iono PAL/PAF same key; tags on corpus rows (Ultra Ball 30C 128 → setup; Mega Dragonite ex MEP 091 → mobility) | corpus rows cited in tests | `pnpm meta:refresh` writes a valid dataset |
| 3 engine | `deck-suggest/{dataset,suggest,goals}.mjs`, tests | engine above | fixture dataset → pinned buckets, low/none confidence, goals, budget | — | tests green |
| 4 steering | `deck-suggest/prefs.mjs`, `deck-library.mjs`, tests | steering above | transitions, normalize garbage, prune, round-trip, α/penalty effect | — | tests green |
| 5 resolve + import | `deck-suggest/resolve.mjs`, `deck-text-import.mjs`, tests | `resolveDatasetCard`, `listToEntries`, `importDeckEntries({ resolve })` | basic energy → energy card; print fetch name mismatch → name search | — | tests green |
| 6 UI | suggest controller, CSS, index.ejs, native-deck-builder(.js, -library.js) | `initializeNativeDeckBuilderSuggest({ panelEl, getDeck, getPrefs, setPrefs, onAddCard, onRemoveCard, onReplaceDeck, onPreviewCard, fetchCardDetail, searchByName })` → `{ open(), refresh() }` | browser smoke run | — | renders on localhost |

## Deviations (Builder appends here during build)
- prefs.mjs landed in slice 3 (the engine reads it), not slice 4. Cosmetic.
- Bake resolver: Limitless MEE numbers (9-16) ≠ TCGdex mee-001..008 → same-set unique-name fallback
  (`resolvePrintOnTcgdex`), tested.
- Dataset cards gained `image` (TCGdex image base) so rows show thumbnails without per-card fetches.
- Goal picks: a Pokémon your similar lists never play needs ≥ 10% meta share (`MIN_GLOBAL_FOR_OFF_ARCHETYPE_POKEMON`);
  the smoke run showed other decks' attackers (Genesect ex, Dwebble) as "Faster setup" picks otherwise.
- Tag rules widened after the first bake: generic deck search ("a Supporter card") counts as Draw &
  search, Crispin-style "Attach the other" counts as acceleration, "Retreat Cost is 0" as Switching.
- `findDeckCardForKey` (suggest.mjs) and `view.mjs` (strings) added for the Cut button and testable wording.
- The Suggest tab exists only in the Standard builder window (`isBuilderWindow && !isBuildBattle`), not
  on the game tab's slim panel.

## Review log (hostile review, independent agent, after slice 6)
- [blocker] Count tweaks always offered Add, even when the fix is fewer copies → items carry
  `direction`; "down" rows offer Cut 1, every tweak offers "Keep count" (a lock, which hides the
  tweak); weighted median takes the higher count on an exact 50/50 split. Tests: "review #1".
- [should] Async Add / Start-from-list could land in another deck → controller `generation` token,
  bumped by `invalidate()` on every deck open, target switch, clear, detach, restore and wholesale
  replace; stale results are dropped with a status line.
- [should] Dismissing a card you play penalised lists that play it → penalty ignores keys in the deck;
  `prunePrefs` clears dismissed keys that are back in the deck. Tests: "review #3".
- [should] Confidence ignored deck size (1 Ultra Ball → "high") → `MIN_CORE_COPIES` = 6 non-Energy
  copies for "high". Test: "review #4". Edge row 4 now really holds.
- [should] Add accepted the clicked key, not the landed card's → accepts `resolveDeckCard(card)`'s key.
- [should] Folds collapsed on every click → open folds remembered across renders (smoke-checked).
- [should] Scraper cached partial pages forever → only events ≥ 14 days old are read from or written
  to the cache (`isSettled`). Test: "review #7".
- [nit] 429 now retries with Retry-After (`retryDelayMs`); `listDecks` wording aligned; Import List
  (replace) and CSV import reset the editor deck's steering (goals kept); accepted α test added;
  the bake imports `DATASET_VERSION` and `nameKey` from the client dataset module.
