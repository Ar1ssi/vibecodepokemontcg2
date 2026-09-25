/**
 * @file Authoritative state reducer for server-authoritative netcode.
 * Implements pure and total applyCommand(state, command, rng) -> { state, events, pendingChoice, error? }.
 * Enforces Invariants 2, 3, 6, 7, 8.
 */

import {
  cloneGameState,
  findCard,
  createGameState,
  attachmentHostId,
  discardCardToPlayerZone,
} from './state.mjs';
import {
  isEnergy,
  isPokemon,
  isTrainer,
  isBasicPokemon,
  getRetreatCostCount,
  createCard,
  mintInstanceId,
} from './cards.mjs';
import { validateCommandShape } from './commands.mjs';
import { setupGame } from './setup.mjs';
import { createRng, shuffleInPlace, flipCoin, withForcedCoin } from './rng.mjs';
import {
  computeAttackDamage,
  expandEnergyEntries,
  canPayAttackCost,
} from './rules/attack-engine.mjs';
import {
  drawCount,
  parseAttackDamage,
  allBenchDamage,
  eachPokemonDamage,
  ownBenchDamage,
  attackTargetClause,
  opponentCounterClause,
  parseAttackSearchClause,
  parsePrizeOnKo,
  prizeFilterMatches,
  prizeRuleBoxes,
  isGxAttack,
  discardEnergyScaling,
  deckMillScaling,
  deckRevealScaling,
  attachDiscardToBenchSpread,
  returnEnergyBonusClause,
} from './rules/damage-parser.mjs';
import { buildServerAttackContext } from './rules/attack-damage-context.mjs';
import { parseGrantedAttacks } from './rules/tool-attacks.mjs';
import { prizesForKO } from './rules/ko-flow.mjs';
import {
  evaluateToolKoPrevention,
  toolPrizeCountAdjust,
  attachedToolOnDamageEffects,
  attachedToolOnKoEffects,
  combinedToolRetreatCost,
  isPokemonToolCard,
  attachedTools,
  isExCard,
  isTeraCard,
} from './rules/tool-combat.mjs';
import {
  parseToolCap,
  parseUnlimitedHandEnergyAcceleration,
  costDiscountRead,
  applyCostDiscount,
  teamNoRetreatCostForActive,
  parsePrizeModify,
  isHandActivatedAbility,
} from './rules/ability-executors.mjs';
import { parseToolCondition, toolConditionMet } from './rules/tool-conditions.mjs';
import {
  stadiumOnAttachTriggers,
  stadiumOnEvolveTriggers,
  stadiumOnBenchTriggers,
  stadiumCheckupCoinModifiers,
  stadiumRetreatCoin,
  stadiumTrainerPlayCoin,
  stadiumAttackCoinModifier,
} from './rules/stadium-triggers.mjs';
import {
  applyStadiumTriggerEffect,
  applyStadiumSwitchTriggers,
} from './effects/stadium-trigger-apply.mjs';
import { classifyEnergyEffect } from './rules/energy-effects.mjs';
import {
  abilityDamageBonus,
  abilityDamageReduction,
  abilityDamagePrevention,
  abilityWeaknessOverride,
  abilityHpBonus,
  abilityPrizeModify,
  abilityRetreatCost,
  abilityAttackCostDiscount,
  abilityIgnoresDefenderEffects,
  abilityExtraTypes,
  applyEnergyMultiplier,
  abilityActivationBlockReason,
  isAbilitySuppressed,
  abilitySupporterLimit,
  abilityTurnNotEnd,
  abilityForcesOpponentTails,
  abilityAttackFlipGate,
  abilityVictoryStar,
  abilitySetupActive,
  abilityPrizeToBench,
  abilityPlayLocks,
  abilityEvolvePermission,
  abilityEvolveLock,
  abilityRetreatLock,
  abilitySummonRestricted,
  abilityFirstTurnAttack,
  extraAttackAvailable,
} from './rules/ability-combat.mjs';
import {
  inPlayEntries,
  parseCheckupAbilities,
  parseOnOpponentEvolveAbilities,
  parseEndOfTurnAbilities,
  parseOnDamageAbilities,
  parseOnDamageStatus,
  parseOnEnergyAttachAbilities,
  parseOnKoAbilities,
} from './rules/ability-triggers.mjs';
import { executeTrainer, discardCurrentStadium } from './effects/trainer.mjs';
import { executeAbility } from './effects/ability.mjs';
import { createPendingChoice, attachToRoot, executeSteps } from './effects/executor.mjs';
import { handEnergyForDiscard, handCardsForLostZone } from './effects/attack-steps.mjs';
import { pokemonHasType } from './effects/trainer-steps.mjs';
import { eachFilterMatches } from './rules/each-filter.mjs';
import { parseAttackSteps, resolveCoinGates, normalizeAttackText } from './rules/attack-steps.mjs';
import { parseAttackCondition, attackConditionMet } from './rules/attack-conditions.mjs';
import {
  parseCopyAttack,
  inCopyGroup,
  copiedAttackFor,
  parseAttackBorrowAbility,
} from './rules/attack-copy.mjs';
import {
  attackerMatchesFilter,
  clearAttackMarkers,
  liveAttackMarkers,
  markersBlockCondition,
  parseDamageImmunity,
} from './rules/attack-markers.mjs';
import {
  isSpecialEnergyCard,
  hasOncePerGameSpecialEnergyEffect,
  failedSpecialEnergyRestriction,
  hasSpecialEnergyEffectShield,
  blocksSpecialEnergyBenchDamage,
  hasSpecialEnergyFreeRetreat,
  getSpecialEnergyRetreatReduction,
  hasSpecialEnergyCannotRetreat,
  specialEnergyAttachDiscardCost,
  parseSpecialEnergyEffects,
} from './rules/special-energy-parse.mjs';
import {
  runSpecialEnergyTriggers,
  runEndOfTurnSpecialEnergies,
  applySpecialEnergyStatusImmunity,
  settleSpecialEnergyPassives,
  discardEndOfTurnSpecialEnergies,
  resolveSpecialEnergyDiscard,
  resolveSpecialEnergyKnockout,
  resumeSpecialEnergyTrigger,
  SPECIAL_ENERGY_EFFECT,
} from './effects/special-energy.mjs';
import { executeStadium } from './effects/stadium.mjs';
import {
  parseStadiumOncePerTurn,
  isStadiumCard,
  effectiveHp,
  getStadiumRetreatCost,
  isStadiumRetreatPrevention,
  isStadiumToolNegation,
  isStadiumEnergyAttachHeal,
  isStadiumGlimwoodReFlip,
  stadiumBetweenTurnsDamageFor,
  isStadiumLostCity,
  stadiumBlocksHealing,
  isStadiumStatusPersistsOnEvolve,
  stadiumExtraAttacks,
  mergeAttacks,
  isRepeatableStadiumAction,
  parseStadiumCostModifier,
  getStadiumAttackCostIncreaseFor,
  stadiumAbilityBlockedFor,
  stadiumAllowsSameTurnEvolution,
} from './rules/stadium-effects.mjs';
import {
  isRuleBoxPokemon,
  isGxCard,
  isVstarCard,
  isTeamFlareHyperGearCard,
  isBasicEnergy,
} from './rules/card-classify.mjs';
import { trainerPlayBlockReason } from './rules/trainer-play-conditions.mjs';
import { trainerEndsTurn } from './rules/trainer-effects.mjs';
import { serverEnergyDescriptor } from './rules/server-energy.mjs';
import {
  evolvedView,
  trainerTargetCounts,
  ownedCards,
  topPokemonCard,
} from './rules/evolved-pokemon.mjs';
import {
  normalizeStage,
  pokemonNamesMatch,
  requiresTurnEndOnEvolve,
} from './rules/evolution.mjs';
import {
  addCondition,
  removeCondition,
  clearConditions,
  hasCondition,
  hasAnyCondition,
  listConditions,
} from './rules/special-conditions.mjs';
import { parseNextTurnLock, parseAttackEnergyDiscard } from './rules/attack-effects.mjs';
import { parseAttackStatusBranches, statusesFromBranches } from './rules/attack-status.mjs';
import { matchesSearch } from './rules/search-match.mjs';

/**
 * Coin flips an attack's own printed text calls for, rolled from the command's RNG so a
 * replay reproduces them (design 002 catch-up). "Flip a coin" is one flip; "Flip N coins"
 * plus a "for each heads" clause is N flips whose heads are counted for damage scaling.
 *
 * @returns {{ coin: 'heads'|'tails'|null, headsCount: number|undefined, flips: string[] }}
 */
function flipAttackCoins(attack, rng) {
  const text = String(attack?.text || '').toLowerCase();
  const flip = () => flipCoin(rng);

  const multi = text.match(/flip (\d+) coins?/);
  if (multi) {
    const requested = Number.parseInt(multi[1], 10);
    // A printed count is always small; cap it so a malformed text cannot spin the RNG.
    const count = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 0), 20)
      : 0;
    const flips = Array.from({ length: count }, flip);
    const headsCount = flips.filter((f) => f === 'heads').length;
    return {
      coin:
        count === 1
          ? flips[0]
          : headsCount === count
            ? 'heads'
            : headsCount === 0
              ? 'tails'
              : null,
      headsCount,
      flips,
    };
  }
  // "Flip a coin until you get tails": every flip but the last is heads. No single face, so
  // only "for each heads" clauses read it. Capped like the printed count above.
  if (/flip a coin until you get tails/.test(text)) {
    const flips = [];
    while (flips.length < 20) {
      flips.push(flip());
      if (flips[flips.length - 1] === 'tails') break;
    }
    return { coin: null, headsCount: flips.filter((f) => f === 'heads').length, flips };
  }
  if (/flip a coin/.test(text)) {
    const coin = flip();
    return { coin, headsCount: coin === 'heads' ? 1 : 0, flips: [coin] };
  }
  return { coin: null, headsCount: undefined, flips: [] };
}

/** Benched Pokémon of a player, roots only (attached cards are not targets). */
function benchTargets(player) {
  return (player?.zones?.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
}

function discardCardFromPlayerZone(draft, instanceId, playerId) {
  const player = draft.players[playerId];
  if (!player?.zones) return null;
  for (const zoneKey of ['active', 'bench']) {
    const zone = player.zones[zoneKey];
    if (!Array.isArray(zone)) continue;
    const idx = zone.findIndex((c) => c.instanceId === instanceId);
    if (idx !== -1) {
      const [removed] = zone.splice(idx, 1);
      removed.attachedTo = null;
      discardCardToPlayerZone(player, removed);
      return removed;
    }
  }
  return null;
}

/**
 * Applies damage to one benched Pokémon: counters, event, and KO through handleKnockout
 * (so the prize entitlement stays server-granted, D43).
 */
function damageBenchedPokemon(
  draft,
  { victim, victimPlayerId, attackerPlayerId, attackName, dealt, auto, ownAttack = false, countersPlaced = false, activeRng = null, events }
) {
  if (dealt <= 0) return;

  // Check Tera bench damage immunity ("Tera: As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks")
  if (isTeraCard(victim)) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'tera-bench',
    });
    return;
  }

  // Check team bench protection abilities (e.g. Manaphy Wave Veil)
  const victimBench = draft.players[victimPlayerId]?.zones?.bench || [];
  const victimActive = draft.players[victimPlayerId]?.zones?.active || [];
  const allVictimCards = [...victimActive, ...victimBench];
  // Shadowy Darkness Energy (audit SE5): its benched {D} host takes no attack damage.
  if (!ownAttack && blocksSpecialEnergyBenchDamage(inPlayView(draft, victim), 'bench', victimBench)) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'special-energy-bench',
    });
    return;
  }
  if (countersPlaced && !ownAttack && counterEffectShielded(draft, victim, victimBench)) {
    events.push({ type: 'damagePrevented', instanceId: victim.instanceId, attackName, reason: 'special-energy-effect' });
    return;
  }
  // Bench shields stop the opponent's attacks, not the attacker's own recoil.
  const benchProtected = !ownAttack && allVictimCards.some((c) => {
    if (c.attachedTo) return false;
    const t = String(
      c?.ability?.text ?? c?.abilityText ?? c?.text ?? c?.effect ?? ''
    ).toLowerCase();
    return (
      t.includes('prevent all damage done to your benched pokémon') ||
      t.includes('prevent all damage done to your benched pokemon')
    );
  });
  if (benchProtected) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'bench-shield',
    });
    return;
  }
  if (!ownAttack && sideMarkerPrevents(draft, victimPlayerId, attackerPlayerId)) {
    events.push({
      type: 'damagePrevented',
      instanceId: victim.instanceId,
      attackName,
      reason: 'attack-marker',
    });
    return;
  }

  const prevDamage = victim.damage || 0;
  const koHp = cardEffectiveHp(draft, victim, victimPlayerId);
  const wouldKo = koHp > 0 && prevDamage + dealt >= koHp;

  if (wouldKo) {
    const koEval = evaluateToolKoPrevention(victim, victimBench, {
      currentDamage: prevDamage,
      incomingDamage: dealt,
      baseHp: koHp,
      stadium: draft.stadium,
      inHp: true,
      // Without an RNG (non-attack callers) Focus Band cannot flip, so it never prevents.
      ...(activeRng && { flipCoin: () => (activeRng.next() < 0.5 ? 'heads' : 'tails') }),
    });
    if (koEval.coinFace) {
      events.push({ type: 'coinFlipped', playerId: victimPlayerId, face: koEval.coinFace });
    }
    if (koEval.prevented) {
      victim.damage = koEval.totalDamage;
      events.push({
        type: 'damageUpdated',
        instanceId: victim.instanceId,
        damage: victim.damage,
        dealt,
      });
      events.push({
        type: 'koPrevented',
        instanceId: victim.instanceId,
        tool: koEval.tool,
        surviveHp: koEval.surviveHp,
      });
      if (koEval.discardOnUse && koEval.toolCard) {
        discardCardFromPlayerZone(
          draft,
          koEval.toolCard.instanceId,
          victimPlayerId
        );
      }
      return;
    }
  }

  victim.damage = prevDamage + dealt;
  events.push({
    type: 'damageUpdated',
    instanceId: victim.instanceId,
    damage: victim.damage,
    dealt,
  });
  events.push({
    type: 'benchDamaged',
    instanceId: victim.instanceId,
    playerId: victimPlayerId,
    attackerPlayerId,
    attackName,
    dealt,
    auto: Boolean(auto),
  });

  if (koHp > 0 && victim.damage >= koHp) {
    handleKnockout(draft, {
      victimPlayerId,
      attackerPlayerId,
      victim,
      events,
      byAttack: true,
      byDamage: !countersPlaced,
    });
  }
}

// Mist / Rocky / Wash / Wonder Energy: damage counters an opponent's attack places are an
// effect of that attack, not damage, so the effect shield stops them (review of audit SE5).
function counterEffectShielded(draft, victim, zoneCards) {
  return hasSpecialEnergyEffectShield(inPlayView(draft, victim), zoneCards);
}

// Chosen-target damage/counters for attacks that let the player pick one or more
// of the opponent's Pokémon (design 017 / D19). Returns a clause, or null.
//   { kind: 'damage'|'counters', amount, count, scope: 'bench'|'any'|'active' }
// 'active' scope is a fixed Active target and is applied without a choice.
function resolveAttackTargetClause(text, parsed, spread) {
  if (spread > 0) return null;
  const t = String(text || '');
  const counters = opponentCounterClause(t);
  if (counters) {
    if (counters.mode === 'active') {
      return { kind: 'counters', amount: counters.count * 10, count: 1, scope: 'active' };
    }
    // "put N damage counters on your opponent's Pokémon in any way you like":
    // place them one click at a time, each counter 10 damage, all N must land.
    if (/in any way/i.test(t)) {
      return {
        kind: 'counters',
        amount: 10,
        count: 1,
        scope: 'any',
        distributable: true,
        remaining: counters.count,
      };
    }
    return {
      kind: 'counters',
      amount: counters.count * 10,
      count: counters.mode === 'multi' ? counters.targets : 1,
      scope: 'any',
    };
  }
  const damage = attackTargetClause(t);
  if (damage) {
    return {
      kind: 'damage',
      amount: damage.amount,
      count: damage.count,
      scope: damage.scope,
      // Attack damage to the Active applies Weakness/Resistance unless the text
      // waives it for every target ("... for Benched Pokémon" waives only those).
      activeWR: !/don't apply weakness and resistance(?! for benched)/i.test(t),
      immunity: parseDamageImmunity(t),
    };
  }
  if (parsed?.bench > 0) {
    return { kind: 'damage', amount: parsed.bench, count: 1, scope: 'bench' };
  }
  return null;
}

function attackTargetOptions(draft, defenderPlayerId, scope) {
  const player = draft.players[defenderPlayerId];
  const active = (player?.zones?.active || []).filter((c) => !c.attachedTo);
  const bench = (player?.zones?.bench || []).filter((c) => !c.attachedTo);
  if (scope === 'bench') return bench;
  if (scope === 'active') return active;
  return [...active, ...bench];
}

// Flat damage to an Active target: no W/R for counter placement, and the printed
// snipe clause is treated as unmodified. Bench targets go through
// damageBenchedPokemon (Tera/bench-shield guards + KO).
function applyFlatDamageToTarget(draft, { ref, amount, attackerPlayerId, countersPlaced = false, events }) {
  const victim = ref.card;
  if (!victim || amount <= 0) return 0;
  const victimZone = ref.player?.zones?.[ref.zoneId] || [];
  if (countersPlaced && ref.playerId !== attackerPlayerId && counterEffectShielded(draft, victim, victimZone)) {
    events.push({ type: 'damagePrevented', instanceId: victim.instanceId, reason: 'special-energy-effect' });
    return 0;
  }
  victim.damage = (victim.damage || 0) + amount;
  events.push({
    type: 'damageUpdated',
    instanceId: victim.instanceId,
    damage: victim.damage,
    dealt: amount,
  });
  const koHp = cardEffectiveHp(draft, victim, ref.playerId);
  if (koHp > 0 && victim.damage >= koHp) {
    handleKnockout(draft, {
      victimPlayerId: ref.playerId,
      attackerPlayerId,
      victim,
      events,
      byAttack: true,
      byDamage: !countersPlaced,
    });
  }
  return amount;
}

// Chaos Gym: every Trainer card other than a Stadium is coin-gated, whether played
// or attached from hand as a Pokémon Tool. Tails means it can't be played and goes
// to the discard pile. Returns true when the card was blocked.
// (The printed "opponent may use that card instead" clause is not implemented.)
function chaosGymBlocks(draft, { card, playerId, activeRng, events }) {
  const chaos = stadiumTrainerPlayCoin(draft.stadium?.card || draft.stadium, card);
  if (!chaos) return false;
  const face = activeRng.next() < 0.5 ? 'heads' : 'tails';
  events.push({ type: 'coinFlipped', playerId, face, source: chaos.source });
  if (face === 'heads') return false;
  const hand = draft.players[playerId].zones.hand;
  const handIdx = hand.findIndex((c) => c.instanceId === card.instanceId);
  if (handIdx >= 0) {
    const [blocked] = hand.splice(handIdx, 1);
    blocked.attachedTo = null;
    discardCardToPlayerZone(draft.players[playerId], blocked);
    events.push({ type: 'cardMoved', instanceId: blocked.instanceId, from: 'hand', to: 'discard', playerId });
  }
  events.push({
    type: 'trainerPlayBlocked',
    playerId,
    instanceId: card.instanceId,
    name: card.name || '',
    source: chaos.source,
  });
  return true;
}

// Prize-count inputs computeAttackDamage reads, from the attacking player's side.
function prizeFlags(draft, attackerPlayerId, defenderPlayerId) {
  const attackerPrizesRemaining = (draft.players[attackerPlayerId]?.zones?.prizes || []).length;
  const defenderPrizesRemaining = (draft.players[defenderPlayerId]?.zones?.prizes || []).length;
  return {
    attackerTrailingPrizes: attackerPrizesRemaining > defenderPrizesRemaining,
    defenderTrailingPrizes: defenderPrizesRemaining > attackerPrizesRemaining,
    attackerPrizesRemaining,
    defenderPrizesRemaining,
  };
}

// A chosen-target clause's damage to the opponent's Active after Weakness,
// Resistance and the other attack modifiers computeAttackDamage applies.
function activeTargetDamage(draft, { ref, clause, attackerPlayerId, attackName }) {
  const attacker = (draft.players[attackerPlayerId]?.zones?.active || []).find(
    (c) => !c.attachedTo
  );
  if (!attacker) return clause.amount;
  const defenderPlayer = draft.players[ref.playerId];
  const defenderView = inPlayView(draft, ref.card);
  const abilityReads = attackAbilityReads(draft, {
    attacker: inPlayView(draft, attacker),
    defender: defenderView,
    playerId: attackerPlayerId,
    defenderPlayerId: ref.playerId,
  });
  const result = computeAttackDamage(
    abilityReads.attacker,
    defenderView,
    { name: attackName, damage: clause.amount },
    {
      attackerZoneCards: draft.players[attackerPlayerId]?.zones?.active || [],
      defenderZoneCards: defenderPlayer?.zones?.active || [],
      defenderInPlayCards: [
        ...(defenderPlayer?.zones?.active || []),
        ...(defenderPlayer?.zones?.bench || []),
      ],
      stadium: draft.stadium,
      defenderIsActive: true,
      baseDamage: clause.amount,
      ...prizeFlags(draft, attackerPlayerId, ref.playerId),
      turnDamageBonuses: draft.players[attackerPlayerId]?.flags?.turnDamageBonuses || [],
      ...clause.immunity,
      ignoreDefenderEffects:
        clause.immunity?.ignoreDefenderEffects ||
        abilityReads.ignoreDefenderEffects,
      abilityBonusBeforeWR: abilityReads.abilityBonusBeforeWR,
      abilityReductionBeforeWR: abilityReads.abilityReductionBeforeWR,
      abilityReductionAfterWR: abilityReads.abilityReductionAfterWR,
      abilityPrevention: abilityReads.abilityPrevention,
      weaknessOverride: abilityReads.weaknessOverride,
      defenderMarkers: activeAttackMarkers(draft, ref.playerId, ref.card),
      attackerMarkers: activeAttackMarkers(draft, attackerPlayerId, attacker),
    }
  );
  return result.total;
}

// Timed attack effects (design 031) still in force on a Pokémon in its owner's Active Spot.
function activeAttackMarkers(draft, playerId, card) {
  const active = draft.players[playerId]?.zones?.active || [];
  if (!card || !active.some((c) => c.instanceId === card.instanceId)) return [];
  return [
    ...liveAttackMarkers(card, {
      turnNumber: draft.turn?.number || 1,
      zoneCards: active,
    }),
    ...restOfGameMarkers(draft, playerId, card),
  ];
}

// "For the rest of this game, …" (design 036 E) read as the marker kinds the damage path knows:
// a bonus on the player's Active attacker, a reduction on their typed Active defender.
function restOfGameMarkers(draft, playerId, card) {
  const effects = draft.players[playerId]?.restOfGame || [];
  if (effects.length === 0) return [];
  const view = inPlayView(draft, card);
  return effects.flatMap((effect) => {
    if (effect.kind === 'damageBonus') return [{ kind: 'nextTurnBonus', amount: effect.amount }];
    if (effect.kind === 'damageReduce' && (!effect.pokemonType || pokemonHasType(view, effect.pokemonType))) {
      return [{ kind: 'incomingReduce', amount: effect.amount, afterWR: true }];
    }
    return [];
  });
}

function attachLockReason(state, card, targetInstanceId) {
  const targetRef = findCard(state, targetInstanceId);
  if (!targetRef?.card) return null;
  const markers = activeAttackMarkers(state, targetRef.playerId, targetRef.card);
  if (isEnergy(card)) {
    const special = !isBasicEnergy(card);
    const locked = markers.some((m) => m.kind === 'attachLock' && (!m.specialOnly || special));
    return locked ? "An attack stops Energy being attached to that Pokémon this turn." : null;
  }
  if (isPokemon(card) && markers.some((m) => m.kind === 'evolveLock')) {
    return "An attack stops that Pokémon evolving this turn.";
  }
  return null;
}

/**
 * Ability-side combat reads for one attack (design 034 slice 2): the
 * attacker's bonus and extra types plus the defender's reduction, prevention
 * and Weakness override, in the option shape computeAttackDamage consumes.
 * `attacker`/`defender` are in-play views.
 */
function attackAbilityReads(
  draft,
  { attacker, defender, playerId, defenderPlayerId, defenderIsActive = true }
) {
  const attackerZones = draft.players[playerId]?.zones || {};
  const defenderZones = draft.players[defenderPlayerId]?.zones || {};
  const attackerSide = [
    ...(attackerZones.active || []),
    ...(attackerZones.bench || []),
  ];
  const defenderSide = [
    ...(defenderZones.active || []),
    ...(defenderZones.bench || []),
  ];
  const attackerCtx = {
    sideCards: attackerSide,
    opponentSideCards: defenderSide,
    sideActive: attackerZones.active || [],
    sideBench: attackerZones.bench || [],
    zone: 'active',
    isActive: true,
    attackerIsActive: true,
    turnNumber: draft.turn?.number,
    opponentHandCount: (defenderZones.hand || []).length,
    ownHandCount: (attackerZones.hand || []).length,
    ownPrizesLeft: (attackerZones.prizes || []).length,
    opponentPrizesLeft: (defenderZones.prizes || []).length,
  };
  const defenderCtx = {
    sideCards: defenderSide,
    opponentSideCards: attackerSide,
    sideActive: defenderZones.active || [],
    sideBench: defenderZones.bench || [],
    zone: 'active',
    isActive: defenderIsActive,
    attackerIsActive: true,
    attackerIsEx: isExCard(attacker),
    turnNumber: draft.turn?.number,
  };
  const extraTypes = abilityExtraTypes(attacker, attackerCtx);
  const attackerView = extraTypes.length
    ? { ...attacker, types: [...(attacker.types || []), ...extraTypes] }
    : attacker;
  const reduction = abilityDamageReduction(defender, attackerView, defenderCtx);
  return {
    attacker: attackerView,
    abilityBonusBeforeWR: abilityDamageBonus(
      attackerView,
      defender,
      attackerCtx
    ),
    abilityReductionBeforeWR: reduction.beforeWR,
    abilityReductionAfterWR: reduction.afterWR,
    abilityPrevention: abilityDamagePrevention(
      defender,
      attackerView,
      defenderCtx
    ),
    weaknessOverride: abilityWeaknessOverride(defender, defenderCtx),
    ignoreDefenderEffects: abilityIgnoresDefenderEffects(attackerView),
  };
}

/** The defending player's flip for a surviveKnockOutCoin marker: true on heads. */
function survivesOnCoin(activeRng, playerId, events) {
  const coin = activeRng.next() < 0.5 ? 'heads' : 'tails';
  events.push({ type: 'attackMarkerCoinFlipped', kind: 'surviveKnockOutCoin', playerId, coin });
  return coin === 'heads';
}

/**
 * An attack that was declared but does not happen (Confusion tails, Smokescreen Shot tails,
 * Mini-Metronome tails): the attack still ends the turn — Pokémon Checkup, then the hand-off.
 */
function endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events }) {
  const attackerPlayer = draft.players[playerId];
  if (!attackerPlayer.flags) attackerPlayer.flags = {};
  attackerPlayer.flags.attackerAttacked = true;
  if (isGameConcluded(draft)) return;
  resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
  if (!isGameConcluded(draft)) advanceTurn(draft, { nextPlayerId: oppId, events });
}

/**
 * Spends the player's once-per-game GX attack. Declaring the attack is what spends it, so this
 * runs on the resolving path and on an attack that failed its printed condition (design 036 A1).
 */
function spendGxAttack(draft, { playerId, attacker, attack, events }) {
  if (!isGxAttack(attack)) return;
  const oncePerGame = ensureOncePerGame(draft, playerId);
  if (oncePerGame && !oncePerGame.gxUsed) {
    oncePerGame.gxUsed = true;
    events.push({
      type: 'gxAttackUsed',
      playerId,
      instanceId: attacker?.instanceId,
      attackName: attack.name,
    });
  }
}

