// Custom sets published to object storage (design 076): the site (Render, whose disk is wiped on every restart)
// follows the bucket that scripts/custom-sets/publish.mjs writes. Every poll asks for the bucket's index.json
// (a conditional GET, so an unchanged index costs a 304). A set whose files changed gets its set.json and
// foil.json mirrored into `setsDir`, the custom-set store's second root, after they pass the same validator the
// store uses. Card art is fetched only when a browser first asks for it and kept in a blob cache named by hash. The bucket's public
// URL is all the site needs: no credentials live here.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { validateCustomSet } from '../shared/custom-sets/custom-set-schema.mjs';
import {
  MAX_INDEX_BYTES,
  emptyIndex,
  referencedBlobs,
  sameSetEntry,
  validateCustomSetsIndex,
} from '../shared/custom-sets/custom-sets-index.mjs';
import { RESERVED_SET_CODES } from './custom-sets.mjs';

export const REMOTE_POLL_MS = 10_000;
const INDEX_TIMEOUT_MS = 15_000;
const BLOB_TIMEOUT_MS = 30_000;
const BLOB_CONCURRENCY = 6;
// Mirrored beside set.json; published.json is written last and changes whenever any file of the set does, so the
// store's folder signature (and so customSetsChanged) follows art-only edits too.
const MIRRORED_JSON = ['set.json', 'foil.json'];
const PUBLISHED_ENTRY_FILE = 'published.json';

/**
 * Where the site reads published custom sets from.
 * @param {{ envUrl?: string, foilTextureUrl?: string }} input CUSTOM_SETS_URL ('off' disables) and FOIL_TEXTURE_URL
 *   (the bucket's public root: its `custom-sets/` prefix is the default)
 * @returns {{ baseUrl: string|null, error: string|null }}
 */
export function resolveCustomSetsUrl({ envUrl, foilTextureUrl } = {}) {
  const raw = typeof envUrl === 'string' ? envUrl.trim() : '';
  if (raw.toLowerCase() === 'off') return { baseUrl: null, error: null };
  if (raw) {
    const base = httpBase(raw);
    return base ? { baseUrl: base, error: null } : { baseUrl: null, error: `CUSTOM_SETS_URL must be an http(s) URL without a query or fragment: ${raw}` };
  }
  const foil = typeof foilTextureUrl === 'string' ? foilTextureUrl.trim() : '';
  const foilBase = foil ? httpBase(foil) : null;
  return { baseUrl: foilBase ? `${foilBase}/custom-sets` : null, error: null };
}

