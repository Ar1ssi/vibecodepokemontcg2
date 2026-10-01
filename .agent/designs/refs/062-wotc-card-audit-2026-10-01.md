# Gen 1 / Gen 2 card-effect audit — 2026-10-01

Read-only audit of every attack, Pokémon Power, Trainer and Stadium printed in the WotC Gen 1/2
sets. Nothing in the engine was changed. Findings are filed as I224–I230 in `.agent/ISSUES.md`.

## Scope and corpus
- Sets: Base Set, Jungle, Fossil, Base Set 2, Team Rocket, Gym Heroes, Gym Challenge, Neo Genesis,
  Neo Discovery, Neo Revelation, Neo Destiny, Southern Islands, Legendary Collection.
  Not covered: Wizards Black Star Promos (no pkmncards set code found), the e-Card sets.
- Corpus: `out/pkmn-wotc-cards.json`, 1198 printings scraped from pkmncards
  (`node scripts/scrape-pkmncards.mjs --query="set:bs,ju,fo,b2,ro,g1,g2,n1,n2,n3"`, then
  `set:n4,lc,si`). pkmncards caps a `set:` list at 10 codes, so the scrape needs two queries.
  Split with `type:trainer` / `type:stadium` / `type:energy` queries:
  971 Pokémon, 163 Trainers, 22 Stadiums, 42 Energy.
- Runs: `audit:attacks`, `audit:abilities`, `audit:oracle`, `audit:trainers`,
  `audit-all-trainers.mjs`, `audit-all-special-energy.mjs`, `audit-all-stadiums.mjs` (untracked on
  the primary), each pointed at the WotC corpus by swapping the `out/pkmn-*-cards.json` files in the
  audit worktree. Zero engine errors in all runs.
- Probes written for this audit (kept next to this file):
  - `wotc-probe.mjs` — runs one attack, then the opponent hits back for 40 and tries to retreat.
    Validated on Lurantis ex Leaf Guard (marker set, 40 → 0).
  - `wotc-ability-probe.mjs` — uses one Power with full prompt trace (`HAND=Water,…` adds Energy).
  - `wotc-passive-probe.mjs` — six rules-on scenarios with and without the Power text. Validated
    on Kakuna [Chaos Rising] (40 → 20) and Garganacl ex (Paralyzed → none).
  - `wotc-trainer-probe.mjs` — plays every Trainer the way TCGdex delivers it (no trainerType);
    `--typed` adds the subtype for contrast.

## Headline numbers
| Area | Rows | Works | Broken / not enforced |
|---|---|---|---|
| Attacks with effect text | 818 unique | 660 ok | 119 no effect, 39 partial |
| Pokémon Powers | 173 rows | 35 run, 13 passive consumed | 10 dead, 25 partial, 90 passive unenforced |
| Trainers | 125 unique | ~70 work in the runtime probe | 13 unrecognized, 21 passive-only, 1 no executor, 7 with a free cost, ~20 attachables discarded |
| Stadiums | 22 unique | 0 in a real game (see F1) | 7 announce-only even when typed |

"ok" attack rows are the harness verdict (state change seen, no unmatched clause); they were not
re-checked one by one.

## Findings
F1 (I224, P1) — WotC Stadiums and attach-Trainers never stay in play.
TCGdex gives WotC Trainers no `trainerType` (base1-91 Bill, neo1-84 Ecogym, neo1-86 Focus Band
checked live). `isStadiumCard`/`isToolCard` (`shared/engine/effects/trainer-steps.mjs:64-72`) read
only type/trainerType/subtypes; `client/src/setup/image-logic/drop-zone.mjs:36` notes legacy cards
know only `type: 'Trainer'`. Probe: all 22 Gyms/Stadiums go to the discard pile when played untyped,
and to the Stadium slot with `--typed`. Same path discards PlusPower, Defender, Focus Band, the
Berries, EXP.ALL, Counterattack Claws, Magnifier, Balloon Berry, Charity, Sabrina's ESP, Koga's Ninja
Trick, Brock's Protection. Fix needs a printed-marker/derivation (text "This card stays in play when
you play it", "Attach … to 1 of your Pokémon") — engine-rule change, feature route.

F2 (I225, P2) — WotC Trainer costs are not parsed, so the card is free.
`parseTrainerEffect` drops "Discard 2 of the other cards from your hand in order to …" and "Discard
1 Energy card attached to 1 of your own Pokémon in order to …": Computer Search → [searchDeck],
Item Finder → [recursion], Super Energy Removal → [discardEnergyFromOpponent] (also discards 1, not
up to 2), Super Potion → [healAmount], Max Revive, Misty's Tears, Imposter Oak's Revenge.
Energy Retrieval / Super Energy Retrieval ("Trade N of the other cards") do get `discardCost`.

F3 (I226, P2) — `opponentShuffleHandDraw` puts the hand on the deck bottom without a shuffle and
draws nothing if the hand was empty (`trainer-steps.mjs:524-531`, `moved > 0` gate). The parse
branch at `trainer-effects.mjs:1663` maps every "your opponent shuffles his or her/their hand into
his or her/their deck … draws N" card to it: Imposter Professor Oak, Imposter Oak's Revenge, and any
modern Red Card wording. Printed text says shuffle.

