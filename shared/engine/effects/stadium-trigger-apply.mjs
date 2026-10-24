/**
 * @file Applies Stadium trigger descriptors (design 035 slice 10) to board cards.
 * Split out of reduce.mjs so the effect executor's switch steps (switchOwn /
 * switch / switchAbility, Erika's Invitation, special-energy switches) fire the
 * same on-switch triggers (Spikemuth damage, Dust Island condition copy).
 */

import {
  addCondition,
  clearConditions,
  hasAnyCondition,
  hasCondition,
  listConditions,
} from '../rules/special-conditions.mjs';
import { stadiumOnSwitchTriggers } from '../rules/stadium-triggers.mjs';
import { inPlayEntries, parseOpponentSwitchDamage } from '../rules/ability-triggers.mjs';
import { healBlockedByAbility, sideContextFor } from '../rules/ability-combat.mjs';

/**
 * Applies one Stadium trigger descriptor to a Pokémon. `draft` is accepted for
 * symmetry with the reducer's other helpers; the descriptor itself carries
 * everything needed.
 */
export function applyStadiumTriggerEffect(draft, effect, { host, hostPlayerId, events }) {
  if (!host || !effect) return;
  if (effect.kind === 'damage' && effect.amount > 0) {
    host.damage = (host.damage || 0) + effect.amount;
    events.push({
      type: 'damageUpdated',
      instanceId: host.instanceId,
      damage: host.damage,
      source: effect.source,
    });
    // Lethal counters become a Knock Out via the reducer's post-command sweep.
    events.push({
      type: 'damageCountersPlaced',
      instanceId: host.instanceId,
      victimPlayerId: hostPlayerId,
      attackerPlayerId: null,
      damage: host.damage,
    });
  } else if (effect.kind === 'heal' && effect.amount > 0 && !healBlockedByAbility(draft, host)) {
    const oldDamage = host.damage || 0;
    host.damage = Math.max(0, oldDamage - effect.amount);
    events.push({
      type: 'damageUpdated',
      instanceId: host.instanceId,
      damage: host.damage,
      healed: oldDamage - host.damage,
      source: effect.source,
    });
  }
  if ((effect.kind === 'cure' || effect.cure) && hasAnyCondition(host)) {
    clearConditions(host);
    events.push({
      type: 'specialConditionUpdated',
      instanceId: host.instanceId,
      condition: null,
      conditions: [],
    });
  }
}

/**
 * Fires the Stadium's on-switch triggers for an Active Pokémon that moved to the
 * Bench, then the Abilities that hit a switched-in Active (Ancient Hazard). Call before the
 * switched-out Pokémon's conditions are cleared so Dust Island still sees its Poisoned state.
 *
 * @param {object} draft
 * @param {{ switchedOut?: object, switchedIn?: object, switchedOutPlayerId?: string,
 *   switchedInPlayerId?: string, viaTrainer?: boolean, duringOwnersTurn?: boolean,
 *   events: object[] }} params
 */
export function applyStadiumSwitchTriggers(
  draft,
  {
    switchedOut,
    switchedIn,
    switchedOutPlayerId,
    switchedInPlayerId,
    viaTrainer = false,
    duringOwnersTurn = true,
    events,
  }
) {
  const stadium = draft.stadium?.card || draft.stadium;
  for (const effect of stadiumOnSwitchTriggers(stadium, {
    switchedOut,
    switchedIn,
    viaTrainer,
    duringOwnersTurn,
  })) {
    if (effect.kind === 'copyConditions') {
      if (!switchedIn || !hasCondition(switchedOut, effect.condition)) continue;
      addCondition(switchedIn, effect.condition);
      events.push({
        type: 'specialConditionUpdated',
        instanceId: switchedIn.instanceId,
        condition: effect.condition,
        conditions: listConditions(switchedIn),
      });
      continue;
    }
    const host = effect.target === 'switchedOut' ? switchedOut : switchedIn;
    applyStadiumTriggerEffect(draft, effect, {
      host,
      hostPlayerId:
        effect.target === 'switchedOut' ? switchedOutPlayerId : switchedInPlayerId,
      events,
    });
  }
  applyAbilitySwitchDamage(draft, { switchedIn, switchedInPlayerId, switchedOutPlayerId, events });
}

/**
 * Pokémon Ability on-switch damage (Hisuian Samurott ex Ancient Hazard): an Active the opponent
 * switches in takes the holder's counters. Holders are read from the side that did not switch.
 */
function applyAbilitySwitchDamage(draft, { switchedIn, switchedInPlayerId, switchedOutPlayerId, events }) {
  if (!switchedIn || switchedOutPlayerId == null) return;
  const entries = inPlayEntries(draft);
  const ctx = sideContextFor(draft, switchedOutPlayerId);
  for (const hazard of parseOpponentSwitchDamage(entries, ctx, switchedOutPlayerId)) {
    // `count` is damage counters; the damage path takes HP (one counter is 10).
    applyStadiumTriggerEffect(draft, { kind: 'damage', amount: hazard.count * 10, source: hazard.source }, {
      host: switchedIn,
      hostPlayerId: switchedInPlayerId,
      events,
    });
  }
}
