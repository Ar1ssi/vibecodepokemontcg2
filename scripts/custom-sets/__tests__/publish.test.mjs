import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BLOB_CACHE_CONTROL,
  blobsToDelete,
  collectSetFiles,
  copyBlobsArgs,
  copyIndexArgs,
  describePublish,
  nextIndex,
  parsePublishArgs,
  publishSets,
  unpublishIndex,
} from '../publish.mjs';
import { emptyIndex, validateCustomSetsIndex } from '../../../shared/custom-sets/custom-sets-index.mjs';
import { sampleSet } from '../../../shared/custom-sets/__tests__/fixtures.mjs';

const REMOTE = 'r2:ptcg-foil/custom-sets';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function writeSet(root, set = sampleSet(), art = 'art') {
  const dir = path.join(root, set.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'set.json'), JSON.stringify(set));
  fs.writeFileSync(path.join(dir, 'ENGINE-CHECK.md'), 'local notes');
  for (const card of set.cards) {
    fs.mkdirSync(path.join(dir, card.localId), { recursive: true });
    fs.writeFileSync(path.join(dir, card.localId, 'high.webp'), `${art}-${card.localId}-high`);
    fs.writeFileSync(path.join(dir, card.localId, 'low.webp'), `${art}-${card.localId}-low`);
  }
  return dir;
}

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'custom-publish-'));

// An rclone stand-in over an in-memory bucket: the subcommands publish.mjs runs, with rclone's exit codes.
function fakeRclone({ failOn = null } = {}) {
  const bucket = { blobs: new Map(), index: null, calls: [] };
  bucket.rclone = (args) => {
    bucket.calls.push(args);
    const [command] = args;
    if (failOn === command) return { status: 1, stdout: '', stderr: 'Failed to copy: AccessDenied' };
    if (command === 'lsf' && args[1] === REMOTE) {
      return { status: 0, stdout: bucket.index === null ? '' : 'index.json\n', stderr: '' };
    }
    if (command === 'lsf') {
      if (!bucket.blobs.size) return { status: 3, stdout: '', stderr: 'error listing: directory not found' };
      return { status: 0, stdout: [...bucket.blobs.keys()].map((name) => `${name}\n`).join(''), stderr: '' };
    }
    // as rclone does on R2: a missing object cats as nothing, status 0
    if (command === 'cat') return { status: 0, stdout: bucket.index ?? '', stderr: '' };
    if (command === 'copy') {
      const staging = args[1];
      for (const name of fs.readdirSync(staging)) {
        if (!bucket.blobs.has(name)) bucket.blobs.set(name, fs.readFileSync(path.join(staging, name)));
      }
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'copyto') {
      bucket.index = fs.readFileSync(args[1], 'utf8');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'delete') {
      const list = fs.readFileSync(args[args.indexOf('--files-from-raw') + 1], 'utf8').split('\n').filter(Boolean);
      for (const name of list) bucket.blobs.delete(name);
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`unexpected rclone ${command}`);
  };
  bucket.parsedIndex = () => JSON.parse(bucket.index);
  return bucket;
}

test('parsePublishArgs: set ids, flags, and the remote from the environment', () => {
  const args = parsePublishArgs(['--', 'customhb', '--dry-run', '--json', 'customdemo'], { CUSTOM_SETS_R2_REMOTE: REMOTE });
  assert.deepEqual(
    { ...args, root: undefined },
    { setIds: ['customhb', 'customdemo'], remote: REMOTE, root: undefined, dryRun: true, json: true, unpublish: false }
  );
  assert.equal(parsePublishArgs(['--remote', 'r2:other', 'customhb'], { CUSTOM_SETS_R2_REMOTE: REMOTE }).remote, 'r2:other');
  assert.equal(parsePublishArgs(['--unpublish', 'customhb']).unpublish, true);
  assert.throws(() => parsePublishArgs(['--force']), /unknown option --force/);
});

