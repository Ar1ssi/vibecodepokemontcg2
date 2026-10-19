# Rulebook 30c — Rules Engine Gap Closure Plan

Companion to `rulebook-30c-vs-rules-engine-gaps.md`. That doc lists 21 findings; this one
turns each into a concrete, testable work item with the file(s) to touch, the change, and the
acceptance test. Ordered by the gap doc's own priority order, then grouped into shippable
phases so each phase is green before the next.

## Conventions & definitions used throughout

- **Two rule paths.** The **server** path is `shared/engine/reduce.mjs` (+ `shared/engine/**`,
  `state.mjs`, `cards.mjs`, `setup.mjs`) — live when `SERVER_AUTHORITATIVE=1`. The **legacy**
  path is `shared/engine/rules/ko-flow.mjs` → `client/src/actions/chat-buttons/chat-buttons.js`
  and `client/src/setup/rules/rules-bridge.js`. A work item is tagged `[server]`, `[legacy]`, or
  `[both]`; `[deck]` means `client/src/setup/deck-builder/core/deck-validation.mjs`.
- **Tests** are plain `node --test` on `.mjs` modules. Server-engine tests live in
  `shared/engine/__tests__/` and `shared/engine/rules/__tests__/`; deck tests in
  `client/src/setup/deck-builder/__tests__/`. Every item below ships with a test that fails
  before the change.
- **Verification commands:** `pnpm test` (run the full suite) and `pnpm lint` after each phase.
- **Branch discipline** (from `CLAUDE.md`): build one criterion-cluster per commit on a single
  `feature/rulebook-30c` branch. The shared helpers in Phase 0 are the naming/classification
  contract every later item reuses, so they land first.

---

## Phase 0 — Shared classification contract (prerequisite) — ✅ SHIPPED

