# 020: Ancient-Trait parse coverage audit + Δ/θ marker support
Status: shipped
Date: 2026-09-20 · Session: S224

## Problem
The ability parser recognizes Ancient Traits only by the α/Ω markers
(`ancientTraitIn`, `shared/engine/rules/abilities.mjs`). The real Ancient-Trait
corpus (pkmncards `has:ancient-trait`, 59 printings, 10 distinct traits) also uses
the Δ (Delta) and θ (Theta) markers plus the spelled-out "Delta Wild". Those four
traits (`Δ Evolution`, `Δ Plus`, `Delta Wild`, `θ Stop`, `θ Double`, `θ Max`)
currently return `null`, so `isAncientTraitAbility` treats them as real Abilities
and a "have no Abilities" effect would wrongly suppress them (App. 23). There is
also no Ancient-Trait coverage audit — the attack/ability and special-energy
corpora each have one.

## Constraints
- Parsers are announce-only (audit guide §1). No execution changes.
- Additive parser changes only; never regress a correct classification (guide §2).
- App. 23: Ancient Traits are not Abilities; identification is by the PRINTED
  marker/name, never inferred from trigger wording (D72).
- The new audit must report zero unrecognized entries, mirroring the special-energy
  audit's `unrecognized 0` gate.

## Current state
- `shared/engine/rules/abilities.mjs`
  - `ancientTraitIn(text)` (line 93): returns `'omega'` for ω/Ω, `'alpha'` for α/Α
    or the literal phrase "ancient trait", else `null`. Misses δ/Δ, θ/Θ, and the
    spelled "Delta …" names.
  - `parseAbility(text)` (line 292): long additive chain of ~66 branches. Only the
    attach branch (line 424) and the effect-prevention branch (line 949) attach a
    `trait`; every other trait body parses untagged.
  - `isAncientTraitAbility(card)` (line 112): parses `name + text`, true when every
    step carries `trait`.
- `shared/engine/rules/stadium-effects.mjs` line 1836: `stadiumAbilityBlocked`
  skips `isAncientTraitAbility` cards — the live consumer.
- `scripts/audit-all-pokemon.mjs`: local `splitCard()` + `ABILITY_HEADER` (already
  includes "ancient trait"); the splitter is not shared.
- Corpora: `out/pkmn-pokemon-cards.json`, `out/pkmn-special-energy-cards.json`.
  The Ancient-Trait cards exist inside the pokemon corpus, but the user's exact
  search is `has:ancient-trait`.
- No `out/pkmn-ancient-trait-cards.json` and no Ancient-Trait audit exists.

## Options
- **Trait tagging — A)** universal: one `ancientTraitIn(text)` pass at the end of
  `parseAbility` tags every emitted step. **B)** add `trait` to each of the ~10
  relevant branches individually. Pick A: single source of truth, covers all 10
  traits without per-branch edits, and makes `isAncientTraitAbility`'s
  "every step tagged" invariant hold automatically. (A pre-existing subtlety: the
  two existing per-branch tags are removed, so there is exactly one tagging site.)
- **Marker set — A)** extend `ancientTraitIn` with δ/Δ and θ/Θ plus the three
  spelled Delta names. **B)** a table of full trait names. Pick A: the printed
  marker is the canonical identifier (D72), and the spelled names only matter for
  the one printing (`Delta Wild`) that omits its symbol. The literal "ancient
  trait" phrase keeps returning a truthy kind so header-bearing text still tags.
- **Audit corpus — A)** scrape the user's exact `has:ancient-trait` URL into a
  dedicated `out/pkmn-ancient-trait-cards.json`. **B)** filter the pokemon corpus.
  Pick A: matches the user's source and the special-energy precedent, and keeps the
  59-printing URL result exact.
- **Splitter reuse — A)** extract `splitCard` to `scripts/lib/split-card-text.mjs`
  and import it in both audits. **B)** duplicate the splitter in the new audit.
  Pick A: the splitter carries subtle word-boundary/header rules; duplication
  would drift. The refactor is verified by re-running `audit-all-pokemon.mjs` and
  confirming identical counts.

