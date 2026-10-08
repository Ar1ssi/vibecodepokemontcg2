// The idle loop a Pokémon wears while it holds a special condition: TCG Live's
// status textures (poison globs, flames, Zs, zaps, a dizzy ring) on an overlay
// beside the card in its zone, reconciled from the view by apply-view.js like
// the condition markers. Pure: which conditions show and where the box goes.
// The DOM twin is status-loop.js; the motion is CSS (status-marker.css).
import { listConditions } from '../../../../../shared/engine/rules/special-conditions.mjs';
import { STATUS_CONDITION_KEYS } from './sfx-cues.mjs';

/** The card <img> property holding its loop overlay (beside the marker slots). */
export const STATUS_LOOP_SLOT = 'statusLoop';

/**
 * Parts per condition. `card` parts hug the card and turn with it (a sideways
 * Asleep card keeps its glow on its edges); `sky` parts sit in the card's
 * footprint kept screen-upright, so flames and Zs rise up the screen on both seats.
 */
export const STATUS_LOOP_PARTS = Object.freeze({
  poison: { card: ['glow'], sky: ['glob', 'glob'] },
  burn: { card: ['singed', 'edge'], sky: ['flame', 'flame'] },
  sleep: { card: [], sky: ['z', 'z', 'z'] },
  paralyze: { card: ['zap'], sky: [] },
  confusion: { card: ['glow'], sky: ['ring'] },
});

/** Loop keys for the conditions a card holds, in Checkup order (Poison, Burn, rotation). */
export const statusLoopKeys = (card) =>
  listConditions(card)
    .map((condition) => STATUS_CONDITION_KEYS[condition])
    .filter(Boolean);

/**
 * Where the loop overlay goes in its zone. `rect` is the card's measured
 * (rotated) bounding box and `zoneRect` the zone's; the box is the card's
 * footprint, and the card itself is the footprint with its sides swapped back
 * when it lies on a quarter turn.
 *
 * @returns {{left:number, top:number, width:number, height:number,
 *            cardWidth:number, cardHeight:number, rotation:number}|null}
 *   null when the card has no measurable size.
 */
export function statusLoopBox({ rect, zoneRect, rotation }) {
  if (!(rect?.width > 0) || !(rect?.height > 0)) return null;
  const degrees = Number(rotation) || 0;
  const sideways = Math.abs(Math.round(degrees / 90)) % 2 === 1;
  return {
    left: rect.left - (zoneRect?.left ?? 0),
    top: rect.top - (zoneRect?.top ?? 0),
    width: rect.width,
    height: rect.height,
    cardWidth: sideways ? rect.height : rect.width,
    cardHeight: sideways ? rect.width : rect.height,
    rotation: degrees,
  };
}
