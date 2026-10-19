// Design 068: turn a simulated particle system into the vertices Unity's ParticleSystemRenderer
// would hand its shader — world-space positions, linear vertex colours, and the vertex streams
// packed into TEXCOORDs in the order the renderer lists them. The game's shaders (translated by
// scripts/fx/attack/lib/dxbc-to-glsl.mjs) read exactly these. DOM-free.
import { clamp01 } from '../tcgl-fx.mjs';
import { evalColor, evalMinMax } from './impact-curves.mjs';
import { DEG, add, cross, length, normalize, quatAxisAngle, quatEuler, quatLook, quatMul, quatRotate, scale, sub } from './impact-math.mjs';

export const RENDER = Object.freeze({ BILLBOARD: 0, STRETCH: 1, HORIZONTAL: 2, VERTICAL: 3, MESH: 4 });
export const ALIGN = Object.freeze({ VIEW: 0, WORLD: 1, LOCAL: 2, FACING: 3, VELOCITY: 4 });
const SORT_OLDEST_IN_FRONT = 2;
const SORT_YOUNGEST_IN_FRONT = 3;
// ParticleSystemVertexStream ids that ride in TEXCOORDs, and how many floats each takes.
const STREAM_POSITION = 0;
const STREAM_NORMAL = 1;
const STREAM_TANGENT = 2;
const STREAM_COLOR = 3;
const STREAM_UV = 4;
const STREAM_FLOATS = { [STREAM_UV]: 2, 31: 1, 32: 2, 33: 3, 34: 4 };
const QUAD_CORNERS = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5],
];
const QUAD_INDICES = [0, 2, 1, 2, 3, 1];
const UP = Object.freeze([0, 1, 0]);

/** sRGB → linear: the project renders in linear space, and a renderer converts its vertex colours. */
export const srgbToLinear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/**
 * The game's board camera for geometry: straight down from `height` above `target`.
 * `viewHeightAt(distance)` is how tall the view is that far from the camera.
 */
export function boardCamera({ target = [0, 0, 0], height = 183, fovDeg = 20 } = {}) {
  const span = 2 * Math.tan((fovDeg * DEG) / 2);
  return {
    position: [target[0], target[1] + height, target[2]],
    right: [1, 0, 0],
    up: [0, 0, 1],
    forward: [0, -1, 0],
    rotation: quatEuler(90 * DEG, 0, 0),
    viewHeightAt: (distance) => span * Math.max(0, distance),
    // Distance along the view; design 075's board camera is not always straight down.
    depthOf: (p) => target[1] + height - p[1],
  };
}

/** How the floats after the fixed streams fall into TEXCOORD0, 1, …: `[{size}]`, 4 floats each but the last. */
export function texcoordLayout(streams) {
  const floats = streams.reduce((sum, stream) => {
    if (stream === STREAM_POSITION || stream === STREAM_NORMAL || stream === STREAM_TANGENT || stream === STREAM_COLOR) return sum;
    if (!(stream in STREAM_FLOATS)) throw new Error(`unsupported vertex stream ${stream}`);
    return sum + STREAM_FLOATS[stream];
  }, 0);
  const layout = [];
  for (let left = floats; left > 0; left -= 4) layout.push({ size: Math.min(4, left) });
  return layout;
}

/** A sheet frame's rectangle: `[u0, v0, uScale, vScale]`; frames run left to right, top row first. */
export function frameRect(sheet, frame) {
  if (!sheet) return [0, 0, 1, 1];
  const column = frame % sheet.tx;
  const row = Math.floor(frame / sheet.tx);
  return [column / sheet.tx, (sheet.ty - 1 - row) / sheet.ty, 1 / sheet.tx, 1 / sheet.ty];
}

const ordered = (particles, sort) => {
  if (sort === SORT_OLDEST_IN_FRONT) return [...particles].sort((a, b) => a.age - b.age || a.id - b.id);
  if (sort === SORT_YOUNGEST_IN_FRONT) return [...particles].sort((a, b) => b.age - a.age || a.id - b.id);
  return particles;
};

