// Design 075: the rim glow and the heat sheen a move scene puts on the cards it moves, drawn on any
// Canvas2D-like context (the GPU recorder in the 3D board). Colours and gradients are the 2D
// ghosts' CSS (css/mat-fx.css `.fx-move__rim`, `.fx-move__heat`, `.fx-move--m-<material>`),
// extracted as data. A heat the CSS multiplied is drawn as a darkening veil (over blend) and a
// screened one as light (additive): the FX layer composites over the board, so neither CSS
// blend can read the card underneath.

const ICE = Object.freeze({ core: [236, 249, 255], hot: [214, 243, 255], body: [143, 211, 255], deep: [62, 143, 209] });

/** `--fx-move-*` per material; fire's values are the CSS defaults. */
export const GLOW_COLOURS = Object.freeze({
  fire: { hot: [241, 175, 13], body: [235, 108, 6], deep: [210, 41, 8], core: [255, 246, 214] },
  normal: { hot: [255, 245, 176], body: [242, 194, 48], deep: [232, 85, 43], core: [255, 255, 255] },
  stellar: { hot: [95, 242, 224], body: [47, 184, 255], deep: [15, 42, 85], core: [230, 255, 255] },
  water: { hot: [185, 232, 255], body: [82, 180, 255], deep: [46, 124, 230], core: [228, 247, 255] },
  grass: { hot: [201, 242, 122], body: [126, 217, 87], deep: [63, 163, 77], core: [233, 250, 196] },
  petal: { hot: [231, 184, 247], body: [247, 112, 208], deep: [196, 46, 150], core: [255, 236, 250] },
  solar: { hot: [255, 248, 176], body: [242, 233, 107], deep: [63, 163, 77], core: [255, 252, 228] },
  electric: { hot: [247, 210, 30], body: [159, 213, 255], deep: [185, 138, 0], core: [255, 242, 122] },
  fighting: { hot: [242, 166, 107], body: [217, 100, 58], deep: [140, 58, 31], core: [255, 230, 194] },
  aura: { hot: [184, 216, 255], body: [127, 183, 255], deep: [47, 95, 184], core: [230, 242, 255] },
  psychic: { hot: [240, 165, 255], body: [200, 92, 219], deep: [91, 30, 122], core: [255, 225, 255] },
  dark: { hot: [255, 61, 110], body: [110, 110, 140], deep: [16, 16, 24], core: [185, 185, 214], shadow: [59, 59, 79] },
  steel: { hot: [213, 222, 234], body: [159, 197, 240], deep: [74, 85, 99], core: [236, 242, 250] },
  dragon: { hot: [143, 124, 245], body: [90, 71, 201], deep: [42, 31, 107], core: [210, 200, 255] },
  fairy: { hot: [255, 194, 218], body: [244, 143, 177], deep: [184, 58, 114], core: [255, 240, 247] },
  ghost: { hot: [157, 124, 242], body: [107, 79, 168], deep: [30, 18, 56], core: [217, 204, 255] },
  poison: { hot: [199, 125, 255], body: [155, 77, 202], deep: [75, 30, 107], core: [240, 214, 255] },
  ground: { hot: [217, 160, 102], body: [181, 121, 60], deep: [92, 58, 23], core: [240, 217, 181] },
  mud: { hot: [181, 121, 60], body: [138, 96, 52], deep: [72, 46, 20], core: [217, 160, 102] },
  rock: { hot: [184, 190, 201], body: [138, 143, 153], deep: [62, 67, 76], core: [232, 236, 242] },
  ancient: { hot: [196, 112, 232], body: [138, 143, 153], deep: [62, 67, 76], core: [240, 214, 255] },
  gem: { hot: [226, 224, 255], body: [186, 180, 240], deep: [110, 100, 170], core: [248, 247, 255] },
  flying: { hot: [234, 243, 255], body: [143, 179, 217], deep: [143, 179, 217], core: [207, 227, 247] },
  ice: { ...ICE },
  aurora: { ...ICE, body: [200, 180, 255] },
  bug: { hot: [191, 227, 77], body: [140, 191, 38], deep: [74, 107, 16], core: [240, 247, 176] },
  buzz: { hot: [191, 227, 77], body: [140, 191, 38], deep: [74, 107, 16], core: [240, 247, 176] },
  silver: { hot: [232, 238, 242], body: [124, 138, 150], deep: [124, 138, 150], core: [200, 210, 218] },
});

// Design 075 parity pass: the light sheens' near-white core read as a white slab over the struck card
// in the 3D board (additive, then bloom); the hit colour now leads and the core stays a tint.
const SCREEN_DEFAULT = { cy: 0.4, stops: [[0, 'core', 0.35], [0.18, 'hot', 0.4], [0.48, 'hot', 0.35], [1, 'deep', 0.25]], blend: 'light' };
const SHEEN = { cy: 0.45, stops: [[0, 'core', 0.3], [0.22, 'body', 0.35], [0.6, 'body', 0.3], [1, 'deep', 0.2]], blend: 'light' };

