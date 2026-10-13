// Pure geometry and uniform packing for the TCG Live coin stage (design 069, slice 3). DOM-free and
// three-free, so node tests cover it. The stage (coin-stage.js) turns these arrays into GPU buffers.
//
// The disc is spun on the CPU: 288 vertices are cheap to re-pose each frame, and the game's model
// matrix in the material data is identity, so the shaders' object space is world space.

/** Unity's coin_model.obj submesh names. The importer keeps them; slot 1 (front art) is `coin_model_1`. */
export const COIN_FRONT_SUBMESH = 'coin_model_1';
export const COIN_BACK_SUBMESH = 'coin_model_0';

/**
 * Rest pose in degrees about X. The front cap's normal is -Y in object space; this turns it to +Z,
 * toward the camera, so a coin at angle 0 shows heads (coinFlipAngle).
 */
export const COIN_REST_DEG = -90;

/** The stage camera: a 20° lens (the game's board camera, design 067). The disc fills `discFill` of the height at rest. */
export const COIN_CAMERA = Object.freeze({ fovDeg: 20, discFill: 0.7 });

/** How far the coin rises at the top of its arc, in object units (the disc radius is ~1.7). */
export const COIN_LIFT_UNITS = 0.6;

/**
 * The stage's one directional light: Unity's `_LightColor0` (linear colour × intensity) and
 * `_WorldSpaceLightPos0` (unit direction toward the light, w 0). It stays put while the coin
 * tumbles, so highlights and the foil's spectrum sweep across the face.
 */
export const COIN_LIGHT = Object.freeze({ color: [1, 1, 1], direction: normalizeVector([-0.4, 0.6, 0.7]) });

/**
 * Flat ambient, linear RGB: Unity's light-probe SH reduced to its constant band (`unity_SHAr/g/b.w`).
 * It keeps a face turned away from the light from going black mid-tumble.
 */
export const COIN_AMBIENT = Object.freeze([0.3, 0.3, 0.3]);

function normalizeVector([x, y, z]) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/** Column-major 4×4 product a·b (the GL convention the shader constant buffers use). */
export function multiplyMatrices(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** OpenGL perspective projection, column-major. */
export function perspectiveMatrix(fovYRadians, aspect, near, far) {
  const focal = 1 / Math.tan(fovYRadians / 2);
  const out = new Float32Array(16);
  out[0] = focal / aspect;
  out[5] = focal;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/** View matrix looking from `eye` at `centre`, column-major. */
export function lookAtMatrix(eye, centre, up) {
  const z = normalizeVector([eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]]);
  const x = normalizeVector([up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const out = new Float32Array(16);
  out.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0]);
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
  return out;
}

/** Camera distance that makes a disc of `radius` fill COIN_CAMERA.discFill of the view's height. */
export function cameraDistance(radius) {
  const halfHeight = radius / COIN_CAMERA.discFill;
  return halfHeight / Math.tan((COIN_CAMERA.fovDeg * Math.PI) / 360);
}

/**
 * The view-projection matrix for a stage of `width`×`height` pixels, looking straight at the coin
 * from +Z with the disc centred on the origin.
 *
 * @param {{ width: number, height: number, radius: number }} stage
 * @returns {Float32Array} 16 floats, column-major
 */
export function coinViewProjection({ width, height, radius }) {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const distance = cameraDistance(radius);
  const projection = perspectiveMatrix((COIN_CAMERA.fovDeg * Math.PI) / 180, aspect, 0.1, distance * 4);
  const view = lookAtMatrix([0, 0, distance], [0, 0, 0], [0, 1, 0]);
  return multiplyMatrices(projection, view);
}

/** Largest distance from the disc centre to a vertex: the stage's disc radius. */
export function discRadius(positions) {
  let radiusSquared = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const squared = positions[index] ** 2 + positions[index + 2] ** 2;
    if (squared > radiusSquared) radiusSquared = squared;
  }
  return Math.sqrt(radiusSquared);
}

/**
 * Per-vertex tangents for the bump-mapped shaders, from the disc's UVs. Each tangent is orthogonal to its
 * normal; `w` is the bitangent sign (bitangent = cross(normal, tangent) * w), which the shaders read.
 *
 * @param {{ p: number[], n: number[], uv: number[], i: number[] }} mesh flat arrays (coin-mesh.json)
 * @returns {Float32Array} 4 floats per vertex (xyz, w)
 */
