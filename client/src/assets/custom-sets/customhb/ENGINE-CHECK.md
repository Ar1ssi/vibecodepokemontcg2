# Homebrew set (customhb): rules-engine check

Cards: 690 (471 Pokémon; 75 Items, 42 Supporters, 44 Tools, 32 Stadiums; 9 basic and 17 special Energy).
Parts checked: 1135 (every attack, Ability and Trainer/Energy text).
Re-run: `node scripts/custom-sets/engine-check.mjs` (attacks through the oracle's rich board, abilities through the ability-behaviour classifier, Trainers through `classifyTrainer`).

Every card was audited in play (attacks with their secondary effects, Abilities, Items, Supporters, Tools, Stadiums, Special Energy). The texts the engine ran wrongly, partly or not at all are fixed and each has an engine test named by its HB number that reads the card's own text from `set.json`: `shared/engine/__tests__/customhb-*.test.mjs` (attacks, attacks2, attacks3, abilities1–4, trainers-tools, iron-burden), plus the Forest of Vitality test (`stadium-forest-of-vitality.test.mjs`).

The check script still lists 48 rows. All of them work in play; they are blind spots of its fixed test board, not engine gaps:
- **Abilities read outside the activated-Ability path** ("unconsumed"/"dead" there): type change (Multitype), Energy retyping (Gale Wings, Aura Break), cost and retreat changes (Pressure, Punk Out, Fast-Flight Configuration, Dimension Breach, Restricted Activation), damage (Moxie, Infiltrator), triggers (Dragon's Ambition, Egg Shell, Rebirth, Emergency Exit, Poison Heal), team immunities (Fairy Aura, Air Lock) and Mew ex *Restart* (draws to 4).
- **The board has no Special Energy, Stadium, Bench to snipe or Prize taken**: Special Energy discards (Derail, Crunch, Huge Bite, Thunderous Kick, Fleur Cannon), Stadium attacks (Blazing Destruction, Scorching Earth, Primordial Boom), Covetous Ivy, Gobble Down, Dragon Launcher, Law of the Underworld, Rumbling March, Supporting Act.
- **Choices the check script does not answer**: Energy attach searches (Geomancy, Geocharge, Overflowing Wishes), Magnetic Lift, Psyspeed, Plentiful Pollen.
- **Stadiums the Trainer classifier cannot label** (continuous effects): Altar of the Sunne, Broken Time-Space, Forest of Vitality, Magnetic Storm, Perilous Jungle, Shrine of Punishment, Temple of Sinnoh; and the turn-long bonus of Electropower.

## Engine limits to know
- HB 554 **Giratina ex** *Alpha Rage*: the chosen Pokémon's attack does its printed damage (with its own type against Weakness and Resistance); that attack's other effects do not run.
- HB 015 **Gloom** *Drowziness*: the −1 Retreat Cost is read, but an Asleep Pokémon cannot retreat under the rules, so it never shows in play.
- Landorus *Abundance* draws automatically (no prompt) and skips the draw when the deck holds one card.
