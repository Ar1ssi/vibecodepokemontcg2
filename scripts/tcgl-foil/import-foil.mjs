#!/usr/bin/env node
// Design 069: builds the committed TCG Live card foil assets from the TCG Live extract.
//
//   pnpm foil:import -- --src E:/TCGLive_Extract [--unity-cache <dir>] [--sets sv1,sv2] [--dry-run] [--force]
//
// Reads <src>/cardart/manifests.jsonl (each card bundle's MaterialManifest records), <src>/card_database_rows.tsv
// (TCG Live card names) and the TCGdex set endpoints (cached under .cache/tcgdex-sets/), maps every TCG Live
// card to its TCGdex id, then has extract-textures.py decode the card textures and the MAT_Cards3D material
// textures as lossless WebP at native size. Writes client/src/assets/tcgl-foil/: manifest.json, materials.json,
// shaders.json (byte copy of the WebApp's translated shaders), tex/*.webp and cards/<set>/*.webp.
// --dry-run prints the mapping report only. --sets limits the run, and the manifest, to those TCG Live sets.
// Rerun after the game updates its card bundles; existing files of the same size are kept unless --force.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TCGL_TO_TCGDEX_SETS,
  buildManifest,
  legacyShaderName,
  matchSetCards,
  materialName,
} from './foil-import-map.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'client', 'src', 'assets', 'tcgl-foil');
const TCGDEX_CACHE = path.join(REPO_ROOT, '.cache', 'tcgdex-sets');
const TEX_URL_PREFIX = '/src/assets/tcgl-foil/tex/';
const DEFAULT_UNITY_CACHE = path.join(
  process.env.USERPROFILE || os.homedir(),
  'AppData',
  'LocalLow',
  'Unity',
  'pokemon_Pokemon TCG Live'
);

const parseArgs = (argv) => {
  const args = { src: null, unityCache: DEFAULT_UNITY_CACHE, sets: null, dryRun: false, force: false, tcgdexDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--src') args.src = argv[(index += 1)];
    else if (flag === '--unity-cache') args.unityCache = argv[(index += 1)];
    else if (flag === '--sets') args.sets = new Set(argv[(index += 1)].split(',').map((s) => s.trim().toLowerCase()));
    else if (flag === '--offline-tcgdex') args.tcgdexDir = argv[(index += 1)];
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--force') args.force = true;
  }
  return args;
};

/** bundle → its base MaterialManifest record. */
function readBaseManifests(file) {
  const byBundle = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    for (const record of JSON.parse(line)) {
      if (record.manifest === 'MaterialManifest') byBundle.set(record.bundle, record);
    }
  }
  return byBundle;
}

/** TCG Live card id (`sv1_258`) → English name, base printings only. */
function readCardNames(file) {
  const [header, ...rows] = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const columns = header.split('\t');
  const idCol = columns.indexOf('cardID');
  const variantCol = columns.indexOf('variant');
  const nameCol = columns.indexOf('EN Card Name');
  if (idCol < 0 || variantCol < 0 || nameCol < 0) throw new Error(`${file}: missing cardID/variant/EN Card Name`);
  const names = new Map();
  for (const row of rows) {
    const cells = row.split('\t');
    if (cells[variantCol] === '0' && cells[idCol]) names.set(cells[idCol], cells[nameCol]);
  }
  return names;
}

