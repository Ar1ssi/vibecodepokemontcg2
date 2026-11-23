# 091: Engine support for the customhb gap drafts
Status: shipped (approved by user 2026-11-23: "go ahead")
Date: 2026-11-23 · Session: customhb sort / gap research

## Problem
The 36 draft cards in `.agent/scratch/customhb-card-drafts.md` (gap research for the Homebrew set) were
run through `scripts/custom-sets/engine-check.mjs`. Some drafts do not play as written. The user asked for
engine support for every draft that fails, before the cards are added through cardback. Each fix is a
general wording rule, so later cards that use the same wording work too.

## Constraints
- Card text is looked up, never recalled (CLAUDE.md directive 7). Model rows used here: Reversal Energy
  (Paradox Rift 266), Capture Energy (Darkness Ablaze 201), Therapeutic Energy (Paldea Evolved 193),
  Po Town (Burning Shadows 121), Lost City (Lost Origin 161), Comfey Flower Selecting (Crown Zenith GG14),
  all from `out/pkmn-*-cards.json`.
- Homebrew features are keyed on card text or names, never on numbers (D252).
- No schema, netcode or UI change. The Lost Zone is already a synced zone.
- An engine change ships with a test that fails without it, and `pnpm audit:oracle` runs at the landing.

## Current state (read this session)
- `shared/engine/rules/special-energy-parse.mjs`: `parseProvision` splits the text into sentences at every
  `.`, so a "(Pokémon ex, Pokémon V, etc. have Rule Boxes)" reminder cuts a provide clause away from its
  condition. Printed Reversal Energy only works through the name table (`/^reversal energy$/`).
  `ATTACH_SEARCH_RE` requires ", search" right after the attach clause, so ", you may search" (Rally) is
  dropped. Therapeutic's immunity is one fixed sentence (Asleep, Confused, Paralyzed). Attach restrictions
  know Team Rocket's but not other owners (`RESTRICTION_HOSTS`).
- `shared/engine/rules/damage-parser.mjs`: "for each X" units count Team Rocket's Pokémon in play, but not
  any other owner. `attack-damage-context.mjs` already passes `benchNames` and `ownInPlayNames`.
- `shared/engine/rules/attack-conditions.mjs`: the "damaged Bench" clause reads only "your Benched Pokémon
  have any damage counters on them".
- `shared/engine/rules/attack-steps.mjs`: the `atkLookTopTake` template reads "put the other cards in the
  Lost Zone" (plural only). Printed Comfey and the draft Morelull say "the other card".
- `shared/engine/rules/stadium-effects.mjs` `isStadiumTriggered`: matches "from their hand to evolve" only.
  The reducer trigger (`stadium-triggers.mjs` `stadiumOnEvolveTriggers`) already reads "his or her".
- `scripts/custom-sets/engine-check.mjs`: sends Stadiums to `parseTrainerEffect`, which cannot read Stadium
  text, so every Stadium the Stadium layer handles (Lost Shrine, Proving Grounds) is reported as
  "unrecognizable". `scripts/audit-all-trainers.mjs` already routes Stadiums away for the same reason.
- Checked as false positives (no engine change): Altaria and Ditto use copy wordings with runtime tests
  (`attack-copy.test.mjs` Apex Dragon; Cross Fusion Strike for the `ownBench` source). Gholdengo's "draw until
  you have 4" shows no effect because the oracle harness deals a 5-card hand (draw-until-6 runs).

## Options
1. Underdog's lost condition. A: add a name-table row per card (how Reversal works). B: stop splitting
   sentences after "etc.". Pick B: every reminder-text card gets its condition, and there is no table to grow.
