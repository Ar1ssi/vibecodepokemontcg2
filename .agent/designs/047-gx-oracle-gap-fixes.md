# 047: GX oracle gap fixes

Status: draft (needs user approval — engine-rule changes)
Date: 2026-09-26 · Session: S316

## Problem

The new GX-scoped oracle audit (`scripts/audit-gx-oracle.mjs`, report `out/gx-oracle-audit.txt`)
runs all 604 GX printings through the engine: 0 engine errors, but 503 entries show no state change —
289 of them GX attacks. Verified samples are not oracle blindness: `Tapu Lele-GX Energy Drive`,
`Mewtwo-GX Full Burst`, `Espeon-GX Psychic`, `White Kyurem-GX Raging Blade`, `Drampa-GX Berserk`,
`Eevee-GX Joy Maker-GX`, `Palkia-GX Zero Vanish-GX` and `Articuno-GX Cold Crush-GX` all compute the
printed base and silently drop their printed effect. The gaps are shared wordings, so each fix covers
many printings across sets, not just GX.

## Constraints

- `shared/engine/rules/*` is pure and DOM-free; every behavior change ships with a `node --test`
  test that fails without it (CLAUDE.md code standard).
- The oracle gate ratchets per-family observed rates (`scripts/oracle-baseline.json`); no family may
  drop. A deliberate baseline update must be its own commit with the reason.
- No new dependency. No netcode/UI; visual checks not applicable.
- Missing context counts keep the existing "unresolved note, no damage change" convention — never
  guess a count of 0 (`damage-parser.mjs:154-168`).
- Engine changes land only after a `review.md` pass from an agent that did not write the diff
  (CLAUDE.md delegation policy).

## Current state

- Audit loop: `scripts/audit-gx-oracle.mjs` (new) → `oracleCorpus` (`scripts/lib/oracle-harness.mjs:400`)
  over `out/pkmn-gx-cards.json` → `rowObserved` classification (`scripts/lib/oracle-gate.mjs:27`) →
  report `out/gx-oracle-audit.txt`, rows `out/gx-oracle-rows.json`, ratchet
  `scripts/gx-oracle-baseline.json`. 23 s per full run, 8 seeds.
- Damage scaling: `parseAttackDamage` branch `damage-parser.mjs:218` matches only
  `number of energy|× the number|\* the number`; the scope resolver for "for each …" is
  `damage-parser.mjs:238-360`. GX prints say "times the amount of", so they fall through. Branch
  `:384` handles per-HP, `:439-462` evaluates conditional bonuses via `evalCondition` (`:86-130`),
  which knows HP/stage/`is damaged`/ex/Stadium/hand-discarded but not self damage counters,
  defender damage counters, damaged Bench, or hand parity.
- Attack steps: `attack-steps.mjs:397` `atkRecover` requires a card-kind word ("Put 3 cards …" fails);
  `:292-318` discard-opponent-Energy covers active/any/each but not "both Active"; `:530`
  `atkShuffleOppActiveEnergy` has no "each of your opponent's Pokémon" scope; `:535-559` counter
  placement has "each" forms but no "in any way you like" choose-target form (the reducer's
  `attackTargetClause` consumer already supports distributable counters, `reduce.mjs:462-478`).
- Oracle accuracy: `BASE_TAGS` (`oracle-gate.mjs:9-20`) hides a zero-damage attack's whole effect when
  the only tags are base — prize-taking (`Kartana-GX Blade-GX`, events prove `prizesTaken`),
  opponent Energy discard (`Lycanroc-GX Crunch`, `Umbreon-GX Dark Call-GX`, `Mewtwo-GX Psycrush-GX`;
  events prove `cardsDiscarded`), and choice-target damage that auto-picked the Active
  (`Alolan Ninetales-GX Ice Blade`, `Garchomp & Giratina-GX Linear Attack`, `Alolan Persian-GX
  Stalking Claws-GX` — `attackTargetClause` parses and `damageUpdated` fires, but `opp:active+dmg`
  is a base tag and `dealt` only tracks the main hit).