export function coinTangents(mesh) {
  const vertexCount = mesh.p.length / 3;
  const tangent = new Float64Array(vertexCount * 3);
  const bitangent = new Float64Array(vertexCount * 3);
  for (let t = 0; t < mesh.i.length; t += 3) {
    const corners = [mesh.i[t], mesh.i[t + 1], mesh.i[t + 2]];
    const [a, b, c] = corners.map((vertex) => vertex * 3);
    const [ua, ub, uc] = corners.map((vertex) => vertex * 2);
    const edge1 = [mesh.p[b] - mesh.p[a], mesh.p[b + 1] - mesh.p[a + 1], mesh.p[b + 2] - mesh.p[a + 2]];
    const edge2 = [mesh.p[c] - mesh.p[a], mesh.p[c + 1] - mesh.p[a + 1], mesh.p[c + 2] - mesh.p[a + 2]];
    const du1 = mesh.uv[ub] - mesh.uv[ua];
    const dv1 = mesh.uv[ub + 1] - mesh.uv[ua + 1];
    const du2 = mesh.uv[uc] - mesh.uv[ua];
    const dv2 = mesh.uv[uc + 1] - mesh.uv[ua + 1];
    const determinant = du1 * dv2 - du2 * dv1;
    if (Math.abs(determinant) < 1e-12) continue;
    const inverse = 1 / determinant;
    const triangleTangent = edge1.map((value, axis) => (value * dv2 - edge2[axis] * dv1) * inverse);
    const triangleBitangent = edge1.map((value, axis) => (edge2[axis] * du1 - value * du2) * inverse);
    for (const vertex of corners) {
      for (let axis = 0; axis < 3; axis += 1) {
        tangent[vertex * 3 + axis] += triangleTangent[axis];
        bitangent[vertex * 3 + axis] += triangleBitangent[axis];
      }
    }
  }
  const out = new Float32Array(vertexCount * 4);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const normal = [mesh.n[vertex * 3], mesh.n[vertex * 3 + 1], mesh.n[vertex * 3 + 2]];
    const t = [tangent[vertex * 3], tangent[vertex * 3 + 1], tangent[vertex * 3 + 2]];
    const b = [bitangent[vertex * 3], bitangent[vertex * 3 + 1], bitangent[vertex * 3 + 2]];
    const along = normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2];
    const orthogonal = normalizeVector([t[0] - normal[0] * along, t[1] - normal[1] * along, t[2] - normal[2] * along]);
    const cross = [
      normal[1] * orthogonal[2] - normal[2] * orthogonal[1],
      normal[2] * orthogonal[0] - normal[0] * orthogonal[2],
      normal[0] * orthogonal[1] - normal[1] * orthogonal[0],
    ];
    const sign = cross[0] * b[0] + cross[1] * b[1] + cross[2] * b[2] < 0 ? -1 : 1;
    out.set([...orthogonal, sign], vertex * 4);
  }
  return out;
}

/**
 * The disc at `angleDeg` (coinFlipAngle, plus COIN_REST_DEG) lifted `lift` (0–1) of the arc. Returns
 * new arrays, so the stage can upload them each frame.
 *
 * @param {{ p: number[], n: number[] }} mesh
 * @param {Float32Array} tangents from coinTangents
 * @param {number} angleDeg
 * @param {number} lift
 */
export function posedCoin(mesh, tangents, angleDeg, lift) {
  const radians = ((angleDeg + COIN_REST_DEG) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rise = (Number.isFinite(lift) ? lift : 0) * COIN_LIFT_UNITS;
  const rotate = (x, y, z) => [x, y * cos - z * sin, y * sin + z * cos];
  const positions = new Float32Array(mesh.p.length);
  const normals = new Float32Array(mesh.n.length);
  const tangentsOut = new Float32Array(tangents.length);
  for (let vertex = 0; vertex < mesh.p.length / 3; vertex += 1) {
    const at = vertex * 3;
    const [px, py, pz] = rotate(mesh.p[at], mesh.p[at + 1], mesh.p[at + 2]);
    positions.set([px, py + rise, pz], at);
    normals.set(rotate(mesh.n[at], mesh.n[at + 1], mesh.n[at + 2]), at);
    const [tx, ty, tz] = rotate(tangents[vertex * 4], tangents[vertex * 4 + 1], tangents[vertex * 4 + 2]);
    tangentsOut.set([tx, ty, tz, tangents[vertex * 4 + 3]], vertex * 4);
  }
  return { positions, normals, tangents: tangentsOut };
}

/**
 * The constant-buffer arrays one material's shader reads: each `buffers.v` / `buffers.f` entry filled
 * from the material's own values, then the per-frame dynamic slots (view-projection, camera, time, light).
 *
 * @param {{ name: string, buffers: { v: object[], f: object[] } }} shader
 * @param {{ v: number[][], f: number[][] }} material
 * @param {{ viewProjection: Float32Array, cameraPosition: number[], timeSeconds: number }} frame
 * @returns {Record<string, Float32Array>} keyed by uniform name (vcb0, fcb1, …)
 */
export function shaderUniformBlocks(shader, material, frame) {
  const blocks = {};
  for (const [group, buffers] of [
    ['v', shader.buffers.v],
    ['f', shader.buffers.f],
  ]) {
    buffers.forEach((buffer, index) => {
      const values = Float32Array.from(material[group][index] ?? []);
      for (const slot of buffer.dynamic ?? []) writeDynamic(values, slot, frame, shader.name);
      blocks[buffer.uniform] = values;
    });
  }
  return blocks;
}

const AMBIENT_CHANNELS = Object.freeze({ ambientRed: 0, ambientGreen: 1, ambientBlue: 2 });

function writeDynamic(values, { at, kind }, frame, shaderName) {
  if (kind === 'viewProjection') values.set(frame.viewProjection, at);
  else if (kind === 'cameraPosition') values.set(frame.cameraPosition, at);
  else if (kind === 'time') {
    const seconds = frame.timeSeconds;
    values.set([seconds / 20, seconds, seconds * 2, seconds * 3], at);
  } else if (kind === 'lightColor') values.set([...COIN_LIGHT.color, 1], at);
  else if (kind === 'lightDirection') values.set([...COIN_LIGHT.direction, 0], at);
  else if (kind in AMBIENT_CHANNELS) values.set([0, 0, 0, COIN_AMBIENT[AMBIENT_CHANNELS[kind]]], at);
  else throw new Error(`coin shader ${shaderName} asks for the built-in "${kind}", which the coin stage does not fill`);
}

/**
 * A translated shader's GLSL ES 3.00 body. three.js writes its own `#version 300 es` line (glslVersion GLSL3)
 * ahead of its defines, so the importer's version line must go or the shader gets a second, misplaced directive.
 *
 * @param {string} source a shader from shaders.json
 * @returns {string} the source after its version line
 */
export function glslBody(source) {
  const versionLine = '#version 300 es\n';
  if (!source.startsWith(versionLine)) throw new Error('TCG Live coin shader does not start with "#version 300 es"');
  return source.slice(versionLine.length);
}
