/**
 * @file Server-side handlers for the trainer-effect step kinds that executor.mjs's core switch
 * does not cover (I35). Each handler mutates the draft, pushes events, and either finishes
 * (returns null) or asks for a choice (returns ctx.ask(...)). Multi-choice steps keep their
 * progress in `ctx.memo`, which the executor persists in the PendingChoice resume token.
 * Pure and DOM-free: randomness only through ctx.activeRng (Invariant 6).
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { shuffleInPlace } from '../rng.mjs';
import { isEnergy, isPokemon, isTrainer } from '../cards.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { classifyEnergyEffect } from '../rules/energy-effects.mjs';
import { normalizeStage } from '../rules/evolution.mjs';
import {
  addCondition,
  clearConditions,
  copyConditions,
  hasAnyCondition,
} from '../rules/special-conditions.mjs';
import {
  topPokemonCard as topOfStack,
  rareCandyOptions,
  ownedCards,
} from '../rules/evolved-pokemon.mjs';
import { discardCurrentStadium } from './trainer.mjs';
import { resolveSpecialEnergyDiscard } from './special-energy.mjs';
import { abilityCounterMoveLock } from '../rules/ability-combat.mjs';

export const BENCH_LIMIT = 5;

// ── card and zone helpers ────────────────────────────────────────────────

function textOf(card, field) {
  const value = card?.[field];
  return (Array.isArray(value) ? value.join(' ') : String(value || '')).toLowerCase();
}

export function isToolCard(card) {
  const kind = `${textOf(card, 'type')} ${textOf(card, 'trainerType')} ${textOf(card, 'subtypes')}`;
  return kind.includes('tool');
}

export function isStadiumCard(card) {
  const kind = `${textOf(card, 'type')} ${textOf(card, 'trainerType')} ${textOf(card, 'subtypes')}`;
  return kind.includes('stadium');
}

export function isBasicEnergy(card) {
  return isEnergy(card) && classifyEnergyEffect(card) === 'basic';
}

/**
 * Patrat CR: "Damage counters on each Pokémon … can't be moved to other
 * Pokémon." True when the board forbids counter movement, for any handler
 * that moves counters between Pokémon.
 */
export function damageCounterMoveLocked(ctx = {}) {
  return abilityCounterMoveLock({
    sideCards: [
      ...(ctx.player?.zones?.active || []),
      ...(ctx.player?.zones?.bench || []),
    ],
    opponentSideCards: [
      ...(ctx.opponent?.zones?.active || []),
      ...(ctx.opponent?.zones?.bench || []),
    ],
  });
}

export function isSpecialEnergy(card) {
  return isEnergy(card) && !isBasicEnergy(card);
}

export function stageOf(card) {
  return normalizeStage(card?.stage) || 'Basic';
}

export function rootsOf(player) {
  return [...(player?.zones?.active || []), ...(player?.zones?.bench || [])].filter(
    (c) => !c.attachedTo
  );
}

export function activeOf(player) {
  return (player?.zones?.active || []).find((c) => !c.attachedTo) || null;
}

export function benchRootsOf(player) {
  return (player?.zones?.bench || []).filter((c) => !c.attachedTo);
}

export function attachedCards(player, rootId) {
  return [...(player?.zones?.active || []), ...(player?.zones?.bench || [])].filter(
    (c) => c.attachedTo === rootId
  );
}

export function topPokemonCard(player, root) {
  return topOfStack([...(player?.zones?.active || []), ...(player?.zones?.bench || [])], root);
}

function zoneIdOf(player, card) {
  if ((player.zones.active || []).includes(card)) return 'active';
  if ((player.zones.bench || []).includes(card)) return 'bench';
  return null;
}

export function removeFromZones(player, card) {
  for (const zone of Object.values(player?.zones || {})) {
    if (!Array.isArray(zone)) continue;
    const i = zone.indexOf(card);
    if (i >= 0) {
      zone.splice(i, 1);
      return true;
    }
  }
  return false;
}

function ownerOf(draft, card) {
  const ref = findCard(draft, card.instanceId);
  return ref ? draft.players[ref.playerId] : null;
}

export function discardCard(draft, card, events) {
  const owner = ownerOf(draft, card);
  if (!owner) return;
  // Special-energy on-discard triggers: Recycle Energy returns to hand, while
  // Boomerang/Burning Energy stay attached when discarded by their own attack.
  if (isEnergy(card) && card.attachedTo != null) {
    const host = findCard(draft, card.attachedTo)?.card;
    const hostRef = host ? findCard(draft, host.instanceId) : null;
    const resolution = resolveSpecialEnergyDiscard(draft, {
      energy: card,
      host,
      hostTop: host ? topPokemonCard(hostRef?.player, host) : null,
      hostPlayerId: hostRef?.playerId,
      hostZoneId: hostRef?.zoneId,
      events,
    });
    if (resolution === 'reattach') return;
    if (resolution === 'hand') {
      removeFromZones(owner, card);
      card.attachedTo = null;
      owner.zones.hand.push(card);
      events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: hostRef?.zoneId,
        to: 'hand',
        playerId: owner.playerId,
      });
      return;
    }
  }
  removeFromZones(owner, card);
  card.attachedTo = null;
  discardCardToPlayerZone(owner, card);
  events.push({
    type: 'cardsDiscarded',
    playerId: owner.playerId,
    cards: [{ instanceId: card.instanceId, name: card.name }],
  });
}

export function attachTo(player, card, root, events) {
  removeFromZones(player, card);
  card.attachedTo = root.instanceId;
  player.zones[zoneIdOf(player, root)].push(card);
  events.push({
    type: 'cardAttached',
    instanceId: card.instanceId,
    targetInstanceId: root.instanceId,
    playerId: player.playerId,
  });
}

function drawCards(player, count, events) {
  const deck = player.zones.deck || [];
  const drawn = deck.splice(0, Math.max(0, Math.min(count, deck.length)));
  player.zones.hand.push(...drawn);
  events.push({
    type: 'cardsDrawn',
    count: drawn.length,
    playerId: player.playerId,
    cards: drawn.map((c) => ({ instanceId: c.instanceId })),
  });
}

export function shuffleDeck(player, ctx) {
  if (ctx.activeRng) shuffleInPlace(ctx.activeRng, player.zones.deck);
  ctx.events.push({ type: 'deckShuffled', playerId: player.playerId });
}

function handToDeckBottom(player, ctx) {
  const hand = player.zones.hand.splice(0);
  if (hand.length === 0) return 0;
  if (ctx.activeRng) shuffleInPlace(ctx.activeRng, hand);
  player.zones.deck.push(...hand);
  ctx.events.push({ type: 'cardsMovedToDeckBottom', count: hand.length, playerId: player.playerId });
  return hand.length;
}

export function pickById(cards, selection) {
  const ids = new Set(selection || []);
  return cards.filter((c) => ids.has(c.instanceId));
}

export function skip(ctx, reason) {
  ctx.events.push({ type: 'effectStepSkipped', reason, step: ctx.step.type });
  return null;
}

export function sourceName(ctx, fallback) {
  return ctx.sourceCard?.name || fallback;
}

// "1 of your Benched {D} Pokémon", "1 of your Stage 2 Pokémon", ... → root filter.
export function rootMatchesTarget(player, root, target = '') {
  const t = String(target).toLowerCase();
  if (t.includes('benched') && zoneIdOf(player, root) !== 'bench') return false;
  if (t.includes('active') && !t.includes('benched') && zoneIdOf(player, root) !== 'active') {
    return false;
  }
  const top = topPokemonCard(player, root);
  if (t.includes('stage 2') && stageOf(top) !== 'Stage 2') return false;
  if (t.includes('evolved') && top === root) return false;
  if (t.includes('mega evolution') && !/^mega .* ex$/i.test(top.name || '')) return false;
  const typed = t.match(/\{([a-z])\}/);
  if (typed && typed[1] !== 'c') return pokemonHasType(top, typed[1]);
  return true;
}

const SYMBOL_TYPES = {
  g: 'grass', r: 'fire', w: 'water', l: 'lightning', p: 'psychic',
  f: 'fighting', d: 'darkness', m: 'metal', n: 'dragon', y: 'fairy',
};

export function pokemonHasType(card, symbol) {
  const wanted = SYMBOL_TYPES[symbol];
  if (!wanted) return false;
  return (card.types || []).some((type) => {
    const t = String(type).toLowerCase();
    return t === wanted || (wanted === 'darkness' && t === 'dark');
  });
}

// ── step handlers ────────────────────────────────────────────────────────

const RULE_BOX_NAME = /(?:\b(?:ex|gx|v|vmax|vstar|v-union)|-ex|-gx)$/i;

function handEnergyMatches(card, spec = {}) {
  if (!isEnergy(card)) return false;
  if (spec.basic && !isBasicEnergy(card)) return false;
  if (spec.special && !isSpecialEnergy(card)) return false;
  if (spec.name && !String(card.name || '').toLowerCase().includes(spec.name)) return false;
  const types = spec.types || [];
  if (types.length === 0) return true;
  const kind = String(card.energyType || card.name || '').toLowerCase();
  return types.some((type) => kind.includes(type.toLowerCase()));
}

