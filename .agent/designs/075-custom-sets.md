# 075: Custom sets — cardback cards playable in the sim
Status: shipped (self-approved — autonomous session, summary posted in chat; see Deviations)
Date: 2026-10-23 · Session: S-custom-sets

## Problem
The cardback editor (`C:\Users\SMG26\cardback`, repo Ar1ssi/cardback) edits and re-renders real cards (new
name, HP, type, stage, attacks, abilities, Trainer text) but its output is only PNGs. The sim has no way to
load those cards: nothing in the deck builder, deck import, set browser or rules engine knows them. The user
wants the edited cards and whole custom sets to behave like any TCGdex card — searchable, importable from a
decklist, enriched, parsed and executed by the rules engine — with the files stored in the sim repo (small,
well under 1 GB). The editor also needs wording help: auto-capitalised TCG terms ("Active Pokémon") and an
LLM (Haiku) rewrite suggestion so custom text reads like printed text, which is also what the engine's
parsers expect.

## Constraints
- No build step, native ESM; no new npm dependency (PROJECT.md). Cardback stays stdlib-only beyond
  requirements.txt (its README promise); Pillow already encodes WebP (checked: `features.check('webp')` True).
- Browser card data goes through the same-origin TCGdex proxy (D164); Node callers hit TCGdex directly.
- Scale is small; prefer the simple mechanism (PROJECT.md). Losing nothing on restart matters: sets are files.
- Engine parsers read TCGdex-shaped records: `attacks[].effect` (copied to `text`), `abilities[{type,name,effect}]`,
  `weaknesses[{type,value}]`, `retreat` number, `stage` "Basic"|"Stage1"|"Stage2", `evolveFrom`, `suffix`,
  `trainerType`, `effect` (Trainer text), energy symbols as `{G}` (TCGdex writes them so: me01-003 Solar
  Transfer "Move a Basic {G} Energy").
- Card text is looked up, never recalled (CLAUDE.md 7): wording examples and the term list come from the
  corpora `out/pkmn-pokemon-cards.json` / `out/pkmn-trainer-cards.json` or TCGdex, cited in code.
- Secrets: the Anthropic key is read from `ANTHROPIC_API_KEY` only; never written to disk or the page.

## Current state (read this session)
Sim (`origin/main` 0be9ee73 — six commits ahead of local `main`, incl. the Custom Set tab):
- `server/tcgdex-proxy.mjs` — `canonicalTcgdexPath` allows `/v2/en/(cards|sets|series)(/<id>)?`; `createTcgdexProxy().get(key)`
  → `{status, body, cacheControl, gzip}`; `tcgdexProxyHandler(proxy)` mounted at `/api/tcgdex/*` (server.js:279).
- `shared/tcgdex/tcgdex-url.mjs` — `tcgdexApiUrl` (proxy in browser); `shared/tcgdex/tcgdex-cache.mjs` IndexedDB
  cache, `ttlForUrl`: record 7 d, list 6 h.
- `shared/tcgdex/card-art.mjs` — own card fronts under `/src/assets/card-art/<series>/<set>/<n>/high.webp`;
  consumers append `/high.webp` to a record's `image`.
- `client/src/setup/deck-builder/core/card-search.mjs` — `normalizeTcgdexCard` (image = `${image}/high.webp`),
  `fetchCardDetail(id)`, `queryCards` → `/cards?name=…` summaries then details.
- `client/src/setup/deck-builder/core/set-browser.mjs` — `fetchSetRecord(setId)` → `/sets/<id>`; `fetchSetCards`;
  `fetchCardSupertypeIndex` (`/cards?category=X` per category); Homebrew pill = BW+XY (`fetchHomebrewSets`).
- `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-set-browser.js` — pills by
  `data-category`; `loadCategory` branches per category (standard/other/homebrew/generation).
- `client/src/setup/deck-builder/core/deck-text-import.mjs` — `PTCGL_SET_IDS` code→set id; `resolveEntry(entry, deps)`.
- `client/src/setup/deck-builder/core/custom-set.mjs` + `sidebox/native-deck-builder-custom-set.js` — the Custom
  Set tab: a localStorage pick-list exported as `*.ptcg-set.json` `{format:'ptcg-sim.custom-set', version:1,
  name, cards:[normalized cards]}`; cardback imports this to list cards to restyle.
