import { cardFaceSrc } from './resolve-card-index.mjs';
import { SYNC_HASH_ZONES } from './zone-hash.mjs';

/** Public + private card zones copied in a convergence snapshot. Stadium is shared. */
export const SNAPSHOT_ZONES = SYNC_HASH_ZONES.filter((id) => id !== 'stadium');

export const HIDDEN_SNAPSHOT_ZONES = ['deck', 'hand', 'prizes'];

function parentSyncInstance(card, zoneCards = []) {
  if (card?.parentCard?.syncInstance != null) {
    return card.parentCard.syncInstance;
  }
  const rel = card?.image?.relative;
  if (!rel) return null;
  const parent = zoneCards.find((c) => c !== card && (c === rel.card || c?.image === rel));
  return parent?.syncInstance != null ? parent.syncInstance : null;
}

/** JSON-safe identity for one board card (face URL, not the sleeve). */
export function serializeCard(card, zoneCards = []) {
  const out = {
    name: card?.name || '',
    type: card?.type2 || card?.type || '',
    src: cardFaceSrc(card),
    number: card?.number ?? null,
    set: card?.set ?? null,
    id: card?.id ?? null,
    syncInstance: card?.syncInstance != null ? card.syncInstance : null,
    attached: Boolean(card?.attached || card?.image?.attached),
    parentSyncInstance: parentSyncInstance(card, zoneCards),
  };
  if (card?.cardId != null) {
    out.cardId = card.cardId;
  }
  if (typeof card?.damage === 'number' && card.damage > 0) {
    out.damage = card.damage;
  }
  if (card?.specialCondition) {
    out.specialCondition = card.specialCondition;
  }
  if (card?.abilityUsed) {
    out.abilityUsed = true;
  }
  return out;
}

export function serializeZoneCards(cards = []) {
  return (cards || []).map((card) => serializeCard(card, cards));
}

export function serializeBoardZones(zones = {}) {
  const out = {};
  for (const id of SNAPSHOT_ZONES) {
    const value = zones[id];
    const cards = Array.isArray(value) ? value : value?.array || [];
    out[id] = serializeZoneCards(cards);
  }
  return out;
}

export function snapshotZoneCounts(zones = {}) {
  const counts = {};
  for (const id of SNAPSHOT_ZONES) {
    const cards = zones[id] || [];
    counts[id] = Array.isArray(cards) ? cards.length : 0;
  }
  return counts;
}

/** Unattached cards first so restore can find parents before attaching. */
export function orderSnapshotCards(cards = []) {
  return [...cards].sort((a, b) => Number(!!a.attached) - Number(!!b.attached));
}
