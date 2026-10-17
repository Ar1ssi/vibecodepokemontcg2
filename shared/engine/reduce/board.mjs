/**
 * @file Manual board commands: moveCard, draw, damage counters, Special Conditions, type/rotation,
 * zone shuffles and moves, reveal/hide, board ops; plus the post-command face-down sweep. Split out
 * of reduce.mjs (design 073 B, I250); reduce.mjs stays the public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isEnergy, isPokemon, isBasicPokemon } from '../cards.mjs';
import { stadiumOnBenchTriggers } from '../rules/stadium-triggers.mjs';
import { applyStadiumTriggerEffect } from '../effects/stadium-trigger-apply.mjs';
import { discardCurrentStadium } from '../effects/trainer.mjs';
import { clearAttackMarkers } from '../rules/attack-markers.mjs';
import { isSpecialEnergyCard } from '../rules/special-energy-parse.mjs';
import { resolveSpecialEnergyDiscard } from '../effects/special-energy.mjs';
import { addCondition, removeCondition, clearConditions } from '../rules/special-conditions.mjs';
import { inPlayView, conditionsUpdatedEvent } from './shared.mjs';

/**
 * Design 012: `faceDown` only means something on the board. Every path that takes a card off
 * the board (moves, mass discards, shuffles, undo replay) would otherwise have to clear it, and
 * a missed one would hide the card again the next time it lands on the board — so the flag is
 * swept once, after every command.
 */
export function clearFaceDownOffBoard(draft) {
  if (draft.stadium?.faceDown) delete draft.stadium.faceDown;
  for (const player of Object.values(draft.players || {})) {
    for (const [zoneId, zone] of Object.entries(player.zones || {})) {
      if (zoneId === 'board' || !Array.isArray(zone)) continue;
      for (const card of zone) {
        if (card?.faceDown) delete card.faceDown;
      }
    }
  }
}

