import { DECK_FORMAT_TCG, isDeckFormat } from '../../../../shared/engine/formats.mjs';

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
