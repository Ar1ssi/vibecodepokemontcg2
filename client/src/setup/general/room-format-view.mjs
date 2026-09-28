/**
 * @file What the room's format panel shows (design 053). Pure.
 * Both seated players must agree: one proposes Standard or Build & Battle, the other accepts or
 * proposes the other format instead.
 */

import {
  DECK_FORMAT_BUILD_BATTLE,
  DECK_FORMAT_TCG,
  formatLabel,
  isDeckFormat,
} from '../../../../shared/engine/formats.mjs';

const SHORT_NAMES = Object.freeze({
  [DECK_FORMAT_TCG]: 'Standard',
  [DECK_FORMAT_BUILD_BATTLE]: 'Build & Battle',
});

const otherFormat = (format) =>
  format === DECK_FORMAT_BUILD_BATTLE ? DECK_FORMAT_TCG : DECK_FORMAT_BUILD_BATTLE;

const proposeButton = (format, label) => ({
  id: `propose-${format}`,
  label,
  action: { type: 'propose', format },
});

const HIDDEN = Object.freeze({ mode: 'hidden', text: '', buttons: [] });

/**
 * @param {object} input
 * @param {string|null} input.format the agreed format, or null
 * @param {{ format: string, by: string }|null} input.proposal
 * @param {string[]} input.seated usernames of the two seats
 * @param {string} input.self this client's username
 * @param {boolean} [input.spectator]
 * @param {boolean} [input.dealt] cards are on the table: the format is fixed
 * @returns {{ mode: 'hidden'|'pick'|'waiting'|'answer'|'agreed', text: string,
 *   buttons: { id: string, label: string, action?: object }[] }}
 */
export function roomFormatView({ format, proposal, seated = [], self, spectator = false, dealt = false }) {
  if (seated.length < 2) return HIDDEN;
  const agreed = isDeckFormat(format) ? format : null;
  const live = proposal && isDeckFormat(proposal.format) ? proposal : null;

  if (spectator || dealt || !seated.includes(self)) {
    return agreed ? { mode: 'agreed', text: `Format: ${formatLabel(agreed)}`, buttons: [] } : HIDDEN;
  }

  if (live && live.by === self) {
    const opponent = seated.find((name) => name !== self) || 'your opponent';
    return {
      mode: 'waiting',
      text: `You proposed ${formatLabel(live.format)}. Waiting for ${opponent} to accept.`,
      buttons: [{ id: 'withdraw', label: 'Withdraw', action: { type: 'cancel' } }],
    };
  }

  if (live) {
    const counter = otherFormat(live.format);
    const keeping = counter === agreed;
    return {
      mode: 'answer',
      text: keeping
        ? `${live.by} proposes switching from ${formatLabel(agreed)} to ${formatLabel(live.format)}.`
        : `${live.by} proposes ${formatLabel(live.format)}.`,
      buttons: [
        { id: 'accept', label: 'Accept', action: { type: 'accept', format: live.format } },
        proposeButton(counter, keeping ? `Keep ${SHORT_NAMES[counter]}` : `Play ${SHORT_NAMES[counter]} instead`),
      ],
    };
  }

  if (agreed) {
    const buttons =
      agreed === DECK_FORMAT_BUILD_BATTLE ? [{ id: 'open-box', label: 'Open your box' }] : [];
    buttons.push(proposeButton(otherFormat(agreed), `Switch to ${SHORT_NAMES[otherFormat(agreed)]}`));
    return { mode: 'agreed', text: `Format: ${formatLabel(agreed)}`, buttons };
  }

  return {
    mode: 'pick',
    text: 'Both players are here. Choose the format for this match:',
    buttons: [
      proposeButton(DECK_FORMAT_TCG, formatLabel(DECK_FORMAT_TCG)),
      proposeButton(DECK_FORMAT_BUILD_BATTLE, formatLabel(DECK_FORMAT_BUILD_BATTLE)),
    ],
  };
}
