/**
 * @file The resolveChoice command: resumes a pending choice into the domain that raised it. Split
 * out of reduce.mjs (design 073 B, I250); reduce.mjs stays the public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isGxAttack } from '../rules/damage-parser.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { executeAbility } from '../effects/ability.mjs';
import { createPendingChoice, attachToRoot } from '../effects/executor.mjs';
import { resumeSpecialEnergyTrigger, SPECIAL_ENERGY_EFFECT } from '../effects/special-energy.mjs';
import { executeStadium } from '../effects/stadium.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { setGameEnded, ensureOncePerGame, isGameConcluded, shuffleDeckWithRng } from './shared.mjs';
import {
  flipAttackCoins, coinCountReader, NINJA_TRICK_EFFECT, resumeNinjaTrick, spendVstarAttack,
  attackViewFor, resumeCopiedAttack,
} from './attack.mjs';
import { attackTargetOptions, distributedPrompt, applyAttackTargets } from './attack-damage.mjs';
import {
  buildAttackSearchChoice, discardScaleSelection, discardScalingEnergy, raiseSpreadAttachChoice,
  attachMilledCards, moveAttachedEnergyToHand, payOptionalCost, discardHandCards,
  attackResumeContext, runAttackSteps,
} from './attack-steps.mjs';
import {
  resolveAttackEffectPhase, grantPrizeOnKoBonus, finishAttackTail,
} from './attack-effect.mjs';
import {
  promoteBenchToActive, koEnergyTargets, moveKoEnergy, PRIZE_CHOICE_EFFECT, resolvePrizeChoice,
  KO_HAND_DISCARD_EFFECT, resolveKoHandDiscard,
  PRIZE_BENCH_EFFECT, PRIZE_ATTACH_EFFECT, resumePrizeAttach, resumePrizeToBench,
} from './knockout.mjs';
import { resolveCheckup, advanceTurn, endTurnFromEffect } from './turn.mjs';
import { continueRetreat, isExactRetreatPayment, applyRetreatSwap } from './retreat.mjs';
import {
  GROWTH_ATTACH_EFFECT, resumeGrowthAttach,
  STADIUM_EVOLVE_SEARCH_EFFECT, resumeStadiumEvolveSearch,
} from './attach.mjs';
import { settleTrainerPrizeWin, endTurnAfterTrainer } from './trainer.mjs';
import {
  CALL_ENERGY_EFFECT, resumeCallEnergy, endTurnAfterAbility, settleAbilityOutcomes,
} from './ability.mjs';

export function resolveChoiceCommand({ draft, playerId, activeRng, events, payload }) {
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
    settleTrainerPrizeWin(draft, { playerId: initiatorPlayerId, events });
    endTurnAfterTrainer(draft, { card: resumeCard, playerId: initiatorPlayerId, activeRng, events });
  } else if (token.effectType === 'ability') {
    const result = executeAbility(draft, {
      card: resumeCard,
      playerId: initiatorPlayerId,
      activeRng,
      events,
      selection: payload.selection,
      resumeToken: token,
    });
    settleAbilityOutcomes(draft, { events });
    endTurnAfterAbility(draft, { result, playerId: initiatorPlayerId, activeRng, events });
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
  } else if (token.effectType === GROWTH_ATTACH_EFFECT) {
    resumeGrowthAttach(draft, {
      selection: payload.selection || [],
      resumeToken: token,
      events,
    });
  } else if (token.effectType === STADIUM_EVOLVE_SEARCH_EFFECT) {
    resumeStadiumEvolveSearch(draft, {
      selection: payload.selection || [],
      resumeToken: token,
      activeRng,
      events,
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
    } else if (token.reflipSource === 'sabrinasEsp') {
      const espCard = wantsReflip ? findCard(draft, token.reflipCardId)?.card : null;
      if (espCard) espCard.reflipUsed = true;
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
      ? flipAttackCoins(attack, activeRng, coinCountReader(draft, { playerId: initiatorPlayerId, attacker, attackerView, targetInstanceId: token.targetInstanceId ?? null }))
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
  } else if (token.effectType === 'attackHandDiscardProtector') {
    // Flygon ex Psychic Protector: the defending player discards the chosen hand cards,
    // then the attack re-enters its damage step with the count settled.
    draft.pendingChoice = null;
    const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
    if (resumeCtx) {
      const protectorDiscarded = discardHandCards(draft, {
        playerId: choice.player,
        instanceIds: payload.selection || [],
        events,
      });
      resolveAttackEffectPhase(draft, { ...resumeCtx, ...(token.values || {}), protectorDiscarded });
    }
  } else if (token.effectType === NINJA_TRICK_EFFECT) {
    draft.pendingChoice = null;
    resumeNinjaTrick(draft, {
      token,
      selection: payload.selection,
      choicePlayerId: choice.player,
      activeRng,
      events,
    });
  } else if (token.effectType === 'attackCharityReduction') {
    // Charity: the attack re-enters its damage step with the chosen reduction.
    draft.pendingChoice = null;
    const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
    if (resumeCtx) {
      const pick = Number((payload.selection || [])[0]);
      const charityReduction = (token.charityAmounts || [])[pick - 1] || 0;
      resolveAttackEffectPhase(draft, { ...resumeCtx, ...(token.values || {}), charityReduction });
    }
  } else if (token.effectType === 'attackOptionalCostBonus') {
    // "You may <cost>. If you do, …": pay the accepted cost, then resume with the answer.
    draft.pendingChoice = null;
    const resumeCtx = attackResumeContext(draft, token, { activeRng, events });
    if (resumeCtx) {
      const { paid, count } = payOptionalCost(draft, {
        playerId: initiatorPlayerId,
        attacker: resumeCtx.attacker,
        token,
        selection: payload.selection,
        activeRng,
        events,
      });
      resolveAttackEffectPhase(draft, {
        ...resumeCtx,
        energyDiscarded: token.energyDiscarded,
        energyReturned: token.energyReturned,
        discardFlipHeads: token.discardFlipHeads,
        optionalCostPaid: paid,
        optionalCostCount: count,
        // "If you discard a {R} Energy card in this way, … is now Burned" (Magcargo Crushing
        // Lava) reads the paid cost: re-read the status conditions after paying.
        statusConditionsMet: undefined,
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
  } else if (token.effectType === 'retreatEnergy') {
    // The player chose which attached Energy pays the Retreat Cost; an
    // underpaying or wasteful pick falls back to the automatic payment.
    draft.pendingChoice = null;
    const picked = (payload.selection || []).map(Number);
    continueRetreat(draft, {
      playerId: initiatorPlayerId,
      benchInstanceId: token.benchInstanceId ?? null,
      discardEnergyIds: isExactRetreatPayment(draft, initiatorPlayerId, picked) ? picked : [],
      events,
    });
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
  } else if (token.effectType === KO_HAND_DISCARD_EFFECT) {
    draft.pendingChoice = null;
    resolveKoHandDiscard(draft, {
      playerId: initiatorPlayerId,
      selection: payload.selection || [],
      events,
    });
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
      // Tokens from before own-side targets carry no owner ids: the opponent's Pokémon.
      const targetOwnerId = token.targetOwnerId ?? token.oppId;
      const dealt = applyAttackTargets(draft, {
        selection,
        clause: token.attackTarget,
        defenderPlayerId: targetOwnerId,
        attackerPlayerId: token.creditedId ?? initiatorPlayerId,
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
        const options = attackTargetOptions(
          draft,
          targetOwnerId,
          token.attackTarget.scope || 'any',
          token.attackTarget.filter
        );
        if (options.length > 0) {
          draft.pendingChoice = createPendingChoice({
            player: token.attackTarget.chooser === 'opponent' ? targetOwnerId : initiatorPlayerId,
            source: 'attack',
            prompt: distributedPrompt(token.effectiveAttack?.name || 'Attack', token.attackTarget, remaining),
            options,
            min: 1,
            max: 1,
            resumeToken: {
              ...token,
              attackTarget: { ...token.attackTarget, remaining },
            },
          });
          return;
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
      if (token.effectiveAttack) {
        spendVstarAttack(draft, {
          playerId: initiatorPlayerId,
          attacker: null,
          attack: token.effectiveAttack,
          events,
        });
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
      return;
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

    const searchedToHand = [];
    // "Shuffle your deck, then put that card on top of it" (Beldum Magnetic Lift): the picks
    // leave the deck now and go back on top after the shuffle below.
    const searchedToTop = [];
    for (const sel of selection) {
      const instId = typeof sel === 'object' ? sel.instanceId : sel;
      const idx = player.zones.deck.findIndex(
        (c) => c.instanceId === instId
      );
      if (idx >= 0) {
        const [card] = player.zones.deck.splice(idx, 1);
        if (dest === 'deckTop') {
          searchedToTop.push(card);
        } else if (dest === 'attach' && attachTarget) {
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
          searchedToHand.push(card);
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
    // Design 059: "…reveal them, and put them into your hand" (Jirachi Charge Energy).
    if (token.reveal === true && searchedToHand.length > 0) {
      events.push({
        type: 'cardsRevealed',
        playerId: initiatorPlayerId,
        cards: searchedToHand.map((c) => ({ instanceId: c.instanceId, name: c.name })),
      });
    }

    // A staged search resumes with the next stage that still has a match;
    // only after the final stage does the deck shuffle and the turn end.
    const nextChoice = buildAttackSearchChoice(draft, {
      playerId: initiatorPlayerId,
      oppId: token.oppId,
      attackerId: token.attackerId,
      stages,
      fromIndex: currentIndex + 1,
      reveal: token.reveal === true,
    });
    if (nextChoice) {
      draft.pendingChoice = nextChoice;
      return;
    }

    player.zones.deck = activeRng.shuffle(player.zones.deck);
    events.push({
      type: 'zoneShuffled',
      zoneId: 'deck',
      playerId: initiatorPlayerId,
    });
    player.zones.deck.unshift(...searchedToTop);

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
}