// A side-wide marker on the victim's Active (M Diancie-EX Diamond Force) guards the Bench too.
function sideMarkerPrevents(draft, victimPlayerId, attackerPlayerId) {
  const guard = (draft.players[victimPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
  const attacker = (draft.players[attackerPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
  if (!guard || !attacker) return false;
  const attackerView = inPlayView(draft, attacker);
  return activeAttackMarkers(draft, victimPlayerId, guard).some(
    (m) => m.kind === 'incomingPrevent' && m.scope === 'side' && attackerMatchesFilter(m.filter, attackerView)
  );
}

// Wobbuffet BREAK Right Back at You / Rocket's Moltres Fire Wall (design 031): the damaged
// Pokémon strikes back, even when this attack knocked it out. `strikerView` is its top card
// as it was before the damage landed.
function applyRetaliation(
  draft,
  { markers, dealt, striker, strikerView, strikerPlayerId, attacker, attackerPlayerId, events }
) {
  for (const marker of markers) {
    const target =
      marker.mode === 'counters'
        ? attacker
        : (draft.players[attackerPlayerId]?.zones?.active || []).find((c) => !c.attachedTo);
    const ref = target && findCard(draft, target.instanceId);
    if (!ref || (ref.zoneId !== 'active' && ref.zoneId !== 'bench')) continue;
    const amount =
      marker.mode === 'counters'
        ? dealt
        : retaliationAttackDamage(draft, { marker, striker, strikerView, strikerPlayerId, target, attackerPlayerId });
    if (amount <= 0) continue;
    target.damage = (target.damage || 0) + amount;
    events.push({
      type: 'damageUpdated',
      instanceId: target.instanceId,
      damage: target.damage,
      dealt: amount,
      reason: 'retaliate',
    });
    const koHp = cardEffectiveHp(draft, target, attackerPlayerId);
    if (koHp > 0 && target.damage >= koHp) {
      handleKnockout(draft, {
        victimPlayerId: attackerPlayerId,
        attackerPlayerId: strikerPlayerId,
        victim: target,
        events,
      });
    }
  }
}

// "… attacks your opponent's Active Pokémon for 10 damage. (Apply Weakness and Resistance.)"
function retaliationAttackDamage(draft, { marker, striker, strikerView, strikerPlayerId, target, attackerPlayerId }) {
  const strikerZone = draft.players[strikerPlayerId]?.zones?.active || [];
  const targetPlayer = draft.players[attackerPlayerId];
  const targetView = inPlayView(draft, target);
  const abilityReads = attackAbilityReads(draft, {
    attacker: strikerView,
    defender: targetView,
    playerId: strikerPlayerId,
    defenderPlayerId: attackerPlayerId,
  });
  const result = computeAttackDamage(
    abilityReads.attacker,
    targetView,
    { name: marker.sourceAttack, damage: marker.amount },
    {
      attackerZoneCards: strikerZone.some((c) => c.instanceId === striker.instanceId) ? strikerZone : [],
      defenderZoneCards: targetPlayer?.zones?.active || [],
      defenderInPlayCards: [...(targetPlayer?.zones?.active || []), ...(targetPlayer?.zones?.bench || [])],
      stadium: draft.stadium,
      defenderIsActive: true,
      baseDamage: marker.amount,
      ...prizeFlags(draft, strikerPlayerId, attackerPlayerId),
      ignoreDefenderEffects: abilityReads.ignoreDefenderEffects,
      abilityBonusBeforeWR: abilityReads.abilityBonusBeforeWR,
      abilityReductionBeforeWR: abilityReads.abilityReductionBeforeWR,
      abilityReductionAfterWR: abilityReads.abilityReductionAfterWR,
      abilityPrevention: abilityReads.abilityPrevention,
      weaknessOverride: abilityReads.weaknessOverride,
      defenderMarkers: activeAttackMarkers(draft, attackerPlayerId, target),
    }
  );
  return result.total;
}

// Applies a chosen-target clause to the selected instanceIds. Returns damage dealt.
function applyAttackTargets(
  draft,
  { selection, clause, defenderPlayerId, attackerPlayerId, attackName, activeRng = null, events }
) {
  let dealt = 0;
  for (const id of selection || []) {
    const ref = findCard(draft, id);
    if (!ref || ref.playerId !== defenderPlayerId) continue;
    if (ref.zoneId === 'bench') {
      dealt += clause.amount;
      damageBenchedPokemon(draft, {
        victim: ref.card,
        victimPlayerId: defenderPlayerId,
        attackerPlayerId,
        attackName,
        dealt: clause.amount,
        auto: false,
        activeRng,
        countersPlaced: clause.kind === 'counters',
        events,
      });
    } else if (ref.zoneId === 'active') {
      dealt += applyFlatDamageToTarget(draft, {
        ref,
        amount: clause.activeWR
          ? activeTargetDamage(draft, { ref, clause, attackerPlayerId, attackName })
          : clause.amount,
        attackerPlayerId,
        countersPlaced: clause.kind === 'counters',
        events,
      });
    }
  }
  return dealt;
}

// An in-play Pokémon as its top evolution card (see evolved-pokemon.mjs). Read-only.
function inPlayView(state, card) {
  if (!card) return card;
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  return Array.isArray(zone) ? evolvedView(zone, card) : card;
}

// Context a special Energy's provision conditions read (energy-effects
// rewriteEnergyDescriptor): the host as it is in play, every card attached to it, and
// the prize / Stage 2 facts behind Reversal, Counter, Scramble and Super Boost Energy.
function energyProvisionContext(state, playerId, host) {
  const player = state.players?.[playerId];
  const opponentId = Object.keys(state.players || {}).find((id) => id !== playerId);
  const ref = host ? findCard(state, host.instanceId) : null;
  const zone = ref?.player?.zones?.[ref.zoneId] || [];
  const roots = ['active', 'bench'].flatMap((zoneId) =>
    (player?.zones?.[zoneId] || [])
      .filter((c) => !c.attachedTo && isPokemon(c))
      .map((c) => evolvedView(player.zones[zoneId], c))
  );
  return {
    hostPokemon: inPlayView(state, host),
    attachedCards: host ? zone.filter((c) => c.attachedTo === host.instanceId) : [],
    board: {
      ownPrizes: (player?.zones?.prizes || []).length,
      opponentPrizes: (state.players?.[opponentId]?.zones?.prizes || []).length,
      ownStage2InPlay: roots.filter(
        (c) => String(c.stage ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'stage2'
      ).length,
    },
  };
}

// The bench zone of the player's first Benched Pokémon (Handheld Fan's destination).
function firstBenchRootZone(state, playerId) {
  const bench = state.players?.[playerId]?.zones?.bench || [];
  return bench.some((c) => !c.attachedTo) ? bench : null;
}

// Extra attacks a Stadium makes usable by this Pokémon (Shrine of Memories /
// Meteor Falls inheritance, Holon Lake / Rocket's Tricky Gym grants). Order is
// shared with the client's list builders, so an attackIndex resolves alike.
function stadiumExtraAttacksFor(state, card, { isActive = true } = {}) {
  const stadiumCard = state.stadium?.card || state.stadium;
  if (!card) return [];
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  if (!Array.isArray(zone)) return [];
  return stadiumExtraAttacks(stadiumCard, {
    zoneCards: zone,
    root: card,
    isActive,
  });
}

// Attacks a Pokémon Tool grants to the Pokémon it is attached to (TM/Cube Items,
// design 035 slice 7). Read from the same zone stack the tool lives in.
function toolGrantedAttacksFor(state, card) {
  if (!card) return [];
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  if (!Array.isArray(zone)) return [];
  const out = [];
  for (const attached of zone) {
    if (attached.attachedTo !== card.instanceId) continue;
    out.push(...parseGrantedAttacks(attached));
  }
  return out;
}

function borrowSourceMatches(card, borrow) {
  if (!isPokemon(card)) return false;
  const name = String(card.name || '').toLowerCase();
  if (borrow.basic && (normalizeStage(card.stage) || 'Basic') !== 'Basic') return false;
  if (borrow.noRuleBox && isRuleBoxPokemon(card)) return false;
  if (borrow.gxOrEx && !/-(?:gx|ex)$/.test(name)) return false;
  if (borrow.evolvesFrom && String(card.evolvesFrom || '').toLowerCase() !== borrow.evolvesFrom) {
    return false;
  }
  if (borrow.names && !borrow.names.includes(name)) return false;
  return true;
}

/**
 * Attacks an Ability lets `card` use as its own (Mew ex Memory Helix, Ditto Sudden
 * Transformation, Mewtwo & Mew-GX Perfection, Mew-EX Versatile, …; design 034 slice 6).
 * In-play sources are read through their top evolution; the copier itself never counts.
 * Each attack keeps its own cost, and its text names the copier (copiedAttackFor).
 */
function abilityBorrowedAttacks(state, card) {
  const ref = findCard(state, card?.instanceId);
  if (!ref || !['active', 'bench'].includes(ref.zoneId)) return [];
  const view = inPlayView(state, card);
  const texts = (view?.abilities || []).map((a) => (typeof a === 'string' ? a : a?.text));
  const borrow = texts.map(parseAttackBorrowAbility).find(Boolean);
  if (!borrow) return [];
  if (borrow.requiresActive && ref.zoneId !== 'active') return [];
  if (isAbilitySuppressed(view, abilitySideContext(state, ref.playerId))) return [];
  const own = state.players?.[ref.playerId];
  const opp = Object.values(state.players || {}).find((p) => p.playerId !== ref.playerId);
  const inPlay = (p, zones) =>
    zones.flatMap((z) => rootsIn(p?.zones?.[z])).map((root) => inPlayView(state, root));
  const bySource = {
    ownBench: () => inPlay(own, ['bench']),
    ownInPlay: () => inPlay(own, ['active', 'bench']),
    oppInPlay: () => inPlay(opp, ['active', 'bench']),
    oppActive: () => inPlay(opp, ['active']),
    ownDiscard: () => own?.zones?.discard || [],
    ownLostZone: () => own?.zones?.lostZone || [],
    oppLostZone: () => opp?.zones?.lostZone || [],
  };
  const borrowed = [];
  for (const source of borrow.scopes.flatMap((scope) => bySource[scope]?.() || [])) {
    if (source.instanceId === card.instanceId || !borrowSourceMatches(source, borrow)) continue;
    for (const attack of source.attacks || []) {
      if (!attack?.name) continue;
      borrowed.push(copiedAttackFor(attack, { sourceName: source.name, copierName: view.name }));
    }
  }
  return borrowed;
}

// `inPlayView` with Stadium extras and Ability-borrowed attacks merged into its attacks list.
function attackViewFor(state, card, { isActive = true } = {}) {
  const view = inPlayView(state, card);
  const extras = mergeAttacks(
    mergeAttacks(stadiumExtraAttacksFor(state, card, { isActive }), toolGrantedAttacksFor(state, card)),
    abilityBorrowedAttacks(state, card)
  );
  if (extras.length === 0) return view;
  return { ...view, attacks: mergeAttacks(view?.attacks || [], extras) };
}

// Effective HP including printed base stats, top evolution, attached Tools, Stadium modifiers, and ability HP bonuses.
function cardEffectiveHp(state, card, playerId) {
  if (!card) return 0;
  const view = inPlayView(state, card);
  const baseHp = view?.hp || 0;
  if (!baseHp) return 0;
  const ref = findCard(state, card.instanceId);
  const zoneCards = ref?.player?.zones?.[ref.zoneId] || [];
  const zones = state.players?.[playerId]?.zones || {};
  const sideCards = [...(zones.active || []), ...(zones.bench || [])];
  // The view, not the root: +HP gates read the Pokémon in play (Growing Grass on an evolved
  // {G} Pokémon whose Basic is another type, audit SE13e).
  return effectiveHp(baseHp, playerId, view, zoneCards, state.stadium, sideCards);
}

function markerCount(markers, kind, field) {
  return markers.reduce((sum, marker) => sum + (marker.kind === kind ? marker[field] || 0 : 0), 0);
}

// Effective retreat cost including printed base stats, top evolution, attached Tools, Bench abilities, and Stadium modifiers.
function computeEffectiveRetreatCost(state, card, playerId) {
  if (!card) return 0;
  // Vespiquen Mach Wind (design 033): the Retreat Cost is 0 during the next turn.
  if (activeAttackMarkers(state, playerId, card).some((m) => m.kind === 'freeRetreat')) return 0;
  const player = state.players?.[playerId];
  const activeZone = player?.zones?.active || [];
  const stadium = state.stadium;
  const baseRetreat = getRetreatCostCount(inPlayView(state, card));

  // Team-wide "no Retreat Cost" ability on a Benched Pokémon (e.g. Latias ex
  // "Skyliner") zeroes the Active Spot's cost regardless of printed/Tool/Stadium.
  // Read the top evolution of each Pokémon: the root of an evolved card is its
  // Basic, whose stage/ability must not stand in for the card in play.
  const benchViews = (player?.zones?.bench || []).map((b) =>
    inPlayView(state, b)
  );
  if (teamNoRetreatCostForActive(inPlayView(state, card), benchViews)) return 0;
  // Magnetic Metal / Hiding Darkness / Holon WP Energy (audit SE6): "has no Retreat Cost".
  if (hasSpecialEnergyFreeRetreat(inPlayView(state, card), activeZone)) return 0;

  // 1. Tool retreat cost modifier + self ability modifier
  const blockTools = isStadiumToolNegation(stadium?.card || stadium);
  let cost = combinedToolRetreatCost(baseRetreat, card, activeZone, {
    blockTools,
    stadium,
  });

  // 2. In-play ability retreat modifiers: the own-bench "your Active's Retreat
  // Cost is N less" wording and the opponent-side increases (A10).
  const opponent = state.players?.[
    Object.keys(state.players || {}).find((id) => id !== playerId)
  ];
  const sideCards = [...(player?.zones?.active || []), ...(player?.zones?.bench || [])];
  const opponentSideCards = [
    ...(opponent?.zones?.active || []),
    ...(opponent?.zones?.bench || []),
  ];
  cost += abilityRetreatCost(inPlayView(state, card), {
    sideCards,
    opponentSideCards,
    zone: 'active',
    isActive: true,
  });

  // 3. Stadium retreat modifier (e.g. Beach Court)
  cost = getStadiumRetreatCost(cost, card, playerId, stadium);

  // 4. "Its Retreat Cost is {C} more" attack markers (Mawile, Grimer).
  cost += markerCount(activeAttackMarkers(state, playerId, card), 'retreatDelta', 'amount');

  // 5. Mystery Energy: "Retreat Cost is {C}{C} less".
  cost -= getSpecialEnergyRetreatReduction(inPlayView(state, card), activeZone);

  return Math.max(0, cost);
}

// On-Knock-Out Tool effects (design 035 slice 9): return-to-hand, Prize denial,
// Energy moves, opponent mill, KO search and draw-to-N. Runs before the victim's
// discard sweep so Energy still attached can be moved.
function applyToolOnKoEffects(
  draft,
  { victimPlayerId, attackerPlayerId, victim, effects, activeRng, events }
) {
  const victimPlayer = draft.players[victimPlayerId];
  const attacker = draft.players[attackerPlayerId];
  const outcome = { returnToHand: false, discardPrizes: false };
  if (!victimPlayer || !Array.isArray(effects) || effects.length === 0) return outcome;

  const firstBench = (player) =>
    (player?.zones?.bench || []).find((c) => !c.attachedTo) || null;
  const moveCard = (owner, card, fromZone, toZone, toLabel, newHostId = null) => {
    const idx = fromZone.indexOf(card);
    if (idx < 0) return;
    fromZone.splice(idx, 1);
    card.attachedTo = newHostId;
    toZone.push(card);
    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'inPlay',
      to: toLabel,
      playerId: owner.playerId,
    });
  };

  for (const eff of effects) {
    if (eff.returnSelfToHand) outcome.returnToHand = true;
    if (eff.discardPrizes) outcome.discardPrizes = true;

    if (eff.moveEnergyOnKo) {
      const spec = eff.moveEnergyOnKo;
      const sourceRoot =
        spec.from === 'attacker'
          ? attacker?.zones?.active?.find((c) => !c.attachedTo)
          : victim;
      const srcRef = sourceRoot ? findCard(draft, sourceRoot.instanceId) : null;
      const sourceZone = srcRef?.player?.zones?.[srcRef.zoneId] || [];
      const pool = sourceZone.filter(
        (c) =>
          c.attachedTo === sourceRoot?.instanceId &&
          isEnergy(c) &&
          (!spec.basicOnly || classifyEnergyEffect(c) === 'basic')
      );
      const count = spec.count === 'all' ? pool.length : Math.min(spec.count, pool.length);
      for (const energy of pool.slice(0, count)) {
        if (spec.to === 'hand') {
          moveCard(victimPlayer, energy, sourceZone, victimPlayer.zones.hand, 'hand');
        } else if (spec.to === 'holder') {
          // Exp. Share: the Tool's own Pokémon receives the Energy. A holder that is
          // the victim itself has nothing to move to.
          if (!eff.holder || eff.holder.instanceId === victim.instanceId) continue;
          const holderRef = findCard(draft, eff.holder.instanceId);
          const holderZone = holderRef?.player?.zones?.[holderRef.zoneId];
          if (!Array.isArray(holderZone)) continue;
          moveCard(victimPlayer, energy, sourceZone, holderZone, holderRef.zoneId, eff.holder.instanceId);
        } else if (spec.to === 'bench') {
          const bench = firstBench(victimPlayer);
          if (!bench || bench.instanceId === victim.instanceId) continue;
          const benchRef = findCard(draft, bench.instanceId);
          moveCard(victimPlayer, energy, sourceZone, benchRef.player.zones.bench, 'bench', bench.instanceId);
        } else if (spec.to === 'opponentHand') {
          if (!attacker) continue;
          moveCard(attacker, energy, sourceZone, attacker.zones.hand, 'hand');
        } else if (spec.to === 'opponentBench') {
          const bench = firstBench(attacker);
          if (!bench) continue;
          const benchRef = findCard(draft, bench.instanceId);
          moveCard(attacker, energy, sourceZone, benchRef.player.zones.bench, 'bench', bench.instanceId);
        }
      }
    }

    if (eff.millOpponent && attacker) {
      if (eff.millOpponent.deck > 0) {
        const milled = attacker.zones.deck.splice(
          0,
          Math.min(eff.millOpponent.deck, attacker.zones.deck.length)
        );
        for (const card of milled) discardCardToPlayerZone(attacker, card);
        if (milled.length) {
          events.push({
            type: 'cardsDiscarded',
            playerId: attacker.playerId,
            cards: milled.map((c) => ({ instanceId: c.instanceId, name: c.name })),
          });
        }
      }
      if (eff.millOpponent.handRandom > 0 && activeRng && attacker.zones.hand.length > 0) {
        const idx = Math.floor(activeRng.next() * attacker.zones.hand.length);
        const [card] = attacker.zones.hand.splice(idx, 1);
        discardCardToPlayerZone(attacker, card);
        events.push({
          type: 'cardsDiscarded',
          playerId: attacker.playerId,
          cards: [{ instanceId: card.instanceId, name: card.name }],
        });
      }
    }

    if (eff.searchDeckOnKo > 0) {
      const deck = victimPlayer.zones.deck || [];
      const taken = deck.splice(0, Math.min(eff.searchDeckOnKo, deck.length));
      victimPlayer.zones.hand.push(...taken);
      if (activeRng) shuffleInPlace(activeRng, deck);
      if (taken.length) {
        // A private search: the public event carries the count only (I141).
        events.push({ type: 'cardsLookedAt', playerId: victimPlayerId, count: taken.length, zone: 'deck' });
      }
    }

    if (eff.drawUntil > 0) {
      const hand = victimPlayer.zones.hand;
      const need = Math.max(0, eff.drawUntil - hand.length);
      const drawn = victimPlayer.zones.deck.splice(
        0,
        Math.min(need, victimPlayer.zones.deck.length)
      );
      hand.push(...drawn);
      if (drawn.length) {
        events.push({
          type: 'cardsDrawn',
          count: drawn.length,
          playerId: victimPlayerId,
          cards: drawn.map((c) => ({ instanceId: c.instanceId })),
        });
      }
    }
  }

  return outcome;
}

// The opponent's Active Pokémon as play conditions see it: the top of the stack, which
// carries the stage/types; Special Conditions live on the root card.
function opponentActiveTop(opponent) {
  const active = opponent?.zones?.active || [];
  const root = active.find((c) => !c.attachedTo);
  if (!root) return null;
  const top = topPokemonCard(active, root) || root;
  return top === root ? root : { ...top, specialCondition: root.specialCondition, poisoned: root.poisoned, burned: root.burned };
}

/**
 * Win condition checks (rulebook 30c 1.3a / p.21 "both players win at the same time").
 * Counts how many ways each player currently wins, then compares: the side with more ways
 * wins outright, and only an equal non-zero count is a genuine tie. A player's ways are
 * taking every remaining Prize and the opponent having no Pokémon in play. Called once per
 * Knock Out, or once per batch when several were marked together (`deferWin`).
 */
function settleKnockOutWins(draft, { events }) {
  const playerIds = Object.keys(draft.players || {});
  if (playerIds.length !== 2) return;
  const [a, b] = playerIds;
  const stateOf = (pid) => {
    const player = draft.players[pid];
    const prizes = player?.zones?.prizes || [];
    const owed = player?.flags?.prizesOwed || 0;
    const inPlay = [...(player?.zones?.active || []), ...(player?.zones?.bench || [])].filter(
      (c) => !c.attachedTo
    );
    return {
      // An entitlement must exist: a zero-prize board with nothing owed is not a win.
      byPrizes: owed > 0 && prizes.length <= owed,
      wiped: inPlay.length === 0,
    };
  };
  const stateA = stateOf(a);
  const stateB = stateOf(b);
  const ways = {
    [a]: [
      ...(stateA.byPrizes ? ['all prize cards taken'] : []),
      ...(stateB.wiped ? ['no Pokémon in play'] : []),
    ],
    [b]: [
      ...(stateB.byPrizes ? ['all prize cards taken'] : []),
      ...(stateA.wiped ? ['no Pokémon in play'] : []),
    ],
  };
  // Re-settling a game a direct Knock Out already ended this command (I165): keep an unchanged
  // result, but a later KO in the same command can turn a lone win into a tiebreak.
  if (isGameConcluded(draft)) {
    const winner = ways[a].length > ways[b].length ? a : ways[b].length > ways[a].length ? b : null;
    if (winner && draft.winner === winner) return;
    if (!winner && (ways[a].length === 0 || draft.tiebreak)) return;
  }
  if (ways[a].length > ways[b].length) {
    setGameEnded(draft, {
      winner: a,
      reason: stateA.byPrizes ? 'all prize cards taken' : 'no Pokémon in play',
      events,
    });
  } else if (ways[b].length > ways[a].length) {
    setGameEnded(draft, {
      winner: b,
      reason: stateB.byPrizes ? 'all prize cards taken' : 'no Pokémon in play',
      events,
    });
  } else if (ways[a].length > 0) {
    setGameEnded(draft, { simultaneous: [a, b], ways, events });
  }
}

const LOST_ZONE_KNOCKOUT =
  /knocked out by (?:damage from )?this (?:attack|damage), put (?:that pokémon|your opponent's active pokémon) and all cards attached to it in the lost zone instead of (?:discarding it|the discard pile)/;

/**
 * The attack-legality reason a printed own-hand cost cannot be paid (D114), or null.
 * Only a required cost counts: "You may discard …" is never a reason to refuse the attack.
 */
function handCardsCostReason(player, beforeSteps) {
  const discard = beforeSteps.find(
    (step) => step.type === 'atkDiscardOwnHand' && !step.optional && typeof step.count === 'number'
  );
  if (discard && (player?.zones?.hand || []).length < discard.count) {
    return `You need ${discard.count} card(s) in your hand to discard.`;
  }
  const lostZone = beforeSteps.find((step) => step.type === 'atkLostZoneFromHand' && !step.optional);
  if (lostZone && handCardsForLostZone(player, lostZone).length < (lostZone.count || 1)) {
    return `You need ${lostZone.what === 'pokemon' ? 'a Pokémon' : 'a card'} in your hand to put in the Lost Zone.`;
  }
  return null;
}

/**
 * Handles Knockout resolution for a Pokemon:
 * - Grants the attacker a prize entitlement, settled by collectPrizeEntitlement
 *   when the command finishes (audit finding B-1: the grant, not a client-supplied
 *   count, is what authorises a prize card changing hands)
 * - Discards victim and its attached cards
 * - Auto-promotes first benched Pokemon to active (if any)
 * - Checks win conditions (deferred to the batch when `deferWin`)
 */
function handleKnockout(
  draft,
  { victimPlayerId, attackerPlayerId, victim, events, byAttack = false, byDamage = true, activeRng = null, deferWin = false }
) {
  // Discard victim and attached cards from its zone (active or bench)
  const victimActive = draft.players[victimPlayerId]?.zones?.active || [];
  const victimBench = draft.players[victimPlayerId]?.zones?.bench || [];
  const victimPlayer = draft.players[victimPlayerId];
  const wasActive = victimActive.some(
    (c) => c.instanceId === victim.instanceId
  );
  const wasBench = victimBench.some((c) => c.instanceId === victim.instanceId);

  const victimZoneCards = wasActive
    ? victimActive
    : wasBench
      ? victimBench
      : [victim];

  if (victimPlayer && draft.turn?.player !== victimPlayerId) {
    // Typed "only if 1 of your {P} Pokémon was Knocked Out during your opponent's last
    // turn" Trainers (Morty, Diantha, Team Rocket's Archer) need who was Knocked Out.
    const top = topPokemonCard(victimZoneCards, victim) || victim;
    const koVictim = { name: top.name || '', types: [...(top.types || [])] };
    victimPlayer.flags = {
      ...victimPlayer.flags,
      koedOnOppTurn: true,
      koedOnOppTurnVictims: [...(victimPlayer.flags?.koedOnOppTurnVictims || []), koVictim],
    };
  }

  const attacker = draft.players[attackerPlayerId];
  const attackerActive = attacker?.zones?.active?.find((c) => !c.attachedTo);
  // On-KO Tool effects run before the discard sweep so Energy still attached to the
  // victim can be moved (Exp. Share, Energy Pouch, Rescue Scarf's return to hand).
  const koToolEffects = byAttack
    ? attachedToolOnKoEffects(victimPlayer, victim, {
        stadium: draft.stadium,
        isActive: wasActive,
        attacker: attackerActive ? inPlayView(draft, attackerActive) : null,
      })
    : [];
  const koToolOutcome = applyToolOnKoEffects(draft, {
    victimPlayerId,
    attackerPlayerId,
    victim,
    effects: koToolEffects,
    activeRng,
    events,
  });

  const victimView = inPlayView(draft, victim);
  const basePrizeCount = prizesForKO(victimView);
  // Legacy Energy: the once-per-game reduction may already be spent.
  const legacyEnergyAttached = victimZoneCards.some(
    (c) =>
      c.attachedTo === victim.instanceId &&
      isSpecialEnergyCard(c) &&
      hasOncePerGameSpecialEnergyEffect(c)
  );
  const legacyUsed = !!victimPlayer?.flags?.legacyPrizeReductionUsed;
  // Gift / Legacy / Splash read "Knocked Out by damage from an attack from your opponent's
  // Pokémon"; Rescue reads "by damage from an attack" (own recoil counts). Poison, Burn,
  // Ability counters and counters an attack places are not attack damage (audit SE12).
  const koByAttackDamage = byAttack && byDamage;
  const koByOpponentAttack = koByAttackDamage && draft.turn?.player !== victimPlayerId;
  let prizeCount = toolPrizeCountAdjust(
    victim,
    victimZoneCards,
    basePrizeCount,
    {
      stadium: draft.stadium,
      skipSpecialEnergy: legacyUsed || !koByOpponentAttack,
      holder: inPlayView(draft, victim),
      flags: {
        prizesRemaining: (victimPlayer?.zones?.prizes || []).length,
        trailingPrizes:
          (victimPlayer?.zones?.prizes || []).length >
          (draft.players[attackerPlayerId]?.zones?.prizes || []).length,
      },
    }
  );
  // Ability prize modifiers on the victim's side (Mega Gengar ex "that player
  // takes 1 fewer Prize card"), read from the whole side so a Benched holder
  // covers an Active victim.
  const attackerCard = (draft.players[attackerPlayerId]?.zones?.active || []).find(
    (c) => !c.attachedTo
  );
  prizeCount = Math.max(
    0,
    prizeCount +
      abilityPrizeModify(inPlayView(draft, victim), {
        sideCards: [...victimActive, ...victimBench],
        attackerIsEx: isExCard(attackerCard),
      })
  );
  if (legacyEnergyAttached && !legacyUsed && koByOpponentAttack) {
    if (!victimPlayer.flags) victimPlayer.flags = {};
    victimPlayer.flags.legacyPrizeReductionUsed = true;
  }

  // Billowing Smoke: the attacker discards the Prizes instead of taking them.
  if (koToolOutcome.discardPrizes) prizeCount = 0;

  // Attacker-side on-KO Prize clause (Beast Bringer): the Tool sits on the attacker,
  // so the victim-side scan above never sees it. The printed clause needs the
  // opponent's Active to be Knocked Out by the holder's own attack (I138).
  const koByHolderAttack =
    byAttack && wasActive && draft.turn?.player === attackerPlayerId;
  if (attackerActive && koByHolderAttack) {
    const attackerZone = attacker.zones.active || [];
    const attackerCtx = {
      holder: inPlayView(draft, attackerActive),
      defender: inPlayView(draft, victim),
      zoneCards: attackerZone,
      flags: { prizesRemaining: (attacker.zones.prizes || []).length },
    };
    for (const tool of attachedTools(attackerActive, attackerZone)) {
      const { delta, side } = parsePrizeModify(tool);
      if (side !== 'attacker') continue;
      // Sky Seal Stone's clause belongs to its Star Order VSTAR Power (I137).
      if (/vstar power/i.test(trainerEffectText(tool))) continue;
      if (!toolConditionMet(parseToolCondition(tool), attackerCtx)) continue;
      prizeCount = Math.max(0, prizeCount + delta);
    }
  }

  if (attacker?.flags?.briarActive) {
    const victimIsEx = isExCard(victim);
    if (victimIsEx && attackerActive && isTeraCard(attackerActive)) {
      prizeCount += 1;
    }
  }

  // Ribombee Plentiful Pollen: a `prizeBonus` marker on the victim pays its printed count
  // when the Knock Out happens inside the marker's next-turn window (design 036 A3). Like
  // every other marker read, only while the victim is still in its owner's Active Spot.
  const markerBonus = activeAttackMarkers(draft, victimPlayerId, victim)
    .filter((marker) => marker.kind === 'prizeBonus')
    .filter((marker) => prizeFilterMatches(marker.filter, prizeRuleBoxes(victimView)))
    .reduce((sum, marker) => sum + (marker.count || 0), 0);
  prizeCount += markerBonus;

  if (attacker) {
    if (!attacker.flags) attacker.flags = {};
    attacker.flags.prizesOwed = (attacker.flags.prizesOwed || 0) + prizeCount;
  }

  let targetZone = null;
  if (wasActive) {
    targetZone = victimActive;
  } else if (wasBench) {
    targetZone = victimBench;
  } else {
    const ref = findCard(draft, victim.instanceId);
    if (
      ref?.playerId === victimPlayerId &&
      draft.players[victimPlayerId]?.zones?.[ref.zoneId]
    ) {
      targetZone = draft.players[victimPlayerId].zones[ref.zoneId];
    }
  }

  // Lost City: the Knocked Out Pokémon itself is put in the Lost Zone instead
  // of the discard pile — attached cards are still discarded (card text).
  const lostCity = isStadiumLostCity(draft.stadium?.card || draft.stadium);
  const attackLostZone = draft.__attackLostZoneKnockouts === victimPlayerId;

  // Ability energy-move-on-KO: record the victim's Energy an Ability may move
  // before the stack below is discarded (target chosen/executed at the tail).
  captureOnKoEnergyMoves(draft, { victimPlayerId, victim, events });

  // Special-energy on-knockout triggers (Splash/Rescue return the Pokémon to
  // hand; Gift draws until 7). Attached cards still go to the discard pile.
  const koZoneRef = findCard(draft, victim.instanceId);
  const koSpecial = resolveSpecialEnergyKnockout(draft, {
    byAttackDamage: koByAttackDamage,
    byOpponentAttack: koByOpponentAttack,
    host: victim,
    hostTop: inPlayView(draft, victim),
    hostPlayerId: victimPlayerId,
    hostZoneId: koZoneRef?.zoneId || (wasActive ? 'active' : 'bench'),
  });

  if (targetZone) {
    for (let i = targetZone.length - 1; i >= 0; i--) {
      const c = targetZone[i];
      if (
        c.instanceId === victim.instanceId ||
        c.attachedTo === victim.instanceId
      ) {
        targetZone.splice(i, 1);
        c.damage = 0;
        clearConditions(c);
        clearAttackMarkers(c);
        c.attachedTo = null;
        if (attackLostZone) {
          if (!Array.isArray(victimPlayer.zones.lostZone)) victimPlayer.zones.lostZone = [];
          victimPlayer.zones.lostZone.push(c);
        } else if (lostCity && c.instanceId === victim.instanceId) {
          if (!Array.isArray(victimPlayer.zones.lostZone)) {
            victimPlayer.zones.lostZone = [];
          }
          victimPlayer.zones.lostZone.push(c);
        } else if (
          (koSpecial.returnToHand || koToolOutcome.returnToHand) &&
          c.instanceId === victim.instanceId
        ) {
          victimPlayer.zones.hand.push(c);
          events.push({
            type: 'cardMoved',
            instanceId: c.instanceId,
            from: koZoneRef?.zoneId || 'active',
            to: 'hand',
            playerId: victimPlayerId,
          });
        } else if (
          c.instanceId !== victim.instanceId &&
          isSpecialEnergyCard(c) &&
          resolveSpecialEnergyDiscard(draft, {
            energy: c,
            host: victim,
            hostTop: inPlayView(draft, victim),
            hostPlayerId: victimPlayerId,
            hostZoneId: koZoneRef?.zoneId || 'active',
            events,
          }) === 'hand'
        ) {
          // Recycle Energy attached to a KO'd Pokémon still returns to hand.
          victimPlayer.zones.hand.push(c);
          events.push({
            type: 'cardMoved',
            instanceId: c.instanceId,
            from: koZoneRef?.zoneId || 'active',
            to: 'hand',
            playerId: victimPlayerId,
          });
        } else {
          // Prism Star cards go to the Lost Zone instead of discard (App. 17).
          discardCardToPlayerZone(victimPlayer, c);
        }
      }
    }
  }

  if (koSpecial.drawUntil > 0) {
    const hand = victimPlayer.zones.hand;
    const need = Math.max(0, koSpecial.drawUntil - hand.length);
    if (need > 0) {
      const drawn = victimPlayer.zones.deck.splice(0, Math.min(need, victimPlayer.zones.deck.length));
      hand.push(...drawn);
      if (drawn.length) {
        events.push({
          type: 'cardsDrawn',
          count: drawn.length,
          playerId: victimPlayerId,
          cards: drawn.map((c) => c.instanceId),
        });
      }
    }
  }

  events.push({
    type: 'pokemonKnockedOut',
    instanceId: victim.instanceId,
    playerId: victimPlayerId,
    attackerPlayerId,
    prizeCount,
    ruleBoxes: prizeRuleBoxes(victimView),
  });

  // Promotion of a new Active is NOT done here. `settlePromotionChoices` runs at the
  // end of every command: a single Benched Pokémon is promoted automatically, while 2+
  // raise a `PendingChoice` so the KO'd player clicks which one promotes (server
  // authority parity with the legacy mat picker, design 017 / PR #178). Deferring it to
  // the command tail keeps the promotion from being overwritten by the attack's own
  // search/snipe choice, which also uses `state.pendingChoice`.

  // A batch of Knock Outs (the sweep below) defers the win check so one evaluation
  // sees every KO of the batch; a lone Knock Out settles here.
  if (!deferWin) settleKnockOutWins(draft, { events });

  // A Knockout of the Active leaves the Active Spot empty; `settlePromotionChoices`
  // promotes at the command tail (auto for one Benched Pokémon, mat-pick choice for 2+).
  // Marked here rather than inferred from an empty Active later, so unrelated commands
  // that merely see an empty Active never trigger a promotion.
  if (wasActive && !isGameConcluded(draft) && victimPlayer) {
    const benchRoots = victimBench.filter(
      (c) => !c.attachedTo && isPokemon(c)
    );
    if (benchRoots.length > 0) victimPlayer.promotionPending = true;
  }
}

/**
 * Moves one Benched Pokémon (and every card attached to it) into the empty Active Spot
 * and emits `pokemonPromoted`. Shared by the direct `promote` command, the promotion
 * PendingChoice resume, and the automatic single-bench promotion below. Returns false
 * (emitting nothing) when the id is not a face-up Benched Pokémon root.
 */
function promoteBenchToActive(draft, { playerId, instanceId, events }) {
  const player = draft.players?.[playerId];
  const bench = player?.zones?.bench;
  const active = player?.zones?.active;
  if (!Array.isArray(bench) || !Array.isArray(active)) return false;
  const isRoot = bench.some(
    (c) => c.instanceId === instanceId && !c.attachedTo
  );
  if (!isRoot) return false;

  for (let i = bench.length - 1; i >= 0; i--) {
    const c = bench[i];
    if (c.instanceId === instanceId || c.attachedTo === instanceId) {
      bench.splice(i, 1);
      active.push(c);
    }
  }
  const promoted = active.find((c) => c.instanceId === instanceId);
  if (promoted) promoted.movedToActiveTurn = Math.max(1, Number(draft.turn?.number) || 1);
  events.push({ type: 'pokemonPromoted', instanceId, playerId });
  return true;
}

/**
 * Fills an Active Spot left empty by a Knockout at the end of a command. A single
 * Benched Pokémon promotes automatically; 2+ raise a PendingChoice so the KO'd player
 * chooses (the mat picker renders it, design 017 / D19). `handleKnockout` marks the
 * KO'd player with `promotionPending`, so this never fires for the many test/edge states
 * that merely have an empty Active with a populated Bench. Deferred to the command tail
 * so it never fights an attack's search/snipe choice for `state.pendingChoice`, and so
 * the turn has already advanced before the choice blocks all further commands.
 */
function settlePromotionChoices(draft, { events }) {
  if (isGameConcluded(draft)) return;
  if (draft.pendingChoice) return;

  for (const playerId of Object.keys(draft.players || {})) {
    const player = draft.players[playerId];
    if (!player?.promotionPending) continue;

    const active = (player.zones?.active || []).filter((c) => !c.attachedTo);
    const bench = (player.zones?.bench || []).filter(
      (c) => !c.attachedTo && isPokemon(c)
    );
    delete player.promotionPending;

    // A promotion is only ever expected with an empty Active and a legal candidate;
    // if either no longer holds (the game moved the card itself), drop the marker.
    if (active.length > 0 || bench.length === 0) continue;

    if (bench.length === 1) {
      promoteBenchToActive(draft, {
        playerId,
        instanceId: bench[0].instanceId,
        events,
      });
      continue;
    }

    draft.pendingChoice = createPendingChoice({
      player: playerId,
      source: 'promote',
      prompt:
        'Your Active Pokémon was Knocked Out — choose a Benched Pokémon to promote',
      options: bench,
      min: 1,
      max: 1,
      cancellable: false,
      resumeToken: { effectType: 'promote', initiatorPlayerId: playerId },
    });
    events.push({ type: 'promotionChoiceRequested', playerId });
    return;
  }
}

/**
 * Stamps `movedToActiveTurn` on every card that entered a player's Active Spot
 * during this command, and clears it from every card that left (design 034
 * slice 4b on-promotion window). Diffing the pre/post Active zones here covers
 * every bench→active site — manual move, KO promotion, Switch/Boss's Orders
 * attack and trainer steps — without threading a stamp through each effect
 * module. The whole stack (root plus attached Evolutions/Tools) is stamped so
 * the activation gate reads the stamp off whichever card the client addresses.
 */
function stampActivePromotions(prev, next) {
  const turnNumber = next.turn?.number;
  if (turnNumber == null) return;
  for (const playerId of Object.keys(next.players || {})) {
    const prevActive = prev.players?.[playerId]?.zones?.active || [];
    const nextActive = next.players?.[playerId]?.zones?.active || [];
    const prevIds = new Set(prevActive.map((c) => c.instanceId));
    const nextIds = new Set(nextActive.map((c) => c.instanceId));
    for (const card of nextActive) {
      if (!prevIds.has(card.instanceId)) card.movedToActiveTurn = turnNumber;
    }
    for (const card of prevActive) {
      if (nextIds.has(card.instanceId)) continue;
      const moved = findCard(next, card.instanceId)?.card;
      if (moved) delete moved.movedToActiveTurn;
    }
  }
}

/**
 * Energy-move-on-KO abilities (Miraidon Photon Cord, Raichu Electrical Grounding,
 * Veluza Fillet Memento; design 034 slice 4b). The victim's Energy is discarded
 * with the rest of its stack, so this records which cards an Ability may pull
 * back out of the discard once a target is known; `settleKoEnergyMoves` runs at
 * the command tail. Obligations live on the draft (not player flags) so
 * `advanceTurn`'s wholesale flag rebuild cannot drop them, and they ride the
 * `pendingChoice` resume token when a target must be chosen.
 */
function captureOnKoEnergyMoves(draft, { victimPlayerId, victim, events }) {
  const player = draft.players?.[victimPlayerId];
  if (!player) return;
  const entries = inPlayEntries(draft).filter(
    (e) => e.playerId === victimPlayerId
  );
  const abilities = parseOnKoAbilities(
    entries,
    abilitySideContext(draft, victimPlayerId)
  );
  const zoneCards = [
    ...(player.zones?.active || []),
    ...(player.zones?.bench || []),
  ];
  const obligations = [];
  for (const ab of abilities) {
    // "If this Pokémon … is Knocked Out" only fires for the victim itself;
    // "move … to this Pokémon" can't target a holder that just left play.
    if (ab.selfSource) {
      if (ab.holder !== victim) continue;
    } else if (ab.holder === victim) {
      continue;
    }
    let energy = zoneCards.filter(
      (c) => c.attachedTo === victim.instanceId && isEnergy(c)
    );
    if (ab.basic) energy = energy.filter((c) => isBasicEnergy(c));
    if (ab.energyType) {
      energy = energy.filter((c) => energyMatchesType(c, ab.energyType));
    }
    if (energy.length === 0) continue;
    obligations.push({
      playerId: victimPlayerId,
      holderInstanceId: ab.holder.instanceId,
      targetKind: ab.targetKind,
      energyIds: energy.map((c) => c.instanceId),
      upTo: ab.upTo || 1,
      source: ab.source,
    });
    events.push({
      type: 'koEnergyMoveRequested',
      playerId: victimPlayerId,
      source: ab.source,
      holderInstanceId: ab.holder.instanceId,
    });
  }
  if (obligations.length > 0) {
    draft.__koEnergyMoves = [...(draft.__koEnergyMoves || []), ...obligations];
  }
}

function energyMatchesType(card, typeName) {
  const want = String(typeName || '').toLowerCase();
  const types = [card.energyType, ...(Array.isArray(card.types) ? card.types : [])]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());
  if (types.some((t) => t === want || (want === 'darkness' && t === 'dark'))) {
    return true;
  }
  // Basic Energy rows sometimes carry no `types`; the printed name is then the
  // only signal ("Water Energy").
  return (
    typeof card.name === 'string' &&
    new RegExp(`\\b${want}\\b`, 'i').test(card.name)
  );
}

function koEnergyTargets(player, obligation) {
  const bench = (player.zones?.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
  if (obligation.targetKind === 'holder') {
    const holder = [
      ...(player.zones?.active || []),
      ...bench,
    ].find(
      (c) => !c.attachedTo && c.instanceId === obligation.holderInstanceId
    );
    return holder ? [holder] : [];
  }
  return bench.filter((c) => c.instanceId !== obligation.holderInstanceId);
}

function moveKoEnergy(player, target, obligation, events) {
  const discard = player.zones?.discard || [];
  let moved = 0;
  for (const id of obligation.energyIds) {
    if (moved >= obligation.upTo) break;
    const card = discard.find((c) => c.instanceId === id);
    if (!card) continue;
    attachToRoot(player, card, target, events);
    moved += 1;
  }
  return moved;
}

function settleKoEnergyMoves(draft, { events }) {
  if (draft.pendingChoice) return;
  const pending = draft.__koEnergyMoves;
  if (!Array.isArray(pending) || pending.length === 0) {
    delete draft.__koEnergyMoves;
    return;
  }
  const remaining = [...pending];
  while (remaining.length > 0) {
    const obligation = remaining[0];
    const player = draft.players?.[obligation.playerId];
    const energyLeft = (player?.zones?.discard || []).some((c) =>
      obligation.energyIds.includes(c.instanceId)
    );
    if (!player || !energyLeft) {
      remaining.shift();
      continue;
    }
    const targets = koEnergyTargets(player, obligation);
    if (targets.length === 0) {
      remaining.shift();
      continue;
    }
    if (targets.length > 1) {
      delete draft.__koEnergyMoves;
      draft.pendingChoice = createPendingChoice({
        player: obligation.playerId,
        source: obligation.source,
        prompt: `${obligation.source}: choose a Benched Pokémon to move the Energy to`,
        options: targets,
        min: 1,
        max: 1,
        cancellable: false,
        stateVersion: draft.stateVersion,
        resumeToken: {
          effectType: 'koEnergy',
          initiatorPlayerId: obligation.playerId,
          obligations: remaining,
        },
      });
      return;
    }
    moveKoEnergy(player, targets[0], obligation, events);
    remaining.shift();
  }
  delete draft.__koEnergyMoves;
}

/**
 * Resolves Pokémon Checkup between turns, applying every condition the Active holds
 * in this order, then checking for a Knockout once:
 * - Poison: 10 damage
 * - Burn: 20 damage + 50% cure flip
 * - Asleep: 50% cure flip
 * - Paralyzed: cured at the end of the paralyzed player's turn
 */
/**
 * "Between turns" Stadium damage (Shrine of Punishment, Cursed Stone, Desert
 * Ruins). Applies to every in-play Pokémon that matches the card's filter,
 * on both sides, then resolves any Knockouts (prizes go to the non-victim).
 */
function applyBetweenTurnsStadiumDamage(draft, { events }) {
  const card = draft.stadium?.card || draft.stadium;
  if (!card || isGameConcluded(draft)) return;
  const playerIds = Object.keys(draft.players || {});
  for (const pid of playerIds) {
    const player = draft.players[pid];
    for (const zone of [player.zones?.active, player.zones?.bench]) {
      if (!Array.isArray(zone)) continue;
      for (const mon of [...zone]) {
        if (mon.attachedTo) continue;
        const dmg = stadiumBetweenTurnsDamageFor(mon, card);
        if (dmg <= 0) continue;
        mon.damage = (mon.damage || 0) + dmg;
        events.push({
          type: 'stadiumBetweenTurnsDamage',
          instanceId: mon.instanceId,
          playerId: pid,
          damage: dmg,
        });
      }
    }
  }
  // Every lethal Pokémon is Knocked Out first and the win is judged once (I78): a double KO
  // is a tiebreak, not a win for whichever side the loop reached first.
  let knockedOut = false;
  for (const pid of playerIds) {
    const player = draft.players[pid];
    const oppId = playerIds.find((id) => id !== pid);
    for (const zone of [player.zones?.active, player.zones?.bench]) {
      if (!Array.isArray(zone)) continue;
      for (const mon of [...zone]) {
        if (mon.attachedTo) continue;
        const hp = cardEffectiveHp(draft, mon, pid);
        if (hp && (mon.damage || 0) >= hp) {
          handleKnockout(draft, {
            victimPlayerId: pid,
            attackerPlayerId: oppId,
            victim: mon,
            events,
            deferWin: true,
          });
          knockedOut = true;
        }
      }
    }
  }
  if (knockedOut) settleKnockOutWins(draft, { events });
}

// "At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out."
// The marker is live only on that turn, and only while the Pokémon is still Active and
// unevolved, so a switched-out or evolved target is spared.
function resolveDeferredKnockouts(draft, { events }) {
  for (const pid of Object.keys(draft.players || {})) {
    const active = draft.players[pid].zones?.active?.find((c) => !c.attachedTo);
    const marker = activeAttackMarkers(draft, pid, active).find((m) => m.kind === 'deferredKnockOut');
    if (!marker || marker.untilTurn !== draft.turn?.number) continue;
    events.push({ type: 'deferredKnockOut', instanceId: active.instanceId, playerId: pid, sourceAttack: marker.sourceAttack });
    handleKnockout(draft, {
      victimPlayerId: pid,
      attackerPlayerId: Object.keys(draft.players).find((id) => id !== pid),
      victim: active,
      events,
    });
  }
}

// TM/Cube Items (design 035 slice 7): "At the end of your turn, discard <tool>."
// The sweep runs for the player whose turn is ending, after Pokémon Checkup.
function discardEndOfTurnTools(draft, { endingPlayerId, events }) {
  const player = draft.players?.[endingPlayerId];
  if (!player) return;
  for (const zoneId of ['active', 'bench']) {
    const zone = player.zones?.[zoneId] || [];
    for (const card of [...zone]) {
      if (!card.attachedTo || !card.discardAtEndOfTurn) continue;
      zone.splice(zone.indexOf(card), 1);
      card.attachedTo = null;
      delete card.discardAtEndOfTurn;
      const to = discardCardToPlayerZone(player, card);
      events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: zoneId,
        to,
        playerId: player.playerId,
      });
    }
  }
}

/**
 * Pokémon Checkup damage from abilities (design 034 slice 4): Froslass, Magmortar,
 * Pecharunt, Team Rocket's Tyranitar, Trevenant. Applied after the per-condition
 * Checkup damage and before between-turns Stadium damage, with a Knockout sweep.
 */
function applyCheckupAbilities(draft, { events, ctx }) {
  const effects = parseCheckupAbilities(inPlayEntries(draft), ctx);
  const affected = [];
  for (const effect of effects) {
    for (const target of effect.targets) {
      const damage = effect.count * 10;
      target.card.damage = (target.card.damage || 0) + damage;
      events.push({
        type: 'checkupAbilityDamage',
        source: effect.source,
        instanceId: target.card.instanceId,
        playerId: target.playerId,
        damage,
      });
      affected.push(target);
    }
  }
  for (const { card, playerId } of affected) {
    if (isGameConcluded(draft)) break;
    const hp = cardEffectiveHp(draft, card, playerId);
    if (hp > 0 && (card.damage || 0) >= hp) {
      handleKnockout(draft, {
        victimPlayerId: playerId,
        attackerPlayerId: Object.keys(draft.players || {}).find(
          (id) => id !== playerId
        ),
        victim: card,
        events,
      });
    }
  }
}

/**
 * Mandatory end-of-turn ability effects (Great Tusk ex Quaking Demolition:
 * discard the top 5 cards of your deck while it is in the Active Spot). Optional
 * end-of-turn abilities are activated through useAbility instead.
 */
function applyEndOfTurnAbilities(draft, { events, ctx, endingPlayerId }) {
  if (!endingPlayerId) return;
  const entries = inPlayEntries(draft).filter(
    (entry) => entry.playerId === endingPlayerId
  );
  const effects = parseEndOfTurnAbilities(entries, ctx);
  for (const effect of effects) {
    if (effect.kind !== 'discardTop' || !(effect.n > 0)) continue;
    const player = draft.players[effect.playerId];
    const deck = player?.zones?.deck || [];
    const count = Math.min(effect.n, deck.length);
    const discarded = deck.splice(0, count);
    for (const card of discarded) discardCardToPlayerZone(player, card);
    events.push({
      type: 'cardsDiscarded',
      playerId: effect.playerId,
      count,
      source: effect.source,
      cards: discarded.map((c) => c.instanceId),
    });
  }
}

/**
 * "Whenever your opponent plays a Pokémon from their hand to evolve 1 of their
 * Pokémon, put N damage counters on that Pokémon" (Team Rocket's Ampharos Darkest
 * Impulse). Fires after the evolve lands, before any turn-end check.
 */
function applyOnOpponentEvolve(draft, { evolvedCard, evolvingPlayerId, events }) {
  const entries = inPlayEntries(draft).filter(
    (entry) => entry.playerId !== evolvingPlayerId
  );
  const ctx = abilitySideContext(draft, evolvingPlayerId);
  const effects = parseOnOpponentEvolveAbilities(entries, ctx);
  if (effects.length === 0) return;
  for (const effect of effects) {
    const damage = effect.count * 10;
    evolvedCard.damage = (evolvedCard.damage || 0) + damage;
    events.push({
      type: 'damageUpdated',
      instanceId: evolvedCard.instanceId,
      damage: evolvedCard.damage,
      dealt: damage,
      reason: 'onOpponentEvolve',
      source: effect.source,
    });
  }
  const hp = cardEffectiveHp(draft, evolvedCard, evolvingPlayerId);
  if (hp > 0 && (evolvedCard.damage || 0) >= hp) {
    handleKnockout(draft, {
      victimPlayerId: evolvingPlayerId,
      attackerPlayerId: Object.keys(draft.players || {}).find(
        (id) => id !== evolvingPlayerId
      ),
      victim: evolvedCard,
      events,
    });
  }
}

function resolveCheckup(
  draft,
  { rng, events, endingPlayerId = draft.turn?.player }
) {
  resolveDeferredKnockouts(draft, { events });
  // A condition landed this command (the attack that ended the turn) on a Pokémon whose
  // special Energy makes it immune never reaches Checkup.
  applySpecialEnergyStatusImmunity(draft, { events });
  const triggerCtx = abilitySideContext(draft, endingPlayerId);

  for (const pid of Object.keys(draft.players || {})) {
    const player = draft.players[pid];
    const active = player.zones?.active?.find((c) => !c.attachedTo);
    if (!active || !hasAnyCondition(active)) continue;

    // Every condition resolves, in rules order, and the Knockout check runs once after
    // all Checkup damage (audit A-1: this used to be an else-if chain over one string).
    const flip = () => ((rng ? rng.next() : 0.5) < 0.5 ? 'heads' : 'tails');
    const cleared = (condition) => {
      removeCondition(active, condition);
      events.push({
        type: 'statusCleared',
        condition,
        instanceId: active.instanceId,
        playerId: pid,
      });
    };
    const checkupDamage = (condition, damage) => {
      active.damage = (active.damage || 0) + damage;
      events.push({
        type: 'checkupDamage',
        instanceId: active.instanceId,
        condition,
        damage,
        playerId: pid,
      });
    };

    const checkupStadium = draft.stadium?.card || draft.stadium;
    if (hasCondition(active, 'Poisoned')) {
      checkupDamage('Poisoned', 10);
    }
    if (hasCondition(active, 'Burned')) {
      checkupDamage('Burned', 20);
      // Wela Volcano Park: the Burned flip happens but can't remove the condition.
      const burnedMods = stadiumCheckupCoinModifiers(checkupStadium, { condition: 'Burned' });
      if (flip() === 'heads' && !burnedMods?.burnedPersists) cleared('Burned');
    }
    if (hasCondition(active, 'Asleep')) {
      // Slumbering Forest: 2 coins instead of 1; either tails keeps it Asleep.
      const asleepMods = stadiumCheckupCoinModifiers(checkupStadium, { condition: 'Asleep' });
      const asleepFlips = asleepMods?.asleepFlips ?? 1;
      let asleepHeads = 0;
      for (let i = 0; i < asleepFlips; i++) {
        if (flip() === 'heads') asleepHeads++;
      }
      if (asleepHeads === asleepFlips) cleared('Asleep');
    }
    // Under official Pokémon TCG rules, Paralysis is only cured at the end of that player's turn.
    if (
      hasCondition(active, 'Paralyzed') &&
      (!endingPlayerId || pid === endingPlayerId)
    ) {
      cleared('Paralyzed');
    }

    const activeHp = cardEffectiveHp(draft, active, pid);
    if (activeHp && active.damage >= activeHp) {
      const oppId = Object.keys(draft.players).find((id) => id !== pid);
      handleKnockout(draft, {
        victimPlayerId: pid,
        attackerPlayerId: oppId,
        victim: active,
        events,
      });
    }
  }

  // Pokémon Checkup abilities resolve after the conditions and before the
  // between-turns Stadium damage (design 034 slice 4).
  applyCheckupAbilities(draft, { events, ctx: triggerCtx });

  // Between-turns Stadium damage resolves after Pokémon Checkup.
  applyBetweenTurnsStadiumDamage(draft, { events });

  // End-of-turn special-energy effects (legacy Darkness Energy): "at the end of
  // every turn" applies to both players' in-play Pokémon.
  runEndOfTurnSpecialEnergies(draft, { events });
  discardEndOfTurnSpecialEnergies(draft, { endingPlayerId, events });

  // "At the end of your turn, discard …" Tools (TM/Cube Items).
  discardEndOfTurnTools(draft, { endingPlayerId, events });

  // Mandatory end-of-turn ability effects (Great Tusk ex Quaking Demolition).
  applyEndOfTurnAbilities(draft, { events, ctx: triggerCtx, endingPlayerId });
}

/**
 * Collects a player's outstanding prize entitlement (flags.prizesOwed, granted by
 * handleKnockout) into their hand, so a Knockout can never leave prizes stranded.
 * takePrizes is the only other consumer of the entitlement, and it can only redeem
 * what handleKnockout granted — never prizes the game did not award. Win conditions
 * are not evaluated here; handleKnockout owns that check.
 */
function collectPrizeEntitlement(draft, { playerId, events }) {
  const player = draft.players?.[playerId];
  const owed = player?.flags?.prizesOwed || 0;
  if (owed <= 0) return;

  const prizes = player.zones.prizes;
  const actualCount = Math.min(owed, prizes.length);
  const taken = prizes.splice(0, actualCount);
  player.zones.hand.push(...taken);
  // Drop the key rather than leaving a zeroed one behind, so a fully settled state
  // is byte-identical to one that never saw a Knockout (views and the state hash
  // both carry player.flags verbatim).
  if (owed - actualCount > 0) {
    player.flags.prizesOwed = owed - actualCount;
  } else {
    delete player.flags.prizesOwed;
  }

  events.push({
    type: 'prizesTaken',
    playerId,
    count: actualCount,
    cards: taken.map((c) => ({ instanceId: c.instanceId })),
  });
  if (prizes.length > 0) {
    offerPrizeToBench(draft, { playerId, taken });
    offerPrizeAttach(draft, { playerId, taken });
  }
}

/** Runs the Ability triggers of an Energy attached from the hand (`parseOnEnergyAttachAbilities`). */
function applyEnergyAttachTriggers(draft, { host, energy, playerId, events }) {
  const effects = parseOnEnergyAttachAbilities(host, energy, abilitySideContext(draft, playerId));
  for (const { target, recover, heal, source } of effects) {
    if (recover) {
      for (const condition of listConditions(target)) {
        removeCondition(target, condition);
        events.push({ type: 'statusCleared', condition, instanceId: target.instanceId, playerId, source });
      }
    }
    const before = target.damage || 0;
    if (heal > 0 && before > 0) {
      target.damage = Math.max(0, before - heal);
      events.push({
        type: 'damageUpdated',
        instanceId: target.instanceId,
        damage: target.damage,
        healed: before - target.damage,
        source,
      });
    }
  }
}

function conditionsUpdatedEvent(card, condition) {
  return {
    type: 'specialConditionUpdated',
    instanceId: card.instanceId,
    condition,
    conditions: listConditions(card),
  };
}

function consumePrizeEntitlement(player, count) {
  if (!player.flags?.prizesOwed) return;
  const remainingOwed = Math.max(0, player.flags.prizesOwed - count);
  if (remainingOwed > 0) player.flags.prizesOwed = remainingOwed;
  else delete player.flags.prizesOwed;
}

/**
 * Design 012: `faceDown` only means something on the board. Every path that takes a card off
 * the board (moves, mass discards, shuffles, undo replay) would otherwise have to clear it, and
 * a missed one would hide the card again the next time it lands on the board — so the flag is
 * swept once, after every command.
 */
function clearFaceDownOffBoard(draft) {
  if (draft.stadium?.faceDown) delete draft.stadium.faceDown;
  for (const player of Object.values(draft.players || {})) {
    for (const [zoneId, zone] of Object.entries(player.zones || {})) {
      if (zoneId === 'board' || !Array.isArray(zone)) continue;
      for (const card of zone) {
        if (card?.faceDown) delete card.faceDown;
      }
    }
  }
}

function isZoneIndex(index, zone) {
  return Number.isInteger(index) && index >= 0 && index < zone.length;
}

const PRIZE_CHOICE_EFFECT = 'prizes';

/**
 * Settles prize entitlements once a command has finished. While the game is still
 * running, the first player owed prizes gets a pendingChoice over their face-down prize
 * cards (the whole game waits on it, like TCG Live); a second owed player gets theirs
 * after the first resolves. Once the game has ended nobody is left to wait for, so
 * everything owed is collected directly.
 */
function settlePrizeEntitlements(draft, { events }) {
  const owedPlayerIds = Object.keys(draft.players || {}).filter(
    (pid) => (draft.players[pid].flags?.prizesOwed || 0) > 0
  );
  if (owedPlayerIds.length === 0) return;

  // The tiebreaker is a fresh race; the original match's entitlements are void.
  if (draft.turn?.phase === 'tiebreak') return;

  if (draft.turn?.phase === 'ended') {
    for (const pid of owedPlayerIds)
      collectPrizeEntitlement(draft, { playerId: pid, events });
    return;
  }
  if (draft.pendingChoice) return;

  const playerId = owedPlayerIds[0];
  const player = draft.players[playerId];
  const prizes = player.zones.prizes || [];
  const count = Math.min(player.flags.prizesOwed, prizes.length);
  if (count === prizes.length) {
    // Every remaining prize is owed: there is nothing to choose between.
    collectPrizeEntitlement(draft, { playerId, events });
    // A grant can exceed the Prize cards left (extra-Prize clauses, "take N Prize cards");
    // the surplus has nothing left to redeem, and keeping it would spin the recursion on an
    // emptied zone. Collecting every remaining prize also ends the game, like the picker.
    if (player.flags?.prizesOwed) delete player.flags.prizesOwed;
    if (player.zones.prizes.length === 0) {
      setGameEnded(draft, {
        winner: playerId,
        reason: 'all prize cards taken',
        events,
      });
    }
    settlePrizeEntitlements(draft, { events });
    return;
  }

  draft.pendingChoice = createPendingChoice({
    choiceId: `choice_${playerId}_prizes_${(draft.stateVersion || 0) + 1}`,
    player: playerId,
    prompt: count === 1 ? 'Choose a Prize card' : `Choose ${count} Prize cards`,
    source: 'Prize cards',
    // Identity only: prizes are face down, so the chooser never sees names or art.
    options: prizes.map((card) => ({ instanceId: card.instanceId })),
    min: count,
    max: count,
    stateVersion: draft.stateVersion || 0,
    resumeToken: {
      effectType: PRIZE_CHOICE_EFFECT,
      initiatorPlayerId: playerId,
    },
  });
  events.push({ type: 'prizeChoiceRequested', playerId, count });
}

/**
 * Resolves lethal damage placed by `damageCounters` (trainer steps and abilities
 * such as Mega Greninja ex's Mortal Shuriken). The counter handler in
 * effects/trainer-steps.mjs can't call handleKnockout (reduce.mjs imports it —
 * importing back would be circular), so it emits `damageCountersPlaced` and the
 * reducer sweeps them here. Mirrors the counter KO check in
 * applyFlatDamageToTarget, and runs after the whole effect so multi-step
 * placement has settled.
 */
function resolveDamageCounterKnockouts(draft, { events }) {
  const placed = events.filter(
    (e) => e.type === 'damageCountersPlaced' || e.type === 'knockOutMarked'
  );
  if (placed.length === 0) return;

  const koed = new Set();
  let knockedOut = false;
  for (const e of placed) {
    if (koed.has(e.instanceId)) continue;
    const ref = findCard(draft, e.instanceId);
    if (!ref || (ref.zoneId !== 'active' && ref.zoneId !== 'bench')) continue;
    const victim = ref.card;
    const koHp = cardEffectiveHp(draft, victim, ref.playerId);
    // "… is Knocked Out." (attack-steps atkKnockOut) knocks out regardless of HP.
    if (e.type === 'knockOutMarked' || (koHp > 0 && (victim.damage || 0) >= koHp)) {
      koed.add(e.instanceId);
      knockedOut = true;
      handleKnockout(draft, {
        victimPlayerId: ref.playerId,
        // A marker without an explicit beneficiary (self-inflicted damage)
        // awards the KO to the victim's opponent, so prizes are never skipped.
        attackerPlayerId:
          e.attackerPlayerId ||
          Object.keys(draft.players || {}).find((id) => id !== ref.playerId),
        victim,
        events,
        // Both Active Pokémon can be Knocked Out at once (Destined Fight): the win check
        // runs once for the whole batch so a two-KO tiebreak is not overwritten by the
        // second KO's lone comparison.
        deferWin: true,
      });
    }
  }
  if (knockedOut) settleKnockOutWins(draft, { events });

  // Internal marker events are not part of the client-facing stream.
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'damageCountersPlaced' || events[i].type === 'knockOutMarked') {
      events.splice(i, 1);
    }
  }
}