export function moveCardCommand({ payload, draft, playerId, events, activeRng }) {
  let card = null;
  if (payload.from === 'stadium') {
    card = draft.stadium;
    draft.stadium = null;
  } else {
    const srcZone = draft.players[playerId].zones[payload.from];
    const idx = srcZone.findIndex(
      (c) => c.instanceId === payload.instanceId
    );
    if (idx >= 0) {
      [card] = srcZone.splice(idx, 1);
    }
  }

  if (card) {
    // Special-energy on-discard: Recycle Energy returns to hand instead of
    // the discard pile. (Reattach is attack-only and handled by the effect
    // executor, not this client-driven move.)
    let discardRedirect = null;
    if (
      payload.to === 'discard' &&
      ['active', 'bench'].includes(payload.from) &&
      isEnergy(card) &&
      isSpecialEnergyCard(card) &&
      card.attachedTo != null
    ) {
      const host = findCard(draft, card.attachedTo)?.card;
      const hostRef = host ? findCard(draft, host.instanceId) : null;
      const resolution = resolveSpecialEnergyDiscard(draft, {
        energy: card,
        host,
        hostTop: host ? inPlayView(draft, host) : null,
        hostPlayerId: hostRef?.playerId,
        hostZoneId: hostRef?.zoneId,
        events,
      });
      if (resolution === 'hand') discardRedirect = 'hand';
    }

    if (payload.to === 'stadium') {
      if (draft.stadium && draft.stadium.instanceId !== card.instanceId) {
        discardCurrentStadium(draft, events, playerId);
      }
      card.ownerId = card.ownerId || playerId;
      draft.stadium = card;
      card.attachedTo = null;
      for (const p of Object.values(draft.players || {})) {
        if (p.flags) p.flags.stadiumUsedThisTurn = false;
      }
      // Dropping the Stadium onto the Stadium slot is still "playing a
      // Stadium": without this flag a second Stadium could be played in the
      // same turn, which only the drag path allowed.
      const placing = draft.players[playerId];
      if (placing) {
        if (!placing.flags) placing.flags = {};
        placing.flags.stadiumPlayedThisTurn = true;
      }
    } else if (discardRedirect === 'hand') {
      card.attachedTo = null;
      draft.players[playerId].zones.hand.push(card);
      events.push({
        type: 'cardMoved',
        instanceId: card.instanceId,
        from: payload.from,
        to: 'hand',
        playerId,
      });
    } else {
      const destZone = draft.players[playerId].zones[payload.to];
      if (
        payload.targetIndex != null &&
        payload.targetIndex >= 0 &&
        payload.targetIndex <= destZone.length
      ) {
        destZone.splice(payload.targetIndex, 0, card);
      } else {
        destZone.push(card);
      }

      if (
        ['active', 'bench'].includes(payload.to) &&
        ['hand', 'deck', 'discard'].includes(payload.from)
      ) {
        card.enteredPlayTurn = draft.turn.number;
      }
      // Only a hand→Bench play opens a "when you play onto your Bench" trigger.
      if (payload.from === 'hand' && payload.to === 'bench') {
        card.playedToBenchTurn = draft.turn.number;
        const benchStadium = draft.stadium?.card || draft.stadium;
        for (const effect of stadiumOnBenchTriggers(benchStadium, { pokemon: card })) {
          // Rocket's Minefield Gym: only tails puts the counters on.
          if (effect.coin) {
            const face = activeRng.next() < 0.5 ? 'heads' : 'tails';
            events.push({
              type: 'coinFlipped',
              playerId,
              face,
              source: effect.source,
            });
            if (face !== effect.coin) continue;
          }
          applyStadiumTriggerEffect(draft, effect, {
            host: card,
            hostPlayerId: playerId,
            events,
          });
        }
        // Torterra Land Shake (effects/attack-steps.mjs atkOppBenchTrap).
        const turnNumber = draft.turn.number;
        for (const trap of draft.players[playerId].benchTraps || []) {
          if (trap.fromTurn > turnNumber || trap.untilTurn < turnNumber || !isBasicPokemon(card)) continue;
          card.damage = (card.damage || 0) + trap.count * 10;
          events.push({ type: 'damageUpdated', instanceId: card.instanceId, damage: card.damage, source: trap.source });
        }
      } else {
        delete card.playedToBenchTurn;
      }

      // If moving between active and bench, bring along all attached cards
      if (
        ['active', 'bench'].includes(payload.from) &&
        ['active', 'bench'].includes(payload.to)
      ) {
        clearConditions(card);
        delete card.cannotAttackUntilTurn;
        delete card.cannotAttackAttackName;
        delete card.cannotRetreatUntilTurn;
        clearAttackMarkers(card);
        const srcZone = draft.players[playerId].zones[payload.from];
        for (let i = srcZone.length - 1; i >= 0; i--) {
          if (srcZone[i].attachedTo === card.instanceId) {
            const [attachedChild] = srcZone.splice(i, 1);
            destZone.push(attachedChild);
          }
        }
      }
    }

    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: payload.from,
      to: payload.to,
      targetIndex: payload.targetIndex,
      playerId,
    });
  }
}

export function drawCommand({ payload, draft, playerId, events }) {
  const count = payload?.count ?? 1;
  const deck = draft.players[playerId].zones.deck;
  const hand = draft.players[playerId].zones.hand;
  const actualCount = Math.min(count, deck.length);
  const drawnCards = deck.splice(0, actualCount);
  hand.push(...drawnCards);

  events.push({
    type: 'cardsDrawn',
    count: actualCount,
    playerId,
    cards: drawnCards.map((c) => ({ instanceId: c.instanceId })),
  });
}

export function addDamageCounterCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    const amount = payload.amount ?? 10;
    cardRef.card.damage = (cardRef.card.damage || 0) + amount;
    events.push({
      type: 'damageUpdated',
      instanceId: payload.instanceId,
      damage: cardRef.card.damage,
    });
  }
}

export function updateDamageCounterCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    cardRef.card.damage = Math.max(0, payload.amount);
    events.push({
      type: 'damageUpdated',
      instanceId: payload.instanceId,
      damage: cardRef.card.damage,
    });
  }
}

export function removeDamageCounterCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    const amount = payload.amount ?? 10;
    cardRef.card.damage = Math.max(0, (cardRef.card.damage || 0) - amount);
    events.push({
      type: 'damageUpdated',
      instanceId: payload.instanceId,
      damage: cardRef.card.damage,
    });
  }
}

