// Custom sets served as TCGdex records (design 075). The sets live in the repo as
// client/src/assets/custom-sets/<setId>/set.json plus the card fronts next to them. The TCGdex
// proxy is the one place every browser card lookup passes (D164), so answering custom ids there
// makes the deck builder, set browser, enrichment and rules engine treat a custom card exactly
// like a published one: same record shape, same parsers, nothing else to teach.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

import {
  DEFAULT_CUSTOM_SET_GROUP,
  isCustomCardId,
  isCustomSetId,
  validateCustomSet,
} from '../shared/custom-sets/custom-set-schema.mjs';
import { PTCGL_SET_IDS } from '../client/src/setup/deck-builder/core/deck-text-import.mjs';
import { LEGACY_SET_CODE_TO_TCGDEX_ID } from '../shared/engine/rules/legacy-set-ids.mjs';

export const CUSTOM_SERIES = Object.freeze({ id: 'custom', name: 'Custom Sets' });
// A custom code must not shadow a printed set's decklist code ("4 Pikachu ex SVI 57"): printed wins in resolveEntry.
export const RESERVED_SET_CODES = Object.freeze([...Object.keys(PTCGL_SET_IDS), ...Object.keys(LEGACY_SET_CODE_TO_TCGDEX_ID)]);
// A set.json is a few hundred KB at most; anything bigger is a mistake, not a set, and is skipped at boot.
export const MAX_SET_JSON_BYTES = 4 << 20;

const gzipAsync = promisify(gzip);
const noStore = (status, body) => ({ status, body, cacheControl: 'no-store', gzip: null });
const json = (status, value) => noStore(status, JSON.stringify(value));
const NOT_FOUND = '{"error":"custom_card_not_found"}';

function setRecordOf(set) {
  const total = set.cards.length;
  return {
    id: set.id,
    name: set.name,
    serie: { ...CUSTOM_SERIES },
    releaseDate: set.releaseDate || '',
    cardCount: { official: total, total },
    legal: { standard: false, expanded: false },
    abbreviation: { official: set.code },
    logo: '',
    symbol: '',
    // `category` rides along (TCGdex's own set record has none) so the set browser sorts Pokémon from Trainers
    // without the cached /cards?category= lists, which predate any custom set (D226).
    cards: set.cards.map((card) => ({
      id: card.id,
      localId: card.localId,
      name: card.name,
      image: card.image,
      category: card.category,
    })),
  };
}

function setBriefOf(record) {
  return {
    id: record.id,
    name: record.name,
    logo: record.logo,
    symbol: record.symbol,
    cardCount: record.cardCount,
    releaseDate: record.releaseDate,
  };
}

function cardRecordOf(card, set) {
  return {
    ...card,
    set: {
      id: set.id,
      name: set.name,
      cardCount: { official: set.cards.length, total: set.cards.length },
      releaseDate: set.releaseDate || '',
    },
  };
}

function cardBriefOf(card) {
  return { id: card.id, localId: card.localId, name: card.name, image: card.image };
}

/**
 * Reads every `<rootDir>/<setId>/set.json`. A set that fails validation is skipped and reported through
 * `log` (one line); a missing root is an empty store. With `previous`, a set that fails now but loaded
 * before keeps its earlier copy: a half-written or mistyped save must not pull it out of open decks.
 * @param {string} rootDir
 * @param {{ log?: (line: string) => void, previous?: ReturnType<typeof createCustomSetStore> }} [options]
 */
