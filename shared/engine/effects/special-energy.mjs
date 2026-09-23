/**
 * @file Authoritative execution of Special Energy triggers.
 *
 * The pure planner lives in `rules/special-energy-parse.mjs`; this module turns
 * its action list into draft mutations for the server-authoritative engine
 * (`reduce.mjs`). It mirrors the legacy client wiring (rules-bridge / move-card /
 * chat-buttons) so both modes agree, and is headless-tested.
 *
 * Trigger sites in `reduce.mjs`:
 *   attach    -> `case 'attachCard'` (after `cardAttached`)
 *   evolve    -> `case 'attachCard'` evolution branch (after `pokemonEvolved`)
 *   damaged   -> `resolveAttackEffectPhase` (after defender damage)
 *   knockout  -> `handleKnockout` (before the discard sweep)
 *   discard   -> `discardCardFromPlayerZone` / `handleKnockout` attached sweep
 *   endTurn   -> `resolveCheckup` (both players, active + bench)
 */
import {
  planSpecialEnergyTriggers,
  isSpecialEnergyCard,
} from '../rules/special-energy-parse.mjs';
import { clearConditions } from '../rules/special-conditions.mjs';
import { topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { isEnergy } from '../cards.mjs';
import { findCard } from '../state.mjs';

const SPECIAL_ENERGY_EFFECT = 'specialEnergy';

/** Deterministic PendingChoice (Invariant 6) — inlined to avoid an effects cycle. */
function makeChoice({ player, prompt, options, min, max, resumeToken, stateVersion = 0, stepIndex = 0 }) {
  const token = { ...resumeToken, initiatorPlayerId: player };
  return {
    choiceId: `choice_${player}_${stateVersion}_${stepIndex}`,
    player,
    prompt,
    source: SPECIAL_ENERGY_EFFECT,
    options: (options || []).map((opt) => ({
      instanceId: opt.instanceId,
      name: opt.name || '',
      src: opt.src || '',
      type: opt.type || '',
    })),
    min,
    max,
    cancellable: false,
    resumeToken: token,
  };
}

function zoneOf(draft, playerId, zoneId) {
  return draft.players?.[playerId]?.zones?.[zoneId] || [];
}

function drawCards(draft, playerId, count, events) {
  const n = Math.max(0, count | 0);
  if (n <= 0) return 0;
  const deck = zoneOf(draft, playerId, 'deck');
  const hand = draft.players[playerId].zones.hand;
  const drawn = deck.splice(0, Math.min(n, deck.length));
  hand.push(...drawn);
  if (drawn.length) {
    events.push({
      type: 'cardsDrawn',
      count: drawn.length,
      playerId,
      cards: drawn.map((c) => c.instanceId),
    });
  }
  return drawn.length;
}

function healCard(card, amount, events) {
  const healed = Math.min(card.damage || 0, Math.max(0, amount));
  if (healed <= 0) return;
  card.damage -= healed;
  events.push({
    type: 'damageUpdated',
    instanceId: card.instanceId,
    damage: card.damage,
    healed,
  });
}

/** Moves a Pokémon root plus everything attached to it between active and bench. */
function moveStackToZone(draft, playerId, root, toZoneId, events) {
  const zones = draft.players[playerId].zones;
  const fromZoneId = zones.active.includes(root) ? 'active' : 'bench';
  if (fromZoneId === toZoneId) return;
  const from = zones[fromZoneId];
  const to = zones[toZoneId];
  for (let i = from.length - 1; i >= 0; i--) {
    const c = from[i];
    if (c === root || c.attachedTo === root.instanceId) {
      from.splice(i, 1);
      to.push(c);
    }
  }
  events.push({
    type: 'cardMoved',
    instanceId: root.instanceId,
    from: fromZoneId,
    to: toZoneId,
    playerId,
  });
}

/** Swaps a player's Active with the given Benched root (attachments follow). */
function swapActiveBench(draft, playerId, benchRoot, events) {
  const zones = draft.players[playerId].zones;
  const active = zones.active.find((c) => !c.attachedTo);
  if (!active || active === benchRoot) return;
  benchRoot.movedToActiveTurn = Math.max(1, Number(draft.turn?.number) || 1);
  moveStackToZone(draft, playerId, benchRoot, 'active', events);
  moveStackToZone(draft, playerId, active, 'bench', events);
}

function ctxFor(token, host, attacker) {
  return {
    hostInstanceId: host?.instanceId ?? null,
    hostPlayerId: token.hostPlayerId,
    hostZoneId: token.hostZoneId,
    attackerInstanceId: attacker?.instanceId ?? token.attackerInstanceId ?? null,
    attackerPlayerId: token.attackerPlayerId ?? null,
    fromZone: token.fromZone ?? null,
    trigger: token.trigger,
  };
}

/** Applies a single plan. `selection` is only used when resuming a choice plan. */
function applyPlan(draft, plan, ctx, selection = null) {
  const events = ctx.events;
  const host = ctx.hostInstanceId != null ? findCard(draft, ctx.hostInstanceId)?.card : null;
  if (!host) return;
  const zone = zoneOf(draft, ctx.hostPlayerId, ctx.hostZoneId);

  switch (plan.action) {
    case 'draw':
      drawCards(draft, ctx.hostPlayerId, plan.count, events);
      break;
    case 'drawUntil': {
      const hand = draft.players[ctx.hostPlayerId].zones.hand;
      drawCards(draft, ctx.hostPlayerId, Math.max(0, plan.until - hand.length), events);
      break;
    }
    case 'heal':
      healCard(host, plan.amount, events);
      break;
    case 'removeDamage':
      healCard(host, plan.count * 10, events);
      if (plan.alsoCure) clearConditions(host);
      break;
    case 'addDamage': {
      const target =
        plan.target === 'attacker'
          ? ctx.attackerInstanceId != null
            ? findCard(draft, ctx.attackerInstanceId)?.card
            : null
          : host;
      if (!target) break;
      if (plan.against === 'pokemonEx' && !/\bex\b/i.test(String(target.name || ''))) break;
      target.damage = (target.damage || 0) + plan.count * 10;
      events.push({ type: 'damageUpdated', instanceId: target.instanceId, damage: target.damage });
      // Lethal damage must become a knockout (prizes and all). handleKnockout
      // lives in reduce.mjs, which imports this module, so mark the placement
      // for the reducer's post-command KO sweep — the same contract
      // trainer-steps' damageCounters uses. Without it, end-of-turn ticks and
      // Dangerous-style retaliation left 0-HP Pokémon in play with no prizes.
      const targetRef = findCard(draft, target.instanceId);
      const targetPlayerId = targetRef?.playerId;
      events.push({
        type: 'damageCountersPlaced',
        instanceId: target.instanceId,
        victimPlayerId: targetPlayerId,
        // A host damaging itself hands the KO benefit to its opponent; a
        // retaliation against the attacker hands it to the host's player.
        attackerPlayerId:
          target.instanceId === ctx.hostInstanceId
            ? Object.keys(draft.players || {}).find((id) => id !== targetPlayerId)
            : ctx.hostPlayerId,
        damage: target.damage,
      });
      break;
    }
    case 'clearStatus':
      clearConditions(host);
      break;
    case 'returnBasicEnergy': {
      const basic = zone.find(
        (c) => c && isEnergy(c) && !isSpecialEnergyCard(c) && c.attachedTo === host.instanceId
      );
      if (basic) {
        const i = zone.indexOf(basic);
        if (i >= 0) {
          zone.splice(i, 1);
          basic.attachedTo = null;
          draft.players[ctx.hostPlayerId].zones.hand.push(basic);
          events.push({
            type: 'cardMoved',
            instanceId: basic.instanceId,
            from: ctx.hostZoneId,
            to: 'hand',
            playerId: ctx.hostPlayerId,
          });
        }
      }
      break;
    }
    case 'devolve': {
      healCard(host, plan.count * 10, events);
      const top = topPokemonCard(zone, host);
      if (top && top.instanceId !== host.instanceId) {
        const ti = zone.indexOf(top);
        if (ti >= 0) {
          zone.splice(ti, 1);
          top.attachedTo = null;
          top.damage = 0;
          clearConditions(top);
          draft.players[ctx.hostPlayerId].zones.discard.push(top);
          events.push({
            type: 'pokemonDevolved',
            playerId: ctx.hostPlayerId,
            instanceId: top.instanceId,
            targetInstanceId: host.instanceId,
          });
        }
      }
      break;
    }
    case 'search': {
      const deck = zoneOf(draft, ctx.hostPlayerId, 'deck');
      const chosen = selection || [];
      for (const id of chosen) {
        const idx = deck.findIndex((c) => c.instanceId === id);
        if (idx < 0) continue;
        const [c] = deck.splice(idx, 1);
        c.attachedTo = null;
        draft.players[ctx.hostPlayerId].zones.bench.push(c);
        events.push({
          type: 'cardMoved',
          instanceId: c.instanceId,
          from: 'deck',
          to: 'bench',
          playerId: ctx.hostPlayerId,
        });
      }
      break;
    }
    case 'switch': {
      if (plan.side === 'self') {
        const benchRoot =
          selection && selection.length
            ? findCard(draft, selection[0])?.card
            : host;
        if (benchRoot) swapActiveBench(draft, ctx.hostPlayerId, benchRoot, events);
      } else {
        const oppId = Object.keys(draft.players || {}).find((id) => id !== ctx.hostPlayerId);
        const benchRoot = selection && selection.length ? findCard(draft, selection[0])?.card : null;
        if (oppId && benchRoot) swapActiveBench(draft, oppId, benchRoot, events);
      }
      break;
    }
    default:
      break;
  }
}

function planIsChoice(plan) {
  return plan.action === 'search' || plan.action === 'switch';
}

/** Builds a PendingChoice for a choice plan, or applies it when deterministic. */
function handleChoicePlan(draft, item, ctx, queue, index) {
  const plan = item.plan;
  if (plan.action === 'search') {
    const deck = zoneOf(draft, ctx.hostPlayerId, 'deck');
    const matches = deck.filter((c) => matchesSearch(c, plan.what));
    if (matches.length === 0) return 'done';
    const max = Math.min(plan.count, matches.length);
    return makeChoice({
      player: ctx.hostPlayerId,
      prompt: `Search your deck for up to ${max} ${plan.what}`,
      options: matches,
      min: 0,
      max,
      resumeToken: {
        effectType: SPECIAL_ENERGY_EFFECT,
        trigger: ctx.trigger,
        hostInstanceId: ctx.hostInstanceId,
        hostPlayerId: ctx.hostPlayerId,
        hostZoneId: ctx.hostZoneId,
        attackerInstanceId: ctx.attackerInstanceId,
        attackerPlayerId: ctx.attackerPlayerId,
        fromZone: ctx.fromZone,
        queue,
        index,
      },
    });
  }
  // switch
  if (plan.side === 'self' && plan.target === 'benchedToActive') {
    // The host itself is the Benched Pokémon switching in — no choice.
    swapActiveBench(draft, ctx.hostPlayerId, findCard(draft, ctx.hostInstanceId)?.card, ctx.events);
    return 'done';
  }
  const playerId =
    plan.side === 'self'
      ? ctx.hostPlayerId
      : Object.keys(draft.players || {}).find((id) => id !== ctx.hostPlayerId);
  const bench = zoneOf(draft, playerId, 'bench').filter((c) => !c.attachedTo);
  if (bench.length === 0) return 'done';
  if (bench.length === 1) {
    swapActiveBench(draft, playerId, bench[0], ctx.events);
    return 'done';
  }
  return makeChoice({
    player: ctx.hostPlayerId,
    prompt: `${plan.side === 'self' ? 'Switch your Active Pokémon' : "Switch your opponent's Active Pokémon"} — choose a Benched Pokémon`,
    options: bench,
    min: 1,
    max: 1,
    resumeToken: {
      effectType: SPECIAL_ENERGY_EFFECT,
      trigger: ctx.trigger,
      hostInstanceId: ctx.hostInstanceId,
      hostPlayerId: ctx.hostPlayerId,
      hostZoneId: ctx.hostZoneId,
      attackerInstanceId: ctx.attackerInstanceId,
      attackerPlayerId: ctx.attackerPlayerId,
      fromZone: ctx.fromZone,
      queue,
      index,
    },
  });
}

function runQueue(draft, queue, index, ctx) {
  for (let i = index; i < queue.length; i++) {
    const item = queue[i];
    if (planIsChoice(item.plan)) {
      const res = handleChoicePlan(draft, item, ctx, queue, i);
      if (res && res !== 'done') {
        draft.pendingChoice = res;
        return res;
      }
      continue;
    }
    applyPlan(draft, item.plan, ctx);
  }
  return null;
}

/**
 * Runs the planner for a trigger and applies the resulting actions.
 *
 * @returns {object|null} the PendingChoice that suspended execution, else null.
 */
export function runSpecialEnergyTriggers(draft, {
  trigger,
  host,
  // Type/name/HP gates must read what the Pokémon *is* — the top evolution card —
  // while attachments, damage and identity stay on the root (`host`). Passing only
  // the root silently skipped every hostType-gated effect on an evolved Pokémon.
  hostTop = null,
  hostPlayerId,
  hostZoneId,
  energy = null,
  fromZone = null,
  attacker = null,
  attackerPlayerId = null,
  events,
} = {}) {
  if (!draft || !host || !trigger) return null;
  const zone = zoneOf(draft, hostPlayerId, hostZoneId);
  const energies = energy
    ? [energy]
    : zone.filter(
        (c) => c && isSpecialEnergyCard(c) && c.attachedTo === host.instanceId
      );
  const queue = [];
  for (const e of energies) {
    const plans = planSpecialEnergyTriggers(e, {
      trigger,
      host: hostTop || host,
      zoneArray: zone,
      fromZone,
      attackExecuting: !!draft.__attackEffectPhase,
    });
    for (const plan of plans) queue.push({ energyInstanceId: e.instanceId, plan });
  }
  const ctx = {
    hostInstanceId: host.instanceId,
    hostPlayerId,
    hostZoneId,
    attackerInstanceId: attacker?.instanceId ?? null,
    attackerPlayerId,
    fromZone,
    trigger,
    events,
  };
  return runQueue(draft, queue, 0, ctx);
}

/** Resumes a suspended special-energy trigger after a player's choice. */
export function resumeSpecialEnergyTrigger(draft, { selection, events, resumeToken }) {
  const token = resumeToken || {};
  const queue = Array.isArray(token.queue) ? token.queue : [];
  const index = token.index ?? 0;
  const host = token.hostInstanceId != null ? findCard(draft, token.hostInstanceId)?.card : null;
  if (!host) {
    draft.pendingChoice = null;
    return null;
  }
  const attacker =
    token.attackerInstanceId != null ? findCard(draft, token.attackerInstanceId)?.card : null;
  const ctx = { ...ctxFor(token, host, attacker), events };
  const pending = queue[index];
  if (pending) applyPlan(draft, pending.plan, ctx, selection || []);
  draft.pendingChoice = null;
  const next = runQueue(draft, queue, index + 1, ctx);
  if (!next) draft.pendingChoice = null;
  return next;
}

/**
 * Convenience: run a trigger for every attached special energy on every in-play
 * Pokémon of both players (used by the end-of-turn checkup).
 */
export function runEndOfTurnSpecialEnergies(draft, { events } = {}) {
  if (!draft?.players) return;
  for (const pid of Object.keys(draft.players)) {
    for (const zoneId of ['active', 'bench']) {
      const zone = zoneOf(draft, pid, zoneId);
      for (const host of [...zone]) {
        if (!host || host.attachedTo) continue;
        runSpecialEnergyTriggers(draft, {
          trigger: 'endTurn',
          host,
          hostTop: topPokemonCard(zone, host),
          hostPlayerId: pid,
          hostZoneId: zoneId,
          events,
        });
      }
    }
  }
}

/**
 * On-discard resolution for an energy leaving play. Returns `'hand'` when the
 * energy returns to its owner's hand, `'reattach'` when it stays attached
 * (Boomerang/Burning), or null to discard normally.
 */
export function resolveSpecialEnergyDiscard(draft, { energy, host, hostTop = null, hostPlayerId, hostZoneId }) {
  if (!energy || !isSpecialEnergyCard(energy)) return null;
  if (!host) return null;
  const zone = zoneOf(draft, hostPlayerId, hostZoneId);
  const plans = planSpecialEnergyTriggers(energy, {
    trigger: 'discard',
    host: hostTop || host,
    zoneArray: zone,
    attackExecuting: !!draft.__attackEffectPhase,
  });
  if (plans.some((p) => p.action === 'returnToHand')) return 'hand';
  if (plans.some((p) => p.action === 'reattach')) return 'reattach';
  return null;
}

/**
 * On-knockout resolution for the KO'd Pokémon's attached special energies.
 * Returns `{ returnToHand, drawUntil }`.
 */
export function resolveSpecialEnergyKnockout(draft, { host, hostTop = null, hostPlayerId, hostZoneId }) {
  const out = { returnToHand: false, drawUntil: 0 };
  if (!host) return out;
  const zone = zoneOf(draft, hostPlayerId, hostZoneId);
  for (const energy of zone.filter(
    (c) => c && isSpecialEnergyCard(c) && c.attachedTo === host.instanceId
  )) {
    const plans = planSpecialEnergyTriggers(energy, { trigger: 'knockout', host: hostTop || host, zoneArray: zone });
    for (const plan of plans) {
      if (plan.action === 'returnToHand') out.returnToHand = true;
      if (plan.action === 'drawUntil') out.drawUntil = Math.max(out.drawUntil, plan.until);
    }
  }
  return out;
}

export { SPECIAL_ENERGY_EFFECT };
