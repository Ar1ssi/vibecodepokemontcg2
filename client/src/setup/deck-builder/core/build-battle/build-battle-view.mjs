// What the Build & Battle tab shows, derived from the session and the editor deck (design 051
// § Builder-tab controller). Pure: the DOM glue in native-deck-builder-build-battle.js renders it.

import {
  DECK_FORMAT_BUILD_BATTLE,
  DECK_FORMAT_TCG,
} from '../../../../../../shared/engine/formats.mjs';
import { BUILD_BATTLE_BOXES, getBuildBattleBox } from './box-catalog.mjs';

/** @returns {object} the editor's `{ [name]: { cards: [{ data, count }], totalCount } }` map for box deck rows. */
export function deckFromRows(rows = []) {
  const deck = {};
  for (const row of rows) {
    const count = Number(row?.qty) || 0;
    if (!row?.name || count <= 0) continue;
    const { qty: _qty, ...data } = row;
    const group = deck[row.name] || { cards: [], totalCount: 0 };
    group.cards.push({ data, count });
    group.totalCount += count;
    deck[row.name] = group;
  }
  return deck;
}

/**
 * Rebuilds an editor deck from [cardId, count] pairs (I207). Ids missing from `cards` are
 * dropped, so a stored deck can never add a card the box did not hold.
 * @param {[string, number][]} counts
 * @param {object[]} cards every card the pair ids may name (pool, box deck, unlimited Energy)
 */
export function deckFromCardCounts(counts = [], cards = []) {
  const byId = new Map(cards.filter((card) => card?.id).map((card) => [card.id, card]));
  const rows = [];
  for (const [id, qty] of counts) {
    const card = byId.get(id);
    if (card) rows.push({ ...card, qty });
  }
  return deckFromRows(rows);
}

/**
 * The format a deck is played and first saved with: a saved record's own format wins, so a
 * Standard deck opened from My Decks in the Build & Battle tab keeps 6 Prizes; only an unsaved
 * deck in the Build & Battle tab is Build & Battle (I205: its first Save records that).
 * @returns {'tcg'|'build-battle'}
 */
export function deckLoadFormat({ isBuildBattle = false, recordedFormat = null, isUnsaved = true } = {}) {
  if (recordedFormat === DECK_FORMAT_BUILD_BATTLE) return DECK_FORMAT_BUILD_BATTLE;
  return isBuildBattle && isUnsaved ? DECK_FORMAT_BUILD_BATTLE : DECK_FORMAT_TCG;
}

/** @returns {string|null} the `?box=` value when it names a catalog box, else null (row 1). */
export function parseBoxKey(value) {
  if (typeof value !== 'string' || !value) return null;
  return getBuildBattleBox(value) ? value : null;
}

/** @returns {string} the library name of the deck built from one box: "B&B <box> <deck> #<seed>". */
export function buildBattleDeckName(box, deckName, seed) {
  return `B&B ${box.shortName} ${deckName} #${seed}`;
}

/** @returns {string} "<Box name> · <Deck name> deck|promo · Box #<seed>". */
export function boxHeadline(box, deckEntry, seed) {
  const noun = box.kind === 'fixed-decks' ? 'deck' : 'promo';
  return `${box.name} · ${deckEntry.name} ${noun} · Box #${seed}`;
}

const CONTENTS_BY_KIND = {
  'fixed-decks': (box) => `one of ${box.decks.length} 40-card decks`,
  'evolution-pack': (box) => `a 23-card Evolution pack (1 of ${box.decks.length} promos)`,
  'evolution-deck': (box) => `a 40-card Evolution deck (1 of ${box.decks.length} promos)`,
};

// Bulbapedia "Build & Battle Box (TCG)": "Beginning with the Lost Origin expansion, Build & Battle
// Boxes are categorized as Play Level 2."
const FIRST_PLAY_LEVEL_BOX = 'lost-origin';

const releaseIndex = (key) => BUILD_BATTLE_BOXES.findIndex((box) => box.key === key);

/** @returns {boolean} whether the box's face carries the "Play level 2" pill. */
export function showsPlayLevel(box) {
  const first = releaseIndex(FIRST_PLAY_LEVEL_BOX);
  const era = box?.era;
  if (first === -1) return era === 'sv' || era === 'me';
  return releaseIndex(box?.key) >= first;
}

/**
 * The printed words of the unboxing scene per box kind (design 054 § Unboxing skin): the tray's
 * deck label, the back of the box, the code card's game and the band under the key art.
 * @returns {{deckLabel: string, backLines: string[], codeCardGame: string, productTitle: string}}
 */
export function unboxingLabels(box, setName = box.shortName) {
  const packsLine = `${box.packCount} ${setName} booster packs`;
  const promoCount = box.decks.length;
  const productTitle = /Prerelease Kit$/.test(box.name) ? 'Prerelease Kit' : 'Build & Battle';
  if (box.kind === 'evolution-pack') {
    return {
      deckLabel: '23-card Evolution pack',
      backLines: [
        `23-card Evolution pack including 1 of ${promoCount} foil promo cards`,
        packsLine,
        'A code card for Pokémon TCG Online',
      ],
      codeCardGame: 'Pokémon TCG Online',
      productTitle,
    };
  }
  if (box.kind === 'evolution-deck') {
    return {
      deckLabel: '40-card Evolution deck',
      backLines: [
        `40-card Evolution deck (23 cards + ${box.energyCount} Basic Energy) including 1 of ${promoCount} foil promo cards`,
        packsLine,
        'A code card for Pokémon TCG Live',
      ],
      codeCardGame: 'Pokémon TCG Live',
      productTitle,
    };
  }
  return {
    deckLabel: '40-card deck',
    backLines: [
      `40-card ready-to-play deck including 1 of ${promoCount} unique foil promo cards`,
      packsLine,
      'A code card for Pokémon TCG Live',
    ],
    codeCardGame: 'Pokémon TCG Live',
    productTitle,
  };
}

/** @returns {string} the sealed box's note: what is inside and what the player builds. */
export function boxContentsLine(box, setName = box.shortName) {
  const contents = CONTENTS_BY_KIND[box.kind]?.(box) || '';
  return (
    `${box.packCount} ${setName} packs and ${contents}. ` +
    'Build a 40-card deck from them; games use 4 Prizes.'
  );
}

function deckCountsById(deck) {
  const counts = new Map();
  for (const group of Object.values(deck || {})) {
    for (const variant of group?.cards || []) {
      const id = variant?.data?.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + (Number(variant.count) || 0));
    }
  }
  return counts;
}

/** @returns {Map<string, number>} pool count minus deck count for every pool card id, never below 0. */
export function poolRemaining(deck, pool = []) {
  const inDeck = deckCountsById(deck);
  return new Map(
    pool.map(({ card, count }) => [card.id, Math.max(0, count - (inDeck.get(card.id) || 0))])
  );
}

/** @returns {string} the status line when the pool has no copy of `card` left. */
export function poolRefusalMessage(card, pool = []) {
  const entry = pool.find((item) => item.card?.id === card?.id);
  if (!entry) return `${card?.name || 'That card'} is not in your pool`;
  return `Only ${entry.count} ${card.name} in your pool`;
}

/**
 * @param {{isValid: boolean, errors: string[]}} result from `validateDeck`
 * @param {string[]} poolErrors from `validatePoolDeck`
 * @returns {object} the same result with the pool errors appended; valid only when both are.
 */
export function withPoolErrors(result, poolErrors = []) {
  if (!poolErrors.length) return result;
  return { ...result, isValid: false, errors: [...(result.errors || []), ...poolErrors] };
}