## Design
### `shared/engine/rules/abilities.mjs`
```
ANCIENT_TRAITS = [ ['ω','omega'], ['α','alpha'], ['δ','delta'], ['θ','theta'] ]
ANCIENT_TRAIT_NAMES = [ ['delta evolution','delta'], ['delta plus','delta'], ['delta wild','delta'] ]

ancientTraitIn(text) -> 'alpha'|'omega'|'delta'|'theta'|'ancient'|null
  1. lowercase the text (upper-case Greek lowercases to the symbols checked)
  2. return the first matching symbol kind
  3. return 'delta' for a spelled Delta trait name
  4. return 'ancient' for the literal phrase "ancient trait"
  5. else null

parseAbility(text):
  ... existing additive branches, but WITHOUT the two per-branch `trait` spreads ...
  if (steps.length === 0 && text) push passiveAbility
  const trait = ancientTraitIn(text)
  if (trait) for (const step of steps) step.trait = trait
  return steps
```
`isAncientTraitStep` / `isAncientTraitAbility` are unchanged; they now see the
four kinds.

### `scripts/lib/split-card-text.mjs` (new)
Exports `ABILITY_HEADER`, `ATTACK_HEADER`, `CARD_NOTE`, `STATIC_CARD_TEXT`,
`TYPE_SYMBOLS`, `parseCost`, `isAttackHeaderPrefix`, `parseDamageNumber`, and
`splitCard(card) -> { items, unparsed }`, moved verbatim from
`scripts/audit-all-pokemon.mjs`.

### `scripts/audit-all-ancient-traits.mjs` (new)
- Input: `out/pkmn-ancient-trait-cards.json`; de-dupe on `name + "\u0000" + text`.
- For each unique card, `splitCard` and keep entries whose `abilityType` matches
  `/ancient trait/i`. Parse `name + ' ' + body` (so the marker in the name is seen).
- Buckets: `recognized` (≥1 step and any non-`passiveAbility` step), `fallback`
  (only `passiveAbility` with body ≤30 chars), `unrecognized` (no trait detected,
  or steps only `passiveAbility` with body >30 chars, or a throw).
- Output `out/ancient-trait-full-audit.txt`: header + counts, `## By trait`
  (printings, step types), `## Unrecognized` (must be empty), `## Per-card
  description`. Exit non-zero when `unrecognized > 0` so it can gate.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty body after an Ancient-Trait header | one `passiveAbility` step, tagged with the trait | [x] covered: "a trait whose body matches no branch still tags the fallback step" + `parseAbility('θ Stop')` check |
| 2 | card with both an Ancient Trait and a real Ability | two separate entries; only the trait entry parsed/tagged | [x] covered: corpus (Celebi/Sableye) — `abilityType` filter keeps only the Ancient-Trait entry |
| 3 | spelled "Delta Wild" with no symbol | `ancientTraitIn` → 'delta' | [x] covered: `ancientTraitIn` test + all-10 test |
| 4 | marker-less wording resembling a trait | `trait` undefined; still a real Ability (D72) | [x] covered: "Trainer-prevention wording alone…" / "attach-triggered wording alone…" |
| 5 | unknown future trait name | parsed as-is; audit reports `unrecognized` (non-zero exit) | [x] covered: manual `Ω Unknown …`/`Zeta Boost` check; audit gate exits 1 |
| 6 | corpus file missing / empty | audit throws with a clear message, no partial report | [x] covered: `existsSync` / `Array.isArray` guards before any write |
| 7 | duplicate printings of one card | de-duped before counting | [x] covered: corpus 59 printings → 10 unique entries |

## Test plan
- `shared/engine/rules/__tests__/rules-extended.test.mjs`: `ancientTraitIn` maps all
  four symbols + spelled Delta Wild + null for marker-less; `parseAbility` tags
  each of the 10 trait bodies (`evolvePermissionAbility`→delta,
  `effectPreventAbility`→theta/omega, `extraAttackAbility`→omega,
  `attachAbility`→alpha, `healAbility`→alpha/theta, `toolCapAbility`→theta,
  `prizeModifyAbility`→delta, `weaknessAbility`/`damageReductionAbility`→delta);
  `isAncientTraitAbility` true for θ/Δ cards; no-steal guard keeps marker-less
  wording untagged (existing tests).
- `node scripts/audit-all-ancient-traits.mjs` → `unrecognized 0`.
- `node scripts/audit-all-pokemon.mjs` → identical counts after the splitter move.
- `pnpm test` green.

## Migration / rollout
- n/a: parser + tooling only, no persisted schema or runtime data change. Revert is
  the branch revert; the scraped corpus/report are deterministic from the URL.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Parser: extend `ancientTraitIn`, universal tagging, remove per-branch tags | new + existing rules-extended tests pass |
| 2 | Splitter extraction + `audit-all-pokemon.mjs` uses it | audit output counts unchanged |
| 3 | Ancient-Trait scraper corpus + audit script | `unrecognized 0`, report written |
| 4 | Docs + harness (guide, DECISIONS, MAP, STATE, journal) | suite green, guide documents the audit |

## Deviations (Builder appends here during build)
