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
  [/prevent all damage done to this pokémon during your opponent's next turn/g, "during your opponent's next turn, prevent all damage done to this pokémon by attacks"],
  [/all damage done (?:by attacks )?to this pokémon during your opponent's next turn is reduced by (\d+)/g, "during your opponent's next turn, any damage done to this pokémon by attacks is reduced by $1"],
  [/during your opponent's next turn, whenever (\d+) or less damage is done to this pokémon(?: <wr:after>)?, prevent that damage/g, "during your opponent's next turn, if this pokémon would be damaged by an attack, prevent that attack's damage done to this pokémon if that damage is $1 or less"],
  [/if an attack damages your opponent's active pokémon( <wr:(?:before|after)>)?, that attack does (\d+) more damage to your opponent's active pokémon/g, "if an attack does damage to your opponent's active pokémon$1, that attack does $2 more damage to that pokémon"],
  [/(^|\. )your opponent can't play trainer cards during their next turn/g, "$1your opponent can't play any trainer cards from their hand during their next turn"],
  [/(^|\. )if your opponent has any benched pokémon, choose 1 of them and switch it with their active pokémon/g, "$1switch in 1 of your opponent's benched pokémon to the active spot"],
  [/(^|\. )look at your opponent's hand(?=\.|$)/g, "$1your opponent reveals their hand"],
  [/(^|\. )shuffle your opponent's deck(?=\.|$)/g, "$1have your opponent shuffle their deck"],
];

export function rewriteLegacyAttackWording(normalized) {
  if (!normalized) return '';
  return LEGACY_ATTACK_REWRITES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), normalized);
}
