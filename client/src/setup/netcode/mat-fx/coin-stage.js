// The TCG Live coin stage (design 069, slice 3): the coin's disc drawn with the game's own coin shaders
// (translated at slice 1, bound by tcgl-coin-catalog.mjs) on a transparent three.js canvas. Lazy-loaded
// from coin-flip-ceremony.js, the only importer of three in this path. Pure math lives in
// coin-stage-math.mjs; this file only owns GPU objects and fetches.
//
// Colour follows the game's linear pipeline: sRGB textures decode on sample and the fragment shader
// encodes its output, so the canvas gets display values (as the attack-impact stage does, design 068).
import * as THREE from 'three';
import { tcglCoin } from './tcgl-coin-catalog.mjs';
import {
  COIN_BACK_SUBMESH,
  COIN_FRONT_SUBMESH,
  cameraDistance,
  coinTangents,
  coinViewProjection,
  discRadius,
  glslBody,
  posedCoin,
  shaderUniformBlocks,
} from './coin-stage-math.mjs';

const ASSET_DIR = '/src/assets/coins/tcgl/';
/** Stands in for a real-world scan's front (its material, art swapped), and supplies the back when a coin has none. */
const DEFAULT_COIN_ID = 'cn_tcgl-default_energy-colorless_mtl';
const WRAPS = [THREE.RepeatWrapping, THREE.ClampToEdgeWrapping, THREE.MirroredRepeatWrapping, THREE.ClampToEdgeWrapping];
// Unity's default textures by name (the importer's `#name` sources), as RGBA bytes.
const DEFAULT_TEXELS = { '#white': [255, 255, 255, 255], '#black': [0, 0, 0, 0], '#gray': [128, 128, 128, 128], '#bump': [128, 128, 255, 128], '#red': [255, 0, 0, 0] };
const SRGB_DEFAULTS = new Set(['#gray']);
const ENCODE_SRGB = `vec3 coinEncodeSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;
const SHADER_OUTPUT = '  fragColor = o0;';

const fetchJson = async (name) => {
  const response = await fetch(`${ASSET_DIR}${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
};

let assetsPromise = null;
/** The import's JSON plus the disc's tangents and radius, loaded once; a failed load is retried next time. */
const loadAssets = () => {
  assetsPromise ??= Promise.all([fetchJson('coins.json'), fetchJson('shaders.json'), fetchJson('textures.json'), fetchJson('coin-mesh.json')])
    .then(([coinFile, shaders, textures, mesh]) => ({
      coins: coinFile.coins,
      materials: coinFile.materials,
      shaders,
      textures,
      mesh,
      tangents: coinTangents(mesh),
      radius: discRadius(mesh.p),
    }))
    .catch((error) => {
      assetsPromise = null;
      throw error;
    });
  return assetsPromise;
};

const textureLoader = new THREE.TextureLoader();
const cubeLoader = new THREE.CubeTextureLoader();
/** Decoded textures by textures.json name or scan URL, shared by every ceremony. A failed load is retried next time. */
const imageCache = new Map();

const cached = (key, load) => {
  if (!imageCache.has(key)) {
    imageCache.set(
      key,
      load().catch((error) => {
        imageCache.delete(key);
        throw error;
      })
    );
  }
  return imageCache.get(key);
};