- `shared/engine/rules/rules-state.mjs` — `ensureCardData` → `fetchCardDetail(id)` → enrichment
  (`inferMissingStage`, `mapDetailAttacks`, `tcgAbilityFromDetail`); `extractTcgdexIdFromImageUrl`
  (legacy-set-ids.mjs:266) recovers an id from TCGdex / own-art / pokemontcg.io / limitless URLs.
- `shared/engine/reduce/turn.mjs` — `loadDeckCommand` rows `[qty,name,type,imageURL,number,set,tcgId]`;
  `cardStatsCommand` applies client-enriched stats. `shared/engine/cards.mjs` `createCard` copies `effect`→`text`.
- `client/src/setup/gl/card-art-hosts.mjs` `textureUrlFor` — same-origin/relative URLs load directly;
  `holo.mjs` `cardImageParts` returns null for unknown URLs (default foil pattern).
- `server/__tests__/tcgdex-proxy.test.mjs` — handler/proxy tested with `fakeFetch`.
Cardback (`main` c60bc6c): `svrestyle/gui.py` HTTP API (stdlib `ThreadingHTTPServer`), `edit.py` (editable fields,
`apply`, `printed` = é + ’ fix, `changes`), `gui.html` (page; `accentPokemon` capture-phase input hook, `textInput`
builder for ability/attack text, `payload(id)`, `importSet`, zip download), `compose/mecompose/trainer.read_card`
card dicts (`set_code`, `number`, `reg_mark`, `rarity`, `type`, `stage`, `evolves_from`, `kind`, `effect`),
`tcg.search(field, value)`, `tests/test_gui.py` (`Http` class runs `gui.make_server(0)` with mocks).

## Options
1. Where custom records enter the sim.
   - A. Server proxy serves them as TCGdex records (virtual set). Tradeoff: one seam, every consumer unchanged;
     Node-side callers (tests/scripts) don't see them.
   - B. Client registry consulted before each TCGdex fetch. Tradeoff: touches card-search, set-browser,
     rules-state, hover/inspector… and every future caller.
   - Pick A: the proxy is already the single browser chokepoint (D164); engine, builder and board parse the
     identical shape they parse for TCGdex, which is exactly the "parse normally" requirement.
2. Set id scheme.
   - A. `custom<code>` (code 2–5 `[a-z0-9]`), card id `custom<code>-<nnn>`. Tradeoff: ugly prefix, but a single
     dash (many sim helpers split at the last/first dash) and no possible TCGdex collision.
   - B. Bare code (`hbw`). Tradeoff: a future TCGdex set id could collide; needs a reserved-word list.
   - Pick A.
3. Image files.
   - A. Cardback writes `high.webp` + `low.webp` (Pillow). Tradeoff: ~150 KB/card, mirrors TCGdex so `${image}/high.webp`
     consumers work untouched. B. Keep PNG and teach consumers `.png`. Tradeoff: many consumers.
   - Pick A. Location `client/src/assets/custom-sets/<setId>/<localId>/{high,low}.webp`, image base
     `/src/assets/custom-sets/<setId>/<localId>` (served by `express.static(clientDir)`).
4. Client cache staleness (IndexedDB keeps records 7 d).
   - A. `ttlForUrl`: custom ids → 60 s. B. Version query param. Pick A (one regex, no URL churn).
5. Decklist set codes for custom sets.
   - A. `GET /api/custom-sets` manifest, passed to `resolveEntry` via `deps.setIds`. B. Bake into `PTCGL_SET_IDS`.
   - Pick A: sets are data, the module stays pure/testable.
6. Mega stage in exports. TCGdex gives Mega ex cards the stage of the slot they evolve into (me01-003 Mega
   Venusaur ex: Stage2, evolveFrom Ivysaur). Cardback knows only `stage: 3` and `evolves_from`.
   - A. Cardback looks the pre-evolution up on TCGdex at export (`tcg.search("name", …)`) and writes Basic→Stage1,
     Stage1/Stage2→Stage2; fallback Stage1 with a warning. B. Omit `stage`, let `inferMissingStage` guess at play.
   - Pick A (deck-builder stage filters then work too).
7. Wording suggestions.
   - A. Cardback server calls the Anthropic Messages API (`claude-haiku-5-5`, stdlib urllib, key from env),
     page shows the suggestion with Use/Dismiss. B. Browser calls the API directly. Pick A (key never in the page).
8. Term capitalisation. A. One list in `svrestyle/wording.py`, generated from the corpora (committed with the
   generator), applied live in the page (caret kept, like `accentPokemon`) and on save for effect fields only.
   B. Hand-typed list. Pick A (data, cited).

