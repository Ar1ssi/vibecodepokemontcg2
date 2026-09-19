// The game-state counts `parseAttackDamage` (damage-parser.mjs) needs to resolve printed
// "for each …" scaling server-side. The legacy client builds the same shape from the DOM
// (chat-buttons.js attack()); this builds it from the authoritative state instead.
//
// Pure: reads the state, never mutates it, never rolls RNG. A field the server cannot
// compute honestly is LEFT OUT rather than sent as 0 — the parser then keeps an unresolved
// note instead of silently scaling by zero (damage-parser.mjs § "for each" units).

import { isEnergy, isPokemon, getRetreatCostCount } from '../cards.mjs';
import { serverEnergyDescriptor } from './server-energy.mjs';
import { expandEnergyEntries } from './attack-engine.mjs';
import { normalizeStage } from './evolution.mjs';
import { evolvedView } from './evolved-pokemon.mjs';
import { classifyEnergyEffect } from './energy-effects.mjs';
import { listConditions } from './special-conditions.mjs';

const zoneOf = (player, zoneId) =>
  Array.isArray(player?.zones?.[zoneId]) ? player.zones[zoneId] : [];

// In-play Pokémon of a zone: roots only, never the cards attached to them. The server models
// an evolution as the Evolution card attached UNDER the Basic, so the root still carries the
// Basic's printed data (D40) — `view` is that Pokémon read as its top Evolution card, which is
// what stage/HP questions must use, while `card` holds the live damage counters.
const rootPokemon = (player, zoneId) => {
  const zone = zoneOf(player, zoneId);
  return zone
    .filter((card) => !card.attachedTo && isPokemon(card))
    .map((card) => ({ card, view: evolvedView(zone, card) }));
};

/** Every in-play Pokémon on a player's side (active + bench). */
const inPlayPokemon = (player) => [
  ...rootPokemon(player, 'active'),
  ...rootPokemon(player, 'bench'),
];

/** Energy cards attached to one Pokémon, counted as the cost pool sees them. */
function energyOn(player, pokemon) {
  if (!pokemon) return [];
  const attached = [...zoneOf(player, 'active'), ...zoneOf(player, 'bench')].filter(
    (card) => card.attachedTo === pokemon.instanceId && isEnergy(card)
  );
  return expandEnergyEntries(attached.map(serverEnergyDescriptor));
}

function specialEnergyOn(player, pokemon) {
  if (!pokemon) return 0;
  return [...zoneOf(player, 'active'), ...zoneOf(player, 'bench')].filter(
    (card) =>
      card.attachedTo === pokemon.instanceId &&
      isEnergy(card) &&
      classifyEnergyEffect(card) !== 'basic'
  ).length;
}

const isStage2 = (card) => normalizeStage(card?.stage) === 'Stage 2';

const hasRoundAttack = ({ card, view }) =>
  (card?.attacks || view?.attacks || []).some(
    (a) => String(a?.name || '').trim().toLowerCase() === 'round'
  );

const isTeamRocketPokemon = ({ card, view }) =>
  /team rocket/i.test(
    `${card?.name || ''} ${view?.name || ''} ${card?.subtypes || ''} ${view?.subtypes || ''}`
  );

const isAncientPokemon = ({ card, view }) =>
  /ancient/i.test(
    `${card?.subtypes || ''} ${view?.subtypes || ''} ${card?.name || ''} ${view?.name || ''}`
  );

const isBeedrillPokemon = ({ card, view }) =>
  /beedrill/i.test(card?.name || view?.name || '');

const isGrassPokemon = ({ card, view }) =>
  (card?.types || view?.types || []).some((t) => /grass|^g$/i.test(String(t || '')));

const isDamagedTauros = ({ card, view }) =>
  /tauros/i.test(card?.name || view?.name || '') && (card?.damage || 0) > 0;

