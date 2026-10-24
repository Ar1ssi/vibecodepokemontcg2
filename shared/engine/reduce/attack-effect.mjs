/**
 * @file The attack effect phase (resolveAttackEffectPhase) and its tail (finishAttackTail), with
 * the helpers only they use. Split out of reduce.mjs (design 073 B, I250); reduce.mjs stays the
 * public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isEnergy, isPokemon } from '../cards.mjs';
import { flipCoin } from '../rng.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import {
  drawCount, parseAttackDamage, allBenchDamage, eachPokemonDamage, ownBenchDamage,
  computedCounterClause, targetClauseGate, parseAttackSearchClause, parsePrizeOnKo,
  prizeFilterMatches, discardEnergyScaling, deckMillScaling, deckRevealScaling,
  attachDiscardToBenchSpread, returnEnergyBonusClause,
} from '../rules/damage-parser.mjs';
import { optionalCostBonusClause } from '../rules/optional-cost-bonus.mjs';
import {
  attachedTrainerDamageReduction, hasAttachedTrainerEffect,
} from '../rules/legacy-attached-trainer.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { evaluateToolKoPrevention, attachedToolOnDamageEffects } from '../rules/tool-combat.mjs';
import { stadiumAttackCoinModifier } from '../rules/stadium-triggers.mjs';
import { turnDamageBonusAfterWR } from '../rules/turn-damage-bonus.mjs';
import { getEnergyValue } from '../rules/retreat.mjs';
import { abilityHandDiscardProtector, extraAttackAvailable, healBlockedByAbility } from '../rules/ability-combat.mjs';
import { parseOnDamageAbilities, parseOnDamageStatus } from '../rules/ability-triggers.mjs';
import { textRevealsPicks } from '../rules/reveal-picks.mjs';
import { createPendingChoice } from '../effects/executor.mjs';
import { eachFilterMatches } from '../rules/each-filter.mjs';
import { normalizeAttackText } from '../rules/attack-steps.mjs';
import {
  parseAttackCondition, parseAttackUseGate, attackConditionMet, parseConditionClause,
} from '../rules/attack-conditions.mjs';
import {
  markersBlockCondition, markersPreventEffects, parseDamageImmunity,
} from '../rules/attack-markers.mjs';
import { hasSpecialEnergyEffectShield } from '../rules/special-energy-parse.mjs';
import { resolveAttachedEnergyType } from '../rules/energy-effects.mjs';
import { runSpecialEnergyTriggers, resolveAttackEnergyDiscard } from '../effects/special-energy.mjs';
import { stadiumBlocksHealing } from '../rules/stadium-effects.mjs';
import { addCondition, hasCondition } from '../rules/special-conditions.mjs';
import { parseNextTurnLock, parseAttackEnergyDiscard } from '../rules/attack-effects.mjs';
import { parseAttackStatusBranches, statusesFromBranches } from '../rules/attack-status.mjs';
import {
  benchTargets, discardCardFromPlayerZone, activeAttackMarkers, inPlayView, cardEffectiveHp,
  conditionsUpdatedEvent, isGameConcluded, abilitySideContext, shuffleDeckWithRng, rootsIn,
} from './shared.mjs';
import {
  endTurnAfterFailedAttack, spendGxAttack, spendVstarAttack, withSelfNamedAttack,
} from './attack.mjs';
import {
  damageBenchedPokemon, abilityEffectShield, resolveAttackTargetClause, attackTargetOptions, infiltratorPreventsDamage,
  energyAttackerShieldPrevents,
  computedCounterTarget, distributedPrompt, targetPlayerOf, legacyModifiedDamage, prizeFlags,
  trainerIgnoresDefenderEffects, attackAbilityReads, applyRetaliation, applyAttackTargets,
  chosenTargetPerUnitCount,
} from './attack-damage.mjs';
import {
  buildAttackSearchChoice, discardScalingGroups, discardGroupToken, discardScalingEnergy,
  revealDeckTopForAttack, millFilterMatches, millDecksForAttack, raiseSpreadAttachChoice,
  attachMilledCards, attachedEnergyCardsFor, optionalCostOffer, returnAttackerToHand,
  HEAL_STEP_TYPES, planAttackSteps, runAttackSteps,
} from './attack-steps.mjs';
import { handleKnockout } from './knockout.mjs';
import { resolveCheckup, advanceTurn } from './turn.mjs';
import { computeEffectiveRetreatCost } from './retreat.mjs';

/**
 * Charity's choices for `damage`: no reduction, every multiple of 10 below it, and all of it
 * ("reduce that damage by any amount (rounded to the nearest 10)").
 */
function charityReductionAmounts(damage) {
  const amounts = [];
  for (let amount = 0; amount < damage; amount += 10) amounts.push(amount);
  amounts.push(damage);
  return amounts;
}

