import assert from 'node:assert/strict';
import { test } from 'node:test';
import { curveAt } from '../../../../client/src/setup/netcode/mat-fx/tcgl-fx.mjs';
import { bakeCurve, evaluateUnityCurve, hermite } from '../lib/bake-curve.mjs';
import { builtinMesh, BUILTIN_PLANE, BUILTIN_QUAD, BUILTIN_SPHERE } from '../lib/builtin-meshes.mjs';
import { gradient, isZero, minMax, minMaxGradient, normalizePrefab } from '../lib/normalize-system.mjs';
import { checkStageLink, globalValue, pickVariant, queueFromTag } from '../lib/shader-variant.mjs';

const key = (time, value, inSlope = 0, outSlope = inSlope) => ({ time, value, inSlope, outSlope });
const unityCurve = (...keys) => ({ m_Curve: keys });

test('hermite follows Unity tangents and holds a stepped key', () => {
  assert.equal(hermite(key(0, 0, 1), key(1, 1, 1), 0.5), 0.5);
  assert.equal(hermite(key(0, 2, 0, Infinity), key(1, 5), 0.9), 2);
  assert.equal(evaluateUnityCurve([], 0.5), 0);
  assert.equal(evaluateUnityCurve([key(0.2, 3), key(0.8, 7)], 0), 3);
  assert.equal(evaluateUnityCurve([key(0.2, 3), key(0.8, 7)], 1), 7);
});

test('bakeCurve stays within 0.5 % of the spline for an ease in and out', () => {
  const keys = [key(0, 0), key(0.4, 1.8, 0, 0), key(1, 0.2, -3)];
  const baked = bakeCurve(unityCurve(...keys));
  let worst = 0;
  for (let step = 0; step <= 200; step += 1) {
    const time = step / 200;
    worst = Math.max(worst, Math.abs(curveAt(baked, time) - evaluateUnityCurve(keys, time)));
  }
  assert.ok(worst <= 1.8 * 0.006, `worst error ${worst}`);
  assert.ok(baked.length > 2 && baked.length < 40, `${baked.length} keys`);
});

test('bakeCurve keeps a straight line as two keys and reads empty as nothing', () => {
  assert.deepEqual(bakeCurve(unityCurve(key(0, 0, 2), key(1, 2, 2))), [
    [0, 0],
    [1, 2],
  ]);
  assert.deepEqual(bakeCurve(unityCurve(key(0.5, 4))), [[0.5, 4]]);
  assert.deepEqual(bakeCurve(unityCurve()), []);
  assert.deepEqual(bakeCurve(null), []);
});

const constant = (scalar) => ({ minMaxState: 0, scalar, minScalar: 0, maxCurve: unityCurve(), minCurve: unityCurve() });

test('minMax maps the four Unity curve modes', () => {
  assert.equal(minMax(constant(2.5)), 2.5);
  assert.deepEqual(minMax({ ...constant(4), minMaxState: 3, minScalar: 1 }), [1, 4]);
  assert.deepEqual(minMax({ ...constant(3), minMaxState: 1, maxCurve: unityCurve(key(0, 0, 1), key(1, 1, 1)) }), { k: [[0, 0], [1, 1]], s: 3 });
  const two = minMax({ ...constant(1), minMaxState: 2, maxCurve: unityCurve(key(0, 1)), minCurve: unityCurve(key(0, 0.5)) });
  assert.deepEqual(two, { k: [[0, 1]], k2: [[0, 0.5]], s: 1 });
  assert.ok(isZero(0) && isZero([0, 0]) && !isZero([0, 1]) && !isZero({ k: [], s: 0 }));
  assert.throws(() => minMax({ ...constant(1), minMaxState: 9 }), /unknown MinMaxCurve state/);
});