const builtinTexture = (name) => {
  if (name === '#grab') throw new Error('TCG Live coin shaders read the grab pass; the coin stage has no grab pass');
  const texture = new THREE.DataTexture(new Uint8Array(DEFAULT_TEXELS[name]), 1, 1);
  if (SRGB_DEFAULTS.has(name)) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

/**
 * The stand-in for a sampler3D. The importer bound a 2D texture to the Surface shaders' sampler3D, but
 * the branch that reads it is never taken (fcb3[0].x is 0 on every Surface material).
 */
const unusedSampler3D = () => {
  const texture = new THREE.Data3DTexture(new Uint8Array([128, 128, 128, 128]), 1, 1, 1);
  texture.needsUpdate = true;
  return texture;
};

const applySampling = (texture, entry) => {
  texture.wrapS = WRAPS[entry.wrapU] ?? THREE.RepeatWrapping;
  texture.wrapT = WRAPS[entry.wrapV] ?? THREE.RepeatWrapping;
  if (entry.filter === 0) {
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
  }
  texture.colorSpace = entry.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
};

/** A sampler's texture: a built-in, an imported 2D or cube map, or a real-world scan (`{ url }`). */
async function loadSource(assets, sampler) {
  const { source, type } = sampler;
  if (source.builtin) {
    if (type === 'samplerCube') throw new Error(`TCG Live coin sampler ${sampler.uniform} is a cube map bound to the 2D default #${source.builtin}`);
    return builtinTexture(`#${source.builtin}`);
  }
  if (source.url) {
    return cached(source.url, async () => {
      const texture = await textureLoader.loadAsync(source.url);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    });
  }
  const entry = assets.textures[source.name];
  if (type === 'samplerCube' && !entry.cube) throw new Error(`TCG Live coin texture "${source.name}" is not a cube map`);
  if (type !== 'samplerCube' && entry.cube) throw new Error(`TCG Live coin texture "${source.name}" is a cube map, sampled as ${type}`);
  return cached(source.name, async () => {
    if (entry.cube) {
      const cube = await cubeLoader.loadAsync(entry.faces.map((face) => `${ASSET_DIR}textures/${encodeURIComponent(face)}`));
      cube.colorSpace = entry.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return cube;
    }
    return applySampling(await textureLoader.loadAsync(`${ASSET_DIR}textures/${encodeURIComponent(entry.file)}`), entry);
  });
}

/** The fragment source with its output encoded to sRGB. Refuses a shader whose output line the importer changed. */
const encodedFragmentSource = (source) => {
  if (!source.includes(SHADER_OUTPUT) || !source.includes('void main() {')) {
    throw new Error('TCG Live coin fragment shader does not end in the expected output line');
  }
  return source.replace('void main() {', `${ENCODE_SRGB}void main() {`).replace(SHADER_OUTPUT, '  fragColor = vec4(coinEncodeSRGB(o0.rgb), o0.a);');
};

async function buildMaterial(assets, spec) {
  const { shader } = spec;
  const uniforms = {};
  for (const block of [...shader.buffers.v, ...shader.buffers.f]) uniforms[block.uniform] = { value: null };
  const samplers = await Promise.all(
    spec.textures.map((sampler) => (sampler.type === 'sampler3D' ? unusedSampler3D() : loadSource(assets, sampler)))
  );
  spec.textures.forEach((sampler, index) => {
    uniforms[sampler.uniform] = { value: samplers[index] };
  });
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: glslBody(shader.vs),
    fragmentShader: encodedFragmentSource(glslBody(shader.fs)),
    uniforms,
    side: THREE.FrontSide,
  });
  return { material, spec };
}

/**
 * A coin's back then front materials, as `{ front, back }` material specs (tcglMaterial output). A TCG Live
 * coin uses its own; a real-world coin (id not in coins.json) gets the default coin's material with its
 * art swapped for the scan at `coin.artUrl`.
 */
function resolveCoin(assets, coin) {
  const defaults = tcglCoin(assets, DEFAULT_COIN_ID);
  const back = defaults.back;
  if (!coin) return { front: defaults.front, back };
  if (Object.hasOwn(assets.coins, coin.id)) {
    const own = tcglCoin(assets, coin.id);
    return { front: own.front, back: own.back ?? back };
  }
  if (!coin.artUrl) throw new Error(`coin "${coin.id}" is neither a TCG Live coin nor has art`);
  const front = {
    ...defaults.front,
    textures: defaults.front.textures.map((sampler, index) => (index === 0 ? { ...sampler, source: { url: coin.artUrl } } : sampler)),
  };
  return { front, back };
}

const submeshNamed = (mesh, name) => {
  const submesh = mesh.submeshes.find((entry) => entry.name === name);
  if (!submesh) throw new Error(`coin mesh has no submesh "${name}"`);
  return submesh;
};

