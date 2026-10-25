// Custom sets published to object storage (design 076). The bucket holds every published file once, named by its
// SHA-256 (`custom-sets/blobs/<sha256>`), and one `custom-sets/index.json` mapping each set's file paths to those
// hashes. scripts/custom-sets/publish.mjs writes the index; the site (server/custom-sets-remote.mjs) polls it and
// mirrors what it names. This module is the one definition of a valid index. Pure: no fs, no network.

import { MAX_SET_JSON_BYTES, isCustomSetId } from './custom-set-schema.mjs';

export const CUSTOM_SETS_INDEX_FORMAT = 'ptcg-sim.custom-sets-index';
export const CUSTOM_SETS_INDEX_VERSION = 1;

// The files of a set folder that are published; anything else there (ENGINE-CHECK.md, editor leftovers) stays local.
export const PUBLISHED_FILE_RE = /^(set\.json|foil\.json|CHANGELOG\.md|[0-9]{3}\/(high|low)\.webp|foil\/[0-9]{3}-[a-z]{2,8}\.webp)$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const JSON_FILES = new Set(['set.json', 'foil.json']);

export const MAX_INDEX_BYTES = 4 << 20;
export const MAX_PUBLISHED_SETS = 50;
export const MAX_FILES_PER_SET = 4000;
export const MAX_BLOB_BYTES = 16 << 20;
export const MAX_SET_BYTES = 512 << 20;
// What the site may have to cache on its disk at worst (Render's free disk is small; real sets are ~100 MB).
export const MAX_PUBLISHED_BYTES = 2 * 1024 ** 3;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export function emptyIndex() {
  return { format: CUSTOM_SETS_INDEX_FORMAT, version: CUSTOM_SETS_INDEX_VERSION, updatedAt: '', sets: {} };
}

function checkFile(rel, file, where, errors) {
  if (!PUBLISHED_FILE_RE.test(rel)) {
    errors.push(`${where}: not a publishable file`);
    return null;
  }
  if (!isPlainObject(file)) {
    errors.push(`${where}: expected {sha256, size}`);
    return null;
  }
  const cap = JSON_FILES.has(rel) ? MAX_SET_JSON_BYTES : MAX_BLOB_BYTES;
  let ok = true;
  if (typeof file.sha256 !== 'string' || !SHA256_RE.test(file.sha256)) {
    errors.push(`${where}.sha256: 64 lowercase hex digits`);
    ok = false;
  }
  if (!Number.isInteger(file.size) || file.size < 1 || file.size > cap) {
    errors.push(`${where}.size: a whole number of bytes from 1 to ${cap}`);
    ok = false;
  }
  return ok ? { sha256: file.sha256, size: file.size } : null;
}

function checkSet(setId, entry, errors) {
  const where = `sets.${setId}`;
  if (!isPlainObject(entry) || !isPlainObject(entry.files)) {
    errors.push(`${where}.files: expected an object of files`);
    return null;
  }
  const rels = Object.keys(entry.files);
  if (rels.length === 0 || rels.length > MAX_FILES_PER_SET) {
    errors.push(`${where}.files: 1 to ${MAX_FILES_PER_SET} files`);
    return null;
  }
  if (!Object.hasOwn(entry.files, 'set.json')) errors.push(`${where}.files: set.json is missing`);
  const files = {};
  let total = 0;
  for (const rel of rels.sort()) {
    const file = checkFile(rel, entry.files[rel], `${where}.files[${JSON.stringify(rel)}]`, errors);
    if (!file) continue;
    files[rel] = file;
    total += file.size;
  }
  if (total > MAX_SET_BYTES) errors.push(`${where}.files: ${total} bytes in all, over ${MAX_SET_BYTES}`);
  if (entry.publishedAt !== undefined && typeof entry.publishedAt !== 'string') errors.push(`${where}.publishedAt: expected text`);
  return { publishedAt: typeof entry.publishedAt === 'string' ? entry.publishedAt : '', files };
}

/**
 * Validates a parsed index.json.
 * @param {unknown} json
 * @returns {{ ok: boolean, errors: string[], index: ReturnType<typeof emptyIndex>|null }} `index` keeps only the
 *   known keys, sets and files in sorted order.
 */
export function validateCustomSetsIndex(json) {
  if (!isPlainObject(json)) return { ok: false, errors: ['index.json: expected a JSON object'], index: null };
  const errors = [];
  if (json.format !== CUSTOM_SETS_INDEX_FORMAT) errors.push(`format: expected "${CUSTOM_SETS_INDEX_FORMAT}"`);
  if (json.version !== CUSTOM_SETS_INDEX_VERSION) errors.push(`version: expected ${CUSTOM_SETS_INDEX_VERSION}`);
  if (json.updatedAt !== undefined && typeof json.updatedAt !== 'string') errors.push('updatedAt: expected text');
  const index = { ...emptyIndex(), updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : '' };
  if (!isPlainObject(json.sets)) {
    errors.push('sets: expected an object of sets');
  } else {
    const setIds = Object.keys(json.sets).sort();
    if (setIds.length > MAX_PUBLISHED_SETS) errors.push(`sets: at most ${MAX_PUBLISHED_SETS}`);
    else {
      let total = 0;
      for (const setId of setIds) {
        if (!isCustomSetId(setId)) {
          errors.push(`sets[${JSON.stringify(setId)}]: not a custom set id`);
          continue;
        }
        const entry = checkSet(setId, json.sets[setId], errors);
        if (!entry) continue;
        index.sets[setId] = entry;
        for (const file of Object.values(entry.files)) total += file.size;
      }
      if (total > MAX_PUBLISHED_BYTES) errors.push(`sets: ${total} bytes in all, over ${MAX_PUBLISHED_BYTES}`);
    }
  }
  return errors.length ? { ok: false, errors, index: null } : { ok: true, errors, index };
}

/** Two set entries publish the same bytes under the same paths (publishedAt does not count). */
export function sameSetEntry(a, b) {
  if (!a || !b) return false;
  const left = Object.keys(a.files);
  if (left.length !== Object.keys(b.files).length) return false;
  return left.every((rel) => b.files[rel]?.sha256 === a.files[rel].sha256);
}

/** Every blob hash the given indexes (or null ones) name. */
export function referencedBlobs(...indexes) {
  const hashes = new Set();
  for (const index of indexes) {
    for (const entry of Object.values(index?.sets ?? {})) {
      for (const file of Object.values(entry.files)) hashes.add(file.sha256);
    }
  }
  return hashes;
}