- Context fields already available: `energyCount`, `ownEnergyCount`, `opponentEnergyCount`,
  `attackerDamage`, `defenderDamage`, `damagedBenchCount`, `ownHandCount`, `opponentHandCount`
  (`attack-damage-context.mjs:164-184,241`). No typed Energy counts (Dragon Break needs one).

## Options

- A — fix only the GX printings that report no-effect, ad hoc: lowest effort, but duplicate wordings
  return next audit and the global corpus keeps the same gaps.
- B — fix the shared mechanisms (scaling resolver, `evalCondition`, step regexes) and use the GX
  audit + `pnpm audit:oracle` as the ratchet. One change covers many printings.
- C — engine-fix nothing; only make the oracle honest (accuracy slice) and file the rest as issues.
- Pick: **B, with slice 1 = C** — make the audit honest first (so the worklist is trustworthy),
  then fix mechanisms in printing-count order. Full-corpus families stay green because every fix is
  additive coverage, and the ratchet catches accidental drops.

## Design

### Slice 1 — audit honesty (no engine change)

- `scripts/lib/oracle-harness.mjs`: in `runOnce` also record `oppDamageDelta` = sum of opponent
  damage after − before (snapshot already tracks per-card damage). Exposed per row.
- `scripts/lib/oracle-gate.mjs` `rowObserved` for `kind === 'attack'`:
  - if `printedBase === 0` and `oppDamageDelta > 0` → observed (choice-target/counter damage);
  - if `printedBase === 0` and (`eventTypes` includes `prizesTaken` or `cardsDiscarded`) → observed
    (prize/Energy effects are the attack's whole effect when nothing was dealt).
  Damaging attacks keep today's base-tag rules unchanged.
- `scripts/audit-gx-oracle.mjs` reports the new `oppDamageDelta` per row; regenerate and commit both
  baselines (`scripts/oracle-baseline.json`, `scripts/gx-oracle-baseline.json`) in this commit.

### Slice 2 — "times the amount of" scaling + scopes

- `damage-parser.mjs`: extract the `unit`→count chain (`:238-360`) into `scalingCount(unit, ctx)` and
  have the `:218` branch accept `does N [more] damage times the (amount|number) of <unit>` with the
  existing semantics `total = isMore ? base + N*count : base * count`. Add scopes:
  - `energy attached to both active pokémon` → `(energyCount ?? null) + (opponentEnergyCount ?? null)`
    (null if either is unknown);
  - `basic {g} and basic {l} energy attached to your pokémon` → new ctx field `ownBasicEnergy`:
    array/map of basic-Energy types attached to your in-play Pokémon, built in
    `attack-damage-context.mjs` where `ownEnergyCount` is computed; missing → null.
- Covered printings (expected on the audit board): Energy Drive 20→320, Full Burst 30→240,
  Espeon-GX Psychic 60→300, Dragon Break 30→120, Dark Pulse/own-scope and opponent-scope variants.

### Slice 3 — minus scaling per damage counter

- `damage-parser.mjs`: `does N less damage for each <unit>` → `total = max(0, base - N*count)`.
  Unit `damage counter on this pokémon`: add explicit `attackerDamageCounters` ctx field in
  `attack-damage-context.mjs` (today `attackerDamage` is damage points, `:172`, while tests treat it
  as counters — do not repurpose; add the counter field and use it here). Vileplume-GX Massive Bloom
  180→150 on the audit board.

### Slice 4 — `evalCondition` coverage (conditional-damage bonuses)

- `damage-parser.mjs:86`: add branches, each returning `null` when its ctx field is absent:
  - `this pokémon has any damage counters on it` → `attackerDamageCounters > 0`
  - `(your opponent's active|the defending) pokémon (already )?has any damage counters on it` →
    `defenderDamage > 0`
  - `your benched pokémon have any damage counters on them` → `damagedBenchCount > 0`
  - `you have the same number of cards in your hand as your opponent` →
    `ownHandCount === opponentHandCount` (both known)
- Covered: White Kyurem-GX Raging Blade 80→160, Garchomp & Giratina-GX Calamitous Slash 160→240,
  Drampa-GX Berserk 80→150, Shiftry-GX Extrasensory 90→180.

### Slice 5 — attack step/executor coverage

- `attack-steps.mjs:397`: make the card-kind group optional so "Put 3 cards from your discard pile
  into your hand" parses to `atkRecover {count:3, what:null}` (Eevee-GX Joy Maker-GX; executor already
  handles `what:null` at `:401`).
