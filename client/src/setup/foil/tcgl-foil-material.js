// TCG Live card holofoil material (design 069): port of the WebApp's foil.js `createFoilMaterial` and
// `foilGeometry`. The game's own TPCi/Cards3D shaders (DX11 → GLSL ES 3.00, shaders.json) run with their
// constant buffers filled the way Unity fills them: $Globals from the MAT_Cards3D_* material, UnityPerCamera /
// UnityPerDraw / UnityPerFrame from the mesh and camera. Card textures (front, etch, white plate, cold foil)
// come from this card's record; spectrum / shine / glitter textures from the material.
// Loaded only through import() by tcgl-foil-view.js, so three never reaches node tests.
import * as THREE from 'three';
import { DEFAULT_FOIL_UV, FOIL_ASSET_ROOT, materialTextureUrl, recordTextureUrl } from './tcgl-foil-manifest.mjs';
import { foilTextureBase } from './tcgl-foil-store.js';

let foilData = null;
let foilDataPromise = null;

/** shaders.json + materials.json, fetched once. Rejects when either is missing or malformed. */
export function loadFoilData() {
  if (foilDataPromise) return foilDataPromise;
  const get = (file) =>
    fetch(`${FOIL_ASSET_ROOT}/${file}`).then((response) => {
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      return response.json();
    });
  foilDataPromise = Promise.all([get('shaders.json'), get('materials.json')]).then(([shaders, materials]) => {
    if (!shaders?.shaders || !materials?.materials) throw new Error('foil shaders/materials malformed');
    foilData = {
      linear: !!shaders.linear,
      shaders: shaders.shaders,
      materials: materials.materials,
      textures: materials.textures ?? {},
    };
    return foilData;
  });
  foilDataPromise.catch(() => {
    foilDataPromise = null;
  });
  return foilDataPromise;
}

// ── textures: one GPU texture per URL + colour space, shared by every view; card textures are released
// when the last view using them goes away, material textures stay for the session.
const WRAP = {
  repeat: THREE.RepeatWrapping,
  clamp: THREE.ClampToEdgeWrapping,
  mirror: THREE.MirroredRepeatWrapping,
  mirror_once: THREE.MirroredRepeatWrapping,
};
const loader = new THREE.TextureLoader();
const textureCache = new Map();

// `single`: sampled like the client's card textures — one mip level, bilinear, no anisotropy (the shaders
// supersample the front themselves with four taps); every other texture keeps mipmaps and anisotropy.
function acquireTexture(url, meta = {}, { pinned = false, single = false } = {}) {
  // The client renders in linear colour space: sRGB-flagged textures are linearized by the GPU when sampled.
  const srgb = foilData?.linear && meta.srgb !== false;
  const key = `${url}|${meta.wrapU ?? ''}${meta.wrapV ?? ''}|${srgb ? 's' : 'l'}${single ? '|1' : ''}`;
  let entry = textureCache.get(key);
  if (!entry) {
    let resolve;
    let reject;
    const ready = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const texture = loader.load(url, () => resolve(), undefined, () => reject(new Error(`texture ${url} failed`)));
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = WRAP[meta.wrapU] ?? THREE.RepeatWrapping;
    texture.wrapT = WRAP[meta.wrapV] ?? THREE.RepeatWrapping;
    if (meta.filter === 'point') {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
    } else if (single) {
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 1;
    } else {
      texture.anisotropy = 16;
    }
    entry = { key, texture, ready, refs: 0, pinned };
    ready.catch(() => {});
    textureCache.set(key, entry);
  }
  entry.refs += 1;
  return entry;
}

function releaseTexture(entry) {
  entry.refs -= 1;
  if (entry.refs > 0 || entry.pinned) return;
  textureCache.delete(entry.key);
  entry.texture.dispose();
}