// Pokémon a hand-attach ability may target: the printed phrase ("1 of your Benched {R}
// Pokémon", "your Active Larry's Pokémon", "1 of your Latios", "… that doesn't have a Rule Box").
function handAttachTargets(ctx) {
  const { player, step, sourceCard } = ctx;
  const phrase = String(step.handTarget || '');
  if (/^this pok/.test(phrase)) return rootsOf(player).filter((c) => c.instanceId === sourceCard?.instanceId);
  const owner = phrase.match(/([a-z]+)'s pok/)?.[1];
  const attackName = phrase.match(/that has the (.+?) attack/)?.[1];
  const bareName = phrase.match(/^(?:1|one) of your ([^{}]+)$/)?.[1];
  return rootsOf(player).filter((root) => {
    if (!rootMatchesTarget(player, root, phrase)) return false;
    const top = topPokemonCard(player, root);
    const name = String(top?.name || '').toLowerCase();
    if (owner && !name.startsWith(`${owner}'s`)) return false;
    if (/doesn't have a rule box/.test(phrase) && RULE_BOX_NAME.test(name)) return false;
    if (attackName && !(top?.attacks || []).some((a) => String(a?.name || '').toLowerCase() === attackName)) {
      return false;
    }
    if (bareName && !/pok[eé]mon/.test(bareName) && !name.includes(bareName.trim())) return false;
    return true;
  });
}

// "Once during your turn, you may attach a Basic {R} Energy card from your hand to 1 of your
// Benched {R} Pokémon" (Quaquaval, Ethan's Ho-Oh ex, Infernape …): pick the Energy, then the
// Pokémon (once per card when the text says "in any way you like").
function attachFromHand(ctx) {
  const { player, step } = ctx;
  const energies = () => (player.zones.hand || []).filter((c) => handEnergyMatches(c, step.handEnergy));
  const targets = handAttachTargets(ctx);
  const askTarget = (energyIds) => {
    const next = energies().find((c) => c.instanceId === energyIds[0]);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: Choose a Pokémon to attach ${step.handAttachEach && next ? next.name : 'the Energy'} to`,
      options: targets,
      min: 1,
      max: 1,
      memo: { phase: 'target', energyIds },
    });
  };

  if (ctx.memo?.phase === 'target') {
    const root = targets.find((c) => c.instanceId === ctx.selection?.[0]);
    if (!root) return skip(ctx, 'target_not_found');
    const pending = ctx.memo.energyIds || [];
    const batch = step.handAttachEach ? pending.slice(0, 1) : pending;
    for (const card of energies().filter((c) => batch.includes(c.instanceId))) {
      attachTo(player, card, root, ctx.events);
    }
    const remaining = step.handAttachEach
      ? pending.slice(1).filter((id) => energies().some((c) => c.instanceId === id))
      : [];
    return remaining.length > 0 ? askTarget(remaining) : null;
  }

  if (ctx.selection) {
    let picked = energies().filter((c) => ctx.selection.includes(c.instanceId));
    // "a Basic {R} Energy card, a Basic {F} Energy card, or 1 of each": at most one per type.
    if ((step.handEnergy?.types || []).length > 1) {
      picked = step.handEnergy.types
        .map((type) => picked.find((c) => handEnergyMatches(c, { types: [type] })))
        .filter(Boolean);
    }
    if (picked.length === 0) return skip(ctx, 'no_energy_selected');
    if (targets.length === 0) return skip(ctx, 'no_attach_target');
    if (targets.length === 1) {
      for (const card of picked) attachTo(player, card, targets[0], ctx.events);
      return null;
    }
    return askTarget(picked.map((c) => c.instanceId));
  }

  const candidates = energies();
  if (candidates.length === 0 || targets.length === 0) return skip(ctx, 'no_energy_or_target');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose Energy from your hand to attach`,
    options: candidates,
    min: 1,
    max: Math.min(step.handCount || 1, candidates.length),
    memo: {},
  });
}

function opponentDraw(ctx) {
  if (!ctx.opponent) return skip(ctx, 'no_opponent');
  drawCards(ctx.opponent, ctx.step.count || 1, ctx.events);
  return null;
}

function putHandOnBottom(ctx) {
  const { player, step } = ctx;
  const hand = player.zones.hand;
  if (ctx.selection) {
    const chosen = pickById(hand, ctx.selection);
    for (const card of chosen) removeFromZones(player, card);
    player.zones.deck.push(...chosen);
    ctx.events.push({ type: 'cardsMovedToDeckBottom', count: chosen.length, playerId: player.playerId });
    return null;
  }
  const count = Math.min(step.count || 1, hand.length);
  if (count === 0) return skip(ctx, 'empty_hand');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Put ${count} card${count > 1 ? 's' : ''} from your hand on the bottom of your deck`,
    options: hand,
    min: count,
    max: count,
  });
}

function putHandOnTop(ctx) {
  const { player, step } = ctx;
  const hand = player.zones.hand;
  if (ctx.selection) {
    const chosen = pickById(hand, ctx.selection);
    for (const card of chosen) removeFromZones(player, card);
    player.zones.deck.unshift(...chosen);
    ctx.events.push({ type: 'cardsMovedToDeckTop', count: chosen.length, playerId: player.playerId });
    return null;
  }
  const count = Math.min(step.count || 1, hand.length);
  if (count === 0) return skip(ctx, 'empty_hand');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Put ${count} card${count > 1 ? 's' : ''} from your hand on top of your deck`,
    options: hand,
    min: count,
    max: count,
  });
}

function opponentShuffleHandDraw(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const moved = handToDeckBottom(opponent, ctx);
  if (moved > 0) drawCards(opponent, step.count || 3, ctx.events);
  return null;
}

function opponentCountShuffleDraw(ctx) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const moved = handToDeckBottom(opponent, ctx);
  if (moved > 0) drawCards(opponent, moved, ctx.events);
  return null;
}

function countShuffleDrawPlus(ctx) {
  const { player } = ctx;
  const count = player.zones.hand.length;
  player.zones.deck.push(...player.zones.hand.splice(0));
  shuffleDeck(player, ctx);
  drawCards(player, count + 1, ctx.events);
  return null;
}

