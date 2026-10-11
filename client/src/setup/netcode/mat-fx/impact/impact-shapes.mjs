// Design 068: where a Unity particle is born and which way it heads — the Shape module's nine
// shapes the attack prefabs use. A shape is authored on its own axes (a cone opens along +Z, a
// circle lies in XY) and then placed by the module's position / rotation / scale. DOM-free.
import { DEG, add, mul, normalize, quatEuler, quatRotate } from './impact-math.mjs';
import { randomUnit } from './impact-random.mjs';

export const SHAPE = Object.freeze({
  SPHERE: 0,
  HEMISPHERE: 2,
  CONE: 4,
  BOX: 5,
  CONE_VOLUME: 8,
  CIRCLE: 10,
  EDGE: 12,
  DONUT: 17,
  RECTANGLE: 18,
});
const ARC_BURST_SPREAD = 3;
const TAU = Math.PI * 2;
const FORWARD = Object.freeze([0, 0, 1]);

/** A radius fraction in [1 − thickness, 1], uniform over the ring's area (or the shell's volume). */
const radialFraction = (thickness, u, power) => {
  const inner = Math.max(0, 1 - thickness);
  return (inner ** power + (1 - inner ** power) * u) ** (1 / power);
};

/** The angle around the shape's axis: random over the arc, or evenly spread across a burst. */
const arcAngle = (shape, random, slot) => {
  const arc = (shape.arc ?? 360) * DEG;
  const spread = shape.arcMode === ARC_BURST_SPREAD && slot && slot.count > 0;
  const fraction = spread ? slot.index / slot.count : random.next();
  return arc * fraction;
};

const sphere = (shape, random, hemisphere) => {
  const direction = randomUnit(random);
  if (hemisphere) direction[2] = Math.abs(direction[2]);
  const distance = shape.radius * radialFraction(shape.thickness, random.next(), 3);
  return { position: [direction[0] * distance, direction[1] * distance, direction[2] * distance], direction };
};

const cone = (shape, random, slot, volume) => {
  const angle = arcAngle(shape, random, slot);
  const fraction = radialFraction(shape.thickness, random.next(), 2);
  const tilt = shape.angle * DEG * fraction;
  const radial = [Math.cos(angle), Math.sin(angle), 0];
  const direction = [radial[0] * Math.sin(tilt), radial[1] * Math.sin(tilt), Math.cos(tilt)];
  const along = volume ? shape.length * random.next() : 0;
  const base = shape.radius * fraction;
  return { position: [radial[0] * base + direction[0] * along, radial[1] * base + direction[1] * along, direction[2] * along], direction };
};

const circle = (shape, random, slot) => {
  const angle = arcAngle(shape, random, slot);
  const direction = [Math.cos(angle), Math.sin(angle), 0];
  const distance = shape.radius * radialFraction(shape.thickness, random.next(), 2);
  return { position: [direction[0] * distance, direction[1] * distance, 0], direction };
};

const donut = (shape, random, slot) => {
  const angle = arcAngle(shape, random, slot);
  const ring = [Math.cos(angle), Math.sin(angle), 0];
  const tube = random.next() * TAU;
  const distance = shape.donut * radialFraction(shape.thickness, random.next(), 2);
  const direction = [ring[0] * Math.cos(tube), ring[1] * Math.cos(tube), Math.sin(tube)];
  return {
    position: [ring[0] * shape.radius + direction[0] * distance, ring[1] * shape.radius + direction[1] * distance, direction[2] * distance],
    direction,
  };
};

const SAMPLERS = {
  [SHAPE.SPHERE]: (shape, random) => sphere(shape, random, false),
  [SHAPE.HEMISPHERE]: (shape, random) => sphere(shape, random, true),
  [SHAPE.CONE]: (shape, random, slot) => cone(shape, random, slot, false),
  [SHAPE.CONE_VOLUME]: (shape, random, slot) => cone(shape, random, slot, true),
  [SHAPE.CIRCLE]: circle,
  [SHAPE.DONUT]: donut,
  [SHAPE.BOX]: (shape, random) => ({ position: [random.next() - 0.5, random.next() - 0.5, random.next() - 0.5], direction: [...FORWARD] }),
  [SHAPE.RECTANGLE]: (shape, random) => ({ position: [random.next() - 0.5, random.next() - 0.5, 0], direction: [...FORWARD] }),
  [SHAPE.EDGE]: (shape, random) => ({ position: [shape.radius * random.signed(), 0, 0], direction: [0, 1, 0] }),
};

/**
 * One particle's birth place and heading in the system's local space.
 * `slot` = `{index, count}` of the particle within its burst (for a burst-spread arc).
 * No shape (module off): the origin, heading +Z.
 * @returns {{position: number[], direction: number[]}}
 */
export function emitFromShape(shape, random, slot = null) {
  if (!shape) return { position: [0, 0, 0], direction: [...FORWARD] };
  const sample = SAMPLERS[shape.type];
  if (!sample) throw new Error(`unsupported shape type ${shape.type}`);
  const local = sample(shape, random, slot);
  let direction = local.direction;
  if (shape.sphDir > 0) {
    const outward = normalize(local.position, direction);
    direction = normalize(add(mul(direction, [1 - shape.sphDir, 1 - shape.sphDir, 1 - shape.sphDir]), mul(outward, [shape.sphDir, shape.sphDir, shape.sphDir])), direction);
  }
  if (shape.rndDir > 0) {
    const stray = randomUnit(random);
    const keep = 1 - shape.rndDir;
    direction = normalize([direction[0] * keep + stray[0] * shape.rndDir, direction[1] * keep + stray[1] * shape.rndDir, direction[2] * keep + stray[2] * shape.rndDir], direction);
  }
  const rotation = quatEuler(shape.rot[0] * DEG, shape.rot[1] * DEG, shape.rot[2] * DEG);
  let position = add(shape.pos, quatRotate(rotation, mul(local.position, shape.scale)));
  if (shape.rndPos > 0) {
    position = add(position, [random.signed() * shape.rndPos, random.signed() * shape.rndPos, random.signed() * shape.rndPos]);
  }
  const rotated = quatRotate(rotation, direction);
  // A squashed shape squashes its headings too; one flattened to nothing keeps them as they were.
  return { position, direction: normalize(quatRotate(rotation, mul(direction, shape.scale)), rotated) };
}
