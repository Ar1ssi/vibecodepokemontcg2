import { homography } from '../../../../setup/deck-builder/core/build-battle/unboxing.mjs';
import { assetUrl, makeCanvas, prng } from './tt-textures.js';

/**
 * Printed artwork for the tabletop (design 073): the box faces no photo shows (back, top, bottom,
 * and every face of a box without a vendored cut), the code card, the tips leaflet and the pack
 * backs, drawn on canvases. Words are typeset, never traced logos (design 052 § Box reference);
 * legal copy is grey lines, never real text. Photo faces are rectified from the product render
 * with the face's corner quad (the render is a perspective shot).
 */

const FONT_URL = 'src/assets/fonts/rodin-condensed-latin.woff2';
const FONT_FAMILY = 'TT Rodin Condensed';
export const PRINT_FONT = `'${FONT_FAMILY}', 'Arial Narrow', Impact, 'Arial Black', sans-serif`;
const FONT_TIMEOUT_MS = 2500;

let fontPromise = null;
/** Loads the condensed face once; resolves (never rejects) when it is usable or given up on. */
export function loadPrintFont() {
  if (fontPromise) return fontPromise;
  if (typeof FontFace !== 'function' || !document.fonts) return (fontPromise = Promise.resolve(false));
  const face = new FontFace(FONT_FAMILY, `url(${assetUrl(FONT_URL)})`);
  const loaded = face
    .load()
    .then((ready) => {
      document.fonts.add(ready);
      return true;
    })
    .catch(() => false);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), FONT_TIMEOUT_MS));
  fontPromise = Promise.race([loaded, timeout]);
  return fontPromise;
}

// Era palettes for faces drawn without a photo (the 052 tokens for ME; the others read off each
// era's renders).
const PALETTES = Object.freeze({
  me: { base: '#0b0b10', a: '#ff2fa3', b: '#7fe000', c: '#ffd400', d: '#2f7bff', band: '#e0b431' },
  sv: { base: '#101422', a: '#e8483d', b: '#7a48d8', c: '#ffcf33', d: '#2ab3e6', band: '#d8dde6' },
  swsh: { base: '#0f1730', a: '#1f8be0', b: '#c8102e', c: '#f2c230', d: '#6fd6ff', band: '#d6dbe3' },
  sm: { base: '#1d1230', a: '#f08a24', b: '#1f6fd1', c: '#ffd23a', d: '#36b37e', band: '#e7c45a' },
  xy: { base: '#101826', a: '#2e7bd6', b: '#d93a3a', c: '#f2d14b', d: '#58c2a7', band: '#c9ced8' },
});
export const paletteFor = (era) => PALETTES[era] || PALETTES.me;

const GOLD_STOPS = ['#a77a17', '#f6d65a', '#d9a92c', '#fff1a8', '#b88a1e'];

function goldGradient(ctx, x0, y0, x1, y1) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  GOLD_STOPS.forEach((color, index) => gradient.addColorStop(index / (GOLD_STOPS.length - 1), color));
  return gradient;
}

/** Black board with the faint diamond lattice the 052 frames show on the back and top. */
function blackLattice(ctx, w, h, base = '#0d0d12') {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = Math.max(1, w / 420);
  const step = w / 14;
  for (let k = -h; k < w + h; k += step) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + h, h);
    ctx.moveTo(k + h, 0);
    ctx.lineTo(k, h);
    ctx.stroke();
  }
  ctx.restore();
}

