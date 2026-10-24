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
      if (row[kind] && !fs.existsSync(path.join(dir, 'foil', row[kind]))) {
        problems.push(`${setName}/foil/${row[kind]}: missing`);
      }
    }
  }
  return problems;
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
    const dir = path.join(rootDir, entry.name);
    const file = path.join(dir, 'set.json');
    if (!fs.existsSync(file)) {
      problems.push(`${entry.name}: no set.json`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push(`${entry.name}/set.json: not valid JSON (${error.message})`);
      continue;
    }
    const result = validateCustomSet(parsed, { setDirName: entry.name, reservedCodes: RESERVED_SET_CODES });
    if (!result.ok) {
      problems.push(...result.errors.map((e) => `${entry.name}/set.json: ${e}`));
      continue;
    }
    const missing = [];
    for (const card of result.set.cards) {
      for (const name of ['high.webp', 'low.webp']) {
        if (!fs.existsSync(path.join(dir, card.localId, name))) missing.push(`${entry.name}/${card.localId}/${name}: missing`);
      }
    }
    missing.push(...checkFoil(entry.name, dir, result.set, foilData));
    if (missing.length) problems.push(...missing);
    else sets.push(`${entry.name} (${result.set.code}, ${result.set.cards.length} cards)`);
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
