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
  `rules/` (rules engine: attack engine, KO flow, status, evolution, mulligan,
  trainer effects, `rules-bridge.js`), `chatbox/`, `general/`, `image-logic/`
  (drag & drop), `settings/`, `sizing/`, `spectator/`, `home-header/`.
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

- `client/index.ejs` is ~1,070 lines / **~23K tokens — never read it whole.**
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

## Turn-order coin flip (on "Set Up")

- **Goal:** once a player clicks Set Up (rules on), **the caller picks a face
  (heads/tails)** via a 2-button picker, then a coin from either player's
  selection is flipped (full-screen animation): **the caller goes first iff the
  coin lands on the face they called**. Runs in solo (shared-browser P1+P2) and
  online multiplayer, where the mirror side **auto-starts** from the broadcast
  (no second Set Up click) and the flip is announced once. All logic lives in
  `rules-bridge.js`; the pure, unit-tested resolution is `decideTurnOrder()` in
  `rules-turnorder.mjs` (caller + call + result → who goes first); state in
  `rules-state.mjs` (`rulesState`); overlay CSS in `client/src/css/index.css`
  (`.coin-toss-wrap`, `#turnOrderCoinFlipOverlay`, `@keyframes coin-toss-arc`).
- **Wiring (capture-phase hooks, added this pass):**
  - `hookSetupButton()` attaches one shared `handleSetupClick` to **all three**
    Set Up triggers: `#setupButton` (p1 box), `#p2SetupButton` (p2 box),
    `#setupBothButton` (p1 box). Whichever is clicked first flips; the rest
    no-op. (Previously only `#setupButton` was hooked — P2 box + Set Up Both
    never flipped.)
  - `hookResetButtons()` attaches capture hooks to `#resetButton`,
    `#p2ResetButton`, `#resetBothButton` that, when rules on, re-arm the flip by
    resetting `rulesState.phase='setup'`, `turnNumber=0`, `syncedTurnOrder=null`.
    Needed because the non-rules `reset()` handlers (`actions/general/reset.js`)
    do NOT touch `rulesState`, so the phase would stay `'draw'` and a later Set
    Up would silently skip the flip.
- **Guards in `handleSetupClick` (in order):** `rulesState.enabled`; 
`systemState.isReplay` (replay repurposes `#setupButton` for `rewindToStartReplay`
— must not flip); `rulesState.phase !== 'setup'`; `coinCallPending` (the call
picker is already open); `syncedTurnOrder` (multiplayer mirror — start the game
from the opponent's broadcast outcome, no local flip); `coinCallChoice` (the
opponent clicked Set Up first and broadcast their call — mirror it, don't pick
again). Otherwise open `openCoinCallPicker()` (overlay `#rulesCoinCallOverlay`,
z-index 2400, click-outside does NOT pick a face) and flip via
`runTurnOrderCoinFlip({ call, caller })` → `beginSetupWithTurnOrder(firstPlayer)`
(module-scope, shared by the local and mirror auto-start paths; `startGame`
flips phase to `'draw'`, guarding double-starts).
- **Invariants:** capture-phase listeners (`addEventListener(..., true)`) fire
  before the original bubble handlers, which still run (no
  `stopPropagation`/`preventDefault`) — the original `setup()` deals hands etc.
  and the rules hook only adds turn order + mulligan. The "Set Up Both" double
  `setup('self');setup('opp')` is accepted as-is (pre-existing behavior); do not
  try to suppress it. `runTurnOrderCoinFlip()` resolves after ~2700 ms
  (animation ~2.4s + fade 0.4s); `proceedWithSetup` runs after that. The 2500 ms
  mulligan `setTimeout` inside `proceedWithSetup` can overlap the overlay fade —
  pre-existing, acceptable.
