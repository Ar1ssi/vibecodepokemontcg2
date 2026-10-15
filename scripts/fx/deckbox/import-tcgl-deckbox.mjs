#!/usr/bin/env node
// Design 071: build the committed TCG Live deck box assets from the extract.
//
//   pnpm fx:import-deckbox -- --src E:/TCGLive_Extract
//
// Reads <src>/WebApp/assets/deckbox/*.webp (the boxes' UV atlases), <src>/WebApp/assets/ui/db_*-t/ (thumbnails),
// <src>/WebApp/web/data/ui/{level4,textures,loc_en}.json and the two OBJ meshes, and writes
// client/src/assets/deckbox/: boxes.json, scene.json, deck-box.mesh.json, card.mesh.json,
// interior.webp, shadow-{box,card,coin}.webp, atlases/<id>.webp, thumbs/<id>.webp.
// The output directory is built beside the target and swapped in, so a failed run leaves the old one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packCoinMesh, parseCoinObj } from '../coin/lib/coin-mesh.mjs';
import { buildBoxCatalog, extractScene, toThreeMesh, sceneTextureKeys } from './lib/box-catalog.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'client', 'src', 'assets', 'deckbox');

const BOX_OBJ = ['Pokemon TCG Live_Data', 'resources.assets', 'Mesh', 'Sleeve_Deck_Box.obj'];
const CARD_OBJ = ['Pokemon TCG Live_Data', 'sharedassets1.assets', 'Mesh', 'Card.obj'];

const parseArgs = (argv) => {
  const args = { src: null, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--') continue;
    if (flag !== '--src' && flag !== '--out') throw new Error(`unknown argument ${flag}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag} needs a value`);
    args[flag.slice(2)] = path.resolve(value);
    index += 1;
  }
  if (!args.src) throw new Error('usage: import-tcgl-deckbox.mjs --src <TCGLive_Extract dir> [--out <dir>]');
  return args;
};

const requireFile = (file) => {
  if (!fs.existsSync(file)) throw new Error(`missing source file: ${file}`);
  return file;
};

const readJson = (file) => JSON.parse(fs.readFileSync(requireFile(file), 'utf8'));

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(requireFile(from), to);
};

/** The thumbnail is the only .webp inside `ui/<id>-t/`. */
const thumbFile = (uiDir, id) => {
  const dir = requireFile(path.join(uiDir, `${id}-t`));
  const webp = fs.readdirSync(dir).find((name) => name.toLowerCase().endsWith('.webp'));
  if (!webp) throw new Error(`missing source file: ${path.join(dir, '*.webp')}`);
  return path.join(dir, webp);
};

const packMesh = (objFile) => toThreeMesh(packCoinMesh(parseCoinObj(fs.readFileSync(requireFile(objFile), 'utf8'))));

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`);

function build({ src, dir }) {
  const webApp = path.join(src, 'WebApp');
  const dataDir = path.join(webApp, 'web', 'data', 'ui');
  const uiDir = path.join(webApp, 'assets', 'ui');
  const deckboxDir = path.join(webApp, 'assets', 'deckbox');

  const ids = readJson(path.join(deckboxDir, 'index.json'));
  const names = readJson(path.join(dataDir, 'loc_en.json'));
  const level4 = readJson(path.join(dataDir, 'level4.json'));
  const textures = readJson(path.join(dataDir, 'textures.json'));
  const catalog = buildBoxCatalog({ ids, names });
  const scene = extractScene(level4);

  fs.mkdirSync(dir, { recursive: true });
  for (const box of catalog.boxes) {
    copy(path.join(deckboxDir, `${box.id}.webp`), path.join(dir, box.atlas));
    copy(thumbFile(uiDir, box.id), path.join(dir, box.thumb));
  }
  for (const [name, key] of Object.entries(sceneTextureKeys(level4))) {
    const entry = textures[key];
    if (!entry?.u) throw new Error(`texture ${key} is not in textures.json`);
    copy(path.join(webApp, entry.u), path.join(dir, `${name}.webp`));
  }
  writeJson(path.join(dir, 'boxes.json'), catalog);
  writeJson(path.join(dir, 'scene.json'), scene);
  writeJson(path.join(dir, 'deck-box.mesh.json'), packMesh(path.join(src, ...BOX_OBJ)));
  writeJson(path.join(dir, 'card.mesh.json'), packMesh(path.join(src, ...CARD_OBJ)));
}

/**
 * Replaces `out` with `staging`. The old directory is renamed aside first and put back when the swap
 * fails, so a failed rename (a dev server holding files on Windows) never leaves `out` missing.
 */
export function swapIn({ staging, out, rename = fs.renameSync }) {
  const aside = `${out}.old-${process.pid}`;
  fs.rmSync(aside, { recursive: true, force: true });
  const hadOld = fs.existsSync(out);
  try {
    if (hadOld) rename(out, aside);
    rename(staging, out);
  } catch (error) {
    if (hadOld && !fs.existsSync(out) && fs.existsSync(aside)) fs.renameSync(aside, out);
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(aside, { recursive: true, force: true });
}

/** Throws (naming the missing file) without touching `out` when any source is absent or malformed. */
export function importDeckBoxes({ src, out }) {
  const staging = `${out}.tmp-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    build({ src, dir: staging });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  swapIn({ staging, out });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { src, out } = parseArgs(process.argv.slice(2));
    importDeckBoxes({ src, out });
    const { boxes } = readJson(path.join(out, 'boxes.json'));
    console.log(`deck boxes: ${boxes.length} boxes written to ${path.relative(REPO_ROOT, out)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
