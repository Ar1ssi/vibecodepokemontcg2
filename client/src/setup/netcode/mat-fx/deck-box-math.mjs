// Design 073: pure math for the deck boxes beside the mat and the opening deal out of them.
//
// Box space (every box-relative number here): y up from the box's floor, +z toward the box's front,
// x to its right, in the deck-box mesh's own units (the box is 6.85 wide, 9.48 tall, 4.3 deep).
// The imported mesh is in mesh space (x mirrored, z down the box's height, y front-to-back); the
// mesh's slot quaternion in scene.json turns it into box space: box (x, y, z) = mesh (−x, −z, −y).
// Table numbers are the three.js board's flat table px (board-layout.mjs): x right, y up the table
// (away from the near player), z off the cloth.

export const BOX_HEIGHT = 9.48;
/** Mesh-space z of the groove that rings the box: the seam between the body and its cap. */
export const LID_CUT_Z = -6.25;
/** card.mesh.json: a sleeved card, sleeve on its +z face. */
export const CARD_SIZE = Object.freeze({ width: 6.4, height: 8.9 });
/** Box-space depth a full deck fills inside the box (60 sleeved cards stand against the back wall). */
export const STACK_DEPTH = 3.84;
/** The stack's back face rests on the inner back wall. */
export const STACK_BACK_Z = -2.0;
/** The stack stands on the inner floor. */
export const STACK_FLOOR_Y = 0.12;
/** At most this many cards fly; the rest of the deck is the stack shrinking to nothing. */
export const MAX_FLYING_CARDS = 24;
/** Box-space width and depth of the box (mesh x ±3.43, y −2.22 … 2.08). */
export const BOX_WIDTH = 6.86;
export const BOX_DEPTH = 4.3;
/** Clear table px a band keeps on each side of a resting box. */
export const BAND_MARGIN_PX = 10;
/** A resting box lies on its back, front art up, its top turned this far off straight up the table. */
export const REST_YAW_DEG = 10;
/** How far beside its deck, toward the mat's centre, the box hovers while it deals (deck widths). */
export const HOVER_OFFSET_DECKS = 1.45;
/** How high the hovering box's centre floats off the cloth (deck-card heights). */
export const HOVER_LIFT_CARDS = 0.4;
/** The hovering box stands up off its back this far, its open top toward the camera, turned toward its deck. */
export const HOVER_PITCH_DEG = 48;
export const HOVER_YAW_DEG = 14;
/** Where a box with no band to rest in comes from: this many box widths past the table's edge. */
export const OFF_TABLE_WIDTHS = 1.2;

/** A flap vertex sits in front of the body's front wall (mesh y < −2.03) and clear of its bottom rim. */
const FLAP_FRONT_Y = -2.03;
const FLAP_FLOOR_Z = -0.3;
/** Vertices this close to the cut outline the walls the cut leaves open. */
const RIM_BAND = 0.35;

/** Mesh-space point → box-space point. */
export const meshToBox = ([x, y, z]) => [-x, -z, -y];