- **Multiplayer mirror:** `hookMultiplayerSync()` (`rules-bridge.js`) relays two
  events over `rulesSocket.emit('rulesEvent', …)` (server relays `rulesEvent`,
  `server/server.js` ~181–187):
  - `turnOrderCoinCall` — emitted the moment the caller picks a face (2P only);
    the mirror stores it (`coinCallChoice`, `coinCallCaller` inverted) and closes
    its own open picker if one is up, so both sides agree on the call.
  - `turnOrderCoinFlip` — `{ caller, call, result, turnPlayer, coinId, coinOwner }`
    (all sender-perspective; mirror inverts `caller`/`coinOwner` and recomputes
    who goes first via the pure `decideTurnOrder()` — deterministic, no
    re-randomization). The mirror then **auto-starts** the game
    (`beginSetupWithTurnOrder`) when `phase === 'setup' && !coinFlipPending`.
  - **Single announcement:** the remote animation path passes `isRemote: true`;
    only the local (non-remote) flip appends its chat message, so exactly one
    side announces the result.
- **`selectedCoins`** (`rules-bridge.js`, module-level `{ self, opp }`) is
  populated by the `rules-coin-changed` event (dispatched from
  `native-deck-builder.js`); the flip picks a coin from `selectedCoins[owner]`
  (random owner) or falls back to `pickRandomCoin()` from the catalog.
- **Verification status:** `node --check` passes on `rules-bridge.js` +
  `rules-turnorder.mjs`; `decideTurnOrder` is unit-tested in `rules.test.mjs` and
  the full suite is **333/333 green, 0 fail**. No browser/socket pair in the
  sandbox — the interactive picker, mirror auto-start, and single-announcement
  gate are DOM/socket-heavy and were **not** live-verified; verify with a manual
  2P run. To trigger: rules on by default, pick a coin in Customize > Coin,
  click any Set Up button, pick a face. `evolution.test.mjs` remains pre-existing
  but NOT in the root test list (run it explicitly if desired).

## Turn flow: attacking (or passing) ends the turn

**Goal:** a turn ends naturally after a player attacks — the attacker shouldn't
need to separately click +Turn. Applies in solo shared-browser (P1/P2) and in
online multiplayer. The single source of the turn-advance is `endTurn()`
(`rules-state.mjs`); `markAttacked()` only sets `phase='attack'` and does NOT
advance the turn.

- **Solo (shared-browser P1/P2):** `attack()` / `pass()` in
  `client/src/actions/chat-buttons/chat-buttons.js` are the entry points for the
  `#attackButton`/`#passButton`/`#p2AttackButton`/`#p2PassButton` buttons
  (wired in `sidebox/p1|p2/chat-buttons.js`, always called with
  `systemState.initiator`). When `rulesState.enabled`, `attack()` gates via
  `canPerformAction({ user, action: 'attack' })` (announces the ⛔ reason and
  bails if not allowed), calls `markAttacked(user)`, runs the sim logic
  (`resetAbilityCounters` + `appendMessage` + `discardBoard` + `processAction`),
  then calls `endTurn(user)` and dispatches `rules-turn-began`. `pass()` does the
  same post-sim `endTurn` + `rules-turn-began` but with no `markAttacked`.
  `endTurnWithBanner(user)` (module-local) is the shared helper that calls
  `endTurn`, announces "Turn passes to P1/P2", and dispatches the
  `rules-turn-began` CustomEvent — the same event `updateTurnBanner()` in
  `rules-bridge.js` uses, so the HUD/panel refresh without importing
  `rules-bridge.js` (avoids a circular import: chat-buttons → rules-bridge).
- **Multiplayer:** `runAttack()` (`rules-bridge.js`) resolves the attack, then
  emits `rulesEvent { type: 'attacked' }` and, right after, `{ type:
  'turnPassed' }` (both inside the `systemState.isTwoPlayer && rulesSocket`
  block), then calls `endTurn(rulesState.turnPlayer)` locally. The receiver's
  `hookMultiplayerSync()` advances rulesState ONLY on `turnPassed` (guarded by
  `rulesState.turnPlayer === 'opp'`); the `attacked` handler stays chat-only so
  the turn advances exactly once. This keeps a single source of the advance.
