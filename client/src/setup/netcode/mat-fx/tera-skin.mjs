// Design 037: the persistent Tera crystal skin, pure half. Which in-play
// Pokémon wear it, and the per-card art (facet mesh, glint spots) that
// tera-skin.js lays over them. Seeded by instanceId so a card keeps the same
// facets across re-renders.
import { isPokemon } from '../../../../../shared/engine/cards.mjs';
import { topPokemonCard } from '../../../../../shared/engine/rules/evolved-pokemon.mjs';
import { signatureEntryKind } from './entry-kind.mjs';
import { seededRandom } from './flow-pose.mjs';
import { TERA_PALETTE } from './tera-crystal.mjs';

export const TERA_SKIN_SIDES = ['you', 'them'];
export const TERA_SKIN_ZONES = ['active', 'bench'];

/**
 * The instanceIds of the visible (top) card of every in-play Tera Pokémon.
 *
 * @param {(side: string, zoneId: string) => object[]} zoneArrayOf
 * @param {{ has: (id: unknown) => boolean }} [held] ids whose skin waits (entry playing)
 * @returns {Set<unknown>}
 */
export function teraSkinTargets(zoneArrayOf, held = new Set()) {
  const targets = new Set();
  if (typeof zoneArrayOf !== 'function') return targets;
  for (const side of TERA_SKIN_SIDES) {
    for (const zoneId of TERA_SKIN_ZONES) {
      const zone = zoneArrayOf(side, zoneId);
      if (!Array.isArray(zone)) continue;
      const cards = zone.filter((card) => card && typeof card === 'object');
      for (const root of cards) {
        if (root.attachedTo != null || !isPokemon(root)) continue;
        const top = topPokemonCard(cards, root);
        if (signatureEntryKind(top) !== 'tera') continue;
        if (top.instanceId == null || held.has(top.instanceId)) continue;
        targets.add(top.instanceId);
      }
    }
  }
  return targets;
}

/**
 * The skin bookkeeping without the DOM: which node wears which id's skin, and
 * which ids are held back while their entry animation still hides the card.
 * `refresh` diffs the wanted skins against the applied ones, so a card whose
 * node changed (a holo wrapper arrived) moves its skin to the new node.
 *
 * @param {object} hooks
 * @param {(held: Map<unknown, unknown>) => Iterable<unknown>} hooks.targetIds ids that want a skin
 * @param {(id: unknown) => object | null} hooks.nodeFor the node showing that card, if any
 * @param {(node: object, id: unknown) => void} hooks.apply
 * @param {(node: object) => void} hooks.remove
 * @param {(fn: () => void, ms: number) => unknown} hooks.schedule
 * @param {(handle: unknown) => void} hooks.cancel
 */
export function createSkinReconciler({
  targetIds,
  nodeFor,
  apply,
  remove,
  schedule,
  cancel,
}) {
  const applied = new Map();
  const held = new Map();

  function refresh() {
    const wanted = new Map();
    for (const id of targetIds(held)) {
      const node = nodeFor(id);
      if (node) wanted.set(id, node);
    }
    for (const [id, node] of applied) {
      if (wanted.get(id) === node) continue;
      remove(node);
      applied.delete(id);
    }
    for (const [id, node] of wanted) {
      if (applied.has(id)) continue;
      apply(node, id);
      applied.set(id, node);
    }
  }

  /** Keeps `id`'s skin off for `ms`, then refreshes so it goes on. */
  function hold(id, ms) {
    if (id == null || !(ms > 0)) return;
    if (held.has(id)) cancel(held.get(id));
    held.set(
      id,
      schedule(() => {
        held.delete(id);
        refresh();
      }, ms)
    );
    const node = applied.get(id);
    if (!node) return;
    remove(node);
    applied.delete(id);
  }

  return { refresh, hold };
}

