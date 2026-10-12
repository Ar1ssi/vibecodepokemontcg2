#!/usr/bin/env node
// Design 068: build the committed attack-impact assets from the dump that
// scripts/fx/attack/dump_attack_vfx.py writes.
//
//   pnpm fx:import-attack -- --src E:/TCGLive_Extract/vfx_dump/attack_raw
//
// Reads <src>/attack-raw.json, <src>/textures/*.webp, <src>/meshes/*.json and writes
// client/src/assets/fx/attack/: one <type>.json per TCG type (its six prefabs and their
// materials), shaders.json (the game's shaders translated to GLSL), meshes.json,
// textures.json and textures/*.webp. Rerun after the game updates its bundles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_PLANE, BUILTIN_QUAD, BUILTIN_SPHERE, builtinMesh } from './lib/builtin-meshes.mjs';
import { normalizePrefab } from './lib/normalize-system.mjs';
import { GRAB_TEXTURE, bakeMaterial, buildShader, runtimeShader } from './lib/shader-variant.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'client', 'src', 'assets', 'fx', 'attack');

/** Bundle → the repo's TCG type id (energy-token-assets.mjs `normalizeEnergyType`) and the prefab's type word. */
export const BUNDLE_TYPES = Object.freeze({
  attack_colorless: ['colorless', 'Colorless'],
  attack_dark: ['darkness', 'Dark'],
  attack_dragon: ['dragon', 'Dragon'],
  attack_fairy: ['fairy', 'Fairy'],
  attack_fighting: ['fighting', 'Fighting'],
  attack_fire: ['fire', 'Fire'],
  attack_grass: ['grass', 'Grass'],
  attack_lightning: ['lightning', 'Lightning'],
  attack_metal: ['metal', 'Metal'],
  attack_psychic: ['psychic', 'Psychic'],
  attack_water: ['water', 'Water'],
});
export const PREFAB_VARIANTS = Object.freeze(['Small', 'Medium', 'Large', 'Small_C', 'Medium_C', 'Large_C']);
/** A sampler nothing is bound to reads Unity's default texture of that name ('' is gray). */
const DEFAULT_TEXTURES = new Set(['white', 'black', 'gray', 'bump', 'red']);
const BUILTIN_MESH_IDS = { [BUILTIN_QUAD]: 'Quad', [BUILTIN_PLANE]: 'Plane', [BUILTIN_SPHERE]: 'Sphere' };

const parseArgs = (argv) => {
  const args = { src: null, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--src') args.src = argv[(index += 1)];
    else if (argv[index] === '--out') args.out = path.resolve(argv[(index += 1)]);
  }
  return args;
};

const flatten = (rows, width) => (rows ? rows.flatMap((row) => Array.from({ length: width }, (_, index) => Number((row[index] ?? 0).toFixed(5)))) : undefined);

/** A dumped (or built-in) mesh as flat arrays: p, n, c, uv0..uv3 (4 wide), i. */
export function packMesh(mesh) {
  const packed = { p: flatten(mesh.positions, 3), i: mesh.indices };
  if (mesh.normals) packed.n = flatten(mesh.normals, 3);
  if (mesh.tangents) packed.t = flatten(mesh.tangents, 4);
  if (mesh.colors) packed.c = flatten(mesh.colors, 4);
  for (const channel of ['uv0', 'uv1', 'uv2', 'uv3']) if (mesh[channel]) packed[channel] = flatten(mesh[channel], 4);
  return packed;
}

/**
 * The whole import as data: `{types: {id: typeFile}, shaders, meshes, textures, warnings}`.
 * `readMesh(fileName)` returns a dumped mesh's JSON.
 */
