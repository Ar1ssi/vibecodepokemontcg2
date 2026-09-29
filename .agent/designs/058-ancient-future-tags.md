# 058: Ancient / Future tags
Status: approved (self — one-shot)
Date: 2026-09-29 · Session: oneshot paradox-tags

## Problem
Brief (verbatim): "058-ancient-future-tags.md, on branch feature/paradox-tags, one shot this feature"

The named doc was not in the repo, on any remote branch, or on disk (checked 2026-09-29), so this
design reconstructs the feature from its title (see Assumptions A1). The gap it closes: Scarlet &
Violet Paradox cards print an **Ancient** or **Future** tag, and a family of cards reads it
(Professor Sada's Vitality, Techno Radar, Reboot Pod, Awakening Drum, Ancient/Future Booster Energy
Capsule, Iron Crown ex, Iron Thorns ex). TCGdex has no field for the tag (sv04-124 Roaring Moon ex
carries only `suffix: "ex"`), so every one of those checks is false in a real game today.

## Acceptance
| # | Criterion | Evidence |
|---|---|---|
| 1 | A tagged printing (by TCGdex id, pokemontcg.io id, image URL, or set code + number) classifies as Ancient/Future; an untagged printing of the same name does not (sv01 Great Tusk ex, sv07 Koraidon) | |
| 2 | Awakening Drum draws one card per Ancient Pokémon in play on the server | |
| 3 | Professor Sada's Vitality attaches a Basic Energy from discard to up to 2 different Ancient Pokémon (Active or Bench), then draws 3 only if it attached | |
| 4 | Techno Radar searches up to 2 Future Pokémon | |
| 5 | Reboot Pod attaches a Basic Energy from discard to each Future Pokémon | |
| 6 | Ancient Booster Energy Capsule +60 HP applies only to an Ancient holder; Future Booster Energy Capsule's retreat/damage applies only to a Future holder | |
| 7 | Iron Crown ex's Cobalt Command (printed text) boosts Future attackers except Iron Crown ex; Iron Thorns ex's Initialization spares Future Pokémon | |
| 8 | Enriched client cards carry the tag in `subtypes`; `cardStats` forwards it to the server | |
| 9 | Deck builder "Special" filter offers Ancient and Future | |
| 10 | Full `pnpm test` green; trainer/ability audits not regressed | |

## Assumptions
- A1 (assumed) The feature is "make the Ancient/Future tag real everywhere the engine and builder
  read it" — the only reading of the title that the codebase gap supports; the missing doc may say more.
- A2 (assumed) Tag source = pokemontcg.io `subtypes` (it has the tag, TCGdex does not), every id
  cross-checked on TCGdex by name at generation time. Baked into a generated module (no runtime
  dependency on a second API).
- A3 (assumed) Keyed per printing, never by name: sv01 Great Tusk ex / Koraidon ex / Miraidon ex,
  sv07 Koraidon and the ME-era Koraidon/Miraidon print no tag (pokemontcg.io, 2026-09-29).
