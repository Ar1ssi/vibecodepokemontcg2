# Stadium full-coverage work log

Branch: `fix/stadium-effect-parsing` · PR #174 (base `main`) · session S207 (2026-09-20)

This document is the running log for the Stadium coverage pass: making every Stadium in the
corpus parse, classify, and — where the rules are executable — actually run, on both the
server-authoritative path and the legacy solo client. It records what was built, what was
verified, and what is deliberately left open.

---

## 1. Objective

The Stadium taxonomy (`docs/card-types-taxonomy.md` §E) had a long tail of cards that parsed to
"unknown", fell back to a generic (and dangerous) unrestricted search, or were recognized but
never executed. The goal was:

- **No silent mis-execution.** Remove the `kind:'search'` fallback that turned an unmodeled
  Stadium into a full unrestricted deck search.
- **Every active effect executable** through the shared resumable executor
  (`shared/engine/effects/stadium.mjs` + `executor.mjs`) and the legacy client mirror
  (`client/src/actions/chat-buttons/chat-buttons.js`).
- **Every continuous/passive effect wired** into the damage / retreat / HP / status / evolution /
  energy-payment layers where the engine already has a hook.
- **Deep mechanics** (special-energy rewrites, attack inheritance and grants, per-turn energy
  actions) executed, not just recognized.
- **Client parity**: the same attack list the server resolves is the list the player clicks.

## 2. Corpus and audit

- Audit script: `node scripts/audit-stadiums.mjs` → `out/stadium-full-audit.txt`
  (`out/` is not gitignored).
- Corpus: **268 printings / 212 unique** (name+text) Stadium cards.
- Final classification: **117 continuous-both · 67 once-per-turn · 28 unknown**.
- Final execution status: **0 active-unparsed · 0 continuous-unparsed**; the 28 "unknown" are
  cards with no recognized executable/continuous effect (reminder-text-only or unmodeled).

## 3. Foundations (batches 1–3)

- Removed the dangerous `kind:'search'` fallback; unmodeled Stadium text is now announce-only
  behind `UNMODELED_GATE`.
- Wired the search filters the corpus needs (type / symbol / "with/without a Rule Box" / Ultra
  Beast, plus the Dragon and Fairy energy symbols in `search-match.mjs`).
- Executable active families: recover-energy, draw-until, Cycling Road, heal-bench, PokéStop
  (`mill-items`), Giant Hearth / Viridian Forest (`discard-search`), coin/condition once-per-turn
  kinds, `attachFromDiscard`.
- Passive hooks: retreat modifiers, bench-limit changes, status immunity, Tool/Ability negation,
  checkup poison bonus, evolution speed (Forest of Giant Plants / Broken Time-Space), Pokémon
  Contest Hall, Fuchsia City Gym, Twist Mountain, Lysandre Labs.
- Determinism: memoized `coinFlip` so a suspended choice does not re-flip on resume.

## 4. Complex actives (7 of 7)

Tower of Darkness, Lost World, Mystery Zone, Ancient Ruins, Pokémon Park (×2), and
**Glimwood Tangle**:

- The attack effect phase was extracted to module-level `resolveAttackEffectPhase(draft, ctx)`
  (`reduce.mjs`) so an attack can suspend mid-resolution.
- Glimwood Tangle suspends with a keep (1) / re-flip (2) `pendingChoice`
  (`resumeToken.effectType:'glimwood'`); the resume branch either reuses the recorded
  `coinResult` or re-flips. The `reflip` event carries `wantsReflip`; the legacy solo client
  offers the re-flip via `window.confirm` and tracks a per-turn `glimwoodUsed` flag.
- Numeric sentinels are used because the shared `resolveChoice` shape validator rejects
  non-integer `selection` values ("selection must contain only integer instanceIds").

## 5. Deep mechanics (groups A–D)

### A — Special-Energy rewrites (Temple of Sinnoh, Crystal Beach, Holon Research Tower)

