// Design 034: static artwork for the signature entries — SVG markup and the
// Mega field's hex tile. Pure strings (no DOM), so the geometry is unit-tested.

const f2 = (n) => Number(n.toFixed(2));

/** Pointy-top hexagon corners around (cx, cy) as an SVG `points` string. */
export function hexPoints(cx, cy, radius) {
  const pts = [];
  for (let k = 0; k < 6; k += 1) {
    const a = ((60 * k - 90) * Math.PI) / 180;
    pts.push(
      `${f2(cx + radius * Math.cos(a))},${f2(cy + radius * Math.sin(a))}`
    );
  }
  return pts.join(' ');
}

// Cell fills for the Mega field's two hex layers, one row per lattice row
// (rows must come in pairs so the offset rows tile). The white 3 x 4 tile and
// the tinted 5 x 6 tile repeat at different periods, so together the lit
// cells only line up again every 15 columns and 12 rows.
export const HEX_WHITE_CELLS = [
  ['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.2)'],
  [
    'rgba(255,255,255,0.12)',
    'rgba(255,255,255,0.42)',
    'rgba(255,255,255,0.02)',
  ],
  [
    'rgba(255,255,255,0.04)',
    'rgba(255,255,255,0.24)',
    'rgba(255,255,255,0.38)',
  ],
  ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.16)'],
];
export const HEX_TINT_CELLS = [
  [
    'rgba(255,150,210,0.42)',
    'rgba(0,0,0,0)',
    'rgba(150,245,170,0.42)',
    'rgba(0,0,0,0)',
    'rgba(185,160,255,0.42)',
  ],
  [
    'rgba(0,0,0,0)',
    'rgba(120,225,235,0.45)',
    'rgba(0,0,0,0)',
    'rgba(255,200,230,0.35)',
    'rgba(0,0,0,0)',
  ],
  [
    'rgba(150,245,170,0.42)',
    'rgba(0,0,0,0)',
    'rgba(185,160,255,0.42)',
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0)',
  ],
  [
    'rgba(0,0,0,0)',
    'rgba(255,200,230,0.35)',
    'rgba(0,0,0,0)',
    'rgba(120,225,235,0.45)',
    'rgba(255,150,210,0.42)',
  ],
  [
    'rgba(185,160,255,0.42)',
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0)',
    'rgba(150,245,170,0.42)',
    'rgba(0,0,0,0)',
  ],
  [
    'rgba(0,0,0,0)',
    'rgba(255,150,210,0.42)',
    'rgba(120,225,235,0.45)',
    'rgba(0,0,0,0)',
    'rgba(255,200,230,0.35)',
  ],
];

/**
 * A seamlessly repeating tile of pointy-top hexagons, one cell per entry of
 * `cells` (a fill colour each) with light outlines. Cells cut by the tile
 * edge are drawn again from the neighbouring tiles so the seams line up.
 * @returns {{ svg: string, width: number, height: number, cells: number }}
 */
export function hexTile(radius = 12, cells = HEX_WHITE_CELLS) {
  const colW = Math.sqrt(3) * radius;
  const rowH = 1.5 * radius;
  const width = colW * cells[0].length;
  const height = rowH * cells.length;
  const fills = [];
  const outlines = [];
  cells.forEach((row, j) => {
    row.forEach((colour, i) => {
      const cx = i * colW + (j % 2 ? colW / 2 : 0);
      const cy = j * rowH;
      for (const ox of [-width, 0, width]) {
        for (const oy of [-height, 0, height]) {
          const x = cx + ox;
          const y = cy + oy;
          if (
            x <= -radius ||
            x >= width + radius ||
            y <= -radius ||
            y >= height + radius
          )
            continue;
          fills.push(
            `<polygon points='${hexPoints(x, y, radius - 1.1)}' fill='${colour}'/>`
          );
          outlines.push(`<polygon points='${hexPoints(x, y, radius - 0.6)}'/>`);
        }
      }
    });
  });
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${f2(width)}' height='${f2(height)}' viewBox='0 0 ${f2(width)} ${f2(height)}'>` +
    `<g>${fills.join('')}</g>` +
    `<g fill='none' stroke='#fff' stroke-opacity='0.45' stroke-width='0.9'>${outlines.join('')}</g></svg>`;
  return { svg, width: f2(width), height: f2(height), cells: fills.length };
}