/** The heat gradient per material (ellipse centre `cy` of the card height, CSS stops, blend). */
export const HEAT_VARIANTS = Object.freeze({
  default: SCREEN_DEFAULT,
  dark: { cy: 0.45, stops: [[0, 'shadow', 0.8], [0.28, 'shadow', 0.8], [0.62, 'body', 0.55], [1, 'hot', 0.45]], blend: 'shade' },
  ghost: { cy: 0.45, stops: [[0, 'deep', 0.85], [0.3, 'deep', 0.85], [0.65, 'body', 0.6], [1, 'hot', 0.45]], blend: 'shade' },
  poison: { cy: 0.55, stops: [[0, 'hot', 0.7], [0.24, 'hot', 0.7], [0.6, 'body', 0.6], [1, 'deep', 0.45]], blend: 'light' },
  mud: { cy: 0.6, stops: [[0, 'body', 0.75], [0.26, 'body', 0.75], [0.62, 'hot', 0.55], [1, 'core', 0.35]], blend: 'shade' },
  flying: SHEEN,
  silver: SHEEN,
  ice: { ...SCREEN_DEFAULT, colours: ICE },
  aurora: { ...SCREEN_DEFAULT, colours: ICE },
  cold: { ...SCREEN_DEFAULT, colours: ICE },
});

const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
const coloursOf = (materialKey) => GLOW_COLOURS[materialKey] ?? GLOW_COLOURS.fire;

const hexRgb = (hex) => {
  const n = Number.parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** A material's glow colours with a spec `tint` ('#RRGGBB' per palette key) laid over them. */
export function tintedGlow(materialKey, tint) {
  const base = coloursOf(materialKey);
  if (!tint) return base;
  const out = { ...base };
  for (const [key, hex] of Object.entries(tint)) out[key] = hexRgb(hex);
  return out;
}

/** The card's corner radius in its own px (CSS .3rem on a ~126 px card). */
const radiusOf = (w, h) => Math.min(w, h) * 0.04;

const roundedRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
};

/**
 * The rim: the two CSS box-shadows (10 px blur 2 px spread in hot, 28 px blur 8 px spread in body)
 * as blurred rounded rects grown past the card. Call it with the card's transform set (centre at
 * 0, 0); it is meant for a layer the card hides, so only the outside shows, as a box-shadow.
 * Filled, not stroked: a stroke wider than the corner radius folds its inner edge into spokes on
 * the GPU recorder.
 */
export function drawRim(ctx, { width, height, alpha, material, colours = null }) {
  if (!(alpha > 0) || !(width > 0) || !(height > 0)) return;
  const c = colours ?? coloursOf(material);
  const r = radiusOf(width, height);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [key, blur, spread, a] of [
    ['body', 28, 8, 0.55],
    ['hot', 10, 2, 0.85],
  ]) {
    const grow = spread + blur / 4;
    ctx.filter = `blur(${blur / 2}px)`;
    ctx.fillStyle = rgba(c[key], a * alpha);
    roundedRect(ctx, -width / 2 - grow, -height / 2 - grow, width + grow * 2, height + grow * 2, r + grow);
    ctx.fill();
  }
  ctx.filter = 'none';
  ctx.restore();
}

/**
 * The heat sheen over the card face: the CSS radial-gradient (an ellipse at 50 % / cy, reaching
 * the farthest side × √2 as CSS's farthest-corner ellipse) clipped to the card. `cold` = the ice
 * sheen of a frozen defender.
 */
export function drawHeat(ctx, { width, height, alpha, material, cold = false, colours: tinted = null }) {
  if (!(alpha > 0) || !(width > 0) || !(height > 0)) return;
  const variant = cold ? HEAT_VARIANTS.cold : HEAT_VARIANTS[material] ?? HEAT_VARIANTS.default;
  const colours = (cold ? null : tinted) ?? variant.colours ?? coloursOf(material);
  const cx = 0;
  const cy = -height / 2 + height * variant.cy;
  const rx = (width / 2) * Math.SQRT2;
  const ry = Math.max(height * variant.cy, height * (1 - variant.cy)) * Math.SQRT2;
  ctx.save();
  ctx.globalCompositeOperation = variant.blend === 'light' ? 'lighter' : 'source-over';
  roundedRect(ctx, -width / 2, -height / 2, width, height, radiusOf(width, height));
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, key, a] of variant.stops) g.addColorStop(offset, rgba(colours[key] ?? colours.hot, a * alpha));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