## Design
### Sim data format — `client/src/assets/custom-sets/<setId>/set.json`
```json
{ "format": "ptcg-sim.custom-set-data", "version": 1,
  "id": "customhbw", "code": "HBW", "name": "Homebrew Wave 1", "releaseDate": "2026-10-23",
  "cards": [ <TCGdex-shaped card record> … ] }
```
Card record (Pokémon): `{id:"customhbw-001", localId:"001", category:"Pokemon", name, hp:int, types:[T], stage,
evolveFrom?, suffix?:"ex", attacks:[{cost:[T], name, damage:"90+"|int|"", effect}], abilities:[{type:"Ability",
name, effect}], weaknesses:[{type,value}], resistances:[{type,value}], retreat:int, regulationMark, rarity,
illustrator, description?, image:"/src/assets/custom-sets/customhbw/001", set:{id,name,cardCount:{official,total}},
legal:{standard:false,expanded:false}, custom:{source:"<tcgdex id>", edits:{…}, style, attacks:bool, foil:bool}}`.
Trainer: `category:"Trainer", trainerType:"Item"|"Supporter"|"Stadium"|"Tool", effect:"p1\n\np2", hp?, attacks?, abilities?`.
`custom` is cardback's round-trip block; the sim ignores it.
Validation (`shared/custom-sets/custom-set-schema.mjs`, pure, used by server + check script + tests):
`validateCustomSet(json, {setDirName}) → {ok, errors:[string], set}`; rules: format/version exact; `id` =
`/^custom[a-z0-9]{2,5}$/` and equals folder name; `code` = `/^[A-Z0-9]{2,5}$/` and equals id.slice(6).toUpperCase();
`name` 1–60 chars; ≥1 card; each card: id `${set.id}-${localId}`, localId `/^[0-9]{3}$/` unique, name 1–60,
category ∈ {Pokemon, Trainer, Energy}, image equals `/src/assets/custom-sets/${id}/${localId}`; Pokémon: hp int
10–990, types ⊆ TYPES, stage ∈ {Basic,Stage1,Stage2}, attacks ≤4 (cost ⊆ TYPES), abilities ≤2; Trainer:
trainerType ∈ 4 kinds, effect string. Unknown extra keys allowed.

### Server — `server/custom-sets.mjs`
- `loadCustomSets(rootDir, {log}) → store` — reads every `<rootDir>/*/set.json`; invalid sets are skipped with one
  `log` line each (`custom set <dir> skipped: <error>`); missing root → empty store. Store:
  `{ sets: Map<setId, {record, code, dir}>, cards: Map<cardId, card>, manifest() }`.
  Set record (for `/sets/<id>`): `{id, name, serie:{id:'custom', name:'Custom Sets'}, releaseDate, cardCount:{official,total},
  legal:{standard:false,expanded:false}, abbreviation:{official:code}, logo:'', symbol:'', cards:[{id, localId, name, image}]}`.
  Card records served verbatim from set.json with `set` filled as `{id, name, cardCount, releaseDate}`.
- `withCustomSets(proxy, store) → proxy'` same `{get, size}` interface:
  - `/v2/en/cards/<id>` with a custom id → `{status:200, body, cacheControl:'no-store', gzip:null}`;
    unknown custom id → 404 `{"error":"custom_card_not_found"}` (never upstream: TCGdex has nothing starting `custom`).
  - `/v2/en/sets/<id>` custom → set record; `/v2/en/series/custom` → `{id:'custom', name:'Custom Sets', sets:[briefs]}`.
  - `/v2/en/cards?<query>` → upstream result, then custom cards matching the query appended (body re-serialised;
    on an upstream non-200 status the custom matches alone are returned with 200 so a TCGdex outage still shows
    custom cards). Query semantics (TCGdex v2 filters): per key, dotted paths (`set.id`), value prefixes
    `eq:` exact (case-insensitive), `neq:`, `like:`/none → contains (case-insensitive), `gte:`/`lte:`/`gt:`/`lt:` numeric;
    array fields match if any element matches; keys `pagination:*`/`sort:*` ignored; a key the card lacks → no match.
  - `/v2/en/sets` and `/v2/en/series` lists → custom briefs appended likewise.
  - anything else → `proxy.get(key)` untouched.
