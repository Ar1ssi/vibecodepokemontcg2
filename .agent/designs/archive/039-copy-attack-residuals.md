# 039: Copy-attack residuals (I168)

Status: shipped
Date: 2026-09-25 · Session: S302

## Problem
17 printed copy-attack wordings still do nothing after design 036 slice 15 (I168): old
"copies that attack except for its Energy cost" prints, previous-Evolution copies
(Incineroar/Charizard), last-turn copies (Mimikyu/Sudowoodo), conditional copies
(Thievul/Nihilego), Tera-only (Team Rocket's Mimikyu), opponent-discard (Mew), own-deck-top
(Slowking), Dark-name (Dark Hypno). 5 more are deferred (below): four need hand/history models
that don't exist yet, and Misty's Psyduck ESP already executes its 1/2-head branches
(`audit:attacks` verdict ok), so a copy parse would regress them.

## Constraints
- Parser stays pure/DOM-free in `rules/attack-copy.mjs`; execution in `reduce.mjs`; conditions
  reuse `rules/attack-conditions.mjs` (`parseConditionClause` / `attackConditionMet`).
- No new dependency, no data migration. `lastAttack` is additive server state; `hashState` and
  `viewFor` read zones/flags only (state.mjs:264, view.mjs:49), so sync/UI are unaffected.
- `applyCommand` clones state — all writes through the draft, reads from the returned state.
- The committed `out/pkmn-pokemon-cards.json` (audit:attacks corpus) contains none of the 18
  wordings (verified against the S279 full corpus), so no baseline move is expected.
- Every behavior change ships a test that fails without it.

## Current state
- `shared/engine/rules/attack-copy.mjs` — `normalize()` (lowercase, strip parentheticals) + 12
  TEMPLATES; `parseCopyAttack` peels one `Flip a coin. If heads, ` prefix into `coinGate:'heads'`.
- `shared/engine/reduce.mjs` — `copySourceCards` (:4943) resolves 6 sources; `copyAttackCandidates`
  (:4968) skips copy-attacks, applies `excludeGx`/`needsEnergy`; `offerCopiedAttack` (:4987)
  reveals `oppDeckTop`, builds a pendingChoice with 1-based candidate sentinels;
  `resumeCopiedAttack` (:5033) re-enters `flipAndResolveAttack`. The `attack` case (:7112) flips
  the copy coinGate (:7201) and offers (:7218) before `flipAndResolveAttack` (:7231).
- `shared/engine/rules/attack-conditions.mjs` — CLAUSES/CHECKS tables; `parseConditionClause` is
  exported (:438). `buildServerAttackContext` already exposes handCount / opponentPrizes /
  bench names / in-play names / rule-box reads.
- `shared/engine/rules/evolved-pokemon.mjs:43` — `priorEvolutionCards(zoneCards, root)` already
  returns "the Basic plus every evolution below the current top".
- No last-attack record exists anywhere. Attack coin gates are single-flip only.

## Options
1. **Parser shape** — A: extend the `parseCopyAttack` spec with new sources/filters/condition/
   coin flips (one parser, one execution path). B: separate "copy residuals" module.
   Pick A — same family and consumers; B duplicates the candidate machinery.
2. **Condition evaluation** — A: evaluate `copy.condition` in `offerCopiedAttack` via
   `buildServerAttackContext` + `attackConditionMet`; skip the prompt when false and let the
   normal flow end the turn. B: hoist whole-attack `parseAttackCondition` before the copy offer
   for every attack. Pick A — B changes coin/event order for all condition-gated attacks.
   Also add the 2 missing clauses to `attack-conditions.mjs` so Nihilego's "use only if" is a
   real whole-attack gate (event + turn end) too.
3. **Last-attack state** — A: `player.lastAttack = {name,text,damage,isGx,attackerName,
   attackerInstanceId,turnNumber}` written in `flipAndResolveAttack`, read only when
   `turnNumber === currentTurn - 1`. B: a global event log. Pick A — smaller surface.
   Non-alternating turn numbers (extra turns) are a documented limitation.
4. **Multi-coin gate** — A: `coinGate` + `coinGateFlips` (all flips must equal the face).
   B: reuse an attack-steps coin descriptor. **Struck after scope read:** Misty's Psyduck ESP
   already runs its 1-head draw / 2-head damage branches (`audit:attacks` verdict ok); claiming
   it as a copy attack would hijack the flow and drop them, and the copy branch alone is not a
   multi-branch coin model. Deferred to I181; single-flip `coinGate` unchanged.
5. **Slowking deck top** — A: new `ownDeckTop` source; `offerCopiedAttack` pops the top card to
   discard (existing `cardsDiscarded` event) before candidates; `noRuleBox` filter. B: reuse the
   `atkUseSupporter` deckTop path. Pick A — that path runs trainer steps, not copy candidates.
6. **Last-turn copies have no "choose"** — A: `auto:true` resolves a single candidate without a
   prompt. B: always prompt. Pick A — a one-option prompt for "use it as this attack" is a lie.
7. **Deferrals (written why; follow-up issue I181, I168 closes with 17 fixed)**
   - Misty's Psyduck ESP — multi-branch coin attack whose 1/2-head draw/damage already run
     (verdict ok); the all-heads copy branch needs a branch-preserving model.
   - Shiftry ex "choose a Basic/Evolution card from your opponent's hand" — no hidden-info
     hand-selection model exists; needs its own contract.
   - Alakazam Star "discard a Basic/Evolution from your hand, then copy it" — needs a pre-copy
     hand-selection prompt + resume seam.
   - Togetic δ Delta Copy — the corpus carries no δ marker in card metadata (0 of 17,774
     printings name δ), so a filter would be dishonest.
   - Smeargle Sketch — "Smeargle was in play during that attack" needs per-turn in-play history,
     beyond `lastAttack`.

## Design

### Parser spec (extends `parseCopyAttack`'s return)
```
{ source: 'ownBench'|'ownDiscard'|'ownEvolutionStack'|'ownInPlay'|'oppActive'|'oppBench'|
          'oppInPlay'|'oppDeckTop'|'oppDiscard'|'ownDeckTop'|'oppLastAttack',
  group?, pokemonType?, count?, optional?, needsEnergy?, excludeGx?,
  coinGate?: 'heads'|'tails',   // the attack's own single coin gate
  condition?: object,        // parseConditionClause descriptor
  tera?, darkName?, excludeSelf?, noRuleBox?, auto? }
```

### Parser control flow
```
parseCopyAttack(text):
  t = normalize(text)                      // unchanged: lowercase, strip (…), collapse spaces
  loop:
    m = matchTemplates(t); if (m) return {...m, ...flags}
    p = peelOnePrefix(t);  if (!p) return null
    t = p.rest; flags = {...flags, ...p.flags}
```
`peelOnePrefix` (first match wins; unparseable prefix ⇒ null, fail closed):
- `^flip (a|an|\d+) coins?\. if (heads|tails|all (\d+) are heads), ` → `coinGate:'heads'|'tails'`
  for a single coin; a multi-coin gate fails closed (Misty's Psyduck deferral).
- `^if (.+?), ` → `condition: parseConditionClause(m[1])` (null ⇒ fail).
- `^you can use this attack only if (.+?)\. ` → `condition: parseConditionClause(m[1])`.
Templates are tried before peeling, so the last-turn wording (which starts with "if …") is a
whole-text template, not a condition.

### New templates (normalized text; `PERFORMS` = existing trailing-sentence helper)
| # | Wording (cards) | Spec |
|---|---|---|
| T1 | `choose 1 of (the defending pokemon\|your opponent's active pokemon)'s attacks. [^.]+ copies that attack except for its energy costs?[ and anything else required in order to use that attack].` + PERFORMS (Clefable/Clefairy DP+BS, Clefable ex) | `{source:'oppActive'}` |
| T2 | `choose an attack on 1 of your opponent's pokemon[ in play]. [^.]+ copies that attack[ except for its energy cost].[ this attack does nothing if [^.]+ doesn't have the energy necessary to use that attack.]` + PERFORMS (Mew Star, Togetic Super Metronome) | `{source:'oppInPlay'[, needsEnergy:true]}` |
| T3 | `choose an attack on 1 of your opponent's pokemon in his or her discard pile. [^.]+ copies that attack except for its energy cost.` + PERFORMS (Mew) | `{source:'oppDiscard'}` |
| T4 | `choose an attack on 1 of your opponent's benched pokemon. [^.]+ copies that attack except for its energy cost.` + PERFORMS (Smeargle Trace, coin-prefixed) | `{source:'oppBench'}` |
| T5 | `choose an attack on 1 of your pokemon in play that has dark in its name. [^.]+ copies that attack except for its energy cost.` + PERFORMS (Dark Hypno; the printed "(excluding this one)" is stripped by normalize) | `{source:'ownInPlay', darkName:true, excludeSelf:true}` |
| T6 | `choose 1 of your opponent's active tera pokemon's attacks and use it as this attack.` (Team Rocket's Mimikyu) | `{source:'oppActive', tera:true}` |
| T7 | `choose an attack from 1 of this pokemon's previous evolutions and use it as this attack.` (Incineroar) | `{source:'ownEvolutionStack'}` |
| T8 | `choose 1 of this pokemon's attacks from its previous evolutions and use it as this attack.` (Charizard) | `{source:'ownEvolutionStack'}` |
| T9 | `discard the top card of your deck, and if that card is a pokemon that doesn't have a rule box, choose 1 of its attacks and use it as this attack.` (Slowking) | `{source:'ownDeckTop', count:1, noRuleBox:true}` |
| T10 | `if your opponent's pokemon used an attack[ that isn't a gx attack] during (their\|his or her) last turn, use it as this attack.` (Mimikyu, Sudowoodo) | `{source:'oppLastAttack'[, excludeGx:true], auto:true}` |

Thievul needs no template of its own: `If you have no cards in your hand,` peels to a
condition, then the existing `choose an attack from 1 of your opponent's pokemon in play and use
it as this attack.` matches a new base template `{source:'oppInPlay'}` (T2 without the copies
clause — add as its own entry).

### reduce.mjs
- `copySourceCards(draft, {copy, playerId, oppId, attacker, extra})`:
  - `ownInPlay` → roots of own active + bench.
  - `ownEvolutionStack` → `priorEvolutionCards(zone, attacker)` (import from evolved-pokemon.mjs);
    zone found via `findCard(draft, attacker.instanceId)`.
  - `oppDiscard` → `rootsIn(opp.discard)`.
  - `ownDeckTop` → `[extra.ownDeckTop]` when set.
  - existing cases unchanged.
- `copyAttackCandidates(...)`: special-case `oppLastAttack` before the card loop — return
  `[{sourceId: last.attackerInstanceId, sourceName: last.attackerName, attack: last.attack}]`
  when `draft.players[oppId].lastAttack.turnNumber === currentTurn - 1`, the attack isn't a copy
  wording, and `excludeGx` doesn't exclude it; else `[]`. Raw printed `attacks` (not the in-play
  view) for `ownDiscard`, `oppDeckTop`, `oppDiscard`, `ownDeckTop`, `ownEvolutionStack`.
  Card filters: `tera` (`isTeraCard(view)`), `darkName` (`/dark/i` on the view name),
  `excludeSelf`, `noRuleBox` (`!isRuleBoxPokemon(view ?? card)`).
- `offerCopiedAttack(draft, {copy, playerId, oppId, attacker, defender, defenderView, ...})`:
  1. `copy.condition` → build `buildServerAttackContext` and return false when unmet (no prompt,
     no `attackCopyNothing`; the attack then does only its own text and the turn ends).
  2. `ownDeckTop` → pop own deck top into discard + `cardsDiscarded` event (even when it is not
     copyable); keep the card ref for candidates.
  3. existing oppDeckTop reveal + candidates.
  4. `copy.auto && candidates.length === 1` → call `resumeCopiedAttack` with selection `[1]` and
     return true (no pendingChoice).
- Attack case (:7201): the existing single-flip `copy.coinGate` handling is unchanged.
- `flipAndResolveAttack` entry: write `draft.players[playerId].lastAttack` from its `attack`
  argument (copied attack when copied), `isGx: isGxAttack(attack)`, `attackerName`,
  `attackerInstanceId`, `turnNumber: draft.turn.number`.

### attack-conditions.mjs
Two CLAUSES entries (both positive polarity):
- `^you have no cards? in your hand$` → `{kind:'handCount', op:'eq', n:0}` (Thievul).
- `^your opponent has exactly (\d+) prize cards? remaining$` → `{kind:'opponentPrizes', op:'eq',
  n:N}` (Nihilego; the comment at :447 said these stay ungated until added).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no candidates (any source) | `attackCopyNothing`, own text only, turn ends | [x] covered: `attack: a copy with nothing to copy…`, `attack: Team Rocket's Mimikyu…`, `attack: a last-turn copy does nothing…` |
| 2 | unknown/malformed wording or clause | `parseCopyAttack` null; attack stays as today (no wrong copy) | [x] covered: `parseCopyAttack: design 039 residual wordings` (Misty null), `parseCopyAttack: Encore and non-copy texts…`, `unknown, empty and non-gating text return null` |
| 3 | condition false (Thievul/Nihilego) | no prompt; Nihilego emits `attackConditionFailed` + turn ends | [x] covered: `attack: Thievul Skill Thief…`, `attack: Nihilego Nightcap…`, `design 039: empty-hand and exact-Prize clauses gate` |
| 4 | coin gate fails (tails) | no prompt; `endTurnAfterFailedAttack` (existing path) | [x] covered: `attack: Smeargle Trace flips first…` |
| 5 | Slowking empty deck | no discard, no copy, turn ends | [x] covered: `attack: Slowking with an empty deck…` |
| 6 | Slowking top card has a Rule Box | discarded, no copy | [x] covered: `attack: Slowking discards a Rule Box top card…` |
| 7 | last turn had no attack / a GX attack (Mimikyu) / a copy wording | no candidates, attack does nothing | [x] covered: `attack: Mimikyu Copycat ignores a GX…`, `attack: a last-turn copy does nothing…`, `attack: a last-turn copy ignores an attack that was itself a copy` |
| 8 | unevolved attacker (previous Evolutions) | no candidates | [x] covered: `attack: previous-Evolution copies find nothing…` |
| 9 | filters (tera/dark) match nothing | no candidates | [x] covered: `attack: Team Rocket's Mimikyu…` (plain defender), `attack: Dark Hypno…` (only Dark offered) |
| 10 | resume after pendingChoice | candidates carried in the resumeToken; new sources resolved once at offer | [x] covered: `attack: a copied attack's before-damage prompt resumes…` |
| 11 | `auto` with 1 candidate | copied attack resolves without a prompt | [x] covered: `attack: Mimikyu Copycat reuses the opponent's last-turn attack…` |
| 12 | extra turns (turn numbers don't alternate) | last-turn condition false — documented limitation | [x] reasoning only: `lastTurnAttackCandidates` compares `turnNumber === currentTurn - 1` |
| 13 | hidden info | oppDiscard / lastAttack are public; no new leaks (viewFor untouched) | [x] covered: view-leak assertion in `attack: Mimikyu Copycat reuses…` |
| 14 | repeated flip entry (Glimwood re-flip) | a re-flip resumes in the effect phase, not `flipAndResolveAttack`, so `lastAttack` is written once and not rewritten (same attack either way) | [x] covered: `attack: a Glimwood Tangle re-flip keeps the copied attack` + reasoning |

## Test plan
- Parser: extend `shared/engine/__tests__/attack-copy.test.mjs` with one case per fixed wording
  (exact spec), plus null guards (Encore, "can't use that attack", non-copy coin text).
- Execution: new `shared/engine/__tests__/attack-copy-residuals.test.mjs` — old defending copy
  (no energy gate) vs Mew Star (energy gate), oppDiscard, coin Bench (tails/heads), 3-coin gate
  (seeded both ways), Tera filter, Dark-name self-exclusion, Thievul/Nihilego conditions,
  previous evolutions, Slowking (normal/Rule Box/empty deck), last-turn (auto, none, GX).
- Regression: `attack-copy.test.mjs` green unchanged; `node --test` on touched files; `pnpm test`
  once before close.
- Gates: `pnpm audit:attacks` (expect no baseline diff), `audit:oracle`, `audit:abilities`,
  `audit:trainers` (reduce.mjs attack path changed).
- Manual: n/a — headless engine, no UI change; tests exercise full `applyCommand` sequences.

## Migration / rollout
n/a: no persisted data or migration. `lastAttack` absent on old states reads as "no attack last
turn". Revert = revert the branch (no schema, no corpus change).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Parser: T1–T6 + base oppInPlay + prefix peel; reduce: ownInPlay/oppDiscard + tera/darkName/excludeSelf filters | parser table + execution tests for the 10 slice-1 cards; `attack-copy.test.mjs` green |
| 2 | Conditions: 2 CLAUSES entries + `copy.condition` in `offerCopiedAttack` | Thievul/Nihilego tests; attack-conditions tests |
| 3 | Sources: `ownEvolutionStack` (T7/T8) + `ownDeckTop` discard flow (T9) | Incineroar/Charizard/Slowking tests |
| 4 | `lastAttack` + T10 + `auto` | Mimikyu/Sudowoodo tests; full suite + 4 gates |
| 5 | Verify/review/close: I181 deferrals, design shipped, DECISIONS, journal, STATE | Done checklist |

## Deviations (Builder appends here during build)
- **Misty's Psyduck ESP deferred** (Options 4 struck, `coinGateFlips` dropped): it already passes
  `audit:attacks` (1-head draw / 2-head damage), so `peelCopyPrefix` fails closed on multi-coin
  gates instead of hijacking the attack. I181 now tracks 5 deferrals, I168 closes with 17 fixed.
- **No separate base `oppInPlay` template**: Thievul's copy body already matched the pre-existing
  Hypno/Zoroark template; the planned duplicate was removed as dead code.
- **Edge row 14 corrected**: a Glimwood re-flip resumes in `resolveAttackEffectPhase`, never
  re-entering `flipAndResolveAttack`, so the `lastAttack` write runs once per attack.
- **Review fixes**: Slowking's deck-top discard routes through `discardCardToPlayerZone` (Prism
  Star → Lost Zone, App. 17); added the empty-deck, copy-wording and view-leak tests; dropped the
  unused `defenderView` parameter.
