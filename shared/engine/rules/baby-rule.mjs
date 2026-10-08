/**
 * @file Baby Pokémon (I230): which in-play Pokémon is a Baby, and which Basic it evolves into.
 *
 * A Baby is a printing the `Baby` marker table flags (card-markers.mjs, D200: pkmncards
 * `stage:baby`). Its printed rules box, e.g. Neo Genesis Pichu (pkmncards
 * https://pkmncards.com/card/pichu-neo-genesis-n1-12/):
 *   "Baby rule: If this Baby Pokémon is your Active Pokémon and your opponent tries to attack,
 *   your opponent flips a coin (before doing anything required in order to use that attack).
 *   If tails, your opponent's turn ends without an attack."
 * The e-card wording (https://pkmncards.com/card/pichu-expedition-ex-22/) is the same rule:
 *   "If your Active Pokémon is a Baby Pokémon and your opponent announces an attack, your
 *   opponent flips a coin (before doing anything else). If tails, your opponent's turn ends."
 *
 * Evolution: TCGdex has no evolve link from a Baby, and the Basic it evolves into prints no
 * "evolves from". The Baby's stage line does ("Baby : Evolves into Pikachu", pkmncards), and a
 * Basic played onto a Baby is an Evolution card (WotC chat Jun 14, 2001, Q14b; rulings
 * compendium https://compendium.pokegym.net/compendium.html). Owner-named Pokémon are not that
 * Basic: "Can a Baby Pokemon evolve into a Gym Leader's Pokemon (Ex: Cleffa into Erika's
 * Clefairy)? A. No, you can't." (Feb 22, 2001 WotC chat, Q24).
 *
 * Pure: no DOM, no network.
 */

import { hasCardMarker } from './card-markers.mjs';

// Each Baby's printed "Evolves into" (pkmncards stage line, every `stage:baby` printing).
const BABY_EVOLVES_INTO = new Map([
  ['pichu', ['pikachu']],
  ['cleffa', ['clefairy']],
  ['igglybuff', ['jigglypuff']],
  ['tyrogue', ['hitmonchan', 'hitmonlee', 'hitmontop']],
  ['smoochum', ['jynx']],
  ['elekid', ['electabuzz']],
  ['magby', ['magmar']],
]);

const plainName = (card) =>
  String(card?.name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const isBasicStage = (card) => String(card?.stage ?? '').toLowerCase().replace(/[^a-z]/g, '') === 'basic';

/** True when the card is a printed Baby Pokémon (the top card of the Pokémon in play). */
export const isBabyPokemon = (card) => Boolean(card) && hasCardMarker(card, 'Baby');

/**
 * True when `evolution` is the Basic Pokémon card that `baby` "Evolves into": playing it onto
 * that Baby is an evolution (the normal first-turn, just-played and once-per-turn gates apply).
 * Exact names only: "Erika's Clefairy", "Dark Magmar" and "Pikachu ex" are other cards.
 */
export function isBabyEvolution(baby, evolution) {
  if (!isBabyPokemon(baby) || !isBasicStage(evolution)) return false;
  const targets = BABY_EVOLVES_INTO.get(plainName(baby)) || [];
  return targets.includes(plainName(evolution));
}
