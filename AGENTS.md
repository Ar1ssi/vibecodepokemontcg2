# AGENTS.md — PTCG-sim

Open-source Pokémon TCG tabletop simulator (solo + online multiplayer).
pnpm monorepo with two workspaces: `client/` and `server/`. No bundler or
transpiler — plain ESM runs directly in the browser.

## Layout

- `server/` — Express + Socket.IO backend. `server.js` is the entire server.
- `client/` — Static frontend. `index.ejs` is the main page (server-rendered,
  injects `importDataJSON`); `self-containers.html` / `opp-containers.html` are
  iframes holding the board zones (deck, hand, active, bench, prizes, discard).
- `client/src/front-end.js` — Main JS entry; wires initialization in order:
  socket listeners → DOM listeners → mutation observers → import-data replay.
- `client/src/initialization/` — Global vars (socket conn, `systemState`),
  DOM/socket event listeners, mutation observers, import-data loading.
- `client/src/actions/` — Game actions: `chat-buttons/`, `counters/`,
  `general/` (turn flow, setup, undo), `keybinds/`, `move-card-bundle/` (all
  card movement & attachment), `zones/` (draw/shuffle/prize ops).
- `client/src/setup/` — Feature modules: `deck-builder/` (pure logic in
  `core/*.mjs` + `__tests__/`), `deck-constructor/` (decklist parse → DOM),
  `rules/` (rules engine — see module inventory below), `chatbox/`, `general/`,
  `image-logic/` (drag & drop), `settings/`, `sizing/`, `spectator/`,
  `home-header/`.
  Rules modules in `setup/rules/`: `rules-state.mjs`, `rules-bridge.js`,
  `attack-engine.mjs`, `damage-parser.mjs`, `attack-effects.mjs`,
  `attack-window.mjs`, `ko-flow.mjs`, `status.mjs`, `evolution.mjs`,
  `retreat.mjs`, `mulligan.mjs`, `rules-turnorder.mjs`, `trainer-effects.mjs`,
  `abilities.mjs`, `ability-effects.mjs`, `ability-executors.mjs`,
  `stadium-effects.mjs`, `energy-effects.mjs`.
- `client/src/assets/`, `client/src/css/` — Images and stylesheets.
- `browser-test.mjs` / `integration-test.mjs` — ad-hoc UI tests at root
  (Playwright / jsdom), not part of `pnpm test`.
- `render.yaml` — Render deploy config. `README.md` — changelog of recent work.

## Entry points

- Server: `server/server.js` (Express app + Socket.IO; port `PORT` or 4000).
- Client: `client/index.ejs` → loads Socket.IO from CDN, then
  `client/src/front-end.js` as an ES module.

## Build / run / test

```bash
corepack enable && pnpm install --frozen-lockfile  # install (pnpm; both lockfiles present)
pnpm start         # = pnpm -C server start = nodemon server.js → http://localhost:4000
pnpm test          # node --test over the explicit list of *.test.mjs files
pnpm lint          # eslint .
pnpm format        # prettier --write "**/*.{js,json,md}"
node browser-test.mjs      # needs a RUNNING server + Playwright chromium
node integration-test.mjs  # jsdom smoke test of the real page; no server needed
```

**Sandbox fallback (no npm/pnpm on PATH):** `node`, `npm`, and `pnpm` may all be
absent from the shell PATH. A working standalone Node lives at
`~/.lmstudio/.internal/utils/node.exe` (Windows; check that dir for other OSes).
Run tests directly instead of via pnpm:

```bash
"/c/Users/SMG26/.lmstudio/.internal/utils/node.exe" --test <same file list as the package.json test script>
```

Without npm/pnpm you cannot `pnpm install`, so `pnpm lint` / `pnpm format`
(ESLint, Prettier) may be unrunnable — say so explicitly rather than assuming
they passed. `node --check <file>` still works per-file as a syntax sanity
check. Never claim lint passed without actually running it.

## Conventions

- ESM everywhere (`"type": "module"` in both workspaces). No build step.
- Pure, DOM-free logic lives in `*.mjs` modules (e.g. `setup/deck-builder/core/`,
  `setup/rules/`) — that's what gets unit-tested. UI wiring is plain `.js`.
- Tests: `node:test` + `node:assert/strict`, in `__tests__/*.test.mjs` next to code.
- Prettier: single quotes, trailing commas (es5), `endOfLine: auto`; ESLint 9
  flat config; prettier rules run as warnings.
