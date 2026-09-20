# pkmncards Trainer parse coverage + Lost Zone

Session S207, worktree `vibe-pkmncards-parse`, branch `task/pkmncards-parse`.

This document is the end-to-end log of the work: what was measured, what was
built, what was verified, what was deliberately left out, and what the server
side still needs. It is written to be self-contained — a reader with no chat
history should be able to reproduce the measurements and understand every
judgement call.

---

## 1. Objective

`parseTrainerEffect()` in `shared/engine/rules/trainer-effects.mjs` recognizes
Trainer card text and turns it into a list of executable steps. A large share
of real cards were landing in an "unrecognizable" bucket (parsed to nothing).
The goal was to raise execution coverage across the **1,348 unique Trainer
cards** scraped from pkmncards.com, by adding new step families end-to-end:

- parser: `parseTrainerEffect` / `parseTrainerSteps` / `parseCoinFlipStep` /
  `describeStep` in `shared/engine/rules/trainer-effects.mjs`
- client executor: `runTrainerSteps` in
  `client/src/setup/rules/trainer-execution.js`
- audit: `scripts/audit-all-trainers.mjs` classification
- tests: parser tests + a static client/audit parity guard

A second, follow-up directive was **c) implement the Lost Zone**: make it exist
outside the mat zone, on the right side of the screen, and wire the Lost Zone
Trainer cards.

---

## 2. Corpus and audit tooling

- `scripts/scrape-pkmncards-trainers.mjs` scraped **2,642 Trainer printings**
  (27 pages: supporter, item, pokemon-tool, technical-machine,
  rockets-secret-machine, pokemon-tool-f) to `out/pkmn-trainer-cards.json`.
- Collapsing to **unique (name + text)** gives **1,348 cards**.
- `scripts/audit-all-trainers.mjs` runs every unique card through
  `parseTrainerEffect()` and classifies the outcome, writing
  `out/trainer-full-audit.txt`.

Classification buckets:

| Bucket | Meaning |
|---|---|
| `guided` | parses to steps that need player choices |
| `automated` | parses to steps the executor can run with no choice |
| `passive-only` | only passive/attached-card effect text (nothing to execute) |
| `unrecognizable` | parser returns nothing usable |
| `unhandled-step` | parses to a step type the executor/audit doesn't know |

### Coverage progression

| Milestone | guided | automated | passive-only | unrecognizable | unhandled |
|---|---|---|---|---|---|
| Session start | 481 | 274 | 182 | **402** | — |
| Final | 698 | 295 | 321 | **25** | 9 |

Net effect: **unrecognizable 402 → 25 (98.1% of the corpus recognized)**.
The 9 `unhandled-step` cards are a separate, pre-existing gap (see §7).

---

## 3. What was built — parser + client executor

Slices 1–5 targeted wording variants that mapped onto **existing** step types
(no executor change). Slices 6–14 added **~57 new step families** end-to-end
(parser branch + `describeStep` + client executor case + audit entry + tests).

New step families added over the session (grouped roughly by batch):

- **Recovery / discard:** `reviveFromDiscard`, `moveDamageCounters`,
  `lookAtOpponentHand`, `attachFromHand`, `attachAttackTool`, `revealPrizes`,
  `prizeToHand`, `clearStatus`, `discardStadium`, `putDiscardOnTop`,
  `energyToHand`, `opponentDiscardToHand`, `opponentDiscardToDeckBottom`,
  `shufflePokemonIntoDeck`, `discardOwnBenchPokemon`, `shuffleDiscardIntoDeck`
- **Opponent-hand / deck:** `opponentHandShuffleDeck`,
  `opponentActiveEnergyToDeck`, `opponentHandToBenchBasic`,
  `opponentHandShuffleItemsDraw`, `discardRandomOpponentHandIfSupporter`,
  `opponentChoosesFromTop`
- **Each-player (symmetric):** `eachPlayerDiscardFromHand`, `eachPlayerDraw`,
  `eachPlayerReturnBench`, `eachPlayerShuffleHandDraw`, `eachPlayerHandToFive`,
  `eachPlayerRecoverPokemon`, `discardAnyThenDraw`
- **In-play board:** `discardAllTrainerInPlay`, `returnStadiumToHand`,
  `shuffleDeckOnly`, `clearAttackEffects`, `revealUntilCard`,
  `lookAtFaceDownPrize`, `putHandBasicAsActive`
- **Healing / coin-driven:** `healPerHeads`, `healEachActive`, `millPerHeads`,
  `flipUntilTailsDraw`, `healAllOwnAndDiscardEnergy`, `healOneDiscardEnergy`
- **Hand / deck ordering:** `toolsToHand`, `switchHandWithTop`,
  `putHandBottomThenDraw`, `shuffleHandCardsThenDraw`, `drawBottom`,
  `rearrangeTop`, `shuffleDiscardThenMill`, `searchToTop`, `revealTopEnergy`