- `customSetsManifestHandler(store)` → Express handler for `GET /api/custom-sets` →
  `{sets:[{id, code, name, cardCount, releaseDate}]}` (sorted by name). server.js wires:
  `const customSets = loadCustomSets(path.join(clientDir,'src','assets','custom-sets'), {log: console.error});`
  `app.get('/api/tcgdex/*', tcgdexProxyHandler(withCustomSets(createTcgdexProxy(), customSets)));`
  `app.get('/api/custom-sets', customSetsManifestHandler(customSets));`
- Boot log: `custom sets: N (ids…)` or `custom sets: none`.

### Client
- `shared/tcgdex/tcgdex-cache.mjs` `ttlForUrl`: `/\/(cards|sets)\/custom[a-z0-9]/` → `CUSTOM_TTL_MS = 60_000`.
- `shared/tcgdex/custom-sets.mjs` (new, pure+fetch): `isCustomSetId(id)`, `isCustomCardId(id)`,
  `customCardIdFromImageUrl(src)` (`/src/assets/custom-sets/<setId>/<localId>` → `<setId>-<localId>`),
  `fetchCustomSetManifest(fetchImpl)` → `{sets}` (memoised; `[]` on failure), `customSetCodes(manifest)` → `{CODE: setId}`.
- `shared/engine/rules/legacy-set-ids.mjs` `extractTcgdexIdFromImageUrl`: own custom path handled via
  `customCardIdFromImageUrl` before the pokemontcg.io branch.
- `deck-text-import.mjs`: `resolveEntry(entry, deps)` resolves `setId = PTCGL_SET_IDS[code] ?? deps.setIds?.[code]`;
  `chooseCandidate(candidates, entry, setIds = PTCGL_SET_IDS)` same lookup. Caller (`native-deck-builder.js`
  import popup) passes `setIds: customSetCodes(await fetchCustomSetManifest())`.
- `set-browser.mjs`: `CUSTOM_CATEGORY = 'custom'`; `fetchCustomSets()` → manifest → stubs
  `{setId, name, seriesId:'custom', releaseDate, logo:'', symbol:'', cardCount, category:'custom'}` newest first.
  `fetchSetCards(setId)` generic path already serves them (record.cards have `image`).
- `native-deck-builder-set-browser.js`: pill `<button … data-category="custom">Custom</button>` after Homebrew;
  `loadCategory('custom')` → `fetchCustomSets()`; `activeGroup` label `'Custom sets'`; empty → status
  `No custom sets installed. Drop a set folder into client/src/assets/custom-sets/ and restart the server.`
- `native-deck-builder-renderers.js` `tileScanUrl`: also maps `/src/assets/custom-sets/…/high.webp` → `low.webp`.
- `scripts/custom-sets/check.mjs` — `node scripts/custom-sets/check.mjs [dir]`: validates every set, reports
  missing image files, exit 1 on any error. `__tests__` cover the validator; the committed example set is checked
  by `server/__tests__/custom-sets.test.mjs`.
- Example set committed: `client/src/assets/custom-sets/customdemo/` (code DEMO, 2 cards rendered by cardback
  from real prints with an edit each, so the e2e path has data). Produced by the cardback export of slice 4.

### Cardback
- `svrestyle/wording.py` (new):
  - `TERMS`: tuple of canonical phrases, generated by `scripts/wording_terms.py` from the sim corpora (multi-word
    capitalised phrases ≥ 25 occurrences + the single capitalised nouns ≥ 100 mid-sentence occurrences, hand-pruned
    of Pokémon/attack names); each entry `(canonical, regex)`; `fix_terms(text)` capitalises whole-word
    case-insensitive matches, longest phrase first, never inside `{…}` or a word.
  - `suggest(text, kind, card, *, urlopen=urllib.request.urlopen, api_key=None) → {"text", "notes": [str]}`:
    POST `https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`,
    body `{model:"claude-haiku-5-5", max_tokens:400, temperature:0, system:SYSTEM, messages:[{role:"user",
    content: json(kind, card name/type/stage/hp, text)}]}`; the model must answer JSON `{"text": …, "notes": […]}`
    (prompt says so; a non-JSON answer → `ValueError("suggestion was not JSON")`). Timeout 25 s. `SYSTEM` holds
    the house rules (sentence templates, capitalisation, symbols, "this Pokémon", damage wording) and 8 printed
    examples cited by corpus row. `available()` = key present.
