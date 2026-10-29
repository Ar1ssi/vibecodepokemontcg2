// Design 077 § Kinds: the sprite element — instanced camera-facing quads textured from the TCG
// Live attack textures (flipbook frames, rotation, HDR tint, add or over, dissolve). The particle
// base: bursts, sparks, embers, smoke puffs and splashes all draw through it. One bucket (draw
// call) per texture × blend × channel, made on first use and kept for the session.
import { BILLBOARD_GLSL, DISSOLVE_GLSL, NOISE_GLSL, SHARED_UNIFORMS_GLSL, blendSettings } from './element-glsl.mjs';
import { SPRITE_CHANNELS, SPRITE_FLOATS, normalizeSprite, packSprite, spriteBucketKey } from './sprite.mjs';

export const SPRITE_CAPACITY = 512;

const VERTEX = `
${SHARED_UNIFORMS_GLSL}
uniform vec2 uGrid;
in vec4 iPosSize;   // x y z, width
in vec4 iShape;     // height, rotation, frame, dissolve
in vec4 iColour;
out vec2 vUv;
out vec2 vLocal;
out vec4 vColour;
out float vDissolve;
out float vSeed;
${BILLBOARD_GLSL}
void main() {
  vec2 size = vec2(iPosSize.w, iShape.x);
  float c = cos(iShape.y);
  float s = sin(iShape.y);
  vec2 corner = position.xy * size;
  corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  gl_Position = elBillboard(iPosSize.xyz, corner, 0.5 * max(size.x, size.y));
  float frames = max(uGrid.x * uGrid.y, 1.0);
  float frame = mod(floor(iShape.z), frames);
  float col = mod(frame, uGrid.x);
  float row = floor(frame / uGrid.x);
  vec2 uv = position.xy + 0.5;
  // Flipbooks run left to right, top to bottom; the textures are flipped, so v = 1 is the top row.
  vUv = vec2((col + uv.x) / uGrid.x, 1.0 - (row + 1.0 - uv.y) / uGrid.y);
  vLocal = position.xy;
  vColour = iColour;
  vDissolve = iShape.w;
  vSeed = iPosSize.x * 0.013 + iPosSize.y * 0.007;
}
`;

const FRAGMENT = `
${SHARED_UNIFORMS_GLSL}
uniform sampler2D uMap;
uniform float uHasTex;
uniform int uChannel;   // 0 r, 1 a, 2 rgba
in vec2 vUv;
in vec2 vLocal;
in vec4 vColour;
in float vDissolve;
in float vSeed;
out vec4 fragColor;
${NOISE_GLSL}
${DISSOLVE_GLSL}
void main() {
  vec3 tint = vColour.rgb;
  float mask;
  if (uHasTex > 0.5) {
    vec4 tex = texture(uMap, vUv);
    if (uChannel == 0) mask = tex.r;
    else if (uChannel == 1) mask = tex.a;
    else {
      mask = tex.a;
      tint *= tex.rgb;
    }
  } else {
    // Not loaded yet (or failed): a soft round dot so the particle still reads.
    mask = smoothstep(0.5, 0.0, length(vLocal));
  }
  float edge;
  float alpha = mask * vColour.a * elDissolve(vLocal * 2.0, vDissolve, vSeed, edge);
  if (alpha <= 0.002) discard;
  vec3 rgb = tint * (1.0 + 1.5 * edge);
  fragColor = vec4(rgb * alpha, alpha);
}
`;

const QUAD = Object.freeze({
  positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
  index: [0, 1, 2, 0, 2, 3],
});

/**
 * @param {{ three: typeof import('three'), textures: ReturnType<typeof import('./element-textures.js').createElementTextures>,
 *   uniforms: object, layer: number, debug?: (...args: unknown[]) => void }} options `uniforms` are
 *   the layer's shared ones (same objects, so one update reaches every bucket); `layer` the three
 *   Layers channel every mesh draws on (layers are not inherited from the group).
 */
export function defineSprite({ three, textures, uniforms, layer, debug = (...args) => console.debug(...args) }) {
  const object3d = new three.Group();
  object3d.name = 'element-sprite';
  const buckets = new Map();
  let capWarned = false;
  let renderOrder = 20;

  const makeBucket = (key, sprite) => {
    const data = new Float32Array(SPRITE_CAPACITY * SPRITE_FLOATS);
    const buffer = new three.InstancedInterleavedBuffer(data, SPRITE_FLOATS);
    buffer.setUsage(three.DynamicDrawUsage);
    const geometry = new three.InstancedBufferGeometry();
    geometry.setAttribute('position', new three.Float32BufferAttribute(QUAD.positions, 3));
    geometry.setIndex(QUAD.index);
    geometry.setAttribute('iPosSize', new three.InterleavedBufferAttribute(buffer, 4, 0));
    geometry.setAttribute('iShape', new three.InterleavedBufferAttribute(buffer, 4, 4));
    geometry.setAttribute('iColour', new three.InterleavedBufferAttribute(buffer, 4, 8));
    geometry.instanceCount = 0;
    const material = new three.ShaderMaterial({
      glslVersion: three.GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        ...uniforms,
        uGrid: { value: new three.Vector2(1, 1) },
        uMap: { value: null },
        uHasTex: { value: 0 },
        uChannel: { value: SPRITE_CHANNELS.indexOf(sprite.channel) },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      ...blendSettings(three, sprite.blend),
    });
    const mesh = new three.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    renderOrder = Math.min(renderOrder + 1, 29);
    mesh.layers.set(layer);
    object3d.add(mesh);
    return { texture: sprite.texture, data, buffer, geometry, material, mesh, count: 0 };
  };

  const write = (bucket, sprite) => {
    packSprite(sprite, bucket.data, bucket.count);
    bucket.count += 1;
  };

  return {
    kind: 'sprite',
    object3d,
    needsBoard: () => false,
    begin() {
      for (const bucket of buckets.values()) bucket.count = 0;
    },
    /** @returns {boolean} false when the params cannot draw or the bucket is full */
    push(params) {
      const sprite = normalizeSprite(params);
      if (!sprite) return false;
      const key = spriteBucketKey(sprite);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = makeBucket(key, sprite);
        buckets.set(key, bucket);
      }
      if (bucket.count >= SPRITE_CAPACITY) {
        if (!capWarned) {
          capWarned = true;
          debug('elements: sprite capacity reached, sprites dropped', key);
        }
        return false;
      }
      write(bucket, sprite);
      return true;
    },
    finish() {
      for (const bucket of buckets.values()) {
        const entry = textures.get(bucket.texture);
        bucket.material.uniforms.uHasTex.value = entry.ready ? 1 : 0;
        bucket.material.uniforms.uMap.value = entry.texture;
        bucket.material.uniforms.uGrid.value.set(entry.grid.cols, entry.grid.rows);
        bucket.geometry.instanceCount = bucket.count;
        bucket.mesh.visible = bucket.count > 0;
        if (bucket.count > 0) {
          bucket.buffer.addUpdateRange(0, bucket.count * SPRITE_FLOATS);
          bucket.buffer.needsUpdate = true;
        }
      }
    },
    /** How many sprites are queued this frame, per bucket key (tests and fx-preview read it). */
    counts: () => Object.fromEntries([...buckets].map(([key, bucket]) => [key, bucket.count])),
    dispose() {
      for (const bucket of buckets.values()) {
        bucket.geometry.dispose();
        bucket.material.dispose();
      }
      buckets.clear();
    },
  };
}
