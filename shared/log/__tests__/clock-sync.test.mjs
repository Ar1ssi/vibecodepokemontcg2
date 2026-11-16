import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClockSync } from '../clock-sync.mjs';

test('zero before any sample', () => {
  const c = createClockSync();
  assert.equal(c.offset(), 0);
  assert.equal(c.rtt(), 0);
});

test('lowest-RTT sample wins (rtt 80/20/50)', () => {
  const c = createClockSync();
  c.sample({ t0: 0, t1: 80, serverT: 1000 });
  c.sample({ t0: 100, t1: 120, serverT: 1110 });
  c.sample({ t0: 200, t1: 250, serverT: 5000 });
  assert.equal(c.rtt(), 20);
  assert.equal(c.offset(), 1110 - 110);
});

test('invalid samples are ignored', () => {
  const c = createClockSync();
  c.sample({ t0: 10, t1: 5, serverT: 1 });
  c.sample({ t0: NaN, t1: 5, serverT: 1 });
  c.sample({ t0: 1, t1: 5, serverT: Infinity });
  assert.equal(c.rtt(), 0);
});

test('only the last `keep` samples count', () => {
  const c = createClockSync({ keep: 2 });
  c.sample({ t0: 0, t1: 1, serverT: 0 });
  c.sample({ t0: 0, t1: 50, serverT: 0 });
  c.sample({ t0: 0, t1: 60, serverT: 0 });
  assert.equal(c.rtt(), 50);
});
