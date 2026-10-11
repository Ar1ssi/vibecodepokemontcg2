// Design 068: a Unity ParticleSystem type tree → the compact system the runtime simulates
// (client/src/setup/netcode/mat-fx/impact/impact-sim.mjs reads exactly these keys). Only the
// modules a system has on are kept; every curve is baked to piecewise-linear keys.
import { bakeCurve } from './bake-curve.mjs';

// ParticleSystemCurveMode
const STATE_CONSTANT = 0;
const STATE_CURVE = 1;
const STATE_TWO_CURVES = 2;
const STATE_TWO_CONSTANTS = 3;
// ParticleSystemGradientMode
const GRADIENT_COLOR = 0;
const GRADIENT_GRADIENT = 1;
const GRADIENT_TWO_COLORS = 2;
const GRADIENT_TWO_GRADIENTS = 3;
const GRADIENT_RANDOM_COLOR = 4;
const MAX_GRADIENT_KEYS = 8;

const round = (value, digits = 5) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : 0);
const vec3 = (v) => [round(v.x), round(v.y), round(v.z)];

/**
 * MinMaxCurve → a number, `[min, max]` (random between two constants), `{k, s}` (curve × s)
 * or `{k, k2, s}` (random between two curves, k2 the lower one).
 */
export function minMax(curve) {
  if (!curve || typeof curve !== 'object') return 0;
  const scalar = round(curve.scalar);
  if (curve.minMaxState === STATE_CONSTANT) return scalar;
  if (curve.minMaxState === STATE_TWO_CONSTANTS) return [round(curve.minScalar), scalar];
  if (curve.minMaxState === STATE_CURVE) return { k: bakeCurve(curve.maxCurve), s: scalar };
  if (curve.minMaxState === STATE_TWO_CURVES) return { k: bakeCurve(curve.maxCurve), k2: bakeCurve(curve.minCurve), s: scalar };
  throw new Error(`unknown MinMaxCurve state ${curve.minMaxState}`);
}

/** True when a normalized MinMax can only ever read 0. */
export const isZero = (value) => value === 0 || (Array.isArray(value) && value[0] === 0 && value[1] === 0);

const rgba = (color) => [round(color.r, 4), round(color.g, 4), round(color.b, 4), round(color.a, 4)];

/** Unity Gradient → `{color: [[t, [r, g, b]], …], alpha: [[t, a], …]}` (tcgl-fx.mjs `gradientAt`). */
export function gradient(source) {
  if (source.m_Mode !== 0) throw new Error(`gradient mode ${source.m_Mode} (fixed) is not supported`);
  const colorCount = Math.min(MAX_GRADIENT_KEYS, source.m_NumColorKeys);
  const alphaCount = Math.min(MAX_GRADIENT_KEYS, source.m_NumAlphaKeys);
  return {
    color: Array.from({ length: colorCount }, (_, i) => [round(source[`ctime${i}`] / 65535), rgba(source[`key${i}`]).slice(0, 3)]),
    alpha: Array.from({ length: alphaCount }, (_, i) => [round(source[`atime${i}`] / 65535), round(source[`key${i}`].a, 4)]),
  };
}

/**
 * MinMaxGradient → `[r, g, b, a]`, `{g}` (gradient), `{c2: [min, max]}`, `{g, g2}` (random
 * between two gradients, g2 the lower one) or `{rnd: gradient}` (a random point of it).
 */
export function minMaxGradient(source) {
  if (!source || typeof source !== 'object') return [1, 1, 1, 1];
  if (source.minMaxState === GRADIENT_COLOR) return rgba(source.maxColor);
  if (source.minMaxState === GRADIENT_GRADIENT) return { g: gradient(source.maxGradient) };
  if (source.minMaxState === GRADIENT_TWO_COLORS) return { c2: [rgba(source.minColor), rgba(source.maxColor)] };
  if (source.minMaxState === GRADIENT_TWO_GRADIENTS) return { g: gradient(source.maxGradient), g2: gradient(source.minGradient) };
  if (source.minMaxState === GRADIENT_RANDOM_COLOR) return { rnd: gradient(source.maxGradient) };
  throw new Error(`unknown MinMaxGradient state ${source.minMaxState}`);
}

