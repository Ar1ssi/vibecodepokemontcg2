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

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.join(here, '..', '..', 'client', 'src', 'assets', 'custom-sets');

/** @returns {{ sets: string[], problems: string[] }} */
export function checkCustomSets(rootDir = DEFAULT_ROOT) {
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
