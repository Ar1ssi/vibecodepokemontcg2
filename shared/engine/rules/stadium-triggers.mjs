/**
 * @file Stadium-triggered effects (design 035 slice 10): damage counters / heals on
 * Energy attach, evolution, Bench placement and switching, plus coin/condition
 * overrides and Weakness/Resistance overrides. Pure: every function reads only the
 * Stadium card and its event context and returns descriptors the reducer applies
 * with events.
 */

import { hasCondition } from './special-conditions.mjs';

const lower = (v) => String(v ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'");
const textOf = (card) => lower(card?.text ?? card?.effect ?? card?.cardText ?? '');
const typesOf = (card) => (Array.isArray(card?.types) ? card.types : []).map(lower);
const hasType = (card, type) =>
  typesOf(card).some((t) => t === type || (type === 'darkness' && t === 'dark'));
const isBasic = (card) => {
  const stage = lower(card?.stage);
  return stage ? stage === 'basic' : !card?.evolvesFrom;
};
const nameOf = (card) => lower(card?.name);

/**
 * Energy attach from hand ("Whenever any player attaches an Energy card from their
 * hand to …").
 *
 * @param {object} stadiumCard
 * @param {{ hostTop?: object, fromZone?: string }} ctx
 * @returns {object[]} `{ kind:'damage'|'heal'|'cure', amount?, source }`
 */
export function stadiumOnAttachTriggers(stadiumCard, { hostTop, fromZone } = {}) {
  const t = textOf(stadiumCard);
  if (!hostTop || fromZone !== 'hand') return [];
  const source = stadiumCard?.name || 'Stadium';
  if (/basic non-\{w\} pokémon/.test(t) && isBasic(hostTop) && !hasType(hostTop, 'water')) {
    return [{ kind: 'damage', amount: 20, source }];
  }
  if (/excluding team plasma pokémon/.test(t) && !nameOf(hostTop).includes('team plasma')) {
    return [{ kind: 'damage', amount: 20, source }];
  }
  if (/non-\{p\} pokémon/.test(t) && !hasType(hostTop, 'psychic')) {
    return [{ kind: 'damage', amount: 20, source }];
  }
  if (
    /\{g\} pokémon or \{w\} pokémon/.test(t) &&
    (hasType(hostTop, 'grass') || hasType(hostTop, 'water'))
  ) {
    return [{ kind: 'heal', amount: 10, cure: true, source }];
  }
  if (
    /\{w\} pokémon, \{f\} pokémon, or \{m\} pokémon/.test(t) &&
    (hasType(hostTop, 'water') || hasType(hostTop, 'fighting') || hasType(hostTop, 'metal'))
  ) {
    return [{ kind: 'cure', source }];
  }
  return [];
}

/**
 * Evolution ("Whenever any player plays a Pokémon from their hand to evolve …").
 *
 * @param {object} stadiumCard
 * @param {{ evolvedCard?: object, hostTop?: object }} ctx
 * @returns {object[]}
 */
export function stadiumOnEvolveTriggers(stadiumCard, { evolvedCard, hostTop } = {}) {
  const t = textOf(stadiumCard);
  if (!hostTop) return [];
  const source = stadiumCard?.name || 'Stadium';
  if (/pokémon vmax from their hand to evolve a pokémon v/.test(t)) {
    return / vmax$/i.test(String(evolvedCard?.name || ''))
      ? [{ kind: 'heal', amount: 100, source }]
      : [];
  }
  if (/level-up/.test(t)) {
    return / lv\.?x$/i.test(String(evolvedCard?.name || ''))
      ? [{ kind: 'heal', amount: 40, source }]
      : [];
  }
  if (/with giovanni in its name evolves/.test(t)) {
    return nameOf(hostTop).includes('giovanni')
      ? [{ kind: 'heal', amount: 20, source }]
      : [];
  }
  if (/put 3 damage counters/.test(t)) return [{ kind: 'damage', amount: 30, source }];
  if (/put 2 damage counters/.test(t)) return [{ kind: 'damage', amount: 20, source }];
  return [];
}

/**
 * Basic Pokémon played from hand onto the Bench.
 *
 * @param {object} stadiumCard
 * @param {{ pokemon?: object }} ctx
 * @returns {object[]}
 */
export function stadiumOnBenchTriggers(stadiumCard, { pokemon } = {}) {
  const t = textOf(stadiumCard);
  if (!pokemon || !isBasic(pokemon)) return [];
  const source = stadiumCard?.name || 'Stadium';
  if (/puts a basic pokémon from their hand onto their bench/.test(t)) {
    return [{ kind: 'damage', amount: 20, source }];
  }
  if (
    /basic pokémon \(excluding \{g\} or \{p\} pokémon\)/.test(t) &&
    !hasType(pokemon, 'grass') &&
    !hasType(pokemon, 'psychic')
  ) {
    return [{ kind: 'damage', amount: 20, source }];
  }
  if (/basic pokémon \(except for team magma pokémon\)/.test(t) && !nameOf(pokemon).includes('team magma')) {
    return [{ kind: 'damage', amount: 20, source }];
  }
  if (/basic pokémon that doesn't have team magma in its name/.test(t) && !nameOf(pokemon).includes('team magma')) {
    return [{ kind: 'damage', amount: 10, source }];
  }
  // Rocket's Minefield Gym: coin-gated counters (the early print omitted the count;
  // errata and later prints say 2 damage counters).
  if (/puts a basic pokémon onto his or her bench from his or her hand/.test(t)) {
    return [{ kind: 'damage', amount: 20, coin: 'tails', source }];
  }
  return [];
}

/**
 * A switch/retreat ("Whenever a player's Active Pokémon moves to the Bench …",
 * Dust Island's condition copy).
 *
 * @param {object} stadiumCard
 * @param {{ switchedOut?: object, switchedIn?: object, viaTrainer?: boolean,
 *   duringOwnersTurn?: boolean }} ctx `duringOwnersTurn` false for a switch the
 *   opponent forces (Spikemuth's "during their turn" clause does not fire then).
 * @returns {object[]}
 */
export function stadiumOnSwitchTriggers(
  stadiumCard,
  { switchedOut, switchedIn, viaTrainer = false, duringOwnersTurn = true } = {}
) {
  const t = textOf(stadiumCard);
  const source = stadiumCard?.name || 'Stadium';
  const out = [];
  if (duringOwnersTurn && switchedOut && /active pokémon moves to the bench/.test(t)) {
    out.push({ kind: 'damage', amount: 20, target: 'switchedOut', source });
  }
  if (
    viaTrainer &&
    switchedOut &&
    switchedIn &&
    /switches their poisoned active pokémon/.test(t) &&
    hasCondition(switchedOut, 'Poisoned')
  ) {
    out.push({ kind: 'copyConditions', condition: 'Poisoned', source });
  }
  return out;
}

/**
 * Pokémon Checkup coin overrides (Wela Volcano Park, Slumbering Forest). `null`
 * when the Stadium does not touch the condition's between-turns flip.
 *
 * @param {object} stadiumCard
 * @param {{ condition?: 'Burned'|'Asleep' }} ctx
 * @returns {{ burnedPersists?: boolean, asleepFlips?: number }|null}
 */
export function stadiumCheckupCoinModifiers(stadiumCard, { condition } = {}) {
  const t = textOf(stadiumCard);
  if (!t || !condition) return null;
  if (
    condition === 'Burned' &&
    /burned between turns/.test(t) &&
    /even if the result is heads/.test(t)
  ) {
    return { burnedPersists: true };
  }
  if (condition === 'Asleep' && /flips 2 coins instead of 1/.test(t)) {
    return { asleepFlips: 2 };
  }
  return null;
}

/**
 * Mirage Stadium: retreating costs a coin flip; tails leaves the Active unable to
 * retreat for the rest of the turn and no Energy is discarded.
 *
 * @param {object} stadiumCard
 * @returns {{ source: string }|null}
 */
export function stadiumRetreatCoin(stadiumCard) {
  const t = textOf(stadiumCard);
  if (!/tries to retreat a pokémon/.test(t) || !/flips a coin/.test(t)) return null;
  return { source: stadiumCard?.name || 'Stadium' };
}

/**
 * Chaos Gym: playing a Trainer card other than a Stadium costs a coin flip; tails
 * means the card can't be played (and goes to the discard pile either way).
 *
 * @param {object} stadiumCard
 * @param {object} playedCard
 * @returns {{ source: string }|null}
 */
export function stadiumTrainerPlayCoin(stadiumCard, playedCard) {
  const t = textOf(stadiumCard);
  if (!/plays a trainer card other than a stadium card/.test(t)) return null;
  const kind = `${playedCard?.type || ''} ${playedCard?.trainerType || ''} ${
    playedCard?.subtypes || ''
  }`;
  if (lower(kind).includes('stadium')) return null;
  return { source: stadiumCard?.name || 'Stadium' };
}

/**
 * Vermilion City Gym: a Pokémon with Lt. Surge in its name may flip when it
 * attacks. Heads adds 10 damage after Weakness/Resistance when the attack does
 * damage; tails deals 10 damage to the attacker in addition to the attack.
 *
 * @param {object} stadiumCard
 * @param {{ attacker?: object }} ctx
 * @returns {{ headsBonus: number, tailsSelfDamage: number, source: string }|null}
 */
export function stadiumAttackCoinModifier(stadiumCard, { attacker } = {}) {
  const t = textOf(stadiumCard);
  if (!/attacks with a pokémon with lt\. surge in its name/.test(t)) return null;
  if (!nameOf(attacker).includes('lt. surge')) return null;
  return { headsBonus: 10, tailsSelfDamage: 10, source: stadiumCard?.name || 'Stadium' };
}

/**
 * Weakness overrides (Ancient Tomb, Cinnabar City Gym). `null` when the Stadium
 * does not touch Weakness.
 *
 * @param {object} stadiumCard
 * @param {{ attacker?: object, defender?: object }} ctx
 * @returns {{ ignore: boolean }|null}
 */
export function stadiumWeaknessOverrides(stadiumCard, { attacker, defender } = {}) {
  const t = textOf(stadiumCard);
  if (!t) return null;
  if (/don't apply weakness for all pokémon in play/.test(t)) {
    const name = nameOf(defender);
    const excluded = /-ex$/.test(name) || /'s /.test(name);
    return { ignore: !excluded };
  }
  if (/ignore weakness when a \{w\} pokémon does damage to a pokémon with blaine in its name/.test(t)) {
    return { ignore: hasType(attacker, 'water') && nameOf(defender).includes('blaine') };
  }
  return null;
}

/**
 * Resistance overrides (Magnetic Storm, Ruins of Alph, Resistance Gym, Pewter City
 * Gym). `null` when the Stadium does not touch Resistance.
 *
 * @param {object} stadiumCard
 * @param {{ attacker?: object, defender?: object }} ctx
 * @returns {{ ignore?: boolean, reduce?: number }|null}
 */
export function stadiumResistanceOverrides(stadiumCard, { attacker } = {}) {
  const t = textOf(stadiumCard);
  if (!t) return null;
  if (/each pokémon in play has no resistance/.test(t)) return { ignore: true };
  if (/each pokémon's resistance is reduced by 20/.test(t)) return { reduce: 20 };
  if (/don't apply resistance to any attacks made by pokémon with brock in their names/.test(t)) {
    return { ignore: nameOf(attacker).includes('brock') };
  }
  return null;
}
