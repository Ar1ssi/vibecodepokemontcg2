# Homebrew set (customhb): rules-engine check

Cards: 299 (242 Pokémon, 57 Trainers).
Parts checked: 527 — attacks 386, abilities 84, Trainer effects 57.
Re-run: `node scripts/custom-sets/engine-check.mjs` (attacks through the oracle's rich board, abilities through the ability-behaviour classifier, Trainers through `classifyTrainer`).

Every attack and ability text has an engine test (`shared/engine/__tests__/customhb-*.test.mjs`, one test per card named by its HB number). The check script still lists 10 rows; all 10 are blind spots of its test board, not engine gaps.

## Listed by the check script but covered by engine tests
The check script's board has no Pokémon with Abilities, no Special Energy, no Stadium and no card named like the one searched for, so these read as "no effect" there:
- HB 018 Grookey *Supporting Act*, HB 040 Garchomp ex *Scale Shot* (needs all heads), HB 041 Garchomp *Crunch*, HB 073 Charmander *Blazing Destruction*, HB 114 Galarian Zapdos ex *Thunderous Kick*, HB 124 Dragapult *Dragon Launcher*, HB 179 Cofagrigus *Law of the Underworld*, HB 231 Mamoswine ex *Rumbling March*.
- HB 276 **Electropower**: works through the turn damage-bonus reader (the Trainer classifier labels any such text passive-only).
- HB 178 **Palossand** *Water Compaction*: the check script's board has no attacker with {W} Energy (its engine test does).

## Engine limits to know
- HB 015 **Gloom** *Drowziness*: the −1 Retreat Cost is read, but an Asleep Pokémon cannot retreat under the rules, so it never shows in play.
- Landorus *Abundance* draws automatically (no prompt) and skips the draw when the deck holds one card.
