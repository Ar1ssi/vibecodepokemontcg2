#!/usr/bin/env node
// Design 069: build the committed TCG Live coin assets from the dumps that
// scripts/fx/coin/dump_coin_vfx.py and dump_coin_thumbs.py write, and from the extract's coin_model.obj.
//
//   pnpm fx:import-coins -- --src E:/TCGLive_Extract/vfx_dump/coin_raw \
//     --obj "E:/TCGLive_Extract/Pokemon TCG Live_Data/resources.assets/Mesh/coin_model.obj"
//
// Reads <src>/coin-raw.json, <src>/textures/*.webp, <src>/thumbs/*.webp and <src>/coin-names.json,
// writes client/src/assets/coins/tcgl/: coins.json (each coin's front and back material, baked),
// shaders.json (the coin shaders translated to GLSL), textures.json and textures/*.webp (cube maps as
// six faces), coin-mesh.json (the disc), thumbs/*.webp; and the picker's catalog,
// client/src/assets/catalogs/tcgl-coins.json (--catalog).
// Rerun after the game updates its bundles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DYNAMIC_PARAMS, GRAB_TEXTURE, STATIC_PARAMS, bakeMaterial, buildShader, runtimeShader } from '../attack/lib/shader-variant.mjs';
import { packCoinMesh, parseCoinObj } from './lib/coin-mesh.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'client', 'src', 'assets', 'coins', 'tcgl');
const DEFAULT_CATALOG = path.join(REPO_ROOT, 'client', 'src', 'assets', 'catalogs', 'tcgl-coins.json');
/** Where the picker loads a coin's thumbnail, relative to the client root like the physical catalog's paths. */
const THUMB_URL_DIR = 'src/assets/coins/tcgl/thumbs/';
/** The plain metal shader; every other coin shader is a holofoil. */
const METAL_SHADER = 'TPCi/Surface/BumpSpec Relective';
/** The material TCG Live puts on a coin's reverse; every other material on a coin is its front. */
export const BACK_MATERIAL = 'Back';
/** A sampler nothing is bound to reads Unity's default texture of that name ('' is gray). */
const DEFAULT_TEXTURES = new Set(['white', 'black', 'gray', 'bump', 'red']);

/** Unity's forward base pass for a lit, non-lightmapped object: one directional light plus probe ambient. */
export const COIN_KEYWORDS = new Set(['DIRECTIONAL', 'LIGHTPROBE_SH']);

/** The coin stage's light and flat ambient (the constant SH band), filled per frame (coin-stage-math.mjs). */
export const COIN_DYNAMIC_PARAMS = Object.freeze({
  ...DYNAMIC_PARAMS,
  _LightColor0: 'lightColor',
  _WorldSpaceLightPos0: 'lightDirection',
  unity_SHAr: 'ambientRed',
  unity_SHAg: 'ambientGreen',
  unity_SHAb: 'ambientBlue',
});

const ZERO = [0, 0, 0, 0];
const IDENTITY = STATIC_PARAMS.unity_ObjectToWorld;
/**
 * Unity's per-draw lighting state for a lone coin: no lightmap or shadow mask (the occlusion selector
 * picks the always-1 channel, else direct light is multiplied by 0), positive scale (bitangent sign 1),
 * one reflection probe without box projection whose cube is not HDR-encoded, no light probe volume,
 * and ambient without direction (only the SH constant band, which the stage fills).
 */
export const COIN_STATIC_PARAMS = Object.freeze({
  ...STATIC_PARAMS,
  unity_SHBr: ZERO,
  unity_SHBg: ZERO,
  unity_SHBb: ZERO,
  unity_SHC: ZERO,
  unity_WorldTransformParams: [0, 0, 0, 1],
  unity_OcclusionMaskSelector: [1, 0, 0, 0],
  unity_SpecCube0_HDR: [1, 1, 0, 0],
  unity_SpecCube0_BoxMin: [0, 0, 0, 1],
  unity_SpecCube0_BoxMax: ZERO,
  unity_SpecCube0_ProbePosition: ZERO,
  unity_SpecCube1_HDR: [1, 1, 0, 0],
  unity_SpecCube1_BoxMin: ZERO,
  unity_SpecCube1_BoxMax: ZERO,
  unity_SpecCube1_ProbePosition: ZERO,
  unity_ProbeVolumeParams: ZERO,
  unity_ProbeVolumeWorldToObject: IDENTITY,
  unity_ProbeVolumeSizeInv: ZERO,
  unity_ProbeVolumeMin: ZERO,
});

/** Unity's reflection-probe samplers. The overlay scene's probe is not in the extract, so the coins' own cube stands in. */
const REFLECTION_PROBES = new Set(['unity_SpecCube0', 'unity_SpecCube1']);
export const ENVIRONMENT_CUBE = 'T_Coins_Cubemap';

