/**
 * @file Sends printed card data (hp, attacks, weakness, ...) to the authoritative server.
 *
 * Design 002 I26: `loadDeck`'s deck rows carry identity only —
 * [quantity, name, type, imageURL, number, set, tcgId] — so every server-side card was
 * created with `hp: null` and `attacks: []`. The server therefore could not adjudicate a
 * knockout (`koHp > 0` was never true) and fell back to a flat 10 damage for every attack.
 * The client resolves this data from TCGdex asynchronously (`ensureCardData`), so it cannot
 * ride along with the deck load and is sent separately once resolved.
 *
 * Kept free of `state.js` so it stays Node-importable: socket and roomId are injected.
 */

import { emitCmd } from './cmd-emitter.js';

// Exactly the fields the server's own reducers read: hp for the KO check
// (reduce.mjs 'attack'), attacks for damage/name, types+weakness+resistance for
// computeAttackDamage, retreatCost for getRetreatCostCount, stage for evolution legality.
function extractStats(card) {
  const stats = { syncInstance: card.syncInstance };
  let hasAny = false;

  if (card.hp != null && card.hp !== '') {
    const hp = Number(card.hp);
    if (Number.isFinite(hp) && hp > 0) {
      stats.hp = hp;
      hasAny = true;
    }
  }
  if (Array.isArray(card.attacks) && card.attacks.length > 0) {
    stats.attacks = card.attacks.map((attack) => ({
      name: attack?.name ?? '',
      // Damage is a printed string ('10', '30+', ''); the server's computeAttackDamage
      // coerces it, so it is passed through unchanged rather than parsed here.
      damage: attack?.damage ?? 0,
      text: attack?.text ?? '',
      ...(attack?.cost ? { cost: attack.cost } : {}),
    }));
    hasAny = true;
  }
  if (Array.isArray(card.types) && card.types.length > 0) {
    stats.types = [...card.types];
    hasAny = true;
  }
  if (card.weakness !== undefined && card.weakness !== null) {
    stats.weakness = card.weakness;
    hasAny = true;
  }
  if (card.resistance !== undefined && card.resistance !== null) {
    stats.resistance = card.resistance;
    hasAny = true;
  }
  if (Array.isArray(card.retreatCost) && card.retreatCost.length > 0) {
    stats.retreatCost = [...card.retreatCost];
    hasAny = true;
  }
  if (card.stage) {
    stats.stage = card.stage;
    hasAny = true;
  }

  return hasAny ? stats : null;
}

/**
 * Builds the `cardStats` command payload from client-side Card objects.
 *
 * Cards with no resolved data are omitted rather than sent as empty entries, so an
 * unenriched deck produces no command at all instead of a no-op round trip.
 *
 * @param {Array<object>} cards Client Card objects (must carry `syncInstance`)
 * @returns {{ stats: Array<object> }}
 */
export function buildCardStatsPayload(cards = []) {
  const stats = [];
  for (const card of cards) {
    if (!card || !Number.isInteger(card.syncInstance) || card.syncInstance < 0) continue;
    const entry = extractStats(card);
    if (entry) stats.push(entry);
  }
  return { stats };
}

/**
 * Emits the player's resolved card data to the server. No-op when nothing resolved.
 *
 * @param {object} options
 * @param {object} options.socket
 * @param {string} options.roomId
 * @param {Array<object>} options.cards
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function emitCardStats({ socket, roomId, cards = [] } = {}) {
  const payload = buildCardStatsPayload(cards);
  if (payload.stats.length === 0) {
    return { success: false, error: 'no_resolved_card_data' };
  }
  return emitCmd({ socket, roomId, type: 'cardStats', payload });
}
