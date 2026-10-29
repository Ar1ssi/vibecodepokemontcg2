#!/usr/bin/env node
// Design 076: publishes custom sets to the bucket the site reads (Cloudflare R2), so cardback edits reach the
// Render site with no commit or deploy. Each file goes up once, named by its SHA-256 (`blobs/<sha256>`); then
// `index.json`, which maps every published set's file paths to those hashes, is replaced. That swap is the publish:
// the site (server/custom-sets-remote.mjs) only ever sees a whole old set or a whole new one.
//
//   pnpm custom-sets:publish -- <setId>… [--remote r2:ptcg-foil/custom-sets] [--dir <custom-sets root>] [--dry-run] [--json]
//   pnpm custom-sets:publish -- --unpublish <setId>… [--remote …] [--json]
//
// Needs rclone with a remote for the bucket (the same one `pnpm foil:upload` uses; credentials stay in rclone's
// config). --remote defaults to $CUSTOM_SETS_R2_REMOTE. A set must pass scripts/custom-sets/check.mjs first.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PUBLISHED_FILE_RE,
  emptyIndex,
  referencedBlobs,
  sameSetEntry,
  validateCustomSetsIndex,
} from '../../shared/custom-sets/custom-sets-index.mjs';
import { isCustomSetId } from '../../shared/custom-sets/custom-set-schema.mjs';
import { isValidRemote } from '../tcgl-foil/upload-foil.mjs';
import { DEFAULT_ROOT, checkSet } from './check.mjs';

export const BLOB_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const INDEX_CACHE_CONTROL = 'no-cache';
const SHA256_NAME = /^[0-9a-f]{64}$/;
// The one rclone failure that means "nothing there yet"; any other failure stops the publish (a misread index
// taken as empty would have the blob clean-up delete every other set's files).
const DIRECTORY_NOT_FOUND = /directory not found/i;
const RCLONE_TIMEOUT_MS = 2 * 60_000;
const RCLONE_UPLOAD_TIMEOUT_MS = 15 * 60_000;

/** @returns {{setIds: string[], remote: string|null, root: string, dryRun: boolean, json: boolean, unpublish: boolean}} */
export function parsePublishArgs(argv, env = {}) {
  const args = { setIds: [], remote: env.CUSTOM_SETS_R2_REMOTE || null, root: DEFAULT_ROOT, dryRun: false, json: false, unpublish: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--remote') args.remote = argv[(index += 1)] ?? null;
    else if (arg === '--dir') args.root = path.resolve(argv[(index += 1)] ?? '.');
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--unpublish') args.unpublish = true;
    else if (arg === '--') continue;
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else args.setIds.push(arg);
  }
  return args;
}

/**
 * The publishable files of a set folder (PUBLISHED_FILE_RE) with their hashes; `skipped` names the rest.
 * @returns {{ files: Record<string, {sha256: string, size: number}>, paths: Record<string, string>, skipped: string[] }}
 */
export function collectSetFiles(dir) {
  const files = {};
  const paths = {};
  const skipped = [];
  const walk = (folder, prefix) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(folder, entry.name);
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(abs, `${rel}/`);
      // a symlink could point anywhere on this machine: only regular files go to the public bucket
      else if (!entry.isFile() || !PUBLISHED_FILE_RE.test(rel)) skipped.push(rel);
      else {
        const bytes = fs.readFileSync(abs);
        files[rel] = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
        paths[rel] = abs;
      }
    }
  };
  walk(dir, '');
  return { files, paths, skipped };
}

/**
 * The index with `entries` ({setId: files}) published. A set whose files are unchanged keeps its entry as it was.
 * @returns {{ index: object, changed: string[], unchanged: string[] }}
 */
export function nextIndex(previous, entries, now) {
  const index = structuredClone(previous);
  const changed = [];
  const unchanged = [];
  for (const [setId, files] of Object.entries(entries)) {
    if (sameSetEntry(previous.sets[setId], { files })) {
      unchanged.push(setId);
      continue;
    }
    index.sets[setId] = { publishedAt: now, files };
    changed.push(setId);
  }
  if (changed.length) index.updatedAt = now;
  return { index, changed, unchanged };
}

/** The index without `setIds`; throws on a set that is not published. */
export function unpublishIndex(previous, setIds, now) {
  const index = structuredClone(previous);
  for (const setId of setIds) {
    if (!index.sets[setId]) throw new Error(`${setId} is not published`);
    delete index.sets[setId];
  }
  index.updatedAt = now;
  return index;
}

/** Blob names in the bucket that neither the previous index nor the next one names (one generation of grace). */
export function blobsToDelete(remoteNames, previous, next) {
  const keep = referencedBlobs(previous, next);
  return remoteNames.filter((name) => SHA256_NAME.test(name) && !keep.has(name)).sort();
}

