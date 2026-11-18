// Socket payloads are untrusted: what joinGame, userReconnected, the relay events and
// storeGameState do with room names the server reserves and with payloads of the wrong shape.
// Drives a real server over the Socket.IO wire format (engine.io v4 text frames) with Node's
// built-in WebSocket, since the client library is not a dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function withServer(run, env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'production', CLIENT_BUNDLE: '0', ADMIN_PASSWORD: '', ALLOWED_ORIGINS: '', ...env, PORT: String(port) },
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

/** A Socket.IO client on the default namespace: `emit(event, ...args)` and what came back. */
async function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
  const received = [];
  const waiters = [];
  let sid = null;
  const ready = new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error('websocket error'));
    ws.onmessage = ({ data }) => {
      const text = String(data);
      if (text === '2') return ws.send('3');
      if (text.startsWith('0')) return ws.send('40');
      if (text.startsWith('40')) {
        sid = JSON.parse(text.slice(2)).sid;
        return resolve();
      }
      if (!text.startsWith('42')) return;
      const [event, ...args] = JSON.parse(text.slice(2));
      received.push({ event, args });
      for (const waiter of [...waiters]) waiter();
    };
  });
  await ready;
  const find = (event) => received.find((item) => item.event === event);
  return {
    sid,
    received,
    emit: (event, ...args) => ws.send(`42${JSON.stringify([event, ...args])}`),
    async waitFor(event, ms = 3000) {
      const deadline = Date.now() + ms;
      while (!find(event)) {
        if (Date.now() > deadline) throw new Error(`no ${event}; got ${JSON.stringify(received.map((r) => r.event))}`);
        await new Promise((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
        waiters.length = 0;
      }
      return find(event).args[0];
    },
    close: () => ws.close(),
  };
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

test('joinGame refuses a room named after another socket, the lobby channel, or a non-string', async () => {
  await withServer(async ({ port }) => {
    const victim = await connect(port);
    for (const roomId of [victim.sid, 'lobby:watchers', 123, null, '', '   ', { a: 1 }]) {
      const intruder = await connect(port);
      intruder.emit('joinGame', roomId, 'mallory', false, null);
      assert.deepEqual(await intruder.waitFor('roomReject'), { reason: 'bad_request' }, JSON.stringify(roomId));
      assert.equal(intruder.received.some((r) => r.event === 'joinGame'), false, JSON.stringify(roomId));
      intruder.close();
    }
    const nameless = await connect(port);
    nameless.emit('joinGame', 'deslop-core-room-a', undefined, false, null);
    assert.deepEqual(await nameless.waitFor('roomReject'), { reason: 'bad_request' });
    const honest = await connect(port);
    honest.emit('joinGame', 'deslop-core-room-b', 'alice', false, null);
    await honest.waitFor('joinGame');
    victim.close();
    nameless.close();
    honest.close();
  });
});

test('a solo room cannot take a reserved name or a malformed decks value', async () => {
  await withServer(async ({ port }) => {
    const victim = await connect(port);
    const intruder = await connect(port);
    intruder.emit('joinGame', victim.sid, 'mallory', false, null, { solo: true });
    assert.deepEqual(await intruder.waitFor('roomReject'), { reason: 'solo_room' });
    const badDecks = await connect(port);
    badDecks.emit('joinGame', 'deslop-core-solo-a', 'carol', false, null, { solo: true, decks: 'not an object' });
    assert.deepEqual(await badDecks.waitFor('roomReject'), { reason: 'bad_request' });
    const solo = await connect(port);
    solo.emit('joinGame', 'deslop-core-solo-b', 'dave', false, null, { solo: true });
    assert.equal((await solo.waitFor('joinGame')).solo, true);
  });
});

test('a relayed event cannot be aimed at another socket or at the lobby channel', async () => {
  await withServer(async ({ port }) => {
    const victim = await connect(port);
    const sender = await connect(port);
    for (const roomId of [victim.sid, 'lobby:watchers']) {
      sender.emit('pushAction', { roomId, action: 'forged' });
      sender.emit('appendMessage', { roomId, message: 'forged' });
    }
    await settle();
    assert.deepEqual(victim.received, []);
  });
});

test('a Render host without NODE_ENV is closed to the e2e bridge, the dev routes and the admin UI', async () => {
  const env = { RENDER: 'true', NODE_ENV: undefined, PTCG_E2E: undefined };
  await withServer(async ({ port, output }) => {
    assert.match(output(), /e2e bridge: disabled/);
    assert.match(output(), /Socket\.IO admin UI is off/);
    const response = await fetch(`http://127.0.0.1:${port}/api/log/rooms`);
    assert.equal(response.status, 404);
  }, env);
});

test('PTCG_E2E reads the same on/off grammar as the other flags', async () => {
  await withServer(async ({ output }) => {
    assert.match(output(), /e2e bridge: ARMED/);
  }, { PTCG_E2E: 'yes' });
});

test('payloads of the wrong shape are refused and the server keeps running', async () => {
  await withServer(async ({ port, alive, output }) => {
    const client = await connect(port);
    client.emit('userReconnected');
    assert.deepEqual(await client.waitFor('roomReject'), { reason: 'bad_request' });
    for (const payload of [null, 'text', 42, { roomId: 7, username: 'x' }, { roomId: client.sid, username: 'x' }, { roomId: 'r' }]) {
      client.received.length = 0;
      client.emit('userReconnected', payload);
      assert.deepEqual(await client.waitFor('roomReject'), { reason: 'bad_request' }, JSON.stringify(payload));
    }
    for (const event of ['pushAction', 'requestAction', 'appendMessage', 'leaveRoom', 'requestPeerLog']) {
      client.emit(event);
      client.emit(event, 'text');
      client.emit(event, null);
    }
    await settle();
    assert.equal(alive(), true, output());
    client.emit('joinGame', 'deslop-core-room-c', 'erin', false, null);
    await client.waitFor('joinGame');
  });
});

test('a game room that does not exist is reported as gone, not as a restart', async () => {
  await withServer(async ({ port }) => {
    const client = await connect(port);
    client.emit('userReconnected', { roomId: 'deslop-core-missing', username: 'frank', notSpectator: true });
    const ended = await client.waitFor('gameEnded');
    assert.equal(ended.winner, null);
    assert.doesNotMatch(ended.message, /^Game session terminated due to server restart\.$/);
    assert.match(ended.message, /no longer available/);
  });
});

test('storeGameState saves a string and refuses anything else', async () => {
  await withServer(async ({ port }) => {
    const client = await connect(port);
    client.emit('storeGameState', { not: 'a string' });
    assert.match(await client.waitFor('exportGameStateFailed'), /Error exporting game/);
    client.received.length = 0;
    client.emit('storeGameState', undefined);
    assert.match(await client.waitFor('exportGameStateFailed'), /Error exporting game/);
    client.received.length = 0;
    client.emit('storeGameState', '[{"deslop":"core"}]');
    const key = await client.waitFor('exportGameStateSuccessful');
    assert.match(key, /^[A-Za-z0-9_-]{8}$/);
  });
});
