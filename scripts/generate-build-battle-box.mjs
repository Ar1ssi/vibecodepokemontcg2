/**
 * Bakes the Build & Battle boxes (designs 051, 054): per box, the set its packs draw from
 * (`sets/<setId>.generated.mjs`) and its contents (`boxes/<boxKey>.generated.mjs`), from the box
 * sources in scripts/build-battle/boxes/ and TCGdex.
 * Run: node scripts/generate-build-battle-box.mjs                    (every box)
 *      node scripts/generate-build-battle-box.mjs --only team-up,phantasmal-flames (some boxes)
 *      node scripts/generate-build-battle-box.mjs --check            (re-fetch; exit 1 on drift)
 * TCGDEX_CACHE_DIR=<dir> keeps TCGdex responses between runs (development only).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_BATTLE_BOXES } from '../client/src/setup/deck-builder/core/build-battle/box-catalog.mjs';
import { bakeBoxData, bakeSet, bakeSummary } from './build-battle/bake-box.mjs';
import { loadBoxSource } from './build-battle/box-sources.mjs';
import { renderBoxModule, renderSetModule } from './lib/build-battle-modules.mjs';
import { fetchCard, fetchSet } from './lib/decklist-lines.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE = join(__dirname, '../client/src/setup/deck-builder/core/build-battle');

const tcgdex = {
  fetchSet,
  fetchCard,
  headOk: async (url) => {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  },
};

function selectedBoxes(argv) {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  if (!only) return BUILD_BATTLE_BOXES;
  const keys = only.split(',').map((key) => key.trim()).filter(Boolean);
  const unknown = keys.filter((key) => !BUILD_BATTLE_BOXES.some((box) => box.key === key));
  if (unknown.length) throw new Error(`Unknown box: ${unknown.join(', ')}`);
  return BUILD_BATTLE_BOXES.filter((box) => keys.includes(box.key));
}

const readCommitted = (path) => {
  try {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
};

async function bake(box) {
  const source = await loadBoxSource(box);
  const set = await bakeSet(box, tcgdex);
  const data = await bakeBoxData(box, source, tcgdex);
  return {
    files: [
      [join(CORE, 'sets', `${box.setId}.generated.mjs`), renderSetModule(set.set, set.rows)],
      [join(CORE, 'boxes', `${box.key}.generated.mjs`), renderBoxModule({ name: box.name, source: source.source }, data)],
    ],
    summary: bakeSummary(box, set, data),
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const drift = [];
  for (const box of selectedBoxes(process.argv)) {
    const { files, summary } = await bake(box);
    console.log(summary);
    for (const [path, body] of files) {
      if (check) {
        if (readCommitted(path) !== body) drift.push(path);
      } else {
        writeFileSync(path, body, 'utf8');
      }
    }
  }
  if (!check) return;
  if (drift.length) {
    console.error(`Differs from TCGdex (rerun without --check and review the diff):\n  ${drift.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('Build & Battle modules match TCGdex');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
