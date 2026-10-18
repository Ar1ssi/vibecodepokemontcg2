// Line citations of self-containers.css, table-tilt.mjs and apply-table-tilt.js name the retired
// iframe board (deleted in design 074 G3) as the source of these constants; the numbers stay.
/**
 * Zone geometry for the three.js board (design 074 §D2), in FLAT TABLE px.
 *
 * Reproduces what `layoutToCssVars` (mat-layouts.mjs) plus the container
 * stylesheet place on screen today, before the tilt, so the 3D scene puts
 * every card where the iframe board does.
 *
 * Frame: origin at the `table-tilt.mjs` pivot, the centre of the near
 * PLAYFIELD's bottom edge; x to the right, y up the table. The playfield is
 * the iframe minus its cropped hand strip (`#playfield` height
 * `calc(100vh - var(--hand-crop-height))`, self-containers.css:413), so with
 * `half` the iframe box the seam sits at `depth = half.h * (1 - HAND_CROP_FRAC)`
 * (`battleMatBox().depth`) and the far edge at `2 * depth`. The hand strip
 * lies below the pivot (y < 0).
 *
 * Every zone is `position: fixed` inside `#playfield`, whose transform makes
 * it the containing block: `%` resolve against the playfield (W = half.w,
 * D = depth), `vw`/`vh` against the iframe (half.w / half.h). `#playfield`'s
 * `zoom: 2` is undone by the tilt's `scale(0.5)` (table-tilt.mjs OVERSAMPLE),
 * so flat px equal the specified CSS lengths.
 *
 * Pure and DOM-free so it runs under `node --test`.
 */

import { getMatLayout } from '../sizing/mat-layouts.mjs';

/** `--hand-crop-height: 16vh` (self-containers.css:43): the hand strip's share of the iframe. */
export const HAND_CROP_FRAC = 0.16;
/** Iframe box as a share of the viewport: `.self`/`.opp` are 75.5% × 50% (index.css:186-202). */
export const IFRAME_WIDTH_FRAC = 0.755;
export const IFRAME_HEIGHT_FRAC = 0.5;
/** `--card-aspect` default (holo/base.css:90): in-play cards, prizes and the Stadium. */
export const PLAY_CARD_ASPECT = 0.718;
/** `--deck-card-aspect` (self-containers.css:67): deck stack layers and pile covers. */
export const PILE_CARD_ASPECT = 0.716;
/** `#board { padding: 5px }` with the default content-box sizing (self-containers.css:815). */
const BOARD_PADDING_PX = 5;
/** `#prizes` columns `13.67% 72.66% 13.67%` (self-containers.css:616). */
const PRIZE_EDGE_TRACK = 0.1367;
/** `#prizes > :nth-child(2n+1) { transform: translateY(6.75%) }` (self-containers.css:647-651). */
const PRIZE_BACK_DROP = 0.0675;
const PRIZE_ROWS = 3;
const PRIZE_SLOTS = 6;
const BENCH_COLUMNS = 5;

/** Body classes that widen `.self`/`.opp` to the full viewport (index.css:43-50, 3776-3797). */
export const FULL_WIDTH_CLASSES = ['side-menu-collapsed', 'sidebox-hidden'];

/** The board's share of the viewport width: all of it while the side menu is collapsed or hidden. */
export function boardWidthFrac(classList) {
  return FULL_WIDTH_CLASSES.some((name) => classList?.contains?.(name)) ? 1 : IFRAME_WIDTH_FRAC;
}

/** `.self`/`.opp` iframe box for a viewport (index.css:186-202). */
export function halfFromViewport(viewport, widthFrac = IFRAME_WIDTH_FRAC) {
  return {
    w: viewport.w * widthFrac,
    h: viewport.h * IFRAME_HEIGHT_FRAC,
  };
}

/** Near playfield height: the seam's distance from the pivot. */
export function depthOf(half) {
  return half.h * (1 - HAND_CROP_FRAC);
}

/**
 * One CSS length in px. `units.pct` is px per 1%; `vw`/`vh` px per unit.
 * Unitless numbers are px.
 */
function lengthPx(value, units) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  const num = Number.parseFloat(text);
  if (!Number.isFinite(num)) return 0;
  if (text.endsWith('%')) return num * units.pct;
  if (text.endsWith('vw')) return num * units.vw;
  if (text.endsWith('vh')) return num * units.vh;
  return num;
}