- Filenames kebab-case, functions camelCase, localStorage namespaced
  (e.g. `ptcg-sim.deck-library.v1`).

## Context budget (for small-context models, ≤32K)

- `client/index.ejs` is ~1,105 lines / **~23K tokens — never read it whole.**
  Search it (grep) to locate a region, then read only a 30–80 line window
  around the match. If a task touches several regions, read + edit one region
  at a time; don't accumulate.
- `server/server.js` (~330 lines) and `front-end.js` (11-line dispatcher) are
  small — safe to read in one pass. Real wiring lives in
  `client/src/initialization/` and `client/src/actions/`, one file at a time.
- Prefer `search_file_line` / grep over file reads for any exploration.

## Gotchas

- Root `package.json` `test` script **lists every test file explicitly** — new
  test files must be added to that list or they are silently skipped.
- `client/index.ejs` is one giant page with many inline `<script>` blocks, and
  the board zones live in the two container iframes, not in `index.ejs`.
- Card data/images come from external APIs at runtime (`api.tcgdex.net`,
  `images.pokemontcg.io`, `limitlesstcg.com`) — there is no local card DB.
- `server/database/db.sqlite` is auto-created and gitignored; Render wipes it
  on deploy. A 15 GB cap is enforced at runtime.
- Socket relay: the server only forwards whitelisted events (the `events`
  array in `server.js`); add new relayed events there. `rulesEvent` is
  handled separately.
- Every response is sent `Cache-Control: no-store` (demo tunnel) — don't "fix" it.
- Shared mutable state lives in `systemState` (`initialization/global-variables/`)
  and `rulesState` (`setup/rules/rules-state.mjs`) — treat state objects, not
  the DOM, as the source of truth.
- Production (Render) runs `node server/server.js` directly; nodemon is dev-only.
- `evolution.test.mjs` exists in `__tests__/` but is **not** in the root
  `package.json` test list (pre-existing; silently skipped) — flag it, and
  prefer appending new tests to an already-listed file.
- `localStorage` access in pure `.mjs` modules is wrapped in try/catch so the
  same code runs under `node --test`; tests may stub `globalThis.localStorage`
  (save the previous value, restore it in `finally`).

## Rules mode behavior (default-on + multiplayer lock-in)

- Rules enforcement (`rulesState.enabled`, `setup/rules/`) is **ON by default**
  on first run: `loadRulesEnabled()` (`rules-state.mjs`) treats a missing
  localStorage value as on; only an explicitly stored `'0'` keeps it off. It
  runs on every page load via `initializeRulesEngine()` (`initialize-sidebox.js`),
  before first paint.
- **Multiplayer always forces rules on and blocks unticking.** The only two
  places `systemState.isTwoPlayer` becomes true are `joinGame`
  (`initialization/socket-event-listeners/`) and `spectatorJoin`
  (`setup/spectator/`); both now call `forceRulesEnabledForMultiplayer()`
  (exported from `rules-bridge.js`), which sets `enabled = true`, **persists**
  it to localStorage (a solo "off" preference is overwritten on first
  multiplayer join — deliberate), announces via
  `appendMessage('', text, 'announcement', false)`, dispatches
  `rules-mode-changed`, and re-syncs the toggle + body `rules-mode` class.
- Untick attempts while in multiplayer do not disable the control; they snap
  the checkbox back to checked with an announcement (see the change handler in
  `buildRulesToggle()` in `rules-bridge.js`). Solo players may still toggle
  rules off.
- The checkbox and the `rules-mode` body class are mirrors, not sources of
  truth — always mutate `rulesState.enabled` and call `syncRulesToggleUI()`.

## Turn-order coin flip (after both players ready)

- **Goal:** once **both** players have readied up and opening hands/prizes are
  dealt (rules on), **the caller picks a face (heads/tails)** via a 2-button
  picker, then a coin from either player's selection is flipped (full-screen
  animation): **the caller goes first iff the coin lands on the face they
  called**. Runs in solo (shared-browser P1+P2) and online multiplayer, where
  the mirror side **auto-starts** from the broadcast (no second ready) and the
  flip is announced once. All logic lives in `rules-bridge.js`; the pure,
  unit-tested resolution is `decideTurnOrder()` in `rules-turnorder.mjs`
  (caller + call + result → who goes first); state in `rules-state.mjs`
  (`rulesState`); overlay CSS in `client/src/css/index.css` (`.coin-toss-wrap`,
  `#turnOrderCoinFlipOverlay`, `@keyframes coin-toss-arc`).