/** The orientation a particle's quad or mesh is built in, before its own rotation. */
function baseRotation(system, particle, camera, align) {
  let base;
  if (align === ALIGN.WORLD) base = [0, 0, 0, 1];
  else if (align === ALIGN.LOCAL) base = system.rotation;
  else if (align === ALIGN.FACING) base = quatLook(sub(particle.pos, camera.position), camera.up);
  else if (align === ALIGN.VELOCITY) base = quatLook(normalize(particle.move, camera.forward), UP);
  else base = camera.rotation;
  return particle.align ? quatMul(base, particle.align) : base;
}

/**
 * A particle's own rotation in its alignment frame: Euler angles, or one angle about Z (the
 * axis a quad or a flat mesh faces along). Facing the camera, a positive angle turns it
 * clockwise on screen — the opposite of a Transform — so the Z angle is negated there.
 */
function particleRotation(particle, align) {
  const [x, y, z] = particle.rot;
  const roll = align === ALIGN.VIEW || align === ALIGN.FACING ? -z : z;
  return particle.threeAxis ? quatEuler(x, y, roll) : quatAxisAngle([0, 0, 1], roll);
}

/** Scale that keeps a billboard between the renderer's min / max share of the view height. */
function screenSizeScale(renderer, particle, camera) {
  const size = Math.max(Math.abs(particle.size[0]), Math.abs(particle.size[1]));
  if (!(size > 0)) return 1;
  const distance = Math.abs(camera.depthOf(particle.pos));
  const share = size / camera.viewHeightAt(distance);
  if (share > renderer.max) return renderer.max / share;
  if (share < renderer.min) return renderer.min / share;
  return 1;
}

function createWriter(vertexCount, indexCount, layout) {
  const geometry = {
    vertexCount,
    indexCount,
    position: new Float32Array(vertexCount * 3),
    normal: new Float32Array(vertexCount * 3),
    color: new Float32Array(vertexCount * 4),
    texcoords: layout.map((entry) => ({ size: entry.size, data: new Float32Array(vertexCount * entry.size) })),
    indices: vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount),
  };
  let vertex = 0;
  let index = 0;
  return {
    geometry,
    get vertex() {
      return vertex;
    },
    push(position, normal, color, floats) {
      geometry.position.set(position, vertex * 3);
      geometry.normal.set(normal, vertex * 3);
      geometry.color.set(color, vertex * 4);
      let at = 0;
      for (const texcoord of geometry.texcoords) {
        for (let component = 0; component < texcoord.size; component += 1) texcoord.data[vertex * texcoord.size + component] = floats[at + component] ?? 0;
        at += 4;
      }
      vertex += 1;
    },
    triangle(a, b, c) {
      geometry.indices[index] = a;
      geometry.indices[index + 1] = b;
      geometry.indices[index + 2] = c;
      index += 3;
    },
  };
}

const linearColor = (color) => [srgbToLinear(clamp01(color[0])), srgbToLinear(clamp01(color[1])), srgbToLinear(clamp01(color[2])), clamp01(color[3])];

/** The TEXCOORD floats of one vertex: the UV, then each further stream of the renderer. */
function streamFloats(streams, uv, particle) {
  const floats = [];
  const custom = particle.custom ?? [];
  for (const stream of streams) {
    if (stream === STREAM_UV) floats.push(uv[0], uv[1]);
    else if (stream >= 31 && stream <= 34) for (let component = 0; component <= stream - 31; component += 1) floats.push(custom[component] ?? 0);
  }
  return floats;
}

function writeQuad(writer, corners, normal, color, uvs, streams, particle) {
  const first = writer.vertex;
  corners.forEach((corner, index) => writer.push(corner, normal, color, streamFloats(streams, uvs[index], particle)));
  for (let index = 0; index < QUAD_INDICES.length; index += 3) {
    writer.triangle(first + QUAD_INDICES[index], first + QUAD_INDICES[index + 1], first + QUAD_INDICES[index + 2]);
  }
}

