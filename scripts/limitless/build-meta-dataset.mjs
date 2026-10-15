#!/usr/bin/env node
/**
 * Bakes the deck-suggestion dataset (design 069) from limitlesstcg.com:
 *   Standard events from the last 12 months → the contiguous run of the newest rotation
 *   (format code "TEF-…") → Masters standings joined to their decklists → cards resolved on TCGdex
 *   → client/src/assets/meta/limitless-standard.json (schema v1).
 *
 * Usage: pnpm meta:refresh [--refresh] [--out <path>]
 *   --refresh  ignore the parsed-page cache in .cache/limitless/ and fetch everything again.
 * Limitless is fetched one request at a time, 2 s apart. TCGdex responses cache in .cache/tcgdex/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATASET_VERSION, nameKey } from '../../client/src/setup/deck-builder/core/deck-suggest/dataset.mjs';
import { buildSetCardIdCandidates, resolveTcgdexSetId } from '../../shared/engine/rules/legacy-set-ids.mjs';
import { fetchCard, fetchSet } from '../lib/decklist-lines.mjs';
import { cardKeyOf, kindOf } from './card-key.mjs';
import { cardText, tagsForText } from './card-tags.mjs';
import { parseDecklists, parseEventIndex, parseEventPage } from './parse-limitless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://limitlesstcg.com';
const INDEX_URL = `${BASE}/tournaments?time=12months&show=500`;
const USER_AGENT = 'ptcg-sim-deck-suggest (+https://github.com/Ar1ssi/vibecodepokemontcg2)';
const REQUEST_GAP_MS = 2000;
const DEFAULT_OUT = join(ROOT, 'client/src/assets/meta/limitless-standard.json');
const CACHE_DIR = join(ROOT, '.cache/limitless');

// Limitless keeps adding lists for a few days after an event; younger events are always refetched.
const SETTLE_DAYS = 14;
const DAY_MS = 86_400_000;

export { DATASET_VERSION };
const normalizeName = nameKey;

/** True once an event is old enough that its pages will not change, so caching them is safe. */
export function isSettled(eventDate, now = Date.now(), settleDays = SETTLE_DAYS) {
  const date = Date.parse(eventDate);
  return Number.isFinite(date) && now - date >= settleDays * DAY_MS;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Newest-first events (each with `date` and `formatCode`) → the contiguous run sharing the newest
 * event's rotation code (the part of "TEF-30C" before the dash). Events without a format code
 * (unparsed header) are skipped, not treated as a boundary.
 */
export function selectRotationEvents(events = []) {
  const dated = events
    .filter((event) => event?.formatCode)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!dated.length) return { rotation: null, events: [] };
  const rotation = dated[0].formatCode.split('-')[0];
  const kept = [];
  for (const event of dated) {
    if (event.formatCode.split('-')[0] !== rotation) break;
    kept.push(event);
  }
  return { rotation, events: kept };
}

/**
 * Masters standings + decklists of one event → one row per joined list. A list joins the standing
 * with the same placing and player name. `dropped` = lists with no such standing; `missing` =
 * standings that link a list the decklists page did not have.
 */
export function joinEvent(page, lists) {
  const byPlacing = new Map(page.standings.map((row) => [row.placing, row]));
  const joined = new Set();
  const rows = [];
  let dropped = 0;
  for (const list of lists) {
    const standing = byPlacing.get(list.placing);
    if (!standing || joined.has(list.placing) || normalizeName(standing.player) !== normalizeName(list.player)) {
      dropped += 1;
      continue;
    }
    joined.add(list.placing);
    rows.push({
      placing: list.placing,
      archetypeId: standing.archetypeId,
      archetypeName: standing.archetypeName,
      cards: list.cards,
    });
  }
  const missing = page.standings.filter((row) => row.listId && !joined.has(row.placing)).length;
  return { rows, dropped, missing };
}

/**
 * Joined events → dataset v1. `resolvePrint({ set, number, name })` returns the TCGdex record for that
 * printing (or null). Throws listing every line it could not resolve.
 */
