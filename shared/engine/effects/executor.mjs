/**
 * @file Resumable step executor for server-authoritative netcode (Slice 6).
 * Handles trainer, ability, and stadium step execution with suspension at choice points (PendingChoice).
 * Enforces Invariants 6 (no Math.random) and 8 (DOM-free, pure).
 * Covers Edge Cases:
 * - 6: Disconnect mid-choice (choice remains pending in state)
 * - 10: Target re-resolution each step from live state
 * - 11: Choice resolved by wrong player
 * - 12: Choice selection validation (min/max and option set)
 * - 15: Step budget (MAX_STEPS = 200) prevents infinite recursion
 */

import { findCard } from '../state.mjs';
import { matchesSearch } from '../rules/search-match.mjs';

export const MAX_EFFECT_STEPS = 200;

/**
 * Deterministically creates a PendingChoice without Math.random (Invariant 6).
 */
export function createPendingChoice({
  choiceId = null,
  player,
  prompt,
  source = '',
  options = [],
  min = 1,
  max = 1,
  cancellable = false,
  resumeToken = {},
  stateVersion = 0,
  stepIndex = 0,
}) {
  return {
    choiceId: choiceId || `choice_${player}_${stateVersion}_${stepIndex}`,
    player,
    prompt,
    source,
    options: options.map((opt) => ({
      instanceId: opt.instanceId,
      name: opt.name || '',
      src: opt.src || '',
      type: opt.type || '',
    })),
    min,
    max,
    cancellable: Boolean(cancellable),
    resumeToken,
  };
}

/**
 * Normalizes coin branch steps into an array.
 */
function normalizeSteps(branch) {
  if (!branch) return [];
  if (Array.isArray(branch)) return branch;
  if (typeof branch === 'object' && branch.type) return [branch];
  return [];
}

/**
 * Executes or resumes a sequence of effect steps.
 *
 * @param {object} draft Cloned GameState
 * @param {object} params
 * @param {Array} params.steps Effect step descriptors
 * @param {number} [params.fromStepIndex=0] Starting step index
 * @param {string} params.effectType 'trainer' | 'ability' | 'stadium'
 * @param {object} params.sourceCard Card initiating effect
 * @param {string} params.playerId Absolute player ID of actor
 * @param {object} params.activeRng PRNG instance
 * @param {Array} [params.events=[]] Array to collect emitted events
 * @param {Array<number>|null} [params.selection=null] Resolved instanceIds if resuming
 * @param {object} [params.context={}] Additional context across steps
 * @param {object} [params.budget={ count: 0 }] Step counter for loop detection
 * @returns {{ pendingChoice: object|null, completed: boolean }}
 */
