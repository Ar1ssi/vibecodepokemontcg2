// Design 063: card motion presets for move scenes, lifted from the accepted Fire Blast
// take. Pure: every preset is `(ms, { contactMs, durationMs, params, laneH }) -> pose`
// on the scene clock. Lengths are in card heights; `along` is toward the other card,
// `across` along the lane's left normal. The player maps a pose to a CSS transform.
//   attacker pose { along, across, scale, tilt, glow }
//   defender pose { along, across, scaleAlong, scaleAcross, wobble, heat, lift, cold }
// `lift` is screen-space (positive = up the screen) so a float reads the same from both
// seats; every other offset is lane-space.
import { fillDefaults } from './param-kinds.mjs';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInQuad = (t) => t * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const TAU = Math.PI * 2;

/** Damped spring from 1 back to 0: `cycles` half-swings, decaying by `decay`. */
export const springHome = (p, cycles = 1.5, decay = 3) =>
  Math.cos(p * Math.PI * cycles) * Math.exp(-decay * p);

const span = (ms, a, b) => (!(ms >= a) || ms >= b ? null : (ms - a) / (b - a));

export const KNOCK_MS = 520;
export const HEAT_MS = 650;
export const FREEZE_MS = 900;
const SINK_MS = 450;
const SINK_JITTER_MS = 300;
const FLOAT_DROP_MS = 300;
const TREMBLE_FROM = 0.82;

export const ATTACKER_REST = Object.freeze({ along: 0, across: 0, scale: 1, tilt: 0, glow: 0 });
export const DEFENDER_REST = Object.freeze({
  along: 0,
  across: 0,
  scaleAlong: 1,
  scaleAcross: 1,
  wobble: 0,
  heat: 0,
  lift: 0,
  cold: false,
});

const attackerPose0 = (over) => ({ ...ATTACKER_REST, ...over });
const defenderPose0 = (over) => ({ ...DEFENDER_REST, ...over });

// ---- attacker presets ------------------------------------------------------------
// Each: params schema (kind format), `endC` (end as a multiple of contact), `pose`.

const reachFor = (reachMax, laneH) => Math.max(0, Math.min(reachMax, (Number.isFinite(laneH) ? laneH : 1.2) - 0.9));

const rearLurch = (ms, { contactMs: c, params: p }) => {
  const windup = span(ms, 0, 0.56 * c);
  if (windup !== null) {
    const w = easeOutCubic(windup);
    return attackerPose0({ along: -p.rear * w, scale: 1 + 0.05 * w, tilt: -4 * w, glow: 0.7 * w * p.glow });
  }
  // Design 065: `hold` keeps the wind-up pose before the thrust; thrust and recoil shift by it.
  const hold = p.hold ?? 0;
  if (hold > 0 && ms >= 0.56 * c && ms < 0.56 * c + hold) {
    return attackerPose0({ along: -p.rear, scale: 1.05, tilt: -4, glow: 0.7 * p.glow });
  }
  ms -= hold;
  const thrust = span(ms, 0.56 * c, 0.7 * c);
  if (thrust !== null) {
    const f = easeInQuad(thrust);
    return attackerPose0({
      along: -p.rear + p.lurch * f,
      scale: 1.05 - 0.05 * f,
      tilt: -4 + 7 * f,
      glow: (1 - 0.3 * thrust) * p.glow,
    });
  }
  const recoil = span(ms, 0.7 * c, 1.2 * c);
  if (recoil !== null) {
    const r = springHome(recoil, 1.5, 3.5);
    return attackerPose0({
      along: (p.lurch - p.rear) * r,
      tilt: 3 * r,
      glow: 0.7 * (1 - recoil) ** 2 * p.glow,
    });
  }
  return ATTACKER_REST;
};

const brace = (ms, { contactMs: c, params: p }) => {
  const wind = span(ms, 0, 0.7 * c);
  if (wind !== null) {
    const w = easeOutCubic(wind);
    return attackerPose0({
      along: -p.rear * w,
      scale: 1 + (p.scale - 1) * w,
      tilt: -2 * w,
      glow: p.glow * w,
    });
  }
  const settle = span(ms, 0.7 * c, 1.1 * c);
  if (settle !== null) {
    const r = springHome(settle, 1.5, 3);
    return attackerPose0({
      along: -p.rear * r,
      scale: 1 + (p.scale - 1) * r,
      tilt: -2 * r,
      glow: p.glow * (1 - settle) ** 2,
    });
  }
  return ATTACKER_REST;
};

