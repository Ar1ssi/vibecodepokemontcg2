// Design 066: draws the ops evolve-scene.mjs / devolve-scene.mjs compute onto
// a playCanvasStage canvas. Textures are the extract's, re-encoded so their
// alpha carries the value the shader read (design 066 Deviations). Everything
// is drawn additively ('lighter'); the overlay host screens the canvas onto the
// board. A texture that has not loaded (or failed to) skips its ops.
import { fillDissolve, fillFrame, fillPolar, resampleRail } from './tcgl-fx.mjs';

const BASE_URL = '/src/assets/fx/evolution/';
const TEXTURE_FILES = {
  squareRounded: 'TEX_VFX_Square_Rounded_Blur',
  tileCell: 'TEX_VFX_Tile_Cell_Soft',
  diamondSwirl: 'TEX_VFX_Diamond_Swirl',
  cloudRound: 'TEX_VFX_Cloud_Round02_A',
  renderClouds: 'TEX_VFX_RenderClouds_Minimize',
  glowSquare: 'TEX_VFX_Glow_Square',
  tileClouds: 'TEX_VFX_Tile_Clouds_Soft',
  streaks: 'TEX_VFX_Streaks',
  gradRadial: 'TEX_VFX_Gradient_Radial',
  debrisGlow: 'TEX_VFX_Debris_Glow',
  gradBeamH: 'TEX_VFX_Gradient_Beam_Horizontal',
  lightRay: 'TEX_VFX_LightRay_Prismatic',
  lightShaft: 'TEX_VFX_LightShaft_Prismatic',
  raysPrismatic: 'TEX_VFX_Rays_Prismatic02_1x4',
  victoryRays: 'T_VFX_Victory_Rays_Prismatic_1x4',
  starsSubUV: 'TEX_VFX_Stars_SubUV_1x2',
  starVariants: 'TEX_VFX_Star_Variants_SubUV_2x2_Blur',
  spectrumRing: 'TEX_VFX_Spectrum_Ring',
  radialLine: 'TEX_VFX_Radial_Line_Circle',
  prismaticVert: 'TEX_VFX_Prismatic_Vert',
  evoMask: 'T_VFX_Evolution_Mask',
  spectrumLight: 'TEX_VFX_Spectrum_Light',
  tileCloudStar: 'TEX_VFX_Tile_Cloud_Soft_Star',
  gradHorizontalC: 'TEX_VFX_Gradient_Horizontal_C',
  cardSharp: 'TEX_VFX_Card_Sharp',
  prismaticBlurry: 'TEX_VFX_Prismatic_Blurry_Tile',
  galaxyBeam2: 'T_VFX_Evolution_Galaxy_Beam2',
  wavyBeam: 'T_VFX_Evolution_Gradient_Wavy_Beam',
  sparkleDebris: 'TEX_VFX_Sparkle_Star_Debris',
  flake: 'TEX_VFX_flake_glow02',
  ripple: 'T_VFX_Evolution_Ripple',
};

const textures = new Map();

const readPixels = (img) => {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
};

function loadTexture(name) {
  const entry = { img: null, field: null, pixels: null, ready: false };
  textures.set(name, entry);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const pixels = readPixels(img);
    if (!pixels) return;
    const alpha = new Uint8Array(pixels.width * pixels.height);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = pixels.data[i * 4 + 3];
    Object.assign(entry, { img, pixels, field: { w: pixels.width, h: pixels.height, data: alpha }, ready: true });
  };
  img.src = `${BASE_URL}${TEXTURE_FILES[name]}.webp`;
}

/** Start loading every scene texture (idempotent; the first evolution should not miss them). */
export function preloadTcglTextures() {
  if (typeof Image !== 'function') return;
  for (const name of Object.keys(TEXTURE_FILES)) if (!textures.has(name)) loadTexture(name);
}

const textureOf = (name) => {
  const entry = textures.get(name);
  return entry?.ready ? entry : null;
};