async function tcgdexSet(id, tcgdexDir) {
  const cacheDir = tcgdexDir ?? TCGDEX_CACHE;
  const file = path.join(cacheDir, `${id}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (tcgdexDir) throw new Error(`offline TCGdex set ${id} not in ${tcgdexDir}`);
  const response = await fetch(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`TCGdex set ${id}: HTTP ${response.status}`);
  const json = await response.json();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

const bundleNumber = (bundle) => Number(/_en_(\d+)$/.exec(bundle)?.[1] ?? NaN);
const setOfBundle = (bundle) => bundle.replace(/_en_\d+$/, '');
const textureNames = (entry) => [entry.front, entry.etch, entry.wp, entry.cf].filter(Boolean);

async function mapCards({ manifests, names, sets, tcgdexDir }) {
  const bundlesBySet = new Map();
  for (const bundle of manifests.keys()) {
    const set = setOfBundle(bundle);
    if (!bundlesBySet.has(set)) bundlesBySet.set(set, []);
    bundlesBySet.get(set).push(bundle);
  }
  const entries = [];
  const report = [];
  for (const [code, bundles] of [...bundlesBySet].sort(([a], [b]) => a.localeCompare(b))) {
    if (sets && !sets.has(code)) continue;
    const segmentsDef = TCGL_TO_TCGDEX_SETS[code];
    if (!segmentsDef) {
      report.push({ code, total: bundles.length, foil: 0, flat: 0, unmapped: bundles.length, note: 'no TCGdex set' });
      continue;
    }
    const segments = [];
    for (const seg of segmentsDef) segments.push({ ...seg, cards: (await tcgdexSet(seg.set, tcgdexDir)).cards ?? [] });
    const tcglCards = [];
    const nameless = [];
    for (const bundle of bundles) {
      const number = bundleNumber(bundle);
      const tcglId = `${code}_${number}`;
      const name = names.get(tcglId);
      if (name) tcglCards.push({ tcglId, number, name, bundle });
      else nameless.push(tcglId);
    }
    const { matched, unmapped } = matchSetCards(tcglCards, segments);
    let foil = 0;
    for (const card of tcglCards) {
      const tcgdexId = matched.get(card.tcglId);
      if (!tcgdexId) continue;
      const record = manifests.get(card.bundle);
      const shader = legacyShaderName(record._s);
      const isFoil = !shader.endsWith('NonFoil');
      if (isFoil) foil += 1;
      entries.push({
        tcgdexId,
        tcglId: card.tcglId,
        code,
        bundle: card.bundle,
        foil: isFoil,
        shader,
        material: materialName(record._f),
        front: record._c || card.bundle,
        etch: record._e || '',
        wp: record._w || '',
        cf: record._cf || '',
        cc: record._cc || '',
      });
    }
    const missed = [...unmapped, ...nameless];
    report.push({
      code,
      total: bundles.length,
      foil,
      flat: matched.size - foil,
      unmapped: missed.length,
      examples: missed.slice(0, 4).map((id) => `${id} ${names.get(id) ?? '(no name)'}`),
    });
  }
  return { entries, report };
}

function printReport(report) {
  for (const row of report) {
    const share = row.total ? Math.round((100 * row.unmapped) / row.total) : 0;
    const flag = share > 10 ? '  <-- over 10% unmapped' : '';
    const detail = row.note ?? (row.examples?.length ? `e.g. ${row.examples.join('; ')}` : '');
    console.log(`${row.code.padEnd(10)} total ${row.total} foil ${row.foil} flat ${row.flat} unmapped ${row.unmapped}${flag} ${detail}`);
  }
  const sum = (key) => report.reduce((n, row) => n + row[key], 0);
  console.log(`ALL total ${sum('total')} foil ${sum('foil')} flat ${sum('flat')} unmapped ${sum('unmapped')}`);
}

function runExtraction(job) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgl-foil-'));
  const jobFile = path.join(tmp, 'job.json');
  const resultFile = path.join(tmp, 'result.json');
  fs.writeFileSync(jobFile, JSON.stringify(job));
  // -P: keep the script's and the extract's folders off sys.path (UnityPy lives in user site-packages, so not -I).
  const run = spawnSync('python', ['-P', path.join(SCRIPT_DIR, 'extract-textures.py'), jobFile, resultFile], {
    cwd: SCRIPT_DIR,
    stdio: 'inherit',
  });
  if (run.status !== 0) throw new Error(`extract-textures.py exited with ${run.status ?? run.error}`);
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

const dirBytes = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).reduce((n, entry) => {
        const full = path.join(dir, entry.name);
        return n + (entry.isDirectory() ? dirBytes(full) : fs.statSync(full).size);
      }, 0)
    : 0;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.src) throw new Error('usage: import-foil.mjs --src <TCG Live extract> [--unity-cache <dir>] [--sets a,b] [--dry-run] [--force]');
  const manifests = readBaseManifests(path.join(args.src, 'cardart', 'manifests.jsonl'));
  const names = readCardNames(path.join(args.src, 'card_database_rows.tsv'));
  const { entries, report } = await mapCards({ manifests, names, sets: args.sets, tcgdexDir: args.tcgdexDir });
  printReport(report);
  if (args.dryRun) return;

  const foils = entries.filter((e) => e.foil);
  const misfiled = foils.filter((e) => textureNames(e).some((name) => !name.startsWith(`${e.code}_`)));
  const job = {
    bundlesDir: path.join(args.src, 'cardart', 'bundles'),
    shadersBundle: path.join(args.unityCache, 'shadersbundle'),
    outCards: path.join(OUT_DIR, 'cards'),
    outTex: path.join(OUT_DIR, 'tex'),
    materialsOut: path.join(OUT_DIR, 'materials.json'),
    texUrlPrefix: TEX_URL_PREFIX,
    force: args.force,
    workers: Math.max(1, os.cpus().length - 1),
    cards: foils
      .filter((e) => !misfiled.includes(e))
      .map((e) => ({ bundle: e.bundle, set: e.code, textures: textureNames(e) })),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const result = runExtraction(job);

  const shadersSrc = path.join(args.src, 'WebApp', 'web', 'data', 'foil', 'shaders.json');
  fs.copyFileSync(shadersSrc, path.join(OUT_DIR, 'shaders.json'));
  const shaders = JSON.parse(fs.readFileSync(shadersSrc, 'utf8')).shaders ?? {};
  const materials = JSON.parse(fs.readFileSync(job.materialsOut, 'utf8'));

  const dropped = [];
  const shipped = entries.filter((e) => {
    if (!e.foil) return true;
    const present = new Set(result.present[e.bundle] ?? []);
    const why = misfiled.includes(e)
      ? 'texture outside its set folder'
      : !textureNames(e).every((name) => present.has(name))
        ? 'texture missing or undecodable'
        : !shaders[e.shader]
          ? `shader ${e.shader} not exported`
          : null;
    if (why) dropped.push(`${e.tcglId}: ${why}`);
    return !why;
  });
  for (const e of shipped) {
    if (!e.foil) continue;
    if (!materials.materials[e.material]) {
      const sameShader = Object.keys(materials.materials).find((name) => materials.materials[name].shader === e.shader);
      if (sameShader) e.material = sameShader;
    }
    if (e.cc && !materials.textures[e.cc]) e.cc = '';
  }
  const manifest = buildManifest(shipped);
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest)}\n`);

  for (const failure of result.failed) console.warn(`failed ${failure.bundle}: ${failure.error}`);
  for (const line of dropped.slice(0, 40)) console.warn(`dropped ${line}`);
  console.log(
    `manifest: ${Object.keys(manifest.cards).length} foil, ${manifest.flat.length} flat; dropped ${dropped.length}; ` +
      `materials ${result.materials}, material textures ${result.textures}; ` +
      `written ${(result.bytes / 1e6).toFixed(1)} MB; assets ${(dirBytes(OUT_DIR) / 1e9).toFixed(2)} GB`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
