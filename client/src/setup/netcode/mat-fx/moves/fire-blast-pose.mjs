// Design 063, first move built as a look test: Fire Blast (Fire · Special · tier 3).
// Pure timing and geometry; fire-blast.js draws it. Reference: the Black 2 / White 2
// animation — five fireballs orbit the attacker, merge, cross the lane, and burst on
// the defender as the five-armed 大 flare — paced like the Scarlet / Violet version
// (one fireball built at the mouth, two rings on release, a white core at contact,
// embers after). Card motion: the attacker rears back, lurches on release and
// settles; the defender trembles as the ball closes, is knocked back on contact
// and springs home. DOM-free; lengths are in card heights unless noted.

export const FIRE_BLAST_MS = 1900;
export const FIRE_BLAST_CONTACT_MS = 1000;
export const FIRE_BLAST_HOLD_MS = FIRE_BLAST_CONTACT_MS + 40;
export const ORB_COUNT = 5;

/** Each beat's [start, end) in ms on the scene clock. */
export const PHASES = {
  charge: [0, 620],
  rings: [560, 940],
  release: [620, FIRE_BLAST_CONTACT_MS],
  vignette: [820, 1850],
  flash: [FIRE_BLAST_CONTACT_MS, 1180],
  rays: [FIRE_BLAST_CONTACT_MS, 1320],
  flare: [FIRE_BLAST_CONTACT_MS, 1750],
  smoke: [1300, FIRE_BLAST_MS],
};

// Attacker card beats (ms): rear back, thrust on release, spring home.
const WINDUP = [0, 560];
const THRUST = [560, 700];
const RECOIL = [700, 1200];
// Defender card beats: tremble as the ball closes, knock-back and spring home.
const TREMBLE = [820, FIRE_BLAST_CONTACT_MS];
const KNOCK = [FIRE_BLAST_CONTACT_MS, 1520];
const HEAT = [FIRE_BLAST_CONTACT_MS, 1650];

// The 大 of the sprite: one arm straight up, two raised arms, two legs. Reach in
// card heights.
export const FLARE_ARMS = [
  { angle: -90, reach: 1.25 },
  { angle: -160, reach: 1.0 },
  { angle: -20, reach: 1.0 },
  { angle: 125, reach: 1.1 },
  { angle: 55, reach: 1.1 },
];

const TAU = Math.PI * 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInQuad = (t) => t * t;
const spanProgress = (ms, [start, end]) =>
  !(ms >= start) || ms >= end ? null : (ms - start) / (end - start);

/** Progress in [0, 1] through `phase` at `ms`, or null outside it. */
export function phaseProgress(ms, phase) {
  return spanProgress(ms, PHASES[phase]);
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
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    length,
    h: Math.max(fromRect.height, toRect.height, 1),
  };
}

/**
 * Charge: five fireballs orbit the attacker on a tilted ellipse, speeding up and
 * tightening until they sit as one ball at the card's leading edge. `depth` is
 * -1 behind the card to +1 in front; `heading` is the orbit's direction of travel
 * (degrees) so each ball can trail its flames behind it.
 * @returns {{dx:number, dy:number, r:number, alpha:number, depth:number, heading:number}[]}
 */
export function chargeOrbs(t, h) {
  const c = clamp01(t);
  const spin = TAU * (0.9 * c + 1.6 * c * c);
  const radius = h * (0.85 - 0.6 * easeInCubic(c));
  const fadeIn = clamp01(c / 0.12);
  const orbs = [];
  for (let i = 0; i < ORB_COUNT; i += 1) {
    const theta = (i / ORB_COUNT) * TAU + spin;
    const depth = Math.sin(theta);
    // Tangent of the ellipse: d/dθ of (cos θ · r, sin θ · 0.42 r).
    const heading =
      (Math.atan2(Math.cos(theta) * 0.42, -Math.sin(theta)) * 180) / Math.PI;
    orbs.push({
      dx: Math.cos(theta) * radius,
      dy: depth * radius * 0.42 - h * 0.04,
      r: h * (0.16 + 0.08 * c) * (1 + 0.22 * depth),
      alpha: fadeIn * (0.75 + 0.25 * depth),
      depth,
      heading,
    });
  }
  return orbs;
}

