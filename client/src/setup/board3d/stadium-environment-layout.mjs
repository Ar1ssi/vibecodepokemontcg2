// Design 077: which Stadium has a board, and where each board's landmarks stand (Scorched Earth's
// volcano, Stormy Mountains' crater and peaks), from the board layout (board-layout.mjs flatLayout)
// and the board's own card poses (card-poses.mjs, pile-poses.mjs), so the environment fits every mat
// profile and never moves or covers a card. Pure: no three.js, no DOM.
import { CARD_UNITS } from './card-geometry.mjs';
import { benchSlotRect } from './board-layout.mjs';
import { PILE_ZONES, pilePose, prizeSlotPose } from './pile-poses.mjs';
import { tableBounds } from './table-uv.mjs';

/** Homebrew Stadiums that have a board, by card id (customhb set.json). */
const ENVIRONMENT_BY_CARD = {
  'customhb-030': 'forest-of-vitality',
  'customhb-051': 'stormy-mountains',
  'customhb-052': 'crystal-cave',
  'customhb-162': 'steel-shelter',
  'customhb-163': 'full-metal-lab',
  'customhb-197': 'mystery-garden',
  'customhb-198': 'old-cemetery',
  'customhb-199': 'dimension-valley',
  'customhb-209': 'surfing-beach',
  'customhb-212': 'brooklet-hill',
  'customhb-239': 'fighting-stadium',
  'customhb-240': 'mountain-ring',
  'customhb-253': 'perilous-jungle',
  'customhb-254': 'dark-city',
  'customhb-278': 'levincia',
  'customhb-289': 'magma-basin',
  'customhb-299': 'scorched-earth',
  'customhb-362': 'pokemon-center',
};
export const ENVIRONMENT_KEYS = Object.freeze([...new Set(Object.values(ENVIRONMENT_BY_CARD))]);
/** Dev check on the real board: `?stadiumEnv=` or `localStorage[ENVIRONMENT_OVERRIDE_KEY]` forces one on. */
export const ENVIRONMENT_OVERRIDE_KEY = 'ptcg-stadium-env';

/**
 * Room round the table a board's scene runs into, as shares of the table's width (each side) and
 * height (near, far edge). Stormy Mountains' round rim runs past the near and far edges and its cloud
 * sea fills the view round the table, as Perilous Jungle's undergrowth does: the board's cameras see
 * about this far past the table (both presets, 1366 to 2560 px wide windows); out past it the
 * table's own floor shows.
 */
const SCENE_MARGINS = {
  'brooklet-hill': { side: 0.17, near: 0.2, far: 0.34 },
  'crystal-cave': { side: 0.17, near: 0.2, far: 0.34 },
  'dimension-valley': { side: 0.17, near: 0.2, far: 0.34 },
  'forest-of-vitality': { side: 0.17, near: 0.2, far: 0.34 },
  levincia: { side: 0.17, near: 0.2, far: 0.34 },
  'mystery-garden': { side: 0.17, near: 0.2, far: 0.34 },
  'old-cemetery': { side: 0.17, near: 0.2, far: 0.34 },
  'surfing-beach': { side: 0.17, near: 0.2, far: 0.34 },
  'fighting-stadium': { side: 0.17, near: 0.2, far: 0.34 },
  'mountain-ring': { side: 0.17, near: 0.2, far: 0.34 },
  'dark-city': { side: 0.17, near: 0.2, far: 0.34 },
  'full-metal-lab': { side: 0.17, near: 0.2, far: 0.34 },
  'magma-basin': { side: 0.17, near: 0.2, far: 0.34 },
  'stormy-mountains': { side: 0.17, near: 0.2, far: 0.34 },
  'perilous-jungle': { side: 0.17, near: 0.2, far: 0.34 },
  'pokemon-center': { side: 0.17, near: 0.2, far: 0.34 },
  'steel-shelter': { side: 0.17, near: 0.2, far: 0.34 },
};

export const VOLCANO_MAX_RADIUS = 210;
export const VOLCANO_MIN_RADIUS = 48;
/** Free ground kept between the volcano's foot and any card footprint. */
export const VOLCANO_MARGIN_PX = 18;
/** Share of its radius the volcano may run past a table edge (its foot is cut off there). */
export const VOLCANO_EDGE_OVERHANG = 0.2;
const VOLCANO_STEP_PX = 6;
const VOLCANO_SEAM_SPAN_PX = 230;

