/**
 * Live-style deck counter model.
 *
 * Pokémon TCG Live puts a prominent "x / 60" readout above the deck list with
 * a fill bar that only turns green at a legal deck. This module turns a
 * validation result into everything that readout needs, with no DOM in sight.
 */

export const DECK_COUNTER_STATES = {
  EMPTY: 'empty',
  BUILDING: 'building',
  COMPLETE: 'complete',
  OVER: 'over',
};

const DEFAULT_REQUIRED = 60;

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * @param {{totalCards?: number, requiredCards?: number, isValid?: boolean, errors?: string[], formatName?: string}} validation
 * @returns {{total: number, required: number, remaining: number, over: number,
 *   percent: number, state: string, label: string, detail: string, isLegal: boolean}}
 */
export function getDeckCounterModel(validation = {}) {
  const total = toCount(validation.totalCards);
  const required = toCount(validation.requiredCards) || DEFAULT_REQUIRED;

  const remaining = Math.max(0, required - total);
  const over = Math.max(0, total - required);

  // The bar fills to 100% and stops; an over-full deck is signalled by colour
  // and by the "+n over" detail, not by a bar that runs off the end.
  const percent =
    required === 0 ? 0 : Math.min(100, Math.round((total / required) * 100));

  let state;
  if (total === 0) state = DECK_COUNTER_STATES.EMPTY;
  else if (over > 0) state = DECK_COUNTER_STATES.OVER;
  else if (total === required) state = DECK_COUNTER_STATES.COMPLETE;
  else state = DECK_COUNTER_STATES.BUILDING;

  return {
    total,
    required,
    remaining,
    over,
    percent,
    state,
    label: `${total} / ${required}`,
    // A deck can be the right size and still illegal (too many copies, no
    // Basic). The counter shows size; the detail line carries the reason.
    detail: getCounterDetail({ state, remaining, over, validation }),
    // Green only when the deck is both the right size AND passes validation.
    isLegal: Boolean(validation.isValid),
  };
}

function getCounterDetail({ state, remaining, over, validation }) {
  if (state === DECK_COUNTER_STATES.EMPTY) return 'Add cards to start building';
  if (state === DECK_COUNTER_STATES.OVER) {
    return `${over} card${over === 1 ? '' : 's'} over the limit`;
  }
  if (state === DECK_COUNTER_STATES.BUILDING) {
    return `${remaining} card${remaining === 1 ? '' : 's'} to go`;
  }

  // Right size — either legal, or blocked by a rule other than deck size.
  if (validation.isValid)
    return `Legal ${validation.formatName || ''} deck`.trim();

  const blocking = (validation.errors || []).filter(
    (error) => !/must contain exactly/i.test(String(error))
  );
  return blocking[0] || 'Deck is not legal';
}
