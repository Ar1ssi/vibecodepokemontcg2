# Rules Engine Beginner's Guide (and how to fix a single card)

This guide is for a developer who is new to this repo. It explains how the rules engine turns card text into game behaviour, and gives a repeatable recipe for fixing one card that does the wrong thing.

Read this first. The deeper references are listed at the end.

---

## 1. What the rules engine is

The game is a Pokémon TCG simulator. Two players sit at a board. Every click (play a Trainer, attack, retreat, pick a card from a list) has to follow the real card rules. The **rules engine** is the code that decides:

- Is this action legal right now? (Is it your turn? Did you already attach Energy? Can this Pokémon evolve?)
- If it is legal, what changes? (Cards move between zones, damage is dealt, a Special Condition is applied, the deck is shuffled.)
- Does the game need a choice from a player? (For example, "pick up to 3 Basic Pokémon from your deck.")

The engine does not know any card by name. It reads the printed card text, turns that text into a small list of structured steps, and then runs those steps. That is the single most important idea in this guide:

> **Card text in → parser → structured steps → executor → changed game state.**

When a card is wrong, the bug is almost always in one of those three stages. Your job is to find which stage is wrong.

---

## 2. Where the code lives

There are two layers. Know which one you are touching.

| Layer | Folder | What it is |
|---|---|---|
| **Pure engine (the one the server runs)** | `shared/engine/` | Plain JavaScript with no browser (DOM) code. Easy to test with `node --test`. |
| **Client glue** | `client/src/setup/rules/`, `client/src/actions/` | Browser code that shows the board, asks the player questions, and calls into the pure engine. |

Inside `shared/engine/`:

| File | Role | Plain-English meaning |
|---|---|---|
| `reduce.mjs` | `applyCommand()` (line ~8654) | The **state machine**. Takes the current game state plus one command (for example `playTrainer`), checks legality, and returns the new state. This is the main entry point. |
| `commands.mjs` | command schemas | The list of valid command types and their payload shapes. |
| `cards.mjs` | `createCard()` | Builds one card object from card data. |
| `state.mjs` | game state model | The board: players, zones (`hand`, `deck`, `active`, `bench`, `discard`, `prizes`, ...). |
| `rules/*.mjs` | **parsers** and rule helpers | Read card text and return structured data. For example `parseTrainerEffect` (in `rules/trainer-effects.mjs`). |
| `effects/*.mjs` | **executors** | Take structured steps and change the state. For example `executeSteps` (in `effects/executor.mjs`). |
| `__tests__/*.test.mjs` | tests | One test file per topic or card. |

Two rules about this layout:

1. **Parsers are pure.** They read text and return data. They do not touch the game state.
2. **Executors should run the steps the parser produced.** A few older handlers still read the card's text directly (for example `putIntoPlay` in `effects/trainer-steps.mjs`, around line 5490). Do not add new ones. If you must read text in a handler, say why in a comment.

Keeping these apart is why a bug in one stage can usually be fixed without touching the others.

### Which mode runs the engine?

- The server runs `reduce.mjs` through `server/game/room.mjs`. Start the server with `SERVER_AUTHORITATIVE=1` to make the server the referee. This is the path the tests and the audits cover best.
- The browser also imports the same parsers (`rules/abilities.mjs`, `rules/rules-state.mjs`, and others) for its own checks and UI. So a parser fix affects both paths.

If you are not sure which path a bug comes from, run the server with `SERVER_AUTHORITATIVE=1` and try again.

---

## 3. The main loop: applying one command

Here is what happens when a player plays a Trainer card. The same shape applies to attacks, retreats and abilities.

```
client click
  -> command { type: 'playTrainer', payload: { instanceId: 50 }, playerId: 'p1' }
  -> applyCommand(state, command, rng)            shared/engine/reduce.mjs
       1. shape check (is the command well formed?)
       2. turn gate / pending-choice gate (is it this player's turn? is the game waiting on a choice?)
       3. legality check (validateLegality, reduce.mjs ~4549)
       4. the 'playTrainer' case (reduce.mjs ~9644)
            -> executeTrainer(...)                 shared/engine/effects/trainer.mjs
                 -> parseTrainerEffect(card text)  shared/engine/rules/trainer-effects.mjs
                 -> executeSteps(steps)            shared/engine/effects/executor.mjs
                      -> step handlers             shared/engine/effects/trainer-steps.mjs
       5. return { state, events, pendingChoice, error }
```

Things to notice:

