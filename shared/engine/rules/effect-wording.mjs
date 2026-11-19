// One spelling per phrase, before any effect parser reads a card's text.
//
// The parsers match the wording printed cards use ("1 of your Pokémon", "put it onto your
// Bench", "can't"). Hand-written text (custom sets) and some older printings say the same
// thing in other words ("one of your Pokémon", "place it on your Bench", "cannot"), and each
// such phrase used to need its own branch in every parser. This leaf module (no imports)
// rewrites those phrases to the printed spelling; every parser entry calls it, so a synonym
// is taught here once. It never changes a number, a kind or a type: only the words around them.

const NUMBER_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUMBER_WORD_RE = new RegExp(
  `\\b(${Object.keys(NUMBER_WORDS).join('|')})(?= (?:(?:more|fewer|other|basic|special|different|of|or more|or fewer|damage|prize|energy|cards?|coins?|pok[ée]mon|\\{[a-z]\\})\\b|\\{))`,
  'gi'
);

// "up to two Grookey cards": after "up to" a number word is a count whatever follows it.
const UP_TO_NUMBER_WORD_RE = new RegExp(`(?<=\\bup to )(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi');
const digitsOf = (word) => String(NUMBER_WORDS[word.toLowerCase()]);

const REWRITES = [
  [UP_TO_NUMBER_WORD_RE, digitsOf],
  // "one of your Benched Pokémon", "one of their Pokémon", "one of your opponent's Pokémon".
  [/\bone of (your|their|his or her|the|those|them)\b/gi, '1 of $1'],
  [NUMBER_WORD_RE, digitsOf],
  // "place them on your Bench" / "put it on your Bench" → "put … onto your Bench".
  [/\bplace (it|them|that card|those cards|that pok[ée]mon|those pok[ée]mon) (?:on|onto|in|into) your\b/gi, 'put $1 onto your'],
  [/\b(put (?:it|them|that card|those cards|that pok[ée]mon|those pok[ée]mon)) on your bench\b/gi, '$1 onto your Bench'],
  [/\bput (it|them|that card|those cards) onto your hand\b/gi, 'put $1 into your hand'],
  // "Switch out your opponent's Active Pokémon with 1 of their Benched Pokémon" is the gust
  // "Switch your opponent's Active Pokémon with 1 of their Benched Pokémon".
  [/\bswitch out (your opponent's active pok[ée]mon with)\b/gi, 'switch $1'],
  // "Then switch this Pokémon …" → "Then, switch this Pokémon …". Only before "switch": older
  // printings read "Then discard …" without the comma, and their parsers match it that way.
  [/(^|[.)] )then (?=switch )/gi, '$1Then, '],
  // "prevent all damage done to this Pokémon." names attacks on every printed card.
  [/\b(prevent all damage done to this pok[ée]mon)(?=\s*(?:[.,]|$))/gi, '$1 by attacks'],
  // Missing apostrophe: "your opponents Active Pokémon".
  [/\b(your|their) opponents (?=active|bench|pok[ée]mon|hand|deck|discard|prize|next|turn|attack)/gi, "$1 opponent's "],
  [/\bactive (?:slot|position)\b/gi, 'Active Spot'],
  // Hand-typed misspellings in the homebrew set (customhb): "cant", "tires to attak", "hads".
  [/\bcant\b/gi, "can't"],
  [/\btires to attak\b/gi, 'tries to attack'],
  [/\bfor each hads\b/gi, 'for each heads'],
  // Alolan Golem Electromagnetic Catapult: "This Pokémon does 70 damage to the Defending Pokémon
  // for each heads" is the printed "This attack does 70 damage for each heads".
  [/\bthis pok[ée]mon does (\d+) damage to the defending pok[ée]mon for each heads\b/gi, 'This attack does $1 damage for each heads'],
  // "the opponent's Active Pokémon" is "your opponent's Active Pokémon".
  [/(^|[^\w'])the opponent's (?=active)/gi, "$1your opponent's "],
  // "If both are heads the Defending Pokémon …": the printed gate has a comma.
  [/\b(if (?:heads|tails|both (?:of them )?are heads|both are tails))(?= (?:the|your|this|that|it|you)\b)/gi, '$1,'],
  // "is a {C} type" / "is {C} type" (Zygarde Thousand Arrows, Groudon Rock Slide) is "is a {C} Pokémon".
  [/\bis (?:an? )?(\{[a-z]\}) type\b/gi, 'is a $1 Pokémon'],
  // Galarian Slowking Acid Spray: "If your opponent's Active Pokémon is a {M} Type, they are now
  // Poisoned." — the pronoun is that Pokémon.
  [/\b(if your opponent's active pok[ée]mon is [^,.]+), they are now\b/gi, '$1, it is now'],
  // Dialga Chrono Burst: "You may shuffle all Energy attached to this Pokémon into your deck and
  // have this attack do 50 more damage" is the two-sentence optional cost.
  [
    /\byou may (shuffle all energy attached to this pok[ée]mon into your deck) and have this attack do (\d+) more damage\b/gi,
    'You may $1. If you do, this attack does $2 more damage',
  ],
  // Magnemite Polarity: "Choose 1 card from your hand to discard."; Whimsicott Sneaky Pocket:
  // "Put a card from your hand in the discard pile."
  [/\bchoose (?:1|a) card from your hand to discard\b/gi, 'Discard a card from your hand'],
  [/\bput a card from your hand (?:in|into) (?:the|your) discard pile\b/gi, 'Discard a card from your hand'],
  // Alolan Graveler Electric Punch: "discard the top card of your own deck".
  [/\bthe top card of your own deck\b/gi, 'the top card of your deck'],
  // Rattata Search Trash / Dialga ex Rewind: the discard pile has no top, and "back into" is "into".
  [/\bshuffle the top (\d+) cards from your discard pile into your deck\b/gi, 'shuffle $1 cards from your discard pile into your deck'],
  [/\b(from your discard pile) back into your deck\b/gi, '$1 into your deck'],
  // Aegislash ex Royal Command: "discarded this way" is "discarded in this way".
  [/\b(discarded|attached|moved) this way\b/gi, '$1 in this way'],
  // Tapu Koko Summon Lightning: "any combination of up to 2 …" is "up to 2 in any combination of …".
  [/\bsearch your deck for any combination of up to (\d+) /gi, 'search your deck for up to $1 in any combination of '],
  // Mega Skarmory ex Sonic Ripper: "Shuffle all Energy … into your deck, and this attack does …".
  [/\b(shuffle all energy attached to this pok[ée]mon into your deck), and (this attack does)\b/gi, '$1. This attack does'],
  // Miltank Milk Drink: "Once per turn, …" is the printed "Once during your turn, …", and "heal
  // all of your Pokémon in play by 10 HP" is "heal 10 damage from each of your Pokémon".
  [/^once per turn, /i, 'Once during your turn, '],
  // Thwackey Jungle Opener (customhb): "You may only use this Ability if you evolved this card from
  // your hand this turn. Search the top 3 cards of your deck for a Basic {G} Energy and it attach it
  // to any of your Benched Pokémon. Shuffle your deck afterwards." is the evolve trigger.
  [
    /^you may only use this ability if you evolved this card from your hand this turn\. search the top (\d+) cards of your deck for an? (basic \{[a-z]\} energy)(?: card)? and (?:it )?attach it to (?:any|1|one) of your benched pok[ée]mon\. shuffle your deck afterwards?\./i,
    'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may look at the top $1 cards of your deck and attach a $2 card you find there to 1 of your Benched Pokémon. Shuffle the other cards back into your deck.',
  ],
  // Aggron Iron Armor (customhb): "As long as this Pokémon is on your Bench, prevent all damage done
  // to it." is Kakuna Cocoon Cover's printed wording.
  [
    /\b(as long as this pok[ée]mon is on your bench), prevent all damage done to it\./gi,
    "$1, prevent all damage done to this Pokémon by attacks (both yours and your opponent's).",
  ],
  // Deoxys Form Change (customhb): returning this Pokémon to the hand and putting another of the
  // name in its place, attached cards and damage counters moved over, is the Stance Change swap.
  [
    /\byou may return this pok[ée]mon to your hand and put another ([^.,]+?) from your hand in its place\. if you do, move all attached cards and damage counters from this pok[ée]mon to the new pok[ée]mon\./gi,
    'you may switch this Pokémon with a $1 in your hand. (Any cards attached to this Pokémon and damage counters remain on the new Pokémon.)',
  ],
  // Jellicent Deep Sea Draw: "Draw a card. If you do, you may put a card from your hand on the
  // bottom of your deck." — drawing is what "if you do" asks.
  [/\bdraw a card\. if you do, (you may put a card from your hand on the bottom of your deck)\b/gi, 'Draw a card. $1'],
  [/\bheal all of your pok[ée]mon in play by (\d+) hp\b/gi, 'heal $1 damage from each of your Pokémon'],
  // "This attack also deals 20 damage …" is "does".
  [/\b(this attack (?:also )?)deals (?=\d+ (?:more )?damage\b)/gi, '$1does '],
  // Slurpuff Belly Drum: "This attack also does 50 damage to this Pokémon" is the printed recoil.
  [/\bthis attack also does (\d+) damage to this pok[ée]mon\b/gi, 'This Pokémon also does $1 damage to itself'],
  // Aggron Seismic Rift: "… also does 30 damage to each of your Pokémon" hits the attacker too.
  [
    /\bthis attack also does (\d+) damage to each of your pok[ée]mon\b/gi,
    'This Pokémon also does $1 damage to itself. This attack also does $1 damage to each of your Benched Pokémon',
  ],
  // Swampert Surf / Steelix Earthquake: both Benches, written as two clauses.
  [
    /\b(\d+) damage to each of your benched pok[ée]mon and (?:to )?(?:each of )?your opponent's benched pok[ée]mon\b/gi,
    "$1 damage to each Benched Pokémon (both yours and your opponent's)",
  ],
  // Ting-Lu ex Earthquake: "Put 2 damage counters on 2 of your opponent's Benched Pokémon".
  [
    /\bput (\d+) damage counters on ([2-9]) of your opponent's (benched )?pok[ée]mon\b/gi,
    "choose $2 of your opponent's $3Pokémon and put $1 damage counters on each of them",
  ],
  // Not inside reminder text: "(… you cannot put it face down …)" states no effect.
  [/\bcannot\b(?![^()]*\))/gi, "can't"],
  [/\bcan no longer\b/gi, "can't"],
  // "… can't attack next turn" / "… during their next turn": the printed wording names whose
  // turn ("during your opponent's next turn", "during your next turn").
  [
    /\b((?:your opponent's active pok[ée]mon|the defending pok[ée]mon|they)) can't (attack|retreat)(?: during their next turn| next turn)\b/gi,
    "$1 can't $2 during your opponent's next turn",
  ],
  [/\b(this pok[ée]mon) can't attack next turn\b/gi, "$1 can't attack during your next turn"],
  [/\b(\d+)hp\b/gi, '$1 HP'],
  [/\bpokemon\b/g, 'pokémon'],
  [/\bPokemon\b/g, 'Pokémon'],
];

/** The text with every known synonym rewritten to the printed spelling. Idempotent. */
export function canonicalEffectWording(text) {
  let out = String(text ?? '');
  for (const [pattern, replacement] of REWRITES) out = out.replace(pattern, replacement);
  return out;
}
