// What the Shelf and Collection tabs show (design 057 § Standard builder integration). Pure: the
// DOM glue in native-deck-builder-etb.js renders it.

import { BUILD_BATTLE_BOXES, BUILD_BATTLE_ERA_NAMES } from '../build-battle/box-catalog.mjs';
import { parseSeed } from '../build-battle/build-battle-session.mjs';
import { boxSkin } from '../build-battle/unboxing.mjs';
import { getEtb } from './etb-catalog.mjs';
import { ETB_PROMOS } from './etb-promos.generated.mjs';

export const EMPTY_COLLECTION_TEXT = 'Open an Elite Trainer Box on the Shelf to start a collection.';
export const MEMORY_ONLY_TEXT = 'This box will not be kept after a reload';
export const RESET_COLLECTION_CONFIRM =
  'Remove every card, sleeve and coin your boxes gave you? Decks stay in My Decks.';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** @returns {string} "9 packs · Charcadet promo · 65 sleeves · 40 Energy · dice · coin". */
export function shelfLine(etb, promos = ETB_PROMOS) {
  const promo = Object.hasOwn(promos || {}, etb.key) ? promos[etb.key] : null;
  const energy = etb.energy.reduce((sum, [, count]) => sum + count, 0);
  const parts = [plural(etb.packCount, 'pack', 'packs')];
  if (promo?.name) parts.push(`${promo.name} promo`);
  parts.push(plural(etb.sleeveCount, 'sleeve', 'sleeves'), `${energy} Energy`);
  if (etb.props.damageDice + etb.props.flipDie > 0) parts.push('dice');
  if (etb.props.coin > 0) parts.push('coin');
  return parts.join(' · ');
}

/** @returns {string} "Your <name> is being opened". */
export function inFlightLine(etb) {
  return `Your ${etb.name} is being opened`;
}

/** @returns {string} "91 cards · 42 unique · 1 box opened". */
export function collectionHeadline({ cards, unique, products }) {
  return [
    plural(cards, 'card', 'cards'),
    `${unique} unique`,
    `${plural(products, 'box', 'boxes')} opened`,
  ].join(' · ');
}

/**
 * The badge on an owned card: how many the boxes gave, and how many the deck holds. A deck may
 * hold more than is owned (Standard rules decide, D189): the badge turns amber, Play is untouched.
 * @returns {{text: string, over: boolean}}
 */
export function ownedBadge(owned, inDeck = 0) {
  const text = inDeck > 0 ? `${owned} owned · ${inDeck} in deck` : `${owned} owned`;
  return { text, over: inDeck > owned };
}

/**
 * The `?etb=<key>&seed=<n>` prefill. An unknown key is ignored (row 19); a bad seed prefills none.
 * @returns {{etbKey: string, seed: number|null}|null}
 */
export function parseEtbQuery(search = '') {
  const params = new URLSearchParams(search);
  const etb = getEtb(params.get('etb'));
  if (!etb) return null;
  return { etbKey: etb.key, seed: parseSeed(params.get('seed') ?? '') };
}

const energyTotal = (etb) => etb.energy.reduce((sum, [, count]) => sum + count, 0);

/** @returns {string[]} the "Inside, you'll find" lines on the box back, from the catalog row. */
export function etbInsideLines(etb, setName, promos = ETB_PROMOS) {
  const promo = Object.hasOwn(promos || {}, etb.key) ? promos[etb.key] : null;
  const { damageDice, flipDie, coin, dividers, codeCard } = etb.props;
  return [
    `${etb.packCount} ${setName} booster packs`,
    promo ? `1 foil promo card featuring ${promo.name}` : null,
    `${etb.sleeveCount} card sleeves`,
    `${energyTotal(etb)} Pokémon TCG Energy cards`,
    damageDice ? `${damageDice} damage-counter dice` : null,
    flipDie ? `${flipDie} competition-legal coin-flip die` : null,
    coin ? `${coin} plastic coin` : null,
    dividers ? `${dividers} card dividers` : null,
    codeCard ? 'A code card for Pokémon TCG Live' : null,
  ].filter(Boolean);
}

/**
 * What the unboxing scene dresses an ETB in (design 054's `look`): the booster fronts and
 * palette of its set's Build & Battle box (the same wrappers, so the 3D packs keep their measured
 * shapes), the ETB's own key art, and no vendored box faces (the ETB box is procedural).
 * @param {import('./etb-catalog.mjs').Etb} etb
 * @param {{setInfo?: object, cards?: object[]}} loaded the set from `loadSetData`
 */
export function etbLook(etb, { setInfo = {}, cards = [] } = {}, promos = ETB_PROMOS) {
  const setBox = BUILD_BATTLE_BOXES.find((box) => box.setId === etb.setId) || null;
  const base = setBox ? boxSkin({ box: setBox, setInfo, cards }) : boxSkin({ box: { era: etb.era }, setInfo, cards });
  const keyArt = cards.find((card) => card.id === etb.keyArtCardId);
  return {
    skin: {
      ...base,
      keyArtUrl: keyArt?.images?.large || keyArt?.image || base.keyArtUrl,
      faces: null,
      render: null,
    },
    labels: {
      productTitle: 'Elite Trainer Box',
      deckLabel: 'Promo pouch',
      backLines: etbInsideLines(etb, setInfo.name || '', promos),
      codeCardGame: 'Pokémon TCG Live',
    },
    seriesName: BUILD_BATTLE_ERA_NAMES[etb.era] || '',
    setName: setInfo.name || '',
    playLevel: false,
  };
}
