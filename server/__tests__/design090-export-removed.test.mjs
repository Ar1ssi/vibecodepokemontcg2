// Design 090 slice C: game-state export/import, the replay viewer and /import?key= share links are
// gone. An old share link must still get a normal answer (edge case 7), the page carries none of
// the removed markup, the socket no longer answers storeGameState, and the server never opens
// db.sqlite (the file stays on disk untouched; a revert restores the feature with its data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const dbFile = fileURLToPath(new URL('../database/db.sqlite', import.meta.url));

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function withServer(run) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'production', CLIENT_BUNDLE: '0', ADMIN_PASSWORD: '', ALLOWED_ORIGINS: '', PORT: String(port) },
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
    await run({ port, alive: () => child.exitCode === null, output: () => output });
  } finally {
    child.kill('SIGKILL');
  }
}

const dbStamp = () => {
  try {
    const { size, mtimeMs } = statSync(dbFile);
    return `${size}:${mtimeMs}`;
  } catch {
    return 'absent';
  }
};

// A minimal Socket.IO client: what the server sends back to a storeGameState emit.
async function emitAndCollect(port, event, payload, ms = 600) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
  const events = [];
  const ready = new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error('websocket error'));
    ws.onmessage = ({ data }) => {
      const text = String(data);
      if (text === '2') return ws.send('3');
      if (text.startsWith('0')) return ws.send('40');
      if (text.startsWith('40')) return resolve();
      if (text.startsWith('42')) events.push(JSON.parse(text.slice(2))[0]);
    };
  });
  await ready;
  ws.send(`42${JSON.stringify([event, payload])}`);
  await new Promise((resolve) => setTimeout(resolve, ms));
  ws.close();
  return events;
}

test('row 7: an old /import?key= link gets a clean answer, not a crash', async () => {
  await withServer(async ({ port, alive }) => {
    for (const query of ['?key=abc12345', '', '?key=', '?key[]=x&key[]=y']) {
      const res = await fetch(`http://127.0.0.1:${port}/import${query}`);
      assert.ok([200, 404].includes(res.status), `/import${query} answered ${res.status}`);
      await res.text();
      assert.equal(alive(), true, `/import${query} crashed the server`);
    }
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200, 'the game page still renders after the old links');
  });
});

test('the game page carries no export, import or replay markup', async () => {
  await withServer(async ({ port }) => {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    for (const id of ['importDataJSON', 'exportState', 'importState', 'importReplay', 'exitReplay', 'jsonDiv', 'jsonReplayDiv', 'jsonFile']) {
      assert.ok(!html.includes(`id="${id}"`), id);
    }
    for (const id of ['exportLog', 'exportFullLog', 'markLogMoment', 'clearLog']) {
      assert.ok(html.includes(`id="${id}"`), `${id} (the full-log export of design 088) must stay`);
    }
  });
});

test('storeGameState is no longer a socket event: no reply, no crash, no database write', async () => {
  const before = dbStamp();
  await withServer(async ({ port, alive, output }) => {
    for (const payload of ['[{"design090":"export"}]', { not: 'a string' }, undefined]) {
      const events = await emitAndCollect(port, 'storeGameState', payload);
      assert.deepEqual(
        events.filter((name) => name.startsWith('exportGameState')),
        [],
        JSON.stringify(payload)
      );
      assert.equal(alive(), true);
    }
    assert.doesNotMatch(output(), /KeyValuePairs|storeGameState insert failed|Database size check failed/);
  });
  assert.equal(dbStamp(), before, 'db.sqlite must be left untouched');
});

test('server.js has no sqlite code left', () => {
  const source = readFileSync(fileURLToPath(new URL('../server.js', import.meta.url)), 'utf8');
  for (const gone of ['sqlite3', 'KeyValuePairs', 'storeGameState', 'isDatabaseCapacityReached', 'generateRandomKey', 'importDataJSON', "'/import'", 'initiateImport', 'resetCounter']) {
    assert.ok(!source.includes(gone), gone);
  }
});
