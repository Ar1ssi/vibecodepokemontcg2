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
import { isUltraBeastCard } from '../rules/card-classify.mjs';
import { classifyEnergyEffect } from '../rules/energy-effects.mjs';
import { normalizeStage } from '../rules/evolution.mjs';
import {
  addCondition,
  clearConditions,
  copyConditions,
  hasAnyCondition,
} from '../rules/special-conditions.mjs';
import { clearAttackMarkers } from '../rules/attack-markers.mjs';
import { stadiumBlocksHealing } from '../rules/stadium-effects.mjs';
import {
  evolvedView,
  topPokemonCard as topOfStack,
  rareCandyOptions,
  ownedCards,
} from '../rules/evolved-pokemon.mjs';
import {
  hasSpecialEnergyAbilityShield,
  hasSpecialEnergyEffectShield,
  isSpecialEnergyCard,
} from '../rules/special-energy-parse.mjs';
import { discardCurrentStadium } from './trainer.mjs';
import { resolveSpecialEnergyDiscard } from './special-energy.mjs';
import { applyStadiumSwitchTriggers } from './stadium-trigger-apply.mjs';
import { abilityCounterMoveLock } from '../rules/ability-combat.mjs';
import { TYPE_LETTER } from '../rules/tool-combat.mjs';
import { isSupporterTrainer } from '../rules/trainer-play-conditions.mjs';

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

/** The zone array holding an in-play root (active or bench), or null. */
export function zoneOfRoot(player, root) {
  if ((player?.zones?.active || []).includes(root)) return player.zones.active;
  if ((player?.zones?.bench || []).includes(root)) return player.zones.bench;
  return null;
}

/**
 * True when an attached special Energy shields this in-play Pokémon from `kind`
 * effects: 'effect' (Mist/Rocky/Wash/Wonder, attack effects) or 'ability'
 * (Fusion Strike, opponent Abilities). Reads the top of an evolution stack.
 */
export function specialEnergyShielded(player, root, kind = 'effect') {
  const zone = zoneOfRoot(player, root);
  if (!zone || !root) return false;
  const view = evolvedView(zone, root);
  return kind === 'ability'
    ? hasSpecialEnergyAbilityShield(view, zone)
    : hasSpecialEnergyEffectShield(view, zone);
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
  // Gardenia's Vigor prints "Draw 2 cards. If you drew any cards in this way,
  // attach …": when the leading draw drew nothing the attach does not resolve.
  // First call only — a resume carries a fresh events array without the draw.
  if (
    step.requiresDraw &&
    !ctx.selection &&
    !ctx.memo?.phase &&
    !(ctx.events || []).some(
      (event) => event.type === 'cardsDrawn' && event.playerId === ctx.playerId && event.count > 0
    )
  ) {
    return skip(ctx, 'draw_failed');
  }
  const energies = () => (player.zones.hand || []).filter((c) => handEnergyMatches(c, step.handEnergy));
  const targets = handAttachTargets(ctx);
  const attachAll = (cards, root) => {
    for (const card of cards) attachTo(player, card, root, ctx.events);
    // "Put 1 damage counter on that Pokémon" (Energy Rain, I164): only on a real attach.
    if (cards.length > 0 && step.damage > 0) {
      root.damage = (root.damage || 0) + step.damage * 10;
      ctx.events.push({ type: 'damageUpdated', instanceId: root.instanceId, damage: root.damage });
    }
  };
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
    attachAll(energies().filter((c) => batch.includes(c.instanceId)), root);
    const remaining = step.handAttachEach
      ? pending.slice(1).filter((id) => energies().some((c) => c.instanceId === id))
      : [];
    return remaining.length > 0 ? askTarget(remaining) : null;
  }

  if (ctx.selection) {
    let picked = energies().filter((c) => ctx.selection.includes(c.instanceId));
    // "a Basic {R} Energy card, a Basic {F} Energy card, or 1 of each": at most one per type.
    if ((step.handEnergy?.types || []).length > 1 && !step.handEnergy.anyCombination) {
      picked = step.handEnergy.types
        .map((type) => picked.find((c) => handEnergyMatches(c, { types: [type] })))
        .filter(Boolean);
    }
    if (picked.length === 0) return skip(ctx, 'no_energy_selected');
    if (targets.length === 0) return skip(ctx, 'no_attach_target');
    if (targets.length === 1) {
      attachAll(picked, targets[0]);
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
    ctx.events.push({
      type: 'cardsMovedToDeckBottom',
      count: chosen.length,
      playerId: player.playerId,
      ...(step.cost ? { handCost: true } : {}),
    });
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
    if (Number(step.takeUpTo) > 1) {
      // "up to N" (Bug Catching Set): take every chosen match, not just the first.
      const toBench = step.destination === 'bench';
      const destination = toBench ? player.zones.bench : player.zones.hand;
      for (const picked of chosen.slice(0, Number(step.takeUpTo))) {
        removeFromZones(player, picked);
        destination.push(picked);
        ctx.events.push({ type: 'cardMoved', instanceId: picked.instanceId, from: 'deck', to: toBench ? 'bench' : 'hand', playerId: player.playerId });
        ctx.events.push({ type: 'cardsRevealed', playerId: player.playerId, cards: [{ instanceId: picked.instanceId, name: picked.name }] });
      }
      return finishLook(ctx, viewed);
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
  const takeMax = Math.max(1, Number(step.takeUpTo) || 1);
  const what = pick.replace(' (bench)', '');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: You may take ${
      takeMax > 1
        ? `up to ${takeMax} ${pick === 'any' ? 'cards' : what}`
        : pick === 'any'
          ? 'a card'
          : `a ${what}`
    } from the ${fromBottom ? 'bottom' : 'top'} ${count} cards of your deck`,
    options: matches,
    min: 0,
    max: Math.min(takeMax, matches.length),
  });
}

function lookPickMatches(card, pick) {
  if (pick === 'any') return true;
  if (pick === 'Supporter') return matchesSearch(card, 'Supporter');
  if (pick.startsWith('Basic Energy')) return isBasicEnergy(card);
  if (pick.endsWith(' (bench)')) return benchPickMatches(card, pick.slice(0, -8));
  if (pick === 'Pokémon') return isPokemon(card);
  return matchesSearch(card, pick);
}

// `(bench)` forms (I132): a named Pokémon ("Anorith (bench)"), a typed Basic
// ("Darkness Pokémon (bench)"), or any Basic ("Pokémon (bench)").
function benchPickMatches(card, what) {
  if (!isPokemon(card)) return false;
  const label = what.trim();
  if (label === 'Pokémon') return stageOf(card) === 'Basic';
  const typed = label.match(/^(.+) Pokémon$/);
  if (typed) {
    const symbol = typeSymbolForWord(typed[1]);
    return (
      symbol != null &&
      stageOf(card) === 'Basic' &&
      pokemonHasType(card, symbol)
    );
  }
  return String(card.name || '').trim().toLowerCase() === label.toLowerCase();
}

function typeSymbolForWord(word) {
  const wanted = word.trim().toLowerCase();
  for (const [symbol, name] of Object.entries(SYMBOL_TYPES)) {
    if (name === wanted) return symbol;
  }
  return null;
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
  // Ability counters (moveDamageAbility) are an opponent's Ability effect: Fusion Strike
  // Energy prevents them on its host. Trainers keep the effect shield's own path.
  const shieldKind = step.abilityShield && onOpponent ? 'ability' : null;
  const shieldBlocks = (root) => {
    if (!shieldKind || !specialEnergyShielded(side, root, shieldKind)) return false;
    ctx.events.push({
      type: 'damagePrevented',
      instanceId: root.instanceId,
      reason: 'special-energy-ability',
    });
    return true;
  };
  const targets = (/active/i.test(step.target || '') ? [activeOf(side)].filter(Boolean) : rootsOf(side)).filter(
    (root) => !shieldBlocks(root)
  );

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
  // Fusion Strike Energy: the counters an opponent's Ability would place on its host
  // are prevented, so the host is not a legal destination.
  const destinations = rootsOf(opponent).filter((root) => {
    if (!specialEnergyShielded(opponent, root, 'ability')) return true;
    ctx.events.push({
      type: 'damagePrevented',
      instanceId: root.instanceId,
      reason: 'special-energy-ability',
    });
    return false;
  });

  if (ctx.selection && ctx.memo?.toId != null) {
    const from = sources.find((c) => c.instanceId === ctx.memo.fromId);
    const to = destinations.find((c) => c.instanceId === ctx.memo.toId);
    const counters = counterCountFromOption(ctx.selection[0]);
    if (!from || !to || counters == null) return skip(ctx, 'target_not_found');
    return moveDamageCounters(ctx, from, to, Math.min(counters, maxMovableCounters(step, from)));
  }

  if (ctx.selection && ctx.memo?.fromId != null) {
    const from = sources.find((c) => c.instanceId === ctx.memo.fromId);
    const to = destinations.find((c) => c.instanceId === ctx.selection[0]);
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
      options: destinations,
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
  if (sources.length === 0 || destinations.length === 0) return skip(ctx, 'no_damage_to_move');
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
  const { player, opponent, step } = ctx;
  // Minion of Team Rocket: the opponent's chosen Benched Pokémon and every attached
  // card go back to the opponent's hand.
  if (step.side === 'opponent') {
    if (!opponent) return skip(ctx, 'no_opponent');
    const bench = benchRootsOf(opponent);
    const returnRoot = (root) => {
      for (const card of [root, ...attachedCards(opponent, root.instanceId)]) {
        removeFromZones(opponent, card);
        card.attachedTo = null;
        opponent.zones.hand.push(card);
      }
      ctx.events.push({
        type: 'cardMoved',
        instanceId: root.instanceId,
        from: 'bench',
        to: 'hand',
        playerId: opponent.playerId,
      });
      return null;
    };
    if (ctx.selection) {
      const root = bench.find((c) => c.instanceId === ctx.selection[0]);
      return root ? returnRoot(root) : skip(ctx, 'target_not_found');
    }
    if (bench.length === 0) return skip(ctx, 'no_opponent_bench');
    if (bench.length === 1) return returnRoot(bench[0]);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Choose 1 of your opponent's Benched Pokémon to return to their hand`,
      options: bench,
      min: 1,
      max: 1,
    });
  }

  const roots = rootsOf(player);

  if (ctx.memo?.phase === 'promote') {
    const newActive = benchRootsOf(player).find((c) => c.instanceId === ctx.selection?.[0]);
    if (newActive) promoteToActive(player, newActive, ctx.events, ctx.draft?.turn?.number);
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
      promoteToActive(player, bench[0], ctx.events, ctx.draft?.turn?.number);
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

function promoteToActive(player, benchRoot, events, turnNumber = 1) {
  for (const card of [benchRoot, ...attachedCards(player, benchRoot.instanceId)]) {
    removeFromZones(player, card);
    player.zones.active.push(card);
  }
  benchRoot.movedToActiveTurn = Math.max(1, Number(turnNumber) || 1);
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
  // "Discard 2 …" is mandatory (Team Skull Grunt); only a printed "up to N"
  // lets the player discard fewer (Eri). min 0 here made the mandatory card
  // optional (audit S&M F7).
  const max = Math.min(step.count || 2, matches.length);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Discard ${step.upTo ? 'up to ' : ''}${max} ${
      step.what || 'Item'
    } cards from your opponent's hand`,
    options: matches,
    min: step.upTo ? 0 : max,
    max,
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

// ── I134a: auto/simple step kinds the executor's core switch never covered ──

// Full Heal / Double Full Heal — remove Special Conditions from the Active (or every own Pokémon).
function clearStatus(ctx) {
  const { player, step } = ctx;
  const targets =
    step.target === 'allYourPokémon' ? rootsOf(player) : [activeOf(player)].filter(Boolean);
  if (targets.length === 0) return skip(ctx, 'no_target');
  for (const card of targets) {
    if (!hasAnyCondition(card)) continue;
    clearConditions(card);
    ctx.events.push({
      type: 'specialConditionUpdated',
      instanceId: card.instanceId,
      condition: null,
      conditions: [],
    });
  }
  return null;
}

function healCard(ctx, card, amount) {
  const oldDamage = card.damage || 0;
  if (oldDamage <= 0 || amount <= 0) return false;
  card.damage = Math.max(0, oldDamage - amount);
  ctx.events.push({
    type: 'damageUpdated',
    instanceId: card.instanceId,
    damage: card.damage,
    healed: oldDamage - card.damage,
  });
  return true;
}

// Brock / Erika's Kindness / Tropical Wind — heal every damaged in-play Pokémon.
function healEachActive(ctx) {
  const { player, opponent, step } = ctx;
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  const amount = (step.amount || 0) * 10;
  const sides = step.scope === 'all' ? [player, opponent].filter(Boolean) : [player];
  let healed = 0;
  for (const side of sides) {
    for (const card of rootsOf(side)) {
      if (healCard(ctx, card, amount)) healed += 1;
    }
  }
  if (healed === 0) return skip(ctx, 'no_damaged_pokemon');
  return null;
}

// Paint Roller / Delinquent / Bonnie — discard the Stadium in play.
function discardStadium(ctx) {
  if (!ctx.draft.stadium) return skip(ctx, 'no_stadium');
  discardCurrentStadium(ctx.draft, ctx.events, ctx.playerId);
  return null;
}

// Karen / Lysandre's Trump Card — each player shuffles their discard pile into their deck.
// Karen moves only Pokémon; Lysandre's Trump Card moves every card.
function shuffleDiscardIntoDeck(ctx) {
  const sides = [ctx.player, ctx.opponent].filter(Boolean);
  let moved = 0;
  for (const side of sides) {
    const discard = side.zones.discard || [];
    const cards = ctx.step.what === 'Pokémon' ? discard.filter(isPokemon) : [...discard];
    if (cards.length === 0) continue;
    for (const card of cards) {
      removeFromZones(side, card);
      side.zones.deck.push(card);
    }
    moved += cards.length;
    shuffleDeck(side, ctx);
  }
  if (moved === 0) return skip(ctx, 'empty_discard');
  return null;
}

// Energy Reset / Energy Flow — return any attached Energy (own) to hand.
function energyToHand(ctx) {
  const { player } = ctx;
  const attached = rootsOf(player)
    .flatMap((root) => attachedCards(player, root.instanceId))
    .filter(isEnergy);

  if (ctx.selection) {
    for (const energy of pickById(attached, ctx.selection)) {
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
    }
    return null;
  }
  if (attached.length === 0) return skip(ctx, 'no_attached_energy');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose any number of attached Energy to return to your hand`,
    options: attached,
    min: 0,
    max: attached.length,
  });
}

// Computer Error / Erika — each player draws up to N.
function eachPlayerDraw(ctx) {
  const { player, opponent, step } = ctx;
  const count = step.count || 0;
  drawCards(player, count, ctx.events);
  if (opponent) drawCards(opponent, count, ctx.events);
  return null;
}

// Moomoo Milk — flip N coins, then heal the chosen Pokémon by the heads total.
function healPerHeads(ctx) {
  const { player, step } = ctx;
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  let heads = ctx.memo?.heads;
  if (heads == null) {
    heads = 0;
    const coins = step.coins || 2;
    for (let i = 0; i < coins; i++) {
      const face = (ctx.activeRng ? ctx.activeRng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
      if (face === 'heads') heads += 1;
      ctx.events.push({ type: 'coinFlipped', playerId: player.playerId, face });
    }
  }
  const amount = heads * (step.perHeads || 3) * 10;
  if (amount <= 0) return skip(ctx, 'no_healing');
  const candidates = rootsOf(player).filter((c) => (c.damage || 0) > 0);
  if (ctx.selection) {
    const target = candidates.find((c) => c.instanceId === ctx.selection[0]);
    if (!target) return skip(ctx, 'target_not_found');
    healCard(ctx, target, amount);
    return null;
  }
  if (candidates.length === 0) return skip(ctx, 'no_damaged_pokemon');
  if (candidates.length === 1) {
    healCard(ctx, candidates[0], amount);
    return null;
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: ${heads} heads — choose a Pokémon to heal`,
    options: candidates,
    min: 1,
    max: 1,
    memo: { heads },
  });
}

