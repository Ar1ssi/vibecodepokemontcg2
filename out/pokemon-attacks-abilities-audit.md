# Pokémon Attacks & Abilities Full-Corpus Audit

Audit of every attack and ability printed in the linked pkmncards corpus
(`out/pkmn-pokemon-cards.json`, **6098 printings**), parsed and classified by the real
pure parsers and then run through the engine.

| Metric | Result |
|---|---:|
| Printings in corpus | 6098 |
| Attacks parsed | 8690 |
| Abilities parsed | 4228 |
| Attack gaps (unknown family / flat-with-effect-text) | **0** |
| Ability gaps (unknown family / unrecognized passive fallback) | **0** |
| Engine-run failures (throws/errors) | **0** |
| Lines not attributed to any attack/ability | **0** |

Both layers are **announce-only**: the parsers/classifiers recognize and describe every
effect, but no attack or ability effect is executed by them.

## How to reproduce

```bash
node scripts/scrape-pkmncards.mjs     # regenerate out/pkmn-pokemon-cards.json (network)
node scripts/audit-all-pokemon.mjs    # split, parse, classify, engine-run
pnpm test                             # 2188/2188
```

The audit splits each printing's text on the printed `→` / `⇢` headers, runs
`classifyAttackEffect` + `parseAttackDamage` for attacks and `parseAbility` +
`classifyAbility` for abilities, flags unknown families and unrecognized
`passiveAbility` fallbacks, then feeds every gap through `applyCommand`
(`attack` / `useAbility`) to catch execution throws. Outputs:
`out/pokemon-attacks-abilities-full-audit.txt` (grouped) and
`out/pokemon-attacks-abilities-audit.json` (rows + engine results).

## Coverage history

| Session | Work | attackGaps | abilityGaps |
|---|---|---:|---:|
| S207 | Built the corpus scraper + audit harness; first parse/classify fixes | 376 → 168 | 478 (unknown 150 → 62) |
| S208 | Ability parse expansion — 12 step types + broadenings (D79) | 168 | 478 → 199 (fallback 465 → 179) |
| S209 | Attack classifier long tail — 6 families + ~18 broadenings (D80) | 168 → 6 | 199 |
| S210 | Attack one-offs — 2 families + card-specific patterns (D81) | 6 → 0 | 199 |
| S211 | Ability long tail — ~40 step types, 18 families, predicate fixes (D82) | 0 | 199 → 0 |

## Attack classifier (`shared/engine/rules/attack-effects.mjs`)

New families: `first-turn-attack`, `effect-prevention`, `lost-zone`, `look-any-deck`,
`devolve-self`, `supporter-effect`, `move-damage-counter`, `neutralize-opponent-energy`.

Broadened families (S209): self-damage, immunity, deferred-damage, multi-target,
per-energy, move-energy, return-self, reveal-hand, next-turn-lock, next-turn-bonus,
copy-attack, conditional-ko, recover-status, bench-damage, draw-attach,
devolve-opponent, damage-prevention.

Card-specific one-offs (S210): `Harmonize`→conditional-damage (sing-a-song clause),
`Mach Wind`/`Extra Comet Punch`→next-turn-bonus, `Fire Wall`→retaliate,
`Transfer Pain`→move-damage-counter, `Unown I`→neutralize-opponent-energy.

Ordering rule: the **primary mechanic wins**. `first-turn-attack` is checked last
(just before `flat`); multi-target "each Defending Pokémon" requires a damage clause;
count→counters excludes `prize`; "Remove N damage counters" must stay `heal`
(word-boundary `\bmove`). Regression steals found and fixed while landing these:
Wobbuffet's retaliate (counter-equal rule), Shaymin Energy Bloom's heal (`\bmove`).

### Attack family distribution

| Family | Count | | Family | Count |
|---|---:|---|---|---:|
| flat | 1437 | | shuffle-cost | 46 |
| bench-damage | 850 | | draw-until | 45 |
| conditional-damage | 741 | | reveal-hand | 44 |
| next-turn-lock | 726 | | next-turn-bonus | 36 |
| per-energy | 635 | | copy-attack | 34 |
| discard-cost | 597 | | self-status | 33 |
| coin-flip | 429 | | effect-prevention | 26 |
| draw-attach | 316 | | conditional-ko | 20 |
| immunity | 243 | | return-self | 15 |
| search-deck | 217 | | recover-status | 12 |
| status-poisoned | 183 | | lost-zone | 11 |
| damage-prevention | 174 | | devolve-opponent | 11 |
| status-paralyzed | 172 | | mirror-heal | 11 |
| self-damage | 166 | | hp-cap-damage | 9 |
| multi-target | 165 | | look-own-deck | 8 |
| switch | 154 | | first-turn-attack | 6 |
| discard-opponent | 151 | | once-per-turn | 5 |
| heal | 150 | | look-any-deck | 5 |
| per-prize | 147 | | supporter-effect | 5 |
| move-energy | 135 | | deferred-damage | 3 |
| status-asleep | 135 | | return-opponent-energy | 3 |
| per-heads-coin | 133 | | devolve-self | 2 |
| status-confused | 130 | | retaliate | 2 |
| status-burned | 109 | | move-damage-counter | 1 |
| | | | neutralize-opponent-energy | 1 |
| | | | extra-by-type | 1 |

`flat` = plain damage with no printed effect text (correct); the audit only flags
`flat` when effect text is present.

## Ability parser / classifier (`shared/engine/rules/abilities.mjs`, `ability-effects.mjs`)

`parseAbility` gained ~40 step types:

- **Locks (continuous, passive):** `playLockAbility`, `evolveLockAbility`,
  `retreatLockAbility`, `powerSuppressAbility`, `damageCounterLockAbility`.
- **Energy / damage moves:** `energyOnKoAbility`, `moveOpponentEnergyAbility`,
  `energySwapAbility`; damage-to-self/opponent uses the existing move steps.
- **Self:** `transformAbility`, `returnSelfToHandAbility`, `selfBenchPlacementAbility`,
  `selfAttachEnergyAbility` (return-to-deck already existed and was broadened).
- **Deck:** `deckPeekAbility`, `deckPlaceAbility`, `lostZoneFromDeckAbility`,
  `winGameAbility`, discard→top-of-deck via `recursionAbility`.
- **Conditions:** `recoverStatusAbility`, `transferStatusAbility`.
- **Misc:** `coinFlipControlAbility`, `attackCostAbility`, `energyTypeChangeAbility`,
  `playExtraSupporterAbility`, `turnNotEndAbility`, `goFirstAbility`,
  `benchGuardAbility`, `attachRestrictionAbility`, `attachPermissionAbility`,
  `stadiumManipAbility`, `discardForDrawAbility`, `discardOpponentDeckAbility`,
  `searchDiscardAttachAbility`, `discardBenchAbility`, `resetInPlayAbility`,
  `useSupporterAbility`, `jokeAbility`.

Continuous step types are listed in `PASSIVE_ABILITY_STEP_TYPES`
(`ability-step-plan.mjs`) so the orchestration skips them instead of announcing.

`classifyAbility` gained 18 families: `copy-attack`, `energy-on-ko`,
`status-recover`, `deck-peek`, `lost-zone`, `discard-cost`, `self-attach-energy`,
`self-return`, `attach-restriction`, `attach-permission`, `energy-type`,
`attack-cost`, `coin-control`, `extra-supporter`, `go-first`, `bench-guard`,
`discard-bench`, `joke`.

Predicate fixes: `isEffectPrevent` plurals (`Poké-Bodies`/`Poké-Powers`),
`has no Abilities`, `ignore all Poké-Powers…`, `power stops working`;
`isStatus` now recognizes `paralyzed`; `isMoveDamage` / `isOpponentDisrupt` /
`isRecursion` broadenings; an ability with empty scraped text classifies `passive`
(Dunsparce).

Ordering rule: specific before broad. `discard-cost` is deliberately last (after
`attach`) so "play from your hand … discard" triggers stay `when-played`,
cost-discount and damage-reduce keep their families; `attack-cost` sits after
`cost-discount`; `status-recover` excludes heal/damage-counter wording.

### Ability family distribution

| Family | Count | | Family | Count |
|---|---:|---|---|---:|
| status | 507 | | status-recover | 38 |
| weakness | 321 | | copy-attack | 30 |
| damage-prevent | 305 | | on-opponent-evolve | 30 |
| search | 295 | | when-played | 24 |
| move-damage | 294 | | hp-bonus | 22 |
| switch | 256 | | energy-multiplier | 19 |
| opponent-disrupt | 223 | | type-change | 18 |
| draw | 219 | | end-of-turn | 17 |
| heal | 211 | | checkup | 13 |
| attach | 198 | | self-return | 12 |
| retreat-cost | 172 | | attach-restriction | 10 |
| passive | 167 | | setup | 9 |
| effect-prevent | 151 | | energy-on-ko | 9 |
| recursion | 119 | | damage-bonus | 9 |
| energy-redirect | 95 | | coin-control | 8 |
| cost-discount | 91 | | attack-cost | 6 |
| evolve | 72 | | attack-inheritance | 5 |
| look-at-top | 67 | | energy-type | 3 |
| ko-prevention | 63 | | deck-peek | 3 |
| prize-modify | 52 | | damage-reduce | 3 |
| tool-cap | 47 | | attach-permission | 3 |
| | | | self-attach-energy | 2 |
| | | | lost-zone | 2 |
| | | | discard-bench | 2 |
| | | | discard-cost | 2 |
| | | | joke / extra-supporter / go-first / bench-guard | 1 each |

## Verification

- `node scripts/audit-all-pokemon.mjs` → `printings=6098 attacks=8690 abilities=4228
  attackGaps=0 abilityGaps=0 engineFailures=0`, unattributed lines 0.
- `pnpm test` → **2188/2188** (27 regression tests added for these families, parse
  branches and no-steal guards).
- `npx eslint --rule "linebreak-style: off" --rule "prettier/prettier: off"` clean on
  `abilities.mjs`, `ability-effects.mjs`, `ability-step-plan.mjs`, `attack-effects.mjs`.
- Every batch was validated with an old-vs-new per-card classification diff to prove
  no previously-correct row was stolen (e.g. `when-played` triggers, `cost-discount`,
  `damage-reduce`, `attach-restriction`, Ditto transform, Gyarados Flame Vapor).

## Notes / limits

- **Announce-only:** recognizing a family/step is not execution. Engine support for
  these mechanics remains future work; the audit's engine run only asserts that
  `applyCommand` does not throw.
- The corpus is a scrape of pkmncards.com display text; paragraph newlines are kept so
  attack/ability headers can be split from effects. Buried Fossil's static
  evolve-from-Mysterious-Fossil clause (no `→`/`⇢` header) is recognized as card text,
  not an ability.
- Decisions: D78 (type-change family), D79 (ability step types), D80 (attack families),
  D81 (attack one-offs), D82 (ability long tail).
