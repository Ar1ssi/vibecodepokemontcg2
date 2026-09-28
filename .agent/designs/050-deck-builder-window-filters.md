# 050: Deck builder in its own window, TCG Live filter drawer, slim Deck tab
Status: approved (user) — picks made via AskUserQuestion 2026-09-28 (layout B drawer, real
browser window/tab, slim Deck tab, filter-only search). Leftover calls listed under Options.
Date: 2026-09-28 · Superdesign draft 12b205d8 ("PC Box Deck Builder — Standalone with TCG Live Filter Drawer")

## Problem
The deck builder slides over the board and shares the screen with the Deck sidebox (a decklist
textarea importer). The user wants: the builder in its own browser tab, a thorough TCG Live-style
filter system, the deck list pushed to the far right, and the text-import tab gone.

## Constraints
- Same-origin only; no new dependency. PC Box look (design 025) and `.db-live` scoping stay.
- Builder state lives in localStorage (deck library `deck-library.mjs`, last session, theme) — both
  windows read the same store.
- The game window must keep working without the builder window open: restore-last-deck on room
  join (`socket-event-listeners.js:356`), mats announced at boot, sleeve/coin/mat per deck.
- Multiplayer: P2 target is Solo-only; the game window re-checks it (the builder window can be stale).
- TCGdex list filters verified live 2026-09-28: `types`, `stage`, `hp=gte:N`, `regulationMark`,
  `trainerType`, `energyType`, `retreat`, `rarity`, `suffix`, `legal.standard`, `category`,
  `a|b` OR. Not usable server-side: `weaknesses.type` (0 rows), `abilities.*` (0 rows), two `hp`
  keys (the proxy rejects repeated keys; `canonicalTcgdexPath`). Enumerations: `/rarities`,
  `/stages` (Basic, Stage1, Stage2, BREAK, Baby, LEVEL-UP, MEGA, RESTORED, V-UNION, VMAX, VSTAR),
  `/suffixes` (ex, EX, GX, V, TAG TEAM-GX, Legend, Prime, SP), `/regulation-marks` D-J.
- TCGdex has no Tera marker (sv03-125 Charizard ex carries no Tera field or rule text) — a Tera
  filter cannot be honest, so it is not offered.

## Current state
- `client/index.ejs:191-243` — `#deckImport` sidebox: P1/P2 toggle, two decklist textareas,
  Import/Confirm/Cancel/Save, sample decklists, random deck, Change Card Back, Language.
- `client/index.ejs:245-350` — `#nativeDeckBuilderWorkspace`: slides in (`.open`) over the board,
  `right: calc(24% - 8px)` so the sidebox stays visible (`index.css:1436`).
- `header-buttons.js:114` — Deck tab shows `#deckImport` and adds `.open` to the workspace.
- `native-deck-builder.js` — builder controller; game side effects: `loadDeckData` (Play/close via
  `deck-builder-closing`), `changeCardBack`, `changePlaymat`/`playmat-changed`,
  `rules-coin-changed`, `deck-sleeve-changed`. Autosaves the editor deck into the active saved deck
  on every `render()`.
- `native-deck-builder-library.js` — holds the library in memory, writes whole snapshots.
- `import.js` — text import + `loadDeckData` + `changeCardBack`; binds the import buttons at module
  load. `import-deck.js` — sidebox wiring. `sample.decklists.js` — sample-decklist menu. Language
  only feeds the text importer (`getLanguage` -> `DecklistArray`).
- `card-filters.mjs` — 3 pill groups (card type, energy type, Trainer type), local-only.
- `card-search.mjs` — name search, then at most 150 detail fetches; `normalizeTcgdexCard` keeps few fields.

## Options
1. Window content. A: separate light page with only the builder — needs `native-deck-builder.js`
   decoupled from board modules it imports at load (`import.js` grabs board DOM). B: same
   `index.ejs` in a builder role (`/deck-builder`), board hidden. **Pick B**: zero decoupling risk;
   the hidden board costs one idle page load.
2. Game effects from the builder window. A: call the opener's functions directly (`window.opener`)
   — needs globals on the game window. B: typed `postMessage` protocol validated on both sides.
   **Pick B**: explicit, testable, survives an opener reload.
3. Keeping two windows' library copies consistent. A: game window never writes deck cards
   (host role) + library re-reads storage before every mutation and on `storage` events. B: lock
   the library to one window. **Pick A**: the host's only writes are cosmetic fixes (two-player mat
   clears); re-reading before each mutation removes whole-snapshot clobbering.
4. Tab vs sized popup. `window.open(url, name)` without features opens a tab ("separate tab").
   **Pick tab**. An existing window is reused (open `''` first, navigate only if blank) so a second
   Deck click never reloads unsaved work.
5. Filter application. A: filters narrow the last result set locally. B: filters become TCGdex
   query params (server narrows) and the client re-filters (client is the truth). **Pick B**
   (user: filter-only search). Changing filters re-runs the search.