- **`applyCommand` never edits the old state.** It works on a copy (the "draft") and returns a new state. Do not mutate `state` inside a handler you write for it.
- **The result can contain a `pendingChoice`.** That means the engine paused and is waiting for the player to pick something. The player answers with a `resolveChoice` command. Many card bugs are really "the choice never appears" or "the choice has the wrong options".
- **`error` is set when the command is refused.** Common values include `bad_command`, `stale_view`, and `card_data_pending`. Check the `reason` field for detail.
- **The step runner is resumable.** `executeSteps` can stop in the middle, store where it is in `resumeToken`, and continue after the player picks. That is why a multi-step Trainer can ask two questions in a row.

To find the entry for a command type, search `reduce.mjs` for the `case '<type>':` line.

---

## 4. Card data: where the text comes from

- Card data comes from TCGdex (fetched through the server proxy) and from the corpus files in `out/`:
  - `out/pkmn-trainer-cards.json` (Trainers: `name`, `set`, `number`, `subtype`, `text`, `url`)
  - `out/pkmn-pokemon-cards.json` (Pokémon: attacks and abilities, with `text`)
  - Other `out/pkmn-*-cards.json` files for Stadiums, Special Energy, GX and Ancient Trait cards.
- The engine reads the printed text from a field called `text`. TCGdex sometimes calls it `effect` instead. `createCard()` in `shared/engine/cards.mjs` copies `effect` into `text` for attacks, so the parsers see one name.
- **Card text is the truth.** Do not write a card's rules from memory. Look it up in the corpus row and quote that row in your test. If the text and your memory disagree, the printed text wins.

To find a card's corpus row:

```bash
grep -n "Precious Trolley" out/pkmn-trainer-cards.json
```

Some printings are missing text or have a different spelling. In that case the engine returns `card_data_pending` for a Trainer until the card data arrives. That error is not a rules bug.

---

## 5. Parsers: text into steps

A parser is a function that takes card text and returns structured data. It uses regular expressions. Each sentence pattern is one "template" or one "branch".

### Trainers

`parseTrainerEffect(text)` in `shared/engine/rules/trainer-effects.mjs` (line ~1319). It returns:

```js
// Probe output, real call on the Precious Trolley text:
{
  steps: [
    { type: 'searchDeck', what: 'Basic Pokémon', count: 5, destination: 'bench', upTo: true }
  ],
  recognizable: true
}
```

- `steps` is what the executor will run.
- `recognizable: false` means the parser did not understand the text. The Trainer then does nothing useful. The audit tool counts this as `unrecognizable`.

### Attacks

Attack text is split between several parsers. Each one reads a different kind of clause. This is why one attack can touch five files.

| Clause type | Parser | Example phrase |
|---|---|---|
| Damage numbers | `rules/damage-parser.mjs` (`parseAttackDamage`) | "does 30 damage", "30 more damage for each..." |
| Special Conditions | `rules/attack-status.mjs` | "the Defending Pokémon is now Paralyzed" |
| Whole-attack gates | `rules/attack-conditions.mjs` | "if this Pokémon has 2 Energy attached..." |
| Other effects (ordered steps) | `rules/attack-steps.mjs` | "discard the top card of your opponent's deck" |
| Optional extra cost for bonus damage | `rules/optional-cost-bonus.mjs` | "You may discard a Stadium. If you do, ..." |
| Copy another attack | `rules/attack-copy.mjs` | "use 1 of the attacks of..." |

Probe output for two real-looking sentences (run from the repo root):

```js
// parseAttackSteps('Discard the top card of your opponent's deck.')
{ before: [], after: [{ type: 'atkMill', side: 'opponent', count: 1 }], handlesSearch: false }

// parseAttackSteps('Put up to 2 Pokémon from your discard pile onto your Bench.')
{ before: [], after: [{ type: 'atkBenchFromDiscard', count: 2, upTo: true }], handlesSearch: false }
```

`before` runs before damage, `after` runs after damage. Each entry has a `type`; the executor matches on it.

**Important:** a sentence that matches no template is ignored on purpose. The file header in `rules/attack-steps.mjs` says: "a missing effect is safer than a wrong one." So a card can run with no effect and still look "fine" in the game. Check for this (see section 8).

### Abilities

`parseAbility()` in `shared/engine/rules/abilities.mjs`. Abilities are classified by `classifyAbility()` in `rules/ability-effects.mjs`. Passive abilities (always-on effects) are listed in `PASSIVE_ABILITY_STEP_TYPES` in `rules/ability-step-plan.mjs`.

---

## 6. Executors: steps into state changes

An executor takes a step and changes the game state. The main one is `executeSteps` in `shared/engine/effects/executor.mjs` (line ~374).

