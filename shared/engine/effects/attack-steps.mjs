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
import { isEnergy, isPokemon } from '../cards.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { clearConditions, hasAnyCondition, hasCondition } from '../rules/special-conditions.mjs';
import { stadiumBlocksHealing } from '../rules/stadium-effects.mjs';
import { shuffleInPlace } from '../rng.mjs';
import { addAttackMarker, markerFromTurn, markerUntilTurn, SELF_NAME } from '../rules/attack-markers.mjs';
import {
  BENCH_LIMIT,
  activeOf,
  attachTo,
  attachedCards,
  benchRootsOf,
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
function swapActive(player, active, benchRoot, events) {
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
  clearConditions(active);
  events.push({
    type: 'cardSwitched',
    playerId: player.playerId,
    activeId: active.instanceId,
    benchId: benchRoot.instanceId,
  });
}

function discardCards(player, cards, events) {
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
  });
}

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

// ── switch / gust ───────────────────────────────────────────────────────────

function atkSwitchSelf(ctx) {
  const { player } = ctx;
  const ref = attackerRef(ctx);
  if (!ref || ref.zoneId !== 'active') return skip(ctx, 'attacker_not_active');
  const bench = benchRootsOf(player);
  if (ctx.selection) {
    const root = bench.find((c) => c.instanceId === ctx.selection[0]);
    if (root) swapActive(player, ref.card, root, ctx.events);
    return null;
  }
  if (bench.length === 0) return skip(ctx, 'no_bench_pokemon');
  if (bench.length === 1) {
    swapActive(player, ref.card, bench[0], ctx.events);
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
  if (ctx.selection) {
    const root = bench.find((c) => c.instanceId === ctx.selection[0]);
    if (active && root) swapActive(opponent, active, root, ctx.events);
    return null;
  }
  if (!active || bench.length === 0) return skip(ctx, 'no_opponent_bench');
  if (bench.length === 1) {
    swapActive(opponent, active, bench[0], ctx.events);
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
  if (step.from === 'any') {
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

// ── discard from the opponent ───────────────────────────────────────────────

function opponentRootsInScope(opponent, scope) {
  if (scope === 'active') return [activeOf(opponent)].filter(Boolean);
  return rootsOf(opponent);
}

// Discards the chosen cards, or with `toOwnerHand` returns them to their owner's hand
// (Samurott Aqua Wash: "put 2 Energy attached to your opponent's Active Pokémon into their hand").
function discardChosen(ctx, cards, options) {
  const { step } = ctx;
  const remove = (card) =>
    options.toOwnerHand
      ? moveToZone(options.toOwnerHand, card, 'hand', 'inPlay', ctx.events)
      : discardCard(ctx.draft, card, ctx.events);
  if (ctx.selection) {
    for (const card of pickById(cards, ctx.selection)) remove(card);
    return null;
  }
  if (cards.length === 0) return skip(ctx, 'nothing_to_discard');
  if (step.all || (!step.upTo && cards.length <= (step.count || 1))) {
    for (const card of cards) remove(card);
    return null;
  }
  const max = Math.min(step.count || 1, cards.length);
  const verb = options.toOwnerHand ? "return to your opponent's hand" : 'discard';
  return ctx.ask({
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
  return discardChosen(ctx, energies, { label: energyLabel(step), toOwnerHand: step.toHand ? opponent : null });
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
    discardCards(player, picked, ctx.events);
    return null;
  }
  if (candidates.length < count) return skip(ctx, 'not_enough_energy');
  if (candidates.length === count) {
    discardCards(player, candidates, ctx.events);
    return null;
  }
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${count} ${energyLabel(step)} card${count === 1 ? '' : 's'} to discard from your hand`,
    options: candidates,
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
  if (step.target === 'bench') return benchRootsOf(player).filter((c) => c !== attacker);
  return rootsOf(player);
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

function atkRecover(ctx) {
  const { player, step } = ctx;
  const candidates = (player.zones.discard || []).filter((c) => matchesSearch(c, step.what));
  const toHand = (cards) => {
    for (const card of cards) moveToZone(player, card, 'hand', 'discard', ctx.events);
    return null;
  };
  if (ctx.selection) return toHand(pickById(candidates, ctx.selection));
  if (candidates.length === 0) return skip(ctx, 'nothing_to_recover');
  const max = Math.min(step.count || 1, candidates.length);
  const min = step.upTo ? 0 : max;
  if (min === max && max === candidates.length) return toHand(candidates);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${min === max ? max : `up to ${max}`} ${step.what} card${max === 1 ? '' : 's'} to put into your hand`,
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

const REVEAL_ACTION_ZONE = { deckBottom: 'deck', prize: 'prizes' };

function applyRevealAction(ctx, cards) {
  const { opponent, step } = ctx;
  const zone = REVEAL_ACTION_ZONE[step.then.action];
  if (!zone) {
    discardCards(opponent, cards, ctx.events);
    return null;
  }
  // Deck index 0 is the top, so a push puts the card on the bottom.
  for (const card of cards) moveToZone(opponent, card, zone, 'hand', ctx.events);
  return null;
}

// "Your opponent reveals their hand." plus an optional follow-up on the revealed cards
// (discard / bottom of deck / face-down Prize). Damage that counts the revealed cards is
// the damage parser's, read from the same hand.
function atkRevealOppHand(ctx) {
  const { opponent, step } = ctx;
  const hand = opponent?.zones?.hand;
  if (!hand) return skip(ctx, 'no_opponent');
  const matching = step.then?.filter ? hand.filter((c) => matchesSearch(c, step.then.filter)) : [...hand];
  if (ctx.selection && step.then) return applyRevealAction(ctx, pickById(matching, ctx.selection).slice(0, step.then.count));
  ctx.events.push({ type: 'cardsRevealed', playerId: opponent.playerId, cards: hand.map(revealedCard) });
  if (!step.then) return null;
  if (matching.length === 0) return skip(ctx, 'no_matching_card');
  if (step.then.count === 'all' || matching.length <= step.then.count) return applyRevealAction(ctx, matching);
  const kind = step.then.filter ? `${step.then.filter[0].toUpperCase()}${step.then.filter.slice(1)} ` : '';
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose ${step.then.count} ${kind}card(s) from your opponent's hand`,
    options: matching,
    min: step.then.count,
    max: step.then.count,
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
  if (!step.anyNumber && candidates.length <= (step.count || 1)) {
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

// ── damage counters / Knock Out ─────────────────────────────────────────────

function placeCounters(ctx, card, victimPlayerId, amount) {
  card.damage = (card.damage || 0) + amount;
  ctx.events.push({ type: 'damageUpdated', instanceId: card.instanceId, damage: card.damage });
  ctx.events.push({
    type: 'damageCountersPlaced',
    instanceId: card.instanceId,
    victimPlayerId,
    attackerPlayerId: ctx.playerId,
    damage: card.damage,
  });
}

function atkCountersEach(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const targets = step.scope === 'bench' ? benchRootsOf(opponent) : rootsOf(opponent);
  if (targets.length === 0) return skip(ctx, 'no_target');
  for (const card of targets) placeCounters(ctx, card, opponent.playerId, (step.count || 1) * 10);
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
  const candidates = rootsOf(opponent).filter((root) => countersToCap(root) > 0);
  if (ctx.selection) {
    const root = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return root ? place(root) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'already_at_cap');
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
function atkOpponentPrizeDeckSwap(ctx) {
  const { opponent } = ctx;
  const prizes = opponent?.zones?.prizes || [];
  const deck = opponent?.zones?.deck || [];
  if (ctx.selection) {
    const at = prizes.findIndex((c) => c.instanceId === ctx.selection[0]);
    if (at < 0 || deck.length === 0) return skip(ctx, 'target_not_found');
    const [prize] = prizes.splice(at, 1, deck.shift());
    deck.unshift(prize);
    ctx.events.push({ type: 'prizeSwapped', playerId: opponent.playerId });
    return null;
  }
  if (prizes.length === 0 || deck.length === 0) return skip(ctx, 'nothing_to_swap');
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose 1 of your opponent's face-down Prize cards`,
    // Identity only: Prize cards stay face down.
    options: prizes.map((c) => ({ instanceId: c.instanceId })),
    min: 1,
    max: 1,
  });
}

function knockOutConditionMet(card, step) {
  switch (step.condition) {
    case null:
    case undefined:
      return true;
    case 'specialCondition':
      return hasAnyCondition(card);
    case 'exactCounters':
      return (card.damage || 0) === step.counters * 10;
    default:
      return hasCondition(card, step.condition);
  }
}

function atkKnockOut(ctx) {
  const { opponent, step } = ctx;
  const target = activeOf(opponent);
  if (!target) return skip(ctx, 'no_opponent_active');
  if (!knockOutConditionMet(target, step)) return skip(ctx, 'condition_unmet');
  ctx.events.push({
    type: 'knockOutMarked',
    instanceId: target.instanceId,
    victimPlayerId: opponent.playerId,
    attackerPlayerId: ctx.playerId,
  });
  return null;
}

// Glaceon ex Euclase / Lycanroc VMAX Hunting Claw: Knock Out 1 matching opponent's Pokémon.
function atkKnockOutChoose(ctx) {
  const { opponent, step } = ctx;
  const matches = (root) => {
    const damage = root.damage || 0;
    if (step.exactCounters != null) return damage === step.exactCounters * 10;
    const hp = Number(topPokemonCard(opponent, root)?.hp) || 0;
    return hp > 0 && hp - damage <= step.maxRemainingHp;
  };
  const candidates = rootsOf(opponent).filter(matches);
  const knockOut = (root) => {
    ctx.events.push({
      type: 'knockOutMarked',
      instanceId: root.instanceId,
      victimPlayerId: opponent.playerId,
      attackerPlayerId: ctx.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const root = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return root ? knockOut(root) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'condition_unmet');
  if (candidates.length === 1) return knockOut(candidates[0]);
  return ctx.ask({
    prompt: `${attackName(ctx)}: Choose 1 of your opponent's Pokémon to Knock Out`,
    options: candidates,
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

function atkDevolve(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const roots = step.scope === 'active' ? [activeOf(opponent)].filter(Boolean) : rootsOf(opponent);
  let devolved = 0;
  for (const root of roots) {
    const top = topPokemonCard(opponent, root);
    if (!top || top === root) continue;
    removeFromZones(opponent, top);
    top.attachedTo = null;
    (step.to === 'deck' ? opponent.zones.deck : opponent.zones.hand).push(top);
    clearConditions(root);
    devolved++;
    ctx.events.push({
      type: 'pokemonDevolved',
      playerId: opponent.playerId,
      instanceId: top.instanceId,
      targetInstanceId: root.instanceId,
    });
    // Damage stays on the devolved Pokémon; the sweep knocks it out if that is now lethal.
    ctx.events.push({
      type: 'damageCountersPlaced',
      instanceId: root.instanceId,
      victimPlayerId: opponent.playerId,
      attackerPlayerId: ctx.playerId,
      damage: root.damage || 0,
    });
  }
  if (devolved === 0) return skip(ctx, 'no_evolved_pokemon');
  if (step.to === 'deck') shuffleOwnDeck(opponent, ctx);
  return null;
}

function atkHealEach(ctx) {
  const { player, step } = ctx;
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  const roots = step.scope === 'bench' ? benchRootsOf(player) : rootsOf(player);
  let healedAny = false;
  for (const card of roots) {
    const damage = card.damage || 0;
    if (damage === 0) continue;
    const healed = step.all ? damage : Math.min(damage, step.amount || 0);
    card.damage = damage - healed;
    healedAny = true;
    ctx.events.push({ type: 'damageUpdated', instanceId: card.instanceId, damage: card.damage, healed });
  }
  return healedAny ? null : skip(ctx, 'nothing_to_heal');
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
  addAttackMarker(card, {
    ...resolveSelfName(step.marker, ctx),
    untilTurn: markerUntilTurn(step.window, turn),
    fromTurn: markerFromTurn(step.window, turn),
    topId: topPokemonCard(owner, card)?.instanceId ?? card.instanceId,
    sourceAttack: attackName(ctx),
  });
  ctx.events.push({
    type: 'attackMarkerAdded',
    kind: step.marker.kind,
    instanceId: card.instanceId,
    playerId: owner.playerId,
  });
  return null;
}

export const ATTACK_STEP_HANDLERS = {
  atkSwitchSelf: optional(atkSwitchSelf, () => 'Switch this Pokémon with 1 of your Benched Pokémon'),
  atkGust: optional(atkGust, () => "Switch out your opponent's Active Pokémon"),
  atkMoveEnergy: optional(atkMoveEnergy, (step) => `Move ${whatOf(step)}`),
  atkDiscardOppEnergy: optional(atkDiscardOppEnergy, (step) => `Discard ${whatOf(step)} from your opponent's Pokémon`),
  atkDiscardOppTools: optional(atkDiscardOppTools, () => "Discard Pokémon Tools from your opponent's Pokémon"),
  atkDiscardOppHand: optional(atkDiscardOppHand, () => "Discard from your opponent's hand"),
  atkDiscardHandEnergy,
  atkMill: optional(atkMill, (step) => `Discard the top ${step.count || 1} card(s) of the deck`),
  atkAttach: optional(atkAttach, (step) => `Attach ${whatOf(step)} from your ${step.source === 'hand' ? 'hand' : 'discard pile'}`),
  atkBenchFromDeckTop: atkBenchFromDeckTop,
  atkBenchFromDiscard: optional(atkBenchFromDiscard, () => 'Put Pokémon from your discard pile onto your Bench'),
  atkRecover: optional(atkRecover, (step) => `Put ${step.what} from your discard pile into your hand`),
  atkShuffleSelf: optional(atkShuffleSelf, () => 'Shuffle this Pokémon and all attached cards into your deck'),
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
  atkShuffleOppDeck: optional(atkShuffleOppDeck, () => "Have your opponent shuffle their deck"),
  atkKnockOutChoose,
  atkCountersEach,
  atkHpCap,
  atkMoveAllCounters: optional(atkMoveAllCounters, () => 'Move damage counters'),
  atkMoveCounterBetween,
  atkHandDeckTopSwap,
  atkOpponentPrizeDeckSwap,
  atkKnockOut,
  atkTakePrize,
  atkDevolve,
  atkHealEach,
  atkAddMarker,
};
