// Design 063: the MoveSpec schema. A move is data: timing, card-motion presets, and beats
// that name a drawer from the shared library (move-drawers.js) with parameters; one
// player (move-player.js) plays any spec. `DRAWER_PARAMS` is the one table of every
// drawer's parameters (design § Pinned contracts B); `validateSpec` is the gate every
// shipped spec passes (specs.test.mjs). Units: lengths in card heights, times in ms on
// the scene clock, angles in lane space except `direction`/`arms`, which are screen
// degrees. DOM-free.
import { MOTION_PARAMS } from './card-motion.mjs';
import { VG_TYPES } from './move-table.mjs';
import { checkAgainst, fillDefaults } from './param-kinds.mjs';

export { checkAgainst, fillDefaults } from './param-kinds.mjs';

export const FAMILIES = Object.freeze([
  'slash',
  'punch',
  'dash',
  'beam',
  'projectile',
  'burst',
  'quake',
  'splash',
  'wind',
  'electric',
  'ghost',
  'chime',
  'roar',
  'charge',
]);
export const LAYERS = Object.freeze(['back', 'front', 'top']);
/** Keys of MATERIALS (materials/index.js); materials.test.mjs keeps the two in step. */
export const MATERIAL_KEYS = Object.freeze(['fire', 'water', 'grass', 'petal', 'solar', 'electric', 'fighting', 'aura', 'psychic', 'dark', 'steel', 'dragon', 'fairy', 'ghost', 'poison', 'ground', 'mud', 'rock', 'ancient', 'gem', 'flying', 'ice', 'aurora', 'bug', 'buzz', 'silver']);
export const PARTICLE_KINDS = Object.freeze([
  'ember',
  'droplet',
  'leaf',
  'shard',
  'glob',
  'feather',
  'flake',
  'streak',
  'mote',
  'star',
  // A four-point sparkle in the material's particle colour (fairy); `star` is the gold KO star.
  'twinkle',
]);
export const TIER_BAND = Object.freeze({ 1: [900, 1100], 2: [1200, 1500], 3: [1600, 2200], S: [1800, 2600] });
/** Design 065: tier S (signature moves) contact window, on top of the ratio band. */
export const S_CONTACT = Object.freeze([900, 1200]);
export const CONTACT_BAND = Object.freeze({ min: 0.38, max: 0.62, tier1Max: 0.7 });
export const PAD_RANGE = Object.freeze([1.2, 2.6]);
export const DEFAULT_PAD = 1.7;
export const TONGUE_BUDGET = 30;
export const PARTICLE_BUDGET = 28;
export const MAX_BURSTS = 2;
export const MAX_NODES = 40;

const TARGET = (fallback = 'defender') => ['target', fallback];

