# Design 060 — Trainer search/recovery residuals after the kind-and-count fix

Status: approved (self, S333 — the user asked for the diagnosis, the fix, the broken list and a
slice-builder pass in one turn). Builder: `slice-builder`, one slice at a time, in this order.

## Context

S333 (`claude/parse-audit-fix`) replaced three card-by-card special cases in
`shared/engine/rules/trainer-effects.mjs` with general rules:
- `parseTwoKindSearch` — "a X, a Y, and a Z card" → `searchDeckSequence`, one stage per kind;
- the discard-recovery branch — "put [up to] N <kind> cards from your discard pile into your hand"
  → `recursion { what, count, upTo }` via `cardKindWhat`;
- the deck-search tail — printed count and kind ("up to 2 Basic Pokémon", "3 Pokémon Tool cards");
- a leading "Draw N cards." becomes a `draw` step whatever branch reads the rest.
`scripts/lib/trainer-behaviour.mjs` now tags `loose-what`, `merged-kinds`, `dropped-count` and
`lost-draw`, and `pnpm audit:trainers` ratchets them. The report with every card is
`.agent/scratch/parse-audit-2026-09-29.md`.

The slices below are what the general rules could not express because an executor contract was
missing. Every contract is pinned here; a slice that needs anything more stops and returns.

Sources: card text from `out/pkmn-trainer-cards.json` (name, set, number quoted per slice).
Verification for every slice: `node --test <the slice's test file>`, `pnpm test:changed`,
`npx eslint --quiet <touched files>`, then `pnpm audit:trainers` — the slice's cards must lose
their tag (listed as improvements); refresh with `pnpm audit:trainers --update-baseline` and
commit the baseline with the slice. Never `--update-baseline` while the gate reports a regression.

## Slice 1 — `nameFilter` for "cards with X in their name"

Files: `shared/engine/rules/trainer-effects.mjs` (`parseSearchDeckParams` tail, the
`DISCARD_KINDED_RE` branch), `shared/engine/effects/executor.mjs` (`case 'recursion'`),
`shared/engine/__tests__/search-kinds.test.mjs` (append).

Contract:
- Parser: when the search or recovery phrase matches one of
  - `(?:cards?|pokémon|trainer cards?|item cards?|evolution cards?) (?:that have|with) (?:the word )?["“]?([^"”]+?)["”]? in (?:its|their) names?`
  - `cards? named ([a-z0-9' .-]+?)(?=,|\.| and| that)`
  the step carries `nameFilter: <X as printed, original case>` and `what` is the kind before the
  clause via `knownKindWhat` ("Item", "Trainer", "Evolution Pokémon", "Pokémon"), or `'card'`.
  Count and `upTo` come from the article as today.
- Executor: `case 'recursion'` filters candidates and the resumed selection with the same
  `nameFilter` test `searchDeck` already applies (`String(c.name).toLowerCase().includes(filter)`).
  `searchDeck` needs no change.
- `describeStep` for both steps appends ` named "<X>"` / ` with "<X>" in its name`.

