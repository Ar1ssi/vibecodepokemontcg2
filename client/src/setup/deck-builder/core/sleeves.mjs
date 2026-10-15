// Card sleeves for the deck builder: TCG Live's own sleeves, imported from the game extract by
// scripts/import-tcgl-sleeves.py into tcgl-sleeves.generated.mjs and client/src/assets/sleeves/tcgl/.
import { TCGL_SLEEVES } from './tcgl-sleeves.generated.mjs';

export function getSleeves() {
  return TCGL_SLEEVES.map((sleeve) => ({ ...sleeve }));
}

export function getSleeveById(id) {
  const sleeve = TCGL_SLEEVES.find((entry) => entry.id === id);
  return sleeve ? { ...sleeve } : null;
}

export function filterSleevesByName(sleeves = [], term = '') {
  const needle = String(term || '').trim().toLowerCase();
  if (!needle) return [...sleeves];
  return sleeves.filter((sleeve) => String(sleeve.name || '').toLowerCase().includes(needle));
}

/**
 * The catalog with the ids the player owns first (design 057: the Elite Trainer Box collection),
 * each group in its original order. Items carry `id`; a missing or empty owned list keeps the order.
 */
export function ownedFirst(items = [], ownedIds = []) {
  const owned = new Set(ownedIds || []);
  if (!owned.size) return [...items];
  return [...items.filter((item) => owned.has(item.id)), ...items.filter((item) => !owned.has(item.id))];
}
