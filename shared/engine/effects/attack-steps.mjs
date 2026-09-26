/**
 * @file Server-side handlers for the attack step kinds `rules/attack-steps.mjs` emits (design 030).
 * Same contract as trainer-steps.mjs: each handler mutates the draft, pushes events, and either
 * finishes (returns null) or asks for a choice (returns ctx.ask(...)); multi-choice progress lives
 * in `ctx.memo`. `ctx.sourceCard` is the attacking Pokémon — "this Pokémon".
 *
 * Knock Outs are never resolved here (handleKnockout lives in reduce.mjs, which imports this
 * module): damage placements push `damageCountersPlaced` and outright Knock Outs push
 * `knockOutMarked`; the attack phase sweeps both right after the steps run.
 * Pure and DOM-free: randomness only through ctx.activeRng (Invariant 6).
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isBasicPokemon, isEnergy, isPokemon } from '../cards.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import {
  addCondition,
  clearConditions,
  hasAnyCondition,
  hasCondition,
  listConditions,
} from '../rules/special-conditions.mjs';
import { effectiveHp, stadiumBlocksHealing } from '../rules/stadium-effects.mjs';
import {
  isExCard,
  isMegaCard,
  isRadiantCard,
  isTeraCard,
} from '../rules/card-classify.mjs';
import { shuffleInPlace } from '../rng.mjs';
import {
  addAttackMarker,
  clearAttackMarkers,
  liveAttackMarkers,
  markerFromTurn,
  markersBlockCondition,
  markerUntilTurn,
  SELF_NAME,
} from '../rules/attack-markers.mjs';
import { eachFilterMatches } from '../rules/each-filter.mjs';
import { discardCurrentStadium } from './trainer.mjs';
import {
  BENCH_LIMIT,
  activeOf,
  attachTo,
  attachedCards,
  benchRootsOf,
  damageCounterMoveLocked,
  discardCard,
  isBasicEnergy,
  isSpecialEnergy,
  isToolCard,
  pickById,
  pokemonHasType,
  removeFromZones,
  rootsOf,
  skip,
  sourceName,
  specialEnergyShielded,
  stageOf,
  topPokemonCard,
} from './trainer-steps.mjs';

// Pseudo-option ids for a "You may …" confirmation (negative: never a card instanceId).
export const ATTACK_YES = -11;
export const ATTACK_NO = -12;

// ── helpers ─────────────────────────────────────────────────────────────────

/** The attacking Pokémon while it is still in play, with its owner and zone. */
function attackerRef(ctx) {
  const id = ctx.sourceCard?.instanceId;
  if (id == null) return null;
  const ref = findCard(ctx.draft, id);
  if (!ref || (ref.zoneId !== 'active' && ref.zoneId !== 'bench') || ref.card.attachedTo) return null;
  return ref;
}

function energyMatches(card, step) {
  if (!isEnergy(card)) return false;
  if (step.basic && !isBasicEnergy(card)) return false;
  if (step.special && !isSpecialEnergy(card)) return false;
  if (step.energyType && !matchesSearch(card, `{${step.energyType}} Energy`)) return false;
  return true;
}

function energyLabel(step) {
  const type = step.energyType ? `{${step.energyType}} ` : '';
  return `${step.basic ? 'Basic ' : ''}${step.special ? 'Special ' : ''}${type}Energy`;
}

function attackName(ctx) {
  return ctx.step.attackName || sourceName(ctx, 'Attack');
}

function shuffleOwnDeck(player, ctx) {
  shuffleInPlace(ctx.activeRng, player.zones.deck);
  ctx.events.push({ type: 'deckShuffled', playerId: player.playerId });
}

/** Swaps a player's Active Pokémon (with attachments) for one of their Benched Pokémon. */
function swapActive(player, active, benchRoot, events, turnNumber = 1) {
  for (let i = player.zones.active.length - 1; i >= 0; i--) {
    const c = player.zones.active[i];
    if (c.instanceId === active.instanceId || c.attachedTo === active.instanceId) {
      player.zones.active.splice(i, 1);
      player.zones.bench.push(c);
    }
  }
  for (let i = player.zones.bench.length - 1; i >= 0; i--) {
    const c = player.zones.bench[i];
    if (c.instanceId === benchRoot.instanceId || c.attachedTo === benchRoot.instanceId) {
      player.zones.bench.splice(i, 1);
      player.zones.active.push(c);
    }
  }
  benchRoot.movedToActiveTurn = Math.max(1, Number(turnNumber) || 1);
  clearConditions(active);
  events.push({
    type: 'cardSwitched',
    playerId: player.playerId,
    activeId: active.instanceId,
    benchId: benchRoot.instanceId,
  });
}

function discardCards(player, cards, events, extra = {}) {
  if (cards.length === 0) return;
  for (const card of cards) {
    removeFromZones(player, card);
    card.attachedTo = null;
    discardCardToPlayerZone(player, card);
  }
  events.push({
    type: 'cardsDiscarded',
    playerId: player.playerId,
    cards: cards.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    ...extra,
  });
}

// A hand card the attack paid: "If you do, …" steps run only after one (executor
// requiresHandCost), and `forDamage` marks a discard the damage counts.
const handCostTag = (step) => ({ handCost: true, ...(step.countsForDamage ? { forDamage: true } : {}) });

function moveToZone(player, card, zone, from, events) {
  removeFromZones(player, card);
  card.attachedTo = null;
  player.zones[zone].push(card);
  events.push({ type: 'cardMoved', instanceId: card.instanceId, from, to: zone, playerId: player.playerId });
}

/**
 * "You may …": ask Yes/No first, then run the effect with the confirmation remembered in
 * the memo so its own choices resume normally.
 */
function optional(handler, question) {
  return (ctx) => {
    if (!ctx.step.optional || ctx.memo?.confirmed) {
      const memo = ctx.memo ? { ...ctx.memo } : undefined;
      if (memo) delete memo.confirmed;
      const confirmed = Boolean(ctx.memo?.confirmed);
      return handler({
        ...ctx,
        memo: memo && Object.keys(memo).length > 0 ? memo : undefined,
        ask: confirmed ? (args) => ctx.ask({ ...args, memo: { ...(args.memo || {}), confirmed: true } }) : ctx.ask,
      });
    }
    if (ctx.memo?.confirming) {
      if (ctx.selection?.[0] !== ATTACK_YES) return skip(ctx, 'declined');
      return optional(handler, question)({ ...ctx, selection: null, memo: { confirmed: true } });
    }
    return ctx.ask({
      prompt: `${attackName(ctx)}: ${question(ctx.step)}?`,
      options: [
        { instanceId: ATTACK_YES, name: 'Yes', type: 'option' },
        { instanceId: ATTACK_NO, name: 'No', type: 'option' },
      ],
      min: 1,
      max: 1,
      memo: { confirming: true },
    });
  };
}

// "1 of your Benched {L} Pokémon" / "1 of your Benched Murkrow" (design 036 D).
function benchQualifierMatches(player, root, step) {
  const top = topPokemonCard(player, root) || root;
  if (step.benchType && !pokemonHasType(top, step.benchType)) return false;
  if (step.benchName && String(top.name || '').toLowerCase() !== step.benchName) return false;
  return true;
}

// ── switch / gust ───────────────────────────────────────────────────────────

function atkSwitchSelf(ctx) {
  const { player } = ctx;
  const ref = attackerRef(ctx);
  if (!ref || ref.zoneId !== 'active') return skip(ctx, 'attacker_not_active');
  const bench = benchRootsOf(player).filter((c) => benchQualifierMatches(player, c, ctx.step));
  const turn = ctx.draft?.turn?.number;
  if (ctx.selection) {
    const root = bench.find((c) => c.instanceId === ctx.selection[0]);
    if (root) swapActive(player, ref.card, root, ctx.events, turn);
    return null;
  }
  if (bench.length === 0) return skip(ctx, 'no_bench_pokemon');
  if (bench.length === 1) {
    swapActive(player, ref.card, bench[0], ctx.events, turn);
    return null;
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Benched Pokémon to switch with ${ref.card.name}`,
    options: bench,
    min: 1,
    max: 1,
  });
}

function atkGust(ctx) {
  const { opponent } = ctx;
  const active = activeOf(opponent);
  const bench = benchRootsOf(opponent);
  const turn = ctx.draft?.turn?.number;
  if (ctx.selection) {
    const root = bench.find((c) => c.instanceId === ctx.selection[0]);
    if (active && root) swapActive(opponent, active, root, ctx.events, turn);
    return null;
  }
  if (!active || bench.length === 0) return skip(ctx, 'no_opponent_bench');
  if (bench.length === 1) {
    swapActive(opponent, active, bench[0], ctx.events, turn);
    return null;
  }
  const opponentChooses = ctx.step.chooser === 'opponent';
  return ctx.ask({
    player: opponentChooses ? opponent.playerId : ctx.playerId,
    prompt: opponentChooses
      ? `${attackName(ctx)}: Choose your new Active Pokémon`
      : `${attackName(ctx)}: Choose 1 of your opponent's Benched Pokémon to switch in`,
    options: bench,
    min: 1,
    max: 1,
  });
}

// ── move Energy ─────────────────────────────────────────────────────────────

function moveEnergyEnds(ctx) {
  const { player, opponent, step } = ctx;
  const ref = attackerRef(ctx);
  const attacker = ref?.card || null;
  const matches = (c) => energyMatches(c, step);
  switch (step.from) {
    case 'self':
      return {
        owner: player,
        energies: attacker ? attachedCards(player, attacker.instanceId).filter(matches) : [],
        targets: benchRootsOf(player).filter((c) => c !== attacker),
      };
    case 'bench': {
      const target = step.to === 'active' ? activeOf(player) : attacker;
      return {
        owner: player,
        energies: benchRootsOf(player)
          .filter((c) => c !== target)
          .flatMap((root) => attachedCards(player, root.instanceId))
          .filter(matches),
        targets: target ? [target] : [],
      };
    }
    case 'opponentActive': {
      const active = activeOf(opponent);
      return {
        owner: opponent,
        energies: active ? attachedCards(opponent, active.instanceId).filter(matches) : [],
        targets: benchRootsOf(opponent),
      };
    }
    case 'opponentAny':
      return {
        owner: opponent,
        energies: rootsOf(opponent).flatMap((root) => attachedCards(opponent, root.instanceId)).filter(matches),
        targets: rootsOf(opponent),
      };
    case 'opponentBench': {
      const active = activeOf(opponent);
      return {
        owner: opponent,
        energies: benchRootsOf(opponent)
          .flatMap((root) => attachedCards(opponent, root.instanceId))
          .filter(matches),
        targets: active ? [active] : [],
      };
    }
    default:
      return {
        owner: player,
        energies: rootsOf(player).flatMap((root) => attachedCards(player, root.instanceId)).filter(matches),
        targets: rootsOf(player),
      };
  }
}

