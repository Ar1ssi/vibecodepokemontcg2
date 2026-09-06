import { Card } from '../deck-constructor/card.js';
import { getZone } from '../zones/get-zone.js';
import {
  HIDDEN_SNAPSHOT_ZONES,
  SNAPSHOT_ZONES,
  orderSnapshotCards,
  serializeBoardZones,
} from '../zones/board-snapshot.mjs';
import { hideCard } from '../../actions/general/reveal-and-hide.js';
import { initializeActiveBenchCard } from '../../actions/move-card-bundle/initialize-active-bench-card.js';
import { attachCard } from '../../actions/move-card-bundle/attach-card.js';
import { removeImages } from '../image-logic/remove-images.js';
import { updateCount } from '../../actions/general/count.js';
import { logSync } from './sync-logger-bridge.js';

const PLAY_ZONES = ['active', 'bench'];

function clearZone(user, zoneId) {
  const zone = getZone(user, zoneId);
  if (zone.element) {
    zone.element.querySelectorAll('.play-container').forEach((node) => {
      node.remove();
    });
    removeImages(zone.element);
  }
  if (zone.array) zone.array.length = 0;
}

function makeCard(user, rec) {
  const card = new Card(
    user,
    rec.name,
    rec.type,
    rec.src,
    rec.number,
    rec.set,
    rec.id
  );
  if (rec.cardId != null) {
    card.cardId = rec.cardId;
  } else if (rec.syncInstance != null) {
    card.cardId = `c_${rec.syncInstance}`;
  }
  if (rec.syncInstance != null) {
    card.syncInstance = rec.syncInstance;
  }
  if (typeof rec.damage === 'number') {
    card.damage = rec.damage;
  }
  if (rec.specialCondition) {
    card.specialCondition = rec.specialCondition;
  }
  if (rec.abilityUsed) {
    card.abilityUsed = true;
  }
  if (card.image) {
    card.image.cardId = card.cardId;
    card.image.syncInstance = card.syncInstance;
  }
  return card;
}

function placeCard(user, zoneId, card, rec, placed) {
  const zone = getZone(user, zoneId);
  zone.array.push(card);
  if (rec.attached && rec.parentSyncInstance != null) {
    const parent = placed.get(rec.parentSyncInstance);
    if (parent) {
      card.attached = true;
      card.parentCard = parent;
      card.parentCardId = parent.cardId ?? parent.syncInstance;
      if (!Array.isArray(parent.attachedCards)) parent.attachedCards = [];
      if (!parent.attachedCards.includes(card)) parent.attachedCards.push(card);
      attachCard(user, user, card, parent, zoneId, zone);
      return;
    }
  }
  if (PLAY_ZONES.includes(zoneId)) {
    initializeActiveBenchCard(user, card, zoneId, zone);
  } else if (zone.element) {
    zone.element.appendChild(card.image);
  }
  if (HIDDEN_SNAPSHOT_ZONES.includes(zoneId)) {
    hideCard(user, card);
  }
}

/** Replace `user` zones with a serialized snapshot (used for the opp board). */
export function applyBoardSnapshot(user, zones = {}) {
  for (const zoneId of SNAPSHOT_ZONES) {
    clearZone(user, zoneId);
    const placed = new Map();
    for (const rec of orderSnapshotCards(zones[zoneId] || [])) {
      const card = makeCard(user, rec);
      placeCard(user, zoneId, card, rec, placed);
      if (typeof rec.syncInstance === 'number') {
        placed.set(rec.syncInstance, card);
      }
    }
  }
  try {
    updateCount();
  } catch {
    // Counts live in the iframe documents; unit tests may omit them.
  }
}

export function buildSelfBoardSnapshot() {
  const zones = {};
  for (const id of SNAPSHOT_ZONES) {
    try {
      zones[id] = getZone('self', id);
    } catch {
      zones[id] = { array: [] };
    }
  }
  return serializeBoardZones(zones);
}

export function applyOppBoardSnapshot(data = {}) {
  applyBoardSnapshot('opp', data.zones || {});
  logSync(
    'snapshot.apply',
    {
      counter: data.counter,
      counts: Object.fromEntries(
        SNAPSHOT_ZONES.map((id) => [id, (data.zones?.[id] || []).length])
      ),
    },
    'in'
  );
}
