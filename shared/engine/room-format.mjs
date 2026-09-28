/**
 * @file The format both seated players agree on for a room (design 053). Pure.
 * One player proposes Standard or Build & Battle; the other accepts it or proposes the other
 * format instead. The agreed format lives beside the game, never in engine state, so undo
 * replay and rematches are untouched. The deal then requires every deck to be that format.
 */

import { isDeckFormat } from './formats.mjs';

/** @typedef {{ format: string|null, proposal: { format: string, by: string }|null }} RoomFormatState */

/** @returns {RoomFormatState} a room with nothing proposed or agreed */
export function emptyRoomFormat() {
  return { format: null, proposal: null };
}

const refuse = (state, reason) => ({ ok: false, state, reason });
const accept = (state) => ({ ok: true, state, reason: null });

/**
 * Applies one player's propose / accept / cancel.
 * @param {RoomFormatState} state
 * @param {{ type: 'propose'|'accept'|'cancel', format?: string, username: string,
 *   seated: string[], dealt?: boolean }} action
 * @returns {{ ok: boolean, state: RoomFormatState, reason: string|null }}
 */
export function applyRoomFormatAction(state, action) {
  const current = state || emptyRoomFormat();
  const { type, format, username, seated = [], dealt = false } = action || {};
  if (!username || !seated.includes(username)) return refuse(current, 'not_seated');
  if (dealt) return refuse(current, 'already_dealt');

  if (type === 'propose') {
    if (!isDeckFormat(format)) return refuse(current, 'invalid_format');
    if (!current.proposal && current.format === format) return refuse(current, 'already_agreed');
    return accept({ format: current.format, proposal: { format, by: username } });
  }

  if (type === 'accept') {
    if (!current.proposal) return refuse(current, 'no_proposal');
    if (current.proposal.by === username) return refuse(current, 'own_proposal');
    if (current.proposal.format !== format) return refuse(current, 'stale_proposal');
    return accept({ format: current.proposal.format, proposal: null });
  }

  if (type === 'cancel') {
    if (!current.proposal) return refuse(current, 'no_proposal');
    if (current.proposal.by !== username) return refuse(current, 'own_proposal');
    return accept({ format: current.format, proposal: null });
  }

  return refuse(current, 'invalid_action');
}

/** A player left: a proposal waiting on them (or theirs) lapses; an agreed format stays. */
export function clearRoomFormatProposal(state) {
  const current = state || emptyRoomFormat();
  return { format: current.format, proposal: null };
}
