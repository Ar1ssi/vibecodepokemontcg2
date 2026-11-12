import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogStore } from '../log-store.mjs';
import { createLogExport } from '../export-routes.mjs';

const CLIENT_A = 'a1b2c3d4e5f60718';
const CLIENT_B = 'b2c3d4e5f6071829';
const clock = { ms: 1_700_000_000_000 };

function fakeSocket(id, { clientId, rooms = [], answer }) {
  const handlers = {};
  return {
    id,
    data: clientId ? { logClientId: clientId } : {},
    rooms: new Set(rooms),
    handlers,
    on: (event, fn) => { handlers[event] = fn; },
    timeout: () => ({
      emit: (event, payload, cb) => {
        if (answer === 'timeout') cb(new Error('timeout'));
        else cb(null, answer);
      },
    }),
  };
}

function setup({ sockets }) {
  clock.ms = 1_700_000_000_000;
  const store = createLogStore({ now: () => clock.ms });
  store.link(CLIENT_A, 'r1', { socketId: 's1' });
  store.link(CLIENT_B, 'r1', { socketId: 's2' });
  for (const id of [CLIENT_A, CLIENT_B]) {
    store.append(`client:${id}`, { seq: 1, t: clock.ms, ts: clock.ms, lvl: 'info', load: 'deadbeef', line: `{"t":${clock.ms},"seq":1,"lvl":"info","cat":"app","ev":"x"}` });
  }
  store.append('room:r1', { seq: 1, t: clock.ms, ts: clock.ms, lvl: 'info', line: `{"t":${clock.ms},"seq":1,"lvl":"info","cat":"room","ev":"x"}` });
  const emitted = [];
  const logged = [];
  const tails = [];
  const io = {
    sockets: {
      adapter: { rooms: new Map([['r1', new Set(sockets.map((s) => s.id))]]) },
      sockets: new Map(sockets.map((s) => [s.id, s])),
    },
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  };
  let n = 0;
  const exporter = createLogExport({
    store,
    log: { info: (...args) => logged.push(args) },
    io,
    journalFor: () => null,
    levelFor: () => 'debug',
    build: { commit: 'abc' },
    netcode: 'server-authoritative',
    describe: (socketId) => ({ username: socketId === 's1' ? 'Ash' : null, seat: socketId === 's1' ? 'p1' : null }),
    acceptTail: (socket, tail) => tails.push({ id: socket.id, tail }),
    now: () => clock.ms,
    randomToken: () => (n++).toString(16).padStart(32, '0'),
  });
  return { exporter, store, emitted, logged, tails };
}

function response() {
  const res = { headers: {}, status(code) { res.code = code; return res; }, setHeader(k, v) { res.headers[k] = v; }, end(body) { res.body = body; res.ended = true; }, json(body) { res.jsonBody = body; } };
  return res;
}
const request = (extra) => ({ acceptsEncodings: () => false, params: {}, query: {}, ...extra });
const call = (socket, payload) => new Promise((resolve) => socket.handlers['log:export'](payload, resolve));

function twoPlayers() {
  const a = fakeSocket('s1', { clientId: CLIENT_A, rooms: ['r1'], answer: { meta: { w: 1 } } });
  const b = fakeSocket('s2', { clientId: CLIENT_B, rooms: ['r1'], answer: 'timeout' });
  return [a, b];
}

test('requester outside the named room gets not_in_room; no room and no hello gets no_hello', async () => {
  const [a, b] = twoPlayers();
  const outsider = fakeSocket('s9', { clientId: 'c3d4e5f607182930', rooms: [] });
  const { exporter } = setup({ sockets: [a, b] });
  exporter.attachSocket(outsider);
  assert.deepEqual(await call(outsider, { roomId: 'r1' }), { ok: false, reason: 'not_in_room' });
  const anonymous = fakeSocket('s8', { rooms: [] });
  exporter.attachSocket(anonymous);
  assert.deepEqual(await call(anonymous, {}), { ok: false, reason: 'no_hello' });
});

test('a non-function ack is ignored', async () => {
  const [a, b] = twoPlayers();
  const { exporter } = setup({ sockets: [a, b] });
  exporter.attachSocket(a);
  await assert.doesNotReject(async () => a.handlers['log:export']({ roomId: 'r1' }, undefined));
});

test('room export: snapshots in parallel, announcement, one-time URL, download body', async () => {
  const [a, b] = twoPlayers();
  const { exporter, emitted, logged } = setup({ sockets: [a, b] });
  exporter.attachSocket(a);
  const ack = await call(a, { roomId: 'r1', note: 'broke' });
  assert.equal(ack.ok, true);
  assert.match(ack.url, /^\/api\/log\/export\/[0-9a-f]{32}$/);
  assert.match(ack.filename, /^ptcg-log_r1_\d{8}-\d{6}\.ndjson$/);
  const bySrc = Object.fromEntries(ack.sources.map((s) => [s.src, s.snapshot]));
  assert.equal(bySrc['c:a1b2c3d4'], 'ok');
  assert.equal(bySrc['c:b2c3d4e5'], 'timeout');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, 'r1');
  assert.equal(emitted[0].event, 'appendMessage');
  assert.match(emitted[0].payload.message, /Ash exported the match log/);
  assert.equal(logged[0][1], 'export');

  const token = ack.url.split('/').pop();
  const res = response();
  exporter.downloadHandler(request({ params: { token } }), res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'application/x-ndjson; charset=utf-8');
  assert.match(res.headers['Content-Disposition'], /attachment; filename="ptcg-log_r1_/);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const header = JSON.parse(res.body.split('\n')[0]);
  assert.equal(header.k, 'header');
  assert.equal(header.note, 'broke');
  assert.equal(header.requester.username, 'Ash');
  assert.ok(res.body.endsWith('\n'));

  const again = response();
  exporter.downloadHandler(request({ params: { token } }), again);
  assert.equal(again.code, 404);
});

