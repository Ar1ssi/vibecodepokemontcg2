// Design 034: static artwork for the Mega entry — the field's hex tile as SVG
// markup. Pure strings (no DOM), so the geometry is unit-tested.

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