- `rewriteEnergyDescriptor()` (`energy-effects.mjs`) rewrites the descriptor **just before cost
  payment**, so every payment path sees the same pool:
  - Temple of Sinnoh → all Special Energy becomes a single `{C}`.
  - Crystal Beach → Special Energy that provided ≥2 now provides a single `{C}`.
  - Holon Research Tower → Basic Energy on a `{Delta Species}` host is tagged `dualType:'Metal'`
    and stays a single Energy unit.
- `serverEnergyDescriptor(card, { stadiumCard, hostPokemon })` applies the rewrite; it is safe as
  a `.map` callback (a numeric index destructures to no context).
- `expandEnergyEntries` / `canPayAttackCost` (`attack-engine.mjs`) understand a dual-type pool
  token (`"Fire|Metal"` = one unit that satisfies either symbol).
- Wired through the server attack/retreat cost checks, `attack-damage-context.mjs`, and the
  client `chat-buttons` attack/retreat builders.

### B/C — Attack inheritance and grants (Shrine of Memories, Meteor Falls, Holon Lake, Rocket's Tricky Gym)

- `priorEvolutionCards()` (`evolved-pokemon.mjs`) yields the Basic plus every evolution below the
  top, in stage order.
- `stadium-effects.mjs`: `stadiumInheritedAttacks` (Shrine: any evolved; Meteor Falls: Active
  non-ex only), `stadiumGrantedAttacks` (Delta Call / Feint Attack), `stadiumExtraAttacks`
  (inherited then granted, de-duped by name), and `mergeAttacks`.
- The server merges extras at all three attack lookup sites via `attackViewFor`
  (`canPerformAction`, execution, Glimwood resume), so an `attackIndex` into the merged list
  resolves on both the legality and execution paths.
- `listAttacks` / `resolveAttackContext` / `computeActionAffordances` / `buildInspectorModel`
  accept `extraAttacks`, so the panel lists and prices them.

### D — Per-turn energy actions (Ultimate Zone, Saffron City Gym, Celadon City Gym)

- `parseStadiumOncePerTurn` returns `{ kind, repeatable:true }` for the three
  "as often as … likes during his or her turn" cards.
- New executor steps `returnOwnAttachedEnergy` and `discardOwnAttachedEnergy`
  (`trainer-steps.mjs`), plus an `activeName` filter on `moveEnergyToActive`.
- `executeStadium` (`stadium.mjs`) branches for `move-to-arceus`, `return-sabrina-energy`, and
  `discard-erika-cure`.

## 6. Caveats closed

### 6.1 Client click-through for inherited / granted attacks

- New shared `stadiumExtraAttacksFromZone(stadiumCard, { zoneCards, card, isActive })`
  (`stadium-effects.mjs`) normalizes **both** render paths to the server stack shape:
  authoritative links an evolution to its Basic by `attachedTo`; the legacy board links a
  pre-evolution to the visible top by `image.relative`. It walks an attached card up to its root,
  guards a malformed (undefined) `instanceId`, and orders by stage rank.
- `rules-bridge.js` `refresh()` computes extras for the active and passes them to
  `computeActionAffordances`, so the attack button no longer dims a legal granted attack.
- `card-inspector.mjs` `resolveLiveContext` computes extras from the correct active/bench zone,
  threads them through `resolveAttackContext`, and returns them so `buildInspectorModel` renders
  them with **merged** `index` values — the inspector's `onAttack(index)` therefore sends an
  index the server resolves to the same attack.
- The legacy solo `attack()` builds an `attackSource` with the merged list and uses it at every
  re-sync point, so the chosen index resolves in solo play too.

### 6.2 Unlimited "as often as you like" Stadiums

- New `isRepeatableStadiumAction(card)` is the single gate.
- Exempted from `stadiumUsedThisTurn` in `reduce.mjs` (`canPerformAction`),
  `effects/stadium.mjs` (flag set), `stadiumActivationStatus` (the `usedThisTurn` gate), and the
  client (`stadiumEffect` gate, `finishStadiumAction`, and the mirror branch).