F4 (I227, P2) — Trainers that do nothing: unrecognized (13): Arcade Game, Blaine's Gamble, Digger,
Erika's Maids, Impostor Professor Oak's Invention, Lass, Lt. Surge's Treaty, Misty's Duel, Misty's
Wish, Pokémon Trader, Sabrina's Psychic Control, Thought Wave Machine, Time Capsule. Passive-only
(21, no runtime effect): Misty, Blaine, Giovanni, Koga, Goop Gas Attack, Transparent Walls, Lt.
Surge's Secret Plan plus the attachables in F1. Tickling Machine heads: `opponentHandSetAside` has
no server executor. Sabrina [Gym Challenge] moves Energy between any Pokémon (ignores "with Sabrina
in its name"). 7 Gym Stadiums are announce-only even when typed (Appendix E).

F5 (I228, P2) — 119 attacks parse to zero steps (`parseAttackSteps` → []), so only their damage
happens. Main wording families:
- Name-first protection: "prevent all damage done to <name> during your opponent's next turn"
  (Withdraw, Stiffen, Scrunch, Hide in Shell, Defense Curl), "damage done … to <name> is reduced
  by 20" (Minimize, Lie Low), Harden (≤30/≤20 prevented), Deflector (half), Pulse Guard, Slime,
  Dodge, Reflect Shield, Endure, Armor Up, Shadow Images. Probe: Clefable Minimize → still takes 40.
- Defending-Pokémon locks: Leer/Tail Wag ("can't attack <name>"), Mean Look, Spider Web, Scary
  Face, Intimidate, Terrorize; debuffs Snivel, Growl, Charm, Screech.
- Counter-attacks: Mirror Move, Mirror Shell, Crosscounter, Counter.
- Next-turn self buffs: Focus Energy ×3, Lock-on, Giant Growth.
- Plain effects in old wording: Lure (gust), Headache (Trainer lock), Fidget/Mischief (shuffle),
  Psyscan/Scout (look at hand), Prophecy, Vanish, Fling, Third Eye, Charge (attach from discard),
  Wildfire, Super Fang / False Swipe (half HP → deal 0), Conversion 1/2, Zzzap, Dust Devil,
  Psysplash, Dark Drain, Battle Frenzy, Healing Water, Energy Control, Static Electricity …
39 more are partial: the damage parser reports "resolve the printed count" and deals the printed
base (Shining Mewtwo Psyburst 40 flat with 8 Energy on the defender, Scyther Fury Cutter always 10,
Misty's Poliwhirl Water Punch always 30, Seaking Horn Swipe, Ho-Oh Rainbow Burn, Dark Exeggutor MAX
Burst …), or a clause has no state tag ("take Energy attached to <self> and attach it to a Benched
Pokémon", Dark Hypno Bench Manipulation). Full list: Appendices A–B.

F6 (I229, P2) — Activated Pokémon Powers that do nothing (10 dead) or half-run (25 partial).
- Rain Dance (Base Set / Base Set 2 / Celebrations): text has no "from your hand", so
  `parseHandAttach` (`abilities.mjs:408-410`) returns null and the step stays guidance-only. Deluge
  (Plasma Blast) with "from your hand" works in the same probe.
- "Take 1 {G} Energy card attached to 1 of your Pokémon and attach it to a different one" (Energy
  Trans, Gather Fire, Energy Charge, Soak Up, Electromagnetic Power) parses as `attachAbility`, not
  a move — the `move` exclusion at `abilities.mjs:821-824` needs the word "move".
- Buzzap, when-played Powers (Dark Golbat Sneak Attack, Dark Crobat Surprise Bite, Feraligatr
  Berserk, Unown E/V, Light Togetic Gift…) run partially: `whenPlayedAbility` /
  `opponentDisruptAbility` / `handDeckSwapAbility` steps without executors (Appendix C).

F7 (I230, P2) — 90 passive Powers parse but nothing reads them. Probed with and without the text
(no difference in any scenario): Toxic Gas (`powerSuppressAbility` has no consumer outside
`ability-step-plan.mjs:39`), Hay Fever, Prehistoric Power, Invisible Wall, Thick Skinned, Kabuto
Armor, Strikes Back, Retreat Aid, Dark Ampharos Conductivity. Also unenforced by inspection: Energy
Burn, Transform, Clairvoyance, Rebellion, Psylink, Legendary Body, Spikes, Unown D/M/N, Deep Sleep,
Miraculous Wind … (Appendix C, UNCONSUMED rows).

F8 (I230, P3) — Baby Pokémon: the Baby Rule (attacker flips; tails ends the turn) is not enforced —
the `Baby` marker is read only by `search-match.mjs:96`; TCGdex neo1-12 Pichu carries neither the
rule text nor an evolve link for Baby → Basic evolution. Rule wording must be looked up at fix time
(not in the pkmncards or TCGdex text).

## Not findings
- Special Energy (Darkness, Metal, Recycle, Rainbow…): 6 guided, 4 passive, 0 unenforced/unrecognized.
- "dead" Rain Dance in the stock harness was partly a board artifact (only Fire in hand); the
  guidance-only cause holds with Water in hand.
- 0 engine errors across all audits.

## Appendix A — attacks: ran-no-effect (all 119 parse to zero steps)
- Chansey [Base Set 3] Scrunch — Flip a coin. If heads, prevent all damage done to Chansey during your opponent's next turn. (Any other effects of attacks still happen.)
- Ninetales [Base Set 12] Lure — If your opponent has any Benched Pokémon, choose 1 of them and switch it with his or her Active Pokémon.
- Pidgeotto [Base Set 22] Mirror Move — If Pidgeotto was attacked last turn, do the final result of that attack on Pidgeotto to the Defending Pokémon.
- Kakuna [Base Set 33] Stiffen — Flip a coin. If heads, prevent all damage done to Kakuna during your opponent's next turn. (Any other effects of attacks still happen.)
- Porygon [Base Set 39] Conversion 1 — If the Defending Pokémon has a Weakness, you may change it to a type of your choice other than Colorless.
- Porygon [Base Set 39] Conversion 2 — Change Porygon's Resistance to a type of your choice other than Colorless.
- Raticate [Base Set 40] Super Fang : ? — Does damage to the Defending Pokémon equal to half the Defending Pokémon's remaining HP (rounded up to the nearest 10).
- Wartortle [Base Set 42] Withdraw — Flip a coin. If heads, prevent all damage done to Wartortle during your opponent's next turn. (Any other effects of attacks still happen.)
- Metapod [Base Set 54] Stiffen — Flip a coin. If heads, prevent all damage done to Metapod during your opponent's next turn. (Any other effects of attacks still happen.)
- Onix [Base Set 56] Harden — During your opponent's next turn, whenever 30 or less damage is done to Onix (after applying Weakness and Resistance), prevent that damage. 
- Squirtle [Base Set 63] Withdraw — Flip a coin. If heads, prevent all damage done to Squirtle during your opponent's next turn. (Any other effects of attacks still happen.)
- Clefable [Jungle 1] Minimize — All damage done by attacks to Clefable during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance).
- Cubone [Jungle 50] Snivel — If the Defending Pokémon attacks Cubone during your opponent's next turn, any damage done by the attack is reduced by 20 (after applying Wea
- Eevee [Jungle 51] Tail Wag — Flip a coin. If heads, the Defending Pokémon can't attack Eevee during your opponent's next turn. (Benching either Pokémon ends this effect.
- Rhyhorn [Jungle 61] Leer — Flip a coin. If heads, the Defending Pokémon can't attack Rhyhorn during your opponent's next turn. (Benching either Pokémon ends this effec
- Spearow [Jungle 62] Mirror Move — If Spearow was attacked last turn, do the final result of that attack on Spearow to the Defending Pokémon.
- Hypno [Fossil 8] Prophecy — Look at up to 3 cards from the top of either player's deck and rearrange them as you like.
- Moltres [Fossil 12] Wildfire — You may discard any number of {R} Energy cards attached to Moltres when you use this attack. If you do, discard that many cards from the top
- Graveler [Fossil 37] Harden — During your opponent's next turn, whenever 30 or less damage is done to Graveler (after applying Weakness and Resistance), prevent that dama
- Grimer [Fossil 48] Minimize — All damage done by attacks to Grimer during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance).
- Psyduck [Fossil 53] Headache — Your opponent can't play Trainer cards during his or her next turn.
- Shellder [Fossil 54] Hide in Shell — Flip a coin. If heads, prevent all damage done to Shellder during your opponent's next turn. (Any other effects of attacks still happen.)
- Squirtle [Base Set 2 93] Withdraw — Flip a coin. If heads, prevent all damage done to Squirtle during your opponent's next turn. (Any other effects of opponent's attacks still 
- Dark Machamp [Team Rocket 10] Fling — Your opponent shuffles his or her Active Pokémon and all cards attached to it into his or her deck. This attack can't be used if your oppone
- Dark Golduck [Team Rocket 37] Third Eye — Discard 1 Energy card attached to Dark Golduck in order to draw up to 3 cards.
- Dark Wartortle [Team Rocket 46] Mirror Shell — If an attack does damage to Dark Wartortle during your opponent's next turn (even if Dark Wartortle is Knocked Out), Dark Wartortle attacks 
- Abra [Team Rocket 49] Vanish — Shuffle Abra into your deck. (Discard all cards attached to Abra.)
- Mankey [Team Rocket 61] Mischief — Shuffle your opponent's deck.
- Meowth [Team Rocket 62] Coin Hurl — Choose 1 of your opponent's Pokémon and flip a coin. If heads, this attack does 20 damage to that Pokémon. Don't apply Weakness and Resistan
- Erika's Clefable [Gym Heroes 3] Fairy Power — Flip a coin. If heads, you may return any number of your Pokémon in play and all cards attached to them to your hand.
- Lt. Surge's Electabuzz [Gym Heroes 6] Charge — Take up to 2 {L} Energy cards from your discard pile and attach them to Lt. Surge's Electabuzz.
- Rocket's Hitmonchan [Gym Heroes 11] Crosscounter — If an attack does damage to Rocket's Hitmonchan during your opponent's next turn (even if Rocket's Hitmonchan is Knocked Out), flip a coin. 
- Rocket's Scyther [Gym Heroes 13] Shadow Images — Whenever Rocket's Scyther is attacked, your opponent flips a coin. If tails, that attack does no damage to Rocket's Scyther. (Any other effe
- Brock's Onix [Gym Heroes 21] Tunneling — If your opponent has any Benched Pokémon, choose up to 2 of them. This attack does 20 damage to each of them. (Don't apply Weakness and Resi
- Brock's Geodude [Gym Heroes 38] Lucky Shot — Choose 1 of your opponent's Benched Pokémon and flip a coin. If heads, this attack does 30 damage to that Pokémon. (Don't apply Weakness and
- Erika's Exeggcute [Gym Heroes 43] Deflector — During your opponent's next turn, whenever Erika's Exeggcute takes damage, divide that damage in half (rounded down to the nearest 10). (Any
- Brock's Mankey [Gym Heroes 68] Fidget — Shuffle your deck.
- Brock's Sandshrew [Gym Heroes 71] Defense Curl — Flip a coin. If heads, prevent all damage done to Brock's Sandshrew during your opponent's next turn. (Any other effects of attacks still ha
- Lt. Surge's Pikachu [Gym Heroes 81] Charge — Take 1 {L} Energy card from your discard pile and attach it to Lt. Surge's Pikachu.
- Lt. Surge's Rattata [Gym Heroes 82] Focus Energy — During your next turn, Lt. Surge's Rattata's Gnaw attack's base damage is doubled.
- Giovanni's Gyarados [Gym Challenge 5] Summon Storm — Flip 2 coins. If both of them are heads, this attack does 20 damage to each other Pokémon (even your own). Don't apply Weakness and Resistan
- Giovanni's Nidoking [Gym Challenge 7] Intimidate — If the Defending Pokémon's maximum HP is 50 or less, it can't attack Giovanni's Nidoking during your opponent's next turn. (Benching or evol
- Koga's Ditto [Gym Challenge 10] Giant Growth — Flip a coin. If heads, Koga's Ditto's maximum HP is now 80 and Koga's Ditto's Pound attack's base damage is 30 instead of 10. (Benching Koga
- Misty's Golduck [Gym Challenge 12] Super Removal — Flip a coin. If heads, choose 1 Energy card attached to each of your opponent's Pokémon that has any Energy cards and discard those Energy c
- Rocket's Mewtwo [Gym Challenge 14] Juxtapose — Flip a coin. If heads, switch the number of damage counters on Rocket's Mewtwo with the number of damage counters on the Defending Pokémon (
- Brock's Dugtrio [Gym Challenge 22] Lie Low — All damage done to Brock's Dugtrio during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance).
- Sabrina's Golduck [Gym Challenge 30] Damage Shift — Move 1 damage counter from each of your Pokémon that has any on it to the Defending Pokémon. (Don't apply Weakness and Resistance.)
- Giovanni's Meowth [Gym Challenge 43] False Charity — Flip a coin. If heads, look at the top card of your opponent's deck. If it's a Trainer card, put it in your opponent's discard pile; otherwi
- Lt. Surge's Eevee [Gym Challenge 51] Surprise — Look at a random card from your opponent's hand. Your opponent shuffles that card into his or her deck.
- Lt. Surge's Raticate [Gym Challenge 53] Focus Energy — During your next turn, Lt. Surge's Raticate's Double-edge attack's damage (base damage and damage to itself) is doubled.
- Sabrina's Hypno [Gym Challenge 56] Invigorate — Choose 1 Basic Pokémon in any player's discard pile. Put it onto that player's Bench. Put a number of damage counters on that Pokémon equal 
- Sabrina's Jynx [Gym Challenge 57] Helping Hand — Choose 1 of your opponent's Pokémon. Remove any number of damage counters from that Pokémon, then draw that many cards.
- Sabrina's Kadabra [Gym Challenge 58] Life Drain — Flip a coin. If heads, put a number of damage counters on the Defending Pokémon so that its remaining HP are 10.
- Blaine's Mankey [Gym Challenge 63] Pranks — Flip a coin. If heads, choose a card from your opponent's discard pile and put it on top of his or her deck.
- Blaine's Vulpix [Gym Challenge 66] Call Will-o'-the-wisp — Flip 3 coins. For each heads, if you have a {R} Energy card in your discard pile, put it into your hand.
- Lt. Surge's Rattata [Gym Challenge 85] Focus Energy — During your next turn, Lt. Surge's Rattata's Quick Attack's base damage is doubled.
- Sabrina's Abra [Gym Challenge 94] Psyscan — Look at your opponent's hand.
- Pichu [Neo Genesis 12] Zzzap — Does 20 damage to each Pokémon in play that has a Pokémon Power. Don't apply Weakness and Resistance.
- Murkrow [Neo Genesis 24] Mean Look — The Defending Pokémon can't retreat as long as Murkrow remains your Active Pokémon. (Benching or evolving either Pokémon ends this effect.)
- Ariados [Neo Genesis 27] Spider Web — Flip a coin. If heads, the Defending Pokémon can't retreat. (Benching or evolving that Pokémon ends this effect.)
- Croconaw [Neo Genesis 31] Screech — Until the end of your next turn, if an attack damages the Defending Pokémon (after applying Weakness and Resistance), that attack does 20 mo
- Phanpy [Neo Genesis 43] Endure — Flip a coin. If heads, then if, during your opponent's next turn, Phanpy would be Knocked Out by an attack, Phanpy isn't Knocked Out and its
- Xatu [Neo Genesis 52] Prophecy — Look at the top 3 cards of either player's deck and rearrange them as you like.
- Chikorita [Neo Genesis 53] Deflector — During your opponent's next turn, whenever Chikorita takes damage, divide that damage in half (rounded down to the nearest 10). (Any other e
- Chikorita [Neo Genesis 54] Growl — If the Defending Pokémon attacks Chikorita during your opponent's next turn, any damage done to Chikorita is reduced by 10 (before applying 
- Cyndaquil [Neo Genesis 56] Leer — Flip a coin. If heads, the Defending Pokémon can't attack Cyndaquil during your opponent's next turn. (Benching or evolving either Pokémon e
- Mareep [Neo Genesis 65] Static Electricity — For each Mareep in play, you may search your deck for a {L} Energy card and attach it to Mareep. Shuffle your deck afterward.
- Marill [Neo Genesis 66] Defense Curl — Flip a coin. If heads, prevent all damage done to Marill during your opponent's next turn. (Any other effects of attacks still happen.)
- Onix [Neo Genesis 69] Screech — Until the end of your next turn, if an attack damages the Defending Pokémon (after applying Weakness and Resistance), that attack does 20 mo
- Shuckle [Neo Genesis 72] Withdraw — Flip a coin. If heads, prevent all damage done to Shuckle during your opponent's next turn. (Any other effects of attacks still happen.)
- Snubbull [Neo Genesis 74] Roar — Flip a coin. If heads and if your opponent has any Benched Pokémon, he of she chooses 1 of them and switches it with the Defending Pokémon. 
- Spinarak [Neo Genesis 75] Scary Face — Flip a coin. If heads, until the end of your opponent's next turn, the Defending Pokémon can't attack or retreat.
- Totodile [Neo Genesis 81] Leer — Flip a coin. If heads, the Defending Pokémon can't attack Totodile during your opponent's next turn. (Benching or evolving either Pokémon en
- Magnemite [Neo Discovery 7] Lock-on — During your next turn, treat any tails flipped when using Magnemite's Electric Bolt attack as if they were heads. (Benching or evolving eith
- Scizor [Neo Discovery 10] False Swipe : ? — Does damage equal to half the Defending Pokémon's remaining HP (rounded down to the nearest 10).
- Smeargle [Neo Discovery 11] Sketch — If the Defending Pokémon attacked last turn, and Smeargle was in play during that attack, Smeargle copies that attack except for its Energy 
- Wobbuffet [Neo Discovery 16] Counter — If an attack damages Wobbuffet during your opponent's next turn (even if Wobbuffet is Knocked Out), flip a coin. If heads, Wobbuffet attacks
- Metapod [Neo Discovery 42] Harden — During your opponent's next turn, whenever 20 or less damage is done to Metapod (after applying Weakness and Resistance), prevent that damag
- Pupitar [Neo Discovery 45] Dust Devil — Does 10 damage to each non-{F} Pokémon in play. Don't apply Weakness and Resistance.
- Xatu [Neo Discovery 52] Energy Cycle — Flip a coin. If heads, choose 1 Energy card attached to the Defending Pokémon and 1 of your opponent's Benched Pokémon. Attach that Energy c
- Sentret [Neo Discovery 63] Scout — Look at your opponent's hand.
- Wooper [Neo Discovery 71] Slime — If an attack would do damage to Wooper during your opponent's next turn, your opponent flips a coin. If tails, prevent all damage to Wooper 
- Misdreavus [Neo Revelation 11] Perish Song — If the Defending Pokémon is Asleep and was attacked with Night Eyes during your last turn, it is Knocked Out.
- Kingdra [Neo Revelation 19] Genetic Memory — Use any attack from Kingdra's Basic Pokémon card or Evolution card. (Kingdra doesn't have to pay for that attack's Energy cost.)
- Sneasel [Neo Revelation 24] Swipe — Flip a coin. If heads, discard all Trainer cards attached to your opponent's Pokémon.
- Starmie [Neo Revelation 25] Core Stream — Choose an Energy type other than {C}. This attack does 20 damage to each of your opponent's Pokémon with any Energy cards of that type attac
- Stantler [Neo Revelation 38] Terrorize — If the Defending Pokémon is a Basic Pokémon, choose 1 of its attacks. That Pokémon can't use that attack during your opponent's next turn.
- Aipom [Neo Revelation 41] Grab — Choose a Trainer card attached to 1 of your opponent's Pokémon. Your opponent shuffles that card into his or her deck.
- Smoochum [Neo Revelation 54] Psykiss — Flip a coin. If heads, choose a Special Energy card attached to 1 of your opponent's Pokémon. Your opponent shuffles that card into his or h
- Ivysaur [Southern Islands 5] Strange Scent — Each player flips a coin. Each player who gets heads chooses a total of 3 damage counters from among his or her Pokémon and removes them. (I
- Dark Crobat [Neo Destiny 2] Dark Drain — Flip a coin for each of your opponent's Pokémon. For each heads, this attack does 10 damage to that Pokémon. Don't apply Weakness and Resist
- Dark Donphan [Neo Destiny 3] Tusk Toss — If your opponent has any Benched Pokémon, flip a coin. If heads, return the Defending Pokémon and all cards attached to it to your opponent'
- Dark Espeon [Neo Destiny 4] Psysplash — Does 10 damage to each of your opponent's Pokémon for each Energy card attached to that Pokémon. Don't apply Weakness and Resistance.
- Dark Houndoom [Neo Destiny 7] Eerie Howl — If your opponent's Bench isn't full, look at his or her hand. If your opponent has any Baby Pokémon or Basic Pokémon there, choose 1 of them
- Dark Scizor [Neo Destiny 9] Threaten — Flip a coin. If heads, look at your opponent's hand. If he or she has any Trainer cards there, choose 1 of them. Your opponent shuffles that
- Dark Omastar [Neo Destiny 19] Prehistoric Water — If your opponent has any evolved Pokémon in play, choose 1 of them and flip a coin. If heads, your opponent takes the highest Stage Evolutio
- Dark Ursaring [Neo Destiny 21] Provoke — Look at your opponent's hand. If he or she has any Baby Pokémon and/or Basic Pokémon there, you may put any number of them onto your opponen
- Dark Ursaring [Neo Destiny 21] Battle Frenzy — For each Pokémon in play (yours and your opponent's), flip a coin. For each heads, this attack does 20 damage to that Pokémon. Don't apply W
- Light Lanturn [Neo Destiny 23] Searchlight — Flip a coin. If heads, each player may choose a card from his or her discard pile and put it into his or her hand.
- Light Ledian [Neo Destiny 24] Flash Touch — If you have any Benched Pokémon, switch 1 of them with Light Ledian. As long as that Pokémon is your Active Pokémon, it can't become Asleep,
- Dark Forretress [Neo Destiny 35] Armor Up — Until the end of your next turn, if Dark Forretress would be Knocked Out by damage from an attack, flip a coin. If heads, Dark Forretress is
- Dark Haunter [Neo Destiny 36] Call Back — Put a Baby Pokémon or Basic Pokémon card from your opponent's discard pile onto his or her Bench. Put 1 damage counter on that Pokémon. (You
- Dark Quilava [Neo Destiny 39] Incinerate — Show the top card of your opponent's deck to all players. If it's a Trainer card, discard it.
- Light Golduck [Neo Destiny 47] Flipper Stroke — Your opponent looks at the top 3 cards of his or her deck. If any of them are basic Energy cards, he or she may show any number of them to y
- Light Jolteon [Neo Destiny 48] Pulse Guard — During your opponent's next turn, whenever 30 or more damage is done to Light Jolteon (after applying Weakness and Resistance), prevent that
- Light Machoke [Neo Destiny 49] Return Home — If you have any Benched Pokémon, shuffle 1 of them and all cards attached to it into your deck.
- Light Ninetales [Neo Destiny 50] Guiding Flame — Put a Baby Pokémon or a Basic Pokémon card from your discard pile onto your Bench. (You can't use this attack if your Bench is full.)
- Light Slowbro [Neo Destiny 51] Fish Out — Your opponent may choose up to 3 Baby Pokémon, Basic Pokémon, and/or Evolution cards from his or her discard pile and shuffle them into his 
- Light Vaporeon [Neo Destiny 52] Wash Away — If you have any Benched Pokémon, flip a coin. If heads, remove all damage counters from 1 of your Benched Pokémon and discard all Energy car
- Light Venomoth [Neo Destiny 53] Mysterious Wing — Your opponent may choose a Baby Pokémon, Basic Pokémon, or Evolution card from his or her discard pile and put it into his or her hand. Eith
- Light Wigglytuff [Neo Destiny 54] Evolution Song — Your opponent may choose 1 of his or her Pokémon and search his or her deck for a card that evolves from that Pokémon. Your opponent attache
- Togepi [Neo Destiny 56] Charm — If the Defending Pokémon attacks during your opponent's next turn, any damage it does is reduced by 10 (before applying Weakness and Resista
- Hitmonchan [Neo Destiny 69] Dodge — If Hitmonchan would be damaged by an attack during your opponent's next turn, flip a coin. If heads, prevent that attack's damage done to Hi
- Light Sunflora [Neo Destiny 72] Reflected Sunlight — Attach up to 2 {G} Energy cards from your hand to 1 of your {G} Pokémon.
- Shining Celebi [Neo Destiny 106] Healing Water — Remove a number of damage counters from 1 of your Benched Pokémon equal to the number of {W} Energy cards attached to Shining Celebi. If the
- Shining Mewtwo [Neo Destiny 109] Reflect Shield — If an attack does damage to Shining Mewtwo during your opponent's next turn (even if Shining Mewtwo is Knocked Out), flip a coin. If heads, 
- Mewtwo [Legendary Collection 29] Energy Control — Flip a coin. If heads, choose a basic Energy card attached to 1 of your opponent's Pokémon and attach it to another of your opponent's Pokém
- Dark Wartortle [Legendary Collection 39] Mirror Shell — If an attack does damage to Dark Wartortle during your opponent's next turn (even if Dark Wartortle is Knocked Out), Dark Wartortle does an 
- Grimer [Legendary Collection 78] Minimized — All damage done by attacks to Grimer during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance).

## Appendix B — attacks: partial (unresolved damage count/condition or unmatched clause)
- Zapdos [Fossil 15] Thunderstorm — dealt 40 — unresolved-damage
- Dark Hypno [Team Rocket 9] Bench Manipulation — dealt 20 — unresolved-damage
- Dark Electrode [Team Rocket 34] Energy Bomb — dealt 30 — attach-from-deck
- Magnemite [Team Rocket 60] Magnetism — dealt 10 — search-to-bench
- Lt. Surge's Electabuzz [Gym Heroes 27] Electric Current — dealt 20 — attach-from-deck
- Misty's Poliwhirl [Gym Heroes 53] Water Punch — dealt 30 — unresolved-damage
- Sabrina's Haunter [Gym Heroes 58] Night Spirits — dealt 30 — unresolved-damage
- Blaine's Charizard [Gym Challenge 2] Roaring Flames — dealt 60 — unresolved-damage
- Rocket's Zapdos [Gym Challenge 15] Electroburn — dealt 70 — unresolved-damage
- Giovanni's Nidoqueen [Gym Challenge 23] Love Lariat — dealt 0/50 — search-to-bench
- Koga's Arbok [Gym Challenge 25] Poison Power — dealt 20 — status-opp
- Bellossom [Neo Genesis 3] Flower Dance — dealt 30 — unresolved-damage
- Feraligatr [Neo Genesis 5] Riptide — dealt 30 — recover-to-deck
- Ariados [Neo Genesis 27] Poison Bite — dealt 20 — status-opp
- Croconaw [Neo Genesis 31] Jaw Clamp — dealt 30 — lock-opp-pokemon
- Flaaffy [Neo Genesis 34] Electric Current — dealt 20 — attach-from-deck
- Gloom [Neo Genesis 36] Sticky Nectar — dealt 20 — lock-opp-pokemon
- Granbull [Neo Genesis 37] Raging Charge — dealt 10 — unresolved-damage
- Ledian [Neo Genesis 39] Baton Pass — dealt 30 — attach-from-deck
- Piloswine [Neo Genesis 44] Freeze — dealt 10 — lock-opp-pokemon
- Horsea [Neo Genesis 62] Fin Slap — dealt 20 — unresolved-damage
- Houndour [Neo Discovery 5] Collect Fire — dealt 20 — attach-from-deck
- Poliwhirl [Neo Discovery 44] Belly Drum — dealt 0 — attach-from-deck
- Scyther [Neo Discovery 46] Fury Cutter — dealt 10 — unresolved-damage
- Kabuto [Neo Discovery 56] Work Together — dealt 10 — search-to-bench
- Jumpluff [Neo Revelation 9] Evolutionary Spore — dealt 0 — attach-from-deck
- Ho-Oh [Neo Revelation 18] Rainbow Burn — dealt 30 — unresolved-damage
- Seaking [Neo Revelation 37] Horn Swipe — dealt 20 — unresolved-damage
- Murkrow [Neo Revelation 46] Flock Attack — dealt 10 — search-to-bench
- Dark Houndoom [Neo Destiny 7] Dark Fire — dealt 30 — unresolved-damage
- Light Azumarill [Neo Destiny 13] Bubble Jump — dealt 30 — attach-from-deck
- Light Togetic [Neo Destiny 15] Sweet Kiss — dealt 30 — draw
- Dark Exeggutor [Neo Destiny 33] MAX Burst — dealt 20 — unresolved-damage
- Dark Wigglytuff [Neo Destiny 40] Slap Awake — dealt 20 — unresolved-damage
- Light Flareon [Neo Destiny 46] Warm Up — dealt 0 — attach-from-deck
- Light Flareon [Neo Destiny 46] Burning Flame — dealt 30 — unresolved-damage
- Light Slowbro [Neo Destiny 51] Splash About — dealt 20 — unresolved-damage
- Shining Mewtwo [Neo Destiny 109] Psyburst — dealt 40 — unresolved-damage
- Shining Tyranitar [Neo Destiny 113] Mountain Crush — dealt 30 — discard-opp-hand

## Appendix C — Pokémon Powers by class (ability-behaviour.mjs classes)
- DEAD - Blastoise [Base Set 2] Rain Dance (status) [] [] — As often as you like during your turn (before your attack), you may attach 1 {W} Energy card to 1 of your {W} Pokémon. (This doesn't use up your 1 Energy card attachment fo
- DEAD - Venusaur [Base Set 15] Energy Trans (status) [] [] — As often as you like during your turn (before your attack), you may take 1 {G} Energy card attached to 1 of your Pokémon and attach it to a different one. This power can'
- DEAD - Blastoise [Base Set 2 2] Rain Dance (status) [] [] — As often as you like during your turn (before your attack), you may attach 1 {W} Energy card to 1 of your {W} Pokémon. (This doesn't use up your 1 Energy card attachment 
- DEAD - Venusaur [Base Set 2 18] Energy Trans (status) [] [] — As often as you like during your turn (before your attack), you may take 1 {G} Energy card attached to 1 of your Pokémon and attach it to a different one. This power ca
- DEAD - Electrode [Base Set 2 25] Buzzap (status) [] [] — At any time during your turn (before your attack), you may Knock Out Electrode and attach it to 1 of your other Pokémon. If you do, choose a type of Energy. Electrode is now
- DEAD - Charmander [Team Rocket 50] Gather Fire (status) [] [] — Once during your turn (before your attack), you may take 1 {R} Energy card attached to 1 of your other Pokémon and attach it to Charmander. This power can't be used i
- DEAD - Lt. Surge's Magneton [Gym Heroes 8] Energy Charge (status) [] [] — As often as you like during your turn (before your attack), if Lt. Surge's Magneton is your Active Pokémon, you may take 1 {L} Energy card attached to 1 of 
- DEAD - Erika's Bellsprout [Gym Challenge 38] Soak Up (status) [] [] — Once during your turn (before your attack), you may take up to 2 {G} Energy cards attached to your other Pokémon and attach them to Erika's Bellsprout. This pow
- DEAD - Magneton [Neo Revelation 10] Electromagnetic Power (status) [] [] — As often as you like during your turn (before your attack), you may take 1 Energy card attached to 1 of your Magnemites, Magnetons, or Dark Magnetons and a
- DEAD - Venusaur [Legendary Collection 18] Energy Trans (status) [] [] — As often as you like during your turn (before your attack), you may take 1 {G} Energy card attached to 1 of your Pokémon and attach it to a different one. Thi
- PARTIAL - Electrode [Base Set 21] Buzzap (status) [] ["clause:attach-from-deck"] — At any time during your turn (before your attack), you may Knock Out Electrode and attach it to 1 of your other Pokémon. If you do, choose a type o
- PARTIAL - Dragonite [Fossil 4] Step In (switch) [] ["clause:search-to-bench"] — Once during your turn (before your attack), if Dragonite is on your Bench, you may switch it with your Active Pokémon.
- PARTIAL - Dragonite [Fossil 19] Step In (switch) [] ["clause:search-to-bench"] — Once during your turn (before your attack), if Dragonite is on your Bench, you may switch it with your Active Pokémon.
- PARTIAL - Dark Golbat [Team Rocket 7] Sneak Attack (weakness) ["whenPlayedAbility"] [] — When you play Dark Golbat from your hand, you may choose 1 of your opponent's Pokémon. If you do, Dark Golbat does 10 damage to that Pokémon.
- PARTIAL - Dark Golbat [Team Rocket 24] Sneak Attack (weakness) ["whenPlayedAbility"] [] — When you play Dark Golbat from your hand, you may choose 1 of your opponent's Pokémon. If you do, Dark Golbat does 10 damage to that Pokémon
- PARTIAL - Dark Dragonair [Team Rocket 33] Evolutionary Light (search) ["opponentDisruptAbility"] [] — Once during your turn (before your attack), you may search your deck for an Evolution card. Show it to your opponent and put it 
- PARTIAL - Giovanni's Persian [Gym Challenge 8] Call the Boss (search) ["opponentDisruptAbility"] [] — When you play Giovanni's Persian from your hand, you may search your deck for the Trainer card named Giovanni, show it to your o
- PARTIAL - Feraligatr [Neo Genesis 4] Berserk (opponent-disrupt) ["opponentDisruptAbility"] [] — When you play Feraligatr from your hand, flip a coin. If heads, discard the top 5 cards from your opponent's deck. If tails, discard t
- PARTIAL - Typhlosion [Neo Genesis 18] Fire Boost (search) [] ["clause:attach-from-deck"] — When you play Typhlosion from your hand, you may flip a coin. If heads, search your deck for up to 4 {R} Energy cards and attach them to Ty
- PARTIAL - Noctowl [Neo Genesis 42] Glaring Gaze (status) ["deckPeekAbility","opponentDisruptAbility"] [] — Once during your turn (before your attack), you may flip a coin. If heads, look at your opponent's hand. If your opponent h
- PARTIAL - Unown F [Neo Discovery 48] [Find] (search) ["opponentDisruptAbility"] ["clause:search-to-bench"] — Once during your turn (before your attack), if you have Unown F, Unown I, Unown N, and Unown D on your Bench, you may sea
- PARTIAL - Unown U [Neo Discovery 51] [Undo] (self-return) [] ["clause:search-to-bench"] — Once during your turn (before your attack), if you have Unown U, Unown N, Unown D, and Unown O on your Bench, you may return your Active Pok
- PARTIAL - Kabuto [Neo Discovery 56] Revive Friends (search) [] ["clause:search-to-bench"] — Once during your turn (before your attack), you may flip a coin. If heads, search your deck for a card named Kabuto and put it on your Ben
- PARTIAL - Unown E [Neo Discovery 67] [Engage] (opponent-disrupt) ["handDeckSwapAbility","opponentDisruptAbility"] [] — When you play Unown E from your hand, your opponent may shuffle his or her hand into his or her deck and then d
- PARTIAL - Unown O [Neo Discovery 69] [Observe] (deck-peek) ["deckPeekAbility"] [] — Once during your turn (before your attack), you may look at 5 cards from the top of your opponent's deck and put them back in the same order.
- PARTIAL - Entei [Neo Revelation 6] Howl (attach) [] ["clause:attach-from-deck","clause:mill-self"] — When you play Entei from your hand, you may discard the top 5 cards of your deck. (If you have fewer cards in your deck than that
- PARTIAL - Dark Crobat [Neo Destiny 2] Surprise Bite (weakness) ["whenPlayedAbility"] [] — When you play Dark Crobat from your hand, you may choose 1 of your opponent's Pokémon. This power does 20 damage to that Pokémon. (Don't app
- PARTIAL - Light Togetic [Neo Destiny 15] Gift (search) ["opponentDisruptAbility"] [] — When you play Light Togetic from your hand, your opponent may search his or her deck for a Pokémon Tool card, show that card to you, and put it
- PARTIAL - Light Machamp [Neo Destiny 25] Tag Team (switch) [] ["clause:search-to-bench"] — When you play Light Machamp from your hand, if it is on your Bench, remove 3 damage counters from your Active Pokémon. If it has fewer dama
- PARTIAL - Unown G [Neo Destiny 27] [Give] (search) [] ["clause:search-to-bench"] — Once during your turn (before your attack), if you have Unown G, Unown I, Unown V, and Unown E on your Bench, you may flip a coin. If heads, search
- PARTIAL - Unown H [Neo Destiny 28] [Help] (draw) ["handDeckSwapAbility"] [] — Once during your turn (before your attack), if you have Unown H, Unown E, Unown L, and Unown P on your Bench, you may shuffle your hand into your deck, 
- PARTIAL - Unown W [Neo Destiny 29] [Want] (recursion) [] ["clause:search-to-bench"] — Once during your turn (before your attack), if you have Unown W, Unown A, Unown N, and Unown T on your Bench, you may flip a coin. If heads, put
- PARTIAL - Unown T [Neo Destiny 88] [Tell] (status) ["deckPeekAbility"] [] — Once during your turn (before your attack), you may flip a coin. If heads, look at your opponent's hand and show your hand to your opponent. This power ca
- PARTIAL - Unown V [Neo Destiny 89] [Vanish] (when-played) ["whenPlayedAbility"] [] — When you play Unown V from your hand, you may flip a coin. If heads, return 1 of your Pokémon with Unown in its name (other than Unown V) to your
- PARTIAL - Dark Dragonair [Legendary Collection 38] Evolutionary Light (search) ["opponentDisruptAbility"] [] — Once during your turn (before your attack), you may search your deck for an Evolution card. Show it to your opponent an
- UNCONSUMED - Charizard [Base Set 4] Energy Burn (status) [] [] — As often as you like during your turn (before your attack), you may turn all Energy attached to Charizard into {R} Energy for the rest of the turn. This power can't 
- UNCONSUMED - Machamp [Base Set 8] Strikes Back (ko-prevention) [] [] — Whenever your opponent's attack damages Machamp (even if Machamp is Knocked Out), this power does 10 damage to the attacking Pokémon. (Don't apply Weakness and
- UNCONSUMED - Mr. Mime [Jungle 6] Invisible Wall (damage-prevent) [] [] — Whenever an attack (including your own) does 30 or more damage to Mr. Mime (after applying Weakness and Resistance), prevent that damage. (Any other effects 
- UNCONSUMED - Snorlax [Jungle 11] Thick Skinned (status) [] [] — Snorlax can't become Asleep, Confused, Paralyzed, or Poisoned. This power can't be used if Snorlax is already Asleep, Confused, or Paralyzed.
- UNCONSUMED - Venomoth [Jungle 13] Shift (status) [] [] — Once during your turn (before your attack), you may change the type of Venomoth to the type of any other Pokémon in play other than Colorless. This power can't be used if Ve
- UNCONSUMED - Mr. Mime [Jungle 22] Invisible Wall (damage-prevent) [] [] — Whenever an attack (including your own) does 30 or more damage to Mr. Mime (after applying Weakness and Resistance), prevent that damage. (Any other effects
- UNCONSUMED - Snorlax [Jungle 27] Thick Skinned (status) [] [] — Snorlax can't become Asleep, Confused, Paralyzed, or Poisoned. This power can't be used if Snorlax is already Asleep, Confused, or Paralyzed.
- UNCONSUMED - Venomoth [Jungle 29] Shift (status) [] [] — Once during your turn (before your attack), you may change the type of Venomoth to the type of any other Pokémon in play other than Colorless. This power can't be used if Ve
- UNCONSUMED - Dodrio [Jungle 34] Retreat Aid (retreat-cost) [] [] — As long as Dodrio is Benched, pay {C} less to retreat your Active Pokémon.
- UNCONSUMED - Mankey [Jungle 55] Peek (status) [] [] — Once during your turn (before your attack), you may look at one of the following: the top card of either player's deck, a random card from your opponent's hand, or one of eithe
- UNCONSUMED - Aerodactyl [Fossil 1] Prehistoric Power (status) [] [] — No more Evolution cards can be played. This power stops working while Aerodactyl is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Ditto [Fossil 3] Transform (status) [] [] — If Ditto is your Active Pokémon, treat it as if it were the same card as the Defending Pokémon, including type, Hit Points, Weakness, and so on, except Ditto can't evolve, a
- UNCONSUMED - Muk [Fossil 13] Toxic Gas (status) [] [] — Ignore all Pokémon Powers other than Toxic Gases. This power stops working while Muk is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Aerodactyl [Fossil 16] Prehistoric Power (status) [] [] — No more Evolution cards can be played. This power stops working while Aerodactyl is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Ditto [Fossil 18] Transform (status) [] [] — If Ditto is your Active Pokémon, treat it as if it were the same card as the Defending Pokémon, including type, Hit Points, Weakness, and so on, except Ditto can't evolve, 
- UNCONSUMED - Muk [Fossil 28] Toxic Gas (status) [] [] — Ignore all Pokémon Powers other than Toxic Gases. This power stops working while Muk is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Slowbro [Fossil 43] Strange Behavior (status) [] [] — As often as you like during your turn (before your attack), you may move 1 damage counter from 1 of your Pokémon to Slowbro as long as you don't Knock Out Slowbro.
- UNCONSUMED - Kabuto [Fossil 50] Kabuto Armor (status) [] [] — Whenever an attack (even your own) does damage to Kabuto (after applying Weakness and Resistance), that attack does half the damage to Kabuto (rounded down to the neare
- UNCONSUMED - Omanyte [Fossil 52] Clairvoyance (status) [] [] — Your opponent plays with his or her hand face up. This power stops working while Omanyte is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Charizard [Base Set 2 4] Energy Burn (status) [] [] — As often as you like during your turn (before your attack), you may turn all Energy attached to Charizard into {R} Energy for the rest of the turn. This power can'
- UNCONSUMED - Mr. Mime [Base Set 2 27] Invisible Wall (damage-prevent) [] [] — Whenever an attack (including your own) does 30 or more damage to Mr. Mime (after applying Weakness and Resistance), prevent that damage. (Any other eff
- UNCONSUMED - Snorlax [Base Set 2 30] Thick Skinned (status) [] [] — Snorlax can't become Asleep, Confused, Paralyzed, or Poisoned. This power stops working while Snorlax is already Asleep, Confused, or Paralyzed.
- UNCONSUMED - Venomoth [Base Set 2 31] Shift (status) [] [] — Once during your turn (before your attack), you may change the type of Venomoth to the type of any other Pokémon in play other than Colorless. This power can't be used i
- UNCONSUMED - Dodrio [Base Set 2 37] Retreat Aid (retreat-cost) [] [] — As long as Dodrio is Benched, pay {C} less to retreat your Active Pokémon.
- UNCONSUMED - Dark Dugtrio [Team Rocket 6] Sinkhole (status) [] [] — Whenever your opponent's Active Pokémon retreats, your opponent flips a coin. If tails, this power does 20 damage to that Pokémon. (Don't apply Weakness and Resis
- UNCONSUMED - Dark Gyarados [Team Rocket 8] Final Beam (ko-prevention) [] [] — When Dark Gyarados is Knocked Out by an attack, flip a coin. If heads, this power does 20 damage for each {W} Energy attached to Dark Gyarados to the Po
- UNCONSUMED - Dark Vileplume [Team Rocket 13] Hay Fever (status) [] [] — No Trainer cards can be played. This power stops working while Dark Vileplume is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Dark Dugtrio [Team Rocket 23] Sinkhole (status) [] [] — Whenever your opponent's Active Pokémon retreats, your opponent flips a coin. If tails, this power does 20 damage to that Pokémon. (Don't apply Weakness and Resi
- UNCONSUMED - Dark Gyarados [Team Rocket 25] Final Beam (ko-prevention) [] [] — When Dark Gyarados is Knocked Out by an attack, flip a coin. If heads, this power does 20 damage for each {W} Energy attached to Dark Gyarados to the P
- UNCONSUMED - Dark Vileplume [Team Rocket 30] Hay Fever (status) [] [] — No Trainer cards can be played. This power stops working while Dark Vileplume is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Dark Primeape [Team Rocket 43] Frenzy (status) [] [] — If Dark Primeape does any damage while it's Confused (even to itself), it does 30 more damage.
- UNCONSUMED - Brock's Rhydon [Gym Heroes 2] Bench Guard (bench-guard) [] [] — As long as Brock's Rhydon is Benched, whenever 1 of your Benched Pokémon is damaged, you may do 10 of that damage to Brock's Rhydon instead. (If more tha
- UNCONSUMED - Erika's Vileplume [Gym Heroes 5] Pollen Defense (ko-prevention) [] [] — If an attack does damage to Erika's Vileplume while it's your Active Pokémon (even if it's Knocked Out), flip a coin. If heads, your opponent's A
- UNCONSUMED - Misty's Tentacruel [Gym Heroes 10] Flee (damage-prevent) [] [] — If an attack does damage to Misty's Tentacruel while it's your Active Pokémon, you may switch it with 1 of your Benched Pokémon, which prevents all othe
- UNCONSUMED - Rocket's Moltres [Gym Heroes 12] Rebirth (recursion) [] [] — When Rocket's Moltres is Knocked Out, you may return it to your hand after discarding it. This power can't be used if Rocket's Moltres is Asleep, Confused, 
- UNCONSUMED - Rocket's Snorlax [Gym Heroes 33] Restless Sleep (status) [] [] — If your opponent's attack does damage to Rocket's Snorlax and Rocket's Snorlax is already Asleep (even if it's Knocked Out), this power does 20 damage t
- UNCONSUMED - Erika's Oddish [Gym Heroes 47] Photosynthesis (status) [] [] — All Energy cards attached to Erika's Oddish provide {G} Energy instead of their usual type. This power works even while Erika's Oddish is Asleep, Confused
- UNCONSUMED - Brock's Ninetales [Gym Challenge 3] Shapeshift (status) [] [] — Once during your turn (before your attack), you may attach an Evolution card from your hand to Brock's Ninetales. (This doesn't count as evolving Brock's
- UNCONSUMED - Misty's Gyarados [Gym Challenge 13] Rebellion (status) [] [] — Whenever Misty's Gyarados attacks, flip 2 coins. If both of them are tails, that attack does nothing. Instead, shuffle Misty's Gyarados and all cards atta
- UNCONSUMED - Sabrina's Alakazam [Gym Challenge 16] Psylink (status) [] [] — Sabrina's Alakazam always has a copy of every attack your {P} Pokémon in play have (including their Energy costs and anything else required in order to us
- UNCONSUMED - Blaine's Ninetales [Gym Challenge 21] Healing Fire (status) [] [] — Whenever you attach a {R} Energy card from your hand to Blaine's Ninetales, remove 1 damage counter from it, if it has any. This power stops working 
- UNCONSUMED - Koga's Muk [Gym Challenge 26] Energy Drain (ko-prevention) [] [] — If an opponent's attack does damage to Koga's Muk (even if Koga's Muk is Knocked Out), flip a coin. If heads and if it has any, choose 1 Energy card a
- UNCONSUMED - Brock's Primeape [Gym Challenge 35] Scram (status) [] [] — If Brock's Primeape ever has exactly 10 HP left, shuffle it and all cards attached to it into your deck. This power stops working while Brock's Primeape is As
- UNCONSUMED - Erika's Ivysaur [Gym Challenge 41] Relaxing Scent (status) [] [] — As long as Erika's Ivysaur is your Active Pokémon, whenever an attack (even your own) does damage to any Pokémon (after applying Weakness and Resistan
- UNCONSUMED - Lt. Surge's Electrode [Gym Challenge 52] Shock Blast (ko-prevention) [] [] — If Lt. Surge's Electrode is your Active Pokémon and gets damaged (even if it's Knocked Out), flip a coin. If tails, this power does 20 damag
- UNCONSUMED - Sabrina's Gastly [Gym Challenge 97] Gaseous Form (status) [] [] — Sabrina's Gastly gets +10 HP for each {P} Energy card attached to it. This power works even if Sabrina's Gastly is Asleep, Confused, or Paralyzed.
- UNCONSUMED - Heracross [Neo Genesis 6] Final Blow (status) [] [] — If Heracross's remaining HP are 20 or less, you may make its Megahorn attack's base damage 120 instead of 60. This power can't be used if Heracross is Asleep, Conf
- UNCONSUMED - Slowking [Neo Genesis 14] Mind Games (status) [] [] — Whenever your opponent plays a Trainer card, you may flip a coin. If heads, that card does nothing. Put it on top of your opponent's deck. This power can't be used
- UNCONSUMED - Elekid [Neo Genesis 22] Playful Punch (status) [] [] — Once during your turn (before your attack), you may flip a coin. If heads, do 20 damage to your opponent's Active Pokémon. (Apply Weakness and Resistance.) Either
- UNCONSUMED - Lanturn [Neo Genesis 38] Hydroelectric Power (status) [] [] — You may make Floodlight do 10 more damage for each {W} Energy attached to Lanturn but not used to pay for Floodlight's Energy cost. This power can't be use
- UNCONSUMED - Forretress [Neo Discovery 2] Spikes (status) [] [] — During your opponent's turn, whenever 1 of your opponent's Benched Pokémon becomes his or her Active Pokémon, Forretress does 10 damage to it. (Don't apply Weakness
- UNCONSUMED - Unown A [Neo Discovery 14] [Anger] (damage-bonus) [] [] — Whenever 1 of your Pokémon with Unown in its name uses its Hidden Power attack, that attack does 10 more damage for each damage counter on Unown A. If you have
- UNCONSUMED - Forretress [Neo Discovery 21] Spikes (status) [] [] — During your opponent's turn, whenever 1 of your opponent's Benched Pokémon becomes his or her Active Pokémon, Forretress does 10 damage to it. (Don't apply Weaknes
- UNCONSUMED - Unown A [Neo Discovery 33] [Anger] (damage-bonus) [] [] — Whenever 1 of your Pokémon with Unown in its name uses its Hidden Power attack, that attack does 10 more damage for each damage counter on Unown A. If you have
- UNCONSUMED - Eevee [Neo Discovery 38] Energy Evolution (search) [] [] — Whenever you attach an Energy card to Eevee, flip a coin. If heads, search your deck for a card that evolves from Eevee that is the same type as the Energy ca
- UNCONSUMED - Igglybuff [Neo Discovery 40] Gaze (effect-prevent) [] [] — Once during your turn (before your attack), choose 1 of your opponent's Benched Pokémon that has a Pokémon Power. That power stops working until the end of th
- UNCONSUMED - Unown D [Neo Discovery 47] [Darkness] (status) [] [] — Whenever a {D} Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more tha
- UNCONSUMED - Unown M [Neo Discovery 49] [Metal] (status) [] [] — Whenever a {M} Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more than 1
- UNCONSUMED - Unown N [Neo Discovery 50] [Normal] (status) [] [] — Whenever a {C} Pokémon damages 1 of your Pokémon, reduce that damage by 30 (after applying Weakness and Resistance). This power stops working if you have more than 
- UNCONSUMED - Celebi [Neo Revelation 3] Time Travel (ko-prevention) [] [] — If an opponent's attack would Knock Out Celebi, flip a coin. If heads, Celebi isn't Knocked Out and you shuffle it and all cards attached to it into your d
- UNCONSUMED - Porygon2 [Neo Revelation 12] Energy Converter (status) [] [] — Once during your turn (before your attack), you may choose 1 basic Energy card attached to 1 of your Pokémon and choose an Energy type. Treat that Energy 
- UNCONSUMED - Raikou [Neo Revelation 13] Lightning Burst (switch) [] [] — Whenever you attach a {L} Energy card from your hand to Raikou, if your opponent has any Benched Pokémon, he or she chooses 1 of them and switches it with th
- UNCONSUMED - Aerodactyl [Neo Revelation 15] Prehistoric Memory (status) [] [] — Whenever an Evolved Pokémon attacks (even if it's your opponent's), it can use any attack from its Basic Pokémon card or any Evolution card attached t
- UNCONSUMED - Entei [Neo Revelation 17] Legendary Body (status) [] [] — As long as Entei is your Active Pokémon, Entei and Energy cards attached to it aren't affected by effects from Trainer cards other than Stadium cards. As long 
- UNCONSUMED - Raikou [Neo Revelation 22] Legendary Body (status) [] [] — As long as Raikou is your Active Pokémon, Raikou and Energy cards attached to it aren't affected by effects from Trainer cards other than Stadium cards. As lo
- UNCONSUMED - Suicune [Neo Revelation 27] Legendary Body (status) [] [] — As long as Suicune is your Active Pokémon, Suicune and Energy cards attached to it aren't affected by effects from Trainer cards other than Stadium cards. As
- UNCONSUMED - Lanturn [Neo Revelation 32] Submerge (status) [] [] — Once during your turn (before your attack), you may change Lanturn's type to {W} until the end of your turn. This power can't be used if Lanturn is Asleep, Confuse
- UNCONSUMED - Magcargo [Neo Revelation 33] Magma Pool (retreat-cost) [] [] — If Magcargo is your Active Pokémon and moves to the Bench, remove 1 {R} Energy card attached to Magcargo, if any, and attach it to the new Active Pokémon.
- UNCONSUMED - Parasect [Neo Revelation 35] Allergic Pollen (status) [] [] — As long as Parasect is in play, cards in any player's discard piles are not affected by attacks or Pokémon Powers. This power stops working if Parasect bec
- UNCONSUMED - Unown B [Neo Revelation 39] [Bear] (status) [] [] — Once during your turn (before your attack), you may move 1 damage counter from 1 of your Pokémon with Unown in its name to Unown B. This power can't be used if Unown
- UNCONSUMED - Unown K [Neo Revelation 58] [Keep] (opponent-disrupt) [] [] — Your opponent's attacks, Pokémon Powers, and Trainer cards can't discard Energy cards from your Pokémon with Unown in their names. (Any other effects still
- UNCONSUMED - Dark Ampharos [Neo Destiny 1] Conductivity (status) [] [] — Whenever your opponent attaches an Energy card from his or her hand to a Pokémon, this power does 10 damage to that Pokémon. (Don't apply Weakness and Resist
- UNCONSUMED - Dark Feraligatr [Neo Destiny 5] Scare (status) [] [] — As long as Dark Feraligatr is your Active Pokémon, all of your opponent's Baby Pokémon Powers stop working and your opponent's Baby Pokémon can't attack. This pow
- UNCONSUMED - Dark Gengar [Neo Destiny 6] Deep Sleep (status) [] [] — As long as any Dark Gengar are in play, a player flips 2 coins for each of his or her Pokémon that is Asleep at the end of each turn. If either of them is tails,
- UNCONSUMED - Dark Porygon2 [Neo Destiny 8] Spatial Distortion (status) [] [] — Once during your turn (before your attack), you may flip a coin. If heads, choose a Stadium card from your discard pile and put it into play. (If there
- UNCONSUMED - Light Dragonite [Neo Destiny 14] Miraculous Wind (status) [] [] — As long as Light Dragonite is your Active Pokémon, each Special Energy card provides {C} Energy instead of its usual type and its other effects stop wo
- UNCONSUMED - Dark Magcargo [Neo Destiny 18] Hot Plate (status) [] [] — As long as Dark Magcargo is your Active Pokémon, whenever a player puts a Baby Pokémon or Basic Pokémon onto his or her Bench from his or her hand, this power 
- UNCONSUMED - Light Piloswine [Neo Destiny 26] Fluffy Wool (ko-prevention) [] [] — During your opponent's turn, if Light Piloswine is your Active Pokémon and is damaged by your opponent's attack (even if it's Knocked Out), flip a c
- UNCONSUMED - Unown X [Neo Destiny 30] [XXXXX] (damage-bonus) [] [] — Whenever 1 of your Pokémon with Unown in its name uses its Hidden Power attack, flip a coin until you get tails. That attack does 10 more damage for each heads. 
- UNCONSUMED - Unown C [Neo Destiny 57] [Chase] (move-damage) [] [] — As long as Unown C is your Active Pokémon, whenever your opponent's Active Pokémon tries to retreat, flip a coin. If heads, put 1 damage counter on that Pokémon. 
- UNCONSUMED - Unown P [Neo Destiny 58] [Perform] (status) [] [] — If an attack damaged Unown P during your opponent's last turn and Unown P was your Active Pokémon, Unown P's Hidden Power attack does that much more damage to the De
- UNCONSUMED - Unown Z [Neo Destiny 60] [Zoom] (retreat-cost) [] [] — As long as Unown Z is Benched, you pay no Energy cost to retreat a Pokémon with Unown in its name.
- UNCONSUMED - Charizard [Legendary Collection 3] Energy Burn (status) [] [] — As often as you like during your turn (before your attack), you may turn all Energy attached to Charizard into {R} Energy for the rest of the turn. This 
- UNCONSUMED - Machamp [Legendary Collection 15] Strikes Back (ko-prevention) [] [] — Whenever your opponent's attack damages Machamp (even if Machamp is Knocked Out), this power does 10 damage to the attacking Pokémon. (Don't apply
- UNCONSUMED - Muk [Legendary Collection 16] Toxic Gas (status) [] [] — Ignore all Pokémon Powers other than Toxic Gases. This power stops working while Muk is affected by a Special Condition.
- UNCONSUMED - Dodrio [Legendary Collection 41] Retreat Aid (retreat-cost) [] [] — As long as Dodrio is Benched, pay {C} less to retreat your Active Pokémon.
- UNCONSUMED - Kabuto [Legendary Collection 48] Kabuto Armor (status) [] [] — Whenever an attack (even your own) does damage to Kabuto (after applying Weakness and Resistance), that attack does only half the damage to Kabuto (rounde
- UNCONSUMED - Omanyte [Legendary Collection 57] Clairvoyance (status) [] [] — Your opponent plays with his or her hand face up. This power stops working while Omanyte is affected by a Special Condition.
- UNCONSUMED - Snorlax [Legendary Collection 64] Thick Skinned (status) [] [] — Snorlax can't become Asleep, Confused, Paralyzed, Poisoned, or Burned. This power stops working while Snorlax is affected by a Special Condition.
- UNCONSUMED - Tentacool [Legendary Collection 96] Cowardice (status) [] [] — At any time during your turn (before your attack), you may return Tentacool to your hand. (Discard all cards attached to Tentacool.) This power can't be u
- CONSUMED - Haunter [Fossil 6] Transparency (damage-prevent) [] [] — Whenever an attack does anything to Haunter, flip a coin. If heads, prevent all effects of that attack, including damage, done to Haunter. This power stops workin
- CONSUMED - Haunter [Fossil 21] Transparency (damage-prevent) [] [] — Whenever an attack does anything to Haunter, flip a coin. If heads, prevent all effects of that attack, including damage, done to Haunter. This power stops worki
- CONSUMED - Dark Muk [Team Rocket 41] Sticky Goo (status) [] [] — As long as Dark Muk is your Active Pokémon, your opponent pays {C}{C} more to retreat his or her Active Pokémon. This power stops working while Dark Muk is Asleep, C
- CONSUMED - Misty's Cloyster [Gym Heroes 29] Shell Armor (status) [] [] — You may reduce all damage done by attacks to Misty's Cloyster by 10 (after applying Weakness and Resistance). (Any other effects of attacks still happen). Th
- CONSUMED - Erika's Dratini [Gym Heroes 42] Strange Barrier (status) [] [] — Whenever an attack by a Basic Pokémon (including your own) does 20 or more damage to Erika's Dratini (after applying Weakness and Resistance), reduce that
- CONSUMED - Giovanni's Machamp [Gym Challenge 6] Fortitude (ko-prevention) [] [] — If Giovanni's Machamp would be Knocked Out by an opponent's attack, flip a coin. If heads, Giovanni's Machamp is not Knocked Out and its remaining H
- CONSUMED - Meganium [Neo Genesis 11] Wild Growth (status) [] [] — As long as Meganium is in play, each {G} Energy card attached to your {G} Pokémon instead provides {G}{G}. This power stops working while Meganium is Asleep, Confus
- CONSUMED - Politoed [Neo Discovery 8] Frog Song (status) [] [] — Whenever Politoed's attack damages the Defending Pokémon (after applying Weakness and Resistance), if there are more than 3 Poliwags, Poliwhirls, Poliwraths, and/or 
- CONSUMED - Politoed [Neo Discovery 27] Frog Song (status) [] [] — Whenever Politoed's attack damages the Defending Pokémon (after applying Weakness and Resistance), if there are more than 3 Poliwags, Poliwhirls, Poliwraths, and/or
- CONSUMED - Suicune [Neo Revelation 14] Crystal Body (damage-prevent) [] [] — Prevent all effects of your opponent's attacks, other than damage, done to Suicune. This power stops working while Suicune is Asleep, Confused, or Paraly
- CONSUMED - Sudowoodo [Neo Revelation 26] Mimic (status) [] [] — As long as Sudowoodo is your Active Pokémon, it copies all of the Defending Pokémon's attacks, including their costs. This power can't be used if Sudowoodo is Asleep,
- CONSUMED - Shuckle [Neo Revelation 51] Hard Shell (status) [] [] — Whenever an attack (including your own) does 40 or less damage to Shuckle (after applying Weakness and Resistance), reduce that damage to 10. (Any other effects of
- CONSUMED - Haunter [Legendary Collection 46] Transparency (damage-prevent) [] [] — Whenever an attack does anything to Haunter, flip a coin. If heads, prevent all effects of that attack, including damage, done to Haunter. This pow

## Appendix D — Trainer runtime probe (untyped, as TCGdex delivers WotC Trainers)
- T Clefairy Doll [Base Set] → card@p1.bench | p1 hand-1 bench+1 | p2 - | prompts 0 | ev 
- T Computer Search [Base Set] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev deckShuffled
- T Devolution Spray [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Impostor Professor Oak [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 deck-2 hand+2 | prompts 0 | ev cardsMovedToDeckBottom,cardsDrawn
- T Item Finder [Base Set] → card@p1.discard | p1 - | p2 - | prompts 1 | ev cardsRecovered
- T Lass [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Pokémon Breeder [Base Set] ERROR You need a Stage 2 Pokémon in hand that evolves from a Basic Pokémon you have in play. 
- T Pokémon Trader [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Scoop Up [Base Set] → card@p1.discard | p1 active-8 bench-2 discard+10 | p2 - | prompts 2 | ev pokemonPromoted
- T Super Energy Removal [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 active-1 discard+1 | prompts 1 | ev cardsDiscarded
- T Defender [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Energy Retrieval [Base Set] → card@p1.discard | p1 - | p2 - | prompts 2 | ev cardsRecovered
- T Full Heal [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Maintenance [Base Set] → card@p1.discard | p1 deck+1 hand-2 discard+1 | p2 - | prompts 1 | ev deckShuffled,cardsDrawn
- T PlusPower [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Pokémon Center [Base Set] → card@p1.discard | p1 hand-1 active-8 bench-3 discard+12 | p2 - | prompts 0 | ev damageUpdated,cardsDiscarded
- T Pokémon Flute [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 bench+1 discard-1 | prompts 1 | ev 
- T Pokédex [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 1 | ev 
- T Professor Oak [Base Set] → card@p1.discard | p1 deck-7 hand+6 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Revive [Base Set] → card@p1.discard | p1 hand-1 bench+1 | p2 - | prompts 1 | ev 
- T Super Potion [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 1 | ev damageUpdated
- T Bill [Base Set] → card@p1.discard | p1 deck-2 hand+1 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Energy Removal [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 active-1 discard+1 | prompts 1 | ev cardsDiscarded
- T Gust of Wind [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 active-8 bench+8 | prompts 1 | ev cardSwitched
- T Potion [Base Set] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 1 | ev damageUpdated
- T Switch [Base Set] → card@p1.discard | p1 hand-1 active-8 bench+8 discard+1 | p2 - | prompts 1 | ev cardSwitched
- T Poké Ball [Jungle] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Mr. Fuji [Fossil] → card@p1.discard | p1 deck+2 hand-1 bench-2 discard+1 | p2 - | prompts 1 | ev deckShuffled
- T Energy Search [Fossil] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev deckShuffled
- T Gambler [Fossil] → card@p1.discard | p1 deck+4 hand-5 discard+1 | p2 - | prompts 0 | ev coinFlipped,deckShuffled,cardsDrawn
- T Recycle [Fossil] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Mysterious Fossil [Fossil] → card@p1.bench | p1 hand-1 bench+1 | p2 - | prompts 0 | ev 
- T Imposter Professor Oak [Base Set 2] → card@p1.discard | p1 hand-1 discard+1 | p2 deck-2 hand+2 | prompts 0 | ev cardsMovedToDeckBottom,cardsDrawn
- T Switch [Base Set 2] → card@p1.discard | p1 hand-1 active-8 bench+8 discard+1 | p2 - | prompts 1 | ev cardSwitched
- T Here Comes Team Rocket! [Team Rocket] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev cardsRevealed
- T Rocket's Sneak Attack [Team Rocket] → card@p1.discard | p1 hand-1 discard+1 | p2 deck+1 hand-1 | prompts 1 | ev deckShuffled
- T The Boss's Way [Team Rocket] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev deckShuffled
- T Challenge! [Team Rocket] → card@p1.discard | p1 deck-2 hand+1 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Digger [Team Rocket] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Imposter Oak's Revenge [Team Rocket] → card@p1.discard | p1 hand-1 discard+1 | p2 deck+1 hand-1 | prompts 0 | ev cardsMovedToDeckBottom,cardsDrawn
- T Nightly Garbage Run [Team Rocket] → card@p1.discard | p1 deck+3 hand-1 discard-2 | p2 - | prompts 1 | ev deckShuffled,cardsShuffledIntoDeck
- T Goop Gas Attack [Team Rocket] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Sleep! [Team Rocket] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Brock [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev damageUpdated
- T Erika [Gym Heroes] → card@p1.discard | p1 deck-3 hand+2 discard+1 | p2 deck-3 hand+3 | prompts 0 | ev cardsDrawn
- T Lt. Surge [Gym Heroes] → card@p1.discard | p1 hand-2 active-9 bench+10 discard+1 | p2 - | prompts 0 | ev cardSwitched
- T Misty [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T The Rocket's Trap [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Blaine's Quiz #1 [Gym Heroes] → card@p1.discard | p1 deck-2 hand+1 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Charity [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Blaine's Last Resort [Gym Heroes] ERROR You can't have any cards in your hand other than Blaine's Last Resort. 
- T Brock's Training Method [Gym Heroes] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev cardsRevealed,deckShuffled
- T Erika's Maids [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Erika's Perfume [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 hand-1 bench+1 | prompts 1 | ev 
- T Good Manners [Gym Heroes] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev cardsRevealed,deckShuffled
- T Lt. Surge's Treaty [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Minion of Team Rocket [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 deck-1 hand+1 | prompts 0 | ev coinFlipped,turnEndRequested,turnStarted,cardsDrawn
- T Misty's Wrath [Gym Heroes] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev deckShuffled
- T Recall [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Sabrina's ESP [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Secret Mission [Gym Heroes] → card@p1.discard | p1 deck-3 hand-1 discard+4 | p2 - | prompts 1 | ev cardsDiscarded,cardsDrawn
- T Tickling Machine [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 deck-1 hand+1 | prompts 0 | ev coinFlipped,turnEndRequested,turnStarted,cardsDrawn
- T Blaine's Gamble [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Energy Flow [Gym Heroes] → card@p1.discard | p1 hand+2 active-3 discard+1 | p2 - | prompts 1 | ev 
- T Misty's Duel [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Sabrina's Gaze [Gym Heroes] → card@p1.discard | p1 deck-1 discard+1 | p2 deck-1 hand+1 | prompts 0 | ev cardsMovedToDeckBottom,cardsDrawn
- T Trash Exchange [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev deckShuffled,cardsDiscarded
- T Blaine [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Giovanni [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Koga [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Sabrina [Gym Challenge] → card@p1.discard | p1 hand-1 active-1 bench+1 discard+1 | p2 - | prompts 3 | ev cardAttached
- T Brock's Protection [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Erika's Kindness [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev damageUpdated
- T Giovanni's Last Resort [Gym Challenge] → card@p1.discard | p1 deck-1 hand-5 discard+6 | p2 - | prompts 1 | ev damageUpdated,cardsDiscarded,cardsDrawn
- T Lt. Surge's Secret Plan [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Misty's Wish [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Blaine's Quiz #2 [Gym Challenge] → card@p1.discard | p1 deck-2 hand+1 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Blaine's Quiz #3 [Gym Challenge] → card@p1.discard | p1 deck-3 hand+2 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Koga's Ninja Trick [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Master Ball [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev cardsLookedAt,deckShuffled
- T Max Revive [Gym Challenge] → card@p1.discard | p1 hand-1 bench+1 | p2 - | prompts 1 | ev 
- T Misty's Tears [Gym Challenge] → card@p1.discard | p1 deck-2 hand+1 discard+1 | p2 - | prompts 1 | ev cardsRevealed,deckShuffled
- T Rocket's Secret Experiment [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Sabrina's Psychic Control [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Fervor [Gym Challenge] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev deckShuffled
- T Transparent Walls [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Warp Point [Gym Challenge] → card@p1.discard | p1 hand-1 active-8 bench+8 discard+1 | p2 active-8 bench+8 | prompts 2 | ev cardSwitched
- T Arcade Game [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Energy Charge [Neo Genesis] → card@p1.discard | p1 deck+2 hand-1 discard-1 | p2 - | prompts 1 | ev deckShuffled,cardsShuffledIntoDeck
- T Focus Band [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Mary [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 1 | ev deckShuffled,cardsDrawn
- T PokéGear [Neo Genesis] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev cardsRevealed,deckShuffled
- T Super Energy Retrieval [Neo Genesis] → card@p1.discard | p1 - | p2 - | prompts 2 | ev cardsRecovered
- T Time Capsule [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Bill's Teleporter [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Card-Flip Game [Neo Genesis] → card@p1.discard | p1 deck-2 hand+1 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Gold Berry [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Miracle Berry [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T New Pokédex [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 1 | ev 
- T Professor Elm [Neo Genesis] → card@p1.discard | p1 deck-2 hand+1 discard+1 | p2 - | prompts 0 | ev deckShuffled,cardsDrawn
- T Super Scoop Up [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Berry [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Double Gust [Neo Genesis] → card@p1.discard | p1 hand-1 active-8 bench+8 discard+1 | p2 active-8 bench+8 | prompts 2 | ev cardSwitched
- T Moo-Moo Milk [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 1 | ev damageUpdated
- T Pokémon March [Neo Genesis] → card@p1.discard | p1 deck-1 hand-1 bench+1 discard+1 | p2 - | prompts 1 | ev cardsRevealed,deckShuffled
- T Super Rod [Neo Genesis] → card@p1.discard | p1 - | p2 - | prompts 1 | ev cardsRecovered
- T Fossil Egg [Neo Discovery] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Hyper Devolution Spray [Neo Discovery] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Ruin Wall [Neo Discovery] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev deckShuffled
- T Energy Ark [Neo Discovery] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev cardsRevealed,deckShuffled
- T Balloon Berry [Neo Revelation] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Pokémon Breeder Fields [Neo Revelation] → card@p1.discard | p1 deck-1 discard+1 | p2 - | prompts 1 | ev deckShuffled
- T Old Rod [Neo Revelation] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T EXP.ALL [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Impostor Professor Oak's Invention [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Thought Wave Machine [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- T Counterattack Claws [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Energy Amplifier [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Magnifier [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- T Pokémon Personality Test [Neo Destiny] → card@p1.discard | p1 deck-3 hand+2 discard+1 | p2 - | prompts 0 | ev cardsDrawn
- T Team Rocket's Evil Deeds [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 1 | ev deckShuffled,cardsDrawn
- T Heal Powder [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev coinFlipped
- T Mail from Bill [Neo Destiny] ERROR You have too many cards in your hand to play this card. 
- T Pokémon Breeder [Legendary Collection] ERROR You need a Stage 2 Pokémon in hand that evolves from a Basic Pokémon you have in play. 
- T Mysterious Fossil [Legendary Collection] → card@p1.bench | p1 hand-1 bench+1 | p2 - | prompts 0 | ev 
- S No Removal Gym [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S The Rocket's Training Gym [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Celadon City Gym [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Cerulean City Gym [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Pewter City Gym [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Vermilion City Gym [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Narrow Gym [Gym Heroes] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Chaos Gym [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Resistance Gym [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Cinnabar City Gym [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Fuchsia City Gym [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Rocket's Minefield Gym [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Saffron City Gym [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Viridian City Gym [Gym Challenge] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Ecogym [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Sprout Tower [Neo Genesis] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Healing Field [Neo Revelation] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Rocket's Hideout [Neo Revelation] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Broken Ground Gym [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev 
- S Radio Tower [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Energy Stadium [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped
- S Lucky Stadium [Neo Destiny] → card@p1.discard | p1 hand-1 discard+1 | p2 - | prompts 0 | ev effectStepSkipped

## Appendix E — Stadium text audit (scripts/audit-all-stadiums.mjs on the WotC rows)
```
Stadium printings scanned : 22
Unique (name+text) cards   : 22

=== By family ===
    8  continuous-both
    7  once-per-turn
    7  unknown

=== By execution status ===
    8  passive-wired
    7  announce-only
    1  active-discard-erika-cure
    1  active-shuffle-own-pokemon
    1  active-return-sabrina-energy
    1  active-heal
    1  active-peek-return
    1  active-recover-energy
    1  active-draw

=== Gaps: unhandled / announce-only (7) ===

[Gym Challenge #102] Chaos Gym — family=unknown status=announce-only
  Whenever a player plays a Trainer card other than a Stadium card, he or she flips a coin. If heads, that player plays that card normally. If tails, the player can't play that card. If the card isn't put into play, the player's opponent may use that card instead, if he or she does everything required in order to play that card (like discarding cards). Either way, the card goes to its owner's discard pile.

[Gym Challenge #113] Cinnabar City Gym — family=unknown status=announce-only
  Ignore Weakness when a {W} Pokémon does damage to a Pokémon with Blaine in its name.

[Gym Heroes #115] Pewter City Gym — family=unknown status=announce-only
  Don't apply Resistance to any attacks made by Pokémon with Brock in their names.

[Gym Challenge #109] Resistance Gym — family=unknown status=announce-only
  Each Pokémon's Resistance is reduced by 20. (If a Pokémon's Resistance is -30, it becomes -10.)

[Gym Challenge #119] Rocket's Minefield Gym — family=unknown status=announce-only
  Whenever a player puts a Basic Pokémon onto his or her Bench from his or her hand, he or she flips a coin. If tails, put damage counters on that Pokémon.

[Gym Heroes #120] Vermilion City Gym — family=unknown status=announce-only
  Whenever a player attacks with a Pokémon with Lt. Surge in its name, he or she may flip a coin. If heads, and if that Pokémon's attack does damage to the Defending Pokémon (after applying Weakness and Resistance), that attack does 10 more damage to the Defending Pokémon. If tails, the attacking Pokémon does 10 damage to itself in addition to whatever its attack usually does.

[Gym Challenge #123] Viridian City Gym — family=unknown status=announce-only
  Whenever a Pokémon with Giovanni in its name evolves, its owner removes 2 damage counters from that Pokémon (or 1 if it only has 1).

=== Suspicious mis-parses (1) ===

[Neo Revelation #61] Healing Field — fallback-heal (no heal wording)
  parsed: {"n":20,"coin":true,"kind":"heal","target":"active"}
  Once during each player's turn, he or she may flip a coin. If heads, that player removes 2 damage counters from his or her Active Pokémon (1 if it only has 1).
```