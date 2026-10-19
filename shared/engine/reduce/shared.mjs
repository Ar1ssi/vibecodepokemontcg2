/**
 * @file Small reducer helpers used by more than one reduce/ domain: in-play views, attack markers,
 * game-end and once-per-game reads, zone discards, condition events. Split out of reduce.mjs
 * (design 073 B, I250); reduce.mjs stays the public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isPokemon } from '../cards.mjs';
import { attachedTrainerMarkers } from '../rules/legacy-attached-trainer.mjs';
import { sideContextFor } from '../rules/ability-combat.mjs';
import { pokemonHasType } from '../effects/trainer-steps.mjs';
import { liveAttackMarkers } from '../rules/attack-markers.mjs';
import { effectiveHp } from '../rules/stadium-effects.mjs';
import { isGxCard, isVstarCard } from '../rules/card-classify.mjs';
import { evolvedView } from '../rules/evolved-pokemon.mjs';
import { listConditions } from '../rules/special-conditions.mjs';

/** Benched Pokémon of a player, roots only (attached cards are not targets). */
export function benchTargets(player) {
  return (player?.zones?.bench || []).filter(
    (c) => !c.attachedTo && isPokemon(c)
  );
}

export function discardCardFromPlayerZone(draft, instanceId, playerId) {
  const player = draft.players[playerId];
  if (!player?.zones) return null;
  for (const zoneKey of ['active', 'bench']) {
    const zone = player.zones[zoneKey];
    if (!Array.isArray(zone)) continue;
    const idx = zone.findIndex((c) => c.instanceId === instanceId);
    if (idx !== -1) {
      const [removed] = zone.splice(idx, 1);
      removed.attachedTo = null;
      discardCardToPlayerZone(player, removed);
      return removed;
    }
  }
  return null;
}

// Timed attack effects (design 031) still in force on a Pokémon in its owner's Active Spot.
export function activeAttackMarkers(draft, playerId, card) {
  const active = draft.players[playerId]?.zones?.active || [];
  if (!card || !active.some((c) => c.instanceId === card.instanceId)) return [];
  const otherId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  return [
    ...liveAttackMarkers(card, {
      turnNumber: draft.turn?.number || 1,
      zoneCards: active,
      sourceZoneCards: draft.players[otherId]?.zones?.active || [],
    }),
    ...restOfGameMarkers(draft, playerId, card),
    // I224: PlusPower / Defender / Magnifier attached to it, read as the same marker kinds.
    ...attachedTrainerMarkers(active, card),
  ];
}

// "For the rest of this game, …" (design 036 E) read as the marker kinds the damage path knows:
// a bonus on the player's Active attacker, a reduction on their typed Active defender.
function restOfGameMarkers(draft, playerId, card) {
  const effects = draft.players[playerId]?.restOfGame || [];
  if (effects.length === 0) return [];
  const view = inPlayView(draft, card);
  return effects.flatMap((effect) => {
    if (effect.kind === 'damageBonus') return [{ kind: 'nextTurnBonus', amount: effect.amount }];
    if (effect.kind === 'damageReduce' && (!effect.pokemonType || pokemonHasType(view, effect.pokemonType))) {
      return [{ kind: 'incomingReduce', amount: effect.amount, afterWR: true }];
    }
    return [];
  });
}

// An in-play Pokémon as its top evolution card (see evolved-pokemon.mjs). Read-only.
export function inPlayView(state, card) {
  if (!card) return card;
  const ref = findCard(state, card.instanceId);
  const zone = ref?.player?.zones?.[ref.zoneId];
  return Array.isArray(zone) ? evolvedView(zone, card) : card;
}