const lunge = (ms, { contactMs: c, params: p, laneH }) => {
  const reach = reachFor(p.reach, laneH);
  const wind = span(ms, 0, 0.4 * c);
  if (wind !== null) {
    const w = easeOutCubic(wind);
    return attackerPose0({ along: -p.wind * w, scale: 1 + 0.06 * w, glow: p.glow * w });
  }
  const strikes = p.strikes ?? 1;
  if (strikes > 1 && ms >= 0.4 * c && ms < c) {
    // Design 065: the strike window splits into `strikes` rewind-and-strike pairs; contact is the last.
    const part = (0.6 * c) / strikes;
    const k = Math.min(strikes - 1, Math.floor((ms - 0.4 * c) / part));
    const local = (ms - 0.4 * c - k * part) / part;
    const startAlong = k === 0 ? -p.wind : reach;
    if (local < 0.6) {
      const r = easeOutCubic(local / 0.6);
      return attackerPose0({ along: startAlong + (-0.1 - startAlong) * r, scale: 1.06, glow: p.glow });
    }
    return attackerPose0({ along: -0.1 + (reach + 0.1) * easeInQuad((local - 0.6) / 0.4), scale: 1.06, glow: p.glow });
  }
  const strike = span(ms, 0.4 * c, c);
  if (strike !== null) {
    return attackerPose0({
      along: -p.wind + (reach + p.wind) * easeInQuad(strike),
      scale: 1.06,
      glow: p.glow,
    });
  }
  const recoil = span(ms, c, 1.5 * c);
  if (recoil !== null) {
    return attackerPose0({
      along: reach * springHome(recoil, 1.5, 3.5),
      scale: 1 + 0.06 * (1 - recoil),
      glow: p.glow * (1 - recoil),
    });
  }
  return ATTACKER_REST;
};

const dash = (ms, { contactMs: c, params: p, laneH }) => {
  const reach = reachFor(p.reach, laneH);
  const wind = span(ms, 0, 0.3 * c);
  if (wind !== null) {
    const w = easeOutCubic(wind);
    return attackerPose0({ along: -p.wind * w, scale: 1 + 0.06 * w });
  }
  const run = span(ms, 0.3 * c, c);
  if (run !== null) {
    return attackerPose0({ along: -p.wind + (reach + p.wind) * easeInQuad(run), scale: 1.06 });
  }
  const pass = span(ms, c, 1.15 * c);
  if (pass !== null) {
    return attackerPose0({ along: reach + p.overshoot * easeOutCubic(pass), scale: 1.06 });
  }
  const back = span(ms, 1.15 * c, 1.7 * c);
  if (back !== null) {
    const e = easeInOutCubic(back);
    return attackerPose0({
      along: (reach + p.overshoot) * (1 - e),
      across: p.arc * Math.sin(Math.PI * back),
      scale: 1 + 0.06 * (1 - e),
    });
  }
  return ATTACKER_REST;
};

const WARP_SCALE = 0.15;

/**
 * Design 065: the attacker sinks away (scale 1 -> 0.15 while moving 0.3 of the lane), stays
 * hidden to 0.85 c, reappears 0.9 h short of the defender growing back by contact (the
 * strike), then springs home over c -> 1.5 c.
 */
const warp = (ms, { contactMs: c, laneH }) => {
  const lane = Number.isFinite(laneH) ? laneH : 1.2;
  const out = 0.3 * lane;
  const strikeAt = Math.max(0, lane - 0.9);
  const sinkSpan = span(ms, 0, 0.3 * c);
  if (sinkSpan !== null) {
    const e = easeInOutCubic(sinkSpan);
    return attackerPose0({ along: out * e, scale: 1 - (1 - WARP_SCALE) * e });
  }
  if (span(ms, 0.3 * c, 0.85 * c) !== null) return attackerPose0({ along: out, scale: WARP_SCALE, glow: 0 });
  const back = span(ms, 0.85 * c, c);
  if (back !== null) {
    return attackerPose0({ along: strikeAt, scale: WARP_SCALE + (1 - WARP_SCALE) * easeOutCubic(back) });
  }
  const home = span(ms, c, 1.5 * c);
  if (home !== null) return attackerPose0({ along: strikeAt * springHome(home, 1.5, 3.5) });
  return ATTACKER_REST;
};

const rise = (ms, { contactMs: c }) => {
  const lift = span(ms, 0, 0.6 * c);
  const hover = span(ms, 0.6 * c, 1.2 * c);
  const land = span(ms, 1.2 * c, 1.6 * c);
  let env = null;
  if (lift !== null) env = easeOutCubic(lift);
  else if (hover !== null) env = 1;
  else if (land !== null) env = 1 - easeInOutCubic(land);
  if (env === null) return ATTACKER_REST;
  const t = ms / 1000;
  return attackerPose0({
    across: 0.1 * env * Math.sin(TAU * 2 * t),
    scale: 1 + 0.12 * env,
    tilt: 3 * env * Math.sin(TAU * t),
    glow: 0.5 * env,
  });
};