export function loadCustomSets(rootDir, { log = () => {}, previous = null } = {}) {
  const sets = new Map();
  const cards = new Map();
  let dirs = [];
  try {
    dirs = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    dirs = [];
  }
  const add = (entry) => {
    sets.set(entry.set.id, entry);
    for (const card of entry.set.cards) cards.set(card.id, cardRecordOf(card, entry.set));
  };
  const skip = (dir, why) => {
    const kept = previous?.sets.get(dir);
    log(`custom set ${dir} skipped: ${why}${kept ? '; kept the copy loaded before' : ''}`);
    if (kept) add(kept);
  };
  for (const dir of dirs) {
    const file = path.join(rootDir, dir, 'set.json');
    if (!fs.existsSync(file)) continue;
    let parsed;
    try {
      const size = fs.statSync(file).size;
      if (size > MAX_SET_JSON_BYTES) throw new Error(`set.json is ${size} bytes, over ${MAX_SET_JSON_BYTES}`);
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      skip(dir, error instanceof SyntaxError ? `set.json is not valid JSON (${error.message})` : error.message);
      continue;
    }
    const result = validateCustomSet(parsed, { setDirName: dir, reservedCodes: RESERVED_SET_CODES });
    if (!result.ok) {
      skip(dir, result.errors.join('; '));
      continue;
    }
    add({ set: result.set, record: setRecordOf(result.set) });
  }
  return createCustomSetStore({ sets, cards });
}

// What a set folder holds, cheaply: set.json by content (an edit can keep its size and mtime), every other
// file (card fronts, foil) by size and mtime. Two equal signatures mean nothing a browser sees changed.
function setFolderSignature(dir) {
  const parts = [];
  const walk = (folder, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(folder, entry.name);
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        walk(full, `${rel}/`);
        continue;
      }
      try {
        if (rel === 'set.json') {
          parts.push(`${rel}#${createHash('sha1').update(fs.readFileSync(full)).digest('hex')}`);
        } else {
          const stat = fs.statSync(full);
          parts.push(`${rel}:${stat.size}:${stat.mtimeMs}`);
        }
      } catch {
        // removed between the listing and the read: the next pass sees it gone
      }
    }
  };
  walk(dir, '');
  return parts.join('\n');
}

/** `{ <setDir>: signature }` for every folder under the root that holds a set.json. */
export function customSetSignatures(rootDir) {
  const signatures = new Map();
  let dirs = [];
  try {
    dirs = fs.readdirSync(rootDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return signatures;
  }
  for (const { name } of dirs) {
    const dir = path.join(rootDir, name);
    if (fs.existsSync(path.join(dir, 'set.json'))) signatures.set(name, setFolderSignature(dir));
  }
  return signatures;
}

function changedSetDirs(before, after) {
  const dirs = new Set([...before.keys(), ...after.keys()]);
  return [...dirs].filter((dir) => before.get(dir) !== after.get(dir)).sort();
}

/**
 * Custom sets that follow their folder while the server runs: the card editor writes a set into
 * `rootDir` and the next lookups answer the new cards, no restart. A change to a set's files (fs.watch backed
 * by a poll every `safetyPollMs`, else a poll every `pollMs`; settled for `debounceMs` so a many-file write
 * reloads once) reloads every set, keeping a set's last good copy when its set.json is broken (loadCustomSets `previous`), and calls
 * `onChange({ version, sets })` with the changed set folders. Same read interface as createCustomSetStore.
 * @param {string} rootDir
 * @param {{ log?: (line: string) => void, onChange?: (change: { version: number, sets: string[] }) => void,
 *   watch?: boolean, debounceMs?: number, pollMs?: number, safetyPollMs?: number }} [options]
 */
export function createLiveCustomSets(
  rootDir,
  { log = () => {}, onChange = () => {}, watch = true, debounceMs = 300, pollMs = 2000, safetyPollMs = 15000 } = {}
) {
  // signatures before the load: a write landing in between is then seen as a change by the next pass
  let signatures = customSetSignatures(rootDir);
  let store = loadCustomSets(rootDir, { log });
  let version = 0;
  let watcher = null;
  let poller = null;
  let settleTimer = null;

  // Runs from timers: a throw here would take the whole game server down, so it is logged and retried next pass.
  function reload() {
    try {
      return reloadChanged();
    } catch (error) {
      log(`custom sets: reload failed (${error.message}); keeping the sets loaded before`);
      return null;
    }
  }

  function reloadChanged() {
    const next = customSetSignatures(rootDir);
    const changed = changedSetDirs(signatures, next);
    if (!changed.length) return null;
    store = loadCustomSets(rootDir, { log, previous: store });
    signatures = next;
    version += 1;
    const change = { version, sets: changed };
    try {
      onChange(change);
    } catch (error) {
      log(`custom sets: change listener failed: ${error.message}`);
    }
    return change;
  }

  function scheduleReload() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(reload, debounceMs);
    settleTimer.unref?.();
  }

  function startPolling(everyMs = pollMs) {
    clearInterval(poller);
    poller = setInterval(reload, everyMs);
    poller.unref?.();
  }

  if (watch) {
    try {
      watcher = fs.watch(rootDir, { recursive: true, persistent: false }, scheduleReload);
      watcher.on('error', (error) => {
        log(`custom sets: watching ${rootDir} failed (${error.message}); checking every ${pollMs} ms instead`);
        watcher.close();
        watcher = null;
        startPolling();
      });
      // a watcher can go quiet without an error (the folder deleted and made again): a slow poll backs it up
      startPolling(safetyPollMs);
    } catch (error) {
      log(`custom sets: cannot watch ${rootDir} (${error.message}); checking every ${pollMs} ms instead`);
      startPolling();
    }
  }

  return {
    live: true,
    get sets() {
      return store.sets;
    },
    get cards() {
      return store.cards;
    },
    size: () => store.size(),
    setRecord: (setId) => store.setRecord(setId),
    card: (cardId) => store.card(cardId),
    setBriefs: () => store.setBriefs(),
    allCards: () => store.allCards(),
    manifest: () => store.manifest(),
    version: () => version,
    reload,
    close() {
      clearTimeout(settleTimer);
      clearInterval(poller);
      poller = null;
      watcher?.close();
      watcher = null;
    },
  };
}