/** A 32-bit seed from a numeric or string id (FNV-1a for strings). */
export function skinSeed(id) {
  if (typeof id === 'number' && Number.isFinite(id))
    return Math.abs(Math.trunc(id)) >>> 0;
  let hash = 0x811c9dc5;
  for (const ch of String(id ?? '')) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export const FACET_VIEW = { width: 100, height: 140, cols: 4, rows: 6 };
const FACET_JITTER = 0.32; // of a cell, interior points only
const hex = (rgb) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const darken = (rgb, t) => rgb.map((v) => Math.round(v * (1 - t)));

// Mostly clear glass with bright and deep planes, like the clip's crystal
// skin; the coloured planes take the palette's (type's) crystal tones.
const facetFills = (palette) => [
  ['#ffffff', 0.34],
  ['#ffffff', 0.18],
  [hex(palette.ice), 0.28],
  [hex(palette.cyan), 0.22],
  [hex(palette.deep), 0.2],
  [hex(darken(palette.deep, 0.45)), 0.26],
];

/** Grid points for the facet mesh; the border stays on the card edge. */
function facetPoints(rand) {
  const { width, height, cols, rows } = FACET_VIEW;
  const cw = width / cols;
  const ch = height / rows;
  const points = [];
  for (let r = 0; r <= rows; r += 1) {
    const row = [];
    for (let c = 0; c <= cols; c += 1) {
      const interiorX = c > 0 && c < cols;
      const interiorY = r > 0 && r < rows;
      const jx = interiorX ? (rand() * 2 - 1) * FACET_JITTER * cw : 0;
      const jy = interiorY ? (rand() * 2 - 1) * FACET_JITTER * ch : 0;
      row.push([c * cw + jx, r * ch + jy]);
    }
    points.push(row);
  }
  return points;
}

const f1 = (n) => Math.round(n * 10) / 10;

/**
 * Low-poly facet mesh (two triangles per grid cell) as a standalone SVG,
 * viewBox 0 0 100 140, attributes single-quoted for svgDataUrl.
 *
 * @param {unknown} seed instanceId or number
 * @param {typeof TERA_PALETTE} [palette] from `teraPaletteFor` (the card's type)
 * @returns {{ svg: string, triangles: number[][][] }}
 */
export function teraSkinFacets(seed, palette = TERA_PALETTE) {
  const rand = seededRandom(skinSeed(seed));
  const fills = facetFills(palette);
  const { width, height, cols, rows } = FACET_VIEW;
  const p = facetPoints(rand);
  const triangles = [];
  const polys = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const [a, b, cc, d] = [
        p[r][c],
        p[r][c + 1],
        p[r + 1][c + 1],
        p[r + 1][c],
      ];
      const pair =
        rand() < 0.5
          ? [
              [a, b, cc],
              [a, cc, d],
            ]
          : [
              [a, b, d],
              [b, cc, d],
            ];
      for (const tri of pair) {
        const [fill, opacity] = fills[Math.floor(rand() * fills.length)];
        triangles.push(tri);
        const pts = tri.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
        polys.push(
          `<polygon points='${pts}' fill='${fill}' fill-opacity='${opacity}'/>`
        );
      }
    }
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' preserveAspectRatio='none'>` +
    `<g stroke='#ffffff' stroke-opacity='0.55' stroke-width='0.5' stroke-linejoin='round'>${polys.join('')}</g></svg>`;
  return { svg, triangles };
}

export const TERA_SKIN_GLINTS = 3;

/**
 * Where the rim glints sit (percent of the card box, kept off the very edge),
 * their size (fraction of card width) and twinkle delay (s), staggered.
 *
 * @param {unknown} seed
 * @returns {{ x: number, y: number, size: number, delay: number }[]}
 */
export function teraSkinGlints(seed) {
  const rand = seededRandom(skinSeed(seed) ^ 0x9e3779b9);
  return Array.from({ length: TERA_SKIN_GLINTS }, (_, i) => ({
    x: f1(10 + rand() * 80),
    y: f1(8 + rand() * 84),
    size: f1((0.28 + rand() * 0.16) * 100) / 100,
    delay: f1(i * 1.1 + rand() * 0.6),
  }));
}

/**
 * The CSS custom properties that colour the skin's tint, rim and glints
 * (css/mat-ambient.css), as `r, g, b` triplets for `rgba(var(--x), a)`.
 *
 * @param {typeof TERA_PALETTE} [palette] from `teraPaletteFor` (the card's type)
 * @returns {Record<string, string>}
 */
export function teraSkinColors(palette = TERA_PALETTE) {
  return {
    '--fx-tera-deep': palette.deep.join(', '),
    '--fx-tera-ice': palette.ice.join(', '),
    '--fx-tera-cyan': palette.cyan.join(', '),
  };
}