/** The defending player's flip for a surviveKnockOutCoin marker: true on heads. */
function survivesOnCoin(activeRng, playerId, events) {
  const coin = activeRng.next() < 0.5 ? 'heads' : 'tails';
  events.push({ type: 'attackMarkerCoinFlipped', kind: 'surviveKnockOutCoin', playerId, coin });
  return coin === 'heads';
}

// The bench zone of the player's first Benched Pokémon (Handheld Fan's destination).
function firstBenchRootZone(state, playerId) {
  const bench = state.players?.[playerId]?.zones?.bench || [];
  return bench.some((c) => !c.attachedTo) ? bench : null;
}

const LOST_ZONE_KNOCKOUT =
  /knocked out by (?:damage from )?this (?:attack|damage), put (?:that pokémon|your opponent's active pokémon) and all cards attached to it in the lost zone instead of (?:discarding it|the discard pile)/;

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
    attack: ctx.attack,
    defenderView: defender ? inPlayView(draft, defender) : null,
    coin,
    headsCount,
    optionalCostPaid: ctx.optionalCostPaid,
  });
  return branches.map((branch) =>
    branch.when?.condition ? attackConditionMet(branch.when.condition, conditionCtx) : null
  );
}

const ENERGY_LETTER_TYPES = {
  G: 'grass', R: 'fire', W: 'water', L: 'lightning', P: 'psychic',
  F: 'fighting', D: 'darkness', M: 'metal', N: 'dragon', Y: 'fairy', C: 'colorless',
};

/** Energy cards of one printed type ("{M}") attached to an in-play Pokémon. */
function attachedEnergyOfType(draft, root, letter) {
  const ref = root ? findCard(draft, root.instanceId) : null;
  const wanted = ENERGY_LETTER_TYPES[letter];
  if (!ref || !wanted) return 0;
  return (ref.player.zones[ref.zoneId] || []).filter((c) => {
    if (c.attachedTo !== root.instanceId || !isEnergy(c)) return false;
    const names = [c.energyType, ...(c.types || []), String(c.name || '').replace(/\s*energy.*/i, '')];
    return names.some((n) => {
      const t = String(n || '').toLowerCase().replace(/^basic /, '');
      return (t === 'dark' ? 'darkness' : t) === wanted;
    });
  }).length;
}

// Dusknoir Night Spin: "… done to Dusknoir by your opponent's Pokémon that has 2 or less Energy
// attached to it" — marker filters (attack-markers.mjs attackerMatchesFilter) read the attacker's
// attached Energy cards as the attack's effects resolve. Counts Energy *units* (a Double Colorless
// or other double-provider counts as 2), not Energy cards.
// Bronzong Heavy Potential reads each opponent Pokémon's Retreat Cost "after applying effects"
// (I194); the executor cannot import this reducer, so the cost is stamped on the root here.
function stampOpponentRetreatCosts(draft, oppId) {
  const opponent = draft.players?.[oppId];
  if (!opponent) return;
  for (const zoneId of ['active', 'bench']) {
    for (const root of (opponent.zones?.[zoneId] || []).filter((c) => !c.attachedTo)) {
      root.effectiveRetreatCost = computeEffectiveRetreatCost(draft, root, oppId, { zoneId });
    }
  }
}

