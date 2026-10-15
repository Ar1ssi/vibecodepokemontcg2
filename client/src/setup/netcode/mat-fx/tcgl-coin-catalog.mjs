// TCG Live coins as the coin stage draws them (design 069, slice 2). Reads the parsed slice 1 import
// (client/src/assets/coins/tcgl: coins.json, shaders.json, textures.json). Pure: callers pass the JSON,
// so node tests and the browser loader share one path. A shader outside the known list throws, so a
// re-import with a new shader fails here, not as a silently wrong coin.

/** Shader name (shaders.json) → family and whether it is a holofoil. Every shader the import emits must be listed. */
const SHADER_FAMILIES = new Map([
  ['TPCi/Coins/Foil/Sparkles', { family: 'Sparkles', foil: true }],
  ['TPCi/Coins/Foil/Cracked_Ice', { family: 'Cracked_Ice', foil: true }],
  ['TPCi/Coins/Foil/Flat_Silver', { family: 'Flat_Silver', foil: true }],
  ['TPCi/Coins/Foil/Pixel', { family: 'Pixel', foil: true }],
  ['TPCi/Coins/Foil/Rainbow', { family: 'Rainbow', foil: true }],
  ['TPCi/Coins/Foil/Streamlines', { family: 'Streamlines', foil: true }],
  ['TPCi/Coins/Foil/Fluorescent_Phenomena', { family: 'Fluorescent_Phenomena', foil: true }],
  ['TPCi/Coins/Foil/Psychedelic_Graffiti', { family: 'Psychedelic_Graffiti', foil: true }],
  ['TPCi/Coins/Foil/Ovals', { family: 'Ovals', foil: true }],
  ['TPCi/Coins/Foil/Thatched', { family: 'Thatched', foil: true }],
  ['TPCi/Coins/Foil/Rain', { family: 'Rain', foil: true }],
  ['TPCi/Surface/BumpSpec Relective', { family: 'BumpSpec Relective', foil: false }],
]);

/** Default textures the stage supplies (`#name` in a material's texture list). `grab` is the scene behind the coin. */
const BUILTIN_TEXTURES = new Set(['white', 'black', 'gray', 'bump', 'red', 'grab']);

const familyOf = (shader) => {
  const known = SHADER_FAMILIES.get(shader.name);
  if (!known) throw new Error(`TCG Live coin shader "${shader.name}" has no known family`);
  return known;
};

/** A sampler's source: a built-in default (`#white`…) or an imported texture from textures.json. */
function textureSource(name, textures) {
  if (name.startsWith('#')) {
    const builtin = name.slice(1);
    if (!BUILTIN_TEXTURES.has(builtin)) throw new Error(`TCG Live coin texture "${name}" is not a built-in`);
    return { builtin };
  }
  const texture = Object.hasOwn(textures, name) ? textures[name] : null;
  if (!texture) throw new Error(`TCG Live coin texture "${name}" is not in textures.json`);
  return { name, ...texture };
}

/**
 * One material ready to draw. `vectors[i]` fills shader.buffers.v[i] and `floats[i]` fills
 * shader.buffers.f[i]. `textures[i]` is the source for shader.textures[i] (its `uniform` names the sampler).
 *
 * @param {{ materials: object[], shaders: object[], textures: object }} assets
 * @param {number} index a materials[] index from coins.json
 */
export function tcglMaterial(assets, index) {
  const material = assets.materials[index];
  if (!material) throw new Error(`TCG Live coin material ${index} does not exist`);
  const shader = assets.shaders[material.shader];
  if (!shader) throw new Error(`TCG Live coin material "${material.n}" names missing shader ${material.shader}`);
  if (material.tex.length !== shader.textures.length) {
    throw new Error(`TCG Live coin material "${material.n}" binds ${material.tex.length} textures, shader ${shader.name} has ${shader.textures.length}`);
  }
  return {
    name: material.n,
    ...familyOf(shader),
    shader,
    queue: material.queue,
    vectors: material.v,
    floats: material.f,
    textures: shader.textures.map((sampler, samplerIndex) => ({
      uniform: sampler.uniform,
      type: sampler.type,
      source: textureSource(material.tex[samplerIndex], assets.textures),
    })),
  };
}

/** Every coin id the import has, in coins.json order. */
export function tcglCoinIds(assets) {
  return Object.keys(assets.coins);
}

/**
 * A coin's front and back material. `back` is null when TCG Live gives the coin no reverse material.
 * Throws on an id the import does not have.
 *
 * @param {{ coins: object, materials: object[], shaders: object[], textures: object }} assets
 * @param {string} id a coins.json key, e.g. `cn_absolmega_slvi`
 */
export function tcglCoin(assets, id) {
  if (!Object.hasOwn(assets.coins, id)) throw new Error(`no TCG Live coin "${id}"`);
  const { front, back } = assets.coins[id];
  return {
    id,
    front: tcglMaterial(assets, front),
    back: back === null ? null : tcglMaterial(assets, back),
  };
}
