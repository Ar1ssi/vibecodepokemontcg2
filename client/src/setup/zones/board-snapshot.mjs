import { cardFaceSrc } from './resolve-card-index.mjs';
import { SYNC_HASH_ZONES } from './zone-hash.mjs';

/** Public + private card zones copied in a convergence snapshot. Stadium is shared. */
export const SNAPSHOT_ZONES = SYNC_HASH_ZONES.filter((id) => id !== 'stadium');

export const HIDDEN_SNAPSHOT_ZONES = ['deck', 'hand', 'prizes'];

function parentSyncInstance(card, zoneCards = []) {
  const rel = card?.image?.relative;
  if (!rel) return null;
  const parent = zoneCards.find((c) => c !== card && c?.image === rel);
  return typeof parent?.syncInstance === 'number' ? parent.syncInstance : null;
}

/** JSON-safe identity for one board card (face URL, not the sleeve). */
export function serializeCard(card, zoneCards = []) {
  return {
    name: card?.name || '',
    type: card?.type2 || card?.type || '',
    src: cardFaceSrc(card),
    number: card?.number ?? null,
    set: card?.set ?? null,
    id: card?.id ?? null,
    syncInstance:
      typeof card?.syncInstance === 'number' ? card.syncInstance : null,
    attached: !!card?.image?.attached,
    parentSyncInstance: parentSyncInstance(card, zoneCards),
  };
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