function fitText(ctx, text, maxWidth, sizePx, weight = 'bold') {
  let size = sizePx;
  ctx.font = `${weight} ${size}px ${PRINT_FONT}`;
  while (size > 6 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${PRINT_FONT}`;
  }
  return size;
}

/** The yellow-on-blue "Pokémon" wordmark set in type, with its red "TRADING CARD GAME" plate. */
export function drawWordmark(ctx, cx, cy, width) {
  const size = fitText(ctx, 'POKÉMON', width, width * 0.32, '900');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.24;
  ctx.strokeStyle = '#1d3b8f';
  ctx.strokeText('POKÉMON', cx, cy);
  ctx.fillStyle = '#ffcb05';
  ctx.fillText('POKÉMON', cx, cy);
  const plateW = width * 0.78;
  const plateH = size * 0.42;
  ctx.fillStyle = '#d62828';
  ctx.strokeStyle = '#1d3b8f';
  ctx.lineWidth = Math.max(1, size * 0.06);
  roundRect(ctx, cx - plateW / 2, cy + size * 0.52, plateW, plateH, plateH * 0.2);
  ctx.fill();
  ctx.stroke();
  fitText(ctx, 'TRADING CARD GAME', plateW * 0.9, plateH * 0.78);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('TRADING CARD GAME', cx, cy + size * 0.52 + plateH / 2);
}

/** The Play! Pokémon mark: a red/white square glyph with a ball. */
function drawPlayMark(ctx, x, y, size) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#d62828';
  ctx.fillRect(x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + size * 0.38, y + size * 0.36, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + size * 0.48, y + size * 0.3, size * 0.3, size * 0.5);
}

function drawBuildBattle(ctx, x, y, width, height, title = 'BUILD & BATTLE', color = '#111') {
  drawPlayMark(ctx, x, y + height * 0.1, height * 0.8);
  const textX = x + height * 0.95;
  const size = fitText(ctx, title.toUpperCase(), width - height, height * 0.86, '900');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `900 ${size}px ${PRINT_FONT}`;
  ctx.fillText(title.toUpperCase(), textX, y + height * 0.54);
}

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function greyLines(ctx, x, y, width, lines, lineHeight, seed) {
  const rand = prng(seed);
  ctx.fillStyle = 'rgba(200,200,205,0.55)';
  for (let k = 0; k < lines; k += 1) {
    const len = width * (k === lines - 1 ? 0.45 + rand() * 0.3 : 0.86 + rand() * 0.14);
    ctx.fillRect(x, y + k * lineHeight, len, lineHeight * 0.42);
  }
}

/**
 * The back panel (`refs/052-box-back.webp`): Build & Battle mark, gold rules, "Inside, you'll
 * find:" with the box's own contents lines, the red web band, grey legal lines, the slogan.
 */
export function drawBoxBack(ctx, w, h, { labels, palette }) {
  blackLattice(ctx, w, h);
  const pad = w * 0.08;
  drawBuildBattle(ctx, pad, h * 0.06, w - 2 * pad, h * 0.075, labels?.productTitle || 'Build & Battle', '#ffffff');
  const rule = (y) => {
    ctx.fillStyle = goldGradient(ctx, 0, y, w, y);
    ctx.fillRect(0, y, w, h * 0.008);
    ctx.fillStyle = '#4a4a4f';
    ctx.fillRect(0, y + h * 0.011, w, h * 0.004);
  };
  rule(h * 0.19);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, 'Inside, you’ll find:', w * 0.7, h * 0.036);
  ctx.fillText('Inside, you’ll find:', w / 2, h * 0.26);
  const lines = labels?.backLines || [];
  let y = h * 0.31;
  for (const line of lines) {
    const words = `• ${line}`.split(' ');
    let current = '';
    const size = Math.round(h * 0.026);
    ctx.font = `bold ${size}px ${PRINT_FONT}`;
    const rows = [];
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > w - 2.4 * pad && current) {
        rows.push(current);
        current = word;
      } else current = next;
    }
    if (current) rows.push(current);
    for (const row of rows) {
      ctx.fillText(row, w / 2, y);
      y += size * 1.18;
    }
    y += size * 0.35;
  }
  rule(Math.max(y + h * 0.01, h * 0.47));
  const bandY = h * 0.66;
  ctx.fillStyle = palette?.a === '#ff2fa3' ? '#d62828' : '#c8102e';
  ctx.beginPath();
  ctx.moveTo(0, bandY);
  ctx.lineTo(w * 0.86, bandY);
  ctx.lineTo(w * 0.8, bandY + h * 0.045);
  ctx.lineTo(0, bandY + h * 0.045);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  fitText(ctx, 'WWW.POKEMON.COM', w * 0.6, h * 0.03);
  ctx.fillText('WWW.POKEMON.COM', pad, bandY + h * 0.0235);
  greyLines(ctx, pad, h * 0.725, w - 2 * pad, 7, h * 0.016, 41);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  fitText(ctx, 'Gotta catch ’em all!', w * 0.5, h * 0.03, 'italic bold');
  ctx.fillText('Gotta catch ’em all!', w - pad, h * 0.93);
}

/** Top (and bottom) panel: black lattice, a wide gold band carrying the wordmark or the mark. */
export function drawBoxEnd(ctx, w, h, { kind = 'top', labels }) {
  blackLattice(ctx, w, h);
  const bandH = h * 0.56;
  const bandY = (h - bandH) / 2;
  ctx.fillStyle = goldGradient(ctx, 0, bandY, w, bandY + bandH);
  ctx.fillRect(0, bandY, w, bandH);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, bandY, w, bandH * 0.08);
  ctx.fillRect(0, bandY + bandH * 0.92, w, bandH * 0.08);
  if (kind === 'top') drawWordmark(ctx, w / 2, bandY + bandH * 0.36, w * 0.46);
  else drawBuildBattle(ctx, w * 0.2, bandY + bandH * 0.28, w * 0.6, bandH * 0.44, labels?.productTitle);
}

/**
 * A face for a box without a vendored cut: the era's slashes over the key card's art, the
 * wordmark plate, the set logo and the Build & Battle band (the layout of the real fronts).
 */
export function drawProceduralFront(ctx, w, h, { palette, keyArt, logo, labels }) {
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, w, h);
  if (keyArt) {
    const scale = Math.max(w / keyArt.width, (h * 0.75) / (keyArt.height * 0.42));
    const sw = keyArt.width;
    const sh = keyArt.height * 0.42;
    ctx.drawImage(keyArt, 0, keyArt.height * 0.1, sw, sh, (w - sw * scale) / 2, h * 0.1, sw * scale, sh * scale);
  }
  slashes(ctx, w, h, palette, 0.55);
  ctx.fillStyle = '#d62828';
  ctx.beginPath();
  ctx.moveTo(w * 0.06, 0);
  ctx.lineTo(w * 0.58, 0);
  ctx.lineTo(w * 0.52, h * 0.16);
  ctx.lineTo(w * 0.06, h * 0.16);
  ctx.closePath();
  ctx.fill();
  drawWordmark(ctx, w * 0.31, h * 0.06, w * 0.4);
  if (logo) {
    const lw = w * 0.74;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (w - lw) / 2, h * 0.86 - lh, lw, lh);
  }
  bottomBand(ctx, w, h, labels);
}

/** A side for a box without a vendored cut: slashes on the era colour with the bottom band. */
export function drawProceduralSide(ctx, w, h, { palette, labels }) {
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, w, h);
  slashes(ctx, w, h, palette, 1);
  bottomBand(ctx, w, h, labels, true);
}

function slashes(ctx, w, h, palette, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const colors = [palette.a, palette.b, palette.c, palette.d];
  const rand = prng(97);
  for (let k = 0; k < 9; k += 1) {
    ctx.fillStyle = colors[k % colors.length];
    const x = rand() * w * 1.4 - w * 0.2;
    const y = rand() * h;
    const len = w * (0.4 + rand() * 0.9);
    const thick = w * (0.02 + rand() * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y - len * 0.9);
    ctx.lineTo(x + len + thick, y - len * 0.9 + thick * 0.4);
    ctx.lineTo(x + thick * 1.6, y + thick * 0.9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function bottomBand(ctx, w, h, labels, narrow = false) {
  const bandH = h * 0.075;
  const y = h - bandH - h * 0.01;
  ctx.fillStyle = goldGradient(ctx, 0, y, w, y + bandH);
  ctx.fillRect(0, y, w, bandH);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, y - h * 0.004, w, h * 0.004);
  if (narrow) {
    drawPlayMark(ctx, w * 0.12, y + bandH * 0.15, bandH * 0.7);
    return;
  }
  drawBuildBattle(ctx, w * 0.06, y + bandH * 0.08, w * 0.8, bandH * 0.84, labels?.productTitle);
}

/**
 * Rectifies a face of a perspective product render: `quad` is the face's four corners in the
 * image (clockwise from top-left, image pixels); returns a `width` × `height` canvas of the face
 * seen square-on (bilinear, inverse-mapped through the homography).
 */
export function rectifyFace(image, quad, width, height) {
  const source = makeCanvas(image.width, image.height);
  const sctx = source.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(image, 0, 0);
  const src = sctx.getImageData(0, 0, image.width, image.height).data;
  const out = makeCanvas(width, height);
  const octx = out.getContext('2d');
  const dst = octx.createImageData(width, height);
  const rect = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const [h0, h1, h2, h3, h4, h5, h6, h7] = homography(rect, quad);
  const sw = image.width;
  const sh = image.height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const wq = h6 * px + h7 * py + 1;
      const u = (h0 * px + h1 * py + h2) / wq - 0.5;
      const v = (h3 * px + h4 * py + h5) / wq - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(u)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(v)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, u - x0));
      const fy = Math.min(1, Math.max(0, v - y0));
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const a = src[(y0 * sw + x0) * 4 + c];
        const b = src[(y0 * sw + x1) * 4 + c];
        const d = src[(y1 * sw + x0) * 4 + c];
        const e = src[(y1 * sw + x1) * 4 + c];
        dst.data[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
      dst.data[o + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

/** Mirrors a canvas left to right (the right side panel from the left one). */
export function mirrorCanvas(canvas) {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

// ── Paper inside the box ───────────────────────────────────────────────────
/**
 * A code card: a dark card with the game's name and a masked code panel. Never a redeemable or
 * code-shaped string (design 073 § Assumptions).
 */
export function drawCodeCardFront(ctx, w, h, { game = 'Pokémon TCG Live', live = true }) {
  const top = live ? '#0c2f5c' : '#2b1a52';
  const bottom = live ? '#0a7fa8' : '#5b2e9a';
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = w * 0.01;
  for (let r = w * 0.15; r < w * 1.2; r += w * 0.09) {
    ctx.beginPath();
    ctx.arc(w * 0.85, h * 0.2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, game.toUpperCase(), w * 0.84, h * 0.07, '900');
  ctx.fillText(game.toUpperCase(), w / 2, h * 0.16);
  fitText(ctx, 'CODE CARD', w * 0.7, h * 0.11, '900');
  ctx.fillStyle = '#ffd400';
  ctx.fillText('CODE CARD', w / 2, h * 0.29);
  ctx.fillStyle = '#e9edf2';
  roundRect(ctx, w * 0.1, h * 0.46, w * 0.8, h * 0.16, h * 0.02);
  ctx.fill();
  const rand = prng(5);
  ctx.fillStyle = '#b9c1cc';
  for (let k = 0; k < 220; k += 1) {
    ctx.fillRect(w * 0.11 + rand() * w * 0.78, h * 0.47 + rand() * h * 0.14, w * 0.012, h * 0.008);
  }
  ctx.fillStyle = '#5c6670';
  fitText(ctx, 'SCRATCH OFF', w * 0.5, h * 0.035);
  ctx.fillText('SCRATCH OFF', w / 2, h * 0.54);
  greyLines(ctx, w * 0.1, h * 0.7, w * 0.8, 6, h * 0.03, 77);
}

export function drawCodeCardBack(ctx, w, h, { live = true }) {
  const base = live ? '#0b2547' : '#24154a';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let k = 0; k < 12; k += 1) ctx.fillRect(0, (h / 12) * k, w, h / 48);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.fillRect(w * 0.3, h / 2 - w * 0.015, w * 0.4, w * 0.03);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The folded leaflet's cover: its heading (a Prerelease Kit's is a player's guide), the box's
 * title, "Deck list" and the deck's card names when known, the rest as grey lines.
 */
export function drawLeafletCover(ctx, w, h, { title, deckRows = [], palette, heading = 'BUILDING TIPS' }) {
  ctx.fillStyle = '#f6f4ee';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = palette?.base || '#111';
  ctx.fillRect(0, 0, w, h * 0.17);
  ctx.fillStyle = palette?.a || '#d62828';
  ctx.fillRect(0, h * 0.17, w, h * 0.012);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, heading, w * 0.8, h * 0.06, '900');
  ctx.fillText(heading, w / 2, h * 0.065);
  fitText(ctx, String(title || '').toUpperCase(), w * 0.84, h * 0.04);
  ctx.fillText(String(title || '').toUpperCase(), w / 2, h * 0.125);
  ctx.fillStyle = '#1b1b20';
  ctx.textAlign = 'left';
  fitText(ctx, 'Deck list', w * 0.5, h * 0.034);
  ctx.fillText('Deck list', w * 0.08, h * 0.225);
  const rows = deckRows.slice(0, 22);
  const lineH = h * 0.028;
  ctx.font = `${Math.round(lineH * 0.78)}px ${PRINT_FONT}`;
  rows.forEach((row, index) => {
    const col = index < 11 ? 0 : 1;
    const y = h * 0.265 + (index % 11) * lineH;
    const x = w * (col === 0 ? 0.08 : 0.53);
    ctx.fillText(`${row.qty || 1} ${row.name}`.slice(0, 26), x, y);
  });
  greyLines(ctx, w * 0.08, h * 0.6, w * 0.84, 10, h * 0.026, 13);
}

/**
 * A pack's back: the front's dominant colour, darkened, the vertical fin seam, the wordmark and
 * grey legal lines (Pokémon wrappers carry the logo and fine print on the back).
 */
export function drawPackBack(ctx, w, h, { tint = '#3a3f4c', seamU = 0.5 }) {
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, shade(tint, -0.25));
  gradient.addColorStop(0.5, shade(tint, 0.05));
  gradient.addColorStop(1, shade(tint, -0.25));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  drawWordmark(ctx, w / 2, h * 0.3, w * 0.62);
  greyLines(ctx, w * 0.12, h * 0.58, w * 0.76, 9, h * 0.018, 3);
  const seamX = w * seamU;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(seamX - w * 0.07, 0, w * 0.006, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(seamX + w * 0.065, 0, w * 0.004, h);
}

/** Lighten (amount > 0) or darken (< 0) a hex colour. */
export function shade(hex, amount) {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] || '808080';
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  const out = channels.map((c) =>
    Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))))
  );
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** @returns {string} the average colour of an image's middle band, as hex. */
export function averageColor(image) {
  try {
    const canvas = makeCanvas(16, 16);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, image.height * 0.25, image.width, image.height * 0.5, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    return `#${[r, g, b].map((c) => Math.round(c / n).toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return '#3a3f4c';
  }
}