export const DRAWER_PARAMS = Object.freeze({
  orbitCharge: {
    count: ['int', 1, 8, 5],
    half: ['enum', ['back', 'front', 'both'], 'both'],
    r0: ['num', 0.05, 0.4, 0.16],
    r1: ['num', 0.05, 0.5, 0.24],
    tongues: ['int', 0, 6, 4],
    tilt: ['num', 0.2, 1, 0.42],
  },
  coreCharge: {
    lead: ['num', 0, 1, 0.42],
    r0: ['num', 0.05, 0.5, 0.18],
    r1: ['num', 0.1, 1, 0.56],
    from: ['num', 0, 0.9, 0.3],
  },
  shockRings: {
    count: ['int', 1, 4, 2],
    delay: ['num', 0, 0.8, 0.3],
    r0: ['num', 0.1, 1, 0.3],
    r1: ['num', 0.5, 2.5, 1.3],
    squash: ['num', 0.2, 1, 0.45],
  },
  projectile: {
    path: ['enum', ['straight', 'arc', 'spiral'], 'arc'],
    r0: ['num', 0.05, 1, 0.34],
    r1: ['num', 0.05, 1.2, 0.56],
    bow: ['num', 0, 0.6, 0.2],
    tongues: ['int', 0, 12, 9],
    ease: ['enum', ['in', 'linear', 'out'], 'in'],
  },
  vignette: {
    target: TARGET(),
    maxAlpha: ['num', 0, 0.55, 0.45],
    inner: ['num', 0.2, 1, 0.55],
    outer: ['num', 0.8, 1.6, 1.6],
  },
  speedRays: {
    count: ['int', 8, 40, 28],
    inner: ['num', 0.1, 0.6, 0.3],
    outer: ['num', 0.8, 2, 1.7],
    target: TARGET(),
  },
  starFlare: {
    arms: ['arms', 'dai'],
    width: ['num', 0.2, 0.7, 0.46],
    core: ['num', 0.2, 0.7, 0.46],
    grow: ['num', 0.15, 0.5, 0.3],
    breakAt: ['num', 0.4, 0.9, 0.6],
    target: TARGET(),
  },
  impactFlash: {
    r0: ['num', 0.2, 1, 0.6],
    r1: ['num', 0.5, 2, 1.3],
    target: TARGET(),
  },
  smoke: {
    count: ['int', 1, 10, 6],
    rise: ['num', 0.3, 1.5, 0.9],
    target: TARGET(),
  },
  beam: {
    kind: ['enum', ['solid', 'pulse-train', 'helix', 'segmented', 'widening'], 'solid'],
    w: ['num', 0.1, 1, 0.5],
    gap: ['num', 0.2, 1, 0.4],
    turns: ['num', 1, 5, 3],
    speed: ['num', 0.5, 5, 2.5],
    growIn: ['num', 0.1, 0.4, 0.25],
    retract: ['num', 0.1, 0.4, 0.2],
  },
  splash: {
    count: ['int', 1, 16, 10],
    arc: ['deg', 140],
    direction: ['deg', -90],
    gravity: ['num', 0, 1.5, 0.5],
    len: ['pair', 0.3, 1.5, [0.6, 1.1]],
    stagger: ['num', 0, 0.1, 0.05],
    target: TARGET(),
  },
  pillar: {
    height: ['num', 0.8, 2.5, 1.8],
    w: ['num', 0.2, 1, 0.6],
    from: ['enum', ['below', 'above'], 'below'],
    target: TARGET(),
  },
  slashArc: {
    sweep: ['deg', 120],
    radius: ['num', 0.3, 1.2, 0.7],
    count: ['int', 1, 3, 1],
    gapDeg: ['deg', 30],
    angle: ['deg', 45],
    thick: ['num', 0.05, 0.3, 0.12],
    target: TARGET(),
  },
  terrain: {
    kind: ['enum', ['crack', 'wave', 'dust', 'quake'], 'crack'],
    radius: ['num', 0.5, 2.5, 1.4],
    amp: ['num', 0, 0.08, 0.03],
    target: TARGET(),
  },
  cloud: {
    count: ['int', 1, 12, 8],
    radius: ['num', 0.1, 0.8, 0.35],
    drift: ['num', 0, 1.5, 0.6],
    direction: ['deg', -90],
    alpha: ['num', 0.1, 0.8, 0.5],
    target: TARGET(),
  },
  spiral: {
    turns: ['num', 1, 5, 2.5],
    r0: ['num', 0.05, 0.6, 0.2],
    r1: ['num', 0.4, 1.6, 1.1],
    rpm: ['num', 20, 240, 90],
    tongues: ['int', 4, 16, 10],
    target: TARGET(),
  },
  volley: {
    count: ['int', 2, 8, 3],
    stagger: ['num', 30, 200, 90],
    r0: ['num', 0.05, 0.6, 0.14],
    r1: ['num', 0.05, 0.8, 0.2],
    bow: ['num', 0, 0.6, 0.3],
    tongues: ['int', 0, 6, 3],
    // Where the bodies leave from: 'defender' flies them back up the lane (drains: Absorb);
    // 'sky' drops them onto the defender from above it on screen (meteors: Draco Meteor).
    from: ['enum', ['attacker', 'defender', 'sky'], 'attacker'],
  },
  aura: {
    target: TARGET('attacker'),
    hz: ['num', 0.5, 6, 2],
    alpha: ['num', 0.1, 1, 0.6],
    r0: ['num', 0.5, 1, 0.7],
    r1: ['num', 0.6, 1.3, 0.9],
  },
  rain: {
    count: ['int', 2, 16, 12],
    height: ['num', 0.8, 2, 1.6],
    spread: ['num', 0.3, 1.5, 0.9],
    target: TARGET(),
  },
  shards: {
    count: ['int', 2, 16, 8],
    arc: ['deg', 360],
    direction: ['deg', -90],
    distance: ['num', 0.3, 1.8, 1.1],
    spin: ['num', 0, 720, 360],
    target: TARGET(),
  },
  bolt: {
    from: ['enum', ['attacker', 'sky'], 'attacker'],
    segments: ['int', 3, 16, 9],
    jag: ['num', 0.02, 0.3, 0.12],
    branches: ['int', 0, 4, 2],
    rerollMs: ['num', 20, 120, 45],
    width: ['num', 0.03, 0.3, 0.1],
  },
  ring: {
    count: ['int', 1, 5, 3],
    r0: ['num', 0.1, 0.8, 0.3],
    r1: ['num', 0.6, 2.5, 1.5],
    kind: ['enum', ['floor', 'face'], 'floor'],
    width: ['num', 0.02, 0.15, 0.06],
    target: TARGET(),
  },
  glyph: {
    r: ['num', 0.4, 1.4, 0.9],
    target: TARGET(),
  },
});