function atkMoveEnergy(ctx) {
  const { step } = ctx;
  const { owner, energies, targets } = moveEnergyEnds(ctx);
  const byId = (id) => energies.find((c) => c.instanceId === id);

  // "in any way you like" between all of your Pokémon: one Energy, then its new host, repeated.
  if (step.from === 'any' || step.from === 'opponentAny') {
    if (ctx.memo?.energyId != null) {
      const energy = byId(ctx.memo.energyId);
      const target = targets.find((c) => c.instanceId === ctx.selection?.[0]);
      if (energy && target && target.instanceId !== energy.attachedTo) attachTo(owner, energy, target, ctx.events);
      return step.spread ? askNextEnergy(ctx, energies) : null;
    }
    if (ctx.selection) {
      const energy = byId(ctx.selection[0]);
      if (!energy) return null;
      return ctx.ask({
        prompt: `${attackName(ctx)}: Choose a Pokémon to move ${energy.name} to`,
        options: targets.filter((c) => c.instanceId !== energy.attachedTo),
        min: 1,
        max: 1,
        memo: { energyId: energy.instanceId },
      });
    }
    if (energies.length === 0 || targets.length < 2) return skip(ctx, 'no_energy_to_move');
    if (!step.spread) {
      return ctx.ask({
        prompt: `${attackName(ctx)}: Choose ${energyLabel(step)} to move`,
        options: energies,
        min: 1,
        max: 1,
      });
    }
    return askNextEnergy(ctx, energies);
  }

  // Resume: a target for the picked Energy (all at once, or one at a time when spread).
  if (ctx.memo?.energyIds) {
    const target = targets.find((c) => c.instanceId === ctx.selection?.[0]);
    const picked = ctx.memo.energyIds.map(byId).filter(Boolean);
    if (!target) return skip(ctx, 'target_not_found');
    const batch = step.spread ? picked.slice(0, 1) : picked;
    for (const energy of batch) attachTo(owner, energy, target, ctx.events);
    return moveToTargets(ctx, picked.slice(batch.length), targets, owner);
  }

  if (ctx.selection) return moveToTargets(ctx, pickById(energies, ctx.selection), targets, owner);
  if (energies.length === 0) return skip(ctx, 'no_energy_to_move');
  if (targets.length === 0) return skip(ctx, 'no_target');
  if (step.all) return moveToTargets(ctx, energies, targets, owner);
  if (step.anyNumber) {
    return ctx.ask({
      prompt: `${attackName(ctx)}: Choose any number of ${energyLabel(step)} to move`,
      options: energies,
      min: 0,
      max: energies.length,
    });
  }
  const count = step.count || 1;
  if (energies.length <= count) return moveToTargets(ctx, energies, targets, owner);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${count} ${energyLabel(step)} to move`,
    options: energies,
    min: count,
    max: count,
  });
}

function askNextEnergy(ctx, energies) {
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose an Energy to move (choose none to finish)`,
    options: energies,
    min: 0,
    max: 1,
  });
}

// `targets` never holds the Pokémon the Energy comes from (moveEnergyEnds), so one target
// takes everything without a prompt.
function moveToTargets(ctx, picked, targets, owner) {
  if (picked.length === 0) return null;
  if (targets.length === 0) return skip(ctx, 'no_target');
  if (targets.length === 1) {
    for (const energy of picked) attachTo(owner, energy, targets[0], ctx.events);
    return null;
  }
  const what = ctx.step.spread || picked.length === 1 ? picked[0].name : `${picked.length} Energy`;
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Pokémon to move ${what} to`,
    options: targets,
    min: 1,
    max: 1,
    memo: { energyIds: picked.map((c) => c.instanceId) },
  });
}

// ── discard from this Pokémon ───────────────────────────────────────────────

// Coin-gated self discard (design 032): "If tails, discard 2 Energy attached to this Pokémon".
// Fewer matching Energy than the count discards what there is.
function atkDiscardSelfEnergy(ctx) {
  const { player, step } = ctx;
  const ref = attackerRef(ctx);
  const energies = ref ? attachedCards(player, ref.card.instanceId).filter((c) => energyMatches(c, step)) : [];
  return discardChosen(ctx, energies, { label: energyLabel(step) });
}

// ── discard from the opponent ───────────────────────────────────────────────

function opponentRootsInScope(opponent, scope) {
  if (scope === 'active') return [activeOf(opponent)].filter(Boolean);
  return rootsOf(opponent);
}

// Discards the chosen cards, or with `toOwnerHand` returns them to their owner's hand
// (Samurott Aqua Wash: "put 2 Energy attached to your opponent's Active Pokémon into their hand"),
// or with `toOwnerDeck` shuffles them into their owner's deck (Smoochum Psykiss).
// `chooser` is the player who picks (the opponent for Blastoise ex Hyper Whirlpool).
function discardChosen(ctx, cards, options) {
  const { step } = ctx;
  const removeAll = (picked) => {
    for (const card of picked) {
      if (options.toOwnerHand) moveToZone(options.toOwnerHand, card, 'hand', 'inPlay', ctx.events);
      else if (options.toOwnerDeck) moveToZone(options.toOwnerDeck, card, 'deck', 'inPlay', ctx.events);
      else discardCard(ctx.draft, card, ctx.events);
    }
    if (options.toOwnerDeck && picked.length > 0) shuffleOwnDeck(options.toOwnerDeck, ctx);
    return null;
  };
  if (ctx.selection) return removeAll(pickById(cards, ctx.selection));
  if (cards.length === 0) return skip(ctx, 'nothing_to_discard');
  if (step.all || (!step.upTo && cards.length <= (step.count || 1))) return removeAll(cards);
  const max = Math.min(step.count || 1, cards.length);
  const verb = options.toOwnerHand
    ? "return to your opponent's hand"
    : options.toOwnerDeck
      ? "shuffle into your opponent's deck"
      : 'discard';
  return ctx.ask({
    ...(options.chooser ? { player: options.chooser.playerId } : {}),
    prompt: `${attackName(ctx)}: Choose ${step.upTo ? 'up to ' : ''}${max} ${options.label} to ${verb}`,
    options: cards,
    min: step.upTo ? 0 : max,
    max,
  });
}

function atkDiscardOppEnergy(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const matches = (c) => energyMatches(c, step);

  if (step.scope === 'each') {
    // One Energy from each Pokémon; the attacker picks where a Pokémon has a choice.
    const pending = ctx.memo?.rootIds
      ? ctx.memo.rootIds
      : rootsOf(opponent)
          .filter((root) => attachedCards(opponent, root.instanceId).some(matches))
          .map((root) => root.instanceId);
    let [current, ...rest] = pending;
    if (ctx.memo?.rootIds && ctx.selection) {
      const energy = attachedCards(opponent, current).filter(matches).find((c) => c.instanceId === ctx.selection[0]);
      if (energy) discardCard(ctx.draft, energy, ctx.events);
      [current, ...rest] = rest;
    }
    while (current != null) {
      const energies = attachedCards(opponent, current).filter(matches);
      if (energies.length > 1) {
        return ctx.ask({
          prompt: `${attackName(ctx)}: Choose an Energy to discard from ${findCard(ctx.draft, current)?.card?.name || 'that Pokémon'}`,
          options: energies,
          min: 1,
          max: 1,
          memo: { rootIds: [current, ...rest] },
        });
      }
      if (energies.length === 1) discardCard(ctx.draft, energies[0], ctx.events);
      [current, ...rest] = rest;
    }
    return null;
  }

  const energies = opponentRootsInScope(opponent, step.scope)
    .flatMap((root) => attachedCards(opponent, root.instanceId))
    .filter(matches);
  return discardChosen(ctx, energies, {
    label: energyLabel(step),
    toOwnerHand: step.toHand ? opponent : null,
    toOwnerDeck: step.toDeck ? opponent : null,
    chooser: step.chooser === 'opponent' ? opponent : null,
  });
}

// Articuno-GX Cold Crush-GX: every matching Energy leaves both Active Pokémon.
function atkDiscardBothActiveEnergy(ctx) {
  const { player, opponent, step } = ctx;
  const matches = (c) => energyMatches(c, step);
  let discarded = 0;
  for (const owner of [opponent, player].filter(Boolean)) {
    const root = activeOf(owner);
    if (!root) continue;
    for (const card of attachedCards(owner, root.instanceId).filter(matches)) {
      discardCard(ctx.draft, card, ctx.events);
      discarded += 1;
    }
  }
  return discarded === 0 ? skip(ctx, 'no_energy') : null;
}

function atkDiscardOppTools(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const tools = opponentRootsInScope(opponent, step.scope)
    .flatMap((root) => attachedCards(opponent, root.instanceId))
    .filter(isToolCard);
  return discardChosen(ctx, tools, { label: 'Pokémon Tool' });
}

function atkDiscardOppHand(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const hand = opponent.zones.hand || [];
  if (ctx.selection) {
    discardCards(opponent, pickById(hand, ctx.selection), ctx.events);
    return null;
  }
  if (hand.length === 0) return skip(ctx, 'empty_hand');
  const count = Math.min(step.count || 1, hand.length);
  if (step.random || hand.length <= count) {
    const picked = [];
    const pool = [...hand];
    for (let i = 0; i < count; i++) {
      const at = Math.floor((ctx.activeRng ? ctx.activeRng.next() : 0) * pool.length);
      picked.push(...pool.splice(at, 1));
    }
    discardCards(opponent, picked, ctx.events);
    return null;
  }
  return ctx.ask({
    player: opponent.playerId,
    prompt: `${attackName(ctx)}: Choose ${count} card${count === 1 ? '' : 's'} to discard from your hand`,
    options: hand,
    min: count,
    max: count,
  });
}

// ── mill ────────────────────────────────────────────────────────────────────

/** Hand Energy cards an `atkDiscardHandEnergy` step may discard. */
export function handEnergyForDiscard(player, step) {
  return (player?.zones?.hand || []).filter((card) => energyMatches(card, step));
}

// Voltage Shoot: discard exactly `count` matching Energy cards from the hand before damage.
// The attack legality gate refuses the attack when the hand holds fewer.
function atkDiscardHandEnergy(ctx) {
  const { player, step } = ctx;
  const candidates = handEnergyForDiscard(player, step);
  const count = step.count || 1;
  if (ctx.selection) {
    const picked = pickById(candidates, ctx.selection).slice(0, count);
    if (picked.length < count) return skip(ctx, 'not_enough_energy');
    discardCards(player, picked, ctx.events, handCostTag(step));
    return null;
  }
  if (candidates.length < count) return skip(ctx, 'not_enough_energy');
  if (candidates.length === count) {
    discardCards(player, candidates, ctx.events, handCostTag(step));
    return null;
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${count} ${energyLabel(step)} card${count === 1 ? '' : 's'} to discard from your hand`,
    options: candidates,
    min: count,
    max: count,
  });
}

// Design 036 A11: discard N cards, any number, or the whole hand.
function atkDiscardOwnHand(ctx) {
  const { player, step } = ctx;
  const hand = player.zones.hand || [];
  const tag = handCostTag(step);
  if (ctx.selection) {
    const picked = pickById(hand, ctx.selection);
    if (typeof step.count === 'number' && picked.length < step.count) return skip(ctx, 'not_enough_cards');
    discardCards(player, picked, ctx.events, tag);
    return null;
  }
  if (step.count === 'all') {
    discardCards(player, [...hand], ctx.events, tag);
    return null;
  }
  if (hand.length === 0) return skip(ctx, 'empty_hand');
  if (step.count === 'any') {
    return ctx.ask({
      prompt: `${attackName(ctx)}: Choose any number of cards to discard from your hand`,
      options: hand,
      min: 0,
      max: hand.length,
    });
  }
  const count = step.count || 1;
  if (hand.length < count) return skip(ctx, 'not_enough_cards');
  if (hand.length === count) {
    discardCards(player, [...hand], ctx.events, tag);
    return null;
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${count} card${count === 1 ? '' : 's'} to discard from your hand`,
    options: hand,
    min: count,
    max: count,
  });
}

function atkMill(ctx) {
  const { player, opponent, step } = ctx;
  const sides = step.side === 'self' ? [player] : step.side === 'each' ? [player, opponent] : [opponent];
  for (const side of sides.filter(Boolean)) {
    discardCards(side, side.zones.deck.slice(0, step.count || 1), ctx.events);
  }
  return null;
}

// ── attach from the discard pile / hand ─────────────────────────────────────

function attachTargets(ctx) {
  const { player, step } = ctx;
  if (step.target === 'self') {
    const ref = attackerRef(ctx);
    return ref ? [ref.card] : [];
  }
  const attacker = attackerRef(ctx)?.card;
  if (step.target === 'bench') {
    return benchRootsOf(player).filter(
      (c) => c !== attacker && (!step.targetEx || /-EX$/.test(String(topPokemonCard(player, c)?.name || '')))
    );
  }
  return rootsOf(player).filter(
    (c) => !step.pokemonType || pokemonHasType(topPokemonCard(player, c) || c, step.pokemonType)
  );
}

function attachPicked(ctx, picked, targets) {
  const { player, step } = ctx;
  if (picked.length === 0) return null;
  if (targets.length === 1) {
    for (const card of picked) attachTo(player, card, targets[0], ctx.events);
    return null;
  }
  const what = step.spread || picked.length === 1 ? picked[0].name : `${picked.length} Energy`;
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Pokémon to attach ${what} to`,
    options: targets,
    min: 1,
    max: 1,
    memo: { cardIds: picked.map((c) => c.instanceId) },
  });
}