const shapeOf = (shape) => ({
  type: shape.type,
  radius: round(shape.radius.value),
  thickness: round(shape.radiusThickness),
  angle: round(shape.angle),
  length: round(shape.length),
  donut: round(shape.donutRadius),
  arc: round(shape.arc.value),
  arcMode: shape.arc.mode,
  arcSpread: round(shape.arc.spread),
  box: vec3(shape.boxThickness),
  pos: vec3(shape.m_Position),
  rot: vec3(shape.m_Rotation),
  scale: vec3(shape.m_Scale),
  align: Boolean(shape.alignToDirection),
  rndDir: round(shape.randomDirectionAmount),
  sphDir: round(shape.sphericalDirectionAmount),
  rndPos: round(shape.randomPositionAmount),
});

const emissionOf = (emission) => ({
  rate: minMax(emission.rateOverTime),
  dist: minMax(emission.rateOverDistance),
  bursts: emission.m_Bursts.slice(0, emission.m_BurstCount).map((burst) => ({
    t: round(burst.time),
    n: minMax(burst.countCurve),
    cycles: burst.cycleCount,
    interval: round(burst.repeatInterval),
    p: round(burst.probability),
  })),
});

const axes = (module, names) => Object.fromEntries(names.map(([key, field]) => [key, minMax(module[field])]));

const velocityOf = (velocity) => ({
  ...axes(velocity, [['x', 'x'], ['y', 'y'], ['z', 'z'], ['ox', 'orbitalX'], ['oy', 'orbitalY'], ['oz', 'orbitalZ']]),
  ...axes(velocity, [['cx', 'orbitalOffsetX'], ['cy', 'orbitalOffsetY'], ['cz', 'orbitalOffsetZ'], ['radial', 'radial'], ['mul', 'speedModifier']]),
  world: Boolean(velocity.inWorldSpace),
});

const limitOf = (limit) => {
  if (limit.separateAxis) throw new Error('Limit Velocity with separate axes is not supported');
  return {
    mag: minMax(limit.magnitude),
    dampen: round(limit.dampen),
    drag: minMax(limit.drag),
    dragSize: Boolean(limit.multiplyDragByParticleSize),
    dragVel: Boolean(limit.multiplyDragByParticleVelocity),
  };
};

const noiseOf = (noise) => {
  if (noise.remapEnabled) throw new Error('Noise remap is not supported');
  const strength = minMax(noise.strength);
  return {
    x: strength,
    y: noise.separateAxes ? minMax(noise.strengthY) : strength,
    z: noise.separateAxes ? minMax(noise.strengthZ) : strength,
    freq: round(noise.frequency),
    octaves: noise.octaves,
    mul: round(noise.octaveMultiplier),
    scale: round(noise.octaveScale),
    scroll: minMax(noise.scrollSpeed),
    damping: Boolean(noise.damping),
    quality: noise.quality,
    pos: minMax(noise.positionAmount),
    rot: minMax(noise.rotationAmount),
    size: minMax(noise.sizeAmount),
  };
};

const sheetOf = (sheet) => {
  if (sheet.mode !== 0 || sheet.animationType !== 0) throw new Error('only whole-sheet grid animation is supported');
  return {
    tx: sheet.tilesX,
    ty: sheet.tilesY,
    time: sheet.timeMode,
    frame: minMax(sheet.frameOverTime),
    start: minMax(sheet.startFrame),
    cycles: round(sheet.cycles),
    fps: round(sheet.fps),
    range: [round(sheet.speedRange.x), round(sheet.speedRange.y)],
  };
};

