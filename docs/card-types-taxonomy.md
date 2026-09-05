# Card-Type Taxonomy — What the Sim Parses vs. What It Still Needs

> **Purpose.** A reference catalog of every card type, ability family, attack-effect
> family, status condition, energy, stadium, and turn rule the PTCG-sim would need
> to **parse and enforce**. It doubles as a gap report: for each family it records
> what the current engine already does, what it only announces, and what is entirely
> missing.
>
> **Status of this file.** Research / documentation only. **No parser code is implied
> or included.** Treat every
> ❌ as "candidate work," not "planned work."
>
> **Update (Phase 1 done).** Section G's two `status.mjs` defects (inert Confused,
> side-effectful `canActThroughStatuses`) and the missing mutual exclusion are now
> **fixed and test-verified** (171/171 `node --test` green, 8 new status tests).
> Everything else in this file is still gap-report only.
>
> **Card data source.** There is no local card database. Cards arrive at runtime from
> `api.tcgdex.net` (details) and `images.pokemontcg.io` (art). `ensureCardData()`
> (`rules-state.mjs`) is the single fetch/extract point, so every field below is
> anchored to the TCGdex v2 shape it already pulls.

## Legend

- ✅ **Enforced** — real code path changes game state / blocks an action. Citation given.
- ⚠️ **Announce-only / partial** — recognized and shown to the player, but not
  executed, not legality-checked, or with a design smell.
- ❌ **Not handled** — no code path touches it in the live flow.

All rule modules live in `client/src/setup/rules/`. The live turn entry point is
`chat-buttons.js` (`attack()` / `pass()`), **not** the rules engine.

---

## A. Card categories (the top-level taxonomy a parser must recognize)

