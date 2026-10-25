#!/usr/bin/env node
// Checks every custom set under client/src/assets/custom-sets (or the folder given): set.json against the
// schema (shared/custom-sets/custom-set-schema.mjs) and a high.webp + low.webp per card. Exit 1 on any
// problem, so a broken set fails CI before the server would skip it at boot. Design 075.
//
//   node scripts/custom-sets/check.mjs [dir]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCustomSet } from '../../shared/custom-sets/custom-set-schema.mjs';
import { PUBLISHED_FILE_RE } from '../../shared/custom-sets/custom-sets-index.mjs';
import { RESERVED_SET_CODES } from '../../server/custom-sets.mjs';
import { normalizeCardKey, parseCustomFoil } from '../../client/src/setup/foil/tcgl-foil-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.join(here, '..', '..', 'client', 'src', 'assets', 'custom-sets');

const FOIL_DATA_DIR = path.join(here, '..', '..', 'client', 'src', 'assets', 'tcgl-foil');

function loadFoilData() {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(FOIL_DATA_DIR, file), 'utf8'));
  return { shaders: read('shaders.json').shaders, materials: read('materials.json') };
}

/**
 * A set's optional foil.json (I271): parseable by the client, every card id is a card of the set, every shader and
 * material exists in the TCG Live bundle, and every texture it names is in <set>/foil/. Returns problem lines.
 */
function checkFoil(setName, dir, set, { shaders, materials }) {
  const file = path.join(dir, 'foil.json');
  if (!fs.existsSync(file)) return [];
  const label = `${setName}/foil.json`;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return [`${label}: not valid JSON (${error.message})`];
  }
  const problems = [];
  let parsed;
  try {
    parsed = parseCustomFoil(set.id, json);
  } catch (error) {
    return [`${label}: ${error.message}`];
  }
  const localIds = new Set(set.cards.map((card) => card.localId));
  for (const [localId, row] of Object.entries(json.cards ?? {})) {
    if (!localIds.has(localId)) problems.push(`${label}: card ${localId} is not in set.json`);
    if (!parsed.has(normalizeCardKey(`${set.id}-${localId}`))) {
      problems.push(`${label}: card ${localId} has no usable shader, material and front texture`);
      continue;
    }
    if (!shaders[row.shader]) problems.push(`${label}: card ${localId}: unknown shader ${row.shader}`);
    if (!materials.materials[row.material]) problems.push(`${label}: card ${localId}: unknown material ${row.material}`);
    if (row.cc && !materials.textures?.[row.cc]) problems.push(`${label}: card ${localId}: unknown pattern ${row.cc}`);
    for (const kind of ['front', 'etch', 'wp', 'cf']) {
      if (!row[kind]) continue;
      if (!fs.existsSync(path.join(dir, 'foil', row[kind]))) problems.push(`${setName}/foil/${row[kind]}: missing`);
      // a texture the bucket index would not carry: the site's foil.json would name a file it never gets (design 076)
      else if (!PUBLISHED_FILE_RE.test(`foil/${row[kind]}`)) {
        problems.push(`${setName}/foil/${row[kind]}: name must be <nnn>-<kind>.webp to publish`);
      }
    }
  }
  return problems;
}

/**
 * One set folder `<rootDir>/<name>`: its set.json, a front per card and its foil.
 * @returns {{ set: object|null, problems: string[] }} `set` is the validated set.json when there are no problems
 */
export function checkSet(rootDir, name, foilData = loadFoilData()) {
  const dir = path.join(rootDir, name);
  const file = path.join(dir, 'set.json');
  if (!fs.existsSync(file)) return { set: null, problems: [`${name}: no set.json`] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { set: null, problems: [`${name}/set.json: not valid JSON (${error.message})`] };
  }
  const result = validateCustomSet(parsed, { setDirName: name, reservedCodes: RESERVED_SET_CODES });
  if (!result.ok) return { set: null, problems: result.errors.map((e) => `${name}/set.json: ${e}`) };
  const problems = [];
  for (const card of result.set.cards) {
    for (const image of ['high.webp', 'low.webp']) {
      if (!fs.existsSync(path.join(dir, card.localId, image))) problems.push(`${name}/${card.localId}/${image}: missing`);
    }
  }
  problems.push(...checkFoil(name, dir, result.set, foilData));
  return { set: problems.length ? null : result.set, problems };
}

/** @returns {{ sets: string[], problems: string[] }} */
export function checkCustomSets(rootDir = DEFAULT_ROOT) {
  const foilData = loadFoilData();
  const problems = [];
  const sets = [];
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { sets, problems };
    return { sets, problems: [`${rootDir}: ${error.message}`] };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const checked = checkSet(rootDir, entry.name, foilData);
    if (checked.problems.length) problems.push(...checked.problems);
    else sets.push(`${entry.name} (${checked.set.code}, ${checked.set.cards.length} cards)`);
  }
  return { sets, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_ROOT;
  const { sets, problems } = checkCustomSets(root);
  for (const set of sets) console.log(`ok  ${set}`);
  for (const problem of problems) console.error(`ERR ${problem}`);
  if (!sets.length && !problems.length) console.log(`no custom sets under ${root}`);
  process.exit(problems.length ? 1 : 0);
}