- **Ready-check wiring (not a direct Set Up click hook):**
  - Set Up buttons call `readyUp()` (`actions/general/ready.js`). When both
    sides are ready, `ready.js` runs `setup()` (deals hands/prizes) and
    dispatches `both-players-ready`.
  - `hookSetupButton()` listens for **`both-players-ready`** (not clicks on
    `#setupButton` / `#p2SetupButton` / `#setupBothButton`). That event is what
    opens the coin-call picker / flip.
  - `hookResetButtons()` attaches capture hooks to `#resetButton`,
    `#p2ResetButton`, `#resetBothButton` that, when rules on, re-arm the flip by
    resetting `rulesState.phase='setup'`, `turnNumber=0`, `syncedTurnOrder=null`
    (and clears `turnEndedByAttack`). Needed because the non-rules `reset()`
    handlers do NOT touch `rulesState`.
- **Guards in `handleSetupClick` (in order):** `rulesState.enabled`;
  `systemState.isReplay` (replay repurposes setup UI — must not flip);
  `rulesState.phase !== 'setup'`; `coinFlipPending`; `coinCallPending` (picker
  already open); `syncedTurnOrder` (multiplayer mirror — start from opponent's
  broadcast outcome, no local flip); `coinCallChoice` (opponent already
  broadcast their call — **wait** for their flip broadcast; do **not** flip
  locally). Otherwise open `openCoinCallPicker()` (overlay
  `#rulesCoinCallOverlay`, z-index 2400, click-outside does NOT pick a face)
  and flip via `runTurnOrderCoinFlip({ call, caller })` →
  `beginSetupWithTurnOrder(firstPlayer)` (module-scope; calls `startGame` then
  `beginTurn(firstPlayer)` so turn 1 is real).
- **Invariants:** the original `setup()` deal already ran inside `ready.js`
  before `both-players-ready`; the rules hook only adds turn order + mulligan.
  `runTurnOrderCoinFlip()` resolves after ~2700 ms (animation ~2.4s + fade
  0.4s). The 2500 ms mulligan `setTimeout` inside `proceedWithSetup` can
  overlap the overlay fade — pre-existing, acceptable.
- **Multiplayer mirror:** `hookMultiplayerSync()` (`rules-bridge.js`) relays
  over `rulesSocket.emit('rulesEvent', …)` (server relays `rulesEvent`,
  `server/server.js` ~181–187):
  - `turnOrderCoinCall` — emitted when the caller picks a face (2P only); the
    mirror stores it (`coinCallChoice`, `coinCallCaller` inverted) and closes
    its own open picker if one is up.
  - `turnOrderCoinFlip` — `{ caller, call, result, turnPlayer, coinId,
    coinOwner }` (sender-perspective; mirror inverts `caller`/`coinOwner` and
    recomputes who goes first via pure `decideTurnOrder()`). Mirror
    **auto-starts** via `beginSetupWithTurnOrder` when
    `phase === 'setup' && !coinFlipPending`.
  - **Single announcement:** remote animation path passes `isRemote: true`;
    only the local (non-remote) flip appends its chat message.
- **`selectedCoins`** (`rules-bridge.js`, module-level `{ self, opp }`) is
  populated by the `rules-coin-changed` event (from `native-deck-builder.js`);
  the flip picks a coin from `selectedCoins[owner]` (random owner) or
  `pickRandomCoin()` from the catalog.
- **Verification status:** `decideTurnOrder` is unit-tested in `rules.test.mjs`.
  Full listed suite baseline: **396/396**. Interactive picker / mirror
  auto-start / single-announcement were **not** live-verified in the sandbox.
  `evolution.test.mjs` exists but is **not** in the root `package.json` test
  list.

## Turn flow: attacking (or passing) ends the turn

**Goal:** a turn ends naturally after a player attacks or passes — no separate
+Turn click required when rules are on. Applies in solo shared-browser (P1/P2)
and online multiplayer. The single source of the turn-advance is `endTurn()`
(`rules-state.mjs`); `markAttacked()` only sets `phase='attack'` and does NOT
advance the turn by itself.