6. Dropped with the text importer (decided for the user): Language button (its only consumer is the
   text importer), sample decklists, random deck, the confirm table. Slim Deck tab keeps
   P1/P2, Change Card Back, and an "Open Deck Builder" button.
7. Tera filter: not offered (no data). Mega lives under Special (covers modern "Mega ... ex" and
   legacy "M ...-EX" via `isMegaCard`), not under Stage.

## Design
### Roles
`client/src/setup/deck-builder/core/builder-window.mjs` (pure):
- `BUILDER_WINDOW_NAME = 'ptcgDeckBuilder'`, `BUILDER_WINDOW_PATH = '/deck-builder'`,
  `BUILDER_MESSAGE_SOURCE = 'ptcg-deck-builder'`.
- `resolveBuilderRole(pathname) -> 'editor' | 'host'` (`/deck-builder` -> editor).
- `buildBuilderMessage(type, payload) -> { source, version: 1, type, payload }`.
- `parseBuilderMessage(data) -> { type, payload } | null` — validates:
  - editor -> host: `ready {}`; `load-deck { target, deckId: string|null, rows }`;
    `card-back { target, image, emit: boolean }`; `sleeve { target, image: string|null }`;
    `mat { target, matId: string|null, emit: boolean }`; `coin { target, coinId: string|null }`;
    `play { target }`.
  - host -> editor: `host-state { isTwoPlayer: boolean }`.
  - `target` in {self, opp}; ids at most 128 chars; image at most 2048 chars, `http(s)://` or
    `/`-rooted; rows: array of at most 500 arrays of length 4-7, each cell string|number|null,
    string cells at most 2048 chars.
Server: `GET /deck-builder` renders `index` with `builderWindow: true`; EJS sets
`<body class="deck-builder-window">` and the page title.

