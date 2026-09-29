// Seeded booster-pack and box opening for Build & Battle (designs 051 § Pack model, 054 § Opening
// a box). Pure: every random choice comes from the `rng` passed in (`createRng(seed)`), in a fixed
// order, so one seed is one box.

import { isBasicEnergy } from '../../../../../../shared/engine/rules/card-classify.mjs';
import { buildModernBasicEnergy } from '../modern-energy.mjs';
import { BASIC_ENERGY_LABELS } from './box-catalog.mjs';
import { RARE_POOL, REVERSE_POOL, resolvePackModel } from './pack-models.mjs';

export const EVOLUTION_PACK_SIZE = 23;
export const BUILD_BATTLE_DECK_SIZE = 40;

const SUPERTYPE_ORDER = ['Pokémon', 'Trainer', 'Energy'];
const FILLER_POOLS = new Set([REVERSE_POOL, RARE_POOL]);

// Weights are normalized by their total; a row with weight ≤ 0 is never picked.
function pickWeighted(rows, rng) {
  const live = rows.filter((row) => row.weight > 0);
  const total = live.reduce((sum, row) => sum + row.weight, 0);
  const roll = rng.next() * total;
  let cumulative = 0;
  for (const row of live) {
    cumulative += row.weight;
    if (roll < cumulative) return row;
  }
  return live.at(-1) || rows[0];
}

// A pools slot picks with `rng.int` (no roll for a single pool), a table slot always rolls.
function pickRow(slot, rng) {
  if (slot.kind === 'table') return pickWeighted(slot.rows, rng);
  return slot.rows[rng.int(slot.rows.length)];
}

// The picked pool's cards not yet in this pack; when none are left, the slot's filler, then the
// plain rares, then every card the set can put in a pack.
function candidatesFor(row, slot, packModel, takenIds) {
  const filler = slot.rows.find((entry) => FILLER_POOLS.has(entry.pool));
  for (const ids of [row?.ids, filler?.ids, packModel.fallbackIds, packModel.allIds]) {
    const free = (ids || []).filter((id) => !takenIds.has(id));
    if (free.length) return free;
  }
  return [];
}

/**
 * Opens one pack: slot by slot, draw by draw, pick a pool then a card of it. No card id repeats
 * inside a pack. A set smaller than the pack yields every card once and stops.
 *
 * @param {{cards: object[], packModel: object|null, rng: object}} args `packModel` from
 *   `resolvePackModel` over the same `cards`
 * @returns {object[]} the pack's SetCards in slot order.
 */
export function openPack({ cards = [], packModel, rng }) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pack = [];
  const takenIds = new Set();
  for (const slot of packModel?.slots || []) {
    for (let draw = 0; draw < slot.count; draw += 1) {
      const candidates = candidatesFor(pickRow(slot, rng), slot, packModel, takenIds);
      if (!candidates.length) return pack;
      const id = candidates[rng.int(candidates.length)];
      pack.push(byId.get(id));
      takenIds.add(id);
    }
  }
  return pack;
}

// ── The Evolution pack (design 054 § Opening a box, § Deviations D1) ────────────────────────
const between = (min, max, rng) => min + rng.int(Math.max(0, max - min) + 1);

/** One group or common entry → its card ids: a fixed count, a copy range, or one of two prints. */
function entryIds(entry, rng) {
  if (Array.isArray(entry.alts) && entry.alts.length) {
    const id = entry.alts[rng.int(entry.alts.length)];
    return Array(Math.max(0, entry.qty ?? 1)).fill(id);
  }
  const copies = Number.isInteger(entry.qty) ? entry.qty : between(entry.min ?? 0, entry.max ?? 0, rng);
  return Array(Math.max(0, copies)).fill(entry.id);
}

function poolBounds(pool) {
  const cards = pool.cards || [];
  const cardMin = cards.reduce((sum, card) => sum + (card.min || 0), 0);
  const cardMax = cards.reduce((sum, card) => sum + (card.max || 0), 0);
  const [lo, hi] = Array.isArray(pool.count)
    ? pool.count
    : Number.isInteger(pool.count)
      ? [pool.count, pool.count]
      : [0, Infinity];
  return [Math.max(lo, cardMin), Math.min(hi, cardMax)];
}

const sumBounds = (bounds) =>
  bounds.reduce(([lo, hi], [low, high]) => [lo + low, hi + high], [0, 0]);