const CUSTOM_VECTOR = 1;
const customOf = (custom) => {
  if (custom.mode1 !== 0) throw new Error('Custom Data stream 2 is not supported');
  if (custom.mode0 !== CUSTOM_VECTOR) throw new Error(`Custom Data mode ${custom.mode0} is not supported`);
  return Array.from({ length: custom.vectorComponentCount0 }, (_, index) => minMax(custom[`vector0_${index}`]));
};

const trailOf = (trail) => {
  if (trail.mode !== 0) throw new Error('ribbon trails are not supported');
  return {
    ratio: round(trail.ratio),
    life: minMax(trail.lifetime),
    minDist: round(trail.minVertexDistance),
    world: Boolean(trail.worldSpace),
    die: Boolean(trail.dieWithParticles),
    sizeWidth: Boolean(trail.sizeAffectsWidth),
    inherit: Boolean(trail.inheritParticleColor),
    width: minMax(trail.widthOverTrail),
    colorLife: minMaxGradient(trail.colorOverLifetime),
    colorTrail: minMaxGradient(trail.colorOverTrail),
  };
};

/** The ParticleSystem part of a node: `{dur, delay, world, scaling, max, life, speed, size, rot, …}`. */
export function normalizeSystem(system) {
  if (system.looping || system.prewarm) throw new Error('looping / prewarmed systems are not supported');
  const main = system.InitialModule;
  const out = {
    dur: round(system.lengthInSec),
    delay: minMax(system.startDelay),
    world: system.moveWithTransform === 1,
    scaling: system.scalingMode,
    max: main.maxNumParticles,
    life: minMax(main.startLifetime),
    speed: minMax(main.startSpeed),
    size: main.size3D ? { x: minMax(main.startSize), y: minMax(main.startSizeY), z: minMax(main.startSizeZ) } : minMax(main.startSize),
    rot: main.rotation3D
      ? { x: minMax(main.startRotationX), y: minMax(main.startRotationY), z: minMax(main.startRotation) }
      : minMax(main.startRotation),
    flipRot: round(main.randomizeRotationDirection),
    color: minMaxGradient(main.startColor),
    gravity: minMax(main.gravityModifier),
  };
  if (system.moveWithTransform === 2) throw new Error('custom simulation space is not supported');
  if (system.simulationSpeed !== 1) out.simSpeed = round(system.simulationSpeed);
  if (system.EmissionModule.enabled) out.em = emissionOf(system.EmissionModule);
  if (system.ShapeModule.enabled) out.shape = shapeOf(system.ShapeModule);
  if (system.VelocityModule.enabled) out.vel = velocityOf(system.VelocityModule);
  if (system.ClampVelocityModule.enabled) out.limit = limitOf(system.ClampVelocityModule);
  if (system.ForceModule.enabled) out.force = { ...axes(system.ForceModule, [['x', 'x'], ['y', 'y'], ['z', 'z']]), world: Boolean(system.ForceModule.inWorldSpace) };
  if (system.NoiseModule.enabled) out.noise = noiseOf(system.NoiseModule);
  if (system.ColorModule.enabled) out.col = minMaxGradient(system.ColorModule.gradient);
  if (system.SizeModule.enabled) {
    const size = system.SizeModule;
    out.sizeOL = size.separateAxes ? axes(size, [['x', 'curve'], ['y', 'y'], ['z', 'z']]) : { x: minMax(size.curve) };
  }
  if (system.RotationModule.enabled) {
    const rotation = system.RotationModule;
    out.rotOL = rotation.separateAxes ? axes(rotation, [['x', 'x'], ['y', 'y'], ['z', 'curve']]) : { z: minMax(rotation.curve) };
  }
  if (system.UVModule.enabled) out.uv = sheetOf(system.UVModule);
  if (system.CustomDataModule.enabled) out.custom = customOf(system.CustomDataModule);
  if (system.TrailModule.enabled) out.trail = trailOf(system.TrailModule);
  if (system.SubModule.enabled) {
    out.sub = system.SubModule.subEmitters
      .filter((sub) => sub.emitter !== '0')
      .map((sub) => ({ id: sub.emitter, type: sub.type, props: sub.properties, p: round(sub.emitProbability) }));
  }
  for (const [module, label] of [
    ['InheritVelocityModule', 'Inherit Velocity'],
    ['LifetimeByEmitterSpeedModule', 'Lifetime by Emitter Speed'],
    ['ExternalForcesModule', 'External Forces'],
    ['SizeBySpeedModule', 'Size by Speed'],
    ['RotationBySpeedModule', 'Rotation by Speed'],
    ['ColorBySpeedModule', 'Color by Speed'],
    ['CollisionModule', 'Collision'],
    ['TriggerModule', 'Triggers'],
    ['LightsModule', 'Lights'],
  ]) {
    if (system[module]?.enabled) throw new Error(`the ${label} module is not supported`);
  }
  return out;
}

