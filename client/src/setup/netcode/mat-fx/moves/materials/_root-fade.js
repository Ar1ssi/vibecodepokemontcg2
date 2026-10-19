// Design 075 slice 11: the energy kits' tongue paint. Flares, projectiles and spirals fan their
// tongues out of one point; drawn additively, flat tongues stack there into a white disc that the
// bloom turns into a slab. A tongue painted clear at its root and full from `ROOT_FADE` of its
// length on keeps the fan's shape and leaves the meeting point to the body drawn over it.
import { rgbCss } from '../../fx-colors.mjs';

export const ROOT_FADE = 0.22;

/**
 * `rgb` at `alpha` as a gradient along a tongue (`{ x, y, angleDeg, length }`): clear at its
 * root, full from `ROOT_FADE` of its length to its tip.
 */
export function rootFaded(ctx, spec, rgb, alpha) {
  const a = (spec.angleDeg * Math.PI) / 180;
  const g = ctx.createLinearGradient(spec.x, spec.y, spec.x + Math.cos(a) * spec.length, spec.y + Math.sin(a) * spec.length);
  g.addColorStop(0, rgbCss(rgb, 0));
  g.addColorStop(ROOT_FADE, rgbCss(rgb, alpha));
  g.addColorStop(1, rgbCss(rgb, alpha));
  return g;
}