// Context a special Energy's provision conditions read (energy-effects
// rewriteEnergyDescriptor): the host as it is in play, every card attached to it, and
// the prize / Stage 2 facts behind Reversal, Counter, Scramble and Super Boost Energy.
export function energyProvisionContext(state, playerId, host) {
  const player = state.players?.[playerId];
  const opponentId = Object.keys(state.players || {}).find((id) => id !== playerId);
  const ref = host ? findCard(state, host.instanceId) : null;
  const zone = ref?.player?.zones?.[ref.zoneId] || [];
  const roots = ['active', 'bench'].flatMap((zoneId) =>
    (player?.zones?.[zoneId] || [])
      .filter((c) => !c.attachedTo && isPokemon(c))
      .map((c) => evolvedView(player.zones[zoneId], c))
  );
  return {
    hostPokemon: inPlayView(state, host),
    attachedCards: host ? zone.filter((c) => c.attachedTo === host.instanceId) : [],
    board: {
      ownPrizes: (player?.zones?.prizes || []).length,
      opponentPrizes: (state.players?.[opponentId]?.zones?.prizes || []).length,
      ownStage2InPlay: roots.filter(
        (c) => String(c.stage ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'stage2'
      ).length,
    },
  };
}

export const cardText = (card) =>
  [card?.text, card?.effect, card?.cardText].find((v) => typeof v === 'string' && v) || '';

// Effective HP including printed base stats, top evolution, attached Tools, Stadium modifiers, and ability HP bonuses.
export function cardEffectiveHp(state, card, playerId) {
  if (!card) return 0;
  const view = inPlayView(state, card);
  const baseHp = view?.hp || 0;
  if (!baseHp) return 0;
  const ref = findCard(state, card.instanceId);
  const zoneCards = ref?.player?.zones?.[ref.zoneId] || [];
  const zones = state.players?.[playerId]?.zones || {};
  const sideCards = [...(zones.active || []), ...(zones.bench || [])];
  // The view, not the root: +HP gates read the Pokémon in play (Growing Grass on an evolved
  // {G} Pokémon whose Basic is another type, audit SE13e).
  return effectiveHp(baseHp, playerId, view, zoneCards, state.stadium, sideCards);
}

export function markerCount(markers, kind, field) {
  return markers.reduce((sum, marker) => sum + (marker.kind === kind ? marker[field] || 0 : 0), 0);
}

export function conditionsUpdatedEvent(card, condition) {
  return {
    type: 'specialConditionUpdated',
    instanceId: card.instanceId,
    condition,
    conditions: listConditions(card),
  };
}

/**
 * Marks game as ended with winner and reason, or — when both players satisfy a
 * win condition on the same Knockout — enters the sudden-death `tiebreak`
 * phase with no winner (rulebook 30c 1.3a).
 */
export function setGameEnded(draft, { winner, reason, simultaneous, ways, events }) {
  if (Array.isArray(simultaneous) && simultaneous.length === 2) {
    const [a, b] = simultaneous;
    draft.turn.phase = 'tiebreak';
    draft.winner = null;
    draft.winReason = 'simultaneous';
    // Sudden death: the first Prize taken from here wins, including after the
    // interim `pass` hand-over that flips the turn back to `main` (1.2). The
    // fresh six-prize mat is a tracked follow-up; this flag is the interim
    // "first Prize wins" rule, the same one `setupGame({ firstPrizeWins })` sets.
    draft.firstPrizeWins = true;
    draft.tiebreak = {
      players: [a, b],
      ways: {
        [a]: [...(ways?.[a] || [])],
        [b]: [...(ways?.[b] || [])],
      },
    };
    events.push({ type: 'tiebreakStarted', players: [a, b] });
    return;
  }
  draft.turn.phase = 'ended';
  draft.winner = winner;
  draft.winReason = reason;
  events.push({ type: 'gameEnded', winner, reason });
}

/**
 * Per-player, per-game markers (App. 9/19). Unlike `player.flags`, advanceTurn never
 * rebuilds this object, so the GX-attack and VSTAR Power limits survive the turn.
 * Lazily initialised so states that predate the field (old snapshots, tests) still work.
 */
export function ensureOncePerGame(draft, playerId) {
  const player = draft?.players?.[playerId];
  if (!player) return null;
  if (!player.oncePerGame) {
    player.oncePerGame = { vstarUsed: false, gxUsed: false };
  }
  return player.oncePerGame;
}

/**
 * Whether the game has stopped resolving normal play — either finished or
 * awaiting its sudden-death tiebreaker. Start/end-of-turn hooks must not fire
 * once this is true.
 */
export function isGameConcluded(draft) {
  const phase = draft?.turn?.phase;
  return phase === 'ended' || phase === 'tiebreak';
}

/**
 * Whether the game has no legal play left at all. Unlike `isGameConcluded`,
 * this excludes `tiebreak`: during a sudden-death tiebreak a `pass` may still
 * hand the turn over (1.2), so only a decided-but-unresolved `ended` state
 * freezes the game.
 */
export function isGameFrozen(draft) {
  return draft?.turn?.phase === 'ended';
}

// Ability-combat context for the player whose turn/command this is.
export const abilitySideContext = sideContextFor;

/**
 * Which once-per-game allowance a `useVStarGX` command spends: the explicit
 * `payload.kind` when the sender provides it, otherwise the source card's
 * subtype (a VSTAR Power vs a GX attack). Returns null when neither is
 * establishable, in which case the legacy both-flags behaviour applies.
 */
export function effectiveOncePerGameKind(state, command) {
  const kind = command?.payload?.kind;
  if (kind === 'vstar' || kind === 'gx') return kind;
  const card = findCard(state, command?.payload?.instanceId)?.card;
  if (isVstarCard(card)) return 'vstar';
  if (isGxCard(card)) return 'gx';
  return null;
}

/**
 * Whether the game is in a sudden-death tiebreaker where the first Prize card
 * taken wins: either the detected draw's `tiebreak` phase or a fresh tiebreak
 * game flagged by `setupGame({ firstPrizeWins: true })`.
 */
export function tiebreakActive(state) {
  return state?.turn?.phase === 'tiebreak' || state?.firstPrizeWins === true;
}

/** Shuffles a player's deck with the command RNG (no-op without one). */
export function shuffleDeckWithRng(player, rng) {
  if (player?.zones?.deck && rng) player.zones.deck = rng.shuffle(player.zones.deck);
}

export const rootsIn = (cards) => (cards || []).filter((c) => !c.attachedTo && isPokemon(c));
