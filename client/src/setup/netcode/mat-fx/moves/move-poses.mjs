// Design 063: the pure beat math behind every move drawer, lifted from the Fire Blast look
// test and extended with the drawers the move table needs. One
// function per drawer, `(s, h, params) -> plain objects`; move-drawers.js maps them to
// material calls. `s` is the beat's progress (clamped to [0, 1]), `h` the card height in
// px, params are the drawer's (defaults filled here). Returned lengths are px; offsets are
// from the beat's target centre unless stated (lane-frame ones say so). DOM-free.
import { seededRandom } from '../flow-pose.mjs';
import { withDefaults } from './move-spec.mjs';

const TAU = Math.PI * 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t ** 3;
const easeInQuad = (t) => t * t;
const rad = (deg) => (deg * Math.PI) / 180;

/** The 大 of the sprite: one arm straight up, two raised arms, two legs. Screen degrees, reach in h. */
export const FLARE_ARMS = Object.freeze([
  { angle: -90, reach: 1.25 },
  { angle: -160, reach: 1.0 },
  { angle: -20, reach: 1.0 },
  { angle: 125, reach: 1.1 },
  { angle: 55, reach: 1.1 },
]);

const CROSS_ARMS = Object.freeze([-90, 0, 90, 180].map((angle) => ({ angle, reach: 1.0 })));
const RING_ARMS = Object.freeze(Array.from({ length: 8 }, (_, i) => ({ angle: -90 + i * 45, reach: 0.8 })));

/** An `arms` param ('dai' | 'cross' | 'ring' | explicit array) as an array of { angle, reach }. */
export function resolveArms(arms) {
  if (Array.isArray(arms)) return arms;
  if (arms === 'cross') return CROSS_ARMS;
  if (arms === 'ring') return RING_ARMS;
  return FLARE_ARMS;
}

/**
 * Charge: `count` bodies orbit the attacker on a tilted ellipse, speeding up and tightening
 * until they sit as one at the card's leading edge. `depth` is -1 behind the card to +1 in
 * front; `heading` is the orbit's direction of travel (degrees). dx/dy are screen offsets
 * from the attacker centre.
 * @returns {{dx:number, dy:number, r:number, alpha:number, depth:number, heading:number}[]}
 */
export function chargeOrbs(s, h, params) {
  const { count, r0, r1, tilt } = withDefaults('orbitCharge', params);
  const c = clamp01(s);
  const spin = TAU * (0.9 * c + 1.6 * c * c);
  const radius = h * (0.85 - 0.6 * easeInCubic(c));
  const fadeIn = clamp01(c / 0.12);
  const orbs = [];
  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * TAU + spin;
    const depth = Math.sin(theta);
    orbs.push({
      dx: Math.cos(theta) * radius,
      dy: depth * radius * tilt - h * 0.04,
      r: h * (r0 + (r1 - r0) * c) * (1 + 0.22 * depth),
      alpha: fadeIn * (0.75 + 0.25 * depth),
      depth,
      heading: (Math.atan2(Math.cos(theta) * tilt, -Math.sin(theta)) * 180) / Math.PI,
    });
  }
  return orbs;
}

/** The body building at the attacker's leading edge; x along the lane, y along its normal (px). */
export function chargeCore(s, h, params) {
  const { lead, r0, r1, from } = withDefaults('coreCharge', params);
  const c = clamp01(s);
  const build = easeInCubic(clamp01((c - from) / (1 - from)));
  return { x: h * lead, y: 0, r: h * (r0 + (r1 - r0) * build), alpha: build };
}

/** Shock rings leaving the attacker as the move is released, each `delay` later than the last. */
export function releaseRings(s, h, params) {
  const { count, delay, r0, r1 } = withDefaults('shockRings', params);
  const rings = [];
  s = clamp01(s);
  for (let i = 0; i < count; i += 1) {
    const start = i * delay;
    if (s < start || start >= 1) continue;
    const c = clamp01((s - start) / (1 - start));
    rings.push({
      r: h * (r0 + (r1 - r0) * easeOutCubic(c)),
      alpha: 0.7 * (1 - c) ** 1.5,
      width: h * 0.07 * (1 - 0.5 * c),
    });
  }
  return rings;
}