/** A store over already-validated sets (tests build one without a filesystem). */
export function createCustomSetStore({ sets = new Map(), cards = new Map() } = {}) {
  const setList = [...sets.values()].sort((a, b) => a.set.name.localeCompare(b.set.name));
  return {
    sets,
    cards,
    size: () => sets.size,
    setRecord: (setId) => sets.get(setId)?.record ?? null,
    card: (cardId) => cards.get(cardId) ?? null,
    setBriefs: () => setList.map((entry) => setBriefOf(entry.record)),
    allCards: () => [...cards.values()],
    manifest: () => ({
      sets: setList.map(({ set }) => ({
        id: set.id,
        code: set.code,
        name: set.name,
        cardCount: set.cards.length,
        releaseDate: set.releaseDate || '',
        group: set.group || DEFAULT_CUSTOM_SET_GROUP,
      })),
    }),
  };
}

// ---------------------------------------------------------------- TCGdex v2 filter matching
// TCGdex filters a list by `field=value` query pairs, value prefixes picking the operator:
// eq: exact, neq:, like: (default) contains, gte:/lte:/gt:/lt: numeric; case-insensitive.
// Dotted keys reach into objects (set.id); a list field matches when any element does.
const OPERATOR_RE = /^(eq|neq|like|gte|lte|gt|lt|null|notnull):(.*)$/s;
const IGNORED_QUERY_KEYS = /^(pagination|sort):/;

function fieldValues(record, dotted) {
  let values = [record];
  for (const part of dotted.split('.')) {
    const next = [];
    for (const value of values) {
      if (value == null) continue;
      // own properties only: "constructor=like:o" must not read Object.prototype
      if (Array.isArray(value)) {
        for (const item of value) if (item != null && typeof item === 'object' && Object.hasOwn(item, part)) next.push(item[part]);
      } else if (typeof value === 'object' && Object.hasOwn(value, part)) {
        next.push(value[part]);
      }
    }
    values = next;
  }
  return values.flatMap((value) => (Array.isArray(value) ? value : [value])).filter((value) => value != null);
}

