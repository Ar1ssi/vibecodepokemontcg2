// Pending attack effects: next-turn locks, damage prevention windows, and
// opponent discard parsed from attack text. Pure + DOM-free.

import { mergeDamagePrevention } from './ability-executors.mjs';

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

/** @typedef {'self'|'opp'} PlayerSide */
/** @typedef {'opponent-turn'|'self-next-turn'|'until-leaves-active'} EffectWindow */

/**
 * Parse attack text into zero or more pending board effects (not instant discards).
 * @returns {Array<object>}
 */
export function parsePendingAttackEffects(attackText, attackName = '') {
  const t = lower(attackText);
  const out = [];
  if (!t) return out;

  const oppTurn = /during your opponent's next turn/.test(t);
  const selfTurn = /during your next turn/.test(t);

  // ── damage-prevention (on the attacking Pokémon) ──
  const reduce = t.match(/this pok[ée]mon takes (\d+) less damage from attacks/);
  if (reduce && oppTurn) {
    out.push({
      kind: 'damage-reduce',
      value: parseInt(reduce[1], 10) || 0,
      window: 'opponent-turn',
      scope: 'active',
    });
  }
  if (/prevent all damage done to this pok[ée]mon by attacks from basic pok[ée]mon/.test(t) && oppTurn) {
    out.push({
      kind: 'damage-prevent-basic',
      window: 'opponent-turn',
      scope: 'active',
    });
  }

  // ── next-turn locks on Defending / opponent ──
  if (oppTurn && /defending pok[ée]mon can't retreat/.test(t)) {
    out.push({ kind: 'cant-retreat', window: 'opponent-turn', scope: 'defender-active' });
  }
  if (oppTurn && /defending pok[ée]mon can't attack/.test(t)) {
    out.push({ kind: 'cant-attack', window: 'opponent-turn', scope: 'defender-active' });
  }
  if (oppTurn && /they can't play any item cards/.test(t)) {
    out.push({ kind: 'cant-play-item', window: 'opponent-turn', scope: 'player' });
  }
  if (/your opponent can't play any supporter cards/.test(t)) {
    out.push({ kind: 'cant-play-supporter', window: 'opponent-turn', scope: 'player' });
  }
  if (oppTurn && /can't play any pok[ée]mon from their hand to evolve/.test(t)) {
    out.push({ kind: 'cant-evolve-from-hand', window: 'opponent-turn', scope: 'player' });
  }
  if (oppTurn && /energy can't be attached from your opponent's hand to the defending pok[ée]mon/.test(t)) {
    out.push({ kind: 'cant-attach-energy-from-hand', window: 'opponent-turn', scope: 'defender-active' });
  }
  if (oppTurn && /retreat cost is \{c\} more/.test(t)) {
    const m = t.match(/retreat cost is \{c\} more.*?(\d+)/) || t.match(/retreat cost is \{c\} more/);
    out.push({
      kind: 'retreat-cost-up',
      value: m?.[1] ? parseInt(m[1], 10) : 1,
      window: 'opponent-turn',
      scope: 'defender-active',
    });
  }

  // ── next-turn locks on self ──
  if (selfTurn && /this pok[ée]mon can't attack/.test(t)) {
    out.push({ kind: 'cant-attack', window: 'self-next-turn', scope: 'active' });
  }
  const cantUse = t.match(/this pok[ée]mon can't use ([^.]+?) again until it leaves the active spot/);
  if (cantUse) {
    out.push({
      kind: 'cant-use-attack',
      attackName: cantUse[1].trim(),
      window: 'until-leaves-active',
      scope: 'active',
    });
  }
  const cantUseNext = t.match(/this pok[ée]mon can't use ([^.]+?)\./);
  if (selfTurn && cantUseNext && !cantUse) {
    out.push({
      kind: 'cant-use-attack',
      attackName: cantUseNext[1].trim(),
      window: 'self-next-turn',
      scope: 'active',
    });
  }

  // Vulnerability (already announced; track for damage apply)
  const vuln = t.match(/this pok[ée]mon takes (\d+) more damage from attacks/);
  if (oppTurn && vuln) {
    out.push({
      kind: 'damage-vulnerable',
      value: parseInt(vuln[1], 10) || 0,
      window: 'opponent-turn',
      scope: 'active',
    });
  }
  const defVuln = t.match(/defending pok[ée]mon takes (\d+) more damage from attacks/);
  if (oppTurn && defVuln) {
    out.push({
      kind: 'damage-vulnerable',
      value: parseInt(defVuln[1], 10) || 0,
      window: 'opponent-turn',
      scope: 'defender-active',
    });
  }

  return out;
}

/**
 * Instant discard-from-opponent clauses (executed when the attack resolves).
 * @returns {{ deckTop: number, energyActive: number, handRandom: number, discardTools: boolean }}
 */
export function parseDiscardOpponentEffect(attackText) {
  const t = lower(attackText);
  const out = { deckTop: 0, energyActive: 0, handRandom: 0, discardTools: false };
  if (!t || !/your opponent/.test(t) || !/discard/.test(t)) return out;

  const deckM = t.match(/discard the top (\d+) cards? of your opponent's deck/);
  if (deckM) out.deckTop = parseInt(deckM[1], 10) || 1;
  else if (/discard the top card of your opponent's deck/.test(t)) out.deckTop = 1;

  if (/discard an energy from your opponent's active pok[ée]mon/.test(t)) out.energyActive = 1;
  else if (/discard a special energy from your opponent's active pok[ée]mon/.test(t)) out.energyActive = 1;
  else if (/discard a \{[a-z]\} energy from your opponent's active pok[ée]mon/.test(t)) out.energyActive = 1;

  if (/discard a random card from your opponent's hand/.test(t)) out.handRandom = 1;

  if (/discard all pok[ée]mon tools from your opponent's active pok[ée]mon/.test(t)) {
    out.discardTools = true;
  }

  return out;
}

function isDefenderScopedEffect(effect) {
  return effect.scope === 'defender-active' || effect.scope === 'player';
}

/** Queue parsed effects onto rulesState.pendingEffects for the affected player(s). */
export function queuePendingAttackEffects(state, attackerPlayer, effects, sourceName = '') {
  if (!state.pendingEffects) state.pendingEffects = { self: [], opp: [] };
  const opp = attackerPlayer === 'self' ? 'opp' : 'self';
  for (const e of effects) {
    const row = {
      ...e,
      waiting: e.window !== 'until-leaves-active',
      source: sourceName,
    };
    if (isDefenderScopedEffect(e)) {
      state.pendingEffects[opp].push(row);
    } else {
      state.pendingEffects[attackerPlayer].push(row);
    }
  }
}

/** Activate waiting effects whose window starts now. */
export function activatePendingEffectsForTurn(state, turnPlayer) {
  if (!state.pendingEffects) return;
  for (const side of ['self', 'opp']) {
    for (const e of state.pendingEffects[side] || []) {
      if (!e.waiting) continue;
      if (e.window === 'opponent-turn') {
        const activates =
          isDefenderScopedEffect(e) ? turnPlayer === side : turnPlayer !== side;
        if (activates) e.waiting = false;
      } else if (e.window === 'self-next-turn' && turnPlayer === side) {
        e.waiting = false;
      }
    }
  }
}

/** Remove effects that expire when this player's turn ends. */
export function expirePendingEffectsForTurnEnd(state, turnPlayer) {
  if (!state.pendingEffects) return;
  for (const side of ['self', 'opp']) {
    state.pendingEffects[side] = (state.pendingEffects[side] || []).filter((e) => {
      if (e.waiting) return true;
      if (e.window === 'until-leaves-active') return true;
      if (e.window === 'opponent-turn') {
        return isDefenderScopedEffect(e)
          ? turnPlayer !== side
          : turnPlayer === side;
      }
      if (e.window === 'self-next-turn') return turnPlayer !== side;
      return true;
    });
  }
}

export function clearUntilLeavesActive(state, player, attackName) {
  if (!state.pendingEffects?.[player]) return;
  const name = lower(attackName);
  state.pendingEffects[player] = state.pendingEffects[player].filter(
    (e) =>
      !(
        e.window === 'until-leaves-active' &&
        e.kind === 'cant-use-attack' &&
        lower(e.attackName) === name
      )
  );
}

/** Clear all "until leaves Active Spot" attack locks when the Active moves. */
export function clearActiveSpotPendingEffects(state, player) {
  if (!state.pendingEffects?.[player]) return;
  state.pendingEffects[player] = state.pendingEffects[player].filter(
    (e) => !(e.window === 'until-leaves-active' && e.kind === 'cant-use-attack')
  );
}

function liveEffects(state, player) {
  return (state.pendingEffects?.[player] || []).filter((e) => !e.waiting);
}

export function pendingDamagePrevention(state, defenderPlayer, attackerCard = null) {
  let out = { preventAll: false, reduce: 0 };
  for (const e of liveEffects(state, defenderPlayer)) {
    if (e.kind === 'damage-reduce') out.reduce += e.value || 0;
    if (e.kind === 'damage-prevent-all') out.preventAll = true;
    if (e.kind === 'damage-prevent-basic') {
      const name = lower(attackerCard?.name || '');
      const stage = lower(attackerCard?.stage || 'basic');
      const isBasic =
        stage === 'basic' ||
        (!/stage/.test(stage) && !name.includes(' ex') && !name.includes('-ex'));
      if (isBasic) out.preventAll = true;
    }
  }
  return out;
}

export function pendingDamageVulnerability(state, defenderPlayer) {
  let extra = 0;
  for (const e of liveEffects(state, defenderPlayer)) {
    if (e.kind === 'damage-vulnerable') extra += e.value || 0;
  }
  return extra;
}

export function pendingRetreatCostDelta(state, player) {
  let delta = 0;
  for (const e of liveEffects(state, player)) {
    if (e.kind === 'retreat-cost-up') delta += e.value || 1;
  }
  return delta;
}

export function pendingCantAttack(state, player) {
  return liveEffects(state, player).some((e) => e.kind === 'cant-attack' && e.scope === 'active');
}

export function pendingCantUseAttack(state, player, attackName) {
  const name = lower(attackName);
  return liveEffects(state, player).some(
    (e) => e.kind === 'cant-use-attack' && lower(e.attackName) === name
  );
}

export function pendingCantRetreat(state, player) {
  return liveEffects(state, player).some(
    (e) => e.kind === 'cant-retreat' && (e.scope === 'defender-active' || e.scope === 'active')
  );
}

export function pendingCantPlayItem(state, player) {
  return liveEffects(state, player).some((e) => e.kind === 'cant-play-item');
}

export function pendingCantPlaySupporter(state, player) {
  return liveEffects(state, player).some((e) => e.kind === 'cant-play-supporter');
}

export function pendingCantEvolveFromHand(state, player) {
  return liveEffects(state, player).some((e) => e.kind === 'cant-evolve-from-hand');
}

export function pendingCantAttachEnergyFromHand(state, player) {
  return liveEffects(state, player).some((e) => e.kind === 'cant-attach-energy-from-hand');
}

/** Merge ability/tool prevention with pending attack-window prevention. */
export function combinedPendingDamagePrevention(state, defenderPlayer, basePrevention, attackerCard = null) {
  const pending = pendingDamagePrevention(state, defenderPlayer, attackerCard);
  return mergeDamagePrevention(basePrevention, pending);
}