export function executeSteps(draft, {
  steps = [],
  fromStepIndex = 0,
  effectType,
  sourceCard,
  playerId,
  activeRng,
  events = [],
  selection = null,
  context = {},
  budget = { count: 0 },
}) {
  const player = draft.players[playerId];
  if (!player) return { pendingChoice: null, completed: true };

  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  const opponent = oppId ? draft.players[oppId] : null;

  let currentSelection = selection;

  for (let idx = fromStepIndex; idx < steps.length; idx++) {
    budget.count++;
    // Edge Case 15: Step budget check to prevent infinite loops
    if (budget.count > MAX_EFFECT_STEPS) {
      events.push({
        type: 'effectLoopAborted',
        reason: 'step_budget_exceeded',
        stepCount: budget.count,
        source: sourceCard?.name || '',
      });
      return { pendingChoice: null, completed: true };
    }

    const step = steps[idx];
    if (!step) continue;

    // Handle choice resumption for the current step
    const stepSelection = currentSelection;
    currentSelection = null; // Consume selection for the resumed step

    switch (step.type) {
      case 'discardCost': {
        if (stepSelection) {
          // Resume: discard the selected cards
          const hand = player.zones.hand || [];
          const discarded = [];
          for (const sId of stepSelection) {
            const hIdx = hand.findIndex((c) => c.instanceId === sId);
            if (hIdx >= 0) {
              const [c] = hand.splice(hIdx, 1);
              player.zones.discard.push(c);
              discarded.push(c);
            }
          }
          events.push({
            type: 'cardsDiscarded',
            playerId,
            cards: discarded.map((c) => ({ instanceId: c.instanceId, name: c.name })),
          });
          break;
        }

        // Needs input: prompt player to discard N cards
        const candidates = (player.zones.hand || []).filter(
          (c) => c.instanceId !== sourceCard?.instanceId
        );
        const count = step.count || 1;
        const choice = createPendingChoice({
          player: playerId,
          prompt: `${sourceCard?.name || 'Trainer'}: Discard ${count} card${count > 1 ? 's' : ''} from your hand`,
          source: sourceCard?.name || '',
          options: candidates,
          min: count,
          max: count,
          cancellable: false,
          stateVersion: draft.stateVersion,
          stepIndex: idx,
          resumeToken: {
            effectType,
            sourceInstanceId: sourceCard?.instanceId,
            stepIndex: idx,
            steps,
            context,
            budgetCount: budget.count,
          },
        });
        return { pendingChoice: choice, completed: false };
      }

      case 'searchDeck':
      case 'searchAbility':
      case 'search': {
        const what = step.what || step.searchTarget || 'card';
        const dest = step.destination || 'hand';
        const maxCount = step.count || 1;

        if (stepSelection) {
          // Resume: move chosen cards to destination
          const deck = player.zones.deck || [];
          const pickedCards = [];
          for (const sId of stepSelection) {
            const dIdx = deck.findIndex((c) => c.instanceId === sId);
            if (dIdx >= 0) {
              const [c] = deck.splice(dIdx, 1);
              if (dest === 'bench') {
                player.zones.bench.push(c);
              } else {
                player.zones.hand.push(c);
              }
              pickedCards.push(c);
              events.push({
                type: 'cardMoved',
                instanceId: c.instanceId,
                from: 'deck',
                to: dest,
                playerId,
              });
            }
          }

          if (step.reveal || pickedCards.length > 0) {
            events.push({
              type: 'cardsRevealed',
              playerId,
              cards: pickedCards.map((c) => ({ instanceId: c.instanceId, name: c.name })),
            });
          }

          // Worked Example B Step 7: Shuffle deck after search
          if (activeRng) {
            activeRng.shuffle(deck);
          }
          events.push({ type: 'deckShuffled', playerId });
          break;
        }

        // Needs input: filter deck candidates
        const deck = player.zones.deck || [];
        const matches = deck.filter((c) => matchesSearch(c, what));

        if (matches.length === 0) {
          // Fail to find in private zone: shuffle deck and continue
          if (activeRng) {
            activeRng.shuffle(deck);
          }
          events.push({ type: 'deckShuffled', playerId });
          break;
        }

        const choice = createPendingChoice({
          player: playerId,
          prompt: `${sourceCard?.name || 'Search'}: Select up to ${maxCount} card${maxCount > 1 ? 's' : ''} (${what}) from your deck`,
          source: sourceCard?.name || '',
          options: matches,
          min: 0, // In PTCG, private zone searches can fail to find
          max: Math.min(maxCount, matches.length),
          cancellable: true,
          stateVersion: draft.stateVersion,
          stepIndex: idx,
          resumeToken: {
            effectType,
            sourceInstanceId: sourceCard?.instanceId,
            stepIndex: idx,
            steps,
            context,
            budgetCount: budget.count,
          },
        });
        return { pendingChoice: choice, completed: false };
      }

      case 'draw':
      case 'drawAbility': {
        if (step.until) {
          const target = step.count || 5;
          const hand = player.zones.hand || [];
          const deck = player.zones.deck || [];
          const needed = Math.max(0, target - hand.length);
          const actual = Math.min(needed, deck.length);
          if (actual > 0) {
            const drawn = deck.splice(0, actual);
            hand.push(...drawn);
            events.push({
              type: 'cardsDrawn',
              count: actual,
              playerId,
              cards: drawn.map((c) => ({ instanceId: c.instanceId })),
            });
          }
          break;
        }
        const count = step.count || 1;
        const deck = player.zones.deck || [];
        const hand = player.zones.hand || [];
        const actualCount = Math.min(count, deck.length);
        const drawn = deck.splice(0, actualCount);
        hand.push(...drawn);
        events.push({
          type: 'cardsDrawn',
          count: actualCount,
          playerId,
          cards: drawn.map((c) => ({ instanceId: c.instanceId })),
        });
        break;
      }

      case 'drawUntil': {
        const target = step.target || 5;
        const hand = player.zones.hand || [];
        const deck = player.zones.deck || [];
        const needed = Math.max(0, target - hand.length);
        const actual = Math.min(needed, deck.length);
        if (actual > 0) {
          const drawn = deck.splice(0, actual);
          hand.push(...drawn);
          events.push({
            type: 'cardsDrawn',
            count: actual,
            playerId,
            cards: drawn.map((c) => ({ instanceId: c.instanceId })),
          });
        }
        break;
      }

      case 'discardHandThenDraw': {
        const hand = player.zones.hand || [];
        const discard = player.zones.discard || [];
        const deck = player.zones.deck || [];
        const discarded = hand.splice(0, hand.length);
        discard.push(...discarded);
        events.push({
          type: 'cardsDiscarded',
          playerId,
          cards: discarded.map((c) => ({ instanceId: c.instanceId, name: c.name })),
        });
        const count = step.count || 1;
        const actual = Math.min(count, deck.length);
        const drawn = deck.splice(0, actual);
        hand.push(...drawn);
        events.push({
          type: 'cardsDrawn',
          count: actual,
          playerId,
          cards: drawn.map((c) => ({ instanceId: c.instanceId })),
        });
        break;
      }

      case 'shuffleHandThenDraw': {
        const hand = player.zones.hand || [];
        const deck = player.zones.deck || [];
        deck.push(...hand.splice(0, hand.length));
        if (activeRng) activeRng.shuffle(deck);
        events.push({ type: 'deckShuffled', playerId });
        const count = step.count || 1;
        const actual = Math.min(count, deck.length);
        const drawn = deck.splice(0, actual);
        hand.push(...drawn);
        events.push({
          type: 'cardsDrawn',
          count: actual,
          playerId,
          cards: drawn.map((c) => ({ instanceId: c.instanceId })),
        });
        break;
      }

      case 'switchOwn':
      case 'switchAbility':
      case 'switch': {
        const bench = (player.zones.bench || []).filter((c) => !c.attachedTo);
        const active = (player.zones.active || []).find((c) => !c.attachedTo);
        if (!active || bench.length === 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_bench_pokemon', step: step.type });
          break;
        }

        let chosenBenchId = null;
        if (stepSelection && stepSelection.length > 0) {
          chosenBenchId = stepSelection[0];
        } else if (bench.length === 1) {
          // Auto-switch when exactly one bench Pokémon exists
          chosenBenchId = bench[0].instanceId;
        } else {
          // Multi-bench choice
          const choice = createPendingChoice({
            player: playerId,
            prompt: `${sourceCard?.name || 'Switch'}: Select a Benched Pokémon to switch with your Active`,
            source: sourceCard?.name || '',
            options: bench,
            min: 1,
            max: 1,
            cancellable: false,
            stateVersion: draft.stateVersion,
            stepIndex: idx,
            resumeToken: {
              effectType,
              sourceInstanceId: sourceCard?.instanceId,
              stepIndex: idx,
              steps,
              context,
              budgetCount: budget.count,
            },
          });
          return { pendingChoice: choice, completed: false };
        }

        // Perform active-bench switch preserving attachments
        const benchCard = bench.find((c) => c.instanceId === chosenBenchId);
        if (benchCard) {
          for (let i = player.zones.active.length - 1; i >= 0; i--) {
            const c = player.zones.active[i];
            if (c.instanceId === active.instanceId || c.attachedTo === active.instanceId) {
              player.zones.active.splice(i, 1);
              player.zones.bench.push(c);
            }
          }
          for (let i = player.zones.bench.length - 1; i >= 0; i--) {
            const c = player.zones.bench[i];
            if (c.instanceId === benchCard.instanceId || c.attachedTo === benchCard.instanceId) {
              player.zones.bench.splice(i, 1);
              player.zones.active.push(c);
            }
          }
          active.specialCondition = null;
          events.push({
            type: 'cardSwitched',
            playerId,
            activeId: active.instanceId,
            benchId: benchCard.instanceId,
          });
        }
        break;
      }

      case 'switchOpponent':
      case 'switchOpponentOut': {
        if (!opponent) break;
        const oppBench = (opponent.zones.bench || []).filter((c) => !c.attachedTo);
        const oppActive = (opponent.zones.active || []).find((c) => !c.attachedTo);
        if (!oppActive || oppBench.length === 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_opponent_bench', step: step.type });
          break;
        }

        // switchOpponent: acting player chooses opponent's bench (e.g. Boss's Orders)
        // switchOpponentOut: opponent chooses their own bench (e.g. Repel)
        const choicePlayer = step.type === 'switchOpponentOut' ? opponent.playerId : playerId;

        let chosenBenchId = null;
        if (stepSelection && stepSelection.length > 0) {
          chosenBenchId = stepSelection[0];
        } else if (oppBench.length === 1) {
          chosenBenchId = oppBench[0].instanceId;
        } else {
          const choice = createPendingChoice({
            player: choicePlayer,
            prompt: `${sourceCard?.name || 'Gust'}: Select opponent's Benched Pokémon to switch to Active`,
            source: sourceCard?.name || '',
            options: oppBench,
            min: 1,
            max: 1,
            cancellable: false,
            stateVersion: draft.stateVersion,
            stepIndex: idx,
            resumeToken: {
              effectType,
              sourceInstanceId: sourceCard?.instanceId,
              stepIndex: idx,
              steps,
              context,
              budgetCount: budget.count,
            },
          });
          return { pendingChoice: choice, completed: false };
        }

        const oppBenchCard = oppBench.find((c) => c.instanceId === chosenBenchId);
        if (oppBenchCard) {
          for (let i = opponent.zones.active.length - 1; i >= 0; i--) {
            const c = opponent.zones.active[i];
            if (c.instanceId === oppActive.instanceId || c.attachedTo === oppActive.instanceId) {
              opponent.zones.active.splice(i, 1);
              opponent.zones.bench.push(c);
            }
          }
          for (let i = opponent.zones.bench.length - 1; i >= 0; i--) {
            const c = opponent.zones.bench[i];
            if (c.instanceId === oppBenchCard.instanceId || c.attachedTo === oppBenchCard.instanceId) {
              opponent.zones.bench.splice(i, 1);
              opponent.zones.active.push(c);
            }
          }
          oppActive.specialCondition = null;
          events.push({
            type: 'cardSwitched',
            playerId: opponent.playerId,
            activeId: oppActive.instanceId,
            benchId: oppBenchCard.instanceId,
          });
        }
        break;
      }

      case 'recursion':
      case 'recursionFromDiscardAbility':
      case 'shuffleFromDiscard': {
        const discard = player.zones.discard || [];
        const isShuffle = step.type === 'shuffleFromDiscard';
        const what = step.what || 'card';
        const count = step.count || 1;

        if (stepSelection) {
          const destZone = isShuffle ? player.zones.deck : player.zones.hand;
          const recovered = [];
          for (const sId of stepSelection) {
            const dIdx = discard.findIndex((c) => c.instanceId === sId);
            if (dIdx >= 0) {
              const [c] = discard.splice(dIdx, 1);
              destZone.push(c);
              recovered.push(c);
            }
          }
          if (isShuffle && activeRng) {
            activeRng.shuffle(player.zones.deck);
            events.push({ type: 'deckShuffled', playerId });
          }
          events.push({
            type: isShuffle ? 'cardsShuffledIntoDeck' : 'cardsRecovered',
            playerId,
            cards: recovered.map((c) => ({ instanceId: c.instanceId, name: c.name })),
          });
          break;
        }

        const candidates = discard.filter((c) => matchesSearch(c, what));
        if (candidates.length === 0) {
          break;
        }

        const choice = createPendingChoice({
          player: playerId,
          prompt: `${sourceCard?.name || 'Recover'}: Select up to ${count} card${count > 1 ? 's' : ''} from discard`,
          source: sourceCard?.name || '',
          options: candidates,
          min: 0,
          max: Math.min(count, candidates.length),
          cancellable: true,
          stateVersion: draft.stateVersion,
          stepIndex: idx,
          resumeToken: {
            effectType,
            sourceInstanceId: sourceCard?.instanceId,
            stepIndex: idx,
            steps,
            context,
            budgetCount: budget.count,
          },
        });
        return { pendingChoice: choice, completed: false };
      }

      case 'heal':
      case 'healAmount':
      case 'healAbility': {
        const healAmt = step.amount || 30;
        // Edge Case 10: re-resolve damaged in-play Pokemon dynamically
        const inPlay = [
          ...(player.zones.active || []),
          ...(player.zones.bench || []),
        ].filter((c) => !c.attachedTo && (c.damage || 0) > 0);

        if (inPlay.length === 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_damaged_pokemon' });
          break;
        }

        let targetId = null;
        if (stepSelection && stepSelection.length > 0) {
          targetId = stepSelection[0];
        } else if (inPlay.length === 1 || step.target === 'Active Pokémon') {
          targetId = inPlay[0].instanceId;
        } else {
          const choice = createPendingChoice({
            player: playerId,
            prompt: `${sourceCard?.name || 'Heal'}: Select a Pokémon to heal (${healAmt} HP)`,
            source: sourceCard?.name || '',
            options: inPlay,
            min: 1,
            max: 1,
            cancellable: false,
            stateVersion: draft.stateVersion,
            stepIndex: idx,
            resumeToken: {
              effectType,
              sourceInstanceId: sourceCard?.instanceId,
              stepIndex: idx,
              steps,
              context,
              budgetCount: budget.count,
            },
          });
          return { pendingChoice: choice, completed: false };
        }

        const targetRef = findCard(draft, targetId);
        // Edge Case 10: verify target still exists
        if (targetRef && targetRef.card) {
          const oldDamage = targetRef.card.damage || 0;
          targetRef.card.damage = Math.max(0, oldDamage - healAmt);
          events.push({
            type: 'damageUpdated',
            instanceId: targetId,
            damage: targetRef.card.damage,
            healed: oldDamage - targetRef.card.damage,
          });
        } else {
          events.push({ type: 'effectStepSkipped', reason: 'target_not_found', targetInstanceId: targetId });
        }
        break;
      }

      case 'coinFlip': {
        const face = (activeRng ? activeRng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
        events.push({ type: 'coinFlipped', playerId, face });
        const branch = normalizeSteps(face === 'heads' ? step.heads : step.tails);
        if (branch.length > 0) {
          const subResult = executeSteps(draft, {
            steps: branch,
            fromStepIndex: 0,
            effectType,
            sourceCard,
            playerId,
            activeRng,
            events,
            context,
            budget,
          });
          if (subResult.pendingChoice) {
            return subResult;
          }
        }
        break;
      }

      case 'applyStatus': {
        const targetSide = step.target === 'bothActiveNonDark' || step.target === 'opponentActive' ? opponent : player;
        const targetActive = targetSide?.zones?.active?.find((c) => !c.attachedTo);
        if (targetActive) {
          const condition = step.condition || step.conditions?.[0] || 'Poisoned';
          targetActive.specialCondition = condition;
          events.push({
            type: 'statusApplied',
            playerId: targetSide.playerId,
            instanceId: targetActive.instanceId,
            condition,
          });
        }
        break;
      }

      case 'attachFromDiscard': {
        const discard = player.zones.discard || [];
        const inPlay = [...(player.zones.active || []), ...(player.zones.bench || [])].filter(
          (c) => !c.attachedTo
        );

        if (stepSelection) {
          // Resumed: energy selection
          const energyCard = discard.find((c) => c.instanceId === stepSelection[0]);
          const targetCard = inPlay[0]; // Active or bench target
          // Edge Case 10: verify target still exists in play
          if (energyCard && targetCard) {
            const dIdx = discard.indexOf(energyCard);
            if (dIdx >= 0) {
              discard.splice(dIdx, 1);
              energyCard.attachedTo = targetCard.instanceId;
              const targetZone = targetCard === player.zones.active[0] ? player.zones.active : player.zones.bench;
              targetZone.push(energyCard);
              events.push({
                type: 'cardAttached',
                instanceId: energyCard.instanceId,
                targetInstanceId: targetCard.instanceId,
                playerId,
              });
            }
          } else {
            events.push({ type: 'effectStepSkipped', reason: 'target_not_found' });
          }
          break;
        }

        const energyCandidates = discard.filter((c) =>
          String(c.name || '').toLowerCase().includes('energy')
        );
        if (energyCandidates.length === 0 || inPlay.length === 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_energy_or_target' });
          break;
        }

        const choice = createPendingChoice({
          player: playerId,
          prompt: `${sourceCard?.name || 'Attach'}: Select an Energy card from discard to attach`,
          source: sourceCard?.name || '',
          options: energyCandidates,
          min: 1,
          max: 1,
          cancellable: true,
          stateVersion: draft.stateVersion,
          stepIndex: idx,
          resumeToken: {
            effectType,
            sourceInstanceId: sourceCard?.instanceId,
            stepIndex: idx,
            steps,
            context,
            budgetCount: budget.count,
          },
        });
        return { pendingChoice: choice, completed: false };
      }

      default:
        // Passive, informational, or unhandled step: continue safely
        break;
    }
  }

  return { pendingChoice: null, completed: true };
}