// Pokédex / New Pokédex — the player reorders the top N cards of their deck.
function rearrangeTop(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck || [];
  const count = Math.min(step.count || 0, deck.length);
  if (count <= 1) return null;
  const viewed = deck.slice(0, count);

  if (ctx.selection) {
    const byId = new Map(viewed.map((c) => [c.instanceId, c]));
    const order = (ctx.selection || []).map((id) => byId.get(id)).filter(Boolean);
    if (order.length !== count) return skip(ctx, 'target_not_found');
    deck.splice(0, count, ...order);
    return null;
  }
  ctx.events.push({ type: 'cardsLookedAt', playerId: player.playerId, count });
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose the order of the top ${count} cards (first is on top)`,
    options: viewed,
    min: count,
    max: count,
  });
}

// A card leaving play forgets everything that happened to it there.
function resetLeftPlay(card) {
  card.damage = 0;
  clearConditions(card);
  clearAttackMarkers(card);
  delete card.cannotAttackUntilTurn;
  delete card.cannotAttackAttackName;
  delete card.cannotRetreatUntilTurn;
  delete card.discardAtEndOfTurn;
  card.attachedTo = null;
}

// Mr. Fuji / Cassius — shuffle one of your Pokémon and its attachments into the deck.
function shufflePokemonIntoDeck(ctx) {
  const { player } = ctx;
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
      resetLeftPlay(card);
      player.zones.deck.push(card);
    }
    ctx.events.push({
      type: 'cardMoved',
      instanceId: root.instanceId,
      from: wasActive ? 'active' : 'bench',
      to: 'deck',
      playerId: player.playerId,
    });
    shuffleDeck(player, ctx);
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

  // The Active may only be shuffled in when a Benched Pokémon can replace it.
  const bench = benchRootsOf(player);
  const options = ctx.step.benchOnly || bench.length === 0 ? bench : roots;
  if (options.length === 0) return skip(ctx, 'no_pokemon');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose 1 of your Pokémon to shuffle into your deck`,
    options,
    min: 1,
    max: 1,
  });
}

// Channeler / Pokémon Ranger — clear timed attack effects (markers).
function clearAttackEffects(ctx) {
  const sides = ctx.step.scope === 'all' ? [ctx.player, ctx.opponent].filter(Boolean) : [ctx.player];
  for (const side of sides) {
    for (const card of rootsOf(side)) clearAttackMarkers(card);
  }
  return null;
}

// Town Map / Here Comes Team Rocket! — turn Prize cards face up.
function revealPrizes(ctx) {
  const { player, opponent, step } = ctx;
  const sides = step.scope === 'all' ? [player, opponent].filter(Boolean) : [player];
  for (const side of sides) {
    if (!side.flags) side.flags = {};
    side.flags.prizesFaceUp = true;
    const prizes = side.zones.prizes || [];
    ctx.events.push({
      type: 'cardsRevealed',
      playerId: side.playerId,
      cards: prizes.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
  }
  return null;
}

// ── I134b: choice-driven step kinds ──────────────────────────────────────

function pushToLostZone(player, card) {
  if (!player.zones.lostZone) player.zones.lostZone = [];
  player.zones.lostZone.push(card);
}

// Erika's Invitation: the chosen Basic takes the Active Spot, the old Active goes to the Bench.
function switchBenchToActive(draft, player, benchRoot, events) {
  const active = activeOf(player);
  if (!active) {
    promoteToActive(player, benchRoot, events);
    return;
  }
  for (const card of [active, ...attachedCards(player, active.instanceId)]) {
    removeFromZones(player, card);
    player.zones.bench.push(card);
  }
  for (const card of [benchRoot, ...attachedCards(player, benchRoot.instanceId)]) {
    removeFromZones(player, card);
    player.zones.active.push(card);
  }
  // The switch comes from a Trainer card, but it is the opponent's Active that
  // moved during the initiator's turn (Spikemuth's "their turn" doesn't hold).
  applyStadiumSwitchTriggers(draft, {
    switchedOut: active,
    switchedIn: benchRoot,
    switchedOutPlayerId: player.playerId,
    switchedInPlayerId: player.playerId,
    viaTrainer: true,
    duringOwnersTurn: false,
    events,
  });
  clearConditions(active);
  events.push({
    type: 'cardSwitched',
    playerId: player.playerId,
    activeId: active.instanceId,
    benchId: benchRoot.instanceId,
  });
}

// Revive / Echoing Horn / Pokémon Flute — a Basic from a discard pile onto that side's Bench.
function reviveFromDiscard(ctx) {
  const { player, opponent, step } = ctx;
  const side = step.side === 'opponent' ? opponent : player;
  if (!side) return skip(ctx, 'no_opponent');
  if (benchRootsOf(side).length >= BENCH_LIMIT) return skip(ctx, 'bench_full');
  const basics = (side.zones.discard || []).filter((c) => isPokemon(c) && stageOf(c) === 'Basic');
  if (ctx.selection) {
    const card = basics.find((c) => c.instanceId === ctx.selection[0]);
    if (!card) return skip(ctx, 'target_not_found');
    removeFromZones(side, card);
    side.zones.bench.push(card);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'discard',
      to: 'bench',
      playerId: side.playerId,
    });
    return null;
  }
  if (basics.length === 0) return skip(ctx, 'empty_discard');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a Basic Pokémon from ${
      side === player ? 'your' : "your opponent's"
    } discard pile to put onto the Bench`,
    options: basics,
    min: 1,
    max: 1,
  });
}

function moveCountersBetween(ctx, from, to, counters, fromSide, toSide) {
  const moved = counters * 10;
  from.damage = Math.max(0, (from.damage || 0) - moved);
  to.damage = (to.damage || 0) + moved;
  ctx.events.push({ type: 'damageUpdated', instanceId: from.instanceId, damage: from.damage });
  ctx.events.push({ type: 'damageUpdated', instanceId: to.instanceId, damage: to.damage });
  ctx.events.push({
    type: 'damageCountersPlaced',
    instanceId: to.instanceId,
    victimPlayerId: toSide.playerId,
    attackerPlayerId: fromSide.playerId,
    damage: to.damage,
  });
}

// Damage Pump / Agatha / Grimsley / Damage Mover — move damage counters between Pokémon.
function moveDamageCountersStep(ctx) {
  const { player, opponent, step } = ctx;
  const fromSide = step.from === 'opponent' ? opponent : player;
  const toSide = step.to === 'opponent' || step.to === 'opponentActive' ? opponent : player;
  if (!fromSide || !toSide) return skip(ctx, 'no_opponent');

  const donors = (step.from === 'ownActive' ? [activeOf(player)].filter(Boolean) : rootsOf(fromSide)).filter(
    (c) => (c.damage || 0) > 0
  );
  const receivers = () =>
    step.to === 'opponentActive' ? [activeOf(toSide)].filter(Boolean) : rootsOf(toSide);
  const countersFor = (from) => Math.min(step.count || 1, Math.floor((from.damage || 0) / 10));

  const move = (from, to) => {
    const counters = countersFor(from);
    if (counters <= 0) return skip(ctx, 'no_damage_to_move');
    moveCountersBetween(ctx, from, to, counters, fromSide, toSide);
    return null;
  };

  if (ctx.memo?.phase === 'target') {
    const from = donors.find((c) => c.instanceId === ctx.memo.fromId);
    const to = receivers().find((c) => c.instanceId === ctx.selection?.[0]);
    if (!from || !to) return skip(ctx, 'target_not_found');
    return move(from, to);
  }

  if (ctx.selection) {
    const from = donors.find((c) => c.instanceId === ctx.selection[0]);
    if (!from) return skip(ctx, 'target_not_found');
    const options = receivers().filter((c) => c.instanceId !== from.instanceId);
    if (options.length === 0) return skip(ctx, 'no_receiver');
    if (options.length === 1) return move(from, options[0]);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon to move the damage counters to`,
      options,
      min: 1,
      max: 1,
      memo: { phase: 'target', fromId: from.instanceId },
    });
  }

  if (donors.length === 0) return skip(ctx, 'no_damage_to_move');
  if (donors.length === 1) {
    const from = donors[0];
    const options = receivers().filter((c) => c.instanceId !== from.instanceId);
    if (options.length === 0) return skip(ctx, 'no_receiver');
    if (options.length === 1) return move(from, options[0]);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon to move the damage counters to`,
      options,
      min: 1,
      max: 1,
      memo: { phase: 'target', fromId: from.instanceId },
    });
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon with damage counters to move`,
    options: donors,
    min: 1,
    max: 1,
  });
}