/**
 * A wrapper front for a box whose packs have no vendored art (design 054's procedural packs): the
 * crimped seals, the era colours, the card's art window, the wordmark and the "10 cards" band.
 * The alpha is the silhouette: seals edge to edge, the body pinched in at the sides.
 */
export function drawProceduralWrapper(ctx, w, h, { image, palette }) {
  const seal = h * 0.104;
  const inset = w * (17 / 780);
  ctx.clearRect(0, 0, w, h);
  const body = ctx.createLinearGradient(0, 0, w, h);
  body.addColorStop(0, shade(palette.a, -0.2));
  body.addColorStop(0.5, palette.base);
  body.addColorStop(1, shade(palette.d, -0.3));
  ctx.fillStyle = body;
  ctx.fillRect(inset, seal, w - 2 * inset, h - 2 * seal);
  if (image) {
    const sx = image.width * 0.08;
    const sy = image.height * 0.1;
    const sw = image.width * 0.84;
    const sh = image.height * 0.42;
    const dw = w - 2 * inset;
    const dh = (sh / sw) * dw;
    ctx.drawImage(image, sx, sy, sw, sh, inset, h * 0.3, dw, dh);
  }
  drawWordmark(ctx, w / 2, h * 0.17, w * 0.62);
  ctx.fillStyle = '#d62828';
  ctx.fillRect(inset, h * 0.8, w - 2 * inset, h * 0.07);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, '10 ADDITIONAL GAME CARDS', w * 0.8, h * 0.035, '900');
  ctx.fillText('10 ADDITIONAL GAME CARDS', w / 2, h * 0.835);
  const crimp = (y0, y1) => {
    const gradient = ctx.createLinearGradient(0, y0, 0, y1);
    gradient.addColorStop(0, shade(palette.c, -0.35));
    gradient.addColorStop(0.5, shade(palette.c, 0.15));
    gradient.addColorStop(1, shade(palette.c, -0.35));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y0, w, y1 - y0);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < w; x += w / 70) ctx.fillRect(x, y0, w / 140, y1 - y0);
  };
  crimp(0, seal);
  crimp(h - seal, h);
  // The sealer's pinked edge: a zigzag along the top and bottom.
  ctx.globalCompositeOperation = 'destination-out';
  const teeth = 40;
  const depth = h * 0.006;
  for (const [y, dir] of [
    [0, 1],
    [h, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let i = 0; i <= teeth; i += 1) ctx.lineTo((i / teeth) * w, y + dir * (i % 2 ? depth : 0));
    ctx.lineTo(w, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