- A4 (assumed) Trainers with the tag (Earthen Vessel, Explorer's Guidance, Professor Turo's
  Scenario, Ciphermaniac's Codebreaking …) are tagged in the data too, but "Ancient/Future Pokémon"
  checks also require a Pokémon.
- A5 (assumed) The legacy (non-authoritative) client trainer path keeps its coarse attach UI (it
  ignores targets for every card); only its name-based Ancient counters are fixed. ISSUES line.
- A6 (assumed) Design number 058 as the user named it, although `claude/parse-audit-fix` also
  carries a `058-search-kind-residuals.md`; renumber whichever lands second.

## Constraints
- Shared engine is pure, no new deps, served at /shared (D4). Card classification lives in one
  place (card-classify.mjs header): the new predicates follow `isUltraBeastCard`'s pattern.
- Server authority: the server must classify from its own card fields (`id`, `src`, `set`,
  `number` from loadDeck), not only from client-sent subtypes.
- Card text from the corpus (CLAUDE.md directive 7); cited per test.

## Current state
- TCGdex detail → `ensureCardData` (rules-state.mjs) sets `subtypes: detail.subtypes || subtypesFromSuffix(suffix)`: never Ancient/Future.
- Readers: tool-conditions.mjs `hasSubtype` ('ancient'/'future' by subtype or name);
  trainer-steps.mjs `variableDraw` (subtypes text); ability-combat.mjs `attackerInCategory`
  (style loop) and the Iron Thorns exemption (`subtypes.includes('Future')`);
  attack-damage-context.mjs `isAncientPokemon` (regex on subtypes+name); client
  trainer-execution.js `countVariableDraw` and chat-buttons.js `isAncientPokemon` (card NAME).
- Parser: Sada → one attach to "1 of your Benched Pokémon"; Techno Radar → 1 "Pokémon";
  Reboot Pod → one attach to a Benched Pokémon.
- card-stats.js sends Pokémon subtypes only for Ultra Beasts.

## Options
1. Where the tag comes from. A: name list (like Ultra Beasts) — wrong, the tag is per printing (A3).
   B: generated per-printing table + resolver over every identity field a card carries. **Pick B.**
2. Where it is applied. A: only inject into `subtypes` at enrichment — server/tests/e2e cards
   without enrichment stay blind. B: a classifier every reader calls (subtypes first, then the
   table), plus injection at enrichment for UI/other subtype readers. **Pick B.**
3. Sada "up to 2": A: force 2 when possible (no decline). B: `upTo` makes attaches after the first
   optional (min 0). **Pick B** — the printed text allows 1.

## Design
- `scripts/generate-paradox-tags.mjs` → `shared/engine/rules/paradox-tags.generated.mjs`:
  `export const PARADOX_TAGS = { '<tcgdexId>': 'Ancient' | 'Future', … }` (sorted keys). Fetches
  pokemontcg.io `q=subtypes:ancient|future`, maps set ids (`sv4`→`sv04`, `sv4pt5`→`sv04.5`,
  `svp`→`svp`) and pads numbers to 3, checks each id on TCGdex (name must match after apostrophe
  normalization) and throws on drift. `--check` re-fetches and exits 1 if the file would change.
- `shared/engine/rules/paradox-tags.mjs` (pure):
  - `canonicalCardId(id)`: `sv4-86`/`sv04-086`/`SV04-86` → `sv04-086`; non-SV ids pass through lowercased.
  - `paradoxTagOf(card)`: `'Ancient'|'Future'|null`. Order: a `subtypes` token equal to
    ancient/future (case-insensitive; "Ancient Trait" does not count); then the table over
    `card.id`, ids from `card.src`/`card.image.src`/`card.imageURL`/`card.images.small|large`
    (`extractTcgdexIdFromImageUrl`), and `buildSetCardIdCandidates(card.set?.id ?? card.set, card.number ?? card.localId)`.
  - `isAncientCard(card)`, `isFutureCard(card)`; `isAncientPokemon`/`isFuturePokemon` add `isPokemonCard`.
  - `withParadoxSubtype(subtypes, card)`: returns a new array with the tag appended when resolved and absent.
- card-classify.mjs re-exports `isAncientCard`, `isFutureCard` (one import site for callers).
- Readers switch to the classifier (tool-conditions, trainer-steps variableDraw, ability-combat
  ×2, attack-damage-context, search-match `ancient|future pokémon`, client counters).
- Parser (trainer-effects.mjs):
  - Search: `search your deck for (a|an|up to N) (ancient|future) pokémon` →
    `{ what: '<Tag> Pokémon', count: N|1, destination: 'hand', upTo: Boolean(N), reveal }`.
  - Sada: `choose up to N of your (ancient|future) pokémon and attach a basic energy card from your discard pile to each of them`
    → `attachFromDiscard { energy: 'Basic Energy', target: 'up to N of your <Tag> Pokémon', count: N, distinctTargets: true, upTo: true }`
    + `draw { count: 3, requiresAttach: true }` when the text says "if you attached any energy in this way, draw N".
  - Reboot Pod: `attach a basic energy card from your discard pile to each of your (ancient|future) pokémon`
    → `attachFromDiscard { energy: 'Basic Energy', target: 'each of your <Tag> Pokémon', each: true, distinctTargets: true }`.
- Executor attachFromDiscard: `rootMatchesTarget` understands "ancient"/"future" (top card
  classifier) and treats "… of your … pokémon" without "benched"/"active" as any in-play root;
  `each` → count = matching targets at first call (stored in progress); `upTo` → continuation
  prompts use `min: 0`, and an empty selection ends the step without a skip event.
- Enrichment: rules-state `ensureCardData` subtypes = `withParadoxSubtype(...)`. card-stats.js
  forwards Pokémon subtypes when a paradox tag is present (same carve-out as Ultra Beast).
- Deck builder: MECHANIC_OPTIONS += `Ancient`, `Future`; MECHANIC_TESTS use `isAncientCard`/`isFutureCard` (Pokémon and Trainers both).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | card null / no identity fields | `paradoxTagOf` → null, no throw | [ ] |
| 2 | malformed id / src / number | null | [ ] |
| 3 | Sada with 0 Ancient Pokémon or 0 Basic Energy in discard | no attach, no draw | [ ] |
| 4 | Sada attaches 1 then declines the 2nd | draws 3 | [ ] |
| 5 | Reboot Pod: 3 Future Pokémon, 2 Energy in discard | attaches 2, stops | [ ] |
| 6 | resume after a pending choice (reconnect) | memo in context re-resolves live state (existing attach memo) | [ ] |
| 7 | same species, untagged printing (sv01-123 Great Tusk ex) | not Ancient | [ ] |
| 8 | "Ancient Trait" card | never Ancient-tagged by subtype text | [ ] |
| 9 | hidden info | tag derives from public printing; no new data crosses seats | n/a — no new event/view field |
| 10 | pokemontcg.io / TCGdex down at generation | generator throws, committed table unchanged; runtime has no network dependency | [ ] |

## Test plan
Unit: paradox-tags.test.mjs (resolver forms, per-printing negatives, Ancient Trait). Engine:
paradox-tags-engine.test.mjs — executeSteps on real parsed corpus text with cards carrying only
TCGdex ids (no hand-set subtypes): Drum, Sada, Radar, Pod; tool/ability modifiers with Booster
Capsules, Iron Crown ex, Iron Thorns ex. Client: card-stats, card-filters tests. Gates:
`pnpm test`, `pnpm audit:trainers`, `pnpm audit:abilities`.

## Migration / rollout
n/a: no stored data changes. Revert = revert the branch; the generated table is standalone.

## Work plan
| Slice | Files | Signatures & data | Test cases | Rulings | Green when |
|---|---|---|---|---|---|
| 1 | C scripts/generate-paradox-tags.mjs, C shared/engine/rules/paradox-tags.generated.mjs, C shared/engine/rules/paradox-tags.mjs, M card-classify.mjs, C rules/__tests__/paradox-tags.test.mjs | per Design | `{id:'sv04-124'}`→Ancient · `{id:'sv4-86'}`→Ancient · `{src:'https://assets.tcgdex.net/en/sv/sv05/120/high.webp'}`→Ancient · `{set:'TEF',number:'122'}`→Future · `{id:'sv01-123'}`→null · `{subtypes:['Ancient Trait']}`→null · `null`→null | pokemontcg.io sv4-124, sv5-120, sv5-122, sv1-123 | node --test green |
| 2 | M tool-conditions, trainer-steps, ability-combat, attack-damage-context, search-match; C __tests__/paradox-tags-engine.test.mjs | classifier calls | Drum with 2 Ancient + 1 untagged → draws 2 · Ancient Capsule on Roaring Moon ex sv04-124 → +60, on sv01-123 → 0 · Cobalt Command real text: Iron Hands ex sv04-070 +20, Iron Crown ex +0 · Iron Thorns ex spares Iron Hands ex | corpus rows: Awakening Drum TEF, Ancient/Future Booster Energy Capsule PAR, Iron Crown ex TEF, Iron Thorns ex TWM | test:changed green |
| 3 | M trainer-effects.mjs, executor.mjs, trainer-steps.mjs rootMatchesTarget; tests in the engine file | per Design | Sada: 2 Ancient (Active+Bench) + 2 Energy → both attach, +3 cards · Sada 1 then [] → +3 · Sada 0 targets → +0 · Radar count 2 Future only · Pod 3 Future/2 Energy → 2 attached | corpus: Professor Sada's Vitality PAR, Techno Radar PAR, Reboot Pod TEF | test:changed + audit:trainers |
| 4 | M rules-state.mjs, card-stats.js, trainer-execution.js, chat-buttons.js | withParadoxSubtype; stats.subtypes for tagged Pokémon | card-stats test: Iron Hands ex id sv04-070 → subtypes include Future | — | test:changed green |
| 5 | M card-filters.mjs + its test | MECHANIC_OPTIONS/TESTS | filter Ancient keeps sv04-124, drops sv01-123 | — | test:changed green |

## Deviations
- Slice 1: card-classify.mjs does not re-export the predicates (its header promises no imports); callers import `paradox-tags.mjs`. No `isAncientPokemon`/`isFuturePokemon`: the one caller that needs a Pokémon guard (search-match) already has `isPokemonCard`.
---
Self-approval checklist:
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior (or a written strike reason)
- [x] Interfaces fully named and typed
- [x] Slices each ≤1 session and independently green
- [x] Every slice row pinned with cited rulings
- [x] No section reads "TBD"
