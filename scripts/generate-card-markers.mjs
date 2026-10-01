/**
 * Bakes shared/engine/rules/card-markers.generated.mjs (I220, design 061 Group E): every printing
 * that carries a marker TCGdex has no field for — Tera, Team Plasma, Single/Rapid/Fusion Strike,
 * Baby, Prism Star, TAG TEAM — keyed by TCGdex card id. The printings come from pkmncards.com's
 * `is:` / `stage:` searches (the same site as the out/ corpora); each is matched to a TCGdex card
 * of its set by collector number AND name; a printing that does not match is skipped and reported
 * (reprint collections TCGdex numbers differently), never tagged onto another card.
 * Run: node scripts/generate-card-markers.mjs            (rewrite the module)
 *      node scripts/generate-card-markers.mjs --check    (re-fetch; exit 1 when the module would change)
 * TCGDEX_CACHE_DIR=<dir> keeps TCGdex responses between runs (development only).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSet } from './lib/decklist-lines.mjs';
import { fetchText, pageUrl, parseCards } from './scrape-pkmncards.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../shared/engine/rules/card-markers.generated.mjs');
const TCGDEX_SETS_URL = 'https://api.tcgdex.net/v2/en/sets';
const MAX_PAGES = 20;

// Marker → the pkmncards search that lists its printings.
export const MARKER_QUERIES = {
  Tera: 'is:tera',
  'Team Plasma': 'is:team-plasma',
  'Single Strike': 'is:single-strike',
  'Rapid Strike': 'is:rapid-strike',
  'Fusion Strike': 'is:fusion-strike',
  Baby: 'stage:baby',
  'Prism Star': 'is:prism-star',
  'TAG TEAM': 'is:tag-team',
};

// pkmncards set names TCGdex spells differently.
const SET_NAME_ALIASES = {
  'sword & shield promos': 'swshp',
  'sun & moon promos': 'smp',
  'black & white promos': 'bwp',
  'scarlet & violet promos': 'svp',
  expedition: 'ecard1',
};

// Letters and digits only: "Pikachu & Zekrom-GX" = "Pikachu & Zekrom GX", "Lugia {*}" = "Lugia ◇".
export const nameKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\{\*\}|◇|prism star/g, '')
    .replace(/[^a-z0-9]/g, '');

// "007" = "7", "SWSH123" = "swsh123", "TG18" = "tg18".
export const numberKey = (number) =>
  String(number || '')
    .trim()
    .toLowerCase()
    .replace(/^([a-z]*)0*(\d)/, '$1$2');

async function scrapeQuery(query) {
  const base = `https://pkmncards.com/?s=${encodeURIComponent(query)}&sort=date&ord=auto&display=text`;
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let html;
    try {
      html = await fetchText(pageUrl(base, page));
    } catch (err) {
      if (page > 1 && /^404 /.test(err.message)) break;
      throw err;
    }
    const cards = parseCards(html);
    if (cards.length === 0) break;
    all.push(...cards);
  }
  if (all.length === 0) throw new Error(`pkmncards returned no printings for ${query}`);
  return all;
}

async function fetchSetIndex() {
  const res = await fetch(TCGDEX_SETS_URL);
  if (!res.ok) throw new Error(`TCGdex sets fetch failed (${res.status})`);
  const sets = await res.json();
  const byName = new Map(Object.entries(SET_NAME_ALIASES));
  for (const set of sets) {
    const key = String(set.name).toLowerCase();
    if (!byName.has(key)) byName.set(key, set.id);
  }
  return byName;
}

// Trainer Gallery / Galarian Gallery numbers ("TG18", "GG12") live in TCGdex's own subsets
// (swsh9tg, swsh12.5gg), not in the main set pkmncards names.
export function gallerySetId(setIds, printing) {
  const prefix = String(printing.number || '').match(/^(tg|gg)\d/i)?.[1]?.toLowerCase();
  const main = setIds.get(String(printing.set).toLowerCase());
  if (!prefix || !main) return null;
  const gallery = `${main}${prefix}`;
  return [...setIds.values()].includes(gallery) ? gallery : null;
}

/** The TCGdex id of a pkmncards printing, or an Error naming why it has none. */
export function matchPrinting(printing, setCards) {
  const wanted = numberKey(printing.number);
  const card = setCards.find((c) => numberKey(c.localId) === wanted);
  if (!card) return new Error(`no #${printing.number} in its TCGdex set`);
  if (nameKey(card.name) !== nameKey(printing.name)) {
    return new Error(`TCGdex ${card.id} is "${card.name}"`);
  }
  return card.id;
}

export async function collectCardMarkers({
  scrape = scrapeQuery,
  setIndex = fetchSetIndex,
  setCards = async (setId) => (await fetchSet(setId))?.cards || [],
} = {}) {
  const setIds = await setIndex();
  const markers = {};
  const failures = [];
  for (const [marker, query] of Object.entries(MARKER_QUERIES)) {
    for (const printing of await scrape(query)) {
      const label = `${marker}: ${printing.name} (${printing.set} ${printing.number})`;
      const setId = gallerySetId(setIds, printing) || setIds.get(String(printing.set).toLowerCase());
      if (!setId) {
        failures.push(`${label}: set not on TCGdex`);
        continue;
      }
      const id = matchPrinting(printing, await setCards(setId));
      if (id instanceof Error) {
        failures.push(`${label}: ${id.message}`);
        continue;
      }
      markers[id] = [...new Set([...(markers[id] || []), marker])].sort();
    }
  }
  return { markers, failures };
}

export function renderCardMarkersModule(markers) {
  const lines = Object.keys(markers)
    .sort()
    .map((id) => `  '${id}': [${markers[id].map((m) => `'${m}'`).join(', ')}],`);
  return [
    '// Generated by scripts/generate-card-markers.mjs (I220) — do not edit by hand.',
    '// Printed markers TCGdex has no field for, keyed by TCGdex card id. Source: pkmncards.com',
    '// `is:`/`stage:` searches, each printing matched to its TCGdex set by number and name.',
    'export const CARD_MARKERS = Object.freeze({',
    ...lines,
    '});',
    '',
  ].join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const { markers, failures } = await collectCardMarkers();
  // Printings TCGdex lacks (reprint collections, some promos) are reported, not fatal: a card
  // that is not on TCGdex cannot be in a deck either.
  for (const failure of failures) console.warn(`skipped ${failure}`);
  const next = renderCardMarkersModule(markers);
  if (check) {
    const current = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
    if (current !== next) {
      console.error('card-markers.generated.mjs is out of date: run node scripts/generate-card-markers.mjs');
      process.exitCode = 1;
      return;
    }
    console.log('card-markers.generated.mjs is up to date');
    return;
  }
  writeFileSync(OUT, next);
  console.log(`wrote ${Object.keys(markers).length} marked printings to ${OUT} (${failures.length} skipped)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