function atkAttach(ctx) {
  const { player, step } = ctx;
  const zone = step.source === 'hand' ? player.zones.hand : player.zones.discard;
  const candidates = (zone || []).filter((c) => energyMatches(c, step));
  const targets = attachTargets(ctx);

  if (ctx.memo?.cardIds) {
    const target = targets.find((c) => c.instanceId === ctx.selection?.[0]);
    const picked = ctx.memo.cardIds.map((id) => candidates.find((c) => c.instanceId === id)).filter(Boolean);
    if (!target) return skip(ctx, 'target_not_found');
    const batch = step.spread ? picked.slice(0, 1) : picked;
    for (const card of batch) attachTo(player, card, target, ctx.events);
    return attachPicked(ctx, picked.slice(batch.length), targets);
  }
  if (ctx.selection) return attachPicked(ctx, pickById(candidates, ctx.selection), targets);
  if (candidates.length === 0) return skip(ctx, 'no_energy');
  if (targets.length === 0) return skip(ctx, 'no_target');

  const max = step.anyNumber ? candidates.length : Math.min(step.count || 1, candidates.length);
  const min = step.anyNumber || step.upTo ? 0 : max;
  if (min === max && max === candidates.length) return attachPicked(ctx, candidates, targets);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${min === max ? max : `up to ${max}`} ${energyLabel(step)} to attach`,
    options: candidates,
    min,
    max,
  });
}

// ── Bench placement / recovery ──────────────────────────────────────────────

function benchSpace(player) {
  return Math.max(0, BENCH_LIMIT - benchRootsOf(player).length);
}

function putOnBench(player, cards, from, events) {
  for (const card of cards) moveToZone(player, card, 'bench', from, events);
}

function atkBenchFromDeckTop(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck;
  const viewed = deck.slice(0, Math.min(step.look || 1, deck.length));
  if (ctx.selection) {
    const picked = pickById(viewed, ctx.selection).slice(0, benchSpace(player));
    putOnBench(player, picked, 'deck', ctx.events);
    shuffleOwnDeck(player, ctx);
    return null;
  }
  if (viewed.length === 0) return skip(ctx, 'empty_deck');
  const basics = viewed.filter((c) => isPokemon(c) && stageOf(c) === 'Basic');
  const space = benchSpace(player);
  ctx.events.push({ type: 'cardsLookedAt', playerId: player.playerId, count: viewed.length });
  if (basics.length === 0 || space === 0) {
    shuffleOwnDeck(player, ctx);
    return null;
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Put any number of these Basic Pokémon onto your Bench`,
    options: basics,
    min: 0,
    max: Math.min(space, basics.length),
  });
}

function atkBenchFromDiscard(ctx) {
  const { player, step } = ctx;
  // Only Basic Pokémon can be put onto the Bench.
  const candidates = (player.zones.discard || []).filter(
    (c) =>
      isPokemon(c) &&
      stageOf(c) === 'Basic' &&
      (!step.pokemonType || pokemonHasType(c, step.pokemonType)) &&
      (!step.maxHp || (Number(c.hp) || 0) <= step.maxHp)
  );
  const what = step.pokemonType ? `Basic {${step.pokemonType.toUpperCase()}} Pokémon` : 'Basic Pokémon';
  const space = benchSpace(player);
  if (ctx.selection) {
    putOnBench(player, pickById(candidates, ctx.selection).slice(0, space), 'discard', ctx.events);
    return null;
  }
  if (candidates.length === 0) return skip(ctx, 'no_pokemon_in_discard');
  if (space === 0) return skip(ctx, 'bench_full');
  const max = Math.min(step.count || 1, candidates.length, space);
  const min = step.upTo ? 0 : max;
  if (min === max && max === candidates.length) {
    putOnBench(player, candidates, 'discard', ctx.events);
    return null;
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${min === max ? max : `up to ${max}`} ${what} to put onto your Bench`,
    options: candidates,
    min,
    max,
  });
}

// `what: null` takes any card; `to: 'deckTop'` puts it on top of the deck (Xatu Warp Hole).
function atkRecover(ctx) {
  const { player, step } = ctx;
  const candidates = (player.zones.discard || []).filter((c) => !step.what || matchesSearch(c, step.what));
  const toDeckTop = step.to === 'deckTop';
  const recover = (cards) => {
    for (const card of cards) {
      if (!toDeckTop) {
        moveToZone(player, card, 'hand', 'discard', ctx.events);
        continue;
      }
      removeFromZones(player, card);
      player.zones.deck.unshift(card);
      ctx.events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'discard', to: 'deck', playerId: player.playerId });
    }
    return null;
  };
  if (ctx.selection) return recover(pickById(candidates, ctx.selection));
  if (candidates.length === 0) return skip(ctx, 'nothing_to_recover');
  const max = Math.min(step.count || 1, candidates.length);
  const min = step.upTo ? 0 : max;
  if (min === max && max === candidates.length) return recover(candidates);
  const kind = step.what ? `${step.what} ` : '';
  const where = toDeckTop ? 'on top of your deck' : 'into your hand';
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${min === max ? max : `up to ${max}`} ${kind}card${max === 1 ? '' : 's'} to put ${where}`,
    options: candidates,
    min,
    max,
  });
}

// ── self care ───────────────────────────────────────────────────────────────

function atkCureSelf(ctx) {
  const ref = attackerRef(ctx);
  if (!ref || !hasAnyCondition(ref.card)) return skip(ctx, 'no_special_condition');
  clearConditions(ref.card);
  ctx.events.push({ type: 'specialConditionUpdated', instanceId: ref.card.instanceId, condition: null, conditions: [] });
  return null;
}

// Snorlax V Swallow: the reducer sets `amount` to the damage this attack just did.
function atkMirrorHeal(ctx) {
  const ref = attackerRef(ctx);
  if (!ref || !(ctx.step.amount > 0) || !(ref.card.damage > 0)) return skip(ctx, 'nothing_to_heal');
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  const healed = Math.min(ref.card.damage, ctx.step.amount);
  ref.card.damage -= healed;
  ctx.events.push({ type: 'damageUpdated', instanceId: ref.card.instanceId, damage: ref.card.damage, healed });
  return null;
}

// ── look at the top of the deck ─────────────────────────────────────────────

// Giratina V Abyss Seeking / Pichu Baby Steps: keep `take` of the top `look` cards; the rest
// go to the Lost Zone or are shuffled back.
function atkLookTopTake(ctx) {
  const { player, step } = ctx;
  const viewed = player.zones.deck.slice(0, step.look || 1);
  const finish = (kept) => {
    for (const card of kept) moveToZone(player, card, 'hand', 'deck', ctx.events);
    const rest = viewed.filter((c) => !kept.includes(c));
    if (step.rest === 'lostZone') moveToLostZone(ctx, player, rest);
    else shuffleOwnDeck(player, ctx);
    return null;
  };
  if (ctx.selection) return finish(pickById(viewed, ctx.selection).slice(0, step.take || 1));
  if (viewed.length === 0) return skip(ctx, 'empty_deck');
  const take = Math.min(step.take || 1, viewed.length);
  if (take === viewed.length) return finish(viewed);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${take} card${take === 1 ? '' : 's'} to put into your hand`,
    options: viewed,
    min: take,
    max: take,
  });
}

// ── opponent's cards back into their deck ───────────────────────────────────

function atkShuffleOppBench(ctx) {
  const { opponent, step } = ctx;
  const bench = benchRootsOf(opponent);
  const shuffleIn = (roots) => {
    for (const root of roots) {
      const stack = [root, ...attachedCards(opponent, root.instanceId)];
      for (const card of stack) {
        removeFromZones(opponent, card);
        card.attachedTo = null;
        card.damage = 0;
        clearConditions(card);
        opponent.zones.deck.push(card);
      }
      ctx.events.push({ type: 'cardMoved', instanceId: root.instanceId, from: 'bench', to: 'deck', playerId: opponent.playerId });
    }
    shuffleOwnDeck(opponent, ctx);
    return null;
  };
  if (ctx.selection) return shuffleIn(pickById(bench, ctx.selection).slice(0, step.count || 1));
  if (bench.length === 0) return skip(ctx, 'no_opponent_bench');
  if (bench.length <= (step.count || 1)) return shuffleIn(bench);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${step.count} of your opponent's Benched Pokémon`,
    options: bench,
    min: step.count,
    max: step.count,
  });
}

function atkOppHandRandomToDeck(ctx) {
  const { opponent } = ctx;
  const hand = opponent?.zones?.hand || [];
  if (hand.length === 0) return skip(ctx, 'empty_hand');
  const picked = [];
  const pool = [...hand];
  while (picked.length < (ctx.step.count || 1) && pool.length > 0) {
    const at = Math.floor((ctx.activeRng ? ctx.activeRng.next() : 0) * pool.length);
    picked.push(...pool.splice(at, 1));
  }
  ctx.events.push({ type: 'cardsRevealed', playerId: opponent.playerId, cards: picked.map(revealedCard) });
  for (const card of picked) moveToZone(opponent, card, 'deck', 'hand', ctx.events);
  shuffleOwnDeck(opponent, ctx);
  return null;
}

const revealedCard = (card) => ({ instanceId: card.instanceId, name: card.name });

const REVEAL_ACTION_ZONE = { deckBottom: 'deck', deckShuffle: 'deck', prize: 'prizes', bench: 'bench' };

function applyRevealAction(ctx, cards) {
  const { opponent, step } = ctx;
  const zone = REVEAL_ACTION_ZONE[step.then.action];
  if (!zone) {
    discardCards(opponent, cards, ctx.events);
    return null;
  }
  // Deck index 0 is the top, so a push puts the card on the bottom.
  for (const card of cards) moveToZone(opponent, card, zone, 'hand', ctx.events);
  if (step.then.action === 'deckShuffle' && cards.length > 0) shuffleOwnDeck(opponent, ctx);
  if (step.then.action === 'bench' && step.then.counters) {
    for (const card of cards) {
      card.damage = (card.damage || 0) + step.then.counters * 10;
      ctx.events.push({ type: 'damageUpdated', instanceId: card.instanceId, damage: card.damage });
    }
  }
  return null;
}

// How many revealed cards the follow-up takes: "any number" is the player's call (none
// included), and a Bench placement is capped by the room on the opponent's Bench.
function revealPickRange(ctx, matching) {
  const { opponent, step } = ctx;
  const room = step.then.action === 'bench' ? benchSpace(opponent) : Infinity;
  if (step.then.count === 'any') return { min: 0, max: Math.min(matching.length, room) };
  if (step.then.count === 'all') return { min: Math.min(matching.length, room), max: Math.min(matching.length, room) };
  const n = Math.min(step.then.count, matching.length, room);
  return { min: n, max: n };
}

// "Your opponent reveals their hand." plus an optional follow-up on the revealed cards
// (discard / bottom of deck / shuffle into deck / face-down Prize / onto their Bench). Damage
// that counts the revealed cards is the damage parser's, read from the same hand.
function atkRevealOppHand(ctx) {
  const { opponent, step } = ctx;
  const hand = opponent?.zones?.hand;
  if (!hand) return skip(ctx, 'no_opponent');
  const matching = step.then?.filter ? hand.filter((c) => matchesSearch(c, step.then.filter)) : [...hand];
  if (ctx.selection && step.then) {
    const { max } = revealPickRange(ctx, matching);
    return applyRevealAction(ctx, pickById(matching, ctx.selection).slice(0, max));
  }
  ctx.events.push({ type: 'cardsRevealed', playerId: opponent.playerId, cards: hand.map(revealedCard) });
  if (!step.then) return null;
  if (matching.length === 0) return skip(ctx, 'no_matching_card');
  const { min, max } = revealPickRange(ctx, matching);
  if (max === 0) return skip(ctx, 'bench_full');
  if (min === max && max === matching.length) return applyRevealAction(ctx, matching);
  const kind = step.then.filter ? `${step.then.filter[0].toUpperCase()}${step.then.filter.slice(1)} ` : '';
  const amount = step.then.count === 'any' ? 'any number of' : String(max);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${amount} ${kind}card(s) from your opponent's hand`,
    options: matching,
    min,
    max,
  });
}

