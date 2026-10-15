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
| A1 | Suggest tab in the deck builder suggesting cards from Limitless decklists | |
| A2 | Data = scraped decklists from Limitless regionals and championships | |
| A3 | Adult (Masters) division only, Standard only, current rotation | |
| A4 | Importing whole lists | |
| A5 | Suggestor adapts to your choices, per deck (accept / dismiss / lock reshape suggestions) | |
| A6 | Pick what's needed, e.g. "faster setup", and get suggestions for it | |
| A7 | Goal "cheaper" (budget) | |
| A8 | Goal "answer to <deck>" (matchup data) | |
| A9 | Hostile review run and its findings fixed | |

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
dismissed). Library: `suggestPrefs` on records, normalized in `parseLibrary`/`listDecks`/
`getDeckSuggestPrefs`; `setDeckSuggestPrefs(library, deckId, prefs)`; `saveDeckSnapshot` takes
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
| 1 | Empty deck | `confidence: 'none'`; meta overview shown | [ ] |
| 2 | Limitless markup changed | parser yields 0 rows → bake throws naming event id + URL | [ ] |
| 3 | Card line TCGdex can't resolve | bake throws listing every unresolved `SET NUM name` | [ ] |
| 4 | Deck of only Basic Energy | low confidence banner, no crash | [ ] |
| 5 | Rogue deck | top 10 used, `confidence: 'low'`, best similarity % shown | [ ] |
| 6 | Dataset fetch fails / invalid / wrong version | "Suggestions unavailable: <reason>", builder unaffected | [ ] |
| 7 | Add breaks 4-copy / ACE SPEC | normal `addCard` path; counter/validation show it | [ ] |
| 8 | Same card, different prints in deck | one dataset card via printIndex/name | [ ] |
| 9 | Deck card not in dataset at all | `x:` key; lowers containment; listed as a cut candidate | [ ] |
| 10 | Rapid deck edits | debounced; last result wins | [ ] |
| 11 | Event with standings but no lists yet | skipped with a warning | [ ] |
| 12 | Build & Battle mode | no Suggest tab | [ ] |
| 13 | Old record / corrupt `suggestPrefs` | normalizes to `EMPTY_PREFS` | [ ] |
| 14 | Dismiss then accept same key | latest wins, one list | [ ] |
| 15 | Accepted card removed | moves to dismissed | [ ] |
| 16 | Everything dismissed | "Nothing left to suggest — restore dismissed cards or reset steering" | [ ] |
| 17 | Locked card never in lists | never a cut; containment counts it | [ ] |
| 18 | Two builder tabs steering one deck | write re-reads storage first; last write wins | [ ] |
| 19 | Unsaved draft steered then saved | Save writes the in-memory prefs | [ ] |
| 20 | Goal with no tagged candidates | "No picks for <goal> in lists like yours" | [ ] |
| 21 | Budget with no price data | Budget rows skip null prices; deck price hidden | [ ] |
| 22 | Standings row whose list is missing on the decklists page (or vice versa) | dropped with a count in the bake log | [ ] |
| 23 | Import list while a card fails to resolve | imported anyway; failures listed like Import List | [ ] |

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
