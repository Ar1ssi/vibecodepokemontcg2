/**
 * @file Card focus on the 3D board (design 074 H2): the lifted card is the card's own mesh. Pure
 * and DOM-free: the pose the mesh is lifted to, the eases that match the HTML flight it replaces,
 * and the check for whether a card has a mesh to lift.
 */
import { DEFAULT_TILT_DEG } from '../sizing/table-tilt.mjs';
import { FLIGHT_EASE } from './card-focus-geometry.mjs';

/** The lifted card rides this share of its on-screen height above the cloth, clear of every card. */
export const FOCUS_LIFT_FRAC = 0.3;

const BEZIER_ITERATIONS = 24;

/** CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress (what an Animation's easing does). */
export const cubicBezierEase = (x1, y1, x2, y2) => {
  const axis = (a, b, s) => 3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s ** 2 + s ** 3;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let low = 0;
    let high = 1;
    for (let i = 0; i < BEZIER_ITERATIONS; i += 1) {
      const mid = (low + high) / 2;
      if (axis(x1, x2, mid) < t) low = mid;
      else high = mid;
    }
    return axis(y1, y2, (low + high) / 2);
  };
};

/** `cubic-bezier(...)` text as an ease function; null when it is not one. */
export const easeFromCss = (css) => {
  const match = /^cubic-bezier\(\s*([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(String(css).trim());
  if (!match) return null;
  const values = match.slice(1).map(Number);
  return values.every(Number.isFinite) ? cubicBezierEase(...values) : null;
};

/** The flight's own curve (card-focus-geometry FLIGHT_EASE), from the board to the focus pose. */
export const flightEase = easeFromCss(FLIGHT_EASE) ?? ((t) => t);

/**
 * The flight played backward from `fromT` (share of its time already flown), as `Animation.reverse()`
 * does: the card walks back along the same curve, from where it is to the start.
 */
export const reversed = (ease, fromT = 1) => {
  const flown = ease(fromT);
  return (t) => (flown > 0 ? 1 - ease(fromT * (1 - t)) / flown : 1);
};

/**
 * The camera tilt the scene's board is drawn with (a card square-on to the screen leans back by it).
 * @param {{ inspect?: () => { cameraDesc?: { tiltDeg?: number }|null } }|null} scene
 */
export const sceneTiltDeg = (scene) => {
  const tilt = scene?.inspect?.().cameraDesc?.tiltDeg;
  return Number.isFinite(tilt) ? tilt : DEFAULT_TILT_DEG;
};

/**
 * Where `scene.lift` holds the focus card: its front face covers `rect` square-on to the screen
 * (the HTML card it replaces was flat to the screen), at a height that clears the board.
 * @param {{ left: number, top: number, width: number, height: number }} rect the focus rect
 */
export const focusMeshPose = (rect, scene) => ({
  rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
  tiltXDeg: -sceneTiltDeg(scene) || 0,
  lift: FOCUS_LIFT_FRAC * rect.height,
});

/**
 * The instance id of the mesh that can stand for `sourceImg`'s card in the focus, or null when the
 * 3D board does not draw it (no scene, no camera, no id, no pose): the focus then keeps its HTML card.
 */
export const focusMeshId = (scene, sourceImg) => {
  const raw = sourceImg?.dataset?.instanceId;
  const id = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
  if (!scene || !Number.isInteger(id)) return null;
  const view = scene.inspect?.();
  return view?.cameraDesc && view.cards?.placed(id) ? id : null;
};
