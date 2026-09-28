// Elite Trainer Boxes (design 055 § Data). Hand-kept: one row per ETB whose set is baked.
// Phantasmal Flames ETB contents: GameStop / Zatu product listings (9 packs, 65 sleeves, 40 Energy,
// 6 damage dice + 1 flip die, 1 plastic coin, 6 dividers, guide, code card). Promo: Charcadet
// MEP 022 (Bulbapedia "Charcadet (Phantasmal Flames 19)"; PokeBeach Phantasmal Flames set guide).
// Box art: Mega Charizard X ex, me02-013 in the baked set. Pull rates are never set here: every
// pack rolls `packModelFor(setId)`.

import { packModelFor } from '../build-battle/box-catalog.mjs';
import { BUILD_BATTLE_SET_CARDS } from '../build-battle/build-battle.generated.mjs';

/**
 * @typedef {{key: string, name: string, setId: string, packCount: number, promoId: string,
 *   sleeveId: string, sleeveCount: number, coinId: string, energy: [string, number][],
 *   props: {damageDice: number, flipDie: number, coin: number, dividers: number, guide: number,
 *   codeCard: number}, keyArtCardId: string, art: string}} Etb
 */

/** @type {Etb[]} */
export const ELITE_TRAINER_BOXES = [
  {
    key: 'phantasmal-flames-etb',
    name: 'Mega Evolution—Phantasmal Flames Elite Trainer Box',
    setId: 'me02',
    packCount: 9,
    promoId: 'mep-022',
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
    art: 'phantasmal-flames-etb',
  },
];

/** @returns {Etb|null} the ETB with this key, or null for an unknown key. */
export function getEtb(key) {
  return ELITE_TRAINER_BOXES.find((etb) => etb.key === key) || null;
}

/** @returns {Etb[]} the ETBs that can be opened: their set is baked and has a pack model. */
export function availableEtbs(setCards = BUILD_BATTLE_SET_CARDS) {
  return ELITE_TRAINER_BOXES.filter(
    (etb) => (setCards?.[etb.setId]?.length || 0) > 0 && packModelFor(etb.setId) !== null
  );
}
