import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { createRemoteCustomSets, resolveCustomSetsUrl } from '../custom-sets-remote.mjs';
import { createLiveCustomSets, withCustomSets } from '../custom-sets.mjs';
import { CUSTOM_SETS_INDEX_FORMAT } from '../../shared/custom-sets/custom-sets-index.mjs';
import { sampleSet } from '../../shared/custom-sets/__tests__/fixtures.mjs';

const BASE = 'https://bucket.example/custom-sets';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'custom-sets-remote-'));

function renamedSet(name) {
  const set = sampleSet();
  set.cards[0] = { ...set.cards[0], name };
  return set;
}

// An in-memory bucket answering like R2's public URL: index.json with an ETag, blobs by hash.
function fakeBucket() {
  const blobs = new Map();
  const bucket = {
    index: null,
    down: false,
    corrupt: new Set(),
    calls: [],
    publish(setId, files) {
      const entry = { publishedAt: '2026-10-25T12:00:00.000Z', files: {} };
      for (const [rel, content] of Object.entries(files)) {
        const bytes = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
        blobs.set(sha256(bytes), bytes);
        entry.files[rel] = { sha256: sha256(bytes), size: bytes.length };
      }
      bucket.index ??= { format: CUSTOM_SETS_INDEX_FORMAT, version: 1, updatedAt: '', sets: {} };
      bucket.index.sets[setId] = entry;
      return entry;
    },
    unpublish(setId) {
      delete bucket.index.sets[setId];
    },
    blobCalls: () => bucket.calls.filter((url) => url.includes('/blobs/')).length,
    async fetch(url, { headers = {} } = {}) {
      bucket.calls.push(url);
      await new Promise((resolve) => setImmediate(resolve));
      if (bucket.down) throw new TypeError('fetch failed');
      const rel = url.slice(BASE.length + 1);
      if (rel === 'index.json') {
        if (!bucket.index) return new Response('not found', { status: 404 });
        const body = typeof bucket.index === 'string' ? bucket.index : JSON.stringify(bucket.index);
        const etag = `"${sha256(body).slice(0, 16)}"`;
        if (headers['If-None-Match'] === etag) return new Response(null, { status: 304 });
        return new Response(body, { status: 200, headers: { etag } });
      }
      const hash = rel.replace(/^blobs\//, '');
      if (!blobs.has(hash)) return new Response('not found', { status: 404 });
      return new Response(bucket.corrupt.has(hash) ? Buffer.from('tampered bytes') : blobs.get(hash), { status: 200 });
    },
  };
  return bucket;
}

function setup({ bucket = fakeBucket(), cacheDir = tempDir(), onUpdate } = {}) {
  const lines = [];
  const remote = createRemoteCustomSets({
    baseUrl: BASE,
    cacheDir,
    fetchImpl: (url, options) => bucket.fetch(url, options),
    log: (line) => lines.push(line),
    onUpdate,
  });
  return { bucket, remote, lines, cacheDir };
}

const setFiles = (set = sampleSet(), extra = {}) => ({ 'set.json': set, '001/high.webp': 'high-001', '001/low.webp': 'low-001', ...extra });

test('resolveCustomSetsUrl: explicit, off, derived from the foil bucket, or nothing', () => {
  assert.deepEqual(resolveCustomSetsUrl({ envUrl: 'https://cdn.example/sets/' }), { baseUrl: 'https://cdn.example/sets', error: null });
  assert.deepEqual(resolveCustomSetsUrl({ envUrl: ' off ', foilTextureUrl: 'https://pub.r2.dev' }), { baseUrl: null, error: null });
  assert.deepEqual(resolveCustomSetsUrl({ foilTextureUrl: 'https://pub.r2.dev/' }), { baseUrl: 'https://pub.r2.dev/custom-sets', error: null });
  assert.deepEqual(resolveCustomSetsUrl({}), { baseUrl: null, error: null });
  assert.deepEqual(resolveCustomSetsUrl({ foilTextureUrl: 'ftp://x' }), { baseUrl: null, error: null });
  const bad = resolveCustomSetsUrl({ envUrl: 'https://cdn.example/sets?x=1' });
  assert.equal(bad.baseUrl, null);
  assert.match(bad.error, /^CUSTOM_SETS_URL must be an http\(s\) URL/);
});

test('nothing published yet (index 404) is a quiet empty state', async () => {
  const { remote, lines } = setup();
  assert.equal(await remote.refresh(), null);
  assert.equal(remote.has('customhbw'), false);
  assert.deepEqual(lines, []);
});

test('a published set is mirrored once; an unchanged index costs one conditional request', async () => {
  const updates = [];
  const { bucket, remote } = setup({ onUpdate: (update) => updates.push(update) });
  bucket.publish('customhbw', setFiles(sampleSet(), { 'foil.json': '{"cards":{}}' }));
  assert.deepEqual(await remote.refresh(), { changed: ['customhbw'] });
  assert.deepEqual(updates, [{ changed: ['customhbw'] }]);
  assert.equal(remote.has('customhbw'), true);
  assert.equal(remote.hasFile('customhbw', 'foil.json'), true);
  assert.equal(remote.hasFile('customhbw', 'toString'), false);
  const dir = path.join(remote.setsDir, 'customhbw');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['foil.json', 'published.json', 'set.json']);
  assert.equal(bucket.blobCalls(), 2, 'set.json and foil.json only: art waits for a browser');

  assert.equal(await remote.refresh(), null);
  assert.equal(bucket.blobCalls(), 2);
  assert.equal(updates.length, 1);
});