const EASES = {
  in: easeInQuad,
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 2,
};

/**
 * The projectile's place on the lane: `f` the fraction covered (leading edge -> defender),
 * `side` the offset along the normal (px), `headingDeg` relative to the lane direction.
 */
export function projectilePose(s, h, params) {
  const { path, r0, r1, bow, ease } = withDefaults('projectile', params);
  const c = clamp01(s);
  const arc = path === 'straight' ? 0 : Math.sin(c * Math.PI) * bow * h;
  const wave = path === 'spiral' ? Math.sin(6 * Math.PI * c) * 0.12 * h : 0;
  return { f: EASES[ease](c), side: arc + wave, r: h * (r0 + (r1 - r0) * c), alpha: 1, headingDeg: 0 };
}

/** Local darkening around the target (house rule: <= 1.6 card heights). */
export function vignettePose(s, h, params) {
  const { maxAlpha, inner, outer } = withDefaults('vignette', params);
  const c = clamp01(s);
  let a;
  if (c < 0.2) a = easeOutCubic(c / 0.2);
  else if (c < 0.7) a = 1;
  else a = Math.max(0, 1 - (c - 0.7) / 0.3);
  return { alpha: maxAlpha * a, inner: h * inner, outer: h * outer };
}

/** Radial speed lines around the target, fading as they lengthen. */
export function raysPose(s, h, params) {
  const { count, inner, outer } = withDefaults('speedRays', params);
  const c = clamp01(s);
  return {
    alpha: 0.5 * (1 - c) ** 2,
    inner: h * inner,
    outer: h * (outer - 0.6 + 0.6 * easeOutCubic(c)),
    count,
    spin: c * 0.25,
  };
}

/**
 * The flare over the target: arms grow out of a core, hold while flickering, then break into
 * fragments that drift outward and fade. Arm angles are screen degrees.
 * @returns {{core:{r:number, alpha:number}, breakUp:number, arms:{angle:number, length:number,
 *   width:number, drift:number, alpha:number}[]}}
 */
export function flarePose(s, h, params) {
  const { arms, width, core, grow, breakAt } = withDefaults('starFlare', params);
  const c = clamp01(s);
  const g = easeOutCubic(clamp01(c / grow));
  const breakUp = clamp01((c - breakAt) / (1 - breakAt));
  const alpha = 1 - easeInCubic(breakUp);
  return {
    core: { r: h * core * g * (1 - 0.6 * breakUp), alpha },
    breakUp,
    arms: resolveArms(arms).map(({ angle, reach }) => ({
      angle,
      length: h * reach * g,
      width: h * width * (1 - 0.45 * breakUp),
      drift: h * 0.4 * breakUp,
      alpha,
    })),
  };
}

/**
 * Tongues that make up one flare arm: a main tongue with two shorter side tongues for mass;
 * while breaking up the main tongue splits into fragments that slide outward.
 * @returns {{angleDeg:number, from:number, length:number, width:number, alpha:number}[]}
 */