const isPercent = (value) => typeof value === 'string' && value.trim().endsWith('%');

/**
 * The mat box `layoutToCssVars` describes for an aspect-locked profile
 * (`--mat-height`, `--mat-width`, `--mat-offset-x/y`), or null when the
 * profile has no aspect and its zones use the raw percentages.
 */
function matBox(profile, { containerW, halfHeight, scale }) {
  const aspect = Number(profile.aspectRatio);
  if (!profile.aspectRatio || !Number.isFinite(aspect) || aspect <= 0) return null;
  const height = halfHeight * scale;
  const widthIn = (context) => Math.min(context, height * aspect);
  const width = widthIn(containerW);
  return {
    height,
    width,
    widthIn,
    offsetX: Math.max(0, (containerW - width) / 2),
    offsetY: Math.max(0, (halfHeight - height) / 2),
  };
}

/**
 * Resolves one zone of a profile into a playfield box `{ left, bottom, width,
 * height }` (px from the playfield's left and bottom edges), mirroring the
 * scaleLeft/scaleRight/scaleBottom/scaleH/scaleV helpers of `layoutToCssVars`.
 */
function zoneBox(zone, frame) {
  const { W, D, units, mat } = frame;
  const horizontal = { ...units, pct: W / 100 };
  const vertical = { ...units, pct: D / 100 };
  const across = (value, edge) =>
    mat && isPercent(value)
      ? (edge ? mat.offsetX : 0) + (mat.width * Number.parseFloat(value)) / 100
      : lengthPx(value, horizontal);
  const up = (value, edge) =>
    mat && isPercent(value)
      ? (edge ? mat.offsetY : 0) + (mat.height * Number.parseFloat(value)) / 100
      : lengthPx(value, vertical);
  const width = across(zone.width, false);
  const left = zone.left !== undefined ? across(zone.left, true) : W - across(zone.right, true) - width;
  return { left, bottom: up(zone.bottom, true), width, height: up(zone.height, false) };
}

/** Playfield box → flat rect (x from the pivot, y up from the pivot). */
const toFlat = (box, W) => ({ x: box.left - W / 2, y: box.bottom, w: box.width, h: box.height });

/** `object-fit: contain` / `min(100cqw, 100cqh * aspect)` card inside a box. */
const containCard = (box, aspect) => ({
  w: Math.min(box.w, box.h * aspect),
  h: Math.min(box.h, box.w / aspect),
});

/**
 * Bench slots: `grid-template-columns: repeat(5, 1fr)` with `gap: var(--bench-gap)`
 * (self-containers.css:575-588). A `%` gap resolves against the bench's own
 * width; an aspect profile's gap is `calc(var(--mat-width) * k)`, and that
 * `--mat-width`'s `100%` also resolves against the bench.
 */
function benchGeometry(zone, benchRect, frame) {
  const gapValue = zone.gap;
  let gap;
  if (frame.mat && isPercent(gapValue)) {
    gap = (frame.mat.widthIn(benchRect.w) * Number.parseFloat(gapValue)) / 100;
  } else {
    gap = lengthPx(gapValue, { ...frame.units, pct: benchRect.w / 100 });
  }
  const columnW = (benchRect.w - (BENCH_COLUMNS - 1) * gap) / BENCH_COLUMNS;
  return { gap, columnW, pitch: columnW + gap };
}

const benchSlotAt = (benchRect, geometry, index) => ({
  x: benchRect.x + index * geometry.pitch,
  y: benchRect.y,
  w: geometry.columnW,
  h: benchRect.h,
});

/**
 * Prize slots in DOM order (self-containers.css:607-672): three rows of two
 * overlapping cards. Odd children (slots 0, 2, 4) span the first two column
 * tracks and drop 6.75% of their height; even children (1, 3, 5) span the
 * last two and sit on top. Every profile has `columns: 2`, and the stylesheet
 * never reads `--prizes-columns`, so the grid is always two across.
 */
