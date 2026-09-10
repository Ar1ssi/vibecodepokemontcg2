# 004: Playwright playtest bot — a CPU opponent that soaks the real UI

Status: shipped — all 6 slices built (S78-S84). I30 (the rules bug slice 6 found) fixed S85;
slice 6's "zero failures" acceptance holds on the fixture deck (11/11 live games, plus 3/3 after
S86's patch). S86 closed three real-deck gaps found by running it against an actual 60-card list —
see "S86 corrections" below. Real 60-card decks now reach I31 (ISSUES.md), a genuine divergence.
Date: 2026-09-10 · Session: S75
Related: `.agent/designs/003-authoritative-interaction-routing.md` (the `__ptcg` bridge this extends).
Prior art: `TomBombadyl/kaggle_pokemon` (`agent/agent.py`) — the never-crash scaffold + pluggable
scorer shape, and its measured `MAIN_PRIORITY` ordering. No code is copied; it is Python against a
different engine (Kaggle's cabt) and contains no engine of its own.

## How to use this document

| If you are… | Read |
|---|---|
| Deciding whether to approve | Goal → Non-goals → Architecture → Risks |
| Building any slice | Architecture → the § for your slice → its Acceptance |
| Reviewing a diff | The slice's Acceptance rows only |

---

## Goal

A bot that plays full games through the **real browser UI** against itself (two Playwright pages),
with a real 60-card deck, so 100s of games shake out crashes, softlocks and rule holes without
manual playtesting.

Success is **legal, endless churn**, not play strength. A bot that always makes *a* legal move and
never wedges finds more bugs than a clever one.

## Non-goals

- Play strength, MCTS, learning, ladder-style evaluation. Greedy heuristics only.
- Replacing manual playtesting for visuals/UX. This catches wedges and errors, not ugly layout.
- Testing the headless `shared/engine` reducer — that is a separate, cheaper harness (Tier 1).
- Changing any game rule or gameplay file. This spec only *adds* to the e2e bridge and adds new
  root-level harness files.

## Architecture

Three layers, one seam. **The bot never clicks DOM nodes** — selector-driven bots rot. It calls a
JSON-in/JSON-out bridge that already exists in the page.

```
runner (Node)          bot.mjs (Node)              window.__ptcg (browser)
two chromium pages  →  scaffold + scorer      →    observe() / options() / act() / picker()
assert invariants      never crashes, always       existing client action functions
                       returns a legal option      (chat-buttons, move-card-bundle, …)
```

- `client/src/setup/general/e2e-api.js` — the bridge. Already exposes `joinRoom`, `readyUp`,
  `callCoin`, `playFromHand`, `attack`, `passTurn`, `zone`, `publicBoardHash`, `cmdRejections`,
  `gameEndedInfo`. Slices 1–4 add `observe`, `options`, `act`, `picker`, `pick`, `loadDeckList`.
  It is installed only under `?e2e=1` (`isE2eMode()`), so nothing ships to real players.
- `bot/` (new, root) — pure Node, no Playwright import. Takes an observation, returns an option.
- `playtest-bot.mjs` (new, root) — the runner. Mirrors `flip-gate-test.mjs` for boot/join/assert.

**Default target is the legacy client path** (`SERVER_AUTHORITATIVE` unset, the repo's local
default and where S72/S73/S74's bugs all lived). `SERVER_AUTHORITATIVE=1` is a supported second
mode, not the default.

## The scaffold shape (borrowed)

Non-negotiable contract, ported from `agent/agent.py:682`:

```js
// bot/bot.mjs
export function decide(observation, scorer) {
  const options = observation.options;
  if (!options.length) return { kind: 'pass' };   // never return nothing
  try { return scorer.choose(observation) ?? legalFallback(options); }
  catch { return legalFallback(options); }        // a scorer bug never stops the soak
}
```

`legalFallback` = first option, preferring `end`/`pass` last. Every scorer is a
`{ choose(observation) -> option | null }`; swapping scorers changes *which* legal move is picked,
never the never-crash guarantee. Log every fallback — a fallback is a finding, not a shrug.

## Slices

Build in order, one commit each, green before the next. Branch: `claude/cpu-ai-game-testing-pfdzak`.

### Slice 1 — `observe()`: the read model
**File:** `client/src/setup/general/e2e-api.js` (add one method).
Returns a plain JSON snapshot, no DOM nodes, no live card objects:
`{ turnPlayer, turnNumber, phase, fromServer, self: { hand[], active, bench[], prizeCount, deckCount, discardCount }, opp: {…}, stadium, pickerOpen }`
where each Pokémon is `{ name, hp, damage, stage, types, specialCondition, attachedEnergy: [type], attacks: [{ index, name, cost, damage }] }` and each hand card is `{ index, name, supertype, type }`.
Read zone data via the existing `zone(user, zoneId)` / `liveZoneArray` helpers and the
`card-state.mjs` accessors — **never straight off `card.image`** (PROJECT.md landmine).
**Acceptance:** `JSON.stringify(observe())` round-trips; called on both pages mid-game, each side's
view of the other matches the other's view of itself for public fields.

### Slice 2 — `options()`: legal-move enumeration
**File:** `e2e-api.js`. This is the piece cabt gives its agents for free and we must build.
Reuse, do not reimplement (read each definition before calling it):
`canPerformAction` (`shared/engine/rules/rules-state.mjs:597`), `canPayAttackCost`
(`rules/attack-engine.mjs`), `listUsableActions` (`rules/attack-window.mjs`),
`collectUsableAbilities`, `canEvolve` (`rules/evolution.mjs`), `retreat.mjs`.
Emits a flat array of tagged options:
`{kind:'playBasic', handIndex}` · `{kind:'evolve', handIndex, targetZone, targetIndex}` ·
`{kind:'attach', handIndex, targetZone, targetIndex}` · `{kind:'playTrainer', handIndex}` ·
`{kind:'ability', zone, index, abilityIndex}` · `{kind:'attack', attackIndex}` ·
`{kind:'retreat', benchIndex}` · `{kind:'pass'}`.
**Acceptance:** a unit test with stub cards asserts: no `attack` option when energy is short; no
`attach` after the turn's energy is used; no `evolve` on a Pokémon played this turn; `pass` is
always present outside setup.

### Slice 3 — `act(option)`: the write path — SHIPPED S78
**File:** `e2e-api.js`. One `switch` mapping option → the existing client action, awaited, returning
`{ ok, error }`. Never throws.
- `playBasic`/`attach`/`evolve`/`playTrainer` → `moveCardBundle('self','self','hand', dest, index,
  targetIndex, 'move', true)`. **Deviation from the draft above:** the action string is always the
  literal `'move'` — read `move-card.js` before writing this switch; it classifies attach vs.
  evolve itself from whether `targetIndex` resolves to an existing card in the destination zone,
  not from an `'attach'`/`'evolve'` string (no such strings exist at any real call site).
  `playTrainer` targets `'board'`, not a Trainer-specific zone — move-card.js redirects Stadiums to
  `'stadium'` itself, and rules-bridge.js's board-zone watcher fires Supporter/Item effects once
  the card lands there.
- `ability` → `useAbility('self','self', zone, index, true)`.
- `attack` → existing `__ptcg.attack(i)`. `pass` → `__ptcg.passTurn()`. `retreat` → chat-buttons'
  `retreat('self', true, benchCard.image)` — `card.image` is the identity token on both render
  paths (legacy `image.relative` match, authoritative `readCardInstanceId` off the same DOM node).
**Acceptance:** each option kind, driven once via `act()` in a scripted two-page game, changes the
board as expected and adds zero entries to `cmdRejections`. **Live-verified S80** for
`playBasic`/`retreat`/`pass` (`.agent/scratch/smoke-004-slice1-4.mjs`, legacy mode, zero
`cmdRejections`); `attach`/`evolve`/`playTrainer`/`ability`/`attack` still unverified live — the
fixture deck has no Energy/Trainers, and `attack` is unreachable before turn 2, which S80's run
never reached (see I28 in ISSUES.md — a real, separate rules-engine bug that ends every legacy
game after turn 1, found by this same run).

### Slice 4 — `picker()` / `pick()`: answering the modals — SHIPPED S79
**Files:** `e2e-api.js`, `client/src/setup/image-logic/card-picker.js` (two small exports added).
The overlay set turned out to be **three**, not two — the risk gate this section called out.
Found a third kind: `openMatPick` (`client/src/setup/rules/trainer-execution.js`) resolves
"pick an in-play Pokémon" effects (heal target, damage-counter target, switch, evolve-jump, move
Energy) by highlighting the card's live DOM node on the mat and resolving on a document click, not
via `.card-picker-overlay`. Per the watch-out already in STATE.md, `openMatPick` is the pattern to
reuse for this case and keeps no exported state — so rather than exporting internals from
trainer-execution.js (a rules/gameplay file, out of scope per this spec's non-goals), `picker()`
reads the same signal a human eye reads (the `4px solid #ffd23f` outline `openMatPick` sets on
each candidate's `card.image` node) and `pick()` resolves it with `img.click()`, exactly the click
`openMatPick`'s own listener expects. No gameplay file was touched.
- `.card-picker-overlay` (`client/src/setup/image-logic/card-picker.js`) — new exports
  `getCardPickerSnapshot()` (`{title, min, max, candidates:[{index,name,type}]}`, or `null` when
  the open picker is browse-mode/none) and `pickCardPickerIndices(indices)` (assigns each index to
  a slot via the existing `assignCardToSlot`, then calls the existing `confirmPicker` — the same
  path the Done button click handler uses).
- `openMatPick` overlay — no file changed outside `e2e-api.js`; see above.
- `#rulesCoinCallOverlay` / `#rulesCoinEffectOverlay` — `callCoin(face)` extended to match either
  overlay's button (`[data-coin-call]` vs. `[data-face]` — the two never coexist).
`picker()` returns `{ open:false }` or `{ open:true, type:'cardPicker'|'matPick'|'coinEffect'|
'coinCall', ... }`; `pick(indices, face)` dispatches on the same check. Never throws.
**Acceptance:** `picker()` **live-verified S80** to never false-positive across a full real turn
(7 actions) on a Trainer-free deck — the actual "answer an open picker" path (search Supporter,
mat-pick target, coin effect) is still unverified live, since none of those overlays can open on
the current all-Basics fixture deck. Needs a fixture deck with a search Supporter to verify for
real once I28 (ISSUES.md) no longer ends the game before any Trainer could be drawn/played.

### Slice 5 — the bot — SHIPPED S83
**Files:** `bot/bot.mjs` (scaffold + `legalFallback`), `bot/heuristic-scorer.mjs`.
Policy, in priority order (ported from the Kaggle repo's measured ordering; their note records that
attack-first scored 7.5% vs random because it under-developed the board):
`evolve → playBasic → playTrainer → attach → ability → attack → retreat → pass`, with three guards:
1. **Never pass or attack with an empty bench** if a Basic can be benched.
2. Among `attack` options pick highest expected damage; among `attach` prefer the active Pokémon's
   unmet attack cost.
Deterministic given a seed; the RNG is only for tie-breaks.
**Acceptance:** unit tests over recorded `observe()`+`options()` fixtures — empty bench ⇒ benches
a Basic; lethal attack available ⇒ attacks (highest-damage among attack options); no legal option ⇒
`pass`, never a throw. 14 tests, `bot/__tests__/bot.test.mjs` +
`bot/__tests__/heuristic-scorer.test.mjs`, wired into `pnpm test`. `decide()` also guards against a
scorer returning an option not present in `options` (treated as `scorer-invalid`, same fallback
path) — not in the original contract sketch but needed since nothing else enforces "the scorer's
choice really is one of the legal options" before the runner calls `act()` on it. Guard 1 is
satisfied by the priority order itself (playBasic-to-bench always outranks attack/pass) rather than
a separate check — see the comment in `heuristic-scorer.mjs`. Not live-verified against a real game
yet (needs slice 6's runner); acceptance here is the unit-test contract only.

### Slice 6 — the runner — SHIPPED S84
**File:** `playtest-bot.mjs` (root, mirrors `flip-gate-test.mjs`). Also added
`window.__ptcg.loadDeckList(deckRows)` (`e2e-api.js`) for the `--deck` option — same 7-field
row shape `e2eFixtureDeck` produces, no gameplay file touched.
`node playtest-bot.mjs --games=50 --deck=<path.json> --seed=1 [--max-turns=60] [--headed]`
1. Boot two pages at `/?e2e=1`, join a room, `loadDeckList()` both sides with the 60-card deck,
   **wait for card-stat enrichment to settle** (`ensureCardData`) before the first turn — without
   hp/attacks the bot cannot attack.
2. Loop: whoever's turn it is → `observe()` → `decide()` → `act()`; drain `picker()` after each act.
3. Per-turn assertions (reuse `crossClientDivergence` from `flip-gate-test.mjs`):
   no `pageerror`, `cmdRejectedCount === 0`, public-board hash parity, secret zones equal by count.
4. Stop conditions: `gameEndedInfo` set (pass), `--max-turns` exceeded (**fail: softlock**), or no
   legal option and no progress for 2 turns (**fail: wedge**).
5. On any failure dump `{seed, turn, observation, options, chosen, stepLog, cmdRejections}` to
   `out/playtest/<seed>-<turn>.json` — a failing seed must be replayable.
**Acceptance:** 50 games on the fixture deck finish with zero failures; deliberately breaking one
rule file makes a run fail with a dump that names the turn.
**Live-verified S84**, with one deviation from "zero failures": the runner itself is solid — a
dozen live games showed clean turn-order settling (see below), zero false-positive divergences,
clean pass/fail reporting, and reproducible dumps naming the exact turn and chosen option — but it
immediately found a **real, pre-existing bug**, not a harness flake: `retreat()`'s
`processAction(user, emit, 'retreat', [])` (chat-buttons.js:2367) sends no target identity, so the
peer's replay always swaps in the *first* bench Pokémon (chat-buttons.js:2354-2356) regardless of
which one the acting client chose. Filed as I30 (ISSUES.md) rather than fixed here in the moment — chat-buttons.js is a gameplay file,
out of this spec's non-goals — and fixed separately in S85 (threaded the resolved bench index
through `processAction` instead of a DOM image; see ISSUES.md's Closed section). Two runner-side
fixes were needed along the way, both now folded into the shipped file: (1) `turnState().fromServer` never becomes true in the legacy path this design
targets by default (that field only means something under `SERVER_AUTHORITATIVE=1`, flip-gate-
test.mjs's mode) — the runner instead waits for the two pages' `turnState().turnPlayer` to actually
disagree (one `self`, one `opp`) before treating turn order as settled, since each page's own default
briefly agrees with itself before the peer's coin-flip broadcast lands; (2) a cross-client divergence
check right after `act()` can race a real in-flight broadcast (S82's I29 pattern) — retried for up to
3s before treating it as a finding.

## S86 corrections (found by running slice 6 against a real 60-card deck)

The fixture deck is 20 all-Basics with no Energy and no Trainers, so every acceptance run before
S86 exercised roughly a third of the option vocabulary. One run against a real list
(18 Pokémon / 32 Trainer / 10 Energy) exposed three gaps — 264 of 291 actions were `pass`:

1. **The scorer had no `playTrainer` tier.** `options()` enumerated it and `act()` executed it,
   but `heuristic-scorer.mjs` never picked it, so half the deck was unplayable. **This spec's own
   fault** — the priority list above originally omitted `playTrainer`; the implementing session
   built exactly what was written. Fixed: Trainers now rank above `attach` (draw/search Supporters
   are what find the Energy an attach would otherwise guess at).
2. **Guard 3, the inert-Trainer guard.** A Trainer whose effect this client can't execute stays in
   hand, and a priority-ordered scorer would replay it until the turn's 60-action budget ran out,
   reporting a `wedge` that says nothing. The runner now marks any `playTrainer` that left the hand
   count unchanged and feeds it back as `observation.triedThisTurn` (keyed by card *name*, since
   hand indices shift); the scorer skips those for the rest of the turn. `pass` is never excluded,
   so the exclusion can never strand the bot.
3. **No wait for card-data enrichment.** Slice 6 step 1 required it and the runner never did it —
   it waited only for `deck.count >= 1`. Unenriched cards have no hp/attacks/stage/subtypes, so
   `options()` silently under-reports. `build-deck.js` already bulk-warms via `ensureCardData`
   fire-and-forget; that promise is now parked on `systemState.cardDataReady` and awaited through
   the new `__ptcg.cardDataReady()`, bounded at 60s. **Caveat:** it resolves `true` when the
   enrichment *pass* settled, not when data actually arrived — `ensureCardData` swallows its own
   fetch failures. On a network-blocked machine the wait is a no-op, by design (partial data beats
   none, matching build-deck.js's existing handling).
4. **Failure dumps dropped the observation.** `pageerror`, both softlock paths and the in-turn
   wedge all passed `observation: null`, so the dump wasn't replayable — the slice's own acceptance
   bar. The runner now carries `lastObservation`/`lastChosen` into every failure path.

## S86 addendum — the coverage scorer

Tuning request: orient the bot for *testing*, not plausible play — play Stadiums, use abilities
whenever possible. That is a different objective function, so it ships as a second brain on
bot.mjs's existing OptionScorer seam rather than as changes to the heuristic one. Pick with
`--scorer=heuristic|coverage` (heuristic stays the default).

`bot/coverage-scorer.mjs` ranks by **least-exercised mechanic this game** (`coverageKey`: card
name for hand plays, zone+index for abilities, attackIndex for attacks), with the empty-bench
guard and the inert-Trainer guard retained, and `attack`/`pass` held back until every developing
option is spent — both end the turn in this client, so taking either early caps the turn at one
action. Abilities and Stadiums sit at count 0 and get taken the moment they are legal; "use
abilities whenever possible" falls out of the ranking instead of needing a special case.

Every run now prints what it actually exercised (`coverage: N distinct mechanics over M actions`
plus a per-kind histogram) — an all-PASS run that only played Basics is not a meaningful soak,
and that line is what makes the difference visible.

**It found a bug on its first run.** On the fixture deck the heuristic scorer retreats about once
per game, effectively only from bench index 0; the coverage scorer retreats ~3x per game across
the whole bench and fails within 4 turns, 5/5 across two seeds — filed as **I32** (retreat to a
high bench index still breaks the peer after I30's fix). So `--scorer=coverage` is currently RED
on the fixture deck. That is the finding, not a regression: `--scorer=heuristic` is still 3/3.

## Risks

| Risk | Mitigation |
|---|---|
| Picker set is bigger than slice 4 assumes | Slice 4 is a stop-and-decide gate. Log every unhandled overlay by id/class rather than guessing. |
| Bot passes on cards whose effects silently no-op | Out of scope here (that is the Tier-1 coverage gate) — but log every card played whose effect produced no state change. |
| Slow: seconds per turn | Accept it. This is a nightly/soak tool, not a unit test. `e2eDelayMs()` already zeroes animation delays under `?e2e=1`. |
| `observe()` drifts from real state | It reads the same helpers the sync-check hashes read; slice 1's cross-page acceptance catches drift. |

## Work plan

| Slice | Files | Est. |
|---|---|---|
| 1 observe | e2e-api.js | S |
| 2 options | e2e-api.js + test | M |
| 3 act | e2e-api.js | S |
| 4 picker | e2e-api.js | M — risk gate |
| 5 bot | bot/*.mjs + tests | M |
| 6 runner | playtest-bot.mjs | M |

Each slice is independently revertible. Slices 1–4 touch only `e2e-api.js`, which is dead code
outside `?e2e=1`; slices 5–6 add new files only. No gameplay file is modified by this spec.
