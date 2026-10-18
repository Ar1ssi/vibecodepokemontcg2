/**
 * @file Ability use: Call Energy, ability turn-end and outcome settles, and the
 * useAbility/useVStarGX commands. Split out of reduce.mjs (design 073 B, I250); reduce.mjs stays
 * the public entry.
 */

import { findCard, attachmentHostId } from '../state.mjs';
import { isBasicPokemon, isPokemon } from '../cards.mjs';
import { shuffleInPlace } from '../rng.mjs';
import { executeAbility, resolveAbilitySteps } from '../effects/ability.mjs';
import { selfAttachTargets } from '../effects/trainer-steps.mjs';
import { createPendingChoice } from '../effects/executor.mjs';
import { isSpecialEnergyCard, parseSpecialEnergyEffects } from '../rules/special-energy-parse.mjs';
import {
  setGameEnded, ensureOncePerGame, isGameConcluded, effectiveOncePerGameKind, rootsIn,
} from './shared.mjs';
import { settleVacatedActive } from './attack-steps.mjs';
import { handleKnockout } from './knockout.mjs';
import { endTurnFromEffect } from './turn.mjs';

export const CALL_ENERGY_EFFECT = 'callEnergy';

// Call Energy (I169): "Once during your turn, if the Pokémon Call Energy is attached to is your
// Active Pokémon, you may search your deck for up to 2 Basic Pokémon and put them onto your
// Bench. If you do, shuffle your deck and your turn ends." Activated through useAbility on
// the Energy card itself.
export function callEnergyStep(card) {
  if (!card || !isSpecialEnergyCard(card)) return null;
  return parseSpecialEnergyEffects(card)?.steps.find((step) => step.type === 'activatedSearch') || null;
}

export function callEnergyBlockReason(state, cardRef, playerId) {
  const step = callEnergyStep(cardRef.card);
  const player = state.players?.[playerId];
  if (state.turn?.player !== playerId) return "It isn't your turn.";
  if (cardRef.playerId !== playerId || cardRef.card.attachedTo == null) return 'This Energy is not attached to your Pokémon.';
  if (step.requiresActive && cardRef.zoneId !== 'active') return 'The Pokémon it is attached to must be your Active Pokémon.';
  if (step.oncePerTurn && player?.flags?.abilitiesUsed?.[cardRef.card.instanceId]) return 'Already used this turn.';
  if (rootsIn(player?.zones?.bench || []).length >= 5) return 'Your Bench is full.';
  return null;
}

function startCallEnergy(draft, { cardRef, playerId, activeRng, events }) {
  const step = callEnergyStep(cardRef.card);
  const player = draft.players[playerId];
  if (!player.flags) player.flags = {};
  player.flags.abilitiesUsed = { ...(player.flags.abilitiesUsed || {}), [cardRef.card.instanceId]: true };
  events.push({ type: 'abilityUsed', instanceId: cardRef.card.instanceId, name: cardRef.card.name, playerId });
  const room = 5 - rootsIn(player.zones.bench).length;
  const options = (player.zones.deck || []).filter((c) => isBasicPokemon(c));
  const max = Math.min(step.count || 1, room, options.length);
  if (max <= 0) {
    finishCallEnergy(draft, { playerId, activeRng, events });
    return;
  }
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    source: cardRef.card.name,
    prompt: `${cardRef.card.name}: put up to ${max} Basic Pokémon onto your Bench`,
    options,
    min: 0,
    max,
    resumeToken: { effectType: CALL_ENERGY_EFFECT, initiatorPlayerId: playerId, max },
  });
}

export function resumeCallEnergy(draft, { token, selection, activeRng, events }) {
  draft.pendingChoice = null;
  const playerId = token.initiatorPlayerId;
  const player = draft.players[playerId];
  const picked = (selection || []).slice(0, token.max);
  for (const id of picked) {
    const card = player.zones.deck.find((c) => c.instanceId === Number(id));
    if (!card || !isBasicPokemon(card) || rootsIn(player.zones.bench).length >= 5) continue;
    player.zones.deck.splice(player.zones.deck.indexOf(card), 1);
    card.enteredPlayTurn = draft.turn?.number ?? null;
    player.zones.bench.push(card);
    events.push({ type: 'cardMoved', instanceId: card.instanceId, from: 'deck', to: 'bench', playerId });
  }
  finishCallEnergy(draft, { playerId, activeRng, events });
}

function finishCallEnergy(draft, { playerId, activeRng, events }) {
  if (activeRng) shuffleInPlace(activeRng, draft.players[playerId].zones.deck);
  events.push({ type: 'deckShuffled', playerId });
  endTurnFromEffect(draft, { playerId, activeRng, events });
}

/** "If you use this Ability, your turn ends." — once the Ability has fully resolved. */
export function endTurnAfterAbility(draft, { result, playerId, activeRng, events }) {
  if (!result?.turnEnds || draft.pendingChoice || isGameConcluded(draft)) return;
  if (draft.turn?.player !== playerId) return;
  endTurnFromEffect(draft, { playerId, activeRng, events });
}

/**
 * Ability outcomes the effect executor can't apply itself, because the KO and game-end flow
 * lives here (design 034 slice 6), announced as events:
 * - `abilitySelfKnockOut` (Electrode Buzzap): Knock Out the holder — the opponent takes
 *   Prizes as usual — then, when the event names a `cardId`, attach that card to the chosen
 *   Pokémon as a Special Energy.
 * - `abilityWinsGame` (Unown MISSING / HAND / DAMAGE).
 */
