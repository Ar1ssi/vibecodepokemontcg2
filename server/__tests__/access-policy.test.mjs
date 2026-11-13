import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_UI_ORIGIN,
  DEV_ADMIN_PASSWORD,
  parseAllowedOrigins,
  planAdminUi,
  planCors,
} from '../access-policy.mjs';

test('outside production the admin UI is on, with the development password unless one is set', () => {
  for (const env of [{}, { NODE_ENV: 'development' }, { ADMIN_PASSWORD: '' }, { ADMIN_PASSWORD: '  ' }]) {
    assert.deepEqual(planAdminUi(env), {
      enabled: true,
      password: DEV_ADMIN_PASSWORD,
      mode: 'development',
    });
  }
  assert.deepEqual(planAdminUi({ ADMIN_PASSWORD: 'hunter2' }), {
    enabled: true,
    password: 'hunter2',
    mode: 'development',
  });
});

test('a production server without a password of its own keeps the admin UI off', () => {
  for (const password of [undefined, '', '   ', DEV_ADMIN_PASSWORD]) {
    const plan = planAdminUi({ NODE_ENV: 'production', ADMIN_PASSWORD: password });
    assert.equal(plan.enabled, false, JSON.stringify(password));
    assert.equal(plan.password, undefined);
    assert.match(plan.warning, /^Socket\.IO admin UI is off: /);
  }
});

test('a production server with its own password serves the admin UI in production mode', () => {
  assert.deepEqual(planAdminUi({ NODE_ENV: 'production', ADMIN_PASSWORD: ' s3cret ' }), {
    enabled: true,
    password: ' s3cret ',
    mode: 'production',
  });
});

test('planAdminUi survives a missing environment', () => {
  assert.equal(planAdminUi(undefined).enabled, true);
  assert.equal(planAdminUi(null).password, DEV_ADMIN_PASSWORD);
});

test('ALLOWED_ORIGINS is a comma list reduced to origins, without duplicates', () => {
  assert.deepEqual(
    parseAllowedOrigins(' https://a.example/ , http://localhost:4000/deck-builder,https://a.example '),
    { origins: ['https://a.example', 'http://localhost:4000'], warnings: [] }
  );
});

test('unset, empty and blank ALLOWED_ORIGINS allow nobody', () => {
  for (const value of [undefined, null, '', ' , ,']) {
    assert.deepEqual(parseAllowedOrigins(value), { origins: [], warnings: [] });
  }
});

test('entries that are not an http(s) origin are dropped with a warning, the wildcard included', () => {
  const { origins, warnings } = parseAllowedOrigins('*, a.example, ftp://a.example, https://ok.example');
  assert.deepEqual(origins, ['https://ok.example']);
  assert.equal(warnings.length, 3);
  for (const entry of ['"*"', '"a.example"', '"ftp://a.example"']) {
    assert.ok(warnings.some((warning) => warning.includes(entry)), entry);
  }
});

test('with nothing configured no other origin is allowed, apart from the admin UI on the socket', () => {
  assert.deepEqual(planCors({}, { enabled: false }), {
    http: { origin: false },
    socket: { origin: false, credentials: true },
    warnings: [],
  });
  assert.deepEqual(planCors({}, { enabled: true }), {
    http: { origin: false },
    socket: { origin: [ADMIN_UI_ORIGIN], credentials: true },
    warnings: [],
  });
});

test('ALLOWED_ORIGINS reaches both the HTTP routes and the socket', () => {
  const plan = planCors({ ALLOWED_ORIGINS: `https://a.example,${ADMIN_UI_ORIGIN}` }, { enabled: true });
  assert.deepEqual(plan.http.origin, ['https://a.example', ADMIN_UI_ORIGIN]);
  assert.deepEqual(plan.socket.origin, ['https://a.example', ADMIN_UI_ORIGIN]);
});

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function withServer(env, run) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, ADMIN_PASSWORD: '', ALLOWED_ORIGINS: '', ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  try {
    const deadline = Date.now() + 20000;
    while (!output.includes('Netcode mode:') && Date.now() < deadline) {
      assert.equal(child.exitCode, null, `server exited early:\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(output, /Netcode mode:/, output);
    await run({ base: `http://127.0.0.1:${port}`, output: () => output });
  } finally {
    child.kill('SIGKILL');
  }
}

const corsHeader = (response) => response.headers.get('access-control-allow-origin');
const socketHandshake = (base) => `${base}/socket.io/?EIO=4&transport=polling`;

test('a running server gives a foreign origin no CORS allowance, on HTTP or on the socket', async () => {
  await withServer({ NODE_ENV: 'production', CLIENT_BUNDLE: '0' }, async ({ base, output }) => {
    const headers = { Origin: 'https://evil.example' };
    const page = await fetch(`${base}/api/tcgl-foil/config`, { headers });
    assert.equal(page.status, 200);
    assert.equal(corsHeader(page), null);
    const handshake = await fetch(socketHandshake(base), { headers });
    assert.equal(handshake.status, 200);
    assert.equal(corsHeader(handshake), null);
    assert.equal(handshake.headers.get('access-control-allow-credentials'), null);
    assert.match(output(), /Socket\.IO admin UI is off: set ADMIN_PASSWORD/);
  });
});

test('a running server allows the origins in ALLOWED_ORIGINS, and the admin UI once it has a password', async () => {
  const env = { NODE_ENV: 'production', CLIENT_BUNDLE: '0', ADMIN_PASSWORD: 's3cret', ALLOWED_ORIGINS: 'https://a.example' };
  await withServer(env, async ({ base, output }) => {
    const page = await fetch(`${base}/api/tcgl-foil/config`, { headers: { Origin: 'https://a.example' } });
    assert.equal(corsHeader(page), 'https://a.example');
    for (const origin of ['https://a.example', ADMIN_UI_ORIGIN]) {
      const handshake = await fetch(socketHandshake(base), { headers: { Origin: origin } });
      assert.equal(corsHeader(handshake), origin);
      assert.equal(handshake.headers.get('access-control-allow-credentials'), 'true');
    }
    const foreign = await fetch(socketHandshake(base), { headers: { Origin: 'https://evil.example' } });
    assert.equal(corsHeader(foreign), null);
    assert.doesNotMatch(output(), /admin UI is off/);
  });
});
