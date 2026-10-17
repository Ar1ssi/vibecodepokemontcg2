/**
 * @file Retreat: effective retreat cost, the Energy payment choice, the Active/Bench swap, and the
 * `retreat` command. Split out of reduce.mjs (design 073 B, I250); reduce.mjs stays the public
 * entry.
 */

import { discardCardToPlayerZone } from '../state.mjs';
import { isEnergy, getRetreatCostCount } from '../cards.mjs';
import { expandEnergyEntries, canPayAttackCost } from '../rules/attack-engine.mjs';
import { combinedToolRetreatCost } from '../rules/tool-combat.mjs';
import { teamNoRetreatCostForActive } from '../rules/ability-executors.mjs';
import { stadiumRetreatCoin } from '../rules/stadium-triggers.mjs';
import { applyStadiumSwitchTriggers } from '../effects/stadium-trigger-apply.mjs';
import { abilityRetreatCost } from '../rules/ability-combat.mjs';
import { createPendingChoice } from '../effects/executor.mjs';
import { clearAttackMarkers } from '../rules/attack-markers.mjs';
import {
  hasSpecialEnergyFreeRetreat, getSpecialEnergyRetreatReduction,
} from '../rules/special-energy-parse.mjs';
import { getStadiumRetreatCost, isStadiumToolNegation } from '../rules/stadium-effects.mjs';
import { serverEnergyDescriptor } from '../rules/server-energy.mjs';
import { clearConditions } from '../rules/special-conditions.mjs';
import {
  activeAttackMarkers, inPlayView, energyProvisionContext, markerCount, abilitySideContext,
} from './shared.mjs';

// Effective retreat cost including printed base stats, top evolution, attached Tools, Bench abilities, and Stadium modifiers.
// `zoneId` 'bench' prices a Benched Pokémon: its own zone's Tools/Energy, and none of the
// "your Active Pokémon's Retreat Cost" wordings (Bronzong Heavy Potential, I194).
export function computeEffectiveRetreatCost(state, card, playerId, { zoneId = 'active' } = {}) {
  if (!card) return 0;
  const isActive = zoneId === 'active';
  // Vespiquen Mach Wind (design 033): the Retreat Cost is 0 during the next turn.
  if (activeAttackMarkers(state, playerId, card).some((m) => m.kind === 'freeRetreat')) return 0;
  const player = state.players?.[playerId];
  const activeZone = player?.zones?.[zoneId] || [];
  const stadium = state.stadium;
  const baseRetreat = getRetreatCostCount(inPlayView(state, card));

  // Team-wide "no Retreat Cost" ability on a Benched Pokémon (e.g. Latias ex
  // "Skyliner") zeroes the Active Spot's cost regardless of printed/Tool/Stadium.
  // Read the top evolution of each Pokémon: the root of an evolved card is its
  // Basic, whose stage/ability must not stand in for the card in play.
  const benchViews = (player?.zones?.bench || []).map((b) =>
    inPlayView(state, b)
  );
  if (isActive && teamNoRetreatCostForActive(inPlayView(state, card), benchViews, activeZone)) return 0;
  // Magnetic Metal / Hiding Darkness / Holon WP Energy (audit SE6): "has no Retreat Cost".
  if (hasSpecialEnergyFreeRetreat(inPlayView(state, card), activeZone)) return 0;

  // 1. Tool retreat cost modifier + self ability modifier
  const blockTools = isStadiumToolNegation(stadium?.card || stadium);
  const opponentPlayer = state.players?.[
    Object.keys(state.players || {}).find((id) => id !== playerId)
  ];
  const sideCards = [...(player?.zones?.active || []), ...(player?.zones?.bench || [])];
  const opponentSideCards = [
    ...(opponentPlayer?.zones?.active || []),
    ...(opponentPlayer?.zones?.bench || []),
  ];
  let cost = combinedToolRetreatCost(baseRetreat, card, activeZone, {
    blockTools,
    stadium,
    benchCards: player?.zones?.bench || [],
    sideCards,
    opponentSideCards,
  });

  // 2. In-play ability retreat modifiers: the own-bench "your Active's Retreat
  // Cost is N less" wording and the opponent-side increases (A10). The position
  // lists let "as long as this Pokémon is on your Bench / your Active Pokémon"
  // holders be read (Dodrio Retreat Aid, Dark Muk Sticky Goo).
  const opponent = opponentPlayer;
  cost += abilityRetreatCost(inPlayView(state, card), {
    ...abilitySideContext(state, playerId),
    zone: zoneId,
    isActive,
  });

  // 3. Stadium retreat modifier (e.g. Beach Court)
  cost = getStadiumRetreatCost(cost, card, playerId, stadium);

  // 4. "Its Retreat Cost is {C} more" attack markers (Mawile, Grimer).
  cost += markerCount(activeAttackMarkers(state, playerId, card), 'retreatDelta', 'amount');

  // 5. Mystery Energy: "Retreat Cost is {C}{C} less".
  cost -= getSpecialEnergyRetreatReduction(inPlayView(state, card), activeZone);

  return Math.max(0, cost);
}

