/**
 * @file Command legality: validateReferences (stale-view check) and validateLegality (the rules
 * gate), with the lock, cost and once-per-game readers only they use. Split out of reduce.mjs
 * (design 073 B, I250); reduce.mjs stays the public entry.
 */

import { findCard, attachmentHostId } from '../state.mjs';
import { isEnergy, isPokemon, isBasicPokemon } from '../cards.mjs';
import { expandEnergyEntries, canPayAttackCost } from '../rules/attack-engine.mjs';
import { isGxAttack, isVstarPowerAttack } from '../rules/damage-parser.mjs';
import { legacyAttachedTrainer } from '../rules/legacy-attached-trainer.mjs';
import {
  mayAttachAnyTechnicalMachine, parseTmAttachRestriction, tmAttachAllowed,
} from '../rules/tool-attacks.mjs';
import { isPokemonToolCard, attachedTools, isExCard } from '../rules/tool-combat.mjs';
import {
  parseToolCap, parseUnlimitedHandEnergyAcceleration, costDiscountRead, applyCostDiscount,
  isHandActivatedAbility,
} from '../rules/ability-executors.mjs';
import {
  abilityAttackCostDiscount, applyEnergyMultiplier, abilityActivationBlockReason,
  abilitySupporterLimit, abilitySetupActive, abilityPlayLocks, abilityEvolvePermission,
  abilityEvolveLock, abilityEvolutionCardLock, abilityRetreatLock, abilitySummonRestricted,
  abilityFirstTurnAttack, extraAttackAvailable, abilityBlocksSpecialEnergyAttach,
} from '../rules/ability-combat.mjs';
import { handEnergyForDiscard, handCardsForLostZone } from '../effects/attack-steps.mjs';
import { legacyAttachTargets } from '../effects/trainer-steps.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import {
  isSpecialEnergyCard, failedSpecialEnergyRestriction, hasSpecialEnergyCannotRetreat,
  specialEnergyAttachDiscardCost,
} from '../rules/special-energy-parse.mjs';
import {
  parseStadiumOncePerTurn, isStadiumCard, isStadiumRetreatPrevention, isStadiumToolNegation,
  isRepeatableStadiumAction, stadiumCostDiscountFor, getStadiumAttackCostIncreaseFor,
  stadiumAbilityBlockedFor, stadiumAllowsSameTurnEvolution, stadiumAttackLockReason,
} from '../rules/stadium-effects.mjs';
import {
  isRuleBoxPokemon, isTeamFlareHyperGearCard, isBasicEnergy,
} from '../rules/card-classify.mjs';
import {
  trainerPlayBlockReason, isToolOrMachineTrainer,
} from '../rules/trainer-play-conditions.mjs';
import { serverEnergyDescriptor } from '../rules/server-energy.mjs';
import { trainerTargetCounts, ownedCards, topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { normalizeStage, pokemonNamesMatch } from '../rules/evolution.mjs';
import { isBabyEvolution } from '../rules/baby-rule.mjs';
import { listConditions } from '../rules/special-conditions.mjs';
import {
  activeAttackMarkers, inPlayView, energyProvisionContext, cardText, cardEffectiveHp, markerCount,
  isGameFrozen, abilitySideContext, effectiveOncePerGameKind, tiebreakActive, rootsIn,
} from './shared.mjs';
import { attackViewFor } from './attack.mjs';
import { computeEffectiveRetreatCost } from './retreat.mjs';
import { energyAttachPlanMatch } from './attach.mjs';
import { callEnergyStep, callEnergyBlockReason } from './ability.mjs';

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
 * Player-scoped play locks an opponent's attack left behind (Distort, Sonic Volume, Heavy Rock,
 * Horror House; design 048). A lock counts on the target's next turn and expires by turn number.
 * @param {object} player The acting player (owner of the lock)
 * @param {string[]} kinds Card kinds being played: 'item'|'supporter'|'stadium'|'trainer'|
 *   'basicEnergy'|'specialEnergy'|'pokemon'
 * @param {number} turnNumber Current turn number
 * @returns {string|null} refusal reason
 */
function playLockReason(player, kinds, turnNumber) {
  const locks = (player?.playLocks || []).filter((lock) => (lock.untilTurn || 0) >= turnNumber);
  if (locks.length === 0) return null;
  const blocking = locks.find((lock) =>
    (lock.kinds || []).some((kind) => kind === 'any' || kinds.includes(kind))
  );
  if (!blocking) return null;
  // A Trainer's own lock (Time Capsule neo1-90) names that card.
  return blocking.source
    ? `${blocking.source} stops you playing that card during this turn.`
    : "Your opponent's attack stops you playing that card during this turn.";
}