// Peonia / Gladion — take Prize cards into hand; `replace` sets the same number back from hand.
function prizeToHand(ctx) {
  const { player, step } = ctx;
  const prizes = player.zones.prizes || [];

  if (ctx.memo?.phase === 'replace') {
    const wanted = ctx.memo.takeCount || 0;
    const chosen = pickById(player.zones.hand || [], ctx.selection).slice(0, wanted);
    for (const card of chosen) {
      removeFromZones(player, card);
      card.revealed = false;
      player.zones.prizes.push(card);
      ctx.events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: 'hand',
        to: 'prizes',
        playerId: player.playerId,
      });
    }
    return null;
  }

  if (ctx.selection) {
    const chosen = pickById(prizes, ctx.selection).slice(0, step.count || 1);
    for (const card of chosen) {
      removeFromZones(player, card);
      player.zones.hand.push(card);
    }
    if (chosen.length > 0) {
      ctx.events.push({ type: 'prizeTaken', playerId: player.playerId, count: chosen.length });
    }
    if (step.replace && chosen.length > 0 && (player.zones.hand || []).length > 0) {
      const wanted = Math.min(chosen.length, player.zones.hand.length);
      return ctx.ask({
        prompt: `${sourceName(ctx, 'Trainer')}: Choose ${wanted} card(s) from your hand to set face down as Prizes`,
        options: player.zones.hand,
        min: wanted,
        max: wanted,
        memo: { phase: 'replace', takeCount: wanted },
      });
    }
    return null;
  }

  if (prizes.length === 0) return skip(ctx, 'no_prizes');
  const count = Math.min(step.count || 1, prizes.length);
  // Prizes stay face down: the pick is blind, so the options carry no names (I141).
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose up to ${count} Prize card(s) to put into your hand`,
    options: prizes.map((c) => ({ ...c, faceDown: true })),
    min: 0,
    max: count,
  });
}

// Beast Ball / Hisuian Heavy Ball / Daisy's Help — look at face-down Prizes; the item
// tools may take a matching card and leave the item itself in its place.
function lookAtFaceDownPrize(ctx) {
  const { player, step } = ctx;
  const prizes = player.zones.prizes || [];
  const what = String(step.what || '').toLowerCase();
  const matches = (card) =>
    what.includes('ultra beast')
      ? isUltraBeastCard(card)
      : isPokemon(card) && stageOf(card) === 'Basic';
  const take = step.take !== false;

  // Only the owner looks, so the public event carries the count, never names (I141).
  if (!ctx.selection) {
    ctx.events.push({ type: 'cardsLookedAt', playerId: player.playerId, count: prizes.length, zone: 'prizes' });
  }
  if (!take) return null;

  const candidates = prizes.filter(matches);
  if (!ctx.selection) {
    if (candidates.length === 0) return skip(ctx, 'no_matching_prize');
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Item')}: You may reveal a matching Prize card and put it into your hand`,
      options: candidates,
      min: 0,
      max: 1,
    });
  }

  // Re-validate against the live Prizes; an empty pick declines ("you may").
  const [found] = pickById(candidates, ctx.selection);
  if (!found) return skip(ctx, 'declined');

  removeFromZones(player, found);
  player.zones.hand.push(found);
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: player.playerId,
    cards: [{ instanceId: found.instanceId, name: found.name }],
  });
  ctx.events.push({ type: 'prizeTaken', playerId: player.playerId, count: 1 });

  if (step.replace) {
    const source = (player.zones.board || []).find((c) => c.instanceId === ctx.sourceCard?.instanceId);
    if (source) {
      removeFromZones(player, source);
      player.zones.prizes.push(source);
      ctx.events.push({
        type: 'cardMoved',
        instanceId: source.instanceId,
        from: 'board',
        to: 'prizes',
        playerId: player.playerId,
      });
    }
  }
  return null;
}

// Captivating Poké Puff / Erika's Invitation — the initiator puts Basic Pokémon from the
// opponent's hand onto the opponent's Bench (and may switch one in).
function opponentHandToBenchBasic(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const basics = (opponent.zones.hand || []).filter((c) => isPokemon(c) && stageOf(c) === 'Basic');
  const space = Math.max(0, BENCH_LIMIT - benchRootsOf(opponent).length);

  if (ctx.selection) {
    const picks = pickById(basics, ctx.selection).slice(0, space);
    for (const card of picks) {
      removeFromZones(opponent, card);
      opponent.zones.bench.push(card);
      ctx.events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: 'hand',
        to: 'bench',
        playerId: opponent.playerId,
      });
    }
    if (step.switchActive && picks[0]) switchBenchToActive(ctx.draft, opponent, picks[0], ctx.events);
    return null;
  }

  revealOpponentHand(ctx);
  if (basics.length === 0 || space === 0) return skip(ctx, 'no_basic_or_space');
  const max = step.anyNumber ? Math.min(space, basics.length) : 1;
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Put ${
      step.anyNumber ? 'any number of Basic Pokémon' : 'a Basic Pokémon'
    } from your opponent's hand onto their Bench`,
    options: basics,
    min: step.anyNumber ? 0 : 1,
    max,
  });
}

// Nita / Team Star Grunt — an Energy on the opponent's Active goes on top of their deck.
function opponentActiveEnergyToDeck(ctx) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const active = activeOf(opponent);
  const energies = active ? attachedCards(opponent, active.instanceId).filter(isEnergy) : [];

  if (ctx.selection) {
    const energy = energies.find((c) => c.instanceId === ctx.selection[0]);
    if (!energy) return skip(ctx, 'target_not_found');
    removeFromZones(opponent, energy);
    energy.attachedTo = null;
    opponent.zones.deck.unshift(energy);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: energy.instanceId,
      from: 'inPlay',
      to: 'deck',
      playerId: opponent.playerId,
    });
    return null;
  }
  if (energies.length === 0) return skip(ctx, 'no_opponent_energy');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose an Energy attached to your opponent's Active Pokémon to put on top of their deck`,
    options: energies,
    min: 1,
    max: 1,
  });
}

// Volo / Giovanni's Exile — discard own Benched Pokémon (and everything attached to them).
function discardOwnBenchPokemon(ctx) {
  const { player, step } = ctx;
  const matchesFilter = (root) => {
    if (step.filter === 'V') return / v$/i.test(String(topPokemonCard(player, root)?.name || ''));
    if (step.filter === 'no damage counters') return (root.damage || 0) === 0;
    return true;
  };
  const bench = benchRootsOf(player).filter(matchesFilter);

  if (ctx.selection) {
    for (const root of pickById(bench, ctx.selection).slice(0, step.count || 1)) {
      for (const card of [root, ...attachedCards(player, root.instanceId)]) {
        discardCard(ctx.draft, card, ctx.events);
      }
    }
    return null;
  }
  if (bench.length === 0) return skip(ctx, 'no_matching_bench');
  const count = Math.min(step.count || 1, bench.length);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose up to ${count} Benched Pokémon to discard`,
    options: bench,
    min: 0,
    max: count,
  });
}

// Lost Blender / Lost Vacuum — hand cards to the Lost Zone (an unpayable cost is skipped).
function lostZoneCost(ctx) {
  const { player, step } = ctx;
  const hand = player.zones.hand || [];
  const count = step.count || 1;

  if (ctx.selection) {
    for (const card of pickById(hand, ctx.selection).slice(0, count)) {
      removeFromZones(player, card);
      pushToLostZone(player, card);
      ctx.events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: 'hand',
        to: 'lostZone',
        playerId: player.playerId,
      });
    }
    return null;
  }
  if (hand.length < count) return skip(ctx, 'not_enough_cards_to_pay');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Put ${count} card${count > 1 ? 's' : ''} from your hand in the Lost Zone`,
    options: hand,
    min: count,
    max: count,
  });
}

// Riley / Rival — the opponent chooses from the top of the initiator's deck.
function opponentChoosesFromTop(ctx) {
  const { player, opponent, step } = ctx;
  const deck = player.zones.deck || [];
  const count = Math.min(step.count || 1, deck.length);
  if (count === 0) return skip(ctx, 'empty_deck');
  const top = deck.slice(0, count);
  const chosenCount = Math.min(step.chosen || 1, count);

  const applyChoice = (picked) => {
    for (const card of picked) {
      if (step.chosenTo === 'discard') {
        discardCard(ctx.draft, card, ctx.events);
      } else {
        removeFromZones(player, card);
        player.zones.hand.push(card);
        ctx.events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: 'deck',
          to: 'hand',
          playerId: player.playerId,
        });
      }
    }
    if (step.restTo === 'hand') {
      for (const card of top.filter((c) => deck.includes(c))) {
        removeFromZones(player, card);
        player.zones.hand.push(card);
        ctx.events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: 'deck',
          to: 'hand',
          playerId: player.playerId,
        });
      }
    }
    return null;
  };

  if (ctx.selection) return applyChoice(pickById(top, ctx.selection).slice(0, chosenCount));
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: player.playerId,
    cards: top.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  if (!opponent) return applyChoice(top.slice(0, chosenCount));
  return ctx.ask({
    player: opponent.playerId,
    prompt: `${sourceName(ctx, 'Trainer')}: Choose ${chosenCount} of the top ${count} cards of your opponent's deck`,
    options: top,
    min: chosenCount,
    max: chosenCount,
  });
}

// Hand Scope / Alph Lithograph / Psychic's Third Eye — reveal the opponent's hand.
function lookAtOpponentHand(ctx) {
  if (!ctx.opponent) return skip(ctx, 'no_opponent');
  revealOpponentHand(ctx);
  return null;
}