function resolvePrizeChoice(draft, { playerId, selection, events }) {
  const player = draft.players[playerId];
  const prizes = player.zones.prizes;
  const chosenIds = new Set(selection);
  const taken = prizes.filter((card) => chosenIds.has(card.instanceId));
  player.zones.prizes = prizes.filter(
    (card) => !chosenIds.has(card.instanceId)
  );
  player.zones.hand.push(...taken);
  consumePrizeEntitlement(player, taken.length);
  draft.pendingChoice = null;

  events.push({
    type: 'prizesTaken',
    playerId,
    count: taken.length,
    cards: taken.map((c) => ({ instanceId: c.instanceId })),
  });

  if (player.zones.prizes.length === 0) {
    setGameEnded(draft, {
      winner: playerId,
      reason: 'all prize cards taken',
      events,
    });
    return;
  }
  offerPrizeToBench(draft, { playerId, taken });
  offerPrizeAttach(draft, { playerId, taken });
}

const PRIZE_BENCH_EFFECT = 'prizeBench';

/**
 * Jirachi Prism Star / Chansey Lucky Bonus (design 034 slice 6): a Prize just taken during
 * its owner's turn may go onto the Bench instead of the hand. Raises a yes/no choice for the
 * first such card; `resumePrizeToBench` applies it.
 */
function offerPrizeToBench(draft, { playerId, taken }) {
  if (draft.pendingChoice || draft.turn?.player !== playerId || isGameConcluded(draft)) return;
  const player = draft.players[playerId];
  if (rootsIn(player.zones.bench).length >= 5) return;
  const card = taken.find(
    (c) => player.zones.hand.includes(c) && isPokemon(c) && abilityPrizeToBench(c)
  );
  if (!card) return;
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: card.name || 'Ability',
    prompt: `${card.name}: put it onto your Bench instead of into your hand?`,
    options: [
      { instanceId: 1, name: 'Put it onto your Bench', type: 'option' },
      { instanceId: 2, name: 'Keep it in your hand', type: 'option' },
    ],
    min: 1,
    max: 1,
    resumeToken: { effectType: PRIZE_BENCH_EFFECT, initiatorPlayerId: playerId, cardId: card.instanceId },
  });
}

const PRIZE_ATTACH_EFFECT = 'prizeAttach';
const CALL_ENERGY_EFFECT = 'callEnergy';

// Call Energy (I169): "Once during your turn, if the Pokémon Call Energy is attached to is your
// Active Pokémon, you may search your deck for up to 2 Basic Pokémon and put them onto your
// Bench. If you do, shuffle your deck and your turn ends." Activated through useAbility on
// the Energy card itself.
function callEnergyStep(card) {
  if (!card || !isSpecialEnergyCard(card)) return null;
  return parseSpecialEnergyEffects(card)?.steps.find((step) => step.type === 'activatedSearch') || null;
}

function callEnergyBlockReason(state, cardRef, playerId) {
  const step = callEnergyStep(cardRef.card);
  const player = state.players?.[playerId];
  if (state.turn?.player !== playerId) return "It isn't your turn.";
  if (cardRef.playerId !== playerId || cardRef.card.attachedTo == null) return 'This Energy is not attached to your Pokémon.';
  if (step.requiresActive && cardRef.zoneId !== 'active') return 'The Pokémon it is attached to must be your Active Pokémon.';
  if (step.oncePerTurn && player?.flags?.abilitiesUsed?.[cardRef.card.instanceId]) return 'Already used this turn.';
  if (rootsIn(player?.zones?.bench || []).length >= 5) return 'Your Bench is full.';
  return null;
}

function startCallEnergy(draft, { cardRef, playerId, activeRng, events }) {
  const step = callEnergyStep(cardRef.card);
  const player = draft.players[playerId];
  if (!player.flags) player.flags = {};
  player.flags.abilitiesUsed = { ...(player.flags.abilitiesUsed || {}), [cardRef.card.instanceId]: true };
  events.push({ type: 'abilityUsed', instanceId: cardRef.card.instanceId, name: cardRef.card.name, playerId });
  const room = 5 - rootsIn(player.zones.bench).length;
  const options = (player.zones.deck || []).filter((c) => isBasicPokemon(c));
  const max = Math.min(step.count || 1, room, options.length);
  if (max <= 0) {
    finishCallEnergy(draft, { playerId, activeRng, events });
    return;
  }
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: cardRef.card.name,
    prompt: `${cardRef.card.name}: put up to ${max} Basic Pokémon onto your Bench`,
    options,
    min: 0,
    max,
    resumeToken: { effectType: CALL_ENERGY_EFFECT, initiatorPlayerId: playerId, max },
  });
}

function resumeCallEnergy(draft, { token, selection, activeRng, events }) {
  draft.pendingChoice = null;
  const playerId = token.initiatorPlayerId;
  const player = draft.players[playerId];
  const picked = (selection || []).slice(0, token.max);
  for (const id of picked) {
    const card = player.zones.deck.find((c) => c.instanceId === Number(id));
    if (!card || !isBasicPokemon(card) || rootsIn(player.zones.bench).length >= 5) continue;
    player.zones.deck.splice(player.zones.deck.indexOf(card), 1);
    card.enteredPlayTurn = draft.turn?.number ?? null;
    player.zones.bench.push(card);
    events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'deck', to: 'bench', playerId });
  }
  finishCallEnergy(draft, { playerId, activeRng, events });
}

function finishCallEnergy(draft, { playerId, activeRng, events }) {
  if (activeRng) shuffleInPlace(activeRng, draft.players[playerId].zones.deck);
  events.push({ type: 'deckShuffled', playerId });
  endTurnFromEffect(draft, { playerId, activeRng, events });
}

// Treasure Energy (I172): "If you took this card as a face-down Prize card during your turn,
// before you put it into your hand, you may attach this card to 1 of your Pokémon."
function offerPrizeAttach(draft, { playerId, taken }) {
  if (draft.pendingChoice || draft.turn?.player !== playerId || isGameConcluded(draft)) return;
  const player = draft.players[playerId];
  const card = taken.find(
    (c) =>
      player.zones.hand.includes(c) &&
      parseSpecialEnergyEffects(c)?.steps.some((step) => step.type === 'attachFromPrize')
  );
  const hosts = [...rootsIn(player.zones.active), ...rootsIn(player.zones.bench)];
  if (!card || hosts.length === 0) return;
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: card.name || 'Energy',
    prompt: `${card.name}: attach it to 1 of your Pokémon? (choose none to keep it in your hand)`,
    options: hosts,
    min: 0,
    max: 1,
    resumeToken: { effectType: PRIZE_ATTACH_EFFECT, initiatorPlayerId: playerId, cardId: card.instanceId },
  });
}

function resumePrizeAttach(draft, { token, selection, events }) {
  draft.pendingChoice = null;
  const player = draft.players[token.initiatorPlayerId];
  const card = player?.zones?.hand?.find((c) => c.instanceId === token.cardId);
  const target = findCard(draft, Number((selection || [])[0]));
  if (!card || !target || target.playerId !== token.initiatorPlayerId) return;
  if (!['active', 'bench'].includes(target.zoneId) || target.card.attachedTo) return;
  player.zones.hand.splice(player.zones.hand.indexOf(card), 1);
  card.attachedTo = target.card.instanceId;
  player.zones[target.zoneId].push(card);
  events.push({
    type: 'cardAttached',
    instanceId: card.instanceId,
    targetInstanceId: target.card.instanceId,
    playerId: token.initiatorPlayerId,
  });
}

function resumePrizeToBench(draft, { token, selection, activeRng, events }) {
  draft.pendingChoice = null;
  if (Number((selection || [])[0]) !== 1) return;
  const player = draft.players[token.initiatorPlayerId];
  const card = player?.zones?.hand?.find((c) => c.instanceId === token.cardId);
  if (!card || rootsIn(player.zones.bench).length >= 5) return;
  player.zones.hand.splice(player.zones.hand.indexOf(card), 1);
  card.enteredPlayTurn = draft.turn?.number ?? null;
  player.zones.bench.push(card);
  events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'hand', to: 'bench', playerId: player.playerId });
  const { extraPrize } = abilityPrizeToBench(card) || {};
  let extra = extraPrize === 'always';
  if (extraPrize === 'coin') {
    const coin = flipCoin(activeRng);
    events.push({ type: 'coinFlipped', playerId: player.playerId, face: coin });
    extra = coin === 'heads';
  }
  if (extra && player.zones.prizes.length > 0) {
    if (!player.flags) player.flags = {};
    player.flags.prizesOwed = (player.flags.prizesOwed || 0) + 1;
  }
}

/**
 * Applies an already-legal retreat: pays the Energy cost and swaps the Active with the
 * chosen Benched Pokémon. Pure; legality (turn, conditions, cost, bench non-empty) is
 * validated by the command gate before this runs. Shared by the direct `retreat` command
 * and the `retreat` PendingChoice resume path, so a player with 2+ Benched Pokémon can
 * click the one to switch in (design 017 / D19).
 */
function applyRetreatSwap(
  draft,
  { playerId, benchInstanceId = null, discardEnergyIds = [], events }
) {
  const player = draft.players[playerId];
  const active = player?.zones?.active?.find((c) => !c.attachedTo);
  if (!player || !active) return;
  const costN = computeEffectiveRetreatCost(draft, active, playerId);

  // Discard energy cost
  if (Array.isArray(discardEnergyIds) && discardEnergyIds.length > 0) {
    for (const id of discardEnergyIds) {
      const idx = player.zones.active.findIndex((c) => c.instanceId === id);
      if (idx >= 0) {
        const [discarded] = player.zones.active.splice(idx, 1);
        discarded.attachedTo = null;
        const to = discardCardToPlayerZone(player, discarded);
        events.push({
          type: 'cardMoved',
          instanceId: id,
          from: 'active',
          to,
          playerId,
        });
      }
    }
  } else if (costN > 0) {
    let discardedCount = 0;
    for (
      let i = player.zones.active.length - 1;
      i >= 0 && discardedCount < costN;
      i--
    ) {
      const card = player.zones.active[i];
      if (card.attachedTo === active.instanceId && isEnergy(card)) {
        player.zones.active.splice(i, 1);
        card.attachedTo = null;
        const to = discardCardToPlayerZone(player, card);
        discardedCount++;
        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: 'active',
          to,
          playerId,
        });
      }
    }
  }

  // Bench swap
  let benchPokemon = null;
  if (benchInstanceId != null) {
    benchPokemon = player.zones.bench.find(
      (c) => c.instanceId === benchInstanceId
    );
  } else {
    benchPokemon = player.zones.bench.find((c) => !c.attachedTo);
  }

  if (active && benchPokemon) {
    // Move active + attachments to bench
    for (let i = player.zones.active.length - 1; i >= 0; i--) {
      const c = player.zones.active[i];
      if (
        c.instanceId === active.instanceId ||
        c.attachedTo === active.instanceId
      ) {
        player.zones.active.splice(i, 1);
        player.zones.bench.push(c);
      }
    }
    // Move benchPokemon + attachments to active
    for (let i = player.zones.bench.length - 1; i >= 0; i--) {
      const c = player.zones.bench[i];
      if (
        c.instanceId === benchPokemon.instanceId ||
        c.attachedTo === benchPokemon.instanceId
      ) {
        player.zones.bench.splice(i, 1);
        player.zones.active.push(c);
      }
    }

    // Stadium on-switch triggers (Spikemuth: damage the Pokémon moving to the
    // Bench) run before the outgoing Pokémon's conditions are cleared.
    applyStadiumSwitchTriggers(draft, {
      switchedOut: active,
      switchedIn: benchPokemon,
      switchedOutPlayerId: playerId,
      switchedInPlayerId: playerId,
      viaTrainer: false,
      duringOwnersTurn: true,
      events,
    });

    clearConditions(active);
    delete active.cannotAttackUntilTurn;
    delete active.cannotAttackAttackName;
    delete active.cannotRetreatUntilTurn;
    clearAttackMarkers(active);
    benchPokemon.movedToActiveTurn = Math.max(1, Number(draft.turn?.number) || 1);

    if (!player.flags) player.flags = {};
    player.flags.retreatedThisTurn = true;

    events.push({
      type: 'cardRetreated',
      activeId: active.instanceId,
      promotedId: benchPokemon.instanceId,
      playerId,
    });
  }
}

/**
 * Advances the turn to the next player, reset flags, and performs start-of-turn draw.
 */
function advanceTurn(draft, { nextPlayerId, events }) {
  // The flags object is replaced wholesale below; a Checkup Knockout may have just
  // entitled the incoming player, and that entitlement must survive the reset so the
  // prize choice raised at the end of the command can be settled.
  const prizesOwed = draft.players[nextPlayerId].flags?.prizesOwed;
  const koedLastOppTurn = !!draft.players[nextPlayerId].flags?.koedOnOppTurn;
  const koedLastOppTurnVictims = draft.players[nextPlayerId].flags?.koedOnOppTurnVictims || [];
  // Game-scoped once-per-game markers live in `flags` too, so the wholesale
  // rebuild below must carry them across or they are silently forgotten — the
  // Legacy Energy prize reduction was spent again on a later KO.
  const legacyPrizeReductionUsed = !!draft.players[nextPlayerId].flags?.legacyPrizeReductionUsed;

  draft.turn.player = nextPlayerId;
  draft.turn.number = (draft.turn.number || 1) + 1;
  draft.turn.phase = 'main';

  if (!draft.players[nextPlayerId].flags) {
    draft.players[nextPlayerId].flags = {};
  }
  draft.players[nextPlayerId].flags = {
    energyAttached: false,
    attackerAttacked: false,
    attacksThisTurn: 0,
    retreatedThisTurn: false,
    supporterPlayed: false,
    stadiumPlayedThisTurn: false,
    stadiumUsedThisTurn: false,
    abilitiesUsed: {},
    evolved: {},
    briarActive: false,
    koedLastOppTurn,
    koedLastOppTurnVictims,
    ...(prizesOwed ? { prizesOwed } : {}),
    ...(legacyPrizeReductionUsed ? { legacyPrizeReductionUsed } : {}),
  };
  for (const p of Object.values(draft.players || {})) {
    if (p.playerId !== nextPlayerId && p.flags) {
      p.flags.briarActive = false;
      delete p.flags.turnDamageBonuses;
    }
  }

  // Reset once-per-turn ability markers on in-play Pokemon
  const inPlay = [
    ...(draft.players[nextPlayerId].zones?.active || []),
    ...(draft.players[nextPlayerId].zones?.bench || []),
  ];
  for (const card of inPlay) {
    card.abilityUsed = false;
  }

  const deck = draft.players[nextPlayerId].zones.deck;
  const hand = draft.players[nextPlayerId].zones.hand;
  if (deck.length === 0) {
    const oppId = Object.keys(draft.players).find((id) => id !== nextPlayerId);
    setGameEnded(draft, { winner: oppId, reason: 'deck-out', events });
  } else {
    const [card] = deck.splice(0, 1);
    hand.push(card);
    events.push({
      type: 'cardsDrawn',
      playerId: nextPlayerId,
      count: 1,
      cards: [{ instanceId: card.instanceId }],
    });
  }

  events.push({
    type: 'turnStarted',
    player: nextPlayerId,
    number: draft.turn.number,
  });
}

/**
 * "… Your turn ends." Trainers end the turn once their effect has fully resolved (no choice
 * pending), unless an Ability exempts that card (Alcremie Additional Order, design 034 slice 6).
 * A coin branch can request the same ending ("If tails, your turn ends immediately": I155).
 */
function endTurnAfterTrainer(draft, { card, playerId, activeRng, events }) {
  if (!card || draft.pendingChoice) return;
  const conditionalEnd = events.some(
    (e) => e.type === 'turnEndRequested' && e.playerId === playerId
  );
  if (!trainerEndsTurn(card) && !conditionalEnd) return;
  if (draft.turn?.player !== playerId) return;
  if (abilityTurnNotEnd(card, abilitySideContext(draft, playerId))) {
    events.push({ type: 'turnEndPrevented', playerId, instanceId: card.instanceId });
    return;
  }
  endTurnFromEffect(draft, { playerId, activeRng, events });
}

/**
 * Ends the acting player's turn from inside a card effect (Lumiose City: "If a
 * player searches their deck in this way, their turn ends."). Mirrors the `pass`
 * path — Checkup first, then advance only while the game is still live.
 */
function endTurnFromEffect(draft, { playerId, activeRng, events }) {
  if (isGameConcluded(draft)) return;
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  if (!oppId) return;
  resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: playerId });
  if (!isGameConcluded(draft)) {
    advanceTurn(draft, { nextPlayerId: oppId, events });
  }
}

/**
 * Ability outcomes the effect executor can't apply itself, because the KO and game-end flow
 * lives here (design 034 slice 6), announced as events:
 * - `abilitySelfKnockOut` (Electrode Buzzap): Knock Out the holder — the opponent takes
 *   Prizes as usual — then attach the card to the chosen Pokémon as a Special Energy.
 * - `abilityWinsGame` (Unown MISSING / HAND / DAMAGE).
 */
function settleAbilityOutcomes(draft, { events }) {
  for (const outcome of events.filter((e) => e.type === 'abilitySelfKnockOut')) {
    const player = draft.players[outcome.playerId];
    const oppId = Object.keys(draft.players || {}).find((id) => id !== outcome.playerId);
    const root = findCard(draft, outcome.rootId)?.card;
    const target = findCard(draft, outcome.targetId);
    if (!player || !root || !target || isGameConcluded(draft)) continue;
    handleKnockout(draft, { victimPlayerId: outcome.playerId, attackerPlayerId: oppId, victim: root, events });
    const ref = findCard(draft, outcome.cardId);
    if (!ref || !['discard', 'lostZone'].includes(ref.zoneId)) continue;
    const pile = player.zones[ref.zoneId];
    pile.splice(pile.indexOf(ref.card), 1);
    ref.card.asEnergy = { provides: outcome.provides };
    ref.card.attachedTo = outcome.targetId;
    player.zones[target.zoneId].push(ref.card);
    events.push({
      type: 'cardAttached',
      instanceId: ref.card.instanceId,
      targetInstanceId: outcome.targetId,
      playerId: outcome.playerId,
    });
  }
  const win = events.find((e) => e.type === 'abilityWinsGame');
  if (win && !isGameConcluded(draft)) {
    setGameEnded(draft, { winner: win.playerId, reason: win.reason, events });
  }
}

/**
 * Marks game as ended with winner and reason, or — when both players satisfy a
 * win condition on the same Knockout — enters the sudden-death `tiebreak`
 * phase with no winner (rulebook 30c 1.3a).
 */
