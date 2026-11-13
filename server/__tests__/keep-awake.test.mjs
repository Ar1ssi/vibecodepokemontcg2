import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEEP_AWAKE_INTERVAL_MS,
  KEEP_AWAKE_PATH,
  planKeepAwake,
  startKeepAwake,
} from '../keep-awake.mjs';

const PLAN = { url: 'https://site.example/healthz', intervalMs: KEEP_AWAKE_INTERVAL_MS };

test('off unless KEEP_AWAKE is switched on', () => {
  assert.equal(planKeepAwake({}), null);
  assert.equal(planKeepAwake(), null);
  assert.equal(planKeepAwake({ RENDER_EXTERNAL_URL: 'https://site.example' }), null);
  assert.equal(planKeepAwake({ KEEP_AWAKE: '0', RENDER_EXTERNAL_URL: 'https://site.example' }), null);
  assert.equal(planKeepAwake({ KEEP_AWAKE: 'off', RENDER_EXTERNAL_URL: 'https://site.example' }), null);
});

test('on: pings the health path of the public URL every 10 minutes', () => {
  assert.equal(KEEP_AWAKE_PATH, '/healthz');
  // Render stops a free service after 15 idle minutes; the ping has to come sooner.
  assert.equal(KEEP_AWAKE_INTERVAL_MS, 10 * 60 * 1000);
  assert.deepEqual(planKeepAwake({ KEEP_AWAKE: '1', RENDER_EXTERNAL_URL: 'https://site.example' }), PLAN);
  assert.deepEqual(planKeepAwake({ KEEP_AWAKE: 'true', RENDER_EXTERNAL_URL: 'https://site.example/' }), PLAN);
});

test('KEEP_AWAKE_URL wins over the URL Render reports', () => {
  const plan = planKeepAwake({
    KEEP_AWAKE: '1',
    KEEP_AWAKE_URL: 'https://play.example',
    RENDER_EXTERNAL_URL: 'https://site.example',
  });
  assert.equal(plan.url, 'https://play.example/healthz');
});

test('on without a usable address reports why and plans no ping', () => {
  assert.match(planKeepAwake({ KEEP_AWAKE: '1' }).error, /neither KEEP_AWAKE_URL nor RENDER_EXTERNAL_URL/);
  assert.match(planKeepAwake({ KEEP_AWAKE: '1', KEEP_AWAKE_URL: 'not a url' }).error, /is not a URL/);
  assert.match(planKeepAwake({ KEEP_AWAKE: '1', KEEP_AWAKE_URL: 'ftp://site.example' }).error, /not an http\(s\) URL/);
  assert.equal(planKeepAwake({ KEEP_AWAKE: '1', KEEP_AWAKE_URL: 'ftp://site.example' }).url, undefined);
});

/** A timer the test fires by hand, and a fetch that answers from a script of outcomes. */
const harness = (outcomes) => {
  const calls = [];
  const warnings = [];
  const timers = [];
  const cleared = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const outcome = outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  const setTimer = (fn, ms) => {
    const timer = { fn, ms, unrefCalled: false, unref() { this.unrefCalled = true; } };
    timers.push(timer);
    return timer;
  };
  const loop = startKeepAwake(PLAN, {
    fetchImpl,
    setTimer,
    clearTimer: (timer) => cleared.push(timer),
    warn: (message) => warnings.push(message),
  });
  return { calls, warnings, timers, cleared, loop };
};

test('the loop pings on the interval and never holds the process open', async () => {
  const { calls, warnings, timers, cleared, loop } = harness([{ ok: true, status: 200 }]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, KEEP_AWAKE_INTERVAL_MS);
  assert.equal(timers[0].unrefCalled, true);
  assert.deepEqual(calls, [], 'nothing is requested before the first interval');
  assert.equal(await timers[0].fn(), true);
  assert.deepEqual(calls, [PLAN.url]);
  assert.deepEqual(warnings, []);
  loop.stop();
  assert.deepEqual(cleared, [timers[0]]);
});

test('a failing ping is reported once per outage, whatever the failure', async () => {
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const { warnings, loop } = harness([
    { ok: false, status: 503 },
    new Error('connect ECONNREFUSED'),
    timeout,
    { ok: true, status: 200 },
    timeout,
  ]);
  assert.equal(await loop.ping(), false);
  assert.equal(await loop.ping(), false);
  assert.equal(await loop.ping(), false);
  assert.deepEqual(warnings, ['keep-awake: ping to https://site.example/healthz failed (HTTP 503)']);
  assert.equal(await loop.ping(), true);
  assert.equal(await loop.ping(), false);
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /failed \(timeout\)/);
});
