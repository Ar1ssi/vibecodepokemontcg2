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
