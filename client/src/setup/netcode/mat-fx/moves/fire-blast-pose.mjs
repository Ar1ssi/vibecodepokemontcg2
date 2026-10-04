// Design 063, first move built as a look test: Fire Blast (Fire · Special · tier 3).
// Pure timing and geometry; fire-blast.js draws it. Reference: the Black 2 / White 2
// animation — five fireballs orbit the attacker, merge, cross the lane, and burst on
// the defender as the five-armed 大 flare — paced like the Scarlet / Violet version
// (one fireball built at the mouth, two rings on release, a white core at contact,
// embers after). DOM-free.

export const FIRE_BLAST_MS = 1900;
export const FIRE_BLAST_CONTACT_MS = 1000;
export const FIRE_BLAST_HOLD_MS = FIRE_BLAST_CONTACT_MS + 40;
export const ORB_COUNT = 5;
export const FLARE_BLOBS = 8;

/** Each beat's [start, end) in ms on the scene clock. */
export const PHASES = {
  charge: [0, 620],
  rings: [560, 940],
  release: [620, FIRE_BLAST_CONTACT_MS],
  vignette: [820, 1850],
  flash: [FIRE_BLAST_CONTACT_MS, 1180],
  rays: [FIRE_BLAST_CONTACT_MS, 1320],
  flare: [FIRE_BLAST_CONTACT_MS, 1750],
};

// The 大 of the sprite: one arm straight up, two raised arms, two legs. Reach in
// card heights.
export const FLARE_ARMS = [
  { angle: -90, reach: 1.15 },
  { angle: -160, reach: 0.95 },
  { angle: -20, reach: 0.95 },
  { angle: 125, reach: 1.05 },
  { angle: 55, reach: 1.05 },
];

const TAU = Math.PI * 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInQuad = (t) => t * t;

/** Progress in [0, 1] through `phase` at `ms`, or null outside it. */
export function phaseProgress(ms, phase) {
  const [start, end] = PHASES[phase];
  if (!(ms >= start) || ms >= end) return null;
  return (ms - start) / (end - start);
}

const rectCenter = (r) => ({
  x: r.left + r.width / 2,
  y: r.top + r.height / 2,
});

/**
 * The lane between the two cards: centres, unit direction `u`, its normal `n`,
 * and the card height `h` every size below is scaled by. Null when the centres
 * coincide (no direction to fire along).
 */
export function laneGeometry(fromRect, toRect) {
  const a = rectCenter(fromRect);
  const b = rectCenter(toRect);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length >= 1)) return null;
  const ux = dx / length;
  const uy = dy / length;
  return {
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    ux,
    uy,
    nx: -uy,
    ny: ux,
    length,
    h: Math.max(fromRect.height, toRect.height, 1),
  };
}

/**
 * Charge: five orbs orbit the attacker on a tilted ellipse, speeding up and
 * tightening until they sit as one ball at the card's leading edge. `depth` is
 * -1 behind the card to +1 in front; the drawer scales and dims by it.
 * @returns {{dx:number, dy:number, r:number, alpha:number, depth:number}[]} offsets from the attacker's centre
 */
export function chargeOrbs(t, h) {
  const c = clamp01(t);
  const spin = TAU * (0.9 * c + 1.6 * c * c);
  const radius = h * (0.8 - 0.55 * easeInCubic(c));
  const fadeIn = clamp01(c / 0.12);
  const orbs = [];
  for (let i = 0; i < ORB_COUNT; i += 1) {
    const theta = (i / ORB_COUNT) * TAU + spin;
    const depth = Math.sin(theta);
    orbs.push({
      dx: Math.cos(theta) * radius,
      dy: depth * radius * 0.42 - h * 0.04,
      r: h * (0.17 + 0.1 * c) * (1 + 0.25 * depth),
      alpha: fadeIn * (0.7 + 0.3 * depth),
      depth,
    });
  }
  return orbs;
}

/** The glow building at the attacker's leading edge during the charge. */
export function chargeCore(t, h) {
  const c = clamp01(t);
  const build = easeInCubic(clamp01((c - 0.3) / 0.7));
  return { r: h * (0.18 + 0.4 * build), alpha: build, lead: h * 0.42 };
}