/** n colour stops across a texture row at `v` (or down the column at `v` as u), rgb 0–1 with the texel's alpha. */
function rowStops(entry, v, n = 7, column = false) {
  const { pixels } = entry;
  const fixed = (size) => Math.min(size - 1, Math.max(0, Math.round(v * (size - 1))));
  return Array.from({ length: n }, (_, i) => {
    const step = (size) => Math.round((i / (n - 1)) * (size - 1));
    const x = column ? fixed(pixels.width) : step(pixels.width);
    const y = column ? step(pixels.height) : fixed(pixels.height);
    const k = (y * pixels.width + x) * 4;
    return { at: i / (n - 1), rgb: [pixels.data[k] / 255, pixels.data[k + 1] / 255, pixels.data[k + 2] / 255], a: pixels.data[k + 3] / 255 };
  });
}

/** Alpha down a texture column at `u`, sampled at t ∈ [0, 1] (wrapping). */
function columnAlpha(entry, u, t) {
  const { field } = entry;
  const x = Math.min(field.w - 1, Math.max(0, Math.round(u * (field.w - 1))));
  const y = Math.floor((((t % 1) + 1) % 1) * (field.h - 1));
  return field.data[y * field.w + x] / 255;
}

const lutRow = (entry, v, n = 32) => rowStops(entry, v, n).map((s) => s.rgb.map((c) => c * s.a));

// ---- tinted sprite cache (per play) ----

const quant = (c) => Math.round(Math.max(0, Math.min(1, c)) * 24);
function tinted(cache, name, entry, rgb) {
  const key = `${name}|${quant(rgb[0])}|${quant(rgb[1])}|${quant(rgb[2])}`;
  let canvas = cache.get(key);
  if (canvas) return canvas;
  const { img } = entry;
  canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${(quant(rgb[0]) / 24) * 255}, ${(quant(rgb[1]) / 24) * 255}, ${(quant(rgb[2]) / 24) * 255})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  cache.set(key, canvas);
  return canvas;
}

// ---- scratch buffers for per-pixel layers ----

function scratch(pool, w, h) {
  const key = `${w}x${h}`;
  let buf = pool.get(key);
  if (!buf) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    buf = { canvas, ctx, image: ctx.createImageData(w, h) };
    pool.set(key, buf);
  }
  return buf;
}

const placeQuad = (ctx, view, op, wPx, hPx, draw) => {
  ctx.save();
  ctx.translate(view.cx + op.x * view.unit, view.cy - op.y * view.unit);
  ctx.rotate(-(op.rot || 0));
  ctx.globalAlpha = Math.max(0, Math.min(1, op.alpha));
  draw(-wPx / 2, -hPx / 2, wPx, hPx);
  ctx.restore();
};

function drawSprite(ctx, view, state, op) {
  const entry = textureOf(op.tex);
  if (!entry || !(op.alpha > 0.003)) return;
  const source = tinted(state.tints, op.tex, entry, op.rgb || [1, 1, 1]);
  if (!source) return;
  const [cols, rows, index] = op.frame || [1, 1, 0];
  const fw = source.width / cols;
  const fh = source.height / rows;
  const sx = (index % cols) * fw;
  const sy = Math.floor(index / cols) * fh;
  placeQuad(ctx, view, op, op.w * view.unit, op.h * view.unit, (x, y, w, h) => ctx.drawImage(source, sx, sy, fw, fh, x, y, w, h));
}

const resFor = (px, detail = 1) => Math.max(24, Math.min(256, Math.round(px * 0.5 * detail)));

const pixelsOf = (entry) => (entry ? { w: entry.pixels.width, h: entry.pixels.height, data: entry.pixels.data } : null);

function drawDissolve(ctx, view, state, op) {
  const mask = textureOf(op.mask);
  const noise = op.noise ? textureOf(op.noise) : null;
  const colors = op.colors ? textureOf(op.colors) : null;
  if (!mask || (op.noise && !noise) || (op.colors && !colors) || !(op.alpha > 0.003)) return;
  const wPx = op.w * view.unit;
  const hPx = op.h * view.unit;
  const buf = scratch(state.pool, resFor(wPx, op.detail), resFor(hPx, op.detail));
  if (!buf) return;
  fillDissolve(buf.image.data, buf.canvas.width, buf.canvas.height, {
    mask: mask.field,
    noise: noise?.field || null,
    colors: pixelsOf(colors),
    amount: op.amount,
    soft: op.soft,
    noiseRot: op.noiseRot || 0,
    noiseTile: op.noiseTile || 1,
    rgb: op.rgb,
    alpha: 1,
  });
  buf.ctx.putImageData(buf.image, 0, 0);
  placeQuad(ctx, view, op, wPx, hPx, (x, y, w, h) => ctx.drawImage(buf.canvas, x, y, w, h));
}

