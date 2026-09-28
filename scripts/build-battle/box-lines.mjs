/**
 * Build & Battle box source lines (design 054 § Generated data, § Deviations D1):
 *   "<qty> <name> <SET> <number>"    a card, e.g. "3 Ponyta TEU 17", "1 Charizard SMP 158"
 *   "<min>-<max> <name> <SET> <n>"  a copy range, e.g. "0-2 Copycat CES 127"
 *   "<qty> <name> <SET> <n>/<n>"    one of two prints, e.g. "1 Professor's Research SVI 189/190"
 *   "<qty> Basic <Type> Energy"     the SVE print, as 051's decks bake it
 * A number matches a TCGdex localId numerically ("SM158", "SWSH006", "005" and "5" are 158, 6, 5
 * and 5), and every resolved card's TCGdex name must equal the line's name.
 */
import {
  buildModernBasicEnergy,
  isModernBasicEnergyLabel,
} from '../../client/src/setup/deck-builder/core/modern-energy.mjs';
import { BASIC_ENERGY_LABELS } from '../../client/src/setup/deck-builder/core/build-battle/box-catalog.mjs';
import { setCardFields } from '../lib/build-battle-modules.mjs';
import { SET_MAP, limitlessImage, normalizeCard } from '../lib/decklist-lines.mjs';

const CARD_LINE = /^(\d+)(?:-(\d+))?\s+(.+?)\s+([A-Z][A-Z0-9.]*)\s+(\d+(?:\/\d+)*)$/;
const ENERGY_LINE = /^(\d+)\s+(Basic \w+ Energy)$/;
const POKEMON_TCG_IO = 'https://images.pokemontcg.io';

/**
 * @returns {{min: number, max: number, fixed: boolean, name: string, setCode: string,
 *   numbers: number[]}|{min: number, max: number, fixed: true, energy: string}}
 */
export function parseBoxLine(line) {
  const text = String(line ?? '').trim();
  const energy = text.match(ENERGY_LINE);
  if (energy && isModernBasicEnergyLabel(energy[2])) {
    const qty = Number(energy[1]);
    return { min: qty, max: qty, fixed: true, energy: energy[2] };
  }
  const card = text.match(CARD_LINE);
  if (!card) throw new Error(`Could not parse box line: "${text}"`);
  const min = Number(card[1]);
  const max = card[2] === undefined ? min : Number(card[2]);
  if (max < min) throw new Error(`Bad copy range in "${text}"`);
  if (!SET_MAP[card[4]]) throw new Error(`Unknown set code ${card[4]} in "${text}"`);
  return {
    min,
    max,
    fixed: card[2] === undefined,
    name: card[3],
    setCode: card[4],
    numbers: card[5].split('/').map(Number),
  };
}

const localNumber = (localId) => {
  const match = String(localId ?? '').match(/^[A-Za-z]*(\d+)$/);
  return match ? Number(match[1]) : null;
};

/**
 * @returns {Promise<object>} the TCGdex card a set code and number name. Throws on 0 or 2+ cards
 *   with that number, and when `name` is given and TCGdex names the card differently (data drift).
 */
export async function resolveCardNumber({ setCode, number, name }, { fetchSet, fetchCard }) {
  const setId = SET_MAP[setCode];
  const set = await fetchSet(setId);
  const matches = (set.cards || []).filter((brief) => localNumber(brief.localId) === number);
  if (matches.length !== 1) {
    throw new Error(`${setCode} ${number} (${name}): ${matches.length} cards in ${setId} have that number`);
  }
  const card = await fetchCard(matches[0].id);
  if (name && card.name !== name) {
    throw new Error(`${card.id} is "${card.name}", decklist says "${name}"`);
  }
  return card;
}

/** @returns {Promise<object[]>} the line's TCGdex card (or cards, one per alternative print). */
export async function resolveLineCards(parsed, tcgdex) {
  return Promise.all(
    parsed.numbers.map((number) => resolveCardNumber({ ...parsed, number }, tcgdex))
  );
}

/**
 * Art for a card TCGdex has none for (design 054 D4): the Limitless scan for the ME/SV eras (as
 * 051 baked MEP), images.pokemontcg.io for older sets, which `headOk` must confirm.
 */
export async function fallbackImages(card, { headOk }) {
  const series = String(card.set?.id ?? '').match(/^(me|sv)/) ? 'modern' : 'older';
  if (series === 'modern') {
    const images = limitlessImage(card);
    if (!images) throw new Error(`${card.id}: no TCGdex art and no Limitless code`);
    return images;
  }
  const base = `${POKEMON_TCG_IO}/${card.set?.id}/${card.localId}`;
  const images = { small: `${base}.png`, large: `${base}_hires.png` };
  if (!(await headOk(images.large))) throw new Error(`${card.id}: no art on TCGdex or ${images.large}`);
  return images;
}

/** A box module card row: design 051's full shape, from TCGdex or a baked Basic Energy label. */
export async function boxCardRow(card, tcgdex) {
  const { qty: _qty, ...row } = normalizeCard(card, 0);
  if (!card.image) {
    const images = await fallbackImages(card, tcgdex);
    Object.assign(row, { image: images.large, images });
  }
  return { ...row, ...setCardFields(card) };
}

export function basicEnergyCardRow(label) {
  const { qty: _qty, ...row } = buildModernBasicEnergy(label, 0);
  return { ...row, ...setCardFields(null) };
}

/**
 * The Energy types a group's Pokémon ask for (design 054 A3): every typed symbol of every attack
 * cost, weighted by copies; Colorless and non-Basic types are left out.
 * @param {{card: object, copies: number}[]} entries TCGdex cards with their copy counts
 * @returns {[string, number][]} in BASIC_ENERGY_LABELS order
 */
export function energyNeeds(entries) {
  const weights = new Map();
  for (const { card, copies } of entries) {
    if (card?.category !== 'Pokemon') continue;
    for (const attack of card.attacks || []) {
      for (const symbol of attack.cost || []) {
        const label = `Basic ${symbol} Energy`;
        if (!BASIC_ENERGY_LABELS.includes(label)) continue;
        weights.set(label, (weights.get(label) || 0) + copies);
      }
    }
  }
  return BASIC_ENERGY_LABELS.filter((label) => weights.has(label)).map((label) => [label, weights.get(label)]);
}
