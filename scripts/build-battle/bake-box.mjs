/**
 * Bakes one Build & Battle box (design 054 § Generated data): the set module its packs draw from
 * and the box module (fixed decks, or promos, groups, Trainer pools and Energy needs), from the
 * box's source lines and TCGdex. All I/O comes in through `tcgdex` ({ fetchSet, fetchCard,
 * headOk }), so tests bake offline.
 */
import { hydrateBoxData } from '../../client/src/setup/deck-builder/core/build-battle/box-data.mjs';
import {
  BUILD_BATTLE_DECK_SIZE,
  evolutionPairingProblems,
} from '../../client/src/setup/deck-builder/core/build-battle/pack-opening.mjs';
import { toSetRow } from '../lib/build-battle-modules.mjs';
import {
  basicEnergyCardRow,
  boxCardRow,
  energyNeeds,
  fallbackImages,
  parseBoxLine,
  resolveLineCards,
} from './box-lines.mjs';

const CONCURRENCY = 12;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const compareLocalIds = (a, b) =>
  String(a.localId).localeCompare(String(b.localId), 'en', { numeric: true });

async function setRowsOf(tcgSet, subset, tcgdex) {
  const cards = await mapLimit(tcgSet.cards || [], CONCURRENCY, (brief) =>
    tcgdex.fetchCard(brief.id, brief.name)
  );
  const rows = await mapLimit(cards, CONCURRENCY, async (card) =>
    toSetRow(card, { subset, images: card.image ? null : await fallbackImages(card, tcgdex) })
  );
  return rows.sort(compareLocalIds);
}

/**
 * @returns {Promise<{set: object, rows: object[]}>} the set module: every card of the box set,
 *   plus its Trainer Gallery for a `swsh-tg` box (design 054 row 21).
 */
export async function bakeSet(box, tcgdex) {
  const tcgSet = await tcgdex.fetchSet(box.setId);
  const official = tcgSet.cardCount?.official;
  if (!(official > 0)) {
    throw new Error(`${box.setId}: TCGdex gives no official card count, which secret detection needs`);
  }
  const set = {
    id: tcgSet.id,
    name: tcgSet.name,
    series: tcgSet.serie?.id,
    releaseDate: tcgSet.releaseDate,
    official,
    logo: tcgSet.logo,
    symbol: tcgSet.symbol,
  };
  if (!set.series) throw new Error(`${box.setId}: TCGdex gives no series`);
  const rows = await setRowsOf(tcgSet, null, tcgdex);
  if (box.packModelKey === 'swsh-tg') {
    const galleryId = `${box.setId}tg`;
    const gallery = await tcgdex.fetchSet(galleryId).catch(() => null);
    const galleryRows = gallery ? await setRowsOf(gallery, 'tg', tcgdex) : [];
    if (!galleryRows.length) throw new Error(`no Trainer Gallery rows for ${galleryId}`);
    set.subsets = { [galleryId]: { name: gallery.name } };
    rows.push(...galleryRows);
  }
  return { set, rows };
}

// Resolves every line (in parallel), then records cards in line order so a re-bake is identical.
async function resolveLines(lines, tcgdex, cards, tcgCards) {
  const resolved = await mapLimit(lines, CONCURRENCY, async (line) => {
    const parsed = parseBoxLine(line);
    if (parsed.energy) return { line, parsed, found: [], energyRow: basicEnergyCardRow(parsed.energy) };
    const found = await resolveLineCards(parsed, tcgdex);
    const rows = await Promise.all(found.map((card) => boxCardRow(card, tcgdex)));
    return { line, parsed, found, rows };
  });
  for (const entry of resolved) {
    if (entry.energyRow) {
      if (!cards.has(entry.energyRow.id)) cards.set(entry.energyRow.id, entry.energyRow);
      entry.ids = [entry.energyRow.id];
      continue;
    }
    entry.found.forEach((card, index) => {
      tcgCards.set(card.id, card);
      if (!cards.has(card.id)) cards.set(card.id, entry.rows[index]);
    });
    entry.ids = entry.found.map((card) => card.id);
  }
  return resolved;
}

function fixedEntry({ line, parsed, ids }) {
  if (!parsed.fixed || ids.length !== 1) throw new Error(`"${line}" must be one print, one count`);
  return { id: ids[0], qty: parsed.min };
}

function groupEntry({ line, parsed, ids }) {
  if (ids.length > 1) {
    if (!parsed.fixed) throw new Error(`"${line}": alternative prints take one count`);
    return { alts: ids, qty: parsed.min };
  }
  return parsed.fixed ? { id: ids[0], qty: parsed.min } : { id: ids[0], min: parsed.min, max: parsed.max };
}

function poolEntry({ line, parsed, ids }) {
  if (ids.length !== 1) throw new Error(`"${line}": a Trainer pool card is one print`);
  return { id: ids[0], min: parsed.min, max: parsed.max };
}