### Effects seam (native-deck-builder.js)
`initializeNativeDeckBuilder({ role })`. A `gameLink` object replaces direct calls:
`loadDeck(target, rows, deckId)`, `changeCardBack(target, image, emit)`, `announceSleeve(target, image)`,
`announceMat(target, mat, emit)`, `announceCoin(target, coin)`, `play(target)`, `isTwoPlayer()`.
- host role: local implementations (today's code), and the library opens with
  `allowDeckWrites: false` so `saveActiveDeck`/`saveCurrentDeck` are no-ops there.
- editor role: posts messages to `window.opener`; `isTwoPlayer()` reads the last `host-state`.
  No opener (tab opened directly or game closed) -> banner "Not connected to a game tab" and Play
  disabled; editing and saving still work.
`client/src/initialization/document-event-listeners/sidebox/deck-builder-window.js` (DOM glue):
- `openDeckBuilderWindow() -> Window|null` — `window.open('', NAME)`; if its location is
  `about:blank` -> `location.replace(BUILDER_WINDOW_PATH)`; focuses it; returns null when blocked.
- `installDeckBuilderHost({ apply, getHostState })` — game window `message` listener:
  `event.origin` must equal `location.origin`, `event.source` must not be `window`, data must
  parse; replies `host-state` to `ready`; forwards everything else to `apply(message)`.
- `connectToHost({ onHostState })` — editor side: posts `ready`, exposes `post(type, payload)` and
  `isConnected()`.
Host `apply`: `load-deck` -> `deckLibrary.refresh()`, bind `deckId`, `loadDeckData(target, rows)`
(rejects `opp` while `isTwoPlayer`); `card-back` -> `changeCardBack`; `sleeve` -> dispatch
`deck-sleeve-changed`; `mat` -> `changePlaymat(target, matId, emit)` when emit else dispatch
`playmat-changed` with the mat payload; `coin` -> dispatch `rules-coin-changed`; `play` -> show
p1Box/p2Box and focus. Editor Play: `loadDeck` (flush), `play`, then `window.close()`.
Editor `pagehide` flushes a dirty deck with `load-deck`.

### Library consistency (native-deck-builder-library.js)
Every mutating method re-reads storage first (`library = loadLibraryFromStorage(...)`) and a
`storage` event for the library key re-reads + re-renders. New option `allowDeckWrites`
(default true).

### Filters (card-filters.mjs)
State: `{ supertypes[], energyTypes[], trainerTypes[], energyKinds[], stages[], mechanics[],
rarities[], sets[], regulationMarks[], weaknessTypes[], retreatCosts[], format: ''|'standard'|
'expanded', hpMin: number|null, hpMax: number|null, hasAbility: bool, inDeck: bool }`.
Semantics: OR within a group, AND across groups (unchanged). Group constraints apply only to cards
that can carry the property (a Trainer fails an energy-type/stage/HP constraint).
- `energyKinds`: Basic iff `isBasicEnergy`, Special iff `energyType === 'Special'`.
- `stages`: TCGdex `stage` values; `mechanics`: ex iff suffix `ex` or name `/ ex$/` (case-sensitive),
  EX iff suffix `EX` or `/[\s-]EX$/`, GX, V, TAG TEAM, Mega, Radiant, Prism Star, ACE SPEC, LEGEND
  via `card-classify.mjs` predicates plus suffix.
- `format`: `legal.standard` / `legal.expanded` true. `regulationMarks`: `regulationMark`
  case-insensitive. `retreatCosts`: '0'...'4', '5' means 5 or more. HP: inclusive range.
- `rarities`: `printedRarity` case-insensitive. `sets`: `set.id`. `weaknessTypes`: any weakness type.
- `hasAbility`: `abilities.length > 0`. `inDeck`: card id in `context.quantities`.
Functions: `createEmptyFilters`, `toggleFilter(filters, group, value)` (booleans flip, `format`
single-select), `setHpRange(filters, min, max)` (clamps 0-400, step 10, swaps, full range -> null),
`countActiveFilters`, `hasActiveFilters`, `applyCardFilters(cards, filters, context)`,
`describeActiveFilters(filters, context) -> [{ group, value, label }]`, `removeFilterChip(filters, chip)`,
`buildTcgdexFilterParams(filters) -> Record<string,string>` (server-narrowable subset; `{}` when none),
`deriveSetOptions(cards)`.
Search (`card-search.mjs`): `normalizeTcgdexCard` adds `hp`, `retreat`, `weaknesses` (types),
`abilities` (names), `regulationMark`, `legal`, `suffix`;
`queryCards({ term, params })` — term -> name plan as today with params appended; no term + params
-> one `/cards?params` query; the result reports `detailed` and `totalSummaries` so the status can
say "N of M" when the 150-detail cap truncates. `applyLocalControls` sort adds `hp` and `number`.

### UI
Drawer per draft 12b205d8: `Filters (n)` button in the search row opens `#nativeDeckBuilderFilterDrawer`
(absolute over the result grid, scrim, two-column sections, Reset / Apply). Active chips strip
under the search row with the result count and "Reset all". Renderers: `renderFilterDrawer`,
`renderFilterChips` (replace `renderFilterBar`). Builder window layout: workspace fills the viewport;
`.native-deck-builder-pane-side` fixed 360px at the right edge.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no term, no server-narrowable filter | results cleared, status asks for a name or a Format/Type/Stage filter | [ ] |
| 2 | malformed postMessage (wrong source/type/target/rows) | ignored, nothing applied | [ ] |
| 3 | HP range min>max / out of range / full range | swapped / clamped / cleared to null | [ ] |
| 4 | Deck tab clicked twice | same window focused, not reloaded | [ ] |
| 5 | TCGdex down / timeout | status "Search failed: ...", results cleared (existing path) | [ ] |
| 6 | builder tab closed with a dirty deck | `pagehide` flushes `load-deck` to the game tab | [ ] |
| 7 | builder opened directly, no opener | banner shown, Play disabled, library editing works | [ ] |
| 8 | opp load while multiplayer | host rejects (`isTwoPlayer`) | [ ] |
| 9 | other window wrote the library | storage event -> reload + re-render; mutations re-read first | [ ] |
| 10 | pop-up blocked | slim tab shows "Allow pop-ups for this site to open the deck builder" | [ ] |
| 11 | card lacks a property (Trainer vs HP filter) | excluded by that group's constraint | [ ] |
| 12 | more than 150 matches | first 150 detailed, status says so and asks for filters | [ ] |

## Test plan
Unit: `card-filters.test.mjs` (all groups, chips, params, HP), `card-search.test.mjs` (normalize
fields, params query, sort hp/number), `builder-window.test.mjs` (role, build/parse, every reject).
E2E once by hand in the browser pane: Deck tab opens the builder tab; search with filters; Play
loads the deck into P1 on the game tab.

## Migration / rollout
No data migration: library format unchanged. Revert path: revert the commit; the old workspace
layout and `#deckImport` come back with it. Text-importer removal is the only lost feature.

## Work plan
| Slice | Files | Signatures & data shapes | Test cases | Rulings | Green when |
|---|---|---|---|---|---|
| 1 | card-filters.mjs, card-search.mjs, their tests | per Design § Filters | Fire Stage2 ex -> only matching; Trainer vs hpMin 100 -> excluded; params {types:'Fire', stage:'Stage2', hp:'gte:100'}; retreat '5' -> 5 or more | TCGdex sv03.5-006 fields | tests green |
| 2 | builder-window.mjs + test | per Design § Roles | bad target/rows/image rejected; valid load-deck parsed | — | tests green |
| 3 | native-deck-builder*.js, renderers, index.ejs, CSS | drawer + chips + role seam + host | e2e by hand | — | tests green, lint clean |
| 4 | server.js, header-buttons.js, import*.js, sample.decklists.js, settings.js, header-toggle.js, index.css | slim tab + route | e2e by hand | — | full `pnpm test` green |

## Deviations (Builder appends here during build)