export async function assembleDataset({ events, resolvePrint, generatedAt, rotation }) {
  const printLines = new Map();
  for (const event of events) {
    for (const row of event.rows) {
      for (const card of row.cards) {
        const id = `${card.set} ${card.number}`;
        if (!printLines.has(id)) printLines.set(id, card);
      }
    }
  }

  const resolved = new Map();
  const unresolved = [];
  await runPool([...printLines.entries()], 6, async ([id, line]) => {
    const record = await resolvePrint(line);
    if (record) resolved.set(id, record);
    else unresolved.push(`${id} ${line.name}`);
  });
  if (unresolved.length) {
    throw new Error(`TCGdex could not resolve ${unresolved.length} card line(s):\n  ${unresolved.sort().join('\n  ')}`);
  }

  const cardsByKey = new Map();
  const cardFor = (line) => {
    const record = resolved.get(`${line.set} ${line.number}`);
    const key = cardKeyOf(record);
    if (!cardsByKey.has(key)) {
      cardsByKey.set(key, {
        key,
        record,
        kind: kindOf(record),
        printCopies: new Map(),
        printSource: new Map(),
        printPrices: new Map(),
      });
    }
    const entry = cardsByKey.get(key);
    entry.printCopies.set(record.id, (entry.printCopies.get(record.id) || 0) + line.count);
    if (!entry.printSource.has(record.id)) entry.printSource.set(record.id, { set: line.set, number: line.number, record });
    if (Number.isFinite(line.priceUsd)) {
      if (!entry.printPrices.has(record.id)) entry.printPrices.set(record.id, []);
      entry.printPrices.get(record.id).push(line.priceUsd);
    }
    return entry;
  };

  const archetypeIndex = new Map();
  const archetypeNames = new Map();
  const listsRaw = [];
  events.forEach((event, eventIdx) => {
    for (const row of event.rows) {
      const counts = new Map();
      for (const line of row.cards) {
        const entry = cardFor(line);
        counts.set(entry.key, (counts.get(entry.key) || 0) + line.count);
      }
      if (row.archetypeId != null) {
        if (!archetypeNames.has(row.archetypeId)) archetypeNames.set(row.archetypeId, new Map());
        const names = archetypeNames.get(row.archetypeId);
        names.set(row.archetypeName, (names.get(row.archetypeName) || 0) + 1);
      }
      listsRaw.push({ e: eventIdx, p: row.placing, archetypeId: row.archetypeId, counts });
    }
  });

  const entries = [...cardsByKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const keyIndex = new Map(entries.map((entry, idx) => [entry.key, idx]));
  const printIndex = {};
  const cards = entries.map((entry, idx) => {
    const [print] = [...entry.printCopies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const source = entry.printSource.get(print[0]);
    for (const printId of entry.printCopies.keys()) printIndex[printId] = idx;
    const medians = [...entry.printPrices.values()].map(median);
    return {
      key: entry.key,
      name: source.record.name,
      kind: entry.kind,
      print: print[0],
      set: source.set,
      number: source.number,
      image: source.record.image || null,
      abilities: (source.record.abilities || []).map((ability) => ability?.name).filter(Boolean),
      tags: tagsForText(cardText(source.record)),
      price: medians.length ? round2(Math.min(...medians)) : null,
    };
  });

  const archetypes = [...archetypeNames.entries()]
    .map(([id, names]) => [id, [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]])
    .sort((a, b) => a[0] - b[0]);
  archetypes.forEach(([id], idx) => archetypeIndex.set(id, idx));

  const lists = listsRaw.map((list) => ({
    e: list.e,
    p: list.p,
    a: list.archetypeId == null ? -1 : archetypeIndex.get(list.archetypeId),
    c: [...list.counts.entries()]
      .map(([key, count]) => [keyIndex.get(key), count])
      .sort((a, b) => a[0] - b[0])
      .flat(),
  }));

  const dates = events.map((event) => event.date).sort();
  return {
    version: DATASET_VERSION,
    generatedAt,
    source: 'limitlesstcg.com',
    format: 'standard',
    rotation,
    window: { from: dates[0] || null, to: dates.at(-1) || null },
    events: events.map(({ id, name, date, players }) => ({ id, name, date, players })),
    archetypes: archetypes.map(([id, name]) => ({ id, name })),
    cards,
    printIndex,
    lists,
  };
}

async function runPool(items, size, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}

const isNotFound = (error) => /\(404\)$/.test(error?.message || '');

/**
 * TCGdex record for a Limitless print line, checking the name so a wrong id is never accepted.
 * Numbering can differ between the two (Limitless MEE 10 Fire Energy is TCGdex mee-002), so when no
 * id candidate matches, a card with the same name in the same TCGdex set is used — only if unique.
 */
export async function resolvePrintOnTcgdex(
  { set, number, name },
  { fetchRecord = fetchCard, fetchSetRecord = fetchSet } = {}
) {
  const wanted = normalizeName(name);
  for (const id of buildSetCardIdCandidates(set, number)) {
    let record;
    try {
      record = await fetchRecord(id);
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
    if (record && normalizeName(record.name) === wanted) return record;
  }

  const setId = resolveTcgdexSetId(set);
  if (!setId) return null;
  let setRecord;
  try {
    setRecord = await fetchSetRecord(setId);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const sameName = (setRecord?.cards || []).filter((card) => normalizeName(card.name) === wanted);
  return sameName.length === 1 ? fetchRecord(sameName[0].id) : null;
}

// ---- network shell -------------------------------------------------------------------------

let lastRequestAt = 0;

/** Backoff before retry `attempt` (0-based): Retry-After seconds when the server sent one. */
export function retryDelayMs(attempt, retryAfterHeader = null) {
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 120) * 1000;
  return 2000 * 2 ** attempt;
}

const isRetryableStatus = (status) => status === 429 || status >= 500;

async function politeFetchText(url) {
  for (let attempt = 0; ; attempt += 1) {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    lastRequestAt = Date.now();
    let retryAfter = null;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return await res.text();
      if (!isRetryableStatus(res.status) || attempt >= 3) {
        const error = new Error(`Limitless ${res.status} for ${url}`);
        error.fatal = true;
        throw error;
      }
      retryAfter = res.headers.get('retry-after');
    } catch (error) {
      if (error.fatal || attempt >= 3) throw error;
    }
    await new Promise((done) => setTimeout(done, retryDelayMs(attempt, retryAfter)));
  }
}

function readCache(kind, id, refresh) {
  const file = join(CACHE_DIR, kind, `${id}.json`);
  if (refresh || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeCache(kind, id, value) {
  const file = join(CACHE_DIR, kind, `${id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

async function loadEventPage(event, refresh) {
  const cached = isSettled(event.date) ? readCache('pages', event.id, refresh) : null;
  if (cached) return cached;
  const url = `${BASE}/tournaments/${event.id}`;
  const page = parseEventPage(await politeFetchText(url));
  if (!page.standings.length) throw new Error(`No standings parsed for ${url} — markup changed?`);
  if (isSettled(event.date)) writeCache('pages', event.id, page);
  return page;
}

async function loadDecklists(event, refresh) {
  const cached = isSettled(event.date) ? readCache('lists', event.id, refresh) : null;
  if (cached) return cached;
  const url = `${BASE}/tournaments/${event.id}/decklists`;
  const lists = parseDecklists(await politeFetchText(url));
  if (!lists.length) throw new Error(`No decklists parsed for ${url} — markup changed?`);
  if (isSettled(event.date)) writeCache('lists', event.id, lists);
  return lists;
}

async function main(argv) {
  const refresh = argv.includes('--refresh');
  const outArg = argv.indexOf('--out');
  const outPath = outArg >= 0 ? resolve(argv[outArg + 1]) : DEFAULT_OUT;
  process.env.TCGDEX_CACHE_DIR ||= join(ROOT, '.cache/tcgdex');

  const index = parseEventIndex(await politeFetchText(INDEX_URL)).filter((event) => event.format === 'standard');
  if (!index.length) throw new Error(`No Standard events parsed from ${INDEX_URL} — markup changed?`);
  console.log(`${index.length} Standard events in the last 12 months`);

  const withPages = [];
  for (const event of index) {
    const page = await loadEventPage(event, refresh);
    if (!page.standings.some((row) => row.listId)) {
      console.warn(`skip ${event.id} ${event.name}: no decklists published yet`);
      continue;
    }
    withPages.push({ ...event, formatCode: page.formatCode, page });
  }

  const { rotation, events: inRotation } = selectRotationEvents(withPages);
  if (!rotation) throw new Error('No event with a format code — markup changed?');
  console.log(`rotation ${rotation}: ${inRotation.length} events`);

  const events = [];
  for (const event of inRotation) {
    const { rows, dropped, missing } = joinEvent(event.page, await loadDecklists(event, refresh));
    const notes = [dropped && `${dropped} lists without a standing`, missing && `${missing} standings without a list`];
    console.log(`  ${event.date} ${event.name}: ${rows.length} lists${notes.filter(Boolean).map((n) => `, ${n}`).join('')}`);
    events.push({ id: event.id, name: event.name, date: event.date, players: event.players, rows });
  }

  const dataset = await assembleDataset({
    events,
    rotation,
    generatedAt: new Date().toISOString(),
    resolvePrint: (line) => resolvePrintOnTcgdex(line),
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(dataset)}\n`);
  console.log(`wrote ${outPath}: ${dataset.lists.length} lists, ${dataset.cards.length} cards`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