- **Live entry points:** `attack()` / `pass()` in
  `client/src/actions/chat-buttons/chat-buttons.js` (wired from
  `sidebox/p1|p2/chat-buttons.js`, always called with `systemState.initiator`).
  When `rulesState.enabled`, `attack()` gates via status (`canAct` / wake /
  confused), `canPerformAction({ user, action: 'attack' })`, energy cost, and
  once-per-turn attack clauses; applies damage via `computeAttackDamage` +
  `damage-parser.mjs` helpers (bench/heal/draw/attach/switch/discard/shuffle,
  etc.); applies status in solo; runs KO/prizes; then
  `endTurnWithBanner(user)` → `endTurn` + "Turn passes to P1/P2" +
  `rules-turn-began` CustomEvent (so `updateTurnBanner()` in `rules-bridge.js`
  refreshes without a circular import). `pass()` ends the turn the same way
  without `markAttacked`.
- **Multiplayer sync:** there is **no** `runAttack()` and **no** live
  `rulesEvent { type: 'attacked' | 'turnPassed' }` emit from the attack/pass
  path. Sync is the normal action relay: `processAction` → opponent's
  `accept-action.js` replays `attack` / `pass` locally (`emit=false`), and each
  client advances `rulesState` via `endTurnWithBanner`. `hookMultiplayerSync()`
  still has `attacked` / `turnPassed` listeners (incl. a `data.status` apply on
  `attacked`), but **nothing in the repo currently emits those types** — treat
  them as dead/legacy, not the live path. Multiplayer status-on-opponent
  therefore does not sync via `rulesEvent` today (known gap).
- **`hookTurnButton()`:** capture listener on `#passButton` (UI label "Pass").
  When rules on it `preventDefault` + `stopImmediatePropagation`, runs
  end-of-turn status/ability/win sweeps, then `endTurn`. Module flag
  `turnEndedByAttack` is declared and cleared on reset, but is **never set
  true** anywhere today (stale double-advance guard leftover).
- **`user`/`turnPlayer` framing:** `systemState.initiator` and
  `rulesState.turnPlayer` share the client-perspective frame. Test both board
  orientations if this changes.
- **Tests:** `markAttacked` / `endTurn` / re-attack gating covered in
  `rules.test.mjs`. Full suite baseline: **396/396**.

## Multiplayer card sleeve (card back) sync

**Goal:** a player's picked sleeve is visible to the opponent — picking a sleeve
broadcasts over the socket and re-points the opponent-side back images.

- **Single syncable entry point:** `changeCardBack(user, image, emit = true)`
  (`setup/deck-constructor/import.js`, ~line 971). Sets the correct state var
  (self vs `systemState.p2OppCardBackSrc`), re-points the *target* container's
  back `<img>`s (verified via a known-backs includes check — NOT substring
  matching), and calls `processAction(user, emit, 'changeCardBack', [image])` →
  opponent's `accept-action.js` (registered ~line 69) → local `changeCardBack`.
  Join-time exchange also covers card backs. **Do not edit these files to change
  sleeve behavior.**
- **Edit target for deck-builder sleeve behavior:** ONLY
  `initialization/document-event-listeners/sidebox/native-deck-builder.js`.
  Conventions there:
  - Sleeve picker `onChange`: `changeCardBack(currentLoadTarget, image, true)`
    (user-driven → broadcast). No-sleeve branch still dispatches
    `deck-sleeve-changed` with `{ target: currentLoadTarget, image: null }`.
  - `syncCustomizationToDeck` (init / deck switch): `emit = false`.
  - `deck-sleeve-changed` detail always `{ target, image }`; listener calls
    `applySleeveToPlaymat(image, target || 'self')` for that target only.
- **Known latent bug (pre-existing, flagged not fixed):** the Play-button sleeve
  path in `native-deck-builder.js` (~line 145) hardcodes
  `changeCardBack('self', image, false)` regardless of `currentLoadTarget`.
- **Gotchas:** `node --check` is syntax-only (won't catch
  `currentTarget` vs `currentLoadTarget`). Full suite baseline: **396/396**.
  Live two-client sync is not sandbox-verifiable — rely on the relay chain
  above.

## Guided Trainer play flow

**Goal:** when a Trainer is played under rules mode, drive its effect through
menu-driven / auto-executed steps instead of announce-only. Logic split:

- `client/src/setup/rules/trainer-effects.mjs` — **pure, DOM-free**
  `parseTrainerEffect` + `describeStep`. Unit-tested. No `document`/`window`.
- `client/src/setup/rules/rules-bridge.js` — UI + execution:
  `autoExecuteTrainer`, `hookTrainerPlay`, `runSearchPicker`, `openChoicePicker`,
  `matchesSearch`, heal/recursion pickers.

**Executed today**

