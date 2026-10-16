/**
 * @file The state half of the board flip (flip-board.js does the DOM half).
 *
 * `systemState.initiator` names the side drawn at the bottom; a flip of the iframe board
 * swaps it with the iframes. A solo room (design 074 D7) never swaps the iframes: its
 * bottom is always 'self', and the flip changes which seat 'self' stands for, so the
 * server's next view draws the other seat at the bottom.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

import { farSeat } from '../../setup/netcode/solo-seat.mjs';

/**
 * Applies one flip to `systemState` and says what the DOM side must do.
 *
 * @param {{ solo?: boolean, nearSeat?: 'p1'|'p2', initiator?: 'self'|'opp',
 *   p2SelfUsername?: string, p2OppUsername?: string }} systemState
 * @returns {{ swapIframes: true } | { swapIframes: false, requestNearSeat: 'p1'|'p2' }}
 */
export function applyBoardFlip(systemState) {
  if (systemState.solo) {
    systemState.nearSeat = farSeat(systemState.nearSeat);
    // The names follow their seats: 'self' is now the other seat.
    [systemState.p2SelfUsername, systemState.p2OppUsername] = [
      systemState.p2OppUsername,
      systemState.p2SelfUsername,
    ];
    return { swapIframes: false, requestNearSeat: systemState.nearSeat };
  }
  systemState.initiator = systemState.initiator === 'opp' ? 'self' : 'opp';
  return { swapIframes: true };
}