const stomp = (ms, { contactMs: c }) => {
  const lift = span(ms, 0, 0.8 * c);
  if (lift !== null) return attackerPose0({ scale: 1 + 0.15 * easeOutCubic(lift) });
  const slam = span(ms, 0.8 * c, c);
  if (slam !== null) return attackerPose0({ scale: 1.15 - 0.17 * easeInQuad(slam) });
  const settle = span(ms, c, 1.4 * c);
  if (settle !== null) return attackerPose0({ scale: 0.98 + 0.02 * easeOutCubic(settle) });
  return ATTACKER_REST;
};

const spin = (ms, { contactMs: c, params: p }) => {
  const t = span(ms, 0, 1.3 * c);
  if (t === null) return ATTACKER_REST;
  return attackerPose0({ tilt: 360 * p.turns * easeInOutCubic(t), scale: 1 + 0.05 * Math.sin(Math.PI * t) });
};

// ---- design 089: more ways to attack -------------------------------------------------
// Fifty-four of 144 moves reared and lurched, and every dash ran the same line. These five give
// a move's kind its own body language: three stay home (hop, coil, channel), two reach the
// defender (slam, sweep).

/** A light attacker bounces on the spot, then jabs: crouch, hop toward the camera, a short thrust. */
const hop = (ms, { contactMs: c, params: p }) => {
  const jump = span(ms, 0, 0.5 * c);
  if (jump !== null) {
    const crouch = Math.sin(Math.PI * Math.min(1, jump / 0.25)) * (jump < 0.25 ? 1 : 0);
    const air = jump < 0.25 ? 0 : Math.sin((Math.PI * (jump - 0.25)) / 0.75);
    return attackerPose0({
      along: -0.05 * jump,
      scale: 1 - 0.05 * crouch + p.height * air,
      tilt: 3 * air,
      glow: 0.6 * jump * p.glow,
    });
  }
  const jab = span(ms, 0.5 * c, 0.7 * c);
  if (jab !== null) {
    const f = easeInQuad(jab);
    return attackerPose0({ along: -0.05 + 0.27 * f, scale: 1, tilt: 5 * f, glow: (0.6 + 0.4 * f) * p.glow });
  }
  const recoil = span(ms, 0.7 * c, 1.15 * c);
  if (recoil !== null) {
    const r = springHome(recoil, 1.5, 3.5);
    return attackerPose0({ along: 0.22 * r, tilt: 5 * r, glow: (1 - recoil) ** 2 * p.glow });
  }
  return ATTACKER_REST;
};

/** A whip: the card winds back about its own centre, shrinking, then snaps round the other way. */
const coil = (ms, { contactMs: c, params: p }) => {
  const wind = span(ms, 0, 0.6 * c);
  if (wind !== null) {
    const w = easeOutCubic(wind);
    return attackerPose0({ along: -0.07 * w, scale: 1 - 0.04 * w, tilt: -p.turn * w, glow: 0.7 * w * p.glow });
  }
  const snap = span(ms, 0.6 * c, 0.74 * c);
  if (snap !== null) {
    const f = easeInQuad(snap);
    return attackerPose0({
      along: -0.07 + 0.3 * f,
      scale: 0.96 + 0.08 * f,
      tilt: -p.turn + p.turn * 1.6 * f,
      glow: p.glow,
    });
  }
  const settle = span(ms, 0.74 * c, 1.25 * c);
  if (settle !== null) {
    const r = springHome(settle, 2, 3.2);
    return attackerPose0({ along: 0.23 * r, scale: 1 + 0.04 * r, tilt: p.turn * 0.6 * r, glow: (1 - settle) ** 2 * p.glow });
  }
  return ATTACKER_REST;
};

/** A caster never leaves its spot: it swells in slow breaths as the glow builds, then lets go. */
const channel = (ms, { contactMs: c, params: p }) => {
  const gather = span(ms, 0, c);
  if (gather !== null) {
    const env = easeOutCubic(Math.min(1, gather / 0.3));
    const breath = 0.5 - 0.5 * Math.cos(gather * TAU * 2);
    return attackerPose0({
      across: 0.018 * env * Math.sin(gather * TAU * 1.5),
      scale: 1 + p.pulse * env * (0.45 + 0.55 * breath),
      tilt: 1.5 * env * Math.sin(gather * TAU),
      glow: p.glow * easeOutCubic(gather),
    });
  }
  const release = span(ms, c, 1.3 * c);
  if (release !== null) {
    const r = springHome(release, 1.5, 3);
    return attackerPose0({ along: -0.05 * r, scale: 1 - 0.03 * r, glow: p.glow * (1 - release) ** 2 });
  }
  return ATTACKER_REST;
};

