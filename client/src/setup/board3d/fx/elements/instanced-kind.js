// Design 079: the plumbing every instanced element kind shares — one quad (or strip) geometry,
// an interleaved instance buffer of `floats` per instance read as vec4 attributes, one
// ShaderMaterial on the layer's shared uniforms plus named TCG Live textures, a capacity with a
// one-line warning, and begin / push / finish / dispose. A kind supplies its GLSL, its pure
// `normalize(params)` → row | null and `pack(row, out, index)`.
import { blendSettings } from './element-glsl.mjs';

/** A unit quad, corners (−.5, −.5) … (.5, .5), two triangles. */
export const QUAD = Object.freeze({
  positions: Object.freeze([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
  index: Object.freeze([0, 1, 2, 0, 2, 3]),
});

/**
 * @param {{ three: typeof import('three'), textures: { get: (name: string) => { texture: object|null, ready: boolean } },
 *   uniforms: object, layer: number, debug?: (...args: unknown[]) => void, kind: string, floats: number,
 *   attributes: string[], capacity: number, vertexShader: string, fragmentShader: string,
 *   blend?: 'add'|'over', renderOrder?: number, maps?: Record<string, string>, needsBoard?: boolean,
 *   depthWrite?: boolean, geometry?: { positions: number[], index?: number[] },
 *   normalize: (params: object) => object|null,
 *   pack: (row: object, out: Float32Array, index: number) => void }} options
 *   `attributes` names the vec4 attributes in row order (floats = 4 × attributes.length);
 *   `maps` binds uniform names to texture file names — each gets `<name>Ready` (0 / 1) beside it;
 *   `depthWrite` for solid geometry (debris) that must hide its own far side; `geometry` without
 *   an index draws its positions as plain triangles.
 */
export function defineInstancedKind({
  three,
  textures,
  uniforms,
  layer,
  debug = (...args) => console.debug(...args),
  kind,
  floats,
  attributes,
  capacity,
  vertexShader,
  fragmentShader,
  blend = 'add',
  renderOrder = 30,
  maps = {},
  needsBoard = false,
  depthWrite = false,
  geometry: shape = QUAD,
  normalize,
  pack,
}) {
  if (floats !== attributes.length * 4) throw new Error(`${kind}: floats must be 4 × attributes`);
  const data = new Float32Array(capacity * floats);
  const buffer = new three.InstancedInterleavedBuffer(data, floats);
  buffer.setUsage(three.DynamicDrawUsage);
  const geometry = new three.InstancedBufferGeometry();
  geometry.setAttribute('position', new three.Float32BufferAttribute([...shape.positions], 3));
  if (shape.index) geometry.setIndex([...shape.index]);
  attributes.forEach((name, i) => geometry.setAttribute(name, new three.InterleavedBufferAttribute(buffer, 4, i * 4)));
  geometry.instanceCount = 0;

  const own = {};
  for (const name of Object.keys(maps)) {
    own[name] = { value: null };
    own[`${name}Ready`] = { value: 0 };
  }
  const material = new three.ShaderMaterial({
    glslVersion: three.GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: { ...uniforms, ...own },
    transparent: true,
    depthTest: true,
    depthWrite,
    // A ribbon's winding follows its direction on screen; neither face may be culled.
    side: three.DoubleSide,
    ...blendSettings(three, blend),
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.name = `element-${kind}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.layers.set(layer);
  mesh.visible = false;

  let count = 0;
  let capWarned = false;

  return {
    kind,
    object3d: mesh,
    needsBoard: () => needsBoard && count > 0,
    begin() {
      count = 0;
    },
    push(params) {
      const row = normalize(params);
      if (!row) return false;
      if (count >= capacity) {
        if (!capWarned) {
          capWarned = true;
          debug(`elements: ${kind} capacity reached, instances dropped`);
        }
        return false;
      }
      pack(row, data, count);
      count += 1;
      return true;
    },
    finish() {
      for (const [name, file] of Object.entries(maps)) {
        const entry = textures.get(file);
        material.uniforms[name].value = entry.texture;
        material.uniforms[`${name}Ready`].value = entry.ready ? 1 : 0;
      }
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      if (count > 0) {
        buffer.addUpdateRange(0, count * floats);
        buffer.needsUpdate = true;
      }
    },
    counts: () => count,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
