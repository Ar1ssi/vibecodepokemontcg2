/**
 * @file "Each of your opponent's Pokémon that …" filters (design 036 A9).
 *
 * Counter-spread steps (effects/attack-steps.mjs) and the filtered damage-each clause
 * (reduce.mjs) read the same tails: "that has any damage counters on it", "that has any
 * Energy attached to it", "that has a Pokémon Tool attached to it", "that has an Ability",
 * and the rule-box forms "Pokémon ex", "Pokémon V", "Pokémon-GX and Pokémon-EX".
 * Pure: reads the owner's zones, never writes.
 */

import { isEnergy } from '../cards.mjs';
import { isExCard, isGxCard, isVCard } from './card-classify.mjs';
import { isPokemonToolCard } from './ability-executors.mjs';
import { topPokemonCard } from './evolved-pokemon.mjs';
import { cardHasAbility } from './tool-combat.mjs';

const TAILS = [
  [/^$/, () => ({})],
  [/^ that (?:already )?has (?:any )?damage counters? on (?:it|them)$/, () => ({ damaged: true })],
  [/^ that has any energy(?: cards)? attached(?: to it)?$/, () => ({ hasEnergy: true })],
  [/^ that has a pokémon tool(?: card)? attached(?: to it)?$/, () => ({ hasTool: true })],
  [/^ that has an ability$/, () => ({ hasAbility: true })],
  [/^ ex$/, () => ({ ruleBox: ['ex'] })],
  [/^ v$/, () => ({ ruleBox: ['v'] })],
  [/^ ex and pokémon v$/, () => ({ ruleBox: ['ex', 'v'] })],
  [/^-gx and pokémon-ex$/, () => ({ ruleBox: ['gx', 'ex'] })],
];

/**
 * @param {string} tail Normalized text after "pokémon" ("" for no filter)
 * @returns {object|undefined} `{}` = every Pokémon, undefined = unknown wording
 */
export function parseEachFilter(tail) {
  for (const [re, build] of TAILS) {
    if (re.test(tail)) return build();
  }
  return undefined;
}

const RULE_BOX = { ex: isExCard, gx: isGxCard, v: isVCard };

/**
 * @param {object} owner Player whose Pokémon `root` is
 * @param {object} root In-play root card
 * @param {object} filter From `parseEachFilter`
 */
export function eachFilterMatches(owner, root, filter = {}) {
  const zoneCards = [...(owner?.zones?.active || []), ...(owner?.zones?.bench || [])];
  const top = topPokemonCard(zoneCards, root) || root;
  const attached = zoneCards.filter((c) => c.attachedTo === root.instanceId);
  if (filter.damaged && !((root.damage || 0) > 0)) return false;
  if (filter.hasEnergy && !attached.some((c) => isEnergy(c))) return false;
  if (filter.hasTool && !attached.some((c) => isPokemonToolCard(c))) return false;
  if (filter.hasAbility && !cardHasAbility(top)) return false;
  if (filter.ruleBox && !filter.ruleBox.some((kind) => RULE_BOX[kind]?.(top))) return false;
  return true;
}
