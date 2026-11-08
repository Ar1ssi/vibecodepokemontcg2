// Booster packs of the Homebrew set for the Homebrew Build & Battle mode (design 078): the set's
// cards, a pack model that guarantees a Trainer and an Energy in every pack, and the seeded opening
// of the 30 packs. Pure: every random choice comes from the `rng` passed in (`createRng(seed)`), in a
// fixed order, so one seed is one box. The Energy and Trainer slots reuse `openPack`; the model is
// built here because `resolvePackModel` has no Trainer or Energy pool.

import { isAceSpecCard, isBasicEnergy } from '../../../../../../shared/engine/rules/card-classify.mjs';
import { BOOSTED_RATE_PROFILE, RARE_POOL, REVERSE_POOL, cardClass } from '../build-battle/pack-models.mjs';
import { comparePoolEntries, openPack } from '../build-battle/pack-opening.mjs';

export const HOMEBREW_SET_ID = 'customhb';
export const HOMEBREW_SET_PATH = `/src/assets/custom-sets/${HOMEBREW_SET_ID}/set.json`;
export const HOMEBREW_PACK_COUNT = 30;
export const HOMEBREW_PACK_SIZE = 10;
export const HOMEBREW_DECK_SIZE = 60;

// The Homebrew set prints SV rarity names, so its hit classes are the SV era's.
const CLASS_ERA = 'sv';
const SUPERTYPE_OF_CATEGORY = Object.freeze({ Pokemon: 'Pokémon', Trainer: 'Trainer', Energy: 'Energy' });

const POOL = Object.freeze({
  specialEnergy: 'specialEnergy',
  basicEnergy: 'basicEnergy',
  trainer: 'trainer',
  common: 'common',
  uncommon: 'uncommon',
  hit: 'hit',
  aceSpec: 'aceSpec',
});

// The Energy slot: a Special Energy (which the pool keeps) or a Basic Energy (shown in the reveal;
// the Pool tab already holds every Basic Energy without limit).
const SPECIAL_ENERGY_WEIGHT = 0.6;
const BASIC_ENERGY_WEIGHT = 0.4;

/**
 * The set.json of the Homebrew set → the SetCards the Pool tab and the unboxing scene use, in the
 * shape `hydrateSetCards` gives a baked set (art from the card's own folder).
 * @param {{id: string, name: string, releaseDate?: string, cards: object[]}} raw
 * @returns {{setInfo: {id: string, name: string, releaseDate: string}, cards: object[]}}
 */
export function hydrateHomebrewSet(raw) {
  if (!raw || raw.id !== HOMEBREW_SET_ID || !Array.isArray(raw.cards)) {
    throw new Error('homebrew set is malformed');
  }
  const setInfo = { id: raw.id, name: raw.name, releaseDate: raw.releaseDate || '' };
  const cards = raw.cards
    .filter((card) => card?.id && card.name && card.image && SUPERTYPE_OF_CATEGORY[card.category])
    .map((card) => {
      const images = { small: `${card.image}/low.webp`, large: `${card.image}/high.webp` };
      return {
        id: card.id,
        name: card.name,
        supertype: SUPERTYPE_OF_CATEGORY[card.category],
        localId: card.localId || '',
        image: images.large,
        images,
        set: { id: setInfo.id, name: setInfo.name, releaseDate: setInfo.releaseDate },
        rarity: card.rarity,
        category: card.category,
        stage: card.stage,
        types: card.types,
        hp: card.hp,
      };
    });
  return { setInfo, cards };
}

const isSpecialEnergy = (card) => card.supertype === 'Energy' && !isBasicEnergy(card);

/** @returns {Record<string, string[]>} the named pools of the pack model, as card ids. */
function packPools(cards) {
  const ids = (matches) => cards.filter(matches).map((card) => card.id);
  // Pokémon and Trainers only: the Energy slot owns every Energy, ACE SPEC cards own their roll.
  const plain = (card) => card.supertype !== 'Energy' && !isAceSpecCard(card);
  const common = ids((card) => plain(card) && card.rarity === 'Common');
  const uncommon = ids((card) => plain(card) && card.rarity === 'Uncommon');
  const rare = ids((card) => plain(card) && card.rarity === 'Rare');
  return {
    [POOL.specialEnergy]: ids((card) => isSpecialEnergy(card) && !isAceSpecCard(card)),
    [POOL.basicEnergy]: ids(isBasicEnergy),
    [POOL.trainer]: ids((card) => card.supertype === 'Trainer' && !isAceSpecCard(card)),
    [POOL.common]: common,
    [POOL.uncommon]: uncommon,
    [RARE_POOL]: rare,
    [REVERSE_POOL]: [...common, ...uncommon, ...rare],
    [POOL.hit]: ids((card) => plain(card) && card.rarity === 'Double rare'),
    [POOL.aceSpec]: ids(isAceSpecCard),
  };
}

