/**
 * WotC-era attack wordings rewritten to their modern equivalents so the attack parser's
 * existing templates handle them. Runs on normalized text (self name → "this pokémon",
 * Defending → "your opponent's active pokémon", reminders stripped). Every pattern is anchored
 * on WotC-only phrasing, so modern wordings pass through unchanged.
 */
export const LEGACY_ATTACK_REWRITES = [
  // A period printed after a stripped reminder leaves ".." (Metapod [Neo Discovery 42] Harden:
  // "prevent that damage. (Any other effects of attacks still happen).").
  [/\.\.(?= |$)/g, '.'],
  // The "Lt." in a Gym owner name is not a sentence end (Lt. Surge's Rattata [Gym Heroes 82]
  // Focus Energy: "During your next turn, Lt. Surge's Rattata's Gnaw attack's base damage …").
  [/\blt\. (?=surge's )/g, 'lt '],
  [/prevent all damage done to this pokémon during your opponent's next turn/g, "during your opponent's next turn, prevent all damage done to this pokémon by attacks"],
  [/all damage done (?:by attacks )?to this pokémon during your opponent's next turn is reduced by (\d+)/g, "during your opponent's next turn, any damage done to this pokémon by attacks is reduced by $1"],
  [/during your opponent's next turn, whenever (\d+) or (less|more) damage is done to this pokémon(?: <wr:after>)?, prevent that damage/g, "during your opponent's next turn, if this pokémon would be damaged by an attack, prevent that attack's damage done to this pokémon if that damage is $1 or $2"],
  [/if an attack damages your opponent's active pokémon( <wr:(?:before|after)>)?, that attack does (\d+) more damage to your opponent's active pokémon/g, "if an attack does damage to your opponent's active pokémon$1, that attack does $2 more damage to that pokémon"],
  [/(^|\. )your opponent can't play trainer cards during their next turn/g, "$1your opponent can't play any trainer cards from their hand during their next turn"],
  [/(^|\. )if your opponent has any benched pokémon, choose 1 of them and switch it with their active pokémon/g, "$1switch in 1 of your opponent's benched pokémon to the active spot"],
  [/(^|\. )look at your opponent's hand(?=\.|$)/g, "$1your opponent reveals their hand"],
  [/(^|\. )shuffle your opponent's deck(?=\.|$)/g, "$1have your opponent shuffle their deck"],
  // Lt. Surge's Electabuzz / Pikachu [Gym Heroes 6 / 81] Charge.
  [
    /(^|\. )take (up to \d+|\d+) ((?:\{[a-z]\} )?energy cards?) from your discard pile and attach (?:it|them) to this pokémon(?=\.|$)/g,
    '$1attach $2 $3 from your discard pile to this pokémon',
  ],
  // Xatu [Neo Genesis 52] Prophecy.
  [
    /(^|\. )look at the top (\d+) cards of either player's deck and rearrange them as you like(?=\.|$)/g,
    "$1look at the top $2 cards of either player's deck and put them back in any order",
  ],
  // Sabrina's Kadabra [Gym Challenge 58] Life Drain.
  [
    /(^|\. |, )put a number of damage counters on your opponent's active pokémon so that its remaining hp (?:are|is) (\d+)(?=\.|$)/g,
    "$1put damage counters on your opponent's active pokémon until its remaining hp is $2",
  ],
  // Togepi [Neo Destiny 56] Charm.
  [
    /(^|\. )if your opponent's active pokémon attacks during your opponent's next turn, any damage it does is reduced by (\d+)/g,
    "$1during your opponent's next turn, any damage done by attacks from your opponent's active pokémon is reduced by $2",
  ],
];

export function rewriteLegacyAttackWording(normalized) {
  if (!normalized) return '';
  return LEGACY_ATTACK_REWRITES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), normalized);
}
