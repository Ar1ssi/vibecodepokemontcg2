// The game-state counts `parseAttackDamage` (damage-parser.mjs) needs to resolve printed
// "for each …" scaling server-side. The legacy client builds the same shape from the DOM
// (chat-buttons.js attack()); this builds it from the authoritative state instead.
//
// Pure: reads the state, never mutates it, never rolls RNG. A field the server cannot
// compute honestly is LEFT OUT rather than sent as 0 — the parser then keeps an unresolved
// note instead of silently scaling by zero (damage-parser.mjs § "for each" units).

import { isEnergy, isPokemon, isTrainer, isBasicPokemon, getRetreatCostCount } from '../cards.mjs';
import { serverEnergyDescriptor } from './server-energy.mjs';
import { expandEnergyEntries } from './attack-engine.mjs';
import { normalizeStage } from './evolution.mjs';
import { evolvedView } from './evolved-pokemon.mjs';
import { classifyEnergyEffect } from './energy-effects.mjs';
import { listConditions } from './special-conditions.mjs';
import {
  isExCard,
  isGxCard,
  isTeraCard,
  isRadiantCard,
  isMegaCard,
  isVCard,
  isVmaxCard,
  isVstarCard,
  isTagTeamCard,
  isUltraBeastCard,
} from './card-classify.mjs';
import { priorEvolutionCards } from './evolved-pokemon.mjs';

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

/** Energy cards attached to one Pokémon, as stored. */
function attachedEnergyCards(player, pokemon) {
  if (!pokemon) return [];
  return [...zoneOf(player, 'active'), ...zoneOf(player, 'bench')].filter(
    (card) => card.attachedTo === pokemon.instanceId && isEnergy(card)
  );
}

/**
 * Energy cards attached to one Pokémon, counted as the cost pool sees them: the host is
 * read as its top Evolution card and the board facts match reduce.mjs
 * energyProvisionContext (Ignition on an Evolution, Counter while trailing).
 */
