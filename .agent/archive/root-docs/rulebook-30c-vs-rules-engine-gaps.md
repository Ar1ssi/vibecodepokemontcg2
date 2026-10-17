# Rulebook 30c (Sept 2026) vs Rules Engine — Gap Analysis

Source: [Pokémon TCG Rulebook, last updated September 2026 (`30c_rulebook_en.pdf`)](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/30c_rulebook_en.pdf)
Engine reviewed: `shared/engine/**` (server-authoritative reducer) plus the legacy client-authoritative rules path (`client/src/actions/chat-buttons`, `client/src/setup/rules/rules-bridge.js`, `shared/engine/rules/ko-flow.mjs`).
Method: rulebook full text extracted and read; each rule area traced to the code that implements it. Findings below are only what is **not** accounted for (or is accounted for incorrectly). Line numbers are the evidence.

## Severity legend
- **P0** — wrong game outcome / exploitable / silently changes who wins.
- **P1** — wrong card legality, wrong prize count, or a whole rule family missing.
- **P2** — edge-case, legacy-path-only, or documentation drift.

> Note on architecture: there are two live rule paths. The **server-authoritative** path is `shared/engine/reduce.mjs` (used when `SERVER_AUTHORITATIVE=1`). The **legacy client** path is `ko-flow.mjs` → `chat-buttons.js` / `rules-bridge.js`. Some findings affect only one of them; each is labelled.

---

## Findings at a glance

| # | Rulebook area | Engine status | Severity | Path |
|---|---|---|---|---|
| 1 | Simultaneous win / tiebreaker game (p.21) | Missing entirely | P0 | both |
| 2 | VSTAR Power / GX attack "once per game" (App. 9, 19) | Marker reset every turn; GX+VSTAR share one flag | P0 | server |
| 3 | GX knockout = 2 prizes (App. 19) | Legacy path declares **immediate match loss** | P0 | legacy |
| 4 | Mega/Primal "your turn ends" (App. 26) | Only client-side; server never ends turn | P0 | server |
| 5 | Prize counts: TAG TEAM / V-UNION / legacy Mega-EX (App. 10, 16, 26) | Wrong or absent | P1 | both |
| 6 | Deck: at least one Basic Pokémon (p.22) | Not checked | P1 | deck |
| 7 | Deck: only **Basic** Energy exempt from 4-copy limit (p.22) | All Energy exempt | P1 | deck |
| 8 | Deck: 4-copy limit keyed to official name rules (p.21) | Raw display-name grouping | P1 | deck |
| 9 | ACE SPEC one total per deck (App. 3) | Not checked | P1 | deck |
| 10 | Radiant max 1 (App. 8) | Not checked | P1 | deck |
| 11 | Prism Star one-per-name + Lost Zone redirect (App. 17) | Not checked / no redirect | P1 | both |
| 12 | V-UNION play rules (App. 10) | Missing; misclassified as Basic | P1 | both |
| 13 | Restored Pokémon play restriction (App. 28) | Missing; misclassified as Basic | P1 | both |
| 14 | BREAK Evolution inheritance (App. 22) | Missing | P1 | both |
| 15 | Mulligan bonus draws = **extra** mulligans (p.18) | Over-awards one card per mulligan | P1 | server |
| 16 | Rule-box definition (App. 8) | `prizes>1` heuristic misses Radiant/V-UNION | P1 | both |
| 17 | Evolution name matching incl. Level / V-stages (p.21, App. 12/13) | Level not normalised; V-suffixes stripped, so VMAX can evolve from a non-V base | P1 | both |
| 18 | Team Flare Hyper Gear attaches to opponent's Pokémon-EX (App. 24) | Tool attach restricted to own Pokémon | P2 | server |
| 19 | Ancient Traits are not Abilities (App. 23) | Parsed as Abilities | P2 | both |
| 20 | Special Conditions only on the Active (p.15) | Manual command can target any card | P2 | server |
| 21 | Pokémon LEGEND (glossary) | Not modelled | P2 | both |

---

## Detail