// Morty / Rocket's Sneak Attack / Team Rocket's Evil Deeds — the initiator shuffles
// chosen cards from the opponent's hand into their deck.
function opponentHandShuffleDeck(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const hand = opponent.zones.hand || [];
  const pool =
    step.what === 'Trainer'
      ? hand.filter((c) => isTrainer(c) || isStadiumCard(c) || isToolCard(c))
      : hand;
  // Peeking Red Card shuffles the WHOLE hand ("those cards"), not a chosen 1.
  const count = step.all ? pool.length : Math.min(step.count || 1, pool.length);

  const finish = (moved) => {
    if (moved > 0) shuffleDeck(opponent, ctx);
    if (step.optionalOpponentDraw && moved > 0) drawCards(opponent, 1, ctx.events);
    // "…shuffle those cards into their deck, then draw that many cards."
    if (step.drawThatMany && moved > 0) drawCards(opponent, moved, ctx.events);
    return null;
  };

  if (ctx.selection) {
    const chosen = pickById(pool, ctx.selection).slice(0, count);
    for (const card of chosen) {
      removeFromZones(opponent, card);
      opponent.zones.deck.push(card);
    }
    return finish(chosen.length);
  }
  revealOpponentHand(ctx);
  if (pool.length === 0) return skip(ctx, 'no_matching_cards');
  // Whole-hand shuffle (Peeking Red Card): no picker — move everything.
  // Snapshot first: `pool` aliases opponent.zones.hand, and removing while
  // iterating it skips every other card.
  if (step.all) {
    const all = [...pool];
    for (const card of all) {
      removeFromZones(opponent, card);
      opponent.zones.deck.push(card);
    }
    return finish(all.length);
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose ${step.upTo ? 'up to ' : ''}${count} card${
      count > 1 ? 's' : ''
    } from your opponent's hand to shuffle into their deck`,
    options: pool,
    min: step.upTo ? 0 : count,
    max: count,
  });
}

// Psychic's Third Eye / Secret Mission — discard any number from hand, then draw that many.
function discardAnyThenDraw(ctx) {
  const { player } = ctx;
  const hand = player.zones.hand || [];

  if (ctx.selection) {
    const chosen = pickById(hand, ctx.selection);
    for (const card of chosen) {
      removeFromZones(player, card);
      discardCardToPlayerZone(player, card);
    }
    if (chosen.length > 0) {
      ctx.events.push({
        type: 'cardsDiscarded',
        playerId: player.playerId,
        cards: chosen.map((c) => ({ instanceId: c.instanceId, name: c.name })),
      });
      drawCards(player, chosen.length, ctx.events);
    }
    return null;
  }
  if (hand.length === 0) return skip(ctx, 'empty_hand');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Discard any number of cards from your hand, then draw that many`,
    options: hand,
    min: 0,
    max: hand.length,
  });
}

// Maintenance / Mary — shuffle chosen cards from hand into the deck, then draw.
function shuffleHandCardsThenDraw(ctx) {
  const { player, step } = ctx;
  const hand = player.zones.hand || [];
  const count = Math.min(step.count || 1, hand.length);

  if (ctx.selection) {
    const chosen = pickById(hand, ctx.selection).slice(0, count);
    for (const card of chosen) {
      removeFromZones(player, card);
      player.zones.deck.push(card);
    }
    if (chosen.length > 0) shuffleDeck(player, ctx);
    drawCards(player, step.draw || 1, ctx.events);
    return null;
  }
  if (count === 0) return skip(ctx, 'empty_hand');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Shuffle ${count} card${count > 1 ? 's' : ''} from your hand into your deck`,
    options: hand,
    min: count,
    max: count,
  });
}

// Quick Ball / Fast Ball / Random Receiver — reveal from the top until the first match.
function revealUntilCard(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck || [];
  const what = String(step.what || '').toLowerCase();
  const matches = (card) => {
    if (what.includes('supporter')) return matchesSearch(card, 'Supporter');
    if (what.includes('pokémon')) {
      if (!isPokemon(card)) return false;
      return what.includes('evolution') ? stageOf(card) !== 'Basic' : true;
    }
    if (what.includes('evolution')) return isPokemon(card) && stageOf(card) !== 'Basic';
    return matchesSearch(card, step.what);
  };

  const index = deck.findIndex(matches);
  if (index < 0) {
    ctx.events.push({ type: 'cardsLookedAt', playerId: player.playerId, count: deck.length });
    shuffleDeck(player, ctx);
    return null;
  }
  const revealed = deck.slice(0, index + 1);
  const found = deck[index];
  removeFromZones(player, found);
  player.zones.hand.push(found);
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: player.playerId,
    cards: revealed.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  ctx.events.push({
    type: 'cardMoved',
    instanceId: found.instanceId,
    from: 'deck',
    to: 'hand',
    playerId: player.playerId,
  });
  shuffleDeck(player, ctx);
  return null;
}

// Ether / Gutsy Pickaxe — reveal the top card; attach it when it is the named Energy.
function revealTopEnergy(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck || [];
  const top = deck[0];
  if (!top) return skip(ctx, 'empty_deck');

  if (ctx.memo?.phase === 'attach') {
    const card = deck.find((c) => c.instanceId === ctx.memo.cardId);
    const target = rootsOf(player).find((c) => c.instanceId === ctx.selection?.[0]);
    if (!card || !target) return skip(ctx, 'target_not_found');
    attachTo(player, card, target, ctx.events);
    return null;
  }

  const want = String(step.energy || '').toLowerCase();
  const energyMatch =
    isEnergy(top) &&
    (want.includes('basic') ? isBasicEnergy(top) : matchesSearch(top, `${want} Energy`));
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: player.playerId,
    cards: [{ instanceId: top.instanceId, name: top.name }],
  });

  if (!energyMatch) {
    // Ether's non-matching card stays on top ("return it to the top of your deck").
    if (step.restTo === 'top') return null;
    removeFromZones(player, top);
    player.zones.hand.push(top);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: top.instanceId,
      from: 'deck',
      to: 'hand',
      playerId: player.playerId,
    });
    return null;
  }
  const targets = rootsOf(player).filter((root) => !step.toBench || zoneIdOf(player, root) === 'bench');
  if (targets.length === 0) return skip(ctx, 'no_attach_target');
  if (targets.length === 1) {
    attachTo(player, top, targets[0], ctx.events);
    return null;
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon to attach ${top.name} to`,
    options: targets,
    min: 1,
    max: 1,
    memo: { phase: 'attach', cardId: top.instanceId },
  });
}

// Lost Vacuum — a Tool attached to any Pokémon, or the Stadium in play, goes to the Lost Zone.
function toolOrStadiumToLostZone(ctx) {
  // Lost Vacuum: a Tool on any Pokémon, or any Stadium in play.
  // Faba: a Tool/Special Energy on an OPPONENT's Pokémon, or any Stadium.
  const sides = ctx.step.side === 'opponent' ? [ctx.opponent] : [ctx.player, ctx.opponent];
  const tools = allAttachedMatching(
    ctx,
    sides,
    (c) => isToolCard(c) || (ctx.step.includeSpecialEnergy && isSpecialEnergyCard(c))
  );
  const stadium = ctx.draft.stadium;
  const options = [...tools];
  if (stadium) options.push(stadium);

  if (ctx.selection) {
    const id = ctx.selection[0];
    if (stadium && stadium.instanceId === id) {
      ctx.draft.stadium = null;
      const owner =
        ctx.draft.players[stadium.ownerId] || ctx.draft.players[stadium.playerId] || ctx.player;
      pushToLostZone(owner, stadium);
      ctx.events.push({
        type: 'cardMoved',
        instanceId: id,
        from: 'stadium',
        to: 'lostZone',
        playerId: owner.playerId,
      });
      return null;
    }
    const tool = tools.find((c) => c.instanceId === id);
    if (!tool) return skip(ctx, 'target_not_found');
    const owner = findCard(ctx.draft, id)?.player || ctx.player;
    removeFromZones(owner, tool);
    tool.attachedTo = null;
    pushToLostZone(owner, tool);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: id,
      from: 'inPlay',
      to: 'lostZone',
      playerId: owner.playerId,
    });
    return null;
  }
  if (options.length === 0) return skip(ctx, 'nothing_to_move');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon Tool or Stadium in play to put in the Lost Zone`,
    options,
    min: 1,
    max: 1,
  });
}

// Ancient Technical Machine / Cube Items — attach the Item to a Pokémon and grant its attack.
function attachAttackTool(ctx) {
  const { player, step, sourceCard } = ctx;
  const tool =
    (player.zones.board || []).find((c) => c.instanceId === sourceCard?.instanceId) ||
    (player.zones.hand || []).find((c) => c.instanceId === sourceCard?.instanceId);
  if (!tool) return skip(ctx, 'card_not_found');
  const targets = rootsOf(player).filter((root) => rootMatchesTarget(player, root, step.target));
  const attach = (target) => {
    attachTo(player, tool, target, ctx.events);
    if (step.discardAtEndOfTurn) tool.discardAtEndOfTurn = true;
    return null;
  };

  if (ctx.selection) {
    const target = targets.find((c) => c.instanceId === ctx.selection[0]);
    if (!target) return skip(ctx, 'target_not_found');
    return attach(target);
  }
  if (targets.length === 0) return skip(ctx, 'no_attach_target');
  if (targets.length === 1) return attach(targets[0]);
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
//
// When a single Energy moves and more than one of your Pokémon holds one, the source Pokémon is
// chosen first (the client renders in-play roots on the mat picker, so the player clicks the
// Pokémon). A lone matching Energy on that Pokémon is taken automatically; only several matching
// Energies on one Pokémon fall back to the Energy card picker. Multi-Energy moves keep the
// Energy-first flow.
function moveEnergyAbility(ctx) {
  const { player, step } = ctx;
  const self = rootsOf(player).find((c) => c.instanceId === ctx.sourceCard?.instanceId) || null;
  const fixedDestination =
    step.target === 'active' ? activeOf(player) : step.target === 'bench' || step.target === 'between' ? null : self;
  const sources = moveEnergySources(player, step, self).filter(
    (c) => c.instanceId !== fixedDestination?.instanceId
  );
  const energiesOn = (root) =>
    attachedCards(player, root?.instanceId).filter((c) => moveEnergyMatches(step, c));
  const allEnergies = () => sources.flatMap((root) => energiesOn(root));

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
    const chosen = pickById(allEnergies(), ctx.memo.energyIds || []);
    const target = rootsOf(player).find((c) => c.instanceId === ctx.selection?.[0]);
    if (!target || chosen.length === 0) return skip(ctx, 'target_not_found');
    return moveAll(chosen, target);
  }
  if (ctx.memo?.phase === 'energy') {
    const source = sources.find((c) => c.instanceId === ctx.memo.sourceId);
    const chosen = pickById(source ? energiesOn(source) : [], ctx.selection);
    if (chosen.length === 0) return skip(ctx, 'target_not_found');
    return toChosenTarget(chosen);
  }
  if (ctx.memo?.phase === 'source') {
    const source = sources.find((c) => c.instanceId === ctx.selection?.[0]);
    const onSource = source ? energiesOn(source) : [];
    if (onSource.length === 0) return skip(ctx, 'target_not_found');
    if (onSource.length === 1) return toChosenTarget(onSource);
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: Choose an Energy to move`,
      options: onSource,
      min: 1,
      max: 1,
      memo: { phase: 'energy', sourceId: source.instanceId },
    });
  }
  if (ctx.selection && !ctx.memo?.phase) {
    const chosen = pickById(allEnergies(), ctx.selection);
    if (chosen.length === 0) return skip(ctx, 'target_not_found');
    return toChosenTarget(chosen);
  }

  if (step.target !== 'bench' && step.target !== 'between' && !fixedDestination) {
    return skip(ctx, 'target_not_found');
  }
  if (step.source === 'self' && !self) return skip(ctx, 'source_not_in_play');

  const energies = allEnergies();
  if (energies.length === 0) return skip(ctx, 'no_energy_to_move');

  const cap = step.anyAmount ? energies.length : Math.min(Number(step.upTo) || 1, energies.length);
  const min = step.anyAmount ? 1 : step.exact ? cap : 1;
  // A forced move with nothing to decide (the only Energy that qualifies) needs no prompt.
  if (energies.length === min && min === cap) return toChosenTarget(energies);

  const sourcesWithEnergy = sources.filter((root) => energiesOn(root).length > 0);
  if (!step.anyAmount && cap === 1 && sourcesWithEnergy.length > 1) {
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: Choose a Pokémon to move Energy from`,
      options: sourcesWithEnergy,
      min: 1,
      max: 1,
      memo: { phase: 'source' },
    });
  }

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
      type: step.attackerTypeLetter ? TYPE_LETTER[step.attackerTypeLetter] || null : null,
      attackerNoRuleBox: false,
      attackerBasic: step.attackerBasic === true,
      defenderFilter: null,
      attackerInstanceId: step.team ? null : ctx.sourceCard?.instanceId ?? null,
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