const quadUvs = (rect) => QUAD_CORNERS.map(([x, y]) => [rect[0] + (x + 0.5) * rect[2], rect[1] + (y + 0.5) * rect[3]]);

function billboard(writer, system, particle, camera, streams) {
  const { renderer, spec } = system;
  let rotation;
  if (renderer.mode === RENDER.HORIZONTAL) rotation = quatMul(quatEuler(90 * DEG, 0, 0), particleRotation(particle, ALIGN.VIEW));
  else if (renderer.mode === RENDER.VERTICAL) rotation = quatMul(quatLook([0, 0, -1], UP), particleRotation(particle, ALIGN.VIEW));
  else rotation = quatMul(baseRotation(system, particle, camera, renderer.align), particleRotation(particle, renderer.align));
  const fit = screenSizeScale(renderer, particle, camera);
  const width = particle.size[0] * fit;
  const height = particle.size[1] * fit;
  const corners = QUAD_CORNERS.map(([x, y]) => add(particle.pos, quatRotate(rotation, [(x + renderer.pivot[0]) * width, (y + renderer.pivot[1]) * height, renderer.pivot[2] * particle.size[2]])));
  writeQuad(writer, corners, quatRotate(rotation, [0, 0, -1]), linearColor(particle.color), quadUvs(frameRect(spec.uv, particle.frame)), streams, particle);
}

/**
 * A stretched billboard faces the camera with its texture's U axis along the particle's
 * motion: as wide as the particle, as long as its size times the length scale plus its speed
 * times the velocity scale, with its head at the particle.
 */
function stretched(writer, system, particle, camera, streams) {
  const { renderer, spec } = system;
  const view = normalize(sub(particle.pos, camera.position), camera.forward);
  const along = normalize(particle.move, normalize(quatRotate(system.rotation, [0, 0, 1])));
  const across = normalize(cross(view, along), camera.right);
  const speed = length(particle.move);
  const extent = particle.size[1] * renderer.len + speed * renderer.velScale;
  const width = particle.size[0];
  const centre = add(add(particle.pos, scale(along, (renderer.pivot[1] - 0.5) * extent)), scale(across, renderer.pivot[0] * width));
  const rect = frameRect(spec.uv, particle.frame);
  // Corner order follows QUAD_CORNERS with x along the motion (U) and y across it (V).
  const corners = QUAD_CORNERS.map(([x, y]) => add(centre, add(scale(along, x * extent), scale(across, y * width))));
  writeQuad(writer, corners, scale(view, -1), linearColor(particle.color), quadUvs(rect), streams, particle);
}

function meshParticle(writer, system, particle, camera, streams, mesh) {
  const { renderer, spec } = system;
  const rotation = quatMul(baseRotation(system, particle, camera, renderer.align), particleRotation(particle, renderer.align));
  const rect = frameRect(spec.uv, particle.frame);
  const tint = particle.color;
  const first = writer.vertex;
  const count = mesh.p.length / 3;
  for (let index = 0; index < count; index += 1) {
    const local = [
      (mesh.p[index * 3] + renderer.pivot[0]) * particle.size[0],
      (mesh.p[index * 3 + 1] + renderer.pivot[1]) * particle.size[1],
      (mesh.p[index * 3 + 2] + renderer.pivot[2]) * particle.size[2],
    ];
    const normal = mesh.n ? quatRotate(rotation, [mesh.n[index * 3], mesh.n[index * 3 + 1], mesh.n[index * 3 + 2]]) : [0, 0, 0];
    const paint = mesh.c ? [tint[0] * mesh.c[index * 4], tint[1] * mesh.c[index * 4 + 1], tint[2] * mesh.c[index * 4 + 2], tint[3] * mesh.c[index * 4 + 3]] : tint;
    const uv = mesh.uv0 ? [rect[0] + mesh.uv0[index * 4] * rect[2], rect[1] + mesh.uv0[index * 4 + 1] * rect[3]] : [0, 0];
    writer.push(add(particle.pos, quatRotate(rotation, local)), normal, linearColor(paint), streamFloats(streams, uv, particle));
  }
  for (let index = 0; index < mesh.i.length; index += 3) writer.triangle(first + mesh.i[index], first + mesh.i[index + 1], first + mesh.i[index + 2]);
}