/**
 * How many Trainers the pools give when the fixed rows leave `fill` places to 23: the fill, but
 * never fewer than the cards a page puts in every box ("1-2 Nemona") and never more than the pools
 * hold (design 054 A4).
 */
function trainerTarget(pools, fill) {
  const [lo, hi] = sumBounds(pools.map(poolBounds));
  return Math.min(Math.max(fill, lo), hi);
}

// Splits `total` draws over the pools inside each pool's bounds, first pool first.
function poolCounts(pools, total, rng) {
  const bounds = pools.map(poolBounds);
  let left = total;
  return bounds.map(([lo, hi], index) => {
    const rest = bounds.slice(index + 1);
    const restLo = rest.reduce((sum, [low]) => sum + low, 0);
    const restHi = rest.reduce((sum, [, high]) => sum + high, 0);
    const low = Math.max(lo, left - restHi);
    const high = Math.min(hi, left - restLo);
    const count = low <= high ? between(low, high, rng) : Math.max(0, Math.min(hi, left));
    left -= count;
    return count;
  });
}

// Each card's minimum first, then draws among the cards still under their maximum until the
// pool's count is reached or no card can be drawn (design 054 row 3).
function drawPool(pool, count, rng) {
  const drawn = new Map();
  const ids = [];
  const take = (card) => {
    ids.push(card.id);
    drawn.set(card.id, (drawn.get(card.id) || 0) + 1);
  };
  for (const card of pool.cards || []) {
    for (let copy = 0; copy < (card.min || 0); copy += 1) take(card);
  }
  while (ids.length < count) {
    const open = (pool.cards || []).filter((card) => (drawn.get(card.id) || 0) < (card.max || 0));
    if (!open.length) break;
    take(open[rng.int(open.length)]);
  }
  return ids;
}

/**
 * The Evolution pack as card ids, one per copy, promo first: the promo, both groups, the rows every
 * box has, then Trainers drawn to fill 23 (`trainerTarget`), then any Energy swap the pairing
 * triggers. A page whose groups hold more than 23 cards keeps them all (design 054 A4).
 */
export function drawEvolutionPack({ data, groupKeys, rng }) {
  const [deckKey] = groupKeys;
  const ids = data.promos?.[deckKey] ? [data.promos[deckKey]] : [];
  for (const key of groupKeys) {
    for (const entry of data.groups?.[key] || []) ids.push(...entryIds(entry, rng));
  }
  for (const entry of data.common || []) ids.push(...entryIds(entry, rng));
  const pools = data.trainers || [];
  if (pools.length) {
    const target = trainerTarget(pools, EVOLUTION_PACK_SIZE - ids.length);
    poolCounts(pools, target, rng).forEach((count, index) => ids.push(...drawPool(pools[index], count, rng)));
  }
  for (const swap of data.energySwaps || []) {
    if (!swap.when?.some((key) => groupKeys.includes(key))) continue;
    for (const entry of swap.rows || []) ids.push(...entryIds(entry, rng));
  }
  return ids;
}

