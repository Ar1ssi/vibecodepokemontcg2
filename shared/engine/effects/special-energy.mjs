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
  failedSpecialEnergyRestriction,
  discardsAtEndOfTurn,
  getSpecialEnergyStatusImmunity,
} from '../rules/special-energy-parse.mjs';
import { clearConditions, hasCondition, removeCondition } from '../rules/special-conditions.mjs';
import { evolvedView, topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { matchesSearch } from '../rules/search-match.mjs';
import { isEnergy } from '../cards.mjs';
import { discardCardToPlayerZone, findCard } from '../state.mjs';
import { shuffleInPlace } from '../rng.mjs';
import { applyStadiumSwitchTriggers } from './stadium-trigger-apply.mjs';

const SPECIAL_ENERGY_EFFECT = 'specialEnergy';
// Same value as trainer-steps BENCH_LIMIT; importing it would close an import cycle.
const BENCH_LIMIT = 5;

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
function swapActiveBench(draft, playerId, benchRoot, events, { duringOwnersTurn = true } = {}) {
  const zones = draft.players[playerId].zones;
  const active = zones.active.find((c) => !c.attachedTo);
  if (!active || active === benchRoot) return;
  benchRoot.movedToActiveTurn = Math.max(1, Number(draft.turn?.number) || 1);
  moveStackToZone(draft, playerId, benchRoot, 'active', events);
  moveStackToZone(draft, playerId, active, 'bench', events);
  // Stadium on-switch triggers (Spikemuth). Special Energy is not a Trainer card,
  // so Dust Island never applies here.
  applyStadiumSwitchTriggers(draft, {
    switchedOut: active,
    switchedIn: benchRoot,
    switchedOutPlayerId: playerId,
    switchedInPlayerId: playerId,
    viaTrainer: false,
    duringOwnersTurn,
    events,
  });
}

function benchSpace(draft, playerId) {
  const roots = zoneOf(draft, playerId, 'bench').filter((c) => c && !c.attachedTo);
  return Math.max(0, BENCH_LIMIT - roots.length);
}

/** "Then, shuffle your deck." — every on-attach search ends with it (audit SE10). */
function shuffleSearchedDeck(draft, ctx) {
  if (ctx.rng) shuffleInPlace(ctx.rng, zoneOf(draft, ctx.hostPlayerId, 'deck'));
  ctx.events.push({ type: 'deckShuffled', playerId: ctx.hostPlayerId });
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
      if (plan.conditions) for (const condition of plan.conditions) removeCondition(host, condition);
      else clearConditions(host);
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
      const chosen = (selection || []).slice(0, benchSpace(draft, ctx.hostPlayerId));
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
      shuffleSearchedDeck(draft, ctx);
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
        if (oppId && benchRoot) {
          swapActiveBench(draft, oppId, benchRoot, events, { duringOwnersTurn: false });
        }
      }
      break;
    }
    case 'discardHand':
      discardFromHand(draft, ctx, selection || []);
      break;
    default:
      break;
  }
}

function discardFromHand(draft, ctx, instanceIds) {
  const hand = zoneOf(draft, ctx.hostPlayerId, 'hand');
  for (const id of instanceIds) {
    const idx = hand.findIndex((c) => c.instanceId === id);
    if (idx < 0) continue;
    const [c] = hand.splice(idx, 1);
    draft.players[ctx.hostPlayerId].zones.discard.push(c);
    ctx.events.push({
      type: 'cardMoved',
      instanceId: c.instanceId,
      from: 'hand',
      to: 'discard',
      playerId: ctx.hostPlayerId,
    });
  }
}

function planIsChoice(plan) {
  return plan.action === 'search' || plan.action === 'switch' || plan.action === 'discardHand';
}