function millSelf(ctx) {
  const { player, step } = ctx;
  const milled = player.zones.deck.splice(0, step.count || 1);
  for (const card of milled) discardCardToPlayerZone(player, card);
  ctx.events.push({
    type: 'cardsDiscarded',
    playerId: player.playerId,
    cards: milled.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  return null;
}

function reshufflePrizes(ctx) {
  const { player } = ctx;
  const count = player.zones.prizes.length;
  player.zones.deck.push(...player.zones.prizes.splice(0));
  shuffleDeck(player, ctx);
  player.zones.prizes.push(...player.zones.deck.splice(0, count));
  ctx.events.push({ type: 'prizesReset', playerId: player.playerId, count: player.zones.prizes.length });
  return null;
}

function variableDraw(ctx) {
  const { player, opponent, step } = ctx;
  let count = 0;
  if (step.source === 'ancientInPlay') {
    count = rootsOf(player).filter((root) =>
      textOf(topPokemonCard(player, root), 'subtypes').includes('ancient')
    ).length;
  } else if (step.source === 'opponentBench') {
    count = benchRootsOf(opponent).length;
  } else if (step.source === 'opponentHandPokemon') {
    const hand = opponent?.zones?.hand || [];
    ctx.events.push({
      type: 'cardsRevealed',
      playerId: opponent?.playerId,
      cards: hand.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
    count = hand.filter(isPokemon).length;
  } else if (step.source === 'opponentHandTrainer') {
    const hand = opponent?.zones?.hand || [];
    ctx.events.push({
      type: 'cardsRevealed',
      playerId: opponent?.playerId,
      cards: hand.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
    // Stadiums and Tools are Trainer cards too, whichever field carries the kind.
    count = hand.filter((c) => isTrainer(c) || isStadiumCard(c) || isToolCard(c)).length;
  } else if (step.source === 'opponentBenchBasic') {
    count = benchRootsOf(opponent).filter((root) => stageOf(topPokemonCard(opponent, root)) === 'Basic').length;
  } else if (step.source === 'opponentPokemonInPlay') {
    count = rootsOf(opponent).length;
  } else if (step.source === 'allBench') {
    count = benchRootsOf(player).length + benchRootsOf(opponent).length;
  } else if (step.source === 'opponentMegaExInPlay') {
    count = rootsOf(opponent).filter((root) =>
      /^mega .* ex$/i.test(topPokemonCard(opponent, root).name || '')
    ).length;
  }
  drawCards(player, count, ctx.events);
  return null;
}

// Look at the top/bottom N cards, optionally take one matching card, shuffle the rest back.
function lookAtDeckEnd(ctx, fromBottom) {
  const { player, step } = ctx;
  const deck = player.zones.deck;
  const count = Math.min(step.count || 7, deck.length);
  const viewed = fromBottom ? deck.slice(deck.length - count) : deck.slice(0, count);
  const pick = String(step.pick || 'any');

  if (ctx.memo?.phase === 'attachTarget') {
    const energy = deck.find((c) => c.instanceId === ctx.memo.energyId);
    const root = rootsOf(player).find((c) => c.instanceId === ctx.selection?.[0]);
    if (energy && root) attachTo(player, energy, root, ctx.events);
    return finishLook(ctx, viewed);
  }

  if (ctx.selection) {
    const chosen = pickById(viewed, ctx.selection);
    if (pick === 'discard') {
      for (const card of chosen) {
        removeFromZones(player, card);
        discardCardToPlayerZone(player, card);
      }
      ctx.events.push({
        type: 'cardsDiscarded',
        playerId: player.playerId,
        cards: chosen.map((c) => ({ instanceId: c.instanceId, name: c.name })),
      });
      return null;
    }
    const card = chosen[0];
    if (card && pick.startsWith('Basic Energy')) {
      const roots = rootsOf(player);
      if (roots.length === 1) {
        attachTo(player, card, roots[0], ctx.events);
        return finishLook(ctx, viewed);
      }
      return ctx.ask({
        prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon to attach ${card.name} to`,
        options: roots,
        min: 1,
        max: 1,
        memo: { phase: 'attachTarget', energyId: card.instanceId },
      });
    }
    if (card) {
      removeFromZones(player, card);
      const toBench = step.destination === 'bench';
      (toBench ? player.zones.bench : player.zones.hand).push(card);
      ctx.events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'deck', to: toBench ? 'bench' : 'hand', playerId: player.playerId });
      ctx.events.push({ type: 'cardsRevealed', playerId: player.playerId, cards: [{ instanceId: card.instanceId, name: card.name }] });
    }
    return finishLook(ctx, viewed);
  }

  if (count === 0) return skip(ctx, 'empty_deck');
  if (pick === 'discard') {
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Discard any number of the ${fromBottom ? 'bottom' : 'top'} ${count} cards of your deck`,
      options: viewed,
      min: 0,
      max: count,
    });
  }
  const benchFull = step.destination === 'bench' && benchRootsOf(player).length >= BENCH_LIMIT;
  const matches = benchFull ? [] : viewed.filter((card) => lookPickMatches(card, pick));
  if (matches.length === 0) {
    ctx.events.push({ type: 'cardsLookedAt', playerId: player.playerId, count });
    return finishLook(ctx, viewed);
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: You may take ${pick === 'any' ? 'a card' : `a ${pick}`} from the ${fromBottom ? 'bottom' : 'top'} ${count} cards of your deck`,
    options: matches,
    min: 0,
    max: 1,
  });
}

function lookPickMatches(card, pick) {
  if (pick === 'any') return true;
  if (pick === 'Supporter') return matchesSearch(card, 'Supporter');
  if (pick.startsWith('Basic Energy')) return isBasicEnergy(card);
  if (pick.startsWith('Darkness Pokémon')) {
    return isPokemon(card) && stageOf(card) === 'Basic' && pokemonHasType(card, 'd');
  }
  if (pick === 'Pokémon') return isPokemon(card);
  return matchesSearch(card, pick);
}

function finishLook(ctx, viewed) {
  const { player, step } = ctx;
  if (!step.restToBottom) {
    shuffleDeck(player, ctx);
    return null;
  }
  // Grimsley's Move: the looked-at cards left in the deck are shuffled onto its bottom.
  const deck = player.zones.deck;
  const rest = viewed.filter((card) => deck.includes(card));
  for (const card of rest) deck.splice(deck.indexOf(card), 1);
  if (ctx.activeRng) shuffleInPlace(ctx.activeRng, rest);
  deck.push(...rest);
  ctx.events.push({ type: 'cardsMovedToDeckBottom', count: rest.length, playerId: player.playerId });
  return null;
}

function searchDeckSequence(ctx) {
  const { player, step } = ctx;
  const stages = step.stages || [];
  let stageIndex = ctx.memo?.stageIndex ?? 0;

  if (ctx.selection) {
    for (const card of pickById(player.zones.deck, ctx.selection)) {
      removeFromZones(player, card);
      player.zones.hand.push(card);
      ctx.events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'deck', to: 'hand', playerId: player.playerId });
      ctx.events.push({ type: 'cardsRevealed', playerId: player.playerId, cards: [{ instanceId: card.instanceId, name: card.name }] });
    }
    stageIndex += 1;
  }

  for (; stageIndex < stages.length; stageIndex++) {
    const stage = stages[stageIndex];
    const matches = player.zones.deck.filter((c) => matchesSearch(c, stage.what));
    if (matches.length === 0) continue;
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Search')}: Select up to 1 ${stage.what} from your deck`,
      options: matches,
      min: 0,
      max: 1,
      memo: { stageIndex },
    });
  }
  shuffleDeck(player, ctx);
  return null;
}

// Rare Candy: a Stage 2 from hand onto a Basic in play, skipping Stage 1.
function evolveStage2(ctx) {
  const { player } = ctx;
  const turnNumber = ctx.draft?.turn?.number;
  const options = rareCandyOptions(player, ownedCards(player), turnNumber);
  const optionFor = (stage2Id) => options.find((option) => option.stage2.instanceId === stage2Id);

  if (ctx.memo?.phase === 'basic') {
    const option = optionFor(ctx.memo.stage2Id);
    const basic = option?.basics.find((c) => c.instanceId === ctx.selection?.[0]);
    if (!option || !basic) return skip(ctx, 'target_not_found');
    const stage2 = option.stage2;
    attachTo(player, stage2, basic, ctx.events);
    if (turnNumber != null) {
      stage2.enteredPlayTurn = turnNumber;
      basic.lastEvolvedTurn = turnNumber;
    }
    clearConditions(basic);
    if (!player.flags) player.flags = {};
    if (!player.flags.evolved) player.flags.evolved = {};
    player.flags.evolved[basic.instanceId] = true;
    ctx.events.push({ type: 'pokemonEvolved', playerId: player.playerId, instanceId: stage2.instanceId, targetInstanceId: basic.instanceId });
    return null;
  }

  if (ctx.selection) {
    const option = optionFor(ctx.selection[0]);
    if (!option) return skip(ctx, 'target_not_found');
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Rare Candy')}: Choose the Basic Pokémon ${option.stage2.name} evolves from`,
      options: option.basics,
      min: 1,
      max: 1,
      memo: { phase: 'basic', stage2Id: option.stage2.instanceId },
    });
  }

  if (options.length === 0) return skip(ctx, 'no_stage2_or_basic');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Rare Candy')}: Choose a Stage 2 card from your hand`,
    options: options.map((option) => option.stage2),
    min: 1,
    max: 1,
  });
}

// Energy Switch: move a Basic Energy between your own Pokémon.
function moveEnergy(ctx) {
  const { player } = ctx;
  const roots = rootsOf(player);

  if (ctx.memo?.phase === 'target') {
    const energy = attachedCards(player, ctx.memo.fromId).find((c) => c.instanceId === ctx.memo.energyId);
    const target = roots.find((c) => c.instanceId === ctx.selection?.[0]);
    if (!energy || !target) return skip(ctx, 'target_not_found');
    attachTo(player, energy, target, ctx.events);
    return null;
  }

  if (ctx.selection) {
    const energy = roots
      .flatMap((root) => attachedCards(player, root.instanceId))
      .find((c) => c.instanceId === ctx.selection[0]);
    if (!energy) return skip(ctx, 'target_not_found');
    const targets = roots.filter((c) => c.instanceId !== energy.attachedTo);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Energy Switch')}: Choose a Pokémon to move ${energy.name} to`,
      options: targets,
      min: 1,
      max: 1,
      memo: { phase: 'target', energyId: energy.instanceId, fromId: energy.attachedTo },
    });
  }

  const energies = roots.flatMap((root) => attachedCards(player, root.instanceId)).filter(isBasicEnergy);
  if (energies.length === 0 || roots.length < 2) return skip(ctx, 'no_energy_to_move');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Energy Switch')}: Choose a Basic Energy to move`,
    options: energies,
    min: 1,
    max: 1,
  });
}

function moveEnergyToActive(ctx) {
  const { player, step } = ctx;
  const active = activeOf(player);
  if (!active) return skip(ctx, 'no_active');
  if (step.activeName) {
    const name = String(topPokemonCard(player, active)?.name || '').toLowerCase();
    if (!name.includes(String(step.activeName).toLowerCase())) {
      return skip(ctx, 'active_name_mismatch');
    }
  }
  const benchEnergy = benchRootsOf(player)
    .flatMap((root) => attachedCards(player, root.instanceId))
    .filter(isEnergy);

  if (ctx.selection) {
    for (const energy of pickById(benchEnergy, ctx.selection)) {
      attachTo(player, energy, active, ctx.events);
    }
    return null;
  }
  if (benchEnergy.length === 0) return skip(ctx, 'no_bench_energy');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Move up to ${step.count || 2} Energy from your Benched Pokémon to your Active Pokémon`,
    options: benchEnergy,
    min: 0,
    max: Math.min(step.count || 2, benchEnergy.length),
  });
}

function devolve(ctx) {
  const { player, step } = ctx;
  const evolved = rootsOf(player).filter((root) => rootMatchesTarget(player, root, step.target));

  if (ctx.selection) {
    const root = evolved.find((c) => c.instanceId === ctx.selection[0]);
    if (!root) return skip(ctx, 'target_not_found');
    const top = topPokemonCard(player, root);
    removeFromZones(player, top);
    top.attachedTo = null;
    player.zones.hand.push(top);
    ctx.events.push({ type: 'pokemonDevolved', playerId: player.playerId, instanceId: top.instanceId, targetInstanceId: root.instanceId });
    return null;
  }
  if (evolved.length === 0) return skip(ctx, 'no_evolved_pokemon');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Devolve')}: Choose an evolved Pokémon to devolve`,
    options: evolved,
    min: 1,
    max: 1,
  });
}

function allAttachedMatching(ctx, players, predicate) {
  return players
    .filter(Boolean)
    .flatMap((p) => rootsOf(p).flatMap((root) => attachedCards(p, root.instanceId)))
    .filter(predicate);
}