- `edit.py`: `_ability`/`_attack` effect and `_paragraphs` apply `wording.fix_terms(printed(...))`; names/flavor untouched.
- `gui.py`: `/api/meta` adds `terms: [canonical…]`, `suggest: wording.available()`; `POST /api/suggest {text, kind,
  card?}` → `wording.suggest`; errors → 400 (`UserError`) / 502 for API failure with the upstream message;
  `POST /api/export-set {items, title, code}` → zip laid out as `<setId>/set.json`, `<setId>/<nnn>/high.webp`
  (733×1024, quality 90), `<setId>/<nnn>/low.webp` (245×342), `<setId>/CHANGELOG.md`; `export_set_record(items,
  title, code)` builds set.json (`tcgdex_record(card, layout, set_id, local_id, item)` per card; Mega stage per
  Options 6). `import_set` also accepts a `ptcg-sim.custom-set-data` set.json: entries from `cards[].custom.source`
  with `edits`/`style`/`attacks`/`foil` restored (response gains `edits`, `options`, `code`).
- `gui.html`: Cards panel gets `<input id="setCode" maxlength=5 placeholder="Set code (2–5, e.g. HBW)">` and
  button "Download for ptcg-sim (.zip)" (disabled until the code is valid); project save includes `code`.
  Effect textareas (`textInput(..., multiline=true)` and `#effect`) get `data-wording`; the capture-phase input
  hook runs `fixTerms(input)` (caret kept: replacement never changes length except é… no — capitalisation keeps
  length) after `accentPokemon`. A "Suggest wording" button under each effect field → `/api/suggest`; result box
  shows the suggestion and notes, with Use (writes the field, `changed()`) and Dismiss; button disabled with
  title "Set ANTHROPIC_API_KEY to enable" when `meta.suggest` is false.
- README: new "Custom sets for ptcg-sim" and "Wording help" sections.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | custom-sets dir missing / empty | store empty, manifest `{sets:[]}`, proxy passes everything upstream, pill shows the empty message | [x] covered: custom-sets.test "a missing root is an empty store…"; check.test "a missing root is fine" |
| 2 | set.json malformed JSON / wrong format / bad id / folder≠id / dup localId | set skipped, one logged line naming the reason; others load | [x] covered: "loads valid sets, skips broken ones with one logged line each" |
| 3 | card id with custom prefix unknown | 404 `custom_card_not_found`, no upstream call | [x] covered: "custom ids are answered from the store and never reach TCGdex" |
| 4 | `/cards?name=like:x` with upstream 502 | 200 with custom matches only | [x] covered: "list queries get matching custom cards appended; TCGdex down…" |
| 5 | list query with `set.id=eq:customhbw` | only that set's cards appended; upstream result untouched | [x] covered: "matchesTcgdexQuery follows TCGdex operators…" (set.id rows) |
| 6 | query with unknown operator `foo:` | custom card never matches | [x] covered: same test, `foo:x` row |
| 7 | IndexedDB cached custom record | expires after 60 s | [x] covered: shared/tcgdex custom-sets.test "custom records barely cache" |
| 8 | decklist line `4 Tyranitar HBW 1` / `001` | resolves `customhbw-001` via manifest codes; unknown code → name search as today | [x] covered: deck-text-import.test "resolveEntry and chooseCandidate resolve custom set codes" |
| 9 | image path → id | `/src/assets/custom-sets/customhbw/001/high.webp` → `customhbw-001`; non-custom paths unchanged | [x] covered: "custom image paths map back to card ids"; "extractTcgdexIdFromImageUrl understands custom set art" |
| 10 | Mega export with pre-evolution lookup failing | stage `Stage1`, warning in export notes | [x] covered: cardback test_export "test_mega_stage_follows_the_pre_evolution" |
| 11 | export with invalid set code / empty list | 400 with message | [x] covered: test_export Zip.test_rejections, Http.test_export_set (Energy-only cannot happen: the editor lists no Energy) |
| 12 | suggest with no key | 502 "ANTHROPIC_API_KEY is not set"; page button disabled | [x] covered: test_wording Suggest.test_needs_a_key, test_export Http.test_suggest_without_a_key (status 502, not 400: it is the upstream the request lacks) |
| 13 | suggest API error / timeout / non-JSON answer | 502 with message; page shows it, field untouched | [x] covered: test_wording "api_failures_become_suggestion_errors", "answers_that_are_not_json_are_refused" |
| 14 | fix_terms on `{G}`, names, "Slowpokemon", already-correct text | symbols and inner-word matches untouched; idempotent | [x] covered: test_wording FixTerms (4 tests) |
| 15 | round trip: export set.json → cardback import | same ids, edits, options, code restored | [x] covered: test_export "test_round_trip_import" |
| 16 | concurrent requests | proxy wrapper is stateless over an immutable store; no new shared mutable state | [x] by construction: `withCustomSets` holds no state; the store is built once at boot and only read |
| 17 | validator: hp not multiple of 10, 5 attacks, 3 abilities, cost type "Fairy" | each one error line | [x] covered: custom-set-schema.test "Pokémon rules…" |

