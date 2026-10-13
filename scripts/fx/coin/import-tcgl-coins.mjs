#!/usr/bin/env node
// Design 069: build the committed TCG Live coin assets from the dump that
// scripts/fx/coin/dump_coin_vfx.py writes, and from the extract's coin_model.obj.
//
//   pnpm fx:import-coins -- --src E:/TCGLive_Extract/vfx_dump/coin_raw \
//     --obj "E:/TCGLive_Extract/Pokemon TCG Live_Data/resources.assets/Mesh/coin_model.obj"
//
// Reads <src>/coin-raw.json and <src>/textures/*.webp, writes client/src/assets/coins/tcgl/:
// coins.json (each coin's front and back material, baked), shaders.json (the coin shaders translated
// to GLSL), textures.json and textures/*.webp (cube maps as six faces), coin-mesh.json (the disc).
// Rerun after the game updates its bundles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAB_TEXTURE, bakeMaterial, buildShader, runtimeShader } from '../attack/lib/shader-variant.mjs';
import { packCoinMesh, parseCoinObj } from './lib/coin-mesh.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'client', 'src', 'assets', 'coins', 'tcgl');
/** The material TCG Live puts on a coin's reverse; every other material on a coin is its front. */
export const BACK_MATERIAL = 'Back';
/** A sampler nothing is bound to reads Unity's default texture of that name ('' is gray). */
const DEFAULT_TEXTURES = new Set(['white', 'black', 'gray', 'bump', 'red']);

const parseArgs = (argv) => {
  const args = { src: null, obj: null, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--src') args.src = argv[(index += 1)];
    else if (argv[index] === '--obj') args.obj = argv[(index += 1)];
    else if (argv[index] === '--out') args.out = path.resolve(argv[(index += 1)]);
  }
  return args;
};

/** The file names a texture entry writes: one for a 2D texture, six for a cube map. */
export const textureFiles = (texture) => (texture.cube ? texture.faces : [texture.file]);

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
    const built = buildShader(rawShader);
    const runtime = runtimeShader(built);
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
    const baked = bakeMaterial(material, builtShaders[index], rawShader, { resolveTexture, textureSize });
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
    console.error('usage: import-tcgl-coins.mjs --src <dir with coin-raw.json> --obj <coin_model.obj> [--out <dir>]');
    process.exit(2);
  }
  const rawPath = path.join(args.src, 'coin-raw.json');
  if (!fs.existsSync(rawPath)) {
    console.error(`not found: ${rawPath} (run scripts/fx/coin/dump_coin_vfx.py first)`);
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const assets = buildCoinAssets(raw);
  const mesh = packCoinMesh(parseCoinObj(fs.readFileSync(args.obj, 'utf8')));

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
      `${Object.keys(assets.textures).length} textures (${(textureBytes / 1e6).toFixed(1)} MB) -> ${path.relative(REPO_ROOT, args.out)}`
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