function discardTools(ctx) {
  const tools = allAttachedMatching(ctx, [ctx.player, ctx.opponent], isToolCard);
  if (ctx.selection) {
    for (const tool of pickById(tools, ctx.selection)) discardCard(ctx.draft, tool, ctx.events);
    return null;
  }
  if (tools.length === 0) return skip(ctx, 'no_tools_in_play');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Tool Scrapper')}: Choose up to ${ctx.step.count || 2} Pokémon Tools to discard`,
    options: tools,
    min: 0,
    max: Math.min(ctx.step.count || 2, tools.length),
  });
}

// Blowtorch-style: a Tool or Special Energy on an opponent's Pokémon, or the Stadium in play.
function discardFromOpponent(ctx) {
  const options = allAttachedMatching(ctx, [ctx.opponent], (c) => isToolCard(c) || isSpecialEnergy(c));
  const includeStadium = /stadium/i.test(ctx.step.target || '') && ctx.draft.stadium;
  if (includeStadium) options.push(ctx.draft.stadium);

  if (ctx.selection) {
    const id = ctx.selection[0];
    if (ctx.draft.stadium?.instanceId === id) {
      discardCurrentStadium(ctx.draft, ctx.events, ctx.playerId);
      return null;
    }
    const card = options.find((c) => c.instanceId === id);
    if (card) discardCard(ctx.draft, card, ctx.events);
    return null;
  }
  if (options.length === 0) return skip(ctx, 'nothing_to_discard');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a card to discard`,
    options,
    min: 1,
    max: 1,
  });
}

function massDiscardAttached(ctx) {
  const cards = allAttachedMatching(ctx, [ctx.opponent], (c) => isToolCard(c) || isSpecialEnergy(c));
  for (const card of cards) discardCard(ctx.draft, card, ctx.events);
  if (ctx.draft.stadium) discardCurrentStadium(ctx.draft, ctx.events, ctx.playerId);
  return null;
}

function discardToolAndSpecialEnergy(ctx) {
  const { opponent } = ctx;
  const candidates = rootsOf(opponent).filter((root) =>
    attachedCards(opponent, root.instanceId).some((c) => isToolCard(c) || isSpecialEnergy(c))
  );

  const discardFrom = (root) => {
    const attached = attachedCards(opponent, root.instanceId);
    const tool = attached.find(isToolCard);
    const energy = attached.find(isSpecialEnergy);
    if (tool) discardCard(ctx.draft, tool, ctx.events);
    if (energy) discardCard(ctx.draft, energy, ctx.events);
  };

  if (ctx.selection) {
    const root = candidates.find((c) => c.instanceId === ctx.selection[0]);
    if (root) discardFrom(root);
    return null;
  }
  if (candidates.length === 0) return skip(ctx, 'nothing_to_discard');
  if (candidates.length === 1) {
    discardFrom(candidates[0]);
    return null;
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose 1 of your opponent's Pokémon`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

function discardEnergyFromOpponent(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const matchesEnergy = step.energy === 'Special Energy' ? isSpecialEnergy : isEnergy;

  if (step.scope === 'each Pokémon') {
    for (const root of rootsOf(opponent)) {
      const energy = attachedCards(opponent, root.instanceId).find(matchesEnergy);
      if (energy) discardCard(ctx.draft, energy, ctx.events);
    }
    return null;
  }

  const energies = allAttachedMatching(ctx, [opponent], matchesEnergy);
  if (ctx.selection) {
    const energy = energies.find((c) => c.instanceId === ctx.selection[0]);
    if (!energy) return skip(ctx, 'target_not_found');
    if (step.action === 'returnToHand') {
      removeFromZones(opponent, energy);
      energy.attachedTo = null;
      opponent.zones.hand.push(energy);
      ctx.events.push({ type: 'cardMoved', instanceId: energy.instanceId, from: 'inPlay', to: 'hand', playerId: opponent.playerId });
    } else {
      discardCard(ctx.draft, energy, ctx.events);
    }
    return null;
  }
  if (energies.length === 0) return skip(ctx, 'no_opponent_energy');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose an Energy attached to your opponent's Pokémon`,
    options: energies,
    min: 1,
    max: 1,
  });
}

// Saffron City Gym: return a Basic Energy attached to a qualifying Pokémon to hand.
function returnOwnAttachedEnergy(ctx) {
  const { player, step } = ctx;
  const nameFilter = String(step.nameContains || '').toLowerCase();
  const attached = rootsOf(player)
    .filter(
      (root) =>
        !nameFilter ||
        String(topPokemonCard(player, root)?.name || '')
          .toLowerCase()
          .includes(nameFilter)
    )
    .flatMap((root) => attachedCards(player, root.instanceId))
    .filter((c) => isEnergy(c) && (!step.basicOnly || isBasicEnergy(c)));

  if (ctx.selection) {
    const energy = attached.find((c) => c.instanceId === ctx.selection[0]);
    if (!energy) return skip(ctx, 'target_not_found');
    removeFromZones(player, energy);
    energy.attachedTo = null;
    player.zones.hand.push(energy);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: energy.instanceId,
      from: 'inPlay',
      to: 'hand',
      playerId: player.playerId,
    });
    return null;
  }
  if (attached.length === 0) return skip(ctx, 'no_energy_to_return');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Stadium')}: Choose a Basic Energy to return to your hand`,
    options: attached,
    min: 1,
    max: 1,
  });
}

// Celadon City Gym: discard an Energy attached to a qualifying Pokémon to cure it.
function discardOwnAttachedEnergy(ctx) {
  const { player, step } = ctx;
  const nameFilter = String(step.nameContains || '').toLowerCase();
  const hosts = rootsOf(player).filter(
    (root) =>
      !nameFilter ||
      String(topPokemonCard(player, root)?.name || '')
        .toLowerCase()
        .includes(nameFilter)
  );
  const attached = hosts
    .flatMap((root) => attachedCards(player, root.instanceId))
    .filter(isEnergy);

  const applyDiscard = (energy) => {
    const host = hosts.find((root) => root.instanceId === energy.attachedTo);
    discardCard(ctx.draft, energy, ctx.events);
    if (step.cure && host && hasAnyCondition(host)) {
      clearConditions(host);
      ctx.events.push({
        type: 'specialConditionUpdated',
        instanceId: host.instanceId,
        condition: null,
        conditions: [],
      });
    }
    return null;
  };

  if (ctx.selection) {
    const energy = attached.find((c) => c.instanceId === ctx.selection[0]);
    if (!energy) return skip(ctx, 'target_not_found');
    return applyDiscard(energy);
  }
  if (attached.length === 0) return skip(ctx, 'no_energy_to_discard');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Stadium')}: Choose an Energy to discard and cure the Pokémon`,
    options: attached,
    min: 1,
    max: 1,
  });
}

