// Batch-download the coin scans Bulbapedia actually publishes and record them in a
// manifest. This NEVER edits the coin catalog: a human reviews `manifest.json` and
// links the few available scans by hand, so a wrong image can't be auto-attached.
//
//   node scripts/download-coin-images.mjs [--dry-run] [--limit N] [--out DIR]
//
// Output defaults to client/src/assets/coins/historical/ (distinct from the
// `bulbapedia/` placeholder paths, so isPlaceholderCoin() stays correct).

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

import { buildManifest } from '../client/src/setup/deck-builder/core/coin-image-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, '../client/src/assets/coins/historical');

const PAGES = [
  'https://bulbapedia.bulbagarden.net/wiki/Coin_(TCG)/Generations_I-IV',
  'https://bulbapedia.bulbagarden.net/wiki/Coin_(TCG)/Generations_V-VI',
  'https://bulbapedia.bulbagarden.net/wiki/Coin_(TCG)/Generations_VII-VIII',
];

function parseArgs(argv) {
  const options = { dryRun: false, limit: Infinity, out: DEFAULT_OUT, fromFile: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--limit') {
      const value = Number(argv[++i]);
      options.limit = Number.isFinite(value) && value >= 0 ? value : Infinity;
    }
    else if (arg === '--out') options.out = resolve(process.cwd(), argv[++i] || '.');
    else if (arg === '--from-file') options.fromFile = resolve(process.cwd(), argv[++i] || '');
  }
  return options;
}

async function scrapePage(page, url) {
  console.log(`Scraping ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000); // let lazy-loaded table thumbnails settle

  return page.evaluate(() => {
    const rows = [];
    for (const tr of document.querySelectorAll('table.wikitable tbody tr')) {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 2) continue;
      const name = cells[0]?.textContent?.trim() ?? '';
      const release = cells[1]?.textContent?.trim() ?? '';
      const img = tr.querySelector('img');
      if (!name || !img?.src) continue;
      rows.push({ name, release, imageUrl: img.src });
    }
    return rows;
  });
}

async function downloadImage(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destination, buffer);
  return buffer.length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const rows = [];
  if (options.fromFile) {
    const parsed = JSON.parse(readFileSync(options.fromFile, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('--from-file must contain a JSON array');
    rows.push(...parsed);
  } else {
    const browser = await chromium.launch();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    try {
      for (const url of PAGES) {
        try {
          rows.push(...(await scrapePage(page, url)));
        } catch (error) {
          console.error(`  skipped ${url}: ${error.message}`);
        }
      }
    } finally {
      await browser.close();
    }
  }

  const manifest = buildManifest(rows);
  console.log(`Scraped ${rows.length} rows -> ${manifest.length} coin images in manifest`);

  if (!options.dryRun) {
    mkdirSync(options.out, { recursive: true });
    writeFileSync(
      resolve(options.out, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8'
    );
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of manifest.slice(0, options.limit)) {
    const destination = resolve(options.out, entry.fileName);
    if (options.dryRun) {
      console.log(`  [dry-run] ${entry.fileName} <- ${entry.sourceUrl}`);
      continue;
    }
    if (existsSync(destination)) {
      skipped += 1;
      continue;
    }
    try {
      const bytes = await downloadImage(entry.sourceUrl, destination);
      downloaded += 1;
      console.log(`  saved ${entry.fileName} (${bytes} bytes)`);
    } catch (error) {
      failed += 1;
      console.error(`  failed ${entry.fileName}: ${error.message}`);
    }
  }

  console.log(
    options.dryRun
      ? `Dry run: ${manifest.length} images would be processed in ${options.out}`
      : `Downloaded ${downloaded}, skipped ${skipped}, failed ${failed} -> ${options.out}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