const unityGradient = () => ({
  m_Mode: 0,
  m_NumColorKeys: 2,
  m_NumAlphaKeys: 2,
  key0: { r: 1, g: 0.5, b: 0, a: 1 },
  key1: { r: 0, g: 0, b: 1, a: 0 },
  ctime0: 0,
  ctime1: 65535,
  atime0: 0,
  atime1: 32768,
});

test('gradient and minMaxGradient keep Unity keys', () => {
  assert.deepEqual(gradient(unityGradient()), { color: [[0, [1, 0.5, 0]], [1, [0, 0, 1]]], alpha: [[0, 1], [0.50001, 0]] });
  assert.deepEqual(minMaxGradient({ minMaxState: 0, maxColor: { r: 1, g: 1, b: 0, a: 0.5 } }), [1, 1, 0, 0.5]);
  assert.deepEqual(Object.keys(minMaxGradient({ minMaxState: 3, maxGradient: unityGradient(), minGradient: unityGradient() })), ['g', 'g2']);
  assert.throws(() => gradient({ ...unityGradient(), m_Mode: 1 }), /fixed/);
});

const moduleOff = { enabled: false };
const particleSystem = (overrides = {}) => ({
  lengthInSec: 1,
  simulationSpeed: 1,
  looping: false,
  prewarm: false,
  startDelay: constant(0),
  moveWithTransform: 0,
  scalingMode: 0,
  InitialModule: {
    startLifetime: constant(1),
    startSpeed: constant(0),
    startColor: { minMaxState: 0, maxColor: { r: 1, g: 1, b: 1, a: 1 } },
    startSize: constant(2),
    startSizeY: constant(2),
    startSizeZ: constant(2),
    startRotationX: constant(0),
    startRotationY: constant(0),
    startRotation: constant(0),
    randomizeRotationDirection: 0,
    maxNumParticles: 10,
    size3D: false,
    rotation3D: false,
    gravityModifier: constant(0),
  },
  EmissionModule: { enabled: true, rateOverTime: constant(0), rateOverDistance: constant(0), m_BurstCount: 1, m_Bursts: [{ time: 0, countCurve: constant(3), cycleCount: 1, repeatInterval: 0.01, probability: 1 }] },
  ShapeModule: moduleOff,
  VelocityModule: moduleOff,
  ClampVelocityModule: moduleOff,
  ForceModule: moduleOff,
  NoiseModule: moduleOff,
  ColorModule: moduleOff,
  SizeModule: moduleOff,
  RotationModule: moduleOff,
  UVModule: moduleOff,
  CustomDataModule: moduleOff,
  TrailModule: moduleOff,
  SubModule: { enabled: false, subEmitters: [] },
  ...overrides,
});
const renderer = (overrides = {}) => ({
  m_Enabled: true,
  m_Materials: ['mat-a'],
  m_RenderMode: 0,
  m_RenderAlignment: 0,
  m_SortingOrder: 1,
  m_SortingFudge: -100,
  m_Pivot: { x: 0, y: 0, z: 0 },
  m_Flip: { x: 0, y: 0, z: 0 },
  m_LengthScale: 2,
  m_VelocityScale: 0,
  m_MinParticleSize: 0,
  m_MaxParticleSize: 0.5,
  m_SortMode: 0,
  m_UseCustomVertexStreams: false,
  m_VertexStreams: [0, 1, 3, 4, 34],
  m_Mesh: 'some-mesh',
  ...overrides,
});
const node = (name, extra = {}) => ({ name, active: true, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], children: [], ...extra });
const lookups = { materialIndex: (id) => (id === 'mat-a' ? 0 : 1), meshId: (id) => `mesh:${id}` };