function damageCounters(ctx) {
  const { step } = ctx;
  const amount = (step.count || 1) * 10;
  const onOpponent = /opponent/i.test(step.target || '');
  const side = onOpponent ? ctx.opponent : ctx.player;
  if (!side) return skip(ctx, 'no_opponent');
  const victimPlayerId = side.playerId;
  const attackerPlayerId = onOpponent ? ctx.player?.playerId : ctx.opponent?.playerId;
  const targets = /active/i.test(step.target || '') ? [activeOf(side)].filter(Boolean) : rootsOf(side);

  const apply = (card) => {
    card.damage = (card.damage || 0) + amount;
    ctx.events.push({ type: 'damageUpdated', instanceId: card.instanceId, damage: card.damage });
    // Lethal counters must become a knockout. handleKnockout lives in reduce.mjs,
    // which imports this module (importing it back would be circular), so mark
    // the placement for the reducer's post-command KO sweep instead.
    ctx.events.push({
      type: 'damageCountersPlaced',
      instanceId: card.instanceId,
      victimPlayerId,
      attackerPlayerId,
      damage: card.damage,
    });
  };

  // "choose 2 of your opponent's Pokémon and put 2 damage counters on each of them"
  const targetCount = step.targetCount || 1;
  if (ctx.selection) {
    for (const card of pickById(targets, ctx.selection).slice(0, targetCount)) apply(card);
    return null;
  }
  if (targets.length === 0) return skip(ctx, 'no_target');
  if (targets.length <= targetCount) {
    targets.forEach(apply);
    return null;
  }
  const which = targetCount > 1 ? `${targetCount} Pokémon` : 'a Pokémon';
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose ${which} to put ${step.count} damage counters on`,
    options: targets,
    min: targetCount,
    max: targetCount,
  });
}

// Pseudo-option ids for "how many counters" prompts: -101 = 1 counter, -102 = 2, …
// (negative so they never collide with card instanceIds or BARGAIN_YES/NO).
const COUNTER_OPTION_BASE = -100;
const counterCountOption = (n) => COUNTER_OPTION_BASE - n;
function counterCountFromOption(id) {
  const n = COUNTER_OPTION_BASE - Number(id);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function maxMovableCounters(step, from) {
  return Math.min(step.count || 1, Math.floor((from.damage || 0) / 10));
}

function moveDamageCounters(ctx, from, to, counters) {
  const { player, opponent } = ctx;
  // Patrat CR: "Damage counters on each Pokémon … can't be moved to other
  // Pokémon." Every counter-movement handler funnels through here.
  if (damageCounterMoveLocked(ctx)) {
    return skip(ctx, 'damage_counter_move_locked');
  }
  const moved = counters * 10;
  from.damage -= moved;
  to.damage = (to.damage || 0) + moved;
  ctx.events.push({ type: 'damageUpdated', instanceId: from.instanceId, damage: from.damage });
  ctx.events.push({ type: 'damageUpdated', instanceId: to.instanceId, damage: to.damage });
  ctx.events.push({
    type: 'damageCountersPlaced',
    instanceId: to.instanceId,
    victimPlayerId: opponent.playerId,
    attackerPlayerId: player.playerId,
    damage: to.damage,
  });
  return null;
}

// Adrena-Brain: "if this Pokémon has any {D} Energy attached, you may move up to 3
// damage counters from 1 of your Pokémon to 1 of your opponent's Pokémon."
function moveOwnDamageToOpponent(ctx) {
  const { step, player, opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const sources = rootsOf(player).filter((c) => (c.damage || 0) > 0);

  if (ctx.selection && ctx.memo?.toId != null) {
    const from = sources.find((c) => c.instanceId === ctx.memo.fromId);
    const to = rootsOf(opponent).find((c) => c.instanceId === ctx.memo.toId);
    const counters = counterCountFromOption(ctx.selection[0]);
    if (!from || !to || counters == null) return skip(ctx, 'target_not_found');
    return moveDamageCounters(ctx, from, to, Math.min(counters, maxMovableCounters(step, from)));
  }

  if (ctx.selection && ctx.memo?.fromId != null) {
    const from = sources.find((c) => c.instanceId === ctx.memo.fromId);
    const to = rootsOf(opponent).find((c) => c.instanceId === ctx.selection[0]);
    if (!from || !to) return skip(ctx, 'target_not_found');
    const maxCounters = maxMovableCounters(step, from);
    // "up to N": the player picks how many; a fixed count, or only 1 available, moves at once.
    if (!step.upTo || maxCounters <= 1) return moveDamageCounters(ctx, from, to, maxCounters);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: How many damage counters to move?`,
      options: Array.from({ length: maxCounters }, (_, i) => ({
        instanceId: counterCountOption(maxCounters - i),
        name: `${maxCounters - i} damage counter${maxCounters - i === 1 ? '' : 's'}`,
      })),
      min: 1,
      max: 1,
      memo: { fromId: from.instanceId, toId: to.instanceId },
    });
  }

  if (ctx.selection) {
    const from = sources.find((c) => c.instanceId === ctx.selection[0]);
    if (!from) return skip(ctx, 'target_not_found');
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: Choose your opponent's Pokémon to move the damage counters to`,
      options: rootsOf(opponent),
      min: 1,
      max: 1,
      memo: { fromId: from.instanceId },
    });
  }

  if (step.requiresAttachedEnergy) {
    const what = `{${step.requiresAttachedEnergy.toUpperCase()}} Energy`;
    const hasEnergy = attachedCards(player, ctx.sourceCard?.instanceId).some(
      (c) => isEnergy(c) && matchesSearch(c, what)
    );
    if (!hasEnergy) return skip(ctx, 'energy_condition_unmet');
  }
  if (sources.length === 0 || rootsOf(opponent).length === 0) return skip(ctx, 'no_damage_to_move');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose 1 of your Pokémon to move damage counters from`,
    options: sources,
    min: 1,
    max: 1,
  });
}

function fossilItem(ctx) {
  const { player, step, sourceCard } = ctx;
  const card = (player.zones.board || []).find((c) => c.instanceId === sourceCard?.instanceId);
  if (!card) return skip(ctx, 'card_not_on_board');
  if (benchRootsOf(player).length >= BENCH_LIMIT) return skip(ctx, 'bench_full');
  removeFromZones(player, card);
  Object.assign(card, {
    supertype: 'Pokémon',
    hp: step.hp || 60,
    stage: 'Basic',
    types: ['Colorless'],
    retreatCost: [],
    playedAsPokemon: true,
  });
  player.zones.bench.push(card);
  ctx.events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'board', to: 'bench', playerId: player.playerId });
  return null;
}

// Scoop Up Cyclone (keeps attached cards) / Professor Turo's Scenario (discards them).
function returnPokemonToHand(ctx) {
  const { player, step } = ctx;
  const roots = rootsOf(player);

  if (ctx.memo?.phase === 'promote') {
    const newActive = benchRootsOf(player).find((c) => c.instanceId === ctx.selection?.[0]);
    if (newActive) promoteToActive(player, newActive, ctx.events);
    return null;
  }

  if (ctx.selection) {
    const root = roots.find((c) => c.instanceId === ctx.selection[0]);
    if (!root) return skip(ctx, 'target_not_found');
    const wasActive = zoneIdOf(player, root) === 'active';
    for (const card of [root, ...attachedCards(player, root.instanceId)]) {
      removeFromZones(player, card);
      card.attachedTo = null;
      const keep = step.keepAttached || isPokemon(card);
      if (keep) player.zones.hand.push(card);
      else discardCardToPlayerZone(player, card);
    }
    ctx.events.push({ type: 'cardMoved', instanceId: root.instanceId, from: wasActive ? 'active' : 'bench', to: 'hand', playerId: player.playerId });
    if (!wasActive) return null;
    const bench = benchRootsOf(player);
    if (bench.length === 1) {
      promoteToActive(player, bench[0], ctx.events);
      return null;
    }
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Choose your new Active Pokémon`,
      options: bench,
      min: 1,
      max: 1,
      memo: { phase: 'promote' },
    });
  }

  // The Active may only be picked up when a Benched Pokémon can replace it.
  const options = benchRootsOf(player).length > 0 ? roots : benchRootsOf(player);
  if (options.length === 0) return skip(ctx, 'no_pokemon');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose 1 of your Pokémon to put into your hand`,
    options,
    min: 1,
    max: 1,
  });
}

function promoteToActive(player, benchRoot, events) {
  for (const card of [benchRoot, ...attachedCards(player, benchRoot.instanceId)]) {
    removeFromZones(player, card);
    player.zones.active.push(card);
  }
  events.push({ type: 'pokemonPromoted', playerId: player.playerId, instanceId: benchRoot.instanceId });
}

function swapFilterMatches(card, filter) {
  if (!isPokemon(card)) return false;
  if (filter === 'Basic Pokémon') return stageOf(card) === 'Basic';
  if (filter === 'Pokémon ex (Ogerpon)') return /ogerpon.* ex$/i.test(card.name || '');
  return true;
}

// Ogre's Mask-style: a Pokémon in the discard pile takes the place of one in play.
function swapWithDiscard(ctx) {
  const { player, step } = ctx;
  const discardOptions = player.zones.discard.filter((c) => swapFilterMatches(c, step.filter));
  const inPlay = rootsOf(player).filter(
    (root) => topPokemonCard(player, root) === root && swapFilterMatches(root, step.filter)
  );

  if (ctx.memo?.phase === 'inPlay') {
    const incoming = discardOptions.find((c) => c.instanceId === ctx.memo.discardId);
    const outgoing = inPlay.find((c) => c.instanceId === ctx.selection?.[0]);
    if (!incoming || !outgoing) return skip(ctx, 'target_not_found');
    const zone = player.zones[zoneIdOf(player, outgoing)];
    removeFromZones(player, incoming);
    zone.splice(zone.indexOf(outgoing), 1, incoming);
    incoming.damage = outgoing.damage || 0;
    copyConditions(outgoing, incoming);
    for (const card of attachedCards(player, outgoing.instanceId)) card.attachedTo = incoming.instanceId;
    outgoing.damage = 0;
    clearConditions(outgoing);
    discardCardToPlayerZone(player, outgoing);
    ctx.events.push({ type: 'pokemonSwapped', playerId: player.playerId, instanceId: incoming.instanceId, replacedInstanceId: outgoing.instanceId });
    return null;
  }

  if (ctx.selection) {
    const incoming = discardOptions.find((c) => c.instanceId === ctx.selection[0]);
    if (!incoming) return skip(ctx, 'target_not_found');
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Choose the Pokémon in play to switch with ${incoming.name}`,
      options: inPlay,
      min: 1,
      max: 1,
      memo: { phase: 'inPlay', discardId: incoming.instanceId },
    });
  }
  if (discardOptions.length === 0 || inPlay.length === 0) return skip(ctx, 'no_swap_candidates');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon in your discard pile`,
    options: discardOptions,
    min: 1,
    max: 1,
  });
}

function revealOpponentDeckBench(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const deck = opponent.zones.deck;
  const revealed = deck.slice(0, Math.min(step.count || 5, deck.length));
  const basics = revealed.filter((c) => isPokemon(c) && stageOf(c) === 'Basic');
  const slots = Math.max(0, BENCH_LIMIT - benchRootsOf(opponent).length);

  const finish = () => {
    if (ctx.activeRng) shuffleInPlace(ctx.activeRng, deck);
    ctx.events.push({ type: 'deckShuffled', playerId: opponent.playerId });
    return null;
  };

  if (ctx.selection) {
    for (const card of pickById(basics, ctx.selection).slice(0, slots)) {
      removeFromZones(opponent, card);
      opponent.zones.bench.push(card);
      ctx.events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'deck', to: 'bench', playerId: opponent.playerId });
    }
    return finish();
  }
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: opponent.playerId,
    cards: revealed.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  if (basics.length === 0 || slots === 0) return finish();
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Put any Basic Pokémon you find onto your opponent's Bench`,
    options: basics,
    min: 0,
    max: Math.min(slots, basics.length),
  });
}

