import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { retiredLegacyRelayWarning } from '../netcode-mode.mjs';

test('no warning when SERVER_AUTHORITATIVE is unset, empty or switched on', () => {
  for (const value of [undefined, null, '', '  ', '1', 'true', 'on', 'yes', 'TRUE', ' Yes ']) {
    assert.equal(retiredLegacyRelayWarning(value), null, JSON.stringify(value));
  }
});

test('0, false, off and no warn that the legacy relay is gone', () => {
  for (const value of ['0', 'false', 'off', 'no', 'FALSE', ' 0 ', 'False\n', 'OFF', ' No ']) {
    const warning = retiredLegacyRelayWarning(value);
    assert.match(warning, /is ignored: the legacy relay was removed/, JSON.stringify(value));
    assert.ok(warning.includes(JSON.stringify(value)), warning);
  }
});

test('any other value is not an opt-out and does not warn', () => {
  for (const value of ['2', 'disabled', 'legacy']) {
    assert.equal(retiredLegacyRelayWarning(value), null, value);
  }
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

test('a server started with SERVER_AUTHORITATIVE=0 still runs the rules, and says so', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, PORT: String(port), SERVER_AUTHORITATIVE: '0' },
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
    assert.match(output, /Netcode mode: server-authoritative/);
    assert.match(output, /SERVER_AUTHORITATIVE="0" is ignored: the legacy relay was removed/);
  } finally {
    child.kill('SIGKILL');
  }
});
