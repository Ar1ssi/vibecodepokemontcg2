// Opening an Elite Trainer Box (design 055 § Opening). Pure: every random choice comes from the
// `rng` passed in (`createRng(seed)`). An ETB has no deck draw, so its stream never lines up with
// a Build & Battle box's.

import { openPack } from '../build-battle/pack-opening.mjs';

/**
 * @param {{etb: import('./etb-catalog.mjs').Etb, cards: object[], packModel: object|null,
 *   rng: {next: () => number, int: (n: number) => number}}} args `cards` is the set's SetCards.
 * @returns {{packs: string[][]}} `etb.packCount` packs as card ids, in opening order.
 */
export function openEtb({ etb, cards = [], packModel, rng }) {
  if (!packModel) throw new Error(`no pack model for ${etb?.setId}`);
  const packs = [];
  for (let index = 0; index < etb.packCount; index += 1) {
    packs.push(openPack({ cards, packModel, rng }).map((card) => card.id));
  }
  return { packs };
}

/**
 * Everything in the box besides the packs, for the scene and the collection.
 * @param {import('./etb-catalog.mjs').Etb} etb
 * @param {Record<string, object>} promos the generated promo rows by ETB key (`ETB_PROMOS`)
 * @returns {{promo: object|null, energy: [string, number][], sleeveId: string, coinId: string,
 *   props: object}}
 */
export function etbContents(etb, promos = {}) {
  const promo = Object.hasOwn(promos || {}, etb.key) ? promos[etb.key] : null;
  return {
    promo: promo || null,
    energy: etb.energy.map(([label, count]) => [label, count]),
    sleeveId: etb.sleeveId,
    coinId: etb.coinId,
    props: { ...etb.props },
  };
}