function attachMultipleFromDiscard(ctx) {
  const { player, step } = ctx;
  const targets = rootsOf(player).filter((root) => rootMatchesTarget(player, root, step.target));
  const energies = player.zones.discard.filter((c) => matchesSearch(c, step.energy || 'Basic Energy') && isEnergy(c));

  if (ctx.memo?.phase === 'energy') {
    const target = targets.find((c) => c.instanceId === ctx.memo.targetId);
    if (!target) return skip(ctx, 'target_not_found');
    for (const energy of pickById(energies, ctx.selection)) attachTo(player, energy, target, ctx.events);
    return null;
  }

  const askEnergy = (target) =>
    ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Attach up to ${step.count || 2} ${step.energy || 'Basic Energy'} to ${target.name}`,
      options: energies,
      min: 0,
      max: Math.min(step.count || 2, energies.length),
      memo: { phase: 'energy', targetId: target.instanceId },
    });

  if (ctx.selection) {
    const target = targets.find((c) => c.instanceId === ctx.selection[0]);
    if (!target) return skip(ctx, 'target_not_found');
    return askEnergy(target);
  }
  if (targets.length === 0 || energies.length === 0) return skip(ctx, 'no_energy_or_target');
  if (targets.length === 1) return askEnergy(targets[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose ${step.target || '1 of your Pokémon'}`,
    options: targets,
    min: 1,
    max: 1,
  });
}

// Bother-Bot: a random card from the opponent's hand trades places with a random face-down Prize.
function opponentPrizeHandSwap(ctx) {
  const { opponent, activeRng } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const prizes = opponent.zones.prizes;
  const hand = opponent.zones.hand;
  if (prizes.length === 0 || hand.length === 0) return skip(ctx, 'no_prize_or_hand');
  const roll = (n) => Math.floor((activeRng ? activeRng.next() : 0) * n);
  const prizeIndex = roll(prizes.length);
  const handIndex = roll(hand.length);
  const [prize] = prizes.splice(prizeIndex, 1, hand[handIndex]);
  hand.splice(handIndex, 1, prize);
  prizes[prizeIndex].revealed = true;
  ctx.events.push({ type: 'prizeHandSwapped', playerId: opponent.playerId });
  return null;
}

function revealOpponentHand(ctx) {
  const hand = ctx.opponent?.zones?.hand || [];
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: ctx.opponent?.playerId,
    revealedTo: ctx.playerId,
    cards: hand.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  return hand;
}

function revealOpponentHandDiscard(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const matches = opponent.zones.hand.filter((c) => matchesSearch(c, step.what || 'Item'));
  if (ctx.selection) {
    for (const card of pickById(matches, ctx.selection)) discardCard(ctx.draft, card, ctx.events);
    return null;
  }
  revealOpponentHand(ctx);
  if (matches.length === 0) return null;
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Discard up to ${step.count || 2} ${step.what || 'Item'} cards from your opponent's hand`,
    options: matches,
    min: 0,
    max: Math.min(step.count || 2, matches.length),
  });
}

function opponentHandBottom(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const matches = opponent.zones.hand.filter((c) => step.what === 'Energy' ? isEnergy(c) : true);
  if (ctx.selection) {
    const card = matches.find((c) => c.instanceId === ctx.selection[0]);
    if (card) {
      removeFromZones(opponent, card);
      opponent.zones.deck.push(card);
      ctx.events.push({ type: 'cardsMovedToDeckBottom', count: 1, playerId: opponent.playerId });
      // "Your opponent may draw a card": drawing is never worse for them, so it is applied.
      if (step.optionalOpponentDraw) drawCards(opponent, 1, ctx.events);
    }
    return null;
  }
  revealOpponentHand(ctx);
  if (matches.length === 0) return null;
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a card from your opponent's hand to put on the bottom of their deck`,
    options: matches,
    min: 1,
    max: 1,
  });
}

function askDiscardDownTo(ctx, target, count, memo) {
  const excess = target.zones.hand.length - count;
  if (excess <= 0) return null;
  return ctx.ask({
    player: target.playerId,
    prompt: `${sourceName(ctx, 'Trainer')}: Discard ${excess} card${excess > 1 ? 's' : ''} until you have ${count} in your hand`,
    options: target.zones.hand,
    min: excess,
    max: excess,
    memo,
  });
}

function discardSelectedFromHand(ctx, target) {
  const chosen = pickById(target.zones.hand, ctx.selection);
  for (const card of chosen) {
    removeFromZones(target, card);
    discardCardToPlayerZone(target, card);
  }
  ctx.events.push({
    type: 'cardsDiscarded',
    playerId: target.playerId,
    cards: chosen.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
}

function opponentDiscardUntil(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  if (ctx.selection) {
    discardSelectedFromHand(ctx, opponent);
    return null;
  }
  return askDiscardDownTo(ctx, opponent, step.count || 3, {});
}

function eachPlayerDiscardUntil(ctx) {
  const { player, opponent, step } = ctx;
  const count = step.count || 5;
  const order = [opponent, player].filter(Boolean);
  if (!step.opponentFirst) order.reverse();
  let turn = ctx.memo?.turn ?? 0;

  if (ctx.selection) {
    discardSelectedFromHand(ctx, order[turn]);
    turn += 1;
  }
  for (; turn < order.length; turn++) {
    const choice = askDiscardDownTo(ctx, order[turn], count, { turn });
    if (choice) return choice;
  }
  return null;
}

function hasAbility(card) {
  return Boolean(card.ability) || (Array.isArray(card.abilities) && card.abilities.length > 0);
}

function evolvesFromTop(player, card) {
  const from = String(card.evolvesFrom || '').toLowerCase();
  if (!from) return [];
  return rootsOf(player).filter((root) => String(topPokemonCard(player, root).name || '').toLowerCase() === from);
}

// Salvatore: search the deck for an Evolution card and put it onto the Pokémon it evolves from.
// Grand Tree sets `step.chainStage2`, which offers the matching Stage 2 from the deck as a second,
// chained evolve onto the same Pokémon (printed exception on that card). `step.ontoSource` evolves
// only the source card (Kakuna Dangerous Evolution: "… evolves from Kakuna and put it onto Kakuna").
function searchEvolve(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck;
  const evolveTargets = (card) =>
    evolvesFromTop(player, card).filter((root) => !step.ontoSource || root.instanceId === ctx.sourceCard?.instanceId);

  const evolveOnto = (card, root) => {
    attachTo(player, card, root, ctx.events);
    const turnNumber = ctx.draft?.turn?.number;
    if (turnNumber != null) {
      card.enteredPlayTurn = turnNumber;
      root.lastEvolvedTurn = turnNumber;
    }
    clearConditions(root);
    if (!player.flags) player.flags = {};
    if (!player.flags.evolved) player.flags.evolved = {};
    player.flags.evolved[root.instanceId] = true;
    ctx.events.push({ type: 'pokemonEvolved', playerId: player.playerId, instanceId: card.instanceId, targetInstanceId: root.instanceId });
  };

  // The chained step: the deck's Stage 2 for the card just put into play, onto the same root.
  // Declining, or having no match, ends the chain. The deck is shuffled once, when it ends.
  const chainStage2 = (evolvedCard, root) => {
    if (!step.chainStage2) {
      shuffleDeck(player, ctx);
      return null;
    }
    const evolvedName = String(evolvedCard.name || '').toLowerCase();
    const candidates = deck.filter(
      (c) => isPokemon(c) && evolvedName && String(c.evolvesFrom || '').toLowerCase() === evolvedName
    );
    if (candidates.length === 0) {
      shuffleDeck(player, ctx);
      return null;
    }
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Select a Stage 2 that evolves from ${evolvedCard.name}`,
      options: candidates,
      min: 0,
      max: 1,
      memo: { phase: 'stage2', rootId: root.instanceId },
    });
  };

  if (ctx.memo?.phase === 'stage2') {
    const card = deck.find((c) => c.instanceId === ctx.selection?.[0]);
    const root = rootsOf(player).find((c) => c.instanceId === ctx.memo.rootId);
    if (card && root) evolveOnto(card, root);
    shuffleDeck(player, ctx);
    return null;
  }

  if (ctx.memo?.phase === 'target') {
    const card = deck.find((c) => c.instanceId === ctx.memo.cardId);
    const root = card && evolveTargets(card).find((c) => c.instanceId === ctx.selection?.[0]);
    if (!card || !root) {
      shuffleDeck(player, ctx);
      return null;
    }
    evolveOnto(card, root);
    return chainStage2(card, root);
  }

  const candidates = deck.filter(
    (c) => isPokemon(c) && evolveTargets(c).length > 0 && !(step.noAbilities && hasAbility(c))
  );

  if (ctx.selection) {
    const card = candidates.find((c) => c.instanceId === ctx.selection[0]);
    if (!card) {
      shuffleDeck(player, ctx);
      return null;
    }
    const roots = evolveTargets(card);
    if (roots.length === 1) {
      evolveOnto(card, roots[0]);
      return chainStage2(card, roots[0]);
    }
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Choose the Pokémon to evolve into ${card.name}`,
      options: roots,
      min: 1,
      max: 1,
      memo: { phase: 'target', cardId: card.instanceId },
    });
  }

  if (candidates.length === 0) {
    shuffleDeck(player, ctx);
    return null;
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Select a card that evolves from 1 of your Pokémon`,
    options: candidates,
    min: 0,
    max: 1,
  });
}

// Choice options must be cards, so a yes/no question uses two fixed pseudo-card ids.
export const BARGAIN_YES = -1;
export const BARGAIN_NO = -2;

// Lt. Surge's Bargain: the opponent picks whether each player takes a Prize card.
function prizeBargain(ctx) {
  const { player, opponent, step } = ctx;
  if (!opponent) {
    drawCards(player, step.drawCount || 4, ctx.events);
    return null;
  }
  if (ctx.selection) {
    if (ctx.selection[0] === BARGAIN_YES) {
      for (const p of [player, opponent]) {
        const prize = p.zones.prizes.shift();
        if (!prize) continue;
        p.zones.hand.push(prize);
        ctx.events.push({ type: 'prizeTaken', playerId: p.playerId, count: 1 });
      }
    } else {
      drawCards(player, step.drawCount || 4, ctx.events);
    }
    return null;
  }
  return ctx.ask({
    player: opponent.playerId,
    prompt: `${sourceName(ctx, 'Trainer')}: May each player take a Prize card? (No: your opponent draws ${step.drawCount || 4} cards)`,
    options: [
      { instanceId: BARGAIN_YES, name: 'Yes — each player takes a Prize card' },
      { instanceId: BARGAIN_NO, name: `No — opponent draws ${step.drawCount || 4} cards` },
    ],
    min: 1,
    max: 1,
  });
}

// Janine's Secret Art: for each chosen Pokémon, attach a matching Basic Energy from the deck.
function searchAttachEach(ctx) {
  const { player, step } = ctx;
  const targets = rootsOf(player).filter((root) => rootMatchesTarget(player, root, step.target));

  if (ctx.selection) {
    const active = activeOf(player);
    let attachedToActive = false;
    for (const root of pickById(targets, ctx.selection)) {
      const energy = player.zones.deck.find((c) => isEnergy(c) && matchesSearch(c, step.energy));
      if (!energy) break;
      attachTo(player, energy, root, ctx.events);
      if (root === active) attachedToActive = true;
    }
    shuffleDeck(player, ctx);
    if (step.poisonActive && attachedToActive) {
      addCondition(active, 'Poisoned');
      ctx.events.push({ type: 'statusApplied', playerId: player.playerId, instanceId: active.instanceId, condition: 'Poisoned' });
    }
    return null;
  }
  if (targets.length === 0) {
    shuffleDeck(player, ctx);
    return null;
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose up to ${step.count || 2} Pokémon to attach Energy to`,
    options: targets,
    min: 0,
    max: Math.min(step.count || 2, targets.length),
  });
}

