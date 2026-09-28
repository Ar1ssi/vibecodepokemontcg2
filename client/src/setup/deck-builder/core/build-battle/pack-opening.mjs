// Seeded booster-pack and box opening for Build & Battle (design 051 § Pack model). Pure: every
// random choice comes from the `rng` passed in (`createRng(seed)`), so one seed is one box.

import { isBasicEnergy } from '../../../../../../shared/engine/rules/card-classify.mjs';

// The reverse-holo slots draw from every Common, Uncommon and Rare card.
const REVERSE_POOL = 'reverse';
const REVERSE_RARITIES = ['Common', 'Uncommon', 'Rare'];
const FALLBACK_RARITY = 'Rare';

const SUPERTYPE_ORDER = ['Pokémon', 'Trainer', 'Energy'];

function raritiesFor(pool) {
  return pool === REVERSE_POOL ? REVERSE_RARITIES : [pool];
}

function cardsOfRarities(cards, rarities, takenIds) {
  return cards.filter(
    (card) => rarities.includes(card.rarity) && !takenIds.has(card.id)
  );
}

// Weights are normalized by their total; a row with weight ≤ 0 is never picked.
function pickWeighted(table, rng) {
  const rows = (table || []).filter(([, weight]) => Number(weight) > 0);
  const total = rows.reduce((sum, [, weight]) => sum + Number(weight), 0);
  const roll = rng.next() * total;
  let cumulative = 0;
  for (const [pool, weight] of rows) {
    cumulative += Number(weight);
    if (roll < cumulative) return pool;
  }
  return rows.at(-1)?.[0] ?? FALLBACK_RARITY;
}

function pickPool(slot, rng) {
  if (Array.isArray(slot.table)) return pickWeighted(slot.table, rng);
  const pools = slot.pools || [];
  return pools[rng.int(pools.length)] ?? FALLBACK_RARITY;
}

// The picked rarity's cards not yet in this pack; when none are left, Rare, then the whole set.
function candidatesFor(pool, cards, takenIds) {
  const picked = cardsOfRarities(cards, raritiesFor(pool), takenIds);
  if (picked.length) return picked;
  const rares = cardsOfRarities(cards, [FALLBACK_RARITY], takenIds);
  if (rares.length) return rares;
  return cards.filter((card) => !takenIds.has(card.id));
}

/**
 * Opens one pack: slot by slot, draw by draw, pick a rarity then a card of it. No card id
 * repeats inside a pack. A set smaller than the pack yields every card once and stops.
 *
 * @returns {object[]} the pack's SetCards in slot order.
 */
export function openPack({ cards = [], packModel, rng }) {
  const pack = [];
  const takenIds = new Set();
  for (const slot of packModel?.slots || []) {
    for (let draw = 0; draw < (slot.count || 0); draw += 1) {
      const candidates = candidatesFor(pickPool(slot, rng), cards, takenIds);
      if (!candidates.length) return pack;
      const card = candidates[rng.int(candidates.length)];
      pack.push(card);
      takenIds.add(card.id);
    }
  }
  return pack;
}

/**
 * Opens a whole box: the deck first, then `packCount` packs, all from one RNG stream.
 *
 * @returns {{deckKey: string, packs: string[][]}} pack contents as card ids.
 */
export function openBox({ box, cards = [], rng }) {
  const deckKey = box.decks[rng.int(box.decks.length)].key;
  const packs = [];
  for (let index = 0; index < box.packCount; index += 1) {
    packs.push(
      openPack({ cards, packModel: box.packModel, rng }).map((card) => card.id)
    );
  }
  return { deckKey, packs };
}

function withoutQty(card) {
  const { qty: _qty, ...rest } = card;
  return rest;
}

/** Pool order: Pokémon → Trainer → Energy, then by localId, then by id. */
export function comparePoolEntries(a, b) {
  const typeOrder = (entry) => {
    const index = SUPERTYPE_ORDER.indexOf(entry.card.supertype);
    return index === -1 ? SUPERTYPE_ORDER.length : index;
  };
  return (
    typeOrder(a) - typeOrder(b) ||
    String(a.card.localId).localeCompare(String(b.card.localId), 'en', {
      numeric: true,
    }) ||
    String(a.card.id).localeCompare(String(b.card.id))
  );
}

/**
 * The cards a player may build from: the box deck's rows plus every pack card, merged by
 * card id. Basic Energy is left out — Build & Battle supplies it without limit.
 *
 * @param {{box: object, decks: Record<string, object[]>, cards: object[], opened: {deckKey: string, packs: string[][]}}} args
 *   `decks` is the box's deck lists (`BUILD_BATTLE_DECKS[box.key]`), `cards` the set's SetCards.
 * @returns {{card: object, count: number}[]} sorted Pokémon → Trainer → Energy, then by localId.
 */
export function poolFromBox({ box, decks = {}, cards = [], opened }) {
  const byId = new Map();
  const add = (card, count) => {
    if (!card?.id || isBasicEnergy(card)) return;
    const entry = byId.get(card.id);
    if (entry) entry.count += count;
    else byId.set(card.id, { card: withoutQty(card), count });
  };

  const deckKey = opened?.deckKey;
  if (box?.decks?.some((deck) => deck.key === deckKey)) {
    for (const row of decks[deckKey] || []) add(row, Number(row.qty) || 0);
  }

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  for (const pack of opened?.packs || []) {
    for (const id of pack) add(cardsById.get(id), 1);
  }

  return [...byId.values()].sort(comparePoolEntries);
}