function checkKeys(box, keys, what) {
  const expected = box.decks.map((deck) => deck.key).sort();
  if (JSON.stringify([...keys].sort()) !== JSON.stringify(expected)) {
    throw new Error(`${box.key}: ${what} keys ${[...keys].join(', ')}; the catalog has ${expected.join(', ')}`);
  }
}

async function bakeFixedDecks(box, source, tcgdex, cards, tcgCards) {
  checkKeys(box, Object.keys(source.decks || {}), 'deck');
  const decks = {};
  for (const deck of box.decks) {
    const resolved = await resolveLines(source.decks[deck.key], tcgdex, cards, tcgCards);
    decks[deck.key] = resolved.map(fixedEntry);
    const total = decks[deck.key].reduce((sum, entry) => sum + entry.qty, 0);
    if (total !== BUILD_BATTLE_DECK_SIZE) throw new Error(`${box.key} ${deck.key}: ${total} cards, not 40`);
    const promo = decks[deck.key].filter((entry) => entry.id === deck.promoId);
    if (promo.length !== 1 || promo[0].qty !== 1) throw new Error(`${box.key} ${deck.key}: promo ${deck.promoId} not once`);
  }
  return { kind: box.kind, cards: [...cards.values()], decks };
}

async function bakeEvolution(box, source, tcgdex, cards, tcgCards) {
  checkKeys(box, Object.keys(source.promos || {}), 'promo');
  checkKeys(box, Object.keys(source.groups || {}), 'group');
  const promos = {};
  for (const deck of box.decks) {
    const [promo] = await resolveLines([source.promos[deck.key]], tcgdex, cards, tcgCards);
    const entry = fixedEntry(promo);
    if (entry.id !== deck.promoId || entry.qty !== 1) {
      throw new Error(`${box.key} ${deck.key}: promo line gives ${entry.qty} × ${entry.id}, catalog says ${deck.promoId}`);
    }
    promos[deck.key] = entry.id;
  }
  const groups = {};
  const needs = {};
  for (const deck of box.decks) {
    const resolved = await resolveLines(source.groups[deck.key], tcgdex, cards, tcgCards);
    groups[deck.key] = resolved.map(groupEntry);
    const copies = [{ card: tcgCards.get(promos[deck.key]), copies: 1 }];
    for (const { found, parsed } of resolved) {
      if (found.length === 1) copies.push({ card: found[0], copies: parsed.max });
    }
    needs[deck.key] = energyNeeds(copies);
  }
  const common = (await resolveLines(source.common || [], tcgdex, cards, tcgCards)).map(groupEntry);
  const trainers = [];
  for (const pool of source.trainers || []) {
    const resolved = await resolveLines(pool.cards, tcgdex, cards, tcgCards);
    trainers.push({ name: pool.name, count: pool.count ?? null, cards: resolved.map(poolEntry) });
  }
  const energySwaps = [];
  for (const swap of source.energySwaps || []) {
    const resolved = await resolveLines(swap.cards, tcgdex, cards, tcgCards);
    energySwaps.push({ when: [...swap.when], rows: resolved.map(fixedEntry) });
  }
  const data = {
    kind: box.kind,
    cards: [...cards.values()],
    promos,
    groups,
    ...(common.length ? { common } : {}),
    ...(trainers.length ? { trainers } : {}),
    ...(energySwaps.length ? { energySwaps } : {}),
    ...(box.kind === 'evolution-deck' ? { energyNeeds: needs } : {}),
  };
  const problems = evolutionPairingProblems({ box, data: hydrateBoxData(data) });
  if (problems.length) throw new Error(`${box.key} cannot open every pairing:\n  ${problems.join('\n  ')}`);
  return data;
}

/** @returns {Promise<object>} the box module's data (design 054 § Generated data, D1). */
export async function bakeBoxData(box, source, tcgdex) {
  if (source.key !== box.key) throw new Error(`source ${source.key} is not box ${box.key}`);
  const cards = new Map();
  const tcgCards = new Map();
  return box.kind === 'fixed-decks'
    ? bakeFixedDecks(box, source, tcgdex, cards, tcgCards)
    : bakeEvolution(box, source, tcgdex, cards, tcgCards);
}

/** One line per box for the generator's log. */
export function bakeSummary(box, { set, rows }, data) {
  const rarities = {};
  for (const row of rows) rarities[row.rarity] = (rarities[row.rarity] || 0) + 1;
  const copies = (entries = []) =>
    entries.reduce((sum, entry) => sum + (entry.qty ?? entry.max ?? 0), 0);
  const contents = data.decks
    ? `decks ${JSON.stringify(Object.fromEntries(Object.entries(data.decks).map(([key, entries]) => [key, copies(entries)])))}`
    : `groups ${JSON.stringify(Object.fromEntries(Object.entries(data.groups).map(([key, entries]) => [key, copies(entries)])))}, ` +
      `pool ${(data.trainers || []).reduce((sum, pool) => sum + pool.cards.length, 0)}`;
  return `box ${box.key}: ${set.id} ${rows.length} rows ${JSON.stringify(rarities)}, ${box.kind}, ${contents}`;
}