// A Pokémon Tool played to the board without a target: attach it to a Pokémon without a Tool.
function attachTool(ctx) {
  const { player, sourceCard } = ctx;
  const tool = (player.zones.board || []).find((c) => c.instanceId === sourceCard?.instanceId);
  if (!tool) return skip(ctx, 'card_not_on_board');
  const targets = rootsOf(player).filter(
    (root) => !attachedCards(player, root.instanceId).some(isToolCard)
  );
  const target = targets.find((c) => c.instanceId === ctx.selection?.[0]) ||
    (targets.length === 1 ? targets[0] : null);
  if (target) {
    attachTo(player, tool, target, ctx.events);
    return null;
  }
  if (targets.length === 0) return skip(ctx, 'no_tool_target');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Pokémon Tool')}: Choose a Pokémon to attach ${tool.name} to`,
    options: targets,
    min: 1,
    max: 1,
  });
}

// ── design 034 slice 5b: generic energy-move ability ─────────────────────

function moveEnergyMatches(step, card) {
  if (!isEnergy(card)) return false;
  if (step.basic && !isBasicEnergy(card)) return false;
  if (step.special && !isSpecialEnergy(card)) return false;
  if (!step.energyType) return true;
  const want = String(step.energyType).toLowerCase();
  const types = (Array.isArray(card.types) ? card.types : []).map((t) => String(t).toLowerCase());
  return types.includes(want) || String(card.name || '').toLowerCase().includes(want);
}

function rootHasTag(player, root, tag) {
  if (!tag) return true;
  const top = topPokemonCard(player, root);
  const words = `${top?.name || ''} ${textOf(top, 'subtypes')}`.toLowerCase();
  return words.includes(String(tag).replace(/'s$/, '').toLowerCase());
}

/** The Pokémon a move-Energy Ability may take Energy from, per its printed source. */
function moveEnergySources(player, step, self) {
  const others = rootsOf(player).filter((c) => c.instanceId !== self?.instanceId);
  if (step.source === 'bench') return benchRootsOf(player);
  if (step.source === 'active') return [activeOf(player)].filter(Boolean);
  if (step.source === 'self') return self ? [self] : [];
  if (step.source === 'any') return rootsOf(player);
  return others;
}

/** Candidate destinations for one chosen Energy; null when the printing fixes it. */
function moveEnergyTargets(player, step, self, energy) {
  if (step.target === 'bench') return benchRootsOf(player);
  if (step.target === 'between') {
    return rootsOf(player).filter(
      (c) => c.instanceId !== energy.attachedTo && rootHasTag(player, c, step.targetTag)
    );
  }
  return null;
}

// Design 034 slice 5b: generic move-Energy Ability. The printing fixes the destination
// (`step.target`, from parseMoveEnergyShape); the Energy and, for a Bench or "another of your
// Pokémon" destination, the receiving Pokémon are the player's choices.
function moveEnergyAbility(ctx) {
  const { player, step } = ctx;
  const self = rootsOf(player).find((c) => c.instanceId === ctx.sourceCard?.instanceId) || null;
  const fixedDestination =
    step.target === 'active' ? activeOf(player) : step.target === 'bench' || step.target === 'between' ? null : self;
  const sources = moveEnergySources(player, step, self).filter(
    (c) => c.instanceId !== fixedDestination?.instanceId
  );
  const energies = sources
    .flatMap((root) => attachedCards(player, root.instanceId))
    .filter((c) => moveEnergyMatches(step, c));

  const moveAll = (chosen, target) => {
    for (const energy of chosen) attachTo(player, energy, target, ctx.events);
    return null;
  };
  const toChosenTarget = (chosen) => {
    if (fixedDestination) return moveAll(chosen, fixedDestination);
    const targets = moveEnergyTargets(player, step, self, chosen[0]);
    if (targets.length === 0) return skip(ctx, 'no_target');
    if (targets.length === 1) return moveAll(chosen, targets[0]);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: Choose a Pokémon to move the Energy to`,
      options: targets,
      min: 1,
      max: 1,
      memo: { phase: 'target', energyIds: chosen.map((c) => c.instanceId) },
    });
  };

  if (ctx.memo?.phase === 'target') {
    const chosen = pickById(energies, ctx.memo.energyIds || []);
    const target = rootsOf(player).find((c) => c.instanceId === ctx.selection?.[0]);
    if (!target || chosen.length === 0) return skip(ctx, 'target_not_found');
    return moveAll(chosen, target);
  }
  if (ctx.selection) {
    const chosen = pickById(energies, ctx.selection);
    if (chosen.length === 0) return skip(ctx, 'target_not_found');
    return toChosenTarget(chosen);
  }

  if (step.target !== 'bench' && step.target !== 'between' && !fixedDestination) {
    return skip(ctx, 'target_not_found');
  }
  if (step.source === 'self' && !self) return skip(ctx, 'source_not_in_play');
  if (energies.length === 0) return skip(ctx, 'no_energy_to_move');

  const cap = step.anyAmount ? energies.length : Math.min(Number(step.upTo) || 1, energies.length);
  const min = step.anyAmount ? 1 : step.exact ? cap : 1;
  // A forced move with nothing to decide (the only Energy that qualifies) needs no prompt.
  if (energies.length === min && min === cap) return toChosenTarget(energies);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose ${step.anyAmount ? 'any amount of' : cap === 1 ? 'an' : `up to ${cap}`} Energy to move`,
    options: energies,
    min,
    max: cap,
  });
}

// ── design 034 slice 5: ability-side executables ─────────────────────────

/**
 * Slowbro Strange Behavior / Team Rocket's Orbeetle Rocket Brain: "move 1 damage
 * counter from 1 of your Pokémon to another". Both endpoints are the acting
 * player's own Pokémon, unlike `moveOwnDamageToOpponent` (which moves to the
 * opponent's side).
 */
function moveDamageBetweenOwn(ctx) {
  const { player, step } = ctx;
  const roots = rootsOf(player);
  const sources = roots.filter((c) => (c.damage || 0) > 0);
  const targetsFor = (from) => roots.filter((c) => c.instanceId !== from.instanceId);

  if (ctx.selection && ctx.memo?.fromId != null) {
    const from = sources.find((c) => c.instanceId === ctx.memo.fromId);
    const to = targetsFor(from || {}).find((c) => c.instanceId === ctx.selection[0]);
    if (!from || !to) return skip(ctx, 'target_not_found');
    return moveDamageCounters(ctx, from, to, maxMovableCounters(step, from));
  }
  if (ctx.selection) {
    const from = sources.find((c) => c.instanceId === ctx.selection[0]);
    if (!from) return skip(ctx, 'target_not_found');
    // "to this Pokémon": the destination is fixed, so the source pick moves at once.
    if (step.toSelf) {
      const self = roots.find(
        (c) => c.instanceId === ctx.sourceCard?.instanceId && c !== from
      );
      if (!self) return skip(ctx, 'target_not_found');
      return moveDamageCounters(ctx, from, self, maxMovableCounters(step, from));
    }
    const targets = targetsFor(from);
    if (targets.length === 0) return skip(ctx, 'no_target');
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: Choose a Pokémon to move the damage counter to`,
      options: targets,
      min: 1,
      max: 1,
      memo: { fromId: from.instanceId },
    });
  }
  if (sources.length === 0 || roots.length < 2) return skip(ctx, 'no_damage_to_move');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose 1 of your Pokémon to move a damage counter from`,
    options: sources,
    min: 1,
    max: 1,
  });
}

