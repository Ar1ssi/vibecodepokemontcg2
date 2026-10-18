// Design 069 e2e: a third browser spectates a server-authoritative game and switches between
// P1 POV, P2 POV and the side-by-side broadcast layout.
// Usage: pnpm test:spectator   (spawns its own authoritative server on a free port)
//   PTCG_BOARD=3d   the three.js board (`?board=3d`, design 074): hands are read from the board
//                   mirror's shadow roots and `__ptcg.cardRect` instead of the iframes
//   PTCG_URL=http://host:port   reuse a running server (started with SERVER_AUTHORITATIVE=1 PTCG_E2E=1)
//   CHROMIUM_PATH=/path/to/chrome   picks the browser (PW_CHROMIUM is the older name)
//   SHOTS=<dir>   saves a screenshot per view
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROOM = `spec-${Date.now()}`;
const SHOTS = process.env.SHOTS || '';
const BOARD = process.env.PTCG_BOARD === '3d' ? '3d' : 'iframe';
const IS_3D = BOARD === '3d';
// No GPU in CI containers: WebGL2 through SwiftShader.
const GL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PTCG_E2E: '1', SERVER_AUTHORITATIVE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      const res = await fetch(base);
      if (res.ok) return { base, child };
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill('SIGKILL');
  throw new Error(`server did not start on ${base}:\n${output}`);
}