### 1. Simultaneous win and the tiebreaker game are not implemented — P0
- **Rule (p.21):** if both players satisfy a win condition at the same time, play a tiebreaker game; if one player wins two ways and the other one way, the two-way player wins.
- **Engine:** `reduce.mjs:609-628` resolves the attacker's prize win **before** checking the victim's "no Pokémon in play" loss, then picks a single winner. There is no tie/`both-win` state and no tiebreaker game mode anywhere in the repo (search for `tiebreak` finds only unrelated comments).
- **Impact:** a genuine simultaneous finish silently awards one player instead of a tiebreak. No rail for the tiebreak rules (first Prize taken wins, other win conditions still apply).
- **Fix shape:** represent `{ winner, loser, simultaneous }` in `setGameEnded`, stop short of `phase:'ended'`, and re-use `setupGame` for the tiebreak with a `firstPrizeWins` flag.

### 2. VSTAR Power / GX attack once-per-game limit is lost each turn — P0 (server)
- **Rule (App. 9, 19):** a player can use only **one VSTAR Power per game**, and only **one GX attack per game** — independent limits.
- **Engine:** the marker lives on `player.flags.vstarUsed` / `player.flags.gxUsed` (`reduce.mjs:3177-3187`), but `advanceTurn` **replaces the whole flags object** every time that player's turn begins (`reduce.mjs:976-987`). The guard at `reduce.mjs:1859-1866` therefore only blocks reuse within the current turn.
- **Also:** `useVStarGX` sets **both** `vstarUsed` and `gxUsed` together, so a VSTAR Power consumes the GX allowance and vice-versa — they should be tracked separately.
- **Impact:** players can recur their one-per-game power each turn; the two systems cross-cancel.
- **Fix shape:** move these to a per-game, per-player field that `advanceTurn` does not rebuild (e.g. alongside `draft.nextInstanceId`), and split the two flags.

### 3. Legacy path treats a GX knockout as an immediate match loss — P0 (legacy)
- **Rule (App. 19):** when a Pokémon-GX is Knocked Out, the opponent takes **2 Prize cards** — there is no match loss.
- **Engine:** `ko-flow.mjs:63-70` (`koOutcome` returns `{type:'matchLoss'}` for any GX) and `ko-flow.mjs:107-120` (`handleKO` sets `won: true, reason:'opponent Pokémon GX was Knocked Out'`). This is the live legacy path, imported by `chat-buttons.js:51` and `rules-bridge.js:34`.
- **Also:** `README.md:137` documents "ex → 3 prizes, GX → immediate match loss"; the first is already wrong (`prizesForKO` returns 2 for ex) and the second is wrong per the rulebook.
- **Impact:** any legacy-mode game ends on the first GX knockout. Competitively meaningless.

### 4. Server-authoritative mode never enforces the Mega/Primal turn-end — P0 (server)
- **Rule (App. 26):** when one of your Pokémon becomes a Mega Evolution Pokémon-EX (or Primal Reversion), your turn ends.
- **Engine:** the check exists only client-side: `requiresTurnEndOnEvolve` (`evolution.mjs:387-391`) is called from `client/src/actions/move-card-bundle/move-card.js:607` and dispatched as a DOM event. `reduce.mjs` has no reference to it.
- **Impact:** under `SERVER_AUTHORITATIVE=1` the turn does not end; a legacy Mega/Primal can evolve and keep acting.