function setGameEnded(draft, { winner, reason, simultaneous, ways, events }) {
  if (Array.isArray(simultaneous) && simultaneous.length === 2) {
    const [a, b] = simultaneous;
    draft.turn.phase = 'tiebreak';
    draft.winner = null;
    draft.winReason = 'simultaneous';
    // Sudden death: the first Prize taken from here wins, including after the
    // interim `pass` hand-over that flips the turn back to `main` (1.2). The
    // fresh six-prize mat is a tracked follow-up; this flag is the interim
    // "first Prize wins" rule, the same one `setupGame({ firstPrizeWins })` sets.
    draft.firstPrizeWins = true;
    draft.tiebreak = {
      players: [a, b],
      ways: {
        [a]: [...(ways?.[a] || [])],
        [b]: [...(ways?.[b] || [])],
      },
    };
    events.push({ type: 'tiebreakStarted', players: [a, b] });
    return;
  }
  draft.turn.phase = 'ended';
  draft.winner = winner;
  draft.winReason = reason;
  events.push({ type: 'gameEnded', winner, reason });
}

/**
 * Per-player, per-game markers (App. 9/19). Unlike `player.flags`, advanceTurn never
 * rebuilds this object, so the GX-attack and VSTAR Power limits survive the turn.
 * Lazily initialised so states that predate the field (old snapshots, tests) still work.
 */
function ensureOncePerGame(draft, playerId) {
  const player = draft?.players?.[playerId];
  if (!player) return null;
  if (!player.oncePerGame) {
    player.oncePerGame = { vstarUsed: false, gxUsed: false };
  }
  return player.oncePerGame;
}

/**
 * Whether the game has stopped resolving normal play — either finished or
 * awaiting its sudden-death tiebreaker. Start/end-of-turn hooks must not fire
 * once this is true.
 */
function isGameConcluded(draft) {
  const phase = draft?.turn?.phase;
  return phase === 'ended' || phase === 'tiebreak';
}

/**
 * Whether the game has no legal play left at all. Unlike `isGameConcluded`,
 * this excludes `tiebreak`: during a sudden-death tiebreak a `pass` may still
 * hand the turn over (1.2), so only a decided-but-unresolved `ended` state
 * freezes the game.
 */
function isGameFrozen(draft) {
  return draft?.turn?.phase === 'ended';
}

/**
 * Validates reference integrity of instanceIds in command payload (Step 3).
 *
 * @param {object} state
 * @param {object} command
 * @returns {{ valid: boolean, error?: string }}
 */