export function buildAssets(raw, { readMesh }) {
  const shaderIndexByKey = new Map();
  const shaderIndexBySource = new Map();
  const shaders = [];
  const builtShaders = [];
  const meshes = {};
  const textures = {};
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
    if (!texture?.file) throw new Error(`texture ${key} is not a dumped Texture2D`);
    textures[texture.name] = {
      file: texture.file,
      w: texture.width,
      h: texture.height,
      srgb: texture.colorSpace === 1,
      wrapU: texture.wrapU,
      wrapV: texture.wrapV,
      filter: texture.filter,
    };
    return texture.name;
  };

  const meshId = (key) => {
    const mesh = raw.meshes[key];
    if (!mesh) throw new Error(`mesh ${key} is not in the dump`);
    if (mesh.builtin) {
      const id = BUILTIN_MESH_IDS[mesh.builtin];
      if (!id) throw new Error(`Unity built-in mesh ${mesh.builtin} is not supported`);
      meshes[id] ??= packMesh(builtinMesh(mesh.builtin));
      return id;
    }
    meshes[mesh.name] ??= packMesh(readMesh(mesh.file));
    return mesh.name;
  };

  const types = {};
  for (const [bundle, [typeId, typeWord]] of Object.entries(BUNDLE_TYPES)) {
    const roots = raw.bundles[bundle];
    if (!roots) throw new Error(`bundle ${bundle} is not in the dump`);
    const materials = [];
    const materialIndexByKey = new Map();
    const usedTextures = new Set();
    const usedMeshes = new Set();

    const materialIndex = (key) => {
      if (materialIndexByKey.has(key)) return materialIndexByKey.get(key);
      const material = raw.materials[key];
      if (!material || material.builtin) throw new Error(`material ${key} is not in the dump`);
      const index = shaderIndex(material.shader);
      const rawShader = raw.shaders[material.shader];
      const props = new Map(rawShader.props.map((prop) => [prop.m_Name, prop]));
      const boundTexture = (name) => {
        if (material.textures[name]?.texture) return material.textures[name].texture;
        return (rawShader.nonModifiableTextures ?? []).find(([entry]) => entry === name)?.[1] ?? null;
      };
      const resolveTexture = (name) => {
        if (name === GRAB_TEXTURE) return '#grab';
        const key2 = boundTexture(name);
        if (key2) {
          const id = textureId(key2);
          usedTextures.add(id);
          return id;
        }
        const fallback = props.get(name)?.m_DefTexture?.m_DefaultName || 'gray';
        if (!DEFAULT_TEXTURES.has(fallback)) throw new Error(`${material.name}: unknown default texture "${fallback}" for ${name}`);
        return `#${fallback}`;
      };
      const textureSize = (name) => {
        const key2 = boundTexture(name);
        return key2 ? { width: raw.textures[key2].width, height: raw.textures[key2].height } : null;
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

    const prefabs = {};
    for (const variant of PREFAB_VARIANTS) {
      const name = `Attack_${typeWord}_Impact_${variant}`;
      const root = roots.find((entry) => entry.name === name);
      if (!root) throw new Error(`${bundle}: prefab ${name} is missing`);
      prefabs[variant] = normalizePrefab(root, {
        materialIndex,
        meshId: (key) => {
          const id = meshId(key);
          usedMeshes.add(id);
          return id;
        },
      });
    }
    types[typeId] = { type: typeId, prefabs, materials, textures: [...usedTextures].sort(), meshes: [...usedMeshes].sort() };
  }
  return { types, shaders, meshes, textures, warnings: [...warnings].sort() };
}

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`);

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.src) {
    console.error('usage: import-tcgl-attack-fx.mjs --src <dir with attack-raw.json> [--out <dir>]');
    process.exit(2);
  }
  const rawPath = path.join(args.src, 'attack-raw.json');
  if (!fs.existsSync(rawPath)) {
    console.error(`not found: ${rawPath} (run scripts/fx/attack/dump_attack_vfx.py first)`);
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const assets = buildAssets(raw, { readMesh: (file) => JSON.parse(fs.readFileSync(path.join(args.src, 'meshes', file), 'utf8')) });

  const textureDir = path.join(args.out, 'textures');
  fs.rmSync(textureDir, { recursive: true, force: true });
  fs.mkdirSync(textureDir, { recursive: true });
  let textureBytes = 0;
  for (const texture of Object.values(assets.textures)) {
    const source = path.join(args.src, 'textures', texture.file);
    fs.copyFileSync(source, path.join(textureDir, texture.file));
    textureBytes += fs.statSync(source).size;
  }
  for (const [typeId, typeFile] of Object.entries(assets.types)) writeJson(path.join(args.out, `${typeId}.json`), typeFile);
  writeJson(path.join(args.out, 'shaders.json'), assets.shaders);
  writeJson(path.join(args.out, 'meshes.json'), assets.meshes);
  writeJson(path.join(args.out, 'textures.json'), assets.textures);

  for (const warning of assets.warnings) console.warn(`warning: ${warning}`);
  console.log(
    `${Object.keys(assets.types).length} types, ${assets.shaders.length} shaders, ${Object.keys(assets.meshes).length} meshes, ` +
      `${Object.keys(assets.textures).length} textures (${(textureBytes / 1e6).toFixed(1)} MB) -> ${path.relative(REPO_ROOT, args.out)}`
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
