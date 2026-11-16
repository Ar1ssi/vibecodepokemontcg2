import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../logger.mjs';

function setup(opts = {}) {
  const clock = { ms: 5000 };
  const out = [];
  const logger = createLogger({ now: () => clock.ms, sink: (e) => out.push(e), ...opts });
  return { clock, out, logger };
}

test('level gate: trace at debug does not reach the sink', () => {
  const { out, logger } = setup();
  logger.trace('app', 'x');
  assert.equal(out.length, 0);
  assert.equal(logger.seq(), 0);
  assert.equal(logger.enabled('trace'), false);
  assert.equal(logger.enabled('debug'), true);
  logger.debug('app', 'x');
  assert.equal(out.length, 1);
});

test('line keys are ordered t,seq,lvl,cat,ev then ctx then d', () => {
  const { out, logger } = setup({ ctx: { room: 'r1', seat: 'p1' } });
  logger.info('cmd', 'emit', { a: 1 }, { sv: 7, cs: 2, seat: 'p2' });
  const entry = out[0];
  assert.deepEqual(Object.keys(JSON.parse(entry.line)), ['t', 'seq', 'lvl', 'cat', 'ev', 'room', 'seat', 'sv', 'cs', 'd']);
  assert.deepEqual(JSON.parse(entry.line), {
    t: 5000, seq: 1, lvl: 'info', cat: 'cmd', ev: 'emit', room: 'r1', seat: 'p2', sv: 7, cs: 2, d: { a: 1 },
  });
  assert.equal(entry.seq, 1);
  assert.equal(entry.t, 5000);
  const bare = setup();
  bare.logger.warn('app', 'y');
  assert.equal(bare.out[0].line, '{"t":5000,"seq":1,"lvl":"warn","cat":"app","ev":"y"}');
});

test('t rounds to 0.1 ms', () => {
  const { clock, out, logger } = setup();
  clock.ms = 1000.04;
  logger.info('app', 'a');
  clock.ms = 1000.06;
  logger.info('app', 'b');
  assert.deepEqual(out.map((e) => e.t), [1000, 1000.1]);
});

test('per-call ctx.maxBytes caps the detail and is not written', () => {
  const { out, logger } = setup();
  logger.info('app', 'big', { s: 'y'.repeat(400) }, { maxBytes: 100 });
  const parsed = JSON.parse(out[0].line);
  assert.equal(parsed.d._truncated, true);
  assert.equal('maxBytes' in parsed, false);
  logger.info('app', 'big2', { s: 'y'.repeat(400) });
  assert.equal(JSON.parse(out[1].line).d.s.length, 400);
});

test('trace detail uses the 8 KB cap, others 2 KB', () => {
  const { out, logger } = setup({ level: 'trace' });
  const d = { s: ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400), 'd'.repeat(400), 'e'.repeat(400), 'f'.repeat(400)] };
  logger.trace('app', 't', d);
  logger.debug('app', 'd', d);
  assert.equal(JSON.parse(out[0].line).d._truncated, undefined);
  assert.equal(JSON.parse(out[1].line).d._truncated, true);
});

test('flood gate: 100 same-ev entries -> 60 lines then one suppressed n=40', () => {
  const { clock, out, logger } = setup();
  for (let i = 0; i < 100; i++) logger.info('app', 'spam');
  assert.equal(out.length, 60);
  assert.equal(logger.suppressed().flooded, 40);
  clock.ms += 1000;
  logger.info('app', 'other');
  assert.equal(out.length, 62);
  const sup = JSON.parse(out[60].line);
  assert.equal(sup.lvl, 'warn');
  assert.equal(sup.cat, 'log');
  assert.equal(sup.ev, 'suppressed');
  assert.deepEqual(sup.d, { cat: 'app', ev: 'spam', n: 40 });
  assert.equal(JSON.parse(out[61].line).ev, 'other');
  assert.deepEqual(out.map((e) => e.seq), Array.from({ length: 62 }, (_, i) => i + 1));
  logger.info('app', 'other');
  assert.equal(out.length, 63);
});

test('sink throwing is counted, never propagates', () => {
  const logger = createLogger({
    now: () => 1,
    sink() {
      throw new Error('sink down');
    },
  });
  assert.doesNotThrow(() => logger.info('app', 'x'));
  assert.equal(logger.suppressed().failures, 1);
});

test('unknown level or category is dropped and counted', () => {
  const { out, logger } = setup();
  logger.log('loud', 'app', 'x');
  logger.info('nope', 'x');
  assert.equal(out.length, 0);
  assert.equal(logger.seq(), 0);
  assert.equal(logger.suppressed().failures, 2);
});

test('child shares seq, level, and sink; ctx merges', () => {
  const { out, logger } = setup();
  const child = logger.child({ room: 'r' });
  logger.info('app', 'a');
  child.info('app', 'b');
  assert.deepEqual(out.map((e) => e.seq), [1, 2]);
  assert.equal(JSON.parse(out[1].line).room, 'r');
  child.setLevel('error');
  assert.equal(logger.level(), 'error');
  logger.info('app', 'c');
  assert.equal(out.length, 2);
});

test('the sink payload names the room so a server sink can route by it', () => {
  const seen = [];
  const logger = createLogger({ now: () => 5, sink: (entry) => seen.push(entry.room) });
  logger.info('room', 'join', { id: 'a' }, { room: 'r1' });
  logger.child({ room: 'r2' }).info('room', 'join');
  logger.info('boot', 'start');
  assert.deepEqual(seen, ['r1', 'r2', null]);
});