function atkShuffleHandIntoDeck(ctx) {
  const { player } = ctx;
  const hand = player.zones.hand.splice(0);
  player.zones.deck.push(...hand);
  for (const card of hand) {
    ctx.events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'hand', to: 'deck', playerId: player.playerId });
  }
  shuffleOwnDeck(player, ctx);
  return null;
}

// "Draw up to 5 cards" asks how many (one button per count, 1 to the most the deck allows);
// "a number of cards equal to the number of cards in your opponent's hand" reads that hand
// when the step runs.
function atkDraw(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck;
  if (step.upTo && !ctx.selection) {
    const most = Math.min(step.count || 0, deck.length);
    if (most === 0) return skip(ctx, 'nothing_to_draw');
    return ctx.ask({
      prompt: `${attackName(ctx)}: How many cards do you want to draw?`,
      options: Array.from({ length: most }, (_, i) => ({ instanceId: i + 1, name: `Draw ${i + 1}`, type: 'option' })),
      min: 1,
      max: 1,
    });
  }
  const count = step.upTo
    ? Math.min(Number(ctx.selection[0]) || 0, step.count || 0)
    : step.countFrom === 'opponentHand'
      ? ctx.opponent?.zones?.hand?.length || 0
      : step.count || 0;
  const drawn = deck.splice(0, Math.min(count, deck.length));
  if (drawn.length === 0) return skip(ctx, 'nothing_to_draw');
  player.zones.hand.push(...drawn);
  ctx.events.push({
    type: 'cardsDrawn',
    count: drawn.length,
    playerId: player.playerId,
    cards: drawn.map((c) => ({ instanceId: c.instanceId })),
  });
  return null;
}

// Shiinotic Dream's Touch: the opponent's Active sheds all its Energy into their deck when
// it has the printed Special Condition.
function atkShuffleOppActiveEnergy(ctx) {
  const { opponent, step } = ctx;
  const target = activeOf(opponent);
  if (!target) return skip(ctx, 'no_opponent_active');
  if (!hasCondition(target, step.condition)) return skip(ctx, 'condition_unmet');
  const energy = attachedCards(opponent, target.instanceId).filter(isEnergy);
  if (energy.length === 0) return skip(ctx, 'no_energy');
  for (const card of energy) moveToZone(opponent, card, 'deck', 'active', ctx.events);
  shuffleOwnDeck(opponent, ctx);
  return null;
}

// Palkia-GX Zero Vanish-GX: every opponent Pokémon sheds its Energy into their deck.
function atkShuffleOppEnergy(ctx) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const energy = rootsOf(opponent).flatMap((root) =>
    attachedCards(opponent, root.instanceId).filter(isEnergy)
  );
  if (energy.length === 0) return skip(ctx, 'no_energy');
  for (const card of energy) moveToZone(opponent, card, 'deck', 'inPlay', ctx.events);
  shuffleOwnDeck(opponent, ctx);
  return null;
}

function atkShuffleOppDeck(ctx) {
  if (!ctx.opponent) return skip(ctx, 'no_opponent');
  shuffleOwnDeck(ctx.opponent, ctx);
  return null;
}

// ── Lost Zone ───────────────────────────────────────────────────────────────

// `forDamage` marks a cost the attack's damage counts ("for each card put in the Lost Zone
// in this way"); the reducer sums those events.
function moveToLostZone(ctx, owner, cards) {
  if (cards.length === 0) return;
  if (!owner.zones.lostZone) owner.zones.lostZone = [];
  for (const card of cards) {
    removeFromZones(owner, card);
    card.attachedTo = null;
    owner.zones.lostZone.push(card);
  }
  ctx.events.push({
    type: 'cardsLostZoned',
    playerId: owner.playerId,
    count: cards.length,
    cards: cards.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    ...(ctx.step.countsForDamage ? { forDamage: true } : {}),
    ...(ctx.step.type === 'atkLostZoneFromHand' ? { handCost: true } : {}),
  });
}

function atkLostZoneDeckTop(ctx) {
  const { step } = ctx;
  const owner = step.side === 'opponent' ? ctx.opponent : ctx.player;
  if (!owner) return skip(ctx, 'no_opponent');
  const cards = owner.zones.deck.slice(0, step.count || 1);
  if (cards.length === 0) return skip(ctx, 'empty_deck');
  moveToLostZone(ctx, owner, cards);
  return null;
}

/** Picks cards for a Lost Zone move: all when the count takes them all, else a choice. */
function lostZoneChoice(ctx, owner, candidates, label) {
  const { step } = ctx;
  if (ctx.selection) {
    moveToLostZone(ctx, owner, pickById(candidates, ctx.selection));
    return null;
  }
  if (candidates.length === 0) return skip(ctx, 'nothing_to_lost_zone');
  if (step.all || (!step.anyNumber && candidates.length <= (step.count || 1))) {
    moveToLostZone(ctx, owner, candidates);
    return null;
  }
  const max = step.anyNumber ? candidates.length : step.count || 1;
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${step.anyNumber ? 'any number of' : max} ${label} to put in the Lost Zone`,
    options: candidates,
    min: step.anyNumber ? 0 : max,
    max,
  });
}

function atkLostZoneEnergy(ctx) {
  const { player, opponent, step } = ctx;
  const matches = (c) => energyMatches(c, step);
  const onRoots = (owner, roots) => roots.flatMap((root) => attachedCards(owner, root.instanceId)).filter(matches);
  const ref = attackerRef(ctx);
  switch (step.from) {
    case 'self':
      return lostZoneChoice(ctx, player, ref ? onRoots(player, [ref.card]) : [], energyLabel(step));
    case 'yours':
      return lostZoneChoice(ctx, player, onRoots(player, rootsOf(player)), energyLabel(step));
    case 'opponentActive':
      return lostZoneChoice(ctx, opponent, onRoots(opponent, [activeOf(opponent)].filter(Boolean)), energyLabel(step));
    default:
      return lostZoneChoice(ctx, opponent, onRoots(opponent, rootsOf(opponent)), energyLabel(step));
  }
}

function atkLostZoneFromDiscard(ctx) {
  const { player, step } = ctx;
  const candidates = (player.zones.discard || []).filter((c) => matchesSearch(c, step.what));
  return lostZoneChoice(ctx, player, candidates, `${step.what} cards`);
}

/** Hand cards an `atkLostZoneFromHand` step may take (Absol Vicious Claw: Pokémon only). */
export function handCardsForLostZone(player, step) {
  const hand = player?.zones?.hand || [];
  return step.what === 'pokemon' ? hand.filter(isPokemon) : hand;
}

function atkLostZoneFromHand(ctx) {
  const { player, step } = ctx;
  return lostZoneChoice(ctx, player, handCardsForLostZone(player, step), step.what === 'pokemon' ? 'Pokémon' : 'cards');
}

function atkLostZoneOppHandRandom(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const pool = [...(opponent.zones.hand || [])];
  if (pool.length === 0) return skip(ctx, 'empty_hand');
  const count = Math.min(step.count || 1, pool.length);
  const picked = [];
  for (let i = 0; i < count; i++) {
    const at = Math.floor((ctx.activeRng ? ctx.activeRng.next() : 0) * pool.length);
    picked.push(...pool.splice(at, 1));
  }
  moveToLostZone(ctx, opponent, picked);
  return null;
}

function atkLostZoneOppDiscard(ctx) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  return lostZoneChoice(ctx, opponent, [...(opponent.zones.discard || [])], 'cards');
}

/** A Pokémon and every card attached to it, off the board and into its owner's Lost Zone. */
function lostZoneStack(ctx, owner, root) {
  const stack = [root, ...attachedCards(owner, root.instanceId)];
  for (const card of stack) {
    card.damage = 0;
    clearConditions(card);
    clearAttackMarkers(card);
  }
  moveToLostZone(ctx, owner, stack);
}

function atkLostZoneSelf(ctx) {
  const { player } = ctx;
  const ref = attackerRef(ctx);
  if (!ref || ref.playerId !== player.playerId) return skip(ctx, 'attacker_not_in_play');
  lostZoneStack(ctx, player, ref.card);
  return null;
}

function atkLostZoneOppActive(ctx) {
  const { opponent } = ctx;
  const active = opponent ? activeOf(opponent) : null;
  if (!active) return skip(ctx, 'no_opponent_active');
  lostZoneStack(ctx, opponent, active);
  return null;
}

// ── leave play ──────────────────────────────────────────────────────────────

function atkShuffleSelf(ctx) {
  const { player } = ctx;
  const ref = attackerRef(ctx);
  if (!ref || ref.playerId !== player.playerId) return skip(ctx, 'attacker_not_in_play');
  const stack = [ref.card, ...attachedCards(player, ref.card.instanceId)];
  for (const card of stack) {
    removeFromZones(player, card);
    card.attachedTo = null;
    card.damage = 0;
    clearConditions(card);
    player.zones.deck.push(card);
  }
  ctx.events.push({
    type: 'cardMoved',
    instanceId: ref.card.instanceId,
    from: ref.zoneId,
    to: 'deck',
    playerId: player.playerId,
    reason: 'attack-shuffle-self',
  });
  shuffleOwnDeck(player, ctx);
  return null;
}

/** Ability form (Dudunsparce, Run Away Draw): "If you drew any cards in this way" gates the shuffle. */
function returnSelfToDeckAbility(ctx) {
  const { step, playerId, events } = ctx;
  if (!step.shuffleSelf) return skip(ctx, 'unsupported_step');
  if (step.requiresDraw) {
    const drew = events.some((e) => e.type === 'cardsDrawn' && e.playerId === playerId && e.count > 0);
    if (!drew) return skip(ctx, 'drew_no_cards');
  }
  return atkShuffleSelf(ctx);
}

// ── damage counters / Knock Out ─────────────────────────────────────────────

function placeCounters(ctx, card, victimPlayerId, amount) {
  // Mist/Rocky/Wash/Wonder Energy: counters an opponent's attack places are an effect
  // of that attack, not damage, so the effect shield stops them per target.
  if (victimPlayerId === ctx.opponent?.playerId && specialEnergyShielded(ctx.opponent, card)) {
    ctx.events.push({
      type: 'damagePrevented',
      instanceId: card.instanceId,
      attackName: attackName(ctx),
      reason: 'special-energy-effect',
    });
    return false;
  }
  card.damage = (card.damage || 0) + amount;
  ctx.events.push({ type: 'damageUpdated', instanceId: card.instanceId, damage: card.damage });
  ctx.events.push({
    type: 'damageCountersPlaced',
    instanceId: card.instanceId,
    victimPlayerId,
    // Counters on the attacker's own Pokémon (Dusclops Night Roam) give the opponent the Prize.
    attackerPlayerId: victimPlayerId === ctx.playerId ? ctx.opponent?.playerId : ctx.playerId,
    damage: card.damage,
  });
  return true;
}

function atkCountersEach(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const targets = step.scope === 'bench' ? benchRootsOf(opponent) : rootsOf(opponent);
  if (targets.length === 0) return skip(ctx, 'no_target');
  for (const card of targets) placeCounters(ctx, card, opponent.playerId, (step.count || 1) * 10);
  return null;
}

// Design 036 A9: filtered and both-sides counter spread. Targets are picked before any
// counter lands, so a "has damage counters" filter reads the board as the attack began.
function atkCountersEachFiltered(ctx) {
  const { player, opponent, step } = ctx;
  const owners = (step.side === 'both' ? [opponent, player] : [opponent]).filter(Boolean);
  const targets = [];
  for (const owner of owners) {
    const roots =
      step.scope === 'active'
        ? [activeOf(owner)].filter(Boolean)
        : step.scope === 'bench'
          ? benchRootsOf(owner)
          : rootsOf(owner);
    for (const root of roots) {
      if (eachFilterMatches(owner, root, step.filter)) targets.push({ owner, root });
    }
  }
  if (targets.length === 0) return skip(ctx, 'no_target');
  for (const { owner, root } of targets) placeCounters(ctx, root, owner.playerId, (step.count || 1) * 10);
  return null;
}

function atkDoubleCountersEach(ctx) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const damaged = rootsOf(opponent).filter((root) => (root.damage || 0) > 0);
  if (damaged.length === 0) return skip(ctx, 'no_target');
  for (const root of damaged) placeCounters(ctx, root, opponent.playerId, root.damage);
  return null;
}

// Yveltal ex Soul Destroyer: every opponent's Pokémon at or below the remaining-HP line.
function atkKnockOutAll(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const doomed = rootsOf(opponent).filter((root) => {
    const left = remainingHp(ctx, opponent, root);
    return left > 0 && left <= step.maxRemainingHp && !specialEnergyShielded(opponent, root);
  });
  if (doomed.length === 0) return skip(ctx, 'condition_unmet');
  for (const root of doomed) markKnockOut(ctx, opponent, root);
  return null;
}

// Tsareena ex Icicle Sole / Medicham ex Chi-Atsu: counters until remaining HP is step.hp.
function atkHpCap(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const countersToCap = (root) => {
    const hp = Number(topPokemonCard(opponent, root)?.hp) || 0;
    return Math.floor(Math.max(0, hp - (root.damage || 0) - step.hp) / 10) * 10;
  };
  const place = (root) => {
    const amount = countersToCap(root);
    if (amount === 0) return skip(ctx, 'already_at_cap');
    placeCounters(ctx, root, opponent.playerId, amount);
    return null;
  };
  if (step.target === 'opponentActive') {
    const active = activeOf(opponent);
    return active ? place(active) : skip(ctx, 'no_opponent_active');
  }
  const all = rootsOf(opponent).filter((root) => countersToCap(root) > 0);
  const candidates = all.filter((root) => !specialEnergyShielded(opponent, root));
  if (ctx.selection) {
    const root = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return root ? place(root) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, all.length > 0 ? 'effect_shield' : 'already_at_cap');
  if (candidates.length === 1) return place(candidates[0]);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose 1 of your opponent's Pokémon to put damage counters on`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

function atkMoveAllCounters(ctx) {
  const { player, opponent } = ctx;
  if (damageCounterMoveLocked(ctx)) return skip(ctx, 'damage_counter_move_locked');
  const target = activeOf(opponent);
  const sources = benchRootsOf(player).filter((c) => (c.damage || 0) > 0);
  const move = (from) => {
    const amount = from.damage || 0;
    from.damage = 0;
    ctx.events.push({ type: 'damageUpdated', instanceId: from.instanceId, damage: 0 });
    placeCounters(ctx, target, opponent.playerId, amount);
    return null;
  };
  if (!target) return skip(ctx, 'no_opponent_active');
  if (ctx.selection) {
    const from = sources.find((c) => c.instanceId === ctx.selection[0]);
    return from ? move(from) : skip(ctx, 'target_not_found');
  }
  if (sources.length === 0) return skip(ctx, 'no_damage_to_move');
  if (sources.length === 1) return move(sources[0]);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Benched Pokémon to move all damage counters from`,
    options: sources,
    min: 1,
    max: 1,
  });
}

// "Move 1 damage counter from 1 of your Pokémon to another of your Pokémon" (Reuniclus).
function atkMoveCounterBetween(ctx) {
  const { player, step } = ctx;
  if (damageCounterMoveLocked(ctx)) return skip(ctx, 'damage_counter_move_locked');
  const roots = rootsOf(player);
  // "from 1 of your Team Rocket's Pokémon": the source's name starts with the printed qualifier.
  const fromName = String(step.fromName || '').toLowerCase();
  const sources = roots.filter(
    (c) =>
      (c.damage || 0) > 0 &&
      (!fromName || String(topPokemonCard(player, c)?.name || '').toLowerCase().startsWith(fromName))
  );
  if (ctx.memo?.fromId != null) {
    const from = sources.find((c) => c.instanceId === ctx.memo.fromId);
    const to = roots.find((c) => c.instanceId === ctx.selection?.[0] && c.instanceId !== ctx.memo.fromId);
    if (!from || !to) return skip(ctx, 'target_not_found');
    const moved = Math.min(from.damage || 0, (step.count || 1) * 10);
    from.damage -= moved;
    ctx.events.push({ type: 'damageUpdated', instanceId: from.instanceId, damage: from.damage });
    placeCounters(ctx, to, player.playerId, moved);
    return null;
  }
  if (ctx.selection) {
    const from = sources.find((c) => c.instanceId === ctx.selection[0]);
    if (!from) return skip(ctx, 'target_not_found');
    return ctx.ask({
      prompt: `${attackName(ctx)}: Choose a Pokémon to move the damage counter to`,
      options: roots.filter((c) => c !== from),
      min: 1,
      max: 1,
      memo: { fromId: from.instanceId },
    });
  }
  if (sources.length === 0 || roots.length < 2) return skip(ctx, 'no_damage_to_move');
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Pokémon to move a damage counter from`,
    options: sources,
    min: 1,
    max: 1,
  });
}

