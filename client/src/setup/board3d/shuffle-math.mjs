// Design 089 § D8: the riffle shuffle of a pile on the three.js board, as pure pose maths. The
// pile's own card layers play it (pile-mesh.js): they are cut into two packets that lie down side
// by side, their inner edges lifted; the cards fall alternately from the two packets onto one
// pile between them; that rough pile is squared; a tap settles it. It replaces the ring of flat
// sleeves that orbited over the tilted board (design 009): a shuffle of real cards, on the cloth,
// in the board's own light. DOM- and GL-free.
//
// A pose is in the pile's own frame: `x` (card widths, + right), `y` (card heights, + up the
// table), `level` (which place in a stack the card lies at, in card layers; 0 = on the cloth),
// `lift` (card heights above that place), `yawDeg` (turn on the cloth, clockwise as seen from
// above), `rollDeg` (turn about the card's long axis: + lifts its right edge).

export const SHUFFLE_MS = 1500;
/** With motion reduced only the last beat plays: the pile taps. */
export const SHUFFLE_TAP_MS = 260;
export const SHUFFLE_MAX_CARDS = 18;

/** The beats, as shares of the whole shuffle. */
export const SHUFFLE_BEATS = Object.freeze({ cutEnd: 0.17, riffleStart: 0.19, riffleEnd: 0.62, squareEnd: 0.85 });

/** How far each packet lies from the pile's centre (card widths) and how it sits there. */
const PACKET_X = 0.6;
const PACKET_YAW = 7;
const PACKET_ROLL = 24;
/** One card's fall, as a share of the shuffle. */
const FALL = 0.11;
/** The fallen cards lie rough: alternately this far off centre and this much turned. */
const ROUGH_X = 0.055;
const ROUGH_YAW = 3.2;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
const span = (t, a, b) => clamp01((t - a) / (b - a));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/**
 * How many card layers shuffle for a pile of `count` cards: none under two cards (nothing to
 * shuffle), every card of a small pile, a third of a large one up to SHUFFLE_MAX_CARDS.
 */
export function shuffleCardCount(count) {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n < 2) return 0;
  return Math.min(SHUFFLE_MAX_CARDS, Math.max(Math.min(n, 6), Math.round(n / 3)));
}

/**
 * Where card `index` (0 = the bottom of the pile) of `count` belongs in the riffle: its packet
 * (-1 = the lower half, which goes left; +1 = the upper half, cut off to the right), its place in
 * that packet from the bottom, the packet's size, and the level it lands on in the shuffled pile
 * (the packets' cards alternate, left first; a longer packet's last cards land on top).
 */
export function riffleSlot(index, count) {
  const left = Math.ceil(count / 2);
  const side = index < left ? -1 : 1;
  const place = side < 0 ? index : index - left;
  const size = side < 0 ? left : count - left;
  const other = count - size;
  const paired = Math.min(place, other);
  // Below `other` the two packets alternate; above it only the longer packet is left.
  const level = place < other ? 2 * place + (side < 0 ? 0 : 1) : 2 * paired + (place - paired);
  return { side, place, size, level };
}

/** When a card of a packet starts to fall (share of the shuffle); the right packet runs half a card behind. */
function fallStart({ side, place, size }) {
  const { riffleStart, riffleEnd } = SHUFFLE_BEATS;
  const window = riffleEnd - riffleStart - FALL;
  const step = window / Math.max(1, size);
  return riffleStart + step * (place + (side > 0 ? 0.5 : 0));
}

/**
 * The pose of card `index` of `count` at `time` in [0, 1].
 * @returns {{ x: number, y: number, level: number, lift: number, yawDeg: number, rollDeg: number }}
 */
export function shuffleCardPose(index, count, time) {
  const t = clamp01(time);
  const slot = riffleSlot(index, count);
  const { side, place, size, level } = slot;
  const { cutEnd, riffleStart, riffleEnd, squareEnd } = SHUFFLE_BEATS;
  const rough = level % 2 === 0 ? -1 : 1;

  if (t <= cutEnd) {
    // The cut: the upper half lifts off and is set down to the right; the lower half slides left.
    const u = easeInOut(span(t, 0, cutEnd));
    const tilt = span(t, cutEnd * 0.6, cutEnd);
    return {
      x: side * PACKET_X * u,
      y: 0,
      level: lerp(index, place, u),
      lift: side > 0 ? Math.sin(Math.PI * u) * 0.3 : Math.sin(Math.PI * u) * 0.04,
      yawDeg: side * PACKET_YAW * u,
      rollDeg: -side * PACKET_ROLL * tilt,
    };
  }

  if (t <= riffleEnd) {
    const start = fallStart(slot);
    const u = span(t, start, start + FALL);
    if (u <= 0) {
      // Still in its packet, which sinks as the cards under this one fall away.
      const taken = (span(t, riffleStart, riffleEnd - FALL) * size) / 1;
      return {
        x: side * PACKET_X,
        y: 0,
        level: Math.max(0, place - taken),
        lift: 0,
        yawDeg: side * PACKET_YAW,
        rollDeg: -side * PACKET_ROLL,
      };
    }
    // Falling: off the packet's inner edge, over and down onto the pile between the two.
    const e = easeInOut(u);
    return {
      x: lerp(side * PACKET_X, rough * ROUGH_X, e),
      y: 0,
      level: lerp(0, level, e),
      lift: Math.sin(Math.PI * u) * 0.14,
      yawDeg: lerp(side * PACKET_YAW, rough * ROUGH_YAW, e),
      rollDeg: -side * PACKET_ROLL * (1 - e),
    };
  }

  if (t <= squareEnd) {
    // Squaring: the rough pile is pushed true, with a little hop under the hands.
    const u = span(t, riffleEnd, squareEnd);
    const e = easeInOut(u);
    return {
      x: rough * ROUGH_X * (1 - e),
      y: 0,
      level,
      lift: Math.sin(Math.PI * u) * 0.03,
      yawDeg: rough * ROUGH_YAW * (1 - e),
      rollDeg: 0,
    };
  }

  // The tap: the squared pile drops, rebounds a hair and comes to rest.
  const u = span(t, squareEnd, 1);
  const decay = 1 - easeOutCubic(u);
  return {
    x: 0,
    y: 0,
    level,
    lift: Math.abs(Math.sin(u * Math.PI * 2)) * 0.025 * decay,
    yawDeg: Math.sin(u * Math.PI * 3) * 1.1 * decay,
    rollDeg: 0,
  };
}

/**
 * How far the whole riffle has moved off the pile's spot toward the middle of the table (0–1 of
 * SHUFFLE_DRIFT): out during the cut, back as the pile is squared. The packets lie either side of
 * the pile, where a deck box stands on the table's outer side.
 */
export function shuffleDrift(time) {
  const t = clamp01(time);
  const { cutEnd, riffleEnd, squareEnd } = SHUFFLE_BEATS;
  return easeInOut(span(t, 0, cutEnd)) * (1 - easeInOut(span(t, riffleEnd, squareEnd)));
}

/** The riffle's drift toward the middle of the table at its fullest, in card widths. */
export const SHUFFLE_DRIFT = 0.45;

/** The reduced-motion shuffle: the whole pile's tap, card `index` at `time` in [0, 1]. */
export function shuffleTapPose(index, count, time) {
  const { squareEnd } = SHUFFLE_BEATS;
  const pose = shuffleCardPose(index, count, lerp(squareEnd, 1, clamp01(time)));
  return { ...pose, level: index };
}
