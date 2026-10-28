// Design 077 (prototype): what the later Stadium boards' layouts start from: the table, every card
// footprint, the scene, the world scale and the opponent's hand, with the clearance tests a board's
// props pass. Pure: no three.js, no DOM.
import { environmentFootprints, sceneBounds } from './stadium-environment-layout.mjs';
import { tableBounds } from './table-uv.mjs';

/** Least gap between any prop, seen from above, and a card or the opponent's hand. */
export const PROP_CARD_GAP_PX = 14;

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