test('an expired token is a 404, and an unknown one too', async () => {
  const [a, b] = twoPlayers();
  const { exporter } = setup({ sockets: [a, b] });
  exporter.attachSocket(a);
  const ack = await call(a, { roomId: 'r1' });
  clock.ms += 61_000;
  const res = response();
  exporter.downloadHandler(request({ params: { token: ack.url.split('/').pop() } }), res);
  assert.equal(res.code, 404);
  const unknown = response();
  exporter.downloadHandler(request({ params: { token: '0'.repeat(32) } }), unknown);
  assert.equal(unknown.code, 404);
});

test('two exports get distinct tokens that each work once', async () => {
  const [a, b] = twoPlayers();
  const { exporter } = setup({ sockets: [a, b] });
  exporter.attachSocket(a);
  const first = await call(a, { roomId: 'r1' });
  const second = await call(a, { roomId: 'r1' });
  assert.notEqual(first.url, second.url);
  for (const ack of [first, second]) {
    const res = response();
    exporter.downloadHandler(request({ params: { token: ack.url.split('/').pop() } }), res);
    assert.equal(res.code, 200);
  }
});

test('at most 8 tokens are kept; the oldest is dropped', async () => {
  const [a, b] = twoPlayers();
  const { exporter } = setup({ sockets: [a, b] });
  exporter.attachSocket(a);
  const urls = [];
  for (let i = 0; i < 9; i++) urls.push((await call(a, { roomId: 'r1' })).url);
  const oldest = response();
  exporter.downloadHandler(request({ params: { token: urls[0].split('/').pop() } }), oldest);
  assert.equal(oldest.code, 404);
  const newest = response();
  exporter.downloadHandler(request({ params: { token: urls[8].split('/').pop() } }), newest);
  assert.equal(newest.code, 200);
});

test('client-scope export (no room) snapshots only the requester and skips the announcement', async () => {
  const solo = fakeSocket('s7', { clientId: CLIENT_A, rooms: [], answer: { meta: {} } });
  const { exporter, emitted } = setup({ sockets: [solo] });
  exporter.attachSocket(solo);
  const ack = await call(solo, {});
  assert.equal(ack.ok, true);
  assert.match(ack.filename, /^ptcg-log_session_/);
  assert.equal(emitted.length, 0);
  assert.deepEqual(ack.sources.map((s) => s.src).filter(Boolean), ['server', 'c:a1b2c3d4']);
});

test('gzip is used when accepted', async () => {
  const [a, b] = twoPlayers();
  const { exporter } = setup({ sockets: [a, b] });
  exporter.attachSocket(a);
  const ack = await call(a, { roomId: 'r1' });
  const res = response();
  await new Promise((resolve) => {
    const end = res.end;
    res.end = (body) => { end(body); resolve(); };
    exporter.downloadHandler(request({ params: { token: ack.url.split('/').pop() }, acceptsEncodings: () => true }), res);
  });
  assert.equal(res.headers['Content-Encoding'], 'gzip');
  assert.ok(Buffer.isBuffer(res.body));
});

test('dev routes: unknown room 404, known room exports with a header, rooms lists it', () => {
  const [a, b] = twoPlayers();
  const { exporter } = setup({ sockets: [a, b] });
  const missing = response();
  exporter.devExportHandler(request({ query: { room: 'nope' } }), missing);
  assert.equal(missing.code, 404);
  const ok = response();
  exporter.devExportHandler(request({ query: { room: 'r1' } }), ok);
  const header = JSON.parse(ok.body.split('\n')[0]);
  assert.equal(header.k, 'header');
  assert.equal(header.requester.dev, true);
  assert.ok(header.sources.slice(1).every((s) => s.snapshot === 'not_requested'));
  const rooms = response();
  exporter.devRoomsHandler(request(), rooms);
  assert.equal(rooms.jsonBody.rooms.length, 1);
  assert.equal(rooms.jsonBody.rooms[0].roomId, 'r1');
  assert.equal(rooms.jsonBody.rooms[0].participants, 2);
});

test('a snapshot reply carrying a tail hands it to ingest and keeps it out of the file', async () => {
  const tail = { loadId: 'deadbeef', lines: ['{"t":1,"seq":2,"lvl":"info","cat":"app","ev":"y"}'] };
  const a = fakeSocket('s1', { clientId: CLIENT_A, rooms: ['r1'], answer: { meta: { w: 1 }, tail } });
  const b = fakeSocket('s2', { clientId: CLIENT_B, rooms: ['r1'], answer: { meta: { w: 2 } } });
  const { exporter, tails } = setup({ sockets: [a, b] });
  exporter.attachSocket(a);
  const ack = await call(a, { roomId: 'r1' });
  assert.deepEqual(tails, [{ id: 's1', tail }]);
  const res = response();
  exporter.downloadHandler(request({ params: { token: ack.url.split('/').pop() } }), res);
  const snaps = res.body.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.k === 'snap');
  assert.equal(snaps.length, 2);
  assert.ok(snaps.every((snap) => !('tail' in snap)));
});