Cards and expected steps (exact):
| Card | Text (corpus) | Step |
|---|---|---|
| Apricorn Maker (Celestial Storm 161) | "Search your deck for up to 2 Item cards that have the word “Ball” in their name, reveal them, and put them into your hand…" | `searchDeck { what: 'Item', count: 2, upTo: true, nameFilter: 'Ball', reveal: true }` |
| Apricorn Maker (Skyridge 121) | "…up to 2 Trainer cards with Ball in their names, show them…" | `searchDeck { what: 'Trainer', count: 2, upTo: true, nameFilter: 'Ball' }` |
| Ball Guy (Shining Fates 065) | "…up to 3 different Item cards that have the word “Ball” in their name…" | `searchDeck { what: 'Item', count: 3, upTo: true, nameFilter: 'Ball', reveal: true }` ("different" is not enforced) |
| Looker Whistle (Ultra Prism 127) | "…up to 2 cards named Looker, reveal them…" | `searchDeck { what: 'card', count: 2, upTo: true, nameFilter: 'Looker', reveal: true }` |
| The Boss’s Way (Legendary Collection 105) | "Search your deck for an Evolution card with Dark in its name…" | `searchDeck { what: 'Evolution Pokémon', count: 1, nameFilter: 'Dark' }` |
| Archie (Team Magma vs Team Aqua 71) | "Search your deck for a Pokémon with Team Aqua in its name and put it onto your Bench…" | `searchDeck { what: 'Pokémon', count: 1, destination: 'bench', nameFilter: 'Team Aqua' }` (the Basic-treatment and damage clauses stay unparsed) |
| Professor Laventon (Silver Tempest 162) | "Put up to 3 Pokémon that have “Hisuian” in their names from your discard pile into your hand." | `recursion { what: 'Pokémon', count: 3, upTo: true, from: 'discard', nameFilter: 'Hisuian' }` |
| Aether Foundation Employee (Lost Thunder SV81) | "Put 3 Pokémon that have “Alolan” in their names from your discard pile into your hand." | `recursion { what: 'Pokémon', count: 3, from: 'discard', nameFilter: 'Alolan' }` |

Tests: one parse assertion per row; one execution test for Laventon (a discard of Hisuian Zoroark,
Hisuian Arcanine, Pikachu, Basic Fire Energy → options are the two Hisuian cards, max 3); one for
Apricorn Maker (deck of Ultra Ball, Nest Ball, Rare Candy, Pikachu → options Ultra Ball, Nest Ball).

## Slice 2 — search destination `'discard'`

Files: `shared/engine/rules/trainer-effects.mjs` (`parseSearchDeckParams` destination block),
`shared/engine/effects/executor.mjs` (`case 'searchDeck'`, the selection branch),
`shared/engine/__tests__/search-kinds.test.mjs` (append).

Contract:
- Parser: `search your deck for … and discard (?:it|them)` → `destination: 'discard'`.
- Executor: with `dest === 'discard'` the selected cards move deck → discard
  (`events: cardMoved { from: 'deck', to: 'discard' }`, one per card, then the deck shuffles as today).
  No reveal event.
- `describeStep`: "Search your deck for up to N cards and discard them."

Cards:
| Card | Text | Step |
|---|---|---|
| Brilliant Blender (Surging Sparks 164) | "Search your deck for up to 5 cards and discard them. Then, shuffle your deck." | `searchDeck { what: 'card', count: 5, upTo: true, destination: 'discard' }` |
| Professor Burnet (Silver Tempest TG26) | "Search your deck for up to 2 cards and discard them…" | `… count: 2 …` |
| Battle Compressor Team Flare Gear (Phantom Forces 92) | "Search your deck for up to 3 cards and discard them…" | `… count: 3 …` |

Tests: parse for all three; execution for Brilliant Blender (choose 2 of a 6-card deck → both in
discard, none in hand, deck length 4).

## Slice 3 — `discardHand` before a search

Files: `shared/engine/rules/trainer-effects.mjs`, `shared/engine/effects/executor.mjs`
(new `case 'discardHand'`, next to `discardHandThenDraw`), `shared/engine/effects/executor.mjs`
`EXECUTABLE_STEP_TYPES` (or wherever `isExecutableStepType` reads), `search-kinds.test.mjs`.

Contract:
- Parser: a text starting `discard your hand and search your deck` gets
  `{ type: 'discardHand' }` unshifted before the search step(s) the rest of the text parses to.
- Executor: `discardHand` moves every hand card to the discard (`cardMoved` per card); the
  Supporter being played is not in the hand at that point (it is in play), so nothing special.
- `describeStep`: "Discard your hand."

Cards: Peony (Chilling Reign 220) → `[discardHand, searchDeck { what: 'Trainer', count: 2, upTo: true, reveal: true }]`;
Larry’s Skill (Prismatic Evolutions 139) → `[discardHand, searchDeckSequence (Pokémon, Supporter, Basic Energy)]`.