- `attack-steps.mjs:292`: new wording `discard all energy from both active pokémon` →
  `atkDiscardOppEnergy {scope:'bothActive', count:Infinity}`; executor `effects/attack-steps.mjs:453`
  discards from own Active + opponent Active (Articuno-GX Cold Crush-GX).
- `attack-steps.mjs:530`: new wording `shuffle all energy from each of your opponent's pokémon into
  their deck` → new/extended step (scope `allOpponent`; Palkia-GX Zero Vanish-GX).
- `attack-steps.mjs:535-559`: `put N damage counters on your opponent's pokémon in any way you like`
  → `atkDamageCounters {spread:true}`; executor reuses the distributable-counter path already behind
  `reduce.mjs:462` (Espeon-GX Divide-GX, Garchomp & Giratina-GX Cross Division-GX).

### Slice 6 — triage backlog (no code)

- Write `out/gx-no-effect-triage.md`: every remaining unique no-effect text tagged
  `engine-gap | oracle-blind | harness-condition-unmet | unimplemented-subsystem`, with P-levels
  (subsystems: extra turns, hand/play locks, prize manipulation, KO replacement/conditional-KO,
  shuffle-into-deck, next-turn markers, first-turn-attack gate).
- File the engine-gap and subsystem entries as ISSUES.md lines (≤1 line each), so this design owns
  only slices 1-5.

## Edge cases & failure modes — the completeness contract; Builder ticks every row

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | ctx count field absent (null/undefined) | keep unresolved note; never change damage | [ ] unit |
| 2 | count = 0 (no Energy, no counters, empty Bench) | total = base (no NaN, no negative) | [ ] unit |
| 3 | both-active scope when opponent Active is empty or an Energy count is unknown | unresolved (null), not 0 | [ ] unit |
| 4 | type-filtered basic Energy with no matching type | 0 count → base | [ ] unit |
| 5 | coin-gated wording ("if heads … more damage") | must not enter the new branches | [ ] unit |
| 6 | "does nothing if" gate attacks | attack-condition gate still runs first (unchanged) | [ ] reduce |
| 7 | kindless recover with empty discard pile | step no-ops without error | [ ] reduce |
| 8 | discard/shuffle from both Active when own Active has 0 Energy | opponent side still executes | [ ] reduce |
| 9 | counter spread with fewer legal targets than counters | reducers's existing distributable path handles remainder | [ ] reduce |
| 10 | oracle delta counts pre-existing damage | delta, not absolute, so earlier turns don't leak | [ ] oracle run |

## Test plan

- Unit: new cases in `shared/engine/rules/__tests__/rules-extended.test.mjs` (scaling + evalCondition)
  and `shared/engine/__tests__/attack-steps.test.mjs` (step parsing/execution); run one file with
  `node --test <path>`.
- Reduce-level: `runAttackWiring` tests asserting the damage number actually changes for one card per
  slice; negative case for the unmet condition.
- Audit loop: `node scripts/audit-gx-oracle.mjs` before/after each slice; record the moved counts in
  the commit message. Expected: per-energy 33/119 → ≈100/119, conditional-damage 41/111 → ≈sizable,
  Joy Maker / Cold Crush / Zero Vanish / Divide execute, 0 engine errors stays 0.