/**
 * The vertices of one system's particles, or null when it has none to draw.
 * @param {object} system an `effect.systems[]` entry of impact-sim.mjs with a renderer
 * @param {object} camera `boardCamera()`
 * @param {object|null} mesh the renderer's mesh from meshes.json (mesh render mode)
 * @returns {{vertexCount:number, indexCount:number, position:Float32Array, normal:Float32Array, color:Float32Array,
 *   texcoords:{size:number, data:Float32Array}[], indices:Uint16Array|Uint32Array}|null}
 */
export function buildGeometry(system, camera, mesh = null) {
  const { renderer, particles } = system;
  if (!renderer || particles.length === 0) return null;
  const isMesh = renderer.mode === RENDER.MESH;
  if (isMesh && !mesh) return null;
  const perParticle = isMesh ? [mesh.p.length / 3, mesh.i.length] : [4, 6];
  const writer = createWriter(particles.length * perParticle[0], particles.length * perParticle[1], texcoordLayout(renderer.streams));
  for (const particle of ordered(particles, renderer.sort)) {
    if (isMesh) meshParticle(writer, system, particle, camera, renderer.streams, mesh);
    else if (renderer.mode === RENDER.STRETCH) stretched(writer, system, particle, camera, renderer.streams);
    else billboard(writer, system, particle, camera, renderer.streams);
  }
  return writer.geometry;
}

/**
 * The ribbons trailing a system's particles (Trails module, one ribbon per particle), facing
 * the camera: position, colour and a UV running 0 at the head to 1 at the tail. Null without
 * a ribbon of at least two points.
 */
export function buildTrailGeometry(system, camera) {
  const trail = system.spec.trail;
  if (!trail) return null;
  const ribbons = system.particles
    .map((particle) => ({ particle, points: [...(particle.trail ?? []).map((point) => point.pos), particle.pos].reverse() }))
    .filter((ribbon) => ribbon.points.length >= 2);
  if (ribbons.length === 0) return null;
  const vertexCount = ribbons.reduce((sum, ribbon) => sum + ribbon.points.length * 2, 0);
  const indexCount = ribbons.reduce((sum, ribbon) => sum + (ribbon.points.length - 1) * 6, 0);
  const writer = createWriter(vertexCount, indexCount, [{ size: 2 }]);
  for (const { particle, points } of ribbons) {
    const age01 = clamp01(particle.age / particle.life);
    const life = evalColor(trail.colorLife, age01, 0);
    const base = trail.inherit ? particle.color.map((channel, index) => channel * life[index]) : life;
    const first = writer.vertex;
    points.forEach((point, index) => {
      const along = index / (points.length - 1);
      const next = points[Math.min(points.length - 1, index + 1)];
      const previous = points[Math.max(0, index - 1)];
      const view = normalize(sub(point, camera.position), camera.forward);
      const side = normalize(cross(view, sub(previous, next)), camera.right);
      const half = (evalMinMax(trail.width, along, 0) * (trail.sizeWidth ? particle.size[0] : system.unit)) / 2;
      const over = evalColor(trail.colorTrail, along, 0);
      const color = linearColor(base.map((channel, channelIndex) => channel * over[channelIndex]));
      writer.push(add(point, scale(side, half)), scale(view, -1), color, [along, 0]);
      writer.push(sub(point, scale(side, half)), scale(view, -1), color, [along, 1]);
    });
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = first + index * 2;
      writer.triangle(a, a + 1, a + 2);
      writer.triangle(a + 1, a + 3, a + 2);
    }
  }
  return writer.geometry;
}