// ── design 034 slice 6: one-off ability executables ─────────────────────

/** The in-play root of the Pokémon using the Ability (its evolution card may be the source). */
function sourceRoot(ctx) {
  const id = ctx.sourceCard?.attachedTo ?? ctx.sourceCard?.instanceId;
  return rootsOf(ctx.player).find((c) => c.instanceId === id) || null;
}

/** Discards an in-play Pokémon with everything attached; counters and conditions leave with it. */
function discardInPlayPokemon(player, root, events) {
  const cards = [root, ...attachedCards(player, root.instanceId)];
  for (const card of cards) {
    removeFromZones(player, card);
    card.attachedTo = null;
    discardCardToPlayerZone(player, card);
  }
  root.damage = 0;
  clearConditions(root);
  events.push({
    type: 'cardsDiscarded',
    playerId: player.playerId,
    cards: cards.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
}

function winConditionMet(ctx, condition) {
  const { player, opponent } = ctx;
  if (condition.kind === 'opponentLostZoneSupporters') {
    const lost = opponent?.zones?.lostZone || [];
    return lost.filter(isSupporterTrainer).length >= condition.count;
  }
  if (condition.kind === 'handSize') return (player.zones.hand || []).length >= condition.count;
  if (condition.kind === 'benchDamageCounters') {
    const counters = benchRootsOf(player).reduce((sum, root) => sum + Math.floor((root.damage || 0) / 10), 0);
    return counters >= condition.count;
  }
  return false;
}

/**
 * Unown MISSING / HAND / DAMAGE: "If you do, you win this game." The reducer ends the game
 * on the `abilityWinsGame` event (setGameEnded lives there); an unmet threshold is not spent.
 */
function winGameAbility(ctx) {
  const { step, player } = ctx;
  if (!step.condition) return skip(ctx, 'unknown_condition');
  if (!winConditionMet(ctx, step.condition)) return skip(ctx, 'condition_unmet');
  ctx.events.push({
    type: 'abilityWinsGame',
    playerId: player.playerId,
    reason: `${sourceName(ctx, 'Ability')} Ability`,
  });
  return null;
}

/** Genesect V Fusion Strike System: draw until the hand matches the tagged Pokémon in play. */
function drawVariableAbility(ctx) {
  const { player, step } = ctx;
  if (!step.countTag) return skip(ctx, 'unknown_count');
  const target = rootsOf(player).filter((root) => rootHasTag(player, root, step.countTag)).length;
  const toDraw = Math.min(target - player.zones.hand.length, player.zones.deck.length);
  if (toDraw <= 0) return skip(ctx, 'nothing_to_draw');
  drawCards(player, toDraw, ctx.events);
  return null;
}

/** Rotom VSTAR Conversion Star: discard any number of cards from your hand, then draw that many. */
function discardForDrawAbility(ctx) {
  const { player } = ctx;
  if (ctx.selection) {
    const picked = pickById(player.zones.hand, ctx.selection);
    if (picked.length === 0) return skip(ctx, 'nothing_discarded');
    for (const card of picked) {
      removeFromZones(player, card);
      discardCardToPlayerZone(player, card);
    }
    ctx.events.push({
      type: 'cardsDiscarded',
      playerId: player.playerId,
      cards: picked.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
    drawCards(player, picked.length, ctx.events);
    return null;
  }
  if (player.zones.hand.length === 0) return skip(ctx, 'empty_hand');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose cards to discard, then draw that many`,
    options: player.zones.hand,
    min: 1,
    max: player.zones.hand.length,
  });
}

/** Aipom Scampering Tail: the top card of the opponent's deck goes to the bottom, unseen. */
function deckPlaceAbility(ctx) {
  const deck = ctx.opponent?.zones?.deck || [];
  if (deck.length < 2) return skip(ctx, 'deck_too_small');
  deck.push(deck.shift());
  ctx.events.push({ type: 'cardsMovedToDeckBottom', count: 1, playerId: ctx.opponent.playerId });
  return null;
}

/** Hydreigon Weed Out: keep the chosen Benched Pokémon, discard the others. */
function discardBenchAbility(ctx) {
  const { player, step } = ctx;
  const bench = benchRootsOf(player);
  const keep = step.keep || 0;
  if (!(keep > 0)) return skip(ctx, 'unknown_keep_count');
  if (bench.length <= keep) return skip(ctx, 'nothing_to_discard');
  if (ctx.selection) {
    const kept = new Set(ctx.selection);
    if (kept.size !== keep) return skip(ctx, 'wrong_keep_count');
    for (const root of bench.filter((c) => !kept.has(c.instanceId))) {
      discardInPlayPokemon(player, root, ctx.events);
    }
    return null;
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose ${keep} Benched Pokémon to keep (the rest are discarded)`,
    options: bench,
    min: keep,
    max: keep,
  });
}

function basicEnergyKind(card) {
  const type = card.energyType || (Array.isArray(card.types) ? card.types[0] : null) || card.name || '';
  return String(type).toLowerCase().replace(/\s*energy$/, '');
}

/**
 * Smeargle Second Coat: switch a basic Energy attached to your Active Pokémon with a different
 * type of basic Energy card from your discard pile. Two picks: the attached Energy, then the
 * replacement.
 */
function energySwapAbility(ctx) {
  const { player } = ctx;
  const active = activeOf(player);
  if (!active) return skip(ctx, 'no_active');
  const attached = attachedCards(player, active.instanceId).filter(isBasicEnergy);
  const replacements = (outgoing) =>
    player.zones.discard.filter(
      (c) => isBasicEnergy(c) && basicEnergyKind(c) !== basicEnergyKind(outgoing)
    );

  if (ctx.memo?.phase === 'replacement') {
    const outgoing = attached.find((c) => c.instanceId === ctx.memo.outgoingId);
    const incoming = outgoing && replacements(outgoing).find((c) => c.instanceId === ctx.selection?.[0]);
    if (!incoming) return skip(ctx, 'target_not_found');
    removeFromZones(player, incoming);
    attachTo(player, incoming, active, ctx.events);
    removeFromZones(player, outgoing);
    outgoing.attachedTo = null;
    discardCardToPlayerZone(player, outgoing);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: outgoing.instanceId,
      from: 'active',
      to: 'discard',
      playerId: player.playerId,
    });
    return null;
  }

  const swappable = attached.filter((c) => replacements(c).length > 0);
  if (ctx.selection) {
    const outgoing = swappable.find((c) => c.instanceId === ctx.selection[0]);
    if (!outgoing) return skip(ctx, 'target_not_found');
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Ability')}: Choose a basic Energy from your discard pile to attach instead of ${outgoing.name}`,
      options: replacements(outgoing),
      min: 1,
      max: 1,
      memo: { phase: 'replacement', outgoingId: outgoing.instanceId },
    });
  }
  if (swappable.length === 0) return skip(ctx, 'no_swap_candidates');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose a basic Energy attached to your Active Pokémon to switch`,
    options: swappable,
    min: 1,
    max: 1,
  });
}

function putStadiumIntoPlay(ctx, card) {
  const { draft, player } = ctx;
  removeFromZones(player, card);
  card.attachedTo = null;
  card.ownerId = card.ownerId || player.playerId;
  draft.stadium = card;
  for (const p of Object.values(draft.players || {})) {
    if (p.flags) p.flags.stadiumUsedThisTurn = false;
  }
  ctx.events.push({
    type: 'cardMoved',
    instanceId: card.instanceId,
    from: 'discard',
    to: 'stadium',
    playerId: player.playerId,
  });
}

/**
 * "Discard any Stadium card in play" (Haxorus Grind Up, Marshadow Resetting Hole, Gothitelle
 * Teleport Room). `replace` then puts a differently named Stadium from your discard pile into
 * play; `discardSelf` discards this Benched Pokémon. The `abilityStadiumDiscarded` event gates
 * any "If you do, …" steps parsed after this one (`requiresStadiumDiscard`).
 */
function stadiumManipAbility(ctx) {
  const { draft, player, step } = ctx;
  if (ctx.memo?.phase === 'replace') {
    const incoming = player.zones.discard.find(
      (c) => c.instanceId === ctx.selection?.[0] && isStadiumCard(c) && c.name !== ctx.memo.discardedName
    );
    if (incoming) putStadiumIntoPlay(ctx, incoming);
    return null;
  }
  if (!draft.stadium) return skip(ctx, 'no_stadium');
  const self = step.discardSelf ? sourceRoot(ctx) : null;
  if (step.discardSelf && (!self || zoneIdOf(player, self) !== 'bench')) {
    return skip(ctx, 'source_not_on_bench');
  }
  const discarded = discardCurrentStadium(draft, ctx.events, player.playerId);
  ctx.events.push({ type: 'abilityStadiumDiscarded', playerId: player.playerId, instanceId: discarded?.instanceId });
  if (self) discardInPlayPokemon(player, self, ctx.events);
  if (!step.replace) return null;
  const options = player.zones.discard.filter((c) => isStadiumCard(c) && c.name !== discarded?.name);
  if (options.length === 0) return null;
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose a Stadium from your discard pile to put into play`,
    options,
    min: 1,
    max: 1,
    memo: { phase: 'replace', discardedName: discarded?.name ?? null },
  });
}

// Per-Pokémon state that "any other effects remain on the new Pokémon" carries over.
const IN_PLAY_STATE_KEYS = [
  'damage',
  'enteredPlayTurn',
  'playedToBenchTurn',
  'lastEvolvedTurn',
  'movedToActiveTurn',
  'cannotAttackUntilTurn',
  'cannotRetreatUntilTurn',
  'cannotAttackAttackName',
  'attackMarkers',
];

function transformCandidates(ctx, outgoing) {
  const { player, step } = ctx;
  const pool = player.zones[step.source] || [];
  const except = step.except ? step.except.toLowerCase() : null;
  const wantsV = / v$/.test(step.what || '');
  return pool.filter((c) => {
    if (c === outgoing || !isPokemon(c)) return false;
    if (except && String(c.name || '').toLowerCase().includes(except)) return false;
    if (wantsV && !/\bv$/i.test(c.name || '') && !textOf(c, 'subtypes').split(' ').includes('v')) {
      return false;
    }
    return matchesSearch(c, (step.what || '').replace(/ v$/, ''));
  });
}

// `incoming` takes `outgoing`'s place in play with everything on it (Stance Change, Schooling,
// V Transformation). An evolution card on a stack is swapped within the stack.
function swapInPlace(player, outgoing, incoming, events) {
  const zone = player.zones[zoneIdOf(player, outgoing)];
  removeFromZones(player, incoming);
  zone.splice(zone.indexOf(outgoing), 1, incoming);
  if (outgoing.attachedTo != null) {
    incoming.attachedTo = outgoing.attachedTo;
  } else {
    incoming.attachedTo = null;
    for (const key of IN_PLAY_STATE_KEYS) {
      if (outgoing[key] !== undefined) incoming[key] = outgoing[key];
      delete outgoing[key];
    }
    outgoing.damage = 0;
    copyConditions(outgoing, incoming);
    clearConditions(outgoing);
    for (const card of attachedCards(player, outgoing.instanceId)) {
      card.attachedTo = incoming.instanceId;
    }
  }
  outgoing.attachedTo = null;
  // The card leaving play keeps no once-per-turn marker; the incoming card is a different
  // card, so its own Ability stays usable.
  outgoing.abilityUsed = false;
  events.push({
    type: 'pokemonSwapped',
    playerId: player.playerId,
    instanceId: incoming.instanceId,
    replacedInstanceId: outgoing.instanceId,
  });
}