function httpBase(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function writeAtomic(file, data) {
  const temp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

// A small FIFO limiter: the deck builder asks for a whole set's tiles at once. A finished task hands its slot
// straight to the next waiter, so a newcomer can never slip in between.
function createLimiter(limit) {
  let active = 0;
  const waiting = [];
  return async (task) => {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

async function readCapped(response, cap) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > cap) throw new Error(`${declared} bytes, over ${cap}`);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.length;
    if (total > cap) throw new Error(`over ${cap} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

/**
 * @param {{ baseUrl: string, cacheDir: string, fetchImpl?: typeof fetch, log?: (line: string) => void,
 *   onUpdate?: (update: { changed: string[] }) => void, pollMs?: number }} options
 */
export function createRemoteCustomSets({ baseUrl, cacheDir, fetchImpl = globalThis.fetch, log = () => {}, onUpdate = () => {}, pollMs = REMOTE_POLL_MS }) {
  const cacheRoot = path.resolve(cacheDir); // res.sendFile takes absolute paths only
  const setsDir = path.join(cacheRoot, 'sets');
  const blobsDir = path.join(cacheRoot, 'blobs');
  const partsDir = path.join(cacheRoot, 'parts');
  // A restart starts from the bucket, never from a mirror that may be days old; verified blobs are reusable.
  fs.rmSync(setsDir, { recursive: true, force: true });
  fs.rmSync(partsDir, { recursive: true, force: true });
  for (const dir of [setsDir, blobsDir, partsDir]) fs.mkdirSync(dir, { recursive: true });

  const active = new Map(); // setId -> index entry whose set.json is valid and mirrored
  const refused = new Map(); // setId -> entry whose set.json failed validation: not fetched or logged again
  const inFlight = new Map(); // sha256 -> Promise<abs path>
  const limit = createLimiter(BLOB_CONCURRENCY);
  let etag = null;
  let failing = null; // the reason last logged, so a bucket that stays down logs once
  const setErrors = new Map(); // setId -> the failure last logged for it, so a retry every poll logs once
  let running = null;
  let timer = null;

  const blobPath = (sha256) => path.join(blobsDir, sha256);

  function noteFailure(why) {
    if (failing === why) return;
    failing = why;
    log(`custom sets remote: ${why}; keeping ${active.size} published set${active.size === 1 ? '' : 's'}`);
  }

  function noteSetError(setId, line) {
    if (setErrors.get(setId) === line) return;
    setErrors.set(setId, line);
    log(line);
  }

  function noteHealthy() {
    if (failing) log('custom sets remote: back');
    failing = null;
  }

  async function download(sha256, size) {
    const response = await fetchImpl(`${baseUrl}/blobs/${sha256}`, { signal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    const bytes = await readCapped(response, size);
    if (bytes.length !== size) throw new Error(`${bytes.length} bytes, expected ${size}`);
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('content does not match its hash');
    const part = path.join(partsDir, `${sha256}.${randomBytes(4).toString('hex')}`);
    try {
      fs.writeFileSync(part, bytes);
      fs.renameSync(part, blobPath(sha256));
    } finally {
      fs.rmSync(part, { force: true });
    }
    return blobPath(sha256);
  }

  /** The blob's path on disk, downloaded and verified first if needed; one download per hash at a time. */
  function ensureBlob({ sha256, size }) {
    if (fs.existsSync(blobPath(sha256))) return Promise.resolve(blobPath(sha256));
    let pending = inFlight.get(sha256);
    if (!pending) {
      pending = limit(() => download(sha256, size))
        .catch((error) => {
          throw new Error(`blob ${sha256.slice(0, 12)} from the bucket: ${error.message}`);
        })
        .finally(() => inFlight.delete(sha256));
      inFlight.set(sha256, pending);
    }
    return pending;
  }

  async function fetchIndex() {
    const headers = etag ? { 'If-None-Match': etag } : {};
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/index.json`, { cache: 'no-store', headers, signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) });
    } catch (error) {
      noteFailure(`index.json unreachable (${error.message})`);
      return null;
    }
    if (response.status === 304) {
      noteHealthy();
      return null;
    }
    // Nothing published yet. Once sets are loaded, a missing index is a fault (a wrong URL, a deleted prefix), not a
    // request to drop them: `publish.mjs --unpublish` takes sets off by writing an index without them.
    if (response.status === 404) {
      if (!active.size) return { index: emptyIndex(), etag: null };
      noteFailure('index.json is gone (404)');
      return null;
    }
    if (response.status !== 200) {
      noteFailure(`index.json answered ${response.status}`);
      return null;
    }
    let json;
    try {
      json = JSON.parse((await readCapped(response, MAX_INDEX_BYTES)).toString('utf8'));
    } catch (error) {
      noteFailure(`index.json unreadable (${error.message})`);
      return null;
    }
    const result = validateCustomSetsIndex(json);
    if (!result.ok) {
      noteFailure(`index.json refused (${result.errors.slice(0, 3).join('; ')})`);
      return null;
    }
    return { index: result.index, etag: response.headers.get('etag') };
  }

  // Mirrors one changed set: true when it is now active, false when skipped (logged), throws on a fetch failure.
  async function mirrorSet(setId, entry) {
    const bytes = {};
    for (const rel of MIRRORED_JSON) {
      if (entry.files[rel]) bytes[rel] = fs.readFileSync(await ensureBlob(entry.files[rel]));
    }
    let result;
    try {
      result = validateCustomSet(JSON.parse(bytes['set.json'].toString('utf8')), { setDirName: setId, reservedCodes: RESERVED_SET_CODES });
    } catch (error) {
      result = { ok: false, errors: [`set.json is not valid JSON (${error.message})`] };
    }
    if (!result.ok) {
      const kept = active.has(setId) ? 'kept the copy loaded before' : 'not loaded';
      log(`custom set ${setId} from the bucket skipped: ${result.errors.join('; ')}; ${kept}`);
      refused.set(setId, entry);
      return false;
    }
    refused.delete(setId);
    const dir = path.join(setsDir, setId);
    fs.mkdirSync(dir, { recursive: true });
    for (const rel of MIRRORED_JSON) {
      if (bytes[rel]) writeAtomic(path.join(dir, rel), bytes[rel]);
      else fs.rmSync(path.join(dir, rel), { force: true });
    }
    writeAtomic(path.join(dir, PUBLISHED_ENTRY_FILE), JSON.stringify(entry));
    active.set(setId, entry);
    return true;
  }

  function collectGarbage() {
    const keep = referencedBlobs({ sets: Object.fromEntries(active) });
    for (const name of fs.readdirSync(blobsDir)) {
      if (keep.has(name) || inFlight.has(name)) continue;
      try {
        fs.rmSync(path.join(blobsDir, name), { force: true });
      } catch {
        // still being sent to a browser (Windows keeps it locked): the next pass removes it
      }
    }
  }

  async function refreshOnce() {
    const fetched = await fetchIndex();
    if (!fetched) return null;
    const { index } = fetched;
    const changed = [];
    let retry = false;
    for (const [setId, entry] of Object.entries(index.sets)) {
      if (sameSetEntry(active.get(setId), entry) || sameSetEntry(refused.get(setId), entry)) continue;
      try {
        if (await mirrorSet(setId, entry)) changed.push(setId);
        setErrors.delete(setId);
      } catch (error) {
        retry = true;
        noteSetError(setId, `custom set ${setId} from the bucket not updated: ${error.message}`);
      }
    }
    for (const setId of [...refused.keys()]) if (!index.sets[setId]) refused.delete(setId);
    for (const setId of [...active.keys()]) {
      if (index.sets[setId]) continue;
      try {
        fs.rmSync(path.join(setsDir, setId), { recursive: true, force: true });
      } catch (error) {
        retry = true;
        noteSetError(setId, `custom set ${setId} could not be taken off: ${error.message}`);
        continue;
      }
      active.delete(setId);
      changed.push(setId);
    }
    // a set left half-fetched keeps the etag unset, so the next poll fetches the index again and retries it
    etag = retry ? null : fetched.etag;
    noteHealthy();
    if (!changed.length) return null;
    changed.sort();
    try {
      onUpdate({ changed });
    } catch (error) {
      log(`custom sets remote: update listener failed: ${error.message}`);
    }
    collectGarbage();
    return { changed };
  }

  // Runs from a timer: a throw would take the game server down, so it is logged and the next poll retries.
  function refresh() {
    running ??= refreshOnce()
      .catch((error) => {
        log(`custom sets remote: refresh failed (${error.message})`);
        return null;
      })
      .finally(() => {
        running = null;
      });
    return running;
  }

  /** Express handler for `GET /src/assets/custom-sets/:setId/*`: a published set's files, from the blob cache. */
  function fileHandler() {
    return async (req, res, next) => {
      const entry = active.get(req.params.setId);
      if (!entry) return next();
      const rel = req.params[0];
      const file = Object.hasOwn(entry.files, rel) ? entry.files[rel] : null;
      if (!file) return res.status(404).send('not published');
      let abs;
      try {
        abs = await ensureBlob(file);
      } catch (error) {
        log(`custom set ${req.params.setId}/${rel}: ${error.message}`);
        return res.status(502).send('bucket fetch failed');
      }
      res.type(path.extname(rel) || '.bin');
      // the blanket middleware already chose the Cache-Control; sendFile must not replace it
      res.sendFile(abs, { cacheControl: false }, (error) => {
        if (error && !res.headersSent) res.status(error.status || 500).end();
      });
    };
  }

  return {
    setsDir,
    has: (setId) => active.has(setId),
    hasFile: (setId, rel) => Boolean(active.get(setId) && Object.hasOwn(active.get(setId).files, rel)),
    refresh,
    fileHandler,
    start() {
      refresh();
      clearInterval(timer);
      timer = setInterval(refresh, pollMs);
      timer.unref?.();
    },
    close() {
      clearInterval(timer);
      timer = null;
    },
  };
}