test('collectSetFiles keeps the publishable files with their hashes and lists the rest', () => {
  const dir = writeSet(tempRoot());
  const { files, skipped } = collectSetFiles(dir);
  assert.deepEqual(Object.keys(files), ['001/high.webp', '001/low.webp', '002/high.webp', '002/low.webp', 'set.json']);
  assert.deepEqual(files['001/high.webp'], { sha256: sha256('art-001-high'), size: 'art-001-high'.length });
  assert.deepEqual(skipped, ['ENGINE-CHECK.md']);
});

test('nextIndex keeps an unchanged set as it was; unpublishIndex refuses an unknown set', () => {
  const files = { 'set.json': { sha256: 'a'.repeat(64), size: 10 } };
  const first = nextIndex(emptyIndex(), { customhbw: files }, 'T1');
  assert.deepEqual(first.changed, ['customhbw']);
  assert.equal(first.index.updatedAt, 'T1');
  const again = nextIndex(first.index, { customhbw: structuredClone(files) }, 'T2');
  assert.deepEqual(again.unchanged, ['customhbw']);
  assert.equal(again.index.sets.customhbw.publishedAt, 'T1');
  assert.equal(again.index.updatedAt, 'T1');
  assert.equal(validateCustomSetsIndex(first.index).ok, true);
  assert.deepEqual(unpublishIndex(first.index, ['customhbw'], 'T3').sets, {});
  assert.throws(() => unpublishIndex(first.index, ['customzz'], 'T3'), /customzz is not published/);
});