- **Energy movement:** `moveEnergyOpponent`, `sendEnergyToDeckBottom`,
  `discardAllEnergyFromActive`
- **Lost Zone (Part A):** `lostZoneCost`, `toolOrStadiumToLostZone`,
  `sendEnergyToLostZone`, `opponentDiscardToLostZonePerPokemon`

Also:

- **PASSIVE_KEYWORDS expansion** so attached Tool / attack-modifier text is
  recognized as passive rather than a failed parse (`vstar power`, `gx attack
  on this card`, `the pokémon this card is attached to`, `is attached to a
  pokémon`, `at the end of each/your turn`, `don't apply resistance`,
  `re-flip`, `choose heads or tails`, `with exp.all attached`, and more).
- New `applyStatus` targets (`ownActive`, `bothActiveAll`) and new
  `variableDraw` sources (`opponentPokemonInPlay`, `opponentBenchBasic`,
  `opponentHandTrainer`, `allBench`).

### Parser rules to respect

- Regexes must accept **both** `Pokémon` and ASCII `Pokemon` → use
  `pok[ée]mon`.
- `normalizeText()` lowercases and normalizes curly apostrophes and `{X}`.

---

## 4. Lost Zone (directive c)

### 4a. Correction — the Lost Zone already existed

An earlier note in the session (from grepping only `trainer-execution.js`)
claimed no Lost Zone existed. That was wrong:

- `lostZone` is a real shared zone (`shared/engine/state.mjs`; 8 zones/player).
- DOM exists: `#lostZone`, `#lostZoneCover`, `#lostZoneText` in
  `self-containers.html` / `opp-containers.html`, with CSS vars
  `--lost-zone-*`.
- Prism Star discards already route to it (`discardCardToPlayerZone`).
- The server has `lostZoneAll` / `lostZoneBoard`.
- Netcode parity hashes public zones including `lostZone` (D14/D36/D65).

### 4b. Part A — wire the Lost Zone Trainer cards

New steps (parser + `describeStep` + audit + client executor + tests), routed
to the existing `lostZone` zone via `moveCardBundle(..., 'lostZone', i)`:

- `lostZoneCost` + `toolOrStadiumToLostZone` — Lost Vacuum
- `lostZoneCost` + `draw` — Lost Blender
- `sendEnergyToLostZone` — Lost Remover
- `opponentDiscardToLostZonePerPokemon` — Lysandre Prism Star

Result: unrecognizable 29 → 25.

### 4c. Part B — the right-side rail

Layout constraint: `client/index.ejs` places two playmat iframes
(`#selfContainer` → `self-containers.html`, `#oppContainer` →
`opp-containers.html`). `#battleMat` is `position: fixed`, `left: 0`,
`width: 75.5%`, `height: 100%`; the `.sidebox` fills the right 24%. Zones live
in each iframe's `#playfield`, and iframes clip — so a zone **cannot** render
outside its iframe. Moving the zone DOM out of the iframes would be a ~40-file
refactor (zone resolution `getZone` reads the container documents).

Chosen approach (user selected "Right panel outside `#battleMat`"): a
**host-level presentation rail** that mirrors the iframe zones. It never owns
the cards, so drag/drop and netcode are unchanged.

New file `client/src/initialization/mutation-observers/lost-zone-panel.js`:

- `initializeLostZonePanel()` builds `#lostZoneRail`, docked right (`right: 0`,
  `top: 5vh`, width 6%, height 95vh, `z-index: 1310` — above the sidebox 1300,
  below the top tabs 1400; hidden under `body.sidebox-hidden`).
- Mirrors both players' `#lostZone` piles (top card first, capped at 14
  thumbnails) and the count, via a `MutationObserver` on both iframes'
  `#lostZone` elements.
- Click on a side opens the existing full zone view
  (`getZone(user, 'lostZone').element.style.display = 'block'`).
- Registered from `initialize-mutation-observers.js`.
- CSS in `client/src/css/index.css` (`#lostZoneRail` + children).

**Count bug found and fixed:** the first version counted with
`getZone().getCount()`, but legacy zone arrays are never populated under
server-authoritative rendering (design 002 I24), so it would have shown `0`
online while thumbnails rendered. It now uses
`occupiedZoneCount({ arrayCount, renderedCount })` from
`shared/engine/rules/ko-flow.mjs` — the same helper `chat-buttons.js` and
`rules-bridge.js` use. Regression asserted in the rail test.

### 4d. Rail drag/drop (user asked to wire it)

The rail accepts drops, reusing the board's own drag predicates/move path so a
rail drop is **exactly** an in-mat drop onto `lostZone`:

- `client/src/setup/image-logic/drag.js`: new explicit host-level drop-target
  path. `explicitDropZoneOf(target)` matches `[data-drop-zone]`;
  `dragOver` highlights only the side matching the dragged card's owner;
  `dragLeave` / `dragEnd` / `drop` clear the highlight; `drop()` resolves
  `dZoneId` from `data-drop-zone` and **refuses a user mismatch** (you cannot
  manually fling the opponent's card into your Lost Zone).
- `lost-zone-panel.js`: each rail side carries `data-drop-zone="lostZone"` and
  `data-drop-user`, and registers the shared `dragOver` / `dragLeave` / `drop`.
  Thumbnails are `draggable = false`.
- `index.css`: `.lost-zone-rail-drop` highlight.

The in-mat `#lostZoneCover` (the original drop target) is deliberately **kept
visible** (user choice) and still accepts drops.

**No free screen band:** the board stops at 75.5% and the `.sidebox` fills the
rest, so the 6%-wide rail overlays the rightmost 6% of the sidebox.

---

## 5. Files changed

Parser / executor:

- `shared/engine/rules/trainer-effects.mjs` — parser branches, `describeStep`,
  `PASSIVE_KEYWORDS`, helpers.
- `shared/engine/rules/__tests__/trainer-effects.test.mjs` — parser tests.
- `client/src/setup/rules/trainer-execution.js` — client executor cases for all
  new step types.
- `client/src/setup/rules/__tests__/trainer-step-parity.test.mjs` — static
  parity guard (every new step has a client case + an audit entry; no duplicate
  cases).

Audit / scrape:

- `scripts/scrape-pkmncards-trainers.mjs` → `out/pkmn-trainer-cards.json`
- `scripts/audit-all-trainers.mjs` → `out/trainer-full-audit.txt`

Lost Zone UI:

- `client/src/initialization/mutation-observers/lost-zone-panel.js` (new)
- `client/src/initialization/mutation-observers/__tests__/lost-zone-rail.test.mjs` (new)
- `client/src/initialization/mutation-observers/initialize-mutation-observers.js`
- `client/src/setup/image-logic/drag.js`
- `client/src/css/index.css`

Harness:

- `.agent/STATE.md`, `.agent/journal/2026-09.md`

(Existing shared infrastructure used, not changed: `shared/engine/rules/ko-flow.mjs`'s
`occupiedZoneCount`, `client/src/setup/zones/get-zone.js`, containers.)

---

## 6. Verification

Run in the worktree (PowerShell). `node_modules` is a junction to
`../vibecodepokemontcg2-main/node_modules`.

| Check | Command | Result |
|---|---|---|
| Syntax (new/changed JS) | `node --check <file>` | clean |
| Rail static contract | `node --test client/src/initialization/mutation-observers/__tests__/lost-zone-rail.test.mjs` | 11/11 |
| Full suite | `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"` | **2441/2441**, 0 fail |
| Audit | `node scripts/audit-all-trainers.mjs` | guided 698 / passive-only 321 / automated 295 / unrecognizable 25 / unhandled 9 |
| Lint (changed files) | `npx eslint <files>` | clean except pre-existing `.mjs` `no-undef` config gap and prettier CRLF noise |

Lint notes:

- The two `no-useless-escape` errors in `trainer-effects.mjs` (lines 342/348,
  the `namedBenchMulti` regexes) are **pre-existing** and untouched.
- `eslint.config.mjs` only declares globals for `**/*.js`; repo `.mjs` scripts
  therefore report `console`/`process`/`fetch` `no-undef`. This is an existing
  environment-wide issue (existing scripts trigger it too), not introduced here.

---

## 7. Deliberately not done / known limitations

1. **Client executor is not browser-verified.**
   `trainer-execution.js` uses `/shared/...` absolute specifiers, so it cannot
   be imported headlessly. Only `node --check` and the static parity guard ran;
   there was no Playwright run.

2. **Cross-iframe HTML5 drag/drop is not browser-verified.**
   A drag starts on an `<img>` inside a playmat iframe and must end on the
   host-level rail. Standard hit-testing should deliver `dragover`/`drop` to
   the host, but this needs a manual drag check.

3. **Server executor parity is deferred.** See §8.

4. **Residual 25 unrecognizable (one-offs)** — each needs a bespoke step:
   - Lost Zone: Misty's Duel, Digger (alternating-coin / rock-paper-scissors)
   - use an opponent's card as the effect: Sabrina's Suggestion, Sabrina's
     Psychic Control
   - procedural / multi-modal: Time Capsule, Legend Box, Arcade Game,
     Bellelba & Brycen-Man
   - singles: Lass, Cyllene, Looker's Investigation, Maxie, Premier Ball,
     Fossil Excavator, Pokemon Trader, Erika's Maids, Impostor Professor Oak's
     Invention, Blaine's Gamble, Tickling Machine, Minion of Team Rocket,
     Thought Wave Machine, Cyrus Prism Star, Cyrus's Initiative, Lt. Surge's
     Treaty

5. **9 pre-existing `unhandled-step` cards** (separate gap, unrelated to the
   unrecognizable bucket): `opponentDraw`, `reshufflePrizes`,
   `searchAttachEach`, `countShuffleDrawPlus`, `opponentCountShuffleDraw`,
   `massDiscardAttached`, `prizeBargain`, `fossilItem` families.

---

## 8. Server-extension backlog

`shared/engine/effects/executor.mjs` currently executes only:
`discardCost`, `searchDeck`, `draw`, `drawUntil`, `discardHandThenDraw`,
`shuffleHandThenDraw`, `ionoShuffle`, `switchOwn`, `switchOpponent`/`Out`,
`recursion`/`shuffleFromDiscard`, `heal`/`healAmount`, `coinFlip`,
`applyStatus`, `recoverEnergy`, `attachFromDiscard`.

To reach parity, the server executor needs cases for:

- Pre-existing client-only step types: `variableDraw`, `damageCounters`,
  `moveEnergy`, `moveEnergyToActive`, `discardTools`, `discardFromOpponent`,
  `discardToolAndSpecialEnergy`, `swapWithDiscard`,
  `revealOpponentDeckBench`, `opponentPrizeHandSwap`,
  `revealOpponentHandDiscard`, `opponentHandBottom`, `opponentDiscardUntil`,
  `eachPlayerDiscardUntil`, `opponentCountShuffleDraw`, `returnPokemonToHand`,
  `massDiscardAttached`.
- Every S207 new step: `reviveFromDiscard`, `moveDamageCounters`,
  `lookAtOpponentHand`, `attachFromHand`, `attachAttackTool`, `revealPrizes`,
  `prizeToHand`, `clearStatus`, `discardStadium`, `putDiscardOnTop`,
  `energyToHand`, `opponentDiscardToHand`, `opponentDiscardToDeckBottom`,
  `shufflePokemonIntoDeck`, `discardOwnBenchPokemon`, `shuffleDiscardIntoDeck`,
  `opponentHandShuffleDeck`, `opponentActiveEnergyToDeck`,
  `opponentHandToBenchBasic`, `eachPlayerDiscardFromHand`, `eachPlayerDraw`,
  `eachPlayerReturnBench`, `eachPlayerShuffleHandDraw`, `eachPlayerHandToFive`,
  `eachPlayerRecoverPokemon`, `discardAnyThenDraw`,
  `opponentHandShuffleItemsDraw`, `discardAllTrainerInPlay`,
  `returnStadiumToHand`, `shuffleDeckOnly`, `clearAttackEffects`,
  `revealUntilCard`, `lookAtFaceDownPrize`, `putHandBasicAsActive`,
  `healPerHeads`, `healEachActive`, `opponentChoosesFromTop`, `millPerHeads`,
  `flipUntilTailsDraw`, `toolsToHand`, `switchHandWithTop`,
  `putHandBottomThenDraw`, `shuffleHandCardsThenDraw`, `drawBottom`,
  `moveEnergyOpponent`, `sendEnergyToDeckBottom`, `revealTopEnergy`,
  `discardAllEnergyFromActive`, `searchToTop`, `healAllOwnAndDiscardEnergy`,
  `healOneDiscardEnergy`, `rearrangeTop`, `shuffleDiscardThenMill`,
  `discardRandomOpponentHandIfSupporter`, `lostZoneCost`,
  `toolOrStadiumToLostZone`, `sendEnergyToLostZone`,
  `opponentDiscardToLostZonePerPokemon`.
- New `applyStatus` targets (`ownActive`, `bothActiveAll`) and the new
  `coinFlip` sub-steps route through their existing cases.

Note on tool passives: the server engine
(`shared/engine/effects/trainer.mjs`) bypasses the parser and emits
`attachTool`; tool passives are wired by `tool-combat.mjs`. Parser tool
coverage only affects the client announce path.

---

## 9. How to reproduce

```powershell
# scrape + audit (writes out/*)
node scripts/scrape-pkmncards-trainers.mjs
node scripts/audit-all-trainers.mjs

# tests
node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"

# lint changed files
npx eslint shared/engine/rules/trainer-effects.mjs client/src/setup/rules/trainer-execution.js `
  client/src/setup/image-logic/drag.js `
  client/src/initialization/mutation-observers/lost-zone-panel.js
```

Manual checks still owed: (1) start the app and drag a card from the mat onto
the Lost Zone rail; (2) run a Trainer whose effect uses one of the new client
steps end-to-end.