/** Free floor kept round the Actives and Benches inside the crater's wall. */
export const CRATER_FLOOR_MARGIN_PX = 14;
/** Run of the crater's inner wall, from the floor's edge up to the rim. */
export const CRATER_WALL_RUN_PX = 90;
/** Run of the mountain's outer slope, from the rim down to its foot in the cloud sea. */
export const CRATER_SLOPE_RUN_PX = 170;
/** Gap kept between a peak's base and any card footprint. */
export const PEAK_CARD_GAP_PX = 24;
/** Share of its radius a peak's base may run past a table edge (cut off there). */
export const PEAK_EDGE_OVERHANG = 0.3;
export const PEAK_MIN_RADIUS = 40;
export const PEAK_MAX_RADIUS = 220;
const PEAK_STEP_PX = 8;
const PEAK_ANGLE_SPAN = 0.6;
const PEAK_ANGLE_STEP = 0.04;
/**
 * Stormy Mountains' peaks after the card art, by the angle round the mountain's centre each prefers
 * (0 toward the right edge, pi/2 toward the far edge): the lesser peak on the left rim a little
 * toward the near end, the summit on the right rim toward the far end. `out` is where down the outer
 * slope it prefers to stand (0 rim, 1 foot); `steepness` its height over base radius. The card's far
 * peak has no place here: out past the far edge it would lean off the top of the screen.
 */
const PEAK_RECIPES = {
  left: { angle: Math.PI * 1.06, out: 0.1, steepness: 1.3, maxHeight: 210 },
  right: { angle: Math.PI * 0.14, out: 0.1, steepness: 1.6, maxHeight: 280 },
};
/**
 * The ridge each peak runs along the rim toward the near end (the card's summit trails a long one,
 * the lesser peak a short one): its length as a share of the peak's radius, and which way round
 * the mountain it runs (+1 counter-clockwise).
 */
const PEAK_RIDGES = { left: { share: 0.8, turn: 1 }, right: { share: 1.6, turn: -1 } };
/** A ridge's half width as a share of its peak's radius (stadium-env-highland.mjs draws it so). */
export const RIDGE_HALF_WIDTH = 0.6;
const RIDGE_SAMPLES = 10;
/** Least gap kept between the emblem's outline and the Active and Bench cards either side of it. */
export const EMBLEM_CLEARANCE_PX = 12;
const PRIZE_SLOTS = 6;

const CARD_ASPECT = CARD_UNITS.h / CARD_UNITS.w;

const isRect = (rect) => rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0;

const centreOf = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

/** The upright card a pose draws (yaw 0 or 180) as a rect: `widthPx` wide, card-shaped. */
const cardRect = (centre, widthPx) => {
  const h = widthPx * CARD_ASPECT;
  return { x: centre.x - widthPx / 2, y: centre.y - h / 2, w: widthPx, h };
};

const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};

/** One side's Active card where the board's poses draw it, as a one-item list (none: empty). */
const activeRectsOf = (layout, side) => {
  const seat = layout[side];
  return isRect(seat.active) ? [cardRect(centreOf(seat.active), seat.cardBox.active.w)] : [];
};

/** One side's Bench cards, slot by slot, where the board's poses draw them. */
const benchRectsOf = (layout, side) =>
  layout[side].bench.map((_, index) =>
    cardRect(centreOf(benchSlotRect(layout, side, index)), layout[side].cardBox.bench.w)
  );

const SIDES = ['self', 'opp'];

/**
 * Every Active and Bench card of both sides where the board's poses draw them: the arena a
 * board's middle holds (Stormy Mountains' crater floor, Full Metal Lab's dais).
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function arenaRects(layout) {
  if (!layout?.self || !layout?.opp) return [];
  return SIDES.flatMap((side) => [...activeRectsOf(layout, side), ...benchRectsOf(layout, side)]);
}

/**
 * The environment key for the Stadium in play: its card id (`customhb-299`), or the same card
 * named by set and number when the id is missing. Null for any other Stadium or none.
 * @param {{ id?: string, set?: string, number?: string|number }|null|undefined} card
 * @returns {string|null}
 */