- `EXECUTOR_STEP_TYPES` (executor.mjs line ~46) lists step types that the executor knows how to run. A step type that is not in this list is reported as "no executor" by the audits.
- Some step types are handled inline in `executor.mjs`. The rest are delegated to `effects/trainer-steps.mjs` (for Trainers) or `effects/attack-steps.mjs` (for attacks). Use grep to find the handler:

```bash
grep -n "searchDeck" shared/engine/effects/*.mjs
```

- Helpers that every handler uses (`discardCard`, `attachTo`, `shuffleDeck`, `pickById`) are in `trainer-steps.mjs`. Reuse them. Do not write your own discard function.

---

## 7. Tests: how to prove a fix

Every engine change needs a test that **fails without the fix**. The project rule is strict about this.

Tests use plain Node's test runner (`node:test`). They use **stub cards** built with `createCard()`, not the real corpus. No browser (jsdom) is needed. The style is shown by `shared/engine/__tests__/precious-trolley.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

// Precious Trolley (Surging Sparks 185, tcg corpus row): "Search your deck for any number of
// Basic Pokémon and put them onto your Bench. Then, shuffle your deck."

test('Precious Trolley lets you pick every Basic that fits on the Bench', () => {
  // ... build a state, play the card with applyCommand, assert on res.pendingChoice ...
});
```

Notes on that pattern:

- The comment names the **card, the set and number, and the corpus row**. Do this every time. It lets the next person check the text.
- `createRng(42)` makes the random parts repeatable. Always pass a seed.
- Assertions use `assert.equal` on real results (`res.error`, `res.pendingChoice`, zone sizes). Do not assert on internal helper output alone.

Run one test file:

```bash
node --test shared/engine/__tests__/precious-trolley.test.mjs
```

---

## 8. The audit gates: how to check nothing else broke

Each gate scans the whole corpus and compares results with a saved baseline. If a row got worse, the gate fails. If a row got better, the gate reports an improvement and asks you to refresh the baseline.

| Command | Time | What it checks |
|---|---|---|
| `pnpm audit:trainers` | seconds | Every unique Trainer: parsed or not, steps have an executor or not, play condition. Baseline: `scripts/trainer-behaviour-baseline.json`. |
| `pnpm audit:attacks` | ~2 min | Every attack: `ok`, `partial`, `ran-no-effect`, or `engine-error`. Baseline: `scripts/attack-behaviour-baseline.json`. |
| `pnpm audit:abilities` | ~2 min | Every ability: runs, is dead, is consumed, or is unparsed. |
| `pnpm audit:oracle` | ~2 min | Runs every corpus attack and ability through the engine. Required after attack or ability engine changes. |

Real output of `pnpm audit:trainers` on the current repo (abridged):

```
Unique Trainer cards: 1560 (2910 printings)
With a parsed play condition: 70

Gap tag                                               cards
passive-only                                           448
unrecognizable                                          55

14 improvement(s) — refresh with --update-baseline:
  Charity#1w3zd3n: closed passive-only
  ...
