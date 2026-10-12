// Design 068: simulate a TCG Live attack-impact prefab — a tree of Unity ParticleSystems in the
// importer's compact form (scripts/fx/attack/lib/normalize-system.mjs). Each system is stepped
// the way Unity steps one: emit (rate, bursts, sub-emitters), then per particle forces, the
// animated velocities (velocity over lifetime, orbit, noise), limit and drag, integrate, and
// the over-lifetime values. Everything is simulated in the effect's root space; the emitters
// never move, so Unity's local and world simulation spaces come to the same thing.
//
// Time only moves in whole STEP_S steps, so the state at a time is the same however it was
// reached (design 068 edge 7): a backward seek replays from 0. DOM-free.
import { clamp01, lerp } from '../tcgl-fx.mjs';
import { evalColor, evalMinMax, isZeroCurve, maxMagnitude } from './impact-curves.mjs';
import {
  QUAT_IDENTITY,
  add,
  axisScales,
  cross,
  length,
  mat4Compose,
  mat4Identity,
  mat4Mul,
  normalize,
  quatLook,
  quatMul,
  scale,
  sub,
  transformPoint,
  transformVector,
} from './impact-math.mjs';
import { noiseVector } from './impact-noise.mjs';
import { createRandom } from './impact-random.mjs';
import { emitFromShape } from './impact-shapes.mjs';

export const STEP_S = 1 / 120;
/** The game despawns an attack FX event after this long (`SpawnAttackFXEvent(card, 0f, 4f, …)`). */
export const GAME_CLEANUP_S = 4;
const GRAVITY = 9.81;
/** Unity scales the Limit Velocity dampen to this frame rate. */
const DAMPEN_REFERENCE_FPS = 30;
const SCALING_LOCAL = 1;
const SCALING_SHAPE = 2;
const SUB_BIRTH = 0;
const SUB_DEATH = 2;
const SUB_INHERIT_COLOR = 1;
const SHEET_BY_LIFETIME = 0;
const SHEET_BY_SPEED = 1;
const RATE_EPSILON = 1e-6;
const ONE = Object.freeze([1, 1, 1]);

// Slots of a particle's own random numbers (`particle.rand`), one per module that needs one.
const R = Object.freeze({ VELOCITY: 0, FORCE: 1, LIMIT: 2, DRAG: 3, SIZE: 4, SPIN_X: 5, SPIN_Y: 6, SPIN_Z: 7, COLOR: 8, FRAME: 9, NOISE: 10, CUSTOM: 11, COUNT: 15 });

const frac = (value) => value - Math.floor(value);

/** Emitter placement and scale for a system node, by its scaling mode. */
function placement(spec, world, local) {
  if (spec.scaling === SCALING_SHAPE) {
    return { matrix: mat4Compose(world.position, world.rotation, ONE), sizeScale: ONE, shapeScale: world.lossy };
  }
  if (spec.scaling === SCALING_LOCAL) {
    return { matrix: mat4Compose(world.position, world.rotation, local.s), sizeScale: local.s, shapeScale: ONE };
  }
  return { matrix: world.matrix, sizeScale: world.lossy, shapeScale: ONE };
}

const uniformScale = (scales) => Math.cbrt(Math.abs(scales[0] * scales[1] * scales[2]));

function buildSystems(prefab, rootMatrix, rootRotation) {
  const systems = [];
  const visit = (node, parent) => {
    const matrix = mat4Mul(parent.matrix, mat4Compose(node.p, node.q, node.s));
    const world = {
      matrix,
      rotation: quatMul(parent.rotation, node.q),
      position: transformPoint(parent.matrix, node.p),
      lossy: axisScales(matrix),
    };
    if (node.ps) {
      const placed = placement(node.ps, world, node);
      systems.push({
        name: node.n,
        spec: node.ps,
        renderer: node.r ?? null,
        subId: node.subId ?? null,
        matrix: placed.matrix,
        rotation: world.rotation,
        position: world.position,
        sizeScale: placed.sizeScale,
        shapeScale: placed.shapeScale,
        // Scalar module values (speed limits, noise strength, radial speed) are in the system's own units.
        unit: uniformScale(axisScales(placed.matrix)),
      });
    }
    (node.c ?? []).forEach((child) => visit(child, world));
  };
  visit(prefab, { matrix: rootMatrix, rotation: rootRotation });
  return systems;
}

const upperBound = (value) => (Array.isArray(value) ? Math.max(value[0], value[1]) : maxMagnitude(value));

