// The Build & Battle box and what it holds, in millimetres (design 073 § Assumptions, § Research
// facts). Pure data for the tabletop scene: no DOM, no three.js.

import { BOX_PROPORTIONS } from '../box-textures.mjs';

// A Pokémon card: 63 × 88 mm, 0.30–0.32 mm thick (folio.fyi card-size guide); 3 mm corners.
export const CARD = Object.freeze({ width: 63, height: 88, thickness: 0.31, cornerRadius: 3 });

// The vendored wrapper fronts are 780 × 1426 px (design 055); a pack is 66 mm wide, so the
// booster top-loader's 70 × 121 internal size (a retailer spec) holds it.
export const PACK_ART_ASPECT = 1426 / 780;
export const PACK = Object.freeze({
  width: 66,
  height: Math.round(66 * PACK_ART_ASPECT * 100) / 100,
  // Two layers of metallised film.
  film: 0.07,
});

// Paperboard the box is folded from.
export const BOARD = 0.5;

// The packs stand upright inside, so the box is at least this tall and wide inside.
const PACK_HEADROOM = 5;
const PACK_SIDE_ROOM = 9;
export const BOX_MIN_HEIGHT = Math.ceil(PACK.height + PACK_HEADROOM + 2 * BOARD);
const BOX_MIN_WIDTH = Math.ceil(PACK.width + 2 * PACK_SIDE_ROOM + 2 * BOARD);

// The flip-top lid (Destined Rivals render): it covers the top 76 % of the front and 22 % of the
// back, the sides cut on the diagonal between; the base's collar rises this far into the lid.
export const LID_FRONT_DROP = 0.76;
export const LID_BACK_DROP = 0.22;
export const COLLAR_MM = 7;

/**
 * The box's outer size for its proportions (`width` 1, `height`, `depth` relative to it): tall
 * enough for an upright pack, never narrower than a pack plus its side room.
 *
 * @param {{width?: number, height?: number, depth?: number}} [proportions]
 * @returns {{width: number, height: number, depth: number, board: number, lidFront: number,
 *   lidBack: number, collar: number}} mm; `lidFront` / `lidBack` are how far the lid reaches down
 *   the front and back from the top.
 */
export function boxDimensions(proportions = BOX_PROPORTIONS) {
  const ratioH = positiveOr(proportions?.height, BOX_PROPORTIONS.height);
  const ratioD = positiveOr(proportions?.depth, BOX_PROPORTIONS.depth);
  const height = BOX_MIN_HEIGHT;
  const width = Math.max(BOX_MIN_WIDTH, round1(height / ratioH));
  const depth = round1(width * ratioD);
  return {
    width,
    height,
    depth,
    board: BOARD,
    lidFront: round1(height * LID_FRONT_DROP),
    lidBack: round1(height * LID_BACK_DROP),
    collar: COLLAR_MM,
  };
}

/** @returns {number} the height of a stack of `count` cards, in mm. */
export function deckThickness(count) {
  const cards = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return round2(cards * CARD.thickness);
}

const LIVE_CODE_ERAS = new Set(['sv', 'me']);
const ENERGY_PACK_ERAS = new Set(['swsh', 'sv', 'me']);

/**
 * What the box holds besides its packs: a 40-card deck (fixed decks, Evolution decks) or a 23-card
 * Evolution pack (Fates Collide → Fusion Strike), one code card (TCG Live from Scarlet & Violet on,
 * TCG Online before) and the folded tips leaflet (a Prerelease Kit's player's guide).
 *
 * @param {{kind?: string, era?: string, name?: string, packCount?: number}} box
 * @returns {{deck: {kind: 'deck'|'evolution-pack', count: number}, packs: number,
 *   codeCard: 'live'|'online', leaflet: 'tips'|'guide'}}
 */
export function contentsFor(box) {
  const evolutionPack = box?.kind === 'evolution-pack';
  return {
    deck: evolutionPack ? { kind: 'evolution-pack', count: 23 } : { kind: 'deck', count: 40 },
    packs: Number.isInteger(box?.packCount) && box.packCount > 0 ? box.packCount : 4,
    codeCard: LIVE_CODE_ERAS.has(box?.era) ? 'live' : 'online',
    leaflet: /Prerelease Kit$/.test(String(box?.name || '')) ? 'guide' : 'tips',
  };
}

/**
 * The cosmetic cards a pack carries before its ten: a code card in every era, and a Basic Energy
 * from Sword & Shield on ("10 cards, 1 Basic Energy, and 1 … code card", ME02 box back).
 *
 * @returns {('code'|'energy')[]}
 */
export function packExtrasFor(era) {
  return ENERGY_PACK_ERAS.has(era) ? ['code', 'energy'] : ['code'];
}

/** @returns {number} a full pack's thickness in mm: its cards plus the two film walls. */
export function packThickness(cardCount) {
  return round2(deckThickness(cardCount) + 2 * PACK.film);
}

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