/**
 * Release: the merged fireball leaves the attacker's leading edge and
 * accelerates down the lane, bowing slightly off it, and grows as it goes.
 * `f` is the fraction of the lane covered, `side` the offset along the normal.
 */
export function fireballPose(s, h) {
  const c = clamp01(s);
  return {
    f: easeInQuad(c),
    side: Math.sin(c * Math.PI) * h * 0.22,
    r: h * (0.36 + 0.22 * c),
    alpha: 1,
  };
}

/** Trail puffs behind the fireball: earlier positions, smaller and dimmer. */
export function fireballTrail(s, h, count = 6) {
  const out = [];
  for (let k = 1; k <= count; k += 1) {
    const lag = s - k * 0.055;
    if (lag < 0) break;
    const p = fireballPose(lag, h);
    out.push({ ...p, r: p.r * (1 - k * 0.1), alpha: 0.6 - k * 0.08 });
  }
  return out;
}

/** Two shock rings leaving the attacker as the ball is released. */
export function releaseRings(s, h) {
  const rings = [];
  for (const delay of [0, 0.3]) {
    const c = clamp01((s - delay) / (1 - delay));
    if (s < delay) continue;
    rings.push({
      r: h * (0.3 + 0.95 * easeOutCubic(c)),
      alpha: 0.75 * (1 - c) ** 1.5,
      width: h * 0.06 * (1 - 0.5 * c),
    });
  }
  return rings;
}

/** Local red darkening around the defender (house rule: ≤ 1.6 card heights, alpha ≤ 0.45). */
export function vignettePose(t, h) {
  const c = clamp01(t);
  let a;
  if (c < 0.2) a = easeOutCubic(c / 0.2);
  else if (c < 0.7) a = 1;
  else a = 1 - (c - 0.7) / 0.3;
  return { alpha: 0.45 * a, inner: h * 0.55, outer: h * 1.6 };
}

/** White-yellow core at contact: instant peak, fast falloff, swelling as it fades. */
export function flashPose(s, h) {
  const c = clamp01(s);
  return {
    alpha: c < 0.12 ? c / 0.12 : (1 - (c - 0.12) / 0.88) ** 2,
    r: h * (0.55 + 0.6 * c),
  };
}

/** The radial speed lines behind the flare, fading as they lengthen. */
export function raysPose(s, h) {
  const c = clamp01(s);
  return {
    alpha: 0.5 * (1 - c) ** 2,
    inner: h * 0.3,
    outer: h * (1.1 + 0.5 * easeOutCubic(c)),
    count: 28,
    spin: c * 0.25,
  };
}

/**
 * The 大 flare over the defender: the arms grow out of the core, hold while
 * flickering, then break into fragments that drift outward and fade.
 * @returns {{core:{r:number, alpha:number}, arms:{angle:number, length:number, drift:number,
 *   alpha:number, thickness:number}[]}}
 */
export function flarePose(s, h) {
  const c = clamp01(s);
  const grow = easeOutCubic(clamp01(c / 0.32));
  const breakUp = clamp01((c - 0.62) / 0.38);
  const alpha = 1 - easeInCubic(breakUp);
  return {
    core: { r: h * 0.48 * grow * (1 - 0.6 * breakUp), alpha },
    arms: FLARE_ARMS.map(({ angle, reach }) => ({
      angle,
      length: h * reach * grow,
      drift: h * 0.35 * breakUp,
      alpha,
      thickness: 1 - 0.5 * breakUp,
    })),
  };
}

/**
 * Blob radii along one arm: thick at the shoulder, tapering to the tip, with a
 * slow flicker so the fire breathes while it holds.
 */
export function armBlobs(arm, h, elapsedMs, armIndex) {
  const blobs = [];
  for (let k = 0; k < FLARE_BLOBS; k += 1) {
    const along = k / (FLARE_BLOBS - 1);
    const flicker =
      1 + 0.12 * Math.sin(elapsedMs * 0.028 + k * 1.7 + armIndex * 2.3);
    blobs.push({
      at: arm.length * along + arm.drift * (0.4 + 0.6 * along),
      r: h * (0.27 - 0.13 * along) * arm.thickness * flicker,
      alpha: arm.alpha * (1 - 0.25 * along),
    });
  }
  return blobs;
}