function validateReferences(state, command) {
  const { type, payload, playerId } = command;

  switch (type) {
    case 'moveCard': {
      const cardRef = findCard(state, payload.instanceId);
      if (!cardRef) {
        return { valid: false, error: 'stale_view' };
      }
      if (cardRef.zoneId !== payload.from) {
        return { valid: false, error: 'stale_view' };
      }
      // If moving from a player zone, it must belong to the acting player
      if (payload.from !== 'stadium' && cardRef.playerId !== playerId) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'attachCard': {
      const cardRef = findCard(state, payload.instanceId);
      const targetRef = findCard(state, payload.targetInstanceId);

      if (!cardRef || !targetRef) {
        return { valid: false, error: 'stale_view' };
      }
      // Attached card and target card must belong to acting player, except a
      // Team Flare Hyper Gear, which attaches to the OPPONENT's Pokémon-EX
      // (App. 24).
      const teamFlareToOpponent =
        cardRef.playerId === playerId &&
        targetRef.playerId !== playerId &&
        isTeamFlareHyperGearCard(cardRef.card) &&
        isExCard(targetRef.card);
      if (
        cardRef.playerId !== playerId ||
        (targetRef.playerId !== playerId && !teamFlareToOpponent)
      ) {
        return { valid: false, error: 'stale_view' };
      }
      // Target must be in play (active or bench)
      if (!['active', 'bench'].includes(targetRef.zoneId)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'addDamageCounter':
    case 'updateDamageCounter':
    case 'removeDamageCounter':
    case 'addSpecialCondition':
    case 'updateSpecialCondition':
    case 'removeSpecialCondition':
    case 'removeAbilityCounter':
    case 'changeType':
    case 'rotateCard': {
      const cardRef = findCard(state, payload.instanceId);
      if (!cardRef) {
        return { valid: false, error: 'stale_view' };
      }
      // Special Conditions can only be placed on the Active Pokémon (p.15);
      // parsed card effects already target the Active, so this closes the
      // manual-tool hole.
      if (type === 'addSpecialCondition' && cardRef.zoneId !== 'active') {
        return { valid: false, error: 'special_condition_not_active' };
      }
      // In sandbox / manual mode, counter updates on opponent's cards are only allowed on public in-play zones
      if (
        cardRef.playerId !== playerId &&
        ![
          'active',
          'bench',
          'board',
          'stadium',
          'discard',
          'lostZone',
        ].includes(cardRef.zoneId)
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'draw': {
      if (!state.players?.[playerId]) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'attack': {
      const active = state.players?.[playerId]?.zones?.active?.find(
        (c) => !c.attachedTo
      );
      if (!active) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload?.targetInstanceId != null) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (!targetRef) {
          return { valid: false, error: 'stale_view' };
        }
      }
      return { valid: true };
    }

    case 'retreat': {
      const active = state.players?.[playerId]?.zones?.active?.find(
        (c) => !c.attachedTo
      );
      if (!active) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload?.benchInstanceId != null) {
        const benchCard = state.players?.[playerId]?.zones?.bench?.find(
          (c) => c.instanceId === payload.benchInstanceId && !c.attachedTo
        );
        if (!benchCard) {
          return { valid: false, error: 'stale_view' };
        }
      }
      if (Array.isArray(payload?.discardEnergyIds)) {
        const activeZone = state.players?.[playerId]?.zones?.active || [];
        for (const id of payload.discardEnergyIds) {
          const card = activeZone.find(
            (c) => c.instanceId === id && c.attachedTo === active.instanceId
          );
          if (!card) {
            return { valid: false, error: 'stale_view' };
          }
        }
      }
      return { valid: true };
    }

    case 'promote': {
      const benchCard = state.players?.[playerId]?.zones?.bench?.find(
        (c) => c.instanceId === payload?.instanceId && !c.attachedTo
      );
      if (!benchCard) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'takePrizes': {
      if (!state.players?.[playerId]) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'takePrizesByIndex': {
      const prizes = state.players?.[playerId]?.zones?.prizes || [];
      if (
        !Array.isArray(payload?.indices) ||
        payload.indices.some(
          (idx) => !Number.isInteger(idx) || idx < 0 || idx >= prizes.length
        ) ||
        new Set(payload.indices).size !== payload.indices.length
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'playTrainer': {
      const cardRef = findCard(state, payload?.instanceId);
      if (
        !cardRef ||
        cardRef.zoneId !== 'hand' ||
        cardRef.playerId !== playerId
      ) {
        return { valid: false, error: 'stale_view' };
      }
      if (payload.targetInstanceId != null) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (
          !targetRef ||
          !['active', 'bench'].includes(targetRef.zoneId) ||
          targetRef.playerId !== playerId
        ) {
          return { valid: false, error: 'stale_view' };
        }
      }
      return { valid: true };
    }

    case 'useAbility': {
      const cardRef = findCard(state, payload?.instanceId);
      // Luxray Swelling Flash / Charjabug Battery are activated from the hand.
      const legalZones = isHandActivatedAbility(cardRef?.card)
        ? ['hand']
        : ['active', 'bench'];
      if (
        !cardRef ||
        !legalZones.includes(cardRef.zoneId) ||
        cardRef.playerId !== playerId
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    // The VSTAR/GX marker is a per-player, per-game flag (App. 9/19), not a card action,
    // so it needs no card identity. When a caller does name a card, still verify it is
    // the player's and in play (legacy UI passes the active; the flag path may pass none).
    case 'useVStarGX': {
      if (payload?.instanceId == null) return { valid: true };
      const cardRef = findCard(state, payload.instanceId);
      if (
        !cardRef ||
        !['active', 'bench'].includes(cardRef.zoneId) ||
        cardRef.playerId !== playerId
      ) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'stadium-effect': {
      if (!state.stadium) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'resolveChoice': {
      if (!state.pendingChoice) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    // Zone ops (design 002 slice 3.4a): none of these carry a card instanceId (the legacy
    // actions never attached a cardHint), so position-addressed ops are bounds-checked
    // against the server's own zone array, the same pattern takePrizesByIndex already uses.
    case 'shuffleIntoDeck':
    case 'moveToDeckTop':
    case 'switchWithDeckTop': {
      const zone = state.players?.[playerId]?.zones?.[payload.from];
      if (!Array.isArray(zone) || !isZoneIndex(payload.index, zone)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    // I19: reveal/hide only ever touches the sender's own zone (draft.players[playerId]).
    case 'revealShortcut':
    case 'hideShortcut': {
      const zone = state.players?.[playerId]?.zones?.[payload?.zoneId];
      if (!Array.isArray(zone) || !isZoneIndex(payload.index, zone)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'revealCards':
    case 'hideCards': {
      const zone = state.players?.[playerId]?.zones?.[payload?.zoneId];
      if (!Array.isArray(zone)) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    case 'playRandomCardFaceDown': {
      const hand = state.players?.[playerId]?.zones?.hand;
      if (!Array.isArray(hand) || hand.length === 0) {
        return { valid: false, error: 'stale_view' };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

/**
 * Whether `active` has the Energy for `attack`, priced exactly as the attack
 * preview prices it (ability/Tool/Stadium discounts, then Stadium increases).
 */
function attackCostPayable(state, playerId, active, attack) {
  // Flapple V Sour Spit: "attacks cost {C} more" also taxes a free attack.
  const markerIncrease = markerCount(activeAttackMarkers(state, playerId, active), 'attackCostIncrease', 'count');
  if (!(attack?.cost?.length > 0) && markerIncrease === 0) return true;
  const player = state.players?.[playerId];
  if (!player || !active) return false;
  const activeZoneCards = player.zones?.active || [];
  const attached = activeZoneCards.filter(
    (c) => c.attachedTo === active.instanceId && isEnergy(c)
  );
  const stadiumCard = state.stadium?.card || state.stadium || null;
  const stadiumUser =
    state.stadium?.user ??
    state.stadium?.playedBy ??
    stadiumCard?.ownerId ??
    null;
  const energyContext = {
    stadiumCard,
    ...energyProvisionContext(state, playerId, active),
  };
  const sideCards = [
    ...(player.zones?.active || []),
    ...(player.zones?.bench || []),
  ];
  const opponent = state.players?.[
    Object.keys(state.players || {}).find((id) => id !== playerId)
  ];
  const energyEntries = expandEnergyEntries(
    applyEnergyMultiplier(
      attached.map((c) => serverEnergyDescriptor(c, energyContext)),
      sideCards
    )
  );
  // Cost modifiers must be priced exactly as the client and the attack
  // preview price them: passive ability/Tool discounts plus a Stadium
  // cost modifier, then ability cost ignores, then Nighttime Mine-style
  // increases. Checking the raw printed cost rejected legally payable attacks.
  const activeView = inPlayView(state, active);
  const blockTools = isStadiumToolNegation(stadiumCard);
  // The board facts a printed discount condition or "for each" count reads (I160).
  const discountCtx = {
    attacker: activeView,
    ownHandCount: (player.zones?.hand || []).length,
    ownPrizesLeft: (player.zones?.prizes || []).length,
    opponentPrizesLeft: (opponent?.zones?.prizes || []).length,
    ownSideCards: sideCards,
    opponentSideCards: [...(opponent?.zones?.active || []), ...(opponent?.zones?.bench || [])],
    opponentActive: opponent?.zones?.active || [],
    ownDiscard: player.zones?.discard || [],
  };
  const discounts = [costDiscountRead(activeView, discountCtx)];
  if (!blockTools) {
    for (const tool of attachedTools(active, activeZoneCards)) {
      discounts.push(costDiscountRead(tool, discountCtx));
    }
  }
  if (stadiumCard) discounts.push({ count: parseStadiumCostModifier(stadiumCard), symbol: null });
  let effectiveCost = attack?.cost || [];
  if (effectiveCost.length > 0) {
    effectiveCost = applyCostDiscount(effectiveCost, discounts.filter(Boolean));
  }
  const abilityCost = abilityAttackCostDiscount(activeView, {
    sideCards,
    opponentSideCards: [
      ...(opponent?.zones?.active || []),
      ...(opponent?.zones?.bench || []),
    ],
    zone: 'active',
    isActive: true,
    opponentHandCount: (opponent?.zones?.hand || []).length,
  });
  if (abilityCost.ignoreAll) {
    effectiveCost = [];
  } else if (abilityCost.ignoreColorless) {
    effectiveCost = effectiveCost.filter((symbol) => symbol !== 'Colorless');
  }
  const increase =
    getStadiumAttackCostIncreaseFor(activeView, playerId, stadiumCard, stadiumUser) + markerIncrease;
  if (increase > 0) {
    effectiveCost = [
      ...effectiveCost,
      ...Array(increase).fill('Colorless'),
    ];
  }
  return canPayAttackCost(energyEntries, effectiveCost);
}

/**
 * Ability-combat context for the player whose turn/command this is: their
 * in-play cards on `side*` and the other player's on `opponent*`, so the
 * slice-3 readers can scope suppression and locks to the right side.
 */
function abilitySideContext(state, playerId) {
  const player = state.players?.[playerId];
  const opponent = Object.values(state.players || {}).find(
    (p) => p.playerId !== playerId
  );
  const zones = (p) => p?.zones || {};
  const own = zones(player);
  const other = zones(opponent);
  return {
    sideCards: [...(own.active || []), ...(own.bench || [])],
    opponentSideCards: [...(other.active || []), ...(other.bench || [])],
    sideActive: own.active || [],
    sideBench: own.bench || [],
    opponentActive: other.active || [],
    opponentBench: other.bench || [],
  };
}

/**
 * Validates gameplay legality when rulesEnabled is true (Step 4).
 * Skipped completely when rulesEnabled === false (Hazard H6).
 *
 * @param {object} state
 * @param {object} command
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateLegality(state, command) {
  if (!state.rulesEnabled) {
    return { allowed: true };
  }

  const { type, payload, playerId } = command;
  const player = state.players?.[playerId];
  if (!player) {
    return { allowed: false, reason: 'Player not found in game' };
  }

  // Turn phase validation
  if (isGameFrozen(state)) {
    return { allowed: false, reason: 'Game is over.' };
  }
  if (type === 'setup') {
    if (state.turn?.phase !== 'setup') {
      return { allowed: false, reason: 'Game is already set up.' };
    }
    return { allowed: true };
  }
  if (type === 'loadDeck') {
    if (state.turn?.phase !== 'setup') {
      return {
        allowed: false,
        reason: 'Cannot load a deck after the game has started.',
      };
    }
    return { allowed: true };
  }
  // I26: card stats are reference data about the player's own cards, not a game action —
  // legal in any phase and on either player's turn, since TCGdex enrichment resolves
  // asynchronously and may land well after the game has started.
  if (type === 'cardStats') {
    return { allowed: true };
  }
  const isStartingActiveMove =
    type === 'moveCard' &&
    payload?.from === 'hand' &&
    payload?.to === 'active' &&
    (!state.players?.[playerId]?.zones?.active?.length || state.players?.[playerId]?.zones?.active?.length === 0);

  if (state.turn?.phase === 'setup' || state.turn?.number === 0) {
    if (isStartingActiveMove) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Set up the game first (Set Up button).' };
  }

  // Turn player validation
  if (
    [
      'attack',
      'retreat',
      'pass',
      'takeTurn',
      'moveCard',
      'attachCard',
      'draw',
      'playTrainer',
      'useAbility',
      'takePrizes',
      'takePrizesByIndex',
      'stadium-effect',
      'useVStarGX',
      // Audit B-2/B-2c: manual counters and conditions are the turn player's tools;
      // off-turn they let the opponent damage, heal or Paralyze at will.
      'addDamageCounter',
      'updateDamageCounter',
      'removeDamageCounter',
      'addSpecialCondition',
      'updateSpecialCondition',
      'removeSpecialCondition',
      // Audit A-7: deck-order mutations.
      'shuffleIntoDeck',
      'moveToDeckTop',
      'switchWithDeckTop',
      // Design 012: plays a card to the board like any other hand play.
      'playRandomCardFaceDown',
    ].includes(type)
  ) {
    if (state.turn?.player && state.turn.player !== playerId && !isStartingActiveMove) {
      return { allowed: false, reason: "It's not your turn." };
    }
  }

  if (state.turn?.phase === 'attack') {
    if (
      [
        'moveCard',
        'attachCard',
        'draw',
        'retreat',
        'attack',
        'playTrainer',
        'useAbility',
        'stadium-effect',
        'useVStarGX',
        'playRandomCardFaceDown',
      ].includes(type)
    ) {
      return {
        allowed: false,
        reason: 'You already attacked — end your turn.',
      };
    }
  }

  // A genuine tie (both boards empty) enters the `tiebreak` phase to resolve the
  // winner on the next Prize taken; it is a resolution prompt, not normal play,
  // so board actions are rejected until `takePrizes` or `pass` resolves it (1.2).
  // `pass`, `takeTurn` and `takePrizes` stay legal.
  if (
    state.turn?.phase === 'tiebreak' &&
    [
      'attack',
      'moveCard',
      'attachCard',
      'playTrainer',
      'useAbility',
    ].includes(type)
  ) {
    return { allowed: false, reason: 'tiebreak_pending' };
  }

  switch (type) {
    case 'draw': {
      const deck = player.zones?.deck || [];
      if (deck.length === 0) {
        // Edge Case 1: Empty deck draw rejected deck_empty
        return { allowed: false, reason: 'deck_empty' };
      }
      return { allowed: true };
    }

    case 'moveCard': {
      // Stadium zone validation
      if (payload.to === 'stadium') {
        const cardRef = findCard(state, payload.instanceId);
        if (cardRef && !isStadiumCard(cardRef.card)) {
          return { allowed: false, reason: 'invalid_stadium_target' };
        }
      }

      // Bench limit validation (Edge Case 9: bench full)
      if (payload.to === 'bench' && payload.from !== 'bench') {
        const bench = player.zones?.bench || [];
        const benchPokemonCount = bench.filter((c) => !c.attachedTo).length;
        if (benchPokemonCount >= 5) {
          return { allowed: false, reason: 'bench_full' };
        }
      }

      // Active zone validation
      if (payload.to === 'active' && payload.from !== 'active') {
        const active = player.zones?.active || [];
        const activePokemonCount = active.filter((c) => !c.attachedTo).length;
        if (activePokemonCount >= 1) {
          return { allowed: false, reason: 'active_occupied' };
        }
      }

      // Playing a Pokémon from hand is Basic-only. isBasicPokemon now rejects
      // V-UNION / Restored / BREAK (rulebook 30c 2.2/2.5); unknown-stage cards
      // still default to Basic so async-unenriched cards stay playable.
      if (
        payload.from === 'hand' &&
        (payload.to === 'bench' || payload.to === 'active')
      ) {
        const cardRef = findCard(state, payload.instanceId);
        if (cardRef && !isPokemon(cardRef.card)) {
          return {
            allowed: false,
            reason:
              'Only Pokémon can be played to the Bench or Active Spot. Items, Supporters, and Tools are played elsewhere.',
          };
        }
        // Explosiveness (design 034 slice 6): the opening Active may be this non-Basic.
        const openingActive =
          payload.to === 'active' &&
          (state.turn?.number ?? 0) <= 1 &&
          rootsIn([...(player.zones?.active || []), ...(player.zones?.bench || [])]).length === 0;
        const goingSecond = state.turn?.number === 1 && state.turn.player !== playerId;
        if (
          cardRef &&
          isPokemon(cardRef.card) &&
          !isBasicPokemon(cardRef.card) &&
          !(openingActive && abilitySetupActive(cardRef.card, { goingSecond }))
        ) {
          return {
            allowed: false,
            reason: 'Only Basic Pokémon can be played from your hand.',
          };
        }
        // Palafin ex Zero to Hero: this Pokémon may only enter play through its
        // own Ability's effect, never as a hand play.
        if (cardRef && isPokemon(cardRef.card) && abilitySummonRestricted(cardRef.card)) {
          return {
            allowed: false,
            reason: `${cardRef.card.name} can only be put into play by its Ability's effect.`,
          };
        }
      }

      return { allowed: true };
    }

    case 'attachCard': {
      const cardRef = findCard(state, payload.instanceId);
      // Palkia Cross Slicer / Dark Omastar Dark Tentacle (design 036 A8b): locks from an
      // attack on the target Pokémon, for cards played from the hand.
      if (cardRef?.zoneId === 'hand') {
        const lockReason = attachLockReason(state, cardRef.card, payload.targetInstanceId);
        if (lockReason) return { allowed: false, reason: lockReason };
      }
      // "This card can only be attached to …" (Team Rocket's Energy, Shield Energy, …).
      if (cardRef?.zoneId === 'hand' && isEnergy(cardRef.card) && isSpecialEnergyCard(cardRef.card)) {
        const targetRef = findCard(state, payload.targetInstanceId);
        const targetZone = targetRef?.player?.zones?.[targetRef.zoneId] || [];
        if (
          targetRef?.card &&
          isPokemon(targetRef.card) &&
          failedSpecialEnergyRestriction(cardRef.card, inPlayView(state, targetRef.card), targetZone, {
            atAttach: true,
          })
        ) {
          return { allowed: false, reason: `${cardRef.card.name} can't be attached to that Pokémon.` };
        }
        // Aurora Energy: "only if you discard another card from your hand" (audit SE9).
        const discardCost = specialEnergyAttachDiscardCost(cardRef.card);
        const otherHandCards = (player?.zones?.hand || []).length - 1;
        if (discardCost > otherHandCards) {
          return {
            allowed: false,
            reason: `${cardRef.card.name} needs you to discard ${discardCost} other card${discardCost === 1 ? '' : 's'} from your hand.`,
          };
        }
      }
      if (cardRef && isEnergy(cardRef.card)) {
        if (player.flags?.energyAttached) {
          // Check for unlimited energy acceleration abilities (Phase 4)
          const inPlayPokemon = [
            ...(player.zones?.active || []),
            ...(player.zones?.bench || []),
          ].filter((c) => !c.attachedTo && isPokemon(c));

          let acceleratorAllowed = false;
          const targetRef = findCard(state, payload.targetInstanceId);
          const targetPokemon = targetRef?.card;

          for (const p of inPlayPokemon) {
            const accel = parseUnlimitedHandEnergyAcceleration(p);
            if (!accel) continue;

            if (accel.energyType) {
              const cardEnergyType =
                cardRef.card.energyType ||
                cardRef.card.name?.replace(/\s*Energy.*/i, '');
              if (
                !cardEnergyType ||
                !cardEnergyType
                  .toLowerCase()
                  .includes(accel.energyType.toLowerCase())
              ) {
                continue;
              }
            }

            if (targetRef && targetPokemon) {
              if (accel.benchedOnly && targetRef.zoneId !== 'bench') {
                continue;
              }
              if (accel.noRuleBox && isRuleBoxPokemon(targetPokemon)) {
                continue;
              }
              if (accel.targetType) {
                const targetTypes = (targetPokemon.types || []).map((ty) =>
                  ty.toLowerCase()
                );
                if (!targetTypes.includes(accel.targetType.toLowerCase())) {
                  continue;
                }
              }
            }

            acceleratorAllowed = true;
            break;
          }

          if (!acceleratorAllowed) {
            return {
              allowed: false,
              reason: 'Energy already attached this turn.',
            };
          }
        }
      }
      if (cardRef && isPokemonToolCard(cardRef.card)) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (!targetRef || !isPokemon(targetRef.card)) {
          return {
            allowed: false,
            reason: 'Can only attach a Pokémon Tool to a Pokémon in play.',
          };
        }
        // Team Flare Hyper Gear is the exception that attaches to the
        // opponent's Pokémon-EX (App. 24) — enforce both halves here.
        if (isTeamFlareHyperGearCard(cardRef.card)) {
          if (targetRef.playerId === playerId || !isExCard(targetRef.card)) {
            return {
              allowed: false,
              reason:
                "Team Flare Hyper Gear must be attached to your opponent's Pokémon-EX.",
            };
          }
        }
        const targetZoneCards =
          targetRef.player?.zones?.[targetRef.zoneId] || [];
        const currentTools = attachedTools(targetRef.card, targetZoneCards);
        const maxTools = 1 + (parseToolCap(targetRef.card)?.extra || 0);
        if (currentTools.length >= maxTools) {
          return {
            allowed: false,
            reason: 'That Pokémon already has a Pokémon Tool attached.',
          };
        }
      }
      if (cardRef && isPokemon(cardRef.card)) {
        const targetRef = findCard(state, payload.targetInstanceId);
        if (!targetRef || !isPokemon(targetRef.card)) {
          return {
            allowed: false,
            reason: 'Can only evolve a Pokémon in play.',
          };
        }
        const evolveCtx = {
          ...abilitySideContext(state, playerId),
          zone: targetRef.zoneId,
          isActive: targetRef.zoneId === 'active',
          turnNumber: state.turn?.number,
          opponentActiveIsEx: isExCard(
            Object.values(state.players || {})
              .find((p) => p.playerId !== playerId)
              ?.zones?.active?.find((c) => !c.attachedTo)
          ),
        };
        // Primal Law-class locks ("your opponent can't play any Pokémon from
        // their hand to evolve their Pokémon") forbid the evolution outright.
        if (abilityEvolveLock(cardRef.card, evolveCtx)) {
          return {
            allowed: false,
            reason: 'An Ability prevents evolving your Pokémon.',
          };
        }
        // "This Pokémon can evolve during your first turn or the turn you play
        // it" (Scatterbug/Eevee/Luxio/Spearow/Shelmet/Karrablast) relaxes the
        // first-turn and just-played gates for that Pokémon.
        const evolvePermission = abilityEvolvePermission(targetRef.card, evolveCtx);
        if (!evolvePermission && (state.turn?.number || 1) <= 2) {
          return { allowed: false, reason: "Can't evolve on the first turn." };
        }
        const targetZoneCards =
          targetRef.player?.zones?.[targetRef.zoneId] || [];
        const topTarget = topPokemonCard(targetZoneCards, targetRef.card);
        // Forest of Vitality and other evolution-speed Stadiums lift both the
        // just-played and the once-per-turn gates (Basic → Stage 1 → Stage 2).
        const stadiumRelaxes = stadiumAllowsSameTurnEvolution(state.stadium, {
          playerId,
          pokemon: topTarget,
          evolution: cardRef.card,
        });
        if (
          !evolvePermission &&
          !stadiumRelaxes &&
          targetRef.card.enteredPlayTurn === state.turn?.number
        ) {
          return {
            allowed: false,
            reason:
              "That Pokémon was just played this turn — it can't evolve yet.",
          };
        }
        if (!stadiumRelaxes && player.flags?.evolved?.[payload.targetInstanceId]) {
          return {
            allowed: false,
            reason: 'Already evolved that Pokémon this turn.',
          };
        }
        const baseStage = normalizeStage(topTarget?.stage) || 'Basic';
        const evoStage = normalizeStage(cardRef.card.stage);
        if (!evoStage || evoStage === 'Basic') {
          return {
            allowed: false,
            reason: `${cardRef.card.name} is not an Evolution Pokémon.`,
          };
        }
        const order = ['Basic', 'Stage 1', 'Stage 2'];
        const baseIdx = order.indexOf(baseStage);
        const evoIdx = order.indexOf(evoStage);
        if (evoIdx !== baseIdx + 1) {
          return {
            allowed: false,
            reason: `${evoStage} can't evolve from ${baseStage} directly.`,
          };
        }
        if (
          cardRef.card.evolvesFrom &&
          !pokemonNamesMatch(cardRef.card.evolvesFrom, topTarget.name)
        ) {
          return {
            allowed: false,
            reason: `${cardRef.card.name} evolves from ${cardRef.card.evolvesFrom}, not ${topTarget.name}.`,
          };
        }
      }
      // Anything that is not Energy, a Pokémon Tool, or a Pokémon (evolution)
      // has no business attached to a Pokémon. Without this fallback an Item or
      // Supporter passed straight through to applyCommand and rode along as if
      // it were a Tool.
      if (
        cardRef &&
        !isEnergy(cardRef.card) &&
        !isPokemonToolCard(cardRef.card) &&
        !isPokemon(cardRef.card)
      ) {
        return {
          allowed: false,
          reason: 'Only Pokémon Tools and Energy can be attached to a Pokémon.',
        };
      }
      return { allowed: true };
    }

    case 'attack': {
      if (state.turn?.number === 1) {
        const goingFirstActive = player.zones?.active?.find((c) => !c.attachedTo);
        // Meloetta ex: "If you go first, this Pokémon can use attacks during
        // your first turn." Turn 1 is always the going-first player's turn.
        if (
          !goingFirstActive ||
          !abilityFirstTurnAttack(goingFirstActive, {
            ...abilitySideContext(state, playerId),
            turnNumber: state.turn.number,
          })
        ) {
          return {
            allowed: false,
            reason: "The player going first can't attack on turn 1.",
          };
        }
      }
      const active = player.zones?.active?.find((c) => !c.attachedTo);
      if (player.flags?.attackerAttacked) {
        // An extra-attack Ability (Dipplin Festival Lead, Ω Barrage) allows a
        // second attack in the same turn while its condition holds.
        const extra = active
          ? extraAttackAvailable(active, {
              stadium: state.stadium,
              attacksThisTurn: player.flags?.attacksThisTurn || 1,
            })
          : { allowed: false };
        if (!extra.allowed) {
          return {
            allowed: false,
            reason: extra.reason || 'Already attacked this turn.',
          };
        }
      }
      if (!active) {
        return { allowed: false, reason: 'No active Pokémon to attack with.' };
      }
      if (active.specialCondition === 'Paralyzed') {
        return {
          allowed: false,
          reason: "Paralyzed — this Pokémon can't attack or retreat.",
        };
      }
      if (active.specialCondition === 'Asleep') {
        return {
          allowed: false,
          reason: "Asleep — this Pokémon can't attack or retreat.",
        };
      }
      const atkIdx = payload?.attackIndex ?? 0;
      const attacks = attackViewFor(state, active).attacks || [];
      const attack = attacks[atkIdx];
      // A stale or out-of-range index on a card the server knows attacks for
      // must not fall through every cost gate into a fabricated free attack.
      // An empty attack list is different: card stats have not synced yet, and
      // the apply case's flat fallback is the documented behavior there.
      if (attacks.length > 0 && !attack) {
        return { allowed: false, reason: 'Unknown attack.' };
      }
      // App. 19: one GX attack per player per game. The flag is game-scoped, so this is
      // the cross-turn gate that `attackerAttacked` (per-turn) cannot provide. Share the
      // `useVStarGX` guard so a legacy state whose marker lives on `flags` also blocks it.
      const opponentId = Object.keys(state.players || {}).find((id) => id !== playerId);
      if (isGxAttack(attack) && state.players[opponentId]?.restOfGame?.some((e) => e.kind === 'gxLock')) {
        return { allowed: false, reason: "Your opponent's attack stops you using GX attacks for the rest of the game." };
      }
      if (isGxAttack(attack) && oncePerGameUsed(player, 'gx')) {
        return {
          allowed: false,
          reason: 'Only one GX attack can be used per game.',
        };
      }
      if (
        active.cannotAttackUntilTurn &&
        active.cannotAttackUntilTurn >= (state.turn?.number || 1)
      ) {
        const attackName = String(
          payload.attackName || attack?.name || ''
        ).trim();
        const lockedName = String(active.cannotAttackAttackName || '').trim();
        if (
          !lockedName ||
          attackName.toLowerCase() === lockedName.toLowerCase()
        ) {
          return {
            allowed: false,
            reason: lockedName
              ? `This Pokémon can't use ${active.cannotAttackAttackName} during this turn.`
              : "This Pokémon can't attack during this turn.",
          };
        }
      }
      // Encore / Amnesia (design 033): attack locks the opponent put on this Pokémon.
      const chosenName = String(attack?.name || '').toLowerCase();
      for (const lock of activeAttackMarkers(state, playerId, active).filter((m) => m.kind === 'attackLock')) {
        const lockedName = String(lock.attackName || '').toLowerCase();
        if (lock.mode === 'only' && chosenName !== lockedName) {
          return { allowed: false, reason: `This Pokémon can use only ${lock.attackName} during this turn.` };
        }
        if (lock.mode === 'except' && chosenName === lockedName) {
          return { allowed: false, reason: `This Pokémon can't use ${lock.attackName} during this turn.` };
        }
      }
      if (!attackCostPayable(state, playerId, active, attack)) {
        return { allowed: false, reason: 'Not enough energy attached.' };
      }
      const beforeSteps = parseAttackSteps(attack?.text, { selfName: active.name }).before;
      const handCost = beforeSteps.find((step) => step.type === 'atkDiscardHandEnergy');
      if (handCost && handEnergyForDiscard(player, handCost).length < (handCost.count || 1)) {
        return {
          allowed: false,
          reason: `You need ${handCost.count || 1} ${handCost.energyType ? `{${handCost.energyType}} ` : ''}Energy card(s) in your hand to discard.`,
        };
      }
      const handCardsNeeded = handCardsCostReason(player, beforeSteps);
      if (handCardsNeeded) return { allowed: false, reason: handCardsNeeded };
      return { allowed: true };
    }

    case 'retreat': {
      if (player.flags?.attackerAttacked) {
        return { allowed: false, reason: "Can't retreat after attacking." };
      }
      if (player.flags?.retreatedThisTurn) {
        return { allowed: false, reason: 'Already retreated this turn.' };
      }
      const active = player.zones?.active?.find((c) => !c.attachedTo);
      if (!active) {
        return { allowed: false, reason: 'No active Pokémon to retreat.' };
      }
      if (active.specialCondition === 'Paralyzed') {
        return {
          allowed: false,
          reason: "Paralyzed — this Pokémon can't retreat.",
        };
      }
      if (active.specialCondition === 'Asleep') {
        return {
          allowed: false,
          reason: "Asleep — this Pokémon can't retreat.",
        };
      }
      if (
        active.cannotRetreatUntilTurn &&
        active.cannotRetreatUntilTurn >= (state.turn?.number || 1)
      ) {
        return {
          allowed: false,
          reason: "The Defending Pokémon can't retreat.",
        };
      }
      // Boost Energy: "The Pokémon this card is attached to can't retreat."
      if (hasSpecialEnergyCannotRetreat(inPlayView(state, active), player.zones?.active || [])) {
        return { allowed: false, reason: "This Pokémon's Energy says it can't retreat." };
      }
      // Omastar 151: the opponent's Active can't retreat while the holder is
      // in the Active Spot. The Snorlax wording stops working when its holder
      // is affected by a Special Condition (handled inside the reader).
      if (abilityRetreatLock(active, abilitySideContext(state, playerId))) {
        return {
          allowed: false,
          reason: "The Defending Pokémon can't retreat.",
        };
      }
      if (isStadiumRetreatPrevention(state.stadium?.card || state.stadium)) {
        const stadiumUser = state.stadium?.user ?? state.stadium?.playedBy;
        if (playerId !== stadiumUser) {
          return { allowed: false, reason: 'Stadium prevents retreating.' };
        }
      }
      const benchPokemon = (player.zones?.bench || []).filter(
        (c) => !c.attachedTo
      );
      if (benchPokemon.length === 0) {
        return { allowed: false, reason: 'No bench Pokémon to retreat to.' };
      }
      const retreatCostN = computeEffectiveRetreatCost(state, active, playerId);
      const chosenIds = Array.isArray(payload?.discardEnergyIds)
        ? payload.discardEnergyIds
        : [];
      if (new Set(chosenIds).size !== chosenIds.length) {
        return {
          allowed: false,
          reason: 'Duplicate Energy chosen to discard.',
        };
      }
      if (retreatCostN > 0) {
        // Audit B-4: an explicit discard list is what gets paid, so it — not every
        // attached Energy — is what must cover the cost.
        const attached = (player.zones?.active || []).filter(
          (c) =>
            c.attachedTo === active.instanceId &&
            isEnergy(c) &&
            (chosenIds.length === 0 || chosenIds.includes(c.instanceId))
        );
        if (attached.length !== chosenIds.length && chosenIds.length > 0) {
          return {
            allowed: false,
            reason: 'Only attached Energy can be discarded to retreat.',
          };
        }
        const costSymbols = new Array(retreatCostN).fill('Colorless');
        const energyContext = {
          stadiumCard: state.stadium?.card || state.stadium || null,
          ...energyProvisionContext(state, playerId, active),
        };
        if (
          !canPayAttackCost(
            expandEnergyEntries(
              attached.map((c) => serverEnergyDescriptor(c, energyContext))
            ),
            costSymbols
          )
        ) {
          return {
            allowed: false,
            reason: `Not enough energy to retreat (costs ${retreatCostN}).`,
          };
        }
      }
      return { allowed: true };
    }

    case 'promote': {
      const activePokemon = (player.zones?.active || []).filter(
        (c) => !c.attachedTo
      );
      if (activePokemon.length > 0) {
        return {
          allowed: false,
          reason: 'Active position is already occupied.',
        };
      }
      return { allowed: true };
    }

    case 'takePrizes': {
      const count = payload?.count ?? 1;
      const owed = player.flags?.prizesOwed || 0;
      if (!Number.isInteger(count) || count < 1) {
        return { allowed: false, reason: 'Invalid prize count.' };
      }
      if (count > owed && !tiebreakActive(state)) {
        return {
          allowed: false,
          reason: 'No Knockout has awarded you that many prize cards.',
        };
      }
      if ((player.zones?.prizes?.length || 0) < count) {
        return { allowed: false, reason: 'Not enough prize cards left.' };
      }
      return { allowed: true };
    }

    case 'takePrizesByIndex': {
      const count = payload?.indices?.length || 0;
      if (count > (player.flags?.prizesOwed || 0) && !tiebreakActive(state)) {
        return {
          allowed: false,
          reason: 'No Knockout has awarded you that many prize cards.',
        };
      }
      if ((player.zones?.prizes?.length || 0) < count) {
        return { allowed: false, reason: 'Not enough prize cards left.' };
      }
      return { allowed: true };
    }

    case 'playTrainer': {
      const cardRef = findCard(state, payload.instanceId);
      if (cardRef) {
        const typeStr = String(cardRef.card.type || '').toLowerCase();
        const subStr =
          `${cardRef.card.subtypes || ''} ${cardRef.card.trainerType || ''}`.toLowerCase();
        const isSupporter =
          typeStr.includes('supporter') || subStr.includes('supporter');
        const supportersPlayed =
          player.flags?.supportersPlayedCount ?? (player.flags?.supporterPlayed ? 1 : 0);
        if (
          isSupporter &&
          supportersPlayed >= abilitySupporterLimit(abilitySideContext(state, playerId))
        ) {
          return {
            allowed: false,
            reason: 'Supporter already played this turn.',
          };
        }

        const opponent = Object.values(state.players || {}).find(
          (p) => p.playerId !== playerId
        );
        const blockReason = trainerPlayBlockReason({
          card: cardRef.card,
          turnNumber: state.turn?.number ?? 0,
          myPrizes: (player.zones?.prizes || []).length,
          opponentPrizes: (opponent?.zones?.prizes || []).length,
          stadiumName: state.stadium?.name || null,
          stadiumPlayedThisTurn: Boolean(player.flags?.stadiumPlayedThisTurn),
          handCount: (player.zones?.hand || []).length,
          handNames: (player.zones?.hand || []).map((c) => c?.name || ''),
          benchCount: (player.zones?.bench || []).filter((c) => !c.attachedTo)
            .length,
          opponentBenchCount: (opponent?.zones?.bench || []).filter(
            (c) => !c.attachedTo
          ).length,
          lostZoneCount: (player.zones?.lostZone || []).length,
          opponentActive: opponentActiveTop(opponent),
          koedLastOppTurn: Boolean(player.flags?.koedLastOppTurn),
          koedLastOppTurnVictims: player.flags?.koedLastOppTurnVictims || [],
          ...trainerTargetCounts(
            player,
            ownedCards(player),
            state.turn?.number
          ),
        });
        if (blockReason) return { allowed: false, reason: blockReason };
        // Ability play locks (Gothitelle/Trevenant Items, Copperajah Stadiums,
        // Genesect ACE SPEC, Team Rocket's Arbok Pokémon): the opponent's
        // in-play Abilities, or an "each player" lock, forbid the play.
        const playLock = abilityPlayLocks(
          cardRef.card,
          abilitySideContext(state, playerId)
        );
        if (playLock) return { allowed: false, reason: playLock.reason };
      }
      return { allowed: true };
    }

    case 'useAbility': {
      const cardRef = findCard(state, payload.instanceId);
      if (cardRef && callEnergyStep(cardRef.card)) {
        const reason = callEnergyBlockReason(state, cardRef, playerId);
        return reason ? { allowed: false, reason } : { allowed: true };
      }
      if (cardRef) {
        // One gate for the server and the picker (design 034 slice 3): the
        // once-per-turn flag, activation wording, Pokémon-source suppression,
        // KO window, Active-Spot requirement and the evolve/bench-played
        // windows all live in abilityActivationBlockReason.
        const blockReason = abilityActivationBlockReason(cardRef.card, {
          ...abilitySideContext(state, cardRef.playerId || playerId),
          used: Boolean(
            cardRef.card.abilityUsed ||
              player.flags?.abilitiesUsed?.[cardRef.card.name] ||
              player.flags?.abilitiesUsed?.[cardRef.card.instanceId]
          ),
          abilityIndex: payload?.abilityIndex ?? 0,
          zone: cardRef.zoneId,
          turnNumber: state.turn?.number,
          koedLastOppTurn: Boolean(player.flags?.koedLastOppTurn),
          enteredPlayTurn: cardRef.card.enteredPlayTurn ?? null,
          playedToBenchTurn: cardRef.card.playedToBenchTurn ?? null,
          movedToActiveTurn: cardRef.card.movedToActiveTurn ?? null,
          // Conditions live on the root; the clicked card may be its evolution.
          holderConditions: listConditions(
            cardRef.card.attachedTo != null
              ? findCard(state, cardRef.card.attachedTo)?.card
              : cardRef.card
          ),
        });
        if (blockReason) return { allowed: false, reason: blockReason };
        // "Have no Abilities" Stadiums (Team Rocket's Watchtower, Space Center,
        // Battle Frontier) suppress abilities server-side too; previously the
        // block existed only in the legacy client executors.
        if (
          stadiumAbilityBlockedFor(
            inPlayView(state, cardRef.card),
            state.stadium?.card || state.stadium || null
          )
        ) {
          return {
            allowed: false,
            reason: "This Pokémon's Ability is blocked by the Stadium in play.",
          };
        }
      }
      return { allowed: true };
    }

    case 'stadium-effect': {
      // Ultimate Zone / Saffron City Gym / Celadon City Gym are "as often as …
      // likes" actions, so a prior activation must not block a repeat.
      if (
        player.flags?.stadiumUsedThisTurn &&
        !isRepeatableStadiumAction(state.stadium?.card || state.stadium)
      ) {
        return {
          allowed: false,
          reason: 'Stadium effect already used this turn.',
        };
      }
      if (state.stadium) {
        const opt = parseStadiumOncePerTurn(state.stadium);
        if (opt?.kind === 'search-bench') {
          const bench = player.zones?.bench || [];
          const benchPokemonCount = bench.filter((c) => !c.attachedTo).length;
          if (benchPokemonCount >= 5) {
            return { allowed: false, reason: 'bench_full' };
          }
        }
      }
      return { allowed: true };
    }

    case 'useVStarGX': {
      // Independent once-per-game limits (App. 9/19): the VSTAR Power and the GX
      // attack do not consume each other's allowance. `kind` is inferred from the
      // source card when the sender omits it; a null kind is the legacy fallback
      // (no discriminator and no classifiable card), which checks both allowances.
      const kind = effectiveOncePerGameKind(state, command);
      if (oncePerGameUsed(player, kind)) {
        return {
          allowed: false,
          reason:
            kind === 'gx'
              ? 'Only one GX attack can be used per game.'
              : kind === 'vstar'
                ? 'VSTAR Power already used this game.'
                : 'VSTAR / GX attack or ability already used this game.',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

/**
 * Which once-per-game allowance a `useVStarGX` command spends: the explicit
 * `payload.kind` when the sender provides it, otherwise the source card's
 * subtype (a VSTAR Power vs a GX attack). Returns null when neither is
 * establishable, in which case the legacy both-flags behaviour applies.
 */
function effectiveOncePerGameKind(state, command) {
  const kind = command?.payload?.kind;
  if (kind === 'vstar' || kind === 'gx') return kind;
  const card = findCard(state, command?.payload?.instanceId)?.card;
  if (isVstarCard(card)) return 'vstar';
  if (isGxCard(card)) return 'gx';
  return null;
}

function oncePerGameUsed(player, kind) {
  const used = player?.oncePerGame || player?.flags || {};
  if (kind === 'vstar') return Boolean(used.vstarUsed);
  if (kind === 'gx') return Boolean(used.gxUsed);
  return Boolean(used.vstarUsed || used.gxUsed);
}

/**
 * Whether the game is in a sudden-death tiebreaker where the first Prize card
 * taken wins: either the detected draw's `tiebreak` phase or a fresh tiebreak
 * game flagged by `setupGame({ firstPrizeWins: true })`.
 */
function tiebreakActive(state) {
  return state?.turn?.phase === 'tiebreak' || state?.firstPrizeWins === true;
}

/**
 * The client plays an Item or Supporter by dropping it hand -> 'board', which it sends as a
 * plain moveCard (it has no reliable card type at the drop site). Rewriting that move to
 * playTrainer here, from the server's own card data, is what makes the effect run; deciding
 * it server-side also means a client cannot place a Trainer while skipping its effect.
 * A Tool dropped on the board asks which Pokémon to attach to; a Stadium goes to the Stadium zone.
 *
 * @param {object} state GameState
 * @param {object} command Shape-valid command envelope
 * @returns {object} The playTrainer command, or the original command unchanged
 */
function trainerEffectText(card) {
  return String(card.text || card.effect || card.cardText || '').trim();
}

function promoteTrainerPlay(state, command) {
  if (!state.rulesEnabled) return command;
  const { type, payload, playerId } = command;
  if (
    type !== 'moveCard' ||
    payload.from !== 'hand' ||
    payload.to !== 'board'
  ) {
    return command;
  }
  const cardRef = findCard(state, payload.instanceId);
  if (!cardRef || cardRef.zoneId !== 'hand' || cardRef.playerId !== playerId) {
    return command;
  }
  const card = cardRef.card;
  const kind =
    `${card.type || ''} ${card.trainerType || ''} ${card.subtypes || ''}`.toLowerCase();
  if (!isTrainer(card) && !/item|supporter/.test(kind)) return command;
  // Effect text arrives later via cardStats. Until it does, playTrainer would find no steps
  // and discard the card, so reject the drop until cardStats arrives. A Tool or Stadium
  // needs no text: playTrainer attaches the Tool or places the Stadium.
  if (!/tool|stadium/.test(kind) && !trainerEffectText(card)) {
    return { ...command, pendingDataReason: 'card_data_pending' };
  }
  return {
    ...command,
    type: 'playTrainer',
    payload: { instanceId: payload.instanceId },
  };
}

/**
 * Builds the attack deck-search PendingChoice for the first stage (at or after
 * `fromIndex`) that has at least one legal card in the deck. A staged
 * `searchDeckSequence` is walked one stage per choice so each stage keeps its
 * own filter; collapsing the stages into one list previously left `what`
 * undefined and offered the entire deck. Returns null when no stage matches.
 *
 * @param {object} draft
 * @param {{ playerId: string, oppId: string, attackerId?: number, stages: object[], fromIndex?: number }} params
 * @returns {object|null}
 */
function buildAttackSearchChoice(
  draft,
  { playerId, oppId, attackerId, stages, fromIndex = 0 }
) {
  const player = draft.players[playerId];
  const deck = player?.zones?.deck || [];
  for (let i = fromIndex; i < stages.length; i++) {
    const stage = stages[i] || {};
    const what = stage.what || 'card';
    const dest = stage.destination || 'hand';
    const matches = deck.filter((c) => matchesSearch(c, what));
    if (matches.length === 0) continue;

    let maxCount = stage.count || 1;
    if (dest === 'bench') {
      const benchCount = (player.zones.bench || []).filter(
        (c) => !c.attachedTo
      ).length;
      maxCount = Math.min(maxCount, Math.max(0, 5 - benchCount));
    }
    if (maxCount <= 0) continue;

    return createPendingChoice({
      player: playerId,
      source: 'attack',
      prompt: `Search your deck for up to ${Math.min(maxCount, matches.length)} ${what}.`,
      // src is required for the client's card picker: apply-view's
      // openChoiceInCardPicker only uses the carousel when every option carries
      // art, otherwise it falls back to the face-down grid modal.
      options: matches.map((c) => ({
        instanceId: c.instanceId,
        name: c.name,
        src: c.src || '',
        type: c.type || '',
      })),
      min: 0,
      max: Math.min(maxCount, matches.length),
      resumeToken: {
        effectType: 'attack',
        initiatorPlayerId: playerId,
        oppId,
        attackerId,
        searchStages: stages,
        searchStageIndex: i,
      },
    });
  }
  return null;
}

/**
 * Pure and total command reducer.
 *
 * @param {object} state GameState
 * @param {object} command Command envelope { type, payload, playerId, clientSeq }
 * @param {object} [rng] Optional seeded PRNG
 * @returns {{
 *   state: object,
 *   events: object[],
 *   pendingChoice: object|null,
 *   error?: string|null,
 *   reason?: string
 * }}
 */
/**
 * Candidate groups for a discard-to-scale attack: one per printed "… or …" group
 * (Dragon Burst: all basic {R} or all basic {L}), else the single clause. Only groups
 * with Energy to discard are returned; `max` is capped at the group's card count.
 *
 * @returns {{ cards: object[], max: number, all: boolean, energyType: string|null }[]}
 */
function discardScalingGroups(draft, { playerId, attacker, scaling }) {
  const specs = Array.isArray(scaling.groups) ? scaling.groups : [scaling];
  return specs
    .map((spec) => {
      const cards = discardScalingCandidates(draft, {
        playerId,
        attacker,
        scaling: { ...scaling, ...spec },
      });
      return {
        cards,
        max: Math.min(spec.max, cards.length),
        all: Boolean(spec.all),
        energyType: spec.energyType || null,
      };
    })
    .filter((group) => group.cards.length > 0);
}

// Resume-token form of a discard group: ids and a finite cap (tokens must stay serialisable).
const discardGroupToken = (group) => ({
  ids: group.cards.map((c) => c.instanceId),
  max: group.max,
});

/**
 * Narrows a discard-to-scale selection to ONE printed group ("… or …" forms): the
 * picked group for Dragon Burst's type choice, else the group of the first chosen card,
 * capped at that group's max. Tokens without groups pass the selection through.
 */
function discardScaleSelection(token, selection) {
  const groups = Array.isArray(token.groups) ? token.groups : null;
  if (!groups) return { selection, allowedIds: token.allowedIds || [] };
  if (token.pickGroup) {
    const group = groups[Number((selection || [])[0]) - 1];
    return { selection: group?.ids || [], allowedIds: group?.ids || [] };
  }
  const chosen = selection || [];
  const firstId = chosen.find((id) => groups.some((g) => g.ids.includes(id)));
  const group = groups.find((g) => g.ids.includes(firstId));
  if (!group) return { selection: [], allowedIds: [] };
  const inGroup = [...new Set(chosen)].filter((id) => group.ids.includes(id));
  return { selection: inGroup.slice(0, group.max), allowedIds: group.ids };
}

/**
 * Energy a discard-to-scale attack may discard (Inferno X, Garland Ray,
 * Gholdengo ex): the attached Energy on the Pokémon the printed text names, or
 * the Energy cards in hand, filtered by printed type ({R}) and "basic".
 *
 * @param {object} draft
 * @param {{ playerId: string, attacker: object|null, scaling: object }} params
 * @returns {object[]} Attached Energy cards, in board order
 */
function discardScalingCandidates(draft, { playerId, attacker, scaling }) {
  const player = draft.players[playerId];
  if (!player || !attacker) return [];
  const stadiumCard = draft.stadium?.card || draft.stadium || null;
  const matchesFilter = (card, hostPokemon) => {
    if (!isEnergy(card)) return false;
    if (
      scaling.name &&
      !String(card.name || '').toLowerCase().includes(scaling.name.toLowerCase())
    ) {
      return false;
    }
    if (scaling.basicOnly && !isBasicEnergy(card)) return false;
    if (!scaling.energyType) return true;
    const provided = serverEnergyDescriptor(card, { stadiumCard, hostPokemon });
    return (
      provided.type === scaling.energyType ||
      provided.dualType === scaling.energyType
    );
  };
  if (scaling.source === 'hand') {
    return (player.zones?.hand || []).filter((c) => matchesFilter(c, null));
  }
  const zoneIds =
    scaling.source === 'self'
      ? ['active']
      : scaling.source === 'bench'
        ? ['bench']
        : ['active', 'bench'];
  const candidates = [];
  for (const zoneId of zoneIds) {
    const zone = player.zones?.[zoneId] || [];
    for (const host of zone.filter((c) => !c.attachedTo && isPokemon(c))) {
      if (scaling.source === 'self' && host.instanceId !== attacker.instanceId) {
        continue;
      }
      const hostView = inPlayView(draft, host);
      for (const card of zone) {
        if (card.attachedTo !== host.instanceId) continue;
        if (matchesFilter(card, hostView)) candidates.push(card);
      }
    }
  }
  return candidates;
}

/**
 * Discards the chosen attached Energy for a discard-to-scale attack and returns
 * how many were actually discarded (ids outside `allowedIds` are ignored).
 */
// `destination: 'deck'` (Rocket Splash) shuffles the chosen Energy into the deck instead.
function discardScalingEnergy(draft, { playerId, selection, allowedIds, destination, activeRng, events }) {
  const player = draft.players[playerId];
  let discarded = 0;
  for (const id of new Set(selection || [])) {
    if (!allowedIds.includes(id)) continue;
    const ref = findCard(draft, id);
    if (!ref || ref.playerId !== playerId) continue;
    const zone = player.zones[ref.zoneId];
    const idx = zone.findIndex((c) => c.instanceId === id);
    if (idx < 0) continue;
    const [card] = zone.splice(idx, 1);
    card.attachedTo = null;
    let to = 'deck';
    if (destination === 'deck') player.zones.deck.push(card);
    else to = discardCardToPlayerZone(player, card);
    events.push({
      type: 'cardMoved',
      instanceId: id,
      from: ref.zoneId,
      to,
      playerId,
      reason: destination === 'deck' ? 'attack-energy-shuffle' : 'attack-energy-discard',
    });
    discarded++;
  }
  if (destination === 'deck' && discarded > 0) {
    shuffleDeckWithRng(player, activeRng);
    events.push({ type: 'deckShuffled', playerId });
  }
  return discarded;
}

/**
 * Reveals the top `reveal.count` cards of the attacker's deck, counts the printed kind,
 * and shuffles the deck. Returns the count (0 for an empty deck).
 */
function revealDeckTopForAttack(draft, { playerId, reveal, activeRng, events }) {
  const player = draft.players[playerId];
  const revealed = (player?.zones?.deck || []).slice(0, reveal.count);
  if (revealed.length === 0) return 0;
  events.push({
    type: 'cardsRevealed',
    playerId,
    cards: revealed.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  const matches = revealed.filter((c) => millFilterMatches(c, reveal.filter)).length;
  shuffleDeckWithRng(player, activeRng);
  events.push({ type: 'deckShuffled', playerId });
  return matches;
}

/** True when a discarded deck card is the kind a deck-mill attack counts. */
function millFilterMatches(card, filter) {
  if (!card) return false;
  switch (filter.kind) {
    case 'any':
      return true;
    case 'energy': {
      if (!isEnergy(card)) return false;
      if (filter.basicOnly && !isBasicEnergy(card)) return false;
      if (!filter.energyType) return true;
      const provided = serverEnergyDescriptor(card);
      return (
        provided.type === filter.energyType ||
        provided.dualType === filter.energyType
      );
    }
    case 'pokemon':
      return isPokemon(card);
    case 'supporter':
      return /supporter/i.test(
        `${card.trainerType || ''} ${[].concat(card.subtypes || []).join(' ')}`
      );
    default:
      return String(card.name || '')
        .toLowerCase()
        .includes(String(filter.name || '').toLowerCase());
  }
}

/**
 * Discards from the top of the deck(s) a deck-mill attack names and returns
 * the instanceIds of the discarded cards that match its counted kind.
 */
function millDecksForAttack(draft, { playerId, oppId, mill, count, events }) {
  const playerIds = mill.players === 'each' ? [playerId, oppId] : [playerId];
  const matchedIds = [];
  for (const id of playerIds) {
    const player = draft.players[id];
    const deck = player?.zones?.deck;
    if (!Array.isArray(deck)) continue;
    const toMill =
      mill.keep !== null
        ? Math.max(0, deck.length - mill.keep)
        : Math.min(Math.max(0, count), deck.length);
    for (const card of deck.splice(0, toMill)) {
      if (millFilterMatches(card, mill.filter)) matchedIds.push(card.instanceId);
      const to = discardCardToPlayerZone(player, card);
      events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: 'deck',
        to,
        playerId: id,
        reason: 'attack-mill',
      });
    }
  }
  return matchedIds;
}

/** Moves milled cards still in the discard pile onto `root` (Raikou). */
/**
 * Raises the next "which Benched Pokémon gets an Energy" pick for a spread attach
 * (Aura Jab). Returns false — no choice raised — when nothing is left to attach or
 * no Benched Pokémon exists.
 */
function raiseSpreadAttachChoice(draft, { playerId, attackName, spread, remaining, token }) {
  const player = draft.players[playerId];
  const hasEnergy = (player?.zones?.discard || []).some((c) => matchesSearch(c, spread.search));
  const benched = (player?.zones?.bench || []).filter((c) => !c.attachedTo && isPokemon(c));
  if (remaining <= 0 || !hasEnergy || benched.length === 0) return false;
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: 'attack',
    prompt: `${attackName}: choose a Benched Pokémon for a ${spread.search} card (${remaining} left, none to stop)`,
    options: benched,
    min: 0,
    max: 1,
    resumeToken: { ...token, remaining, spread },
  });
  return true;
}

function attachMilledCards(player, cardIds, root, events) {
  for (const id of cardIds) {
    const card = (player.zones.discard || []).find((c) => c.instanceId === id);
    if (card) attachToRoot(player, card, root, events);
  }
}

/**
 * Energy cards attached to `attacker` that satisfy the printed return-energy
 * type (Mega Greninja ex — Ninja Spinner). A null type matches any Energy.
 */
function attachedEnergyCardsFor(draft, playerId, attacker, energyType) {
  if (!attacker) return [];
  const player = draft.players[playerId];
  const attached = [
    ...(player?.zones?.active || []),
    ...(player?.zones?.bench || []),
  ].filter((c) => c.attachedTo === attacker.instanceId && isEnergy(c));
  if (!energyType) return attached;
  return attached.filter((c) => matchesSearch(c, `${energyType} Energy`));
}

/**
 * Moves one attached Energy card (of `energyType`, or any when null) from the
 * attacker to its owner's hand. Returns true when a card moved. Used by the
 * optional return-energy-for-damage attack (Mega Greninja ex — Ninja Spinner).
 */
function moveAttachedEnergyToHand(draft, { playerId, attacker, energyType, events }) {
  const player = draft.players[playerId];
  if (!player?.zones || !attacker) return false;
  for (const zoneKey of ['active', 'bench']) {
    const zone = player.zones[zoneKey];
    if (!Array.isArray(zone)) continue;
    const idx = zone.findIndex(
      (c) =>
        c.attachedTo === attacker.instanceId &&
        isEnergy(c) &&
        (!energyType || matchesSearch(c, `${energyType} Energy`))
    );
    if (idx === -1) continue;
    const [card] = zone.splice(idx, 1);
    card.attachedTo = null;
    player.zones.hand.push(card);
    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: zoneKey,
      to: 'hand',
      playerId,
      reason: 'attack-return-energy',
    });
    return true;
  }
  return false;
}

/** Shuffles a player's deck with the command RNG (no-op without one). */
function shuffleDeckWithRng(player, rng) {
  if (player?.zones?.deck && rng) player.zones.deck = rng.shuffle(player.zones.deck);
}

/**
 * Rebuilds the attack context an attack-phase PendingChoice suspended, from its
 * resumeToken. Returns null when the attacker or attack is no longer in play.
 */
function attackResumeContext(draft, token, { activeRng, events }) {
  const playerId = token.initiatorPlayerId;
  const attackerPlayer = draft.players[playerId];
  const attacker = attackerPlayer?.zones?.active?.find(
    (c) => !c.attachedTo && c.instanceId === token.attackerId
  );
  if (!attacker) return null;
  const attackerView = attackViewFor(draft, attacker);
  const attack =
    token.copiedAttack || attackerView?.attacks?.find((a) => a?.name === token.attackName);
  if (!attack) return null;
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  let defender = null;
  let defenderPlayerId = oppId;
  if (token.targetInstanceId != null) {
    const targetRef = findCard(draft, token.targetInstanceId);
    defender = targetRef?.card || null;
    if (targetRef?.playerId) defenderPlayerId = targetRef.playerId;
  }
  const { coin = null, headsCount, flips = [] } = token.coinResult || {};
  return {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    coin,
    headsCount,
    flips,
    milledMatches: token.milledMatches,
    revealedMatches: token.revealedMatches,
    copiedAttack: token.copiedAttack || null,
    conditionChecked: token.conditionChecked === true,
    statusConditionsMet: token.statusConditionsMet,
  };
}

/**
 * "Put this Pokémon and all attached cards into your hand." (Meowth ex / Tuck
 * Tail). Runs after damage; the emptied Active is refilled by the command-tail
 * promotion, and a player left with no Pokémon in play loses.
 */
function returnAttackerToHand(draft, { playerId, attacker, oppId, events }) {
  const player = draft.players[playerId];
  const active = player?.zones?.active || [];
  if (!attacker || !active.some((c) => c.instanceId === attacker.instanceId)) {
    return;
  }
  for (let i = active.length - 1; i >= 0; i--) {
    const card = active[i];
    if (card.instanceId !== attacker.instanceId && card.attachedTo !== attacker.instanceId) {
      continue;
    }
    active.splice(i, 1);
    card.attachedTo = null;
    card.damage = 0;
    clearConditions(card);
    player.zones.hand.push(card);
  }
  events.push({
    type: 'cardMoved',
    instanceId: attacker.instanceId,
    from: 'active',
    to: 'hand',
    playerId,
    reason: 'attack-return-self',
  });
  const benchRoots = (player.zones.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
  if (benchRoots.length > 0) {
    player.promotionPending = true;
  } else {
    setGameEnded(draft, { winner: oppId, reason: 'no Pokémon in play', events });
  }
}

// Step kinds that own an attack's heal sentence; the generic self-heal stands down for them.
const HEAL_STEP_TYPES = ['atkHealEach', 'atkHealCounted', 'atkMirrorHeal'];

/**
 * The attack's printed clauses that run as executor steps (design 030), with the attack's
 * own coin result applied: "If heads/tails" steps are dropped on the other face and
 * "For each heads" steps scale their count by the heads flipped.
 */
function planAttackSteps(attack, attacker, { coin, headsCount }) {
  const parsed = parseAttackSteps(attack?.text, { selfName: attacker?.name });
  const resolve = (steps) =>
    resolveCoinGates(steps, { coin, headsCount }).map((step) => ({
      ...step,
      attackName: attack?.name || 'Attack',
    }));
  return {
    before: resolve(parsed.before),
    after: resolve(parsed.after),
    handlesSearch: parsed.handlesSearch,
    // Printed step kinds before the coin gates, so a helper can stand down for a clause
    // the steps own even when the coin dropped it.
    printed: new Set([...parsed.before, ...parsed.after].map((step) => step.type)),
  };
}

/**
 * A step that took the attacker out of play (shuffle into the deck) leaves its Active Spot
 * empty: promote from the Bench, or lose with no Pokémon left in play.
 */
function settleVacatedActive(draft, { playerId, oppId, events }) {
  const player = draft.players[playerId];
  if (!player || (player.zones.active || []).some((c) => !c.attachedTo && isPokemon(c))) return;
  const benchRoots = (player.zones.bench || []).filter((c) => !c.attachedTo && isPokemon(c));
  if (benchRoots.length > 0) {
    player.promotionPending = true;
  } else if (!isGameConcluded(draft)) {
    setGameEnded(draft, { winner: oppId, reason: 'no Pokémon in play', events });
  }
}

/**
 * Runs (or resumes) attack steps through the shared executor. Knock Outs the steps caused
 * are resolved immediately so they count before the turn ends. Returns false while a
 * choice is pending — the `attackSteps` resume continues from the token.
 */
function runAttackSteps(
  draft,
  { steps, fromStepIndex = 0, attackerId, playerId, oppId, activeRng, events, selection = null, context, budget }
) {
  const attacker = attackerId != null ? findCard(draft, attackerId)?.card : null;
  const result = executeSteps(draft, {
    steps,
    fromStepIndex,
    effectType: 'attackSteps',
    sourceCard: attacker || (attackerId != null ? { instanceId: attackerId } : null),
    playerId,
    activeRng,
    events,
    selection,
    context,
    budget,
  });
  resolveDamageCounterKnockouts(draft, { events });
  settleVacatedActive(draft, { playerId, oppId, events });
  if (result.pendingChoice && !isGameConcluded(draft)) {
    draft.pendingChoice = result.pendingChoice;
    return false;
  }
  return true;
}

/**
 * Flips the attack's coins, offers a Glimwood Tangle re-flip, then resolves the effect
 * phase. `copiedAttack` is set when a copy attack chose `attack` (design 031); resume
 * tokens carry it because the copier's own attack list does not hold it.
 */
function flipAndResolveAttack(draft, ctx) {
  const { playerId, activeRng, events, attack, attackerPlayer, atkIdx, targetInstanceId, copiedAttack } = ctx;
  // Printed-text damage (design 013): coin flips first, then the "for each …" scaling
  // the parser resolves from live board counts, then bench/spread damage. Without this
  // every attack dealt its flat printed number regardless of the board (I26 follow-up).
  const coinResult = flipAttackCoins(attack, activeRng);
  const { coin, headsCount, flips } = coinResult;
  if (flips.length > 0) {
    events.push({
      type: 'attackCoinFlipped',
      playerId,
      attackName: attack.name,
      coin,
      headsCount,
      flips,
    });
  }

  // Glimwood Tangle: after any coins are flipped for an attack, the player
  // may ignore the results and re-flip. The choice is offered before any
  // effect resolves, so a re-flip never has to undo damage or a KO.
  // Victini Victory Star (design 034 slice 6) offers the same keep-or-re-flip choice, at
  // most once per turn.
  const glimwood =
    isStadiumGlimwoodReFlip(draft.stadium?.card || draft.stadium) &&
    !attackerPlayer?.flags?.glimwoodUsedThisTurn;
  const victoryStar =
    !glimwood &&
    !attackerPlayer?.flags?.victoryStarUsedThisTurn &&
    abilityVictoryStar(abilitySideContext(draft, playerId));
  if (flips.length > 0 && (glimwood || victoryStar)) {
    draft.pendingChoice = createPendingChoice({
      player: playerId,
      source: glimwood ? 'stadium' : 'ability',
      prompt: `${attack.name}: keep the coin results or re-flip them (${glimwood ? 'Glimwood Tangle' : 'Victory Star'})?`,
      // Numeric sentinels: the choice validator only accepts integer
      // instanceIds. 1 = keep, 2 = re-flip.
      options: [
        { instanceId: 1, name: 'Keep results', type: 'option' },
        { instanceId: 2, name: 'Re-flip coins', type: 'option' },
      ],
      min: 1,
      max: 1,
      resumeToken: {
        effectType: 'glimwood',
        reflipSource: glimwood ? 'glimwood' : 'victoryStar',
        initiatorPlayerId: playerId,
        attackIndex: atkIdx,
        targetInstanceId,
        coinResult,
        ...(copiedAttack ? { copiedAttack } : {}),
      },
    });
    return;
  }

  resolveAttackEffectPhase(draft, { ...ctx, coin, headsCount, flips });
}

const rootsIn = (cards) => (cards || []).filter((c) => !c.attachedTo && isPokemon(c));

/** Where a copy attack looks for attacks to use (design 031). */
function copySourceCards(draft, { copy, playerId, oppId }) {
  const own = draft.players[playerId]?.zones || {};
  const opp = draft.players[oppId]?.zones || {};
  switch (copy.source) {
    case 'ownBench':
      return rootsIn(own.bench).filter((c) => !copy.group || inCopyGroup(c, copy.group));
    case 'ownDiscard':
      return rootsIn(own.discard).filter((c) => (c.types || []).includes(copy.pokemonType));
    case 'oppActive':
      return rootsIn(opp.active);
    case 'oppBench':
      return rootsIn(opp.bench);
    case 'oppInPlay':
      return [...rootsIn(opp.active), ...rootsIn(opp.bench)];
    case 'oppDeckTop':
      return rootsIn((opp.deck || []).slice(0, copy.count));
    default:
      return [];
  }
}

/**
 * The attacks a copy attack may use: every attack on its source cards except other copy
 * attacks, and — when the text requires it — only those the copier has the Energy for.
 */
function copyAttackCandidates(draft, { copy, playerId, oppId, attacker }) {
  const inPlay = copy.source !== 'ownDiscard' && copy.source !== 'oppDeckTop';
  const candidates = [];
  for (const card of copySourceCards(draft, { copy, playerId, oppId })) {
    const attacks = (inPlay ? inPlayView(draft, card) : card)?.attacks || [];
    for (const attack of attacks) {
      if (!attack?.name || parseCopyAttack(attack.text)) continue;
      if (copy.excludeGx && isGxAttack(attack)) continue;
      if (copy.needsEnergy && !attackCostPayable(draft, playerId, attacker, attack)) continue;
      candidates.push({ sourceId: card.instanceId, sourceName: card.name, attack: { ...attack } });
    }
  }
  return candidates;
}

/**
 * Asks which attack a copy attack uses. Returns true while that choice is pending; false
 * when there is nothing to copy, and the copy attack then does only its own text.
 */
function offerCopiedAttack(draft, { copy, playerId, oppId, attacker, atkIdx, targetInstanceId, activeRng, events }) {
  const shuffleOppDeck = copy.source === 'oppDeckTop';
  if (shuffleOppDeck) {
    const looked = (draft.players[oppId]?.zones?.deck || []).slice(0, copy.count);
    events.push({
      type: 'cardsRevealed',
      playerId: oppId,
      cards: looked.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
  }
  const candidates = copyAttackCandidates(draft, { copy, playerId, oppId, attacker });
  if (candidates.length === 0) {
    if (shuffleOppDeck) shuffleDeckWithRng(draft.players[oppId], activeRng);
    events.push({ type: 'attackCopyNothing', playerId, attackerId: attacker?.instanceId ?? null });
    return false;
  }
  // Numeric sentinels: option k (1-based) is candidates[k - 1]; one past them declines.
  const options = candidates.map((c, i) => ({
    instanceId: i + 1,
    name: `${c.sourceName}: ${c.attack.name}`,
    type: 'option',
  }));
  if (copy.optional) {
    options.push({ instanceId: candidates.length + 1, name: "Don't use an attack", type: 'option' });
  }
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: 'attack',
    prompt: 'Choose the attack to use as this attack.',
    options,
    min: 1,
    max: 1,
    resumeToken: {
      effectType: 'attackCopy',
      initiatorPlayerId: playerId,
      attackerId: attacker?.instanceId ?? null,
      attackIndex: atkIdx,
      targetInstanceId,
      candidates,
      shuffleOppDeck,
    },
  });
  return true;
}

/** Resumes a copy attack with the chosen attack (or its own text when declined). */
function resumeCopiedAttack(draft, { token, selection, activeRng, events }) {
  const playerId = token.initiatorPlayerId;
  const attackerPlayer = draft.players[playerId];
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  if (token.shuffleOppDeck) shuffleDeckWithRng(draft.players[oppId], activeRng);
  const attacker = attackerPlayer?.zones?.active?.find(
    (c) => !c.attachedTo && c.instanceId === token.attackerId
  );
  if (!attacker) return;
  const attackerView = attackViewFor(draft, attacker);
  const ownAttack = attackerView?.attacks?.[token.attackIndex ?? 0] || { name: 'Attack', damage: 0 };
  const picked = (token.candidates || [])[Number((selection || [])[0]) - 1];
  const copiedAttack = picked
    ? copiedAttackFor(picked.attack, { sourceName: picked.sourceName, copierName: attacker.name })
    : null;
  if (copiedAttack) {
    events.push({
      type: 'attackCopied',
      playerId,
      attackerId: attacker.instanceId,
      attackName: ownAttack.name,
      copiedName: copiedAttack.name,
      sourceId: picked.sourceId,
    });
  }
  let defender = null;
  let defenderPlayerId = oppId;
  if (token.targetInstanceId != null) {
    const targetRef = findCard(draft, token.targetInstanceId);
    defender = targetRef?.card || null;
    if (targetRef?.playerId) defenderPlayerId = targetRef.playerId;
  } else {
    defender = rootsIn(draft.players[oppId]?.zones?.active)[0] || null;
  }
  flipAndResolveAttack(draft, {
    playerId,
    activeRng,
    events,
    attacker,
    defender,
    defenderPlayerId,
    oppId,
    attack: copiedAttack || ownAttack,
    attackerPlayer,
    attackerView,
    atkIdx: token.attackIndex ?? 0,
    targetInstanceId: token.targetInstanceId ?? null,
    copiedAttack,
  });
}

/** Per status branch: whether its printed board condition holds now (null for other branches). */
function statusConditionResults(draft, ctx, branches) {
  if (!branches.some((branch) => branch.when?.condition)) return [];
  const { attacker, defender, attackerView, playerId, defenderPlayerId, coin, headsCount } = ctx;
  const conditionCtx = buildServerAttackContext(draft, {
    attackerPlayerId: playerId,
    defenderPlayerId,
    attacker,
    defender,
    attackerView,
    defenderView: defender ? inPlayView(draft, defender) : null,
    coin,
    headsCount,
  });
  return branches.map((branch) =>
    branch.when?.condition ? attackConditionMet(branch.when.condition, conditionCtx) : null
  );
}

/**
 * Resolves the part of an attack that runs after its coins are flipped:
 * printed-text damage, recoil, status, bench/spread damage, searches, and the
 * terminal checkup/turn hand-off. Extracted so Glimwood Tangle can re-enter it
 * with a fresh (or kept) coin result without re-running the confusion check.
 *
 * @param {object} draft Cloned GameState
 * @param {object} ctx Derived attack context (see the call site)
 */
function resolveAttackEffectPhase(draft, ctx) {
  const {
    playerId,
    activeRng,
    events,
    attacker,
    defenderPlayerId,
    oppId,
    attack,
    attackerPlayer,
    attackerView,
    coin,
    headsCount,
    flips,
  } = ctx;

  let { defender } = ctx;

  // A printed whole-attack condition ("If …, this attack does nothing", design 036 A1) gates the
  // damage and every effect step, so it resolves before any of them. It runs once per attack:
  // a resumed effect phase carries `conditionChecked` so a before-damage step cannot flip it.
  if (!ctx.conditionChecked) {
    const condition = parseAttackCondition(attack?.text, {
      selfName: attackerView?.name || attacker?.name,
    });
    const conditionCtx =
      condition &&
      buildServerAttackContext(draft, {
        attackerPlayerId: playerId,
        defenderPlayerId,
        attacker,
        defender,
        attackerView,
        defenderView: defender ? inPlayView(draft, defender) : null,
        coin,
        headsCount,
      });
    if (condition && !attackConditionMet(condition, conditionCtx)) {
      events.push({
        type: 'attackConditionFailed',
        playerId,
        attackerId: attacker?.instanceId ?? null,
        attackName: attack.name,
        condition,
      });
      spendGxAttack(draft, { playerId, attacker, attack, events });
      endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
      return;
    }
  }

  // Marks that an attack's effect phase is resolving so on-discard reattach
  // triggers (Boomerang/Burning) fire only for attack-driven discards. Cleared
  // in the applyCommand tail.
  draft.__attackEffectPhase = true;
  // "If … would be Knocked Out by damage from this attack, put that Pokémon and all cards attached
  // to it in the Lost Zone instead of discarding it" (design 036 A12): read by handleKnockout.
  if (LOST_ZONE_KNOCKOUT.test(normalizeAttackText(attack?.text, attackerView?.name || attacker?.name))) {
    draft.__attackLostZoneKnockouts = defenderPlayerId;
  }

  // Conditional status clauses (design 036 A10) read the board before the attack's damage
  // ("already has any damage counters on it"); a resumed effect phase keeps that reading.
  const statusBranches = parseAttackStatusBranches(attack?.text, {
    selfName: attackerView?.name || attacker?.name,
  });
  const statusConditionsMet =
    ctx.statusConditionsMet ?? statusConditionResults(draft, ctx, statusBranches);

  const resumeBase = {
    initiatorPlayerId: playerId,
    attackName: attack.name,
    attackerId: attacker?.instanceId ?? null,
    targetInstanceId: defender?.instanceId ?? null,
    coinResult: { coin, headsCount, flips },
    conditionChecked: true,
    statusConditionsMet,
    ...(ctx.copiedAttack ? { copiedAttack: ctx.copiedAttack } : {}),
  };

  // Deck mill: discard from the top of the deck(s) before damage, counting the
  // printed kind. "Up to N" / "you may" first ask how many (option id = count + 1).
  let milledMatches = ctx.milledMatches;
  let milledIds = [];
  const mill = deckMillScaling(attack?.text);
  if (mill?.lookAndChoose && milledMatches === undefined) {
    // Palossand-GX: pick the counted kind from the top N of the opponent's deck.
    const oppPlayer = draft.players[oppId];
    const looked = (oppPlayer?.zones?.deck || []).slice(0, mill.count);
    const options = looked.filter((c) => millFilterMatches(c, mill.filter));
    if (options.length > 0) {
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: discard any number of these cards from your opponent's deck (${mill.perUnit} damage each).`,
        options: options.map((c) => ({
          instanceId: c.instanceId,
          name: c.name,
          src: c.src || '',
          type: c.type || '',
        })),
        min: 0,
        max: options.length,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackMillPick',
          allowedIds: options.map((c) => c.instanceId),
        },
      });
      return;
    }
    shuffleDeckWithRng(oppPlayer, activeRng);
    milledMatches = 0;
  } else if (mill && milledMatches === undefined) {
    const deckSize = draft.players[playerId]?.zones?.deck?.length || 0;
    let millCount = ctx.millCount ?? mill.count;
    if (ctx.millCount === undefined && (mill.upTo || mill.optional) && deckSize > 0) {
      const counts = mill.upTo
        ? Array.from({ length: Math.min(mill.count, deckSize) + 1 }, (_, k) => k)
        : [0, mill.count];
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: how many cards to discard from the top of the deck?`,
        options: counts.map((k) => ({
          instanceId: k + 1,
          name: k === 0 ? "Don't discard" : `Discard ${k}`,
          type: 'option',
        })),
        min: 1,
        max: 1,
        resumeToken: { ...resumeBase, effectType: 'attackMillCount' },
      });
      return;
    }
    milledIds = millDecksForAttack(draft, {
      playerId,
      oppId,
      mill,
      count: millCount,
      events,
    });
    milledMatches = milledIds.length;
  }

  // Deck reveal (Swampert-EX Mud Flood): reveal the top cards, count the printed kind,
  // shuffle them back. Resume tokens carry the count so a later prompt never re-reveals.
  let revealedMatches = ctx.revealedMatches;
  const deckReveal = deckRevealScaling(attack?.text);
  if (deckReveal && revealedMatches === undefined) {
    revealedMatches = revealDeckTopForAttack(draft, { playerId, reveal: deckReveal, activeRng, events });
  }
  if (revealedMatches !== undefined) resumeBase.revealedMatches = revealedMatches;

  // Discard-to-scale: the player picks which Energy to discard before damage.
  let energyDiscarded = ctx.energyDiscarded;
  const discardScaling = discardEnergyScaling(attack?.text);
  if (discardScaling && energyDiscarded === undefined) {
    const groups = discardScalingGroups(draft, { playerId, attacker, scaling: discardScaling });
    const candidates = groups.flatMap((group) => group.cards);
    const max = Math.max(0, ...groups.map((group) => group.max));
    // "Discard all …" leaves nothing to choose once only one group has Energy to discard.
    if (groups.length === 0) {
      energyDiscarded = 0;
    } else if (groups.length === 1 && groups[0].all) {
      const ids = groups[0].cards.map((c) => c.instanceId);
      energyDiscarded = discardScalingEnergy(draft, {
        playerId,
        selection: ids,
        allowedIds: ids,
        activeRng,
        events,
      });
    } else if (groups.every((group) => group.all)) {
      // Dragon Burst: the player picks which Energy type to discard in full.
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: choose which Energy to discard.`,
        // Numeric sentinels: the choice validator only accepts integer instanceIds.
        options: groups.map((group, index) => ({
          instanceId: index + 1,
          name: `Discard all ${group.cards.length} ${group.energyType || ''} Energy`.replace(/\s+/g, ' '),
          type: 'option',
        })),
        min: 1,
        max: 1,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackDiscardScale',
          pickGroup: true,
          groups: groups.map(discardGroupToken),
          milledMatches,
        },
      });
      return;
    } else if (max > 0) {
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt:
          discardScaling.destination === 'deck'
            ? `${attack.name}: choose Energy to shuffle into your deck (${parseInt(attack.damage, 10) || 0} damage each).`
            : `${attack.name}: choose Energy to discard (${attack.damage || 0} damage each).`,
        options: candidates.map((c) => ({
          instanceId: c.instanceId,
          name: c.name,
          src: c.src || '',
          type: c.type || 'Energy',
        })),
        min: 0,
        max,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackDiscardScale',
          allowedIds: candidates.map((c) => c.instanceId),
          ...(groups.length > 1 ? { groups: groups.map(discardGroupToken) } : {}),
          milledMatches,
          ...(discardScaling.destination ? { destination: discardScaling.destination } : {}),
        },
      });
      return;
    } else {
      energyDiscarded = 0;
    }
  }

  // Optional return-energy-for-damage (Mega Greninja ex — Ninja Spinner): ask
  // before damage so declining still deals the printed base. The Energy moves
  // to hand only when accepted; the +N bonus is resolved by parseAttackDamage
  // from ctx.energyReturned.
  let energyReturned = ctx.energyReturned;
  const returnBonus = returnEnergyBonusClause(attack?.text);
  if (returnBonus && energyReturned === undefined) {
    const candidates = attachedEnergyCardsFor(
      draft,
      playerId,
      attacker,
      returnBonus.energyType
    );
    if (candidates.length > 0) {
      const typeLabel = returnBonus.energyType
        ? `${returnBonus.energyType} Energy`
        : 'Energy';
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: `${attack.name}: return a ${typeLabel} to your hand for ${returnBonus.bonus} more damage?`,
        // Numeric sentinels: the choice validator only accepts integer instanceIds.
        options: [
          {
            instanceId: 1,
            name: `Yes — +${returnBonus.bonus} damage`,
            type: 'option',
          },
          { instanceId: 2, name: 'No', type: 'option' },
        ],
        min: 1,
        max: 1,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackReturnEnergyBonus',
          energyType: returnBonus.energyType,
        },
      });
      return;
    }
    energyReturned = false;
  }

  // "Before doing damage, …" clauses (design 030). A gust there moves the damage to the
  // opponent's new Active Pokémon.
  const attackSteps = planAttackSteps(attack, attacker, { coin, headsCount });
  if (attackSteps.before.length > 0) {
    if (!ctx.preStepsDone) {
      const done = runAttackSteps(draft, {
        steps: attackSteps.before,
        attackerId: attacker?.instanceId,
        playerId,
        oppId,
        activeRng,
        events,
        context: {
          attack: {
            phase: 'before',
            resume: resumeBase,
            values: { energyDiscarded, milledMatches, energyReturned },
          },
        },
      });
      if (!done || isGameConcluded(draft)) return;
    }
    if (attackSteps.before.some((step) => step.type === 'atkGust')) {
      defender =
        draft.players[defenderPlayerId]?.zones?.active?.find((c) => !c.attachedTo) || null;
    }
  }
  // Cards a before-damage Lost Zone cost moved (Rotom V Scrap Short). The cost is those
  // attacks' only before-damage step, so it moves in the command that reaches damage.
  const handDiscarded = attackSteps.before.some(
    (step) => step.countsForDamage && (step.type === 'atkDiscardOwnHand' || step.type === 'atkDiscardHandEnergy')
  )
    ? events
        .filter((e) => e.type === 'cardsDiscarded' && e.forDamage)
        .reduce((total, e) => total + e.cards.length, 0)
    : undefined;
  const lostZoned = attackSteps.before.some((step) => step.countsForDamage)
    ? events
        .filter((e) => e.type === 'cardsLostZoned' && e.forDamage)
        .reduce((total, e) => total + e.count, 0)
    : undefined;

      const parsed = parseAttackDamage(
        attack,
        attackerView,
        defender ? inPlayView(draft, defender) : {},
        buildServerAttackContext(draft, {
          attackerPlayerId: playerId,
          defenderPlayerId,
          attacker,
          defender,
          attackerView,
          defenderView: defender ? inPlayView(draft, defender) : null,
          coin,
          headsCount,
          energyDiscarded,
          milledMatches,
          energyReturned,
          lostZoned,
          handDiscarded,
          revealedMatches,
        })
      );
      const effectiveAttack =
        parsed.total !== parsed.base
          ? { ...attack, damage: parsed.total }
          : attack;
      if (parsed.notes.length > 0) {
        events.push({
          type: 'attackDamageScaled',
          playerId,
          attackName: attack.name,
          base: parsed.base,
          total: parsed.total,
          notes: [...parsed.notes],
          resolved: parsed.resolved,
        });
      }

      let dmgDealt = 0;
      let weaknessApplied = false;
      let stadiumSelfDamage = 0;
      if (attacker && defender) {
        const defenderView = inPlayView(draft, defender);
        const attackerView = inPlayView(draft, attacker);
        const attackerZoneCards = draft.players[playerId]?.zones?.active || [];
        const defenderZoneCards =
          draft.players[defenderPlayerId]?.zones?.active || [];
        const defenderInPlayCards = [
          ...(draft.players[defenderPlayerId]?.zones?.active || []),
          ...(draft.players[defenderPlayerId]?.zones?.bench || []),
        ];
        const defenderPoisoned = hasCondition(defender, 'Poisoned');

        const immunity = parseDamageImmunity(effectiveAttack?.text) || {};
        const abilityReads = attackAbilityReads(draft, {
          attacker: attackerView,
          defender: defenderView,
          playerId,
          defenderPlayerId,
        });
        const dmgResult = computeAttackDamage(
          abilityReads.attacker,
          defenderView,
          effectiveAttack,
          {
            attackerZoneCards,
            defenderZoneCards,
            defenderInPlayCards,
            stadium: draft.stadium,
            defenderIsActive: true,
            ...prizeFlags(draft, playerId, defenderPlayerId),
            defenderPoisoned,
            baseDamage: parseInt(effectiveAttack?.damage, 10) || 0,
            turnDamageBonuses: draft.players[playerId]?.flags?.turnDamageBonuses || [],
            ...immunity,
            ignoreDefenderEffects:
              immunity.ignoreDefenderEffects || abilityReads.ignoreDefenderEffects,
            abilityBonusBeforeWR: abilityReads.abilityBonusBeforeWR,
            abilityReductionBeforeWR: abilityReads.abilityReductionBeforeWR,
            abilityReductionAfterWR: abilityReads.abilityReductionAfterWR,
            abilityPrevention: abilityReads.abilityPrevention,
            weaknessOverride: abilityReads.weaknessOverride,
            defenderMarkers: activeAttackMarkers(draft, defenderPlayerId, defender),
            attackerMarkers: activeAttackMarkers(draft, playerId, attacker),
          }
        );
        dmgDealt = dmgResult.total;
        weaknessApplied = dmgResult.multiplier > 1 || dmgResult.flat > 0;

        // Vermilion City Gym: Lt. Surge's Pokémon flip when attacking. Heads adds
        // 10 damage after Weakness/Resistance when the attack does damage; tails
        // deals 10 to the attacker in addition to the attack. The printed "may
        // flip" is auto-flipped (no optional-coin protocol exists).
        const vermilion = stadiumAttackCoinModifier(
          draft.stadium?.card || draft.stadium,
          { attacker: attackerView }
        );
        if (vermilion) {
          const face = activeRng.next() < 0.5 ? 'heads' : 'tails';
          events.push({ type: 'coinFlipped', playerId, face, source: vermilion.source });
          if (face === 'heads') {
            if (dmgDealt > 0) dmgDealt += vermilion.headsBonus;
          } else {
            stadiumSelfDamage = vermilion.tailsSelfDamage;
          }
        }

        if (dmgResult.prevented) {
          events.push({
            type: 'damagePrevented',
            instanceId: defender.instanceId,
            attackerInstanceId: attacker.instanceId,
            attackName: effectiveAttack?.name,
          });
        }

        // Read before damage lands: a Knock Out takes the markers with the card.
        const defenderMarkers = activeAttackMarkers(draft, defenderPlayerId, defender);
        const retaliations = defenderMarkers.filter((m) => m.kind === 'retaliate');
        const surviveOnHeads = defenderMarkers.some((m) => m.kind === 'surviveKnockOutCoin');

        // Snapshot the reactive Tools before a Knock Out discards them: the "even if
        // Knocked Out" wordings (Team Rocket's Hypnotizer, Handheld Fan) still resolve.
        // On-KO counters on the Attacking Pokémon (Vengeful Punch) resolve here too, but
        // only once the Knock Out happens; the rest of the KO phase is handleKnockout's.
        const reactiveTools = (phase) =>
          dmgDealt > 0 && !dmgResult.prevented
            ? attachedToolOnDamageEffects(defender, defenderZoneCards, {
                stadium: draft.stadium,
                isActive: true,
                phase,
                attacker: inPlayView(draft, attacker),
              })
            : [];
        const reactiveToolEffects = reactiveTools('damage');
        const koCounterToolEffects = reactiveTools('ko').filter((eff) => eff.damageAttacker > 0);
        let defenderKnockedOut = false;

        if (dmgDealt > 0) {
          // Special-energy reactions to being damaged (Spiky/Horror/Dangerous
          // Energy, Lucky Energy). Resolved before the KO sweep so an energy on
          // a Pokémon that is Knocked Out still fires ("even if Knocked Out").
          const defenderZoneRef = findCard(draft, defender.instanceId);
          runSpecialEnergyTriggers(draft, {
            trigger: 'damaged',
            host: defender,
            hostTop: inPlayView(draft, defender),
            hostPlayerId: defenderPlayerId,
            hostZoneId: defenderZoneRef?.zoneId || 'active',
            attacker,
            attackerPlayerId: playerId,
            events,
          });

          const koHp = cardEffectiveHp(draft, defender, defenderPlayerId);
          const wouldKo = koHp > 0 && (defender.damage || 0) + dmgDealt >= koHp;

          if (wouldKo) {
            const koEval = evaluateToolKoPrevention(
              defender,
              defenderZoneCards,
              {
                currentDamage: defender.damage || 0,
                incomingDamage: dmgDealt,
                baseHp: koHp,
                stadium: draft.stadium,
                inHp: true,
                // Focus Band: the flip is consumed only when a coin-flip candidate is
                // actually evaluated, so seeded RNG streams stay untouched otherwise.
                flipCoin: () => (activeRng.next() < 0.5 ? 'heads' : 'tails'),
              }
            );

            if (koEval.coinFace) {
              events.push({ type: 'coinFlipped', playerId: defenderPlayerId, face: koEval.coinFace });
            }
            if (koEval.prevented) {
              defender.damage = koEval.totalDamage;
              events.push({
                type: 'damageUpdated',
                instanceId: defender.instanceId,
                damage: defender.damage,
                dealt: dmgDealt,
                ...(weaknessApplied && { weakness: true }),
              });
              events.push({
                type: 'koPrevented',
                instanceId: defender.instanceId,
                tool: koEval.tool,
                surviveHp: koEval.surviveHp,
              });
              if (koEval.discardOnUse && koEval.toolCard) {
                discardCardFromPlayerZone(
                  draft,
                  koEval.toolCard.instanceId,
                  defenderPlayerId
                );
              }
            } else if (surviveOnHeads && survivesOnCoin(activeRng, defenderPlayerId, events)) {
              // Machamp LV.X Strong-Willed (design 032): heads leaves it at 10 HP.
              defender.damage = koHp - 10;
              events.push({
                type: 'damageUpdated',
                instanceId: defender.instanceId,
                damage: defender.damage,
                dealt: dmgDealt,
                ...(weaknessApplied && { weakness: true }),
              });
              events.push({ type: 'koPrevented', instanceId: defender.instanceId, surviveHp: 10, reason: 'attackMarker' });
            } else {
              defender.damage = (defender.damage || 0) + dmgDealt;
              events.push({
                type: 'damageUpdated',
                instanceId: defender.instanceId,
                damage: defender.damage,
                dealt: dmgDealt,
                ...(weaknessApplied && { weakness: true }),
              });
              defenderKnockedOut = true;
              handleKnockout(draft, {
                victimPlayerId: defenderPlayerId,
                attackerPlayerId: playerId,
                victim: defender,
                events,
                byAttack: true,
                activeRng,
              });
            }
          } else {
            defender.damage = (defender.damage || 0) + dmgDealt;
            events.push({
              type: 'damageUpdated',
              instanceId: defender.instanceId,
              damage: defender.damage,
              dealt: dmgDealt,
              ...(weaknessApplied && { weakness: true }),
            });
          }
        }

        // Reactive tool effects & Thorns on damage (if damage > 0 and not prevented)
        if (dmgDealt > 0 && !dmgResult.prevented && attacker) {
          let thornsDamage = 0;
          const toolEffects = defenderKnockedOut
            ? [...reactiveToolEffects, ...koCounterToolEffects]
            : reactiveToolEffects;
          for (const eff of toolEffects) {
            if (eff.damageAttacker > 0) {
              thornsDamage += eff.damageAttacker * 10;
            }
            if (eff.draw > 0) {
              const defPlayer = draft.players[defenderPlayerId];
              if (defPlayer?.zones?.deck && defPlayer?.zones?.hand) {
                for (
                  let d = 0;
                  d < eff.draw && defPlayer.zones.deck.length > 0;
                  d++
                ) {
                  defPlayer.zones.hand.push(defPlayer.zones.deck.pop());
                }
                events.push({
                  type: 'cardsDrawn',
                  playerId: defenderPlayerId,
                  count: eff.draw,
                  source: eff.tool?.name || 'Tool',
                });
              }
            }
            if (eff.drawUntil > 0) {
              const defPlayer = draft.players[defenderPlayerId];
              const hand = defPlayer?.zones?.hand || [];
              const need = Math.max(0, eff.drawUntil - hand.length);
              const drawn = (defPlayer?.zones?.deck || []).splice(
                0,
                Math.min(need, defPlayer?.zones?.deck?.length || 0)
              );
              hand.push(...drawn);
              if (drawn.length) {
                events.push({
                  type: 'cardsDrawn',
                  playerId: defenderPlayerId,
                  count: drawn.length,
                  source: eff.tool?.name || 'Tool',
                });
              }
            }
            // Team Rocket's Hypnotizer: the Attacking Pokémon is now Asleep.
            if (eff.statusAttacker && attacker) {
              addCondition(attacker, eff.statusAttacker);
              events.push({
                type: 'statusApplied',
                playerId,
                instanceId: attacker.instanceId,
                condition: eff.statusAttacker,
              });
            }
            // Handheld Fan / Rugged Helmet move an Energy off the Attacking Pokémon.
            if (eff.moveEnergyOnKo?.from === 'attacker' && attacker) {
              const attackerZone = draft.players[playerId]?.zones?.active || [];
              const energy = attackerZone.find(
                (c) => c.attachedTo === attacker.instanceId && isEnergy(c)
              );
              const benchZone = firstBenchRootZone(draft, playerId);
              const benchRoot = benchZone?.find((c) => !c.attachedTo) || null;
              const toHand = eff.moveEnergyOnKo.to === 'opponentHand';
              const dest = toHand ? draft.players[playerId]?.zones?.hand : benchZone;
              if (energy && dest) {
                attackerZone.splice(attackerZone.indexOf(energy), 1);
                energy.attachedTo = toHand ? null : benchRoot?.instanceId ?? null;
                dest.push(energy);
                events.push({
                  type: 'cardMoved',
                  instanceId: energy.instanceId,
                  from: 'inPlay',
                  to: toHand ? 'hand' : 'bench',
                  playerId,
                });
              }
            }
            if (eff.discardTool && eff.tool) {
              discardCardFromPlayerZone(
                draft,
                eff.tool.instanceId,
                defenderPlayerId
              );
            }
          }

          // Thorns via the trigger reader: a suppressed holder contributes
          // nothing, and an Active-Spot-only wording is inert off the Active
          // (the defender here is the opponent's Active, so isActive: true).
          const thorns = parseOnDamageAbilities(defender, {
            ...abilitySideContext(draft, defenderPlayerId),
            isActive: true,
          });
          if (thorns?.count > 0) {
            thornsDamage += thorns.count * 10;
          }

          if (thornsDamage > 0) {
            attacker.damage = (attacker.damage || 0) + thornsDamage;
            events.push({
              type: 'damageUpdated',
              instanceId: attacker.instanceId,
              damage: attacker.damage,
              dealt: thornsDamage,
              reason: 'thorns',
            });
            const atkKoHp = cardEffectiveHp(draft, attacker, playerId);
            if (atkKoHp > 0 && attacker.damage >= atkKoHp) {
              handleKnockout(draft, {
                victimPlayerId: playerId,
                attackerPlayerId: defenderPlayerId,
                victim: attacker,
                events,
                byAttack: true,
                activeRng,
              });
            }
          }

          // "… the Attacking Pokémon is now Poisoned" (Qwilfish, Numel, …): after thorns, so
          // an Attacker the thorns Knocked Out is no longer in the Active Spot to receive it.
          const onDamageStatus = parseOnDamageStatus(defender, {
            ...abilitySideContext(draft, defenderPlayerId),
            isActive: true,
          });
          const atkRef = onDamageStatus ? findCard(draft, attacker.instanceId) : null;
          if (atkRef?.zoneId === 'active') {
            let lands = true;
            if (onDamageStatus.coin) {
              const face = flipCoin(activeRng);
              events.push({ type: 'coinFlipped', playerId: defenderPlayerId, face, source: onDamageStatus.source });
              lands = face === 'heads';
            }
            for (const cond of lands ? onDamageStatus.conditions : []) {
              if (addCondition(atkRef.card, cond)) events.push(conditionsUpdatedEvent(atkRef.card, cond));
            }
          }

          applyRetaliation(draft, {
            markers: retaliations,
            dealt: dmgDealt,
            striker: defender,
            strikerView: defenderView,
            strikerPlayerId: defenderPlayerId,
            attacker,
            attackerPlayerId: playerId,
            events,
          });
        }
      }

      // Recoil: printed damage the attack deals to its own Pokémon (plus a
      // Vermilion City Gym tails). A recoil KO hands the prize entitlement to the
      // DEFENDING player.
      const selfDamage = parsed.selfDamage + stadiumSelfDamage;
      if (selfDamage > 0 && attacker) {
        attacker.damage = (attacker.damage || 0) + selfDamage;
        events.push({
          type: 'damageUpdated',
          instanceId: attacker.instanceId,
          damage: attacker.damage,
          dealt: selfDamage,
        });
        const selfKoHp = cardEffectiveHp(draft, attacker, playerId);
        if (selfKoHp > 0 && attacker.damage >= selfKoHp) {
          handleKnockout(draft, {
            victimPlayerId: playerId,
            attackerPlayerId: oppId,
            victim: attacker,
            events,
            byAttack: true,
            activeRng,
          });
        }
      }

      // Healing from attack effect (e.g. "Heal 30 damage from this Pokémon").
      // Dyna Tree Hill suppresses all healing while it is in play.
      // Heal sentences the step templates read (design 036 A6) are the steps' own.
      if (
        parsed.heal > 0 &&
        attacker &&
        !HEAL_STEP_TYPES.some((type) => attackSteps.printed.has(type)) &&
        !stadiumBlocksHealing(draft.stadium)
      ) {
        const atkRef = findCard(draft, attacker.instanceId);
        if (
          atkRef &&
          atkRef.zoneId === 'active' &&
          (attacker.damage || 0) > 0
        ) {
          const healAmount = Math.min(attacker.damage, parsed.heal);
          attacker.damage -= healAmount;
          events.push({
            type: 'damageUpdated',
            instanceId: attacker.instanceId,
            damage: attacker.damage,
            healed: healAmount,
          });
        }
      }

      // Attack Special Conditions (design 014/036): every printed status clause, with the
      // attack's own coin results applied per branch. A chosen condition (Delta Beam) is the
      // atkChooseCondition step's (design 032).
      const { defenderConditions, attackerConditions } = attackSteps.printed.has('atkChooseCondition')
        ? { defenderConditions: [], attackerConditions: [] }
        : statusesFromBranches(statusBranches, {
            coin,
            headsCount,
            flips,
            conditionMet: (condition) =>
              statusConditionsMet[statusBranches.findIndex((branch) => branch.when?.condition === condition)] === true,
          });

      if (defenderConditions.length > 0 && defender) {
        // Only apply condition if defender survived the attack (not KO'd)
        const defRef = findCard(draft, defender.instanceId);
        const defZone = defRef?.player?.zones?.active || [];
        const shielded =
          defRef && hasSpecialEnergyEffectShield(inPlayView(draft, defRef.card), defZone);
        if (defRef && defRef.zoneId === 'active' && !shielded) {
          const defMarkers = activeAttackMarkers(draft, defRef.playerId, defRef.card);
          for (const cond of defenderConditions) {
            if (markersBlockCondition(defMarkers, cond)) continue;
            addCondition(defRef.card, cond);
            events.push(conditionsUpdatedEvent(defRef.card, cond));
          }
        }
      }

      if (attackerConditions.length > 0 && attacker) {
        const atkRef = findCard(draft, attacker.instanceId);
        if (atkRef && atkRef.zoneId === 'active') {
          const atkMarkers = activeAttackMarkers(draft, atkRef.playerId, atkRef.card);
          for (const cond of attackerConditions) {
            if (markersBlockCondition(atkMarkers, cond)) continue;
            addCondition(atkRef.card, cond);
            events.push(conditionsUpdatedEvent(atkRef.card, cond));
          }
        }
      }

      // Spread damage ("… to EACH of your opponent's Benched Pokémon") and single-target bench
      // damage ("… to 1 of your opponent's Benched Pokémon") are the same printed sentence to
      // `parsed.bench`'s looser regex, so a spread attack matches both. Spread wins: applying
      // both would double every benched Pokémon's damage.
      const spread = allBenchDamage(attack.text);

      // A printed clause that lets the player choose which opponent Pokémon take
      // damage / counters. Resolved after the attack's other effects below so a
      // suspension never drops them (design 017 / D19).
      // Design 036 A9: "does N damage to each of your opponent's Pokémon [that …]" hits every
      // matching Pokémon below; the looser bench reading must not also ask for one target.
      const eachDamage = eachPokemonDamage(attack.text);
      let attackTarget = eachDamage ? null : resolveAttackTargetClause(attack.text, parsed, spread);
      // Wugtrio ex / Tricolor Pump: the snipe does its printed amount once per
      // Energy discarded, and nothing when none were.
      if (
        attackTarget?.kind === 'damage' &&
        discardScaling &&
        /damage to \d+ of your opponent's .*for each (?:energy )?card you discard/i.test(
          attack.text || ''
        )
      ) {
        const scaledAmount = attackTarget.amount * (energyDiscarded || 0);
        attackTarget = scaledAmount > 0 ? { ...attackTarget, amount: scaledAmount } : null;
      }
      let benchDealt = 0;

      // Spread damage: the same amount to EVERY benched Pokémon the defender has. The target
      // list is snapshotted first, because a KO inside the loop mutates the bench array.
      if (spread > 0) {
        const targets = benchTargets(draft.players[defenderPlayerId]);
        if (targets.length === 0) {
          events.push({
            type: 'attackBenchFizzled',
            playerId,
            attackName: attack.name,
            reason: 'no-benched-pokemon',
          });
        } else {
          for (const victim of targets) {
            // A previous KO in this same loop (or the active KO above) may already have
            // moved this card to the discard — never damage a card that has left the bench.
            const ref = findCard(draft, victim.instanceId);
            if (ref?.zoneId !== 'bench') continue;
            benchDealt += spread;
            damageBenchedPokemon(draft, {
              victim,
              victimPlayerId: defenderPlayerId,
              attackerPlayerId: playerId,
              attackName: attack.name,
              dealt: spread,
              auto: false,
              activeRng,
              events,
            });
          }
        }
      }

      // The Active takes the damage-each clause through Weakness and Resistance unless the
      // text waives them; the Bench never does.
      if (eachDamage) {
        const victimPlayer = draft.players[defenderPlayerId];
        const zones = victimPlayer?.zones || {};
        const roots = eachDamage.activeOnly
          ? rootsIn(zones.active)
          : [...rootsIn(zones.active), ...rootsIn(zones.bench)];
        const selection = roots
          .filter((root) => eachFilterMatches(victimPlayer, root, eachDamage.filter))
          .map((root) => root.instanceId);
        benchDealt += applyAttackTargets(draft, {
          selection,
          clause: { amount: eachDamage.amount, activeWR: true, immunity: parseDamageImmunity(attack.text) },
          defenderPlayerId,
          attackerPlayerId: playerId,
          attackName: attack.name,
          events,
        });
      }

      // Self-recoil spread ("This attack also does 30 damage to each of your Benched
      // Pokémon"): the attacker's own Bench, and a KO there gives the opponent Prizes.
      const ownSpread = ownBenchDamage(attack.text);
      if (ownSpread > 0) {
        for (const victim of benchTargets(draft.players[playerId])) {
          if (findCard(draft, victim.instanceId)?.zoneId !== 'bench') continue;
          damageBenchedPokemon(draft, {
            victim,
            victimPlayerId: playerId,
            attackerPlayerId: defenderPlayerId,
            attackName: attack.name,
            dealt: ownSpread,
            auto: false,
            ownAttack: true,
            activeRng,
            events,
          });
        }
      }

      // Attack effects: draw cards (e.g. Collect). "Discard your hand and draw N" is the
      // discardHandThenDraw step's (Raging Bolt ex Burst Roar); a printed draw sentence is the
      // atkDraw step's, which keeps its coin gate ("If heads, draw a card").
      const drawN =
        attackSteps.printed.has('discardHandThenDraw') || attackSteps.printed.has('atkDraw') ? 0 : drawCount(attack);
      if (drawN > 0) {
        const deck = attackerPlayer?.zones?.deck || [];
        const hand = attackerPlayer?.zones?.hand || [];
        const actual = Math.min(drawN, deck.length);
        if (actual > 0) {
          const drawn = deck.splice(0, actual);
          hand.push(...drawn);
          events.push({
            type: 'cardsDrawn',
            playerId,
            count: actual,
            cards: drawn.map((c) => ({ instanceId: c.instanceId })),
          });
        }
      }

      // Attack effects: discard energy from attacker (Phase 3)
      // A discard-to-scale attack already discarded the player's picks before damage.
      const energyDiscardSpec = discardScaling ? null : parseAttackEnergyDiscard(effectiveAttack);
      if (energyDiscardSpec && attacker) {
        const attackerZone = draft.players[playerId]?.zones?.active || [];
        const attachedEnergies = attackerZone.filter(
          (c) => c.attachedTo === attacker.instanceId && isEnergy(c)
        );

        const ofType = (energyType) => (c) => {
          if (!energyType) return true;
          const ty = c.energyType || c.name?.replace(/\s*Energy.*/i, '');
          return ty && ty.toLowerCase().includes(energyType.toLowerCase());
        };
        let toDiscard = [];
        if (energyDiscardSpec.all) {
          toDiscard = attachedEnergies;
        } else {
          for (const part of energyDiscardSpec.parts || [energyDiscardSpec]) {
            const picked = attachedEnergies
              .filter((c) => !toDiscard.includes(c))
              .filter(ofType(part.energyType))
              .slice(0, part.count);
            toDiscard.push(...picked);
          }
        }

        for (const card of toDiscard) {
          const idx = draft.players[playerId].zones.active.findIndex(
            (c) => c.instanceId === card.instanceId
          );
          if (idx >= 0) {
            const [discarded] = draft.players[playerId].zones.active.splice(
              idx,
              1
            );
            discarded.attachedTo = null;
            const to = discardCardToPlayerZone(
              draft.players[playerId],
              discarded
            );
            events.push({
              type: 'cardMoved',
              instanceId: card.instanceId,
              from: 'active',
              to,
              playerId,
              reason: 'attack-energy-discard',
            });
          }
        }
      }

      // Attack effects: next-turn locks (Phase 3)
      const locks = parseNextTurnLock(effectiveAttack);
      if (locks) {
        if (locks.selfCannotAttack && attacker) {
          attacker.cannotAttackUntilTurn = (draft.turn.number || 1) + 2;
        } else if (locks.selfCannotUseAttack && attacker) {
          attacker.cannotAttackUntilTurn = (draft.turn.number || 1) + 2;
          attacker.cannotAttackAttackName = locks.selfCannotUseAttack;
        }
        if (locks.oppCannotRetreat && defender) {
          const defRef = findCard(draft, defender.instanceId);
          if (defRef && defRef.zoneId === 'active') {
            defender.cannotRetreatUntilTurn = (draft.turn.number || 1) + 1;
          }
        }
        if (locks.oppCannotAttack && defender) {
          const defRef = findCard(draft, defender.instanceId);
          if (defRef && defRef.zoneId === 'active') {
            // The defender's next turn is the immediate next turn number; the
            // legality gate blocks while `cannotAttackUntilTurn >= turn.number`.
            defender.cannotAttackUntilTurn = (draft.turn.number || 1) + 1;
          }
        }
      }

      // Printed clauses beyond the helpers above (design 030): switch, move Energy, discard
      // from the opponent, attach, mill, Bench placement, … They run before the deck search
      // so a suspension resumes into finishAttackTail.
      const tail = {
        playerId,
        oppId,
        defenderPlayerId,
        defenderId: defender?.instanceId ?? null,
        attackerId: attacker?.instanceId ?? null,
        attack,
        effectiveAttack,
        dmgDealt,
        benchDealt,
        attackTarget,
        milledIds,
        skipSearch: attackSteps.handlesSearch,
        resumeBase,
      };
      if (attackSteps.after.length > 0) {
        const done = runAttackSteps(draft, {
          // Snorlax V Swallow heals the damage this attack just did.
          steps: attackSteps.after.map((step) =>
            step.type === 'atkMirrorHeal' ? { ...step, amount: dmgDealt } : step
          ),
          attackerId: attacker?.instanceId,
          playerId,
          oppId,
          activeRng,
          events,
          context: { attack: { phase: 'after', tail } },
        });
        if (!done) {
          // The attack pauses mid-steps: pay for the Knock Outs already caused, because the
          // resumed tail scans only the events of its own command (design 036 A3).
          grantPrizeOnKoBonus(draft, { playerId, attack: effectiveAttack, events });
          return;
        }
      }
      finishAttackTail(draft, { tail, activeRng, events });
}