/** The glow building at the attacker's leading edge during the charge. */
export function chargeCore(t, h) {
  const c = clamp01(t);
  const build = easeInCubic(clamp01((c - 0.3) / 0.7));
  return { r: h * (0.18 + 0.38 * build), alpha: build, lead: h * 0.42 };
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
    side: Math.sin(c * Math.PI) * h * 0.2,
    r: h * (0.34 + 0.22 * c),
    alpha: 1,
  };
}

/** Two shock rings leaving the attacker as the ball is released. */
export function releaseRings(s, h) {
  const rings = [];
  for (const delay of [0, 0.3]) {
    if (s < delay) continue;
    const c = clamp01((s - delay) / (1 - delay));
    rings.push({
      r: h * (0.3 + 1.0 * easeOutCubic(c)),
      alpha: 0.7 * (1 - c) ** 1.5,
      width: h * 0.07 * (1 - 0.5 * c),
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
    r: h * (0.6 + 0.7 * c),
  };
}

/** The radial speed lines behind the flare, fading as they lengthen. */
export function raysPose(s, h) {
  const c = clamp01(s);
  return {
    alpha: 0.5 * (1 - c) ** 2,
    inner: h * 0.3,
    outer: h * (1.1 + 0.6 * easeOutCubic(c)),
    count: 28,
    spin: c * 0.25,
  };
}

/**
 * The 大 flare over the defender: the arms grow out of the core, hold while
 * flickering, then break into fragments that drift outward and fade.
 * @returns {{core:{r:number, alpha:number}, breakUp:number, arms:{angle:number, length:number,
 *   width:number, drift:number, alpha:number}[]}}
 */
export function flarePose(s, h) {
  const c = clamp01(s);
  const grow = easeOutCubic(clamp01(c / 0.3));
  const breakUp = clamp01((c - 0.6) / 0.4);
  const alpha = 1 - easeInCubic(breakUp);
  return {
    core: { r: h * 0.46 * grow * (1 - 0.6 * breakUp), alpha },
    breakUp,
    arms: FLARE_ARMS.map(({ angle, reach }) => ({
      angle,
      length: h * reach * grow,
      width: h * 0.46 * (1 - 0.45 * breakUp),
      drift: h * 0.4 * breakUp,
      alpha,
    })),
  };
}

/**
 * Flame tongues that make up one arm: a main tongue with two shorter side
 * tongues for mass; while breaking up the main tongue splits into fragments
 * that slide outward.
 * @returns {{angleDeg:number, from:number, length:number, width:number, alpha:number}[]}
 */
export function armTongues(arm, breakUp) {
  if (!(arm.length > 0)) return [];
  const tongues = [];
  if (breakUp < 0.35) {
    tongues.push({
      angleDeg: arm.angle,
      from: arm.drift,
      length: arm.length,
      width: arm.width,
      alpha: arm.alpha,
    });
  } else {
    const parts = 3;
    for (let k = 0; k < parts; k += 1) {
      const from = (k / parts) * arm.length + arm.drift * (0.6 + 0.4 * k);
      tongues.push({
        angleDeg: arm.angle,
        from,
        length: (arm.length / parts) * (1.1 - 0.25 * breakUp),
        width: arm.width * (0.8 - 0.2 * k) * (1 - 0.3 * breakUp),
        alpha: arm.alpha,
      });
    }
  }
  for (const side of [-14, 14]) {
    tongues.push({
      angleDeg: arm.angle + side,
      from: arm.drift * 0.5,
      length: arm.length * 0.6,
      width: arm.width * 0.55,
      alpha: arm.alpha * 0.85,
    });
  }
  return tongues;
}

/** Soot after the flare: puffs rising off the defender, spreading and thinning. */
export function smokePuffs(s, h, count = 6) {
  const c = clamp01(s);
  const puffs = [];
  for (let k = 0; k < count; k += 1) {
    const stagger = clamp01((c - k * 0.07) / (1 - k * 0.07));
    if (stagger <= 0) continue;
    const spread = ((k % 2 ? 1 : -1) * (0.15 + 0.12 * k)) / 2;
    puffs.push({
      dx: h * spread * (0.4 + easeOutCubic(stagger)),
      dy: -h * (0.1 + 0.8 * easeOutCubic(stagger)),
      r: h * (0.18 + 0.32 * stagger),
      alpha: 0.32 * Math.sin(stagger * Math.PI) ** 0.8,
    });
  }
  return puffs;
}

/** Damped spring from 1 back to 0: `cycles` half-swings, decaying by `decay`. */
const springHome = (p, cycles = 1.5, decay = 3) =>
  Math.cos(p * Math.PI * cycles) * Math.exp(-decay * p);

/**
 * Attacker card on the scene clock: offset along the lane (`along`, card
 * heights), uniform scale, tilt (degrees), and how hot its rim glows (0–1).
 * Rear back and lift through the charge, lurch forward on release, spring home.
 */
export function attackerCardPose(ms) {
  const windup = spanProgress(ms, WINDUP);
  if (windup !== null) {
    const w = easeOutCubic(windup);
    return {
      along: -0.14 * w,
      scale: 1 + 0.05 * w,
      tilt: -4 * w,
      glow: 0.7 * w,
    };
  }
  const thrust = spanProgress(ms, THRUST);
  if (thrust !== null) {
    const f = easeInQuad(thrust);
    return {
      along: -0.14 + 0.4 * f,
      scale: 1.05 - 0.05 * f,
      tilt: -4 + 7 * f,
      glow: 1 - 0.3 * thrust,
    };
  }
  const recoil = spanProgress(ms, RECOIL);
  if (recoil !== null) {
    const r = springHome(recoil, 1.5, 3.5);
    return {
      along: 0.26 * r,
      scale: 1,
      tilt: 3 * r,
      glow: 0.7 * (1 - recoil) ** 2,
    };
  }
  return { along: 0, scale: 1, tilt: 0, glow: 0 };
}

/**
 * Defender card on the scene clock: a tremble as the ball closes, then an
 * impulse along the lane with squash (scale along / across the lane), a wobble
 * (degrees) and a heat tint (0–1) that cools off.
 */
export function defenderCardPose(ms) {
  const tremble = spanProgress(ms, TREMBLE);
  const heat = spanProgress(ms, HEAT);
  const heatTint = heat === null ? 0 : (1 - heat) ** 1.5;
  if (tremble !== null) {
    const amp = 0.012 * tremble;
    return {
      along: 0,
      across: amp * Math.sin(ms * 0.11),
      scaleAlong: 1,
      scaleAcross: 1,
      wobble: 1.5 * tremble * Math.sin(ms * 0.07),
      heat: 0,
    };
  }
  const knock = spanProgress(ms, KNOCK);
  if (knock !== null) {
    const kick = easeOutCubic(clamp01(knock / 0.14));
    const back = knock < 0.14 ? 1 : springHome((knock - 0.14) / 0.86, 1.5, 3);
    const impulse =
      knock < 0.1 ? knock / 0.1 : Math.max(0, 1 - (knock - 0.1) / 0.3);
    return {
      along: 0.3 * kick * back,
      across: 0,
      scaleAlong: 1 - 0.14 * impulse,
      scaleAcross: 1 + 0.09 * impulse,
      wobble: 8 * Math.sin(knock * Math.PI * 3) * (1 - knock) ** 2,
      heat: heatTint,
    };
  }
  return {
    along: 0,
    across: 0,
    scaleAlong: 1,
    scaleAcross: 1,
    wobble: 0,
    heat: heatTint,
  };
}