The parser's first job is to bucket a card by `supertype` (`'Pokémon' | 'Trainer' |
'Energy'`) and then by subtype. TCGdex exposes these as `subtypes[]` + `rarity` +
`stage`.

### A1. Pokémon
| Subtype | Meaning | TCGdex signal | Modern? |
|---|---|---|---|
| **Basic** | Can start in Active or on Bench; the only type that may be the turn-1 active. | `stage === 'basic'`, no `evolvesFrom` | Yes |
| **Stage 1** | Evolves from a Basic. | `stage === 'stage1'`, `evolvesFrom` set | Yes |
| **Stage 2** | Evolves from a specific Stage 1. | `stage === 'stage2'`, `evolvesFrom` set | Yes |
| **ex** | 2 prizes on KO; "ex rule" (if KO'd you take 2 extra). | `subtypes` includes `ex` | Legacy |
| **V** | 2 prizes on KO. | `subtypes` includes `v` | Legacy (SwSh) |
| **VMAX** | 3 prizes on KO; evolves from a V. | `subtypes` includes `vmax` | Legacy (SwSh) |
| **VSTAR** | 2 prizes; evolves from a V; has a "VSTAR Power" instead of an ability. | `subtypes` includes `vstar` | Legacy (SwSh) |
| **GX** | 2 prizes; "GX rule" (KO = you lose the match). | `subtypes` includes `gx` | Legacy (SM) |
| **Mega Evolution** | 2 prizes; a new (SV) evolution mechanic, often from a non-standard line. | `rarity` includes `mega` | Modern (SV) |
| **Tera / Terastal** | SV "Terastal" — a Tera Type swap; not a prize modifier. | `subtypes`/text; no dedicated TCGdex field | Modern (SV) |

> **Note:** prize-count derivation lives in `prizesForKO()` (`ko-flow.mjs`) and is
> an **approximation** built from `rarity` + `subtypes` (ex/double-rare → 3, vmax → 3,
> vstar/v/mega → 2, default → 1). The ex rule (modern: 3 prizes, i.e. "2 extra" over
> a standard KO) and the GX "KO'd = lose the match" rule are modeled in `koOutcome()`
> + `handleKO()` (`ko-flow.mjs`), exercised by tests in `rules-extended.test.mjs`.

### A2. Trainer
| Subtype | Meaning | TCGdex `subtypes` |
|---|---|---|
| **Basic** | Umbrella label. | `basic` |
| **Item** | Any number may be played per turn; one-time effect. | `item` |
| **Supporter** | At most one per turn. | `supporter` |
| **Special Supporter** | Plays like an Item (not subject to the one-per-turn Supporter limit). | `special supporter` |
| **Stadium** | One on the field at a time; continuous effect until replaced. | `stadium` |
| **Tool** (legacy, "Pokémon Tool") | Attaches to a Pokémon; continuous effect. | `tool` |
| **Boss / Strategy** (legacy) | Pre-SwSh Supporter-style categories. | `boss` / `strategy` |

> ✅ **Note (Gap #9 done):** the one-per-turn Supporter limit is now **enforced** —
> `supporterPlayGate()` (`rules-state.mjs`, pure + tested) gates hand→board plays in
> `moveCard()` and sets `rulesState.flags[<player>].supporterPlayed` (reset each turn
> via `resetTurnFlags`). Items, Stadiums, Tools, and Special Supporters bypass the
> limit; a `playSupporter` case was also added to `canPerformAction()`.

### A3. Energy
| Category | TCGdex `subtypes` |
|---|---|
| **Basic Energy** | `basic` + a type keyword (`grass`, `fire`, …) |
| **Special Energy** | `special` (e.g. `double`, `double colorless`, or named letter energies) |
| **Double / Double Colorless** | `double` / `double colorless` |

Energy **types** (for paying attack costs) are handled, including Double /
Double Colorless counting as 2 symbols. Special-energy **card effects**
(`attach-type`, `lock`, `redirect`, `protect`) are **executed** in the live
path — see **F** (protect is a simplified damage-cap model).

---

## B. Pokémon fields a parser must extract

`ensureCardData()` (`rules-state.mjs:23`) fetches TCGdex v2 detail and extracts
exactly these. A full parser needs all of them:

| Field | TCGdex key | Used today? |
|---|---|---|
| HP | `hp` | ✅ shown; KO threshold checked in live `attack()` via `handleKO()` (`ko-flow.mjs`) |
| Types | `types[]` | ✅ shown; weakness/resistance math ✅ (`computeAttackDamage`) |
| Weakness | `weakness {type, value}` | ✅ parsed + applied by `computeAttackDamage()` (`attack-engine.mjs:11`): modern ×2, legacy flat +N; tested in `rules.test.mjs`; wired into live `attack()` (`chat-buttons.js`) |
| Resistance | `resistance {type, value}` | ✅ parsed + applied by `computeAttackDamage()`; tested; wired into live `attack()` (`chat-buttons.js`) |
| Retreat cost | `retreatCost` | ✅ live retreat flow: gate (`canPerformAction` + `statusAllowsRetreat` — only Paralyzed blocks) → pay cost (discard N energy, `energiesToDiscardForRetreat()`) → swap active/bench → `markRetreated` → clears Confused (`clearStatuses`); wired via `retreat()` action (`chat-buttons.js`) + P1/P2 buttons + flip-board; tested in `rules-extended.test.mjs` |
| Attacks | `attacks[]` (`name`, `cost[]`, `damage`, `text`) | ✅ live attack flow: `ensureCardData()` enriches both actives → energy-cost gate (`canPayAttackCost`, ⛔ announce + bail without ending turn) → `computeAttackDamage()` (weakness ×2 / legacy +N, resistance, clamped ≥0) → damage counters placed on opponent's active → KO check (`totalDamage ≥ hp`) → prizes (`handleKO`: GX = match win, else `prizesForKO` + `promotionGuidance`); wired via `attack()` (`chat-buttons.js`); pure functions tested in `rules.test.mjs` / `rules-extended.test.mjs`. Attack `text` effect families are parsed + **executed in solo** via `damage-parser.mjs` helpers inside `attack()` — see D. `attack-effects.mjs` remains an announce-only classifier (`applyAttackEffect` always `executed: false`) and is not the live execution path. |
| Stage | `stage` | ✅ gates `evolve` in `canPerformAction` |
| Evolves-from | `evolvesFrom` | ✅ live evolution gate in `moveCard()` (`move-card.js`): `canEvolve()` blocks illegal evolutions (turn-1 ban, same-turn ban, stage chain, once-per-turn) before the zone splice; on success `markEvolvedThisTurn()` + `clearStatuses()` + announce; tested in `rules-extended.test.mjs` |
| Ability | `ability {name, text}` | ✅ all core families executed — see C (live wiring in `chat-buttons.js` / `rules-bridge.js`; `parseAbility()` still emits guidance lines) |
| Subtypes | `subtypes[]` | ✅ drives `prizesForKO` |
| Rarity | `rarity` | ✅ drives `prizesForKO` |
| id | TCGdex `id` | ✅ stable card key |

> ✅ **Wired:** weakness/resistance math and energy-cost payment are now part of the
> live attack path — `attack()` (`chat-buttons.js`) enriches both actives
> (`ensureCardData`), gates on `canPayAttackCost()`, computes via
> `computeAttackDamage()`, places damage counters on the opponent's active, and
> handles KO/prizes via `handleKO()`. The only remaining Section B gap is parsing
> attack `text` for effect-type attacks (see D).

---

## C. Ability families

**Current state:** ✅ **All core families executed.** Pure parsers live in
`ability-executors.mjs` (pure + tested in `rules-extended.test.mjs`) and are
wired into the live paths: the attack flow (`chat-buttons.js`), `hookTrainerPlay`
and the turn-end hook (`rules-bridge.js`), plus P1/P2 chat buttons for the
once-per-turn card-action families. `parseAbility()` (`abilities.mjs:4`) still
emits per-step **guidance** lines, and `ability-effects.mjs`
(`classifyAbility()` / `describeAbilityFamily()`) supplies the family-level
announce pass. Per-ability used-tracking: `abilityKey()` / `markAbilityUsed()` /
`abilityUsed()` (`rules-state.mjs`), cleared at each turn boundary.

| Family | Canonical real-card example | Printed wording (shape) | Status |
|---|---|---|---|
| Once-per-turn **search deck** | **Cinderling** ("Once During Your Turn: search for a Pokémon…") | "Once during your turn: search…" | ✅ executed — P1/P2 chat buttons + executor in `chat-buttons.js` (guided picker) |
| Once-per-turn **draw N** | **Iono** line / many draw abilities | "Once during your turn: draw 2 cards." | ✅ executed — auto-executed once per turn in `hookTrainerPlay` (`rules-bridge.js`), gated by `abilityUsed()`/`markAbilityUsed()` |
| **Passive / always-active** (cost reduction) | **Tepig** ("…this Pokémon's attacks cost less") | No "once" phrasing; continuous | ✅ executed — `passiveCostDiscount()`/`applyCostDiscount()` reduce the attacker's cost before the `canPayAttackCost` gate (`chat-buttons.js`, `✨` announcement) |
| Once-per-turn **switch** | **Alakazam** (psychic) / many | "switch your Active…" | ✅ executed — P1/P2 chat buttons + picker in `chat-buttons.js` |
| Once-per-turn **heal** | **Chansey** (heal damage counters) | "remove N damage counters" | ✅ executed — P1/P2 chat buttons in `chat-buttons.js` |
| Once-per-turn **attach energy** | **Marnie's Houndoom** / energy tutors | "attach an Energy card" | ✅ executed — P1/P2 chat buttons in `chat-buttons.js` |
| **"Whenever / when you play" triggers** | **Grimmsnarl ex** ("When you play this…") | "When you play this Pokémon…" | ✅ executed — `parseWhenPlayedEffect()` in `hookTrainerPlay` (once-ever per card; draw N, or N damage counters on opponent's Active) |
| **"At the end of your turn" triggers** | **Cursola** / turn-end tutors | "At the end of your turn…" | ✅ executed — `parseEndOfTurnEffect()` in the turn-end hook (`rules-bridge.js`), draw N |
| **Damage prevention / redirection** | **Gardevoir ex** (deflect) / **Zacian** | "Damage done to this Pokémon is reduced" | ✅ executed — `parseDamagePrevention()`/`applyDamagePrevention()` in the attack flow after `computeAttackDamage` (`chat-buttons.js`, `🛡️` announcement) |
| **Energy redirection / lock** | **Iron Tinker** (redirect) | "Redirect Energy…" | ✅ executed — P1/P2 chat buttons + `energyRedirectAbility` in `chat-buttons.js` (auto-fast-path + two-picker path) |
| **Hand protection** | **Gholdengo** ("your hand can't be reduced by opponent's effects") | "Your hand cannot be reduced…" | ✅ executed — `isHandProtected()` consulted on opponent's Active + bench; blocks opponent-hand-discard effects (`🛡️` announcement) |
| **Opponent disruption** | **Giratina** / discard opponent's hand | "Discard cards from your opponent's hand" | ✅ executed — `parseOpponentDiscard()` drives a multi-select picker over the opponent's hand; on Confirm, `moveCardBundle('opp','opp','hand','discard')`; blocked by hand protection |

> **Announce-only pass (done):** `classifyAbility()` maps each family above to a
> keyword-based family (`search, draw, passive, switch, heal, attach, when-played,
> end-of-turn, damage-prevent, hand-protect, opponent-disrupt, energy-redirect, unknown`) and
> `describeAbilityFamily()` emits a human-readable line; both are pure + tested in
> `rules-extended.test.mjs`. The draw row keeps its **auto-executed** status (once
> per turn in `hookTrainerPlay`, `rules-bridge.js`); every other row is also
> **executed** — the pure parsers in `ability-executors.mjs` are wired into the live
> paths (P1/P2 chat buttons in `chat-buttons.js`, `hookTrainerPlay`, and the
> turn-end hook in `rules-bridge.js`), and each use is gated by an `abilityUsed()`
> check before it can fire twice in a turn.
>
> **Parser needs (done):** timing (once-per-turn / when-played / at-end-of-turn /
> passive) and kind (search / draw / switch / heal / attach / trigger / continuous)
> are covered by `classifyAbility()`'s family buckets, and **per-ability
> used-tracking** is pure + tested: `abilityKey()` / `markAbilityUsed()` /
> `abilityUsed()` (`rules-state.mjs`) store a per-card map in
> `rulesState.flags[player].abilitiesUsed`, cleared by `resetTurnFlags()` at each
> turn boundary (the old `img.__rulesAbilityUsed` DOM flag is gone). Legality is
> enforced through those checks: the once-per-turn limit is gated by
> `abilityUsed()` in `chat-buttons.js` (abilities) and `oncePerTurnClause()`
> (attacks); finer clauses like "only if this is your first action" are not parsed
> yet (❌).

---

## D. Attack-effect families

**Current state (solo, rules on):** `attack()` in `chat-buttons.js` is the live
entry. It gates via status / `canPerformAction({action:'attack'})` / energy cost,
calls `markAttacked()`, computes damage with `computeAttackDamage()`
(`attack-engine.mjs` — weakness/resistance applied), executes D-family effect
text via **`damage-parser.mjs` helpers** (scaling damage, coin, bench, heal, draw,
attach energy, switch, discard cost, shuffle-draw, once-per-turn, status
application, etc.), runs KO/prizes, then `endTurnWithBanner`. Multiplayer status
application on the opponent is still a known gap (see Gap 6 / §G).

**Classifier vs executor:** `attack-effects.mjs` (`ATTACK_FAMILIES`,
`classifyAttackEffect`, `describeAttackEffect`, announce-only
`applyAttackEffect()` with `executed: false`) remains a pure classifier and is
**not** the live execution path. Live D-family execution goes through
`damage-parser.mjs` + `attack()`. `executeAttack()` in `attack-engine.mjs` is
still **dead** (unused); do not confuse it with the live `attack()` path.

**Suite baseline:** full listed `package.json` test list is **396/396**.

| Family | Canonical real-card example | Printed shape | Status |
|---|---|---|---|
| **Flat damage** | **Zigzagoon** (Slam: 30) | "30" | ✅ executed in live path (`attack.damage` → `computeAttackDamage`); parser passes it through unchanged when no scaling clause is present |
| **Damage-per-energy** | **Charizard** (flavor: "for each Energy…") / many | "× the number of Energy attached" | ✅ **executed (Phase 1)** — `parseAttackDamage()` scales by attached Energy in `attack()` when rules are on; "Phase 1 wiring" test in `rules-extended.test.mjs` |
| **Damage-per-HP / per-prize / per-turn** | **Dialga** (per prize) / turn counters | "for each Prize card… / this is the Nth turn" | ✅ **per-prize + per-turn + per-HP all executed** — per-HP scaling added as a `parseAttackDamage()` component (defaults to the Defending Pokémon's HP; "…of this Pokémon" uses the attacker's HP; unnumbered amount → unresolved, never guessed) fed through the same `parsed.total` substitution path as the other scaling families; `attackerHp`/`defenderHp` ctx options passed from `attack()`; 3 new tests in `rules-extended.test.mjs` |
| **Multi-target (all opponent's Pokémon)** | **Rayquaza** / spread attackers | "do 20 damage to each of your opponent's Pokémon" | ✅ **executed (live solo path)** — `allBenchDamage()` parses the per-Pokémon amount (unnumbered clause → 0); `attack()` applies it to ALL of the opponent's benched Pokémon via `placeSelfDamage`, per-Pokémon KO check + prizes + one `promotionGuidance` after the loop; empty bench / unnumbered clause fizzle-announced; tests in `rules-extended.test.mjs` |
| **Extra damage by type** | **Greninja** (Water extra) | "+20 if the Defending Pokémon is Water" | ✅ **executed (Phase 1)** — type-gated bonus folds into the executed total on defender-type match; "Phase 1 wiring" test |
| **Discard cost (energy / hand / own)** | **Machamp** (discard an Energy) / **Gengar** (discard hand) | "discard an Energy card / N cards from your hand" | ✅ **executed (live solo path)** — `discardCost()` parses the Energy + hand-discard counts (unnumbered clause = 1); `attack()` pays the printed discard cost right after the energy gate and before any damage — insufficient Energy or hand cards → ⛔ fizzle (early return, turn does NOT end, so the player can retry another attack or pass, consistent with the other cost bails); tests in `rules-extended.test.mjs` |
| **Shuffle-then-draw / shuffle cost** | **Dunsparce** / many | "shuffle your hand into your deck, then draw N" | ✅ **executed (live solo path)** — `shuffleDrawClause()` parses the draw count (unnumbered clause = 1); `attack()` pays the cost right after the discard-cost gate via the shared `shuffleAndDraw()` zone action (whole hand → deck, shuffle, draw N; empty deck just yields fewer cards, so no fizzle gate); tests in `rules-extended.test.mjs` |
| **Apply status — asleep** | **Hypno** (Confuse) / sleeping attacks | "put the Defending Pokémon to Sleep" | ✅ executed in live path (solo) — `applyStatus` in `attack()`, wake coin via `resolveWake` (see G) |
| **Apply status — paralyzed** | **Machamp** (paralyze) | "Paralyze the Defending Pokémon" | ✅ executed in live path (solo) — applied + blocks attack/retreat, clears at turn end (see G) |
| **Apply status — poisoned** | **Gloom** (poison) | "Poison the Defending Pokémon" | ✅ executed in live path (solo) — applied; −10 at turn boundary (`resolveTurnBoundary` in `endTurnWithBanner`) |
| **Apply status — burned** | **Charmander** / burn attacks | "Burn the Defending Pokémon" | ✅ executed in live path (solo) — applied; coin-then-−20 at turn boundary |
| **Apply status — confused** | **Hypno** (Confuse) | "Confuse the Defending Pokémon" | ✅ executed in live path (solo) — applied in `attack()`, pre-attack coin via `resolveConfusedAttack` (tails = 3 DC self-damage, attack fizzles); **not cleared at turn end** (see G) |
| **Coin-flip modifiers** | **Gengar** / many "flip a coin; if heads…" | "flip a coin — if heads, …" | ✅ **executed (live solo path)** — coin flipped in `attack()` before `parseAttackDamage`; heads bonus folds into `parsed.total`; tails self-damage via `placeSelfDamage` after the KO/status block; tests in `rules-extended.test.mjs` |
| **"If" conditional damage** | **Crobat** ("if the Defending is [type], …") | "if …, this attack does N more" | ✅ **executed (live solo path)** — `evalCondition()` evaluates HP comparison ("N HP or more/less"), Stage ("Stage 1/2"), damaged state ("is damaged" via `ctx.defenderDamage`), ex, and Basic; conditions not derivable from card data remain honestly unresolved ("resolve the printed condition"); tests in `rules-extended.test.mjs` |
| **Damage to the bench** | **Zapdos** / benched-target attackers | "you may also do N to a benched Pokémon" | ✅ **executed (live solo path)** — target via `planBenchTarget()` (0→fizzle, 1→auto, 2+→first); `placeSelfDamage` on benched Pokémon; KO check + prizes + `promotionGuidance`; tests in `rules-extended.test.mjs` |
| **Heal opponent / remove counters** | **Chansey** (heal) / healing attacks | "remove N damage counters" | ✅ **executed (live solo path)** — target resolved by `healTarget()` (defender only when printed "Defending Pokémon", else attacker's Active); plan via `planHeal()`; applied via `removeDamageCounter`/`updateDamageCounter`; KO'd defender → no-op announcement; tests in `rules-extended.test.mjs` |
| **Draw (as part of attack)** | **Iono** / draw attacks | "draw 2 cards" | ✅ **executed (live solo path)** — `drawCount()` parses the clause; `attack()` calls the shared `draw()` action (capped at remaining deck; fizzle/dry-deck announced); tests in `rules-extended.test.mjs` |
| **Attach energy (as part of attack)** | **Iono** / energy-attach attacks | "attach an Energy card" | ✅ **executed (live solo path)** — `attachEnergyCount()` parses the clause (unnumbered = 1); `attack()` attaches N Energy from hand to the active via the shared `moveCard` attach path; fizzles when no Energy remains in hand; tests in `rules-extended.test.mjs` |
| **Switch (as part of attack)** | **Clefairy** / switch attacks | "then switch your Active" | ✅ **executed (live solo path)** — `switchClause()` detects the clause; `attack()` auto-swaps active with the first benched Pokémon via the shared `moveCard` pair (no energy cost, same as the switch ability); fizzles when the bench is empty or the active was KO'd; tests in `rules-extended.test.mjs` |
| **"Once during your turn" attack-side effect** | **Cursola** / turn-locked attacks | "Once during your turn: …" inside an attack | ✅ **executed (live solo path)** — `oncePerTurnClause()` detects the clause; `attack()` gates it on `abilityUsed(user, active)` (shared `abilitiesUsed` flag map, cleared by `resetTurnFlags()`): if already used this turn the attack **fizzles before any cost/damage** (⛔ announcement, early return — the turn does NOT end, so the player can retry another attack or pass, consistent with the other invalid-attack bails); on success `markAbilityUsed(user, active)` records it before `markAttacked`. Test in `rules-extended.test.mjs` |

> **Live path note:** D-family effect text is executed in solo via
> `damage-parser.mjs` helpers inside `attack()` (`chat-buttons.js`), on top of
> `computeAttackDamage()` (weakness/resistance). `attack-effects.mjs` remains an
> announce-only classifier. `executeAttack()` in `attack-engine.mjs` is still
> unused. Multiplayer status-on-opponent sync is the remaining related gap
> (Gap 6 / §G) — not missing D-family parsing.


## E. Stadiums

**Current state:** ✅ **All core families executed.** Stadium *placement* is tracked in
`rulesState.stadium` (`markStadiumPlayed`/`getStadium`, `rules-state.mjs`), wired into
the hand→board path in `moveCard()` with a replacement announcement; the UI discard
of a displaced Stadium works (`update-stadium-card.js`). `stadium-effects.mjs` now
exports the classification pass (`STADIUM_EFFECT_FAMILIES`, `isStadiumCard()`,
`classifyStadiumEffect()`, `describeStadiumEffect()`) **plus pure effect parsers**:
`parseStadiumSetupDraw()`, `parseStadiumOncePerTurn()`, `parseStadiumDamagePrevention()`,
`isStadiumRetreatPrevention()`, `isStadiumHandProtect()` — and an **executable**
`applyStadiumEffect()` that returns actionable `results[]` descriptors instead of
announce-only messages. Execution is wired through the **Stadium button** (P1/P2 in
`index.ejs`, `stadiumEffect()` in `chat-buttons.js`), gated by
`stadiumUsed()`/`markStadiumUsed()` (per-player, reset each turn via `resetTurnFlags`),
and relayed with `processAction(user, emit, 'stadium-effect', …)`. Continuous effects
hook into the live paths: damage prevention in the attack flow (`chat-buttons.js`,
`🏟️` announcement) and retreat prevention in `retreat()` (`chat-buttons.js`, `🏟️`
block); hand protection is consulted in the opponent-discard path
(`rules-bridge.js`, `🛡️` block).

| Family | Canonical real-card example | Printed shape | Status |
|---|---|---|---|
| **Setup / one-time on play** | **Victory Road** (draw on setup) | "When you play this Stadium…" | ✅ executed — `parseStadiumSetupDraw()` → `draw(user, n)` in the `stadiumEffect` handler (`chat-buttons.js`) |
| **Once-per-turn effect** | **Safari Zone** ("once per turn, draw…") | "Once during your turn: …" | ✅ executed — `parseStadiumOncePerTurn()` → draw/search/heal in `stadiumEffect` (`chat-buttons.js`), gated by `stadiumUsed()`/`markStadiumUsed()` |
| **Continuous effect (both players)** | **Lillie's Rooftop** (damage prevention) | "Prevent all damage…" | ✅ executed — `parseStadiumDamagePrevention()` consulted in the attack flow after `computeAttackDamage` (`chat-buttons.js`, `🏟️` announcement) |
| **Opponent-affected** | **Wishman's Garden** (opponent's attacks reduced) / **Stadium** retreat lock | "Your opponent's …" | ✅ executed — `isStadiumRetreatPrevention()` gates `retreat()` (`chat-buttons.js`, `🏟️` block); hand shield via `isStadiumHandProtect()` in `rules-bridge.js` |
| **Discard-on-replacement / one-at-a-time rule** | any (replace the existing Stadium) | implicit rule | ✅ state (`markStadiumPlayed`) + UI discard (`update-stadium-card.js`) |
| **HP modifier** (continuous) | **Route 25** ("Basic Pokémon in play have +20 HP") | "…have +N HP" / "N HP less" | ✅ executed — `parseStadiumHpModifier()` / `getStadiumHpBonus()` / `effectiveHp()` (clamped ≥1) consulted at **every** KO site (`rules-bridge.js`, `chat-buttons.js`, `attack-engine.mjs`); pronoun targeting (`your` / `opponent` / general→both) |
| **Evolution-speed modifier** (continuous) | **Lillie's Room** ("may evolve as if it had been in play for 1 more turn") | "evolve as if … in play 1 more turn" / "evolving costs N less" | ✅ executed — `parseStadiumEvolutionSpeed()` / `getStadiumEvolutionSpeed()`; `relaxTurnGate` relaxes the just-played gate in `canEvolve()` (`evolution.mjs`); `costReduce` surfaced on the `canEvolve` return for the cost layer (no live evolution-energy-charge site exists in the sim) |
| **Attack-cost modifier** (continuous) | **Lillie's Room** ("attacks by your Active Pokémon cost 1 less Energy") | "attacks … cost N less Energy" | ✅ executed — `parseStadiumCostModifier()` stacked on `passiveCostDiscount` in the live attack cost gate (`chat-buttons.js attack()`) |

> **Done:** the one-at-a-time slot is recorded in `rulesState.stadium` (pure +
> tested in `rules-extended.test.mjs`); **classification + announcement** via
> `stadium-effects.mjs` (`setup-once, once-per-turn, continuous-both,
> opponent-affected, none, unknown`) — pure + tested; **execution of each family**
> is now ✅ (see table) — all parsers and the `stadiumUsed` flag are pure + tested
> in `rules-extended.test.mjs` (151/151 passing).
>
> **Continuous modifiers (HP / evolution-speed / attack-cost) — ✅ wired + tested.**
> HP: `parseStadiumHpModifier()` / `getStadiumHpBonus()` / `effectiveHp()` (clamped ≥1)
> feeds the KO threshold at every KO site. Evolution-speed:
> `parseStadiumEvolutionSpeed()` / `getStadiumEvolutionSpeed()` relax the just-played gate
> in `canEvolve()` (`evolution.mjs`) and surface `costReduce` for the cost layer. Attack-cost:
> `parseStadiumCostModifier()` stacks on `passiveCostDiscount` in the live attack gate.
> All three follow the Section C passive hook shape (pure parsers + pronoun targeting)
> and are covered by tests in `rules-extended.test.mjs` (full suite 187/187 green).

---

## F. Energy types & special-energy effects

**Current state:** energy **type** (for paying costs) is modeled by
`canPayAttackCost()` (`attack-engine.mjs:41`) via symbol matching; the **attach limit**
(once per turn) is enforced in `canPerformAction()` (`rules-state.mjs`, `attachEnergy`
case). **Double / Double Colorless now count correctly** in cost payment via
`expandEnergyEntries()` (`attack-engine.mjs`) — `double` → 2× its type,
`double-colorless` → 2 Colorless wildcards; the live attack gate (`chat-buttons.js`)
passes `{ type, family }` objects. **Special-energy card *effects* are classified** via `energy-effects.mjs` — execution of the
`attach-type` family is now **executed** (effective attached type honored in cost payment — `effectiveEnergyType()` in `energy-effects.mjs`, used by the live attack gate in `chat-buttons.js`); the `lock` family is now **executed** (attached-energy removal gate in `move-card.js`, pure helpers `isLockEnergy` / `pokemonHasLockedEnergy` in `energy-effects.mjs`); the `redirect` (Switching Energy) family is now **executed** (free-switch gate in `retreat()`, `chat-buttons.js`; pure helpers `isRedirectEnergy` / `pokemonHasRedirectEnergy` in `energy-effects.mjs`); the `protect` (Buddy-Buddy Energy) family is now **executed** (damage cap in `attack()`, `chat-buttons.js`; pure helpers `isProtectEnergy` / `pokemonHasProtectEnergy` / `applyProtectCap` in `energy-effects.mjs` — simplified model: caps opponent-attack damage at 1 counter; the full card also shields from non-damage effects).

| Energy | Type used for | Status |
|---|---|---|
| Grass / Fire / Water / Metal / Electric / Psychic / Fighting / Dark / Fairy / Colorless | cost payment (`canPayAttackCost`) | ✅ matched + gated in live `attack()` (`chat-buttons.js`): energy type read from `ensureCardData`-enriched `types[0]`, name-derived fallback for all 10 basics |
| **Double / Double Colorless** | counts as any two / any one | ✅ **cost counting**: `expandEnergyEntries()` (`attack-engine.mjs`) expands `double` → 2× its type, `double-colorless` → 2× Colorless; live attack path (`chat-buttons.js`) passes `{ type, family }` via `classifyEnergyEffect`; 137/137 tests green |
| **Special Energy letter cards** (e.g. **Razor Claw**, **M**/**R**/etc. named specials, **Switching Energy**, **Lock Energy**, **Buddy-Buddy**) | attach a modified type, lock, redirect, protect | ✅ **attach-type executed** (effective attached type honored in the live attack cost gate — `effectiveEnergyType()` in `energy-effects.mjs`; 6 new tests, 143/143 green) · **lock: ✅ executed** — attached-energy removal gate in `move-card.js` (~line 116), pure helpers `isLockEnergy` / `pokemonHasLockedEnergy` in `energy-effects.mjs`, tests in `rules-extended.test.mjs` · **redirect (Switching Energy): ✅ executed** — free-switch gate in `retreat()` (`chat-buttons.js`), pure helpers `isRedirectEnergy` / `pokemonHasRedirectEnergy` in `energy-effects.mjs`, tests in `rules-extended.test.mjs` · **protect (Buddy-Buddy): ✅ executed** — damage cap in `attack()` (`chat-buttons.js`), pure helpers `isProtectEnergy` / `pokemonHasProtectEnergy` / `applyProtectCap` in `energy-effects.mjs`, tests in `rules-extended.test.mjs` (simplified model: caps opponent-attack damage at 1 counter; full card also shields from non-damage effects) |
| **Attach limit** (1/turn) | `flags[user].energyAttached` | ✅ enforced in `canPerformAction` |

> **Parser state:** the energy's **type** (what it satisfies in a cost) is fully modeled,
> including Double/Double Colorless counting (Gap #4a done). The **effect** (what the card
> itself does on attach / while attached) is now fully executed (Gap #4b done): the `attach-type` family is executed (effective attached type honored in the live cost gate); the `lock` family is now executed (removal gate in `move-card.js` + `isLockEnergy` / `pokemonHasLockedEnergy` in `energy-effects.mjs`); the `redirect` (Switching Energy) family is now executed (free-switch gate in `retreat()`, `chat-buttons.js` + `isRedirectEnergy` / `pokemonHasRedirectEnergy` in `energy-effects.mjs`); the `protect` (Buddy-Buddy Energy) family is now executed (damage cap in `attack()`, `chat-buttons.js` + `isProtectEnergy` / `pokemonHasProtectEnergy` / `applyProtectCap` in `energy-effects.mjs`; simplified model: caps opponent-attack damage at 1 counter — the full card also shields from non-damage effects). All four special-energy effect families are now executed.

---

## G. Status conditions

`status.mjs` — `statusState` keyed by active `cardId` →
`{ asleep, paralyzed, poisoned, burned, confused }`.

> **Rule source (user-supplied, authoritative).** Confused: "Before attacking with a
> Confused Pokémon, flip a coin. Heads → the attack works normally. Tails → the attack
> doesn't happen and you place **3 damage counters (30 HP)** on your Confused
> Pokémon." Confusion is **permanent** — it is NOT cleared at turn end; it is removed
> only when the Pokémon **retreats, evolves, or a Trainer card clears the effect**.

| Condition | Applied | Enforced | Resolved | Status |
|---|---|---|---|---|
| **Asleep** | ✅ `applyStatus` | ✅ `canAct` (pure query) → `resolveWake` (heads clears, tails stays) | ✅ clears at turn end (`resolveTurnBoundary`) | ✅ solo live path |
| **Paralyzed** | ✅ `applyStatus` | ✅ `canAct` blocks attack/retreat, no coin flip | ✅ clears at turn end | ✅ solo live path |
| **Poisoned** | ✅ `applyStatus` | n/a | ✅ −10 at turn end (`resolveTurnBoundary`) | ✅ solo live path |
| **Burned** | ✅ `applyStatus` | n/a | ✅ coin-then-−20, heals on heads (`resolveTurnBoundary`) | ✅ solo live path |
| **Confused** | ✅ `applyStatus` + in `parseStatusFromAttackText` | ✅ `canAct` blocks → `resolveConfusedAttack` (heads proceeds, tails = 3 DC self-damage) | ✅ **intentionally not cleared** at turn end; cleared via `clearStatuses` on retreat/evolve/Trainer effect | ✅ solo live path |

> **Fixed in Phase 1 (verified, 171/171 tests green):**
> 1. **Confused now enforced** — pre-attack coin via `resolveConfusedAttack()`; tails
>    deals 30 HP to self and the attack does not happen; confusion **persists** in both
>    outcomes and is not cleared by `resolveTurnBoundary`.
> 2. **Pure query / mutation split** — `canAct()` never flips a coin or mutates state;
>    `resolveWake()` and `resolveConfusedAttack()` do the mutation. The old
>    side-effectful `canActThroughStatuses()` remains only as a deprecated
>    backward-compat wrapper.
> 3. **Mutual exclusion enforced** — `applyStatus()` "newest wins" within two
>    families: `TURN_SKIP = [asleep, paralyzed, confused]` and
>    `DAMAGE = [poisoned, burned]`. Cross-family coexistence is allowed (e.g. asleep +
>    poisoned).
>
> **Status (updated):** `canAct` / `resolveWake` / `resolveConfusedAttack` are now
> **executed in the live path (solo)** — `chat-buttons.js attack()` gates via `canAct`,
> resolves asleep via `resolveWake`, resolves confused via `resolveConfusedAttack`
> (tails = 3 DC self-damage, attack fizzles); turn-boundary resolve runs in
> `endTurnWithBanner`. `attack-engine.mjs` (`executeAttack`) remains dead code. The
> only remaining status gap is **multiplayer status-on-opponent**. Stronger than
> "no emitter sets `data.status`": `rulesEvent { type: 'attacked' }` is **never
> emitted** anywhere in the repo, so the `attacked` listener's status apply in
> `rules-bridge.js` is dead. Attack/pass sync uses action replay instead.

---

## H. Prize & KO rules

`ko-flow.mjs`.

| Rule | Where | Status |
|---|---|---|
| KO → prize count by card class | `prizesForKO()` — ex/double-rare→**3**, vmax→3, vstar/v/mega→2, else→1 | ✅ |
| **Win = all 6 prizes taken** | `awardPrizes()` (`won: total >= 6`) — **not** in `checkWinConditions` | ✅ |
| **Win = opponent has no Pokémon in play** | `checkWinConditions()` (active + bench both 0) | ✅ |
| **Win = opponent deck-out** | `checkWinConditions()` (`deckCounts[turnPlayer] === 0`) | ✅ |
| ex "take 2 extra prizes if KO'd" rule | `prizesForKO()` (ex → 3 total) | ✅ |
| GX "lose the match when KO'd" rule | `koOutcome()` → `{type:'matchLoss'}`, handled in `handleKO()` (`won: true`, reason) | ✅ |
| Promotion (bench → active after KO) | `planPromotion()` (`ko-flow.mjs`) decides; `chat-buttons.js` executes — KO'd active → discard, first bench promoted via `moveCard()`; bench KOs never promote | ✅ |
| Bench limit (5) | `BENCH_LIMIT`, `canAddToBench()` | ✅ |

---

## I. Turn structure (per player)

Enforced by `canPerformAction()` (`rules-state.mjs:120`) + the flags on
`rulesState.flags[user]`.

| Action | Rule | Enforced |
|---|---|---|
| Draw 1 (start of turn) | once, at turn start | ✅ auto-draw via `hookTurnStartDraw()` (`rules-bridge.js`) on `rules-turn-began`, guarded by the per-turn `drewThisTurn` flag (reset in `resetTurnFlags()`, `rules-state.mjs`); pure predicate `shouldAutoDrawAtTurnStart()`; tests in `rules-extended.test.mjs` |
| Attach 1 Energy | own turn, once | ✅ `flags[user].energyAttached` |
| Evolve | own turn, **not on turn 1** | ✅ `canPerformAction` + `canEvolve` (`evolution.mjs:7`) |
| Rare Candy (Basic→Stage 2) | jump-evolve | ✅ `canEvolve()` now permits the Basic→Stage 2 skip when `isRareCandyJump()` is true (item play itself is trainer guidance); tested in `rules-extended.test.mjs` |
| Retreat | own turn, **not after attacking** | ✅ `flags[user].attackerAttacked` |
| Attack | own turn, **not turn 1** for first player, once | ✅ `flags[user].attackerAttacked` |
| Pass | own turn | ✅ |
| **Attack/Pass ends the turn** | `endTurnWithBanner()` (`chat-buttons.js`) → `endTurn()` | ✅ (see AGENTS.md) |

---

## J. First-turn & mulligan restrictions

| Rule | Where | Status |
|---|---|---|
| First player can't attack or evolve on turn 1 | `canPerformAction` (attack/evolve cases) | ✅ |
| **Mulligan: both must have a Basic, else both re-mulligan** | `handHasBasic()` / `evaluateMulligans()` (`mulligan.mjs`) + auto-execution in `rules-bridge.js` | ✅ auto-reshuffle/redraw on mulligan (1P + 2P); tested in `mulligan.test.mjs` |
| **Bonus draw per opponent mulligan** | `bonusDrawsOwed()` (`mulligan.mjs:38`) + `rules-bridge.js` | ✅ auto-applied (1P local, 2P via `rulesSocket`); tested in `mulligan.test.mjs` |
| Turn-order coin flip on Set Up | `runTurnOrderCoinFlip()` (`rules-bridge.js`) | ✅ (see AGENTS.md) |

---

## Gaps & Future Work (cross-cutting)

Ranked roughly by "how much is missing to make a card actually work":

1. **Attack-effect execution in the live path** — **✅ done (solo).**
   Live `attack()` (`chat-buttons.js`) executes D-family effect text via
   `damage-parser.mjs` helpers (scaling damage, coin, bench, heal, draw, attach
   energy, switch, discard cost, shuffle-draw, once-per-turn, status, etc.) after
   the energy-cost gate and `computeAttackDamage` (weakness/resistance), then
   KO/prizes. The `attack-effects.mjs` classifier (`applyAttackEffect` always
   `executed: false`) remains announce-only and is **not** the live path.
   `executeAttack()` in `attack-engine.mjs` is still dead/unused. Remaining related
   gap: multiplayer status-on-opponent sync (Gap 6) — not D-family parsing.
2. **Ability execution** — **✅ core families done.**
   Classification still exists in `ability-effects.mjs` (announce-only
   `applyAbilityEffect`). Live execution: draw abilities auto-run from
   `hookTrainerPlay` / when-played paths; heal / switch / attach / search /
   energy-redirect via `chat-buttons.js` + attack-window / ability-picker;
   passives, end-of-turn, hand-protect, opponent-discard, cost discount via
   `ability-executors.mjs` + bridge hooks. Finer unparsed clauses remain out of
   scope; do not treat this gap as "only drawAbility works."
3. ~~**No stadium engine.**~~ — **state + replacement done**: `rulesState.stadium`
   slot + `markStadiumPlayed()`/`getStadium()` (`rules-state.mjs`, pure + tested),
   wired into `moveCard()` (hand→board) with a replacement announcement; UI discard
   via `update-stadium-card.js`; **classification** via new `stadium-effects.mjs`
   (`classifyStadiumEffect()` / `describeStadiumEffect()`), wired into `moveCard()`
   to emit a guidance line on placement.
   **Effect execution (all E families) ✅** — see §E: `applyStadiumEffect()` is
   executable, wired to the P1/P2 Stadium buttons (`stadiumEffect()` in
   `chat-buttons.js`), continuous effects (damage-prevention, retreat-prevention,
   hand-protect) hooked into the live attack/retreat/opponent-discard paths,
   once-per-turn gated via `stadiumUsed()`. Tests in `rules-extended.test.mjs`.
   HP / evolution-speed / attack-cost continuous modifiers are now **wired + tested**
   (see §E): HP → `effectiveHp()` at every KO site, evolution-speed → `canEvolve()`
   gate relax + `costReduce` surfaced, attack-cost → `parseStadiumCostModifier()`
   stacked on the live attack cost gate.
4. ~~**No special-energy effect engine**~~ — **✅ executed** (see §F).
   Classification remains in `energy-effects.mjs`. Live execution: Double /
   Double Colorless cost expansion (`expandEnergyEntries`); `attach-type`
   effective type in the cost gate; `lock` blocks attached-energy removal
   (`move-card.js`); `redirect` free-retreat path in `retreat()`; `protect`
   damage cap in `attack()` (simplified model — damage cap only, not a full
   non-damage shield). Align any leftover "announce-only" wording with §F.
5. ~~**Weakness/resistance multipliers never applied**~~ — **✅ done (math + live
   wiring).** Fields parsed via `ensureCardData`; `computeAttackDamage()` applies
   modern ×2 / legacy flat weakness and resistance; live `attack()` calls it.
   No remaining wiring work under this gap.
6. **~~Confused status is inert~~ / ~~mutual-exclusion not enforced~~ / ~~side-effectful
   `canActThroughStatuses`~~** — all three `status.mjs` defects (G) are **fixed and
   test-verified**; **solo live wiring is done** — `canAct` / `resolveWake` /
   `resolveConfusedAttack` run in `chat-buttons.js attack()`, with turn-boundary
   resolve in `endTurnWithBanner`. Remaining status gap: **multiplayer
   status-on-opponent**. Stronger than "no `data.status` on emit":
   `rulesEvent { type: 'attacked' }` itself is **never emitted** anywhere in the
   repo, so the `attacked` listener's status apply path is dead. Attack/pass sync
   uses `processAction` / `accept-action.js` replay instead.
7. ~~**No per-ability / per-card used-tracking** beyond the single
   `img.__rulesAbilityUsed` flag.~~ — **done**: `abilityKey()`/`markAbilityUsed()`/
   `abilityUsed()` (`rules-state.mjs`, pure + tested) track used abilities in
   `rulesState.flags[player].abilitiesUsed`, cleared by `resetTurnFlags()` each turn;
   `hookTrainerPlay` (`rules-bridge.js`) now uses these instead of the DOM flag.
   Tested in `rules-extended.test.mjs`.
8. ~~**Multiplayer relay gap**~~ — **COMPLETE (analysis; no code change required).**
   Verified in the action-flow code: real actions relay to the opponent as
   `pushAction` → `acceptAction('opp', …)` replay (`accept-action.js`: `emit =
   user === 'self' || isStateImport`; the receiver always replays with `user='opp'`).
   Therefore stadium + ability state **self-mirrors**: both clients record the same
   state via their own replay, which is exactly the intended mirroring.
   The supporter gate is already correctly scoped to the *acting* client by the
   existing `rulesState.turnPlayer === user` guard (`move-card.js`): on the receiver,
   `turnPlayer` reflects the acting client's own perspective (`'self'`), so
   `'self' === 'opp'` is false and the gate is skipped on replay — no double-gate,
   no double `markSupporterPlayed`. **Do NOT add a `user === 'self'` guard** there:
   in solo shared-browser mode P2 legitimately acts with `user='opp'`
   (`process-action.js` discriminator), so such a guard would let P2 play a second
   Supporter. The stadium block is unguarded by design (both clients must record it).
   Only residual: optional chat-announcement mirroring (not required).
9. ~~**Supporter / Item play limits not enforced** (A2)~~ — **done**: `supporterPlayGate()`
    + `supporterPlayed` flag (`rules-state.mjs`), wired into `moveCard()` before zone
    mutation; Items/Stadiums/Tools/Special Supporters bypass. Tested in
    `rules-extended.test.mjs`.
10. ~~**ex / GX KO special rules not modeled** (H)~~ — **done**: ex now awards **3** prizes
    (2 extra) via `prizesForKO()`; GX KO is a match loss via pure `koOutcome()` +
    `handleKO()` (`won: true`, `reason: 'opponent Pokémon GX was Knocked Out'`).
    `isExCard`/`isGxCard` use TCGdex `subtypes` with a name-suffix fallback (works
    before async card data loads). Tested in `rules-extended.test.mjs` (180/180 green).

---

## Appendix — module map (verified)

| Module | Key exports | Role |
|---|---|---|
| `rules-state.mjs` | `ensureCardData`, `canPerformAction`, `beginTurn`, `endTurn`, `markAttacked`, `markEnergyAttached`, `markEvolved`, `markPrizeTaken`, `markSupporterPlayed`, `supporterPlayGate`, `markStadiumPlayed`, `getStadium`, `abilityKey`, `markAbilityUsed`, `abilityUsed` | state + action gating |
| `attack-engine.mjs` | `computeAttackDamage`, `canPayAttackCost`, `executeAttack` (❌ dead) | damage/cost math — `computeAttackDamage` + `canPayAttackCost` wired into live `attack()` (`chat-buttons.js`); `executeAttack` still unused |
| `attack-window.mjs` | `listAttacks`, `listAbilities`, `listUsableActions` | pure, DOM-free: computes which attacks + abilities are currently usable (payable, cost discount, once-per-turn) for the attack-window UI + unit tests |
| `chat-buttons.js` (abilities) | `healAbility`, `switchAbility`, `attachAbility`, `energyRedirectAbility`, `searchAbility` | once-per-turn ability executors (taxonomy C families), each gated on turn; invoked from the attack-window ability rows |
| `attack-effects.mjs` | `ATTACK_FAMILIES`, `classifyAttackEffect`, `describeAttackEffect`, `applyAttackEffect` | attack-effect classifier (announce-only, unexecuted) |
| `damage-parser.mjs` | `DAMAGE_COMPONENTS` (incl. `per-hp`), `parseAttackDamage`, `describeParsedDamage`, `healTarget`, `planHeal`, `planBenchTarget`, `drawCount`, `attachEnergyCount`, `switchClause`, `oncePerTurnClause`, `allBenchDamage`, `discardCost`, `discardEnergyScaling`, `shuffleDrawClause` | damage-expression parser; `parseAttackDamage` accepts `attackerHp`/`defenderHp` ctx options (per-HP scaling, defender-side default); heal/bench/draw/attach-energy/switch/once-per-turn/multi-target/discard-cost/shuffle-cost helpers **executed** in live `attack()` (solo) |
| `status.mjs` | `applyStatus` (mutual exclusion), `canAct` (pure), `resolveWake`, `resolveConfusedAttack`, `resolveTurnBoundary`, `parseStatusFromAttackText`, `canActThroughStatuses` (deprecated) | status conditions |
| `ko-flow.mjs` | `prizesForKO`, `awardPrizes`, `checkWinConditions`, `handleKO`, `canAddToBench`, `isExCard`, `isGxCard`, `koOutcome` | KO / prizes / win |
| `evolution.mjs` | `canEvolve`, `isRareCandyJump`, `markEvolvedThisTurn` | evolution |
| `retreat.mjs` | `canRetreat`, `markRetreated`, `energiesToDiscardForRetreat` | retreat |
| `mulligan.mjs` | `handHasBasic`, `evaluateMulligans`, `bonusDrawsOwed` | mulligan (guidance) |
| `abilities.mjs` | `parseAbility` (guidance), `describeAbilityStep` | Pokémon abilities (guidance) |
| `trainer-effects.mjs` | `parseTrainerEffect`, `describeStep` | Trainer effect parser |
| `rules-bridge.js` | `initializeRulesEngine`, `autoExecuteTrainer`, `hookTrainerPlay`, `openDeckSearchWindow`, … | DOM orchestration |

`trainer-effects.mjs` branch order (load-bearing, do not reorder casually):
`discardHandThenDraw → shuffleHandThenDraw → searchDeck (+ optional discardCost +
trailing draw) → lookAtTop → switches → recursion → healAmount → heal →
attachFromDiscard → ionoShuffle (+ optional opponentDraw) → drawUntil →
evolveStage2 / moveEnergy / devolve / discardTools / … → trailing/bare draw
(late) → passive → unrecognizable`.

**Executed today**
- **✅ Auto:** `discardHandThenDraw`, `shuffleHandThenDraw`, `ionoShuffle`,
  `draw`, `drawUntil`, `opponentDraw`, Nest-Ball single-Basic `searchDeck`,
  `healAmount` (direct or heal picker)
- **✅ Guided:** generic `searchDeck`, `discardCost` → then search, `recursion`,
  `lookAtTop` (opens deck search window)
- **⚠️ Partial:** `switchOwn` (tip when bench size is 1)
- **Announce-only:** `switchOpponent`, `switchOpponentOut`, legacy `heal`,
  `attachFromDiscard`, `evolveStage2`, `moveEnergy`, `devolve`, `discardTools`,
  `discardFromOpponent`, `passive`

## Appendix — Attack window UI (verified)

A persistent side panel (`#rulesAttackWindow`) that lists the active Pokémon's
attacks and abilities with **current usability**, and lets the player pick which
one to execute. Previously "execute attack" was dead (hardcoded `attacks[0]`;
`executeAttack` in `attack-engine.mjs` never called). Now the attack is selectable.