- **Double-advance guard:** a module-level `turnEndedByAttack` flag in
  `rules-bridge.js` is set true right after `endTurn` in `runAttack()`, and
  `hookTurnButton()`'s click handler swallows the next +Turn click (resetting
  the flag) so a stale click doesn't advance the turn a second time. Reset to
  `false` in the reset-button capture hook (`hookResetButtons()`, alongside
  `syncedTurnOrder = null`). A flag (rather than a `phase`/`flags` check) was
  chosen because `endTurn` overwrites `phase` back to `'main'` and resets the
  *next* player's flags, so neither reliably says "already ended by attack."
- **`user`/`turnPlayer` framing:** both `systemState.initiator` (getter in
  `global-variables.js`, = bottom-of-screen player, toggled by `flipBoard()`)
  and `rulesState.turnPlayer` use the same client-perspective frame, so passing
  `user` into the rules functions maps to the correct `turnPlayer`. Test both
  board orientations if this changes.
- **Tests:** appended to `rules.test.mjs` (already in the root `package.json`
  test list) — `markAttacked` sets `phase='attack'`; `endTurn` advances
  turnNumber + resets next player's flags + phase back to `'main'`; and re-attack
  is blocked after `markAttacked`. Suite baseline was 152/152; now **155/155**
  green. Lint/format not run in the sandbox (no npm/pnpm) — flagged explicitly.

## Multiplayer card sleeve (card back) sync

**Goal:** a player's picked sleeve is visible to the opponent — picking a sleeve
broadcasts over the socket and re-points the opponent-side back images.

- **Single syncable entry point:** `changeCardBack(user, image, emit = true)`
  (`setup/deck-constructor/import.js`, ~line 954). Sets the correct state var
  (self vs `systemState.p2OppCardBackSrc`), re-points the *target* container's
  back `<img>`s (verified via a `knownBacks.includes(img.src)` check against
  actual known card-back values — NOT substring matching), and calls
  `processAction(user, emit, 'changeCardBack', [image])` → `pushAction`/
  `requestAction` → opponent's `accept-action.js` (registered at its line 68)
  → opponent calls `changeCardBack` locally. `exchange-data.js` also handles
  join-time card-back exchange. **All of these files are correct — do not edit
  them to change sleeve behavior.**
- **Edit target for deck-builder sleeve behavior:** ONLY
  `initialization/document-event-listeners/sidebox/native-deck-builder.js`.
  Conventions there:
  - Sleeve picker `onChange`: call `changeCardBack(currentLoadTarget, image, true)`
    (user-driven → broadcast). The no-sleeve branch still dispatches
    `deck-sleeve-changed` with `{ target: currentLoadTarget, image: null }`.
  - `syncCustomizationToDeck` (init / deck switch): `emit = false` so loading a
    deck doesn't spam the socket.
  - The `deck-sleeve-changed` CustomEvent detail always carries
    `{ target, image }`; its listener calls
    `applySleeveToPlaymat(image, target || 'self')` which touches only that
    target's iframe/playmat and that target's state var. `setCardBackForTarget`/
    `getCardBackForTarget` helpers exist for state-var mapping; `applySleeveToPlaymat`
    falls back to the default back and includes `fallback` in its `knownBacks`.
- **Known latent bug (pre-existing, flagged not fixed):** the Play-button sleeve
  path in `native-deck-builder.js` (~line 145) hardcodes
  `changeCardBack('self', image, false)` regardless of `currentLoadTarget` —
  playing a sleeve while customizing the opp deck applies it to self. Fix only
  if the user asks.
- **Sandbox gotchas learned:** `node --check` only validates syntax — it does
  NOT catch undefined-variable typos (e.g. a `currentTarget` vs
  `currentLoadTarget` mix-up passes `--check` fine); read the edited lines back
  to verify identifiers. Test-suite baseline on the current (new) file version is
  **166/166** pass. Live two-client multiplayer sync is NOT verifiable in the
  sandbox — rely on the verified socket relay chain above.