### 5. Prize counts for TAG TEAM, V-UNION and legacy Mega-EX — P1
`prizesForKO` (`ko-flow.mjs:44-55`) uses name/subtype heuristics:
- **TAG TEAM (App. 16): should award 3.** No TAG TEAM detection exists anywhere in `shared/` (grep returns zero). TAG TEAM names end in `-GX`, so `isGxCard` matches and awards **2**.
- **V-UNION (App. 10): should award 3.** No detection. `isVCard` (`tool-combat.mjs:62-71`) includes `v-union` for type purposes, but `prizesForKO` falls through to `isV` → **2** (or 1 if subtypes/name aren't parsed).
- **Legacy Mega Evolution Pokémon-EX (App. 26): should award 2.** `isMegaCard` returns true for all Megas, so a legacy `M Venusaur-EX` gets **3** — while the engine already distinguishes modern vs legacy Mega elsewhere (`isModernMegaCard`/`isLegacyMegaOrPrimalCard`, `evolution.mjs:346-364`).
- Pokémon LEGEND (glossary) is not modelled at all.

### 6. Deck validation does not require a Basic Pokémon — P1
- **Rule (p.22):** "your deck must have at least one Basic Pokémon."
- **Engine:** `client/src/setup/deck-builder/core/deck-validation.mjs` checks size (`:51-53`) and copies (`:58-67`) only. No Basic check exists.
- **Impact:** illegal decks are accepted; mulligan/setup can then loop to the `maxMulligans` guard in `setup.mjs:86`.

### 7. Only *Basic* Energy is exempt from the 4-copy limit — P1
- **Rule (p.22):** "except for **Basic Energy**, you can only have 4 cards with the same name."
- **Engine:** `deck-validation.mjs:10,17` set `exemptSupertypes: ['Energy']` and `:63` exempts any `supertype === 'Energy'`. **Special Energy** is therefore unlimited.
- **Impact:** a deck can contain 10 copies of a Special Energy.

### 8. Copy limit is not keyed to the official name rules — P1
- **Rule (p.21):** Level is **not** part of the name (`Gengar`, `Gengar LV.43`, `Gengar LV.X` are one name); trailing symbols and owner/form **are** (`Meowth` ≠ `Alolan Meowth` ≠ `Rocket's Meowth`); Team Plasma is **not** part of the name.
- **Engine:** `validateDeck` groups by the raw display key `cardName` (`deck-validation.mjs:58`). So `Gengar`, `Gengar LV.43` and `Gengar LV.44` each get their own 4-copy allowance, and `Team Plasma Liepard` + `Liepard` are counted separately. The only name normaliser (`cleanPokemonName`, `evolution.mjs:90-99`) strips `ex/gx/vmax/vstar/v` (the **opposite** of the rule) and does not strip `LV.` levels.
- **Impact:** both over- and under-counting of copies depending on printing; the normaliser is also wrong for the evolution rules it *is* used for (see #17).

### 9–11. Per-deck limits for ACE SPEC, Radiant, Prism Star — P1
- **ACE SPEC (App. 3):** only **one ACE SPEC total** per deck. No validation anywhere (`ace spec` appears only in rarity/holo cosmetics).
- **Radiant (App. 8):** max one Radiant Pokémon per deck. No validation.
- **Prism Star (App. 17):** max one per name, and "if a Prism Star card would go to the discard pile, put it in the Lost Zone instead." No validation, and no redirect: `lostZone` is a real zone (`state.mjs:16`, `view.mjs:56`, `zone-hash.mjs:83`) and `lostZoneAll`/`lostZoneBoard` commands exist (`reduce.mjs:3484-3490`, `3706-3712`), but nothing routes a Prism Star discard into it.

### 12. Pokémon V-UNION play rules — P1
- **Rule (App. 10):** all four pieces share one name (4 total, same set/artist); played as a set from the discard pile onto the Bench; once per game per name; not Basic and not Evolution; 3 prizes; counts as "Pokémon V" and as a Rule Box while in play.
- **Engine:** no V-UNION handling in `shared/`. Worse, `isBasicPokemon` (`cards.mjs:154-168`) only rejects stages `stage1/stage2/vmax/vstar/mega`, so a `V-UNION`-staged card is classified as a **Basic** — it can be an opening Active, satisfy the mulligan Basic requirement, and be played from hand.
- **Same defect** applies to stages `Restored` and `BREAK` (see #13, #14): neither is in `NON_BASIC_STAGES`.

### 13. Restored Pokémon — P1
- **Rule (App. 28):** a Restored Pokémon can only come into play via the associated Fossil Item; it is **not** Basic and **not** Evolution; "Basic/Stage/Evolution" search effects don't affect it, but "unevolved Pokémon" effects do.
- **Engine:** `fossilItem` exists as a Trainer step (`trainer-steps.mjs:732`, parsed at `trainer-effects.mjs:775-778`) and `trainer-play-conditions.mjs:69` counts it for bench-full, but there is no gate preventing a Restored Pokémon from being played straight from hand, and `isBasicPokemon` returns `true` for it.
- Fossil Trainers being "not Basic while in hand/deck/discard" is implicitly fine (`isPokemon` is false for Trainer supertype), but the Restored card itself is misclassified.

### 14. BREAK Evolution inheritance — P1
- **Rule (App. 22):** a Pokémon BREAK keeps the attacks, Abilities, Weakness, Resistance and Retreat Cost of its previous Evolution, gains its own, and is a new stage `BREAK` (counts as an Evolution card).
- **Engine:** no `BREAK` handling in `shared/` (grep finds none). `evolvedView` reads an in-play Pokémon as its top card only, so the base's attacks/Abilities/Weakness/Resistance/Retreat are lost, and `isBasicPokemon` treats `BREAK` as Basic.
- Gen 6 note: the rulebook's modern reprint makes old BREAK/EX/Mega mostly historical, but the engine already handles legacy Mega/Primal (`evolution.mjs:337-391`), so this is an intentional-consistency gap.

### 15. Mulligan bonus draws over-awarded — P1 (server)
- **Rule (p.18):** the non-mulliganing player draws one card **for each extra mulligan** their opponent took (net), e.g. both took 2 then A took 3 more → B draws 3.
- **Engine:** `setup.mjs:118-131` awards a bonus card to the opponent for **every** mulligan taken, including the ones both players took in lockstep.
- **Impact:** when both players mulligan the same number of times, both wrongly draw extra cards.

### 16. Rule-box detection is inconsistent — P1
- `ko-flow.mjs:58-61` defines `cardHasRuleBox` as `prizesForKO(card) > 1`. That is **false for Radiant** (correctly 1 prize but the rulebook says Radiant is a Rule Box Pokémon) and **false for V-UNION** (because #5 mis-scores it). `search-match.mjs:127-134` uses this definition for "with/without a Rule Box" searches, so Radiant Pokémon are wrongly returned as "without a Rule Box".
- A second, subtype-based definition `pokemonHasRuleBox` (`stadium-effects.mjs:499-514`) lists `ex/gx/v/vstar/vmax/tera/radiant/prism star/ace spec` but **omits TAG TEAM and V-UNION**. Two definitions that disagree, used by different call sites (`reduce.mjs:1479` vs `search-match.mjs`).

### 17. Evolution name matching conflicts with the name rules — P1
- `cleanPokemonName` (`evolution.mjs:90-99`) strips `ex|gx|vmax|vstar|v` as suffixes. This makes `Lapras VMAX` match a plain `Lapras`, so the rulebook's "VMAX can only evolve from V" (App. 13, same for VSTAR App. 9) is not enforced.
- It does **not** strip `LV.` levels, so `Gengar` and `Gengar LV.43` are treated as different species for `pokemonNamesMatch`, opposite to p.21.
- Team Plasma / owner / form words are preserved (good for App. 2/14/27), but the level/symbol handling is inverted relative to the rulebook.

### 18. Team Flare Hyper Gear cannot be attached to the opponent — P2 (server)
- **Rule (App. 24):** these Tools attach to your **opponent's** Pokémon-EX.
- **Engine:** `attachCard` rejects a target whose `playerId !== playerId` (`reduce.mjs:1202-1210`) and Tool attachment requires a Pokémon in play owned by the actor (`reduce.mjs:1504-1522`). The card is effectively unplayable.

### 19. Ancient Traits are parsed as Abilities — P2
- **Rule (App. 23):** Ancient Traits are "not attacks or Abilities," so effects that block/remove Abilities must not affect them.
- **Engine:** `abilities.mjs` explicitly parses `α Growth`-style and `Ω Barrier`-style traits as ability steps (`abilities.mjs:342`, `:783`). Anything that suppresses "Abilities" will therefore also suppress Ancient Traits.

### 20. Special Conditions can be placed on non-Active Pokémon (manual tool) — P2
- **Rule (p.15):** Special Conditions can only happen to an Active Pokémon.
- **Engine:** the manual `addSpecialCondition` command applies to any card found by `findCard` (`reduce.mjs:2280-2286`); it is turn-gated but not Active-gated. Parsed card effects target the Active, so this is a manual-tool hole rather than a card-effect hole.

### 21. Pokémon LEGEND not modelled — P2
- **Rule (glossary):** double cards played together, 2 prizes. No representation, prize count, or combined-card handling.

---

## Areas verified as **accounted for** (for balance)

These rulebook areas were checked and are implemented correctly, so they should not be re-audited as gaps:

- **Turn structure** — draw at turn start with deck-out loss (`reduce.mjs:1003-1017`); first player skips the attack step (`reduce.mjs:1581-1585`); energy once/turn (`reduce.mjs:1446`, `:2204-2208`); retire once/turn; Supporter once/turn and no turn-1 Supporter (`trainer-play-conditions.mjs:48`); one Stadium/turn and no same-name Stadium (`trainer-play-conditions.mjs:52-59`); abilities as many as you like (`rules-state` ability markers).
- **Special Conditions** — rotation vs marker model is correct and matches "only one of Asleep/Confused/Paralyzed, Poison/Burn coexist" (`special-conditions.mjs`); checkup order Poison → Burn → Asleep → Paralyze (`reduce.mjs:671-687`); Burn damage **then** cure flip; Asleep coin flip at checkup; Paralysis clears at the end of the owner's turn; Confusion persists and fizzles on tails for 3 counters (`reduce.mjs:2402-2420`); conditions clear on evolve/bench/retreat (`reduce.mjs:943`, `:2131`, `:2220`).
- **Damage calculation order** — base → attacker effects → Weakness → Resistance → defender effects → counters (`attack-engine.mjs:16-108`), with dual-type Weakness/Resistance (`:47-64`), no W/R for Benched (`defenderIsActive`), and "damage counters ignore W/R" handled in the parser.
- **Mulligan / setup** — 7-card hands, 6 prizes, both-mulligan restart, first-turn draw (`setup.mjs:54-178`).
- **Stadium** — overwrite discards the old Stadium and ends it (`stadium-overwrite` tests; `discardCurrentStadium`).
- **Tera Pokémon ex** — Bench attack-damage immunity (`reduce.mjs:226-227`, `:537`).
- **Retreat** — cost discard, free at 0, Asleep/Paralyzed block, can still attack after retreating, attachments/damage stay with the Pokémon (`retreat.mjs`, `reduce.mjs:1580-1679`).
- **Lost Zone zone plumbing** — zone exists in state/view/hash and mass-move commands (`state.mjs:16`, `commands.mjs:631/940`, `reduce.mjs:3484/3706`); only the Prism Star redirect (#11) is missing.

---

## Suggested priority order

1. **P0:** GX match-loss (#3) and the once-per-game flag reset (#2) — both make whole games wrong.
2. **P0:** tiebreaker/simultaneous win (#1) and server Mega turn-end (#4).
3. **P1:** prize counts (#5) and `isBasicPokemon` stages (#12/#13/#14) — these feed setup, mulligans and win detection.
4. **P1:** deck-legality suite (#6-#11) — one module (`deck-validation.mjs`) can cover most of it.
5. **P1:** name normalisation (`cleanPokemonName`) and rule-box unification (#16/#17).
6. **P2:** the remaining card-era appendices (#18-#21).

## Confidence notes
- Findings #1-#17 were read directly in source and cross-checked against multiple call sites.
- #18-#21 are source-verified but lower impact; #20 is a manual-tool-only hole.
- The rulebook's card-text semantics ("up to" vs "any amount", attack mini-steps A-F) are implemented via the parser/choice (`min`/`max`) layer and were not exhaustively card-by-card audited; the specific "up to vs any amount" distinction for attack vs non-attack effects is not separately modelled and may produce off-by-one choices on unusual cards.