const plainTexture = (r, g, b) => {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
};
const PLAIN = {
  white: plainTexture(255, 255, 255),
  gray: plainTexture(128, 128, 128),
  black: plainTexture(0, 0, 0),
  bump: plainTexture(128, 128, 255),
};

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// ── material
/**
 * RawShaderMaterial for one card record (tcgl-foil-manifest FoilRecord). Throws when the shader is unknown.
 * `material.ready` resolves when every card and material texture has loaded and rejects on the first failure.
 * `material.update(mesh, camera, timeSec, {rasterVP})` writes the per-frame Unity builtins; `rasterVP` (a
 * column-major 4×4) replaces unity_MatrixVP so a tilted mesh still rasterizes face-on.
 * `material.release()` disposes the material and drops its texture references.
 */
export function createFoilMaterial(record) {
  const sh = foilData?.shaders[record.shader];
  if (!sh) throw new Error(`foil shader ${record.shader} not loaded`);
  const mat =
    foilData.materials[record.material] ??
    Object.values(foilData.materials).find((m) => m.shader === record.shader) ?? { tex: {}, floats: {}, colors: {} };

  // property values: shader defaults <- material <- the client's per-renderer overrides
  const vals = {};
  for (const [name, prop] of Object.entries(sh.props)) {
    vals[name] = prop.type === 'vec' ? prop.default.slice() : prop.type === 'float' ? prop.default : null;
  }
  Object.assign(vals, mat.floats ?? {}, mat.colors ?? {});
  // linear colour space: Unity hands Color properties (not Vectors) to the shader converted from sRGB
  if (foilData.linear) {
    for (const [name, prop] of Object.entries(sh.props)) {
      const v = vals[name];
      if (prop.color && Array.isArray(v)) vals[name] = [toLinear(v[0]), toLinear(v[1]), toLinear(v[2]), v[3]];
    }
  }
  // CardMaterialProperties.Default as the client's big-card / inspector views set it: front light, no edge shading
  Object.assign(vals, {
    _OverallBrightness: 1,
    _FoilOnSmoothness: 0,
    _Smoothness: 0,
    _Glossiness: 0,
    _Metallic: 0.8,
    _NonFoilsheen: 0,
    _ShadowDarknessLimit: 0.7,
    _UseCCFoil: record.cc ? 1 : 0,
    _LightDirection: [0, 0, -1, 0],
    _CardLighting_On: 0,
  });
  // Unity world space is left-handed (cards face -Z); three's is right-handed: mirror the light's z
  const light = vals._LightDirection;
  vals._LightDirection = [light[0], light[1], -light[2], light[3] ?? 0];

  const held = [];
  const hold = (entry) => {
    held.push(entry);
    return entry.texture;
  };
  const cardTexture = (texName, fallback) => {
    const url = recordTextureUrl(record, texName, foilTextureBase());
    return url ? hold(acquireTexture(url, {}, { single: true })) : fallback;
  };
  const materialTexture = (name) => {
    const meta = foilData.textures[name];
    const url = materialTextureUrl(meta?.url, foilTextureBase());
    return url ? hold(acquireTexture(url, meta, { pinned: true })) : null;
  };
  const textureFor = (prop) => {
    if (prop === '_CardColorDiffuse') return cardTexture(record.front, PLAIN.gray);
    if (prop === '_CardEtch') return cardTexture(record.etch, PLAIN.white);
    if (prop === '_CardWhitePlateMask') return cardTexture(record.wp, PLAIN.white);
    if (prop === '_CardColdFoilMask') return cardTexture(record.cf, PLAIN.white);
    // cast-and-cure pattern named by the card manifest (`_cc`), from the shaders bundle
    if (prop === '_CCPatternTex' && record.cc) {
      const cc = materialTexture(record.cc);
      if (cc) return cc;
    }
    const bound = mat.tex?.[prop]?.name;
    const fromMaterial = bound ? materialTexture(bound) : null;
    if (fromMaterial) return fromMaterial;
    const def = sh.props[prop]?.default;
    return def === 'black' ? PLAIN.black : def === 'gray' ? PLAIN.gray : def === 'bump' ? PLAIN.bump : PLAIN.white;
  };
  const scaleOffset = (prop) => {
    const t = mat.tex?.[prop];
    return t ? [t.scale[0], t.scale[1], t.offset[0], t.offset[1]] : [1, 1, 0, 0];
  };

  // constant buffers
  const uniforms = {};
  const buffers = [];
  for (const [stage, cbs] of [
    ['v', sh.vsCB],
    ['f', sh.fsCB],
  ]) {
    const src = stage === 'v' ? sh.vs : sh.fs;
    for (const [slot, cb] of Object.entries(cbs)) {
      const declared = new RegExp(`uniform vec4 ${stage}cb${slot}\\[(\\d+)\\]`).exec(src);
      const length = declared ? Number(declared[1]) : Math.ceil(cb.size / 16);
      const arr = Array.from({ length }, () => new THREE.Vector4());
      uniforms[`${stage}cb${slot}`] = { value: arr };
      buffers.push({ arr, cb });
    }
    // builtin buffers a variant does not list: name them from how the program reads them (object matrix times
    // the position = UnityPerDraw, view-projection rows 17..20 = UnityPerFrame, else UnityPerCamera)
    for (const match of src.matchAll(new RegExp(`uniform vec4 (${stage}cb\\d+)\\[(\\d+)\\]`, 'g'))) {
      const [, name, size] = match;
      if (uniforms[name]) continue;
      const arr = Array.from({ length: Number(size) }, () => new THREE.Vector4());
      uniforms[name] = { value: arr };
      const buffer =
        new RegExp(`${name}\\[(17|18|19|20)\\]`).test(src) && Number(size) >= 21
          ? 'UnityPerFrame'
          : new RegExp(`${name}\\[0\\]\\.xyzw \\* v0\\.xxxx|${name}\\[3\\]\\.xyz \\* v0\\.www`).test(src)
            ? 'UnityPerDraw'
            : 'UnityPerCamera';
      buffers.push({ arr, cb: { buffer, params: [] } });
    }
  }
  const put = (arr, offset, values) => {
    for (let i = 0; i < values.length; i += 1) {
      const o = offset / 4 + i;
      const v = arr[o >> 2];
      if (v) v.setComponent(o & 3, values[i]);
    }
  };
  for (const { arr, cb } of buffers) {
    if (cb.buffer !== '$Globals') continue;
    for (const p of cb.params) {
      const v = p.name.endsWith('_ST') ? scaleOffset(p.name.slice(0, -3)) : vals[p.name];
      if (v == null) continue;
      put(arr, p.offset, Array.isArray(v) ? v.slice(0, p.dim) : [v]);
    }
  }
  for (const [slot, name] of Object.entries(sh.fsTex)) uniforms[`t${slot}`] = { value: textureFor(name) };

  const strip = (src) => src.replace(/^#version 300 es\s*/, '');
  const material = new THREE.RawShaderMaterial({
    vertexShader: strip(sh.vs),
    fragmentShader: strip(sh.fs),
    uniforms,
    glslVersion: THREE.GLSL3,
    side: THREE.FrontSide,
    depthWrite: true,
    transparent: false,
  });
  material.ready = Promise.all(held.map((entry) => entry.ready));
  material.ready.catch(() => {});

  const vp = new THREE.Matrix4();
  const rasterMatrix = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  const camPos = new THREE.Vector3();
  material.update = (mesh, camera, timeSec, { rasterVP } = {}) => {
    const t = timeSec;
    mesh.updateMatrixWorld();
    camera.updateMatrixWorld();
    vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (rasterVP) rasterMatrix.fromArray(rasterVP);
    else rasterMatrix.copy(vp);
    inv.copy(mesh.matrixWorld).invert();
    camera.getWorldPosition(camPos);
    const time = [t / 20, t, t * 2, t * 3];
    const sinTime = [Math.sin(t / 8), Math.sin(t / 4), Math.sin(t / 2), Math.sin(t)];
    const cosTime = [Math.cos(t / 8), Math.cos(t / 4), Math.cos(t / 2), Math.cos(t)];
    // Unity builtin buffers have a fixed layout; variants list only the members they use, so write them all
    for (const { arr, cb } of buffers) {
      if (cb.buffer === 'UnityPerCamera') {
        put(arr, 0, time);
        put(arr, 16, sinTime);
        put(arr, 32, cosTime);
        put(arr, 48, [1 / 60, 60, 1 / 60, 60]);
        put(arr, 64, [camPos.x, camPos.y, camPos.z, 0]);
        put(arr, 80, [1, camera.near, camera.far, 1 / camera.far]);
        put(arr, 128, [0, 0, 0, 0]);
      } else if (cb.buffer === 'UnityPerDraw') {
        put(arr, 0, mesh.matrixWorld.elements);
        put(arr, 64, inv.elements);
        put(arr, 128, [1, 1, 0, 0]);
        put(arr, 144, [0, 0, 0, 1]);
      } else if (cb.buffer === 'UnityPerFrame') {
        // unity_MatrixP 80, unity_MatrixV 144, unity_MatrixInvV 208, unity_MatrixVP 272
        put(arr, 80, camera.projectionMatrix.elements);
        put(arr, 144, camera.matrixWorldInverse.elements);
        put(arr, 208, camera.matrixWorld.elements);
        put(arr, 272, rasterMatrix.elements);
      }
    }
    for (const { arr, cb } of buffers) {
      for (const p of cb.params) {
        switch (p.name) {
          case '_Time':
            put(arr, p.offset, time);
            break;
          case '_SinTime':
            put(arr, p.offset, sinTime);
            break;
          case '_CosTime':
            put(arr, p.offset, cosTime);
            break;
          case '_WorldSpaceCameraPos':
            put(arr, p.offset, [camPos.x, camPos.y, camPos.z]);
            break;
          case 'unity_ObjectToWorld':
            put(arr, p.offset, mesh.matrixWorld.elements);
            break;
          case 'unity_WorldToObject':
            put(arr, p.offset, inv.elements);
            break;
          case 'unity_MatrixVP':
            put(arr, p.offset, rasterMatrix.elements);
            break;
          case 'unity_MatrixV':
            put(arr, p.offset, camera.matrixWorldInverse.elements);
            break;
          case 'unity_MatrixInvV':
            put(arr, p.offset, camera.matrixWorld.elements);
            break;
          case 'unity_MatrixP':
            put(arr, p.offset, camera.projectionMatrix.elements);
            break;
          case 'unity_OrthoParams':
            put(arr, p.offset, [1, 1, 0, 0]);
            break;
          case 'unity_WorldTransformParams':
            put(arr, p.offset, [0, 0, 0, 1]);
            break;
          default:
            break;
        }
      }
    }
  };
  material.release = () => {
    material.dispose();
    for (const entry of held.splice(0)) releaseTexture(entry);
  };
  return material;
}

/**
 * Card face with rounded corners (63 × 88 mm card, 3 mm radius) mapped into the card's UV window of the square
 * front texture, with +x tangents like the client's card mesh.
 */
export function foilGeometry(w, h, uvWindow = DEFAULT_FOIL_UV, radius = w * 0.048, segments = 6) {
  const shape = new THREE.Shape();
  const x0 = -w / 2;
  const y0 = -h / 2;
  const r = radius;
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x0 + w - r, y0);
  shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  shape.lineTo(x0 + w, y0 + h - r);
  shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  shape.lineTo(x0 + r, y0 + h);
  shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  const geometry = new THREE.ShapeGeometry(shape, segments);
  const pos = geometry.attributes.position;
  const { u0, u1, v0, v1 } = uvWindow;
  const uv = new Float32Array(pos.count * 2);
  const normal = new Float32Array(pos.count * 3);
  const tangent = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i += 1) {
    uv[i * 2] = u0 + ((pos.getX(i) - x0) / w) * (u1 - u0);
    uv[i * 2 + 1] = v0 + ((pos.getY(i) - y0) / h) * (v1 - v0);
    normal.set([0, 0, 1], i * 3);
    tangent.set([1, 0, 0, 1], i * 4);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('tangent', new THREE.BufferAttribute(tangent, 4));
  return geometry;
}