export function environmentKeyFor(card) {
  if (!card) return null;
  if (typeof card.id === 'string' && ENVIRONMENT_BY_CARD[card.id]) return ENVIRONMENT_BY_CARD[card.id];
  const number = Number.parseInt(card.number, 10);
  if (card.set !== 'customhb' || !Number.isInteger(number)) return null;
  return ENVIRONMENT_BY_CARD[`customhb-${String(number).padStart(3, '0')}`] ?? null;
}

/**
 * The forced environment of the dev check, from the URL (`?stadiumEnv=scorched-earth`) or local
 * storage; null when neither names a known board. Storage may be absent or throw.
 * @param {{ getItem?: (key: string) => string|null }|null|undefined} storage
 * @param {string} [search] `location.search`
 * @returns {string|null}
 */
export function environmentOverride(storage, search = '') {
  let value = null;
  try {
    value = new URLSearchParams(search).get('stadiumEnv') || storage?.getItem?.(ENVIRONMENT_OVERRIDE_KEY) || null;
  } catch {
    value = null;
  }
  return ENVIRONMENT_KEYS.includes(value) ? value : null;
}

/**
 * The card rects the ground keeps flat, exactly where the board's poses draw cards (card-poses.mjs
 * `slotFor`, pile-poses.mjs): `slabs` (Active, each Bench slot, the Prize block, deck, discard,
 * Lost Zone, Stadium) and `flats` (the Trainer-board rows, where a card can land anywhere along
 * the row).
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ slabs: { x: number, y: number, w: number, h: number }[], flats: { x: number, y: number, w: number, h: number }[] }}
 */
export function environmentFootprints(layout) {
  if (!layout?.self || !layout?.opp) return { slabs: [], flats: [] };
  const slabs = [];
  const flats = [];
  for (const side of SIDES) {
    const seat = layout[side];
    slabs.push(...activeRectsOf(layout, side), ...benchRectsOf(layout, side));
    const prizes = [];
    for (let index = 0; index < PRIZE_SLOTS; index += 1) {
      const pose = prizeSlotPose(side, index, layout);
      if (pose) prizes.push(cardRect(pose, pose.widthPx));
    }
    if (prizes.length) slabs.push(union(prizes));
    for (const zone of PILE_ZONES) {
      const pose = pilePose(side, zone, layout);
      if (pose) slabs.push(cardRect(pose, pose.widthPx));
    }
    if (isRect(seat.board)) flats.push(seat.board);
  }
  if (isRect(layout.stadium)) slabs.push(cardRect(centreOf(layout.stadium), layout.stadium.w));
  return { slabs: slabs.filter(isRect), flats };
}

/**
 * The rect a board's scene covers, in table px: the table, widened by the key's SCENE_MARGINS (a
 * board without margins covers the table alone). Zero-sized without a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {string|null} key
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function sceneBounds(layout, key) {
  const bounds = tableBounds(layout);
  const margins = SCENE_MARGINS[key];
  if (!margins || !(bounds.w > 0 && bounds.h > 0)) return bounds;
  const side = bounds.w * margins.side;
  const near = bounds.h * margins.near;
  return { x: bounds.x - side, y: bounds.y - near, w: bounds.w + 2 * side, h: bounds.h * (1 + margins.near + margins.far) };
}

const distanceToRect = (x, y, rect) => {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
};

/**
 * Where the volcano stands: the largest circle with no footprint within its radius plus
 * VOLCANO_MARGIN_PX, running at most VOLCANO_EDGE_OVERHANG of its radius past a table edge, in the
 * band left of the Stadium around the seam, preferring spots near the seam and the Stadium. Null
 * when no circle of VOLCANO_MIN_RADIUS fits.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {{ slabs: object[], flats: object[] }} footprints `environmentFootprints(layout)`
 * @returns {{ x: number, y: number, r: number }|null}
 */
export function volcanoSpot(layout, { slabs = [], flats = [] } = {}) {
  const stadium = layout?.stadium;
  const bounds = tableBounds(layout);
  if (!isRect(stadium) || !(bounds.w > 0)) return null;
  const seam = layout.depth;
  const rects = [...slabs, ...flats];
  let best = null;
  for (let x = bounds.x; x <= stadium.x; x += VOLCANO_STEP_PX) {
    for (let y = seam - VOLCANO_SEAM_SPAN_PX; y <= seam + VOLCANO_SEAM_SPAN_PX; y += VOLCANO_STEP_PX) {
      const edge = Math.min(x - bounds.x, bounds.x + bounds.w - x, y - bounds.y, bounds.y + bounds.h - y);
      let clearance = Infinity;
      for (const rect of rects) clearance = Math.min(clearance, distanceToRect(x, y, rect));
      const r = Math.min(VOLCANO_MAX_RADIUS, clearance - VOLCANO_MARGIN_PX, edge / (1 - VOLCANO_EDGE_OVERHANG));
      if (r < VOLCANO_MIN_RADIUS) continue;
      const score = r - 0.05 * Math.abs(y - seam) - 0.02 * Math.abs(stadium.x - r - x);
      if (!best || score > best.score) best = { x, y, r, score };
    }
  }
  return best && { x: best.x, y: best.y, r: best.r };
}

