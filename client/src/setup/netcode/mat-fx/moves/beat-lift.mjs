// Design 078 § Depth: where a beat sits in height. Each builder returns a `ctx.fxLift` hint
// (gpu-canvas resolveLift; heights in lane units = card heights, points in the stage px the
// drawer draws in). Without a lift every beat lay 0.25–4 px above the cloth and the tilted
// camera read it as a decal. Heights follow the Scarlet/Violet clips (063-move-refs.json
// `modern`): orbs, beams and thrown bodies travel at the attacker's chest, bursts open over the
// struck Pokémon, sky bolts and pillars rise off their card, ground waves stay down.
//
// Stand angles are set for the board camera, which looks almost straight down (the default
// 'tilt12' preset: 12° tilt, 35.6° fov; 'tcgl': 0°, 20° fov). A shape stood fully upright is
// foreshortened, not revealed: a 1.6 h sky bolt reads 181 px drawn flat, 188–203 px stood
// 0.15–0.55, but 77 px stood vertical (tilt12) and 15 px (tcgl). So nothing stands past
// `upright` (0.5): it keeps its size on screen and gains real height — long cast shadows, light
// pools and perspective growth toward the eye — which is what reads as depth from above.
// DOM-free: a 2D context keeps `fxLift` as an inert property.

export const LIFT = Object.freeze({
  /**
   * Chest height a travelling beat flies at (Psybeam, Zap Cannon); the same as a burst's, so a
   * body or flare in flight hands over to the burst at contact without a jump.
   */
  travelZ: 0.3,
  /** Extra rise mid-lane for a thrown body (lands back at travelZ on the defender). */
  travelArc: 0.3,
  /** A beam is near-straight at chest height. */
  beamArc: 0.12,
  /** A lane bolt jumps in a high arc. */
  boltArc: 0.45,
  /** Height a burst, flare or ring opens at over its anchor. */
  burstZ: 0.3,
  /** How far a burst stands up (0 flat … 1 vertical): partly, so it keeps its size from above. */
  burstStand: 0.4,
  /** Face-on rings and sigils (Psychic) stand as far as anything does. */
  faceStand: 0.5,
  /** A charging orb or a body in flight faces the camera as much as a burst does. */
  bodyStand: 0.4,
  /** The most anything stands (sky bolts, pillars, rain, a sky anchor); see the header. */
  upright: 0.5,
  /** Burst particles: thrown up and out from the struck card's centre. */
  particleZ: 0.3,
  particleStand: 0.4,
});

const pair = (p) => [p.x, p.y];
const isSky = (target) => target === 'sky' || target === 'sky-attacker';

/** Travelling a → b: at `z` all the way, rising `arc` more mid-segment. */
export function travelLift(a, b, { arc = LIFT.travelArc, z = LIFT.travelZ } = {}) {
  return { z, arc, from: pair(a), to: pair(b) };
}

/** A body in flight along a → b, its own disc turned toward the camera about its centre `at`. */
export function bodyLift(a, b, at, { arc = LIFT.travelArc, z = LIFT.travelZ, stand = LIFT.bodyStand } = {}) {
  return { ...travelLift(a, b, { arc, z }), stand, at: pair(at) };
}

/**
 * Stood up on the screen line through `base`: what the 2D layout drew above it on screen (a sky
 * drop, a column, a bolt from the sky) rises off it, `stand` of the way to vertical.
 */
export function standOn(base, { z = 0, stand = LIFT.upright } = {}) {
  return { z, stand, at: pair(base) };
}

/** A burst / flare / ring opening at `c`: hovering at `z`, stood `stand` of the way up. */
export function burstLift(c, { stand = LIFT.burstStand, z = LIFT.burstZ } = {}) {
  return { z, stand, at: pair(c) };
}

/**
 * The lift of an anchored beat drawn at `point` for `target`. A sky anchor sits SKY_HEIGHT h
 * above its card on screen; stood on that card's line it hangs that high in the air instead.
 */
export function anchorLift(lane, target, point, opts = {}) {
  if (isSky(target)) {
    const base = target === 'sky' ? { x: lane.bx, y: lane.by } : { x: lane.ax, y: lane.ay };
    return standOn(base);
  }
  return burstLift(point, opts);
}