export function settleAbilityOutcomes(draft, { events }) {
  for (const outcome of events.filter((e) => e.type === 'abilitySelfKnockOut')) {
    const player = draft.players[outcome.playerId];
    const oppId = Object.keys(draft.players || {}).find((id) => id !== outcome.playerId);
    const root = findCard(draft, outcome.rootId)?.card;
    const target = findCard(draft, outcome.targetId);
    // A plain self-KO (Cofagrigus Six Feet Under) carries no card to attach afterwards.
    const attachesSelf = outcome.cardId != null;
    if (!player || !root || (attachesSelf && !target) || isGameConcluded(draft)) continue;
    handleKnockout(draft, { victimPlayerId: outcome.playerId, attackerPlayerId: oppId, victim: root, events });
    if (!attachesSelf) continue;
    const ref = findCard(draft, outcome.cardId);
    if (!ref || !['discard', 'lostZone'].includes(ref.zoneId)) continue;
    const pile = player.zones[ref.zoneId];
    pile.splice(pile.indexOf(ref.card), 1);
    ref.card.asEnergy = { provides: outcome.provides };
    ref.card.attachedTo = outcome.targetId;
    player.zones[target.zoneId].push(ref.card);
    events.push({
      type: 'cardAttached',
      instanceId: ref.card.instanceId,
      targetInstanceId: outcome.targetId,
      playerId: outcome.playerId,
    });
  }
  const win = events.find((e) => e.type === 'abilityWinsGame');
  if (win && !isGameConcluded(draft)) {
    setGameEnded(draft, { winner: win.playerId, reason: win.reason, events });
  }
}

// The hand-attach-as-Energy step (Charjabug Battery, UNB 58) of one of the card's Abilities.
function handSelfAttachAbility(card) {
  const abilities = Array.isArray(card?.abilities) ? card.abilities : [];
  for (let abilityIndex = 0; abilityIndex < abilities.length; abilityIndex += 1) {
    const ability = abilities[abilityIndex];
    const text = typeof ability === 'string' ? ability : ability?.text || '';
    const step = resolveAbilitySteps(text, { selfName: card.name }).steps.find(
      (s) => s.type === 'selfAttachEnergyAbility' && s.fromHand
    );
    if (step) return { abilityIndex, step };
  }
  return null;
}

/**
 * The client drops a hand card onto a Pokémon as attachCard. A Charjabug dropped onto a Pokémon
 * its Battery may attach to is that Ability, aimed at the drop target, not a failed evolve.
 * Any other target (a Grubbin it evolves from) keeps the attachCard.
 *
 * @param {object} state GameState
 * @param {object} command Shape-valid command envelope
 * @returns {object} The useAbility command, or the original command unchanged
 */
export function promoteSelfAttachDrop(state, command) {
  if (!state.rulesEnabled) return command;
  const { type, payload, playerId } = command;
  if (type !== 'attachCard') return command;
  const cardRef = findCard(state, payload.instanceId);
  if (!cardRef || cardRef.zoneId !== 'hand' || cardRef.playerId !== playerId) return command;
  if (!isPokemon(cardRef.card)) return command;
  const found = handSelfAttachAbility(cardRef.card);
  if (!found) return command;
  const hostId = attachmentHostId(state, payload.targetInstanceId);
  const player = state.players?.[playerId];
  const targets = selfAttachTargets({ player, step: found.step }, null);
  if (!targets.some((root) => root.instanceId === hostId)) return command;
  return {
    ...command,
    type: 'useAbility',
    payload: { instanceId: payload.instanceId, abilityIndex: found.abilityIndex, targetInstanceId: hostId },
  };
}

export function useAbilityCommand({ draft, payload, playerId, activeRng, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef && callEnergyStep(cardRef.card)) {
    startCallEnergy(draft, { cardRef, playerId, activeRng, events });
    return;
  }
  if (cardRef) {
    const result = executeAbility(draft, {
      card: cardRef.card,
      abilityIndex: payload.abilityIndex ?? 0,
      targetInstanceId: payload.targetInstanceId ?? null,
      playerId,
      activeRng,
      events,
    });
    settleAbilityOutcomes(draft, { events });
    if (isGameConcluded(draft)) return;
    // An ability that shuffles the Active Pokémon into the deck leaves the spot empty.
    if (cardRef.zoneId === 'active' && findCard(draft, payload.instanceId)?.zoneId !== 'active') {
      const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
      settleVacatedActive(draft, { playerId, oppId, events });
    }
    endTurnAfterAbility(draft, { result, playerId, activeRng, events });
  }
}

export function useVStarGXCommand({ draft, command, playerId, events, payload }) {
  const kind = effectiveOncePerGameKind(draft, command);
  // `player.oncePerGame` is the single source of truth (App. 9/19); `view.mjs`
  // projects it into the exposed `flags` for the client, so nothing is mirrored here.
  // `kind === null` is the legacy fallback: no discriminator and no classifiable
  // source card, so spend both allowances as before.
  const oncePerGame = ensureOncePerGame(draft, playerId);
  if (kind !== 'gx') {
    if (oncePerGame) oncePerGame.vstarUsed = true;
  }
  if (kind !== 'vstar') {
    if (oncePerGame) oncePerGame.gxUsed = true;
  }
  events.push({
    type: 'vstarUsed',
    playerId,
    instanceId: payload.instanceId,
    kind,
  });
}