- **✅ Auto:** `discardHandThenDraw`, `shuffleHandThenDraw`, `ionoShuffle`,
  `draw`, `drawUntil`, `opponentDraw`, Nest-Ball single-Basic `searchDeck`
  (auto-bench when exactly one Basic), `healAmount` (direct when unambiguous;
  heal picker when multiple targets).
- **✅ Guided pickers:** generic `searchDeck` (hand/bench, multi-select),
  `discardCost` → then search, `recursion` (discard → hand), `lookAtTop`
  (opens private deck search window — not a filtered card picker).
- **⚠️ Partial:** `switchOwn` — tips only when bench size is 1 (still needs
  manual drag).
- **Announce-only (parsed, not guided):** `switchOpponent`,
  `switchOpponentOut`, legacy `heal` (heal-all), `attachFromDiscard`,
  `evolveStage2`, `moveEnergy`, `devolve`, `discardTools`,
  `discardFromOpponent`, `passive`.

Do not silently add pickers for announce-only families without confirmation.

**Parser branch order is load-bearing — do not reorder casually** (see
`parseTrainerEffect` in `trainer-effects.mjs`):
`discardHandThenDraw` → `shuffleHandThenDraw` → `searchDeck` (+ optional
discard cost + trailing draw) → `lookAtTop` → switches → `recursion` →
`healAmount` → `heal` → `attachFromDiscard` → `ionoShuffle` (+ optional
opponentDraw) → `drawUntil` → choice actions (`evolveStage2`, `moveEnergy`,
`devolve`, `discardTools`, …) → trailing/bare `draw` late → `passive` →
`unrecognizable`. Bare `draw` is **not** between `searchDeck` and `lookAtTop`;
search-then-draw keeps the search picker because `searchDeck` returns early
with `appendTrailingDraw`. Regression tests in `trainer-effects.test.mjs`
guard ordering.

**Hook shape:** primary trigger is `rules-card-on-board` (from `move-card.js`);
backstop poll is **2000 ms** `setInterval`. Dedupe via
`img.__rulesTrainerAnnounced`. Nest-Ball single-Basic auto-bench is excluded
from the guided search hoist to avoid two pickers.

**Verification status:** full listed suite **396/396** (`trainer-effects.test.mjs`
alone is 66 tests). Lint/format may be unrunnable without npm/pnpm — never claim
they passed. Picker UX is DOM-heavy and not always visually verified in CI.
## Card identity resolution (why the "wrong Piloswine" happened)

**This was never a text/regex parsing bug.** `attack-effects.mjs` /
`damage-parser.mjs` were parsing correctly — they were handed a *different
card's* `attacks[]`. Board `Card` objects carry no TCGdex id, so
`ensureCardData()` (`setup/rules/rules-state.mjs`) resolved one by **name
alone**; Pokémon names are reprinted verbatim across dozens of sets, every
reprint scored identically in `resolveCardId()`, and the winner was whatever
order `/cards?name=` happened to return. Fix this at the *identity* layer, not
in the parsers.

- **The card identity pipeline (all five files must stay in sync):** the
  decklist row's `dataset.cardNumber` / `dataset.cardSet` (set in `import.js`,
  survives `cloneNode(true)` into `currentDecklistTable`) → the `deckData`
  tuple `[quantity, name, type, url, number, set]`, rebuilt in **three**
  places (`import.js` confirm handler, `sidebox/header-buttons.js`,
  `sidebox/p2/room-buttons.js`) → `build-deck.js` → `new Card(user, name,
  type, imageURL, number, set)`. Adding a field means touching all of them.
  `native-deck-builder.js`'s `deckToSimRows()` is a **fourth** producer of that
  tuple (it fills `number` from `variant.data.number`, i.e. TCGdex `localId`,
  and leaves `set` null — it has no legacy short code).
- **`Card.set` is a short *set code* string ("TRR"), not TCGdex's `set`
  object.** `abilityKey()` reads `card.set?.number`, which is simply undefined
  for a string — fine, but don't assume the object shape.
- **`resolveCardId(summaries, name, type, number)`** gives a `+1000` bonus to a
  candidate whose `localId` matches (leading zeros normalized). The bonus is
  gated on `score >= 100` so it only breaks ties **between already-acceptable
  candidates** — a coincidental number match must never promote a partial-name
  hit ("Piloswine ex", 20) or a same-named Trainer (50) over the real card.
