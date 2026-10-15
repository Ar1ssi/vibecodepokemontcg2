// Token anatomy (100×100): bezel ring (special / ACE SPEC / Prism Star) → body (what the card
// provides) → black glyph (what the card does) → gloss → top-right pips (the card's corner symbols).
import { TYPE_COLOR, SYM, pol, maskUri } from './lib.mjs';

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (c, t, k) => {
  const a = hex(c);
  const b = hex(t);
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round(v + (b[i] - v) * k)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
};
const HUES = [
  '#ff5a5a',
  '#ffb347',
  '#ffe66b',
  '#6be08a',
  '#5ad1ff',
  '#6f8cff',
  '#c27bff',
  '#ff7ad9',
];

const BEZEL = {
  special: ['#fff4bf', '#e2b33c', '#8f6214', '#f6d977'],
  ace: ['#ffd3ec', '#e8288a', '#7d0846', '#ff86c0'],
  prism: ['#ffffff', '#cdd6e0', '#77828f', '#f4f7fb'],
};

const wedges = (cx, cy, r, colors, rot) =>
  colors
    .map((c, i) => {
      const a0 = rot + (360 / colors.length) * i;
      const a1 = a0 + 360 / colors.length;
      const [x0, y0] = pol(a0, r, cx, cy);
      const [x1, y1] = pol(a1, r, cx, cy);
      const large = a1 - a0 > 180 ? 1 : 0;
      return `<path d="M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}Z" fill="${c}"/>`;
    })
    .join('');

const body = (id, spec) => {
  const defs = [];
  let paint;
  const shade = `<circle cx="50" cy="50" r="43.6" fill="url(#${id}-shade)"/>`;
  defs.push(
    `<radialGradient id="${id}-shade" cx="0.38" cy="0.3" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="0.8" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0.42"/></radialGradient>`
  );
  if (spec === 'pearl') {
    defs.push(
      `<radialGradient id="${id}-b" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#e6e2ea"/><stop offset="1" stop-color="#aea7b4"/></radialGradient>`,
      `<filter id="${id}-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>`
    );
    paint =
      `<circle cx="50" cy="50" r="43.6" fill="url(#${id}-b)"/>` +
      `<g clip-path="url(#${id}-clip)" filter="url(#${id}-blur)" opacity="0.32"><circle cx="72" cy="30" r="16" fill="#ff9ad5"/><circle cx="28" cy="72" r="18" fill="#7ee0ff"/><circle cx="74" cy="72" r="12" fill="#fff08a"/></g>`;
  } else if (spec === 'rainbow') {
    defs.push(
      `<filter id="${id}-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>`,
      `<radialGradient id="${id}-core" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
    );
    paint =
      `<g clip-path="url(#${id}-clip)"><g filter="url(#${id}-blur)">${wedges(50, 50, 60, HUES, -10)}</g></g>` +
      `<circle cx="50" cy="50" r="43.6" fill="url(#${id}-core)"/>`;
  } else if (Array.isArray(spec)) {
    const colors = spec.map((t) =>
      t === 'darkness' ? TYPE_COLOR.darknessBody : TYPE_COLOR[t]
    );
    const rot = spec.length === 2 ? 225 : spec.length === 3 ? -60 : -90;
    paint = `<g clip-path="url(#${id}-clip)">${wedges(50, 50, 60, colors, rot)}</g>`;
  } else {
    const c =
      spec === 'darkness' ? TYPE_COLOR.darknessBody : TYPE_COLOR[spec] || spec;
    defs.push(
      `<radialGradient id="${id}-b" cx="0.4" cy="0.35" r="0.72"><stop offset="0" stop-color="${mix(c, '#ffffff', 0.3)}"/><stop offset="0.6" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, '#000000', 0.32)}"/></radialGradient>`
    );
    paint = `<circle cx="50" cy="50" r="43.6" fill="url(#${id}-b)"/>`;
  }
  return { defs: defs.join(''), paint: paint + shade };
};

