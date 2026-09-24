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

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { shuffleInPlace } from '../rng.mjs';
import { isEnergy, isPokemon } from '../cards.mjs';
import { normalizeStage } from '../rules/evolution.mjs';
import { topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { addCondition, clearConditions, hasAnyCondition } from '../rules/special-conditions.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { classifyEnergyEffect } from '../rules/energy-effects.mjs';
import {
  isSingleStrikeCard,
  isEvolutionCard,
  stadiumBlocksHealing,
} from '../rules/stadium-effects.mjs';
import { EXTRA_STEP_HANDLERS, rootMatchesTarget } from './trainer-steps.mjs';
import { ATTACK_STEP_HANDLERS } from './attack-steps.mjs';
import { applyStadiumSwitchTriggers } from './stadium-trigger-apply.mjs';

export const MAX_EFFECT_STEPS = 200;

// Step kinds with a case in executeSteps' switch (kept in sync by executor-step-types.test).
export const EXECUTOR_STEP_TYPES = new Set([
  'discardCost', 'discardCostAbility', 'searchDeck', 'searchAbility', 'search', 'draw',
  'drawAbility', 'drawUntil', 'millItems', 'discardHandThenDraw', 'shuffleHandThenDraw',
  'ionoShuffle', 'switchOwn', 'switchAbility', 'switch', 'switchOpponent', 'switchOpponentOut',
  'recursion', 'recursionFromDiscardAbility', 'shuffleFromDiscard', 'heal', 'healAmount',
  'healAbility', 'coinFlip', 'coinDraw', 'returnTool', 'shuffleOwnPokemon', 'revealHand',
  'drawIfNoSupporter', 'putHandToDeck', 'peekReturn', 'peekDiscard', 'benchRestored',
  'fossilBench', 'applyStatus', 'statusAbility', 'recoverEnergy', 'recoverFromDiscard',
  'attachAbility', 'attachFromDiscard',
]);

/** Whether executeSteps has a handler for a step kind (switch case or handler table). */
export function isExecutableStepType(type) {
  return (
    EXECUTOR_STEP_TYPES.has(type) ||
    Object.hasOwn(EXTRA_STEP_HANDLERS, type) ||
    Object.hasOwn(ATTACK_STEP_HANDLERS, type)
  );
}

/**
 * Whether a card can satisfy a discard-cost Energy-type filter. Basic Energy
 * cards carry their type in the printed name ("Fire Energy"); some printings
 * also set `types`. A null/empty filter matches any card.
 *
 * @param {object} card
 * @param {string[]|null|undefined} energyTypes lowercase type names
 * @returns {boolean}
 */
export function matchesEnergyTypeFilter(card, energyTypes) {
  if (!Array.isArray(energyTypes) || energyTypes.length === 0) return true;
  const name = String(card?.name || '').toLowerCase();
  const types = (Array.isArray(card?.types) ? card.types : []).map((t) =>
    String(t).toLowerCase()
  );
  return energyTypes.some((type) => {
    const t = String(type).toLowerCase();
    return types.includes(t) || name.includes(t);
  });
}

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
  const token = resumeToken ? { ...resumeToken } : {};
  if (token && !token.initiatorPlayerId && player) {
    token.initiatorPlayerId = player;
  }
  return {
    choiceId: choiceId || `choice_${player}_${stateVersion}_${stepIndex}`,
    player,
    prompt,
    source,
    // Blind picks (face-down Prizes) reach the chooser without name or image (I141).
    options: options.map((opt) =>
      opt.faceDown
        ? { instanceId: opt.instanceId, faceDown: true }
        : {
            instanceId: opt.instanceId,
            name: opt.name || '',
            src: opt.src || '',
            type: opt.type || '',
          }
    ),
    min,
    max,
    cancellable: Boolean(cancellable),
    resumeToken: token,
  };
}

function opponentBenchIsEvolved(player, root) {
  const stage = normalizeStage(root.stage);
  if (stage && stage !== 'Basic') return true;
  return [...(player.zones.active || []), ...(player.zones.bench || [])].some(
    (c) => c.attachedTo === root.instanceId && isPokemon(c)
  );
}

function inPlayRoots(player) {
  return [...(player.zones.active || []), ...(player.zones.bench || [])].filter((c) => !c.attachedTo);
}

// A drawUntil target descriptor (design 035 slice 8), a numeric back-compat read,
// or the 5-card default.
function drawUntilTargetFor(target, opponent) {
  if (target && typeof target === 'object') {
    if (target.kind === 'opponentHand') return (opponent?.zones?.hand || []).length;
    if (target.kind === 'opponentHandPlus') {
      return (opponent?.zones?.hand || []).length + (target.n || 1);
    }
    if (target.kind === 'fixed') return target.n ?? 5;
    return 5;
  }
  return typeof target === 'number' ? target : 5;
}