PASSED
```

- `passive-only` means the parser found no active step for that Trainer.
- `unrecognizable` means the parser did not understand the text at all.
- `improvement(s)` means your change made some rows better. Review them, then run the gate with `--update-baseline` to save the new baseline. Only do this after you have checked the changes are correct.

---

## 9. Recipe: fix one card that does the wrong thing

Follow these steps in order. Do not skip step 2.

### Step 1. Write down the symptom in one sentence

Examples:

- "Precious Trolley only lets me pick one Basic."
- "Booming Call can't bench a Stage 1 from my discard."
- "Grand Tree evolves a Pokémon I just played."

If you cannot write the symptom in one sentence, you do not understand the bug yet. Ask the person who reported it, or reproduce it in a local game first.

### Step 2. Find the card's printed text

```bash
grep -n "Precious Trolley" out/pkmn-trainer-cards.json
```

For a Pokémon attack or ability, search `out/pkmn-pokemon-cards.json`. Copy the `text` value exactly. Do not paraphrase it.

### Step 3. Ask the parser what it understood

Run a probe from the repo root. Use the exact printed text from step 2.

```bash
node -e "import('./shared/engine/rules/trainer-effects.mjs').then(m => console.log(JSON.stringify(m.parseTrainerEffect('PASTE THE TEXT HERE'), null, 1)))"
```

For an attack, call `parseAttackSteps` from `shared/engine/rules/attack-steps.mjs`, and check the damage parser and the status parser too. Compare the output with what the card should do.

Decide which stage is wrong:

| What you see | Stage that is wrong | Where to look |
|---|---|---|
| `recognizable: false`, or `steps: []` for an attack clause | **Parser**: no template matches | `rules/trainer-effects.mjs`, `rules/attack-steps.mjs` |
| Steps are present but with the wrong numbers or flags (e.g. `count: 1` should be "any number") | **Parser**: a template reads the wording too narrowly or too broadly | Same files, find the template that produced it |
| Steps look right but the game does the wrong thing | **Executor**: the handler is wrong | `effects/trainer-steps.mjs`, `effects/attack-steps.mjs`, `effects/executor.mjs` |
| The WotC (old) wording of the card fails, the modern one works | **Legacy rewrite** | `rules/legacy-trainer-wording.mjs`, `rules/legacy-attack-wording.mjs`, `rules/legacy-power-wording.mjs` |
| Legal action is refused with an error | **Legality gate** | `reduce.mjs` `validateLegality` (line ~4549) and `trainer-play-conditions.mjs` |

### Step 4. Write a failing test first

Put the test in `shared/engine/__tests__/<card-name>.test.mjs`. Copy the pattern from section 7. In the first line of the test file comment, quote the card's corpus row (set, number, text).

Run it. It must fail, and the failure must match the symptom from step 1:

```bash
node --test shared/engine/__tests__/<card-name>.test.mjs
```

If the test passes before you change anything, the test does not test the bug. Fix the test.

### Step 5. Make the smallest fix in the right stage

Rules for the change:

- **Anchor the regex.** Use `^` and `$` for trainer and attack templates where the text is a full sentence. An unanchored pattern will match cards you did not mean to touch.
- **Put narrow patterns before broad ones.** The first matching branch often wins. A broad branch above a narrow one will hide the narrow one.
- **Do not special-case a card name in code unless there is no other way.** Prefer a text pattern. If the same wording appears on other cards, the fix should help those too. Check with `grep` on the corpus before you decide.
- **Keep the change in one stage.** A parser fix should not also edit the executor.

Good example: the Booming Call fix (commit `2d909a2b`). The template in `shared/engine/rules/attack-steps.mjs` (line ~641) gained one optional capture. It sets `basic: true` only when the attack text says "Basic". Booming Call's text says "{N} Pokémon" with no "Basic", so any stage qualifies. The change is 2 lines, and the test in `attack-steps.test.mjs` covers it.

### Step 6. Run the tests in this order

1. The one test file you wrote: `node --test <file>`. It must now pass.
2. The tests for the files you changed: `pnpm test:changed`.
3. Lint the files you touched: `npx eslint --quiet <files>`.
4. After any parser or engine change, run the matching audit gate (section 8). If the gate reports a regression, fix it. If it reports only improvements, review them and then refresh the baseline with `--update-baseline`.
5. Before you land on `main`: the full suite, `pnpm test`. It takes a few minutes and must be green.

### Step 7. Write the commit message

The commit message is the record of the change. The repo uses this shape:

```
patch: <what changed, in one line>

<up to 4 lines on why>
flag: <any known debt or risk, optional>
```

Real example from this repo (commit `28adb953`; its `flag:` line was closed later by `2b15f767`):

```
patch: Precious Trolley benches every Basic that fits; Grand Tree obeys first-turn evolve ban