/**
 * Whether the attack's deck search runs for this coin result: "If heads, search your deck …"
 * (Manaphy Chase Up) searches only on heads (design 032). An ungated search always runs.
 */
function searchCoinGateOpen(attack, coinResult) {
  const sentence = String(attack?.text || '')
    .toLowerCase()
    .split(/(?<=\.)\s+/)
    .find((s) => s.includes('search your deck for'));
  const gate = /^if (heads|tails),/.exec(sentence || '')?.[1];
  return !gate || coinResult?.coin === gate;
}

/**
 * A3 (design 036): "If your opponent's Pokémon is Knocked Out by damage from this attack,
 * take N more Prize card(s)." The printed clause is not a step — it pays for each of this
 * command's Knock Out events whose victim the clause's filter accepts. Callers run it
 * before `resolveCheckup` (so a checkup Knock Out never pays); the count is floored at the
 * attacker's remaining Prize cards (edge case 10). `paid` carries the victim ids a previous
 * call in the same command already paid, so a tail that grants before and after the
 * chosen-target damage never pays one Knock Out twice.
 */
function grantPrizeOnKoBonus(draft, { playerId, attack, events, paid }) {
  const bonus = parsePrizeOnKo(attack?.text);
  if (!bonus) return;
  const player = draft.players[playerId];
  const prizes = player?.zones?.prizes || [];
  if (!player || prizes.length === 0) return;
  const seen = paid || new Set();
  const victims = events.filter(
    (event) =>
      event.type === 'pokemonKnockedOut' &&
      event.attackerPlayerId === playerId &&
      !seen.has(event.instanceId) &&
      prizeFilterMatches(bonus.filter, event.ruleBoxes)
  );
  if (victims.length === 0) return;
  for (const victim of victims) seen.add(victim.instanceId);
  const count = Math.min(bonus.count * victims.length, prizes.length);
  if (count <= 0) return;
  if (!player.flags) player.flags = {};
  player.flags.prizesOwed = (player.flags.prizesOwed || 0) + count;
  events.push({ type: 'prizeEntitlementGranted', playerId, count });
}