/** When each system can still have a live particle, following sub-emitter chains. */
function systemEnds(systems) {
  const bySubId = new Map(systems.filter((system) => system.subId).map((system) => [system.subId, system]));
  const ends = new Map();
  const own = (system) => system.spec.dur + upperBound(system.spec.life);
  for (const system of systems) if (!system.subId) ends.set(system, upperBound(system.spec.delay) + own(system));
  for (let pass = 0; pass < systems.length; pass += 1) {
    for (const system of systems) {
      if (!ends.has(system)) continue;
      for (const subRef of system.spec.sub ?? []) {
        const target = bySubId.get(subRef.id);
        if (target) ends.set(target, Math.max(ends.get(target) ?? 0, ends.get(system) + own(target)));
      }
    }
  }
  return ends;
}

function sheetFrame(sheet, particle, age01, speed) {
  const frames = sheet.tx * sheet.ty;
  let index;
  if (sheet.time === SHEET_BY_LIFETIME) {
    const value = evalMinMax(sheet.frame, frac(age01 * sheet.cycles), particle.rand[R.FRAME]);
    index = Math.min(frames - 1, Math.floor(clamp01(value) * frames));
  } else if (sheet.time === SHEET_BY_SPEED) {
    const span = sheet.range[1] - sheet.range[0];
    index = Math.min(frames - 1, Math.floor(clamp01(span > 0 ? (speed - sheet.range[0]) / span : 0) * frames));
  } else {
    index = Math.floor(particle.age * sheet.fps) % frames;
  }
  return (index + Math.floor(clamp01(particle.startFrame) * frames)) % frames;
}

/**
 * A playable effect for one prefab.
 * @param {object} prefab a `prefabs[variant]` tree of an attack type file
 * @param {{seed?: number, rootMatrix?: Float32Array, rootRotation?: number[]}} [options]
 *   the transform of the prefab's root in the effect's world (the card's facing)
 * @returns {{systems: object[], duration: number, time: number, advanceTo: (seconds: number) => void}}
 */