> **Shipped S193 (branch `feature/rulebook-30c`).** New `shared/engine/rules/card-classify.mjs`
> exports the full predicate set plus `isRuleBoxPokemon` and `prizesForKO`. `ko-flow.mjs` now
> re-exports `isExCard/isGxCard/isMegaCard/prizesForKO` and aliases `cardHasRuleBox` to
> `isRuleBoxPokemon`; `search-match.mjs` and `stadium-effects.mjs` (which drops
> `pokemonHasRuleBox`) use `isRuleBoxPokemon`; `tool-combat.mjs` re-exports/uses the shared
> predicates; `evolution.mjs` re-exports the shared Mega predicates. Test
> `shared/engine/rules/__tests__/card-classify.test.mjs` (21 cases, registered in package.json).
> **Deviation from plan wording:** `prizesForKO` was repointed from `ko-flow.mjs` in this phase
> (as the "moved out" bullet requires) rather than waiting for 2.1, so the Mega=3 mistake is
> already removed; the stale Mega=3 assertions in `rules-extended.test.mjs` were updated
> (2.1's prize-table expectations are now satisfied by `card-classify.test.mjs`). `0` behavior
> change to GX matchLoss — that stays in 1.1.

Everything from Phase 1 onward needs one place that answers "what *is* this card?" consistently.
Today three mutually-inconsistent definitions exist (`ko-flow.mjs:58` `cardHasRuleBox`,
`stadium-effects.mjs:499` `pokemonHasRuleBox`, and ad-hoc `isMegaCard`/`isGxCard`/`isVCard`
scattered in `ko-flow.mjs` and `tool-combat.mjs`). This phase makes them one.

**New module: `shared/engine/rules/card-classify.mjs`** exporting, each taking a card-shaped
object and returning a boolean unless noted:

- `isTagTeamCard` — subtype `tag team`, or name matches `/-GX$/` with an `&`/`&`-form
  (`<A> & <B>-GX`). (Gap #5)
- `isVUnionCard` — subtype `v-union` or name ends `V-UNION`. (#5, #12)
- `isPrismStarCard` — subtype `prism star`. (#11)
- `isAceSpecCard` — subtype `ace spec`. (#9)
- `isRadiantCard` — subtype `radiant`. (#10)
- `isLegendCard` — name carries the LEGEND marker / subtype `legend`. (#21)
- `isBasicEnergy` — `supertype === 'Energy'` and subtype includes `basic` (and *not* `special`). (#7)
- `isRuleBoxPokemon` — **single** rule-box definition: any of `ex, gx, v, vstar, vmax, tera,
  radiant, prism star, ace spec, tag team, v-union, legend`. (#16)
- `prizesForKO(card)` — moved out of `ko-flow.mjs` (see Phase 1 item 5), returning `3` for
  VMAX / TAG TEAM / V-UNION, `2` for ex / GX / V / VSTAR / Mega (legacy & modern) / LEGEND /
  Double Rare, `1` otherwise. (#5)

**Migration:** delete the duplicate definitions and re-point call sites — `ko-flow.mjs` and
`search-match.mjs:127-134` to `isRuleBoxPokemon`; `tool-combat.mjs`'s `isVCard`/rule-box logic
stays but delegates to `card-classify.mjs` where overlapping.

**Test:** `shared/engine/rules/__tests__/card-classify.test.mjs` — one case per subtype, plus
the tricky ones (`M Venusaur-EX` = Mega not Modern-Mega, `Lapras VMAX` ≠ `Lapras`, TAG TEAM
name fallback, V-UNION name fallback).

---

## Phase 1 — P0: outcomes that silently change who wins

### 1.1 GX knockout is 2 prizes, not match loss — `[legacy]` (gap #3)

- `shared/engine/rules/ko-flow.mjs`: `koOutcome` (`:67-70`) currently returns
  `{type:'matchLoss'}` for any GX; `handleKO` (`:107-120`) then sets `won:true`. Remove the
  match-loss branch entirely — a GX knockout flows through `prizesForKO` (already `2`).
- Update `README.md:137` ("ex → 3 prizes, GX → immediate match loss") to the correct text.
- **Test:** `ko-flow` unit test: KO a GX → `prizeCount === 2`, `won` only when that reaches 6.

### 1.2 VSTAR / GX once-per-game flags survive the turn and are independent — `[server]` (gap #2)

- **Move the flags off `player.flags`.** `advanceTurn` (`reduce.mjs:976-987`) rebuilds the whole
  `flags` object, wiping `vstarUsed`/`gxUsed`. Add a per-player, per-game object that
  `advanceTurn` never touches — e.g. `draft.players[pid].oncePerGame = { vstarUsed:false,
  gxUsed:false }` initialised in `createGameState` (`state.mjs`) alongside the flags, and also
  carried through `cloneGameState` (`state.mjs:291-301`).
- **Split the two limits.** `useVStarGX` (`reduce.mjs:3177-3187`) sets *both* flags. Give the
  command a discriminator: add `kind: 'vstar' | 'gx'` to `commands.mjs:532` `useVStarGX` shape
  (validated enum), set only the matching flag. The legality gate (`reduce.mjs:1859-1866`) then
  checks only the matching flag.
- **Test:** `shared/engine/__tests__/turn-loop.test.mjs` (or a new `once-per-game.test.mjs`):
  use VSTAR → advanceTurn → VSTAR still blocked, but a GX on a *different* card is still legal.

### 1.3 Simultaneous win detection + tiebreaker game — `[both]` (gap #1)

Largest single item. Split into two shippable slices:

**(a) Detect and represent the simultaneous case.**
- `reduce.mjs` `handleKnockout` (`:609-628`) resolves attacker-prize-win *before* victim
  no-Pokémon-loss, then unconditionally calls `setGameEnded` with one winner. Change the win
  block to compute **both** conditions first: attacker all-prizes-taken AND victim board empty.
  When both hold, call a new `setGameEnded(draft, { simultaneous: [attackerPlayerId,
  victimPlayerId], ... })` that sets `draft.turn.phase = 'tiebreak'` (not `'ended'`), records
  `draft.tiebreak = { players:[a,b], ways:{ a:[...], b:[...] } }`, and does **not** set
  `draft.winner`.
- Mirror in the legacy path: `ko-flow.mjs` `checkWinConditions` (`:89-103`) returns a single
  winner; add a simultaneous branch to `handleKO`/`checkWinConditions` returning
  `{ over:true, simultaneous:[...] }`.
- **Test:** `shared/engine/__tests__/reduce.test.mjs` — construct a KO where the attacker takes
  their last prize *and* the victim's board empties in the same `handleKnockout`; assert
  `phase === 'tiebreak'`, no `winner`.

**(b) Play the tiebreaker game.**
- Rule (p.21): sudden-death tiebreaker — first player to take a Prize card wins; all other win
  conditions still apply (deck-out, no Pokémon in play). Reuse `setupGame` (`setup.mjs`) to build
  a fresh 6-prize game for the two players, add a `firstPrizeWins: true` option; on any prize
  taken set the winner immediately.
- `setupGame` already accepts `firstPlayerId`/`rng`; the tiebreak is a *new* `setupGame` call fed
  by a `tiebreak`-phase reduce branch that intercepts `takePrize`-style commands.
- **Test:** `shared/engine/__tests__/setup.test.mjs` — tiebreak setup returns a playable state;
  `reduce.test.mjs` — first prize in tiebreak ends the game with that player as winner.

> Scope note: full tiebreak *gameplay* (a second six-prize match) is the correct rulebook reading
> but is a large UX surface in the client. If the first slice to ship is detection + a correct
> "sudden death, first prize wins" resolution without a full second mat, state that clearly in
> the PR. The reducer change (a) is non-negotiable regardless.

### 1.4 Server enforces Mega / Primal turn-end — `[server]` (gap #4)

- `requiresTurnEndOnEvolve` already exists (`evolution.mjs:387-391`) but is only called
  client-side (`move-card.js:607`). In `reduce.mjs`, in the evolve resolution path (where a
  Pokémon card is moved onto an in-play Pokémon), after the evolve succeeds: if
  `requiresTurnEndOnEvolve(evolvingCard, baseCardInPlay)` is true, call
  `advanceTurn(draft, { nextPlayerId: oppId, events })`.
- Confirm the evolve path is the same branch that currently enforces `can't evolve on the first
  turn` (`reduce.mjs:1531-1539`); the turn-end hook belongs immediately after a successful
  evolve there.
- **Test:** `shared/engine/__tests__/evolved-pokemon.test.mjs` — evolving a legacy `M Venusaur-EX`
  (no Spirit Link) advances the turn; with a matching Spirit Link it does not; a modern
  `Mega Venusaur ex` does not trigger the turn-end.

---

## Phase 2 — P1: prize counts and stage classification (feed setup / mulligans / win detection)

> **Shipped S195 (branch `feature/rulebook-30c`).** 2.1 was already satisfied by Phase 0
> (`card-classify.test.mjs` prize table); no code needed. 2.2 added `vunion`/`restored`/`break`
> to `NON_BASIC_STAGES` (`cards.mjs`). 2.3 replaced the in-loop mulligan bonus with
> `mulliganBonusDraws()` (net per-pair difference). 2.5 rejects Restored/BREAK/V-UNION in
> `canPlayPokemonFromHand` and mirrors Basic-only play in the reducer's `moveCard` legality gate.
> 2.6 added a `BREAK` stage to `normalizeStage` and BREAK inheritance to `evolvedView`. Explicit
> suite 2046/2046; lint bar clean for the touched files (only pre-existing errors).
> **Deviations:** 2.3's tests live in `shared/engine/__tests__/setup.test.mjs` (not
> `rules/__tests__/mulligan.test.mjs`, which covers the legacy `mulligan.mjs`) because the change
> is in `setup.mjs`; a pure `mulliganBonusDraws` helper carries the exact plan cases.

### 2.1 Correct prize counts (gap #5) — ✅ SHIPPED (Phase 0)

- Done via `card-classify.mjs` `prizesForKO` (Phase 0). Repoint `ko-flow.mjs`'s export to it
  (keep `prizesForKO` re-exported from `ko-flow.mjs` so `reduce.mjs:38` import keeps working).
  Remove the `isMegaCard → 3` mistake: legacy and modern Mega are **2** prizes (both are
  `-EX`/`ex`), leaving VMAX/TAG TEAM/V-UNION as the only 3-prize cards.
- **Test:** `card-classify.test.mjs` prize table: VMAX=3, TAG TEAM=3, V-UNION=3,
  `M Venusaur-EX`=2, `Mega Venusaur ex`=2, GX=2, V=2, VSTAR=2, plain=1.

### 2.2 `isBasicPokemon` rejects V-UNION / Restored / BREAK (gaps #12, #13, #14) — ✅ SHIPPED

- `cards.mjs:154` `NON_BASIC_STAGES` = `['stage1','stage2','vmax','vstar','mega']`. Add
  `'vunion'` (or `'v-union'`, matching `collapseStage` output), `'restored'`, `'break'`.
- **Test:** `shared/engine/__tests__/cards.test.mjs` — `isBasicPokemon` false for a card with
  stage `V-UNION`, `Restored`, `BREAK`, and their subtype forms.

### 2.3 Mulligan bonus = net extra mulligans only — `[server]` (gap #15) — ✅ SHIPPED

- `setup.mjs:118-131` awards a bonus card to the opponent **inside** the per-mulligan loop,
  so lockstep mulligans over-award both players. Restructure: count mulligans in the loop
  (`mulligans[pid]` already tracks them), then *after* the loop compute the net difference per
  pair and award that many bonus draws exactly once.
  - `diff = mulligans[A] - mulligans[B]`; if `diff > 0` award `diff` draws to `B`, and vice-versa.
- **Test:** `shared/engine/rules/__tests__/mulligan.test.mjs` — both mulligan 2× → no bonus;
  A mulligans 2, B 0 → B draws 2; A 2, B 1 → B draws 1.

### 2.4 V-UNION play rules (gap #12) — classification now, play gating next — ✅ SHIPPED (classification)

- **This phase:** correct classification only (2.2 covers `isBasicPokemon`; `isRuleBoxPokemon`
  and `isVCard` already include `v-union` after Phase 0). This already prevents a V-UNION from
  being an opening Active or satisfying the mulligan Basic requirement.
- **Follow-on slice (later phase / separate PR):** the full "4 pieces, played as a set from the
  discard pile, once per game per name" rule needs a dedicated `reduce.mjs` branch + client
  picker. Capture as a tracked TODO in the PR body rather than half-shipping it here.

### 2.5 Restored Pokémon can't be played from hand (gap #13) — ✅ SHIPPED

- `evolution.mjs` `canPlayPokemonFromHand` (`:395-407`) rejects only Stage 1/2. Add: reject
  `Restored` (stage `restored`) from hand. The Fossil item path (`trainer-steps.mjs:732`) is the
  only legal entry.
- Mirror in the server reducer's hand→play legality (same evolve/play branch as 1.4).
- **Test:** `evolution.test.mjs` — `canPlayPokemonFromHand` returns `allowed:false` for a
  `Restored` card.

### 2.6 BREAK inheritance (gap #14) — ✅ SHIPPED

- `evolution.mjs` `normalizeStage` returns `null` for `break`. Add `break` → a dedicated
  `'BREAK'` stage (an Evolution, not Basic).
- `evolved-pokemon.mjs` `evolvedView` / `topPokemonCard` currently read an in-play Pokémon as
  its top card only. For a BREAK top card, merge the base card's attacks, abilities, weakness,
  resistance, and retreat cost into the BREAK view (BREAK's own entries win on collision).
- **Test:** `evolved-pokemon.test.mjs` — a BREAK on a base with an attack/weakness exposes those
  in `evolvedView` plus the BREAK's own additions; `isBasicPokemon` is false for BREAK.

---

## Phase 3 — P1: deck-legality suite (`[deck]`)

> **Shipped S196 (branch `feature/rulebook-30c`).** All four deck checks live in
> `deck-validation.mjs`: 3.1 Basic requirement (`isBasicPokemon`), 3.2 Basic-Energy-only copy
> exemption (`isBasicEnergy`), 3.3 `officialCardName` grouping, 3.4 ACE SPEC / Radiant / Prism
> Star limits. 3.5 added `discardCardToPlayerZone` (`state.mjs`) and routed every discard site in
> `reduce.mjs` + `effects/executor.mjs`, plus the legacy KO sites in `rules-bridge.js` /
> `chat-buttons.js`. Suite 2061/2061; lint bar clean for touched files (only pre-existing errors).
> **Deviations:** deck-builder cards carry no `subtypes`, so `card-classify.mjs` learned TCGdex
> fallbacks (`energyType`/`rarity`) and `card-search.mjs` now preserves `energyType`; the shared
> helpers are imported via a relative path that resolves in both Node and the browser (browser
> clamps the extra `..`). 3.5 also covers the mass `discardAll`/`discardBoard`/`discardAndDraw`
> commands and the effect-executor discard costs, not only `handleKnockout`.

All in `client/src/setup/deck-builder/core/deck-validation.mjs` unless noted. Each check appends
to the existing `errors[]`; the deck-builder card objects expose `supertype`/`subtypes`/`stage`
(verify the exact field names against `deck-state.mjs` before writing the predicates; if
`subtypes`/`stage` are absent, import the pure helpers from `shared/engine/cards.mjs` /
`card-classify.mjs`, which the client can already load — see `card-stats.js`).

### 3.1 Require ≥1 Basic Pokémon (gap #6) — ✅ SHIPPED

- Add a check: if no card in the decklist is a Basic Pokémon (`isBasicPokemon`, now fixed for
  V-UNION/Restored/BREAK), push `Deck must contain at least one Basic Pokémon.`.

### 3.2 Only Basic Energy exempt from the 4-copy limit (gap #7) — ✅ SHIPPED

- Replace `exemptSupertypes: ['Energy']` with `isBasicEnergy` (Phase 0): exempt only when
  `supertype === 'Energy'` and the card is *Basic* Energy. Special Energy stays under the copy
  limit. (Pocket format: same change — Pocket Special Energy is not unlimited either.)

### 3.3 Copy limit keyed to official name (gap #8) — ✅ SHIPPED

- Group by a canonical name, not the raw display key (`:58`). Add `officialCardName(card)`:
  - strip the Level marker (`LV.43`, `LV.X`) so `Gengar`, `Gengar LV.43`, `Gengar LV.X` are one
    name;
  - strip the `Team Plasma ` prefix;
  - keep owner/form/trailing-symbol differences (`Alolan Meowth` ≠ `Meowth`, `Rocket's Meowth`
    ≠ `Meowth`).
- Use it both as the grouping key and in the copy-count error message.
- **Test:** `deck-validation.test.mjs` — 4× `Gengar` + 1× `Gengar LV.43` = 5 copies of one name
  (error), while `Alolan Meowth` + `Meowth` are separate names.

### 3.4 ACE SPEC ≤1, Radiant ≤1, Prism Star ≤1-per-name (gaps #9, #10, #11) — ✅ SHIPPED

- `isAceSpecCard` → total count across deck ≤ 1.
- `isRadiantCard` → total count ≤ 1.
- `isPrismStarCard` → ≤ 1 per canonical name (they may legally coexist across *different*
  Prism Star names).
- **Test:** each limit violated → error; each respected (incl. two *different* Prism Stars) → no
  error.

### 3.5 Prism Star discard → Lost Zone redirect — `[both]` (gap #11) — ✅ SHIPPED

- Server: in `reduce.mjs`, wherever a card is moved to the discard pile by effect/KO (the
  `handleKnockout` discard push at `:574`, and any discard-in-discard-effect paths), route a
  `isPrismStarCard` card to `lostZone` instead. `lostZone` is already a real zone
  (`state.mjs:16`) with mass-move commands (`lostZoneAll`/`lostZoneBoard`).
- Legacy: same guard in the `ko-flow.mjs`/`rules-bridge.js` discard site.
- **Test:** `reduce.test.mjs` — KO a Prism Star → it lands in `lostZone`, not `discard`.

---

## Phase 4 — P1: name normalisation and rule-box unification

> **Shipped S197 (branch `feature/rulebook-30c`).** 4.1 `cleanPokemonName` now strips `LV.<n>`/
> `LV.X`, collapses `VMAX`/`VSTAR` to `V` (kept, not erased) and still strips `ex`/`GX`; the
> `officialCardName`/`cleanPokemonName` split is documented in both module headers. 4.2 deleted
> the last two `cardHasRuleBox` aliases (`ko-flow.mjs`, `tool-combat.mjs`) and the `prizesForKO > 1`
> heuristic test; `search-match.mjs` already used `isRuleBoxPokemon`. New
> `rules/__tests__/search-match.test.mjs` (registered) covers Radiant/V-UNION rule-box searches.
> Suite 2061/2061; lint bar clean for touched files (only pre-existing errors).
> **Deviation:** the plan's 4.1 also lists "Team Plasma stripping" as a *shared* normaliser
> semantic, but its own first bullet says to preserve Team Plasma in `cleanPokemonName` (and gap
> #17 calls that correct for evolution). Kept the split: `cleanPokemonName` preserves Team Plasma,
> `officialCardName` strips it. Only level-stripping is genuinely shared.

### 4.1 Fix `cleanPokemonName` (gap #17) — `[both]` — ✅ SHIPPED

`shared/engine/rules/evolution.mjs:90-99`:
- **Strip** Level markers: `LV.<n>` / `LV.X` (so `Gengar LV.43` ≡ `Gengar`).
- **Normalise V-stages to `V`, do not erase them:** `VMAX`/`VSTAR` → `V`, so `Lapras VMAX` ≡
  `Lapras V` but ≠ `Lapras` (enforces App. 9/13 "VMAX evolves from V").
- **Keep stripping** `ex`/`GX` (species identity ignores those suffixes for evolution matching).
- Preserve owner/form/Team-Plasma words as today.
- Re-point `deck-validation.mjs`'s `officialCardName` (3.3) to share these semantics where the
  rules overlap (level stripping, Team Plasma stripping) — but note the *copy-limit* name keeps
  `ex`/`V`/`GX`/form suffixes (they *are* part of the name for the 4-copy rule), so the two
  normalisers are deliberately different. Document this split in the module header.
- **Test:** `evolution.test.mjs` — `pokemonNamesMatch('Lapras VMAX','Lapras V') === true`,
  `('Lapras VMAX','Lapras') === false`, `('Gengar','Gengar LV.43') === true`,
  `('Gengar LV.43','Gengar LV.X') === true`.

### 4.2 Single rule-box definition everywhere (gap #16) — `[both]` — ✅ SHIPPED

- Already the contract in Phase 0. Close the loop: `search-match.mjs:127-134` and
  `stadium-effects.mjs:499` both import `isRuleBoxPokemon` (Radiant and V-UNION now correctly
  *have* a rule box). Delete `ko-flow.mjs` `cardHasRuleBox` (prizes>1 heuristic).
- **Test:** `search-match.mjs` — a "without a Rule Box" search excludes Radiant and V-UNION;
  a "with a Rule Box" search includes them.

---

## Phase 5 — P2: card-era appendices

> **Shipped S198 (branch `feature/rulebook-30c`).** 5.1 Team Flare Hyper Gear (name/subtype
> marker) attaches to the opponent's Pokémon-EX: `validateReferences` + `validateLegality` relax
> ownership for it and the apply path now lands the card in the HOST's zone, not the actor's.
> 5.2 Ancient Traits (`abilities.mjs`) are tagged `trait: 'alpha'|'omega'` and the real
> "no Abilities" suppression (`stadiumAbilityBlocked`) skips them. 5.3 `addSpecialCondition` is
> Active-only. 5.4 LEGEND is already a rule-box/2-prize card from Phase 0; the only missing piece
> — non-Basic so it can't open/satisfy the Basic mulligan — is added to `isBasicPokemon`. Suite
> 2068/2068; lint bar clean for touched files (only pre-existing errors).
> **Deviations:** (a) 5.2 named `collect-usable-abilities.mjs`/`ability-executors.mjs` as the
> suppressors, but the runtime "have no Abilities" gate is `stadiumAbilityBlocked`
> (`stadium-effects.mjs`) — that is what was taught to skip traits; the tag + `isAncientTraitAbility`
> helper are exported for any future suppressor. (b) the plan's `abilities.mjs:342/:783` line numbers
> are stale; the two branches (α attach-trigger, Ω Trainer-prevention) were tagged in place.
> (c) 5.1 needs no `subtypes` on the card — TCGdex prints "… Team Flare Hyper Gear" in the NAME.

### 5.1 Team Flare Hyper Gear attaches to opponent — `[server]` (gap #18) — ✅ SHIPPED

- `reduce.mjs:1202-1210` (`playTrainer`/attach reference check) and `:1504-1522` (Tool attach
  legality) reject any target whose `playerId !== actor`. Add an exception: when the Tool is a
  Team Flare Hyper Gear (name/subtype match), allow a target owned by the opponent **and** a
  Pokémon-EX. Keep the max-tools and in-play checks.
- **Test:** `manual-tools.test.mjs` — a Team Flare Hyper Gear attaches to the opponent's
  Pokémon-EX; a normal Tool still cannot.

### 5.2 Ancient Traits are not Abilities (gap #19) — `[both]` — ✅ SHIPPED

- `abilities.mjs:342` (α-style) and `:783` (Ω-style) currently parse Ancient Traits into the
  ability step plan. Tag them distinctly (e.g. `type:'trait'`, `trait:'alpha'|'omega'`) and
  ensure any "suppress/remove Abilities" effect (`collect-usable-abilities.mjs` /
  `ability-executors.mjs`) skips `trait` steps.
- **Test:** an ability-blocking effect does not disable an α-Growth / Ω-Barrier trait.

### 5.3 Special Conditions only on the Active — `[server]` (gap #20) — ✅ SHIPPED

- `reduce.mjs:2280-2286` `addSpecialCondition` applies to any `findCard` result. Gate it to
  `cardRef.zoneId === 'active'` (parsed card effects already target Active; this closes the
  manual-tool hole).
- **Test:** `manual-tools.test.mjs` — `addSpecialCondition` on a benched Pokémon is rejected.

### 5.4 Pokémon LEGEND (gap #21) — `[both]` — ✅ SHIPPED (classification only; 2-card play rule still a follow-up)

- **This phase:** classification + prize count only (Phase 0 `isLegendCard` → `prizesForKO = 2`,
  non-Basic so it can't open/satisfy mulligan Basic).
- **Follow-on:** the two-cards-played-together representation is a distinct modelling feature;
  track separately. Do not half-model the play rule here.

---

## Phase 6 — Cross-cutting verification & docs — ✅ SHIPPED (S199)

- ✅ **Suite green:** explicit suite `2068/2068, 0 fail` (was 797+ baseline; +tests from Phases
  0–5). **Lint caveat:** `pnpm lint` = `eslint .` is not a usable gate in this repo — it reports
  ~85k errors, essentially all `linebreak-style`/`prettier` from the CRLF checkout (repo-wide,
  pre-existing). The established bar is the targeted
  `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <changed files>`:
  Phase 5 code files are clean apart from the pre-existing unused-import errors in
  `rules-extended.test.mjs`. Phase 6 touched docs only, so no code new to lint.
- ✅ **Prize text:** `README.md` A1 note corrected to the flat-`prizesForKO` reading
  (`card-classify.mjs`; ex/GX→2, VMAX/TAG TEAM/V-UNION→3, LEGEND→2, no match-loss) and re-pointed
  at `card-classify.test.mjs`. `docs/card-types-taxonomy.md` stale claims fixed in all four
  places (A1 table, A3 note, field table, §H prize table + §J item 10) plus the old module map.
- ✅ **Docs/MAP:** `docs/card-types-taxonomy.md` gains a `card-classify.mjs` module-map row, the
  `abilities.mjs` Ancient-Trait exports, and a `player.oncePerGame` note; `.agent/MAP.md` updated
  in Phase 5 for `card-classify`/`abilities`/`cards`.
- ✅ **DECISIONS:** already recorded before this phase — **D66** (two-normaliser split) and
  **D62** (sudden-death tiebreak scope). No new line required.

---

## Suggested execution order (one green commit each)

1. Phase 0 (classification contract) — everything depends on it.
2. 1.1 GX prize fix (small, unblocks correct legacy games).
3. 1.2 once-per-game flags (small, high blast radius).
4. 1.3 simultaneous-win detection (a), then tiebreaker (b).
5. 1.4 server Mega turn-end.
6. Phase 2 (prize counts + stages + mulligan).
7. Phase 3 (deck-legality suite).
8. Phase 4 (name normalisation + rule-box unification).
9. Phase 5 (P2 appendices).
10. Phase 6 (verification + docs).

## Open questions to resolve before coding (ask the user / decide and record)

1. **Tiebreaker scope (1.3b):** full second six-prize match vs. sudden-death "first prize wins"
   resolution only? Recommend the latter first, full mat later.
2. **V-UNION (2.4) and LEGEND (5.4) full play rules:** ship classification now and gate the
   discard-set / combined-card play mechanics as explicit follow-up PRs — confirm that's
   acceptable vs. holding these items open.
3. **`useVStarGX` `kind` field:** the command currently carries no VSTAR-vs-GX discriminator
   (1.2). Confirm the client sender can populate it, or whether we infer from card subtypes
   server-side. Recommend explicit `kind` (validated enum) for correctness.
4. **Deck-builder card shape:** confirm `subtypes`/`stage` are present on the deck-builder card
   objects before Phase 3; if absent, this plan imports `shared/engine` helpers.