/** A heavy blow: the card rears up off the cloth toward the camera and comes down on the defender. */
const slam = (ms, { contactMs: c, params: p, laneH }) => {
  const reach = reachFor(p.reach, laneH);
  const rear = span(ms, 0, 0.55 * c);
  if (rear !== null) {
    const w = easeOutCubic(rear);
    return attackerPose0({ along: -p.wind * w, scale: 1 + p.rise * w, tilt: -3 * w, glow: p.glow * w });
  }
  const fall = span(ms, 0.55 * c, c);
  if (fall !== null) {
    const f = easeInQuad(fall);
    return attackerPose0({
      along: -p.wind + (reach + p.wind) * f,
      scale: 1 + p.rise * (1 - f) - 0.03 * f,
      tilt: -3 + 6 * f,
      glow: p.glow,
    });
  }
  const recoil = span(ms, c, 1.5 * c);
  if (recoil !== null) {
    return attackerPose0({
      along: reach * springHome(recoil, 1.5, 3.5),
      scale: 1 - 0.03 * (1 - recoil) ** 2,
      tilt: 3 * springHome(recoil, 1.5, 3.5),
      glow: p.glow * (1 - recoil),
    });
  }
  return ATTACKER_REST;
};

/** A cut: the card swings in on a curve from one side, crosses the defender and curls home the other way. */
const sweep = (ms, { contactMs: c, params: p, laneH }) => {
  const reach = reachFor(p.reach, laneH);
  const wind = span(ms, 0, 0.3 * c);
  if (wind !== null) {
    const w = easeOutCubic(wind);
    return attackerPose0({ along: -p.wind * w, across: -p.arc * 0.35 * w, scale: 1 + 0.06 * w, tilt: -6 * w });
  }
  const run = span(ms, 0.3 * c, c);
  if (run !== null) {
    const f = easeInQuad(run);
    return attackerPose0({
      along: -p.wind + (reach + p.wind) * f,
      across: -p.arc * (0.35 + 0.65 * Math.sin(Math.PI * run)) * (1 - f),
      scale: 1.06,
      tilt: -6 + 18 * f,
    });
  }
  const pass = span(ms, c, 1.15 * c);
  if (pass !== null) {
    const e = easeOutCubic(pass);
    return attackerPose0({ along: reach + p.overshoot * e, across: p.arc * 0.5 * e, scale: 1.06, tilt: 12 });
  }
  const back = span(ms, 1.15 * c, 1.7 * c);
  if (back !== null) {
    const e = easeInOutCubic(back);
    return attackerPose0({
      along: (reach + p.overshoot) * (1 - e),
      across: p.arc * 0.5 * (1 - e) + p.arc * 0.3 * Math.sin(Math.PI * back),
      scale: 1 + 0.06 * (1 - e),
      tilt: 12 * (1 - e),
    });
  }
  return ATTACKER_REST;
};

const idle = (ms, { durationMs, params: p }) => {
  const t = span(ms, 0, durationMs);
  if (t === null || !(p.glow > 0)) return ATTACKER_REST;
  return attackerPose0({ glow: p.glow * Math.sin(Math.PI * t) });
};