/**
 * Transform Abilities (design 034 slice 6): Aegislash Stance Change / Wishiwashi Schooling
 * (a named card from hand, the old one returns to hand), Ditto V V Transformation (discard
 * pile, the old one is discarded), Zoroark Phantom Transformation / Ditto Transformative Start
 * (discard this Pokémon and its cards, the chosen Pokémon enters fresh in its place), Ditto
 * Transform (a hand Basic goes on top of this Pokémon). The chosen card is re-checked against
 * the live zone on resume, so a stale pick does nothing.
 */
function transformAbility(ctx) {
  const { draft, player, step } = ctx;
  const outgoing = findCard(draft, ctx.sourceCard?.instanceId)?.card;
  const root = sourceRoot(ctx);
  if (!outgoing || !root) return skip(ctx, 'source_not_in_play');
  const candidates = transformCandidates(ctx, outgoing);

  if (ctx.selection) {
    const incoming = candidates.find((c) => c.instanceId === ctx.selection[0]);
    if (!incoming) return skip(ctx, 'target_not_found');
    if (step.onTop) {
      attachTo(player, incoming, root, ctx.events);
    } else if (step.keepState) {
      swapInPlace(player, outgoing, incoming, ctx.events);
      if (step.source === 'hand') player.zones.hand.push(outgoing);
      else discardCardToPlayerZone(player, outgoing);
    } else {
      const zone = player.zones[zoneIdOf(player, root)];
      discardInPlayPokemon(player, root, ctx.events);
      removeFromZones(player, incoming);
      incoming.attachedTo = null;
      incoming.enteredPlayTurn = draft.turn?.number ?? null;
      zone.push(incoming);
      ctx.events.push({
        type: 'pokemonSwapped',
        playerId: player.playerId,
        instanceId: incoming.instanceId,
        replacedInstanceId: root.instanceId,
      });
    }
    if (step.shuffle) shuffleDeck(player, ctx);
    return null;
  }
  if (candidates.length === 0) return skip(ctx, 'no_transform_target');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose the Pokémon to put in this Pokémon's place`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

function selfAttachTargets(ctx, self) {
  const { player, step } = ctx;
  const filter = step.targetFilter || '';
  const names = /\{[a-z]\}|^pok[eé]mon$/.test(filter) ? [] : filter.split(/\s+or\s+/);
  return rootsOf(player).filter((root) => {
    // A Knocked Out holder can't receive itself, whether or not the text says "other".
    if ((step.targetOther || step.knockOutSelf) && root.instanceId === self?.instanceId) return false;
    if (!rootMatchesTarget(player, root, filter)) return false;
    if (names.length === 0) return true;
    const name = String(topPokemonCard(player, root)?.name || '').toLowerCase();
    return names.some((n) => name === n.trim());
  });
}

/**
 * Electrode Buzzap / Buzzap Thunder (Knock Out this Pokémon and attach it as a Special Energy)
 * and Charjabug Battery (attach this card from your hand as a Special Energy). The attached card
 * carries `asEnergy.provides`; the Knock Out itself — Prizes, discarding the rest of the stack,
 * promotion — is the reducer's (`abilitySelfKnockOut`, settleAbilityOutcomes).
 */
function selfAttachEnergyAbility(ctx) {
  const { draft, player, step } = ctx;
  const card = findCard(draft, ctx.sourceCard?.instanceId)?.card;
  if (!card || !step.provides) return skip(ctx, 'source_not_found');
  const self = step.fromHand ? null : sourceRoot(ctx);
  if (step.fromHand ? !player.zones.hand.includes(card) : !self) {
    return skip(ctx, 'source_not_found');
  }
  const targets = selfAttachTargets(ctx, self);

  const attach = (target) => {
    if (step.knockOutSelf) {
      ctx.events.push({
        type: 'abilitySelfKnockOut',
        playerId: player.playerId,
        rootId: self.instanceId,
        cardId: card.instanceId,
        targetId: target.instanceId,
        provides: [...step.provides],
      });
      return null;
    }
    card.asEnergy = { provides: [...step.provides] };
    attachTo(player, card, target, ctx.events);
    return null;
  };

  if (ctx.selection) {
    const target = targets.find((c) => c.instanceId === ctx.selection[0]);
    if (!target) return skip(ctx, 'target_not_found');
    return attach(target);
  }
  if (targets.length === 0) return skip(ctx, 'no_attach_target');
  if (targets.length === 1) return attach(targets[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Ability')}: Choose a Pokémon to attach this card to as Energy`,
    options: targets,
    min: 1,
    max: 1,
  });
}

// ── I154: the parsed Trainer step kinds that had no server executor ───────

/** Attached Energy a step's `energy` filter selects ('Special Energy' or any). */
function attachedEnergyMatches(card, spec) {
  if (!isEnergy(card)) return false;
  return String(spec || '').includes('Special') ? isSpecialEnergy(card) : true;
}

// Alph Lithograph: return the Stadium in play to its owner's hand.
function returnStadiumToHand(ctx) {
  const stadium = ctx.draft.stadium;
  if (!stadium) return skip(ctx, 'no_stadium');
  const owner = (stadium.ownerId && ctx.draft.players[stadium.ownerId]) || ctx.player;
  ctx.draft.stadium = null;
  stadium.ownerId = null;
  owner.zones.hand.push(stadium);
  ctx.events.push({
    type: 'cardMoved',
    instanceId: stadium.instanceId,
    from: 'stadium',
    to: 'hand',
    playerId: owner.playerId,
  });
  return null;
}

// Alph Lithograph: shuffle your deck.
function shuffleDeckOnly(ctx) {
  shuffleDeck(ctx.player, ctx);
  return null;
}

// Buddy-Buddy Rescue: each player takes a Pokémon from their discard; opponent first.
function eachPlayerRecoverPokemon(ctx) {
  const order = [ctx.opponent, ctx.player].filter(Boolean);
  let turn = ctx.memo?.turn ?? 0;
  const recover = (owner, card) => {
    removeFromZones(owner, card);
    owner.zones.hand.push(card);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'discard',
      to: 'hand',
      playerId: owner.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const owner = order[turn];
    const card = owner.zones.discard.find((c) => c.instanceId === ctx.selection[0]);
    if (card) recover(owner, card);
    turn += 1;
  }
  for (; turn < order.length; turn++) {
    const owner = order[turn];
    const candidates = (owner.zones.discard || []).filter(isPokemon);
    if (candidates.length === 0) continue;
    return ctx.ask({
      player: owner.playerId,
      prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon from your discard pile`,
      options: candidates,
      min: 1,
      max: 1,
      memo: { turn },
    });
  }
  return null;
}

// Caitlin: put any number of hand cards on the bottom, then draw that many.
function putHandBottomThenDraw(ctx) {
  const { player } = ctx;
  const hand = player.zones.hand || [];
  if (ctx.selection) {
    const chosen = pickById(hand, ctx.selection);
    for (const card of chosen) removeFromZones(player, card);
    player.zones.deck.push(...chosen);
    ctx.events.push({ type: 'cardsMovedToDeckBottom', count: chosen.length, playerId: player.playerId });
    drawCards(player, chosen.length, ctx.events);
    return null;
  }
  if (hand.length === 0) return skip(ctx, 'empty_hand');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Put any number of cards from your hand on the bottom of your deck`,
    options: hand,
    min: 0,
    max: hand.length,
  });
}

// Eneporter: move a Special Energy between the opponent's Pokémon.
function moveEnergyOpponent(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const roots = rootsOf(opponent);
  const energies = roots
    .flatMap((root) => attachedCards(opponent, root.instanceId))
    .filter((c) => attachedEnergyMatches(c, step.energy));
  if (ctx.memo?.phase === 'target') {
    const energy = energies.find((c) => c.instanceId === ctx.memo.energyId);
    const target = roots.find((c) => c.instanceId === ctx.selection?.[0]);
    if (!energy || !target) return skip(ctx, 'target_not_found');
    attachTo(opponent, energy, target, ctx.events);
    return null;
  }
  if (ctx.selection) {
    const energy = energies.find((c) => c.instanceId === ctx.selection[0]);
    if (!energy) return skip(ctx, 'target_not_found');
    const targets = roots.filter((c) => c.instanceId !== energy.attachedTo);
    if (targets.length === 0) return skip(ctx, 'no_target');
    return ctx.ask({
      prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon to move ${energy.name} to`,
      options: targets,
      min: 1,
      max: 1,
      memo: { phase: 'target', energyId: energy.instanceId },
    });
  }
  if (energies.length === 0 || roots.length < 2) return skip(ctx, 'no_energy_to_move');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose an Energy to move`,
    options: energies,
    min: 1,
    max: 1,
  });
}

// Fan of Waves / Lost Remover: send an attached Special Energy to the deck bottom / Lost Zone.
function sendEnergyToDeckBottom(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const candidates = rootsOf(opponent)
    .flatMap((root) => attachedCards(opponent, root.instanceId))
    .filter((c) => attachedEnergyMatches(c, step.energy));
  const send = (energy) => {
    removeFromZones(opponent, energy);
    energy.attachedTo = null;
    opponent.zones.deck.push(energy);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: energy.instanceId,
      from: 'inPlay',
      to: 'deck',
      playerId: opponent.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const energy = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return energy ? send(energy) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'no_energy');
  if (candidates.length === 1) return send(candidates[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose an Energy to put on the bottom of your opponent's deck`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

function sendEnergyToLostZone(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const candidates = rootsOf(opponent)
    .flatMap((root) => attachedCards(opponent, root.instanceId))
    .filter((c) => attachedEnergyMatches(c, step.energy));
  const send = (energy) => {
    removeFromZones(opponent, energy);
    energy.attachedTo = null;
    pushToLostZone(opponent, energy);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: energy.instanceId,
      from: 'inPlay',
      to: 'lostZone',
      playerId: opponent.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const energy = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return energy ? send(energy) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'no_energy');
  if (candidates.length === 1) return send(candidates[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose an Energy to put in the Lost Zone`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

const isItemKind = (card) =>
  isTrainer(card) && !isSupporterTrainer(card) && !isStadiumCard(card);

// Ghetsis: the opponent shuffles their hand's Item cards into their deck; you draw that many.
function opponentHandShuffleItemsDraw(ctx) {
  const { player, opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const hand = opponent.zones.hand || [];
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: opponent.playerId,
    revealedTo: ctx.playerId,
    cards: hand.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  const items = hand.filter(isItemKind);
  if (items.length > 0) {
    for (const card of items) removeFromZones(opponent, card);
    opponent.zones.deck.push(...items);
    shuffleDeck(opponent, ctx);
  }
  drawCards(player, items.length, ctx.events);
  return null;
}

// Gym Badge: flip until tails, draw a card per heads.
function flipUntilTailsDraw(ctx) {
  const { player } = ctx;
  let heads = 0;
  for (let i = 0; i < 100; i++) {
    const face = (ctx.activeRng ? ctx.activeRng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
    ctx.events.push({ type: 'coinFlipped', playerId: player.playerId, face });
    if (face === 'tails') break;
    heads += 1;
  }
  drawCards(player, heads, ctx.events);
  return null;
}

// Hugh: each player draws or discards down to N; opponent first.
function eachPlayerHandToFive(ctx) {
  const { player, opponent, step } = ctx;
  const target = step.count || 5;
  const order = [opponent, player].filter(Boolean);
  if (!step.opponentFirst) order.reverse();
  let turn = ctx.memo?.turn ?? 0;
  if (ctx.selection) {
    discardSelectedFromHand(ctx, order[turn]);
    turn += 1;
  }
  for (; turn < order.length; turn++) {
    const owner = order[turn];
    const short = target - owner.zones.hand.length;
    if (short > 0) {
      drawCards(owner, short, ctx.events);
      continue;
    }
    const choice = askDiscardDownTo(ctx, owner, target, { turn });
    if (choice) return choice;
  }
  return null;
}

// Jessie & James: each player discards N; opponent first.
function eachPlayerDiscardFromHand(ctx) {
  const { player, opponent, step } = ctx;
  const count = step.count || 2;
  const order = [opponent, player].filter(Boolean);
  if (!step.opponentFirst) order.reverse();
  let turn = ctx.memo?.turn ?? 0;
  if (ctx.selection) {
    discardSelectedFromHand(ctx, order[turn]);
    turn += 1;
  }
  for (; turn < order.length; turn++) {
    const owner = order[turn];
    const n = Math.min(count, owner.zones.hand.length);
    if (n === 0) continue;
    return ctx.ask({
      player: owner.playerId,
      prompt: `${sourceName(ctx, 'Trainer')}: Discard ${n} card${n > 1 ? 's' : ''} from your hand`,
      options: owner.zones.hand,
      min: n,
      max: n,
      memo: { turn },
    });
  }
  return null;
}

// Lt. Surge: a Basic from hand takes the Active Spot; the old Active moves to the Bench.
function putHandBasicAsActive(ctx) {
  const { player } = ctx;
  const active = activeOf(player);
  if (!active || benchRootsOf(player).length >= BENCH_LIMIT) return skip(ctx, 'bench_full');
  const basics = (player.zones.hand || []).filter((c) => isPokemon(c) && stageOf(c) === 'Basic');
  const apply = (card) => {
    removeFromZones(player, card);
    card.attachedTo = null;
    for (const c of [active, ...attachedCards(player, active.instanceId)]) {
      removeFromZones(player, c);
      player.zones.bench.push(c);
    }
    player.zones.active.push(card);
    card.enteredPlayTurn = ctx.draft?.turn?.number;
    ctx.events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'hand',
      to: 'active',
      playerId: player.playerId,
    });
    ctx.events.push({
      type: 'cardSwitched',
      playerId: player.playerId,
      activeId: active.instanceId,
      benchId: card.instanceId,
    });
    return null;
  };
  if (ctx.selection) {
    const card = basics.find((c) => c.instanceId === ctx.selection[0]);
    return card ? apply(card) : skip(ctx, 'target_not_found');
  }
  if (basics.length === 0) return skip(ctx, 'no_basic_in_hand');
  if (basics.length === 1) return apply(basics[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a Basic Pokémon from your hand to put in the Active Spot`,
    options: basics,
    min: 1,
    max: 1,
  });
}

// Lysandre Prism Star: one opponent discard card to the Lost Zone per qualifying Pokémon.
function opponentDiscardToLostZonePerPokemon(ctx) {
  const { player, opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const symbol = String(step.energyType || '').match(/\{([a-z])\}/)?.[1];
  const count = rootsOf(player).filter(
    (root) => !symbol || pokemonHasType(topPokemonCard(player, root), symbol)
  ).length;
  if (count === 0) return skip(ctx, 'no_qualifying_pokemon');
  let done = ctx.memo?.done ?? 0;
  if (ctx.selection) {
    const card = (opponent.zones.discard || []).find((c) => c.instanceId === ctx.selection[0]);
    if (card) {
      removeFromZones(opponent, card);
      pushToLostZone(opponent, card);
      ctx.events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: 'discard',
        to: 'lostZone',
        playerId: opponent.playerId,
      });
    }
    done += 1;
  }
  if (done >= count) return null;
  const candidates = opponent.zones.discard || [];
  if (candidates.length === 0) return skip(ctx, 'empty_discard');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a card from your opponent's discard pile (${done + 1}/${count})`,
    options: candidates,
    min: 1,
    max: 1,
    memo: { done },
  });
}

// Max Revive / Recycle / Good Rod: a matching discard card goes on top of the deck.
function putDiscardOnTop(ctx) {
  const { player, step } = ctx;
  const what = String(step.what || 'card');
  const candidates = (player.zones.discard || []).filter((card) => {
    if (what === 'Pokémon') return isPokemon(card);
    if (what === 'Trainer') return isTrainer(card);
    return true;
  });
  const put = (card) => {
    removeFromZones(player, card);
    player.zones.deck.unshift(card);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'discard',
      to: 'deck',
      playerId: player.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const card = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return card ? put(card) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'empty_discard');
  if (candidates.length === 1) return put(candidates[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a card from your discard pile to put on top of your deck`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

// Oracle: choose N deck cards, shuffle the rest, put the chosen cards on top.
function searchToTop(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck;
  const count = Math.min(step.count || 2, deck.length);
  if (ctx.selection) {
    const chosen = pickById(deck, ctx.selection);
    for (const card of chosen) removeFromZones(player, card);
    shuffleDeck(player, ctx);
    player.zones.deck.unshift(...chosen);
    ctx.events.push({ type: 'cardsMovedToDeckTop', count: chosen.length, playerId: player.playerId });
    return null;
  }
  if (count === 0) return skip(ctx, 'empty_deck');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose ${count} cards to put on top of your deck`,
    options: deck,
    min: count,
    max: count,
  });
}

// Pokémon Center: heal every damaged own Pokémon, then discard their Energy.
function healAllOwnAndDiscardEnergy(ctx) {
  const { player } = ctx;
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  const damaged = rootsOf(player).filter((root) => (root.damage || 0) > 0);
  if (damaged.length === 0) return skip(ctx, 'no_damaged_pokemon');
  for (const root of damaged) {
    root.damage = 0;
    ctx.events.push({ type: 'damageUpdated', instanceId: root.instanceId, damage: 0 });
    const energies = attachedCards(player, root.instanceId).filter(isEnergy);
    for (const energy of energies) {
      removeFromZones(player, energy);
      energy.attachedTo = null;
      discardCardToPlayerZone(player, energy);
    }
    if (energies.length > 0) {
      ctx.events.push({
        type: 'cardsDiscarded',
        playerId: player.playerId,
        cards: energies.map((c) => ({ instanceId: c.instanceId, name: c.name })),
      });
    }
  }
  return null;
}

// Pokémon Nurse: heal 1 own Pokémon completely, then discard its Energy.
function healOneDiscardEnergy(ctx) {
  const { player } = ctx;
  if (stadiumBlocksHealing(ctx.draft.stadium)) return skip(ctx, 'healing_blocked');
  const candidates = rootsOf(player).filter((root) => (root.damage || 0) > 0);
  const apply = (root) => {
    root.damage = 0;
    ctx.events.push({ type: 'damageUpdated', instanceId: root.instanceId, damage: 0 });
    const energies = attachedCards(player, root.instanceId).filter(isEnergy);
    for (const energy of energies) {
      removeFromZones(player, energy);
      energy.attachedTo = null;
      discardCardToPlayerZone(player, energy);
    }
    if (energies.length > 0) {
      ctx.events.push({
        type: 'cardsDiscarded',
        playerId: player.playerId,
        cards: energies.map((c) => ({ instanceId: c.instanceId, name: c.name })),
      });
    }
    return null;
  };
  if (ctx.selection) {
    const root = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return root ? apply(root) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'no_damaged_pokemon');
  if (candidates.length === 1) return apply(candidates[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a Pokémon to heal`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

// Return Label / Surprise Box: a card from the opponent's discard to their deck bottom / hand.
function opponentDiscardMove(ctx, to) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const candidates = opponent.zones.discard || [];
  const move = (card) => {
    removeFromZones(opponent, card);
    if (to === 'deck') opponent.zones.deck.push(card);
    else opponent.zones.hand.push(card);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'discard',
      to,
      playerId: opponent.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const card = candidates.find((c) => c.instanceId === ctx.selection[0]);
    return card ? move(card) : skip(ctx, 'target_not_found');
  }
  if (candidates.length === 0) return skip(ctx, 'empty_discard');
  if (candidates.length === 1) return move(candidates[0]);
  return ctx.ask({
    prompt:
      to === 'deck'
        ? `${sourceName(ctx, 'Trainer')}: Choose a card from your opponent's discard pile to put on the bottom of their deck`
        : `${sourceName(ctx, 'Trainer')}: Choose a card from your opponent's discard pile to put into their hand`,
    options: candidates,
    min: 1,
    max: 1,
  });
}

const opponentDiscardToDeckBottom = (ctx) => opponentDiscardMove(ctx, 'deck');
const opponentDiscardToHand = (ctx) => opponentDiscardMove(ctx, 'hand');

// Seeker: each player returns a Benched Pokémon and its attachments to hand; you first.
function eachPlayerReturnBench(ctx) {
  const order = [ctx.player, ctx.opponent].filter(Boolean);
  let turn = ctx.memo?.turn ?? 0;
  const returnRoot = (owner, root) => {
    for (const card of [root, ...attachedCards(owner, root.instanceId)]) {
      removeFromZones(owner, card);
      card.attachedTo = null;
      owner.zones.hand.push(card);
    }
    ctx.events.push({
      type: 'cardMoved',
      instanceId: root.instanceId,
      from: 'bench',
      to: 'hand',
      playerId: owner.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const owner = order[turn];
    const root = benchRootsOf(owner).find((c) => c.instanceId === ctx.selection[0]);
    if (root) returnRoot(owner, root);
    turn += 1;
  }
  for (; turn < order.length; turn++) {
    const owner = order[turn];
    const bench = benchRootsOf(owner);
    if (bench.length === 0) continue;
    if (bench.length === 1) {
      returnRoot(owner, bench[0]);
      continue;
    }
    return ctx.ask({
      player: owner.playerId,
      prompt: `${sourceName(ctx, 'Trainer')}: Choose a Benched Pokémon to return to your hand`,
      options: bench,
      min: 1,
      max: 1,
      memo: { turn },
    });
  }
  return null;
}

// Switching Cups: trade a hand card for the top card of the deck.
function switchHandWithTop(ctx) {
  const { player } = ctx;
  const hand = player.zones.hand || [];
  const deck = player.zones.deck || [];
  const apply = (card) => {
    removeFromZones(player, card);
    const top = deck.shift();
    deck.unshift(card);
    player.zones.hand.push(top);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: 'hand',
      to: 'deck',
      playerId: player.playerId,
    });
    ctx.events.push({
      type: 'cardMoved',
      instanceId: top.instanceId,
      from: 'deck',
      to: 'hand',
      playerId: player.playerId,
    });
    return null;
  };
  if (ctx.selection) {
    const card = hand.find((c) => c.instanceId === ctx.selection[0]);
    if (!card || deck.length === 0) return skip(ctx, 'target_not_found');
    return apply(card);
  }
  if (hand.length === 0 || deck.length === 0) return skip(ctx, 'nothing_to_swap');
  if (hand.length === 1) return apply(hand[0]);
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose a card from your hand to put on top of your deck`,
    options: hand,
    min: 1,
    max: 1,
  });
}

// Team Rocket's Handiwork: flip N coins, mill per heads.
function millPerHeads(ctx) {
  const { opponent, step } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  let heads = 0;
  for (let i = 0; i < (step.coins || 2); i++) {
    const face = (ctx.activeRng ? ctx.activeRng.next() : 0.5) < 0.5 ? 'heads' : 'tails';
    ctx.events.push({ type: 'coinFlipped', playerId: ctx.player.playerId, face });
    if (face === 'heads') heads += 1;
  }
  const count = Math.min(heads * (step.per || 2), opponent.zones.deck.length);
  const milled = opponent.zones.deck.splice(0, count);
  for (const card of milled) discardCardToPlayerZone(opponent, card);
  if (milled.length > 0) {
    ctx.events.push({
      type: 'cardsDiscarded',
      playerId: opponent.playerId,
      cards: milled.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
  }
  return null;
}

// Tool Retriever: up to N Tools attached to your Pokémon go to hand.
function toolsToHand(ctx) {
  const { player, step } = ctx;
  const attached = rootsOf(player)
    .flatMap((root) => attachedCards(player, root.instanceId))
    .filter(isToolCard);
  const max = Math.min(step.count || 2, attached.length);
  if (ctx.selection) {
    for (const tool of pickById(attached, ctx.selection)) {
      removeFromZones(player, tool);
      tool.attachedTo = null;
      player.zones.hand.push(tool);
      ctx.events.push({
        type: 'cardMoved',
        instanceId: tool.instanceId,
        from: 'attached',
        to: 'hand',
        playerId: player.playerId,
      });
    }
    return null;
  }
  if (attached.length === 0) return skip(ctx, 'no_tools');
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose up to ${max} Pokémon Tool card${max > 1 ? 's' : ''} to put into your hand`,
    options: attached,
    min: 0,
    max,
  });
}

// Tormenting Spray: reveal a random opponent's hand card; a Supporter is discarded.
function discardRandomOpponentHandIfSupporter(ctx) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  // Mars prints "Draw 2 cards. If you do, discard …": when the draw clause
  // drew nothing, the follow-up does not resolve (review finding 6).
  if (
    ctx.step.requiresDraw &&
    !(ctx.events || []).some(
      (event) => event.type === 'cardsDrawn' && event.playerId === ctx.playerId && event.count > 0
    )
  ) {
    return skip(ctx, 'draw_failed');
  }
  const hand = opponent.zones.hand || [];
  if (hand.length === 0) return skip(ctx, 'empty_hand');
  const at = Math.floor((ctx.activeRng ? ctx.activeRng.next() : 0) * hand.length);
  const card = hand[at];
  ctx.events.push({
    type: 'cardsRevealed',
    playerId: opponent.playerId,
    revealedTo: ctx.playerId,
    cards: [{ instanceId: card.instanceId, name: card.name }],
  });
  // Mars discards the random card regardless of type; Tormenting Spray only
  // discards it when it is a Supporter.
  if (ctx.step.any || isSupporterTrainer(card)) {
    removeFromZones(opponent, card);
    discardCardToPlayerZone(opponent, card);
    ctx.events.push({
      type: 'cardsDiscarded',
      playerId: opponent.playerId,
      cards: [{ instanceId: card.instanceId, name: card.name }],
    });
  }
  return null;
}