export function addSpecialConditionCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    addCondition(cardRef.card, payload.condition);
    events.push(conditionsUpdatedEvent(cardRef.card, payload.condition));
  }
}

export function updateSpecialConditionCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    if (payload.condition == null) clearConditions(cardRef.card);
    else addCondition(cardRef.card, payload.condition);
    events.push(
      conditionsUpdatedEvent(cardRef.card, payload.condition ?? null)
    );
  }
}

export function removeSpecialConditionCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    // A named condition removes only that one; no name clears them all.
    if (payload.condition) removeCondition(cardRef.card, payload.condition);
    else clearConditions(cardRef.card);
    events.push(conditionsUpdatedEvent(cardRef.card, null));
  }
}

export function removeAbilityCounterCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    cardRef.card.abilityUsed = false;
    // The turn flag is the other half of the used-check; clearing only the
    // card stamp left the ability refused ("Ability already used this turn")
    // while the counter visibly disappeared from the board.
    const usedFlags = draft.players?.[cardRef.playerId]?.flags?.abilitiesUsed;
    if (usedFlags) {
      if (cardRef.card.instanceId != null) delete usedFlags[cardRef.card.instanceId];
      if (cardRef.card.name != null) delete usedFlags[cardRef.card.name];
    }
    events.push({
      type: 'abilityCounterUpdated',
      instanceId: payload.instanceId,
      abilityUsed: false,
    });
  }
}

export function changeTypeCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    cardRef.card.type = payload.type;
    events.push({
      type: 'typeChanged',
      instanceId: payload.instanceId,
      cardType: payload.type,
    });
  }
}

export function rotateCardCommand({ draft, payload, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    cardRef.card.rotation = payload.rotation;
    events.push({
      type: 'cardRotated',
      instanceId: payload.instanceId,
      rotation: payload.rotation,
    });
  }
}

export function playRandomCardFaceDownCommand({ draft, playerId, activeRng, events }) {
  const hand = draft.players[playerId].zones.hand;
  const [card] = hand.splice(activeRng.int(hand.length), 1);
  card.faceDown = true;
  card.revealed = false;
  draft.players[playerId].zones.board.push(card);
  events.push({
    type: 'cardPlayedFaceDown',
    instanceId: card.instanceId,
    playerId,
  });
}

// --- Zone ops (design 002 slice 3.4a). Shuffles always use the server's own
// activeRng (Fisher-Yates), never a client-supplied order — a client picking its own
// shuffle would be able to stack its own deck. ---
export function shuffleIntoDeckCommand({ draft, playerId, payload, activeRng, events }) {
  const player = draft.players[playerId];
  const srcZone = player.zones[payload.from];
  if (payload.index >= 0 && payload.index < srcZone.length) {
    const [card] = srcZone.splice(payload.index, 1);
    player.zones.deck.push(card);
    player.zones.deck = activeRng.shuffle(player.zones.deck);
    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: payload.from,
      to: 'deck',
      playerId,
    });
    events.push({ type: 'zoneShuffled', zoneId: 'deck', playerId });
  }
}

export function moveToDeckTopCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const srcZone = player.zones[payload.from];
  if (payload.index >= 0 && payload.index < srcZone.length) {
    const [card] = srcZone.splice(payload.index, 1);
    player.zones.deck.unshift(card);
    events.push({
      type: 'cardMoved',
      instanceId: card.instanceId,
      from: payload.from,
      to: 'deck',
      targetIndex: 0,
      playerId,
    });
  }
}

export function switchWithDeckTopCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const srcZone = player.zones[payload.from];
  const deck = player.zones.deck;
  if (
    payload.index >= 0 &&
    payload.index < srcZone.length &&
    deck.length > 0
  ) {
    const [card] = srcZone.splice(payload.index, 1);
    const [topCard] = deck.splice(0, 1);
    deck.unshift(card);
    srcZone.splice(payload.index, 0, topCard);
    events.push({
      type: 'cardsSwapped',
      deckInstanceId: card.instanceId,
      zoneInstanceId: topCard.instanceId,
      zoneId: payload.from,
      playerId,
    });
  }
}