- Gates: `pnpm test` (full, ~4260), `pnpm audit:oracle`, `pnpm audit:attacks`; `pnpm audit:abilities`
  untouched (ability steps unchanged) but run if any ability parser is touched.
- Manual: none (headless engine only).

## Migration / rollout

- n/a data migration: pure parsers, no state/schema change. Baselines are files — slice 1 commits the
  re-ratcheted `scripts/oracle-baseline.json` and `scripts/gx-oracle-baseline.json`; revert path is
  `git revert <commit>` plus restoring the baseline files.
- Order: slice 1 first, then 2-5 in any order; slice 6 anywhere. `pnpm audit:oracle` after every
  engine slice before committing.

## Work plan — slices ≤1 session, each leaving the repo green

| Slice | Delivers | Green when |
|---|---|---|
| 1 | oracle honesty (`oppDamageDelta` + `rowObserved`), re-ratcheted baselines | GX report no-effect list drops the proven false negatives; `pnpm audit:oracle` passes with new baseline |
| 2 | "times the amount of" scaling + both-active/all-yours/typed scopes | unit tests green; GX rows Energy Drive/Full Burst/Psychic/Dragon Break executed; oracle gate no drops |
| 3 | minus-per-damage-counter scaling | Massive Bloom executes (150 on board); unit + gate green |
| 4 | 4 new `evalCondition` branches | Raging Blade/Calamitous Slash/Berserk/Extrasensory execute; unit + gate green |
| 5 | kindless recover, both-Active discard, all-opponent shuffle, counter spread | Joy Maker/Cold Crush/Zero Vanish/Divide execute; unit + gate green |
| 6 | triage doc + ISSUES lines | doc committed; no code |

## Deviations (Builder appends here during build)

- Slice 5d (counter spread, Divide-GX/Cross Division-GX) needed no engine change: slice 1's
  opponent-damage delta proved the existing distributable-counter path already executes.
- Slice 1 grew a general rule: a damaging attack that discards opponent attached cards without a
  KO (`opp:attached->discard` + `cardsDiscarded`, no `ko` tag) now counts as observed — the same
  base-tag blind spot, with damage (`Lycanroc-GX Crunch`).
- Slice 6 groups the 109 remaining unique texts into 11 engine subsystems + "not a gap" classes
  (full per-row list stays in `out/gx-oracle-audit.txt`); proposed ISSUES lines are listed in
  `out/gx-no-effect-triage.md` and land with the design.
- Verified numbers after slices 1-5 (8 seeds, fixture board): per-energy 33/119 → 104/119,
  bench-damage 90/126 → 113/126, conditional-damage 41/111 → 55/111, multi-target 13/47 → 31/47,
  next-turn-lock 113/283 → 147/283; 0 engine errors. `Kaleidostorm` emits `pokemonKnockedOut` on
  the fixture (flagged in triage §7).
- Hostile review (fresh-context subagent, `workflows/review.md`) then fixed: the typed-this scope
  compared against a bracketed pattern literal (board-wide count); the generic `/energy/` fallback
  fabricated the attacker count for unreadable scopes (removed — those stay unresolved, and the
  legacy "number of Energy" fallback is kept); choose-target tails ("…to 1 of your opponent's
  Pokémon", Tropical Head) stay unresolved instead of hitting the Active; the new steps now honour
  effect-shield special Energy per Pokémon; Darkness type spellings normalised; report prints
  `Δ` target damage. Deliberate re-ratchet: per-energy GX 104/119 → 101/119 and global 484/635 →
  459/635 (fabricated counts removed — the gate correctly failed them once, baselines updated with
  this reason). ISSUES.md lines stay deferred to the landing commit (shared harness files do not
  change on a feature branch); the proposed lines are in `out/gx-no-effect-triage.md`.

---

Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"