test('normalizePrefab keeps what can show and drops the rest', () => {
  const root = node('Root', {
    position: [0, 0, -7.18],
    scale: [2, 2, 2],
    particleSystem: particleSystem({ EmissionModule: moduleOff }),
    particleRenderer: renderer({ m_Enabled: false }),
    children: [
      node('Shown', { position: [0, 1, 0], particleSystem: particleSystem(), particleRenderer: renderer() }),
      node('Hidden', { active: false, particleSystem: particleSystem(), particleRenderer: renderer() }),
      node('NoRenderer', { particleSystem: particleSystem(), particleRenderer: renderer({ m_Enabled: false }) }),
      node('Mesh', { particleSystem: particleSystem(), particleRenderer: renderer({ m_RenderMode: 4, m_UseCustomVertexStreams: true }) }),
    ],
  });
  const prefab = normalizePrefab(root, lookups);
  assert.equal(prefab.ps, undefined);
  // The game clears the root's saved transform on spawn; children keep theirs.
  assert.deepEqual([prefab.p, prefab.s], [[0, 0, 0], [1, 1, 1]]);
  assert.deepEqual(prefab.c[0].p, [0, 1, 0]);
  assert.deepEqual(prefab.c.map((child) => child.n), ['Shown', 'NoRenderer', 'Mesh']);
  const [shown, bare, mesh] = prefab.c;
  assert.equal(shown.ps.em.bursts[0].n, 3);
  assert.equal(shown.ps.max, 10);
  assert.deepEqual(shown.r.streams, [0, 1, 3, 4]);
  // A billboard ignores its mesh slot.
  assert.equal(shown.r.mesh, undefined);
  assert.equal(bare.ps, undefined);
  assert.equal(mesh.r.mesh, 'mesh:some-mesh');
  assert.deepEqual(mesh.r.streams, [0, 1, 3, 4, 34]);
});

test('a sub-emitter keeps its system although it has no emission of its own', () => {
  const sub = node('Sub', { particleSystemId: '77', particleSystem: particleSystem({ EmissionModule: moduleOff }), particleRenderer: renderer() });
  const parent = node('Parent', {
    particleSystem: particleSystem({ SubModule: { enabled: true, subEmitters: [{ emitter: '77', type: 2, properties: 8, emitProbability: 1 }] } }),
    particleRenderer: renderer({ m_Enabled: false }),
    children: [sub],
  });
  const prefab = normalizePrefab(parent, lookups);
  assert.deepEqual(prefab.ps.sub, [{ id: '77', type: 2, props: 8, p: 1 }]);
  assert.equal(prefab.r, undefined);
  assert.equal(prefab.c[0].subId, '77');
  assert.ok(prefab.c[0].ps && prefab.c[0].r);
});

test('normalizeSystem refuses a module the runtime does not simulate', () => {
  const root = node('Root', { particleSystem: particleSystem({ CollisionModule: { enabled: true } }), particleRenderer: renderer() });
  assert.throws(() => normalizePrefab(root, lookups), /Collision module is not supported/);
});

test('built-in meshes have Unity sizes and clockwise front faces', () => {
  const quad = builtinMesh(BUILTIN_QUAD);
  assert.equal(quad.positions.length, 4);
  assert.deepEqual(quad.normals[0], [0, 0, -1]);
  assert.equal(builtinMesh(BUILTIN_PLANE).positions.length, 121);
  const sphere = builtinMesh(BUILTIN_SPHERE);
  assert.ok(sphere.positions.every((p) => Math.abs(Math.hypot(...p) - 0.5) < 1e-9));
  assert.throws(() => builtinMesh(10202), /not supported/);
});

test('queueFromTag reads Unity queue names with offsets', () => {
  assert.equal(queueFromTag('Transparent'), 3000);
  assert.equal(queueFromTag('Transparent+0'), 3000);
  assert.equal(queueFromTag('Geometry-10'), 1990);
  assert.throws(() => queueFromTag('Sideways'), /unknown render queue/);
});