// Ultra Forest Kartenvoy: for the rest of the turn the player's Ultra Beast
// attacks ignore effects on the opponent's Active Pokémon.
function ignoreDefenderEffectsTurn(ctx) {
  const { player, step } = ctx;
  player.flags.ignoreDefenderEffectsTurn = { ultraBeast: Boolean(step.ultraBeast) };
  return null;
}

export const WILL_HEADS = -3;
export const WILL_TAILS = -4;

// Will: choose heads or tails for the first coin flip this turn.
function chooseFirstCoin(ctx) {
  const { player } = ctx;
  if (ctx.selection) {
    player.flags.willFirstCoin = ctx.selection[0] === WILL_TAILS ? 'tails' : 'heads';
    return null;
  }
  return ctx.ask({
    prompt: `${sourceName(ctx, 'Trainer')}: Choose heads or tails for the first coin flip this turn`,
    options: [
      { instanceId: WILL_HEADS, name: 'Heads' },
      { instanceId: WILL_TAILS, name: 'Tails' },
    ],
    min: 1,
    max: 1,
  });
}

// Cyrus Prism Star: the opponent keeps 2 Benched Pokémon; the others and all
// cards attached to them shuffle into their deck.
function opponentShuffleBenchToDeck(ctx) {
  const { opponent } = ctx;
  if (!opponent) return skip(ctx, 'no_opponent');
  const bench = benchRootsOf(opponent);
  const shuffleRest = (keepIds) => {
    const rest = bench.filter((root) => !keepIds.includes(root.instanceId));
    if (rest.length === 0) return null;
    let moved = 0;
    for (const root of rest) {
      const cards = [root, ...attachedCards(opponent, root.instanceId)];
      for (const card of cards) {
        removeFromZones(opponent, card);
        card.attachedTo = null;
        opponent.zones.deck.push(card);
        moved++;
      }
    }
    shuffleDeck(opponent, ctx);
    ctx.events.push({
      type: 'cardsMovedToDeck',
      count: moved,
      playerId: opponent.playerId,
      from: 'bench',
    });
    return null;
  };
  // At 2 or fewer Benched Pokémon the whole board is kept (printed "chooses 2").
  if (bench.length <= 2) return null;
  if (ctx.selection) return shuffleRest(ctx.selection.map(Number));
  return ctx.ask({
    player: opponent.playerId,
    prompt: `${sourceName(ctx, 'Trainer')}: Choose 2 Benched Pokémon to keep; the rest shuffle into your deck`,
    options: bench,
    min: 2,
    max: 2,
  });
}