function energyOn(player, pokemon, { stadiumCard = null, opponent = null } = {}) {
  if (!pokemon) return [];
  const zone = ['active', 'bench']
    .map((zoneId) => zoneOf(player, zoneId))
    .find((cards) => cards.includes(pokemon)) || [];
  const attachedCards = zone.filter((card) => card.attachedTo === pokemon.instanceId);
  const board = {
    ownPrizes: zoneOf(player, 'prizes').length,
    opponentPrizes: zoneOf(opponent, 'prizes').length,
    ownStage2InPlay: inPlayPokemon(player).filter(({ view }) => isStage2(view)).length,
  };
  const hostPokemon = evolvedView(zone, pokemon);
  return expandEnergyEntries(
    attachedEnergyCards(player, pokemon).map((card) =>
      serverEnergyDescriptor(card, { stadiumCard, hostPokemon, attachedCards, board })
    )
  );
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

const isTool = (card) => {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes.join(' ') : card?.subtypes || '';
  return `${card?.type || ''} ${card?.trainerType || ''} ${subtypes}`.toLowerCase().includes('tool');
};

function toolCountOn(player, pokemon) {
  if (!pokemon) return 0;
  return [...zoneOf(player, 'active'), ...zoneOf(player, 'bench')].filter(
    (card) => card.attachedTo === pokemon.instanceId && isTool(card)
  ).length;
}

/**
 * The printed kinds an attack condition can name for one in-play Pokémon (attack-conditions.mjs
 * KIND_PHRASES): rule boxes, Basic/evolved, and `type:<word>` per printed type.
 */
function ruleBoxKinds(view) {
  if (!view) return [];
  const checks = [
    ['ex', isExCard],
    ['gx', isGxCard],
    ['v', isVCard],
    ['vmax', isVmaxCard],
    ['vstar', isVstarCard],
    ['tagteam', isTagTeamCard],
    ['ultrabeast', isUltraBeastCard],
    ['tera', isTeraCard],
    ['radiant', isRadiantCard],
    ['mega', isMegaCard],
  ];
  const kinds = checks.filter(([, test]) => test(view)).map(([kind]) => kind);
  kinds.push(isBasicPokemon(view) ? 'basic' : 'evolved');
  const stage = normalizeStage(view.stage);
  if (stage === 'Stage 1') kinds.push('stage1');
  if (stage === 'Stage 2') kinds.push('stage2');
  for (const type of view.types || []) {
    const word = String(type).toLowerCase();
    kinds.push(`type:${word === 'dark' ? 'darkness' : word}`);
  }
  return kinds;
}

/** Printed ability kinds of one Pokémon: 'ability', 'power' (Poké-Power), 'body' (Poké-Body). */
function abilityKinds(view) {
  return (Array.isArray(view?.abilities) ? view.abilities : []).map((ability) => {
    const type = String(ability?.type || '').toLowerCase();
    if (/power/.test(type)) return 'power';
    if (/body/.test(type)) return 'body';
    return 'ability';
  });
}

const trainerKind = (card) => {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes.join(' ') : card?.subtypes || '';
  const kind = `${card?.type || ''} ${card?.trainerType || ''} ${subtypes}`.toLowerCase();
  return ['supporter', 'tool', 'stadium', 'item'].find((word) => kind.includes(word)) || '';
};

/** One discard-pile card as the "for each … in your discard pile" counts read it (scaling-count.mjs). */
function discardEntry(card) {
  if (isEnergy(card) && !isTrainer(card)) {
    return {
      name: card.name || '',
      category: 'energy',
      basicEnergy: classifyEnergyEffect(card) === 'basic',
      energyType: serverEnergyDescriptor(card).type,
    };
  }
  if (isPokemon(card)) {
    return {
      name: card.name || '',
      category: 'pokemon',
      pokemonTypes: [...(card.types || [])],
      attackNames: (card.attacks || []).map((a) => a?.name || ''),
    };
  }
  return { name: card.name || '', category: 'trainer', trainerKind: trainerKind(card) };
}

/** One in-play Pokémon as the in-play "for each …" counts read it. */
const pokemonEntry = (bench) => ({ card, view }) => ({
  name: view?.name || card?.name || '',
  bench,
  kinds: ruleBoxKinds(view),
  counters: Math.floor((card?.damage || 0) / 10),
  delta: /δ|delta species/i.test(`${view?.name || ''} ${view?.subtypes || ''} ${card?.subtypes || ''}`),
});

const attackerZone = (player, pokemon) =>
  ['active', 'bench'].map((zoneId) => zoneOf(player, zoneId)).find((cards) => cards.includes(pokemon)) || [];

/** 'self' / 'opponent' for the player who put the Stadium in play; null when none or unknown. */
function stadiumOwnerOf(stadiumCard, attackerPlayerId, defenderPlayerId) {
  const owner = stadiumCard?.ownerId ?? stadiumCard?.playerId ?? stadiumCard?.playedBy ?? null;
  if (!owner) return null;
  if (owner === attackerPlayerId) return 'self';
  return owner === defenderPlayerId ? 'opponent' : null;
}

function resistanceTypes(view) {
  const raw = view?.resistance ?? view?.resistances;
  return (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
    .filter(Boolean);
}

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
 * @param {number} [args.milledMatches] Counted cards a deck-mill attack discarded
 * @param {number} [args.lostZoned] Cards the attack's before-damage step put in the Lost Zone
 * @param {number} [args.handDiscarded] Hand cards the attack's before-damage step discarded (036 A11)
 * @param {number} [args.revealedMatches] Counted cards a deck-reveal attack found (Mud Flood)
 * @param {boolean} [args.energyReturned] Whether an attached Energy was returned to hand
 *   (Mega Greninja ex — Ninja Spinner); drives its optional +N damage bonus.
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
    milledMatches = undefined,
    energyReturned = undefined,
    lostZoned = undefined,
    handDiscarded = undefined,
    revealedMatches = undefined,
    attack = null,
    optionalCostPaid = undefined,
    optionalCostCount = undefined,
  } = {}
) {
  const own = state?.players?.[attackerPlayerId] || null;
  const opponent = state?.players?.[defenderPlayerId] || null;
  const attackerCard = attackerView || attacker || {};
  const defenderCard = defenderView || defender || {};
  const stadiumCard = state?.stadium?.card || state?.stadium || null;

  const ownInPlay = inPlayPokemon(own);
  const ownBench = rootPokemon(own, 'bench');
  const opponentBench = rootPokemon(opponent, 'bench');
  const turnNumber = Math.max(1, Number(state?.turn?.number) || 1);

  const attackerEnergy = attachedEnergyCards(own, attacker);
  const ctx = {
    energyCount: energyOn(own, attacker, { stadiumCard, opponent }).length,
    attackerEnergyTypeList: attackerEnergy.map((card) =>
      String(serverEnergyDescriptor(card).type || '').toLowerCase()
    ),
    attackerBasicEnergyTypes: attackerEnergy
      .filter((card) => classifyEnergyEffect(card) === 'basic')
      .map((card) => String(serverEnergyDescriptor(card).type || '').toLowerCase()),
    ownEnergyCount: ownInPlay.reduce(
      (total, { card }) => total + energyOn(own, card, { stadiumCard, opponent }).length,
      0
    ),
    // Types of the Energy attached across this player's board, one entry per card, for
    // "times the amount of {X} Energy attached to your Pokémon" scaling. Card-level descriptor
    // types: Stadium type rewrites and multi-provision Special Energy are not reflected here.
    ownEnergyTypeList: ownInPlay
      .flatMap(({ card }) => attachedEnergyCards(own, card))
      .map((card) => String(serverEnergyDescriptor(card).type || '').toLowerCase()),
    ownBasicEnergyTypes: ownInPlay
      .flatMap(({ card }) => attachedEnergyCards(own, card))
      .filter((card) => classifyEnergyEffect(card) === 'basic')
      .map((card) => String(serverEnergyDescriptor(card).type || '').toLowerCase()),
    opponentPrizes: zoneOf(opponent, 'prizes').length,
    turnCount: Math.max(1, Number(state?.turn?.number) || 1),
    attackerHp: Number(attackerCard.hp) || 0,
    attackerDamage: attacker?.damage || 0,
    // Per-counter clauses read counters (10 damage each), not damage points.
    attackerDamageCounters: Math.floor((attacker?.damage || 0) / 10),
    ownHandCount: zoneOf(own, 'hand').length,
    opponentHandCount: zoneOf(opponent, 'hand').length,
    opponentHandTrainerCount: zoneOf(opponent, 'hand').filter(isTrainer).length,
    // Trainers like Energy Retrieval carry "Energy" in their name; isEnergy alone counts them.
    opponentHandEnergyCount: zoneOf(opponent, 'hand').filter((c) => isEnergy(c) && !isTrainer(c)).length,
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
    // Whole-attack condition reads (design 036 A1). `benchNames`/`benchTypes` are parallel
    // arrays; `ownInPlayNames` covers "…in play" clauses.
    stadiumInPlay: Boolean(stadiumCard),
    ownPrizes: zoneOf(own, 'prizes').length,
    attackerConditions: listConditions(attacker),
    attackerEnergyTypes: [...new Set(energyOn(own, attacker, { stadiumCard, opponent }))],
    attackerEnergyNames: attachedEnergyCards(own, attacker).map((card) => card.name || ''),
    benchNames: ownBench.map(({ card, view }) => view?.name || card?.name || ''),
    benchTypes: ownBench.map(({ card, view }) => [...(view?.types || card?.types || [])]),
    ownInPlayNames: ownInPlay.map(({ card, view }) => view?.name || card?.name || ''),
    ownDiscardEnergy: zoneOf(own, 'discard')
      .filter(isEnergy)
      .map((card) => ({
        name: card.name || '',
        type: serverEnergyDescriptor(card).type,
        basic: classifyEnergyEffect(card) === 'basic',
      })),
    attackerMovedToActiveThisTurn:
      attacker != null && Number(attacker.movedToActiveTurn) === turnNumber,
    attackerEvolvedThisTurn: Boolean(attacker && own?.flags?.evolved?.[attacker.instanceId]),
    attackerRemainingHp: Math.max(0, (Number(attackerCard.hp) || 0) - (attacker?.damage || 0)),
    coin,
    // Conditional-bonus reads (attack-conditions.mjs): what happened this turn and what the
    // board holds beyond the counts above.
    attackerEnergyUnits: energyOn(own, attacker, { stadiumCard, opponent }),
    attackCost: Array.isArray(attack?.cost) ? [...attack.cost] : [],
    attackerToolCount: toolCountOn(own, attacker),
    attackerStackNames: attacker
      ? priorEvolutionCards(attackerZone(own, attacker), attacker).map((card) => card.name || '')
      : [],
    attackerHealedThisTurn: attacker != null && Number(attacker.healedTurn) === turnNumber,
    attackerDamageTakenLastTurn:
      attacker?.attackDamageTaken && Number(attacker.attackDamageTaken.turn) === turnNumber - 1
        ? Number(attacker.attackDamageTaken.amount) || 0
        : 0,
    attackerHandEnergyTypesThisTurn: (own?.flags?.handEnergyAttachedThisTurn || [])
      .filter((entry) => attacker && entry.hostId === attacker.instanceId)
      .map((entry) => attackerEnergy.find((card) => card.instanceId === entry.energyId))
      .filter(Boolean)
      .map((card) => serverEnergyDescriptor(card).type),
    attackerLastTurnAttackName:
      attacker && own?.lastAttack?.attackerInstanceId === attacker.instanceId && own.lastAttack.turnNumber === turnNumber - 2
        ? own.lastAttack.attack?.name || ''
        : '',
    supporterPlayedThisTurn: Boolean(own?.flags?.supporterPlayed),
    supporterNamesThisTurn: own?.flags?.supporterNamesThisTurn || (own?.flags?.lastSupporterName ? [own.flags.lastSupporterName] : []),
    koLastOpponentTurnVictims: own?.flags?.koedLastOppTurnVictims || [],
    ownHandPokemonCount: zoneOf(own, 'hand').filter(isPokemon).length,
    benchDamaged: ownBench.map(({ card }) => (card.damage || 0) > 0),
    ownDiscardNames: zoneOf(own, 'discard').map((card) => card.name || ''),
    ownInPlayAbilityKinds: ownInPlay.map(({ view }) => abilityKinds(view)),
    opponentInPlayKinds: inPlayPokemon(opponent).map(({ view }) => ruleBoxKinds(view)),
    stadiumOwner: stadiumOwnerOf(stadiumCard, attackerPlayerId, defenderPlayerId),
    stadiumName: stadiumCard?.name || '',
    allInPlayNames: [...ownInPlay, ...inPlayPokemon(opponent)].map(({ card, view }) => view?.name || card?.name || ''),
    // "for each …" scaling and coin-count reads (scaling-count.mjs).
    ownDiscardCards: zoneOf(own, 'discard').map(discardEntry),
    opponentDiscardCards: zoneOf(opponent, 'discard').map(discardEntry),
    ownPokemon: [...rootPokemon(own, 'active').map(pokemonEntry(false)), ...ownBench.map(pokemonEntry(true))],
    opponentPokemon: [...rootPokemon(opponent, 'active').map(pokemonEntry(false)), ...opponentBench.map(pokemonEntry(true))],
    attackerAttachedCards: [...zoneOf(own, 'active'), ...zoneOf(own, 'bench')]
      .filter((card) => attacker && card.attachedTo === attacker.instanceId && !isPokemon(card))
      .map((card) => ({
        name: card.name || '',
        energy: isEnergy(card) && !isTrainer(card),
        basicEnergy: classifyEnergyEffect(card) === 'basic',
        energyType: isEnergy(card) ? serverEnergyDescriptor(card).type : null,
        tool: isTool(card),
      })),
    // Energy this attack's before-damage attach moved (Shaymin LV.X Seed Flare); absent when
    // the attack has no such attach.
    ...(typeof state?.attackAttachedForDamage === 'number' ? { attachedForDamage: state.attackAttachedForDamage } : {}),
    // Cards this attack's before-damage step discarded or looked at (effects/attack-steps.mjs
    // recordDiscardedForDamage), for "If that card is …" conditions. Wherever they are now.
    discardedForDamage: (state?.attackDiscardedForDamage || [])
      .map((id) =>
        Object.values(state?.players || {})
          .flatMap((player) => Object.values(player?.zones || {}).filter(Array.isArray).flat())
          .find((card) => card.instanceId === id)
      )
      .filter(Boolean)
      .map(discardEntry),
    opponentTrainersInPlay:
      inPlayPokemon(opponent).reduce((sum, { card }) => sum + toolCountOn(opponent, card), 0) +
      (stadiumOwnerOf(stadiumCard, attackerPlayerId, defenderPlayerId) === 'opponent' ? 1 : 0),
  };

  if (energyDiscarded !== undefined) {
    ctx.energyDiscarded = energyDiscarded;
  }
  if (milledMatches !== undefined) {
    ctx.milledMatches = milledMatches;
  }
  if (energyReturned !== undefined) {
    ctx.energyReturned = energyReturned;
  }
  if (lostZoned !== undefined) {
    ctx.lostZoned = lostZoned;
  }
  if (handDiscarded !== undefined) {
    ctx.handDiscarded = handDiscarded;
  }
  if (revealedMatches !== undefined) {
    ctx.revealedMatches = revealedMatches;
  }
  // "You may <cost>. If you do, …" (optional-cost-bonus.mjs): whether the player paid, and how much.
  if (optionalCostPaid !== undefined) ctx.optionalCostPaid = optionalCostPaid;
  if (optionalCostCount !== undefined) ctx.optionalCostCount = optionalCostCount;

  // Defender-derived fields only exist while there IS a defender: an effect-only attack
  // (Call for Family with an empty opposing board) must not read 0 HP as "the defender
  // has 0 HP left", which would resolve HP-conditional scaling with a lie.
  if (defender) {
    ctx.defenderHp = Number(defenderCard.hp) || 0;
    ctx.defenderDamage = defender.damage || 0;
    ctx.opponentEnergyCount = energyOn(opponent, defender, { stadiumCard, opponent: own }).length;
    ctx.retreatCostColorless = getRetreatCostCount(defenderCard);
    ctx.opponentStatusCount = listConditions(defender).length;
    ctx.defenderPresent = true;
    ctx.defenderConditions = listConditions(defender);
    ctx.defenderMaxHp = Number(defenderCard.hp) || 0;
    ctx.defenderRemainingHp = Math.max(0, (Number(defenderCard.hp) || 0) - (defender.damage || 0));
    ctx.defenderSpecialEnergyCount = specialEnergyOn(opponent, defender);
    ctx.defenderIsBasic = isBasicPokemon(defenderCard);
    ctx.defenderIsEx = isExCard(defenderCard);
    ctx.defenderIsTera = isTeraCard(defenderCard);
    ctx.defenderIsRadiant = isRadiantCard(defenderCard);
    ctx.defenderIsMega = isMegaCard(defenderCard);
    ctx.defenderKinds = ruleBoxKinds(defenderCard);
    ctx.defenderName = defenderCard.name || '';
    ctx.defenderAbilityKinds = abilityKinds(defenderCard);
    ctx.defenderResistanceTypes = resistanceTypes(defenderCard);
    ctx.defenderToolCount = toolCountOn(opponent, defender);
    ctx.defenderBasicEnergyCount = attachedEnergyCards(opponent, defender).filter(
      (card) => classifyEnergyEffect(card) === 'basic'
    ).length;
  }
  // "…times the amount of Energy attached to all of your opponent's Pokémon" scaling.
  if (opponent) {
    ctx.opponentAllEnergyCount = inPlayPokemon(opponent).reduce(
      (sum, { card }) => sum + energyOn(opponent, card, { stadiumCard, opponent: own }).length,
      0
    );
    // Jumping Balloon: "for each of your opponent's Pokémon-GX and Pokémon-EX in play".
    ctx.opponentGxExCount = inPlayPokemon(opponent).filter(
      ({ view }) => isGxCard(view) || isExCard(view)
    ).length;
  }
  if (headsCount !== undefined) ctx.headsCount = headsCount;

  return ctx;
}