/** Printed kind of one of a card's abilities: 'power' (Poké-Power), 'body' (Poké-Body), 'ability'. */
function abilityKindAt(view, index) {
  const abilities = Array.isArray(view?.abilities) ? view.abilities : view?.ability ? [view.ability] : [];
  const type = String(abilities[index]?.type || abilities[0]?.type || '').toLowerCase();
  if (/power/.test(type)) return 'power';
  if (/body/.test(type)) return 'body';
  return 'ability';
}

/**
 * Ability locks an opponent's attack left: on the Pokémon (Shiftry Seal Off, Umbreon ex Black
 * Cry — an `abilityLock` marker) or on the whole player (Gardevoir Psychic Lock — an
 * `ability:<kind>` play-lock entry). Returns the refusal reason or null.
 */
function attackAbilityLockReason(state, cardRef, player, abilityIndex) {
  const kind = abilityKindAt(inPlayView(state, cardRef.card), abilityIndex);
  const turnNumber = state.turn?.number || 1;
  const playerLock = (player?.playLocks || []).find(
    (lock) => (lock.untilTurn || 0) >= turnNumber && (lock.kinds || []).includes(`ability:${kind}`)
  );
  // Goop Gas Attack base5-78 locks both players' Pokémon Powers and names itself.
  if (playerLock?.source) return `${playerLock.source} stops Pokémon Powers from working.`;
  if (playerLock) return "Your opponent's attack stops you using that Ability this turn.";
  const root = cardRef.card.attachedTo != null ? findCard(state, cardRef.card.attachedTo)?.card : cardRef.card;
  const markers = root ? activeAttackMarkers(state, cardRef.playerId, root) : [];
  const cardLocked = markers.some((m) => m.kind === 'abilityLock' && (m.abilityKinds || []).includes(kind));
  return cardLocked ? "An attack stops this Pokémon using that Ability this turn." : null;
}

/**
 * Why `playerId` may not use `attack` under the once-per-game rules, or null (App. 9/19): a gxLock
 * from the opponent, a spent GX attack, or a spent VSTAR Power. Shared by attack legality and
 * every copy-candidate filter so a copied attack obeys the same limits (design 049 O5).
 */
export function onceAttackBlockReason(state, playerId, attack, attacker = null) {
  const player = state.players?.[playerId];
  if (isGxAttack(attack)) {
    const opponentId = Object.keys(state.players || {}).find((id) => id !== playerId);
    if (state.players?.[opponentId]?.restOfGame?.some((e) => e.kind === 'gxLock')) {
      return "Your opponent's attack stops you using GX attacks for the rest of the game.";
    }
    if (oncePerGameUsed(player, 'gx') && !gxReuseAllowed(state, player, attacker)) {
      return 'Only one GX attack can be used per game.';
    }
  }
  if (isVstarPowerAttack(attack) && oncePerGameUsed(player, 'vstar')) {
    return 'VSTAR Power already used this game.';
  }
  return null;
}

// Misty & Lorelei (CEC 199): this turn, the player's Pokémon of a granted type ignore a spent GX attack.
function gxReuseAllowed(state, player, attacker) {
  const granted = player?.flags?.gxReuseTypes;
  if (!Array.isArray(granted) || granted.length === 0 || !attacker) return false;
  const types = (inPlayView(state, attacker)?.types || attacker.types || []).map((t) => String(t).toLowerCase());
  return types.some((t) => granted.includes(t));
}