export function armTongues(arm, breakUp) {
  if (!(arm.length > 0)) return [];
  const tongues = [];
  if (breakUp < 0.35) {
    tongues.push({ angleDeg: arm.angle, from: arm.drift, length: arm.length, width: arm.width, alpha: arm.alpha });
  } else {
    const parts = 3;
    for (let k = 0; k < parts; k += 1) {
      tongues.push({
        angleDeg: arm.angle,
        from: (k / parts) * arm.length + arm.drift * (0.6 + 0.4 * k),
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

/** The white-hot core at contact: instant peak, fast falloff, swelling as it fades. */
export function flashPose(s, h, params) {
  const { r0, r1 } = withDefaults('impactFlash', params);
  const c = clamp01(s);
  return {
    alpha: c < 0.12 ? c / 0.12 : (1 - (c - 0.12) / 0.88) ** 2,
    r: h * (r0 + (r1 - r0) * c),
  };
}

/** Soot after the flare: puffs rising off the target, spreading and thinning. */
export function smokePuffs(s, h, params) {
  const { count, rise } = withDefaults('smoke', params);
  const c = clamp01(s);
  const puffs = [];
  for (let k = 0; k < count; k += 1) {
    const stagger = clamp01((c - k * 0.07) / (1 - k * 0.07));
    if (stagger <= 0) continue;
    const spread = ((k % 2 ? 1 : -1) * (0.15 + 0.12 * k)) / 2;
    puffs.push({
      dx: h * spread * (0.4 + easeOutCubic(stagger)),
      dy: -h * (0.1 + (rise - 0.1) * easeOutCubic(stagger)),
      r: h * (0.18 + 0.32 * stagger),
      alpha: 0.32 * Math.sin(stagger * Math.PI) ** 0.8,
    });
  }
  return puffs;
}

const BEAM_SEGMENTS = 6;

/**
 * A lane-aligned strip from the attacker's leading edge to the defender. `from`/`to` are
 * fractions along the lane (0 = leading edge, 1 = defender centre); it grows from the
 * attacker over the first `growIn`, holds, and retracts from the attacker over the last
 * `retract`. Segments are the strip's pieces (see kinds); `side` is a px amplitude.
 */
export function beamPose(s, lane, params) {
  const { kind, w, gap, turns, speed, growIn, retract } = withDefaults('beam', params);
  const c = clamp01(s);
  const to = easeOutCubic(clamp01(c / growIn));
  const from = c > 1 - retract ? easeInQuad((c - (1 - retract)) / retract) : 0;
  const width = lane.h * w * (kind === 'widening' ? 0.3 + 0.7 * c : 1);
  const reach = Math.max(to - from, 0);
  const segments = [];
  if (reach > 0) {
    if (kind === 'solid' || kind === 'widening') {
      segments.push({ f0: from, f1: to, side: 0, alpha: 1 });
    } else if (kind === 'segmented') {
      for (let i = 0; i < BEAM_SEGMENTS; i += 1) {
        const f0 = from + (reach * i) / BEAM_SEGMENTS;
        segments.push({ f0, f1: f0 + (reach / BEAM_SEGMENTS) * 0.6, side: 0, alpha: 1 });
      }
    } else if (kind === 'pulse-train') {
      const step = (gap * lane.h) / Math.max(lane.length, 1);
      const shift = c * speed * 0.5;
      for (let i = 0; i < BEAM_SEGMENTS; i += 1) {
        const f = from + ((i * step + shift) % reach);
        segments.push({ f0: f, f1: f, side: 0, alpha: 1 });
      }
    } else {
      for (const strand of [1, -1]) {
        segments.push({
          f0: from,
          f1: to,
          side: strand * width * 0.9,
          alpha: 1,
          phase: (strand > 0 ? 0 : Math.PI) + c * 8,
          turns,
        });
      }
    }
  }
  return { from, to, width, segments };
}

/**
 * `count` tongues leaving the target in a fan of `arc` degrees centred on `direction`
 * (screen degrees), staggered and falling under `gravity`. Offsets from the target centre.
 */
export function splashPose(s, h, seed, params) {
  const { count, arc, direction, gravity, len, stagger } = withDefaults('splash', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const angle = direction - arc / 2 + (arc * (i + 0.3 + 0.4 * rand())) / count;
    const reach = len[0] + (len[1] - len[0]) * rand();
    const delay = Math.min(0.5, stagger * i);
    const local = clamp01((c - delay) / (1 - delay));
    if (local <= 0) continue;
    const travel = h * reach * easeOutCubic(local);
    out.push({
      x: Math.cos(rad(angle)) * travel,
      y: Math.sin(rad(angle)) * travel + gravity * h * local * local,
      angleDeg: angle,
      length: h * reach * (0.5 + 0.3 * local),
      width: h * 0.14 * (1 - 0.4 * local),
      alpha: local < 0.1 ? local / 0.1 : (1 - local) ** 0.8,
    });
  }
  return out;
}

/**
 * A vertical (screen) column: rises from the floor ('below') or drops from above onto the
 * target, holds, then dissolves. `x, y` is the column's base, `angleDeg` points where it grows.
 */
export function pillarPose(s, h, params) {
  const { height, w, from } = withDefaults('pillar', params);
  const c = clamp01(s);
  const grow = easeOutCubic(clamp01(c / 0.3));
  const dissolve = clamp01((c - 0.7) / 0.3);
  const full = height * h;
  if (from === 'above') {
    return {
      x: 0,
      y: 0.5 * h - full + full * grow * dissolve,
      angleDeg: 90,
      length: full * grow * (1 - dissolve),
      width: h * w * (0.6 + 0.4 * grow) * (1 - 0.3 * dissolve),
      alpha: 1 - dissolve ** 2,
      hot: 1 - 0.4 * dissolve,
    };
  }
  return {
    x: 0,
    y: 0.5 * h - full * 0.6 * dissolve,
    angleDeg: -90,
    length: full * grow * (1 - dissolve),
    width: h * w * (0.6 + 0.4 * grow) * (1 - 0.3 * dissolve),
    alpha: 1 - dissolve ** 2,
    hot: 1 - 0.4 * dissolve,
  };
}

/**
 * Arc-shaped slashes sweeping across the target. Each is a tongue running from the arc's
 * trailing point to its tip (`x, y` the tail, `angleDeg` toward the tip); `edge` is the
 * tip's progress along the sweep. Offsets from the target centre.
 */
export function slashPose(s, h, params) {
  const { sweep, radius, count, gapDeg, angle, thick } = withDefaults('slashArc', params);
  const c = clamp01(s);
  const edge = easeOutCubic(clamp01(c / 0.6));
  const fade = c < 0.6 ? 1 : 1 - (c - 0.6) / 0.4;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const start = angle - sweep / 2 + (i - (count - 1) / 2) * gapDeg;
    const tip = start + sweep * edge;
    const tail = start + sweep * Math.max(0, edge - 0.55);
    const r = h * radius;
    const tx = Math.cos(rad(tail)) * r;
    const ty = Math.sin(rad(tail)) * r;
    const ex = Math.cos(rad(tip)) * r;
    const ey = Math.sin(rad(tip)) * r;
    out.push({
      x: tx,
      y: ty,
      angleDeg: (Math.atan2(ey - ty, ex - tx) * 180) / Math.PI,
      length: Math.hypot(ex - tx, ey - ty),
      width: h * thick * (0.5 + 0.5 * edge),
      alpha: fade,
      edge,
    });
  }
  return out;
}

/**
 * The table layer under the target: branching cracks, rolling waves, low dust, or a quake.
 * Unused arrays are empty. Coordinates are offsets from the target centre; `jitter` is the
 * host offset a quake applies (px).
 */
export function terrainPose(s, h, seed, params) {
  const { kind, radius, amp } = withDefaults('terrain', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const pose = { cracks: [], waves: [], dust: [], jitter: { x: 0, y: 0 }, alpha: 1 - clamp01((c - 0.6) / 0.4) };
  if (kind === 'crack') {
    const reach = radius * h * easeOutCubic(clamp01(c / 0.5));
    const branches = 5;
    for (let i = 0; i < branches; i += 1) {
      const angle = ((i + 0.3 * rand()) / branches) * TAU;
      const line = [];
      for (let j = 0; j <= 4; j += 1) {
        const d = (j / 4) * reach;
        const jag = j === 0 ? 0 : (rand() - 0.5) * 0.12 * h;
        line.push([Math.cos(angle) * d - Math.sin(angle) * jag, Math.sin(angle) * d * 0.6 + Math.cos(angle) * jag * 0.6]);
      }
      pose.cracks.push(line);
    }
  } else if (kind === 'wave') {
    for (let i = 0; i < 3; i += 1) {
      const local = clamp01((c - i * 0.15) / 0.7);
      if (local <= 0) continue;
      pose.waves.push({ r: radius * h * easeOutCubic(local), alpha: 0.6 * (1 - local) ** 1.5 });
    }
  } else if (kind === 'dust') {
    for (let i = 0; i < 6; i += 1) {
      pose.dust.push({
        dx: ((i - 2.5) / 2.5) * radius * h * 0.8 * easeOutCubic(c),
        dy: 0.45 * h - 0.1 * h * c,
        r: h * (0.15 + 0.25 * c) * (0.8 + 0.4 * rand()),
        alpha: 0.35 * Math.sin(Math.PI * c),
      });
    }
  } else {
    const decay = 1 - c;
    pose.jitter = { x: amp * h * Math.sin(c * Math.PI * 12) * decay, y: amp * h * 0.6 * Math.cos(c * Math.PI * 9) * decay };
  }
  return pose;
}

/** Overlapping bodies drifting `drift` h along `direction` (screen degrees): gas, mist, spore. */
export function cloudPose(s, h, seed, params) {
  const { count, radius, drift, direction, alpha } = withDefaults('cloud', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const baseX = (rand() - 0.5) * radius * h * 1.6;
    const baseY = (rand() - 0.5) * radius * h * 1.2;
    const delay = (i / count) * 0.4;
    const local = clamp01((c - delay) / (1 - delay));
    if (local <= 0) continue;
    const d = drift * h * easeOutCubic(local);
    out.push({
      dx: baseX + Math.cos(rad(direction)) * d,
      dy: baseY + Math.sin(rad(direction)) * d,
      r: h * radius * (0.7 + 0.5 * local),
      alpha: alpha * Math.sin(Math.PI * local) ** 0.8,
    });
  }
  return out;
}

/** Tongues along an Archimedean spiral around the target (whirlpool, twister, vortex). */
export function spiralPose(s, h, params) {
  const { turns, r0, r1, rpm, tongues } = withDefaults('spiral', params);
  const c = clamp01(s);
  const spin = (rpm / 90) * TAU * c;
  const envelope = Math.sin(Math.PI * c) ** 0.7;
  const out = [];
  for (let k = 0; k < tongues; k += 1) {
    const u = k / tongues;
    const theta = TAU * turns * u + spin;
    const radius = h * (r0 + (r1 - r0) * u);
    out.push({
      x: Math.cos(theta) * radius,
      y: Math.sin(theta) * radius * 0.7,
      angleDeg: (theta * 180) / Math.PI + 90,
      length: h * 0.35,
      width: h * 0.12,
      alpha: envelope * (0.5 + 0.5 * u),
    });
  }
  return out;
}

/**
 * `count` projectiles staggered by `stagger` ms along slightly different bows; one entry per
 * body in flight. `beatMs` (the beat's length in ms) turns the stagger into progress.
 */
export function volleyPose(s, h, params) {
  const { count, stagger, r0, r1, bow } = withDefaults('volley', params);
  const beatMs = Number.isFinite(params?.beatMs) && params.beatMs > 0 ? params.beatMs : 400;
  const flight = Math.max(beatMs - (count - 1) * stagger, 60);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const local = (clamp01(s) * beatMs - i * stagger) / flight;
    if (local <= 0 || local >= 1) continue;
    const dir = i % 2 ? 1 : -1;
    out.push({
      f: easeInQuad(local),
      side: Math.sin(Math.PI * local) * bow * h * dir * (0.5 + i / count),
      r: h * (r0 + (r1 - r0) * local),
      alpha: 1,
      headingDeg: 0,
    });
  }
  return out;
}

/** A glow pulsing at `hz` hugging a card (`beatMs` sets how many pulses the beat holds). */
export function auraPose(s, h, params) {
  const { hz, alpha, r0, r1 } = withDefaults('aura', params);
  const beatMs = Number.isFinite(params?.beatMs) && params.beatMs > 0 ? params.beatMs : 700;
  const c = clamp01(s);
  const pulse = 0.5 + 0.5 * Math.sin(TAU * hz * c * (beatMs / 1000));
  const envelope = c < 0.15 ? c / 0.15 : c > 0.85 ? (1 - c) / 0.15 : 1;
  return { r: h * (r0 + (r1 - r0) * pulse), alpha: alpha * envelope * (0.7 + 0.3 * pulse) };
}

/** Short vertical tongues falling from above into the target's footprint, each splashing on landing. */
export function rainPose(s, h, seed, params) {
  const { count, height, spread } = withDefaults('rain', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rand() - 0.5) * spread * h;
    const delay = rand() * 0.5;
    const local = clamp01((c - delay) / 0.5);
    if (local <= 0) continue;
    if (local < 1) {
      out.push({
        x,
        y: -height * h * (1 - easeInQuad(local)),
        length: h * 0.25,
        width: h * 0.05,
        alpha: 1,
        splash: 0,
      });
      continue;
    }
    const splash = clamp01((c - delay - 0.5) / 0.3);
    if (splash >= 1) continue;
    out.push({ x, y: 0, length: h * 0.1, width: h * 0.05, alpha: 1 - splash, splash });
  }
  return out;
}

/** Angular fragments bursting from the target along `arc`, rotating as they fly. */
export function shardsPose(s, h, seed, params) {
  const { count, arc, direction, distance, spin } = withDefaults('shards', params);
  const rand = seededRandom(seed);
  const c = clamp01(s);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const angle = arc >= 360 ? direction + ((i + rand() * 0.8) / count) * 360 : direction - arc / 2 + arc * rand();
    const reach = distance * (0.6 + 0.5 * rand());
    const travel = h * reach * easeOutCubic(c);
    out.push({
      x: Math.cos(rad(angle)) * travel,
      y: Math.sin(rad(angle)) * travel,
      angleDeg: angle + spin * c * (i % 2 ? 1 : -1),
      length: h * (0.16 + 0.14 * rand()),
      width: h * 0.09,
      alpha: c < 0.6 ? 1 : 1 - (c - 0.6) / 0.4,
    });
  }
  return out;
}

/**
 * A jagged polyline from the attacker (or from 1.6 h above the defender on screen) to the
 * defender, re-rolled every `rerollMs` so it flickers. `lane` is host-local; points are
 * host-local px.
 */
export function boltPose(s, lane, seed, elapsedMs, params) {
  const { from, segments, jag, branches, rerollMs, width } = withDefaults('bolt', params);
  const c = clamp01(s);
  const rand = seededRandom(Math.floor(seed + Math.floor(Math.max(0, elapsedMs) / rerollMs) * 7919));
  const start =
    from === 'sky'
      ? { x: lane.bx, y: lane.by - 1.6 * lane.h }
      : { x: lane.ax + lane.ux * lane.h * 0.42, y: lane.ay + lane.uy * lane.h * 0.42 };
  const end = { x: lane.bx, y: lane.by };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const offset = i === 0 || i === segments ? 0 : (rand() * 2 - 1) * jag * lane.h;
    points.push([start.x + dx * f + nx * offset, start.y + dy * f + ny * offset]);
  }
  const forks = [];
  for (let b = 0; b < branches; b += 1) {
    const at = points[1 + Math.floor(rand() * (segments - 1))];
    const angle = Math.atan2(dy, dx) + (rand() < 0.5 ? -1 : 1) * (0.4 + 0.5 * rand());
    const reach = lane.h * (0.2 + 0.25 * rand());
    forks.push([
      at,
      [at[0] + Math.cos(angle) * reach * 0.5 + nx * (rand() - 0.5) * jag * lane.h, at[1] + Math.sin(angle) * reach * 0.5],
      [at[0] + Math.cos(angle) * reach, at[1] + Math.sin(angle) * reach],
    ]);
  }
  return {
    points,
    branches: forks,
    alpha: c < 0.1 ? c / 0.1 : 1 - Math.max(0, (c - 0.6) / 0.4),
    width: lane.h * width,
  };
}

/** Expanding rings around the target (a floor shockwave or a face-on sonic ring). */
export function ringPose(s, h, params) {
  const { count, r0, r1, width } = withDefaults('ring', params);
  const rings = [];
  s = clamp01(s);
  for (let i = 0; i < count; i += 1) {
    const start = (i * 0.5) / count;
    const c = clamp01((s - start) / (1 - start));
    if (c <= 0) continue;
    rings.push({ r: h * (r0 + (r1 - r0) * easeOutCubic(c)), alpha: 0.7 * (1 - c) ** 1.5, width: h * width * (1 - 0.5 * c) });
  }
  return rings;
}

/** A sigil over the target: radius, opacity envelope and a spin in degrees. */
export function glyphPose(s, h, params) {
  const { r } = withDefaults('glyph', params);
  const c = clamp01(s);
  const envelope = c < 0.2 ? c / 0.2 : c > 0.75 ? (1 - c) / 0.25 : 1;
  return { r: h * r * (0.7 + 0.3 * easeOutCubic(c)), alpha: envelope, spin: 120 * c };
}