- Result: the three cards can be activated repeatedly in a turn and never spend the
  once-per-turn flag.

## 7. Files changed

Shared engine:
- `shared/engine/rules/stadium-effects.mjs` — all parsers/helpers above.
- `shared/engine/rules/energy-effects.mjs` — `isDeltaSpecies`, `rewriteEnergyDescriptor`.
- `shared/engine/rules/server-energy.mjs` — `serverEnergyDescriptor` rewrite hook.
- `shared/engine/rules/attack-engine.mjs` — dual-type pool tokens in
  `expandEnergyEntries`/`canPayAttackCost`; Stadium weakness/resistance in `computeAttackDamage`.
- `shared/engine/rules/attack-damage-context.mjs` — Stadium-aware `energyOn`.
- `shared/engine/rules/evolved-pokemon.mjs` — `priorEvolutionCards`.
- `shared/engine/rules/attack-window.mjs` — `listAttacks` `extraAttacks`.
- `shared/engine/rules/resolve-attack-context.mjs` — passes `extraAttacks` through.
- `shared/engine/rules/search-match.mjs` — Dragon/Fairy symbols, Ultra Beast.
- `shared/engine/reduce.mjs` — `attackViewFor`/`stadiumExtraAttacksFor`, cost-check sites,
  `resolveAttackEffectPhase`, Glimwood resume, checkup between-turns damage, Lost City,
  evolve status persistence, repeatable gate.
- `shared/engine/effects/executor.mjs` — heal/step gates.
- `shared/engine/effects/stadium.mjs` — `executeStadium` branches, repeatable flag.
- `shared/engine/effects/trainer-steps.mjs` — new energy-movement steps.

Client:
- `client/src/setup/rules/card-inspector.mjs` — extras in `resolveLiveContext`.
- `client/src/setup/rules/rules-bridge.js` — extras in `computeActionAffordances`.
- `client/src/setup/rules/action-affordances.mjs`, `card-inspector-model.mjs` — `extraAttacks`.
- `client/src/actions/chat-buttons/chat-buttons.js` — energy rewrite, heal guards, Glimwood
  re-flip, repeatable gate, merged `attackSource`.

Tests:
- `shared/engine/__tests__/stadium-execution.test.mjs` (65 tests).
- `shared/engine/rules/__tests__/rules-extended.test.mjs` (358 tests).
- `client/src/setup/rules/__tests__/card-inspector-model.test.mjs` (57 tests).

Harness:
- `.agent/STATE.md`, `.agent/journal/2026-09.md`, `.agent/DECISIONS.md` (D78),
  `.agent/ISSUES.md` (I65).

## 8. Verification

- Full suite:
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`
  → **2226 pass / 0 fail** (64 suites).
- Audit: **0 unparsed** (see §2).
- Lint bar:
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>` → only
  pre-existing errors (`document`/`requestAnimationFrame`, `no-empty`, unused imports).
  `pnpm lint` is not usable repo-wide (pre-existing CRLF/no-undef noise).

## 9. Decisions and open issues

- **D78** — one shared merge order for Stadium extra attacks (printed → inherited → granted,
  de-duped by name) across server and client, so an `attackIndex` resolves alike; and the three
  unlimited energy Stadiums are modeled as repeatable activations exempt from the once-per-turn
  flag.
- **I65** — Stadium attack *grants* are evaluated against the in-play root (the Basic), not the
  top evolution card, so an evolved Pokémon whose `{Delta Species}` / Dark / Rocket's marker is
  only on the evolution card is denied the granted attack. No corpus repro yet; fix by passing
  `topPokemonCard(zoneCards, root)` to `stadiumGrantedAttacks` on both server and client.

## 10. Known limitations

- The inspector/affordance context is `self`-oriented (`resolveLiveContext` reads
  `getZone('self', …)`); opening it on the opponent's card yields no extras. Pre-existing.
- `e2e-options.mjs` attack enumeration is printed-only (it has no Stadium card object in scope);
  it is not on the user click path.
- I65 above.