export const ATTACKER_MOTIONS = Object.freeze({
  'rear-lurch': {
    params: {
      rear: ['num', 0, 0.4, 0.14],
      lurch: ['num', 0, 0.8, 0.4],
      glow: ['num', 0, 1, 1],
      hold: ['num', 0, 600, 0],
    },
    endC: 1.2,
    pose: rearLurch,
  },
  brace: {
    params: { rear: ['num', 0, 0.3, 0.08], scale: ['num', 1, 1.15, 1.03], glow: ['num', 0, 1, 0.6] },
    endC: 1.1,
    pose: brace,
  },
  lunge: {
    params: {
      wind: ['num', 0, 0.4, 0.2],
      reach: ['num', 0.2, 1.2, 0.9],
      glow: ['num', 0, 1, 0],
      strikes: ['int', 1, 3, 1],
    },
    endC: 1.5,
    pose: lunge,
  },
  dash: {
    params: {
      wind: ['num', 0, 0.4, 0.2],
      reach: ['num', 0.2, 1.2, 0.9],
      overshoot: ['num', 0, 0.6, 0.3],
      arc: ['num', 0, 0.8, 0.4],
    },
    endC: 1.7,
    pose: dash,
  },
  warp: { params: {}, endC: 1.5, pose: warp },
  rise: { params: {}, endC: 1.6, pose: rise },
  stomp: { params: {}, endC: 1.4, pose: stomp },
  spin: { params: { turns: ['int', 1, 2, 1] }, endC: 1.3, pose: spin },
  hop: { params: { height: ['num', 0, 0.3, 0.12], glow: ['num', 0, 1, 0.6] }, endC: 1.15, pose: hop },
  coil: { params: { turn: ['num', 0, 40, 16], glow: ['num', 0, 1, 0.7] }, endC: 1.25, pose: coil },
  channel: { params: { pulse: ['num', 0, 0.14, 0.07], glow: ['num', 0, 1, 1] }, endC: 1.3, pose: channel },
  slam: {
    params: {
      wind: ['num', 0, 0.4, 0.16],
      reach: ['num', 0.2, 1.2, 0.9],
      rise: ['num', 0, 0.3, 0.16],
      glow: ['num', 0, 1, 0],
    },
    endC: 1.5,
    pose: slam,
  },
  sweep: {
    params: {
      wind: ['num', 0, 0.4, 0.18],
      reach: ['num', 0.2, 1.2, 0.9],
      overshoot: ['num', 0, 0.6, 0.25],
      arc: ['num', 0, 0.8, 0.42],
    },
    endC: 1.7,
    pose: sweep,
  },
  none: { params: { glow: ['num', 0, 1, 0] }, endC: 0, pose: idle },
});

/** Motions that carry the card to the defender: the move player trails them (a dash's smear). */
export const TRAVELLING_MOTIONS = Object.freeze(['dash', 'sweep', 'slam']);

// ---- defender presets ------------------------------------------------------------

const heatAt = (ms, c, strength) => {
  const t = span(ms, c, c + HEAT_MS);
  return t === null ? 0 : strength * (1 - t) ** 1.5;
};

/** The pre-contact tremble every defender shows as the move closes (0.82 c -> c). */
const tremble = (ms, c) => {
  const t = span(ms, TREMBLE_FROM * c, c);
  if (t === null) return null;
  return defenderPose0({ across: 0.012 * t * Math.sin(ms * 0.11), wobble: 1.5 * t * Math.sin(ms * 0.07) });
};

const squashOf = (impulse) => ({ scaleAlong: 1 - 0.14 * impulse, scaleAcross: 1 + 0.09 * impulse });

const knock = (ms, { contactMs: c, params: p }) => {
  const pre = tremble(ms, c);
  if (pre) return pre;
  const heat = heatAt(ms, c, p.heat);
  const k = span(ms, c, c + KNOCK_MS);
  if (k === null) return defenderPose0({ heat });
  const kick = easeOutCubic(clamp01(k / 0.14));
  const back = k < 0.14 ? 1 : springHome((k - 0.14) / 0.86, 1.5, 3);
  const impulse = k < 0.1 ? k / 0.1 : Math.max(0, 1 - (k - 0.1) / 0.3);
  return defenderPose0({
    along: p.strength * kick * back,
    ...squashOf(impulse),
    wobble: 8 * Math.sin(k * Math.PI * 3) * (1 - k) ** 2,
    heat,
  });
};

const stagger = (ms, { contactMs: c, params: p }) => {
  // Design 065: with `lead`, the first knock lands `lead` ms before contact and the last at it.
  const lead = p.lead ?? 0;
  const first = lead > 0 ? c - lead : c;
  const gap = lead > 0 ? lead / (p.hits - 1) : p.gapMs;
  const pre = tremble(ms, first);
  if (pre) return pre;
  const heat = heatAt(ms, c, p.heat);
  const step = p.strength / p.hits;
  const last = p.hits - 1;
  const lastStart = first + last * gap;
  if (ms >= lastStart) {
    const k = span(ms, lastStart, lastStart + KNOCK_MS);
    if (k === null) return defenderPose0({ heat });
    const base = step * last;
    const along =
      k < 0.14
        ? base + (p.strength - base) * easeOutCubic(k / 0.14)
        : p.strength * springHome((k - 0.14) / 0.86, 1.5, 3);
    const impulse = k < 0.1 ? k / 0.1 : Math.max(0, 1 - (k - 0.1) / 0.3);
    return defenderPose0({
      along,
      ...squashOf(impulse),
      wobble: 8 * Math.sin(k * Math.PI * 3) * (1 - k) ** 2,
      heat,
    });
  }
  const hit = Math.floor((ms - first) / gap);
  if (!(hit >= 0)) return defenderPose0({ heat });
  const kw = clamp01((ms - first - hit * gap) / gap);
  return defenderPose0({
    along: step * hit + step * easeOutCubic(clamp01(kw / 0.5)),
    ...squashOf(Math.sin(Math.PI * kw)),
    wobble: 3 * (hit % 2 ? 1 : -1) * Math.sin(Math.PI * kw),
    heat,
  });
};