/** Builds a PendingChoice for a choice plan, or applies it when deterministic. */
function handleChoicePlan(draft, item, ctx, queue, index) {
  const plan = item.plan;
  if (plan.action === 'discardHand') {
    // Aurora Energy's attach cost (audit SE9); legality already required enough cards.
    const hand = zoneOf(draft, ctx.hostPlayerId, 'hand');
    const count = Math.min(plan.count, hand.length);
    if (count === 0) return 'done';
    if (hand.length === count) {
      discardFromHand(draft, ctx, hand.map((c) => c.instanceId));
      return 'done';
    }
    return makeChoice({
      player: ctx.hostPlayerId,
      prompt: `Discard ${count} card${count === 1 ? '' : 's'} from your hand`,
      options: hand,
      min: count,
      max: count,
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
  if (plan.action === 'search') {
    const deck = zoneOf(draft, ctx.hostPlayerId, 'deck');
    const matches = deck.filter((c) => matchesSearch(c, plan.what));
    const max = Math.min(plan.count, matches.length, benchSpace(draft, ctx.hostPlayerId));
    if (max === 0) {
      shuffleSearchedDeck(draft, ctx);
      return 'done';
    }
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
    swapActiveBench(draft, playerId, bench[0], ctx.events, {
      duringOwnersTurn: plan.side === 'self',
    });
    return 'done';
  }
  // Cyclone: "your opponent switches …" — the switching player picks (audit SE11f).
  const chooserId = plan.chooser === 'opponent' ? playerId : ctx.hostPlayerId;
  return makeChoice({
    player: chooserId,
    prompt: `${plan.side === 'self' || chooserId !== ctx.hostPlayerId ? 'Switch your Active Pokémon' : "Switch your opponent's Active Pokémon"} — choose a Benched Pokémon`,
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
  evolvedFrom = null,
  rng = null,
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
      hostZoneId,
      evolvedFrom,
    });
    for (const plan of plans) queue.push({ energyInstanceId: e.instanceId, plan });
  }
  const ctx = {
    rng,
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
export function resumeSpecialEnergyTrigger(draft, { selection, events, resumeToken, rng = null }) {
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
  const ctx = { ...ctxFor(token, host, attacker), events, rng };
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
export function resolveSpecialEnergyKnockout(
  draft,
  { host, hostTop = null, hostPlayerId, hostZoneId, byAttackDamage = true, byOpponentAttack = true }
) {
  const out = { returnToHand: false, drawUntil: 0 };
  // Every on-knockout special Energy needs a KO by attack damage (placed counters are not
  // damage); each plan's `source` says whether the attack must be the opponent's.
  if (!host || !byAttackDamage) return out;
  const sourceMet = (plan) => plan.source === 'attack' || byOpponentAttack;
  const zone = zoneOf(draft, hostPlayerId, hostZoneId);
  for (const energy of zone.filter(
    (c) => c && isSpecialEnergyCard(c) && c.attachedTo === host.instanceId
  )) {
    const plans = planSpecialEnergyTriggers(energy, { trigger: 'knockout', host: hostTop || host, zoneArray: zone });
    for (const plan of plans) {
      if (!sourceMet(plan)) continue;
      if (plan.action === 'returnToHand') out.returnToHand = true;
      if (plan.action === 'drawUntil') out.drawUntil = Math.max(out.drawUntil, plan.until);
    }
  }
  return out;
}

/** Every in-play root Pokémon with its zone, owner, and in-play view (top card's stats). */
function inPlayHosts(draft, playerIds = Object.keys(draft?.players || {})) {
  const hosts = [];
  for (const pid of playerIds) {
    for (const zoneId of ['active', 'bench']) {
      const zone = zoneOf(draft, pid, zoneId);
      for (const root of zone) {
        if (!root || root.attachedTo || isEnergy(root)) continue;
        hosts.push({ pid, zoneId, zone, root, view: evolvedView(zone, root) });
      }
    }
  }
  return hosts;
}

function attachedSpecialEnergies(zone, root) {
  return zone.filter((c) => c && c.attachedTo === root.instanceId && isEnergy(c) && isSpecialEnergyCard(c));
}

/** Moves an attached Energy to its owner's discard pile (a rule, not an effect). */
function discardAttachedEnergy(draft, { energy, zone, zoneId, hostPlayerId, reason, events }) {
  const i = zone.indexOf(energy);
  if (i < 0) return;
  zone.splice(i, 1);
  energy.attachedTo = null;
  const ownerId = draft.players[energy.ownerId] ? energy.ownerId : hostPlayerId;
  const to = discardCardToPlayerZone(draft.players[ownerId], energy);
  events.push({
    type: 'cardMoved',
    instanceId: energy.instanceId,
    from: zoneId,
    to,
    playerId: ownerId,
    reason,
  });
}

/**
 * "…recovers from … and can't be affected by …" (Bubbly Water, Therapeutic, Aromatic
 * Grass, Holon GL): strips the conditions an attached special Energy makes its host
 * immune to. Runs after every command and before Pokémon Checkup (audit SE4).
 */
export function applySpecialEnergyStatusImmunity(draft, { events = [] } = {}) {
  for (const { pid, zone, root, view } of inPlayHosts(draft)) {
    if (!attachedSpecialEnergies(zone, root).length) continue;
    for (const condition of getSpecialEnergyStatusImmunity(view, zone)) {
      if (!hasCondition(root, condition)) continue;
      removeCondition(root, condition);
      events.push({ type: 'statusCleared', condition, instanceId: root.instanceId, playerId: pid, reason: 'specialEnergy' });
    }
  }
}

/**
 * Standing special-Energy rules, applied after every command (audit SE4/SE8):
 * - "If this card is attached to anything other than …, discard this card" and
 *   "discard it if … is no longer an Evolution" — the restriction is re-read against
 *   the host as it is now (after evolving, devolving or a Stadium change).
 * - Status immunity (applySpecialEnergyStatusImmunity).
 */
export function settleSpecialEnergyPassives(draft, { events = [] } = {}) {
  if (!draft?.players) return;
  for (const { pid, zoneId, zone, root, view } of inPlayHosts(draft)) {
    for (const energy of attachedSpecialEnergies(zone, root)) {
      const failed = failedSpecialEnergyRestriction(energy, view, zone);
      if (!failed?.discardIfNot) continue;
      discardAttachedEnergy(draft, { energy, zone, zoneId, hostPlayerId: pid, reason: 'specialEnergyRestriction', events });
    }
  }
  applySpecialEnergyStatusImmunity(draft, { events });
}

/**
 * "…discard it at the end of your turn" (Ignition, Triple Acceleration, Boost, Double
 * Magma/Aqua, Magma/Aqua, Miracle): discards the ending player's attached copies (SE8).
 */
export function discardEndOfTurnSpecialEnergies(draft, { endingPlayerId, events = [] } = {}) {
  if (!draft?.players?.[endingPlayerId]) return;
  for (const { pid, zoneId, zone, root } of inPlayHosts(draft, [endingPlayerId])) {
    for (const energy of attachedSpecialEnergies(zone, root)) {
      if (!discardsAtEndOfTurn(energy)) continue;
      discardAttachedEnergy(draft, { energy, zone, zoneId, hostPlayerId: pid, reason: 'specialEnergyEndOfTurn', events });
    }
  }
}

export { SPECIAL_ENERGY_EFFECT };