function compare(fieldValue, operator, wanted) {
  const have = String(fieldValue).toLowerCase();
  const want = String(wanted).toLowerCase();
  switch (operator) {
    case 'eq':
      return have === want;
    case 'neq':
      return have !== want;
    case 'like':
      return have.includes(want);
    case 'gte':
    case 'lte':
    case 'gt':
    case 'lt': {
      const a = Number(fieldValue);
      const b = Number(wanted);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return operator === 'gte' ? a >= b : operator === 'lte' ? a <= b : operator === 'gt' ? a > b : a < b;
    }
    default:
      return false;
  }
}

/** Whether a custom card record satisfies a TCGdex-style query. */
export function matchesTcgdexQuery(record, params) {
  for (const [key, raw] of params) {
    if (IGNORED_QUERY_KEYS.test(key)) continue;
    const match = OPERATOR_RE.exec(raw);
    const operator = match ? match[1] : 'like';
    const wanted = match ? match[2] : raw;
    const values = fieldValues(record, key);
    if (operator === 'null') {
      if (values.length) return false;
      continue;
    }
    if (operator === 'notnull') {
      if (!values.length) return false;
      continue;
    }
    if (!values.length) return false;
    if (operator === 'neq') {
      if (!values.every((value) => compare(value, 'neq', wanted))) return false;
      continue;
    }
    if (!values.some((value) => compare(value, operator, wanted))) return false;
  }
  return true;
}

function parseCanonicalKey(key) {
  const [pathPart, query = ''] = String(key).split('?');
  return { path: pathPart, params: [...new URLSearchParams(query)] };
}

function parseListBody(body) {
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Wraps the TCGdex proxy: custom ids are answered from the store, list requests get the matching
 * custom entries appended to TCGdex's answer (custom entries alone when TCGdex is down). Same
 * `{ get, size }` interface as createTcgdexProxy, so tcgdexProxyHandler needs no change.
 */
export function withCustomSets(proxy, store) {
  // a live store may gain its first set later, so it always wraps
  if (!store || (!store.live && store.size() === 0)) return proxy;

  // Merged lists are built per request (custom hits in a list query are rare); gzip stays available to the handler.
  async function appendToList(key, extra) {
    const upstream = await proxy.get(key);
    if (!extra.length) return upstream;
    const list = upstream.status === 200 ? parseListBody(upstream.body) : null;
    const body = JSON.stringify([...(list || []), ...extra]);
    return { status: 200, body, cacheControl: 'no-store', gzip: () => gzipAsync(body) };
  }

  return {
    async get(key) {
      const { path: p, params } = parseCanonicalKey(key);
      const record = /^\/v2\/en\/(cards|sets|series)\/([^/]+)$/.exec(p);
      if (record) {
        const [, kind, id] = record;
        if (kind === 'cards' && isCustomCardId(id)) {
          const card = store.card(id);
          return card ? json(200, card) : noStore(404, NOT_FOUND);
        }
        if (kind === 'sets' && isCustomSetId(id)) {
          const set = store.setRecord(id);
          return set ? json(200, set) : noStore(404, NOT_FOUND);
        }
        if (kind === 'series' && id === CUSTOM_SERIES.id) {
          return json(200, { ...CUSTOM_SERIES, sets: store.setBriefs() });
        }
        return proxy.get(key);
      }
      if (p === '/v2/en/cards') {
        const matches = store.allCards().filter((card) => matchesTcgdexQuery(card, params)).map(cardBriefOf);
        return appendToList(key, matches);
      }
      if (p === '/v2/en/sets') {
        const matches = store.setBriefs().filter((brief) => matchesTcgdexQuery(brief, params));
        return appendToList(key, matches);
      }
      if (p === '/v2/en/series') {
        const series = { ...CUSTOM_SERIES, logo: '' };
        return appendToList(key, matchesTcgdexQuery(series, params) ? [series] : []);
      }
      return proxy.get(key);
    },
    size: () => proxy.size(),
  };
}

/** Express handler for `GET /api/custom-sets`: the installed sets, for the deck builder's pill and decklist codes. */
export function customSetsManifestHandler(store) {
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(store.manifest());
  };
}