export const copyBlobsArgs = ({ staging, remote }) => [
  'copy',
  staging,
  `${remote}/blobs`,
  '--ignore-existing',
  '--s3-no-check-bucket',
  '--header-upload',
  `Cache-Control: ${BLOB_CACHE_CONTROL}`,
  '--transfers',
  '16',
  '--stats-one-line',
  '--stats',
  '15s',
];

export const copyIndexArgs = ({ file, remote }) => [
  'copyto',
  file,
  `${remote}/index.json`,
  '--s3-no-check-bucket',
  '--header-upload',
  `Cache-Control: ${INDEX_CACHE_CONTROL}`,
  '--header-upload',
  'Content-Type: application/json',
];

/** rclone through spawnSync: `{status, stdout, stderr}`; a missing binary or a stall is an error of its own. */
export function runRclone(args, { timeoutMs = RCLONE_TIMEOUT_MS } = {}) {
  const result = spawnSync('rclone', args, { encoding: 'utf8', maxBuffer: 64 << 20, timeout: timeoutMs });
  if (result.error?.code === 'ENOENT') throw new Error('rclone not found on PATH: winget install Rclone.Rclone');
  if (result.error?.code === 'ETIMEDOUT') throw new Error(`rclone ${args[0]} gave no answer in ${timeoutMs / 60_000} min; stopped it`);
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function rcloneFailed(what, result) {
  return new Error(`rclone ${what} failed (status ${result.status}): ${result.stderr.trim().split('\n').slice(-3).join(' | ')}`);
}

function remoteHasIndex(remote, rclone) {
  const result = rclone(['lsf', remote, '--files-only', '--max-depth', '1']);
  if (result.status !== 0) {
    if (DIRECTORY_NOT_FOUND.test(result.stderr)) return false;
    throw rcloneFailed('lsf', result);
  }
  return result.stdout.split(/\r?\n/).includes('index.json');
}

/** `{index, found}`: found is false only when a listing shows the bucket has no index.json at all. */
function readRemoteIndex(remote, rclone) {
  const result = rclone(['cat', `${remote}/index.json`]);
  // On object storage rclone cats a missing object as nothing, status 0; elsewhere it fails. Either way a listing
  // decides whether the index is really missing, and every other failure stops the publish.
  if (result.status !== 0 || !result.stdout.trim()) {
    if (!remoteHasIndex(remote, rclone)) return { index: emptyIndex(), found: false };
    if (result.status !== 0) throw rcloneFailed('cat index.json', result);
  }
  let json;
  try {
    json = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`bucket index is not valid: ${error.message}; fix or delete ${remote}/index.json`);
  }
  const checked = validateCustomSetsIndex(json);
  if (!checked.ok) throw new Error(`bucket index is not valid: ${checked.errors.join('; ')}; fix or delete ${remote}/index.json`);
  return { index: checked.index, found: true };
}

