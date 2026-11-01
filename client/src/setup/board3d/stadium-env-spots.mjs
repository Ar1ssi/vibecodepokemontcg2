// Design 077 (prototype): what the later Stadium boards' layouts start from: the table, every card
// footprint, the scene, the world scale and the opponent's hand, with the clearance tests a board's
// props pass. Pure: no three.js, no DOM.
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

/** Least gap between any prop, seen from above, and a card or the opponent's hand. */
export const PROP_CARD_GAP_PX = 14;

/**
 * The share of a prop's top height (px above the cloth, its ground's rise included) a board adds to
 * its card clearance: the tilted view shows a raised point further across the table than its foot.
 */
export const RISE_LEAN = 0.3;

/** A small deterministic 0..1 from three numbers. */
export const hash = (x, y, salt) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));

export const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};

/** The opponent's hand where the board fans it, past the far edge: the cards' width either side of the middle. */
export const oppHandRect = (layout, core) => {
  const hand = layout.opp?.hand;
  const cardH = layout.opp?.cardBox?.hand?.h ?? 0;
  if (!hand || !(cardH > 0) || !Number.isFinite(hand.baselineY)) return null;
  const halfW = Math.max(Math.abs(core.x), Math.abs(core.x + core.w));
  return { x: -halfW, y: hand.baselineY - cardH, w: 2 * halfW, h: cardH };
};

/**
 * The table frame a board is laid out in. Null without a table or a footprint.
 * `core` is the box round every card footprint; `u` the world scale (a card's width over 100 px);
 * `clear(x, y, r, gap)` is true where a disc of radius r stays `gap` px off every card and the
 * opponent's hand; `inScene(x, y, inset)` where a point lies inside the scene.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {string} key the board's key (its SCENE_MARGINS row)
 */
export function boardContext(layout, key) {
  const table = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(table.w > 0 && table.h > 0)) return null;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats];
  if (!cards.length) return null;
  const core = union(cards);
  const scene = sceneBounds(layout, key);
  const u = (layout.self.cardBox?.active?.w ?? 100) / 100;
  const hand = oppHandRect(layout, core);
  const obstacles = hand ? [...cards, hand] : cards;
  return {
    table,
    scene,
    cards,
    core,
    u,
    hand,
    obstacles,
    centre: { x: table.x + table.w / 2, y: layout.depth },
    clear: (x, y, r, gap = PROP_CARD_GAP_PX) => obstacles.every((rect) => distanceToRect(x, y, rect) >= r + gap),
    inScene: (x, y, inset = 0) => x > scene.x + inset && x < scene.x + scene.w - inset && y > scene.y + inset && y < scene.y + scene.h - inset,
  };
}

/**
 * Design 083: a smooth 0..1 field over the table, `scale` px between its lattice points (value noise:
 * a hashed lattice blended by smoothstep). Boards read it to gather a scatter into patches.
 */
export function patch(x, y, scale = 260, salt = 0) {
  const step = scale > 0 ? scale : 260;
  const gx = x / step;
  const gy = y / step;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, salt);
  const b = hash(ix + 1, iy, salt);
  const c = hash(ix, iy + 1, salt);
  const d = hash(ix + 1, iy + 1, salt);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Design 083: how welcome a scattered piece is at (x, y), 0..1.8: two octaves of `patch` pushed apart
 * by `contrast`, so a scatter accepted at `hash < base * patchy(...)` gathers into thickets and leaves
 * clearings instead of an even polka-dot. Its mean stays near 1, so a board keeps about its count.
 */
export function patchy(x, y, { scale = 260, contrast = 1, salt = 0 } = {}) {
  const field = 0.65 * patch(x, y, scale, salt) + 0.35 * patch(x, y, scale * 0.45, salt + 17);
  const k = Number.isFinite(contrast) ? Math.max(0, contrast) : 1;
  return Math.min(1.8, Math.max(0, 1 + (field - 0.5) * 3.2 * k));
}

/**
 * Design 083: `list` in a deterministic shuffled order (Fisher–Yates by hash), so a cap takes pieces
 * from every part of a margin, not the first rows of a near-to-far scan.
 */
export function shuffled(list, salt = 0) {
  const out = [...(list ?? [])];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(hash(i, out.length, salt) * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Design 083: satellites for a hand-placed clump round a hero piece at (x, y): `count` offsets at
 * hashed angles spread round the circle (never two together) and distances between reach[0] and
 * reach[1] px, each with a size share 0.45..0.8 of the hero's and a seed. Deterministic per salt.
 * @returns {{ x: number, y: number, share: number, seed: number }[]}
 */
export function clumpAround({ x, y }, { count = 3, reach = [30, 60], salt = 0 } = {}) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const [near, far] = reach;
  const start = hash(x, y, salt) * 2 * Math.PI;
  return Array.from({ length: n }, (_, k) => {
    const angle = start + ((k + 0.25 + 0.5 * hash(k, x, salt + 3)) / n) * 2 * Math.PI;
    const distance = near + (far - near) * hash(k, y, salt + 5);
    return { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, share: 0.45 + 0.35 * hash(y, k, salt + 7), seed: hash(k, x + y, salt + 11) };
  });
}

/**
 * Design 083: the part of a board's scene the camera presets see past the cards: the table grown by
 * `grow` of its size each way, clipped to the scene. Drift is born there and clumps stand there, so
 * neither is spent off screen. Null without a table or a scene.
 */
export function visibleArea(table, scene, grow = 0.12) {
  if (!table || !scene || !(table.w > 0 && table.h > 0)) return null;
  const x0 = Math.max(scene.x, table.x - table.w * grow);
  const y0 = Math.max(scene.y, table.y - table.h * grow);
  const x1 = Math.min(scene.x + scene.w, table.x + table.w * (1 + grow));
  const y1 = Math.min(scene.y + scene.h, table.y + table.h * (1 + grow));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
