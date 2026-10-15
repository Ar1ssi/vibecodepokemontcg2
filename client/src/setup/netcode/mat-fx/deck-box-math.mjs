// Design 073: pure math for the deck boxes beside the mat and the opening deal out of them.
//
// Box space (every box-relative number here): y up from the box's floor, +z toward the box's front,
// x to its right, in the deck-box mesh's own units (the box is 6.85 wide, 9.48 tall, 4.3 deep).
// The imported mesh is in mesh space (x mirrored, z down the box's height, y front-to-back); the
// mesh's slot quaternion in scene.json turns it into box space: box (x, y, z) = mesh (−x, −z, −y).
// Screen numbers are CSS pixels in the parent viewport.

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
/** Below this the band is too narrow for a box to rest in (two-player and sim layouts). */
export const MIN_REST_HEIGHT = 48;
export const BAND_EDGE_PX = 12;
/** On-screen width of a resting box per pixel of its height: front 0.72·cos 25° + depth 0.45·sin 25°. */
export const BOX_SCREEN_ASPECT = 0.85;
export const REST_HEIGHT_PER_DECK = 1.15;
export const HOVER_HEIGHT_PER_DECK = 1.35;
/** How far beside its deck, toward the mat's centre, the box hovers while it deals (deck widths). */
export const HOVER_OFFSET_DECKS = 1.9;
const AVOID_GAP_PX = 8;

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

const isUsableRect = (rect) =>
  !!rect && [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 1 && rect.height > 1;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const centerOf = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

const overlaps = (a, b) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/**
 * Where a box rests: in the blurred band on its deck's side of the mat, level with the deck. The band
 * runs from the mat art's edge to the board half's edge. Null when that band cannot hold a box.
 *
 * @param {{ deckRect: object, matRect: object, boardRect: object, avoidRects?: object[] }} input
 *   `matRect` the mat art's extent on this half (its `.hover-gutter-probe`), `boardRect` this half's
 *   iframe, `avoidRects` chrome the box should not sit under (the board buttons).
 * @returns {{ side: 'left'|'right', cx: number, cy: number, height: number } | null}
 */
export function restPlacement({ deckRect, matRect, boardRect, avoidRects = [] }) {
  if (!isUsableRect(deckRect) || !isUsableRect(matRect) || !isUsableRect(boardRect)) return null;
  const deck = centerOf(deckRect);
  const side = deck.x >= centerOf(matRect).x ? 'right' : 'left';
  const bandLeft = side === 'right' ? matRect.left + matRect.width : boardRect.left;
  const bandRight = side === 'right' ? boardRect.left + boardRect.width : matRect.left;
  const bandWidth = bandRight - bandLeft;
  const height = Math.min(deckRect.height * REST_HEIGHT_PER_DECK, (bandWidth - 2 * BAND_EDGE_PX) / BOX_SCREEN_ASPECT);
  if (!(height >= MIN_REST_HEIGHT)) return null;

  const width = height * BOX_SCREEN_ASPECT;
  const cx = bandLeft + bandWidth / 2;
  const minY = boardRect.top + BAND_EDGE_PX + height / 2;
  const maxY = boardRect.top + boardRect.height - BAND_EDGE_PX - height / 2;
  let cy = clamp(deck.y, minY, maxY);
  for (const avoid of avoidRects.filter(isUsableRect)) {
    const box = { left: cx - width / 2, top: cy - height / 2, width, height };
    if (!overlaps(box, avoid)) continue;
    const below = cy >= centerOf(avoid).y;
    cy = below ? avoid.top + avoid.height + AVOID_GAP_PX + height / 2 : avoid.top - AVOID_GAP_PX - height / 2;
    cy = clamp(cy, minY, maxY);
  }
  return { side, cx, cy, height };
}

/**
 * Where a box hovers while it deals: over its owner's half of the mat, beside the deck toward the
 * mat's centre, a little larger than at rest. `dir` is +1 when the deck is right of the mat's centre.
 *
 * @returns {{ cx: number, cy: number, height: number, dir: 1|-1 } | null}
 */
export function hoverPlacement({ deckRect, matRect }) {
  if (!isUsableRect(deckRect) || !isUsableRect(matRect)) return null;
  const deck = centerOf(deckRect);
  const dir = deck.x >= centerOf(matRect).x ? 1 : -1;
  return {
    cx: deck.x - dir * deckRect.width * HOVER_OFFSET_DECKS,
    cy: deck.y,
    height: deckRect.height * HOVER_HEIGHT_PER_DECK,
    dir,
  };
}

/** Where a box comes from when its band has no room to rest in: just past the board's outer edge. */
export function offBoardPlacement({ hover, boardRect }) {
  if (!hover || !isUsableRect(boardRect)) return null;
  const edge = hover.dir > 0 ? boardRect.left + boardRect.width + hover.height : boardRect.left - hover.height;
  return { side: hover.dir > 0 ? 'right' : 'left', cx: edge, cy: hover.cy, height: hover.height };
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

/** The camera puts 1 world unit on 1 CSS pixel at z = 0: its distance for a viewport `height` and fov. */
export const cameraDistance = (height, fovDeg) => height / 2 / Math.tan((fovDeg * Math.PI) / 360);

/** Parent-viewport point → world point on the z = 0 plane. */
export const screenToWorld = ({ x, y }, viewport) => ({ x: x - viewport.width / 2, y: viewport.height / 2 - y });