// Whether a drawUntil step's bonus target applies (Lillie, Grusha, Cynthia's
// Ambition, Team Rocket's Ariana).
function drawUntilBonusApplies(when, draft, player) {
  switch (when) {
    case 'firstTurn':
      return (draft.turn?.number ?? 99) <= 2;
    case 'noEnergyAttached':
      return inPlayRoots(player).every(
        (root) =>
          ![...(player.zones.active || []), ...(player.zones.bench || [])].some(
            (c) => c.attachedTo === root.instanceId && isEnergy(c)
          )
      );
    case 'koedLastTurn':
      return Boolean(player.flags?.koedLastOppTurn);
    case 'teamRocketInPlay':
      return inPlayRoots(player).every((root) => {
        const zone = [...(player.zones.active || []), ...(player.zones.bench || [])];
        const top = topPokemonCard(zone, root);
        return /team rocket[’']s/i.test(String(top?.name || ''));
      });
    default:
      return false;
  }
}

export function attachToRoot(player, card, root, events) {
  for (const zone of [player.zones.deck, player.zones.discard, player.zones.hand]) {
    const i = (zone || []).indexOf(card);
    if (i >= 0) zone.splice(i, 1);
  }
  card.attachedTo = root.instanceId;
  const rootZone = (player.zones.active || []).includes(root) ? player.zones.active : player.zones.bench;
  rootZone.push(card);
  events.push({ type: 'cardAttached', instanceId: card.instanceId, targetInstanceId: root.instanceId, playerId: player.playerId });
}

/**
 * Normalizes coin branch steps into an array.
 */
const ABILITY_STATUS_CONDITIONS = {
  asleep: 'Asleep',
  burned: 'Burned',
  confused: 'Confused',
  paralyzed: 'Paralyzed',
  poisoned: 'Poisoned',
};

// Maps a parseAbility statusAbility step onto the executor's vocabulary, the way the
// legacy client reads it (chat-buttons statusAbility): 'opponent' is the opponent's
// Active, anything else the user's own Active. Returns null when no condition parsed.
function normalizeStatusAbilityStep(step) {
  const condition = ABILITY_STATUS_CONDITIONS[String(step.status || '').toLowerCase()];
  if (!condition) return null;
  return {
    target: step.target === 'opponent' || step.target === 'opponentActive' ? 'opponentActive' : 'self',
    condition,
    coinFlip: Boolean(step.coinFlip),
  };
}

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

    // "If you attached Energy … in this way" bonuses (I93): remember the attach across resumes.
    const lastAttach = events.findLast((e) => e.type === 'cardAttached');
    if (lastAttach) {
      context.attachedEnergy = true;
      context.attachedTargetId = lastAttach.targetInstanceId;
    }
    if (step.requiresAttach && !context.attachedEnergy) {
      events.push({ type: 'effectStepSkipped', reason: 'nothing_attached', step: step.type });
      continue;
    }

    // Handle choice resumption for the current step
    const stepSelection = currentSelection;
    currentSelection = null; // Consume selection for the resumed step

    // A hand-attach ability (Quaquaval Energy Carnival) runs the attachFromHand handler; the
    // other attachAbility forms stay on the switch below.
    const handlerType =
      step.type === 'attachAbility' && step.fromHand && !step.triggeredByAttach ? 'attachFromHand' : step.type;
    const extraHandler = EXTRA_STEP_HANDLERS[handlerType] || ATTACK_STEP_HANDLERS[handlerType];
    if (extraHandler) {
      const memoKey = `${idx}:${step.type}`;
      const choice = extraHandler({
        draft,
        step,
        player,
        opponent,
        playerId,
        sourceCard,
        activeRng,
        events,
        selection: stepSelection,
        memo: context[memoKey],
        ask: ({ player: chooser = playerId, prompt, options, min, max, memo = {} }) => {
          context[memoKey] = memo;
          return createPendingChoice({
            player: chooser,
            prompt,
            source: sourceCard?.name || '',
            options,
            min,
            max,
            cancellable: min === 0,
            stateVersion: draft.stateVersion,
            stepIndex: idx,
            resumeToken: {
              effectType,
              sourceInstanceId: sourceCard?.instanceId,
              initiatorPlayerId: playerId,
              stepIndex: idx,
              steps,
              context,
              budgetCount: budget.count,
            },
          });
        },
      });
      if (choice) return { pendingChoice: choice, completed: false };
      delete context[memoKey];
      continue;
    }

    switch (step.type) {
      case 'discardCost':
      case 'discardCostAbility': {
        if (stepSelection) {
          // Resume: discard the selected cards
          const hand = player.zones.hand || [];
          const discarded = [];
          for (const sId of stepSelection) {
            const hIdx = hand.findIndex((c) => c.instanceId === sId);
            if (hIdx >= 0) {
              const [c] = hand.splice(hIdx, 1);
              discardCardToPlayerZone(player, c);
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

        // Needs input: prompt player to discard N cards. An Energy-discard cost
        // (`energyOnly`) must not offer a non-Energy card just because the cost
        // names a type loosely ("discard an Energy card").
        const isEnergyCard = (c) =>
          /energy/i.test(String(c?.type || '') + String(c?.name || ''));
        const candidates = (player.zones.hand || []).filter(
          (c) =>
            c.instanceId !== sourceCard?.instanceId &&
            matchesEnergyTypeFilter(c, step.energyTypes) &&
            (!step.energyOnly || isEnergyCard(c)) &&
            (!step.basicOnly || classifyEnergyEffect(c) === 'basic') &&
            (step.tagFilter !== 'single-strike' || isSingleStrikeCard(c))
        );
        const count = step.count || 1;
        // An exact-count discard cost the hand cannot pay must never open a
        // min=count/max=count choice over fewer options: `resolveChoice`
        // rejects any selection below `min`, so the choice could never be
        // resolved and every later command would answer `waiting_for_choice`
        // (Prism Tower with one card in hand soft-locked the match).
        if (candidates.length < count) {
          events.push({
            type: 'effectStepSkipped',
            reason: 'not_enough_cards_to_discard',
            required: count,
            available: candidates.length,
          });
          // Abort the rest of the effect: the cost is unpayable, and "if you do"
          // effects must not resolve what follows the unpaid cost.
          return { pendingChoice: null, completed: true };
        }
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
            initiatorPlayerId: playerId,
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
        // Ability parser emits 'Bench' (legacy client contract); trainers emit 'bench'.
        const dest = String(step.destination || 'hand').toLowerCase();
        const maxCount = step.count || 1;
        const nameFilter = step.nameFilter
          ? String(step.nameFilter).toLowerCase()
          : null;
        const cardMatches = (c) =>
          matchesSearch(c, what) &&
          (!nameFilter || String(c?.name || '').toLowerCase().includes(nameFilter));

        const attachKey = `${idx}:searchAttach`;
        const attachRoots = () =>
          inPlayRoots(player).filter((c) => {
            if (!step.attachTarget) return true;
            if (step.attachTarget === 'this pokémon') return c.instanceId === sourceCard?.instanceId;
            return rootMatchesTarget(player, c, step.attachTarget);
          });
        // "attach them to your Pokémon in any way you like" (attachEach) picks a Pokémon per
        // card; otherwise every searched card goes onto the one chosen Pokémon.
        const askAttachTarget = (pendingIds) => {
          context[attachKey] = pendingIds;
          const next = (player.zones.deck || []).find((c) => c.instanceId === pendingIds[0]);
          const what = step.attachEach && next ? next.name : 'the Energy';
          return createPendingChoice({
            player: playerId,
            prompt: `${sourceCard?.name || 'Search'}: Choose a Pokémon to attach ${what} to`,
            source: sourceCard?.name || '',
            options: attachRoots(),
            min: 1,
            max: 1,
            stateVersion: draft.stateVersion,
            stepIndex: idx,
            resumeToken: {
              effectType,
              sourceInstanceId: sourceCard?.instanceId,
              initiatorPlayerId: playerId,
              stepIndex: idx,
              steps,
              context,
              budgetCount: budget.count,
            },
          });
        };
        const finishSearch = () => {
          delete context[attachKey];
          if (activeRng) shuffleInPlace(activeRng, player.zones.deck || []);
          events.push({ type: 'deckShuffled', playerId });
        };
        if (stepSelection && context[attachKey]) {
          // Resume: the chosen Pokémon receives the searched Energy (or the next one, attachEach)
          const deck = player.zones.deck || [];
          const pendingIds = context[attachKey];
          const root = attachRoots().find((c) => c.instanceId === stepSelection[0]);
          const batch = step.attachEach ? pendingIds.slice(0, 1) : pendingIds;
          const searched = root ? deck.filter((c) => batch.includes(c.instanceId)) : [];
          for (const card of searched) {
            attachToRoot(player, card, root, events);
          }
          // Sinister Surge: "If you attached Energy … in this way, place N damage counters on that Pokémon."
          if (searched.length > 0 && step.attachDamage > 0) {
            root.damage = (root.damage || 0) + step.attachDamage * 10;
            events.push({ type: 'damageUpdated', instanceId: root.instanceId, damage: root.damage });
          }
          const remaining = step.attachEach
            ? pendingIds.slice(1).filter((id) => deck.some((c) => c.instanceId === id))
            : [];
          if (root && remaining.length > 0) {
            return { pendingChoice: askAttachTarget(remaining), completed: false };
          }
          finishSearch();
          break;
        }

        if (dest === 'attach' && !stepSelection && attachRoots().length === 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_attach_target' });
          break;
        }

        if (stepSelection && dest === 'attach') {
          const picked = stepSelection.filter((id) =>
            (player.zones.deck || []).some((c) => c.instanceId === id && cardMatches(c))
          );
          const roots = attachRoots();
          if (picked.length === 0 || roots.length === 0) {
            finishSearch();
            break;
          }
          // One possible Pokémon ("attach it to this Pokémon"): no prompt.
          if (roots.length === 1) {
            const deck = player.zones.deck || [];
            for (const card of deck.filter((c) => picked.includes(c.instanceId))) {
              attachToRoot(player, card, roots[0], events);
            }
            if (step.attachDamage > 0) {
              roots[0].damage = (roots[0].damage || 0) + step.attachDamage * 10;
              events.push({ type: 'damageUpdated', instanceId: roots[0].instanceId, damage: roots[0].damage });
            }
            finishSearch();
            break;
          }
          return { pendingChoice: askAttachTarget(picked), completed: false };
        }

        if (stepSelection) {
          // Resume: move chosen cards to destination
          const deck = player.zones.deck || [];
          const pickedCards = [];
          for (const sId of stepSelection) {
            if (dest === 'bench') {
              const currentBench = player.zones.bench || [];
              const benchCount = currentBench.filter((b) => !b.attachedTo).length;
              if (benchCount >= 5) {
                // Hard limit: bench is full, do not overfill bench
                continue;
              }
            }
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
            shuffleInPlace(activeRng, deck);
          }
          events.push({ type: 'deckShuffled', playerId });
          break;
        }

        // Bench limit check for deck-to-bench search (Edge Case 9)
        if (dest === 'bench') {
          const bench = player.zones.bench || [];
          const benchCount = bench.filter((c) => !c.attachedTo).length;
          const availableBenchSlots = Math.max(0, 5 - benchCount);
          if (availableBenchSlots <= 0) {
            events.push({
              type: 'effectStepSkipped',
              reason: 'bench_full',
              playerId,
            });
            break;
          }
        }

        // Needs input: filter deck candidates
        const deck = player.zones.deck || [];
        const matches = deck.filter(cardMatches);

        if (matches.length === 0) {
          // Fail to find in private zone: shuffle deck and continue
          if (activeRng) {
            shuffleInPlace(activeRng, deck);
          }
          events.push({ type: 'deckShuffled', playerId });
          break;
        }

        let effectiveMaxCount = maxCount;
        if (dest === 'bench') {
          const bench = player.zones.bench || [];
          const benchCount = bench.filter((c) => !c.attachedTo).length;
          const availableBenchSlots = Math.max(0, 5 - benchCount);
          effectiveMaxCount = Math.min(maxCount, availableBenchSlots);
        }

        const choice = createPendingChoice({
          player: playerId,
          prompt: `${sourceCard?.name || 'Search'}: Select up to ${effectiveMaxCount} card${effectiveMaxCount > 1 ? 's' : ''} (${what}) from your deck`,
          source: sourceCard?.name || '',
          options: matches,
          min: 0, // In PTCG, private zone searches can fail to find
          max: Math.min(effectiveMaxCount, matches.length),
          cancellable: true,
          stateVersion: draft.stateVersion,
          stepIndex: idx,
          resumeToken: {
            effectType,
            sourceInstanceId: sourceCard?.instanceId,
            initiatorPlayerId: playerId,
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
        // Design 035 slice 8: `target` may be a descriptor ({kind:'fixed'|
        // 'opponentHand'|'opponentHandPlus'}), a numeric back-compat read, or
        // overridden by `targetType` (Mystery Garden) / the bonus clause.
        let target = drawUntilTargetFor(step.target, opponent);
        // Mystery Garden: target hand size is the live count of the player's
        // in-play Pokémon of a given type ("as many … as they have {P} Pokémon
        // in play"), not a printed number.
        if (step.targetType) {
          const want = String(step.targetType).toLowerCase();
          target = inPlayRoots(player).filter((c) =>
            (Array.isArray(c.types) ? c.types : [])
              .map((v) => String(v).toLowerCase())
              .includes(want)
          ).length;
        } else if (step.bonusTarget && drawUntilBonusApplies(step.bonusWhen, draft, player)) {
          target = drawUntilTargetFor(step.bonusTarget, opponent);
        }
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

      case 'millItems': {
        // PokéStop: mill the top N deck cards; Item cards go to hand, the rest
        // to the discard pile. Public-zone move, so no choice is required.
        const count = step.count || 3;
        const deck = player.zones.deck || [];
        const milled = deck.splice(0, Math.min(count, deck.length));
        for (const c of milled) {
          if (matchesSearch(c, 'item')) {
            player.zones.hand.push(c);
            events.push({
              type: 'cardMoved',
              instanceId: c.instanceId,
              from: 'deck',
              to: 'hand',
              playerId,
            });
          } else {
            discardCardToPlayerZone(player, c);
            events.push({
              type: 'cardsDiscarded',
              playerId,
              cards: [{ instanceId: c.instanceId, name: c.name }],
            });
          }
        }
        break;
      }

      case 'discardHandThenDraw': {
        const hand = player.zones.hand || [];
        const deck = player.zones.deck || [];
        const discarded = hand.splice(0, hand.length);
        for (const c of discarded) discardCardToPlayerZone(player, c);
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
        if (activeRng) shuffleInPlace(activeRng, deck);
        events.push({ type: 'deckShuffled', playerId });
        const bonusApplies =
          step.bonusCount && step.bonusWhen === 'prizesRemaining==6' && (player.zones.prizes || []).length === 6;
        const count = bonusApplies ? step.bonusCount : step.count || 1;
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

      case 'ionoShuffle': {
        const actors = [player];
        if (opponent) actors.push(opponent);

        // Judge-style: each player shuffles their hand into their deck and draws a fixed count.
        if (step.drawCount) {
          for (const p of actors) {
            const hand = p.zones.hand || [];
            const returned = hand.splice(0, hand.length);
            (p.zones.deck || []).push(...returned);
            if (activeRng) shuffleInPlace(activeRng, p.zones.deck);
            events.push({ type: 'cardsShuffledIntoDeck', count: returned.length, playerId: p.playerId });
            const drawn = p.zones.deck.splice(0, Math.min(step.drawCount, p.zones.deck.length));
            hand.push(...drawn);
            events.push({
              type: 'cardsDrawn',
              count: drawn.length,
              playerId: p.playerId,
              cards: drawn.map((c) => ({ instanceId: c.instanceId })),
            });
          }
          break;
        }

        const initialHandCounts = new Map();
        for (const p of actors) {
          const hand = (p.zones.hand || []).filter((c) => c.instanceId !== sourceCard?.instanceId);
          initialHandCounts.set(p.playerId, hand.length);
        }

        const hasTrailingDraw = steps.some((s) => s.type === 'draw' || s.type === 'opponentDraw');
        const isPrizeDraw = step.drawPrizes !== false && (!hasTrailingDraw || /iono/i.test(sourceCard?.name || ''));
        const isBottom = step.bottom || /iono/i.test(sourceCard?.name || '') || isPrizeDraw;

        for (const p of actors) {
          const hand = p.zones.hand || [];
          const count = hand.length;
          if (count > 0) {
            const returned = hand.splice(0, count);
            if (activeRng) shuffleInPlace(activeRng, returned);
            if (isBottom) {
              (p.zones.deck || []).push(...returned);
              events.push({
                type: 'cardsMovedToDeckBottom',
                count,
                playerId: p.playerId,
              });
            } else {
              (p.zones.deck || []).push(...returned);
              if (activeRng) shuffleInPlace(activeRng, p.zones.deck);
              events.push({
                type: 'cardsShuffledIntoDeck',
                count,
                playerId: p.playerId,
              });
            }
          }
        }

        if (isPrizeDraw) {
          const initiatorHandCount = initialHandCounts.get(playerId) || 0;
          const oppHandCount = opponent ? (initialHandCounts.get(opponent.playerId) || 0) : 0;
          const anyPut = initiatorHandCount > 0 || oppHandCount > 0;

          if (anyPut) {
            for (const p of actors) {
              if (p.playerId === playerId && initiatorHandCount === 0) {
                continue;
              }
              const prizeCount = (p.zones.prizes || []).length;
              const deck = p.zones.deck || [];
              const drawCount = Math.min(prizeCount, deck.length);
              if (drawCount > 0) {
                const drawn = deck.splice(0, drawCount);
                (p.zones.hand || []).push(...drawn);
                events.push({
                  type: 'cardsDrawn',
                  count: drawCount,
                  playerId: p.playerId,
                  cards: drawn.map((c) => ({ instanceId: c.instanceId })),
                });
              }
            }
          }
        }
        break;
      }

      case 'switchOwn':
      case 'switchAbility':
      case 'switch': {
        if (step.target === 'opponent') {
          if (!opponent) break;
          const oppBench = (opponent.zones.bench || []).filter(
            (c) => !c.attachedTo && (step.filter !== 'Basic' || !opponentBenchIsEvolved(opponent, c))
          );
          const oppActive = (opponent.zones.active || []).find((c) => !c.attachedTo);
          if (!oppActive || oppBench.length === 0) {
            events.push({ type: 'effectStepSkipped', reason: 'no_opponent_bench', step: step.type });
            break;
          }
          let chosenBenchId = null;
          if (stepSelection && stepSelection.length > 0) {
            chosenBenchId = stepSelection[0];
          } else if (oppBench.length === 1) {
            chosenBenchId = oppBench[0].instanceId;
          } else {
            const choice = createPendingChoice({
              player: playerId,
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
                initiatorPlayerId: playerId,
                stepIndex: idx,
                steps,
                context,
                budgetCount: budget.count,
              },
            });
            return { pendingChoice: choice, completed: false };
          }
          const benchCard = oppBench.find((c) => c.instanceId === chosenBenchId);
          if (benchCard) {
            for (let i = opponent.zones.active.length - 1; i >= 0; i--) {
              const c = opponent.zones.active[i];
              if (c.instanceId === oppActive.instanceId || c.attachedTo === oppActive.instanceId) {
                opponent.zones.active.splice(i, 1);
                opponent.zones.bench.push(c);
              }
            }
            for (let i = opponent.zones.bench.length - 1; i >= 0; i--) {
              const c = opponent.zones.bench[i];
              if (c.instanceId === benchCard.instanceId || c.attachedTo === benchCard.instanceId) {
                opponent.zones.bench.splice(i, 1);
                opponent.zones.active.push(c);
              }
            }
            // Stadium on-switch triggers run before the outgoing conditions clear.
            applyStadiumSwitchTriggers(draft, {
              switchedOut: oppActive,
              switchedIn: benchCard,
              switchedOutPlayerId: opponent.playerId,
              switchedInPlayerId: opponent.playerId,
              viaTrainer: effectType === 'trainer',
              duringOwnersTurn: false,
              events,
            });
            clearConditions(oppActive);
            events.push({
              type: 'cardSwitched',
              playerId: opponent.playerId,
              activeId: oppActive.instanceId,
              benchId: benchCard.instanceId,
            });
          }
          break;
        }

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
              initiatorPlayerId: playerId,
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
          // Stadium on-switch triggers run before the outgoing conditions clear.
          applyStadiumSwitchTriggers(draft, {
            switchedOut: active,
            switchedIn: benchCard,
            switchedOutPlayerId: playerId,
            switchedInPlayerId: playerId,
            viaTrainer: effectType === 'trainer',
            duringOwnersTurn: true,
            events,
          });
          clearConditions(active);
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
        const oppBench = (opponent.zones.bench || []).filter(
          (c) => !c.attachedTo && (step.filter !== 'Basic' || !opponentBenchIsEvolved(opponent, c))
        );
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
              initiatorPlayerId: playerId,
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
          // Stadium on-switch triggers run before the outgoing conditions clear.
          applyStadiumSwitchTriggers(draft, {
            switchedOut: oppActive,
            switchedIn: oppBenchCard,
            switchedOutPlayerId: opponent.playerId,
            switchedInPlayerId: opponent.playerId,
            viaTrainer: effectType === 'trainer',
            duringOwnersTurn: false,
            events,
          });
          clearConditions(oppActive);
          events.push({
            type: 'cardSwitched',
            playerId: opponent.playerId,
            activeId: oppActive.instanceId,
            benchId: oppBenchCard.instanceId,
          });
          if (step.thenCondition) {
            addCondition(oppBenchCard, step.thenCondition);
            events.push({
              type: 'statusApplied',
              playerId: opponent.playerId,
              instanceId: oppBenchCard.instanceId,
              condition: step.thenCondition,
            });
          }
        }
        break;
      }

      case 'recursion':
      case 'recursionFromDiscardAbility':
      case 'shuffleFromDiscard': {
        const discard = player.zones.discard || [];
        const isShuffle = step.type === 'shuffleFromDiscard';
        const categories = step.choices?.length
          ? step.choices
          : [{ what: step.what || 'card', count: step.count || 1 }];
        const what = categories.map((c) => c.what).join(' or ');
        const count = categories.reduce((sum, c) => sum + (c.count || 1), 0);

        if (stepSelection) {
          const destZone = isShuffle ? player.zones.deck : player.zones.hand;
          const recovered = [];
          const takenPerCategory = categories.map(() => 0);
          for (const sId of stepSelection) {
            const picked = discard.find((c) => c.instanceId === sId);
            const category = categories.findIndex(
              (cat, i) => picked && matchesSearch(picked, cat.what) && takenPerCategory[i] < (cat.count || 1)
            );
            if (category < 0) continue;
            takenPerCategory[category] += 1;
            const dIdx = discard.findIndex((c) => c.instanceId === sId);
            if (dIdx >= 0) {
              const [c] = discard.splice(dIdx, 1);
              destZone.push(c);
              recovered.push(c);
            }
          }
          if (isShuffle && activeRng) {
            shuffleInPlace(activeRng, player.zones.deck);
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
            initiatorPlayerId: playerId,
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
        // Dyna Tree Hill: all healing is suppressed while it is in play.
        if (stadiumBlocksHealing(draft.stadium)) {
          events.push({ type: 'effectStepSkipped', reason: 'healing_blocked' });
          break;
        }
        // 'heal' with no amount is "heal all damage" (Wally's Compassion).
        // A heal ability flagged `all` ("Heal all damage from 1 of your Pokémon",
        // Primarina Enriching Melody) also heals to full, not a flat 30.
        const healAmt = step.amount ?? (step.type === 'heal' || step.all ? Infinity : 30);
        // Edge Case 10: re-resolve damaged in-play Pokemon dynamically
        const typeFilter = Array.isArray(step.types) && step.types.length
          ? step.types.map((ty) => String(ty).toLowerCase())
          : null;
        const inPlay = [
          ...(player.zones.active || []),
          ...(player.zones.bench || []),
        ].filter(
          (c) =>
            !c.attachedTo &&
            ((c.damage || 0) > 0 || (step.cure && hasAnyCondition(c))) &&
            (!typeFilter ||
              (c.types || []).some((ty) => typeFilter.includes(String(ty).toLowerCase()))) &&
            (step.target === 'attached Pokémon'
              ? c.instanceId === context.attachedTargetId
              : rootMatchesTarget(player, c, step.target === 'Pokémon' ? '' : step.target))
        );

        const healOne = (card) => {
          const oldDamage = card.damage || 0;
          card.damage = Math.max(0, oldDamage - healAmt);
          events.push({
            type: 'damageUpdated',
            instanceId: card.instanceId,
            damage: card.damage,
            healed: oldDamage - card.damage,
          });
          if (step.cure && hasAnyCondition(card)) {
            clearConditions(card);
            events.push({ type: 'specialConditionUpdated', instanceId: card.instanceId, condition: null, conditions: [] });
          }
        };

        if (/each of your/i.test(step.target || '')) {
          inPlay.forEach(healOne);
          break;
        }

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
            prompt: `${sourceCard?.name || 'Heal'}: Select a Pokémon to heal${Number.isFinite(healAmt) ? ` (${healAmt} HP)` : ''}`,
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
              initiatorPlayerId: playerId,
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
          healOne(targetRef.card);
        } else {
          events.push({ type: 'effectStepSkipped', reason: 'target_not_found', targetInstanceId: targetId });
        }
        break;
      }

      case 'coinFlip': {
        // Memoize the face so resuming a suspended branch choice doesn't re-flip.
        const coinKey = `${idx}:coinFlip`;
        let face = context[coinKey];
        if (!face) {
          face = (activeRng ? activeRng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
          context[coinKey] = face;
          events.push({ type: 'coinFlipped', playerId, face });
        }
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

      case 'coinDraw': {
        // Speed Stadium: flip until tails, draw per heads.
        const perHeads = step.perHeads || 1;
        let heads = 0;
        while (activeRng && activeRng.next() < 0.5) {
          heads++;
          if (heads > MAX_EFFECT_STEPS) break;
        }
        events.push({ type: 'coinFlipped', playerId, face: 'tails', heads });
        if (heads > 0) {
          const deck = player.zones.deck || [];
          const hand = player.zones.hand || [];
          const actual = Math.min(heads * perHeads, deck.length);
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

      case 'returnTool': {
        // Shopping Center: return an attached Pokémon Tool to hand.
        const isTool = (c) =>
          /tool/i.test(
            String(c?.trainerType || '') +
              ',' +
              (Array.isArray(c?.subtypes) ? c.subtypes.join(',') : '')
          );
        let moved = null;
        for (const zone of [player.zones.active || [], player.zones.bench || []]) {
          const idx = zone.findIndex((c) => c.attachedTo && isTool(c));
          if (idx >= 0) {
            moved = zone.splice(idx, 1)[0];
            break;
          }
        }
        if (moved) {
          moved.attachedTo = null;
          player.zones.hand.push(moved);
          events.push({
            type: 'cardMoved',
            instanceId: moved.instanceId,
            from: 'attached',
            to: 'hand',
            playerId,
          });
        } else {
          events.push({ type: 'effectStepSkipped', reason: 'no_tool_in_play' });
        }
        break;
      }

      case 'shuffleOwnPokemon': {
        // Fuchsia City Gym: shuffle a named Pokémon in play and everything
        // attached to it back into the deck.
        const filter = step.nameFilter
          ? String(step.nameFilter).toLowerCase()
          : null;
        const target = inPlayRoots(player).find(
          (c) => !filter || String(c.name || '').toLowerCase().includes(filter)
        );
        if (!target) {
          events.push({ type: 'effectStepSkipped', reason: 'no_matching_pokemon' });
          break;
        }
        const zones = [player.zones.active || [], player.zones.bench || []];
        const attached = zones
          .flatMap((z) => z)
          .filter((c) => c.attachedTo === target.instanceId);
        for (const card of [target, ...attached]) {
          for (const zone of zones) {
            const i = zone.indexOf(card);
            if (i >= 0) zone.splice(i, 1);
          }
          card.attachedTo = null;
          player.zones.deck.push(card);
        }
        if (activeRng) shuffleInPlace(activeRng, player.zones.deck);
        events.push({ type: 'deckShuffled', playerId });
        events.push({
          type: 'cardMoved',
          instanceId: target.instanceId,
          from: 'play',
          to: 'deck',
          playerId,
        });
        break;
      }

      case 'revealHand': {
        // Lavender Town reveals the opponent's hand; Ancient Ruins reveals your
        // own (target: 'self').
        const revealed = step.target === 'self' ? player : opponent;
        if (revealed) {
          events.push({
            type: 'cardsRevealed',
            playerId: revealed.playerId,
            hand: true,
            cards: (revealed.zones.hand || []).map((c) => ({
              instanceId: c.instanceId,
              name: c.name,
            })),
          });
        }
        break;
      }

      case 'drawIfNoSupporter': {
        // Ancient Ruins: after revealing, draw 1 only when the hand has no
        // Supporter in it.
        const hand = player.zones.hand || [];
        const hasSupporter = hand.some((c) => {
          const subs = Array.isArray(c?.subtypes)
            ? c.subtypes.map((s) => String(s).toLowerCase())
            : [];
          return (
            /supporter/i.test(String(c?.type || '')) ||
            /supporter/i.test(String(c?.trainerType || '')) ||
            subs.some((s) => s.includes('supporter'))
          );
        });
        if (hasSupporter) {
          events.push({ type: 'effectStepSkipped', reason: 'supporter_in_hand' });
          break;
        }
        const deck = player.zones.deck || [];
        if (deck.length === 0) {
          events.push({ type: 'effectStepSkipped', reason: 'deck_empty' });
          break;
        }
        const [drawn] = deck.splice(0, 1);
        hand.push(drawn);
        events.push({
          type: 'cardsDrawn',
          count: 1,
          playerId,
          cards: [{ instanceId: drawn.instanceId }],
        });
        break;
      }

      case 'putHandToDeck': {
        // Mystery Zone: move a chosen (Evolution) card from hand into the deck,
        // then shuffle.
        const hand = player.zones.hand || [];
        const count = step.count || 1;
        if (stepSelection) {
          const moved = [];
          for (const sId of stepSelection) {
            const i = hand.findIndex((c) => c.instanceId === sId);
            if (i >= 0) {
              const [c] = hand.splice(i, 1);
              player.zones.deck.push(c);
              moved.push(c);
            }
          }
          if (activeRng) shuffleInPlace(activeRng, player.zones.deck);
          events.push({ type: 'deckShuffled', playerId });
          events.push({
            type: 'cardsPutInDeck',
            playerId,
            cards: moved.map((c) => ({ instanceId: c.instanceId, name: c.name })),
          });
          break;
        }
        const candidates = hand.filter(
          (c) =>
            c.instanceId !== sourceCard?.instanceId &&
            (!step.evolutionOnly || isEvolutionCard(c))
        );
        if (candidates.length === 0) {
          events.push({
            type: 'effectStepSkipped',
            reason: 'no_eligible_hand_card',
            step: step.type,
          });
          break;
        }
        const choice = createPendingChoice({
          player: playerId,
          prompt: `${sourceCard?.name || 'Effect'}: Choose ${count} card${
            count > 1 ? 's' : ''
          } from your hand to put into your deck`,
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
            initiatorPlayerId: playerId,
            stepIndex: idx,
            steps,
            context,
            budgetCount: budget.count,
          },
        });
        return { pendingChoice: choice, completed: false };
      }

      case 'peekReturn': {
        // Radio Tower: look at the top N and put them back unchanged.
        const n = step.count || 2;
        const top = (player.zones.deck || []).slice(0, n);
        if (top.length > 0) {
          events.push({
            type: 'cardsRevealed',
            playerId,
            peek: true,
            cards: top.map((c) => ({ instanceId: c.instanceId, name: c.name })),
          });
        }
        break;
      }

      case 'peekDiscard': {
        // Primordial Altar: look at the top card and optionally discard it.
        const deck = player.zones.deck || [];
        if (deck.length === 0) break;
        const top = deck[0];
        if (stepSelection) {
          if (stepSelection.includes(top.instanceId)) {
            deck.splice(0, 1);
            discardCardToPlayerZone(player, top);
            events.push({
              type: 'cardsDiscarded',
              playerId,
              cards: [{ instanceId: top.instanceId, name: top.name }],
            });
          }
          break;
        }
        events.push({
          type: 'cardsRevealed',
          playerId,
          peek: true,
          cards: [{ instanceId: top.instanceId, name: top.name }],
        });
        return {
          pendingChoice: createPendingChoice({
            player: playerId,
            prompt: `${sourceCard?.name || 'Stadium'}: Discard the top card of your deck?`,
            source: sourceCard?.name || '',
            options: [top],
            min: 0,
            max: 1,
            cancellable: true,
            stateVersion: draft.stateVersion,
            stepIndex: idx,
            resumeToken: {
              effectType,
              sourceInstanceId: sourceCard?.instanceId,
              initiatorPlayerId: playerId,
              stepIndex: idx,
              steps,
              context,
              budgetCount: budget.count,
            },
          }),
          completed: false,
        };
      }

      case 'benchRestored': {
        // Twist Mountain: Restored Pokémon from hand to Bench.
        const hand = player.zones.hand || [];
        const bench = player.zones.bench || [];
        if (bench.filter((c) => !c.attachedTo).length >= 5) {
          events.push({ type: 'effectStepSkipped', reason: 'bench_full' });
          break;
        }
        const idx = hand.findIndex((c) =>
          /restored/i.test(
            String(c?.stage || '') +
              ',' +
              (Array.isArray(c?.subtypes) ? c.subtypes.join(',') : '')
          )
        );
        if (idx < 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_restored_pokemon' });
          break;
        }
        const [card] = hand.splice(idx, 1);
        bench.push(card);
        events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'hand', to: 'bench', playerId });
        break;
      }

      case 'fossilBench': {
        // Strange Cave / Underground Lake: named fossil Pokémon to the Bench.
        const FOSSIL = /^(omanyte|kabuto|aerodactyl|lileep|anorith)\b/i;
        const zoneKey = step.source === 'discard' ? 'discard' : 'hand';
        const zone = player.zones[zoneKey] || [];
        const bench = player.zones.bench || [];
        if (bench.filter((c) => !c.attachedTo).length >= 5) {
          events.push({ type: 'effectStepSkipped', reason: 'bench_full' });
          break;
        }
        const idx = zone.findIndex((c) => FOSSIL.test(String(c?.name || '')));
        if (idx < 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_fossil' });
          break;
        }
        const [card] = zone.splice(idx, 1);
        card.stage = 'Basic';
        card.playedAsPokemon = true;
        bench.push(card);
        events.push({ type: 'cardMoved', instanceId: card.instanceId, from: zoneKey, to: 'bench', playerId });
        break;
      }

      case 'applyStatus':
      case 'statusAbility': {
        // parseAbility emits { target: 'opponent'|'attacker', status: 'confused', coinFlip };
        // trainers emit { target: 'opponentActive'|…, conditions: ['Confused'] }.
        const abilityStatus = step.type === 'statusAbility' ? normalizeStatusAbilityStep(step) : null;
        if (step.type === 'statusAbility' && !abilityStatus) {
          events.push({ type: 'effectStepSkipped', reason: 'unparsed_status', playerId });
          break;
        }
        if (abilityStatus?.coinFlip) {
          const coinKey = `${idx}:statusCoin`;
          if (!context[coinKey]) {
            context[coinKey] = (activeRng ? activeRng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
            events.push({ type: 'coinFlipped', playerId, face: context[coinKey] });
          }
          if (context[coinKey] !== 'heads') break;
        }
        const statusTarget = abilityStatus?.target ?? step.target;
        // "Both Active Pokémon are now …" / "Both Active non-{D} Pokémon are now …"
        // must hit both sides; the non-{D} variant skips a Darkness Active.
        // Collapsing these to a single side applied Dark Bell's Confusion to one
        // Pokémon only.
        const sides =
          statusTarget === 'bothActiveNonDark' || statusTarget === 'bothActiveAll'
            ? [player, opponent].filter(Boolean)
            : [statusTarget === 'opponentActive' ? opponent : player].filter(Boolean);
        const isDark = (card) => {
          const types = [
            ...(Array.isArray(card?.types) ? card.types : []),
            card?.type,
          ]
            .filter(Boolean)
            .map((t) => String(t).toLowerCase());
          return types.includes('darkness') || types.includes('dark');
        };
        // Every listed condition lands: markers stack with a rotation condition (design 011).
        const conditions = abilityStatus
          ? [abilityStatus.condition]
          : step.conditions?.length
            ? step.conditions
            : [step.condition || 'Poisoned'];
        for (const side of sides) {
          const targetActive = side?.zones?.active?.find((c) => !c.attachedTo);
          if (!targetActive) continue;
          if (statusTarget === 'bothActiveNonDark' && isDark(targetActive)) continue;
          for (const condition of conditions) {
            if (!addCondition(targetActive, condition)) continue;
            events.push({
              type: 'statusApplied',
              playerId: side.playerId,
              instanceId: targetActive.instanceId,
              condition,
            });
          }
        }
        break;
      }

      case 'recoverEnergy':
      case 'recoverFromDiscard': {
        const discard = player.zones.discard || [];
        const maxCount = step.count || 1;
        const energyTypes =
          step.energyTypes || (step.typeFilter ? [step.typeFilter] : null);
        const isEnergy = (c) =>
          /energy/i.test(String(c?.type || '') + String(c?.name || ''));
        const candidates = discard.filter(
          (c) =>
            isEnergy(c) &&
            matchesEnergyTypeFilter(c, energyTypes) &&
            (!step.basicOnly || classifyEnergyEffect(c) === 'basic')
        );

        if (stepSelection) {
          // Resume: move the chosen discard-pile Energy into the hand.
          for (const sId of stepSelection) {
            const dIdx = discard.findIndex((c) => c.instanceId === sId);
            if (dIdx >= 0) {
              const [c] = discard.splice(dIdx, 1);
              (player.zones.hand || []).push(c);
              events.push({
                type: 'cardMoved',
                instanceId: c.instanceId,
                from: 'discard',
                to: 'hand',
                playerId,
              });
            }
          }
          break;
        }

        if (candidates.length === 0) {
          events.push({
            type: 'effectStepSkipped',
            reason: 'no_matching_energy_in_discard',
            step: step.type,
          });
          break;
        }

        const max = Math.min(maxCount, candidates.length);
        const choice = createPendingChoice({
          player: playerId,
          prompt: `${sourceCard?.name || 'Recover'}: Select up to ${max} Energy card${max > 1 ? 's' : ''} from your discard pile`,
          source: sourceCard?.name || '',
          options: candidates,
          min: 0,
          max,
          cancellable: true,
          stateVersion: draft.stateVersion,
          stepIndex: idx,
          resumeToken: {
            effectType,
            sourceInstanceId: sourceCard?.instanceId,
            initiatorPlayerId: playerId,
            stepIndex: idx,
            steps,
            context,
            budgetCount: budget.count,
          },
        });
        return { pendingChoice: choice, completed: false };
      }

      case 'attachAbility':
        // Only the discard-attach form (Dynamotor) resolves here; other attach
        // abilities stay guidance-only.
        if (!step.fromDiscard || step.triggeredByAttach) break;
      // falls through
      case 'attachFromDiscard': {
        const discard = player.zones.discard || [];
        const memoKey = `${idx}:attachFromDiscard`;
        const targets = inPlayRoots(player).filter((c) => rootMatchesTarget(player, c, step.target));
        // Magma Basin: attaching in this way puts damage counters on the target.
        const applyAttachmentDamage = (target) => {
          if (!step.damage || !target) return;
          target.damage = (target.damage || 0) + step.damage * 10;
          events.push({
            type: 'damageUpdated',
            instanceId: target.instanceId,
            damage: target.damage,
          });
        };
        const energyCandidates = discard.filter(
          (c) => String(c.name || '').toLowerCase().includes('energy') && matchesSearch(c, step.energy || 'Basic Energy')
        );
        const ask = (prompt, options, memo) => {
          context[memoKey] = memo;
          return createPendingChoice({
            player: playerId,
            prompt,
            source: sourceCard?.name || '',
            options,
            min: 1,
            max: 1,
            cancellable: false,
            stateVersion: draft.stateVersion,
            stepIndex: idx,
            resumeToken: {
              effectType,
              sourceInstanceId: sourceCard?.instanceId,
              initiatorPlayerId: playerId,
              stepIndex: idx,
              steps,
              context,
              budgetCount: budget.count,
            },
          });
        };

        if (stepSelection && context[memoKey]?.energyId != null) {
          // Edge Case 10: both the Energy and the target are re-resolved from live state
          const energyCard = energyCandidates.find((c) => c.instanceId === context[memoKey].energyId);
          const targetCard = targets.find((c) => c.instanceId === stepSelection[0]);
          delete context[memoKey];
          if (energyCard && targetCard) {
            attachToRoot(player, energyCard, targetCard, events);
            applyAttachmentDamage(targetCard);
          } else {
            events.push({ type: 'effectStepSkipped', reason: 'target_not_found' });
          }
          break;
        }

        const chosenEnergy = stepSelection
          ? energyCandidates.find((c) => c.instanceId === stepSelection[0])
          : null;
        if (stepSelection && (!chosenEnergy || targets.length === 0)) {
          delete context[memoKey];
          events.push({ type: 'effectStepSkipped', reason: 'target_not_found' });
          break;
        }
        if (chosenEnergy) {
          if (targets.length === 1) {
            attachToRoot(player, chosenEnergy, targets[0], events);
            applyAttachmentDamage(targets[0]);
            delete context[memoKey];
            break;
          }
          const choice = ask(
            `${sourceCard?.name || 'Attach'}: Choose ${step.target || 'a Pokémon'} to attach ${chosenEnergy.name} to`,
            targets,
            { energyId: chosenEnergy.instanceId }
          );
          return { pendingChoice: choice, completed: false };
        }

        if (energyCandidates.length === 0 || targets.length === 0) {
          events.push({ type: 'effectStepSkipped', reason: 'no_energy_or_target' });
          break;
        }

        const choice = ask(
          `${sourceCard?.name || 'Attach'}: Select an Energy card from discard to attach`,
          energyCandidates,
          {}
        );
        return { pendingChoice: choice, completed: false };
      }

      default:
        // No handler: report it, so a caller never counts this as the effect happening
        // (an ability is not spent on it, I89).
        events.push({ type: 'effectStepSkipped', reason: 'unsupported_step', step: step.type });
        break;
    }
  }

  return { pendingChoice: null, completed: true };
}