function stampAttackEnergyCount(draft, attacker, attackerView) {
  const ref = attacker ? findCard(draft, attacker.instanceId) : null;
  if (!ref) return;
  const zone = ref.player.zones[ref.zoneId] || [];
  const count = zone
    .filter((c) => c.attachedTo === attacker.instanceId && isEnergy(c))
    .reduce((sum, c) => sum + getEnergyValue(c), 0);
  attacker.attackEnergyCount = count;
  if (attackerView && attackerView !== attacker) attackerView.attackEnergyCount = count;
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
export function resolveAttackEffectPhase(draft, ctx) {
  ctx = withSelfNamedAttack(ctx);
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
  stampAttackEnergyCount(draft, attacker, attackerView);
  stampOpponentRetreatCosts(draft, oppId);

  // A printed whole-attack condition ("If …, this attack does nothing", design 036 A1) gates the
  // damage and every effect step, so it resolves before any of them. It runs once per attack:
  // a resumed effect phase carries `conditionChecked` so a before-damage step cannot flip it.
  if (!ctx.conditionChecked) {
    const selfName = attackerView?.name || attacker?.name;
    // Smeargle Sketch copies "except for … anything else required": its use gate is waived.
    const condition =
      attack?.waivesUseGate && parseAttackUseGate(attack?.text, { selfName })
        ? null
        : parseAttackCondition(attack?.text, { selfName });
    const conditionCtx =
      condition &&
      buildServerAttackContext(draft, {
        attackerPlayerId: playerId,
        defenderPlayerId,
        attacker,
        defender,
        attackerView,
        attack,
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
      spendVstarAttack(draft, { playerId, attacker, attack, events });
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
  if (discardScaling?.coinGate && energyDiscarded === undefined && coin !== discardScaling.coinGate) {
    energyDiscarded = 0;
  }
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
        prompt: discardScalePrompt(attack, discardScaling),
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

  // Arcanine Fire Blow: "flip a number of coins equal to the number of {R} Energy cards you
  // discarded" — these flips follow the discard, so they happen here, not with the attack's coins.
  let { discardFlipHeads } = ctx;
  if (
    discardFlipHeads === undefined &&
    typeof energyDiscarded === 'number' &&
    // Electivire Discharge: "Flip a coin for each {L} Energy you discarded."
    /flip (?:a number of coins equal to the number of|a coin for each) [^.]*you discarded/i.test(attack?.text || '')
  ) {
    const discardFlips = Array.from({ length: Math.min(energyDiscarded, 20) }, () => flipCoin(activeRng));
    discardFlipHeads = discardFlips.filter((face) => face === 'heads').length;
    if (discardFlips.length > 0) {
      events.push({
        type: 'attackCoinFlipped',
        playerId,
        attackName: attack.name,
        coin: null,
        headsCount: discardFlipHeads,
        flips: discardFlips,
      });
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

  // "You may <cost>. If you do, this attack does N more damage." (optional-cost-bonus.mjs):
  // offer the cost before damage; parseAttackDamage reads ctx.optionalCostPaid.
  let { optionalCostPaid, optionalCostCount } = ctx;
  const optionalBonus = optionalCostBonusClause(attack?.text, attackerView?.name || attacker?.name);
  if (optionalBonus && optionalCostPaid === undefined) {
    const offer = optionalCostOffer(draft, { playerId, attacker, attack, clause: optionalBonus });
    if (!offer) {
      optionalCostPaid = false;
    } else {
      draft.pendingChoice = createPendingChoice({
        player: playerId,
        source: 'attack',
        prompt: offer.prompt,
        options: offer.options,
        min: offer.min,
        max: offer.max,
        resumeToken: {
          ...resumeBase,
          effectType: 'attackOptionalCostBonus',
          cost: optionalBonus.cost,
          allowedIds: offer.allowedIds,
          milledMatches,
          energyDiscarded,
          energyReturned,
          discardFlipHeads,
        },
      });
      return;
    }
  }

  // "Before doing damage, …" clauses (design 030). A gust there moves the damage to the
  // opponent's new Active Pokémon.
  const attackSteps = planAttackSteps(attack, attacker, { coin, headsCount, flips });
  if (attackSteps.before.length > 0) {
    if (!ctx.preStepsDone) {
      // An attach the damage counts starts from 0, so "attached none" reads as paid nothing.
      if (attackSteps.before.some((step) => step.type === 'atkAttach' && step.countsForDamage)) {
        draft.attackAttachedForDamage = 0;
      }
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
            values: { energyDiscarded, milledMatches, energyReturned, optionalCostPaid, optionalCostCount, discardFlipHeads },
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
  const handDiscarded = ctx.handDiscarded ?? attackSteps.before.some(
    (step) =>
      step.countsForDamage &&
      ['atkDiscardOwnHand', 'atkDiscardHandEnergy', 'atkDiscardBenchEnergy'].includes(step.type)
  )
    ? events
        .filter((e) => e.type === 'cardsDiscarded' && e.forDamage)
        .reduce((total, e) => total + e.cards.length, 0)
    : undefined;
  const lostZoned = ctx.lostZoned ?? attackSteps.before.some((step) => step.countsForDamage)
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
          attack,
          defenderView: defender ? inPlayView(draft, defender) : null,
          coin,
          headsCount: discardFlipHeads ?? headsCount,
          energyDiscarded,
          milledMatches,
          energyReturned,
          optionalCostPaid,
          optionalCostCount,
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
              immunity.ignoreDefenderEffects ||
              abilityReads.ignoreDefenderEffects ||
              trainerIgnoresDefenderEffects(draft, playerId, abilityReads.attacker),
            ignoreResistance: abilityReads.ignoreResistance,
            ignoreAttackerBoosts: abilityReads.ignoresAttackerBoosts,
            // Gyarados Dragon DNA: a borrowed Basic attack does 30 more to the Defending Pokémon
            // (design 049). computeAttackDamage drops every bonus when the attack does no damage.
            abilityBonusBeforeWR:
              abilityReads.abilityBonusBeforeWR + (Number(effectiveAttack?.bonusBeforeWR) || 0),
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
        // Dragapult Infiltrator: heads on the flip prevents this attack's damage to the holder.
        if (dmgDealt > 0 && !abilityReads.ignoresDefenderAbilities && infiltratorPreventsDamage(draft, defender, defenderPlayerId, activeRng, events)) {
          dmgDealt = 0;
          dmgResult.prevented = true;
        }

        // Palossand Water Compaction: an attacker with the printed Energy deals nothing; the holder heals.
        if (
          dmgDealt > 0 &&
          !abilityReads.ignoresDefenderAbilities &&
          energyAttackerShieldPrevents(draft, defender, defenderPlayerId, attacker, playerId, events)
        ) {
          dmgDealt = 0;
          dmgResult.prevented = true;
        }

        // Flygon ex Psychic Protector: before the damage lands the defending player may discard
        // up to N cards from their hand, each reducing it by M. The attack suspends on that
        // player's choice and re-enters here with `protectorDiscarded` settled.
        const protector =
          dmgDealt > 0 && !dmgResult.prevented
            ? abilityHandDiscardProtector(defenderView, {
                sideCards: defenderInPlayCards,
                opponentSideCards: [
                  ...attackerZoneCards,
                  ...(draft.players[playerId]?.zones?.bench || []),
                ],
                sideActive: defenderZoneCards,
                opponentActive: attackerZoneCards,
                turnNumber: draft.turn?.number,
              })
            : null;
        const defenderHand = draft.players[defenderPlayerId]?.zones?.hand || [];
        if (protector && ctx.protectorDiscarded === undefined && defenderHand.length > 0) {
          draft.pendingChoice = createPendingChoice({
            player: defenderPlayerId,
            source: 'ability',
            prompt: `${defenderView.name || 'Your Pokémon'} is being damaged by ${attack.name}: discard up to ${protector.max} cards from your hand to reduce the damage by ${protector.perCard} each?`,
            options: defenderHand.map((c) => ({
              instanceId: c.instanceId,
              name: c.name,
              src: c.src || '',
              type: c.type || '',
            })),
            min: 0,
            max: Math.min(protector.max, defenderHand.length),
            resumeToken: {
              ...resumeBase,
              effectType: 'attackHandDiscardProtector',
              targetInstanceId: defender.instanceId,
              values: {
                energyDiscarded,
                milledMatches,
                revealedMatches,
                energyReturned,
                optionalCostPaid,
                optionalCostCount,
                discardFlipHeads,
                handDiscarded,
                lostZoned,
                preStepsDone: true,
              },
            },
          });
          return;
        }
        const protectorReduction = protector ? (ctx.protectorDiscarded || 0) * protector.perCard : 0;

        // Vermilion City Gym: Lt. Surge's Pokémon flip when attacking. Heads adds
        // 10 damage after Weakness/Resistance when the attack does damage; tails
        // deals 10 to the attacker in addition to the attack. The printed "may
        // flip" is auto-flipped (no optional-coin protocol exists). A Charity pause
        // re-enters with the face already flipped (`vermilionFace`).
        const vermilion = stadiumAttackCoinModifier(
          draft.stadium?.card || draft.stadium,
          { attacker: attackerView }
        );
        // Misty gym1-18: +20 after Weakness/Resistance to an attack by a Pokémon with Misty in its
        // name that does damage to the Defending Pokémon.
        const afterWrBonus = turnDamageBonusAfterWR(draft.players[playerId]?.flags?.turnDamageBonuses, attackerView);
        if (afterWrBonus > 0 && dmgDealt > 0 && !abilityReads.ignoresAttackerBoosts) dmgDealt += afterWrBonus;
        let vermilionFace = ctx.vermilionFace;
        if (vermilion) {
          if (vermilionFace === undefined) {
            vermilionFace = activeRng.next() < 0.5 ? 'heads' : 'tails';
            events.push({ type: 'coinFlipped', playerId, face: vermilionFace, source: vermilion.source });
          }
          if (vermilionFace === 'heads') {
            if (dmgDealt > 0) dmgDealt += vermilion.headsBonus;
          } else {
            stadiumSelfDamage = vermilion.tailsSelfDamage;
          }
        }

        // Charity (gym1-99): "If that Pokémon attacks and does damage to the Defending Pokémon,
        // you may reduce that damage by any amount (rounded to the nearest 10)." The attacker picks
        // before the damage lands, from the damage after every after-W/R bonus above; the attack
        // re-enters here with `charityReduction` settled.
        const charityMax = dmgResult.prevented ? 0 : Math.max(0, dmgDealt - protectorReduction);
        if (
          charityMax > 0 &&
          ctx.charityReduction === undefined &&
          hasAttachedTrainerEffect(attackerZoneCards, attacker, 'optionalDamageReduction')
        ) {
          draft.pendingChoice = createPendingChoice({
            player: playerId,
            source: 'trainer',
            prompt: `${attack.name}: Charity lets you reduce the ${charityMax} damage to ${defenderView.name || 'the Defending Pokémon'}. Reduce it by how much?`,
            options: charityReductionAmounts(charityMax).map((amount, index) => ({
              instanceId: index + 1,
              name: amount === 0 ? 'Do not reduce' : `Reduce by ${amount}`,
              type: 'option',
            })),
            min: 1,
            max: 1,
            resumeToken: {
              ...resumeBase,
              effectType: 'attackCharityReduction',
              charityAmounts: charityReductionAmounts(charityMax),
              targetInstanceId: defender.instanceId,
              values: {
                energyDiscarded,
                milledMatches,
                revealedMatches,
                energyReturned,
                optionalCostPaid,
                optionalCostCount,
                discardFlipHeads,
                handDiscarded,
                lostZoned,
                preStepsDone: true,
                ...(ctx.protectorDiscarded !== undefined ? { protectorDiscarded: ctx.protectorDiscarded } : {}),
                ...(vermilionFace !== undefined ? { vermilionFace } : {}),
              },
            },
          });
          return;
        }

        if (protectorReduction > 0 && dmgDealt > 0) {
          dmgDealt = Math.max(0, dmgDealt - protectorReduction);
          events.push({
            type: 'damageReducedByDiscard',
            instanceId: defender.instanceId,
            playerId: defenderPlayerId,
            discarded: ctx.protectorDiscarded,
            reduction: protectorReduction,
          });
        }

        if (ctx.charityReduction > 0 && dmgDealt > 0) {
          const reduction = Math.min(dmgDealt, ctx.charityReduction);
          dmgDealt -= reduction;
          events.push({
            type: 'damageReducedByAttacker',
            instanceId: defender.instanceId,
            playerId,
            reduction,
            source: 'Charity',
          });
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
        // Acme of Heroism-GX (design 048): no coin — survive at 10 HP for the turn window.
        const surviveAt10 = defenderMarkers.some((m) => m.kind === 'surviveKnockOutHp10');

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
                damage: dmgDealt,
              })
            : [];
        const reactiveToolEffects = reactiveTools('damage');
        const koCounterToolEffects = reactiveTools('ko').filter((eff) => eff.damageAttacker > 0);
        let defenderKnockedOut = false;

        if (dmgDealt > 0) {
          // "If this Pokémon was damaged by an attack during your opponent's last turn, this
          // attack does that much more damage" (Conkeldurr V / Mega Heracross ex Counter).
          defender.attackDamageTaken = { turn: Number(draft.turn?.number) || 1, amount: dmgDealt };
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
            } else if (surviveAt10) {
              // Acme of Heroism-GX: not Knocked Out, remaining HP becomes 10.
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

        // Koga gym2-19: "If an attack from a Pokémon with Koga in its name does damage to a
        // Defending Pokémon this turn, that Pokémon is then Poisoned."
        if (dmgDealt > 0 && !dmgResult.prevented && !defenderKnockedOut) {
          const attackerName = String(attackerView?.name || '').toLowerCase();
          for (const rider of draft.players[playerId]?.flags?.turnAttackRiders || []) {
            if (!attackerName.includes(rider.nameTag)) continue;
            if (addCondition(defender, rider.condition)) events.push(conditionsUpdatedEvent(defender, rider.condition));
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
          if (thorns?.count > 0 && (!thorns.koOnly || defenderKnockedOut)) {
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
      // Defender (base1-80) on the attacker: "Damage done to that Pokémon by attacks" includes its own.
      const recoil = attacker
        ? legacyModifiedDamage(draft, {
            victim: attacker,
            victimPlayerId: playerId,
            amount: Math.max(0, parsed.selfDamage - attachedTrainerDamageReduction(attackerPlayer?.zones?.active || [], attacker)),
          })
        : parsed.selfDamage;
      const selfDamage = recoil + stadiumSelfDamage;
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
        !stadiumBlocksHealing(draft.stadium) &&
        !healBlockedByAbility(draft, attacker)
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
        const defMarkers = defRef ? activeAttackMarkers(draft, defRef.playerId, defRef.card) : [];
        const shielded =
          defRef &&
          (hasSpecialEnergyEffectShield(inPlayView(draft, defRef.card), defZone) ||
            markersPreventEffects(defMarkers, attackerView) ||
            abilityEffectShield(draft, defRef, attackerView));
        if (defRef && defRef.zoneId === 'active' && !shielded) {
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
      // Mr. Mime ex Breakdown / Dusclops ex Shadow Beam: a counter count the board decides.
      const computedCounters = eachDamage ? null : computedCounterClause(attack.text);
      let attackTarget = eachDamage
        ? null
        : computedCounters
          ? computedCounterTarget(draft, computedCounters, {
              attackerPlayerId: playerId,
              defenderPlayerId,
              attacker,
              defender,
              attackerView,
              attack,
            })
          : resolveAttackTargetClause(attack.text, parsed, spread);
      // Bronzong BREAK Metal Rain: one 30-damage pick per Energy card the discard paid.
      if (attackTarget?.remainingFromDiscard) {
        attackTarget = energyDiscarded > 0 ? { ...attackTarget, remaining: energyDiscarded } : null;
      }
      // Alolan Exeggutor-GX Tropical Head: the snipe scales with the attacker's Energy cards.
      if (attackTarget?.amountPerEnergy) {
        const ref = attacker ? findCard(draft, attacker.instanceId) : null;
        const energyCards = ref
          ? (ref.player.zones[ref.zoneId] || []).filter((c) => c.attachedTo === attacker.instanceId && isEnergy(c)).length
          : 0;
        attackTarget = energyCards > 0 ? { ...attackTarget, amount: attackTarget.amount * energyCards } : null;
      }
      // Probopass Metal Bomber: as many picks as the attacker has Energy of the printed type.
      if (attackTarget?.countFromEnergy) {
        const picks = attachedEnergyOfType(draft, attacker, attackTarget.countFromEnergy);
        attackTarget = picks > 0 ? { ...attackTarget, count: picks } : null;
      }
      // Shedinja Extra Curse: "If the Defending Pokémon is Pokémon-ex, put 4 damage counters instead."
      // Espeon & Deoxys-GX Cross Division-GX: "If this Pokémon has at least 3 extra Energy …,
      // put 20 damage counters on them instead." — spread counters swap their total.
      const counterSwap = attackTarget?.kind === 'counters'
        ? /(?:^|\. )if ([^,]+), put (\d+) damage counters (?:on them )?instead\./.exec(normalizeAttackText(attack.text, attackerView?.name))
        : null;
      if (counterSwap) {
        const condition = parseConditionClause(counterSwap[1]);
        const holds =
          condition &&
          attackConditionMet(
            condition,
            buildServerAttackContext(draft, {
              attackerPlayerId: playerId,
              defenderPlayerId,
              attacker,
              defender,
              attackerView,
              attack,
              defenderView: defender ? inPlayView(draft, defender) : null,
            })
          );
        if (holds) {
          attackTarget = attackTarget.distributable
            ? { ...attackTarget, remaining: Number(counterSwap[2]) }
            : { ...attackTarget, amount: Number(counterSwap[2]) * 10 };
        }
      }
      // "If heads, put 3 damage counters on …" / "For each heads, put 1 damage counter …".
      const targetGate = attackTarget ? targetClauseGate(attack.text) : null;
      if (targetGate === 'heads' && !(coin === 'heads' || headsCount > 0)) {
        // Unown ! Hidden Power (Legends Awakened 42): "If heads, … on 1 of your opponent's Pokémon.
        // If tails, put 2 damage counters on 1 of your Pokémon." — the tails sentence's target.
        const tailsSentence = /(?:^|\.\s+)if tails, ([^.]*\.)/i.exec(attack.text || '')?.[1];
        attackTarget = coin === 'tails' && tailsSentence ? resolveAttackTargetClause(tailsSentence, null, 0) : null;
      }
      if (targetGate === 'tails' && coin !== 'tails') attackTarget = null;
      if (targetGate === 'perHeads') {
        attackTarget = headsCount > 0 ? { ...attackTarget, amount: attackTarget.amount * headsCount } : null;
      }
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
      // Swarming Sting (Beedrill V): the snipe does its printed amount once per counted Pokémon
      // ("for each of your Beedrill V in play"), and nothing when the count is 0.
      if (attackTarget?.kind === 'damage' && !discardScaling && !attackTarget.amountPerEnergy) {
        const perUnit = chosenTargetPerUnitCount(draft, attack.text, {
          attackerPlayerId: playerId,
          defenderPlayerId,
          attacker,
          defender,
          attackerView,
          attack,
        });
        if (perUnit) {
          const scaledAmount = attackTarget.amount * perUnit.count;
          attackTarget = scaledAmount > 0 ? { ...attackTarget, amount: scaledAmount } : null;
        }
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
      // Chingling Uproar: "If heads, this attack does 10 damage to each of your opponent's Pokémon."
      if (eachDamage && (!eachDamage.gate || coin === eachDamage.gate)) {
        const victimPlayer = draft.players[defenderPlayerId];
        const zones = victimPlayer?.zones || {};
        const roots = eachDamage.activeOnly
          ? rootsIn(zones.active)
          : [...rootsIn(zones.active), ...rootsIn(zones.bench)];
        const selection = roots
          .filter((root) => eachFilterMatches(victimPlayer, root, eachDamage.filter))
          .filter((root) => {
            if (!eachDamage.perTargetCoin) return true;
            const face = flipCoin(activeRng);
            events.push({ type: 'coinFlipped', playerId, face, instanceId: root.instanceId, source: attack.name });
            return face === 'heads';
          })
          .map((root) => root.instanceId);
        benchDealt += applyAttackTargets(draft, {
          selection,
          clause: { amount: eachDamage.amount, activeWR: true, immunity: parseDamageImmunity(attack.text) },
          defenderPlayerId,
          attackerPlayerId: playerId,
          attackName: attack.name,
          events,
        });
        // Manectric Power Wave "(both yours and your opponent's)": the attacker's own matching
        // Pokémon take it too, with no Weakness or Resistance; their Knock Outs pay the opponent.
        if (eachDamage.bothSides) {
          const own = draft.players[playerId];
          const ownSelection = [...rootsIn(own?.zones?.active), ...rootsIn(own?.zones?.bench)]
            .filter((root) => eachFilterMatches(own, root, eachDamage.filter))
            .map((root) => root.instanceId);
          applyAttackTargets(draft, {
            selection: ownSelection,
            clause: { amount: eachDamage.amount, side: 'own' },
            defenderPlayerId: playerId,
            attackerPlayerId: defenderPlayerId,
            attackName: attack.name,
            events,
          });
        }
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
      const energyDiscardSpec = discardScaling
        ? null
        : parseAttackEnergyDiscard({
            ...effectiveAttack,
            // Older prints name themselves ("Discard an Energy card attached to Tyranitar").
            text: normalizeAttackText(effectiveAttack?.text, attackerView?.name || attacker?.name),
          });
      if (energyDiscardSpec && attacker) {
        const attackerZone = draft.players[playerId]?.zones?.active || [];
        const attachedEnergies = attackerZone.filter(
          (c) => c.attachedTo === attacker.instanceId && isEnergy(c)
        );

        const ofType = (energyType) => (c) => {
          if (!energyType) return true;
          // A typed special Energy ("Nitro {R} Energy") counts as the type it provides.
          const provided = resolveAttachedEnergyType(c).toLowerCase();
          const wanted = energyType.toLowerCase();
          if (provided === wanted || (provided === 'darkness' && wanted === 'dark')) return true;
          const ty = c.energyType || c.name?.replace(/\s*Energy.*/i, '');
          return ty && ty.toLowerCase().includes(wanted);
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
            // Nitro returns to hand, Boomerang / Burning stay attached (design: on-discard triggers).
            const resolution = resolveAttackEnergyDiscard(draft, card);
            if (resolution === 'reattach') continue;
            const [discarded] = draft.players[playerId].zones.active.splice(
              idx,
              1
            );
            discarded.attachedTo = null;
            let to = 'hand';
            if (resolution === 'hand') draft.players[playerId].zones.hand.push(discarded);
            else to = discardCardToPlayerZone(draft.players[playerId], discarded);
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
      const locks = parseNextTurnLock(effectiveAttack, {
        coin,
        headsCount,
        conditionHolds: (clause) => {
          const condition = parseConditionClause(normalizeAttackText(clause, attackerView?.name || attacker?.name));
          if (!condition) return false;
          return attackConditionMet(
            condition,
            buildServerAttackContext(draft, {
              attackerPlayerId: playerId,
              defenderPlayerId,
              attacker,
              defender,
              attackerView,
              attack: effectiveAttack,
              defenderView: defender ? inPlayView(draft, defender) : null,
              coin,
              headsCount,
            })
          );
        },
      });
      const defenderRef = defender ? findCard(draft, defender.instanceId) : null;
      // Star Shield-GX / Agility: the Defending Pokémon's effect prevention stops the locks.
      const defenderShielded =
        defenderRef &&
        (markersPreventEffects(activeAttackMarkers(draft, defenderRef.playerId, defenderRef.card), attackerView) ||
          abilityEffectShield(draft, defenderRef, attackerView));
      if (locks && defenderShielded) {
        locks.oppCannotRetreat = false;
        locks.oppCannotAttack = false;
      }
      if (locks) {
        if (locks.selfCannotAttack && attacker) {
          attacker.cannotAttackUntilTurn = (draft.turn.number || 1) + 2;
        } else if (locks.selfCannotUseAttack && attacker) {
          attacker.cannotAttackUntilTurn = (draft.turn.number || 1) + 2;
          attacker.cannotAttackAttackName = locks.selfCannotUseAttack;
        }
        // The lock lasts until this Pokémon leaves the Active Spot: a later move there stamps a
        // new `movedToActiveTurn`.
        if (locks.selfCannotUseAttackWhileActive && attacker) {
          attacker.attackLockedWhileActive = {
            name: locks.selfCannotUseAttackWhileActive,
            activeSince: attacker.movedToActiveTurn ?? 0,
          };
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

// The discard-to-scale prompt names what each card is worth as printed: "N (more) damage for each"
// (Genesect-EX Rapid Blaster +20), "do N damage to it" (Bronzong BREAK Metal Rain), else the
// printed damage.
function discardScalePrompt(attack, discardScaling) {
  const text = String(attack?.text || '');
  const per =
    /(\d+) (?:more )?damage (?:for each|times)/i.exec(text)?.[1] ||
    /do (\d+) damage to it/i.exec(text)?.[1] ||
    parseInt(attack?.damage, 10) ||
    0;
  const verb = discardScaling.destination === 'deck' ? 'shuffle into your deck' : 'discard';
  return `${attack.name}: choose Energy to ${verb} (${per} damage each).`;
}

// Beast Game-GX's "… take 3 more Prize cards instead" condition, read against the attacker.
function prizeInsteadHolds(draft, playerId, attack, instead) {
  const condition = parseConditionClause(instead.condition);
  const attacker = (draft.players[playerId]?.zones?.active || []).find((c) => !c.attachedTo);
  if (!condition || !attacker) return false;
  const defenderPlayerId = Object.keys(draft.players).find((id) => id !== playerId);
  return (
    attackConditionMet(
      condition,
      buildServerAttackContext(draft, {
        attackerPlayerId: playerId,
        defenderPlayerId,
        attacker,
        defender: (draft.players[defenderPlayerId]?.zones?.active || []).find((c) => !c.attachedTo) || null,
        attackerView: inPlayView(draft, attacker),
        attack,
      })
    ) === true
  );
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
export function grantPrizeOnKoBonus(draft, { playerId, attack, events, paid }) {
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
  const perKo = bonus.instead && prizeInsteadHolds(draft, playerId, attack, bonus.instead) ? bonus.instead.count : bonus.count;
  const count = Math.min(perKo * victims.length, prizes.length);
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
export function finishAttackTail(draft, { tail, activeRng, events }) {
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
          reveal: textRevealsPicks(
            effectiveAttack?.text || effectiveAttack?.effect || effectiveAttack?.description || ''
          ),
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
        // Drapion V Dynamic Tail / Giratina Shadow Impact hit the attacker's own Pokémon; a
        // Knock Out there gives the opponent the Prize cards.
        const ownSide = attackTarget.side === 'own';
        const targetOwnerId = targetPlayerOf(attackTarget, playerId, defenderPlayerId);
        const creditedId = ownSide ? oppId : playerId;
        const candidates = attackTargetOptions(draft, targetOwnerId, attackTarget.scope, attackTarget.filter);
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
          // Probopass Metal Bomber: "Choose a number … UP TO N" always lets the player pick,
          // including fewer than the candidates on the board — never auto-applied to all of them.
          if (
            !attackTarget.upTo &&
            (attackTarget.scope === 'active' ||
              candidates.length <= (distributable ? 1 : attackTarget.count))
          ) {
            benchDealt += applyAttackTargets(draft, {
              selection: picksFor(candidates),
              clause: attackTarget,
              defenderPlayerId: targetOwnerId,
              attackerPlayerId: creditedId,
              attackName: attack.name,
              activeRng,
              events,
            });
          } else if (!searchTriggered) {
            draft.pendingChoice = createPendingChoice({
              // Dark Ivysaur Fury Strikes: the opponent places the markers.
              player: attackTarget.chooser === 'opponent' ? targetOwnerId : playerId,
              source: 'attack',
              prompt: distributable
                ? distributedPrompt(attack.name, attackTarget, required)
                : attackTarget.upTo
                  ? `${attack.name}: Choose up to ${attackTarget.count} of ${ownSide ? 'your' : "your opponent's"} ${attackTarget.scope === 'bench' ? 'Benched ' : ''}Pokémon to take damage`
                  : `${attack.name}: Choose ${attackTarget.count} of ${ownSide ? 'your' : "your opponent's"} ${attackTarget.scope === 'bench' ? 'Benched ' : ''}Pokémon to take damage`,
              options: candidates,
              min: distributable ? 1 : attackTarget.upTo ? 0 : attackTarget.count,
              max: distributable ? 1 : attackTarget.count,
              resumeToken: {
                effectType: 'attack',
                initiatorPlayerId: playerId,
                oppId,
                targetOwnerId,
                creditedId,
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
              defenderPlayerId: targetOwnerId,
              attackerPlayerId: creditedId,
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
      // A VSTAR Power attack spends the VSTAR Power the same way (App. 9).
      spendGxAttack(draft, { playerId, attacker, attack, events });
      spendVstarAttack(draft, { playerId, attacker, attack, events });

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
        // "Take another turn after this one. (Skip the between-turns step.)" (Timeless-GX,
        // Supreme Puff-GX; design 048): no checkup, then the same player starts turn N+1.
        if (attackerPlayer.flags?.extraTurn) {
          delete attackerPlayer.flags.extraTurn;
          advanceTurn(draft, { nextPlayerId: playerId, events });
        } else {
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
}
