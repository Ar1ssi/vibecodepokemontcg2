/**
 * @file Resumable Stadium card executor for server-authoritative netcode (Slice 6).
 * Manages once-per-turn stadium activation, effect steps, and choice resumption.
 */

import {
  parseStadiumOncePerTurn,
  isEvolutionCard,
  isSingleStrikeCard,
  isRepeatableStadiumAction,
} from '../rules/stadium-effects.mjs';
import { executeSteps, matchesEnergyTypeFilter } from './executor.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';
import { classifyEnergyEffect } from '../rules/energy-effects.mjs';

/**
 * Whether a parsed once-per-turn condition holds for the acting player on the
 * server. Conditions the parser can't verify statically (supporter-played) are
 * left to the client affordance and treated as satisfied here.
 */
function stadiumServerConditionMet(condition, player, opponent = null) {
  if (!condition) return true;
  const inPlay = [
    ...(player.zones.active || []),
    ...(player.zones.bench || []),
  ].filter((c) => !c.attachedTo);
  if (condition.type === 'active-asleep') {
    const active = (player.zones.active || []).find((c) => !c.attachedTo);
    return !!active && hasCondition(active, 'Asleep');
  }
  if (condition.type === 'six-pokemon-in-play') {
    return inPlay.length >= 6;
  }
  if (condition.type === 'bench-not-full') {
    const bench = (player.zones.bench || []).filter((c) => !c.attachedTo);
    return bench.length < 5;
  }
  if (condition.type === 'no-special-energy-in-discard') {
    return !(player.zones.discard || []).some(
      (c) =>
        /energy/i.test(String(c?.type || c?.name || '')) &&
        classifyEnergyEffect(c) !== 'basic'
    );
  }
  if (condition.type === 'no-supporter-played') {
    return !player.flags?.supporterPlayed;
  }
  if (condition.type === 'has-evolution-in-hand') {
    return (player.zones.hand || []).some((c) => isEvolutionCard(c));
  }
  if (condition.type === 'opponent-lost-zone') {
    const lost = (opponent?.zones?.lostZone || []).filter((c) => !c.attachedTo);
    return lost.length >= (condition.n || 6);
  }
  return true;
}

/**
 * Executes the active stadium effect or resumes a suspended stadium choice.
 *
 * @param {object} draft Cloned GameState
 * @param {object} params
 * @param {string} params.playerId
 * @param {object} params.activeRng
 * @param {Array} [params.events=[]]
 * @param {Array<number>|null} [params.selection=null]
 * @param {object|null} [params.resumeToken=null]
 * @returns {{ pendingChoice: object|null, completed: boolean }}
 */