// 2+ Benched Pokémon and no explicit target: suspend and let the player click the
// one to switch in (server mat picker, D19). Legality has already guaranteed at
// least one valid bench target.
export function continueRetreat(draft, { playerId, benchInstanceId, discardEnergyIds, events }) {
  const benchRoots = (draft.players[playerId]?.zones?.bench || []).filter((c) => !c.attachedTo);
  if (benchInstanceId == null && benchRoots.length > 1) {
    draft.pendingChoice = createPendingChoice({
      player: playerId,
      prompt: 'Retreat: Choose a Benched Pokémon to switch in',
      source: 'retreat',
      options: benchRoots,
      min: 1,
      max: 1,
      stateVersion: draft.stateVersion,
      resumeToken: { effectType: 'retreat', initiatorPlayerId: playerId, discardEnergyIds },
    });
    return;
  }
  applyRetreatSwap(draft, { playerId, benchInstanceId, discardEnergyIds, events });
}

function retreatEnergyUnits(draft, playerId) {
  const player = draft.players[playerId];
  const active = player?.zones?.active?.find((c) => !c.attachedTo);
  if (!active) return { active: null, costN: 0, units: [] };
  const context = {
    stadiumCard: draft.stadium?.card || draft.stadium || null,
    ...energyProvisionContext(draft, playerId, active),
  };
  const units = player.zones.active
    .filter((c) => c.attachedTo === active.instanceId && isEnergy(c))
    .map((card) => ({
      card,
      entries: expandEnergyEntries([serverEnergyDescriptor(card, context)]),
    }));
  return { active, costN: computeEffectiveRetreatCost(draft, active, playerId), units };
}

// The player picks which Energy pays the Retreat Cost (rules: the retreating player
// chooses). Asked only when the pick matters: the attached Energy is not all the same
// card and there is more than the cost needs.
function offerRetreatEnergyChoice(draft, playerId, payload) {
  const { costN, units } = retreatEnergyUnits(draft, playerId);
  if (costN <= 0) return false;
  const total = units.reduce((sum, u) => sum + u.entries.length, 0);
  const names = new Set(units.map((u) => u.card.name));
  if (total <= costN || names.size < 2) return false;
  const allSingle = units.every((u) => u.entries.length === 1);
  draft.pendingChoice = createPendingChoice({
    player: playerId,
    prompt: `Retreat: Choose Energy to discard (cost ${costN})`,
    source: 'retreat',
    options: units.map((u) => u.card),
    min: allSingle ? costN : 1,
    max: Math.min(costN, units.length),
    stateVersion: draft.stateVersion,
    resumeToken: {
      effectType: 'retreatEnergy',
      initiatorPlayerId: playerId,
      benchInstanceId: payload?.benchInstanceId ?? null,
    },
  });
  return true;
}

// The picked Energy covers the cost, and dropping any one of them would not.
export function isExactRetreatPayment(draft, playerId, pickedIds) {
  if (pickedIds.length === 0 || new Set(pickedIds).size !== pickedIds.length) return false;
  const { costN, units } = retreatEnergyUnits(draft, playerId);
  const picked = pickedIds.map((id) => units.find((u) => u.card.instanceId === id));
  if (picked.some((u) => !u)) return false;
  const cost = new Array(costN).fill('Colorless');
  const pays = (list) => canPayAttackCost(list.flatMap((u) => u.entries), cost);
  if (!pays(picked)) return false;
  return picked.every((_, i) => !pays(picked.filter((__, j) => j !== i)));
}

/**
 * Applies an already-legal retreat: pays the Energy cost and swaps the Active with the
 * chosen Benched Pokémon. Pure; legality (turn, conditions, cost, bench non-empty) is
 * validated by the command gate before this runs. Shared by the direct `retreat` command
 * and the `retreat` PendingChoice resume path, so a player with 2+ Benched Pokémon can
 * click the one to switch in (design 017 / D19).
 */