const parseArgs = (argv) => {
  const args = { src: null, obj: null, out: DEFAULT_OUT, catalog: DEFAULT_CATALOG };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--src') args.src = argv[(index += 1)];
    else if (argv[index] === '--obj') args.obj = argv[(index += 1)];
    else if (argv[index] === '--out') args.out = path.resolve(argv[(index += 1)]);
    else if (argv[index] === '--catalog') args.catalog = path.resolve(argv[(index += 1)]);
  }
  return args;
};

/** The file names a texture entry writes: one for a 2D texture, six for a cube map. */
export const textureFiles = (texture) => (texture.cube ? texture.faces : [texture.file]);

/** A loc string as plain text: TCG Live marks titles up with `<i>` and similar tags. */
export const plainName = (text) => String(text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** `TPCi/Coins/Foil/Cracked_Ice` → `Cracked Ice`; the metal shader reads `Metal`. */
const familyLabel = (shaderName) => (shaderName === METAL_SHADER ? 'Metal' : shaderName.split('/').pop().replaceAll('_', ' '));

/**
 * The deck-builder picker's TCG Live coins, sorted by name: `{id, name, thumb, url, material, family}`.
 * `material` picks the physical catalog's CSS finish for the flat token (metal for plain metal coins,
 * silver for holofoils). A coin the game gives no English name (a work-in-progress bundle) is left out.
 *
 * @param {{ coins: object, materials: object[], shaders: object[] }} assets buildCoinAssets output
 * @param {Record<string, string>} names coin id → loc_en string
 * @param {Set<string>} thumbIds coins with a dumped thumbnail
 */
export function pickerCatalog(assets, names, thumbIds) {
  const entries = [];
  for (const [id, { front }] of Object.entries(assets.coins)) {
    const name = typeof names[id] === 'string' ? plainName(names[id]) : '';
    if (!name) continue;
    if (!thumbIds.has(id)) throw new Error(`${id}: named, but no thumbnail was dumped`);
    const shaderName = assets.shaders[assets.materials[front].shader].name;
    const thumb = `${THUMB_URL_DIR}${id}.webp`;
    entries.push({ id, name, thumb, url: thumb, material: shaderName === METAL_SHADER ? 'metal' : 'silver', family: familyLabel(shaderName) });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}

/** The picker catalog file (design 069): read by core/coins.mjs on demand (design 073). */
export const catalogJson = (entries) => `${JSON.stringify(entries, null, 1)}\n`;

/**
 * The whole coin import as data: `{coins, materials, shaders, textures, warnings}`. `coins` maps a
 * bundle's coin id to `{front, back}`, where each is an index into `materials` (back null when the
 * coin has none). Bundles without a material are not coins and are skipped.
 */
export function buildCoinAssets(raw) {
  const shaderIndexByKey = new Map();
  const shaderIndexBySource = new Map();
  const shaders = [];
  const builtShaders = [];
  const textures = {};
  const materials = [];
  const materialIndexByKey = new Map();
  const warnings = new Set();

  const shaderIndex = (key) => {
    if (shaderIndexByKey.has(key)) return shaderIndexByKey.get(key);
    const rawShader = raw.shaders[key];
    if (!rawShader || rawShader.builtin) throw new Error(`shader ${key} is not in the dump`);
    const built = buildShader(rawShader, { enabledKeywords: COIN_KEYWORDS });
    const runtime = runtimeShader(built, { dynamicParams: COIN_DYNAMIC_PARAMS });
    const source = JSON.stringify(runtime);
    if (!shaderIndexBySource.has(source)) {
      shaderIndexBySource.set(source, shaders.length);
      shaders.push(runtime);
      builtShaders.push(built);
    }
    shaderIndexByKey.set(key, shaderIndexBySource.get(source));
    return shaderIndexByKey.get(key);
  };

  const textureId = (key) => {
    const texture = raw.textures[key];
    if (!texture || (!texture.file && !texture.cube)) throw new Error(`texture ${key} is not a dumped Texture2D or Cubemap`);
    textures[texture.name] = {
      ...(texture.cube ? { cube: true, faces: texture.faces } : { file: texture.file }),
      w: texture.width,
      h: texture.height,
      srgb: texture.colorSpace === 1,
      wrapU: texture.wrapU,
      wrapV: texture.wrapV,
      filter: texture.filter,
    };
    return texture.name;
  };

  const environmentKey = Object.keys(raw.textures).find((key) => raw.textures[key].name === ENVIRONMENT_CUBE && raw.textures[key].cube);

  const materialIndex = (key) => {
    if (materialIndexByKey.has(key)) return materialIndexByKey.get(key);
    const material = raw.materials[key];
    if (!material || material.builtin) throw new Error(`material ${key} is not in the dump`);
    const index = shaderIndex(material.shader);
    const rawShader = raw.shaders[material.shader];
    const props = new Map(rawShader.props.map((prop) => [prop.m_Name, prop]));
    const boundTexture = (name) =>
      material.textures[name]?.texture ?? (rawShader.nonModifiableTextures ?? []).find(([entry]) => entry === name)?.[1] ?? null;
    const resolveTexture = (name) => {
      if (name === GRAB_TEXTURE) return '#grab';
      if (REFLECTION_PROBES.has(name)) {
        if (!environmentKey) throw new Error(`${material.name}: ${name} needs the cube map ${ENVIRONMENT_CUBE}, which is not in the dump`);
        return textureId(environmentKey);
      }
      const textureKey = boundTexture(name);
      if (textureKey) return textureId(textureKey);
      const fallback = props.get(name)?.m_DefTexture?.m_DefaultName || 'gray';
      if (!DEFAULT_TEXTURES.has(fallback)) throw new Error(`${material.name}: unknown default texture "${fallback}" for ${name}`);
      return `#${fallback}`;
    };
    const textureSize = (name) => {
      const textureKey = boundTexture(name);
      return textureKey ? { width: raw.textures[textureKey].width, height: raw.textures[textureKey].height } : null;
    };
    const baked = bakeMaterial(material, builtShaders[index], rawShader, {
      resolveTexture,
      textureSize,
      dynamicParams: COIN_DYNAMIC_PARAMS,
      staticParams: COIN_STATIC_PARAMS,
    });
    for (const name of baked.missing) warnings.add(`${rawShader.name}: no value for ${name} (reads 0)`);
    materials.push({
      n: material.name,
      shader: index,
      queue: material.renderQueue >= 0 ? material.renderQueue : shaders[index].queue,
      v: baked.v,
      f: baked.f,
      tex: baked.textures,
    });
    materialIndexByKey.set(key, materials.length - 1);
    return materials.length - 1;
  };

  const coins = {};
  for (const [coinId, materialKeys] of Object.entries(raw.coins)) {
    if (materialKeys.length === 0) continue;
    const sides = { front: null, back: null };
    for (const key of materialKeys) {
      const side = raw.materials[key]?.name === BACK_MATERIAL ? 'back' : 'front';
      if (sides[side] !== null) throw new Error(`${coinId}: two ${side} materials`);
      sides[side] = materialIndex(key);
    }
    if (sides.front === null) throw new Error(`${coinId}: no front material`);
    coins[coinId] = sides;
  }
  return { coins, materials, shaders, textures, warnings: [...warnings].sort() };
}

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`);

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.src || !args.obj) {
    console.error('usage: import-tcgl-coins.mjs --src <dir with coin-raw.json> --obj <coin_model.obj> [--out <dir>] [--catalog <file>]');
    process.exit(2);
  }
  const rawPath = path.join(args.src, 'coin-raw.json');
  const namesPath = path.join(args.src, 'coin-names.json');
  const thumbSourceDir = path.join(args.src, 'thumbs');
  for (const [needed, dumper] of [[rawPath, 'dump_coin_vfx.py'], [namesPath, 'dump_coin_thumbs.py'], [thumbSourceDir, 'dump_coin_thumbs.py']]) {
    if (!fs.existsSync(needed)) {
      console.error(`not found: ${needed} (run scripts/fx/coin/${dumper} first)`);
      process.exit(2);
    }
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const assets = buildCoinAssets(raw);
  const mesh = packCoinMesh(parseCoinObj(fs.readFileSync(args.obj, 'utf8')));
  const thumbIds = new Set(fs.readdirSync(thumbSourceDir).filter((file) => file.endsWith('.webp')).map((file) => file.slice(0, -'.webp'.length)));
  const catalog = pickerCatalog(assets, JSON.parse(fs.readFileSync(namesPath, 'utf8')), thumbIds);

  const thumbDir = path.join(args.out, 'thumbs');
  fs.rmSync(thumbDir, { recursive: true, force: true });
  fs.mkdirSync(thumbDir, { recursive: true });
  for (const { id } of catalog) fs.copyFileSync(path.join(thumbSourceDir, `${id}.webp`), path.join(thumbDir, `${id}.webp`));
  fs.writeFileSync(args.catalog, catalogJson(catalog));

  const textureDir = path.join(args.out, 'textures');
  fs.rmSync(textureDir, { recursive: true, force: true });
  fs.mkdirSync(textureDir, { recursive: true });
  let textureBytes = 0;
  for (const texture of Object.values(assets.textures)) {
    for (const file of textureFiles(texture)) {
      const source = path.join(args.src, 'textures', file);
      fs.copyFileSync(source, path.join(textureDir, file));
      textureBytes += fs.statSync(source).size;
    }
  }
  writeJson(path.join(args.out, 'coins.json'), { coins: assets.coins, materials: assets.materials });
  writeJson(path.join(args.out, 'shaders.json'), assets.shaders);
  writeJson(path.join(args.out, 'textures.json'), assets.textures);
  writeJson(path.join(args.out, 'coin-mesh.json'), mesh);

  for (const warning of assets.warnings) console.warn(`warning: ${warning}`);
  console.log(
    `${Object.keys(assets.coins).length} coins, ${assets.materials.length} materials, ${assets.shaders.length} shaders, ` +
      `${Object.keys(assets.textures).length} textures (${(textureBytes / 1e6).toFixed(1)} MB) -> ${path.relative(REPO_ROOT, args.out)}; ` +
      `${catalog.length} picker coins -> ${path.relative(REPO_ROOT, args.catalog)}`
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