function prizeSlots(prizesRect) {
  const rowH = prizesRect.h / PRIZE_ROWS;
  const slotW = prizesRect.w * (1 - PRIZE_EDGE_TRACK);
  const slots = [];
  for (let index = 0; index < PRIZE_SLOTS; index++) {
    const row = Math.floor(index / 2);
    const isBack = index % 2 === 0;
    const top = prizesRect.y + prizesRect.h - row * rowH;
    slots.push({
      x: prizesRect.x + (isBack ? 0 : prizesRect.w * PRIZE_EDGE_TRACK),
      y: top - rowH - (isBack ? rowH * PRIZE_BACK_DROP : 0),
      w: slotW,
      h: rowH,
    });
  }
  return slots;
}

/**
 * The Stadium lives on the parent page (`#stadium`, index.css:384-401),
 * fixed to the viewport: `vh`/`%` resolve against the viewport, an aspect
 * profile's mat box against the parent's `--mat-half-height: 50vh` and
 * `--mat-container-width` (index.css:32-37), which is the iframe width.
 * `stadiumTilt` puts it in the mat's plane about the same pivot, so its flat
 * y is its `bottom` minus the near hand strip.
 */
function stadiumRect(zone, { half, viewport, scale, profile }) {
  if (!zone) return null;
  const halfHeight = viewport.h * IFRAME_HEIGHT_FRAC;
  const mat = matBox(profile, { containerW: half.w, halfHeight, scale });
  const units = { vw: viewport.w / 100, vh: viewport.h / 100 };
  const box = zoneBox(
    { bottom: zone.bottom, left: zone.left, height: zone.height, width: 0 },
    { W: viewport.w, D: viewport.h, units, mat }
  );
  const cropPx = half.h * HAND_CROP_FRAC;
  return {
    x: box.left - half.w / 2,
    y: box.bottom - cropPx,
    w: box.height * PLAY_CARD_ASPECT,
    h: box.height,
  };
}

/** 180° rotation about the seam centre `(0, depth)`, kept as a positive-size rect. */
function mirrorRect(rect, depth) {
  return { x: -(rect.x + rect.w), y: 2 * depth - (rect.y + rect.h), w: rect.w, h: rect.h };
}

function mirrorSide(side, depth) {
  return {
    active: mirrorRect(side.active, depth),
    bench: side.bench.map((rect) => mirrorRect(rect, depth)),
    prizes: side.prizes.map((rect) => mirrorRect(rect, depth)),
    deck: mirrorRect(side.deck, depth),
    discard: mirrorRect(side.discard, depth),
    lostZone: mirrorRect(side.lostZone, depth),
    board: mirrorRect(side.board, depth),
    hand: {
      baselineY: 2 * depth - side.hand.baselineY,
      edgeY: 2 * depth - side.hand.edgeY,
      width: side.hand.width,
    },
    cardBox: side.cardBox,
    benchPitch: side.benchPitch,
  };
}

/**
 * Zone rects for both seats in flat table px. Rects are `{ x, y, w, h }` with
 * `(x, y)` the corner nearest the origin's (-x, -y) side: left edge and the
 * edge nearest the near table edge.
 *
 * Card boxes (the card image inside each zone):
 * - active: `#active div { height: 100% }` + `.play-container img { height: 100%;
 *   width: auto }` (self-containers.css:592-606, :861-870): zone height, width by
 *   aspect, centred, bottom-aligned.
 * - bench: the same rule inside a grid cell (`#bench div { height: 100% }`, :589).
 * - prizes: `object-fit: contain` in the slot (:620-629).
 * - deck/discard/lostZone: `min(100cqw, 100cqh * aspect)` (#deckStack layers,
 *   :754-755) and `max-width/max-height: 100%` covers (:695-701, :722-729,
 *   :794-801), top-aligned and centred. `pile` is the deck's.
 * - hand: `#hand` sits `--hand-crop-height` below the iframe bottom and is three
 *   strips tall; cards are two strips tall on its bottom (:427-445, :467-472), so
 *   their bottom edge (`baselineY`) is two strips below the pivot and the
 *   iframe's bottom edge (`edgeY`, the screen edge that crops them) one strip.
 *
 * @param {object} [profile] a mat-layouts profile (default `sim`)
 * @param {{ w: number, h: number }} half one player's iframe box in CSS px
 * @param {{ viewport?: { w: number, h: number }, matScale?: number }} [options]
 *   `viewport` resolves the Stadium's viewport units (default: the viewport
 *   the iframe box implies); `matScale` is `--mat-scale` (default 1).
 */
