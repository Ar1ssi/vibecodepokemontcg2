// Regression: leaving a room mid-game and joining another must start clean.
// 1. The rules session (phase, turn player, "both ready" flag) used to survive
//    Leave Room, so the new room showed the old "YOUR TURN — main phase" HUD
//    and a stale ready flag could auto-start a game nobody set up.
// 2. A reconnect while alone in a room asked an absent peer for its action log;
//    the 5s timeout then posted "The game may be out of sync" for nothing.
// Needs a server on :4000 (node server/server.js). Runs in whichever netcode
// mode that server was started with.
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = `rc-${Date.now()}`;
const SOLO_ROOM = `${ROOM}-solo`;
const DESYNC_TEXT = 'The game may be out of sync';

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

async function waitFor(page, fn, timeout = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

async function openClient(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  return { page, context, name };
}

const joinRoom = async (client, room) => {
  await client.page.evaluate(([r, u]) => window.__ptcg.joinRoom(r, u), [room, client.name]);
  await waitFor(client.page, () => window.__ptcg.counters().twoPlayer === true);
};

const chatText = (client) =>
  client.page.evaluate(() => document.getElementById('p2Chatbox')?.textContent || '');

const browser = await chromium.launch({ headless: true });
try {
  const a = await openClient(browser, 'RcA');
  const b = await openClient(browser, 'RcB');

  await joinRoom(a, ROOM);
  await joinRoom(b, ROOM);
  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);

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
  }
  if (!called) throw new Error('coin call overlay never opened');

  const started = await waitFor(
    a.page,
    () => window.__ptcg.observe().phase !== 'setup' && window.__ptcg.zone('self', 'hand').count >= 7
  );
  T('0. precondition: a game is running in the first room', Boolean(started));

  // Leave mid-game, then join a fresh room alone.
  await a.page.evaluate(() => document.getElementById('leaveRoomButton').click());
  await a.page.waitForTimeout(500);
  await joinRoom(a, SOLO_ROOM);
  await a.page.waitForTimeout(1500);

  const obs = await a.page.evaluate(() => window.__ptcg.observe());
  T('1. rules phase is back to setup in the new room', obs.phase === 'setup', `(phase=${obs.phase})`);
  const hudHidden = await a.page.evaluate(
    () => document.getElementById('rulesTurnHUD')?.hidden !== false
  );
  T('2. turn HUD is hidden in the new room', hudHidden);
  const hand = await a.page.evaluate(() => window.__ptcg.zone('self', 'hand').count);
  T('3. no hand dealt in the new room', hand === 0, `(hand=${hand})`);

  // Force a reconnect while alone in the room, through the app's own socket
  // (context.setOffline does not drop a localhost websocket). Importing the
  // module by its served URL yields the same instance the app uses.
  await a.page.evaluate(async () => {
    const { socket } = await import('/src/state.js');
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 500));
    socket.connect();
  });
  const reconnected = await waitFor(
    a.page,
    async () => (await import('/src/state.js')).socket.connected,
    10000
  );
  T('4a. precondition: socket reconnected', Boolean(reconnected));
  // Wait past the 5s peer-log timeout.
  await a.page.waitForTimeout(7000);
  const chat = await chatText(a);
  T('4. no false "out of sync" warning after reconnecting alone', !chat.includes(DESYNC_TEXT));
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