const floatHold = (c, durationMs) => Math.max(c + 200, durationMs - FLOAT_DROP_MS);

const float = (ms, { contactMs: c, durationMs, params: p }) => {
  const heat = heatAt(ms, c, p.heat);
  const hold = floatHold(c, durationMs);
  let lift = null;
  const rising = span(ms, 0.7 * c, c);
  const held = span(ms, c, hold);
  const drop = span(ms, hold, hold + FLOAT_DROP_MS);
  if (rising !== null) lift = p.lift * easeOutCubic(rising);
  else if (held !== null) lift = p.lift;
  else if (drop !== null) lift = p.lift * (1 - easeInQuad(drop)) + 0.06 * Math.sin(Math.PI * drop) * (1 - drop);
  if (lift === null) return defenderPose0({ heat });
  const env = lift / Math.max(p.lift, 1e-6);
  return defenderPose0({ lift, wobble: 4 * Math.min(1, env) * Math.sin(TAU * 1.5 * (ms / 1000)), heat });
};

const sink = (ms, { contactMs: c, params: p }) => {
  const pre = tremble(ms, c);
  if (pre) return pre;
  const heat = heatAt(ms, c, p.heat);
  const press = span(ms, c, c + SINK_MS);
  if (press === null) return defenderPose0({ heat });
  const env = press < 0.15 ? press / 0.15 : (1 - (press - 0.15) / 0.85) ** 2;
  const jitter = span(ms, c, c + SINK_JITTER_MS);
  return defenderPose0({
    across: jitter === null ? 0 : 0.02 * (1 - jitter) * Math.sin(TAU * 18 * ((ms - c) / 1000)),
    scaleAlong: 1 - 0.06 * env,
    scaleAcross: 1 + 0.03 * env,
    heat,
  });
};

const freeze = (ms, { contactMs: c, params: p }) => {
  const pre = tremble(ms, c);
  if (pre) return pre;
  const t = span(ms, c, c + FREEZE_MS);
  return defenderPose0({ heat: t === null ? 0 : p.heat * (1 - t), cold: true });
};

// ---- design 089: how a hit feels, by what hit -------------------------------------------
// 109 of 144 defenders took the same knock. A struck card now answers the element: every reaction
// below takes the knock's own params (`strength`, `heat`), trembles before contact as every
// defender does, and is over REACT_MS after it — sooner in a scene that ends sooner (a tier 1
// move leaves ~400 ms after contact), so it can stand in for a knock anywhere.

export const REACT_MS = HEAT_MS;
const REACT_MIN_MS = 240;
/** The scene's last frames are the cards at rest. */
const REACT_TAIL_MS = 20;

/** How long a reaction runs in a scene `durationMs` long whose contact is at `c`. */
const reactWindow = (c, durationMs) =>
  durationMs > c ? Math.min(REACT_MS, Math.max(REACT_MIN_MS, durationMs - c - REACT_TAIL_MS)) : REACT_MS;

/** The first instant of any hit: 0 → 1 over the first 14 % of the reaction. */
const kickOf = (k) => easeOutCubic(clamp01(k / 0.14));
/** After the kick, a damped spring home (1 → 0). */
const homeOf = (k, cycles = 1.5, decay = 3) => (k < 0.14 ? 1 : springHome((k - 0.14) / 0.86, cycles, decay));
/** 1 at the hit, 0 at the end, eased. */
const fadeOf = (k, power = 2) => (1 - k) ** power;

const reaction = (shape) => (ms, { contactMs: c, durationMs, params: p }) => {
  const pre = tremble(ms, c);
  if (pre) return pre;
  const heat = heatAt(ms, c, p.heat);
  const k = span(ms, c, c + reactWindow(c, durationMs));
  if (k === null) return defenderPose0({ heat });
  return defenderPose0({ ...shape(k, p, (ms - c) / 1000), heat });
};