export function shuffleZoneCommand({ draft, playerId, payload, activeRng, events }) {
  const player = draft.players[playerId];
  player.zones[payload.zoneId] = activeRng.shuffle(
    player.zones[payload.zoneId]
  );
  events.push({ type: 'zoneShuffled', zoneId: payload.zoneId, playerId });
}

export function shuffleBottomCommand({ draft, playerId, activeRng, payload, events }) {
  const player = draft.players[playerId];
  const moved = activeRng.shuffle(player.zones[payload.zoneId].splice(0));
  player.zones.deck.push(...moved);
  events.push({
    type: 'zoneMovedToDeckBottom',
    zoneId: payload.zoneId,
    count: moved.length,
    playerId,
  });
}

export function shuffleAllCommand({ draft, playerId, payload, activeRng, events }) {
  const player = draft.players[playerId];
  const moved = player.zones[payload.zoneId].splice(0);
  player.zones.deck.push(...moved);
  player.zones.deck = activeRng.shuffle(player.zones.deck);
  events.push({
    type: 'zoneShuffledIntoDeck',
    zoneId: payload.zoneId,
    count: moved.length,
    playerId,
  });
}

export function discardAllCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const moved = player.zones[payload.zoneId].splice(0);
  // Prism Star cards route to the Lost Zone (App. 17); the rest to discard.
  const routed = { discard: 0, lostZone: 0 };
  for (const card of moved) routed[discardCardToPlayerZone(player, card)]++;
  if (routed.discard > 0) {
    events.push({
      type: 'zoneMoved',
      from: payload.zoneId,
      to: 'discard',
      count: routed.discard,
      playerId,
    });
  }
  if (routed.lostZone > 0) {
    events.push({
      type: 'zoneMoved',
      from: payload.zoneId,
      to: 'lostZone',
      count: routed.lostZone,
      playerId,
    });
  }
}

export function lostZoneAllCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const moved = player.zones[payload.zoneId].splice(0);
  player.zones.lostZone.push(...moved);
  events.push({
    type: 'zoneMoved',
    from: payload.zoneId,
    to: 'lostZone',
    count: moved.length,
    playerId,
  });
}

export function handAllCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const moved = player.zones[payload.zoneId].splice(0);
  player.zones.hand.push(...moved);
  events.push({
    type: 'zoneMoved',
    from: payload.zoneId,
    to: 'hand',
    count: moved.length,
    playerId,
  });
}

export function leaveAllCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const srcZone = player.zones[payload.from];
  const destZone = player.zones[payload.to];
  const moved = [];
  for (let i = srcZone.length - 1; i >= 0; i--) {
    if (isPokemon(srcZone[i])) {
      const [card] = srcZone.splice(i, 1);
      moved.unshift(card);
    }
  }
  destZone.push(...moved);
  events.push({
    type: 'zoneMoved',
    from: payload.from,
    to: payload.to,
    count: moved.length,
    playerId,
  });
}

export function discardAndDrawCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const hand = player.zones.hand;
  const discarded = hand.splice(0);
  for (const card of discarded) discardCardToPlayerZone(player, card);
  const count = Math.min(payload.count ?? 0, player.zones.deck.length);
  const drawn = player.zones.deck.splice(0, count);
  hand.push(...drawn);
  events.push({
    type: 'handDiscardedAndDrawn',
    discarded: discarded.length,
    drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
    playerId,
  });
}

export function shuffleAndDrawCommand({ draft, playerId, activeRng, payload, events }) {
  const player = draft.players[playerId];
  const hand = player.zones.hand;
  const returned = hand.splice(0);
  player.zones.deck.push(...returned);
  player.zones.deck = activeRng.shuffle(player.zones.deck);
  const count = Math.min(payload.count ?? 0, player.zones.deck.length);
  const drawn = player.zones.deck.splice(0, count);
  hand.push(...drawn);
  events.push({
    type: 'handShuffledIntoDeckAndDrawn',
    returned: returned.length,
    drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
    playerId,
  });
}