export function flatLayout(profile, half, { viewport, matScale = 1 } = {}) {
  const resolved = profile && profile.zones ? profile : getMatLayout(profile);
  const zones = resolved.zones;
  const W = half.w;
  const D = depthOf(half);
  const view = viewport || { w: half.w / IFRAME_WIDTH_FRAC, h: half.h / IFRAME_HEIGHT_FRAC };
  const frame = {
    W,
    D,
    units: { vw: half.w / 100, vh: half.h / 100 },
    mat: matBox(resolved, { containerW: W, halfHeight: D, scale: matScale }),
  };
  const rectOf = (zone) => toFlat(zoneBox(zone, frame), W);

  const active = rectOf(zones.active);
  const benchRect = rectOf(zones.bench);
  const geometry = benchGeometry(zones.bench, benchRect, frame);
  const prizesRect = rectOf(zones.prizes);
  const prizes = prizeSlots(prizesRect);
  const deck = rectOf(zones.deck);
  const discard = rectOf(zones.discard);
  const lostZone = rectOf(zones.lostZone);
  const boardBox = rectOf(zones.board);
  const board = {
    x: boardBox.x,
    y: boardBox.y,
    w: boardBox.w + 2 * BOARD_PADDING_PX,
    h: boardBox.h + 2 * BOARD_PADDING_PX,
  };
  const cropPx = half.h * HAND_CROP_FRAC;
  const handCardH = 2 * cropPx;

  const self = {
    active,
    bench: Array.from({ length: BENCH_COLUMNS }, (_, i) => benchSlotAt(benchRect, geometry, i)),
    prizes,
    deck,
    discard,
    lostZone,
    board,
    hand: { baselineY: -2 * cropPx, edgeY: -cropPx, width: W },
    cardBox: {
      active: { w: active.h * PLAY_CARD_ASPECT, h: active.h },
      bench: { w: benchRect.h * PLAY_CARD_ASPECT, h: benchRect.h },
      prizes: containCard(prizes[0], PLAY_CARD_ASPECT),
      pile: containCard(deck, PILE_CARD_ASPECT),
      deck: containCard(deck, PILE_CARD_ASPECT),
      discard: containCard(discard, PILE_CARD_ASPECT),
      lostZone: containCard(lostZone, PILE_CARD_ASPECT),
      hand: { w: handCardH * PLAY_CARD_ASPECT, h: handCardH },
    },
    benchPitch: geometry.pitch,
  };

  return {
    half: { w: half.w, h: half.h },
    depth: D,
    self,
    opp: mirrorSide(self, D),
    stadium: stadiumRect(zones.stadium, { half, viewport: view, scale: matScale, profile: resolved }),
  };
}

/**
 * Bench slot `index` for `side`. Slots past the fifth (legacy decks) continue
 * the row at the same pitch (design 074 edge case 6).
 */
export function benchSlotRect(layout, side, index) {
  const slots = layout[side].bench;
  if (index < slots.length) return slots[index];
  const self = layout.self.bench;
  const last = self[self.length - 1];
  const rect = { ...last, x: last.x + (index - (self.length - 1)) * layout.self.benchPitch };
  return side === 'opp' ? mirrorRect(rect, layout.depth) : rect;
}

const contains = (rect, point) =>
  point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;

/** Prize slots front to back: z-index 2 (DOM-later first), then z-index 1. */
const PRIZE_HIT_ORDER = [5, 3, 1, 4, 2, 0];

/**
 * Index of the slot of `zone` on `side` whose rect contains the flat point,
 * or -1. Single-rect zones (active, deck, discard, lostZone, board) answer 0.
 * Overlapping prize slots resolve to the one drawn on top.
 */
export function slotIndexAt(layout, side, zone, point) {
  const target = layout?.[side]?.[zone];
  if (!target || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return -1;
  if (!Array.isArray(target)) return contains(target, point) ? 0 : -1;
  const order = zone === 'prizes' ? PRIZE_HIT_ORDER : target.map((_, i) => i);
  for (const index of order) {
    if (target[index] && contains(target[index], point)) return index;
  }
  return -1;
}
