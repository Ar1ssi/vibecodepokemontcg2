# 004: Playwright playtest bot — a CPU opponent that soaks the real UI

Status: draft — awaiting user approval.
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
board as expected and adds zero entries to `cmdRejections`. **Not yet run** — no live two-page
exercise of observe()/options()/act() together exists yet (tracked in STATE.md).

### Slice 4 — `picker()` / `pick()`: answering the modals
**File:** `e2e-api.js`. The legacy rules path resolves trainer/ability effects through synchronous
UI pickers, so a bot that ignores them wedges the game. Two overlays to bridge:
- `.card-picker-overlay` (`client/src/setup/image-logic/card-picker.js`) — `picker()` returns
  `{ open:true, title, min, max, candidates:[{index,name,type}] }`; `pick(indices)` selects those
  cards and clicks `.card-picker-done`.
- `#rulesCoinCallOverlay` / `#rulesCoinEffectOverlay` — already covered by `callCoin()`; extend it
  to the effect overlay.
**Acceptance:** with a deck containing a search Supporter (e.g. a Poké Ball / Professor's line),
the bot plays it, `picker()` reports the candidates, `pick()` resolves it, and the turn continues.
**This slice is the highest-risk one — build it third, not last, and stop for a decision if the
picker set turns out to be larger than these two.**

### Slice 5 — the bot
**Files:** `bot/bot.mjs` (scaffold + `legalFallback`), `bot/heuristic-scorer.mjs`.
Policy, in priority order (ported from the Kaggle repo's measured ordering; their note records that
attack-first scored 7.5% vs random because it under-developed the board):
`evolve → playBasic → attach → ability → attack → retreat → pass`, with two guards:
1. **Never pass or attack with an empty bench** if a Basic can be benched.
2. Among `attack` options pick highest expected damage; among `attach` prefer the active Pokémon's
   unmet attack cost.
Deterministic given a seed; the RNG is only for tie-breaks.
**Acceptance:** unit tests over recorded `observe()` fixtures — empty bench ⇒ benches a Basic;
lethal attack available ⇒ attacks; no legal option ⇒ `pass`, never a throw.

### Slice 6 — the runner
**File:** `playtest-bot.mjs` (root, mirrors `flip-gate-test.mjs`).
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
