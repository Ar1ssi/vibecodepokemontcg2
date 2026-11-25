import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCardImageHandler } from '../card-image-proxy.mjs';
import { createCardArtProxy } from '../card-art-proxy.mjs';
import { createTcgdexProxy, parseTcgdexKey } from '../tcgdex-proxy.mjs';
import { BodyTooLargeError, createFailureLog, createLimiter, readCapped } from '../upstream-limits.mjs';

const HOSTS = new Set(['assets.tcgdex.net']);
const ART = 'https://assets.tcgdex.net/en/sv/sv1/1/high.png';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const bodyResponse = (bytes, headers = {}) => new Response(bytes, { status: 200, headers });

test('readCapped returns a body within the cap, with or without a declared length', async () => {
  assert.deepEqual(await readCapped(bodyResponse(PNG), 100), PNG);
  assert.deepEqual(await readCapped(bodyResponse(PNG, { 'content-length': String(PNG.length) }), 100), PNG);
  assert.equal((await readCapped(new Response(null), 10)).length, 0);
});

test('readCapped refuses a body over the cap, declared or streamed', async () => {
  await assert.rejects(readCapped(bodyResponse(PNG, { 'content-length': '999' }), 5), BodyTooLargeError);
  await assert.rejects(readCapped(bodyResponse(PNG), 5), BodyTooLargeError);
  const fake = { headers: { get: () => null }, arrayBuffer: async () => Uint8Array.from(PNG).buffer };
  await assert.rejects(readCapped(fake, 5), BodyTooLargeError);
});

test('createLimiter never runs more than its limit, releases the slot of a task that throws, and hands slots on in order', async () => {
  const limiter = createLimiter(2);
  let active = 0;
  let peak = 0;
  const order = [];
  const task = (id, fail = false) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    order.push(id);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    if (fail) throw new Error('boom');
    return id;
  };
  const results = await Promise.allSettled([1, 2, 3, 4, 5, 6].map((id) => limiter.run(task(id, id === 2))));
  assert.equal(peak, 2);
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6]);
  assert.equal(results[1].status, 'rejected');
  assert.deepEqual(results.filter((r) => r.status === 'fulfilled').map((r) => r.value), [1, 3, 4, 5, 6]);
  assert.equal(await limiter.run(async () => 'after'), 'after');
});

test('createLimiter reports saturated only when every slot is busy and the queue is full', async () => {
  const limiter = createLimiter(1, { maxWaiting: 1 });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = limiter.run(() => gate);
  assert.equal(limiter.saturated(), false, 'a slot is busy but nobody waits yet');
  const second = limiter.run(async () => 'second');
  assert.equal(limiter.saturated(), true);
  release();
  await Promise.all([first, second]);
  assert.equal(limiter.saturated(), false);
});

test('createFailureLog writes one line per kind until recovered', () => {
  const lines = [];
  const outage = createFailureLog((line) => lines.push(line));
  outage.recovered('nothing was wrong');
  outage.failed('a', 'down');
  outage.failed('a', 'down again');
  outage.failed('b', 'different');
  outage.recovered('back');
  outage.recovered('back again');
  assert.deepEqual(lines, ['down', 'different', 'back']);
});

function imageRes(contentType) {
  return new Response(PNG, { status: 200, headers: { 'content-type': contentType } });
}

function fakeRes() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

async function ask(handler) {
  const res = fakeRes();
  await handler({ query: { url: ART } }, res);
  return res;
}

const fetchThroughHandler = (contentType) =>
  ask(createCardImageHandler({ fetchImpl: async () => imageRes(contentType), allowedHosts: HOSTS }));

test('card-image refuses image types a browser would run as a document (svg) and never sniffs the rest', async () => {
  assert.equal((await fetchThroughHandler('image/svg+xml')).statusCode, 502);
  assert.equal((await fetchThroughHandler('image/gif')).statusCode, 502);
  const ok = await fetchThroughHandler('Image/PNG; charset=binary');
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['content-type'], 'image/png');
  assert.equal(ok.headers['x-content-type-options'], 'nosniff');
});

test('card-image logs an upstream that cannot be reached once', async () => {
  const lines = [];
  const handler = createCardImageHandler({
    fetchImpl: async () => {
      throw new TypeError('connect refused');
    },
    allowedHosts: HOSTS,
    log: (line) => lines.push(line),
  });
  for (let i = 0; i < 3; i += 1) assert.equal((await ask(handler)).statusCode, 502);
  assert.deepEqual(lines, ['card image: upstream fetch failed (connect refused)']);
});

test('card-art logs a pushing-back CDN once, then again after it answers', async () => {
  const lines = [];
  let status = 429;
  let clock = 0;
  const proxy = createCardArtProxy({
    fetchImpl: async () => (status === 200 ? imageRes('image/png') : new Response('no', { status })),
    now: () => clock,
    log: (line) => lines.push(line),
  });
  await proxy.get(ART);
  clock += 60_000;
  await proxy.get('https://assets.tcgdex.net/en/sv/sv1/2/high.png');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^card art: upstream answered 429; no upstream requests for 30 s$/);
  status = 200;
  clock += 60_000;
  await proxy.get('https://assets.tcgdex.net/en/sv/sv1/3/high.png');
  assert.equal(lines.at(-1), 'card art: upstream answering again');
});

test('tcgdex proxy logs a block, a repeat of it once, and the recovery', async () => {
  const lines = [];
  let clock = 0;
  let status = 403;
  const proxy = createTcgdexProxy({
    fetchImpl: async () => ({ status, text: async () => '{}' }),
    now: () => clock,
    log: (line) => lines.push(line),
  });
  await proxy.get('/v2/en/cards/a-1');
  clock += 60_000;
  await proxy.get('/v2/en/cards/a-2');
  assert.deepEqual(lines, ['tcgdex proxy: upstream answered 403; no upstream requests for 30 s']);
  status = 200;
  clock += 60_000;
  await proxy.get('/v2/en/cards/a-3');
  assert.deepEqual(lines.slice(1), ['tcgdex proxy: upstream answering again']);
});

test('tcgdex proxy logs a network failure', async () => {
  const lines = [];
  const proxy = createTcgdexProxy({
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
    log: (line) => lines.push(line),
  });
  assert.equal((await proxy.get('/v2/en/cards/a-1')).status, 502);
  assert.deepEqual(lines, ['tcgdex proxy: upstream unreachable (fetch failed)']);
});

test('parseTcgdexKey tells a record from a list and splits the query once', () => {
  assert.deepEqual(parseTcgdexKey('/v2/en/cards/xy7-97'), { path: '/v2/en/cards/xy7-97', params: [], resource: 'cards', id: 'xy7-97' });
  assert.deepEqual(parseTcgdexKey('/v2/en/sets?name=A+B&x=1'), {
    path: '/v2/en/sets',
    params: [['name', 'A B'], ['x', '1']],
    resource: 'sets',
    id: null,
  });
  assert.equal(parseTcgdexKey('/v2/en/other').resource, null);
});