// Gumshoos Evidence Gathering: a hand card and the deck's top card trade places.
function atkHandDeckTopSwap(ctx) {
  const { player } = ctx;
  const hand = player.zones.hand || [];
  const deck = player.zones.deck || [];
  if (ctx.selection) {
    const card = hand.find((c) => c.instanceId === ctx.selection[0]);
    if (!card || deck.length === 0) return skip(ctx, 'target_not_found');
    const top = deck.shift();
    hand.splice(hand.indexOf(card), 1, top);
    deck.unshift(card);
    ctx.events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'hand', to: 'deck', playerId: player.playerId });
    ctx.events.push({ type: 'cardMoved', instanceId: top.instanceId, from: 'deck', to: 'hand', playerId: player.playerId });
    return null;
  }
  if (hand.length === 0 || deck.length === 0) return skip(ctx, 'nothing_to_swap');
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a card from your hand to put on top of your deck`,
    options: hand,
    min: 1,
    max: 1,
  });
}

// Galarian Mr. Rime Shuffle Dance: a face-down Prize trades places with the deck's top card.
// `step.own` (Mr. Mime Pantomime, Rattata Trickery) swaps the user's own Prize instead.
function atkOpponentPrizeDeckSwap(ctx) {
  const owner = ctx.step.own ? ctx.player : ctx.opponent;
  const prizes = owner?.zones?.prizes || [];
  const deck = owner?.zones?.deck || [];
  if (ctx.selection) {
    const at = prizes.findIndex((c) => c.instanceId === ctx.selection[0]);
    if (at < 0 || deck.length === 0) return skip(ctx, 'target_not_found');
    const [prize] = prizes.splice(at, 1, deck.shift());
    deck.unshift(prize);
    ctx.events.push({ type: 'prizeSwapped', playerId: owner.playerId });
    return null;
  }
  if (prizes.length === 0 || deck.length === 0) return skip(ctx, 'nothing_to_swap');
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose 1 of ${ctx.step.own ? 'your' : "your opponent's"} face-down Prize cards`,
    // Identity only: Prize cards stay face down.
    options: prizes.map((c) => ({ instanceId: c.instanceId })),
    min: 1,
    max: 1,
  });
}

// The `ruleBox` filter on the Knock Out steps (design 036 A4), matching the
// `defenderRuleBox` vocabulary of attack-conditions.
const RULE_BOX_MATCHES = {
  basic: (card) => isBasicPokemon(card),
  ex: (card) => isExCard(card),
  tera: (card) => isTeraCard(card),
  radiant: (card) => isRadiantCard(card),
  mega: (card) => isMegaCard(card),
};

/** Remaining HP of an in-play Pokémon, counting Tools, Special Energy and Stadium bonuses. */
function remainingHp(ctx, owner, root) {
  const base = Number(topPokemonCard(owner, root)?.hp) || 0;
  if (!base) return 0;
  const ref = findCard(ctx.draft, root.instanceId);
  const zoneCards = ref?.player?.zones?.[ref.zoneId] || [];
  const hp = effectiveHp(base, owner.playerId, root, zoneCards, ctx.draft.stadium);
  return Math.max(0, hp - (root.damage || 0));
}

function knockOutConditionMet(ctx, owner, card, step) {
  switch (step.condition) {
    case null:
    case undefined:
      return true;
    case 'basic':
      return RULE_BOX_MATCHES.basic(topPokemonCard(owner, card));
    case 'specialCondition':
      return hasAnyCondition(card);
    case 'specialEnergy':
      return attachedCards(owner, card.instanceId).some(isSpecialEnergy);
    case 'maxRemainingHp': {
      const left = remainingHp(ctx, owner, card);
      return left > 0 && left <= step.maxRemainingHp;
    }
    case 'exactCounters':
      return (card.damage || 0) === step.counters * 10;
    default:
      return hasCondition(card, step.condition);
  }
}

/** Marks a Knock Out for the reducer's sweep; a self-Knock Out credits the opponent. */
function markKnockOut(ctx, owner, card) {
  ctx.events.push({
    type: 'knockOutMarked',
    instanceId: card.instanceId,
    victimPlayerId: owner.playerId,
    attackerPlayerId: owner.playerId === ctx.playerId ? ctx.opponent.playerId : ctx.playerId,
  });
}

function atkKnockOut(ctx) {
  const { opponent, step } = ctx;
  const target = activeOf(opponent);
  // Mist/Rocky/Wash/Wonder Energy: an automatic Knock Out from an attack effect is
  // prevented on the shielded Pokémon (Bring Down ruling), damage-only KOs are not.
  const shielded = Boolean(target) && specialEnergyShielded(opponent, target);
  if (step.scope === 'both') {
    // Annihilape Destined Fight / Forretress Double KO: both Active Pokémon go at once.
    const self = activeOf(ctx.player);
    if (!target || !self) return skip(ctx, 'no_active');
    if (!shielded) markKnockOut(ctx, opponent, target);
    markKnockOut(ctx, ctx.player, self);
    return null;
  }
  if (!target) return skip(ctx, 'no_opponent_active');
  if (shielded) return skip(ctx, 'effect_shield');
  if (!knockOutConditionMet(ctx, opponent, target, step)) return skip(ctx, 'condition_unmet');
  markKnockOut(ctx, opponent, target);
  return null;
}