test('globalValue resolves a shader constant from the material, then the shader default', () => {
  const props = new Map([
    ['_TintColor', { m_Type: 0, m_Flags: 0, m_DefValue_0: 0.5, m_DefValue_1: 0.5, m_DefValue_2: 0.5, m_DefValue_3: 0.5 }],
    ['_Offset', { m_Type: 1, m_Flags: 0, m_DefValue_0: 1, m_DefValue_1: 2, m_DefValue_2: 3, m_DefValue_3: 4 }],
    ['_Brightness', { m_Type: 2, m_Flags: 0, m_DefValue_0: 1.5 }],
    ['_MainTex', { m_Type: 4, m_Flags: 0 }],
  ]);
  const material = { colors: { _TintColor: [1, 0.5, 0, 0.5] }, floats: {}, ints: {}, textures: { _MainTex: { scale: [2, 3], offset: [0.1, 0.2] } } };
  const tint = globalValue('_TintColor', 4, material, props, () => null);
  // A Color is authored in sRGB; its alpha is not.
  assert.deepEqual([tint[0], tint[2], tint[3]], [1, 0, 0.5]);
  assert.ok(Math.abs(tint[1] - 0.21404) < 1e-4);
  assert.deepEqual(globalValue('_Offset', 2, material, props, () => null), [1, 2]);
  assert.deepEqual(globalValue('_Brightness', 1, material, props, () => null), [1.5]);
  assert.deepEqual(globalValue('_MainTex_ST', 4, material, props, () => null), [2, 3, 0.1, 0.2]);
  assert.deepEqual(globalValue('_texcoord_ST', 4, material, props, () => null), [1, 1, 0, 0]);
  assert.deepEqual(globalValue('_MainTex_TexelSize', 4, material, props, () => ({ width: 256, height: 128 })), [1 / 256, 1 / 128, 256, 128]);
  assert.equal(globalValue('_Unknown', 1, material, props, () => null), null);
});

test('checkStageLink refuses a pixel input the vertex shader wrote to another register', () => {
  const signature = (kind, rows) => [`// ${kind} signature:`, '//', '// Name                 Index   Mask Register SysValue  Format   Used', '// -------------------- ----- ------ -------- -------- ------- ------', ...rows, '//'].join('\n');
  const row = (name, index, register, sys, used) => `// ${name.padEnd(20)} ${String(index).padStart(5)}   xyzw ${String(register).padStart(8)} ${sys.padStart(8)}   float   ${used}`;
  const vertex = signature('Output', [row('SV_POSITION', 0, 0, 'POS', 'xyzw'), row('TEXCOORD', 0, 1, 'NONE', 'xyzw'), row('COLOR', 0, 2, 'NONE', 'xyzw')]);
  const good = signature('Input', [row('SV_POSITION', 0, 0, 'POS', ''), row('TEXCOORD', 0, 1, 'NONE', 'xy  '), row('COLOR', 0, 2, 'NONE', 'xyzw')]);
  const swapped = signature('Input', [row('SV_POSITION', 0, 0, 'POS', ''), row('COLOR', 0, 1, 'NONE', 'xyzw')]);
  const unread = signature('Input', [row('COLOR', 0, 1, 'NONE', '')]);
  assert.doesNotThrow(() => checkStageLink('S', vertex, good));
  assert.doesNotThrow(() => checkStageLink('S', vertex, unread));
  assert.throws(() => checkStageLink('S', vertex, swapped), /reads COLOR0 from register 1, the vertex shader writes it to 2/);
});

test('pickVariant takes the variant whose keywords the game has on', () => {
  const shader = { name: 'S', keywordNames: ['SOFTPARTICLES_ON', 'DIRECTIONAL', 'LIGHTPROBE_SH'] };
  const variant = (keywords) => ({ keywords, asm: 'ps_4_0', params: {} });
  assert.deepEqual(pickVariant(shader, { variants: [variant([0]), variant([])] }).keywords, []);
  assert.deepEqual(pickVariant(shader, { variants: [variant([1, 2]), variant([1])] }).keywords, [1]);
  assert.throws(() => pickVariant(shader, { variants: [variant([0])] }), /no variant/);
});