function drawFrame(ctx, view, state, op) {
  const mask = textureOf(op.mask);
  const noise = textureOf(op.noise);
  const lut = op.lut ? textureOf(op.lut) : null;
  if (!mask || !noise || (op.lut && !lut) || !(op.alpha > 0.003)) return;
  const wPx = op.outer[0] * view.unit;
  const hPx = op.outer[1] * view.unit;
  const buf = scratch(state.pool, resFor(wPx, 0.8), resFor(hPx, 0.8));
  if (!buf) return;
  if (lut && !state.luts.has(op.lut)) state.luts.set(op.lut, lutRow(lut, 0.5));
  fillFrame(buf.image.data, buf.canvas.width, buf.canvas.height, {
    outer: op.outer,
    inner: op.inner,
    mask: mask.field,
    noise: noise.field,
    amount: op.amount,
    lut: lut ? state.luts.get(op.lut) : null,
    rgb: op.rgb,
    alpha: 1,
  });
  buf.ctx.putImageData(buf.image, 0, 0);
  placeQuad(ctx, view, { x: 0, y: 0, rot: 0, alpha: op.alpha }, wPx, hPx, (x, y, w, h) => ctx.drawImage(buf.canvas, x, y, w, h));
}

function drawPolar(ctx, view, state, op) {
  const noise = textureOf(op.noise);
  if (!noise || !(op.alpha > 0.003)) return;
  const mask = op.mask ? textureOf(op.mask) : null;
  const band = op.band ? textureOf(op.band) : null;
  const lut = op.lut ? textureOf(op.lut) : null;
  if ((op.mask && !mask) || (op.band && !band) || (op.lut && !lut)) return;
  const sizePx = op.size * view.unit;
  const res = resFor(sizePx, op.detail);
  const buf = scratch(state.pool, res, res);
  if (!buf) return;
  if (lut && !state.luts.has(op.lut)) state.luts.set(op.lut, lutRow(lut, 0.5));
  fillPolar(buf.image.data, res, {
    noise: noise.field,
    tileU: op.tileU,
    tileV: op.tileV,
    offU: op.offU,
    offV: op.offV,
    amount: op.amount,
    soft: op.soft,
    levels: op.levels,
    shape: op.shape,
    mask: mask?.field || null,
    band: band?.field || null,
    lut: lut ? state.luts.get(op.lut) : null,
    rgb: op.rgb,
    alpha: 1,
  });
  buf.ctx.putImageData(buf.image, 0, 0);
  placeQuad(ctx, view, op, sizePx, sizePx, (x, y, w, h) => ctx.drawImage(buf.canvas, x, y, w, h));
}

// LightRay_Prismatic has no fade along its length (the shader's custom data did
// that); a tapered ribbon fades in from its hub and out toward its tip.
const taperAt = (t) => Math.min(1, t / 0.2) * (1 - Math.max(0, (t - 0.45) / 0.55)) ** 1.5;

function alongAlpha(op, lut, band, column, t) {
  if (band) return columnAlpha(band, 0.5, Math.min(0.999, t));
  if (column) return 1;
  const along = columnAlpha(lut, 0.5, Math.min(0.999, t) + (op.pan || 0));
  return op.taper ? along * taperAt(t) : along;
}

const rgba = (rgb, a) => `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${Math.max(0, Math.min(1, a))})`;

// A ribbon is drawn quad by quad onto its own scratch canvas (no additive seams
// where quads meet), then added to the stage in one draw.
const RIBBON_MIN_POINTS = 28;