/**
 * The end of an attack: deck search, chosen-target damage, the attackExecuted event, the
 * GX flag, attach-afterwards effects, and the checkup / turn hand-off. Split out so an
 * `attackSteps` suspension can resume into it (design 030). `tail` is plain JSON.
 */
function finishAttackTail(draft, { tail, activeRng, events }) {
      const {
        playerId,
        oppId,
        defenderPlayerId,
        attack,
        effectiveAttack,
        dmgDealt,
        attackTarget,
        milledIds,
        resumeBase,
      } = tail;
      let { benchDealt } = tail;
      const attackerPlayer = draft.players[playerId];
      const attackerRef = tail.attackerId != null ? findCard(draft, tail.attackerId) : null;
      const attacker = attackerRef?.card || null;
      const defender = tail.defenderId != null ? { instanceId: tail.defenderId } : null;
      const mill = deckMillScaling(attack?.text);
      if (isGameConcluded(draft)) return;

      // Attack effects: deck search (Phase 3, e.g. Call for Family)
      const searchClause =
        tail.skipSearch || !searchCoinGateOpen(effectiveAttack, resumeBase?.coinResult)
          ? null
          : parseAttackSearchClause(effectiveAttack);
      let searchTriggered = false;
      if (searchClause && attackerPlayer?.zones?.deck?.length > 0) {
        // A staged clause (searchDeckSequence) is walked one stage per choice so
        // each stage keeps its own filter; treating it as a single clause left
        // `what` undefined and offered the entire deck.
        const stages =
          searchClause.type === 'searchDeckSequence' &&
          Array.isArray(searchClause.stages)
            ? searchClause.stages
            : [searchClause];
        const choice = buildAttackSearchChoice(draft, {
          playerId,
          oppId,
          attackerId: attacker?.instanceId,
          stages,
        });
        if (choice) {
          draft.pendingChoice = choice;
          searchTriggered = true;
        }
      }

      // A3: the printed clause pays for this attack's Knock Outs. This first call covers the
      // printed damage and the before/after steps — including when the chosen-target damage
      // below suspends the attack; the second call covers a target Knock Out applied without
      // a suspension, and `paidKos` keeps the two from paying one Knock Out twice.
      const paidKos = new Set();
      grantPrizeOnKoBonus(draft, { playerId, attack: effectiveAttack, events, paid: paidKos });

      // Chosen-target damage/counters, resolved now (after every other attack
      // effect) so a click-to-select suspension never drops them. The player
      // clicks the target(s) on the mat (design 017 / D19).
      if (attackTarget) {
        const candidates = attackTargetOptions(
          draft,
          defenderPlayerId,
          attackTarget.scope
        );
        if (candidates.length === 0) {
          events.push({
            type: 'attackBenchFizzled',
            playerId,
            attackName: attack.name,
            reason: 'no-target',
          });
        } else {
          const distributable = Boolean(attackTarget.distributable);
          const required = distributable
            ? attackTarget.remaining || 0
            : attackTarget.count;
          const picksFor = (cards) =>
            distributable
              ? new Array(required).fill(cards[0].instanceId)
              : cards.slice(0, attackTarget.count).map((c) => c.instanceId);
          if (
            attackTarget.scope === 'active' ||
            candidates.length <= (distributable ? 1 : attackTarget.count)
          ) {
            benchDealt += applyAttackTargets(draft, {
              selection: picksFor(candidates),
              clause: attackTarget,
              defenderPlayerId,
              attackerPlayerId: playerId,
              attackName: attack.name,
              activeRng,
              events,
            });
          } else if (!searchTriggered) {
            draft.pendingChoice = createPendingChoice({
              player: playerId,
              source: 'attack',
              prompt: distributable
                ? `${attack.name}: Place a damage counter (${required} left)`
                : `${attack.name}: Choose ${attackTarget.count} of your opponent's Pokémon to take damage`,
              options: candidates,
              min: distributable ? 1 : attackTarget.count,
              max: distributable ? 1 : attackTarget.count,
              resumeToken: {
                effectType: 'attack',
                initiatorPlayerId: playerId,
                oppId,
                attackTarget,
                effectiveAttack,
                damage: dmgDealt,
              },
            });
            return;
          } else {
            // A deck-search clause already suspended this attack; apply the target
            // to the first eligible Pokémon rather than overwriting its choice.
            benchDealt += applyAttackTargets(draft, {
              selection: picksFor(candidates),
              clause: attackTarget,
              defenderPlayerId,
              attackerPlayerId: playerId,
              attackName: attack.name,
              activeRng,
              events,
            });
          }
        }
      }

      // A3: a chosen-target Knock Out applied above pays here (the resume path pays its own).
      grantPrizeOnKoBonus(draft, { playerId, attack: effectiveAttack, events, paid: paidKos });

      events.push({
        type: 'attackExecuted',
        attackerId: attacker?.instanceId,
        defenderId: defender?.instanceId,
        attackName: attack.name,
        damage: dmgDealt,
        benchDealt,
        playerId,
      });

      // App. 19: using a GX attack spends the player's single GX attack for the game. Set on the
      // resolving path and on a condition-failed attack; a Confused fizzle never reaches either.
      spendGxAttack(draft, { playerId, attacker, attack, events });

      // Raikou: "Then, attach those {L} Energy cards to 1 of your Pokémon."
      if (mill?.attachMatched && milledIds.length > 0 && !draft.pendingChoice) {
        const ownRoots = [
          ...(attackerPlayer.zones.active || []),
          ...(attackerPlayer.zones.bench || []),
        ].filter((c) => !c.attachedTo && isPokemon(c));
        if (ownRoots.length === 1) {
          attachMilledCards(attackerPlayer, milledIds, ownRoots[0], events);
        } else if (ownRoots.length > 1) {
          draft.pendingChoice = createPendingChoice({
            player: playerId,
            source: 'attack',
            prompt: `${attack.name}: choose 1 of your Pokémon to attach the discarded Energy to`,
            options: ownRoots,
            min: 1,
            max: 1,
            resumeToken: {
              ...resumeBase,
              effectType: 'attackAttachMilled',
              oppId,
              cardIds: milledIds,
            },
          });
          searchTriggered = true;
        }
      }

      // Aura Jab: "Attach up to 3 Basic {F} Energy cards from your discard pile to your
      // Benched Pokémon in any way you like." One Energy per pick so the split is free.
      const benchSpread = attachDiscardToBenchSpread(attack?.text);
      if (benchSpread && !draft.pendingChoice) {
        const resumed = raiseSpreadAttachChoice(draft, {
          playerId,
          attackName: attack.name,
          spread: benchSpread,
          remaining: benchSpread.count,
          token: { ...resumeBase, effectType: 'attackAttachSpread', oppId },
        });
        if (resumed) searchTriggered = true;
      }

      if (/put this pok[ée]mon and all attached cards into your hand/i.test(attack?.text || '')) {
        returnAttackerToHand(draft, { playerId, attacker, oppId, events });
      }

      if (!attackerPlayer.flags) attackerPlayer.flags = {};
      attackerPlayer.flags.attackerAttacked = true;
      attackerPlayer.flags.attacksThisTurn =
        (attackerPlayer.flags.attacksThisTurn || 0) + 1;

      // Extra-attack Ability (Dipplin Festival Lead, Ω Barrage): while a second
      // attack is still legal the turn does not end, so the opponent promotes a
      // new Active and the same Pokémon attacks again.
      const extraRemains =
        attacker &&
        attackerPlayer.flags.attacksThisTurn < 2 &&
        extraAttackAvailable(attacker, {
          stadium: draft.stadium,
          attacksThisTurn: attackerPlayer.flags.attacksThisTurn,
        }).allowed;

      // Auto-end turn after attacking (unless paused by pendingChoice)
      if (!searchTriggered && !extraRemains && !isGameConcluded(draft)) {
        resolveCheckup(draft, {
          rng: activeRng,
          events,
          endingPlayerId: playerId,
        });
        if (!isGameConcluded(draft)) {
          advanceTurn(draft, { nextPlayerId: oppId, events });
        }
      }
}