const cornersOf = (rect) => [
  [rect.x, rect.y],
  [rect.x + rect.w, rect.y],
  [rect.x, rect.y + rect.h],
  [rect.x + rect.w, rect.y + rect.h],
];

/**
 * Stormy Mountains' mountain: a round massif in the table's middle with the crater in its own.
 * `floor` is the crater floor's radius, the smallest circle round that centre holding every Active
 * and Bench card plus CRATER_FLOOR_MARGIN_PX; the wall climbs to the rim CRATER_WALL_RUN_PX further
 * out and the outer slope falls to the foot CRATER_SLOPE_RUN_PX past that. The circle runs past the
 * table's near and far edges, into the scene round it (sceneBounds); the Prize blocks and piles out
 * past the Bench may lie on the wall. Null without an Active or Bench card or a table.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @returns {{ x: number, y: number, floor: number, rim: number, foot: number }|null}
 */
export function craterBowl(layout) {
  const bounds = tableBounds(layout);
  if (!layout?.self || !layout?.opp || !(bounds.w > 0 && bounds.h > 0)) return null;
  const play = SIDES.flatMap((side) => [...activeRectsOf(layout, side), ...benchRectsOf(layout, side)]);
  if (!play.length) return null;
  const x = bounds.x + bounds.w / 2;
  const y = bounds.y + bounds.h / 2;
  const reach = Math.max(...play.flatMap(cornersOf).map(([cx, cy]) => Math.hypot(cx - x, cy - y)));
  const floor = reach + CRATER_FLOOR_MARGIN_PX;
  const rim = floor + CRATER_WALL_RUN_PX;
  return { x, y, floor, rim, foot: rim + CRATER_SLOPE_RUN_PX };
}

/**
 * The largest circle near a recipe's angle, its centre between the crater wall's middle and the
 * foot, clear of every obstacle by PEAK_CARD_GAP_PX and at most PEAK_EDGE_OVERHANG of its radius
 * past a table edge; bigger wins, less turned from the recipe's angle and nearer its spot down the
 * slope wins ties. Null when no circle of PEAK_MIN_RADIUS fits.
 */
const peakFor = (recipe, bowl, bounds, obstacles) => {
  const preferred = bowl.rim + recipe.out * (bowl.foot - bowl.rim);
  let best = null;
  for (let turn = -PEAK_ANGLE_SPAN; turn <= PEAK_ANGLE_SPAN + 1e-9; turn += PEAK_ANGLE_STEP) {
    const angle = recipe.angle + turn;
    for (let out = bowl.rim - CRATER_WALL_RUN_PX / 2; out <= bowl.foot + 1e-9; out += PEAK_STEP_PX) {
      const x = bowl.x + Math.cos(angle) * out;
      const y = bowl.y + Math.sin(angle) * out;
      const edge = Math.min(x - bounds.x, bounds.x + bounds.w - x, y - bounds.y, bounds.y + bounds.h - y);
      if (edge <= 0) continue;
      let clearance = Infinity;
      for (const distanceTo of obstacles) clearance = Math.min(clearance, distanceTo(x, y));
      const r = Math.min(PEAK_MAX_RADIUS, clearance - PEAK_CARD_GAP_PX, edge / (1 - PEAK_EDGE_OVERHANG));
      if (r < PEAK_MIN_RADIUS) continue;
      const score = r - 120 * Math.abs(turn) - 0.15 * Math.abs(out - preferred);
      if (!best || score > best.score) best = { x, y, r, score };
    }
  }
  return best && { x: best.x, y: best.y, r: best.r, h: Math.min(recipe.maxHeight, best.r * recipe.steepness) };
};

