// Drawing kit for Special Energy tokens. Glyphs are authored as mask content in a 100×100 box:
// white (W) = black ink on the token, black (B) = knocked back out to the body colour.
import fs from 'node:fs';
import path from 'node:path';

export const W = '#fff';
export const B = '#000';

export const TYPE_COLOR = {
  colorless: '#b7aca6',
  darkness: '#17434f',
  darknessBody: '#2b6a79',
  dragon: '#a8822f',
  fairy: '#d24677',
  fighting: '#a73923',
  fire: '#bd2127',
  grass: '#139a49',
  lightning: '#f9e108',
  metal: '#92867a',
  psychic: '#7d4290',
  water: '#0676bd',
};
export const SYM = {
  G: 'grass',
  R: 'fire',
  W: 'water',
  L: 'lightning',
  P: 'psychic',
  F: 'fighting',
  D: 'darkness',
  M: 'metal',
  C: 'colorless',
  Y: 'fairy',
  N: 'dragon',
};

let MASKS = {};
export const loadMasks = (dir) => {
  for (const type of Object.keys(TYPE_COLOR).filter(
    (t) => t !== 'darknessBody'
  )) {
    const read = (file) =>
      'data:image/png;base64,' +
      fs.readFileSync(path.join(dir, file)).toString('base64');
    MASKS[type] = { white: read(`${type}-w.png`), black: read(`${type}.png`) };
  }
};
export const maskUri = (type, variant) => MASKS[type][variant];

const r2 = (n) => Math.round(n * 100) / 100;
/** Point at clockwise-from-12-o'clock angle `a` (degrees), radius r. */
export const pol = (a, r, cx = 50, cy = 50) => {
  const t = (a * Math.PI) / 180;
  return [r2(cx + r * Math.sin(t)), r2(cy - r * Math.cos(t))];
};
const pts = (arr) => arr.map((p) => p.join(',')).join(' ');

export const poly = (arr, fill = W) =>
  `<polygon points="${pts(arr)}" fill="${fill}"/>`;
export const circ = (cx, cy, r, fill = W, extra = '') =>
  `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${fill}" ${extra}/>`;
export const ring = (cx, cy, r, w, c = W, extra = '') =>
  `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="none" stroke="${c}" stroke-width="${w}" ${extra}/>`;
export const line = (x1, y1, x2, y2, w, c = W) =>
  `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
export const fpath = (d, fill = W, extra = '') =>
  `<path d="${d}" fill="${fill}" ${extra}/>`;
export const spath = (d, w, c = W, extra = '') =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
export const pline = (arr, w, c = W, join = 'round') =>
  `<polyline points="${pts(arr)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="${join}"/>`;
export const g = (inner, transform) =>
  `<g transform="${transform}">${inner}</g>`;
export const rect = (x, y, w, h, rx = 0, fill = W, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
export const text = (str, x, y, size, fill = W, extra = '') =>
  `<text x="${x}" y="${y}" font-family="Inter" font-weight="900" font-size="${size}" text-anchor="middle" fill="${fill}" ${extra}>${str}</text>`;

/** Arc path from angle a0 to a1 (clockwise, degrees from 12 o'clock). */
export const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pol(a0, r, cx, cy);
  const [x1, y1] = pol(a1, r, cx, cy);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0} ${y0} A${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
};

export const starPts = (cx, cy, n, ro, ri, rot = 0) => {
  const out = [];
  for (let i = 0; i < n * 2; i++)
    out.push(pol(rot + (i * 180) / n, i % 2 ? ri : ro, cx, cy));
  return out;
};

/** Triangle arrowhead with its tip at (x,y) pointing along clockwise-from-top angle `a`. */
export const head = (x, y, a, size, fill = W) => {
  const back = pol(a + 180, size, x, y);
  return poly(
    [
      [x, y],
      pol(a + 90, size * 0.62, back[0], back[1]),
      pol(a - 90, size * 0.62, back[0], back[1]),
    ],
    fill
  );
};

/** The darkness symbol is drawn as vectors: its basic token's glyph sits on a near-black body. */
const darkGlyph = (cx, cy, s, ko) => {
  const ink = ko ? B : W;
  const cut = ko ? W : B;
  return (
    circ(cx, cy + 2 * s, 25 * s, ink) +
    circ(cx, cy - 13 * s, 8 * s, cut) +
    spath(arc(cx, cy + 2 * s, 20.5 * s, 105, 215), 2.2 * s, cut)
  );
};

/** A basic type symbol (the exact glyph from the basic token), centred at cx,cy, scale s. */
export const T = (type, cx, cy, s, ko = false, rot = 0) => {
  if (type === 'darkness')
    return rot
      ? g(darkGlyph(cx, cy, s, ko), `rotate(${rot} ${cx} ${cy})`)
      : darkGlyph(cx, cy, s, ko);
  const size = 100 * s;
  const img = `<image href="${maskUri(type, ko ? 'black' : 'white')}" x="${r2(cx - size / 2)}" y="${r2(cy - size / 2)}" width="${r2(size)}" height="${r2(size)}"/>`;
  return rot ? g(img, `rotate(${rot} ${cx} ${cy})`) : img;
};

/** Type symbol with a knocked-out outline so it reads on top of other ink. */
export const TH = (type, cx, cy, s, pad = 1.2) =>
  (type === 'darkness'
    ? circ(cx, cy + 2 * s, 25 * s * pad, B)
    : T(type, cx, cy, s * pad, true)) + T(type, cx, cy, s);

/** Same idea for any vector markup: stroke-only halo copy, then the ink. */
export const sparkle = (cx, cy, r, fill = W) =>
  fpath(
    `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z`,
    fill
  );

export const wave = (x0, x1, y, amp, n) => {
  const step = (x1 - x0) / n;
  let d = `M${x0} ${y}`;
  for (let i = 0; i < n; i++)
    d += ` q${step / 2} ${i % 2 ? amp : -amp} ${step} 0`;
  return d;
};

export const heartD = (cx, cy, s) => {
  const p = (x, y) => `${r2(cx + x * s)} ${r2(cy + y * s)}`;
  return `M${p(0, 26)} C${p(-20, 12)} ${p(-28, 0)} ${p(-28, -10)} C${p(-28, -20)} ${p(-20, -26)} ${p(-12, -26)} C${p(-6, -26)} ${p(-2, -22)} ${p(0, -18)} C${p(2, -22)} ${p(6, -26)} ${p(12, -26)} C${p(20, -26)} ${p(28, -20)} ${p(28, -10)} C${p(28, 0)} ${p(20, 12)} ${p(0, 26)}Z`;
};

export const shieldD = (cx, cy, s) => {
  const p = (x, y) => `${r2(cx + x * s)} ${r2(cy + y * s)}`;
  return `M${p(0, -28)} L${p(24, -20)} L${p(24, -2)} C${p(24, 13)} ${p(14, 23)} ${p(0, 29)} C${p(-14, 23)} ${p(-24, 13)} ${p(-24, -2)} L${p(-24, -20)}Z`;
};
