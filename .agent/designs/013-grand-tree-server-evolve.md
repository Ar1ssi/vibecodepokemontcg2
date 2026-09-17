# 013: Grand Tree search-evolve under server authority
Status: shipped
Date: 2026-09-18 · Session: S173

## Problem
Under `SERVER_AUTHORITATIVE`, Grand Tree only searches the deck and puts the picked card down —
no evolve onto the host, no Stage 2 chain. `chat-buttons.js` gates `stadium-effect` to the server
(line ~4344) and returns before `executeGrandTreeSpecialRule`, so every client-side Grand Tree fix
(D20, D26, D30) is dead code under the flag. The server has no `search-evolve` step kind, so
`executeStadium` falls through to a by-name fallback that does a plain `searchDeck` to hand.

## Constraints
- Engine code is pure and DOM-free; no `Math.random` (Invariants 6 and 8).
- Evolution on the server is modelled as the evolution card attached under the root
  (`attachTo` + `pokemonEvolved`), never as a zone replacement (evolved-pokemon.mjs header).
- Every choice point must suspend through `ctx.ask` / `PendingChoice` and resume from a resume
  token; steps must be re-entrant.
- Deck shuffles go through `activeRng` only.
- Legacy (flag-off) behavior must not change.

## Current state
- `client/src/actions/chat-buttons/chat-buttons.js:4344` — `dispatchAuthoritativeAction('stadium-effect')`
  returns early under the flag; `executeGrandTreeSpecialRule` (line 4152) is the legacy path.
- `shared/engine/rules/stadium-effects.mjs:218` — `parseStadiumOncePerTurn` classifies Grand Tree as
  `{ kind: 'search-evolve', n: 1, chainStage2: /stage 2/.test(text) }`.
- `shared/engine/effects/stadium.mjs:76-113` — `executeStadium` maps only `search-bench`,
  `search-hand`, `search-deck`, `draw`, `heal-all`, `discard-draw`; `search-evolve` has no branch,
  so `steps` stays empty and the Grand-Tree-by-name fallback pushes a `searchDeck` to hand.
- `shared/engine/effects/trainer-steps.mjs:1036` — `searchEvolve` (Salvatore) already does
  deck search for an evolution card, host resolution via `evolvesFromTop`, an ask when the host is
  ambiguous, attach + `pokemonEvolved`, and the end shuffle.
- `shared/engine/effects/executor.mjs:150` — `EXTRA_STEP_HANDLERS` dispatch, with per-step `memo`
  carried in `context[idx:type]` across suspensions.

## Options
1. Grand Tree host/chain logic
   - A: new dedicated `grandTreeEvolve` handler. Tradeoff: duplicates deck filtering, host
     resolution and shuffle handling already in `searchEvolve`; two places to fix later.
   - B: extend `searchEvolve` with an opt-in `step.chainStage2` phase. Tradeoff: one more phase in
     an existing state machine, but one code path for all search-evolve cards.
   - Pick B — Salvatore and Grand Tree differ only by the chained second evolve.