## Guided Trainer play flow — extended to "draw N" + "search your deck for y"

**Goal:** when a Trainer card is played, drive its effect through the existing
menu-driven, step-sequenced guided flow instead of only announcing it. This pass
added the two user-approved effect families on top of the earlier Ultra Ball
discard-cost → hand-search flow:
1. **Bare "Draw N cards"** — recognized and **auto-executed** (deterministic, no
   menu).
2. **Generic "search your deck for …"** — the filtered choice picker is no
   longer limited to "search for a Pokémon into your hand"; any parsed
   destination (hand or bench) works, and multi-card searches use the
   multi-select + Confirm pattern.

**Where the logic lives (keep this split):**
- `client/src/setup/rules/trainer-effects.mjs` — **pure, DOM-free** parser
  (`parseTrainerEffect`) + `describeStep` (human wording). This is what gets
  unit-tested. No `document`/`window` here.
- `client/src/setup/rules/rules-bridge.js` — **all UI wiring + execution**:
  `autoExecuteTrainer` (runs the auto steps, e.g. bare `draw`; keeps the
  Nest-Ball single-Basic auto-bench special case), `hookTrainerPlay` (the
  Trainer branch orchestrator), `runSearchPicker` (branches on
  `searchStep.destination`), and the reused `openChoicePicker` + `matchesSearch`
  (both **destination-agnostic** — single-select passes `destination`, the
  `count > 1` path moves cards in `onConfirm`).

**Parser branch order is load-bearing — do not reorder casually:**
`discardHandThenDraw` → `shuffleHandThenDraw` → `searchDeck` → **`draw` (bare)**
→ `lookAtTop` → switches → recursion → heal → attach → `ionoShuffle` → passive →
`unrecognizable`. The bare-`draw` branch sits **AFTER `searchDeck`** on purpose
so "search… then draw" cards keep the interactive search picker instead of
collapsing into an auto-draw. Regression tests in `trainer-effects.test.mjs`
guard this ordering (search-then-draw, discard-draw, shuffle-draw).

**Scope boundaries (NOT implemented — announce-only today):** `switchOwn` /
`switchOpponent`, `lookAtTop`, `heal`, `attachFromDiscard`. Only `draw` (bare,
auto) and `searchDeck` (picker) are actually guided. Do not silently start
building pickers for the rest without user confirmation.

**Mechanisms chosen by the agent (user approved the category, not these details —
flag if revisiting):** bare-draw auto-execute over a confirm menu (matches the
existing `discardHandThenDraw` auto pattern); guided `searchStep` hoist
**excludes exactly** the Nest-Ball single-Basic auto-bench step to avoid two
pickers; reuses `openChoicePicker` rather than adding a new picker.

**Verification status:** full suite **163/163** pass (156 prior + 7 new in
`trainer-effects.test.mjs`). `node --check` clean on both source files. Lint/format
**not run** in the sandbox (no npm/pnpm) — never claim they passed. The picker /
auto-draw flow is DOM-heavy and was **not** visually verified in a browser.

**Gotchas learned this pass:**
- `hookTrainerPlay` is a **1000 ms `setInterval` poller** guarded by
  `img.__rulesTrainerAnnounced` (dedupe flag on the card `<img>`), not a
  one-shot hook. `autoExecuteTrainer` runs **before** cost/search gating, so a
  `draw` step on a cost-card would draw before the cost confirm — safe today
  because no card combines a discard cost with a bare draw.
- `moveCardBundle(user, initiator, oZoneId, dZoneId, index, targetIndex,
  action, emit = true)`. `supertype` is `'Pokémon' | 'Trainer' | 'Energy'`.
- **Baseline correction:** earlier notes in this file cited "166/166" (and the
  round handoff predicted ~173). The **actual** count with this work in place is
  **163/163** (156 prior + 7 new). Use 163 as the current baseline; do not
  expect 173.
- Card text is external-API-driven — there is no in-repo card DB, so "bare
  draw N" branches shadow no existing card text; add a real-card regression
  test when such text appears.

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