/** Electric: the card barely moves back; it buzzes in place, fast, and the buzz dies away. */
const jolt = reaction((k, p, t) => ({
  along: p.strength * 0.4 * kickOf(k) * homeOf(k, 2.5, 4),
  across: 0.034 * Math.sin(TAU * 27 * t) * fadeOf(k),
  wobble: 5 * Math.sin(TAU * 19 * t) * fadeOf(k),
  scaleAcross: 1 + 0.03 * Math.sin(TAU * 31 * t) * fadeOf(k),
}));

/** Fire: knocked back and swollen by the heat, it sways as it cools. */
const scorch = reaction((k, p) => {
  const swell = Math.sin(Math.PI * k) * 0.05;
  return {
    along: p.strength * 0.85 * kickOf(k) * homeOf(k, 1.5, 2.6),
    scaleAlong: 1 + swell,
    scaleAcross: 1 + swell,
    wobble: 4 * Math.sin(k * Math.PI * 2) * fadeOf(k, 1.5),
  };
});

/** Water: carried back by the weight of it, then sloshing home with no bounce. */
const drench = reaction((k, p) => {
  const slosh = Math.sin(k * Math.PI * 2.5) * fadeOf(k, 1.5);
  return {
    along: p.strength * 1.1 * kickOf(k) * (k < 0.14 ? 1 : 1 - easeInOutCubic((k - 0.14) / 0.86)),
    across: 0.05 * Math.sin(k * Math.PI * 3) * fadeOf(k, 1.5),
    scaleAlong: 1 - 0.07 * slosh,
    scaleAcross: 1 + 0.07 * slosh,
    wobble: 4 * Math.sin(k * Math.PI * 2) * fadeOf(k, 1.5),
  };
});

/** Rock and ground: pressed flat under the weight, then it springs back up with a small hop. */
const crush = reaction((k, p) => {
  const press = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.4) ** 2;
  return {
    along: p.strength * 0.35 * kickOf(k) * homeOf(k),
    scaleAlong: 1 - 0.2 * press,
    scaleAcross: 1 + 0.13 * press,
    lift: 0.05 * Math.sin(Math.PI * clamp01((k - 0.3) / 0.4)),
    wobble: 2 * Math.sin(k * Math.PI * 4) * fadeOf(k),
  };
});

/** Wind: lifted off the cloth and turned about, it drifts sideways and settles. */
const whirl = reaction((k, p) => ({
  along: p.strength * 0.5 * kickOf(k) * homeOf(k, 1.5, 2.6),
  across: 0.08 * Math.sin(k * Math.PI * 2) * fadeOf(k, 1.5),
  lift: 0.14 * Math.sin(Math.PI * k) ** 0.8,
  wobble: 22 * Math.sin(k * Math.PI * 3) * fadeOf(k, 1.5),
}));

/** Grass, poison, bug: it droops, drained, and sways slowly back. */
const wither = reaction((k, p) => {
  const droop = Math.sin(Math.PI * k);
  return {
    along: p.strength * 0.3 * kickOf(k) * homeOf(k),
    scaleAlong: 1 - 0.07 * droop,
    scaleAcross: 1 - 0.04 * droop,
    wobble: 6 * Math.sin(k * Math.PI * 4) * fadeOf(k, 1.5),
  };
});

/** Psychic and fairy: it floats a little and its shape bends, long one way then the other. */
const warpHit = reaction((k, p) => {
  const bend = 0.08 * Math.sin(k * Math.PI * 4) * fadeOf(k, 1.5);
  return {
    along: p.strength * 0.3 * kickOf(k) * homeOf(k, 1.5, 2.5),
    lift: 0.07 * Math.sin(Math.PI * k),
    scaleAlong: 1 + bend,
    scaleAcross: 1 - bend,
    wobble: 5 * Math.sin(k * Math.PI * 2) * fadeOf(k, 1.5),
  };
});

/** Ghost and dark: it shrinks back slowly, shuddering, and is slow to come home. */
const dread = reaction((k, p, t) => {
  const away = easeOutCubic(clamp01(k / 0.3)) * (1 - easeInOutCubic(clamp01((k - 0.55) / 0.45)));
  const shrink = Math.sin(Math.PI * k) * 0.08;
  return {
    along: p.strength * 0.7 * away,
    across: 0.012 * Math.sin(TAU * 22 * t) * fadeOf(k),
    scaleAlong: 1 - shrink,
    scaleAcross: 1 - shrink,
    wobble: 2 * Math.sin(TAU * 14 * t) * fadeOf(k),
  };
});

/** Steel, ice, gem: a hard, short knock that leaves the card ringing. */
const clang = reaction((k, p, t) => ({
  along: p.strength * 0.55 * kickOf(k) * homeOf(k, 2.5, 5),
  scaleAlong: 1 - 0.05 * (k < 0.08 ? k / 0.08 : Math.max(0, 1 - (k - 0.08) / 0.2)),
  wobble: 5 * Math.sin(TAU * 17 * t) * fadeOf(k, 2.5),
}));

