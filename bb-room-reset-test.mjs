import { chromium } from 'playwright';
// A Build & Battle box belongs to the room it was opened for: a reload in that room resumes it,
// leaving and joining another room starts a fresh box. Needs a server (PTCG_URL, default :4000).
// CHROMIUM_PATH picks the browser binary.
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const STAMP = Date.now();
const STORAGE_KEY = 'ptcg-sim.build-battle.v1';
let failed = 0;
const T = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`); if (!cond) failed += 1; };
async function waitFor(page, fn, timeout = 15000, arg) {
  const started = Date.now(); let last;
  while (Date.now() - started < timeout) { last = await page.evaluate(fn, arg).catch(() => null); if (last) return last; await page.waitForTimeout(150); }
  return last;
}
const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
const boxState = (page) => page.evaluate(() => ({
  sealed: Boolean(document.getElementById('buildBattleOpenBox')),
  opened: Boolean(document.getElementById('buildBattleNewBox')),
  banner: [...document.querySelectorAll('#buildBattleBoxPanel .bb-banner')].map((n) => n.textContent).join(' | '),
}));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.on('page', (p) => p.on('dialog', (d) => d.accept()));
  await context.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await context.route('https://cdn.socket.io/**', (r) => r.fulfill({ status: 302, headers: { location: `${BASE}/socket.io/socket.io.js` } }));
  const game = await context.newPage();
  game.on('pageerror', (err) => console.log('PAGEERROR game:', err.message));
  await game.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(game, () => window.__ptcg?.ready === true, 30000);
  await game.click('#p2Button');

  const join = async (room) => {
    await game.evaluate(([r]) => window.__ptcg.joinRoom(r, 'Ash'), [room]);
    await waitFor(game, (r) => window.__ptcg.counters().twoPlayer === true && document.getElementById('roomHeaderText')?.textContent.includes(r), 15000, room);
  };
  const leave = async () => {
    await game.click('#leaveRoomButton');
    await waitFor(game, () => window.__ptcg.counters().twoPlayer === false);
  };
  const openBuilder = async () => {
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      game.evaluate(() => { window.open('/build-and-battle', 'ptcgBuildBattle'); }),
    ]);
    tab.on('pageerror', (err) => console.log('PAGEERROR builder:', err.message));
    await tab.waitForLoadState('domcontentloaded');
    await waitFor(tab, () => Boolean(document.getElementById('buildBattleOpenBox') || document.getElementById('buildBattleNewBox')), 20000);
    return tab;
  };
  const openBox = async (tab) => {
    await tab.click('#buildBattleOpenBox');
    return waitFor(tab, (key) => JSON.parse(localStorage.getItem(key) || 'null'), 10000, STORAGE_KEY);
  };

  const roomA = `bbA-${STAMP}`, roomB = `bbB-${STAMP}`, roomC = `bbC-${STAMP}`;
  await join(roomA);
  let builder = await openBuilder();
  const boxA = await openBox(builder);
  T('a box opened in room A remembers room A', boxA?.roomId === roomA, JSON.stringify({ roomId: boxA?.roomId, seed: boxA?.seed }));

  await builder.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(builder, () => Boolean(document.getElementById('buildBattleNewBox')), 20000);
  T('a reload in room A resumes the same box', (await saved(builder))?.seed === boxA.seed && (await boxState(builder)).opened);

  await leave();
  await builder.waitForTimeout(800);
  T('leaving the room keeps the box (no room to compare against)', (await saved(builder))?.seed === boxA.seed);

  await join(roomB);
  const freshB = await waitFor(builder, () => Boolean(document.getElementById('buildBattleOpenBox')), 8000);
  const stateB = await boxState(builder);
  T('joining room B puts the room A box away: a sealed box shows', Boolean(freshB) && !stateB.opened, JSON.stringify(stateB));
  T('the builder says why the box is fresh', stateB.banner.includes('new room'), JSON.stringify(stateB.banner));
  T('the room A box is gone from storage', (await saved(builder)) === null);
  const boxB = await openBox(builder);
  T('a box opened in room B remembers room B', boxB?.roomId === roomB);

  await builder.close();
  await leave();
  await join(roomC);
  builder = await openBuilder();
  const stateC = await boxState(builder);
  T('a builder tab opened fresh in room C never shows the room B box', stateC.sealed && !stateC.opened, JSON.stringify(stateC));
  T('the room B box is gone from storage', (await saved(builder)) === null);
  const boxC = await openBox(builder);
  T('room C gets its own box', boxC?.roomId === roomC);
  await builder.close();

  const solo = await context.newPage();
  await solo.goto(`${BASE}/build-and-battle`, { waitUntil: 'domcontentloaded' });
  await waitFor(solo, () => Boolean(document.getElementById('buildBattleNewBox')), 20000);
  T('a builder tab with no game tab keeps the saved box', (await saved(solo))?.seed === boxC.seed);
  await solo.close();
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