export function executeStadium(draft, {
  playerId,
  activeRng,
  events = [],
  selection = null,
  resumeToken = null,
}) {
  const actingPlayerId = resumeToken?.initiatorPlayerId || playerId;
  const player = draft.players[actingPlayerId];
  if (!player || !draft.stadium) return { pendingChoice: null, completed: true };

  const stadium = draft.stadium;
  const opponentId = Object.keys(draft.players || {}).find(
    (id) => id !== actingPlayerId
  );
  const opponent = opponentId ? draft.players[opponentId] : null;

  // Parsed once up front: the resume branch below must know whether the
  // activation ends the turn even though it re-enters without the preview.
  const preview = parseStadiumOncePerTurn(stadium);
  const turnEndsOnResolve = !!preview?.turnEnds;
  const isEnergy = (c) =>
    /energy/i.test(String(c?.type || '') + String(c?.name || ''));

  if (resumeToken) {
    // Resuming suspended stadium step
    const steps = resumeToken.steps || [];
    const stepIndex = resumeToken.stepIndex || 0;
    const budget = { count: resumeToken.budgetCount || 0 };

    const result = executeSteps(draft, {
      steps,
      fromStepIndex: stepIndex,
      effectType: 'stadium',
      sourceCard: stadium,
      playerId: actingPlayerId,
      activeRng,
      events,
      selection,
      context: resumeToken?.context || {},
      budget,
    });

    if (result.pendingChoice) {
      draft.pendingChoice = result.pendingChoice;
      return result;
    }

    draft.pendingChoice = null;
    return {
      pendingChoice: null,
      completed: true,
      // Lumiose City only ends the turn if the deck was actually searched.
      turnEnds: turnEndsOnResolve && (selection?.length ?? 0) > 0,
    };
  }

  // A "may discard a [typed] Energy" cost can't be paid if the hand holds no
  // matching Energy. Since the discard is optional, the effect simply does
  // nothing and the once-per-turn activation is not consumed.
  if (
    preview?.cost?.type === 'discard-energy' &&
    !(player.zones.hand || []).some(
      (c) => isEnergy(c) && matchesEnergyTypeFilter(c, preview.cost.types)
    )
  ) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true, turnEnds: false };
  }

  // A "discard N cards from hand, if you do…" cost can't be paid when fewer than
  // N cards are in hand — the activation simply does nothing. Testing only for a
  // non-empty hand let Prism Tower (discard 2) open an unsatisfiable choice.
  if (preview?.cost?.type === 'discard-hand') {
    const held = (player.zones.hand || []).filter(
      (c) => c.instanceId !== stadium.instanceId
    ).length;
    if (held < (preview.cost.n || 1)) {
      draft.pendingChoice = null;
      return { pendingChoice: null, completed: true, turnEnds: false };
    }
  }

  // A "discard a Single Strike card" cost can't be paid without one in hand;
  // since the activation is optional it simply does nothing.
  if (
    preview?.cost?.type === 'discard-single-strike' &&
    !(player.zones.hand || []).some(
      (c) =>
        c.instanceId !== stadium.instanceId && isSingleStrikeCard(c)
    )
  ) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true, turnEnds: false };
  }

  // Printed conditions ("Active is Asleep", "6 Pokémon in play", "no Special
  // Energy in the discard") gate the whole effect; an unmet condition is a no-op
  // that does not consume the once-per-turn activation.
  if (!stadiumServerConditionMet(preview?.condition, player, opponent)) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true, turnEnds: false };
  }

  const steps = [];

  const opt = parseStadiumOncePerTurn(stadium);

  // Lost World: winning is a terminal game state, not a step — signal it to the
  // reducer, which owns `setGameEnded`.
  if (opt?.kind === 'win-game') {
    return {
      pendingChoice: null,
      completed: true,
      turnEnds: false,
      gameWinner: actingPlayerId,
      gameReason: 'lost zone',
    };
  }

  if (opt) {
    if (opt.kind === 'search-bench') {
      steps.push({
        type: 'searchDeck',
        what: opt.searchWhat || 'Basic Pokémon',
        destination: 'bench',
        count: opt.n || 1,
        ...(opt.searchFilter ? { nameFilter: opt.searchFilter } : {}),
      });
    } else if (opt.kind === 'search-hand' || opt.kind === 'search-deck') {
      steps.push({
        type: 'searchDeck',
        what: opt.searchWhat || 'card',
        // Fossil Quarry sends "Antique" Items to the Bench, not to hand.
        destination: opt.destination || 'hand',
        count: opt.n || 1,
        ...(opt.searchFilter ? { nameFilter: opt.searchFilter } : {}),
      });
    } else if (opt.kind === 'search-evolve') {
      steps.push({
        type: 'searchEvolve',
        chainStage2: !!opt.chainStage2,
      });
    } else if (opt.kind === 'draw') {
      steps.push({ type: 'draw', count: opt.n || 1 });
    } else if (opt.kind === 'heal-all') {
      steps.push({
        type: 'heal',
        amount: opt.n || 10,
        target: 'each of your Pokémon',
        ...(opt.types ? { types: opt.types } : {}),
      });
    } else if (opt.kind === 'heal') {
      steps.push({
        type: 'healAmount',
        amount: opt.n || 10,
        target: opt.target === 'bench' ? 'Benched Pokémon' : 'Active Pokémon',
        ...(opt.cure ? { cure: true } : {}),
      });
    } else if (opt.kind === 'discard-draw') {
      const cost = opt.cost || {};
      const discardStep = { type: 'discardCost', count: cost.n || 1 };
      if (cost.type === 'discard-energy') discardStep.energyOnly = true;
      if (cost.type === 'discard-single-strike') {
        discardStep.tagFilter = 'single-strike';
      }
      if (cost.basicOnly) discardStep.basicOnly = true;
      if (Array.isArray(cost.types) && cost.types.length) {
        discardStep.energyTypes = cost.types;
      }
      steps.push(discardStep);
      steps.push({ type: 'draw', count: opt.n || 1 });
    } else if (opt.kind === 'draw-until-type') {
      // Mystery Garden: pay the Energy cost, then draw until the hand reaches
      // the count of matching Pokémon in play (evaluated at execution time).
      const cost = opt.cost || {};
      const discardStep = { type: 'discardCost', count: cost.n || 1 };
      if (cost.type === 'discard-energy') discardStep.energyOnly = true;
      if (Array.isArray(cost.types) && cost.types.length) {
        discardStep.energyTypes = cost.types;
      }
      steps.push(discardStep);
      steps.push({
        type: 'drawUntil',
        ...(opt.targetType ? { targetType: opt.targetType } : { target: 5 }),
      });
    } else if (opt.kind === 'discard-search') {
      // Giant Hearth / Viridian Forest: pay the hand-discard cost, then search
      // the deck for the printed Energy.
      const cost = opt.cost || {};
      const discardStep = { type: 'discardCost', count: cost.n || 1 };
      if (cost.type === 'discard-energy') discardStep.energyOnly = true;
      if (cost.basicOnly) discardStep.basicOnly = true;
      if (Array.isArray(cost.types) && cost.types.length) {
        discardStep.energyTypes = cost.types;
      }
      steps.push(discardStep);
      steps.push({
        type: 'searchDeck',
        what: opt.searchWhat || 'Energy',
        destination: 'hand',
        count: opt.n || 1,
      });
    } else if (opt.kind === 'mill-items') {
      steps.push({ type: 'millItems', count: opt.n || 3 });
    } else if (opt.kind === 'draw-until-count') {
      // Rose Tower / Tropical Beach: "draw until you have N cards in hand".
      steps.push({ type: 'drawUntil', target: opt.n || 5 });
    } else if (opt.kind === 'shuffle-draw') {
      // Jubilife Village: shuffle the hand back, then draw a fixed count.
      steps.push({ type: 'shuffleHandThenDraw', count: opt.n || 5 });
    } else if (opt.kind === 'recover-energy') {
      steps.push({
        type: 'recoverEnergy',
        count: opt.n || 1,
        ...(opt.typeFilter ? { energyTypes: [opt.typeFilter] } : {}),
        ...(Array.isArray(opt.types) && opt.types.length
          ? { energyTypes: opt.types }
          : {}),
        ...(opt.basicOnly ? { basicOnly: true } : {}),
      });
    } else if (opt.kind === 'hand-to-deck-top') {
      steps.push({ type: 'putHandOnTop', count: opt.n || 1 });
    } else if (opt.kind === 'switch-type') {
      steps.push({ type: 'switchOwn' });
    } else if (opt.kind === 'discard-to-bench') {
      const energyType = opt.typeFilter
        ? `Basic {${opt.typeFilter.charAt(0).toUpperCase()}} Energy`
        : 'Basic Energy';
      const count = opt.n || 2;
      steps.push({
        type: count > 1 ? 'attachMultipleFromDiscard' : 'attachFromDiscard',
        energy: energyType,
        count,
        target: '1 of your Benched Pokémon',
      });
    } else if (opt.kind === 'energy') {
      steps.push({
        type: 'searchDeck',
        what: 'Energy',
        destination: 'hand',
        count: opt.n || 1,
      });
    } else if (opt.kind === 'search') {
      steps.push({
        type: 'searchDeck',
        what: opt.searchWhat || 'card',
        destination: 'hand',
        count: opt.n || 1,
      });
    } else if (opt.kind === 'coin-draw') {
      steps.push({ type: 'coinDraw', perHeads: opt.n || 1 });
    } else if (opt.kind === 'return-tool') {
      steps.push({ type: 'returnTool' });
    } else if (opt.kind === 'move-energy') {
      steps.push({ type: 'moveEnergy' });
    } else if (opt.kind === 'move-to-arceus') {
      // Ultimate Zone (modeled once-per-turn): Bench Energy → Active Arceus.
      steps.push({ type: 'moveEnergyToActive', count: 1, activeName: 'arceus' });
    } else if (opt.kind === 'return-sabrina-energy') {
      // Saffron City Gym: return a Basic Energy from a Sabrina Pokémon to hand.
      steps.push({
        type: 'returnOwnAttachedEnergy',
        nameContains: 'sabrina',
        basicOnly: true,
      });
    } else if (opt.kind === 'discard-erika-cure') {
      // Celadon City Gym: discard an Energy from an Erika Pokémon to cure it.
      steps.push({
        type: 'discardOwnAttachedEnergy',
        nameContains: 'erika',
        cure: true,
      });
    } else if (opt.kind === 'devolve') {
      steps.push({ type: 'devolve', target: 'Evolved' });
    } else if (opt.kind === 'reveal-hand') {
      steps.push({ type: 'revealHand' });
    } else if (opt.kind === 'ancient-ruins') {
      steps.push({ type: 'revealHand', target: 'self' });
      steps.push({ type: 'drawIfNoSupporter' });
    } else if (opt.kind === 'mystery-zone') {
      steps.push({
        type: 'searchDeck',
        what: 'Basic Energy',
        destination: 'hand',
        count: 1,
      });
      steps.push({ type: 'putHandToDeck', evolutionOnly: true });
    } else if (opt.kind === 'shuffle-own-pokemon') {
      steps.push({
        type: 'shuffleOwnPokemon',
        ...(opt.searchFilter ? { nameFilter: opt.searchFilter } : {}),
      });
    } else if (opt.kind === 'peek-return') {
      steps.push({ type: 'peekReturn', count: opt.n || 2 });
    } else if (opt.kind === 'peek-discard') {
      steps.push({ type: 'peekDiscard', count: opt.n || 1 });
    } else if (opt.kind === 'bench-restored') {
      steps.push({ type: 'benchRestored' });
    } else if (opt.kind === 'fossil-bench') {
      steps.push({ type: 'fossilBench', source: opt.source || 'hand' });
    } else if (opt.kind === 'attach-discard-damage') {
      const symbol =
        {
          grass: 'G',
          fire: 'R',
          water: 'W',
          lightning: 'L',
          psychic: 'P',
          fighting: 'F',
          darkness: 'D',
          metal: 'M',
          dragon: 'N',
          fairy: 'Y',
          colorless: 'C',
        }[opt.energyType] || 'R';
      steps.push({
        type: 'attachFromDiscard',
        energy: `{${symbol}} Energy`,
        target: 'Benched {R} Pokémon',
        count: 1,
        damage: opt.damage || 2,
      });
    }
  }

  // "Flip a coin. If heads, …": run the parsed body only on heads. The coin is
  // memoized so a suspended choice does not re-flip on resume.
  if (opt?.coin && steps.length > 0) {
    const branch = steps.splice(0, steps.length);
    steps.push({ type: 'coinFlip', heads: branch, tails: [] });
  }

  // Unmatched once-per-turn Stadium text stays announce-only. Falling back to
  // the generic trainer parser previously turned "no modeled effect" into a
  // full unrestricted deck search.
  if (steps.length === 0) {
    draft.pendingChoice = null;
    return { pendingChoice: null, completed: true, turnEnds: false };
  }

  // Mark stadium used for this player's turn (only when a modeled effect runs).
  // Unlimited "as often as … likes" actions (Ultimate Zone / Saffron City Gym /
  // Celadon City Gym) must not consume the once-per-turn flag.
  if (!isRepeatableStadiumAction(stadium)) {
    if (!player.flags) player.flags = {};
    player.flags.stadiumUsedThisTurn = true;
  }

  events.push({
    type: 'stadiumEffectUsed',
    instanceId: stadium.instanceId,
    name: stadium.name,
    playerId,
  });

  const result = executeSteps(draft, {
    steps,
    fromStepIndex: 0,
    effectType: 'stadium',
    sourceCard: stadium,
    playerId,
    activeRng,
    events,
  });

  if (result.pendingChoice) {
    draft.pendingChoice = result.pendingChoice;
    return result;
  }

  draft.pendingChoice = null;
  // Search-family effects that resolve synchronously never actually searched,
  // so Lumiose City's "if a player searches … their turn ends" does not fire.
  // Non-search effects (Tropical Beach, Jubilife Village, Celebratory Fanfare)
  // do end the turn here.
  const SEARCH_KINDS = new Set([
    'search-bench',
    'search-hand',
    'search-deck',
    'search',
    'search-evolve',
    'energy',
    'recover-energy',
    'discard-search',
  ]);
  return {
    pendingChoice: null,
    completed: true,
    turnEnds: turnEndsOnResolve && !SEARCH_KINDS.has(opt?.kind),
  };
}