// Glaceon ex Euclase / Lycanroc VMAX Hunting Claw: Knock Out 1 matching opponent's Pokémon.
// Alolan Exeggutor ex Swinging Sphene: 1 Benched Basic Pokémon (`scope: 'bench', basicOnly`).
// Inteleon/Greninja/Gardevoir LV.X Bring Down (`leastHp`): the lowest remaining HP among
// every Pokémon in play except the attacker. Noivern Radiant Hunt (`ruleBox: 'radiant'`).
function atkKnockOutChoose(ctx) {
  const { opponent, step } = ctx;
  const self = attackerRef(ctx)?.card || null;
  const candidates = [];
  for (const owner of step.leastHp ? [ctx.player, opponent] : [opponent]) {
    const roots = step.scope === 'bench' && !step.leastHp ? benchRootsOf(owner) : rootsOf(owner);
    for (const root of roots) {
      if (step.leastHp && self && root.instanceId === self.instanceId) continue;
      if (owner === opponent && specialEnergyShielded(owner, root)) continue;
      if (step.ruleBox && !RULE_BOX_MATCHES[step.ruleBox]?.(topPokemonCard(owner, root))) continue;
      if (step.basicOnly && !RULE_BOX_MATCHES.basic(topPokemonCard(owner, root))) continue;
      if (step.exactCounters != null && (root.damage || 0) !== step.exactCounters * 10) continue;
      if (step.maxRemainingHp != null) {
        const left = remainingHp(ctx, owner, root);
        if (left === 0 || left > step.maxRemainingHp) continue;
      }
      candidates.push({ owner, root });
    }
  }
  if (candidates.length === 0) return skip(ctx, 'condition_unmet');

  let pool = candidates;
  if (step.leastHp) {
    const remaining = (entry) => remainingHp(ctx, entry.owner, entry.root);
    const living = candidates.filter((entry) => remaining(entry) > 0);
    if (living.length === 0) return skip(ctx, 'no_target');
    const least = Math.min(...living.map(remaining));
    pool = living.filter((entry) => remaining(entry) === least);
  }

  const knockOut = ({ owner, root }) => {
    markKnockOut(ctx, owner, root);
    return null;
  };
  if (ctx.selection) {
    const picked = pool.find((entry) => entry.root.instanceId === ctx.selection[0]);
    return picked ? knockOut(picked) : skip(ctx, 'target_not_found');
  }
  if (pool.length === 1) return knockOut(pool[0]);
  return ctx.ask({
    prompt: step.leastHp
      ? `${attackName(ctx)}: Choose the Pokémon with the least remaining HP to Knock Out`
      : `${attackName(ctx)}: Choose 1 of your opponent's Pokémon to Knock Out`,
    options: pool.map((entry) => entry.root),
    min: 1,
    max: 1,
  });
}

// Miracle Powder / Delta Beam: the attacker picks 1 of the printed Special Conditions and it
// lands on the opponent's Active. Option ids are 1-based indexes into `step.options`.
function atkChooseCondition(ctx) {
  const { opponent, step } = ctx;
  const target = activeOf(opponent);
  if (!target) return skip(ctx, 'no_opponent_active');
  const conditions = step.options || [];
  if (ctx.selection) {
    const condition = conditions[Number(ctx.selection[0]) - 1];
    if (!condition) return skip(ctx, 'invalid_condition');
    const markers = liveAttackMarkers(target, {
      turnNumber: ctx.draft.turn?.number || 1,
      zoneCards: opponent.zones?.active || [],
    });
    if (markersBlockCondition(markers, condition)) return skip(ctx, 'status_immune');
    addCondition(target, condition);
    ctx.events.push({
      type: 'specialConditionUpdated',
      instanceId: target.instanceId,
      condition,
      conditions: listConditions(target),
    });
    return null;
  }
  if (conditions.length === 0) return skip(ctx, 'no_condition');
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Special Condition for your opponent's Active Pokémon`,
    options: conditions.map((name, i) => ({ instanceId: i + 1, name, type: 'option' })),
    min: 1,
    max: 1,
  });
}

function atkTakePrize(ctx) {
  const { player, step } = ctx;
  if ((player.zones.prizes || []).length === 0) return skip(ctx, 'no_prizes');
  if (!player.flags) player.flags = {};
  player.flags.prizesOwed = (player.flags.prizesOwed || 0) + (step.count || 1);
  ctx.events.push({ type: 'prizeEntitlementGranted', playerId: player.playerId, count: step.count || 1 });
  return null;
}

// ── devolve / heal ──────────────────────────────────────────────────────────

/** Moves the top evolution card of `root` to its owner's hand or deck. False when not evolved. */
function devolveRoot(ctx, owner, root, to) {
  const top = topPokemonCard(owner, root);
  if (!top || top === root) return false;
  removeFromZones(owner, top);
  top.attachedTo = null;
  (to === 'deck' ? owner.zones.deck : owner.zones.hand).push(top);
  clearConditions(root);
  ctx.events.push({
    type: 'pokemonDevolved',
    playerId: owner.playerId,
    instanceId: top.instanceId,
    targetInstanceId: root.instanceId,
  });
  // Damage stays on the devolved Pokémon; the sweep knocks it out if that is now lethal.
  ctx.events.push({
    type: 'damageCountersPlaced',
    instanceId: root.instanceId,
    victimPlayerId: owner.playerId,
    attackerPlayerId: ctx.playerId,
    damage: root.damage || 0,
  });
  return true;
}

// Unown Hidden Power: 1 evolved Pokémon of either player, its top card to its owner's hand.
function devolveChosen(ctx) {
  const sides = [ctx.player, ctx.opponent].filter(Boolean);
  const candidates = sides.flatMap((owner) =>
    rootsOf(owner)
      .filter((root) => topPokemonCard(owner, root) !== root)
      .map((root) => ({ owner, root }))
  );
  const devolve = ({ owner, root }) => {
    devolveRoot(ctx, owner, root, 'hand');
    return null;
  };
  if (ctx.selection) {
    const picked = candidates.find(({ root }) => root.instanceId === ctx.selection[0]);
    return picked ? devolve(picked) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'no_evolved_pokemon');
  if (candidates.length === 1) return devolve(candidates[0]);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose an evolved Pokémon to devolve`,
    options: candidates.map(({ root }) => root),
    min: 1,
    max: 1,
  });
}

function atkDevolve(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  if (step.scope === 'chooseAny') return devolveChosen(ctx);
  const roots = step.scope === 'active' ? [activeOf(opponent)].filter(Boolean) : rootsOf(opponent);
  let devolved = 0;
  for (const root of roots) {
    if (devolveRoot(ctx, opponent, root, step.to)) devolved++;
  }
  if (devolved === 0) return skip(ctx, 'no_evolved_pokemon');
  if (step.to === 'deck') shuffleOwnDeck(opponent, ctx);
  return null;
}

// Fan Rotom Spin Storm / Unown Hidden Power: the opponent's Active and everything attached go
// to their hand; they promote at the command tail. Without a Benched Pokémon nothing happens
// (Hidden Power prints it; Spin Storm is read the same so the effect never ends the game).
function atkBounceOppActive(ctx) {
  const { opponent } = ctx;
  const active = activeOf(opponent);
  if (!active) return skip(ctx, 'no_opponent_active');
  if (benchRootsOf(opponent).length === 0) return skip(ctx, 'no_opponent_bench');
  const stack = [active, ...attachedCards(opponent, active.instanceId)];
  for (const card of stack) {
    removeFromZones(opponent, card);
    card.attachedTo = null;
    card.damage = 0;
    clearConditions(card);
    clearAttackMarkers(card);
    opponent.zones.hand.push(card);
  }
  ctx.events.push({
    type: 'cardMoved',
    instanceId: active.instanceId,
    from: 'active',
    to: 'hand',
    playerId: opponent.playerId,
    reason: 'attack-bounce',
  });
  opponent.promotionPending = true;
  return null;
}

// Damage a heal step removes: `all`, `amount` (damage, older steps) or `count` counters.
function healLimit(step) {
  if (step.all) return Infinity;
  if (step.amount != null) return step.amount;
  return (step.count || 0) * 10;
}

/** Heals one Pokémon (and cures it for `cure`); returns whether anything changed. */
function healPokemon(ctx, card, limit, { cure = false } = {}) {
  let changed = false;
  const damage = card.damage || 0;
  const healed = Math.min(damage, limit);
  if (healed > 0) {
    card.damage = damage - healed;
    ctx.events.push({ type: 'damageUpdated', instanceId: card.instanceId, damage: card.damage, healed });
    changed = true;
  }
  if (cure && hasAnyCondition(card)) {
    clearConditions(card);
    ctx.events.push({ type: 'specialConditionUpdated', instanceId: card.instanceId, condition: null, conditions: [] });
    changed = true;
  }
  return changed;
}

// The printed filter on "each of your … Pokémon" / "1 of your … Pokémon".
function healFilterMatches(owner, root, step) {
  const top = topPokemonCard(owner, root) || root;
  if (step.basicOnly && !isBasicPokemon(top)) return false;
  if (step.pokemonType && !pokemonHasType(top, step.pokemonType)) return false;
  if (step.hasEnergy) {
    const energy = attachedCards(owner, root.instanceId).filter((c) =>
      energyMatches(c, { energyType: step.energyType })
    );
    if (energy.length === 0) return false;
  }
  return true;
}

function atkHealEach(ctx) {
  const { player, step } = ctx;
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  const owners = step.side === 'both' ? [player, ctx.opponent] : [player];
  let healedAny = false;
  for (const owner of owners) {
    const roots = step.scope === 'bench' ? benchRootsOf(owner) : rootsOf(owner);
    for (const card of roots) {
      if (!healFilterMatches(owner, card, step)) continue;
      if (healPokemon(ctx, card, healLimit(step))) healedAny = true;
    }
  }
  return healedAny ? null : skip(ctx, 'nothing_to_heal');
}

// "Remove N damage counters from this Pokémon / 1 of your Pokémon / your opponent's Active
// Pokémon" and the heads-counted forms (design 036 A6). A chosen target is offered only
// among damaged Pokémon; `distribute` heals one counter per pick until the count is spent.
function atkHealCounted(ctx) {
  const { player, opponent, step } = ctx;
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  const limit = healLimit(step);

  if (step.target === 'self' || step.target === 'opponentActive' || step.target === 'bothActive') {
    const targets = {
      self: [attackerRef(ctx)?.card],
      opponentActive: [activeOf(opponent)],
      bothActive: [activeOf(player), activeOf(opponent)],
    }[step.target].filter(Boolean);
    if (targets.length === 0) return skip(ctx, 'no_target');
    let changed = false;
    for (const card of targets) {
      if (healPokemon(ctx, card, limit, { cure: step.cure })) changed = true;
    }
    return changed ? null : skip(ctx, 'nothing_to_heal');
  }

  // `distribute` repeats one-counter picks; `targets` (default 1) picks distinct Pokémon.
  const distribute = step.target === 'distribute';
  const healedIds = ctx.memo?.healedIds || [];
  const damaged = (step.scope === 'bench' ? benchRootsOf(player) : rootsOf(player)).filter(
    (root) =>
      (root.damage || 0) > 0 &&
      healFilterMatches(player, root, step) &&
      (distribute || !healedIds.includes(root.instanceId))
  );
  const left = ctx.memo?.left ?? (distribute ? step.count || 0 : step.targets || 1);
  const perPick = distribute ? 10 : limit;
  const started = ctx.memo?.left != null;

  if (ctx.selection) {
    const picked = damaged.find((root) => root.instanceId === ctx.selection[0]);
    if (!picked) return skip(ctx, 'target_not_found');
    healPokemon(ctx, picked, perPick);
    if (left - 1 <= 0) return null;
    return atkHealCounted({
      ...ctx,
      selection: null,
      memo: { left: left - 1, healedIds: [...healedIds, picked.instanceId] },
    });
  }
  if (left <= 0 || damaged.length === 0) return started ? null : skip(ctx, 'nothing_to_heal');
  // No choice left: every remaining damaged Pokémon gets healed.
  if (!distribute && damaged.length <= left) {
    for (const root of damaged) healPokemon(ctx, root, perPick);
    return null;
  }
  return ctx.ask({
    prompt: distribute
      ? `${attackName(ctx)}: Choose a Pokémon to remove 1 damage counter from (${left} left)`
      : `${attackName(ctx)}: Choose 1 of your Pokémon to heal`,
    options: damaged,
    min: 1,
    max: 1,
    memo: { left, healedIds },
  });
}

const whatOf = (step) => energyLabel(step);

// "except any Simisage" arrives as SELF_NAME; the name is the attacker's at attack time.
function resolveSelfName(marker, ctx) {
  if (marker.filter?.exceptName !== SELF_NAME) return marker;
  const root = attackerRef(ctx)?.card;
  const name = String((root && topPokemonCard(ctx.player, root))?.name || '').toLowerCase();
  return { ...marker, filter: { ...marker.filter, exceptName: name } };
}

// Timed effect for a later turn (design 031): marks the attacker or the opponent's Active.
function atkAddMarker(ctx) {
  const { step } = ctx;
  const owner = step.target === 'opponentActive' ? ctx.opponent : ctx.player;
  const card =
    step.target === 'opponentActive' ? activeOf(ctx.opponent) : attackerRef(ctx)?.card;
  if (!card) return skip(ctx, 'no_marker_target');
  const turn = ctx.draft.turn?.number || 1;
  for (const marker of [step.marker, ...(step.alsoMarkers || [])]) {
    addAttackMarker(card, {
      ...resolveSelfName(marker, ctx),
      untilTurn: markerUntilTurn(step.window, turn),
      fromTurn: markerFromTurn(step.window, turn),
      topId: topPokemonCard(owner, card)?.instanceId ?? card.instanceId,
      sourceAttack: attackName(ctx),
    });
    ctx.events.push({
      type: 'attackMarkerAdded',
      kind: marker.kind,
      instanceId: card.instanceId,
      playerId: owner.playerId,
    });
  }
  return null;
}

// The marker a chained discard earns ("If you do, during your opponent's next turn, …").
function addChainedMarker(ctx) {
  if (!ctx.step.then) return null;
  return atkAddMarker({ ...ctx, step: { ...ctx.step.then, attackName: ctx.step.attackName } });
}

// Iron Treads ex Iron-Clad Roll: "you may discard all Future Booster Energy Capsules from
// this Pokémon. If you do, …". No matching Tool, or a declined discard, earns no marker.
function atkDiscardSelfTool(ctx) {
  const { player, step } = ctx;
  const ref = attackerRef(ctx);
  const wanted = String(step.toolName || '').toLowerCase();
  const tools = ref
    ? attachedCards(player, ref.card.instanceId).filter(
        (c) => isToolCard(c) && [wanted, `${wanted}s`].includes(String(c.name || '').toLowerCase())
      )
    : [];
  if (tools.length === 0) return skip(ctx, 'no_matching_tool');
  if (step.optional && !ctx.selection) {
    return ctx.ask({
      prompt: `${attackName(ctx)}: Discard ${tools.map((c) => c.name).join(', ')} from ${ref.card.name}?`,
      options: [
        { instanceId: ATTACK_YES, name: 'Yes', type: 'option' },
        { instanceId: ATTACK_NO, name: 'No', type: 'option' },
      ],
      min: 1,
      max: 1,
    });
  }
  if (step.optional && ctx.selection[0] !== ATTACK_YES) return skip(ctx, 'declined');
  discardCards(player, tools, ctx.events);
  return addChainedMarker(ctx);
}

// Flygon Desert Geyser: discard the opponent's Stadium; the marker needs that discard.
function atkDiscardStadium(ctx) {
  const stadium = ctx.draft.stadium;
  if (!stadium) return skip(ctx, 'no_stadium');
  const ownerId = stadium.ownerId || stadium.playerId || null;
  if (ctx.step.owner === 'opponent' && ownerId !== ctx.opponent?.playerId) return skip(ctx, 'not_opponent_stadium');
  discardCurrentStadium(ctx.draft, ctx.events, ctx.playerId);
  return addChainedMarker(ctx);
}

// Encore / Amnesia: the opponent's Active can use only (or can't use) the attack picked here
// during their next turn. One printed attack needs no question.
function atkLockAttack(ctx) {
  const { opponent, step } = ctx;
  const defender = activeOf(opponent);
  if (!defender) return skip(ctx, 'no_opponent_active');
  const attacks = (topPokemonCard(opponent, defender)?.attacks || []).filter((a) => a?.name);
  const lock = (attack) =>
    atkAddMarker({
      ...ctx,
      step: {
        attackName: step.attackName,
        target: 'opponentActive',
        window: 'opponentNextTurn',
        marker: { kind: 'attackLock', mode: step.mode, attackName: attack.name },
      },
    });
  if (ctx.selection) {
    const attack = attacks[Number(ctx.selection[0]) - 1];
    return attack ? lock(attack) : skip(ctx, 'target_not_found');
  }
  if (attacks.length === 0) return skip(ctx, 'no_attacks');
  if (attacks.length === 1) return lock(attacks[0]);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose 1 of ${defender.name}'s attacks`,
    options: attacks.map((a, i) => ({ instanceId: i + 1, name: a.name, type: 'option' })),
    min: 1,
    max: 1,
  });
}

