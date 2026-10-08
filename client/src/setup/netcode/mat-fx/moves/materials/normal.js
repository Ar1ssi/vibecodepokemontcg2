// Design 065 § New pieces G: the normal material, "pressure light" sampled from Judgment,
// Crush Grip and Multi-Attack (EV). Light, not flame: a body is a sphere from a white core
// (out to 0.35 r) through hot and body to nothing; a tongue is 063's shared tongue drawn in two
// passes, a hot body pass blurred 0.08 w and a crisp core pass at 0.6 scale (no orange pass);
// a projectile is the body inside two thin hot rings at 1.3 r, tilted 60° and turning.
// Spec grain for this material is 0.12 (the recipe's strength; the spec sets it).
import { rgbCss } from '../../fx-colors.mjs';
import { grainPass, parseHex, sphere, tonguePath } from './_shared.js';

const TAU = Math.PI * 2;
const hex = (h) => Object.freeze(parseHex(h));

const NORMAL_PALETTE = Object.freeze({
  deep: hex('#E8552B'),
  body: hex('#F2C230'),
  hot: hex('#FFF5B0'),
  core: hex('#FFFFFF'),
});

/** The normal material drawn in `palette` (any palette with the same keys). */
function normalKit(palette) {
  function glow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgbCss(palette.hot, alpha));
    g.addColorStop(0.5, rgbCss(palette.body, alpha * 0.4));
    g.addColorStop(1, rgbCss(palette.deep, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function body(ctx, x, y, r, alpha, hot = 1) {
    if (!(r > 0) || !(alpha > 0)) return;
    sphere(ctx, x, y, r, [
      [0, palette.core, alpha],
      [0.35, palette.core, alpha * (0.6 + 0.4 * hot)],
      [0.6, palette.hot, alpha * 0.9],
      [0.85, palette.body, alpha * 0.5],
      [1, palette.body, 0],
    ]);
  }

  function tongue(ctx, spec, { alpha = 1, hot = 1 } = {}) {
    if (!(spec.length > 0) || !(spec.width > 0) || !(alpha > 0)) return;
    ctx.filter = `blur(${Math.max(1, spec.width * 0.08).toFixed(1)}px)`;
    ctx.fillStyle = rgbCss(palette.hot, 0.75 * alpha);
    tonguePath(ctx, spec, 1);
    ctx.fill();
    ctx.filter = 'none';
    if (hot > 0) {
      ctx.fillStyle = rgbCss(palette.core, 0.9 * alpha * hot);
      tonguePath(ctx, spec, 0.6);
      ctx.fill();
    }
  }

  function projectile(ctx, { x, y, r, headingDeg, time, seed, alpha = 1, hot = 1 }) {
    if (!(r > 0) || !(alpha > 0)) return;
    glow(ctx, x, y, r * 2.2, 0.35 * alpha);
    body(ctx, x, y, r, alpha, hot);
    ctx.strokeStyle = rgbCss(palette.hot, 0.85 * alpha);
    ctx.lineWidth = Math.max(1, r * 0.06);
    const spin = time * 3 + seed;
    for (const k of [0, 1]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.3, r * 1.3 * Math.abs(Math.cos((60 * Math.PI) / 180)), spin + k * (Math.PI / 2) + (headingDeg * Math.PI) / 180, 0, TAU);
      ctx.stroke();
    }
  }

  return Object.freeze({
    key: 'normal',
    palette,
    shade: Object.freeze([40, 30, 10]),
    smoke: null,
    particle: Object.freeze({ className: 'fx-particle--streak', color: rgbCss([255, 224, 102]), aspect: 0.3 }),
    glow,
    body,
    tongue,
    projectile,
    grain: grainPass,
    withPalette: (p) => normalKit(p),
  });
}

export const normal = normalKit(NORMAL_PALETTE);
