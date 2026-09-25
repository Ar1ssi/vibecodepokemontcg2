/** Tier class names for TCG Live-style damage counter colors. */
export const DAMAGE_COUNTER_TIERS = [
  'dmg-tier-10',
  'dmg-tier-20',
  'dmg-tier-30',
  'dmg-tier-40',
  'dmg-tier-50',
  'dmg-tier-100',
];

/**
 * Map total damage to a TCG Live-style counter tier.
 * Live bundles placement as 10/20/30/40 tokens; ETB dice add 50/100.
 * Totals use the tier matching the displayed value band.
 */
export function getDamageCounterTier(damage) {
  const amount = Math.max(0, parseInt(String(damage ?? '0'), 10) || 0);
  if (amount <= 0) return 'dmg-tier-10';
  if (amount <= 20) return 'dmg-tier-10';
  if (amount <= 30) return 'dmg-tier-20';
  if (amount <= 40) return 'dmg-tier-30';
  if (amount <= 50) return 'dmg-tier-40';
  if (amount <= 90) return 'dmg-tier-50';
  return 'dmg-tier-100';
}

/**
 * Design 024 slice 3: which one-shot a counter should play, if any.
 *
 * The rule is subtle enough to be worth naming: `addDamageCounter` doubles as
 * the window-resize handler and never changes an existing counter's value, so
 * only a BRAND NEW counter animates there — otherwise every counter on the
 * board would pop each time the window moved. A value change animates from
 * `updateDamageCounter` instead, and only when the text actually differs.
 *
 * @returns {'land'|'bump'|null}
 */
export function counterMotionFor({ isNew = false, valueChanged = false } = {}) {
  if (isNew) return 'land';
  return valueChanged ? 'bump' : null;
}

/** Motion classes the counter can carry; exported so callers can clear them. */
export const DAMAGE_COUNTER_MOTIONS = ['fx-counter-land', 'fx-counter-bump'];
export const DAMAGE_DANGER_CLASS = 'dmg-danger';

/**
 * Design 024 slice 3: is this Pokemon within one 10-damage counter of being
 * knocked out? Drives the counter's danger pulse, the closest honest analogue
 * of TCG Live's shrinking HP bar without adding a new HP readout.
 *
 * Unknown or nonsensical HP means no pulse: a false alarm reads as a bug, and
 * printed HP is only present once cardStats has reached the client.
 */
export function isDangerDamage(damage, hp) {
  const dealt = Number.parseInt(String(damage ?? ''), 10);
  const total = Number.parseInt(String(hp ?? ''), 10);
  if (!Number.isFinite(dealt) || !Number.isFinite(total) || total <= 0) return false;
  if (dealt <= 0) return false;
  return total - dealt <= 10;
}