const REACTION_PARAMS = Object.freeze({ strength: ['num', 0.05, 0.6, 0.3], heat: ['num', 0, 1, 1] });
const reactionEntry = (pose) => ({
  params: REACTION_PARAMS,
  // The pose is at rest once its window is over; its heat fades over HEAT_MS as a knock's does.
  endMs: (c) => c + HEAT_MS,
  pose,
});

export const DEFENDER_MOTIONS = Object.freeze({
  jolt: reactionEntry(jolt),
  scorch: reactionEntry(scorch),
  drench: reactionEntry(drench),
  crush: reactionEntry(crush),
  whirl: reactionEntry(whirl),
  wither: reactionEntry(wither),
  'warp-hit': reactionEntry(warpHit),
  dread: reactionEntry(dread),
  clang: reactionEntry(clang),
  knock: {
    params: { strength: ['num', 0.05, 0.6, 0.3], heat: ['num', 0, 1, 1] },
    endMs: (c) => c + HEAT_MS,
    pose: knock,
  },
  stagger: {
    params: {
      strength: ['num', 0.05, 0.6, 0.3],
      hits: ['int', 2, 6, 3],
      gapMs: ['num', 40, 250, 90],
      heat: ['num', 0, 1, 1],
      lead: ['num', 0, 600, 0],
    },
    endMs: (c, p) => (p.lead > 0 ? c : c + (p.hits - 1) * p.gapMs) + HEAT_MS,
    pose: stagger,
  },
  float: {
    params: { lift: ['num', 0.05, 0.4, 0.15], heat: ['num', 0, 1, 0] },
    endMs: (c, p, durationMs) => floatHold(c, durationMs) + FLOAT_DROP_MS,
    pose: float,
  },
  sink: {
    params: { heat: ['num', 0, 1, 0] },
    endMs: (c) => c + SINK_MS,
    pose: sink,
  },
  freeze: {
    params: { heat: ['num', 0, 1, 0.8] },
    endMs: (c) => c + FREEZE_MS,
    pose: freeze,
  },
});

/** Param schemas for validation: `{ attacker: {motion: schema}, defender: {motion: schema} }`. */
export const MOTION_PARAMS = Object.freeze({
  attacker: Object.freeze(Object.fromEntries(Object.entries(ATTACKER_MOTIONS).map(([k, v]) => [k, v.params]))),
  defender: Object.freeze(Object.fromEntries(Object.entries(DEFENDER_MOTIONS).map(([k, v]) => [k, v.params]))),
});

const attackerOpts = (name, opts) => ({
  durationMs: 0,
  ...opts,
  params: fillDefaults(ATTACKER_MOTIONS[name].params, opts?.params),
});
const defenderOpts = (name, opts) => ({
  durationMs: 0,
  ...opts,
  params: fillDefaults(DEFENDER_MOTIONS[name].params, opts?.params),
});

/** Attacker pose at `ms`; an unknown motion is the rest pose. */
export function attackerPose(name, ms, opts) {
  if (!Object.hasOwn(ATTACKER_MOTIONS, name)) return ATTACKER_REST;
  return ATTACKER_MOTIONS[name].pose(ms, attackerOpts(name, opts));
}

/** Defender pose at `ms`; an unknown motion is the rest pose. */
export function defenderPose(name, ms, opts) {
  if (!Object.hasOwn(DEFENDER_MOTIONS, name)) return DEFENDER_REST;
  return DEFENDER_MOTIONS[name].pose(ms, defenderOpts(name, opts));
}

/** Scene-clock ms after which the attacker pose is the rest pose. */
export function attackerEndMs(name, { contactMs, durationMs, params }) {
  if (!Object.hasOwn(ATTACKER_MOTIONS, name)) return 0;
  if (name === 'none') return durationMs;
  // Design 065: a rear-lurch `hold` shifts the thrust and recoil.
  const hold = name === 'rear-lurch' ? (params?.hold ?? 0) : 0;
  return ATTACKER_MOTIONS[name].endC * contactMs + hold;
}

/** Scene-clock ms after which the defender pose is the rest pose. */
export function defenderEndMs(name, { contactMs, durationMs, params }) {
  if (!Object.hasOwn(DEFENDER_MOTIONS, name)) return 0;
  const filled = fillDefaults(DEFENDER_MOTIONS[name].params, params);
  return DEFENDER_MOTIONS[name].endMs(contactMs, filled, durationMs);
}