2. Evolution-timing gates ("put into play this turn", "already evolved this turn")
   - A: implement the gates server-side now. Tradeoff: the server tracks no per-card turn metadata
     at all, so this means new state on every Pokémon plus reducer work — a separate change.
   - B: match existing server behavior (no gate; Salvatore's `searchEvolve` has none) and file it.
   - Pick B — out of scope, filed as an ISSUES line.
3. Deck shuffle placement in the chain
   - A: shuffle after each evolve step. Tradeoff: two `deckShuffled` events, and the Stage 2 lookup
     would run against an already-shuffled deck (harmless but noisy).
   - B: shuffle once, when the chain ends (declined, absent, or attached).
   - Pick B — one shuffle per activation matches the printed card and the legacy client.

## Design
`searchEvolve(ctx)` in `shared/engine/effects/trainer-steps.mjs` gains one memo phase.

Phases (`ctx.memo.phase`):
- (none) — first entry. Candidates: deck cards where `isPokemon(c)` and
  `evolvesFromTop(player, c).length > 0`, minus ability-holders when `step.noAbilities`. No
  candidates → `shuffleDeck`, return null. Else `ctx.ask({min: 0, max: 1})`.
- selection on first phase — no card picked (empty selection) → `shuffleDeck`, null. One host →
  attach, then `chainStage2Step`. Several hosts → `ctx.ask(memo: { phase: 'target', cardId })`.
- `'target'` — attach onto the chosen root, then `chainStage2Step`.
- `'stage2'` (new) — `ctx.selection` names the Stage 2 card; attach it onto the same root
  (`memo.rootId`), emit `pokemonEvolved`, `shuffleDeck`, return null. Empty selection (declined) →
  `shuffleDeck`, return null.

`chainStage2Step(ctx, evolvedCard, root)` (new, module-private):
- Returns `shuffleDeck` + null unless `ctx.step.chainStage2` is set.
- Candidates: `player.zones.deck.filter(c => isPokemon(c) && nameMatches(c.evolvesFrom, evolvedCard.name))`,
  where `nameMatches` is the existing lowercase compare used by `evolvesFromTop`.
- None → `shuffleDeck`, null. Else `ctx.ask({ min: 0, max: 1, memo: { phase: 'stage2', rootId: root.instanceId } })`.

`executeStadium` (`shared/engine/effects/stadium.mjs`): add
`else if (opt.kind === 'search-evolve') steps.push({ type: 'searchEvolve', chainStage2: !!opt.chainStage2 })`
to the `opt` branch chain, and delete the Grand-Tree-by-name `searchDeck` fallback it replaces.

No state-shape, protocol or client change: the evolve is the same attach + `pokemonEvolved` event
the client already renders for Rare Candy and Salvatore.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty deck / no evolution card matching a Pokémon in play | no choice offered, deck shuffled, effect completes, stadium still marked used | [x] covered: Grand Tree with an empty deck / with no matching Evolution card |
| 2 | step reached with `chainStage2` false (Salvatore) | unchanged single-evolve behavior | [x] covered: searchEvolve (Salvatore) test in trainer-steps.test.mjs |
| 3 | player declines the first pick (empty selection, min 0) | nothing evolves, deck shuffled once, activation consumed | [x] covered: declined at the first pick |
| 4 | repeated activation in the same turn | blocked by `player.flags.stadiumUsedThisTurn` before any step runs | [x] covered: declined at the first pick (second activate rejected) |
| 5 | deck holds a Stage 2 that evolves from a different name | no Stage 2 ask; chain ends after the Stage 1 evolve | [x] covered: offers no Stage 2 whose evolvesFrom names a different Pokémon |
| 6 | suspension between the Stage 1 and Stage 2 choice (disconnect) | `pendingChoice` + resume token persist; resuming completes the chain | [x] covered: keeps the Stage 2 choice pending across a suspension |
| 7 | two identical hosts in play (ambiguous) | `'target'` ask lists both; chain continues from the chosen root | [x] covered: asks which Pokémon to evolve when two hosts match |
| 8 | player declines the Stage 2 pick | Stage 1 evolution stands, deck shuffled once | [x] covered: declined at the Stage 2 pick keeps the Stage 1 evolution |
| 9 | chain completes | exactly one `deckShuffled` event for the activation | [x] covered: evolves a Stage 1 ... then chains the Stage 2 (shuffle count assertion) |
| 10 | selection names a card no longer in the deck (stale) | treated as no pick: shuffle, complete, no attach | [x] covered: Stage 2 selection no longer in the deck |

## Test plan
- Unit, `shared/engine/effects/__tests__/` + `shared/engine/__tests__/stadium-execution.test.mjs`:
  every row above, driving `executeStadium` and resuming with selections.
- No new test file unless needed; any new file must be added to the `package.json` test list.
- Manual: live 2P under `SERVER_AUTHORITATIVE=1` via `.agent/scratch/probe.mjs` — Froakie in play,
  Grand Tree activated, Frogadier then Greninja in one activation.

## Migration / rollout
n/a — no persisted state. Revert path: revert the two source files; the legacy client path is untouched.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `searchEvolve` chainStage2 phase + unit tests | `pnpm test` green |
| 2 | `executeStadium` search-evolve branch + stadium tests | `pnpm test` green |
| 3 | live 2P verification under the flag | probe run shows the chained evolve |

## Deviations (Builder appends here during build)
- Slice 3 (live 2P probe) not completed: `probe.mjs` was extended to load a real decklist
  (`step.deckRows()`), but the harness wedges before ready-up — after `loadDeckList` reports 40
  cards, the probe's own `zone('self','deck').count >= 1` wait times out. Harness problem, not a
  product one; the scratch step (`.agent/scratch/step-grandtree.mjs`) is left in place for the next
  attempt. The user is verifying by hand instead.
