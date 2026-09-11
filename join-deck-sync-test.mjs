// Regression: a player whose deck was loaded in the lobby (before joining) must
// show up on the opponent's board, both for a late joiner and after a
// leave+rejoin. Exercises the server's setupActionCache replay racing the
// client's async joinGame handler.
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = process.env.PTCG_ROOM || `join-${Date.now()}`;

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
  page.on('console', (msg) => {
    if (msg.text().startsWith('[probe]')) console.log(name, msg.text());
  });
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  return { page, name };
}

const oppDeckCount = (client) =>
  waitFor(client.page, () => {
    const count = window.__ptcg.zone('opp', 'deck').count;
    return count > 0 ? count : 0;
  }, 8000);

const joinWithLobbyDeck = async (client, prefix) => {
  await client.page.evaluate((p) => window.__ptcg.loadFixtureDeck(p), prefix);
  await client.page.evaluate(
    ([room, user]) => window.__ptcg.joinRoom(room, user),
    [ROOM, client.name]
  );
  await waitFor(client.page, () => window.__ptcg.counters().twoPlayer === true);
};

const browser = await chromium.launch({ headless: true });
try {
  const a = await openClient(browser, 'JoinA');
  const b = await openClient(browser, 'JoinB');

  await joinWithLobbyDeck(a, 'Alpha');
  await a.page.waitForTimeout(500);
  await joinWithLobbyDeck(b, 'Bravo');

  T('1. late joiner sees the first player\'s deck', (await oppDeckCount(b)) > 0);
  T('2. first player sees the late joiner\'s deck', (await oppDeckCount(a)) > 0);

  // The button sits in a collapsed sidebox in headless layout; the handler is what matters.
  await a.page.evaluate(() => document.getElementById('leaveRoomButton').click());
  await a.page.waitForTimeout(500);
  await a.page.evaluate(
    ([room, user]) => window.__ptcg.joinRoom(room, user),
    [ROOM, a.name]
  );
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);

  T('3. rejoining player sees the opponent\'s deck', (await oppDeckCount(a)) > 0);
  T('4. opponent sees the rejoining player\'s deck', (await oppDeckCount(b)) > 0);
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