/** `url("data:…")` for a standalone SVG string, safe inside a CSS value. */
export const svgDataUrl = (svg) =>
  `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;

// The Tera jewel: six crystal points of uneven length (tallest on top, as on
// the Terastal crown) around a faceted hexagonal gem. viewBox -50 -50 100 100.
const JEWEL_POINTS = [
  [-90, 48],
  [-30, 36],
  [30, 32],
  [90, 28],
  [150, 32],
  [210, 36],
];
const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [f2(r * Math.cos(a)), f2(r * Math.sin(a))];
};

/** Star outline alternating crystal tips and inner notches, as `points`. */
export function jewelStarPoints(notch = 17) {
  const pts = [];
  for (const [deg, r] of JEWEL_POINTS) {
    pts.push(polar(deg, r).join(','));
    pts.push(polar(deg + 30, notch).join(','));
  }
  return pts.join(' ');
}

const JEWEL_FILL_ID = 'fx-tera-jewel-fill';
const JEWEL_FILL_DEFS =
  `<defs><linearGradient id='${JEWEL_FILL_ID}' x1='0' y1='0' x2='0' y2='1'>` +
  `<stop offset='0' stop-color='#ffffff'/><stop offset='0.55' stop-color='#b8ffe6'/><stop offset='1' stop-color='#5fe1b9'/></linearGradient></defs>`;

/**
 * The Tera jewel SVG; `fill` / `edge` are CSS colours for body and facet
 * lines. The gradient is declared only when the fill uses it, so a flat copy
 * never repeats its id in the document.
 */
export function teraJewelSvg({
  fill = `url(#${JEWEL_FILL_ID})`,
  edge = '#fff',
} = {}) {
  const defs = fill.includes(`#${JEWEL_FILL_ID}`) ? JEWEL_FILL_DEFS : '';
  const gem = hexPoints(0, 0, 13);
  const spokes = [-90, 30, 150]
    .map((deg) => {
      const [x, y] = polar(deg, 13);
      return `<line x1='0' y1='0' x2='${x}' y2='${y}'/>`;
    })
    .join('');
  const tips = JEWEL_POINTS.map(([deg, r]) => {
    const [x1, y1] = polar(deg, 13);
    const [x2, y2] = polar(deg, r - 4);
    return `<line x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}'/>`;
  }).join('');
  return (
    `<svg viewBox='-50 -50 100 100' aria-hidden='true'>` +
    defs +
    `<polygon points='${jewelStarPoints()}' fill='${fill}' stroke='${edge}' stroke-width='2.4' stroke-linejoin='round'/>` +
    `<polygon points='${gem}' fill='rgba(255,255,255,0.55)' stroke='${edge}' stroke-width='2'/>` +
    `<g stroke='${edge}' stroke-width='1.4' stroke-opacity='0.85'>${spokes}${tips}</g></svg>`
  );
}

// Facets drawn over the Tera crystal slab (a hexagonal prism seen head-on).
export const TERA_FACETS_SVG = `<svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
  <polygon points="0,0 100,0 100,30 72,48 50,30 28,48 0,30" fill="rgba(255,255,255,0.22)"/>
  <polygon points="100,30 100,110 72,86 72,48" fill="rgba(0,60,40,0.1)"/>
  <polygon points="0,30 28,48 28,86 0,110" fill="rgba(255,255,255,0.1)"/>
  <polygon points="0,110 28,86 50,104 72,86 100,110 100,140 0,140" fill="rgba(0,60,40,0.12)"/>
  <polygon points="28,48 50,30 72,48 50,62" fill="rgba(255,255,255,0.35)"/>
  <polygon points="28,48 50,62 50,104 28,86" fill="rgba(255,255,255,0.16)"/>
  <g fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.4" vector-effect="non-scaling-stroke">
    <polygon points="50,30 72,48 72,86 50,104 28,86 28,48"/>
    <polyline points="28,48 50,62 72,48"/><line x1="50" y1="62" x2="50" y2="104"/>
    <line x1="50" y1="30" x2="50" y2="0"/><line x1="72" y1="48" x2="100" y2="30"/>
    <line x1="72" y1="86" x2="100" y2="110"/><line x1="50" y1="104" x2="50" y2="140"/>
    <line x1="28" y1="86" x2="0" y2="110"/><line x1="28" y1="48" x2="0" y2="30"/>
  </g>
</svg>`;

export const MEGA_ORANGE = '#ff8a2a';
export const MEGA_BLUE = '#2ab8ff';

/**
 * One tapered brush stroke, drawn vertically: fat head at the bottom, thin
 * tail at the top, bulging to +x (away from the orbit centre on its left).
 */
export function megaSlashSvg(colour) {
  const core = colour === 'orange' ? MEGA_ORANGE : MEGA_BLUE;
  const light = colour === 'orange' ? '#ffc38a' : '#9be6ff';
  return (
    `<svg viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true">` +
    `<path d="M4 0 C20 22 24 62 12 100 C9 98 4 94 2 88 C12 62 12 30 4 0 Z" fill="${core}"/>` +
    `<path d="M5 6 C16 28 18 60 12 90 C12 60 12 34 5 6 Z" fill="${light}"/>` +
    `</svg>`
  );
}