/**
 * Build the `ctx` argument for `parseAttackDamage`.
 *
 * @param {object} state Authoritative GameState (read-only here)
 * @param {object} args
 * @param {string} args.attackerPlayerId
 * @param {string} args.defenderPlayerId
 * @param {object} args.attacker Attacking Pokémon (root card, as stored)
 * @param {object|null} args.defender Defending Pokémon (root card), or null
 * @param {object} [args.attackerView] `evolvedView` of the attacker (printed data)
 * @param {object|null} [args.defenderView] `evolvedView` of the defender
 * @param {'heads'|'tails'|null} [args.coin] Result of this attack's single coin flip
 * @param {number} [args.headsCount] Heads among a multi-flip "for each heads" attack
 * @param {number} [args.energyDiscarded] Number of energy discarded for scaling damage
 * @returns {object} ctx for parseAttackDamage
 */
export function buildServerAttackContext(
  state,
  {
    attackerPlayerId,
    defenderPlayerId,
    attacker,
    defender = null,
    attackerView = null,
    defenderView = null,
    coin = null,
    headsCount = undefined,
    energyDiscarded = undefined,
  } = {}
) {
  const own = state?.players?.[attackerPlayerId] || null;
  const opponent = state?.players?.[defenderPlayerId] || null;
  const attackerCard = attackerView || attacker || {};
  const defenderCard = defenderView || defender || {};

  const ownInPlay = inPlayPokemon(own);
  const ownBench = rootPokemon(own, 'bench');
  const opponentBench = rootPokemon(opponent, 'bench');

  const ctx = {
    energyCount: energyOn(own, attacker).length,
    ownEnergyCount: ownInPlay.reduce(
      (total, { card }) => total + energyOn(own, card).length,
      0
    ),
    opponentPrizes: zoneOf(opponent, 'prizes').length,
    turnCount: Math.max(1, Number(state?.turn?.number) || 1),
    attackerHp: Number(attackerCard.hp) || 0,
    attackerDamage: attacker?.damage || 0,
    ownHandCount: zoneOf(own, 'hand').length,
    opponentHandCount: zoneOf(opponent, 'hand').length,
    ownBenchCount: ownBench.length,
    opponentBenchCount: opponentBench.length,
    stage2BenchCount: ownBench.filter(({ view }) => isStage2(view)).length,
    stage2InPlayCount: ownInPlay.filter(({ view }) => isStage2(view)).length,
    ownPokemonInPlayCount: ownInPlay.length,
    damagedOwnPokemonCount: ownInPlay.filter(({ card }) => (card.damage || 0) > 0).length,
    damagedBenchCount: ownBench.filter(({ card }) => (card.damage || 0) > 0).length,
    roundAttackCount: ownInPlay.filter(hasRoundAttack).length,
    teamRocketCount: ownInPlay.filter(isTeamRocketPokemon).length,
    ancientCount: ownInPlay.filter(isAncientPokemon).length,
    speciesCount: ownInPlay.filter(isBeedrillPokemon).length,
    grassPokemonCount: ownInPlay.filter(isGrassPokemon).length,
    specialEnergyOnSelfCount: specialEnergyOn(own, attacker),
    taurosDamagedCount: ownInPlay.filter(isDamagedTauros).length,
    coin,
  };

  if (energyDiscarded !== undefined) {
    ctx.energyDiscarded = energyDiscarded;
  }

  // Defender-derived fields only exist while there IS a defender: an effect-only attack
  // (Call for Family with an empty opposing board) must not read 0 HP as "the defender
  // has 0 HP left", which would resolve HP-conditional scaling with a lie.
  if (defender) {
    ctx.defenderHp = Number(defenderCard.hp) || 0;
    ctx.defenderDamage = defender.damage || 0;
    ctx.opponentEnergyCount = energyOn(opponent, defender).length;
    ctx.retreatCostColorless = getRetreatCostCount(defenderCard);
    ctx.opponentStatusCount = listConditions(defender).length;
  }
  if (headsCount !== undefined) ctx.headsCount = headsCount;

  return ctx;
}