test('the store serves the bucket copy over the repo copy, and the repo copy again once unpublished', async () => {
  const repo = tempDir();
  fs.mkdirSync(path.join(repo, 'customhbw'));
  fs.writeFileSync(path.join(repo, 'customhbw', 'set.json'), JSON.stringify(sampleSet()));
  const changes = [];
  let live = null;
  const { bucket, remote } = setup({ onUpdate: () => live.reload() });
  live = createLiveCustomSets([repo, remote.setsDir], { watch: false, onChange: (change) => changes.push(change) });
  const proxy = withCustomSets({ get: async () => ({ status: 200, body: '[]' }), size: () => 0 }, live);
  const name = async () => JSON.parse((await proxy.get('/v2/en/cards/customhbw-001')).body).name;
  assert.equal(await name(), 'Tyranitar');

  bucket.publish('customhbw', setFiles(renamedSet('Tyranitar Prime')));
  await remote.refresh();
  assert.equal(await name(), 'Tyranitar Prime');

  bucket.publish('customhbw', setFiles(renamedSet('Tyranitar Prime'), { '001/high.webp': 'redrawn art' }));
  assert.deepEqual(await remote.refresh(), { changed: ['customhbw'] }, 'art alone is a change');

  bucket.unpublish('customhbw');
  await remote.refresh();
  assert.equal(remote.has('customhbw'), false);
  assert.equal(await name(), 'Tyranitar');
  assert.deepEqual(changes.map((change) => change.version), [1, 2, 3]);
});

test('an index that disappears after sets loaded keeps them (a wrong URL is not an unpublish)', async () => {
  const { bucket, remote, lines } = setup();
  bucket.publish('customhbw', setFiles());
  await remote.refresh();
  bucket.index = null;
  assert.equal(await remote.refresh(), null);
  assert.equal(await remote.refresh(), null);
  assert.equal(remote.has('customhbw'), true);
  assert.deepEqual(lines, ['custom sets remote: index.json is gone (404); keeping 1 published set']);
  bucket.publish('customhbw', setFiles());
  bucket.unpublish('customhbw');
  assert.deepEqual(await remote.refresh(), { changed: ['customhbw'] }, 'an index without the set takes it off');
});