// Trash Exchange: shuffle the discard pile in, then mill that many.
function shuffleDiscardThenMill(ctx) {
  const { player } = ctx;
  const discard = player.zones.discard || [];
  const count = discard.length;
  if (count === 0) return skip(ctx, 'empty_discard');
  player.zones.deck.push(...discard.splice(0));
  shuffleDeck(player, ctx);
  const milled = player.zones.deck.splice(0, count);
  for (const card of milled) discardCardToPlayerZone(player, card);
  ctx.events.push({
    type: 'cardsDiscarded',
    playerId: player.playerId,
    cards: milled.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  return null;
}

// Wicke: each player shuffles their hand into their deck and draws that many.
function eachPlayerShuffleHandDraw(ctx) {
  for (const side of [ctx.player, ctx.opponent].filter(Boolean)) {
    const count = side.zones.hand.length;
    side.zones.deck.push(...side.zones.hand.splice(0));
    shuffleDeck(side, ctx);
    drawCards(side, count, ctx.events);
  }
  return null;
}

// Super Energy Removal 2: discard all Energy from one side's Active Pokémon.
function discardAllEnergyFromActive(ctx) {
  const { player, opponent, step } = ctx;
  const side = step.side === 'opponent' ? opponent : player;
  if (!side) return skip(ctx, 'no_opponent');
  const active = activeOf(side);
  if (!active) return skip(ctx, 'no_active');
  const energies = attachedCards(side, active.instanceId).filter(isEnergy);
  if (energies.length === 0) return skip(ctx, 'no_energy');
  for (const energy of energies) {
    removeFromZones(side, energy);
    energy.attachedTo = null;
    discardCardToPlayerZone(side, energy);
  }
  ctx.events.push({
    type: 'cardsDiscarded',
    playerId: side.playerId,
    cards: energies.map((c) => ({ instanceId: c.instanceId, name: c.name })),
  });
  return null;
}

// Tropical Tidal Wave: discard all Trainer cards (Tools) and the Stadium a side has in play.
function discardAllTrainerInPlay(ctx) {
  const { player, opponent, step } = ctx;
  const side = step.side === 'opponent' ? opponent : player;
  if (!side) return skip(ctx, 'no_opponent');
  const tools = rootsOf(side)
    .flatMap((root) => attachedCards(side, root.instanceId))
    .filter(isToolCard);
  for (const tool of tools) {
    removeFromZones(side, tool);
    tool.attachedTo = null;
    discardCardToPlayerZone(side, tool);
  }
  let discardedStadium = false;
  if (ctx.draft.stadium && ctx.draft.stadium.ownerId === side.playerId) {
    discardCurrentStadium(ctx.draft, ctx.events, side.playerId);
    discardedStadium = true;
  }
  if (tools.length > 0) {
    ctx.events.push({
      type: 'cardsDiscarded',
      playerId: side.playerId,
      cards: tools.map((c) => ({ instanceId: c.instanceId, name: c.name })),
    });
  }
  if (tools.length === 0 && !discardedStadium) return skip(ctx, 'nothing_to_discard');
  return null;
}

// Professor Cozmo's Discovery: draw N cards from the bottom of the deck.
function drawBottom(ctx) {
  const { player, step } = ctx;
  const deck = player.zones.deck || [];
  const count = Math.min(step.count || 1, deck.length);
  if (count === 0) return skip(ctx, 'empty_deck');
  const drawn = deck.splice(deck.length - count, count);
  player.zones.hand.push(...drawn);
  ctx.events.push({
    type: 'cardsDrawn',
    count: drawn.length,
    playerId: player.playerId,
    cards: drawn.map((c) => ({ instanceId: c.instanceId })),
  });
  return null;
}

export const EXTRA_STEP_HANDLERS = {
  attachTool,
  attachAttackTool,
  clearStatus,
  healEachActive,
  discardStadium,
  shuffleDiscardIntoDeck,
  energyToHand,
  eachPlayerDraw,
  healPerHeads,
  rearrangeTop,
  shufflePokemonIntoDeck,
  clearAttackEffects,
  revealPrizes,
  reviveFromDiscard,
  moveDamageCounters: moveDamageCountersStep,
  prizeToHand,
  lookAtFaceDownPrize,
  opponentHandToBenchBasic,
  opponentActiveEnergyToDeck,
  discardOwnBenchPokemon,
  lostZoneCost,
  opponentChoosesFromTop,
  lookAtOpponentHand,
  opponentHandShuffleDeck,
  discardAnyThenDraw,
  shuffleHandCardsThenDraw,
  revealUntilCard,
  revealTopEnergy,
  toolOrStadiumToLostZone,
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
        abilityShield: true,
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
  // Design 034 slice 6 one-offs.
  winGameAbility,
  drawVariableAbility,
  discardForDrawAbility,
  deckPlaceAbility,
  discardBenchAbility,
  energySwapAbility,
  stadiumManipAbility,
  transformAbility,
  selfAttachEnergyAbility,
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
  ignoreDefenderEffectsTurn,
  chooseFirstCoin,
  opponentShuffleBenchToDeck,
  // I154: parsed Trainer step kinds that had no server executor.
  returnStadiumToHand,
  shuffleDeckOnly,
  eachPlayerRecoverPokemon,
  putHandBottomThenDraw,
  moveEnergyOpponent,
  sendEnergyToDeckBottom,
  sendEnergyToLostZone,
  opponentHandShuffleItemsDraw,
  flipUntilTailsDraw,
  eachPlayerHandToFive,
  eachPlayerDiscardFromHand,
  putHandBasicAsActive,
  opponentDiscardToLostZonePerPokemon,
  putDiscardOnTop,
  searchToTop,
  healAllOwnAndDiscardEnergy,
  healOneDiscardEnergy,
  opponentDiscardToDeckBottom,
  opponentDiscardToHand,
  eachPlayerReturnBench,
  switchHandWithTop,
  millPerHeads,
  toolsToHand,
  discardRandomOpponentHandIfSupporter,
  shuffleDiscardThenMill,
  eachPlayerShuffleHandDraw,
  discardAllEnergyFromActive,
  discardAllTrainerInPlay,
  drawBottom,
};

