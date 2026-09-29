// Elite Trainer Boxes (design 057 § Data). Hand-kept: one row per ETB whose set is baked.
// Phantasmal Flames ETB contents: GameStop / Zatu product listings (9 packs, 65 sleeves, 40 Energy,
// 6 damage dice + 1 flip die, 1 plastic coin, 6 dividers, guide, code card). Promo: Charcadet
// MEP 022 (Bulbapedia "Charcadet (Phantasmal Flames 19)"; PokeBeach Phantasmal Flames set guide).
// Box art: Mega Charizard X ex, me02-013 in the baked set. Pull rates are never set here: every
// pack rolls design 054's model for the era (`packModelKey`, the one the set's Build & Battle box
// rolls).

import { BUILD_BATTLE_BOXES } from '../build-battle/box-catalog.mjs';
import { PACK_MODELS } from '../build-battle/pack-models.mjs';

/**
 * @typedef {{key: string, name: string, setId: string, era: string, packModelKey: string,
 *   packCount: number, promoId: string,
 *   promoTier: 0|1|2|3,
 *   sleeveId: string, sleeveCount: number, coinId: string, energy: [string, number][],
 *   props: {damageDice: number, flipDie: number, coin: number, dividers: number, guide: number,
 *   codeCard: number}, keyArtCardId: string}} Etb
 */

/** @type {Etb[]} */
export const ELITE_TRAINER_BOXES = [
  {
    key: 'phantasmal-flames-etb',
    name: 'Mega Evolution—Phantasmal Flames Elite Trainer Box',
    setId: 'me02',
    era: 'me',
    packModelKey: 'me',
    packCount: 9,
    promoId: 'mep-022',
    // TCGdex rarity is "Promo" (no reveal flare), but the card is the Illustration Rare art cut
    // from the English set (design 057 § ETB reference), so its lift plays the tier 2 flare.
    promoTier: 2,
    sleeveId: '08266b9d-1d37-4ddb-a458-9adc302edb62',
    sleeveCount: 65,
    coinId: 'PFLETB_Mega_Charizard_X_Coin',
    // 40 cards; the type split is not published (UNVERIFIED): five of each Basic type until a
    // photo of the box contents says otherwise.
    energy: [
      ['Basic Grass Energy', 5],
      ['Basic Fire Energy', 5],
      ['Basic Water Energy', 5],
      ['Basic Lightning Energy', 5],
      ['Basic Psychic Energy', 5],
      ['Basic Fighting Energy', 5],
      ['Basic Darkness Energy', 5],
      ['Basic Metal Energy', 5],
    ],
    props: { damageDice: 6, flipDie: 1, coin: 1, dividers: 6, guide: 1, codeCard: 1 },
    keyArtCardId: 'me02-013',
  },
];

/** @returns {Etb|null} the ETB with this key, or null for an unknown key. */
export function getEtb(key) {
  return ELITE_TRAINER_BOXES.find((etb) => etb.key === key) || null;
}

/**
 * @returns {Etb[]} the ETBs that can be opened: a Build & Battle box bakes their set (only those
 *   sets ship under `sets/`) and their pack model exists.
 */
export function availableEtbs(boxes = BUILD_BATTLE_BOXES, packModels = PACK_MODELS) {
  const bakedSetIds = new Set(boxes.map((box) => box.setId));
  return ELITE_TRAINER_BOXES.filter(
    (etb) => bakedSetIds.has(etb.setId) && Object.hasOwn(packModels, etb.packModelKey)
  );
}

/** @returns {number} cards per pack of the ETB's boosters (0 for an unknown model). */
export function etbPackSize(etb) {
  return Object.hasOwn(PACK_MODELS, etb?.packModelKey) ? PACK_MODELS[etb.packModelKey].size : 0;
}
