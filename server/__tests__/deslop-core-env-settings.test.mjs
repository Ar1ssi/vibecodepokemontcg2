import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEV_ADMIN_PASSWORD, planAdminUi } from '../access-policy.mjs';
import { wantsClientBundle } from '../client-bundle.mjs';
import { isDeployHost, isOn, readDurationMs } from '../env-settings.mjs';

test('a host that sets RENDER is a deployment even when NODE_ENV is unset', () => {
  assert.equal(isDeployHost({ RENDER: 'true' }), true);
  assert.equal(isDeployHost({ NODE_ENV: 'production' }), true);
  assert.equal(isDeployHost({}), false);
  assert.equal(isDeployHost({ NODE_ENV: 'development' }), false);
});

test('the admin UI and the client bundle read the same deployment rule', () => {
  const render = { RENDER: 'true' };
  assert.equal(wantsClientBundle(render), true);
  const plan = planAdminUi(render);
  assert.equal(plan.enabled, false, 'RENDER without NODE_ENV must not get the development password');
  assert.deepEqual(planAdminUi({ ...render, ADMIN_PASSWORD: 'hunter2' }), {
    enabled: true,
    password: 'hunter2',
    mode: 'production',
  });
  assert.equal(planAdminUi({ RENDER: 'true', ADMIN_PASSWORD: DEV_ADMIN_PASSWORD }).enabled, false);
});

test('flags share one grammar', () => {
  for (const value of ['1', 'true', 'TRUE', ' on ', 'yes']) assert.equal(isOn(value), true, value);
  for (const value of [undefined, '', '0', 'false', 'off', 'maybe']) assert.equal(isOn(value), false, String(value));
});

test('a millisecond setting is the default when unset or blank, a number when valid, an error otherwise', () => {
  assert.equal(readDurationMs({}, 'X_MS', 5), 5);
  assert.equal(readDurationMs({ X_MS: '' }, 'X_MS', 5), 5);
  assert.equal(readDurationMs({ X_MS: '  ' }, 'X_MS', 5), 5);
  assert.equal(readDurationMs({ X_MS: '0' }, 'X_MS', 5), 0);
  assert.equal(readDurationMs({ X_MS: '1500' }, 'X_MS', 5), 1500);
  for (const bad of ['abc', '3m', '-1', 'Infinity', 'NaN']) {
    assert.throws(() => readDurationMs({ X_MS: bad }, 'X_MS', 5), /X_MS=.*not a number of milliseconds/, bad);
  }
});