Tests: parse both; execution for Peony (hand of 3 non-Trainers → discard has 3, then the search
choice offers the deck's Trainers).

## Slice 4 — `alternatives` for "up to N X or up to M Y"

File: `shared/engine/rules/trainer-effects.mjs` (`parseSearchDeckParams`, next to the Brock's
Scouting `basicOrEvo` branch), `search-kinds.test.mjs`. The executor's `pickAlternativeBranch`
already handles the shape.

Contract: `search your deck for (up to )?(\d+) <kind A> or (up to )?(\d+) <kind B>` (with
`knownKindWhat` on both kinds, optional "(except for …)" ignored) →
`searchDeck { what: '<A> or <B>', count: max(N, M), upTo: true, alternatives: [{ what: A, count: N }, { what: B, count: M }], destination }`.
Brock's Scouting keeps its exact current output (the existing test pins it).

Cards:
| Card | Text | Step |
|---|---|---|
| Sonia (Champion's Path 065) | "Search your deck for up to 2 Basic Pokémon or up to 2 basic Energy cards, reveal them…" | `what: 'Basic Pokémon or Basic Energy', count: 2, upTo: true, alternatives: [{ what: 'Basic Pokémon', count: 2 }, { what: 'Basic Energy', count: 2 }], reveal: true` |
| Brigette (BREAKthrough 161) | "Search your deck for 1 Basic Pokémon-EX or 3 Basic Pokémon (except for Pokémon-EX) and put them onto your Bench…" | `what: 'Basic Pokémon-EX or Basic Pokémon', count: 3, upTo: true, destination: 'bench', alternatives: [{ what: 'Basic Pokémon-EX', count: 1 }, { what: 'Basic Pokémon', count: 3 }]` (the except-EX exclusion is not enforced) |

`matchesSearch` must accept `'Basic Pokémon-EX'` (a Basic whose name ends in "-EX" or " EX");
add the branch next to `pokémon-gx` if missing, with a test.

## Slice 5 — coin-gated discard recovery

Files: `shared/engine/rules/trainer-effects.mjs` (`parseCoinFlipStep` and the recovery branch),
`shared/engine/effects/executor.mjs` (`case 'recursion'`), `search-kinds.test.mjs`.

Contract:
- Old PC (Darkness Ablaze 164) "Flip 2 coins. If both are heads, put a card from your discard pile
  into your hand." → `coinFlip { count: 2, headsAtLeast: 2, heads: [recursion { what: 'card', count: 1, from: 'discard' }], tails: [] }`
  (the Minion of Team Rocket shape in `parseCoinFlipStep`).
- Energy Restore (Arceus 86 / Majestic Dawn 81) "Flip 3 coins. For each heads, put a basic Energy
  card from your discard pile into your hand…" →
  `recursion { what: 'Basic Energy', from: 'discard', coins: 3, perHeads: 1 }`.
  Executor: when `step.coins` is set, flip `coins` with `activeRng` through the existing coin
  helper (`coinFlipped` events as `coinFlip` emits them), then `count = heads × perHeads`; zero
  heads skips with `effectStepSkipped { reason: 'no_heads' }`. The "put all of them" clause is
  the natural min(count, candidates).
- The parser's existing `recursion … perHeads: true` row (line ≈2404, "Evolution") is out of scope.

Tests: parse both; execution for Energy Restore with a seeded rng where the flips are known
(assert `pendingChoice.max === heads`).

## Out of scope (need a decision, filed as issues by the landing session)

- Choose-1 / choose-both modes: Klara, Energy Recycle System, Judge Whistle, Fossil Excavation Map (I190).
- Old Rod (Neo Revelation 64, Dragon Frontiers 78): both-heads vs both-tails needs a third branch.
- Search then put on top of the deck in order: Mallow ×2, Ciphermaniac’s Codebreaking.
- Conditional second searches: Guzma & Hala, Red & Blue, Jasmine's going-second 5.
- Marker filters with no card data: Single Strike / Rapid Strike / Fusion Strike / Future / Ancient
  / Tera / Team Plasma / Hop's / Baby Pokémon, TAG TEAM, Prism Star, Technical Machine.
- Dual Ball (Expedition 139) "except Baby", Ball Guy "different", Brigette "except Pokémon-EX".
