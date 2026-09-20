# Card Parsing & Audit Guide (Attacks, Abilities)

Practical guide for extending and verifying the attack/ability parsers. Based on the
full-corpus work in S207–S211 (`out/pokemon-attacks-abilities-audit.md`).

## 1. The two layers

| Layer | Attacks | Abilities |
|---|---|---|
| **Classify** (card/text in → one family out) | `classifyAttackEffect` in `shared/engine/rules/attack-effects.mjs` | `classifyAbility` in `shared/engine/rules/ability-effects.mjs` |
| **Parse** (text in → structured steps out) | `parseAttackDamage` in `shared/engine/rules/damage-parser.mjs` | `parseAbility` in `shared/engine/rules/abilities.mjs` |

Both are **announce-only**: they recognize and describe effects; they never mutate
game state. Do not silently add execution — that needs its own decision + user sign-off.

## 2. Golden rules

1. **Primary mechanic wins.** Classifiers are order-sensitive (`FAMILY_ORDER`): first
   match returns. Put specific predicates before broad ones; keep a catch-all
   (`passive` / `flat`) last.
2. **Parsers are additive.** `parseAbility` pushes *every* matching step and only uses
   the `passiveAbility` fallback when nothing matched. Adding a branch cannot "steal"
   from an existing branch — but it can add a wrong extra step, so keep predicates
   narrow.
3. **Continuous steps are passive.** Add continuous/triggered step types to
   `PASSIVE_ABILITY_STEP_TYPES` in `shared/engine/rules/ability-step-plan.mjs` so
   orchestration skips them instead of announcing them as usable actions.
4. **Never regress a correct row.** Before landing a batch, diff old-vs-new
   classifications per card and inspect every transition (see §4).
5. **Word boundaries matter.** `remove` contains `move`; `attached` contains `attach`.
   Use `hasWord(t, 'move')` or `\bmove`. Attack side: `/\bmove \d+ damage counters/`
   so "Remove N damage counters" stays `heal`.
6. **Normalize wording variants.** Text is lowercased with curly quotes → straight.
   Watch plurals (`Poké-Bodies` vs `Poké-Body`, `abilities` vs `ability`), ASCII
   (`Poke-`/`Pokemon`), and `his or her`/`their`/`your`.
7. **Context beats keywords.** "discard **from your hand**" is a cost; "play this
   Pokémon **from your hand** … discard" is not. "attached **to this Pokémon**" is
   state, not "move counters to this Pokémon".

## 3. Where things live

```
shared/engine/rules/
  attack-effects.mjs        classifyAttackEffect, ATTACK_FAMILIES, describeAttackEffect
  damage-parser.mjs         parseAttackDamage
  abilities.mjs             parseAbility, describeAbilityStep
  ability-effects.mjs       classifyAbility, ABILITY_FAMILIES, describeAbilityFamily
  ability-step-plan.mjs     PASSIVE_ABILITY_STEP_TYPES, planAbilitySteps
  __tests__/rules-extended.test.mjs   all regression tests
scripts/
  scrape-pkmncards.mjs      rebuild out/pkmn-pokemon-cards.json (network)
  audit-all-pokemon.mjs     split → parse → classify → engine-run → gap report
out/
  pkmn-pokemon-cards.json   corpus (6098 printings)
  pokemon-attacks-abilities-full-audit.txt   grouped gaps + family tables
  pokemon-attacks-abilities-audit.json       gap rows + engine results
```

**Special energy** follows the same two-layer pattern in
`shared/engine/rules/special-energy-parse.mjs` (`parseSpecialEnergyEffects` →
structured steps; pure `getSpecialEnergy*` execution helpers). Audit:
`scripts/audit-all-special-energy.mjs` over `out/pkmn-special-energy-cards.json`
(scraped by `scripts/scrape-pkmncards-special-energy.mjs`); it must report
`unrecognized 0`.

## 4. Workflow

```bash
# 1. Baseline
node scripts/audit-all-pokemon.mjs      # prints attacks/abilities/gaps/engineFailures

# 2. Inspect the gaps (grouped, full text)
#    read out/pokemon-attacks-abilities-full-audit.txt
#    for per-card rows / exact texts use out/pokemon-attacks-abilities-audit.json
```

3. **Design the batch**: group gap texts by mechanic. Add one step type per distinct
   mechanic (not per card) and one family per distinct classification.
4. **Implement**:
   - parser: add a narrow branch before the passive fallback;
   - classifier: add predicate + family + `FAMILY_ORDER` slot + `describeAbilityFamily`
     case (attacks: `ATTACK_FAMILIES` + `describeAttackEffect`);
   - continuous step types → `PASSIVE_ABILITY_STEP_TYPES`.
5. **Re-run the audit**; expect the gap count to drop by exactly the batch size.
6. **Steal check** (the important step). Write a throwaway script that:
   - splits the corpus with the audit's splitter,
   - classifies every entry with the **old** module (copy the file to temp before
     editing) and the **new** module,
   - prints transition counts `old -> new` plus one sample text per transition.
   Inspect every transition: intended re-bucketing is fine; a correct family changing
   to a wrong one is a bug — tighten the predicate or move the family in
   `FAMILY_ORDER`.
7. **Test** in `rules-extended.test.mjs`: one parse test (representative texts per new
   step type), one classify test (family per cluster), and one **no-steal guard** test
   asserting the near-miss texts keep their old families.
8. **Full verification**:

```bash
node scripts/audit-all-pokemon.mjs   # gaps 0, engineFailures 0
pnpm test                            # full suite
npx eslint --rule "linebreak-style: off" --rule "prettier/prettier: off" \
  shared/engine/rules/abilities.mjs shared/engine/rules/ability-effects.mjs \
  shared/engine/rules/ability-step-plan.mjs shared/engine/rules/attack-effects.mjs
```

9. **Harness**: add a `DECISIONS.md` line, close/update `ISSUES.md`, rewrite
   `STATE.md`, append a `journal/2026-09.md` entry.

## 5. What counts as a "gap" in the audit

- attack: `classifyAttackEffect` returns `unknown`, or `flat` while printed effect
  text is longer than 8 chars;
- ability: `classifyAbility` returns `unknown`, or `parseAbility` returns only
  `[passiveAbility]` for text longer than 30 chars;
- any throw from `parseAttackDamage` / `parseAbility`;
- engine run: `applyCommand({type:'attack'|'useAbility'})` returns an error/throws.

## 6. Gotchas found the hard way

- `isEffectPrevent` must check `abilities`/`has no abilities` and plural
  `Poké-Bodies`/`Poké-Powers` — `ability` does not match `abilities`.
- `discard-cost` must be ordered **after** `attach`/`cost-discount`/`damage-reduce`
  so triggers and cost cards keep their families.
- `attack-cost` after `cost-discount`; otherwise every "ignore Energy in the attack
  cost" discount card re-buckets.
- `status-recover` must exclude `heal` and `damage counter` wording, or heal+cure
  cards change family.
- Move-damage/to-this patterns need a `from` + `move` context, or any
  "attached to this Pokémon" text matches.
- Attack side: `first-turn-attack` is checked last before `flat`; a deck-search
  clause on the same attack wins.
- Empty scraped text (e.g. Dunsparce) classifies `passive`; the splitter skips
  static card-text clauses with no `→`/`⇢` header.

## 7. Cheatsheet

```bash
node scripts/audit-all-pokemon.mjs        # gap metric + reports
node --test shared/engine/rules/__tests__/rules-extended.test.mjs   # fast loop
pnpm test                                 # full suite (2188+)
```
