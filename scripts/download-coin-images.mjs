// Scrape the coin scans Bulbapedia publishes, download them, and link them into
// the catalog by description. Uses plain `fetch` (Playwright navigation hangs on
// bulbapedia.bulbagarden.net).
//
//   node scripts/download-coin-images.mjs [--dry-run] [--no-link] [--full-size]
//                                         [--limit N] [--out DIR] [--from-file rows.json]
//
// Default downloads the 120px thumbnails (~37 KB each) — the picker renders coins at
// 84-120px — into client/src/assets/coins/historical/, writes manifest.json, then points
// every matched coin's url/thumb at the local file. `--no-link` stops after the manifest.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildManifest,
  matchManifestToCoins,
  parseCoinTables,
} from '../client/src/setup/deck-builder/core/coin-image-manifest.mjs';
import { getCoins } from '../client/src/setup/deck-builder/core/coins.mjs';
import { renderCatalog } from './normalize-coin-catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, '../client/src/assets/coins/historical');
const CATALOG_PATH = resolve(HERE, '../client/src/setup/deck-builder/core/coins.mjs');

const PAGES = [
  'https://bulbapedia.bulbagarden.net/wiki/Coin_(TCG)/Generations_I-IV',
  'https://bulbapedia.bulbagarden.net/wiki/Coin_(TCG)/Generations_V-VI',
  'https://bulbapedia.bulbagarden.net/wiki/Coin_(TCG)/Generations_VII-VIII',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

function parseArgs(argv) {
  const options = { dryRun: false, link: true, fullSize: false, limit: Infinity, out: DEFAULT_OUT, fromFile: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-link') options.link = false;
    else if (arg === '--full-size') options.fullSize = true;
    else if (arg === '--limit') {
      const value = Number(argv[++i]);
      options.limit = Number.isFinite(value) && value >= 0 ? value : Infinity;
    } else if (arg === '--out') options.out = resolve(process.cwd(), argv[++i] || '.');
    else if (arg === '--from-file') options.fromFile = resolve(process.cwd(), argv[++i] || '');
  }
  return options;
}

async function scrapeRows() {
  const rows = [];
  for (const url of PAGES) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      rows.push(...parseCoinTables(await response.text()));
      console.log(`  parsed ${url}`);
    } catch (error) {
      console.error(`  skipped ${url}: ${error.message}`);
    }
  }
  return rows;
}

async function downloadImage(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destination, buffer);
  return buffer.length;
}

async function downloadAll(entries, options) {
  const queue = entries.slice(0, options.limit);
  const results = { downloaded: 0, skipped: 0, failed: 0 };
  const CONCURRENCY = 6;
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const entry = queue[cursor++];
      const destination = resolve(options.out, entry.fileName);
      if (existsSync(destination)) {
        results.skipped += 1;
        continue;
      }
      try {
        await downloadImage(entry.sourceUrl, destination);
        results.downloaded += 1;
      } catch (error) {
        results.failed += 1;
        console.error(`  failed ${entry.fileName}: ${error.message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return results;
}

function linkCatalog(manifest) {
  const source = readFileSync(CATALOG_PATH, 'utf8');
  const coins = getCoins();
  const { matches, unmatched } = matchManifestToCoins(manifest, coins);
  const byId = new Map(matches.map((m) => [m.coinId, m.fileName]));

  let linked = 0;
  for (const coin of coins) {
    const fileName = byId.get(coin.id);
    if (!fileName) continue;
    const local = `src/assets/coins/historical/${fileName}`;
    if (coin.url !== local) {
      coin.url = local;
      coin.thumb = local;
      linked += 1;
    }
  }

  const next = renderCatalog(source, coins);
  if (next !== source) writeFileSync(CATALOG_PATH, next, 'utf8');

  console.log(`Linked ${linked} coins; ${unmatched.length} coins without a wiki scan remain placeholders.`);
  return { linked, unmatched };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const rows = options.fromFile
    ? JSON.parse(readFileSync(options.fromFile, 'utf8'))
    : await scrapeRows();
  if (!Array.isArray(rows)) throw new Error('--from-file must contain a JSON array');

  // parseCoinTables already scopes to coin tables, so don't also require "Coin" in the
  // filename — a few scans (2022 stacking tins) don't have it.
  const manifest = buildManifest(rows, {
    requireCoinInName: false,
    fullSize: options.fullSize,
  });
  console.log(`Scraped ${rows.length} rows -> ${manifest.length} unique coin images`);

  if (!options.dryRun) {
    mkdirSync(options.out, { recursive: true });
    writeFileSync(resolve(options.out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  if (options.dryRun) {
    manifest.slice(0, options.limit).forEach((entry) => console.log(`  [dry-run] ${entry.fileName}`));
    console.log(`Dry run: ${manifest.length} images would go to ${options.out}`);
    return;
  }

  const results = await downloadAll(manifest, options);
  console.log(`Downloaded ${results.downloaded}, skipped ${results.skipped}, failed ${results.failed} -> ${options.out}`);

  if (options.link) linkCatalog(manifest);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
