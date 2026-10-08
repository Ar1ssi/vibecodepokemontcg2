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

const idle = (ms, { durationMs, params: p }) => {
  const t = span(ms, 0, durationMs);
  if (t === null || !(p.glow > 0)) return ATTACKER_REST;
  return attackerPose0({ glow: p.glow * Math.sin(Math.PI * t) });
};

export const ATTACKER_MOTIONS = Object.freeze({
  'rear-lurch': {
    params: { rear: ['num', 0, 0.4, 0.14], lurch: ['num', 0, 0.8, 0.4], glow: ['num', 0, 1, 1] },
    endC: 1.2,
    pose: rearLurch,
  },
  brace: {
    params: { rear: ['num', 0, 0.3, 0.08], scale: ['num', 1, 1.15, 1.03], glow: ['num', 0, 1, 0.6] },
    endC: 1.1,
    pose: brace,
  },
  lunge: {
    params: { wind: ['num', 0, 0.4, 0.2], reach: ['num', 0.2, 1.2, 0.9], glow: ['num', 0, 1, 0] },
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
  rise: { params: {}, endC: 1.6, pose: rise },
  stomp: { params: {}, endC: 1.4, pose: stomp },
  spin: { params: { turns: ['int', 1, 2, 1] }, endC: 1.3, pose: spin },
  none: { params: { glow: ['num', 0, 1, 0] }, endC: 0, pose: idle },
});

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
  const pre = tremble(ms, c);
  if (pre) return pre;
  const heat = heatAt(ms, c, p.heat);
  const step = p.strength / p.hits;
  const last = p.hits - 1;
  const lastStart = c + last * p.gapMs;
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
  const hit = Math.floor((ms - c) / p.gapMs);
  if (!(hit >= 0)) return defenderPose0({ heat });
  const kw = clamp01((ms - c - hit * p.gapMs) / p.gapMs);
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

export const DEFENDER_MOTIONS = Object.freeze({
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
    },
    endMs: (c, p) => c + (p.hits - 1) * p.gapMs + HEAT_MS,
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
export function attackerEndMs(name, { contactMs, durationMs }) {
  if (!Object.hasOwn(ATTACKER_MOTIONS, name)) return 0;
  return name === 'none' ? durationMs : ATTACKER_MOTIONS[name].endC * contactMs;
}

/** Scene-clock ms after which the defender pose is the rest pose. */
export function defenderEndMs(name, { contactMs, durationMs, params }) {
  if (!Object.hasOwn(DEFENDER_MOTIONS, name)) return 0;
  const filled = fillDefaults(DEFENDER_MOTIONS[name].params, params);
  return DEFENDER_MOTIONS[name].endMs(contactMs, filled, durationMs);
}
