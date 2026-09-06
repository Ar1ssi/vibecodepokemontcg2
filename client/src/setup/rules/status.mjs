// Status conditions: asleep, paralyzed, poisoned, burned + the modern
// "confused". Auto-applied from attack effects and auto-resolved at turn
// boundaries (TCG Live behavior).
//
// Modern mutual-exclusion rules (enforced in applyStatus):
//   - Turn-skip family  { asleep, paralyzed, confused }  → at most ONE at a time
//   - Damage family     { poisoned, burned }             → at most ONE at a time
// Applying a new status in the same family clears the older one ("newest wins").
//
// Confused rule (printed):
//   "If your Pokémon is Confused, you must flip a coin before attacking with
//    it. If heads, the attack works normally. If tails, the attack doesn't
//    happen, and you place 3 damage counters on your Confused Pokémon."
// Confusion is PERMANENT — it is NOT cleared at the end of the turn. It is
// removed only by: retreat, evolution, or a Trainer card effect.

// statuses per player, keyed by their active card id
export const statusState = {
  self: {},   // cardId -> { asleep, paralyzed, poisoned, burned, confused }
  opp: {},
};

export function resetStatuses() {
  statusState.self = {};
  statusState.opp = {};
}

const ALL = ['asleep', 'paralyzed', 'poisoned', 'burned', 'confused'];
const TURN_SKIP = ['asleep', 'paralyzed', 'confused'];
const DAMAGE = ['poisoned', 'burned'];

export function getStatus(player, cardId) {
  return statusState[player][cardId] || null;
}

export function applyStatus(player, cardId, status, opts = {}) {
  if (opts.blocked) return false;
  if (!ALL.includes(status)) return false;
  if (!statusState[player][cardId]) statusState[player][cardId] = {};
  const s = statusState[player][cardId];
  // Mutual exclusion: newest wins within each family.
  if (TURN_SKIP.includes(status)) {
    for (const other of TURN_SKIP) if (other !== status) delete s[other];
  } else if (DAMAGE.includes(status)) {
    for (const other of DAMAGE) if (other !== status) delete s[other];
  }
  s[status] = true;
  return true;
}

export function clearStatuses(player, cardId) {
  delete statusState[player][cardId];
}

// ── Pure query (no rng, no mutation) ───────────────────────────────
// Can the active Pokémon attack this turn?
//   - paralyzed → blocked (no coin flip)
//   - asleep   → blocked until resolveWake succeeds
//   - confused → blocked until resolveConfusedAttack succeeds
// Poison/Burn do NOT prevent attacking (they only tick at turn boundary).
export function canAct(player, cardId) {
  const s = statusState[player][cardId];
  if (!s) return { can: true };
  if (s.paralyzed) return { can: false, reason: "Paralyzed — this Pokémon can't attack or retreat." };
  if (s.asleep)    return { can: false, reason: 'Asleep — coin flip to wake up required.' };
  if (s.confused)  return { can: false, reason: 'Confused — coin flip before attacking required.' };
  return { can: true };
}

// Can the active Pokémon retreat this turn?
// Only Paralyzed blocks retreating. Confused does NOT (and retreating
// clears Confused per the confirmed definition); Asleep does NOT block
// retreat in this implementation (TCG allows retreating while asleep).
export function statusAllowsRetreat(player, cardId) {
  const s = statusState[player][cardId];
  if (s?.paralyzed) return { can: false, reason: "Paralyzed — this Pokémon can't retreat." };
  return { can: true };
}

// ── Mutation: resolve the asleep coin flip ─────────────────────────
// Heads → wakes (asleep cleared). Tails → stays asleep.
export function resolveWake(player, cardId, rng = Math.random) {
  const s = statusState[player][cardId];
  if (!s || !s.asleep) return { woke: false, applied: false };
  const woke = rng() < 0.5;
  if (woke) {
    delete s.asleep;
    if (Object.keys(s).length === 0) delete statusState[player][cardId];
  }
  return { woke, applied: true };
}

// ── Mutation: resolve the confused pre-attack coin flip ────────────
// Heads → attack proceeds. Tails → attack does NOT happen; 3 damage
// counters (30 HP) placed on self. Confusion PERSISTS in either case.
export function resolveConfusedAttack(player, cardId, rng = Math.random) {
  const s = statusState[player][cardId];
  if (!s || !s.confused) return { proceeds: true, applied: false, damage: 0 };
  const heads = rng() < 0.5;
  if (heads) return { proceeds: true, applied: true, damage: 0 };
  return { proceeds: false, applied: true, damage: 30 };
}

// ── Turn-boundary effects ──────────────────────────────────────────
// Poison: 10 damage (persists).
// Burn:   coin flip — heads heals, tails 20 damage (persists either way).
// Asleep / Paralyzed: cleared at end of the player's turn.
// Confused: NOT cleared (permanent until retreat / evolve / Trainer).
export function resolveTurnBoundary(player, cardId, rng = Math.random, opts = {}) {
  const s = statusState[player][cardId];
  if (!s) return { damage: 0, notes: [] };
  const notes = [];
  let damage = 0;
  if (s.poisoned) {
    const extraCounters = opts.checkupPoisonBonus || 0;
    damage += 10 + extraCounters * 10;
    notes.push(
      extraCounters > 0
        ? `Poison: ${10 + extraCounters * 10} damage (Stadium +${extraCounters} counter(s))`
        : 'Poison: 10 damage'
    );
  }
  if (s.burned) {
    if (rng() < 0.5) {
      delete s.burned;
      notes.push('Burn healed (coin flip) — no damage');
    } else {
      damage += 20;
      notes.push('Burn: 20 damage');
    }
  }
  if (s.asleep || s.paralyzed) {
    delete s.asleep;
    delete s.paralyzed;
    notes.push('Status cleared at turn end');
  }
  if (Object.keys(s).length === 0) delete statusState[player][cardId];
  return { damage, notes };
}

// Parse attack text for status keywords (TCG Live parses full effects;
// we handle the common printed ones).
export function parseStatusFromAttackText(text = '') {
  const lower = text.toLowerCase();
  const found = [];
  if (lower.includes('asleep')) found.push('asleep');
  if (lower.includes('paralyzed')) found.push('paralyzed');
  if (lower.includes('poisoned')) found.push('poisoned');
  if (lower.includes('burned')) found.push('burned');
  if (lower.includes('confused')) found.push('confused');
  return found;
}

/** Status applied to the attacker ("This Pokémon is now Asleep."). */
export function parseSelfStatusFromAttackText(text = '') {
  const m = String(text || '')
    .toLowerCase()
    .match(/this pok[ée]mon\s+is\s+now\s+(asleep|paralyzed|poisoned|burned|confused)/);
  return m ? m[1] : null;
}

// ── Backward-compat wrapper (deprecated) ───────────────────────────
// Old API: single call that both queried and (side-effectfully) flipped the
// asleep coin. New code should call canAct() then resolveWake() /
// resolveConfusedAttack() explicitly. Kept so any stale callers keep working.
export function canActThroughStatuses(player, cardId, rng = Math.random) {
  const q = canAct(player, cardId);
  if (q.can) return { can: true };
  if (q.reason && q.reason.includes('Asleep')) {
    const r = resolveWake(player, cardId, rng);
    return r.woke
      ? { can: true, note: 'woke up', cleared: ['asleep'] }
      : { can: false, reason: 'Asleep — coin flip failed.' };
  }
  return { can: false, reason: q.reason };
}