async function waitFor(page, fn, arg, timeout = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

async function openClient(browser, name, base) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('dialog', (dialog) => dialog.accept());
  // The board's document for a side: the mirror's open shadow root on the 3D board, the seat's
  // iframe document otherwise. Installed before any script runs so page.evaluate callbacks can use it.
  await page.addInitScript(() => {
    window.__boardRoot = (side) => {
      if (window.__ptcg?.boardMode?.() === '3d') {
        return document.getElementById(side === 'opp' ? 'oppBoard' : 'selfBoard')?.shadowRoot ?? null;
      }
      return document.getElementById(side === 'opp' ? 'oppContainer' : 'selfContainer')?.contentDocument ?? null;
    };
  });
  await page.goto(`${base}/?e2e=1${IS_3D ? '&board=3d' : ''}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, undefined, 30000);
  return { page, name };
}

const joinRoom = async (client, { spectator = false } = {}) => {
  await client.page.evaluate((on) => {
    document.getElementById('spectatorModeCheckbox').checked = on;
  }, spectator);
  await client.page.evaluate(([r, u]) => window.__ptcg.joinRoom(r, u), [ROOM, client.name]);
  await waitFor(client.page, () => window.__ptcg.counters().twoPlayer === true);
};

const loadDeck = (client, prefix) =>
  client.page.evaluate(async (p) => {
    const { e2eFixtureDeck } = await import('/src/setup/general/e2e-mode.mjs');
    const rows = e2eFixtureDeck(p).slice(0, 5).map((row) => ['4', ...row.slice(1)]);
    window.__ptcg.loadDeckList(rows);
  }, prefix);

const playSetup = async (a, b) => {
  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const deadline = Date.now() + 15000;
  let called = false;
  while (Date.now() < deadline && !called) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    for (const c of [a, b]) {
      if (!called && (await c.page.locator(callBtn).isVisible().catch(() => false))) {
        await c.page.locator(callBtn).click();
        called = true;
      }
    }
    if (!called) await a.page.waitForTimeout(200);
    if (!called && (await a.page.evaluate(() => window.__ptcg.observe().phase !== 'setup'))) break;
  }
  return waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count >= 7);
};

// Hand cards as rendered by the authoritative renderer, per side ('self' = the near half).
const renderedHand = (client, side) =>
  client.page.evaluate((who) => {
    const root = window.__boardRoot(who);
    return [...(root?.querySelectorAll('img.card-image[data-zone="hand"]') || [])].map((img) => ({
      id: Number(img.dataset.instanceId),
      faceUp: img.getAttribute('alt') !== 'Face-down card',
    }));
  }, side);

const ownHandIds = (client) =>
  renderedHand(client, 'self').then((cards) => cards.map((c) => c.id).sort());

const shot = async (client, name) => {
  if (SHOTS) await client.page.screenshot({ path: `${SHOTS}/spectator-${name}.png` });
};

const switchTo = async (client, mode) => {
  await client.page.click(`#spectatorViewSwitch button[data-mode="${mode}"]`);
  await client.page.waitForTimeout(600);
};

const sameIds = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// CHROMIUM_PATH / PW_CHROMIUM: a preinstalled Chromium when the pinned Playwright build is absent.
const chromiumPath = process.env.CHROMIUM_PATH || process.env.PW_CHROMIUM;
const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
const browser = await chromium.launch({
  headless: true,
  ...(IS_3D ? { args: GL_ARGS } : {}),
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
});
try {
  const a = await openClient(browser, 'Alpha', server.base);
  const b = await openClient(browser, 'Bravo', server.base);
  await joinRoom(a);
  await joinRoom(b);
  await loadDeck(a, 'Alpha');
  await loadDeck(b, 'Bravo');
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  T('0. game starts', Boolean(await playSetup(a, b)));
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count >= 7);

  const aHand = await ownHandIds(a);
  const bHand = await ownHandIds(b);

  const s = await openClient(browser, 'Watcher', server.base);
  await joinRoom(s, { spectator: true });
  await waitFor(s.page, () => !document.getElementById('spectatorViewSwitch').hidden);
  T('1. spectator sees the view switch', await s.page.isVisible('#spectatorViewSwitch'));
  const labels = await s.page.$$eval('#spectatorViewSwitch button', (bs) => bs.map((x) => x.textContent));
  await waitFor(s.page, () => document.querySelector('#spectatorViewSwitch button').textContent !== 'Player 1');
  const named = await s.page.$$eval('#spectatorViewSwitch button', (bs) => bs.map((x) => x.textContent));
  T('2. switch names the seats', named[0] === 'Alpha' && named[1] === 'Bravo' && named[2] === 'Both',
    JSON.stringify({ labels, named }));

  await waitFor(s.page, () =>
    window.__boardRoot('self').querySelectorAll('img.card-image[data-zone="hand"]').length >= 7);
  T(`2b. the spectator runs the ${BOARD} board`, (await s.page.evaluate(() => window.__ptcg.boardMode())) === BOARD);
  let self = await renderedHand(s, 'self');
  let opp = await renderedHand(s, 'opp');
  const unplaced = await s.page.evaluate(
    (ids) => ids.filter((id) => window.__ptcg.cardRect(id) === null),
    [...self, ...opp].map((c) => c.id)
  );
  // Right after the deal the opponent half may hold cards the scene is still flying in; only the
  // seat the spectator watches from must already be placed.
  T('2c. every card in the near hand has a cardRect', self.length > 0 && self.every((c) => !unplaced.includes(c.id)),
    `(unplaced ${JSON.stringify(unplaced)})`);
  T('3. P1 POV: Alpha\'s hand face up at the bottom', sameIds(self.map((c) => c.id).sort(), aHand) && self.every((c) => c.faceUp),
    `(spectator ${self.length}, Alpha ${aHand.length})`);
  T('4. P1 POV: Bravo\'s hand face down at the top', opp.length === bHand.length && opp.every((c) => !c.faceUp));
  await shot(s, 'p1');

  await switchTo(s, 'p2');
  self = await renderedHand(s, 'self');
  opp = await renderedHand(s, 'opp');
  T('5. P2 POV: Bravo\'s hand face up at the bottom', sameIds(self.map((c) => c.id).sort(), bHand) && self.every((c) => c.faceUp));
  T('6. P2 POV: Alpha\'s hand face down at the top', opp.length === aHand.length && opp.every((c) => !c.faceUp));
  await shot(s, 'p2');

  await switchTo(s, 'broadcast');
  self = await renderedHand(s, 'self');
  opp = await renderedHand(s, 'opp');
  T('7. Broadcast: both hands face up', self.length === aHand.length && opp.length === bHand.length &&
    [...self, ...opp].every((c) => c.faceUp));
  T('8. Broadcast: body class set', await s.page.evaluate(() => document.body.classList.contains('spectator-broadcast')));
  await shot(s, 'broadcast');

  // A pass reaches the spectator live: the next player draws for turn.
  const aTurn = (await a.page.evaluate(() => window.__ptcg.observe().turnPlayer)) === 'self';
  const [passer, drawerSide] = aTurn ? [a, 'opp'] : [b, 'self'];
  const before = (await renderedHand(s, drawerSide)).length;
  await passer.page.evaluate(() => window.__ptcg.passTurn());
  const drew = await waitFor(s.page, ([side, count]) => {
    return window.__boardRoot(side).querySelectorAll('img.card-image[data-zone="hand"]').length > count;
  }, [drawerSide, before], 8000);
  T('9. a player\'s pass and the next draw reach the spectator', Boolean(drew), `(before ${before})`);
  await shot(s, 'broadcast-after-pass');

  const rejected = await s.page.evaluate(async () => {
    const { emitCmd } = await import('/src/setup/netcode/cmd-emitter.js');
    const { socket, systemState } = await import('/src/state.js');
    return (await emitCmd({ socket, roomId: systemState.roomId, type: 'draw', payload: { count: 1 } })).error;
  });
  T('10. spectator cannot send commands', rejected === 'spectator_readonly', `(${rejected})`);

  await switchTo(s, 'p1');
  T('11. back to P1 POV clears broadcast layout', !(await s.page.evaluate(() => document.body.classList.contains('spectator-broadcast'))));
  await shot(s, 'p1-after');

  // A dropped spectator connection re-registers and keeps receiving views.
  await s.page.evaluate(async () => {
    const { socket } = await import('/src/state.js');
    socket.disconnect();
    socket.connect();
  });
  await waitFor(s.page, async () => (await import('/src/state.js')).socket.connected);
  const turnOwner = (await a.page.evaluate(() => window.__ptcg.observe().turnPlayer)) === 'self' ? a : b;
  const otherSide = turnOwner === a ? 'opp' : 'self';
  const handBefore = (await renderedHand(s, otherSide)).length;
  await turnOwner.page.evaluate(() => window.__ptcg.passTurn());
  const afterReconnect = await waitFor(s.page, ([side, count]) => {
    return window.__boardRoot(side).querySelectorAll('img.card-image[data-zone="hand"]').length > count;
  }, [otherSide, handBefore], 8000);
  T('12. after a reconnect the spectator still follows the game', Boolean(afterReconnect));

  // A player's Reset restarts the game for the spectator too.
  await a.page.evaluate(() => document.getElementById('p2ResetButton').click());
  const cleared = await waitFor(s.page, () =>
    ['self', 'opp'].every((side) =>
      window.__boardRoot(side).querySelectorAll('img.card-image[data-zone="hand"]').length === 0), undefined, 8000);
  T('13. a player\'s Reset clears the spectator board', Boolean(cleared));

  // A socket that never joined gets no view (a spectator view shows both hands).
  const strangerView = await s.page.evaluate(async (room) => {
    const stranger = window.io({ forceNew: true });
    return new Promise((resolve) => {
      stranger.on('view', () => resolve(true));
      stranger.on('connect', () => stranger.emit('requestView', { roomId: room }));
      setTimeout(() => {
        stranger.disconnect();
        resolve(false);
      }, 2000);
    });
  }, ROOM);
  T('14. an unregistered socket cannot read the room\'s view', strangerView === false);

  // A spectator that leaves stops receiving the room's views and loses the spectator chrome.
  await s.page.evaluate(async () => {
    const { socket } = await import('/src/state.js');
    window.__viewsAfterLeave = 0;
    socket.on('view', () => (window.__viewsAfterLeave += 1));
    document.getElementById('leaveRoomButton').click();
  });
  // The fresh deal after the Reset is broadcast to every registered socket.
  T('15a. the game is dealt again', Boolean(await playSetup(a, b)));
  await a.page.waitForTimeout(1000);
  const afterLeave = await s.page.evaluate(() => ({
    views: window.__viewsAfterLeave,
    spectating: document.body.classList.contains('spectating'),
    switchHidden: document.getElementById('spectatorViewSwitch').hidden,
  }));
  T('15b. a spectator that left gets no more views and no spectator chrome',
    afterLeave.views === 0 && !afterLeave.spectating && afterLeave.switchHidden, JSON.stringify(afterLeave));
} finally {
  await browser.close();
  server.child?.kill('SIGTERM');
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