function listRemoteBlobs(remote, rclone) {
  const result = rclone(['lsf', `${remote}/blobs`, '--files-only']);
  if (result.status !== 0) {
    if (DIRECTORY_NOT_FOUND.test(result.stderr)) return [];
    throw rcloneFailed('lsf blobs', result);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function withTempDir(task) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptcg-publish-'));
  try {
    return task(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeIndex(index, remote, rclone) {
  // the site refuses an index over its caps whole, so one too-big set would stop every set from updating
  const checked = validateCustomSetsIndex(index);
  if (!checked.ok) throw new Error(`not published: the site would refuse this index: ${checked.errors.join('; ')}`);
  withTempDir((dir) => {
    const file = path.join(dir, 'index.json');
    fs.writeFileSync(file, `${JSON.stringify(index, null, 1)}\n`);
    const result = rclone(copyIndexArgs({ file, remote }));
    if (result.status !== 0) throw rcloneFailed('copyto index.json', result);
  });
}

function uploadBlobs(blobs, remote, rclone) {
  if (!blobs.size) return;
  withTempDir((staging) => {
    // copies, hashed again: a file edited since it was hashed must not go up under its old hash
    for (const [sha256, source] of blobs) {
      const target = path.join(staging, sha256);
      fs.copyFileSync(source, target);
      if (createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== sha256) {
        throw new Error(`${source} changed while publishing; publish again`);
      }
    }
    const result = rclone(copyBlobsArgs({ staging, remote }), { timeoutMs: RCLONE_UPLOAD_TIMEOUT_MS });
    if (result.status !== 0) throw rcloneFailed('copy blobs', result);
  });
}

function collectGarbage(remoteNames, previous, next, remote, rclone) {
  const doomed = blobsToDelete(remoteNames, previous, next);
  if (!doomed.length) return 0;
  withTempDir((dir) => {
    const list = path.join(dir, 'delete.txt');
    fs.writeFileSync(list, `${doomed.join('\n')}\n`);
    const result = rclone(['delete', `${remote}/blobs`, '--files-from-raw', list]);
    if (result.status !== 0) throw rcloneFailed('delete blobs', result);
  });
  return doomed.length;
}

/**
 * Publishes (or with `unpublish` removes) sets. `rclone(args) → {status, stdout, stderr}` is injectable for tests.
 * @returns {{ sets: object[], deleted: number, dryRun: boolean }}
 */
export function publishSets({ setIds, root = DEFAULT_ROOT, remote, dryRun = false, unpublish = false, now = new Date().toISOString(), rclone = runRclone }) {
  if (!setIds.length) throw new Error('name at least one set id');
  for (const setId of setIds) if (!isCustomSetId(setId)) throw new Error(`${setId}: not a custom set id`);
  if (!isValidRemote(remote)) throw new Error(`invalid rclone remote: ${remote} (set --remote or CUSTOM_SETS_R2_REMOTE)`);

  if (unpublish) {
    const { index: previous } = readRemoteIndex(remote, rclone);
    const next = unpublishIndex(previous, setIds, now);
    if (dryRun) return { sets: setIds.map((setId) => ({ setId, unpublished: true })), deleted: 0, dryRun };
    const remoteNames = listRemoteBlobs(remote, rclone);
    writeIndex(next, remote, rclone);
    return { sets: setIds.map((setId) => ({ setId, unpublished: true })), deleted: collectGarbage(remoteNames, previous, next, remote, rclone), dryRun };
  }

  const collected = {};
  const problems = [];
  for (const setId of setIds) {
    const checked = checkSet(root, setId);
    if (checked.problems.length) problems.push(...checked.problems);
    else collected[setId] = collectSetFiles(path.join(root, setId));
  }
  if (problems.length) throw new Error(`not published, fix these first:\n  ${problems.join('\n  ')}`);

  const remoteNames = listRemoteBlobs(remote, rclone);
  const inBucket = new Set(remoteNames);
  const { index: previous, found } = readRemoteIndex(remote, rclone);
  const entries = Object.fromEntries(Object.entries(collected).map(([setId, set]) => [setId, set.files]));
  const { index, unchanged } = nextIndex(previous, entries, now);

  const missing = new Map(); // sha256 -> a local path holding it
  const sets = setIds.map((setId) => {
    const { files, paths, skipped } = collected[setId];
    let uploaded = 0;
    let uploadedBytes = 0;
    for (const [rel, file] of Object.entries(files)) {
      if (inBucket.has(file.sha256) || missing.has(file.sha256)) continue;
      missing.set(file.sha256, paths[rel]);
      uploaded += 1;
      uploadedBytes += file.size;
    }
    const reused = Object.keys(files).length - uploaded;
    return { setId, uploaded, uploadedBytes, reused, skipped, unchanged: unchanged.includes(setId) };
  });
  if (dryRun) return { sets, deleted: 0, dryRun };

  uploadBlobs(missing, remote, rclone);
  if (unchanged.length === setIds.length) return { sets, deleted: 0, dryRun };
  writeIndex(index, remote, rclone);
  // with no index read there is no generation to compare against: clean-up waits for the next publish
  return { sets, deleted: found ? collectGarbage(remoteNames, previous, index, remote, rclone) : 0, dryRun };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One line per set, as the command prints them. */
export function describePublish({ sets, deleted, dryRun }) {
  const lines = sets.map((set) => {
    if (set.unpublished) return `${set.setId}: ${dryRun ? 'would be ' : ''}unpublished`;
    const would = dryRun ? 'would upload' : 'uploaded';
    const head = `${set.setId}: ${set.uploaded} file${set.uploaded === 1 ? '' : 's'} ${would} (${formatBytes(set.uploadedBytes)}), ${set.reused} already there`;
    const tail = set.unchanged ? 'index already up to date' : dryRun ? 'index would be updated' : 'index updated';
    const skipped = set.skipped.length ? `; not published: ${set.skipped.join(', ')}` : '';
    return `${head}; ${tail}${skipped}`;
  });
  if (deleted) lines.push(`${deleted} unused file${deleted === 1 ? '' : 's'} removed from the bucket`);
  return lines;
}

function main() {
  const args = parsePublishArgs(process.argv.slice(2), process.env);
  const result = publishSets(args);
  if (args.json) console.log(JSON.stringify(result));
  else for (const line of describePublish(result)) console.log(line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