/**
 * Where a peak's ridge ends: round the mountain from its summit by the ridge's share of its radius,
 * shortened in tenths until the band RIDGE_HALF_WIDTH of the radius either side of it is clear of
 * every card footprint by PEAK_CARD_GAP_PX; the summit itself when no ridge fits.
 */
const ridgeEndFor = (peak, ridge, bowl, cards) => {
  const summit = { x: peak.x, y: peak.y };
  if (!ridge) return summit;
  const out = Math.hypot(peak.x - bowl.x, peak.y - bowl.y);
  const from = Math.atan2(peak.y - bowl.y, peak.x - bowl.x);
  const room = peak.r * RIDGE_HALF_WIDTH + PEAK_CARD_GAP_PX;
  for (let tenths = Math.round(ridge.share * 10); tenths > 0; tenths -= 1) {
    const angle = from + (ridge.turn * peak.r * tenths) / 10 / out;
    const end = { x: bowl.x + Math.cos(angle) * out, y: bowl.y + Math.sin(angle) * out };
    const clear = Array.from({ length: RIDGE_SAMPLES }, (_, k) => (k + 1) / RIDGE_SAMPLES).every((t) => {
      const x = peak.x + (end.x - peak.x) * t;
      const y = peak.y + (end.y - peak.y) * t;
      return cards.every((distanceTo) => distanceTo(x, y) >= room);
    });
    if (clear) return end;
  }
  return summit;
};

/**
 * Stormy Mountains' peaks (the shapes standing proud of the crater rim in the card art): the lesser
 * one on the left rim, the summit on the right rim (PEAK_RECIPES). Each base is a circle clear of
 * every card footprint by PEAK_CARD_GAP_PX and running at most PEAK_EDGE_OVERHANG of its radius
 * past a table edge; the summit may overlap the lesser peak by half its radius at most. Each trails
 * its ridge (PEAK_RIDGES) to `ridge`, kept as clear of the cards. A peak with no room is null.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {ReturnType<typeof craterBowl>} bowl
 * @returns {{ left: Peak|null, right: Peak|null }}
 *   `Peak = { x, y, r, h, ridge: { x, y } }`: centre, base radius, height and the ridge's end, in
 *   table px.
 */
export function mountainPeaks(layout, bowl) {
  const bounds = tableBounds(layout);
  const peaks = { left: null, right: null };
  if (!bowl || !(bounds.w > 0 && bounds.h > 0)) return peaks;
  const { slabs, flats } = environmentFootprints(layout);
  const cards = [...slabs, ...flats].map((rect) => (x, y) => distanceToRect(x, y, rect));
  const obstacles = [...cards];
  for (const name of Object.keys(peaks)) {
    const spot = peakFor(PEAK_RECIPES[name], bowl, bounds, obstacles);
    if (!spot) continue;
    peaks[name] = { ...spot, ridge: ridgeEndFor(spot, PEAK_RIDGES[name], bowl, cards) };
    obstacles.push((x, y) => Math.hypot(x - spot.x, y - spot.y) - spot.r / 2 + PEAK_CARD_GAP_PX);
  }
  return peaks;
}

/**
 * The Poke Ball emblem etched in the crater floor (the card art's glowing centre): centred on the
 * mountain, its outline midway between the farthest corner of the Actives and the nearest Bench
 * card. Null when that gap is under 2 x EMBLEM_CLEARANCE_PX or there is no Active.
 * @param {ReturnType<typeof import('./board-layout.mjs').flatLayout>|null} layout
 * @param {ReturnType<typeof craterBowl>} bowl
 * @returns {{ x: number, y: number, r: number }|null}
 */
export function craterEmblem(layout, bowl) {
  if (!bowl || !layout?.self || !layout?.opp) return null;
  const { x, y } = bowl;
  const actives = SIDES.flatMap((side) => activeRectsOf(layout, side));
  const benches = SIDES.flatMap((side) => benchRectsOf(layout, side));
  if (!actives.length) return null;
  const inner = Math.max(...actives.flatMap(cornersOf).map(([cx, cy]) => Math.hypot(cx - x, cy - y)));
  const outer = benches.length
    ? Math.min(...benches.map((rect) => distanceToRect(x, y, rect)))
    : inner + 4 * EMBLEM_CLEARANCE_PX;
  if (outer - inner < 2 * EMBLEM_CLEARANCE_PX) return null;
  return { x, y, r: (inner + outer) / 2 };
}