export function createEffect(prefab, { seed = 1, rootMatrix = mat4Identity(), rootRotation = QUAT_IDENTITY } = {}) {
  const systems = buildSystems(prefab, rootMatrix, rootRotation);
  const bySubId = new Map(systems.filter((system) => system.subId).map((system) => [system.subId, system]));
  const ends = systemEnds(systems);
  const duration = Math.min(GAME_CLEANUP_S, Math.max(0, ...ends.values()));
  let steps = 0;

  const reset = () => {
    const base = createRandom(seed);
    systems.forEach((system, index) => {
      system.random = base.fork(index + 1);
      system.particles = [];
      system.births = 0;
      system.delay = evalMinMax(system.spec.delay, 0, system.random.next());
      system.emitters = system.subId ? [] : [newEmitter(system, system.delay, null, null)];
    });
    steps = 0;
  };

  function newEmitter(system, start, follow, at) {
    return { start, follow, at, tint: null, acc: 0, accDistance: 0, last: follow ? [...follow.pos] : null, cycles: (system.spec.em?.bursts ?? []).map(() => 0) };
  }

  const emitterMatrix = (system, emitter) => {
    const origin = emitter.follow?.pos ?? emitter.at;
    if (!origin) return system.matrix;
    const matrix = new Float32Array(system.matrix);
    matrix[12] = origin[0];
    matrix[13] = origin[1];
    matrix[14] = origin[2];
    return matrix;
  };

  function refresh(system, particle, speed) {
    const { spec } = system;
    const age01 = clamp01(particle.age / particle.life);
    let size = particle.startSize;
    if (spec.sizeOL) {
      const mix = particle.rand[R.SIZE];
      const x = evalMinMax(spec.sizeOL.x, age01, mix);
      size = [size[0] * x, size[1] * ('y' in spec.sizeOL ? evalMinMax(spec.sizeOL.y, age01, mix) : x), size[2] * ('z' in spec.sizeOL ? evalMinMax(spec.sizeOL.z, age01, mix) : x)];
    }
    if (particle.noise && spec.noise && !isZeroCurve(spec.noise.size)) {
      const grow = 1 + particle.noise[0] * evalMinMax(spec.noise.size, age01, particle.rand[R.NOISE]);
      size = scale(size, Math.max(0, grow));
    }
    particle.size = size;
    if (spec.col) {
      const over = evalColor(spec.col, age01, particle.rand[R.COLOR]);
      const start = particle.startColor;
      particle.color = [start[0] * over[0], start[1] * over[1], start[2] * over[2], start[3] * over[3]];
    } else {
      particle.color = particle.startColor;
    }
    if (spec.uv) particle.frame = sheetFrame(spec.uv, particle, age01, speed);
    if (spec.custom) particle.custom = spec.custom.map((curve, index) => evalMinMax(curve, age01, particle.rand[R.CUSTOM + index]));
  }

  function spawn(system, emitter, birthTime, slot) {
    const { spec, random } = system;
    if (system.particles.length >= spec.max) return null;
    const at = clamp01(spec.dur > 0 ? (birthTime - emitter.start) / spec.dur : 0);
    const life = evalMinMax(spec.life, at, random.next());
    const speed = evalMinMax(spec.speed, at, random.next());
    const sizeMix = random.next();
    const startSize =
      typeof spec.size === 'object' && !Array.isArray(spec.size) && 'x' in spec.size
        ? [evalMinMax(spec.size.x, at, sizeMix), evalMinMax(spec.size.y, at, sizeMix), evalMinMax(spec.size.z, at, sizeMix)]
        : Array(3).fill(evalMinMax(spec.size, at, sizeMix));
    const threeAxis = typeof spec.rot === 'object' && !Array.isArray(spec.rot) && 'x' in spec.rot;
    const rot = threeAxis
      ? [evalMinMax(spec.rot.x, at, random.next()), evalMinMax(spec.rot.y, at, random.next()), evalMinMax(spec.rot.z, at, random.next())]
      : [0, 0, evalMinMax(spec.rot, at, random.next())];
    const spin = random.next() < spec.flipRot ? -1 : 1;
    const startColor = evalColor(spec.color, at, random.next());
    const born = emitFromShape(spec.shape, random, slot);
    const rand = Array.from({ length: R.COUNT }, () => random.next());
    if (!(life > 0)) return null;

    const matrix = emitterMatrix(system, emitter);
    const local = [born.position[0] * system.shapeScale[0], born.position[1] * system.shapeScale[1], born.position[2] * system.shapeScale[2]];
    const tint = emitter.tint;
    const particle = {
      id: (system.births += 1),
      age: 0,
      life,
      pos: transformPoint(matrix, local),
      vel: scale(transformVector(matrix, born.direction), speed),
      // What the renderer stretches along: velocity plus the animated velocities.
      move: [0, 0, 0],
      startSize: [startSize[0] * system.sizeScale[0], startSize[1] * system.sizeScale[1], startSize[2] * system.sizeScale[2]],
      size: null,
      rot: spin < 0 ? rot.map((angle) => -angle) : rot,
      threeAxis,
      spin,
      align: spec.shape?.align ? quatLook(born.direction) : null,
      startColor: tint ? startColor.map((channel, index) => channel * tint[index]) : startColor,
      color: null,
      startFrame: spec.uv ? evalMinMax(spec.uv.start, at, random.next()) : 0,
      frame: 0,
      custom: null,
      noise: null,
      rand,
      trail: spec.trail ? [] : null,
    };
    particle.move = [...particle.vel];
    refresh(system, particle, length(particle.vel));
    system.particles.push(particle);
    for (const subRef of spec.sub ?? []) {
      if (subRef.type !== SUB_BIRTH || random.next() > subRef.p) continue;
      const target = bySubId.get(subRef.id);
      if (!target) continue;
      const child = newEmitter(target, birthTime, particle, null);
      if (subRef.props & SUB_INHERIT_COLOR) child.tint = particle.startColor;
      target.emitters.push(child);
    }
    return particle;
  }

  function animatedVelocity(system, particle, age01, time) {
    const { spec } = system;
    let animated = [0, 0, 0];
    const velocity = spec.vel;
    if (velocity) {
      const mix = particle.rand[R.VELOCITY];
      const linear = [evalMinMax(velocity.x, age01, mix), evalMinMax(velocity.y, age01, mix), evalMinMax(velocity.z, age01, mix)];
      animated = add(animated, velocity.world ? linear : transformVector(system.matrix, linear));
      const orbit = [evalMinMax(velocity.ox, age01, mix), evalMinMax(velocity.oy, age01, mix), evalMinMax(velocity.oz, age01, mix)];
      const radial = evalMinMax(velocity.radial, age01, mix);
      if (orbit[0] !== 0 || orbit[1] !== 0 || orbit[2] !== 0 || radial !== 0) {
        const centre = transformPoint(system.matrix, [evalMinMax(velocity.cx, age01, mix), evalMinMax(velocity.cy, age01, mix), evalMinMax(velocity.cz, age01, mix)]);
        const arm = sub(particle.pos, centre);
        const axis = normalize(transformVector(system.matrix, orbit), [0, 0, 0]);
        animated = add(animated, scale(cross(axis, arm), length(orbit)));
        animated = add(animated, scale(normalize(arm, [0, 0, 0]), radial * system.unit));
      }
    }
    const noise = spec.noise;
    if (noise) {
      const mix = particle.rand[R.NOISE];
      const scroll = evalMinMax(noise.scroll, age01, mix) * time;
      const point = [particle.pos[0] * noise.freq, particle.pos[1] * noise.freq, particle.pos[2] * noise.freq + scroll];
      const field = noiseVector(point, { octaves: noise.octaves, multiplier: noise.mul, scale: noise.scale });
      particle.noise = field;
      // Damping ties strength to frequency: a coarser field pushes farther.
      const damp = noise.damping && noise.freq > 0 ? 1 / noise.freq : 1;
      const amount = evalMinMax(noise.pos, age01, mix) * damp * system.unit;
      animated = add(animated, [
        field[0] * evalMinMax(noise.x, age01, mix) * amount,
        field[1] * evalMinMax(noise.y, age01, mix) * amount,
        field[2] * evalMinMax(noise.z, age01, mix) * amount,
      ]);
    }
    return animated;
  }

  function limitVelocity(system, particle, total, age01, dt) {
    const limit = system.spec.limit;
    let speed = length(total);
    if (!limit || !(speed > 0)) return total;
    const start = speed;
    const cap = evalMinMax(limit.mag, age01, particle.rand[R.LIMIT]) * system.unit;
    if (speed > cap) speed = lerp(speed, cap, 1 - (1 - clamp01(limit.dampen)) ** (dt * DAMPEN_REFERENCE_FPS));
    const drag = evalMinMax(limit.drag, age01, particle.rand[R.DRAG]);
    if (drag > 0) {
      const radius = Math.max(particle.size[0], particle.size[1], particle.size[2]) / 2;
      const area = limit.dragSize ? Math.PI * radius * radius : 1;
      const pressure = limit.dragVel ? speed * speed : 1;
      speed = Math.max(0, speed - drag * area * pressure * dt);
    }
    return speed === start ? total : scale(total, speed / start);
  }

  function growTrail(system, particle, time) {
    const trail = system.spec.trail;
    const points = particle.trail;
    const last = points[points.length - 1];
    if (!last || length(sub(particle.pos, last.pos)) >= trail.minDist * system.unit) points.push({ pos: [...particle.pos], time });
    const keep = evalMinMax(trail.life, 0, particle.rand[R.CUSTOM]) * particle.life;
    while (points.length > 0 && time - points[0].time > keep) points.shift();
  }

  /** Advance one particle by `dt`; false when it has died. */
  function update(system, particle, dt, time) {
    const { spec } = system;
    particle.age += dt;
    if (particle.age >= particle.life) return false;
    const age01 = particle.age / particle.life;
    const gravity = evalMinMax(spec.gravity, age01, 0);
    if (gravity !== 0) particle.vel[1] -= GRAVITY * gravity * dt;
    if (spec.force) {
      const mix = particle.rand[R.FORCE];
      const force = [evalMinMax(spec.force.x, age01, mix), evalMinMax(spec.force.y, age01, mix), evalMinMax(spec.force.z, age01, mix)];
      particle.vel = add(particle.vel, scale(spec.force.world ? force : transformVector(system.matrix, force), dt));
    }
    const animated = animatedVelocity(system, particle, age01, time);
    const total = limitVelocity(system, particle, add(particle.vel, animated), age01, dt);
    particle.vel = sub(total, animated);
    const modifier = spec.vel ? evalMinMax(spec.vel.mul, age01, particle.rand[R.VELOCITY]) : 1;
    particle.move = scale(total, modifier);
    particle.pos = add(particle.pos, scale(particle.move, dt));
    if (spec.rotOL) {
      const turn = spec.rotOL;
      particle.rot = [
        particle.rot[0] + ('x' in turn ? evalMinMax(turn.x, age01, particle.rand[R.SPIN_X]) : 0) * particle.spin * dt,
        particle.rot[1] + ('y' in turn ? evalMinMax(turn.y, age01, particle.rand[R.SPIN_Y]) : 0) * particle.spin * dt,
        particle.rot[2] + evalMinMax(turn.z, age01, particle.rand[R.SPIN_Z]) * particle.spin * dt,
      ];
    }
    if (spec.noise && particle.noise && !isZeroCurve(spec.noise.rot)) {
      particle.rot[2] += particle.noise[0] * evalMinMax(spec.noise.rot, age01, particle.rand[R.NOISE]) * dt;
    }
    refresh(system, particle, length(particle.move));
    if (particle.trail) growTrail(system, particle, time);
    return true;
  }

  /** Fire every burst cycle due before `to` (seconds into the emitter's run); each fires once. */
  function emitBursts(system, emitter, to, time) {
    const { spec, random } = system;
    spec.em.bursts.forEach((burst, index) => {
      for (;;) {
        const cycle = emitter.cycles[index];
        if (burst.cycles > 0 && cycle >= burst.cycles) return;
        // A repeat needs an interval to wait out.
        if (cycle > 0 && !(burst.interval > 0)) return;
        const at = burst.t + cycle * burst.interval;
        // Written so a time that is not a number ends the loop too.
        if (!(at < to) || !(at <= spec.dur)) return;
        emitter.cycles[index] = cycle + 1;
        if (random.next() > burst.p) continue;
        const count = Math.round(evalMinMax(burst.n, spec.dur > 0 ? at / spec.dur : 0, random.next()));
        for (let slot = 0; slot < count; slot += 1) {
          const particle = spawn(system, emitter, emitter.start + at, { index: slot, count });
          if (particle && !update(system, particle, Math.max(0, time - (emitter.start + at)), time)) system.particles.pop();
        }
      }
    });
  }

  function emitRate(system, emitter, from, to, time) {
    const { spec, random } = system;
    const rate = evalMinMax(spec.em.rate, spec.dur > 0 ? from / spec.dur : 0, Array.isArray(spec.em.rate) ? random.next() : 0);
    if (rate > 0 && Number.isFinite(rate)) {
      emitter.acc += rate * (to - from);
      // A whole particle is owed once the sum is within rounding of 1 (120 steps of 1/120 fall short).
      while (emitter.acc >= 1 - RATE_EPSILON) {
        emitter.acc = Math.max(0, emitter.acc - 1);
        const at = to - emitter.acc / rate;
        const particle = spawn(system, emitter, emitter.start + at, null);
        if (particle && !update(system, particle, Math.max(0, time - (emitter.start + at)), time)) system.particles.pop();
      }
    }
    const perUnit = evalMinMax(spec.em.dist, 0, 0);
    if (perUnit > 0 && Number.isFinite(perUnit) && emitter.follow) {
      emitter.accDistance += perUnit * length(sub(emitter.follow.pos, emitter.last));
      emitter.last = [...emitter.follow.pos];
      while (emitter.accDistance >= 1) {
        emitter.accDistance -= 1;
        spawn(system, emitter, time, null);
      }
    }
  }

  /** Emit what `emitter` owes for the step ending at `time`; false once it is spent. */
  function emit(system, emitter, time, dt) {
    const { spec } = system;
    const to = time - emitter.start;
    const from = to - dt;
    if (to <= 0) return true;
    if (spec.em) {
      const start = Math.max(0, from);
      const end = Math.min(to, spec.dur);
      emitBursts(system, emitter, to, time);
      if (end > start) emitRate(system, emitter, start, end, time);
    }
    if (emitter.follow && emitter.follow.age >= emitter.follow.life) return false;
    return to < spec.dur;
  }

  function step() {
    steps += 1;
    const time = steps * STEP_S;
    for (const system of systems) {
      const dt = STEP_S * (system.spec.simSpeed ?? 1);
      const survivors = [];
      for (const particle of system.particles) {
        if (update(system, particle, dt, time)) {
          survivors.push(particle);
          continue;
        }
        for (const subRef of system.spec.sub ?? []) {
          if (subRef.type !== SUB_DEATH || system.random.next() > subRef.p) continue;
          const target = bySubId.get(subRef.id);
          if (target) target.emitters.push(newEmitter(target, time, null, [...particle.pos]));
        }
      }
      system.particles = survivors;
      // A birth sub-emitter may add to this very list while it is walked: start the new list first.
      const emitters = system.emitters;
      system.emitters = [];
      for (const emitter of emitters) if (emit(system, emitter, time, dt)) system.emitters.push(emitter);
    }
  }

  reset();
  return {
    systems,
    duration,
    get time() {
      return steps * STEP_S;
    },
    advanceTo(seconds) {
      const target = Math.max(0, Math.floor((Number.isFinite(seconds) ? seconds : 0) / STEP_S + 1e-6));
      if (target < steps) reset();
      while (steps < target) step();
    },
  };
}