export function applyRetreatSwap(
  draft,
  { playerId, benchInstanceId = null, discardEnergyIds = [], events }
) {
  const player = draft.players[playerId];
  const active = player?.zones?.active?.find((c) => !c.attachedTo);
  if (!player || !active) return;
  const costN = computeEffectiveRetreatCost(draft, active, playerId);

  // Discard energy cost
  if (Array.isArray(discardEnergyIds) && discardEnergyIds.length > 0) {
    for (const id of discardEnergyIds) {
      const idx = player.zones.active.findIndex((c) => c.instanceId === id);
      if (idx >= 0) {
        const [discarded] = player.zones.active.splice(idx, 1);
        discarded.attachedTo = null;
        const to = discardCardToPlayerZone(player, discarded);
        events.push({
          type: 'cardMoved',
          instanceId: id,
          from: 'active',
          to,
          playerId,
        });
      }
    }
  } else if (costN > 0) {
    let discardedCount = 0;
    for (
      let i = player.zones.active.length - 1;
      i >= 0 && discardedCount < costN;
      i--
    ) {
      const card = player.zones.active[i];
      if (card.attachedTo === active.instanceId && isEnergy(card)) {
        player.zones.active.splice(i, 1);
        card.attachedTo = null;
        const to = discardCardToPlayerZone(player, card);
        discardedCount++;
        events.push({
          type: 'cardMoved',
          instanceId: card.instanceId,
          from: 'active',
          to,
          playerId,
        });
      }
    }
  }

  // Bench swap
  let benchPokemon = null;
  if (benchInstanceId != null) {
    benchPokemon = player.zones.bench.find(
      (c) => c.instanceId === benchInstanceId
    );
  } else {
    benchPokemon = player.zones.bench.find((c) => !c.attachedTo);
  }

  if (active && benchPokemon) {
    // Move active + attachments to bench
    for (let i = player.zones.active.length - 1; i >= 0; i--) {
      const c = player.zones.active[i];
      if (
        c.instanceId === active.instanceId ||
        c.attachedTo === active.instanceId
      ) {
        player.zones.active.splice(i, 1);
        player.zones.bench.push(c);
      }
    }
    // Move benchPokemon + attachments to active
    for (let i = player.zones.bench.length - 1; i >= 0; i--) {
      const c = player.zones.bench[i];
      if (
        c.instanceId === benchPokemon.instanceId ||
        c.attachedTo === benchPokemon.instanceId
      ) {
        player.zones.bench.splice(i, 1);
        player.zones.active.push(c);
      }
    }

    // Stadium on-switch triggers (Spikemuth: damage the Pokémon moving to the
    // Bench) run before the outgoing Pokémon's conditions are cleared.
    applyStadiumSwitchTriggers(draft, {
      switchedOut: active,
      switchedIn: benchPokemon,
      switchedOutPlayerId: playerId,
      switchedInPlayerId: playerId,
      viaTrainer: false,
      duringOwnersTurn: true,
      events,
    });

    clearConditions(active);
    delete active.cannotAttackUntilTurn;
    delete active.cannotAttackAttackName;
    delete active.cannotRetreatUntilTurn;
    clearAttackMarkers(active);
    benchPokemon.movedToActiveTurn = Math.max(1, Number(draft.turn?.number) || 1);

    if (!player.flags) player.flags = {};
    player.flags.retreatedThisTurn = true;

    events.push({
      type: 'cardRetreated',
      activeId: active.instanceId,
      promotedId: benchPokemon.instanceId,
      playerId,
    });
  }
}

export function retreatCommand({ draft, playerId, payload, events, activeRng }) {
  const player = draft.players[playerId];

  // Mirage Stadium: the retreat costs a coin flip. Tails leaves the Active
  // unable to retreat this turn and no Energy is discarded.
  const mirage = stadiumRetreatCoin(draft.stadium?.card || draft.stadium);
  if (mirage) {
    const activeMon = (player?.zones?.active || []).find((c) => !c.attachedTo);
    const face = activeRng.next() < 0.5 ? 'heads' : 'tails';
    events.push({ type: 'coinFlipped', playerId, face, source: mirage.source });
    if (face === 'tails') {
      if (activeMon) activeMon.cannotRetreatUntilTurn = draft.turn.number;
      events.push({
        type: 'retreatBlocked',
        playerId,
        instanceId: activeMon?.instanceId ?? null,
        source: mirage.source,
      });
      return;
    }
  }

  const chosenEnergyIds = Array.isArray(payload?.discardEnergyIds)
    ? payload.discardEnergyIds
    : [];
  if (chosenEnergyIds.length === 0 && offerRetreatEnergyChoice(draft, playerId, payload)) return;
  continueRetreat(draft, {
    playerId,
    benchInstanceId: payload?.benchInstanceId ?? null,
    discardEnergyIds: chosenEnergyIds,
    events,
  });
}