function shuffleHandCardIntoDeck(ctx, owner, card) {
  moveToZone(owner, card, 'deck', 'hand', ctx.events);
  shuffleOwnDeck(owner, ctx);
}

// Unown T Hidden Power: the attacker picks 1 card from the opponent's hand for their deck,
// then the opponent picks 1 card from the attacker's hand for the attacker's deck. An empty
// hand skips only its own half.
function atkHandCardsToDecks(ctx) {
  const { player, opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const askOwnHand = () => {
    const hand = player.zones.hand || [];
    if (hand.length === 0) return skip(ctx, 'empty_hand');
    ctx.events.push({ type: 'cardsRevealed', playerId: player.playerId, cards: hand.map(revealedCard) });
    return ctx.ask({
      player: opponent.playerId,
      prompt: `${attackName(ctx)}: Choose 1 card from your opponent's hand to shuffle into their deck`,
      options: hand,
      min: 1,
      max: 1,
      memo: { ownHand: true },
    });
  };
  if (ctx.selection && ctx.memo?.ownHand) {
    const card = (player.zones.hand || []).find((c) => c.instanceId === ctx.selection[0]);
    if (card) shuffleHandCardIntoDeck(ctx, player, card);
    return null;
  }
  if (ctx.selection) {
    const card = (opponent.zones.hand || []).find((c) => c.instanceId === ctx.selection[0]);
    if (card) shuffleHandCardIntoDeck(ctx, opponent, card);
    return askOwnHand();
  }
  const oppHand = opponent.zones.hand || [];
  if (oppHand.length === 0) return askOwnHand();
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose 1 card from your opponent's hand to shuffle into their deck`,
    options: oppHand,
    min: 1,
    max: 1,
  });
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

// Inkay: look at the opponent's top card and may have them shuffle. Gothorita: put the top
// N back in any order, one pick per position from the top; the last card needs no pick.
function atkLookOppDeck(ctx) {
  const { opponent, step } = ctx;
  const deck = opponent?.zones?.deck || [];
  const viewed = deck.slice(0, step.count || 1);
  if (viewed.length === 0) return skip(ctx, 'empty_deck');
  if (step.offerShuffle) {
    if (ctx.selection) {
      if (ctx.selection[0] === ATTACK_YES) shuffleOwnDeck(opponent, ctx);
      return null;
    }
    ctx.events.push({ type: 'cardsLookedAt', playerId: ctx.playerId, count: viewed.length });
    return ctx.ask({
      prompt: `${attackName(ctx)}: The top card of your opponent's deck is ${viewed.map((c) => c.name).join(', ')}. Have your opponent shuffle their deck?`,
      options: [
        { instanceId: ATTACK_YES, name: 'Yes', type: 'option' },
        { instanceId: ATTACK_NO, name: 'No', type: 'option' },
      ],
      min: 1,
      max: 1,
    });
  }
  const order = [...(ctx.memo?.order || []), ...(ctx.selection || []).slice(0, 1)].filter((id) =>
    viewed.some((c) => c.instanceId === id)
  );
  const remaining = viewed.filter((c) => !order.includes(c.instanceId));
  if (!ctx.selection) ctx.events.push({ type: 'cardsLookedAt', playerId: ctx.playerId, count: viewed.length });
  if (remaining.length > 1) {
    return ctx.ask({
      prompt: `${attackName(ctx)}: Choose the card to put ${ORDINALS[order.length] || `${order.length + 1}th`} from the top of your opponent's deck`,
      options: remaining,
      min: 1,
      max: 1,
      memo: { order },
    });
  }
  const ordered = [...order.map((id) => viewed.find((c) => c.instanceId === id)), ...remaining];
  deck.splice(0, viewed.length, ...ordered);
  ctx.events.push({ type: 'deckReordered', playerId: opponent.playerId, count: ordered.length });
  return null;
}

// ── design 036 D executors ──────────────────────────────────────────────────

// "Move all damage counters from each of your Pokémon to your opponent's Active Pokémon":
// the source (when one is chosen) first, then the target (when more than one can take them).
function atkMoveCounterToOpponent(ctx) {
  const { player, opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const attacker = attackerRef(ctx)?.card;
  const pool =
    step.from === 'self' ? [attacker].filter(Boolean) : step.from === 'bench' ? benchRootsOf(player) : rootsOf(player);
  const sources = pool.filter((c) => (c.damage || 0) > 0);
  const targets = (step.to === 'active' ? [activeOf(opponent)].filter(Boolean) : rootsOf(opponent)).filter(
    (c) => !specialEnergyShielded(opponent, c)
  );
  const chooseSource = step.from === 'one' || step.from === 'bench';

  let fromIds = ctx.memo?.fromIds;
  if (!fromIds && ctx.memo?.stage === 'from') fromIds = (ctx.selection || []).slice(0, 1);
  if (!fromIds) {
    if (sources.length === 0) return skip(ctx, 'no_damage_to_move');
    if (targets.length === 0) return skip(ctx, 'no_opponent_pokemon');
    if (chooseSource && sources.length > 1) {
      return ctx.ask({
        prompt: `${attackName(ctx)}: Choose a Pokémon to move damage counters from`,
        options: sources,
        min: 1,
        max: 1,
        memo: { stage: 'from' },
      });
    }
    fromIds = (chooseSource ? sources.slice(0, 1) : sources).map((c) => c.instanceId);
  }
  let target = targets.length === 1 ? targets[0] : null;
  if (!target && ctx.memo?.stage === 'to') target = targets.find((c) => c.instanceId === ctx.selection?.[0]);
  if (!target) {
    return ctx.ask({
      prompt: `${attackName(ctx)}: Choose 1 of your opponent's Pokémon to move the damage counters to`,
      options: targets,
      min: 1,
      max: 1,
      memo: { stage: 'to', fromIds },
    });
  }
  let moved = 0;
  for (const from of sources.filter((c) => fromIds.includes(c.instanceId))) {
    const amount = step.count === 'all' ? from.damage || 0 : Math.min(from.damage || 0, (step.count || 1) * 10);
    from.damage -= amount;
    moved += amount;
    ctx.events.push({ type: 'damageUpdated', instanceId: from.instanceId, damage: from.damage });
  }
  if (moved > 0) placeCounters(ctx, target, opponent.playerId, moved);
  return null;
}

// "Look at the top N cards of your / either player's deck and put them back in any order."
function atkLookDeckReorder(ctx) {
  const { player, opponent, step } = ctx;
  let side = ctx.memo?.side || (step.side === 'either' ? null : step.side);
  let selection = ctx.selection;
  if (!side) {
    if (!ctx.memo?.pickingSide) {
      return ctx.ask({
        prompt: `${attackName(ctx)}: Look at the top of which deck?`,
        options: [
          { instanceId: ATTACK_YES, name: 'Your deck', type: 'option' },
          { instanceId: ATTACK_NO, name: "Your opponent's deck", type: 'option' },
        ],
        min: 1,
        max: 1,
        memo: { pickingSide: true },
      });
    }
    side = selection?.[0] === ATTACK_YES ? 'self' : 'opponent';
    selection = null;
  }
  const owner = side === 'self' ? player : opponent;
  const deck = owner?.zones?.deck || [];
  const viewed = deck.slice(0, step.count || 1);
  if (viewed.length === 0) return skip(ctx, 'empty_deck');
  const order = [...(ctx.memo?.order || []), ...(selection || []).slice(0, 1)].filter((id) =>
    viewed.some((c) => c.instanceId === id)
  );
  const remaining = viewed.filter((c) => !order.includes(c.instanceId));
  if (order.length === 0) ctx.events.push({ type: 'cardsLookedAt', playerId: ctx.playerId, count: viewed.length });
  if (remaining.length > 1) {
    return ctx.ask({
      prompt: `${attackName(ctx)}: Choose the card to put ${ORDINALS[order.length] || `${order.length + 1}th`} from the top of the deck`,
      options: remaining,
      min: 1,
      max: 1,
      memo: { order, side },
    });
  }
  const ordered = [...order.map((id) => viewed.find((c) => c.instanceId === id)), ...remaining];
  deck.splice(0, viewed.length, ...ordered);
  ctx.events.push({ type: 'deckReordered', playerId: owner.playerId, count: ordered.length });
  return null;
}

// "For each of your Benched Pokémon, search your deck for a {P} Energy card and attach it to
// that Pokémon" / "attach a Basic {F} Energy card from your discard pile to each of your Benched
// Pokémon". Energy of one type is interchangeable, so each Pokémon takes the next match.
function atkAttachEachBench(ctx) {
  const { player, step } = ctx;
  const bench = benchRootsOf(player);
  if (bench.length === 0) return skip(ctx, 'no_bench_pokemon');
  let chosen = bench;
  if (step.max && bench.length > step.max) {
    if (!ctx.selection) {
      return ctx.ask({
        prompt: `${attackName(ctx)}: Choose up to ${step.max} of your Benched Pokémon`,
        options: bench,
        min: 0,
        max: step.max,
      });
    }
    chosen = pickById(bench, ctx.selection).slice(0, step.max);
  }
  const zone = step.source === 'deck' ? player.zones.deck : player.zones.discard;
  const pool = (zone || []).filter((c) => energyMatches(c, step));
  for (const root of chosen) {
    const energy = pool.shift();
    if (!energy) break;
    attachTo(player, energy, root, ctx.events);
  }
  if (step.source === 'deck') shuffleOwnDeck(player, ctx);
  return null;
}

function atkShuffleFromDiscard(ctx) {
  const { player, step } = ctx;
  const candidates = (player.zones.discard || []).filter((c) =>
    step.what === 'energy' ? energyMatches(c, step) : !step.what || matchesSearch(c, step.what)
  );
  const toDeck = (cards) => {
    for (const card of cards) moveToZone(player, card, 'deck', 'discard', ctx.events);
    shuffleOwnDeck(player, ctx);
    return null;
  };
  if (ctx.selection) return toDeck(pickById(candidates, ctx.selection).slice(0, step.count || 1));
  if (candidates.length === 0) return skip(ctx, 'nothing_to_shuffle');
  const max = Math.min(step.count || 1, candidates.length);
  if (!step.upTo && candidates.length <= max) return toDeck(candidates);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${step.upTo ? 'up to ' : ''}${max} card(s) to shuffle into your deck`,
    options: candidates,
    min: step.upTo ? 0 : max,
    max,
  });
}

/** A Pokémon and every card attached to it, shuffled into its owner's deck. */
function shuffleStackIntoDeck(ctx, owner, root, from) {
  const stack = [root, ...attachedCards(owner, root.instanceId)];
  for (const card of stack) {
    removeFromZones(owner, card);
    card.attachedTo = null;
    card.damage = 0;
    clearConditions(card);
    clearAttackMarkers(card);
    owner.zones.deck.push(card);
  }
  ctx.events.push({ type: 'cardMoved', instanceId: root.instanceId, from, to: 'deck', playerId: owner.playerId });
  shuffleOwnDeck(owner, ctx);
}

function atkShuffleOppActive(ctx) {
  const { opponent } = ctx;
  const active = opponent ? activeOf(opponent) : null;
  if (!active) return skip(ctx, 'no_opponent_active');
  shuffleStackIntoDeck(ctx, opponent, active, 'active');
  return null;
}

function atkShuffleOwnBench(ctx) {
  const { player } = ctx;
  const bench = benchRootsOf(player);
  if (ctx.selection) {
    const root = bench.find((c) => c.instanceId === ctx.selection[0]);
    if (root) shuffleStackIntoDeck(ctx, player, root, 'bench');
    return null;
  }
  if (bench.length === 0) return skip(ctx, 'no_bench_pokemon');
  if (bench.length === 1) {
    shuffleStackIntoDeck(ctx, player, bench[0], 'bench');
    return null;
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Benched Pokémon to shuffle into your deck`,
    options: bench,
    min: 1,
    max: 1,
  });
}