function drawRibbon(ctx, view, state, op) {
  const lut = textureOf(op.lut);
  const band = op.band ? textureOf(op.band) : null;
  if (!lut || (op.band && !band) || !(op.alpha > 0.003) || op.a.length < 2) return;
  const toPx = ([x, y]) => [view.cx + x * view.unit, view.cy - y * view.unit];
  // Short rails (a light shaft has 6 rings) are subdivided so the fade along them is smooth.
  const count = Math.max(op.a.length, RIBBON_MIN_POINTS);
  const a = resampleRail(op.a, count).map(toPx);
  const b = resampleRail(op.b, count).map(toPx);
  const xs = [...a, ...b].map((p) => p[0]);
  const ys = [...a, ...b].map((p) => p[1]);
  const left = Math.floor(Math.min(...xs)) - 2;
  const top = Math.floor(Math.min(...ys)) - 2;
  const w = Math.ceil(Math.max(...xs)) - left + 2;
  const h = Math.ceil(Math.max(...ys)) - top + 2;
  if (!(w > 0 && h > 0) || w > 4096 || h > 4096) return;
  const buf = state.ribbon || (state.ribbon = { canvas: document.createElement('canvas') });
  buf.canvas.width = w;
  buf.canvas.height = h;
  const rctx = buf.canvas.getContext('2d');
  if (!rctx) return;
  const column = op.profile === 'column';
  const key = `${op.lut}:${column ? 'column' : 'row'}`;
  if (!state.luts.has(key)) state.luts.set(key, column ? rowStops(lut, 0.5, 9, true) : rowStops(lut, 0.6));
  const stops = state.luts.get(key);
  const n = a.length;
  for (let i = 0; i < n - 1; i += 1) {
    const t = (i + 0.5) / (n - 1);
    const along = alongAlpha(op, lut, band, column, t);
    if (along < 0.01) continue;
    const ma = [(a[i][0] + a[i + 1][0]) / 2 - left, (a[i][1] + a[i + 1][1]) / 2 - top];
    const mb = [(b[i][0] + b[i + 1][0]) / 2 - left, (b[i][1] + b[i + 1][1]) / 2 - top];
    const gradient = rctx.createLinearGradient(ma[0], ma[1], mb[0], mb[1]);
    for (const s of stops) gradient.addColorStop(s.at, rgba(s.rgb.map((c, k) => c * (op.rgb?.[k] ?? 1)), s.a * along));
    rctx.fillStyle = gradient;
    rctx.beginPath();
    rctx.moveTo(a[i][0] - left, a[i][1] - top);
    rctx.lineTo(a[i + 1][0] - left, a[i + 1][1] - top);
    rctx.lineTo(b[i + 1][0] - left, b[i + 1][1] - top);
    rctx.lineTo(b[i][0] - left, b[i][1] - top);
    rctx.closePath();
    rctx.fill();
    // Stroking the same quad closes the anti-aliasing seam with its neighbour.
    rctx.strokeStyle = gradient;
    rctx.lineWidth = 1;
    rctx.stroke();
  }
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, op.alpha));
  ctx.drawImage(buf.canvas, left, top);
  ctx.restore();
}

function cutCard(ctx, view) {
  const { cardW, cardH } = view;
  const r = Math.min(cardW, cardH) * 0.06;
  const x = view.cx - cardW / 2;
  const y = view.cy - cardH / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + cardW, y, x + cardW, y + cardH, r);
  ctx.arcTo(x + cardW, y + cardH, x, y + cardH, r);
  ctx.arcTo(x, y + cardH, x, y, r);
  ctx.arcTo(x, y, x + cardW, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// The stage fades out toward its rim so no layer is ever cut by the canvas edge.
function fadeRim(ctx, view) {
  const radius = view.size / 2;
  const gradient = ctx.createRadialGradient(view.cx, view.cy, radius * 0.72, view.cx, view.cy, radius);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.size, view.size);
  ctx.restore();
}

const DRAW = { sprite: drawSprite, dissolve: drawDissolve, polar: drawPolar, ribbon: drawRibbon, frame: drawFrame };

/** Per-play caches (tinted sprites, scratch buffers, colour rows). */
export const createDrawState = () => ({ tints: new Map(), pool: new Map(), luts: new Map(), ribbon: null });

/**
 * Draw one frame's ops. `view` = { cx, cy, unit, size, cardW, cardH } in CSS
 * px: (cx, cy) is the card centre on the canvas and `unit` px per prefab unit.
 */
export function drawTcglOps(ctx, ops, view, state) {
  ctx.globalCompositeOperation = 'lighter';
  for (const op of ops) {
    if (op.kind === 'cutout') {
      cutCard(ctx, view);
      continue;
    }
    DRAW[op.kind]?.(ctx, view, state, op);
  }
  ctx.globalCompositeOperation = 'source-over';
  fadeRim(ctx, view);
}