2. Owner families (Ranger's). A: a new card field for tags (schema change). B: read the owner from the name
   prefix, the way search already does (`search-match.mjs` OWNER_KIND). Pick B: no schema change, and the
   same rule as searches.

## Design
- `parseProvision`: split on `(?<!\betc)\.\s+`. A sentence then keeps its reminder parenthetical.
- `ATTACH_SEARCH_RE`: `${ATTACH_TO}, (?:you may )?(search your deck for …)`. The search already allows 0 picks.
- Immunity: `HOST recovers from being <list> and can't be affected by those special conditions` with a list
  of any status words ("asleep, confused, or paralyzed", "burned and poisoned"). This replaces the fixed
  Therapeutic sentence.
- Attach restriction: after the named kinds, `/can only be attached to (?:a |an )?(.+?)'s pokémon/` gives
  `{ kind: 'owner', owner }`. `RESTRICTION_HOSTS.owner` checks that the host name starts with `<owner>'s `
  (case-insensitive). Team Rocket's keeps its own kind.
- Damage units: after the Team Rocket's row, `/^(.+?)'s pok[ée]mon (on your bench|in play)/` counts
  `ctx.benchNames` or `ctx.ownInPlayNames` entries starting with `<owner>'s `. With the names missing from
  ctx, the count is unresolved (the existing honest-note path).
- Damaged-Bench clause: `^(?:any of )?your benched (?:\{x\} )?pokémon have (?:any )?damage counters on them$`.
- Look-top template: `put the other cards? in the lost zone`.
- `isStadiumTriggered`: `from (?:their|his or her) hand to evolve`.
- engine-check: a Stadium is a gap only if `classifyTrainer` finds one AND
  `hasRecognizedPassiveStadiumEffect(card)` is false AND `isStadiumLostCity(card)` is false.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Rally attached with a full Bench, or no Basic with 70 HP or less in the deck | Search finds nothing, deck shuffled (existing `max === 0` path) | [x] covered: special-energy-homebrew-drafts "you may search" (plan); empty-match path is the existing `max === 0` branch |
| 2 | Underdog while ahead or tied on Prizes, or on a Basic / ex host | Provides only {C} | [x] covered: special-energy-homebrew-drafts Underdog (condition `trailingPrizesEvolutionNoRuleBox`, runtime shared with Reversal) |
| 3 | Remedy on a Pokémon already Burned | Status is cleared and later Burns do not stick (statusImmunity path) | [x] covered: special-energy-homebrew-drafts listed immunity (getSpecialEnergyStatusImmunity) |
| 4 | Ranger Energy on "Team Rocket's" or "Rangers Pikachu" | Restriction fails, so the card is discarded | [x] covered: special-energy-homebrew-drafts owner restriction |
| 5 | Luxio with an empty Bench | +0 | [x] covered: homebrew-drafts-attacks Capture Spark (empty Bench → 30) |
| 6 | Druddigon with only the Active damaged | No bonus | [x] covered: homebrew-drafts-attacks Grudge Strike |
| 7 | Morelull / Comfey with 1 card in the deck | That card goes to hand, nothing to the Lost Zone | [x] covered: homebrew-drafts-lost-zone-stadiums 1-card deck |
| 8 | "etc." split change on existing Energy | Every existing provide parse unchanged (full special-energy tests + audit:oracle) | [x] covered: all 240 printed + customhb Special Energy parse identically (scratch diff); special-energy suites green |
| 9 | Stadium the engine cannot read | engine-check still reports it | [x] covered: scripts/custom-sets/__tests__/engine-check.test.mjs |

## Test plan
Unit tests next to each parser (`node --test`), one per change, each failing before its change. Then
`pnpm test:changed`. At the landing: `TEST_BASE=origin/main pnpm gates`, plus `pnpm test` and `pnpm audit:oracle`
when it says REQUIRED.

## Migration / rollout
n/a: parser-only changes; revert is a git revert of the slice commits.

## Work plan
| Slice | Files | Change | Test cases | Green when |
|---|---|---|---|---|
| 1 | special-energy-parse.mjs + test | split, may-search, immunity list, owner restriction | Underdog cond `trailingPrizesEvolutionNoRuleBox` count 2; Rally `onAttachSearch` what `Basic Pokémon ≤70 HP`; Remedy immunity [Burned, Poisoned]; Therapeutic unchanged; Ranger Energy restriction owner `ranger`; host `Ranger's Luxio` ok, `Pikachu` fails | special-energy tests pass |
| 2 | damage-parser.mjs, attack-conditions.mjs + tests | owner count, damaged-Bench clause | Luxio 30+30×2 = 90 with 2 Ranger's on Bench; Druddigon 60→150 with a damaged Bench, 60 without | damage tests pass |
| 3 | rules/attack-steps.mjs, stadium-effects.mjs + tests | singular Lost Zone rest, his-or-her evolve | Comfey wording → atkLookTopTake rest lostZone; isStadiumTriggered(Proving Grounds) true; isStadiumLostCity(Lost Shrine) true | tests pass |
| 4 | scripts/custom-sets/engine-check.mjs + test | Stadium routing | Lost Shrine / Proving Grounds no finding; an unreadable Stadium still a finding | tests pass |

## Deviations (Builder appends here during build)
- Slice 1: Underdog also needed the condition read from a leading "If …," clause before "provides", and the
  Prize clause checked before "Evolution Pokémon" in `provisionCondition` (same intent, one more rule).
- Slice 2: the owner count lives in the shared `scaling-count.mjs` `pokemonMatcher` (it runs before the
  damage-parser chain), so it also covers "in play" and opponent units.
- Slice 4: `scripts/lib/attack-behaviour.mjs` read "… Pokémon on your Bench" (a count) as a Bench placement;
  no printed placement uses that phrase (corpus scan), so it is excluded there.