function atkOppShuffleHandDraw(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const hand = opponent.zones.hand;
  opponent.zones.deck.push(...hand.splice(0, hand.length));
  shuffleOwnDeck(opponent, ctx);
  const drawn = opponent.zones.deck.splice(0, Math.min(step.count || 0, opponent.zones.deck.length));
  hand.push(...drawn);
  ctx.events.push({
    type: 'cardsDrawn',
    count: drawn.length,
    playerId: opponent.playerId,
    cards: drawn.map((c) => ({ instanceId: c.instanceId })),
  });
  return null;
}

// ── design 036 E ────────────────────────────────────────────────────────────

const isSupporterCard = (card) => matchesSearch(card, 'supporter');

// Where an atkUseSupporter step looks, and whose zone the card is in.
function supporterSource(ctx) {
  const { player, opponent, step } = ctx;
  switch (step.source) {
    case 'hand':
      return { owner: player, zone: 'hand' };
    case 'discard':
      return { owner: player, zone: 'discard' };
    case 'deck':
    case 'deckTop':
      return { owner: player, zone: 'deck' };
    case 'oppHand':
      return { owner: opponent, zone: 'hand' };
    default:
      return { owner: opponent, zone: 'discard' };
  }
}

/** Runs the chosen Supporter's printed effect as this attack's next steps. */
function useSupporterEffect(ctx, owner, card) {
  if (ctx.step.discard && ctx.step.source !== 'discard' && ctx.step.source !== 'oppDiscard') {
    discardCards(owner, [card], ctx.events);
  }
  if (ctx.step.source === 'deck') shuffleOwnDeck(owner, ctx);
  const steps = parseTrainerEffect(card.text || card.effect || card.cardText || '')?.steps || [];
  ctx.events.push({
    type: 'supporterEffectUsed',
    playerId: ctx.playerId,
    instanceId: card.instanceId,
    name: card.name,
    stepCount: steps.length,
  });
  if (steps.length > 0) ctx.insertSteps(steps);
  return null;
}

// "Use the effect of that Supporter card as the effect of this attack" (Mimikyu Impersonation,
// Oranguru Primate Acting, Ninetales Supernatural Shapeshifter, Mr. Mime Look-Alike Show).
function atkUseSupporter(ctx) {
  const { step } = ctx;
  const { owner, zone } = supporterSource(ctx);
  if (!owner) return skip(ctx, 'no_opponent');
  const cards = owner.zones[zone] || [];
  if (step.source === 'deckTop') {
    const top = cards[0];
    if (!top) return skip(ctx, 'empty_deck');
    if (!isSupporterCard(top)) {
      discardCards(owner, [top], ctx.events);
      return null;
    }
    return useSupporterEffect(ctx, owner, top);
  }
  const candidates = cards.filter(isSupporterCard);
  if (ctx.selection) {
    const chosen = candidates.find((c) => c.instanceId === ctx.selection[0]);
    if (!chosen) {
      if (step.source === 'deck') shuffleOwnDeck(owner, ctx);
      return null;
    }
    return useSupporterEffect(ctx, owner, chosen);
  }
  if (step.source === 'oppHand') {
    ctx.events.push({ type: 'cardsLookedAt', playerId: ctx.playerId, count: cards.length });
  }
  if (candidates.length === 0) {
    if (step.source === 'deck') shuffleOwnDeck(owner, ctx);
    return skip(ctx, 'no_supporter');
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose a Supporter card whose effect this attack uses`,
    options: candidates,
    min: step.optional ? 0 : 1,
    max: 1,
  });
}

// "For the rest of this game, …": kept on the attacking player (read by reduce).
function atkRestOfGame(ctx) {
  const { player, step } = ctx;
  player.restOfGame = [...(player.restOfGame || []), step.effect];
  ctx.events.push({ type: 'restOfGameEffect', playerId: player.playerId, effect: step.effect });
  return null;
}

export const ATTACK_STEP_HANDLERS = {
  atkSwitchSelf: optional(atkSwitchSelf, () => 'Switch this Pokémon with 1 of your Benched Pokémon'),
  atkGust: optional(atkGust, () => "Switch out your opponent's Active Pokémon"),
  atkMoveEnergy: optional(atkMoveEnergy, (step) => `Move ${whatOf(step)}`),
  atkDiscardSelfEnergy,
  atkDiscardOppEnergy: optional(atkDiscardOppEnergy, (step) => `Discard ${whatOf(step)} from your opponent's Pokémon`),
  atkDiscardBothActiveEnergy: optional(
    atkDiscardBothActiveEnergy,
    () => 'Discard all Energy from both Active Pokémon'
  ),
  atkDiscardOppTools: optional(atkDiscardOppTools, () => "Discard Pokémon Tools from your opponent's Pokémon"),
  atkDiscardOppHand: optional(atkDiscardOppHand, () => "Discard from your opponent's hand"),
  atkDiscardOwnHand: optional(atkDiscardOwnHand, (step) =>
    step.count === 'all' ? 'Discard your hand' : `Discard ${step.count === 'any' ? 'cards' : `${step.count} card(s)`} from your hand`
  ),
  atkLostZoneFromHand: optional(atkLostZoneFromHand, () => 'Put a card from your hand in the Lost Zone'),
  atkLostZoneOppHandRandom,
  atkMoveCounterToOpponent,
  atkLookDeckReorder,
  atkAttachEachBench,
  atkShuffleFromDiscard: optional(atkShuffleFromDiscard, () => 'Shuffle cards from your discard pile into your deck'),
  atkShuffleOppActive,
  atkShuffleOwnBench,
  atkOppShuffleHandDraw,
  atkUseSupporter,
  atkRestOfGame,
  atkLostZoneOppDiscard,
  atkLostZoneSelf,
  atkLostZoneOppActive,
  atkDiscardHandEnergy: optional(atkDiscardHandEnergy, (step) => `Discard ${energyLabel(step)} from your hand`),
  atkMill: optional(atkMill, (step) => `Discard the top ${step.count || 1} card(s) of the deck`),
  atkAttach: optional(atkAttach, (step) => `Attach ${whatOf(step)} from your ${step.source === 'hand' ? 'hand' : 'discard pile'}`),
  atkBenchFromDeckTop: atkBenchFromDeckTop,
  atkBenchFromDiscard: optional(atkBenchFromDiscard, () => 'Put Pokémon from your discard pile onto your Bench'),
  atkRecover: optional(atkRecover, (step) => `Put ${step.what || 'a card'} from your discard pile into your hand`),
  atkShuffleSelf: optional(atkShuffleSelf, () => 'Shuffle this Pokémon and all attached cards into your deck'),
  returnSelfToDeckAbility,
  atkLostZoneDeckTop,
  atkLostZoneEnergy,
  atkLostZoneFromDiscard,
  atkCureSelf,
  atkMirrorHeal,
  atkLookTopTake,
  atkShuffleOppBench,
  atkOppHandRandomToDeck,
  atkRevealOppHand,
  atkShuffleHandIntoDeck,
  atkDraw,
  atkShuffleOppActiveEnergy,
  atkShuffleOppEnergy: optional(
    atkShuffleOppEnergy,
    () => "Shuffle all Energy from your opponent's Pokémon into their deck"
  ),
  atkShuffleOppDeck: optional(atkShuffleOppDeck, () => "Have your opponent shuffle their deck"),
  atkKnockOutChoose,
  atkCountersEach,
  atkCountersEachFiltered,
  atkDoubleCountersEach,
  atkHpCap,
  atkMoveAllCounters: optional(atkMoveAllCounters, () => 'Move damage counters'),
  atkMoveCounterBetween,
  atkHandDeckTopSwap,
  atkOpponentPrizeDeckSwap,
  atkKnockOut,
  atkKnockOutAll,
  atkTakePrize,
  atkChooseCondition,
  atkDevolve,
  atkBounceOppActive,
  atkHealEach,
  atkHealCounted,
  atkAddMarker,
  atkDiscardSelfTool,
  atkDiscardStadium,
  atkLockAttack,
  atkHandCardsToDecks,
  atkLookOppDeck,
};