export function shuffleBottomAndDrawCommand({ draft, playerId, activeRng, payload, events }) {
  const player = draft.players[playerId];
  const hand = player.zones.hand;
  const returned = activeRng.shuffle(hand.splice(0));
  player.zones.deck.push(...returned);
  const count = Math.min(payload.count ?? 0, player.zones.deck.length);
  const drawn = player.zones.deck.splice(0, count);
  hand.push(...drawn);
  events.push({
    type: 'handShuffledToDeckBottomAndDrawn',
    returned: returned.length,
    drawn: drawn.map((c) => ({ instanceId: c.instanceId })),
    playerId,
  });
}

export function shufflePrizesToDeckBottomCommand({ draft, playerId, activeRng, events }) {
  const player = draft.players[playerId];
  const prizes = player.zones.prizes;
  const shuffled = activeRng.shuffle(prizes.splice(0));
  player.zones.deck.push(...shuffled);
  events.push({
    type: 'prizesShuffledToDeckBottom',
    count: shuffled.length,
    playerId,
  });
}

// --- Reveal/hide (I19). A player may only flip `card.revealed` on their own
// zone (draft.players[playerId] is always the sender's own state, never the
// opponent's) — the flag is symmetric in view.mjs's redaction, so setting it
// here is enough to unhide the card in both players' views. ---
export function revealShortcutCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const zone = player.zones[payload.zoneId];
  const card = zone?.[payload.index];
  if (card) {
    card.revealed = true;
    events.push({
      type: 'cardRevealed',
      instanceId: card.instanceId,
      zoneId: payload.zoneId,
      playerId,
    });
  }
}

export function hideShortcutCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const zone = player.zones[payload.zoneId];
  const card = zone?.[payload.index];
  if (card) {
    card.revealed = false;
    events.push({
      type: 'cardHidden',
      instanceId: card.instanceId,
      zoneId: payload.zoneId,
      playerId,
    });
  }
}

export function revealCardsCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const zone = player.zones[payload.zoneId] || [];
  for (const card of zone) card.revealed = true;
  events.push({
    type: 'zoneRevealed',
    zoneId: payload.zoneId,
    count: zone.length,
    playerId,
  });
}

export function hideCardsCommand({ draft, playerId, payload, events }) {
  const player = draft.players[playerId];
  const zone = player.zones[payload.zoneId] || [];
  for (const card of zone) card.revealed = false;
  events.push({
    type: 'zoneHidden',
    zoneId: payload.zoneId,
    count: zone.length,
    playerId,
  });
}

// --- Board ops (design 002 slice 3.4b). Legacy targets the literal 'board' zone. ---
export function discardBoardCommand({ draft, playerId, events }) {
  const player = draft.players[playerId];
  const moved = player.zones.board.splice(0);
  const routed = { discard: 0, lostZone: 0 };
  for (const card of moved) routed[discardCardToPlayerZone(player, card)]++;
  if (routed.discard > 0) {
    events.push({
      type: 'zoneMoved',
      from: 'board',
      to: 'discard',
      count: routed.discard,
      playerId,
    });
  }
  if (routed.lostZone > 0) {
    events.push({
      type: 'zoneMoved',
      from: 'board',
      to: 'lostZone',
      count: routed.lostZone,
      playerId,
    });
  }
}

export function handBoardCommand({ draft, playerId, events }) {
  const player = draft.players[playerId];
  const moved = player.zones.board.splice(0);
  player.zones.hand.push(...moved);
  events.push({
    type: 'zoneMoved',
    from: 'board',
    to: 'hand',
    count: moved.length,
    playerId,
  });
}

export function shuffleBoardCommand({ draft, playerId, activeRng, events }) {
  const player = draft.players[playerId];
  const moved = player.zones.board.splice(0);
  player.zones.deck.push(...moved);
  player.zones.deck = activeRng.shuffle(player.zones.deck);
  events.push({
    type: 'zoneShuffledIntoDeck',
    zoneId: 'board',
    count: moved.length,
    playerId,
  });
}

export function lostZoneBoardCommand({ draft, playerId, events }) {
  const player = draft.players[playerId];
  const moved = player.zones.board.splice(0);
  player.zones.lostZone.push(...moved);
  events.push({
    type: 'zoneMoved',
    from: 'board',
    to: 'lostZone',
    count: moved.length,
    playerId,
  });
}