/** Errors for one drawer's params: unknown drawer, unknown key, wrong type, out of range. */
export function checkParams(drawer, params) {
  if (!Object.hasOwn(DRAWER_PARAMS, drawer)) return [`unknown drawer '${drawer}'`];
  return checkAgainst(DRAWER_PARAMS[drawer], params, drawer);
}

/** `params` with the drawer's defaults filled in: what the player hands the drawer. */
export function withDefaults(drawer, params) {
  return fillDefaults(DRAWER_PARAMS[drawer] ?? {}, params);
}

/** Tongues a drawer puts on screen at once, from its params (the cost rule's unit). */
export function tonguesAt(drawer, params) {
  const p = withDefaults(drawer, params);
  switch (drawer) {
    case 'orbitCharge':
      return (p.half === 'both' ? p.count : Math.ceil(p.count / 2)) * p.tongues;
    case 'projectile':
      return p.tongues;
    case 'starFlare':
      return resolveArmCount(p.arms) * 5;
    case 'beam':
      if (p.kind === 'helix') return 2;
      return p.kind === 'solid' || p.kind === 'widening' ? 1 : 6;
    case 'splash':
    case 'slashArc':
    case 'rain':
    case 'shards':
      return p.count;
    case 'pillar':
      return 3;
    case 'spiral':
      return p.tongues;
    case 'volley':
      return p.count * p.tongues;
    case 'bolt':
      return 1 + p.branches;
    default:
      return 0;
  }
}

const resolveArmCount = (arms) => {
  if (Array.isArray(arms)) return arms.length;
  if (arms === 'cross') return 4;
  if (arms === 'ring') return 8;
  return 5;
};

const DRAWER_FAMILY = Object.freeze({
  slashArc: 'slash',
  beam: 'beam',
  projectile: 'projectile',
  volley: 'projectile',
  rain: 'projectile',
  starFlare: 'burst',
  shards: 'burst',
  impactFlash: 'burst',
  splash: 'splash',
  terrain: 'quake',
  pillar: 'quake',
  spiral: 'wind',
  cloud: 'wind',
  bolt: 'electric',
  glyph: 'chime',
  aura: 'chime',
  ring: 'chime',
});

/**
 * The sound/hit family a spec must declare (design § Pinned contracts C): the mapped
 * drawer of the latest-starting front beat active at contact, then type overrides; a spec
 * with no such beat is charge-only.
 */
export function deriveFamily(spec) {
  const contact = spec.contactMs;
  const candidates = (spec.beats ?? []).filter(
    (beat) => beat.layer === 'front' && beat.at <= contact && contact < beat.until && Object.hasOwn(DRAWER_FAMILY, beat.drawer)
  );
  if (candidates.length === 0) return 'charge';
  const latest = candidates.reduce((best, beat) => (beat.at >= best.at ? beat : best));
  const base = DRAWER_FAMILY[latest.drawer];
  const physical = spec.statClass === 'physical';
  if (spec.vgType === 'electric') return 'electric';
  if ((spec.vgType === 'ghost' || spec.vgType === 'dark') && base === 'chime') return 'ghost';
  if (spec.vgType === 'water' && base === 'burst') return 'splash';
  if (spec.vgType === 'dragon' && (spec.tier === 3 || spec.tier === 'S') && (base === 'burst' || base === 'beam')) return 'roar';
  if (physical && spec.attacker?.motion === 'dash' && base === 'burst') return 'dash';
  if (physical && spec.attacker?.motion === 'lunge' && base === 'burst') return 'punch';
  return base;
}

export const PARTICLE_PARAMS = Object.freeze({
  at: ['num', 0, 4000, 0],
  anchor: ['target', 'defender'],
  count: ['int', 1, 24, 12],
  distance: ['num', 0.1, 3, 1],
  direction: ['deg', -90],
  spread: ['num', 0, 360, 360],
  size: ['pair', 0.01, 0.5, [0.05, 0.1]],
  aspect: ['num', 0.1, 1.5, 1],
  gravity: ['num', 0, 2, 0],
  maxDelay: ['num', 0, 0.5, 0.1],
  durationMs: ['int', 200, 1500, 760],
  kind: ['enum', PARTICLE_KINDS, 'ember'],
});

