import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDiskSink, resolveLogDir } from '../disk-sink.mjs';
import { LIMITS } from '../../../shared/log/log-schema.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'disk-sink-'));
const noTimer = () => ({ unref() {} });

test('resolveLogDir', () => {
  assert.equal(resolveLogDir({ LOG_DIR: 'off' }, '/r'), null);
  assert.equal(resolveLogDir({ LOG_DIR: 'x/y' }, '/r'), path.resolve('/r', 'x/y'));
  assert.equal(resolveLogDir({}, '/r'), path.join('/r', 'out', 'logs'));
  assert.equal(resolveLogDir({ NODE_ENV: 'production' }, '/r'), null);
  assert.equal(resolveLogDir({ NODE_ENV: 'production', LOG_DIR: '/abs' }, '/r'), '/abs');
});

test('three writes give three lines after flushSync; names are sanitised', () => {
  const dir = tmp();
  const sink = createDiskSink({ dir, bootId: 'b1', setIntervalRef: noTimer });
  sink.write('room:a/b', '{"n":1}');
  sink.write('room:a/b', '{"n":2}');
  sink.write('room:a/b', '{"n":3}');
  sink.flushSync();
  const file = path.join(dir, 'b1', 'room_a_b.ndjson');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"n":1}\n{"n":2}\n{"n":3}\n');
  sink.write('room:a/b', '{"n":4}');
  sink.close();
  assert.equal(fs.readFileSync(file, 'utf8').split('\n').length, 5);
  fs.rmSync(dir, { recursive: true });
});

test('the timer flush appends asynchronously', async () => {
  const dir = tmp();
  let tick;
  const sink = createDiskSink({ dir, bootId: 'b', setIntervalRef: (fn) => { tick = fn; return noTimer(); } });
  sink.write('server', 'L');
  tick();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fs.readFileSync(path.join(dir, 'b', 'server.ndjson'), 'utf8'), 'L\n');
  fs.rmSync(dir, { recursive: true });
});

test('unwritable dir: no throw, one warn, writes dropped', () => {
  const warns = [];
  const fsRef = { ...fs, mkdirSync() { throw new Error('EACCES'); } };
  const sink = createDiskSink({ dir: '/nope', bootId: 'b', fsRef, onWarn: (w) => warns.push(w), setIntervalRef: noTimer });
  sink.write('server', 'x');
  sink.write('room:r', 'y');
  sink.flushSync();
  sink.close();
  assert.equal(warns.length, 1);
  assert.equal(warns[0].reason, 'EACCES');
});

test('size cap disables the stream after one warn and keeps others', () => {
  const dir = tmp();
  const warns = [];
  const sink = createDiskSink({
    dir,
    bootId: 'b',
    limits: { ...LIMITS, diskFileBytes: 10 },
    onWarn: (w) => warns.push(w),
    setIntervalRef: noTimer,
  });
  sink.write('server', 'abcd'); // 5 bytes
  sink.write('server', 'efgh'); // 10 bytes: fits
  sink.write('server', 'i'); // would pass 10
  sink.write('server', 'j');
  sink.write('room:r', 'ok');
  sink.flushSync();
  assert.deepEqual(warns, [{ streamId: 'server', reason: 'size' }]);
  assert.equal(fs.readFileSync(path.join(dir, 'b', 'server.ndjson'), 'utf8'), 'abcd\nefgh\n');
  assert.equal(fs.readFileSync(path.join(dir, 'b', 'room_r.ndjson'), 'utf8'), 'ok\n');
  fs.rmSync(dir, { recursive: true });
});

test('append failure disables that stream with the error message', () => {
  const warns = [];
  const fsRef = { ...fs, mkdirSync() {}, readdirSync() { return []; }, appendFileSync() { throw new Error('ENOSPC'); } };
  const sink = createDiskSink({ dir: '/d', bootId: 'b', fsRef, onWarn: (w) => warns.push(w), setIntervalRef: noTimer });
  sink.write('server', 'x');
  sink.flushSync();
  sink.write('server', 'y');
  sink.flushSync();
  assert.deepEqual(warns, [{ streamId: 'server', reason: 'ENOSPC' }]);
});

test('only the newest diskKeepBoots-1 old boot dirs survive next to the new one', () => {
  const dir = tmp();
  for (let i = 0; i < 4; i++) {
    const d = path.join(dir, `old${i}`);
    fs.mkdirSync(d);
    fs.utimesSync(d, 1000 + i, 1000 + i);
  }
  const sink = createDiskSink({ dir, bootId: 'new', limits: { ...LIMITS, diskKeepBoots: 3 }, setIntervalRef: noTimer });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['new', 'old2', 'old3']);
  sink.close();
  fs.rmSync(dir, { recursive: true });
});

test('the flush timer is unref-ed when possible', () => {
  let unref = 0;
  const dir = tmp();
  createDiskSink({ dir, bootId: 'b', setIntervalRef: () => ({ unref: () => { unref++; } }) });
  assert.equal(unref, 1);
  fs.rmSync(dir, { recursive: true });
});