// "Attach this card to 1 of your Evolved Pokémon (excluding Pokémon-ex …)" and similar TM
// restrictions (Ancient TMs ex5-84..86 are Tools in TCGdex). Null when the attach is legal.
function tmAttachBlockReason(state, tool, targetInstanceId) {
  const restriction = parseTmAttachRestriction(cardText(tool));
  if (!restriction) return null;
  const hostRef = findCard(state, attachmentHostId(state, targetInstanceId));
  const zone = hostRef?.player?.zones?.[hostRef.zoneId];
  if (!hostRef || !Array.isArray(zone)) return null;
  const top = topPokemonCard(zone, hostRef.card);
  const allowed = tmAttachAllowed(restriction, {
    top,
    evolved: top !== hostRef.card,
    mayAttachAnyTm: mayAttachAnyTechnicalMachine(top),
  });
  return allowed ? null : `${tool.name || 'This card'} can't be attached to that Pokémon.`;
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

function isZoneIndex(index, zone) {
  return Number.isInteger(index) && index >= 0 && index < zone.length;
}

/**
 * Validates reference integrity of instanceIds in command payload (Step 3).
 *
 * @param {object} state
 * @param {object} command
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateReferences(state, command) {
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
      const active = resolveAttacker(state, playerId, payload);
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

// Alakazam ex Dimensional Hand: "This attack can be used even if this Pokémon is on the Bench."
const BENCH_ATTACK_CLAUSE = /can be used even if this Pok[eé]mon is on the Bench/i;

// The Pokémon an attack command names. No `attackerInstanceId` (or the Active's own id) means
// the Active. A Benched Pokémon qualifies only for an attack that prints the Bench clause;
// anything else returns null.
export function resolveAttacker(state, playerId, payload) {
  const zones = state.players?.[playerId]?.zones;
  const active = zones?.active?.find((c) => !c.attachedTo) || null;
  const requestedId = payload?.attackerInstanceId;
  if (requestedId == null || requestedId === active?.instanceId) return active;
  const benched = zones?.bench?.find((c) => c.instanceId === requestedId && !c.attachedTo);
  if (!benched) return null;
  const attack = attackViewFor(state, benched)?.attacks?.[payload?.attackIndex ?? 0];
  return BENCH_ATTACK_CLAUSE.test(String(attack?.text || '')) ? benched : null;
}

/**
 * Whether `active` has the Energy for `attack`, priced exactly as the attack
 * preview prices it (ability/Tool/Stadium discounts, then Stadium increases).
 */
export function attackCostPayable(state, playerId, active, attack) {
  // Flapple V Sour Spit: "attacks cost {C} more" also taxes a free attack.
  const markerIncrease = markerCount(activeAttackMarkers(state, playerId, active), 'attackCostIncrease', 'count');
  if (!(attack?.cost?.length > 0) && markerIncrease === 0) return true;
  const player = state.players?.[playerId];
  if (!player || !active) return false;
  // The holder's own zone: a Benched holder (Honchkrow Dark Genes, design 049) prices its own
  // Energy. The Active is the usual caller, and its zone is `active`.
  const holderRef = findCard(state, active.instanceId);
  const activeZoneCards =
    (holderRef?.playerId === playerId && holderRef.player?.zones?.[holderRef.zoneId]) ||
    player.zones?.active ||
    [];
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
      sideCards,
      abilitySideContext(state, playerId)
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
    opponentDeckFormat: opponent?.deckFormat,
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
  const stadiumDiscount = stadiumCard ? stadiumCostDiscountFor(activeView, stadiumCard) : null;
  if (stadiumDiscount) discounts.push(stadiumDiscount);
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
    // A Benched holder (Dark Genes) keeps its Bench position for Active-only discounts.
    zone: holderRef?.zoneId === 'bench' ? 'bench' : 'active',
    isActive: holderRef?.zoneId !== 'bench',
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
        // Heavy Rock/Horror House: "can't play any cards from their hand" blocks playing
        // Basic Pokémon from hand as well (design 048).
        const handPlayLock = playLockReason(player, ['pokemon'], state.turn?.number || 1);
        if (handPlayLock) return { allowed: false, reason: handPlayLock };
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
        // Distort/Sonic Volume/Heavy Rock/Horror House: playing an Energy card from hand
        // (Special-only or any card) can be locked for the opponent's next turn (design 048).
        if (isEnergy(cardRef.card)) {
          const energyKinds = isSpecialEnergyCard(cardRef.card) ? ['specialEnergy'] : ['basicEnergy'];
          const handLock = playLockReason(player, energyKinds, state.turn?.number || 1);
          if (handLock) return { allowed: false, reason: handLock };
        }
        // Chaos Wheel / Trick Wind lock Pokémon Tools; an Item lock (Itchy Pollen) does not
        // reach Tools or Technical Machines. Evolution Jammer locks evolving from hand.
        const attachKinds = isPokemon(cardRef.card)
          ? ['evolve']
          : isToolOrMachineTrainer(cardRef.card)
            ? ['tool', 'trainer']
            : [];
        const attachLock = attachKinds.length
          ? playLockReason(player, attachKinds, state.turn?.number || 1)
          : null;
        if (attachLock) return { allowed: false, reason: attachLock };
        // A Tool attached from the hand is played, so an Ability play lock reaches it
        // (Dark Vileplume Hay Fever locks every Trainer card).
        if (isToolOrMachineTrainer(cardRef.card)) {
          const toolLock = abilityPlayLocks(cardRef.card, abilitySideContext(state, playerId));
          if (toolLock) return { allowed: false, reason: toolLock.reason };
        }
      }
      // Froslass Cursed Glare: the opponent's Active Pokémon stops Special Energy from the hand.
      if (cardRef?.zoneId === 'hand' && isSpecialEnergyCard(cardRef.card)) {
        const opponentId = Object.keys(state.players || {}).find((id) => id !== playerId);
        if (opponentId && abilityBlocksSpecialEnergyAttach(abilitySideContext(state, opponentId))) {
          return {
            allowed: false,
            reason: `${cardRef.card.name} can't be attached: the opponent's Active Pokémon's Ability stops Special Energy from your hand.`,
          };
        }
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
        const plan = cardRef.zoneId === 'hand' ? energyAttachPlanMatch(state, player, cardRef.card, payload.targetInstanceId) : null;
        const planAllows = Boolean(plan && plan.plan.hostId === plan.hostId && plan.plan.attached < plan.plan.count);
        if (player.flags?.energyAttached && !planAllows) {
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
        const tmReason = tmAttachBlockReason(state, cardRef.card, payload.targetInstanceId);
        if (tmReason) return { allowed: false, reason: tmReason };
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
        // Giovanni gym2-18: the chosen Pokémon (by stack root) ignores the first-turn, just-played
        // and once-per-turn gates for the rest of the turn.
        const freeEvolve = (player.flags?.freeEvolveRoots || []).includes(
          attachmentHostId(state, payload.targetInstanceId)
        );
        const evolvePermission = freeEvolve || abilityEvolvePermission(targetRef.card, evolveCtx);
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
        if (!stadiumRelaxes && !freeEvolve && player.flags?.evolved?.[payload.targetInstanceId]) {
          return {
            allowed: false,
            reason: 'Already evolved that Pokémon this turn.',
          };
        }
        const baseStage = normalizeStage(topTarget?.stage) || 'Basic';
        const order = ['Basic', 'Stage 1', 'Stage 2'];
        // Stage-less Evolution (TCGdex Pokémon-GX): the evolvesFrom name check below
        // still gates it, so it is one step past the Pokémon it lands on.
        const inferredStage =
          !cardRef.card.stage && cardRef.card.evolvesFrom
            ? order[order.indexOf(baseStage) + 1]
            : null;
        const evoStage = normalizeStage(cardRef.card.stage) || inferredStage;
        // A Basic played onto the Baby it "Evolves into" is an Evolution card (baby-rule.mjs).
        if (evoStage === 'Basic' && isBabyEvolution(topTarget, cardRef.card)) return { allowed: true };
        if (!evoStage || evoStage === 'Basic') {
          return {
            allowed: false,
            reason: `${cardRef.card.name} is not an Evolution Pokémon.`,
          };
        }
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
        const goingFirstActive = resolveAttacker(state, playerId, payload);
        // Pheromosa-GX Fast Raid: "If you go first, you can use this attack on your first turn."
        const chosenText = String(goingFirstActive?.attacks?.[payload?.attackIndex]?.text || '');
        const attackAllowsFirstTurn = /you can use this attack (?:on|during) your first turn/i.test(chosenText);
        // Meloetta ex: "If you go first, this Pokémon can use attacks during
        // your first turn." Turn 1 is always the going-first player's turn.
        if (
          !goingFirstActive ||
          (!attackAllowsFirstTurn &&
            !abilityFirstTurnAttack(goingFirstActive, {
              ...abilitySideContext(state, playerId),
              turnNumber: state.turn.number,
            }))
        ) {
          return {
            allowed: false,
            reason: "The player going first can't attack on turn 1.",
          };
        }
      }
      const active = resolveAttacker(state, playerId, payload);
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
      // Blizzard Town: both players' Pokémon at 40 HP or less remaining can't
      // attack. Read the in-play (top evolution) effective HP, not the Basic
      // root's printed HP; unknown stats fail open.
      const activeEffectiveHp = cardEffectiveHp(state, active, playerId);
      const attackLockReason =
        activeEffectiveHp > 0
          ? stadiumAttackLockReason(state.stadium?.card || state.stadium, {
              hp: activeEffectiveHp,
              damage: active.damage || 0,
            })
          : null;
      if (attackLockReason) return { allowed: false, reason: attackLockReason };
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
      // App. 9/19: one VSTAR Power and one GX attack per player per game. The flags are
      // game-scoped, so this is the cross-turn gate that `attackerAttacked` (per-turn) cannot
      // provide. `oncePerGameUsed` shares the `useVStarGX` guard, so a legacy state whose marker
      // lives on `flags` also blocks it.
      const onceReason = onceAttackBlockReason(state, playerId, attack, active);
      if (onceReason) return { allowed: false, reason: onceReason };
      // Iron Rule-GX (design 048): a player-scoped attack lock from the opponent's last turn,
      // covering Pokémon that came into play after the lock landed.
      if (
        player.attackLockUntilTurn &&
        player.attackLockUntilTurn >= (state.turn?.number || 1)
      ) {
        return {
          allowed: false,
          reason: "Your opponent's attack stops your Pokémon attacking this turn.",
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
      // Gouging Fire ex Blaze Blitz: locked until this Pokémon leaves the Active Spot.
      const whileActive = active.attackLockedWhileActive;
      if (
        whileActive &&
        (active.movedToActiveTurn ?? 0) === whileActive.activeSince &&
        String(attack?.name || '').toLowerCase() === String(whileActive.name).toLowerCase()
      ) {
        return {
          allowed: false,
          reason: `This Pokémon can't use ${attack?.name || whileActive.name} again until it leaves the Active Spot.`,
        };
      }
      // WotC Leer / Freeze (I227): a lock marker the opponent put on this Pokémon.
      if (activeAttackMarkers(state, playerId, active).some((m) => m.kind === 'cantAttack')) {
        return { allowed: false, reason: "This Pokémon can't attack during this turn." };
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
      // WotC Spider Web / Mean Look (I227): a lock marker the opponent put on this Pokémon.
      if (activeAttackMarkers(state, playerId, active).some((m) => m.kind === 'cantRetreat')) {
        return { allowed: false, reason: "The Defending Pokémon can't retreat." };
      }
      // Fossil Items played as Pokémon: "This card can't retreat."
      if (active.fossilCantRetreat) {
        return { allowed: false, reason: `${active.name} can't retreat.` };
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
          ownActive: opponentActiveTop(player),
          koedLastOppTurn: Boolean(player.flags?.koedLastOppTurn),
          koedLastOppTurnVictims: player.flags?.koedLastOppTurnVictims || [],
          ownAttachedEnergyCount: [...(player.zones?.active || []), ...(player.zones?.bench || [])].filter(
            (c) => c.attachedTo && isEnergy(c)
          ).length,
          handEnergyCount: (player.zones?.hand || []).filter((c) => isEnergy(c)).length,
          handPokemonCount: (player.zones?.hand || []).filter((c) => isPokemon(c)).length,
          evolutionCardsLocked: abilityEvolutionCardLock(abilitySideContext(state, playerId)),
          ...trainerTargetCounts(
            player,
            ownedCards(player),
            state.turn?.number
          ),
        });
        if (blockReason) return { allowed: false, reason: blockReason };
        // I224: a WotC attach-Trainer needs a Pokémon its printed target allows.
        if (legacyAttachedTrainer(cardRef.card) && legacyAttachTargets(player, cardRef.card).length === 0) {
          return { allowed: false, reason: `${cardRef.card.name} has no Pokémon it can be attached to.` };
        }
        // Opponent-attack play locks (Distort/Sonic Volume/Heavy Rock/Horror House): Item-only,
        // Special-Energy-only, Trainer-wide, or every card from hand (design 048).
        const isGear = isToolOrMachineTrainer(cardRef.card);
        const trainerKinds = [
          isGear
            ? 'tool'
            : isSupporter
              ? 'supporter'
              : subStr.includes('stadium')
                ? 'stadium'
                : 'item',
          'trainer',
        ];
        const attackPlayLock = playLockReason(player, trainerKinds, state.turn?.number || 1);
        if (attackPlayLock) return { allowed: false, reason: attackPlayLock };
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
        const attackLock = attackAbilityLockReason(state, cardRef, player, payload?.abilityIndex ?? 0);
        if (attackLock) return { allowed: false, reason: attackLock };
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

function oncePerGameUsed(player, kind) {
  const used = player?.oncePerGame || player?.flags || {};
  if (kind === 'vstar') return Boolean(used.vstarUsed);
  if (kind === 'gx') return Boolean(used.gxUsed);
  return Boolean(used.vstarUsed || used.gxUsed);
}