test('blobsToDelete spares what the previous or the next index names, and anything not named like a blob', () => {
  const previous = { sets: { customhbw: { files: { 'set.json': { sha256: 'a'.repeat(64), size: 1 } } } } };
  const next = { sets: { customhbw: { files: { 'set.json': { sha256: 'b'.repeat(64), size: 1 } } } } };
  assert.deepEqual(blobsToDelete(['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'README'], previous, next), ['c'.repeat(64)]);
});

test('rclone arguments: immutable blobs never overwritten, an index browsers revalidate', () => {
  const blobs = copyBlobsArgs({ staging: '/tmp/s', remote: REMOTE });
  assert.deepEqual(blobs.slice(0, 4), ['copy', '/tmp/s', `${REMOTE}/blobs`, '--ignore-existing']);
  assert.ok(blobs.includes(`Cache-Control: ${BLOB_CACHE_CONTROL}`));
  assert.deepEqual(copyIndexArgs({ file: '/tmp/i.json', remote: REMOTE }), [
    'copyto',
    '/tmp/i.json',
    `${REMOTE}/index.json`,
    '--s3-no-check-bucket',
    '--header-upload',
    'Cache-Control: no-cache',
    '--header-upload',
    'Content-Type: application/json',
  ]);
});

test('a first publish uploads every file and writes a valid index; a second one changes nothing', () => {
  const root = tempRoot();
  writeSet(root);
  const bucket = fakeRclone();
  const first = publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T1', rclone: bucket.rclone });
  assert.deepEqual(first.sets[0], { setId: 'customhbw', uploaded: 5, uploadedBytes: first.sets[0].uploadedBytes, reused: 0, skipped: ['ENGINE-CHECK.md'], unchanged: false });
  assert.equal(bucket.blobs.size, 5);
  const index = validateCustomSetsIndex(bucket.parsedIndex());
  assert.equal(index.ok, true);
  assert.equal(index.index.sets.customhbw.files['001/low.webp'].sha256, sha256('art-001-low'));
  assert.equal(bucket.blobs.get(sha256('art-001-low')).toString(), 'art-001-low');

  bucket.calls.length = 0;
  const second = publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T2', rclone: bucket.rclone });
  assert.equal(second.sets[0].unchanged, true);
  assert.equal(second.sets[0].uploaded, 0);
  assert.deepEqual(bucket.calls.map(([command]) => command), ['lsf', 'cat'], 'nothing written');
  assert.match(describePublish(second)[0], /^customhbw: 0 files uploaded \(0 B\), 5 already there; index already up to date; not published: ENGINE-CHECK.md$/);
});

test('a re-render uploads only the changed file; the old one lives one more generation, then goes', () => {
  const root = tempRoot();
  const dir = writeSet(root);
  const bucket = fakeRclone();
  publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T1', rclone: bucket.rclone });
  fs.writeFileSync(path.join(dir, '001', 'high.webp'), 'redrawn');
  const edit = publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T2', rclone: bucket.rclone });
  assert.equal(edit.sets[0].uploaded, 1);
  assert.equal(edit.sets[0].reused, 4);
  assert.equal(edit.deleted, 0);
  assert.ok(bucket.blobs.has(sha256('art-001-high')), 'a site mid-pass on the old index still finds it');

  fs.writeFileSync(path.join(dir, '001', 'high.webp'), 'redrawn twice');
  const third = publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T3', rclone: bucket.rclone });
  assert.equal(third.deleted, 1);
  assert.equal(bucket.blobs.has(sha256('art-001-high')), false);
  assert.ok(bucket.blobs.has(sha256('redrawn')));
});

test('a set that fails the check is refused before anything reaches the bucket', () => {
  const root = tempRoot();
  const dir = writeSet(root);
  fs.rmSync(path.join(dir, '002', 'low.webp'));
  const bucket = fakeRclone();
  assert.throws(
    () => publishSets({ setIds: ['customhbw'], root, remote: REMOTE, rclone: bucket.rclone }),
    /not published, fix these first:\n {2}customhbw\/002\/low.webp: missing/
  );
  assert.deepEqual(bucket.calls, []);
});

test('a bad remote, a set id that is not custom, or a failing rclone stops the publish with the index untouched', () => {
  const root = tempRoot();
  writeSet(root);
  assert.throws(() => publishSets({ setIds: ['customhbw'], root, remote: 'r2:../x', rclone: fakeRclone().rclone }), /invalid rclone remote/);
  assert.throws(() => publishSets({ setIds: ['sv01'], root, remote: REMOTE, rclone: fakeRclone().rclone }), /sv01: not a custom set id/);
  const denied = fakeRclone();
  publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T1', rclone: denied.rclone });
  const published = denied.index;
  const deny = (args) => (args[0] === 'cat' ? { status: 1, stdout: '', stderr: 'AccessDenied: Access Denied' } : denied.rclone(args));
  assert.throws(() => publishSets({ setIds: ['customhbw'], root, remote: REMOTE, rclone: deny }), /rclone cat index.json failed \(status 1\): AccessDenied/);
  assert.equal(denied.index, published);

  const broken = fakeRclone();
  broken.index = '{"format":"ptcg-sim.custom-sets-index","version":7,"sets":{}}';
  assert.throws(() => publishSets({ setIds: ['customhbw'], root, remote: REMOTE, rclone: broken.rclone }), /bucket index is not valid: version: expected 1/);
  broken.index = '';
  assert.throws(() => publishSets({ setIds: ['customhbw'], root, remote: REMOTE, rclone: broken.rclone }), /bucket index is not valid: Unexpected end of JSON input/, 'an empty index.json is not "nothing published"');
});

test('an index that cannot be read is never taken as empty, so no other set loses its files', () => {
  const root = tempRoot();
  writeSet(root);
  const other = sampleSet({ id: 'customoth', code: 'OTH' });
  other.cards = other.cards.map((card) => ({ ...card, id: card.id.replace('customhbw', 'customoth'), image: card.image.replace('customhbw', 'customoth') }));
  writeSet(root, other, 'other');
  const bucket = fakeRclone();
  publishSets({ setIds: ['customoth'], root, remote: REMOTE, now: 'T1', rclone: bucket.rclone });
  const before = bucket.index;
  const blobs = bucket.blobs.size;
  const flaky = (args) =>
    args[0] === 'cat' ? { status: 1, stdout: '', stderr: 'Failed to cat: 503 Service Unavailable: object not found in cache' } : bucket.rclone(args);
  assert.throws(() => publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T2', rclone: flaky }), /rclone cat index.json failed/);
  assert.equal(bucket.index, before);
  assert.ok(bucket.blobs.size >= blobs, 'nothing deleted');
});

test('with no index in the bucket, old blobs are left for the next publish to judge', () => {
  const root = tempRoot();
  writeSet(root);
  const bucket = fakeRclone();
  bucket.blobs.set('d'.repeat(64), Buffer.from('left by a publish whose index was deleted'));
  const result = publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T1', rclone: bucket.rclone });
  assert.equal(result.deleted, 0);
  assert.ok(bucket.blobs.has('d'.repeat(64)));
});

test('an index the site would refuse is never written', () => {
  const root = tempRoot();
  const dir = writeSet(root);
  fs.writeFileSync(path.join(dir, '001', 'high.webp'), Buffer.alloc((16 << 20) + 1, 1));
  const bucket = fakeRclone();
  assert.throws(
    () => publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T1', rclone: bucket.rclone }),
    /not published: the site would refuse this index: sets\.customhbw\.files\["001\/high\.webp"\]\.size/
  );
  assert.equal(bucket.index, null);
});

test('a symlinked file is not published', (t) => {
  const root = tempRoot();
  const dir = writeSet(root);
  const outside = path.join(tempRoot(), 'secret.txt');
  fs.writeFileSync(outside, 'not for the bucket');
  try {
    fs.symlinkSync(outside, path.join(dir, 'CHANGELOG.md'));
  } catch (error) {
    t.skip(`symlinks need extra rights here (${error.code})`);
    return;
  }
  const { files, skipped } = collectSetFiles(dir);
  assert.equal(files['CHANGELOG.md'], undefined);
  assert.ok(skipped.includes('CHANGELOG.md'));
});

test('a crash after the upload leaves the old index; the next publish cleans the orphans', () => {
  const root = tempRoot();
  const dir = writeSet(root);
  const bucket = fakeRclone();
  publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T1', rclone: bucket.rclone });
  const before = bucket.index;
  fs.writeFileSync(path.join(dir, '002', 'high.webp'), 'orphan art');
  const crashing = (args) => (args[0] === 'copyto' ? { status: 1, stdout: '', stderr: 'connection reset' } : bucket.rclone(args));
  assert.throws(() => publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T2', rclone: crashing }), /copyto index.json failed/);
  assert.equal(bucket.index, before, 'the published set is still the old one, whole');
  assert.ok(bucket.blobs.has(sha256('orphan art')));

  fs.writeFileSync(path.join(dir, '002', 'high.webp'), 'final art');
  publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T3', rclone: bucket.rclone });
  assert.equal(bucket.blobs.has(sha256('orphan art')), false);
});

test('a dry run writes nothing; unpublish drops the set and unknown sets are refused', () => {
  const root = tempRoot();
  writeSet(root);
  const bucket = fakeRclone();
  const dry = publishSets({ setIds: ['customhbw'], root, remote: REMOTE, dryRun: true, rclone: bucket.rclone });
  assert.equal(dry.sets[0].uploaded, 5);
  assert.equal(bucket.index, null);
  assert.match(describePublish(dry)[0], /would upload .*index would be updated/);

  publishSets({ setIds: ['customhbw'], root, remote: REMOTE, now: 'T1', rclone: bucket.rclone });
  assert.throws(() => publishSets({ setIds: ['customzz'], remote: REMOTE, unpublish: true, rclone: bucket.rclone }), /customzz is not published/);
  const gone = publishSets({ setIds: ['customhbw'], remote: REMOTE, unpublish: true, now: 'T2', rclone: bucket.rclone });
  assert.deepEqual(bucket.parsedIndex().sets, {});
  assert.equal(gone.deleted, 0, 'the previous generation is kept once more');
  assert.deepEqual(describePublish(gone), ['customhbw: unpublished']);
});