// Largest remainder over `weights` ([label, weight][]), ties in BASIC_ENERGY_LABELS order.
function splitByWeight(total, weights) {
  const live = weights.filter(([label, weight]) => weight > 0 && BASIC_ENERGY_LABELS.includes(label));
  const sum = live.reduce((acc, [, weight]) => acc + weight, 0);
  if (!(total > 0) || !(sum > 0)) return [];
  const shares = live.map(([label, weight]) => {
    const exact = (total * weight) / sum;
    return { label, qty: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = total - shares.reduce((acc, share) => acc + share.qty, 0);
  const order = [...shares].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      BASIC_ENERGY_LABELS.indexOf(a.label) - BASIC_ENERGY_LABELS.indexOf(b.label)
  );
  for (const share of order) {
    if (left <= 0) break;
    share.qty += 1;
    left -= 1;
  }
  return shares.filter((share) => share.qty > 0).map(({ label, qty }) => [label, qty]);
}

/**
 * The Evolution deck's Basic Energy (design 054 A3): 40 minus the pack, the promo group taking the
 * larger half; each half splits over the types its Pokémon's attacks cost, and a group that names
 * no type gives its half to the other.
 * @returns {[string, number][]} in BASIC_ENERGY_LABELS order; [] when neither group names a type.
 */
export function evolutionEnergy({ data, groupKeys, packSize }) {
  const total = Math.max(0, BUILD_BATTLE_DECK_SIZE - packSize);
  const [promoNeeds, otherNeeds] = groupKeys.map((key) => data.energyNeeds?.[key] || []);
  const hasNeeds = (needs) => needs.some(([, weight]) => weight > 0);
  const promoShare = Math.ceil(total / 2);
  const halves = hasNeeds(promoNeeds)
    ? hasNeeds(otherNeeds)
      ? [
          [promoShare, promoNeeds],
          [total - promoShare, otherNeeds],
        ]
      : [[total, promoNeeds]]
    : [[total, otherNeeds]];
  const merged = new Map();
  for (const [share, needs] of halves) {
    for (const [label, qty] of splitByWeight(share, needs)) {
      merged.set(label, (merged.get(label) || 0) + qty);
    }
  }
  return BASIC_ENERGY_LABELS.filter((label) => merged.has(label)).map((label) => [label, merged.get(label)]);
}

// The fewest and most copies one group or common entry can put in the pack.
function entryBounds(entry) {
  if (Array.isArray(entry.alts) || Number.isInteger(entry.qty)) {
    const copies = entry.qty ?? 1;
    return [copies, copies];
  }
  return [entry.min ?? 0, entry.max ?? 0];
}

/**
 * Every way a pairing can fall that the box cannot hold (design 054 row 4, A4): with each range at
 * both ends, a 23-card Evolution pack must come out at exactly 23; an Evolution deck must fit 40
 * and have an Energy type for the Basic Energy that fills it.
 * @returns {string[]} one line per problem; [] for a box every pairing of which opens.
 */
export function evolutionPairingProblems({ box, data }) {
  if (!box || box.kind === 'fixed-decks') return [];
  const problems = [];
  const keys = box.decks.map((deck) => deck.key);
  const pools = data.trainers || [];
  for (const deckKey of keys) {
    if (!data.promos?.[deckKey] || !data.groups?.[deckKey]) problems.push(`${deckKey}: no promo or group`);
    for (const other of keys.filter((key) => key !== deckKey)) {
      const entries = [...(data.groups?.[deckKey] || []), ...(data.groups?.[other] || []), ...(data.common || [])];
      const [low, high] = sumBounds([[1, 1], ...entries.map(entryBounds)]);
      const swaps = (data.energySwaps || [])
        .filter((swap) => swap.when?.some((key) => key === deckKey || key === other))
        .flatMap((swap) => swap.rows || [])
        .reduce((sum, entry) => sum + (entry.qty ?? 1), 0);
      for (const fixed of new Set([low, high])) {
        const trainers = pools.length ? trainerTarget(pools, EVOLUTION_PACK_SIZE - fixed) : 0;
        const packSize = fixed + trainers + swaps;
        const pair = `${deckKey} + ${other} (${fixed} fixed cards)`;
        if (box.kind === 'evolution-pack') {
          if (packSize !== EVOLUTION_PACK_SIZE) {
            problems.push(`${pair}: ${packSize} cards, not the Evolution pack's ${EVOLUTION_PACK_SIZE}`);
          }
          continue;
        }
        if (packSize > BUILD_BATTLE_DECK_SIZE) problems.push(`${pair}: ${packSize} cards, more than 40`);
        const energy = evolutionEnergy({ data, groupKeys: [deckKey, other], packSize });
        const energyTotal = energy.reduce((sum, [, qty]) => sum + qty, 0);
        if (energyTotal !== Math.max(0, BUILD_BATTLE_DECK_SIZE - packSize)) {
          problems.push(`${pair}: no Energy type to fill ${BUILD_BATTLE_DECK_SIZE - packSize} Basic Energy`);
        }
      }
    }
  }
  return problems;
}

/**
 * @typedef {{deckKey: string, groupKeys: [string, string]|null, evolutionPack: string[]|null,
 *   energy: [string, number][]|null, packs: string[][]}} Opened
 */

/**
 * Opens a whole box from one RNG stream: the promo (deck), for Evolution boxes the other group and
 * the Evolution pack, then `packCount` packs.
 * @param {{box: object, data: object, cards: object[], setInfo: object, rng: object}} args
 * @returns {Opened} pack contents as card ids.
 */
export function openBox({ box, data, cards = [], setInfo = {}, rng }) {
  const deckKey = box.decks[rng.int(box.decks.length)].key;
  let groupKeys = null;
  let evolutionPack = null;
  let energy = null;
  if (box.kind !== 'fixed-decks') {
    const others = box.decks.map((deck) => deck.key).filter((key) => key !== deckKey);
    groupKeys = [deckKey, others[rng.int(others.length)]];
    evolutionPack = drawEvolutionPack({ data, groupKeys, rng });
    if (box.kind === 'evolution-deck') {
      energy = evolutionEnergy({ data, groupKeys, packSize: evolutionPack.length });
    }
  }
  const packModel = resolvePackModel(box.packModelKey, cards, setInfo);
  const packs = [];
  for (let index = 0; index < box.packCount; index += 1) {
    packs.push(openPack({ cards, packModel, rng }).map((card) => card.id));
  }
  return { deckKey, groupKeys, evolutionPack, energy, packs };
}

// ── What the box holds ───────────────────────────────────────────────────────────────────────
function withoutQty(card) {
  const { qty: _qty, ...rest } = card;
  return rest;
}

/** A baked Basic Energy row (the SVE print, as 051's decks bake it). */
export function basicEnergyRow(label, qty) {
  const { qty: _qty, ...card } = buildModernBasicEnergy(label, qty);
  return { ...card, rarity: null, category: 'Energy', stage: null, types: [], hp: null, qty };
}

// Card ids (one per copy) → rows with qty, first appearance first.
function rowsFromIds(ids, cardsById) {
  const rows = new Map();
  for (const id of ids || []) {
    const card = cardsById?.get(id);
    if (!card) continue;
    const row = rows.get(id);
    if (row) row.qty += 1;
    else rows.set(id, { ...withoutQty(card), qty: 1 });
  }
  return [...rows.values()];
}

const isKnownDeck = (box, deckKey) => Boolean(box?.decks?.some((deck) => deck.key === deckKey));

/**
 * The deck the editor holds when the box opens: a fixed deck as printed; an Evolution pack's 23
 * cards; an Evolution deck's pack plus its Basic Energy (40 cards).
 * @returns {object[]} rows with `qty`.
 */
export function startingDeckRows({ box, data, opened }) {
  if (!isKnownDeck(box, opened?.deckKey)) return [];
  if (box.kind === 'fixed-decks') return (data?.decks?.[opened.deckKey] || []).map((row) => ({ ...row }));
  const rows = rowsFromIds(opened.evolutionPack, data?.cardsById);
  for (const [label, qty] of opened.energy || []) rows.push(basicEnergyRow(label, qty));
  return rows;
}

/** @returns {object|null} the box deck's foil promo row. */
export function boxPromoRow({ box, data, deckKey }) {
  const deck = box?.decks?.find((entry) => entry.key === deckKey);
  if (!deck) return null;
  if (box.kind === 'fixed-decks') return data?.decks?.[deckKey]?.find((row) => row.id === deck.promoId) || null;
  return data?.cardsById?.get(deck.promoId) || null;
}

function comparePoolEntries(a, b) {
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
 * The cards a player may build from: the box's own cards (the fixed deck, or the Evolution pack)
 * plus every pack card, merged by card id. Basic Energy is left out — Build & Battle supplies it
 * without limit (D188).
 *
 * @param {{box: object, data: object, cards: object[], opened: Opened}} args `cards` = the set's SetCards
 * @returns {{card: object, count: number}[]} sorted Pokémon → Trainer → Energy, then by localId.
 */
export function poolFromBox({ box, data, cards = [], opened }) {
  const byId = new Map();
  const add = (card, count) => {
    if (!card?.id || isBasicEnergy(card)) return;
    const entry = byId.get(card.id);
    if (entry) entry.count += count;
    else byId.set(card.id, { card: withoutQty(card), count });
  };

  if (box?.kind === 'fixed-decks' && isKnownDeck(box, opened?.deckKey)) {
    for (const row of data?.decks?.[opened.deckKey] || []) add(row, Number(row.qty) || 0);
  } else if (isKnownDeck(box, opened?.deckKey)) {
    for (const row of rowsFromIds(opened.evolutionPack, data?.cardsById)) add(row, row.qty);
  }

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  for (const pack of opened?.packs || []) {
    for (const id of pack) add(cardsById.get(id), 1);
  }

  return [...byId.values()].sort(comparePoolEntries);
}