const pipFill = (id, kind, i) => {
  if (kind === 'any')
    return {
      defs: '',
      paint: (cx, cy, r) =>
        `<g clip-path="url(#${id}-pc${i})">${wedges(cx, cy, r + 1, HUES, 0)}</g><circle cx="${cx}" cy="${cy}" r="${r * 0.38}" fill="#fff"/>`,
    };
  if (kind.includes('|')) {
    const colors = kind.split('|').map((s) => TYPE_COLOR[SYM[s]]);
    return {
      defs: '',
      paint: (cx, cy, r) =>
        `<g clip-path="url(#${id}-pc${i})">${wedges(cx, cy, r + 1, colors, 225)}</g>`,
    };
  }
  const type = SYM[kind];
  const c = kind === 'C' ? '#efecee' : TYPE_COLOR[type];
  return {
    defs: `<radialGradient id="${id}-p${i}" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="${mix(c, '#ffffff', 0.35)}"/><stop offset="1" stop-color="${mix(c, '#000000', 0.2)}"/></radialGradient>`,
    paint: (cx, cy, r) => {
      const fill = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-p${i})"/>`;
      if (type === 'darkness')
        return (
          fill +
          `<circle cx="${cx}" cy="${cy + 0.3}" r="${r * 0.62}" fill="#111"/>`
        );
      const s = r * 3.3;
      return (
        fill +
        `<image href="${maskUri(type, 'black')}" x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}"/>`
      );
    },
  };
};

const pips = (id, list) => {
  const n = list.length;
  const r = n >= 4 ? 6.6 : n === 3 ? 7.4 : 8.2;
  const step = n >= 4 ? 17.5 : n === 3 ? 20 : 23;
  let defs = '';
  let out = '';
  list.forEach((kind, i) => {
    const a = 45 + (i - (n - 1) / 2) * step;
    const [cx, cy] = pol(a, 40.6);
    const f = pipFill(id, kind, i);
    defs +=
      f.defs +
      `<clipPath id="${id}-pc${i}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
    out +=
      `<circle cx="${cx}" cy="${cy}" r="${r + 1.1}" fill="#1a1a1a"/>` +
      f.paint(cx, cy, r) +
      `<ellipse cx="${cx - r * 0.3}" cy="${cy - r * 0.45}" rx="${r * 0.5}" ry="${r * 0.25}" fill="#fff" opacity="0.55"/>`;
  });
  return { defs, out };
};

export const renderToken = (id, card, size = 168) => {
  const b = body(id, card.body);
  const bz = BEZEL[card.bezel || 'special'];
  const p = pips(id, card.pips || []);
  const glyph = card.glyph(id);
  const prismMark =
    card.bezel === 'prism'
      ? `<g transform="translate(50 94.2)"><path d="M0 -4.6 L4.6 0 L0 4.6 L-4.6 0Z" fill="#1a1a1a"/><path d="M0 -2.6 L2.6 0 L0 2.6 L-2.6 0Z" fill="#fff"/></g>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
<defs>
<linearGradient id="${id}-bz" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${bz[0]}"/><stop offset="0.35" stop-color="${bz[1]}"/><stop offset="0.75" stop-color="${bz[2]}"/><stop offset="1" stop-color="${bz[3]}"/></linearGradient>
<clipPath id="${id}-clip"><circle cx="50" cy="50" r="43.6"/></clipPath>
<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">${glyph}</mask>
<linearGradient id="${id}-gl" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
${b.defs}${p.defs}
</defs>
<circle cx="50" cy="50" r="49.4" fill="#1b1308"/>
<circle cx="50" cy="50" r="48.6" fill="url(#${id}-bz)"/>
<circle cx="50" cy="50" r="46.6" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="0.8"/>
<circle cx="50" cy="50" r="44.3" fill="#1b1308" opacity="0.75"/>
${b.paint}
<rect width="100" height="100" fill="#121212" mask="url(#${id}-m)"/>
<path d="M14 46 C15 28 30 14 50 12.5 C35 18 22 30 19 47 Z" fill="url(#${id}-gl)" opacity="0.85"/>
<ellipse cx="33" cy="22.5" rx="5.5" ry="2.4" transform="rotate(-38 33 22.5)" fill="#fff" opacity="0.7"/>
${prismMark}
${p.out}
</svg>`;
};
