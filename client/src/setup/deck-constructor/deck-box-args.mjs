import { resolveFormatAndEmit } from './deck-format-args.mjs';

/** A deck box id as boxes.json writes it; anything else on the wire reads as the default box. */
const DECK_BOX_ID = /^[A-Za-z0-9_.-]{1,128}$/;

/** @returns {string|null} */
export const sanitizeDeckBoxId = (value) => (typeof value === 'string' && DECK_BOX_ID.test(value) ? value : null);

/**
 * Design 073: exchangeData and loadDeckData carry the sender's deck box id right after `format`,
 * so a replay is `fn(user, ...params, format, deckBoxId, emit)`. A packet from before 073 has no box
 * slot, so its replay puts `emit` (a boolean) there; one from before 051 has no format either and
 * puts `emit` in the format slot (deck-format-args.mjs). A local call may stop after `format`.
 *
 * @param {unknown} format the value in the format slot
 * @param {unknown} deckBoxArg the value in the deck box slot
 * @param {unknown} emitArg the value in the emit slot
 * @returns {{ format: 'tcg'|'build-battle', deckBoxId: string|null|undefined, emit: boolean }}
 *   `deckBoxId` is undefined when the packet does not carry one.
 */
export function resolveDeckPacketTail(format, deckBoxArg, emitArg) {
  if (typeof format === 'boolean') {
    return { ...resolveFormatAndEmit(format), deckBoxId: undefined };
  }
  if (typeof deckBoxArg === 'boolean') {
    return { ...resolveFormatAndEmit(format, deckBoxArg), deckBoxId: undefined };
  }
  return {
    ...resolveFormatAndEmit(format, emitArg),
    deckBoxId: deckBoxArg === undefined ? undefined : sanitizeDeckBoxId(deckBoxArg),
  };
}