export function applyCommand(state, command, rng = null) {
  if (!state || typeof state !== 'object') {
    return {
      state: null,
      events: [],
      pendingChoice: null,
      error: 'bad_command',
      reason: 'Invalid state',
    };
  }

  // Step 1: Shape check
  const shapeResult = validateCommandShape(command);
  if (!shapeResult.valid) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'bad_command',
      reason: shapeResult.reason,
    };
  }

  command = promoteTrainerPlay(state, command);
  if (command.pendingDataReason) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'card_data_pending',
      reason: command.pendingDataReason,
    };
  }
  const { type, payload, playerId } = command;
  if (!playerId || typeof playerId !== 'string') {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: 'bad_command',
      reason: 'Missing playerId',
    };
  }

  // Step 2: Turn gate / PendingChoice gate
  if (state.pendingChoice) {
    if (type !== 'resolveChoice') {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'waiting_for_choice',
        reason: `Waiting for choice from player ${state.pendingChoice.player}`,
      };
    }
    // Edge Case 11: Choice resolved by wrong player -> rejected not_your_choice
    if (state.pendingChoice.player !== playerId) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'not_your_choice',
        reason: `Choice must be resolved by player ${state.pendingChoice.player}`,
      };
    }
    if (payload.choiceId && state.pendingChoice.choiceId !== payload.choiceId) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'stale_choice',
        reason: 'Choice ID does not match current pending choice',
      };
    }
  } else if (type === 'resolveChoice') {
    return {
      state,
      events: [],
      pendingChoice: null,
      error: 'no_pending_choice',
      reason: 'There is no pending choice to resolve',
    };
  }

  // Edge Case 12: Selection validation for resolveChoice
  if (type === 'resolveChoice') {
    const selection = payload.selection || [];
    const min = state.pendingChoice.min ?? 0;
    const max = state.pendingChoice.max ?? Infinity;
    if (selection.length < min || selection.length > max) {
      return {
        state,
        events: [],
        pendingChoice: state.pendingChoice,
        error: 'invalid_selection',
        reason: `Selection count (${selection.length}) must be between ${min} and ${max}`,
      };
    }
    const optionIds = new Set(
      (state.pendingChoice.options || []).map((o) => o.instanceId)
    );
    for (const sId of selection) {
      if (!optionIds.has(sId)) {
        return {
          state,
          events: [],
          pendingChoice: state.pendingChoice,
          error: 'invalid_selection',
          reason: `Selected card ${sId} is not in choice options`,
        };
      }
    }
  }

  // Step 3: Reference check (stale client view detection)
  const refResult = validateReferences(state, command);
  if (!refResult.valid) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: refResult.error || 'stale_view',
    };
  }

  // Step 4: Legality check (skipped when rulesEnabled === false)
  const legalityResult = validateLegality(state, command);
  if (!legalityResult.allowed) {
    return {
      state,
      events: [],
      pendingChoice: state.pendingChoice,
      error: legalityResult.reason,
    };
  }

  // Step 5: Apply to cloned draft
  const draft = cloneGameState(state);
  let activeRng = rng || createRng(state.seed || 0);
  if (state.rngCursor && !rng) {
    while (activeRng.cursor < state.rngCursor) {
      activeRng.next();
    }
  }
  // Malamar Contrary / Shiftry Unlucky Wind: the turn player's coin flips are tails. Flips by
  // the other player (surviveKnockOutCoin) and Checkup draw raw RNG, so they are unaffected.
  const turnOpponentId = Object.keys(state.players || {}).find((id) => id !== state.turn?.player);
  if (
    state.turn?.player &&
    turnOpponentId &&
    abilityForcesOpponentTails(abilitySideContext(state, turnOpponentId))
  ) {
    activeRng = withForcedCoin(activeRng, 'tails');
  }
  const events = [];

  switch (type) {
    case 'moveCard': {
      let card = null;
      if (payload.from === 'stadium') {
        card = draft.stadium;
        draft.stadium = null;
      } else {
        const srcZone = draft.players[playerId].zones[payload.from];
        const idx = srcZone.findIndex(
          (c) => c.instanceId === payload.instanceId
        );
        if (idx >= 0) {
          [card] = srcZone.splice(idx, 1);
        }
      }

      if (card) {
        // Special-energy on-discard: Recycle Energy returns to hand instead of
        // the discard pile. (Reattach is attack-only and handled by the effect
        // executor, not this client-driven move.)
        let discardRedirect = null;
        if (
          payload.to === 'discard' &&
          ['active', 'bench'].includes(payload.from) &&
          isEnergy(card) &&
          isSpecialEnergyCard(card) &&
          card.attachedTo != null
        ) {
          const host = findCard(draft, card.attachedTo)?.card;
          const hostRef = host ? findCard(draft, host.instanceId) : null;
          const resolution = resolveSpecialEnergyDiscard(draft, {
            energy: card,
            host,
            hostTop: host ? inPlayView(draft, host) : null,
            hostPlayerId: hostRef?.playerId,
            hostZoneId: hostRef?.zoneId,
            events,
          });
          if (resolution === 'hand') discardRedirect = 'hand';
        }

        if (payload.to === 'stadium') {
          if (draft.stadium && draft.stadium.instanceId !== card.instanceId) {
            discardCurrentStadium(draft, events, playerId);
          }
          card.ownerId = card.ownerId || playerId;
          draft.stadium = card;
          card.attachedTo = null;
          for (const p of Object.values(draft.players || {})) {
            if (p.flags) p.flags.stadiumUsedThisTurn = false;
          }
          // Dropping the Stadium onto the Stadium slot is still "playing a
          // Stadium": without this flag a second Stadium could be played in the
          // same turn, which only the drag path allowed.
          const placing = draft.players[playerId];
          if (placing) {
            if (!placing.flags) placing.flags = {};
            placing.flags.stadiumPlayedThisTurn = true;
          }
        } else if (discardRedirect === 'hand') {
          card.attachedTo = null;
          draft.players[playerId].zones.hand.push(card);
          events.push({
            type: 'cardMoved',
            instanceId: card.instanceId,
            from: payload.from,
            to: 'hand',
            playerId,
          });
        } else {
          const destZone = draft.players[playerId].zones[payload.to];
          if (
            payload.targetIndex != null &&
            payload.targetIndex >= 0 &&
            payload.targetIndex <= destZone.length
          ) {
            destZone.splice(payload.targetIndex, 0, card);
          } else {
            destZone.push(card);
          }

          if (
            ['active', 'bench'].includes(payload.to) &&
            ['hand', 'deck', 'discard'].includes(payload.from)
          ) {
            card.enteredPlayTurn = draft.turn.number;
          }
          // Only a hand→Bench play opens a "when you play onto your Bench" trigger.
          if (payload.from === 'hand' && payload.to === 'bench') {
            card.playedToBenchTurn = draft.turn.number;
            const benchStadium = draft.stadium?.card || draft.stadium;
            for (const effect of stadiumOnBenchTriggers(benchStadium, { pokemon: card })) {
              // Rocket's Minefield Gym: only tails puts the counters on.
              if (effect.coin) {
                const face = activeRng.next() < 0.5 ? 'heads' : 'tails';
                events.push({
                  type: 'coinFlipped',
                  playerId,
                  face,
                  source: effect.source,
                });
                if (face !== effect.coin) continue;
              }
              applyStadiumTriggerEffect(draft, effect, {
                host: card,
                hostPlayerId: playerId,
                events,
              });
            }
          } else {
            delete card.playedToBenchTurn;
          }

          // If moving between active and bench, bring along all attached cards
          if (
            ['active', 'bench'].includes(payload.from) &&
            ['active', 'bench'].includes(payload.to)
          ) {
            clearConditions(card);
            delete card.cannotAttackUntilTurn;
            delete card.cannotAttackAttackName;
            delete card.cannotRetreatUntilTurn;
            clearAttackMarkers(card);
            const srcZone = draft.players[playerId].zones[payload.from];
            for (let i = srcZone.length - 1; i >= 0; i--) {
              if (srcZone[i].attachedTo === card.instanceId) {
                const [attachedChild] = srcZone.splice(i, 1);
                destZone.push(attachedChild);
              }
            }
          }
        }

        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: payload.from,
          to: payload.to,
          targetIndex: payload.targetIndex,
          playerId,
        });
      }
      break;
    }

    case 'draw': {
      const count = payload?.count ?? 1;
      const deck = draft.players[playerId].zones.deck;
      const hand = draft.players[playerId].zones.hand;
      const actualCount = Math.min(count, deck.length);
      const drawnCards = deck.splice(0, actualCount);
      hand.push(...drawnCards);

      events.push({
        type: 'cardsDrawn',
        count: actualCount,
        playerId,
        cards: drawnCards.map((c) => ({ instanceId: c.instanceId })),
      });
      break;
    }

    case 'attachCard': {
      const cardRef = findCard(draft, payload.instanceId);
      const targetRef = findCard(draft, payload.targetInstanceId);
      // Attachment and evolve both land on the stack ROOT (D40): the client addresses the
      // card the player sees, which for a stacked Pokémon is the top Evolution, while every
      // `attachedTo === <root>` lookup and `topPokemonCard` read the Basic. Evolution
      // turn metadata and Special Conditions are per-Pokémon, and conditions live on the
      // root, so they follow the host too. Events keep the payload id the client sent.
      const hostRef =
        findCard(draft, attachmentHostId(draft, payload.targetInstanceId)) ||
        targetRef;

      if (
        cardRef &&
        targetRef &&
        cardRef.playerId === playerId &&
        cardRef.zoneId === 'hand' &&
        isPokemonToolCard(cardRef.card) &&
        chaosGymBlocks(draft, { card: cardRef.card, playerId, activeRng, events })
      ) {
        break;
      }
      if (cardRef && targetRef) {
        // Splice card out of its origin zone
        const srcZone = draft.players[playerId].zones[cardRef.zoneId];
        const idx = srcZone.findIndex(
          (c) => c.instanceId === payload.instanceId
        );
        if (idx >= 0) {
          srcZone.splice(idx, 1);
        }

        // Set attachment pointer
        cardRef.card.attachedTo = hostRef.card.instanceId;

        // Add to the HOST's zone, not the actor's: a Team Flare Hyper Gear is
        // played by you but attaches to the opponent's Pokémon-EX (App. 24).
        const destZone = draft.players[hostRef.playerId].zones[hostRef.zoneId];
        destZone.push(cardRef.card);

        // Update turn energy attachment flag if energy
        if (isEnergy(cardRef.card)) {
          if (!draft.players[playerId].flags) {
            draft.players[playerId].flags = {};
          }
          draft.players[playerId].flags.energyAttached = true;

          // Pokémon Park: attaching an Energy from hand to a Benched Pokémon
          // removes 1 damage counter (once per player per turn).
          const parkStadium = draft.stadium?.card || draft.stadium;
          const attachedToBench =
            hostRef.zoneId === 'bench' ||
            (draft.players[hostRef.playerId]?.zones?.bench || []).includes(
              hostRef.card
            );
          if (
            cardRef.zoneId === 'hand' &&
            attachedToBench &&
            isStadiumEnergyAttachHeal(parkStadium) &&
            !draft.players[playerId].flags.pokemonParkHealedThisTurn
          ) {
            draft.players[playerId].flags.pokemonParkHealedThisTurn = true;
            const before = hostRef.card.damage || 0;
            if (before > 0) {
              hostRef.card.damage = Math.max(0, before - 10);
              events.push({
                type: 'damageUpdated',
                instanceId: hostRef.card.instanceId,
                damage: hostRef.card.damage,
                healed: before - hostRef.card.damage,
              });
            }
            events.push({
              type: 'stadiumTriggered',
              name: 'Pokémon Park',
              instanceId: parkStadium?.instanceId,
              playerId,
            });
          }

          // Energy-attach Ability triggers (Blissey V, Vaporeon, Magearna, …; design 034 I162).
          if (cardRef.zoneId === 'hand' && hostRef.playerId === playerId) {
            applyEnergyAttachTriggers(draft, {
              host: hostRef.card,
              energy: cardRef.card,
              playerId,
              events,
            });
          }
        } else if (isPokemon(cardRef.card)) {
          if (!draft.players[playerId].flags) {
            draft.players[playerId].flags = {};
          }
          if (!draft.players[playerId].flags.evolved) {
            draft.players[playerId].flags.evolved = {};
          }
          draft.players[playerId].flags.evolved[payload.targetInstanceId] =
            true;
          cardRef.card.enteredPlayTurn = draft.turn.number;
          hostRef.card.lastEvolvedTurn = draft.turn.number;
          // Sea of Nothingness: Special Conditions survive evolving.
          if (
            !isStadiumStatusPersistsOnEvolve(
              draft.stadium?.card || draft.stadium
            )
          ) {
            clearConditions(hostRef.card);
          }
          events.push({
            type: 'pokemonEvolved',
            playerId,
            instanceId: payload.instanceId,
            targetInstanceId: payload.targetInstanceId,
          });

          // Special-energy on-evolve triggers (e.g. Regenerative Energy heal). The
          // planner gates on the Pokémon as it was before this card (audit SE11b).
          const evolveZone = draft.players[hostRef.playerId]?.zones?.[hostRef.zoneId] || [];
          runSpecialEnergyTriggers(draft, {
            trigger: 'evolve',
            host: hostRef.card,
            evolvedFrom: topPokemonCard(
              evolveZone.filter((c) => c !== cardRef.card),
              hostRef.card
            ),
            hostPlayerId: hostRef.playerId,
            hostZoneId: hostRef.zoneId,
            events,
          });

          // Stadium on-evolve triggers (Po Town, Galactic HQ, Wyndon, Battle Tower).
          const evolveStadium = draft.stadium?.card || draft.stadium;
          for (const effect of stadiumOnEvolveTriggers(evolveStadium, {
            evolvedCard: cardRef.card,
            hostTop: inPlayView(draft, hostRef.card),
          })) {
            applyStadiumTriggerEffect(draft, effect, {
              host: hostRef.card,
              hostPlayerId: hostRef.playerId,
              events,
            });
          }

          // Opponent-evolves ability trigger (design 034 slice 4).
          applyOnOpponentEvolve(draft, {
            evolvedCard: hostRef.card,
            evolvingPlayerId: hostRef.playerId,
            events,
          });

          // Gen 6 Mega Evolution / Primal Reversion: the evolve ends the turn
          // immediately unless the matching Spirit Link is already attached
          // (rulebook 30c 1.4). The reducer is the authority; the client only
          // mirrored this before.
          const attachedCards = destZone.filter(
            (c) => c.attachedTo === hostRef.card.instanceId
          );
          if (
            requiresTurnEndOnEvolve(cardRef.card, {
              ...hostRef.card,
              attachedCards,
            })
          ) {
            const megaOppId = Object.keys(draft.players || {}).find(
              (id) => id !== playerId
            );
            events.push({
              type: 'turnEndedByMegaEvolve',
              playerId,
              instanceId: payload.instanceId,
            });
            // Ending the turn runs the full between-turns sequence, as every
            // other turn-ending path does. Skipping Pokémon Checkup left Poison/
            // Burn damage, status recovery and end-of-turn effects unapplied.
            if (!isGameConcluded(draft)) {
              resolveCheckup(draft, {
                rng: activeRng,
                events,
                endingPlayerId: playerId,
              });
              if (!isGameConcluded(draft)) {
                advanceTurn(draft, { nextPlayerId: megaOppId, events });
              }
            }
          }
        }

        // A Pokémon attach is an evolution and is announced by `pokemonEvolved`;
        // emitting `cardAttached` too would double-narrate it (design 021).
        if (!isPokemon(cardRef.card)) {
          events.push({
            type: 'cardAttached',
            instanceId: payload.instanceId,
            targetInstanceId: payload.targetInstanceId,
            playerId,
          });
        }

        // Special-energy on-attach triggers (draw/search/heal/damage/switch/
        // devolve/return-basic-energy). A search or switch may suspend the
        // command on a PendingChoice, resumed via resolveChoice.
        if (isEnergy(cardRef.card) && isSpecialEnergyCard(cardRef.card)) {
          runSpecialEnergyTriggers(draft, {
            rng: activeRng,
            trigger: 'attach',
            host: hostRef.card,
            hostTop: inPlayView(draft, hostRef.card),
            hostPlayerId: hostRef.playerId,
            hostZoneId: hostRef.zoneId,
            energy: cardRef.card,
            fromZone: cardRef.zoneId,
            events,
          });
        }

        // Stadium on-attach triggers (Calamitous Snowy Mountain, Frozen City,
        // Old Cemetery, Dawn Stadium, Island Cave) — any Energy from hand.
        if (isEnergy(cardRef.card) && cardRef.zoneId === 'hand') {
          const attachStadium = draft.stadium?.card || draft.stadium;
          for (const effect of stadiumOnAttachTriggers(attachStadium, {
            hostTop: inPlayView(draft, hostRef.card),
            fromZone: cardRef.zoneId,
          })) {
            applyStadiumTriggerEffect(draft, effect, {
              host: hostRef.card,
              hostPlayerId: hostRef.playerId,
              events,
            });
          }
        }
      }
      break;
    }

    case 'addDamageCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        const amount = payload.amount ?? 10;
        cardRef.card.damage = (cardRef.card.damage || 0) + amount;
        events.push({
          type: 'damageUpdated',
          instanceId: payload.instanceId,
          damage: cardRef.card.damage,
        });
      }
      break;
    }

    case 'updateDamageCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.damage = Math.max(0, payload.amount);
        events.push({
          type: 'damageUpdated',
          instanceId: payload.instanceId,
          damage: cardRef.card.damage,
        });
      }
      break;
    }

    case 'removeDamageCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        const amount = payload.amount ?? 10;
        cardRef.card.damage = Math.max(0, (cardRef.card.damage || 0) - amount);
        events.push({
          type: 'damageUpdated',
          instanceId: payload.instanceId,
          damage: cardRef.card.damage,
        });
      }
      break;
    }

    case 'addSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        addCondition(cardRef.card, payload.condition);
        events.push(conditionsUpdatedEvent(cardRef.card, payload.condition));
      }
      break;
    }

    case 'updateSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        if (payload.condition == null) clearConditions(cardRef.card);
        else addCondition(cardRef.card, payload.condition);
        events.push(
          conditionsUpdatedEvent(cardRef.card, payload.condition ?? null)
        );
      }
      break;
    }

    case 'removeSpecialCondition': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        // A named condition removes only that one; no name clears them all.
        if (payload.condition) removeCondition(cardRef.card, payload.condition);
        else clearConditions(cardRef.card);
        events.push(conditionsUpdatedEvent(cardRef.card, null));
      }
      break;
    }

    case 'removeAbilityCounter': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.abilityUsed = false;
        // The turn flag is the other half of the used-check; clearing only the
        // card stamp left the ability refused ("Ability already used this turn")
        // while the counter visibly disappeared from the board.
        const usedFlags = draft.players?.[cardRef.playerId]?.flags?.abilitiesUsed;
        if (usedFlags) {
          if (cardRef.card.instanceId != null) delete usedFlags[cardRef.card.instanceId];
          if (cardRef.card.name != null) delete usedFlags[cardRef.card.name];
        }
        events.push({
          type: 'abilityCounterUpdated',
          instanceId: payload.instanceId,
          abilityUsed: false,
        });
      }
      break;
    }

    case 'changeType': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.type = payload.type;
        events.push({
          type: 'typeChanged',
          instanceId: payload.instanceId,
          cardType: payload.type,
        });
      }
      break;
    }

    case 'rotateCard': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        cardRef.card.rotation = payload.rotation;
        events.push({
          type: 'cardRotated',
          instanceId: payload.instanceId,
          rotation: payload.rotation,
        });
      }
      break;
    }

    case 'playRandomCardFaceDown': {
      const hand = draft.players[playerId].zones.hand;
      const [card] = hand.splice(activeRng.int(hand.length), 1);
      card.faceDown = true;
      card.revealed = false;
      draft.players[playerId].zones.board.push(card);
      events.push({
        type: 'cardPlayedFaceDown',
        instanceId: card.instanceId,
        playerId,
      });
      break;
    }

    case 'setup': {
      const setupResult = setupGame(draft, {
        firstPlayerId: payload?.firstPlayerId,
        rng: activeRng,
      });
      events.push(...setupResult.events);
      break;
    }

    case 'attack': {
      const attackerPlayer = draft.players[playerId];
      const attacker = attackerPlayer?.zones?.active?.find(
        (c) => !c.attachedTo
      );
      const atkIdx = payload?.attackIndex ?? 0;
      const attackerView = attackViewFor(draft, attacker);
      const attack = attackerView?.attacks?.[atkIdx] || {
        name: 'Attack',
        damage: 10,
      };

      const oppId = Object.keys(draft.players || {}).find(
        (id) => id !== playerId
      );
      const defenderPlayer = draft.players[oppId];
      let defender = null;
      let defenderPlayerId = oppId;
      if (payload?.targetInstanceId != null) {
        const targetRef = findCard(draft, payload.targetInstanceId);
        defender = targetRef?.card;
        if (targetRef?.playerId) {
          defenderPlayerId = targetRef.playerId;
        }
      } else {
        defender = defenderPlayer?.zones?.active?.find((c) => !c.attachedTo);
      }

      // Check confused condition
      if (attacker && attacker.specialCondition === 'Confused') {
        const coin = flipCoin(activeRng);
        if (coin === 'tails') {
          attacker.damage = (attacker.damage || 0) + 30;
          events.push({
            type: 'damageUpdated',
            instanceId: attacker.instanceId,
            damage: attacker.damage,
            dealt: 30,
          });
          events.push({
            type: 'attackConfusedFizzle',
            attackerId: attacker.instanceId,
            damage: 30,
            playerId,
          });

          // Check if confused self-damage KO'd attacker
          if (attackerView.hp && attacker.damage >= attackerView.hp) {
            handleKnockout(draft, {
              victimPlayerId: playerId,
              attackerPlayerId: oppId,
              victim: attacker,
              events,
            });
          }

          endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
          break;
        }
      }

      // Octillery Smokescreen Shot / Eevee VMAX G-Max Cuddle (design 032): the marked Pokémon's
      // owner flips when it tries to attack; tails, the attack doesn't happen.
      if (attacker && activeAttackMarkers(draft, playerId, attacker).some((m) => m.kind === 'attackFlipOrFail')) {
        const coin = flipCoin(activeRng);
        events.push({ type: 'attackMarkerCoinFlipped', kind: 'attackFlipOrFail', playerId, coin });
        if (coin === 'tails') {
          events.push({ type: 'attackPrevented', playerId, attackerId: attacker.instanceId, attackName: attack.name });
          endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
          break;
        }
      }

      // Spinda Pattern Distraction (design 034 slice 6): a Basic attacker flips; tails, the
      // attack does nothing.
      if (attacker && abilityAttackFlipGate(attackerView, abilitySideContext(draft, oppId))) {
        const coin = flipCoin(activeRng);
        events.push({ type: 'attackFlipGateCoinFlipped', playerId, coin });
        if (coin === 'tails') {
          events.push({ type: 'attackPrevented', playerId, attackerId: attacker.instanceId, attackName: attack.name });
          endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
          break;
        }
      }

      // A copy attack (design 031) picks the attack it uses before any coin is flipped.
      const targetInstanceId = payload?.targetInstanceId ?? null;
      const copy = parseCopyAttack(attack?.text);
      // Togetic Mini-Metronome: the attack's own coin decides whether there is a copy at all.
      if (copy?.coinGate) {
        const coin = flipCoin(activeRng);
        events.push({
          type: 'attackCoinFlipped',
          playerId,
          attackName: attack.name,
          coin,
          headsCount: coin === 'heads' ? 1 : 0,
          flips: [coin],
        });
        if (coin !== copy.coinGate) {
          endTurnAfterFailedAttack(draft, { playerId, oppId, activeRng, events });
          break;
        }
      }
      if (
        copy &&
        offerCopiedAttack(draft, {
          copy,
          playerId,
          oppId,
          attacker,
          atkIdx,
          targetInstanceId,
          activeRng,
          events,
        })
      ) {
        break;
      }
      flipAndResolveAttack(draft, {
        playerId,
        activeRng,
        events,
        attacker,
        defender,
        defenderPlayerId,
        oppId,
        attack,
        attackerPlayer,
        attackerView,
        atkIdx,
        targetInstanceId,
      });
      break;
    }

    case 'retreat': {
      const player = draft.players[playerId];
      const benchRoots = (player?.zones?.bench || []).filter(
        (c) => !c.attachedTo
      );

      // Mirage Stadium: the retreat costs a coin flip. Tails leaves the Active
      // unable to retreat this turn and no Energy is discarded.
      const mirage = stadiumRetreatCoin(draft.stadium?.card || draft.stadium);
      if (mirage) {
        const activeMon = (player?.zones?.active || []).find((c) => !c.attachedTo);
        const face = activeRng.next() < 0.5 ? 'heads' : 'tails';
        events.push({ type: 'coinFlipped', playerId, face, source: mirage.source });
        if (face === 'tails') {
          if (activeMon) activeMon.cannotRetreatUntilTurn = draft.turn.number;
          events.push({
            type: 'retreatBlocked',
            playerId,
            instanceId: activeMon?.instanceId ?? null,
            source: mirage.source,
          });
          break;
        }
      }

      // 2+ Benched Pokémon and no explicit target: suspend and let the player
      // click the one to switch in (server mat picker, D19). Legality has
      // already guaranteed at least one valid bench target.
      if (payload?.benchInstanceId == null && benchRoots.length > 1) {
        draft.pendingChoice = createPendingChoice({
          player: playerId,
          prompt: 'Retreat: Choose a Benched Pokémon to switch in',
          source: 'retreat',
          options: benchRoots,
          min: 1,
          max: 1,
          stateVersion: draft.stateVersion,
          resumeToken: {
            effectType: 'retreat',
            initiatorPlayerId: playerId,
            discardEnergyIds: Array.isArray(payload?.discardEnergyIds)
              ? payload.discardEnergyIds
              : [],
          },
        });
        break;
      }

      applyRetreatSwap(draft, {
        playerId,
        benchInstanceId: payload?.benchInstanceId ?? null,
        discardEnergyIds: Array.isArray(payload?.discardEnergyIds)
          ? payload.discardEnergyIds
          : [],
        events,
      });
      break;
    }

    case 'pass':
    case 'takeTurn': {
      const oppId = Object.keys(draft.players || {}).find(
        (id) => id !== playerId
      );
      // A pass issued during the sudden-death tiebreak hands the turn over so
      // the opponent can contest the first Prize (1.2). A Checkup that *creates*
      // a tie in this same command must not advance, or the tie would never be
      // resolvable — hence the entry-phase snapshot.
      const wasTiebreak = draft.turn?.phase === 'tiebreak';
      resolveCheckup(draft, {
        rng: activeRng,
        events,
        endingPlayerId: playerId,
      });
      if (wasTiebreak || !isGameConcluded(draft)) {
        advanceTurn(draft, { nextPlayerId: oppId, events });
      }
      break;
    }

    case 'takePrizes': {
      const count = payload?.count ?? 1;
      const player = draft.players[playerId];
      const prizes = player.zones.prizes;
      const hand = player.zones.hand;
      const actualCount = Math.min(count, prizes.length);
      const drawnPrizes = prizes.splice(0, actualCount);
      hand.push(...drawnPrizes);
      consumePrizeEntitlement(player, actualCount);

      events.push({
        type: 'prizesTaken',
        playerId,
        count: actualCount,
        cards: drawnPrizes.map((c) => ({ instanceId: c.instanceId })),
      });

      if (tiebreakActive(draft) && actualCount > 0) {
        setGameEnded(draft, {
          winner: playerId,
          reason: 'tiebreak: first Prize card taken',
          events,
        });
      } else if (prizes.length === 0) {
        setGameEnded(draft, {
          winner: playerId,
          reason: 'all prize cards taken',
          events,
        });
      }
      break;
    }

    case 'takePrizesByIndex': {
      const indices = [...payload.indices].sort((a, b) => b - a);
      const prizes = draft.players[playerId].zones.prizes;
      const hand = draft.players[playerId].zones.hand;
      const taken = [];

      for (const idx of indices) {
        if (idx < prizes.length) {
          const [card] = prizes.splice(idx, 1);
          taken.push(card);
          hand.push(card);
        }
      }
      consumePrizeEntitlement(draft.players[playerId], taken.length);

      events.push({
        type: 'prizesTaken',
        playerId,
        count: taken.length,
        cards: taken.map((c) => ({ instanceId: c.instanceId })),
      });

      if (tiebreakActive(draft) && taken.length > 0) {
        setGameEnded(draft, {
          winner: playerId,
          reason: 'tiebreak: first Prize card taken',
          events,
        });
      } else if (prizes.length === 0) {
        setGameEnded(draft, {
          winner: playerId,
          reason: 'all prize cards taken',
          events,
        });
      }
      break;
    }

    case 'promote': {
      promoteBenchToActive(draft, {
        playerId,
        instanceId: payload.instanceId,
        events,
      });
      break;
    }

    case 'playTrainer': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef) {
        if (chaosGymBlocks(draft, { card: cardRef.card, playerId, activeRng, events })) break;
        executeTrainer(draft, {
          card: cardRef.card,
          playerId,
          activeRng,
          events,
          targetInstanceId: payload.targetInstanceId,
        });
        endTurnAfterTrainer(draft, { card: cardRef.card, playerId, activeRng, events });
      }
      break;
    }

    case 'useAbility': {
      const cardRef = findCard(draft, payload.instanceId);
      if (cardRef && callEnergyStep(cardRef.card)) {
        startCallEnergy(draft, { cardRef, playerId, activeRng, events });
        break;
      }
      if (cardRef) {
        executeAbility(draft, {
          card: cardRef.card,
          abilityIndex: payload.abilityIndex ?? 0,
          playerId,
          activeRng,
          events,
        });
        settleAbilityOutcomes(draft, { events });
        if (isGameConcluded(draft)) break;
        // An ability that shuffles the Active Pokémon into the deck leaves the spot empty.
        if (cardRef.zoneId === 'active' && findCard(draft, payload.instanceId)?.zoneId !== 'active') {
          const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
          settleVacatedActive(draft, { playerId, oppId, events });
        }
      }
      break;
    }

    case 'stadium-effect': {
      const result = executeStadium(draft, {
        playerId,
        activeRng,
        events,
      });
      // Lost World: the activation can win the game outright.
      if (result?.gameWinner && !result.pendingChoice) {
        setGameEnded(draft, {
          winner: result.gameWinner,
          reason: result.gameReason || 'stadium effect',
          events,
        });
      } else if (result?.turnEnds && !result.pendingChoice) {
        // Lumiose City: the activation ends the turn once it resolves.
        endTurnFromEffect(draft, { playerId, activeRng, events });
      }
      break;
    }

    case 'useVStarGX': {
      const kind = effectiveOncePerGameKind(draft, command);
      // `player.oncePerGame` is the single source of truth (App. 9/19); `view.mjs`
      // projects it into the exposed `flags` for the client, so nothing is mirrored here.
      // `kind === null` is the legacy fallback: no discriminator and no classifiable
      // source card, so spend both allowances as before.
      const oncePerGame = ensureOncePerGame(draft, playerId);
      if (kind !== 'gx') {
        if (oncePerGame) oncePerGame.vstarUsed = true;
      }
      if (kind !== 'vstar') {
        if (oncePerGame) oncePerGame.gxUsed = true;
      }
      events.push({
        type: 'vstarUsed',
        playerId,
        instanceId: payload.instanceId,
        kind,
      });
      break;
    }

    case 'resolveChoice': {
      const choice = draft.pendingChoice;
      const token = choice?.resumeToken || {};
      let resumeCard = null;
      let resumeCardOwnerId = null;
      if (token.sourceInstanceId != null) {
        const cardRef = findCard(draft, token.sourceInstanceId);
        resumeCard = cardRef?.card || null;
        resumeCardOwnerId = cardRef?.playerId || null;
      }
      const initiatorPlayerId =
        token.initiatorPlayerId || resumeCardOwnerId || playerId;

      if (token.effectType === 'trainer') {
        executeTrainer(draft, {
          card: resumeCard,
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
        endTurnAfterTrainer(draft, { card: resumeCard, playerId: initiatorPlayerId, activeRng, events });
      } else if (token.effectType === 'ability') {
        executeAbility(draft, {
          card: resumeCard,
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
        settleAbilityOutcomes(draft, { events });
      } else if (token.effectType === CALL_ENERGY_EFFECT) {
        resumeCallEnergy(draft, { token, selection: payload.selection, activeRng, events });
      } else if (token.effectType === PRIZE_ATTACH_EFFECT) {
        resumePrizeAttach(draft, { token, selection: payload.selection, events });
      } else if (token.effectType === PRIZE_BENCH_EFFECT) {
        resumePrizeToBench(draft, { token, selection: payload.selection, activeRng, events });
      } else if (token.effectType === PRIZE_CHOICE_EFFECT) {
        resolvePrizeChoice(draft, {
          playerId: initiatorPlayerId,
          selection: payload.selection || [],
          events,
        });
      } else if (token.effectType === SPECIAL_ENERGY_EFFECT) {
        resumeSpecialEnergyTrigger(draft, {
          rng: activeRng,
          selection: payload.selection || [],
          events,
          resumeToken: token,
        });
      } else if (token.effectType === 'glimwood') {
        // Glimwood Tangle: resume the attack with the kept coin result or a fresh
        // re-flip, then run the remaining effect phase. The confusion check is
        // deliberately skipped — it already resolved before the coins.
        const resumer = draft.players[initiatorPlayerId];
        if (!resumer.flags) resumer.flags = {};
        const pick = (payload.selection || [])[0];
        const wantsReflip = Number(pick) === 2;
        // Victory Star is spent only by a re-flip ("you may"); Glimwood by the offer.
        if (token.reflipSource === 'victoryStar') {
          if (wantsReflip) resumer.flags.victoryStarUsedThisTurn = true;
        } else {
          resumer.flags.glimwoodUsedThisTurn = true;
        }
        const attackIdx = token.attackIndex ?? 0;
        const attacker = resumer?.zones?.active?.find((c) => !c.attachedTo);
        const attackerView = attackViewFor(draft, attacker);
        const attack = token.copiedAttack ||
          attackerView?.attacks?.[attackIdx] || {
            name: 'Attack',
            damage: 10,
          };
        const gOppId = Object.keys(draft.players || {}).find(
          (id) => id !== initiatorPlayerId
        );
        const defenderPlayer = draft.players[gOppId];
        let defender = null;
        let defenderPlayerId = gOppId;
        if (token.targetInstanceId != null) {
          const targetRef = findCard(draft, token.targetInstanceId);
          defender = targetRef?.card;
          if (targetRef?.playerId) defenderPlayerId = targetRef.playerId;
        } else {
          defender = defenderPlayer?.zones?.active?.find((c) => !c.attachedTo);
        }
        const coinResult = wantsReflip
          ? flipAttackCoins(attack, activeRng)
          : token.coinResult;
        const { coin, headsCount, flips } = coinResult;
        if (flips.length > 0) {
          events.push({
            type: 'attackCoinFlipped',
            playerId: initiatorPlayerId,
            attackName: attack.name,
            coin,
            headsCount,
            flips,
            reflip: wantsReflip,
          });
        }
        draft.pendingChoice = null;
        resolveAttackEffectPhase(draft, {
          playerId: initiatorPlayerId,
          activeRng,
          events,
          attacker,
          defender,
          defenderPlayerId,
          oppId: gOppId,
          attack,
          attackerPlayer: resumer,
          attackerView,
          coin,
          headsCount,
          flips,
          copiedAttack: token.copiedAttack || null,
        });
      } else if (token.effectType === 'attackCopy') {
        draft.pendingChoice = null;
        resumeCopiedAttack(draft, { token, selection: payload.selection, activeRng, events });
      } else if (token.effectType === 'attackSteps') {
        // Design 030: finish the attack's steps, then pick the attack up where it paused —
        // before damage (re-enter the effect phase) or after it (the attack tail).
        draft.pendingChoice = null;
        const cont = token.context?.attack || {};
        const oppOfInitiator = Object.keys(draft.players || {}).find(
          (id) => id !== initiatorPlayerId
        );
        const done = runAttackSteps(draft, {
          steps: token.steps || [],
          fromStepIndex: token.stepIndex || 0,
          attackerId: token.sourceInstanceId,
          playerId: initiatorPlayerId,
          oppId: oppOfInitiator,
          activeRng,
          events,
          selection: payload.selection,
          context: token.context || {},
          budget: { count: token.budgetCount || 0 },
        });
        if (done && !isGameConcluded(draft)) {
          if (cont.phase === 'before') {
            const resumeCtx = attackResumeContext(draft, cont.resume || {}, { activeRng, events });
            if (resumeCtx) {
              resolveAttackEffectPhase(draft, {
                ...resumeCtx,
                ...(cont.values || {}),
                preStepsDone: true,
              });
            } else {
              // The attacker left the Active Spot before damage: the attack ends here.
              const resumer = draft.players[initiatorPlayerId];
              if (!resumer.flags) resumer.flags = {};
              resumer.flags.attackerAttacked = true;
              resolveCheckup(draft, { rng: activeRng, events, endingPlayerId: initiatorPlayerId });
              if (!isGameConcluded(draft)) {
                advanceTurn(draft, { nextPlayerId: oppOfInitiator, events });
              }
            }
          } else if (cont.tail) {
            finishAttackTail(draft, { tail: cont.tail, activeRng, events });
          }
        }
      } else if (token.effectType === 'attackDiscardScale') {
        // Discard-to-scale: discard the chosen Energy, then resume the attack's
        // effect phase with the discarded count driving the damage.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const { selection, allowedIds } = discardScaleSelection(token, payload.selection);
          const energyDiscarded = discardScalingEnergy(draft, {
            playerId: initiatorPlayerId,
            selection,
            allowedIds,
            destination: token.destination,
            activeRng,
            events,
          });
          resolveAttackEffectPhase(draft, { ...resumeCtx, energyDiscarded });
        }
      } else if (token.effectType === 'attackReturnEnergyBonus') {
        // Ninja Spinner: move the chosen Energy to hand (yes) or keep it (no),
        // then resume the attack with the bonus decision settled.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const accepted = Number((payload.selection || [])[0]) === 1;
          const moved =
            accepted &&
            moveAttachedEnergyToHand(draft, {
              playerId: initiatorPlayerId,
              attacker: resumeCtx.attacker,
              energyType: token.energyType,
              events,
            });
          resolveAttackEffectPhase(draft, {
            ...resumeCtx,
            energyReturned: Boolean(moved),
          });
        }
      } else if (token.effectType === 'attackMillPick') {
        // Palossand-GX: discard the chosen cards from the opponent's deck, then
        // the opponent shuffles the rest back.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const oppPlayer = draft.players[resumeCtx.oppId];
          const deck = oppPlayer?.zones?.deck || [];
          let picked = 0;
          for (const id of new Set(payload.selection || [])) {
            if (!(token.allowedIds || []).includes(id)) continue;
            const idx = deck.findIndex((c) => c.instanceId === id);
            if (idx < 0) continue;
            const [card] = deck.splice(idx, 1);
            const to = discardCardToPlayerZone(oppPlayer, card);
            events.push({
              type: 'cardMoved',
              instanceId: id,
              from: 'deck',
              to,
              playerId: resumeCtx.oppId,
              reason: 'attack-mill',
            });
            picked++;
          }
          shuffleDeckWithRng(oppPlayer, activeRng);
          resolveAttackEffectPhase(draft, { ...resumeCtx, milledMatches: picked });
        }
      } else if (token.effectType === 'attackAttachSpread') {
        // Aura Jab: attach one Energy to the picked Benched Pokémon, then ask again
        // until the count is spent or the player stops; then end the turn.
        draft.pendingChoice = null;
        const player = draft.players[initiatorPlayerId];
        const pick = (payload.selection || [])[0];
        const root = (player?.zones?.bench || []).find(
          (c) => !c.attachedTo && c.instanceId === pick
        );
        let remaining = token.remaining;
        if (player && root) {
          const energy = (player.zones.discard || []).find((c) =>
            matchesSearch(c, token.spread.search)
          );
          if (energy) {
            attachToRoot(player, energy, root, events);
            remaining -= 1;
          }
        } else {
          remaining = 0;
        }
        const asked =
          !isGameConcluded(draft) &&
          raiseSpreadAttachChoice(draft, {
            playerId: initiatorPlayerId,
            attackName: token.attackName,
            spread: token.spread,
            remaining,
            token: {
              initiatorPlayerId: token.initiatorPlayerId,
              attackName: token.attackName,
              attackerId: token.attackerId,
              targetInstanceId: token.targetInstanceId,
              coinResult: token.coinResult,
              effectType: 'attackAttachSpread',
              oppId: token.oppId,
            },
          });
        if (!asked && !isGameConcluded(draft)) {
          resolveCheckup(draft, {
            rng: activeRng,
            events,
            endingPlayerId: initiatorPlayerId,
          });
          if (!isGameConcluded(draft)) {
            advanceTurn(draft, { nextPlayerId: token.oppId, events });
          }
        }
      } else if (token.effectType === 'attackAttachMilled') {
        // Raikou: attach the milled Energy to the chosen Pokémon, then end the turn
        // the attack's suspension held open.
        draft.pendingChoice = null;
        const player = draft.players[initiatorPlayerId];
        const root = [
          ...(player?.zones?.active || []),
          ...(player?.zones?.bench || []),
        ].find(
          (c) => !c.attachedTo && c.instanceId === (payload.selection || [])[0]
        );
        if (player && root) {
          attachMilledCards(player, token.cardIds || [], root, events);
        }
        if (!isGameConcluded(draft)) {
          resolveCheckup(draft, {
            rng: activeRng,
            events,
            endingPlayerId: initiatorPlayerId,
          });
          if (!isGameConcluded(draft)) {
            advanceTurn(draft, { nextPlayerId: token.oppId, events });
          }
        }
      } else if (token.effectType === 'attackMillCount') {
        // Deck mill "up to N" / "you may": option id = count + 1.
        draft.pendingChoice = null;
        const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
        if (resumeCtx) {
          const pick = Number((payload.selection || [])[0]);
          const millCount = Number.isInteger(pick) && pick > 0 ? pick - 1 : 0;
          resolveAttackEffectPhase(draft, { ...resumeCtx, millCount });
        }
      } else if (token.effectType === 'retreat') {
        // The player clicked the Benched Pokémon to switch in; pay the retreat
        // cost and perform the swap (retreat does not end the turn).
        applyRetreatSwap(draft, {
          playerId: initiatorPlayerId,
          benchInstanceId: (payload.selection || [])[0] ?? null,
          discardEnergyIds: token.discardEnergyIds || [],
          events,
        });
        draft.pendingChoice = null;
      } else if (token.effectType === 'promote') {
        // Active-KO promotion: the player clicked the Benched Pokémon to promote.
        // `settlePromotionChoices` in the command tail continues any prize settlement.
        promoteBenchToActive(draft, {
          playerId: initiatorPlayerId,
          instanceId: (payload.selection || [])[0],
          events,
        });
        draft.pendingChoice = null;
      } else if (token.effectType === 'koEnergy') {
        // Energy-move-on-KO: the player picked the target for the first pending
        // obligation. Queue the rest so the tail (or the next picker) runs them.
        draft.pendingChoice = null;
        const player = draft.players[initiatorPlayerId];
        const pending = Array.isArray(token.obligations)
          ? [...token.obligations]
          : [];
        const obligation = pending.shift();
        if (player && obligation) {
          const target = koEnergyTargets(player, obligation).find(
            (c) => c.instanceId === (payload.selection || [])[0]
          );
          if (target) moveKoEnergy(player, target, obligation, events);
        }
        draft.__koEnergyMoves = pending;
      } else if (token.effectType === 'stadium') {
        const result = executeStadium(draft, {
          playerId: initiatorPlayerId,
          activeRng,
          events,
          selection: payload.selection,
          resumeToken: token,
        });
        if (result?.gameWinner && !result.pendingChoice) {
          setGameEnded(draft, {
            winner: result.gameWinner,
            reason: result.gameReason || 'stadium effect',
            events,
          });
        } else if (result?.turnEnds && !result.pendingChoice) {
          endTurnFromEffect(draft, {
            playerId: initiatorPlayerId,
            activeRng,
            events,
          });
        }
      } else if (token.effectType === 'attack') {
        // Chosen-target attack: the player clicked the opponent Pokémon to damage.
        // The rest of the attack's effects already ran before the suspension.
        if (token.attackTarget) {
          const targetPlayer = draft.players[initiatorPlayerId];
          const selection = Array.isArray(payload.selection)
            ? payload.selection
            : [];
          const dealt = applyAttackTargets(draft, {
            selection,
            clause: token.attackTarget,
            defenderPlayerId: token.oppId,
            attackerPlayerId: initiatorPlayerId,
            attackName: token.effectiveAttack?.name || '',
            activeRng,
            events,
          });
          // A3: the chosen target may be the Knock Out the printed clause pays for.
          grantPrizeOnKoBonus(draft, {
            playerId: initiatorPlayerId,
            attack: token.effectiveAttack,
            events,
          });
          // "in any way you like": one counter per click until all are placed.
          const remaining = token.attackTarget.distributable
            ? (token.attackTarget.remaining || 1) - 1
            : 0;
          if (remaining > 0) {
            const options = attackTargetOptions(draft, token.oppId, 'any');
            if (options.length > 0) {
              draft.pendingChoice = createPendingChoice({
                player: initiatorPlayerId,
                source: 'attack',
                prompt: `${token.effectiveAttack?.name || 'Attack'}: Place a damage counter (${remaining} left)`,
                options,
                min: 1,
                max: 1,
                resumeToken: {
                  ...token,
                  attackTarget: { ...token.attackTarget, remaining },
                },
              });
              break;
            }
          }
          draft.pendingChoice = null;
          events.push({
            type: 'attackExecuted',
            attackerId: targetPlayer?.zones?.active?.find((c) => !c.attachedTo)
              ?.instanceId,
            attackName: token.effectiveAttack?.name,
            damage: token.damage || 0,
            benchDealt: dealt,
            playerId: initiatorPlayerId,
          });
          // The suspended attack was a GX attack; spend the limit on resolution too.
          if (isGxAttack(token.effectiveAttack)) {
            const oncePerGame = ensureOncePerGame(draft, initiatorPlayerId);
            if (oncePerGame && !oncePerGame.gxUsed) {
              oncePerGame.gxUsed = true;
              events.push({
                type: 'gxAttackUsed',
                playerId: initiatorPlayerId,
                attackName: token.effectiveAttack?.name,
              });
            }
          }
          if (targetPlayer) {
            if (!targetPlayer.flags) targetPlayer.flags = {};
            targetPlayer.flags.attackerAttacked = true;
          }
          if (!isGameConcluded(draft)) {
            resolveCheckup(draft, {
              rng: activeRng,
              events,
              endingPlayerId: initiatorPlayerId,
            });
            if (!isGameConcluded(draft)) {
              advanceTurn(draft, { nextPlayerId: token.oppId, events });
            }
          }
          break;
        }
        const player = draft.players[initiatorPlayerId];
        const selection = Array.isArray(payload.selection)
          ? payload.selection
          : [];
        const stages = Array.isArray(token.searchStages)
          ? token.searchStages
          : token.searchParams
            ? [token.searchParams]
            : [];
        const currentIndex = token.searchStageIndex ?? 0;
        const stage = stages[currentIndex] || stages[0] || {};
        const dest = stage.destination || 'hand';
        // "attach it to this Pokémon" (Charge): the searched Energy goes onto the
        // attacker, not into hand. Falls back to the active Pokémon when the
        // attacker id is missing.
        const attachTarget =
          dest === 'attach'
            ? token.attackerId != null
              ? findCard(draft, token.attackerId)?.card ||
                player.zones.active?.find((c) => !c.attachedTo)
              : player.zones.active?.find((c) => !c.attachedTo)
            : null;

        for (const sel of selection) {
          const instId = typeof sel === 'object' ? sel.instanceId : sel;
          const idx = player.zones.deck.findIndex(
            (c) => c.instanceId === instId
          );
          if (idx >= 0) {
            const [card] = player.zones.deck.splice(idx, 1);
            if (dest === 'attach' && attachTarget) {
              card.enteredPlayTurn = draft.turn.number;
              attachToRoot(player, card, attachTarget, events);
            } else if (dest === 'bench') {
              card.enteredPlayTurn = draft.turn.number;
              player.zones.bench.push(card);
              events.push({
                type: 'cardMoved',
                instanceId: card.instanceId,
                from: 'deck',
                to: 'bench',
                playerId: initiatorPlayerId,
              });
            } else {
              player.zones.hand.push(card);
              events.push({
                type: 'cardMoved',
                instanceId: card.instanceId,
                from: 'deck',
                to: 'hand',
                playerId: initiatorPlayerId,
              });
            }
          }
        }

        // A staged search resumes with the next stage that still has a match;
        // only after the final stage does the deck shuffle and the turn end.
        const nextChoice = buildAttackSearchChoice(draft, {
          playerId: initiatorPlayerId,
          oppId: token.oppId,
          attackerId: token.attackerId,
          stages,
          fromIndex: currentIndex + 1,
        });
        if (nextChoice) {
          draft.pendingChoice = nextChoice;
          break;
        }

        player.zones.deck = activeRng.shuffle(player.zones.deck);
        events.push({
          type: 'zoneShuffled',
          zoneId: 'deck',
          playerId: initiatorPlayerId,
        });

        draft.pendingChoice = null;

        if (!isGameConcluded(draft)) {
          resolveCheckup(draft, {
            rng: activeRng,
            events,
            endingPlayerId: initiatorPlayerId,
          });
          if (!isGameConcluded(draft)) {
            advanceTurn(draft, { nextPlayerId: token.oppId, events });
          }
        }
      } else {
        draft.pendingChoice = null;
      }
      break;
    }

    // --- Zone ops (design 002 slice 3.4a). Shuffles always use the server's own
    // activeRng (Fisher-Yates), never a client-supplied order — a client picking its own
    // shuffle would be able to stack its own deck. ---

    case 'shuffleIntoDeck': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      if (payload.index >= 0 && payload.index < srcZone.length) {
        const [card] = srcZone.splice(payload.index, 1);
        player.zones.deck.push(card);
        player.zones.deck = activeRng.shuffle(player.zones.deck);
        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: payload.from,
          to: 'deck',
          playerId,
        });
        events.push({ type: 'zoneShuffled', zoneId: 'deck', playerId });
      }
      break;
    }

    case 'moveToDeckTop': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      if (payload.index >= 0 && payload.index < srcZone.length) {
        const [card] = srcZone.splice(payload.index, 1);
        player.zones.deck.unshift(card);
        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: payload.from,
          to: 'deck',
          targetIndex: 0,
          playerId,
        });
      }
      break;
    }

    case 'switchWithDeckTop': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      const deck = player.zones.deck;
      if (
        payload.index >= 0 &&
        payload.index < srcZone.length &&
        deck.length > 0
      ) {
        const [card] = srcZone.splice(payload.index, 1);
        const [topCard] = deck.splice(0, 1);
        deck.unshift(card);
        srcZone.splice(payload.index, 0, topCard);
        events.push({
          type: 'cardsSwapped',
          deckInstanceId: card.instanceId,
          zoneInstanceId: topCard.instanceId,
          zoneId: payload.from,
          playerId,
        });
      }
      break;
    }

    case 'shuffleZone': {
      const player = draft.players[playerId];
      player.zones[payload.zoneId] = activeRng.shuffle(
        player.zones[payload.zoneId]
      );
      events.push({ type: 'zoneShuffled', zoneId: payload.zoneId, playerId });
      break;
    }

    case 'shuffleBottom': {
      const player = draft.players[playerId];
      const moved = activeRng.shuffle(player.zones[payload.zoneId].splice(0));
      player.zones.deck.push(...moved);
      events.push({
        type: 'zoneMovedToDeckBottom',
        zoneId: payload.zoneId,
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'shuffleAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      player.zones.deck.push(...moved);
      player.zones.deck = activeRng.shuffle(player.zones.deck);
      events.push({
        type: 'zoneShuffledIntoDeck',
        zoneId: payload.zoneId,
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'discardAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      // Prism Star cards route to the Lost Zone (App. 17); the rest to discard.
      const routed = { discard: 0, lostZone: 0 };
      for (const card of moved) routed[discardCardToPlayerZone(player, card)]++;
      if (routed.discard > 0) {
        events.push({
          type: 'zoneMoved',
          from: payload.zoneId,
          to: 'discard',
          count: routed.discard,
          playerId,
        });
      }
      if (routed.lostZone > 0) {
        events.push({
          type: 'zoneMoved',
          from: payload.zoneId,
          to: 'lostZone',
          count: routed.lostZone,
          playerId,
        });
      }
      break;
    }

    case 'lostZoneAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      player.zones.lostZone.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: payload.zoneId,
        to: 'lostZone',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'handAll': {
      const player = draft.players[playerId];
      const moved = player.zones[payload.zoneId].splice(0);
      player.zones.hand.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: payload.zoneId,
        to: 'hand',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'leaveAll': {
      const player = draft.players[playerId];
      const srcZone = player.zones[payload.from];
      const destZone = player.zones[payload.to];
      const moved = [];
      for (let i = srcZone.length - 1; i >= 0; i--) {
        if (isPokemon(srcZone[i])) {
          const [card] = srcZone.splice(i, 1);
          moved.unshift(card);
        }
      }
      destZone.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: payload.from,
        to: payload.to,
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'discardAndDraw': {
      const player = draft.players[playerId];
      const hand = player.zones.hand;
      const discarded = hand.splice(0);
      for (const card of discarded) discardCardToPlayerZone(player, card);
      const count = Math.min(payload.count ?? 0, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      hand.push(...drawn);
      events.push({
        type: 'handDiscardedAndDrawn',
        discarded: discarded.length,
        drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
        playerId,
      });
      break;
    }

    case 'shuffleAndDraw': {
      const player = draft.players[playerId];
      const hand = player.zones.hand;
      const returned = hand.splice(0);
      player.zones.deck.push(...returned);
      player.zones.deck = activeRng.shuffle(player.zones.deck);
      const count = Math.min(payload.count ?? 0, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      hand.push(...drawn);
      events.push({
        type: 'handShuffledIntoDeckAndDrawn',
        returned: returned.length,
        drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
        playerId,
      });
      break;
    }

    case 'shuffleBottomAndDraw': {
      const player = draft.players[playerId];
      const hand = player.zones.hand;
      const returned = activeRng.shuffle(hand.splice(0));
      player.zones.deck.push(...returned);
      const count = Math.min(payload.count ?? 0, player.zones.deck.length);
      const drawn = player.zones.deck.splice(0, count);
      hand.push(...drawn);
      events.push({
        type: 'handShuffledToDeckBottomAndDrawn',
        returned: returned.length,
        drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
        playerId,
      });
      break;
    }

    case 'shufflePrizesToDeckBottom': {
      const player = draft.players[playerId];
      const prizes = player.zones.prizes;
      const shuffled = activeRng.shuffle(prizes.splice(0));
      player.zones.deck.push(...shuffled);
      events.push({
        type: 'prizesShuffledToDeckBottom',
        count: shuffled.length,
        playerId,
      });
      break;
    }

    // --- Reveal/hide (I19). A player may only flip `card.revealed` on their own
    // zone (draft.players[playerId] is always the sender's own state, never the
    // opponent's) — the flag is symmetric in view.mjs's redaction, so setting it
    // here is enough to unhide the card in both players' views. ---

    case 'revealShortcut': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId];
      const card = zone?.[payload.index];
      if (card) {
        card.revealed = true;
        events.push({
          type: 'cardRevealed',
          instanceId: card.instanceId,
          zoneId: payload.zoneId,
          playerId,
        });
      }
      break;
    }

    case 'hideShortcut': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId];
      const card = zone?.[payload.index];
      if (card) {
        card.revealed = false;
        events.push({
          type: 'cardHidden',
          instanceId: card.instanceId,
          zoneId: payload.zoneId,
          playerId,
        });
      }
      break;
    }

    case 'revealCards': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId] || [];
      for (const card of zone) card.revealed = true;
      events.push({
        type: 'zoneRevealed',
        zoneId: payload.zoneId,
        count: zone.length,
        playerId,
      });
      break;
    }

    case 'hideCards': {
      const player = draft.players[playerId];
      const zone = player.zones[payload.zoneId] || [];
      for (const card of zone) card.revealed = false;
      events.push({
        type: 'zoneHidden',
        zoneId: payload.zoneId,
        count: zone.length,
        playerId,
      });
      break;
    }

    // --- Board ops (design 002 slice 3.4b). Legacy targets the literal 'board' zone. ---

    case 'discardBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      const routed = { discard: 0, lostZone: 0 };
      for (const card of moved) routed[discardCardToPlayerZone(player, card)]++;
      if (routed.discard > 0) {
        events.push({
          type: 'zoneMoved',
          from: 'board',
          to: 'discard',
          count: routed.discard,
          playerId,
        });
      }
      if (routed.lostZone > 0) {
        events.push({
          type: 'zoneMoved',
          from: 'board',
          to: 'lostZone',
          count: routed.lostZone,
          playerId,
        });
      }
      break;
    }

    case 'handBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      player.zones.hand.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: 'board',
        to: 'hand',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'shuffleBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      player.zones.deck.push(...moved);
      player.zones.deck = activeRng.shuffle(player.zones.deck);
      events.push({
        type: 'zoneShuffledIntoDeck',
        zoneId: 'board',
        count: moved.length,
        playerId,
      });
      break;
    }

    case 'lostZoneBoard': {
      const player = draft.players[playerId];
      const moved = player.zones.board.splice(0);
      player.zones.lostZone.push(...moved);
      events.push({
        type: 'zoneMoved',
        from: 'board',
        to: 'lostZone',
        count: moved.length,
        playerId,
      });
      break;
    }

    // Deck bootstrap (design 002 slice 3.4e / I16). Mints instanceId through the same
    // draft.nextInstanceId counter every other card-creating command uses, and — critically —
    // runs through applyCommand so it lands in commandLog. Undo's replay depends on this: before
    // this command existed, deck loading was a direct mutation on gameRoom.state outside the
    // log, so replaying commandLog from a fresh seeded state reconstructed empty decks.
    case 'loadDeck': {
      const player = draft.players[playerId];
      const deckData = Array.isArray(payload.deckData) ? payload.deckData : [];
      player.zones.deck = [];
      let syncInstance = 0;
      for (const item of deckData) {
        const [quantity, cardName, cardType, imageURL, number, set, tcgId] =
          Array.isArray(item)
            ? item
            : [
                item.quantity,
                item.name,
                item.type,
                item.imageURL,
                item.number,
                item.set,
                item.tcgId,
              ];
        // Real decklists send quantity as a string ("4"); build-deck.js's loop
        // coerces it, so the server must count the same cards the client does.
        const parsedQuantity = Number(quantity);
        const cardCount =
          Number.isInteger(parsedQuantity) && parsedQuantity > 0
            ? parsedQuantity
            : 1;
        for (let i = 0; i < cardCount; i++) {
          const card = createCard({
            instanceId: mintInstanceId(draft),
            syncInstance,
            ownerId: playerId,
            name: cardName || '',
            type: cardType || '',
            src: imageURL || '',
            number: number != null ? String(number) : '',
            set: set || '',
            id: tcgId || '',
          });
          syncInstance++;
          player.zones.deck.push(card);
        }
      }
      if (deckData.length > 0) {
        player.deckList = [...deckData];
      }
      events.push({
        type: 'deckLoaded',
        playerId,
        count: player.zones.deck.length,
      });
      break;
    }

    // Design 002 I26: applies printed card data the deck rows never carried. Addresses by
    // syncInstance across every zone (cards have usually been dealt into hand/prizes by the
    // time TCGdex enrichment resolves) and updates in place — it must never rebuild a zone,
    // since it can legally arrive mid-game.
    case 'cardStats': {
      const player = draft.players[playerId];
      const stats = Array.isArray(payload?.stats) ? payload.stats : [];
      const bySyncInstance = new Map();
      for (const zone of Object.values(player?.zones || {})) {
        if (!Array.isArray(zone)) continue;
        for (const card of zone) {
          if (card?.syncInstance != null)
            bySyncInstance.set(card.syncInstance, card);
        }
      }

      let updated = 0;
      for (const entry of stats) {
        const card = bySyncInstance.get(entry.syncInstance);
        if (!card) continue;
        if (entry.hp != null) card.hp = Number(entry.hp);
        if (Array.isArray(entry.attacks))
          card.attacks = entry.attacks.map((a) => ({ ...a }));
        if (Array.isArray(entry.types)) card.types = [...entry.types];
        if (entry.weakness !== undefined) card.weakness = entry.weakness;
        if (entry.resistance !== undefined) card.resistance = entry.resistance;
        if (Array.isArray(entry.retreatCost))
          card.retreatCost = [...entry.retreatCost];
        if (entry.stage != null) card.stage = entry.stage;
        if (typeof entry.evolvesFrom === 'string')
          card.evolvesFrom = entry.evolvesFrom;
        if (Array.isArray(entry.abilities)) {
          card.abilities = entry.abilities
            .filter((a) => a && typeof a.text === 'string')
            .map((a) => ({ name: String(a.name || ''), text: a.text }));
        }
        if (typeof entry.text === 'string') card.text = entry.text;
        if (typeof entry.trainerType === 'string')
          card.trainerType = entry.trainerType;
        if (Array.isArray(entry.subtypes))
          card.subtypes = entry.subtypes.map(String);
        updated += 1;
      }

      events.push({ type: 'cardStatsApplied', playerId, count: updated });
      break;
    }

    // undo (design 002 slice 3.4e / D6, I16): deterministic commandLog replay minus tail,
    // rebuilt from a fresh seeded state. Returns directly — the replayed state already carries
    // its own correct commandLog/stateVersion/rngCursor, so the common tail below (which would
    // append this 'undo' command itself) must not run. Undo commands are therefore never
    // themselves present in commandLog — only real game actions are, which is what keeps replay
    // well-defined (no undo-of-undo bookkeeping to unwind).
    case 'undo': {
      const removeCount =
        Number.isInteger(payload?.count) && payload.count > 0
          ? payload.count
          : 1;
      const log = state.commandLog;
      // Edge Case 18: never rewind past the start of this game's log.
      if (log.length < removeCount) {
        return {
          state,
          events: [],
          pendingChoice: state.pendingChoice,
          error: 'nothing_to_undo',
          reason: `Cannot undo ${removeCount} action(s); command log only has ${log.length}`,
        };
      }

      const keptLog = log.slice(0, log.length - removeCount);

      let replayState = createGameState({
        gameId: state.gameId,
        seed: state.seed,
        rulesEnabled: state.rulesEnabled,
        players: Object.fromEntries(
          Object.entries(state.players).map(([pid, p]) => [
            pid,
            { playerId: pid, username: p.username },
          ])
        ),
      });

      const replayRng = createRng(state.seed);
      for (const loggedCommand of keptLog) {
        const result = applyCommand(replayState, loggedCommand, replayRng);
        if (result.error) {
          return {
            state,
            events: [],
            pendingChoice: state.pendingChoice,
            error: 'undo_replay_failed',
            reason: `Replay diverged at logged command "${loggedCommand.type}": ${result.reason || result.error}`,
          };
        }
        replayState = result.state;
      }

      return {
        state: replayState,
        events: [
          { type: 'undo', count: removeCount, remaining: keptLog.length },
        ],
        pendingChoice: replayState.pendingChoice,
        error: null,
      };
    }

    default:
      break;
  }

  if (draft.rulesEnabled) settleSpecialEnergyPassives(draft, { events });
  resolveDamageCounterKnockouts(draft, { events });
  settlePromotionChoices(draft, { events });
  settleKoEnergyMoves(draft, { events });
  settlePrizeEntitlements(draft, { events });
  stampActivePromotions(state, draft);
  clearFaceDownOffBoard(draft);
  delete draft.__attackEffectPhase;
  delete draft.__attackLostZoneKnockouts;

  // Advance state version and append to commandLog
  draft.stateVersion = (state.stateVersion || 0) + 1;
  draft.commandLog.push({
    ...command,
    stateVersion: draft.stateVersion,
  });

  if (activeRng && typeof activeRng.cursor === 'number') {
    draft.rngCursor = activeRng.cursor;
  }

  return {
    state: draft,
    events,
    pendingChoice: draft.pendingChoice,
    error: null,
  };
}
