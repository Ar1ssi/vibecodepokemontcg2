# Homebrew set (customhb): rules-engine check

Cards: 299 (242 Pokémon, 57 Trainers).
Every part executes: 249 cards. With at least one gap: 50.
Parts checked: 527 — attacks 386 (damage-only 83), abilities 84, Trainer effects 57.

Method: each card's attacks run on the oracle's rich board over 8 seeds (scripts/lib/attack-behaviour.mjs), abilities through the ability-behaviour classifier, Trainers through classifyTrainer plus the Tool (tool-combat) and Stadium (stadium-effects) parsers. "Printed" = the same name + text is in the pkmncards corpus, so the printed card has the same limit.

## Wording slips (0) — run once reworded in cardback (closing period, "opponent's", "your opponent's Active Pokémon" for "the Defending Pokémon")

## Homebrew text the engine does not fully run (46)
- HB 001 **Weedle** (me04-001) — attack *Call for Swarm* `partial`: “Search your deck for up to 2 {G} Pokémon and put them on your Bench” — search-to-bench: search your deck for up to 2 {g} pokémon and put them on your bench
- HB 003 **Beedrill** (sv03.5-015) — ability *Hivemind* `unconsumed`: “Each of your {G} Pokémon does 30 more damage for any Beedrill in play (both yours and your opponent's)”
- HB 009 **Butterfree** (sv03.5-012) — attack *Bye-Bye Flight* `ran-no-effect`: “Choose 1 of your opponent's Benched Pokémon. Shuffle that Pokémon and all attached cards into their deck, and then shuffle this Pokémon and all attached cards into your deck. If your opponent has no Benched Pokémon, this attack does nothing.” — shuffle-self-deck: shuffle that pokémon and all attached cards into their deck, and then shuffle this pokémon and all attached cards into your deck.
- HB 015 **Gloom** (me02-002) — ability *Drowziness* `unconsumed`: “If this Pokémon is Asleep, its Retreat Cost is 1 less.”
- HB 018 **Grookey** (swsh4.5-11) — attack *Supporting Act* `partial`: “Search your deck for up to 2 Grookey cards and place them on your Bench. Then, shuffle your deck” — search-to-bench: search your deck for up to 2 grookey cards and place them on your bench.
- HB 020 **Rillaboom** (sv06-016) — ability *Grassy Surge* `unconsumed`: “During Pokémon Checkup, heal 10 damage from each {G} Pokémon in play.”
- HB 021 **Rillaboom ex** (swsh8-22) — attack *Drum Solo* `partial`: “If Rillaboom is your only Pokémon in play, this attack does 140 more damage” — unresolved-damage: conditional +140 bonus — resolve the printed condition
- HB 022 **Whimsicott** (sv08.5-008) — attack *Cotton Breeze* `ran-no-effect`: “Move all damage counters from one of your Benched Pokémon onto the Defending Pokémon” — move-damage: move all damage counters from one of your benched pokémon onto the defending pokémon
- HB 022 **Whimsicott** (sv08.5-008) — ability *Prankster* `unconsumed`: “Neither Active Pokémon can recover from sleep during Pokémon Checkup, except Whimsicott”
- HB 025 **Amoonguss** (swsh12-012) — ability *Disarming Spore* `unconsumed`: “If this Pokémon is Knocked Out during your opponent's turn, discard 3 cards from your opponent's hand.”
- HB 026 **Amoonguss ex** (sv09-011) — attack *Champignon's Swing* `partial`: “Flip a coin. If heads, discard a Basic Energy from your opponent's Active Pokémon.” — discard-opp-energy: if heads, discard a basic energy from your opponent's active pokémon.
- HB 040 **Garchomp ex** (swsh10-117) — attack *Scale Shot* `partial`: “Flip 4 coins. This attack does 20 damage for each heads. If all of them are heads, attach a Basic Energy card from your discard pile to this Pokémon.” — attach-from-discard: if all of them are heads, attach a basic energy card from your discard pile to this pokémon.
- HB 041 **Garchomp** (bw6-90) — attack *Crunch* `partial`: “Discard a Special Energy attached to the Defending Pokémon.” — discard-opp-energy: discard a special energy attached to the defending pokémon.
- HB 055 **Kommo-o** (sm4-77) — attack *War Cry* `partial`: “If you have fewer Pokémon in play than your opponent, this attack does 90 more damage.” — unresolved-damage: conditional +90 bonus — resolve the printed condition
- HB 073 **Charmander** (sv03.5-004) — attack *Blazing Destruction* `ran-no-effect`: “Discard a Stadium in play.”
- HB 082 **Greninja ex** (sv07-041) — ability *Pain Points* `unconsumed`: “This Pokémon's attacks are not affected by Abilities or Resistance.”
- HB 083 **Heatran** (me05-007) — ability *Burning Will* `unconsumed`: “During Pokémon Checkup, put 1 additional damage counter on your opponent's Burned Pokémon.”
- HB 085 **Kartana** (sma-SV33) — ability *Beast Boost* `unconsumed`: “If this Pokémon Knocked Out your opponent's Active Pokémon during your previous turn, the attacks of this Pokémon cost 2 {M} less this turn. This effect doesn't stack.”
- HB 107 **Landorus** (me03-041) — ability *Abundance* `unconsumed`: “As long as this Pokémon is in play, you may draw a card at the start of your opponent's turn.”
- HB 114 **Galarian Zapdos ex** (swsh6-80) — attack *Bulk Up* `ran-no-effect`: “As long as this Pokémon remains in the Active Spot, its attacks do 30 more damage and it takes 30 less damage. This effect doesn't stack.”
- HB 114 **Galarian Zapdos ex** (swsh6-80) — ability *Fighting Instinct* `unconsumed`: “This Pokémon's attacks cost {C} less for each of your opponent's Pokémon ex in play.”
- HB 116 **Galarian Moltres ex** (swsh6-97) — attack *Fiery Wrath* `partial`: “If this Pokémon has less than 70 HP, this attack does 80 more damage.” — unresolved-damage: conditional +80 bonus — resolve the printed condition
- HB 124 **Dragapult** (swsh12-089) — attack *Dragon Launcher* `ran-no-effect`: “Discard a number of your Benched Dreepy up to the number of your opponent's Pokémon in play. Then, for each Dreepy you discarded in this way, choose 1 of your opponent's Pokémon and do 100 damage to it. You can't choose the same Pokémon more than once. This damage isn't affected by Weakness or Resistance.”
- HB 128 **Volcarona** (sv08-025) — ability *Flame Body* `unconsumed`: “If this Pokémon was attacked last turn, flip a coin. If heads, your opponents Active Pokémon is now Burned.”
- HB 132 **Tapu Bulu** (sv06.5-006) — ability *Grassy Surge* `unconsumed`: “During each Pokémon Checkup, heal 10 damage from each {G} Pokémon in play.”
- HB 139 **Hisuian Samurott ex** (swsh10-101) — ability *Ancient Hazard* `unconsumed`: “If your opponent's Active Pokémon is switched, put 3 damage counters on the new Active Pokémon.”
- HB 143 **Gardevoir** (swsh6-61) — attack *Psyshock* `partial`: “This attack does 50 more damage for each Pokémon ex your opponent has in play.” — unresolved-damage: per-pokémon ex your opponent has in play. scaling — resolve the printed count
- HB 156 **Metagross** (me04-061) — ability *Analysis* `unconsumed`: “Flip a coin. If heads, your opponent reveals a random card from their hand.”
- HB 159 **Kingambit** (me02.5-148) — ability *Supreme Overlord* `unconsumed`: “Attacks used by this Pokémon do 10 more damage to your opponent's Active Pokémon for each Prize card your opponent has taken (before applying Weakness and Resistance).”
- HB 160 **Mawile** (me02.5-144) — ability *Energy Crunch* `partial`: “When you play this Pokémon from your hand onto your Bench, you may discard 1 Energy from 1 of your opponent's Pokémon.” — clause:discard-opp-energy
- HB 167 **Alakazam ex** (sv03.5-065) — attack *Spoon Bend* `partial`: “If the opponent's Active Pokémon has any {M} Energy attached, this attack does 30 more damage” — unresolved-damage: conditional +30 bonus — resolve the printed condition
- HB 168 **Alakazam** (me01-056) — attack *Card Trick* `partial`: “For each {P} Energy attached to this Pokémon, discard 1 card from your opponent's hand” — discard-opp-hand: for each {p} energy attached to this pokémon, discard 1 card from your opponent's hand
- HB 171 **Cresselia** (me02-039) — ability *Lunar Healing* `unconsumed`: “While this Pokémon is in play, your Active Pokémon can't become Asleep. If your Active Pokémon is already Asleep, it immediately recovers from being Asleep.”
- HB 176 **Klefki** (sv04.5-159) — attack *Return Keys* `partial`: “Move all attached Energy and Pokémon Tools from this Pokémon to 1 of your Benched Pokémon. Then, discard this Pokémon.” — move-energy: move all attached energy and pokémon tools from this pokémon to 1 of your benched pokémon.
- HB 176 **Klefki** (sv04.5-159) — ability *Fairy Lock* `unconsumed`: “The Weakness of each of your opponent's {N} Pokémon in play is now {P}. (Apply Weakness as x2)”
- HB 178 **Palossand** (sv06-092) — ability *Water Compaction* `unconsumed`: “aaa”
- HB 179 **Cofagrigus** (sv08-083) — attack *Law of the Underworld* `ran-no-effect`: “Put 6 damage counters on each Pokémon that has an Ability (both yours and your opponent's).” — counters-opp: put 6 damage counters on each pokémon that has an ability (both yours and your opponent's).
- HB 201 **Alolan Ninetales** (sm3-28) — ability *Luminous Barrier* `unconsumed`: “Prevent all effects of attacks, including damage, done to this Pokémon by your opponent's Pokémon-EX.”
- HB 208 **Tapu Fini** (smp-SM92) — attack *Shining Currents* `partial`: “If any of your Water Pokémon were healed during this turn, this attack does 60 more damage.” — unresolved-damage: conditional +60 bonus — resolve the printed condition
- HB 214 **Quagsire** (svp-156) — attack *Drenched Headbutt* `ran-no-effect`: “Discard up to the top 3 cards of your deck, and this attack does 80 damage for each card you discarded in this way.”
- HB 214 **Quagsire** (svp-156) — ability *Unaware* `unconsumed`: “This Pokémon ignores all effects that increase damage from your opponent's Active Pokémon.”
- HB 247 **Weavile** (swsh9-087) — attack *Ransack* `ran-no-effect`: “Flip 2 coins. If either of them is heads, your opponent reveals their hand. For each heads, choose a card you find there and put it on the bottom of your opponent's deck in any order.”
- HB 249 **Yveltal** (me01-088) — ability *Life-Locked* `unconsumed`: “If this Pokémon is in play, your opponent's Active Pokémon can't be healed.”
- HB 264 **Magnezone** (xy8-54) — ability *Magnetic Pull* `unconsumed`: “If your opponents Active Pokémon is a {M} type, it can no longer retreat.”
- HB 267 **Flaaffy** (svp-015) — ability *Protective Fluff* `unconsumed`: “This Pokémon is immune to all Special Conditions”
- HB 272 **Alolan Golem** (sv09-046) — ability *Electrum Deposit* `partial`: “You may use this Ability once during your turn. Flip a coin, if heads, search your deck for a {L} Energy and attach to one of your Pokémon.” — clause:attach-from-deck

## Printed text with a known engine limit (9)
- HB 059 **Dragapult** (swsh2-91) — ability *Infiltrator* `unconsumed`: “If any damage is done to this Pokémon by attacks, flip a coin. If heads, prevent that damage.”
- HB 070 **Gengar ex** (sv05-104) — ability *Gnawing Curse* `unconsumed`: “Whenever your opponent attaches an Energy card from their hand to 1 of their Pokémon, put 2 damage counters on that Pokémon.”
- HB 114 **Galarian Zapdos ex** (swsh6-80) — attack *Thunderous Kick* `partial`: “Before doing damage, discard a Special Energy from your opponent's Active Pokémon.” — discard-opp-energy: before doing damage, discard a special energy from your opponent's active pokémon.
- HB 198 **Old Cemetery** (swsh6-147) — trainer *Old Cemetery* `gap`: “Whenever any player attaches an Energy card from their hand to 1 of their non-{P} Pokémon, put 2 damage counters on that Pokémon.” — passive-only; no Tool/Stadium parser reads it
- HB 219 **Jellicent** (swsh5-42) — ability *Spiteful Spirit* `unconsumed`: “If this Pokémon is your Active Pokémon and is Knocked Out by damage from an opponent's attack, the Attacking Pokémon is now Confused and Poisoned.”
- HB 231 **Mamoswine ex** (sv09-079) — attack *Rumbling March* `partial`: “This attack does 40 more damage for each Stage 2 Pokémon on your Bench.” — search-to-bench: this attack does 40 more damage for each stage 2 pokémon on your bench.
- HB 242 **Greninja** (xyp-XY24) — ability *Mist Concealment* `partial`: “When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may prevent all effects of attacks, including damage, done to this Pokémon by your opponent's Pokémon during your opponent's next turn.” — no executor: whenPlayedAbility
- HB 262 **Magnemite** (xy8-51) — ability *Sparkling Induction* `unconsumed`: “As long as this Pokémon is your Active Pokémon, its Retreat Cost is {C} less for each Magnemite on your Bench.”
- HB 276 **Electropower** (sm8-172) — trainer *Electropower* `gap`: “During this turn, your {L} Pokémon's attacks do 30 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).” — passive-only