## Test plan
- Node: `shared/custom-sets/__tests__/custom-set-schema.test.mjs`, `server/__tests__/custom-sets.test.mjs`
  (store load from a temp dir, proxy wrapper with fakeFetch, manifest handler), `shared/tcgdex/__tests__/custom-sets.test.mjs`,
  `deck-text-import.test.mjs` additions, `generation-sets.test.mjs`/set-browser test for `fetchCustomSets`,
  `legacy-set-ids` id-from-URL test, tcgdex-cache ttl test. Example set validated in CI by the check script test.
- Python: `tests/test_wording.py` (fix_terms, suggest with mocked urlopen), `tests/test_gui.py` additions
  (export-set zip layout + set.json validity against the same rules, import round trip, /api/suggest without key).
- Manual: start sim with the demo set; Browse Sets → Custom → add a card → deck → game; attack text executes.
  Cardback: type "active pokemon" → "Active Pokémon"; Suggest wording with a key set.

## Migration / rollout
n/a: additive. Revert = delete `client/src/assets/custom-sets/` and the proxy wrapper line. Existing
`*.ptcg-set.json` (Custom Set tab) still imports into cardback.

## Work plan
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 sim schema + server | create `shared/custom-sets/custom-set-schema.mjs`, `server/custom-sets.mjs`, tests; modify `server/server.js`, `shared/tcgdex/tcgdex-cache.mjs`, `shared/tcgdex/custom-sets.mjs` (new), `shared/engine/rules/legacy-set-ids.mjs` | as Design §Server/§Client | rows 1–7, 9, 16, 17 | TCGdex record shape (sv03.5-065, sv01-196, me01-003 fetched 2026-10-23) | `node --test` on new tests; `pnpm test:changed` |
| 2 deck builder | modify `deck-text-import.mjs`, `set-browser.mjs`, `native-deck-builder-set-browser.js`, `native-deck-builder.js` (deps.setIds), `native-deck-builder-renderers.js`; tests | `fetchCustomSets()`, `resolveEntry(entry, {…, setIds})` | row 8; pill lists manifest sets; tile low.webp mapping | — | tests green |
| 3 cardback wording | create `svrestyle/wording.py`, `scripts/wording_terms.py`, `tests/test_wording.py`; modify `edit.py`, `gui.py`, `gui.html`, README | §Cardback | rows 12–14 | corpus rows cited in SYSTEM examples | `python -m unittest discover tests` |
| 4 cardback export/import | modify `gui.py`, `gui.html`, `edit.py` (CARD_ID accepts `custom[a-z0-9]{2,5}-\d{3}` for portrait/ids), tests, README | `export_set_record`, `tcgdex_record`, `import_set` | rows 10, 11, 15; set.json passes the sim validator (copy of rules in test) | me01-003 stage rule | tests green |
| 5 demo set + e2e | create `client/src/assets/custom-sets/customdemo/*`, `scripts/custom-sets/check.mjs`; MAP/DECISIONS/STATE | — | check script exit 0; manual game run | — | `pnpm test`, gates |

## Deviations (Builder appends here during build)
- Edge row 12: a missing key answers 502 (the API is the missing dependency), not 400; the page copy is the same.
- Cardback `modern.read_card` now carries `illustrator`, `reg_mark`, `rarity` (not drawn, exported) so SV/ME cards
  edited in place export a full record; `export.straight` writes TCGdex's straight apostrophes (the engine also
  normalises curly ones, attack-text.mjs:89, so this is hygiene).
- Slice 5's demo set is `customdemo` (code DEMO): Alakazam ex (sv03.5-065) with one reworded attack, Ultra Ball
  (sv01-196) renamed Hyper Ball searching a Basic Pokémon; built by the real export. Engine proof: the Hyper Ball
  text parses to `discardCost 2` + `searchDeck Basic Pokémon → hand, reveal`; the attacks resolve through the damage
  parser / status path like their TCGdex twins (checked with scripts/lib/oracle-harness.mjs, see commit).
- Cardback `wording.TERMS` includes "Basic" although older sets printed "basic Energy": every Scarlet & Violet /
  Mega Evolution card prints "Basic" (437 to 0 in the corpora), and the editor targets those frames.