**Split (pure vs. DOM):**
- `attack-window.mjs` — pure logic. `listAttacks(card, opts)` →
  `[{ index, name, cost, effectiveCost, damage, payable, onceUsed, reason, usable }]`;
  `listAbilities(card, opts)` → `[{ name, text, oncePerTurn, used, usable, reason }]`
  (or `[]`); `listUsableActions(card, opts)` → `{ attacks, abilities }`.
  `opts = { energyTypes:[{type,family}], stadiumCostModifier, abilityUsed, rulesEnabled }`.
  Applies passive cost discount (`passiveCostDiscount`) + stadium cost modifier
  (`parseStadiumCostModifier`) to compute `effectiveCost`, then `canPayAttackCost`
  for `payable`, and `oncePerTurnClause` + `abilityUsed` for the once-per-turn gate.
- `rules-bridge.js` — `buildAttackWindow()` (DOM), registered inside
  `initializeRulesEngine()`. Follows the `buildTurnHUD()` pattern: element creation,
  `refresh()` on `rules-turn-began` / `rules-mode-changed` + a 1.5 s `setInterval`.
  Visible when `rulesState.enabled && rulesState.turnPlayer === 'self' && phase !== 'ended'`.
  It gathers attached-energy types (same `classifyEnergyEffect` + `effectiveEnergyType`
  + type-regex fallback used by `attack()`), reads the stadium + `abilityUsed('self', active)`,
  then renders `listUsableActions(active, …)`.
- **Click wiring:** a usable attack row calls `attack('self', true, idx)` — the
  **3rd `attackIndex` param** (added this pass) selects `active.attacks[attackIndex]`
  instead of the hardcoded `attacks[0]`. A usable ability row dispatches to the
  family executor in `chat-buttons.js` (`healAbility` / `switchAbility` /
  `attachAbility` / `energyRedirectAbility` / `searchAbility`), keyed by
  `classifyAbility(active)`. Non-usable rows render a ✗ badge + reason and are
  not clickable.
- **CSS:** `.rules-aw-*` classes in `client/src/css/index.css` (title, section,
  row, clickable/hover, name, cost, dmg, badge usable/unusable, reason), consistent
  with the existing `.rules-hud-*` styling.
- **Imports:** `rules-bridge.js` imports `attack` + the five ability executors from
  `chat-buttons.js`. No circular dependency (chat-buttons imports only from
  `rules-state.mjs` and other pure modules, not from `rules-bridge.js`).
- **Unit tests:** the seven attack-window tests live in
  `client/src/setup/rules/__tests__/rules-extended.test.mjs` (already in the root
  `package.json` test list). Full suite: **194/194 green** (verified this pass).
