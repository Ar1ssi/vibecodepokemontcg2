import {
  DECK_FORMAT_TCG,
  isDeckFormat,
  normalizeDeckFormat,
} from '../../../../shared/engine/formats.mjs';

/**
 * Design 051: loadDeckData and exchangeData take `format` as the positional argument
 * just before `emit`, because acceptAction replays a peer's action as
 * `fn(user, ...wireParameters, emit)`. A packet from before the format existed has
 * no format on the wire, so its replay puts `emit` (a boolean) in the format slot.
 *
 * @param {unknown} format the value in the format slot
 * @param {boolean} [emit] the value in the emit slot
 * @returns {{ format: 'tcg'|'build-battle', emit: boolean }}
 */
export function resolveFormatAndEmit(format, emit) {
  if (typeof format === 'boolean') return { format: DECK_FORMAT_TCG, emit: format };
  return {
    format: isDeckFormat(format) ? format : DECK_FORMAT_TCG,
    emit: emit === undefined ? true : Boolean(emit),
  };
}

/**
 * I204: which `systemState.deckFormat` slot holds a side's format. The opponent side has
 * two decks, like p1OppDeckData/p2OppDeckData: the solo "alt" deck and a room opponent's,
 * so leaving a room never hands the solo deck the last opponent's format.
 * @param {'self'|'opp'} user
 * @param {boolean} isTwoPlayer
 * @returns {'self'|'p1Opp'|'p2Opp'}
 */
export function deckFormatSlot(user, isTwoPlayer) {
  if (user === 'self') return 'self';
  return isTwoPlayer ? 'p2Opp' : 'p1Opp';
}

/**
 * The format a side's deck deals under right now; unknown or missing reads as Standard.
 * @param {{ deckFormat?: object, isTwoPlayer?: boolean }} state systemState
 * @param {'self'|'opp'} user
 */
export function deckFormatOf(state, user) {
  return normalizeDeckFormat(state?.deckFormat?.[deckFormatSlot(user, Boolean(state?.isTwoPlayer))]);
}