const emptyBounds = () => ({ x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
const grow = (bounds, [x, , z]) => {
  bounds.x0 = Math.min(bounds.x0, x);
  bounds.x1 = Math.max(bounds.x1, x);
  bounds.z0 = Math.min(bounds.z0, z);
  bounds.z1 = Math.max(bounds.z1, z);
};

/**
 * Cuts the welded box shell into a body and a lid. The lid is everything above the groove plus the
 * long front flap (a flip-top box: the flap hangs from the lid down the box's front). Triangles keep
 * their submesh (0 exterior, 1 interior) so both halves draw with the box's two materials. The hinge
 * is the back edge of the cut; the rims are the wall outlines there, in box space, so a flat ring can
 * close the gap between the exterior and interior skins.
 *
 * @param {{ p: number[], i: number[], submeshes: Array<{ name: string, start: number, count: number }> }} mesh
 * @param {number} [cutZ]
 */
export function splitBoxMesh(mesh, cutZ = LID_CUT_Z) {
  const position = (v) => [mesh.p[v * 3], mesh.p[v * 3 + 1], mesh.p[v * 3 + 2]];
  const isFlapVertex = (v) => mesh.p[v * 3 + 1] < FLAP_FRONT_Y && mesh.p[v * 3 + 2] < FLAP_FLOOR_Z;
  const parts = { body: { index: [], submeshes: [] }, lid: { index: [], submeshes: [] } };
  const rim = { outer: emptyBounds(), inner: emptyBounds() };

  mesh.submeshes.forEach((submesh, submeshIndex) => {
    const starts = { body: parts.body.index.length, lid: parts.lid.index.length };
    for (let t = submesh.start; t < submesh.start + submesh.count; t += 3) {
      const triangle = [mesh.i[t], mesh.i[t + 1], mesh.i[t + 2]];
      const centroidZ = triangle.reduce((sum, v) => sum + mesh.p[v * 3 + 2], 0) / 3;
      const flap = triangle.every(isFlapVertex);
      const part = centroidZ < cutZ || flap ? parts.lid : parts.body;
      part.index.push(...triangle);
      if (flap) continue;
      for (const v of triangle) {
        const point = position(v);
        if (Math.abs(point[2] - cutZ) <= RIM_BAND) grow(submeshIndex === 0 ? rim.outer : rim.inner, meshToBox(point));
      }
    }
    for (const key of ['body', 'lid']) {
      parts[key].submeshes.push({
        name: submesh.name,
        start: starts[key],
        count: parts[key].index.length - starts[key],
      });
    }
  });

  return {
    body: parts.body,
    lid: parts.lid,
    cutY: -cutZ,
    hinge: { y: -cutZ, z: rim.outer.z0 },
    rim,
  };
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const finite = (...values) => values.every(Number.isFinite);
const isPile = (deck) => Boolean(deck) && finite(deck.x, deck.y, deck.widthPx) && deck.widthPx > 0;
const isSpan = (span) => Boolean(span) && finite(span.x0, span.x1) && span.x1 > span.x0;

/** Table px per box-space unit: a box is drawn at its deck's card scale (card mesh 6.4 wide). */
export const boxScaleFor = (deckWidthPx) => deckWidthPx / CARD_SIZE.width;

/** Table px a box lying on its back covers across the table, turned REST_YAW_DEG. */
export const restFootprintPx = (scale) => {
  const yaw = (REST_YAW_DEG * Math.PI) / 180;
  return scale * (BOX_WIDTH * Math.cos(yaw) + BOX_HEIGHT * Math.sin(yaw));
};

/** Height of a box's centre off the cloth while it lies on its back. */
const lyingZ = (scale) => (BOX_DEPTH / 2) * scale;

/** +1 when the deck sits right of the table's centre, −1 left of it. */
const sideOf = (deck, table) => (deck.x >= (table.x0 + table.x1) / 2 ? 1 : -1);

/**
 * Where a box rests: lying on its back, front art up, in the blurred band on its deck's side of the
 * mat, level with the deck. Poses place the box's centre. The band runs from the mat art's edge (`art`, its
 * x-span on this half; null when the half shows no art: the deck's outer edge then) to the table's
 * edge. Null when the band cannot hold the box.
 *
 * @param {{ deck: { x: number, y: number, widthPx: number }, art: { x0: number, x1: number } | null,
 *   table: { x0: number, x1: number } }} input
 * @returns {{ x: number, y: number, z: number, yawDeg: number, pitchDeg: number, scale: number, dir: 1|-1 } | null}
 */
export function restPose({ deck, art, table }) {
  if (!isPile(deck) || !isSpan(table)) return null;
  const dir = sideOf(deck, table);
  const deckEdge = deck.x + (dir * deck.widthPx) / 2;
  const artEdge = isSpan(art) ? (dir > 0 ? art.x1 : art.x0) : deckEdge;
  const inner = dir > 0 ? Math.max(artEdge, deckEdge) : Math.min(artEdge, deckEdge);
  const outer = dir > 0 ? table.x1 : table.x0;
  const band = dir * (outer - inner);
  const scale = boxScaleFor(deck.widthPx);
  if (!(band >= restFootprintPx(scale) + 2 * BAND_MARGIN_PX)) return null;
  return { x: inner + (dir * band) / 2, y: deck.y, z: lyingZ(scale), yawDeg: -dir * REST_YAW_DEG, pitchDeg: 0, scale, dir };
}

/** Where a box with no room to rest flies in from and back to: just past the table's edge on its deck's side. */
export function offTablePose({ deck, table }) {
  if (!isPile(deck) || !isSpan(table)) return null;
  const dir = sideOf(deck, table);
  const scale = boxScaleFor(deck.widthPx);
  const x = (dir > 0 ? table.x1 : table.x0) + dir * OFF_TABLE_WIDTHS * BOX_WIDTH * scale;
  return { x, y: deck.y, z: lyingZ(scale), yawDeg: -dir * REST_YAW_DEG, pitchDeg: 0, scale, dir };
}

/**
 * Where a box hovers while it deals: over its owner's half beside the deck, toward the mat's centre,
 * lifted off the cloth and stood up off its back so its open top faces the camera, turned toward the deck.
 */
export function hoverPose({ deck, table }) {
  if (!isPile(deck) || !isSpan(table)) return null;
  const dir = sideOf(deck, table);
  const scale = boxScaleFor(deck.widthPx);
  return {
    x: deck.x - dir * deck.widthPx * HOVER_OFFSET_DECKS,
    y: deck.y,
    z: HOVER_LIFT_CARDS * CARD_SIZE.height * scale,
    yawDeg: -dir * HOVER_YAW_DEG,
    pitchDeg: HOVER_PITCH_DEG,
    scale,
    dir,
  };
}

/**
 * Where flying card k of `cards` comes to rest on the deck spot: flat, sleeve up, turned with its
 * seat, the pile growing from the cloth to the real deck's top (`topZ`).
 */
export function landPose({ deck, k, cards, topZ, yawDeg = 0 }) {
  const step = cards > 0 && topZ > 0 ? topZ / cards : 0;
  return { x: deck.x, y: deck.y, z: (clamp(k, 0, Math.max(0, cards - 1)) + 1) * step, yawDeg };
}

/** How many cards fly out of the box for a deck of `deckCount`. */
export const flyingCardCount = (deckCount) => {
  const n = Math.floor(Number(deckCount));
  return Number.isFinite(n) ? clamp(n, 0, MAX_FLYING_CARDS) : 0;
};

/** Box-space depth of the stack still in the box after `flown` of `total` flying cards left. */
export const stackDepthAfter = (flown, total) => {
  if (!(total > 0)) return 0;
  return STACK_DEPTH * clamp(1 - flown / total, 0, 1);
};

export const DEAL_MS = Object.freeze({
  lift: 650,
  open: 350,
  firstCard: 950,
  stagger: 45,
  rise: 180,
  travel: 380,
  reveal: 200,
  returnLead: 150,
  return: 650,
});

/**
 * The deal's schedule for `deckCount` cards. Card k leaves at `firstCardMs + k·staggerMs`, rises
 * out of the box for `riseMs`, then travels to the deck spot for `travelMs`. The deck spot shows the
 * real deck once the last card lands; the box starts home `returnLeadMs` before that reveal ends.
 */
export function dealTimeline(deckCount) {
  const cards = flyingCardCount(deckCount);
  const flightMs = DEAL_MS.rise + DEAL_MS.travel;
  const openEndMs = DEAL_MS.lift + DEAL_MS.open;
  const lastLandMs = cards > 0 ? DEAL_MS.firstCard + (cards - 1) * DEAL_MS.stagger + flightMs : openEndMs;
  const returnStartMs = lastLandMs + DEAL_MS.reveal - DEAL_MS.returnLead;
  return {
    cards,
    liftMs: DEAL_MS.lift,
    openStartMs: DEAL_MS.lift,
    openMs: DEAL_MS.open,
    firstCardMs: DEAL_MS.firstCard,
    staggerMs: DEAL_MS.stagger,
    riseMs: DEAL_MS.rise,
    travelMs: DEAL_MS.travel,
    flightMs,
    lastLandMs,
    revealMs: DEAL_MS.reveal,
    returnStartMs,
    returnMs: DEAL_MS.return,
    totalMs: returnStartMs + DEAL_MS.return,
  };
}

/**
 * Where card k is in its flight at `ms` into the deal: waiting in the box, rising out of it,
 * travelling to the deck spot, or landed. `u` runs 0→1 within the phase.
 *
 * @returns {{ phase: 'waiting'|'rising'|'travelling'|'landed', u: number }}
 */
export function cardPhase(timeline, k, ms) {
  const start = timeline.firstCardMs + k * timeline.staggerMs;
  const t = ms - start;
  if (t < 0) return { phase: 'waiting', u: 0 };
  if (t < timeline.riseMs) return { phase: 'rising', u: t / timeline.riseMs };
  if (t < timeline.flightMs) return { phase: 'travelling', u: (t - timeline.riseMs) / timeline.travelMs };
  return { phase: 'landed', u: 1 };
}

/** How many cards have left the box (begun rising) at `ms`. */
export const cardsLaunched = (timeline, ms) =>
  ms < timeline.firstCardMs ? 0 : Math.min(timeline.cards, Math.floor((ms - timeline.firstCardMs) / timeline.staggerMs) + 1);

/** The lid's opening, 0 shut → 1 open, at `ms`. */
export const lidProgress = (timeline, ms) => clamp((ms - timeline.openStartMs) / timeline.openMs, 0, 1);

/** The box's travel: 0 at rest → 1 hovering, and back to 0 on the way home. */
export function boxTravel(timeline, ms) {
  if (ms < timeline.liftMs) return { leg: 'out', u: clamp(ms / timeline.liftMs, 0, 1) };
  if (ms < timeline.returnStartMs) return { leg: 'hover', u: 1 };
  return { leg: 'home', u: clamp((ms - timeline.returnStartMs) / timeline.returnMs, 0, 1) };
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t * t * t;
/** Overshoots past 1 and settles: the lid swinging open. */
export const easeOutBack = (t, overshoot = 1.4) => 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;

/** Quadratic Bézier between points given as equal-length arrays. */
export const bezier2 = (p0, p1, p2, u) => p0.map((a, i) => (1 - u) ** 2 * a + 2 * (1 - u) * u * p1[i] + u ** 2 * p2[i]);