/**
 * The pack model of `openPack`/`packSlotKind`, already resolved: Energy, 3 Commons, 3 Uncommons, a
 * Trainer, a reverse-holo and a rare slot (10 cards). Every Common, Uncommon and reverse draw may
 * also be a Trainer, so a pack holds at least one Trainer and one Energy and often more.
 * A table row whose pool is empty is dropped, so the other rows keep their rates.
 */
export function buildHomebrewPackModel(cards = []) {
  const pools = packPools(cards);
  const rowsOf = (entries) => {
    const rows = entries.map(([pool, weight]) => ({ pool, weight, ids: pools[pool] }));
    const live = rows.filter((row) => row.ids.length);
    return live.length ? live : rows;
  };
  const single = (count, pool) => ({ count, kind: 'pools', rows: [{ pool, weight: 1, ids: pools[pool] }] });
  const table = (count, entries) => ({ count, kind: 'table', rows: rowsOf(entries) });
  const rates = BOOSTED_RATE_PROFILE;
  return {
    key: 'homebrew',
    era: CLASS_ERA,
    size: HOMEBREW_PACK_SIZE,
    slots: [
      table(1, [
        [POOL.specialEnergy, SPECIAL_ENERGY_WEIGHT],
        [POOL.basicEnergy, BASIC_ENERGY_WEIGHT],
      ]),
      single(3, POOL.common),
      single(3, POOL.uncommon),
      single(1, POOL.trainer),
      table(1, [[REVERSE_POOL, 1]]),
      table(1, [
        [POOL.hit, rates.hit],
        [POOL.aceSpec, rates.aceSpec],
        [RARE_POOL, 1 - rates.hit - rates.aceSpec],
      ]),
    ],
    fallbackIds: pools[RARE_POOL],
    allIds: cards.filter((card) => !isBasicEnergy(card)).map((card) => card.id),
  };
}

/** @returns {string[]} one line per guaranteed slot the set cannot fill; [] when every pack can be built. */
export function homebrewPackProblems(cards = []) {
  const pools = packPools(cards);
  const problems = [];
  if (!pools[POOL.specialEnergy].length && !pools[POOL.basicEnergy].length) problems.push('the set has no Energy card');
  if (!pools[POOL.trainer].length) problems.push('the set has no Trainer card');
  if (!pools[POOL.common].length) problems.push('the set has no Common');
  if (!pools[POOL.uncommon].length) problems.push('the set has no Uncommon');
  return problems;
}

/** The hit class of a card for the reveal's flare (a Basic Energy is never a hit, whatever its rarity). */
export function homebrewCardClass(card, setInfo) {
  return isBasicEnergy(card) ? null : cardClass(card, CLASS_ERA, setInfo);
}

/**
 * Opens a whole box from one RNG stream.
 * @param {{cards: object[], rng: {next: () => number, int: (n: number) => number}, packCount?: number}} args
 * @returns {string[][]} `packCount` packs as card ids, in opening order.
 */
export function openHomebrewBox({ cards = [], rng, packCount = HOMEBREW_PACK_COUNT }) {
  const problems = homebrewPackProblems(cards);
  if (problems.length) throw new Error(`cannot open the Homebrew box: ${problems.join('; ')}`);
  const packModel = buildHomebrewPackModel(cards);
  const packs = [];
  for (let index = 0; index < packCount; index += 1) {
    packs.push(openPack({ cards, packModel, rng }).map((card) => card.id));
  }
  return packs;
}

/**
 * The cards a player may build from: every pack card merged by id. Basic Energy is left out, as in
 * Build & Battle, because the Pool tab supplies it without limit.
 * @returns {{card: object, count: number}[]} sorted Pokémon → Trainer → Energy, then by localId.
 */
export function poolFromPacks({ cards = [], packs = [] }) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const entries = new Map();
  for (const pack of packs) {
    for (const id of pack) {
      const card = cardsById.get(id);
      if (!card || isBasicEnergy(card)) continue;
      const entry = entries.get(id);
      if (entry) entry.count += 1;
      else entries.set(id, { card, count: 1 });
    }
  }
  return [...entries.values()].sort(comparePoolEntries);
}