- **`ensureCardData()` order:** enriched-check → `resolveLegacyCardId()` →
  by-name search → detail fetch. `resolveLegacyCardId` builds a candidate id
  from `(card.set, card.number)` via `buildLegacyCardId()` and **validates the
  fetched card's name matches** before trusting it — the legacy table was
  hand-built for limitlesstcg's URL scheme and is not verified card-by-card
  against TCGdex.
- **`setup/shared/legacy-set-ids.mjs`** is the single source of truth for the
  short-code → TCGdex-set-id table (`LEGACY_SET_CODE_TO_TCGDEX_ID`). It used to
  live inline in `import.js`; that file now imports it. Don't re-copy it.
  `buildLegacyCardId()` uses `Object.hasOwn` — codes come from user-pasted
  decklists, so a plain lookup would resolve `"constructor"`.
- **`fetchCardDetail(id)`** memoizes raw TCGdex detail responses so validating
  a legacy candidate doesn't cost a second round trip. It must **not** require
  `detail.id` — `mulligan.test.mjs` stubs `fetch` with bare `{ hp, stage }`
  objects and will fail if you tighten that check.
- **Bonus fix (already in):** the "already enriched, skip re-fetch" guard tested
  `card.weaknesses` (plural), but enrichment sets `card.weakness` (singular), so
  the fast path never fired. It checks the singular field now.

**Remaining gap:** modern sets aren't in the legacy table, so a modern-set
decklist that *also* omits the collector number still falls back to name-order
guessing. Narrow (nearly every decklist format prints a number). The natural
next step is resolving the set id via TCGdex's `/sets` endpoint and constraining
the by-name search to that set.

## Double-click card preview (`.full-view`) — the holo shrink bug

**Symptom:** double-clicking a holofoil Pokémon on the mat shrank it (92px → 63px)
instead of showing an enlarged preview. Plain cards shrank too (92px → 55px).

- **Never use `image.parentElement` to find a card's slot in a zone.** For a
  holo-hydrated card the <img> lives inside `.card__rotator`, so its parent is
  the rotator, not the `.play-container`. Always go through
  `imageAnchor(image).parentElement`, exposed as `fullViewHost(image)` /
  `isInFullView(image)` in `setup/deck-constructor/hydrate-holo.js`. `doubleClick`
  set `height: 70%; width: 69%` on the rotator, which resolved against the
  wrapper's frozen 92px snapshot — hence the shrink. Same bug was in
  `adjustCards()` (`setup/sizing/resizer.js`), which wrote the container width
  onto `.card__rotator` on every board resize.
- **`.full-view img { height: 24% }` (self/opp-containers.css, from the original
  upstream import) is for the ATTACHED cards only.** 24% of the panel is smaller
  than a mat card, so it shrank the primary card as well. The double-clicked card
  (or its `.mat-holo` wrapper) now gets a `full-view-card` class and fills the
  panel; the holo rules need `!important` because the wrapper's px size is inline.
- The panel width is `auto` (not `69%`) so the fixed-position container
  shrink-wraps the card + attachments. `doubleClick` must clear the inline px
  width that `attach-card` leaves on `.play-container` for that to work.
- **`card-pop.mjs` scales the `.full-view` container for both card kinds** (it no
  longer touches the holo `--card-scale`), so `makePopFrame(fullViewElement)`
  composes `scale()` with the centering `translate(-50%, -50%)`. `closeFullView`
  MUST clear `style.transform` on revert or the container stays translated off
  its mat slot. The select spring is deliberately underdamped
  (`stiffness 0.14 / damping 0.71`, ~8% overshoot, settles ~450ms) and writes its
  first frame synchronously — without that the preview paints once at full size
  before the spring starts.
- **Verification:** `fullview-test.mjs <exported-state.json>` (root, ad-hoc
  Playwright like `browser-test.mjs`; needs a running server + a state export
  with a self-side active Pokémon). 13/13 pass: enlarges 92px → 226px, pop
  overshoots to 1.08 and settles, rotator never resized, reverts to 92px with the
  holo auto-sweep resumed, survives a viewport resize. Verified for holo AND
  plain (via the `HOLO_DISABLED` kill-switch) on the self side; the opp side was
  not covered (no opp active card in the fixture) but the CSS is symmetric and
  the JS is shared.
- **Baseline correction:** this file previously said 163/163. `pnpm test` on the
  current tree is **396/396 pass, 0 fail** — use 396. `integration-test.mjs`
  cannot run as-is: `jsdom` is not in any `package.json`.