test('a relative cache folder still serves files (sendFile wants absolute paths)', async () => {
  const cwd = process.cwd();
  process.chdir(tempDir());
  try {
    const { bucket, remote } = setup({ cacheDir: 'cache' });
    assert.ok(path.isAbsolute(remote.setsDir));
    bucket.publish('customhbw', setFiles());
    await remote.refresh();
    const site = await serve(remote, tempDir());
    try {
      const art = await fetch(site.url('/src/assets/custom-sets/customhbw/001/high.webp'));
      assert.equal(await art.text(), 'high-001');
    } finally {
      await site.close();
    }
  } finally {
    process.chdir(cwd);
  }
});

test('a refused index keeps the published sets and logs once until it is fixed', async () => {
  const { bucket, remote, lines } = setup();
  bucket.publish('customhbw', setFiles());
  await remote.refresh();
  const good = bucket.index;
  bucket.index = { ...good, sets: { ...good.sets, customhbw: { files: { '../x': { sha256: 'a'.repeat(64), size: 1 } } } } };
  assert.equal(await remote.refresh(), null);
  assert.equal(await remote.refresh(), null);
  bucket.index = '{"format": tru';
  await remote.refresh();
  assert.equal(remote.has('customhbw'), true);
  assert.equal(lines.length, 2);
  assert.equal(
    lines[0],
    'custom sets remote: index.json refused (sets.customhbw.files: set.json is missing; sets.customhbw.files["../x"]: not a publishable file); keeping 1 published set'
  );
  assert.match(lines[1], /^custom sets remote: index.json unreadable \(.+\); keeping 1 published set$/);
  bucket.index = good;
  await remote.refresh();
  assert.equal(lines.at(-1), 'custom sets remote: back');
});

test('an unreachable bucket keeps what was loaded and logs once', async () => {
  const { bucket, remote, lines } = setup();
  bucket.down = true;
  await remote.refresh();
  await remote.refresh();
  assert.deepEqual(lines, ['custom sets remote: index.json unreachable (fetch failed); keeping 0 published sets']);
  bucket.down = false;
  bucket.publish('customhbw', setFiles());
  assert.deepEqual(await remote.refresh(), { changed: ['customhbw'] });
  assert.equal(lines.at(-1), 'custom sets remote: back');
});

test('a published set.json the validator refuses is skipped; the copy loaded before stays', async () => {
  const { bucket, remote, lines } = setup();
  bucket.publish('customnew', setFiles());
  assert.equal(await remote.refresh(), null);
  assert.match(lines[0], /^custom set customnew from the bucket skipped: id: customhbw but the folder is customnew.*; not loaded$/);

  bucket.publish('customhbw', setFiles());
  await remote.refresh();
  assert.equal(lines.length, 1, 'the refused set is not fetched or logged again while its files stay the same');
  bucket.publish('customhbw', setFiles('{"cards": ['));
  assert.equal(await remote.refresh(), null);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^custom set customhbw from the bucket skipped: set.json is not valid JSON .*; kept the copy loaded before$/);
  assert.equal(remote.has('customhbw'), true);
  const mirrored = JSON.parse(fs.readFileSync(path.join(remote.setsDir, 'customhbw', 'set.json'), 'utf8'));
  assert.equal(mirrored.cards[0].name, 'Tyranitar');
});

test('a blob that does not match its hash is never cached, and its set is retried next poll', async () => {
  const { bucket, remote, lines } = setup();
  const entry = bucket.publish('customhbw', setFiles());
  bucket.corrupt.add(entry.files['set.json'].sha256);
  assert.equal(await remote.refresh(), null);
  assert.match(lines[0], /^custom set customhbw from the bucket not updated: blob [0-9a-f]{12} from the bucket: /);
  assert.equal(fs.readdirSync(path.join(remote.setsDir)).length, 0);
  bucket.corrupt.clear();
  assert.deepEqual(await remote.refresh(), { changed: ['customhbw'] }, 'the index was fetched again, not answered 304');
});