Trolley parsed as one Pokémon search; "any number of Basic Pokémon" now picks up to the open Bench slots.
Grand Tree's search-evolve path skipped the turn 1-2 evolve gate that canEvolve and server reducer enforce.
flag: stadium search-evolve still ignores the just-played gate (a Pokémon played this turn can be evolved via Grand Tree).
```

---

## 10. Worked example: Precious Trolley

This is a real fix from `git show 28adb953`. Walk through it as a template.

**Symptom:** Precious Trolley only let the player bench one Basic.

**Printed text** (`out/pkmn-trainer-cards.json`): "Search your deck for any number of Basic Pokémon and put them onto your Bench. Then, shuffle your deck."

**Diagnosis (step 3):** The parser read this as a single Pokémon search. "Any number of" was not understood, so `count` stayed at 1.

**Fix (step 5):** A narrow branch was added to `parseSearchDeckKind` in `shared/engine/rules/trainer-effects.mjs`, placed before the generic branches:

```js
// Precious Trolley: "any number of Basic Pokémon … onto your Bench". The executor caps picks at
// the open Bench slots, so a count of 5 (the full Bench) means "as many as fit".
if (/search your deck for any number of basic pok[ée]mon\b/.test(lower) && destination === 'bench') {
  return { what: 'Basic Pokémon', count: 5, destination, upTo: true };
}
```

Note the design choice in the comment. The parser returns a count of 5 (the Bench size), and the executor caps the real picks to the open Bench slots. This keeps the parser simple. If you need a different approach for another card, write it in the same comment style: say what the number means.

**Test (step 4):** `shared/engine/__tests__/precious-trolley.test.mjs` checks:

- the player is offered every Basic in the deck (4 of 4),
- the pick count is capped by open Bench slots (3 Bench Pokémon leaves 2 slots, so `max` is 2),
- picking all four benches all four and leaves the deck empty.

To confirm the test catches the bug, check out the parent commit's `trainer-effects.mjs` into the working tree, run the test, and expect failures. Then restore your version. Do not use `git checkout --` on files that have your uncommitted work; copy the file aside first.

---

## 11. Known traps

These come from the project's landmine notes and the code. Read them before you change the area.

- **Two gates look like they work but do not.** The once-per-turn energy-attach flag (`flags[user].energyAttached`) is only set when Energy is detached into the `attachedCards` zone. A real hand-to-Pokémon attach does not set it. Do not assume that limit is enforced. See `.agent/PROJECT.md` (landmines).
- **Check the commit log before trusting a `flag:` line.** Commit `28adb953` flagged that Grand Tree ignored the "just played" evolve gate. Commit `2b15f767` closed it. Run `git log --grep='flag:'` and `git log -5 --format='%h %s'` to see what is still open.
- **Silent no-op is the default for unknown text.** If a sentence matches no template, the card runs with no effect and no error. Check the audit rows, not just the game log.
- **Do not send `'self'` or `'opp'` over the wire.** These are point-of-view words. Convert to an absolute player id at the boundary.
- **Do not index cards by array position.** Use `instanceId`. Index-based lookup drifts in two-player games.
- **Do not hand-edit `out/*.json`.** These are generated corpus files. Fix the parser or the corpus scraper, not the output.
- **Do not edit `.agent/journal/` or `.agent/archive/`.** They are frozen history.

---

## 12. Quick reference

| I want to... | Go to |
|---|---|
| Find a card's printed text | `out/pkmn-trainer-cards.json`, `out/pkmn-pokemon-cards.json` |
| See the entry point for all commands | `shared/engine/reduce.mjs` `applyCommand` (~8654) |
| Check whether an action is legal | `reduce.mjs` `validateLegality` (~4549) |
| Read a Trainer's text into steps | `shared/engine/rules/trainer-effects.mjs` `parseTrainerEffect` (~1319) |
| Read an attack clause into steps | `shared/engine/rules/attack-steps.mjs` `parseAttackSteps` (~1760) and its `TEMPLATES` list (~154) |
| Read attack damage | `shared/engine/rules/damage-parser.mjs` |
| Run the steps | `shared/engine/effects/executor.mjs` `executeSteps` (~374) |
| Find a step's handler | `grep -n "<stepType>" shared/engine/effects/*.mjs` |
| Fix old WotC wording | `shared/engine/rules/legacy-*-wording.mjs` |
| Run one card test | `node --test shared/engine/__tests__/<file>.test.mjs` |
| Check the Trainer gate | `pnpm audit:trainers` |

### Deeper references in this repo

- `docs/card-parsing-and-audit-guide.md`: the attack and ability parser layers, golden rules for regexes, and the audit scripts.
- `docs/card-era-audit-and-fix-process.md`: how a whole set of cards is audited and fixed in batches.
- `docs/pkmncards-trainer-parse-and-lost-zone.md`: a worked Trainer parse investigation.
- `.agent/MAP.md`: one line per module. Search it with `grep -n -i <keyword> .agent/MAP.md`. Do not read it whole.
- `.agent/PROJECT.md`: architecture, constraints, and landmines.

---

## 13. Glossary

- **Applying a command**: sending one player action through `applyCommand`. Returns a new state and events.
- **Corpus**: the generated card data files under `out/`.
- **Executor**: code that changes state from steps.
- **Gate**: a check that refuses an action. Turn gate, legality gate, play condition.
- **Parser**: code that reads card text and returns steps. Never changes state.
- **PendingChoice**: a paused state where the engine waits for the player to pick cards or options.
- **Step**: one structured instruction, e.g. `{ type: 'searchDeck', ... }`.
- **Template**: one regex-plus-builder entry in a parser list.
- **Zone**: a place a card can be (`hand`, `deck`, `active`, `bench`, `discard`, `prizes`, ...).