/**
 * A coin stage drawn into `host`. Rejects when WebGL2 is missing or the assets fail to load, so the
 * caller keeps the CSS ceremony. `onLost` runs once if the browser drops the context mid-flip.
 *
 * @param {{ host: HTMLElement, onLost?: () => void }} options
 * @returns {Promise<{ setCoin: (coin: { id: string, artUrl?: string }) => Promise<void>, draw: (pose: { angle: number, lift: number, yaw?: number }, elapsedMs: number) => void, resize: () => void, dispose: () => void }>}
 */
export async function createCoinStage({ host, onLost = () => {} }) {
  const assets = await loadAssets();
  const canvas = document.createElement('canvas');
  canvas.className = 'coin-stage-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  host.append(canvas);
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const positions = new Float32Array(assets.mesh.p.length);
  const normals = new Float32Array(assets.mesh.n.length);
  const tangents = new Float32Array(assets.tangents.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('aPOSITION0', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aNORMAL0', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aTANGENT0', new THREE.BufferAttribute(tangents, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aTEXCOORD0', new THREE.BufferAttribute(new Float32Array(assets.mesh.uv), 2));
  geometry.setIndex(assets.mesh.i);
  const backGroup = submeshNamed(assets.mesh, COIN_BACK_SUBMESH);
  const frontGroup = submeshNamed(assets.mesh, COIN_FRONT_SUBMESH);
  geometry.addGroup(backGroup.start, backGroup.count, 0);
  geometry.addGroup(frontGroup.start, frontGroup.count, 1);

  const mesh = new THREE.Mesh(geometry);
  // The disc moves every frame, so the bounds computed at creation would cull it.
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera();
  const cameraPosition = [0, 0, cameraDistance(assets.radius)];

  const state = { materials: [], viewProjection: null, lost: false, closed: false };

  const onContextLost = (event) => {
    event.preventDefault();
    state.lost = true;
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // The canvas's own CSS box: a host may let it overhang (the picker preview does, so a tilted coin is not clipped).
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth || host.clientWidth);
    const height = Math.max(1, canvas.clientHeight || host.clientHeight);
    renderer.setSize(width, height, false);
    state.viewProjection = coinViewProjection({ width, height, radius: assets.radius });
  };
  resize();

  const setCoin = async (coin) => {
    const { front, back } = resolveCoin(assets, coin);
    const built = await Promise.all([buildMaterial(assets, back), buildMaterial(assets, front)]);
    if (state.closed || state.lost) {
      for (const { material } of built) material.dispose();
      return;
    }
    for (const { material } of state.materials) material.dispose();
    state.materials = built;
    mesh.material = built.map(({ material }) => material);
  };

  const draw = ({ angle, lift, yaw = 0 }, elapsedMs) => {
    if (state.closed || state.lost || state.materials.length === 0) return;
    const posed = posedCoin(assets.mesh, assets.tangents, angle, lift, yaw);
    positions.set(posed.positions);
    normals.set(posed.normals);
    tangents.set(posed.tangents);
    geometry.attributes.aPOSITION0.needsUpdate = true;
    geometry.attributes.aNORMAL0.needsUpdate = true;
    geometry.attributes.aTANGENT0.needsUpdate = true;
    const frame = { viewProjection: state.viewProjection, cameraPosition, timeSeconds: elapsedMs / 1000 };
    for (const { material, spec } of state.materials) {
      const blocks = shaderUniformBlocks(spec.shader, { v: spec.vectors, f: spec.floats }, frame);
      for (const [name, values] of Object.entries(blocks)) material.uniforms[name].value = values;
    }
    renderer.render(scene, camera);
  };

  const dispose = () => {
    if (state.closed) return;
    state.closed = true;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    for (const { material } of state.materials) material.dispose();
    geometry.dispose();
    renderer.dispose();
    if (!state.lost) renderer.forceContextLoss();
    canvas.remove();
  };

  return { setCoin, draw, resize, dispose };
}