async function serve(remote, staticRoot) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/src/assets/custom-sets/:setId/*', remote.fileHandler());
  app.use(express.static(staticRoot));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const url = (p) => `http://127.0.0.1:${server.address().port}${p}`;
  return { url, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('published art is served from the bucket on first ask, once per blob, with the page cache rules', async () => {
  const { bucket, remote } = setup();
  const staticRoot = tempDir();
  const repoArt = path.join(staticRoot, 'src', 'assets', 'custom-sets', 'customdemo', '001');
  fs.mkdirSync(repoArt, { recursive: true });
  fs.writeFileSync(path.join(repoArt, 'high.webp'), 'repo art');
  bucket.publish('customhbw', setFiles());
  await remote.refresh();
  const site = await serve(remote, staticRoot);
  try {
    const before = bucket.blobCalls();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => fetch(site.url('/src/assets/custom-sets/customhbw/001/high.webp')))
    );
    assert.deepEqual([...new Set(responses.map((r) => r.status))], [200]);
    assert.deepEqual([...new Set(await Promise.all(responses.map((r) => r.text())))], ['high-001']);
    assert.equal(responses[0].headers.get('content-type'), 'image/webp');
    assert.equal(responses[0].headers.get('cache-control'), 'no-store');
    assert.equal(bucket.blobCalls() - before, 1, 'twenty tiles, one download');

    const missing = await fetch(site.url('/src/assets/custom-sets/customhbw/005/high.webp'));
    assert.equal(missing.status, 404, 'a published set never falls back to other files');
    const repo = await fetch(site.url('/src/assets/custom-sets/customdemo/001/high.webp'));
    assert.equal(await repo.text(), 'repo art', 'unpublished sets come from the repo as before');

    bucket.corrupt.add(bucket.index.sets.customhbw.files['001/low.webp'].sha256);
    const tampered = await fetch(site.url('/src/assets/custom-sets/customhbw/001/low.webp'));
    assert.equal(tampered.status, 502);
    bucket.corrupt.clear();
    const fixed = await fetch(site.url('/src/assets/custom-sets/customhbw/001/low.webp'));
    assert.equal(await fixed.text(), 'low-001');
  } finally {
    await site.close();
  }
});

test('a restart starts from the bucket; blobs no published set names are removed', async () => {
  const { bucket, remote, cacheDir } = setup();
  bucket.publish('customhbw', setFiles());
  await remote.refresh();
  const site = await serve(remote, tempDir());
  try {
    await (await fetch(site.url('/src/assets/custom-sets/customhbw/001/high.webp'))).text();
  } finally {
    await site.close();
  }
  const blobs = path.join(cacheDir, 'blobs');
  const oldArt = bucket.index.sets.customhbw.files['001/high.webp'].sha256;
  assert.ok(fs.existsSync(path.join(blobs, oldArt)));
  bucket.publish('customhbw', setFiles(renamedSet('Tyranitar Prime'), { '001/high.webp': 'redrawn art' }));
  await remote.refresh();
  assert.equal(fs.existsSync(path.join(blobs, oldArt)), false);

  const again = setup({ bucket, cacheDir });
  assert.deepEqual(fs.readdirSync(again.remote.setsDir), [], 'the mirror is emptied at start');
  assert.equal(again.remote.has('customhbw'), false);
  const blobCallsBefore = bucket.blobCalls();
  assert.deepEqual(await again.remote.refresh(), { changed: ['customhbw'] });
  assert.equal(bucket.blobCalls(), blobCallsBefore, 'verified blobs from before the restart are reused');
});

test('refresh calls made while one runs share it', async () => {
  const { bucket, remote } = setup();
  bucket.publish('customhbw', setFiles());
  const [a, b] = await Promise.all([remote.refresh(), remote.refresh()]);
  assert.deepEqual(a, { changed: ['customhbw'] });
  assert.equal(a, b);
  assert.equal(bucket.calls.filter((url) => url.endsWith('index.json')).length, 1);
});