/**
 * Blissey Busybody Nurse: "Your Active Pokémon recovers from all Special
 * Conditions." Applies to the acting player's Active.
 */
function recoverStatusAbility(ctx) {
  const { player } = ctx;
  const active = activeOf(player);
  if (!active) return skip(ctx, 'no_active');
  if (!hasAnyCondition(active)) return skip(ctx, 'no_condition');
  clearConditions(active);
  ctx.events.push({
    type: 'specialConditionUpdated',
    instanceId: active.instanceId,
    condition: null,
    conditions: [],
    playerId: player.playerId,
  });
  return null;
}

/**
 * Dodrio Zooming Draw / Feraligatr Torrential Heart: "put N damage counters on
 * this Pokémon" (an optional cost). `selfKnockOut` marks a self-KO for the
 * reducer's post-command KO sweep.
 */
function selfDamageAbility(ctx) {
  const { player, step, sourceCard } = ctx;
  const ref = findCard(ctx.draft, sourceCard?.instanceId);
  if (!ref || (ref.zoneId !== 'active' && ref.zoneId !== 'bench') || ref.card.attachedTo) {
    return skip(ctx, 'source_not_in_play');
  }
  const amount = (step.count || 1) * 10;
  ref.card.damage = (ref.card.damage || 0) + amount;
  ctx.events.push({ type: 'damageUpdated', instanceId: ref.card.instanceId, damage: ref.card.damage });
  ctx.events.push({
    type: 'damageCountersPlaced',
    instanceId: ref.card.instanceId,
    victimPlayerId: player.playerId,
    attackerPlayerId: null,
    damage: ref.card.damage,
  });
  return null;
}

/**
 * Luxray Swelling Flash / Klinklang Emergency Rotation: "if this Pokémon is in
 * your hand …, you may put this Pokémon onto your Bench." `step.condition`
 * carries the parsed gate; an unmet condition skips without consuming a Bench
 * slot.
 */
function selfBenchPlacementAbility(ctx) {
  const { player, step, sourceCard } = ctx;
  const card = (player.zones.hand || []).find(
    (c) => c.instanceId === sourceCard?.instanceId
  );
  if (!card) return skip(ctx, 'card_not_in_hand');
  if (benchRootsOf(player).length >= BENCH_LIMIT) return skip(ctx, 'bench_full');
  if (step.condition === 'morePrizes' && !morePrizesThanOpponent(ctx)) {
    return skip(ctx, 'condition_unmet');
  }
  if (step.condition === 'opponentStage2' && !opponentHasStage2(ctx)) {
    return skip(ctx, 'condition_unmet');
  }
  removeFromZones(player, card);
  card.attachedTo = null;
  if (step.swapActive) {
    const active = activeOf(player);
    if (!active) return skip(ctx, 'no_active');
    removeFromZones(player, active);
    player.zones.bench.push(active);
    player.zones.active.push(card);
    ctx.events.push({
      type: 'cardSwitched',
      playerId: player.playerId,
      activeId: active.instanceId,
      benchId: card.instanceId,
    });
    return null;
  }
  player.zones.bench.push(card);
  ctx.events.push({
    type: 'cardMoved',
    instanceId: card.instanceId,
    from: 'hand',
    to: 'bench',
    playerId: player.playerId,
  });
  return null;
}

function morePrizesThanOpponent(ctx) {
  const mine = (ctx.player?.zones?.prizes || []).length;
  const theirs = (ctx.opponent?.zones?.prizes || []).length;
  return mine > theirs;
}

function opponentHasStage2(ctx) {
  if (!ctx.opponent) return false;
  return rootsOf(ctx.opponent).some(
    (root) => normalizeStage(root.stage) === 'Stage 2'
  );
}

/**
 * Turn-scoped attack damage boost from an activated ability (Feraligatr
 * Torrential Heart, Skeledirge ex Incendiary Song). Pushes the same shape
 * `parseTurnDamageBonus` produces; `attackerInstanceId` scopes it to this
 * Pokémon's attacks ("attacks used by this Pokémon").
 */
function turnDamageBonusAbility(ctx) {
  const { player, step } = ctx;
  if (!(step.amount > 0)) return skip(ctx, 'no_amount');
  if (!player.flags) player.flags = {};
  player.flags.turnDamageBonuses = [
    ...(player.flags.turnDamageBonuses || []),
    {
      amount: step.amount,
      type: null,
      attackerNoRuleBox: false,
      defenderFilter: null,
      attackerInstanceId: ctx.sourceCard?.instanceId ?? null,
    },
  ];
  ctx.events.push({
    type: 'turnDamageBonus',
    playerId: player.playerId,
    instanceId: ctx.sourceCard?.instanceId,
    amount: step.amount,
  });
  return null;
}

/**
 * "Put this Pokémon into your hand" self-return (Grumpig Energized Steps reuse,
 * ability wording). Attachments follow the root; an emptied Active auto-promotes
 * when a lone Benched Pokémon exists, else raises the same promote choice the
 * trainer Scoop Up path uses.
 */
function returnSelfToHandAbility(ctx) {
  const { player, step, sourceCard } = ctx;
  if (ctx.memo?.phase === 'promote') {
    const newActive = benchRootsOf(player).find(
      (c) => c.instanceId === ctx.selection?.[0]
    );
    if (newActive) promoteToActive(player, newActive, ctx.events);
    return null;
  }
  const root = rootsOf(player).find((c) => c.instanceId === sourceCard?.instanceId);
  if (!root) return skip(ctx, 'source_not_in_play');
  const wasActive = zoneIdOf(player, root) === 'active';
  for (const card of [root, ...attachedCards(player, root.instanceId)]) {
    removeFromZones(player, card);
    card.attachedTo = null;
    const keep = step.keepAttached || isPokemon(card);
    if (keep) player.zones.hand.push(card);
    else discardCardToPlayerZone(player, card);
  }
  ctx.events.push({
    type: 'cardMoved',
    instanceId: root.instanceId,
    from: wasActive ? 'active' : 'bench',
    to: 'hand',
    playerId: player.playerId,
  });
  if (!wasActive) return null;
  const bench = benchRootsOf(player);
  if (bench.length === 1) {
    promoteToActive(player, bench[0], ctx.events);
    return null;
  }
  if (bench.length === 0) return null;
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose your new Active Pokémon`,
    options: bench,
    min: 1,
    max: 1,
    memo: { phase: 'promote' },
  });
}

export const EXTRA_STEP_HANDLERS = {
  attachTool,
  searchEvolve,
  prizeBargain,
  searchAttachEach,
  attachFromHand,
  opponentDraw,
  putHandOnBottom,
  putHandOnTop,
  opponentShuffleHandDraw,
  opponentCountShuffleDraw,
  countShuffleDrawPlus,
  millSelf,
  reshufflePrizes,
  variableDraw,
  lookAtTop: (ctx) => lookAtDeckEnd(ctx, false),
  lookAtTopAbility: (ctx) => lookAtDeckEnd(ctx, false),
  lookAtBottom: (ctx) => lookAtDeckEnd(ctx, true),
  searchDeckSequence,
  evolveStage2,
  moveEnergy,
  moveEnergyToActive,
  devolve,
  discardTools,
  discardFromOpponent,
  massDiscardAttached,
  discardToolAndSpecialEnergy,
  discardEnergyFromOpponent,
  returnOwnAttachedEnergy,
  discardOwnAttachedEnergy,
  damageCounters,
  // Ability "place N damage counters on 1 of your opponent's Pokémon" step
  // (Mortal Shuriken et al.). Reuses the trainer damage-counter target picker,
  // which raises a PendingChoice over the in-play Pokémon (mat picker); the
  // ability step carries `count`/`onOpponent` instead of `target`.
  moveDamageAbility: (ctx) =>
    ctx.step.fromOwn ? moveOwnDamageToOpponent(ctx) : damageCounters({
      ...ctx,
      step: {
        ...ctx.step,
        target: ctx.step.onOpponent ? "opponent's Pokémon" : 'your Pokémon',
      },
    }),
  // Design 034 slice 5 ability executables.
  moveEnergyAbility,
  moveDamageBetweenAbility: moveDamageBetweenOwn,
  recoverStatusAbility,
  selfDamageAbility,
  selfBenchPlacementAbility,
  turnDamageBonusAbility,
  returnSelfToHandAbility,
  fossilItem,
  returnPokemonToHand,
  swapWithDiscard,
  revealOpponentDeckBench,
  attachMultipleFromDiscard,
  opponentPrizeHandSwap,
  revealOpponentHandDiscard,
  opponentHandBottom,
  opponentDiscardUntil,
  eachPlayerDiscardUntil,
};