const TOP_KEYS = [
  'id',
  'name',
  'vgType',
  'statClass',
  'tier',
  'family',
  'material',
  'durationMs',
  'contactMs',
  'pad',
  'attacker',
  'defender',
  'beats',
  'particles',
  'grain',
];
const REQUIRED_KEYS = [
  'id',
  'name',
  'vgType',
  'statClass',
  'tier',
  'family',
  'material',
  'durationMs',
  'contactMs',
  'attacker',
  'defender',
  'beats',
];
const BEAT_KEYS = ['at', 'until', 'layer', 'drawer', 'params'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const checkMotion = (side, motion, errors) => {
  if (!isObject(motion)) {
    errors.push(`${side}: must be { motion, params }`);
    return;
  }
  const table = MOTION_PARAMS[side];
  if (!Object.hasOwn(table, motion.motion)) {
    errors.push(`${side}: unknown motion '${motion.motion}'`);
    return;
  }
  errors.push(...checkAgainst(table[motion.motion], motion.params, `${side} ${motion.motion}`));
};

const checkBeat = (beat, index, spec, errors) => {
  const label = `beat ${index}`;
  if (!isObject(beat)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  for (const key of Object.keys(beat)) if (!BEAT_KEYS.includes(key)) errors.push(`${label}: unknown field '${key}'`);
  if (!isNum(beat.at) || !isNum(beat.until)) {
    errors.push(`${label}: at and until must be finite numbers`);
  } else {
    if (beat.at < 0) errors.push(`${label}: at must be >= 0`);
    if (beat.until <= beat.at) errors.push(`${label}: until must be after at`);
    if (isNum(spec.durationMs) && beat.until > spec.durationMs) errors.push(`${label}: until exceeds durationMs`);
  }
  if (!LAYERS.includes(beat.layer)) errors.push(`${label}: unknown layer '${beat.layer}'`);
  errors.push(...checkParams(beat.drawer, beat.params).map((message) => `${label}: ${message}`));
};

const checkParticle = (burst, index, spec, errors) => {
  const label = `particle ${index}`;
  if (!isObject(burst)) {
    errors.push(`${label}: must be an object`);
    return;
  }
  for (const key of Object.keys(PARTICLE_PARAMS)) {
    if (burst[key] === undefined) errors.push(`${label}: missing '${key}'`);
  }
  errors.push(...checkAgainst(PARTICLE_PARAMS, burst, label));
  if (isNum(burst.at) && isNum(spec.durationMs) && burst.at > spec.durationMs) errors.push(`${label}: at exceeds durationMs`);
};

const costErrors = (spec) => {
  const errors = [];
  const beats = (spec.beats ?? []).filter((b) => isObject(b) && isNum(b.at) && isNum(b.until) && Object.hasOwn(DRAWER_PARAMS, b.drawer));
  let worst = { at: 0, total: 0 };
  for (const probe of beats) {
    const total = beats
      .filter((b) => b.at <= probe.at && probe.at < b.until)
      .reduce((sum, b) => sum + tonguesAt(b.drawer, b.params), 0);
    if (total > worst.total) worst = { at: probe.at, total };
  }
  if (worst.total > TONGUE_BUDGET) {
    errors.push(`cost: ${worst.total} tongues at ${worst.at} ms exceeds ${TONGUE_BUDGET}`);
  }
  const bursts = (spec.particles ?? []).filter(isObject);
  const particles = bursts.reduce((sum, b) => sum + (isNum(b.count) ? b.count : 0), 0);
  if (bursts.length > MAX_BURSTS) errors.push(`cost: ${bursts.length} particle bursts exceeds ${MAX_BURSTS}`);
  if (particles > PARTICLE_BUDGET) errors.push(`cost: ${particles} particles exceeds ${PARTICLE_BUDGET}`);
  // Two dash trails are a ghost + its art each.
  const trails = spec.attacker?.motion === 'dash' ? 4 : 0;
  const nodes = 1 + 2 + 2 * 4 + trails + bursts.reduce((sum, b) => sum + 1 + (isNum(b.count) ? b.count : 0), 0);
  if (nodes > MAX_NODES) errors.push(`cost: ${nodes} DOM nodes exceeds ${MAX_NODES}`);
  return errors;
};

/**
 * Every problem with `spec`, as messages (empty = valid): fields, enums, bands, beats,
 * motions, particles, the family rule and the cost rule.
 * @returns {string[]}
 */
export function validateSpec(spec) {
  if (!isObject(spec)) return ['spec must be an object'];
  const errors = [];
  for (const key of REQUIRED_KEYS) if (spec[key] === undefined) errors.push(`missing field '${key}'`);
  for (const key of Object.keys(spec)) if (!TOP_KEYS.includes(key)) errors.push(`unknown field '${key}'`);

  if (spec.id !== undefined && !(typeof spec.id === 'string' && KEBAB.test(spec.id))) errors.push(`id '${spec.id}' is not kebab-case`);
  if (spec.name !== undefined && !(typeof spec.name === 'string' && spec.name.trim())) errors.push('name must be a non-empty string');
  const signature = spec.tier === 'S';
  if (spec.vgType !== undefined && !VG_TYPES.includes(spec.vgType) && !(signature && spec.vgType === 'normal')) {
    errors.push(`unknown vgType '${spec.vgType}'${spec.vgType === 'normal' ? ' (normal only with tier S)' : ''}`);
  }
  if (spec.statClass !== undefined && spec.statClass !== 'physical' && spec.statClass !== 'special' && !(signature && spec.statClass === 'status')) {
    errors.push(`unknown statClass '${spec.statClass}'${spec.statClass === 'status' ? ' (status only with tier S)' : ''}`);
  }
  if (spec.tier !== undefined && ![1, 2, 3, 'S'].includes(spec.tier)) errors.push(`tier must be 1, 2, 3 or 'S' (got ${spec.tier})`);
  if (spec.family !== undefined && !FAMILIES.includes(spec.family)) errors.push(`unknown family '${spec.family}'`);
  if (spec.material !== undefined && !MATERIAL_KEYS.includes(spec.material)) errors.push(`unknown material '${spec.material}'`);

  const band = TIER_BAND[spec.tier];
  if (spec.durationMs !== undefined) {
    if (!isNum(spec.durationMs)) errors.push('durationMs must be a finite number');
    else if (band && (spec.durationMs < band[0] || spec.durationMs > band[1])) {
      errors.push(`durationMs ${spec.durationMs} outside tier ${spec.tier} band [${band[0]}, ${band[1]}]`);
    }
  }
  if (spec.contactMs !== undefined) {
    if (!isNum(spec.contactMs) || spec.contactMs <= 0) errors.push('contactMs must be a positive number');
    else if (signature && (spec.contactMs < S_CONTACT[0] || spec.contactMs > S_CONTACT[1])) {
      errors.push(`contactMs ${spec.contactMs} outside tier S contact [${S_CONTACT[0]}, ${S_CONTACT[1]}]`);
    }
    if (isNum(spec.contactMs) && spec.contactMs > 0 && isNum(spec.durationMs) && spec.durationMs > 0) {
      const ratio = spec.contactMs / spec.durationMs;
      const max = spec.tier === 1 ? CONTACT_BAND.tier1Max : CONTACT_BAND.max;
      if (ratio < CONTACT_BAND.min || ratio > max) {
        errors.push(`contactMs/durationMs ${ratio.toFixed(2)} outside [${CONTACT_BAND.min}, ${max}]`);
      }
    }
  }
  if (spec.pad !== undefined && !(isNum(spec.pad) && spec.pad >= PAD_RANGE[0] && spec.pad <= PAD_RANGE[1])) {
    errors.push(`pad must be a number in [${PAD_RANGE[0]}, ${PAD_RANGE[1]}]`);
  }
  if (spec.grain !== undefined && !(isNum(spec.grain) && spec.grain >= 0 && spec.grain <= 1)) {
    errors.push('grain must be a number in [0, 1]');
  }
  if (spec.attacker !== undefined) checkMotion('attacker', spec.attacker, errors);
  if (spec.defender !== undefined) checkMotion('defender', spec.defender, errors);

  if (spec.beats !== undefined) {
    if (!Array.isArray(spec.beats) || spec.beats.length === 0) errors.push('beats must be a non-empty array');
    else spec.beats.forEach((beat, index) => checkBeat(beat, index, spec, errors));
  }
  if (spec.particles !== undefined) {
    if (!Array.isArray(spec.particles)) errors.push('particles must be an array');
    else spec.particles.forEach((burst, index) => checkParticle(burst, index, spec, errors));
  }

  if (errors.length === 0) {
    const expected = deriveFamily(spec);
    if (spec.family !== expected) errors.push(`family '${spec.family}' does not follow the family rule (expected '${expected}')`);
    errors.push(...costErrors(spec));
  }
  return errors;
}
