// Design 045: the prize fan's fly-up and drop-back on design 042's arc. A
// fan sleeve sits on its slot; this track starts it on the prize card it
// stands for (turned like that board) and flies it up, or the reverse.
// DOM-free; prize-take-prompt.js turns it into WAAPI keyframes.
import { flightPose, planFlight } from './card-flight.mjs';

export const FAN_UP_MS = 520;
export const FAN_BACK_MS = 420;

const usable = (r) => Boolean(r) && r.width >= 2 && r.height >= 2;
const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * @param {{from: object|null, to: object, fromTurn?: number, reverse?: boolean, seed?: number}} opts -
 *   `from` is the prize card's rect, `to` the fan slot (the host's own rect), both viewport px
 * @returns {(u: number) => {x, y, rotate, tiltX, scale, opacity}} px from the slot's centre;
 *   `reverse` flies from the slot back onto the prize card
 */
export function fanFlightPose({ from, to, fromTurn = 0, reverse = false, seed = 1 }) {
  const slot = rectCenter(to);
  const prize = usable(from)
    ? {
        x: rectCenter(from).x - slot.x,
        y: rectCenter(from).y - slot.y,
        rotate: fromTurn,
        tiltX: 0,
        scale: from.width / to.width,
      }
    : { x: 0, y: to.height * 0.8, rotate: 0, tiltX: 0, scale: 0.5 };
  const seat = { x: 0, y: 0, rotate: 0, tiltX: 0, scale: 1 };
  const flight = planFlight(reverse ? { start: seat, end: prize, seed } : { start: prize, end: seat, seed });
  return (u) => ({ ...flightPose(u, flight), opacity: 1 });
}
