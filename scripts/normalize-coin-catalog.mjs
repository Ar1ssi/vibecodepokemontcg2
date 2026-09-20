// One-shot / repeatable normalizer for client/src/setup/deck-builder/core/coins.mjs.
//
// The S218 Bulbapedia merge (commit a9bb70a) produced a catalog with duplicate ids,
// a polluted `release` field ("date\t<date>"), and metal coins misclassified as enamel.
// This script applies a deterministic, idempotent transform and rewrites the data block,
// preserving the file header/footer and each entry's key order.
//
//   node scripts/normalize-coin-catalog.mjs [--check]
//
// `--check` exits 1 if a rewrite would change anything (CI guard) without writing.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { getCoins } from '../client/src/setup/deck-builder/core/coins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(HERE, '../client/src/setup/deck-builder/core/coins.mjs');

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** Strip the scraper's "date" label/tab and collapse whitespace. */
export function cleanRelease(value) {
  const cleaned = String(value ?? '')
    .replace(/^\s*date\b[:\s]*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/** "July 20, 2001" -> "20010720"; "May 2010" -> "201005"; unparsable -> "". */
export function compactDateStamp(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const full = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (full) {
    const month = MONTHS[full[1].toLowerCase()];
    if (month) return `${full[3]}${month}${String(full[2]).padStart(2, '0')}`;
  }

  const monthYear = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase()];
    if (month) return `${monthYear[2]}${month}`;
  }

  const digits = text.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(0, 8) : '';
}

/** Correct the material when the coin's own text says what it is. */
export function inferMaterial(coin) {
  const haystack = `${coin?.name ?? ''} ${coin?.description ?? ''}`;
  if (/\bcardboard\b/i.test(haystack)) return 'cardboard';
  if (/\bmetal\b/i.test(haystack)) return 'metal';
  return coin?.material ?? 'enamel';
}

const uniqueId = (base, stamp, used) => {
  if (!used.has(base)) return base;
  const suffix = stamp || 'nd';
  let candidate = `${base}_${suffix}`;
  let counter = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix}_${counter++}`;
  return candidate;
};

/**
 * Apply the full transform. Pure: returns new coin objects and a report.
 * @param {object[]} input
 */
export function normalizeCoins(input) {
  const seenSignatures = new Set();
  const usedIds = new Set();
  const coins = [];
  let dropped = 0;
  let rekeyed = 0;
  let cleaned = 0;
  let reclassified = 0;

  for (const original of input) {
    const signature = JSON.stringify(original);
    if (seenSignatures.has(signature)) {
      dropped += 1;
      continue;
    }
    seenSignatures.add(signature);

    const coin = { ...original };
    const release = cleanRelease(coin.release);
    if (release !== (coin.release ?? '')) {
      if (release) coin.release = release;
      else delete coin.release;
      cleaned += 1;
    }

    const material = inferMaterial(coin);
    if (material !== coin.material) {
      coin.material = material;
      reclassified += 1;
    }

    const base = String(coin.id ?? '').trim() || `COIN_${coins.length + 1}`;
    const id = uniqueId(base, compactDateStamp(coin.releaseDate), usedIds);
    if (id !== base) rekeyed += 1;
    coin.id = id;
    usedIds.add(id);

    coins.push(coin);
  }

  return { coins, report: { total: coins.length, dropped, rekeyed, cleaned, reclassified } };
}

/** Rebuild the `const COIN_CATALOG = [...]` block, preserving header, footer and EOL style. */
export function renderCatalog(source, coins) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lfSource = source.replace(/\r\n/g, '\n');

  const startMarker = 'const COIN_CATALOG = [';
  const start = lfSource.indexOf(startMarker);
  if (start === -1) throw new Error('COIN_CATALOG array not found in catalog');

  const endMarker = '\n];';
  const end = lfSource.indexOf(endMarker, start);
  if (end === -1) throw new Error('COIN_CATALOG array terminator not found');

  // Serialize the whole array at indent 1, then drop the outer [ ] lines so the
  // result slots back under `const COIN_CATALOG = [`.
  const serialized = JSON.stringify(coins, null, 1);
  const inner = serialized.slice(serialized.indexOf('\n') + 1, serialized.lastIndexOf('\n'));

  const rebuilt =
    lfSource.slice(0, start) +
    startMarker +
    '\n' +
    inner +
    endMarker +
    lfSource.slice(end + endMarker.length);

  return eol === '\n' ? rebuilt : rebuilt.replace(/\n/g, eol);
}

function main() {
  const check = process.argv.includes('--check');
  const source = readFileSync(CATALOG_PATH, 'utf8');
  const { coins, report } = normalizeCoins(getCoins());
  const next = renderCatalog(source, coins);

  console.log('Coin catalog normalization report:');
  console.log(`  entries:        ${report.total}`);
  console.log(`  duplicates cut: ${report.dropped}`);
  console.log(`  ids re-keyed:   ${report.rekeyed}`);
  console.log(`  releases fixed: ${report.cleaned}`);
  console.log(`  materials fixed:${report.reclassified}`);

  if (next === source) {
    console.log('Catalog already normalized - no changes.');
    return;
  }

  if (check) {
    console.error(
      'Catalog is NOT normalized (run without --check to rewrite).'
    );
    process.exit(1);
  }

  writeFileSync(CATALOG_PATH, next, 'utf8');
  console.log(`Wrote ${CATALOG_PATH}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
