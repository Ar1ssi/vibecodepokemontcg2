// Design 074 D3: select-to-move and attach mode for server-drawn cards. The legacy keybind
// path finds the selected card and the attach candidates in the legacy zone arrays, which a
// server-authoritative game never fills; this plans the same choices over the authoritative
// card registry (apply-view.js `getCardRegistry`). DOM-free.

const PLAY_ZONES = new Set(['active', 'bench']);

/** The registry's side for a `mouseClick.cardUser`: your own seat, or (solo) the far one. */
export const registrySideOf = (cardUser) => (cardUser === 'opp' ? 'them' : 'you');

/**
 * Attach-mode targets (`e`/`q`): the Pokémon in play on the card owner's side — each stack's
 * root, never an attached card (legacy: `!card.image.attached`).
 * @param {Iterable<{ instanceId: number, side: string, zone: string, card?: { attachedTo?: number|null } }>} records
 * @param {{ cardUser: 'self'|'opp' }} options
 * @returns {number[]}
 */
export function attachCandidateIds(records, { cardUser }) {
  const side = registrySideOf(cardUser);
  const ids = [];
  for (const record of records ?? []) {
    if (!record || record.side !== side || !PLAY_ZONES.has(record.zone)) continue;
    if (record.card?.attachedTo != null) continue;
    ids.push(record.instanceId);
  }
  return ids;
}

/**
 * Whether attach mode may start from the selected card (legacy keybinds.js: a card outside
 * the Active/Bench, or one attached to a Pokémon there).
 * @param {{ zone: string, card?: { attachedTo?: number|null } }|null} record
 */
export const canStartAttach = (record) =>
  Boolean(record) && (!PLAY_ZONES.has(record.zone) || record.card?.attachedTo != null);