/** Default vertex streams of a renderer without custom ones: position, normal, colour, UV. */
const DEFAULT_STREAMS = [0, 1, 3, 4];
/** ParticleSystemRenderMode.Mesh; the other modes ignore the renderer's mesh slot. */
const RENDER_MESH = 4;

/** The ParticleSystemRenderer part of a node; `materialIndex` maps a dump key to the type's list. */
export function normalizeRenderer(renderer, { materialIndex, meshId }) {
  const out = {
    mode: renderer.m_RenderMode,
    align: renderer.m_RenderAlignment,
    mat: materialIndex(renderer.m_Materials[0]),
    order: renderer.m_SortingOrder,
    fudge: round(renderer.m_SortingFudge),
    pivot: vec3(renderer.m_Pivot),
    flip: vec3(renderer.m_Flip),
    len: round(renderer.m_LengthScale),
    velScale: round(renderer.m_VelocityScale),
    min: round(renderer.m_MinParticleSize),
    max: round(renderer.m_MaxParticleSize),
    sort: renderer.m_SortMode,
    streams: renderer.m_UseCustomVertexStreams ? renderer.m_VertexStreams : DEFAULT_STREAMS,
  };
  if (renderer.m_RenderMode === RENDER_MESH) {
    if (!renderer.m_Mesh) throw new Error('a mesh renderer without a mesh');
    out.mesh = meshId(renderer.m_Mesh);
  }
  if (renderer.m_Materials[1]) out.trailMat = materialIndex(renderer.m_Materials[1]);
  return out;
}

/**
 * A prefab root → the node tree the runtime plays. Inactive subtrees are dropped; a system that
 * can never show anything (no emission and not a sub-emitter, or no enabled renderer and no
 * sub-emitters of its own) keeps its transform only.
 */
export function normalizePrefab(root, lookups) {
  const subEmitters = new Set();
  const collect = (node) => {
    if (!node.active) return;
    for (const sub of node.particleSystem?.SubModule?.enabled ? node.particleSystem.SubModule.subEmitters : []) subEmitters.add(sub.emitter);
    node.children.forEach(collect);
  };
  collect(root);

  const build = (node) => {
    const out = { n: node.name, p: node.position.map((v) => round(v)), q: node.rotation.map((v) => round(v, 6)), s: node.scale.map((v) => round(v)) };
    const system = node.particleSystem;
    const renderer = node.particleRenderer;
    const isSub = subEmitters.has(node.particleSystemId);
    const visible = Boolean(renderer?.m_Enabled && renderer.m_Materials[0]);
    const hasSubs = Boolean(system?.SubModule.enabled);
    const emits = Boolean(system?.EmissionModule.enabled) || isSub;
    if (system && emits && (visible || hasSubs)) {
      out.ps = normalizeSystem(system);
      if (isSub) out.subId = node.particleSystemId;
      if (visible) out.r = normalizeRenderer(renderer, lookups);
    }
    const children = node.children.filter((child) => child.active).map(build);
    if (children.length > 0) out.c = children;
    return out;
  };
  return build(root);
}
