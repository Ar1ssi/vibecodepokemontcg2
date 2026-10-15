import { chromium } from 'playwright';
// Design 069: the Multiplayer tab's always-open rooms. Click to join or watch, seat tokens, and
// the seat release rule (immediate before set-up, PUBLIC_SEAT_RELEASE_MS after).
// Needs a fresh server (PTCG_URL, default :4000) started with
//   SERVER_AUTHORITATIVE=1 PUBLIC_SEAT_RELEASE_MS=4000
// so the held-seat step finishes quickly. Room 1 must be empty when it starts.
// OUT=<dir> saves a screenshot per step; CHROMIUM_PATH picks the browser binary.
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = 'public:1';
const OUT = process.env.OUT || '';
let failed = 0;
const T = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`); if (!cond) failed += 1; };
async function waitFor(page, fn, timeout = 15000, arg) {
  const started = Date.now(); let last;
  while (Date.now() - started < timeout) { last = await page.evaluate(fn, arg); if (last) return last; await page.waitForTimeout(150); }
  return last;
}
async function openClient(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('dialog', (d) => d.accept());
  await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ status: 302, headers: { location: `${BASE}/socket.io/socket.io.js` } }));
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true, 30000);
  await page.click('#p2Button');
  return { page, context, name };
}
const roomText = (c) => c.page.evaluate((r) => window.__ptcg.publicRoomText(r) || '', ROOM);
const waitRoomText = (c, needle, timeout = 8000) =>
  waitFor(c.page, ([r, n]) => (window.__ptcg.publicRoomText(r) || '').includes(n), timeout, [ROOM, needle]);
const join = (c, name, spectate = false) =>
  c.page.evaluate(([r, u, s]) => window.__ptcg.joinPublicRoom(r, u, { spectate: s }), [ROOM, name, spectate]);
const seated = (c) => waitFor(c.page, () => window.__ptcg.counters().twoPlayer === true);
const chat = (c) => c.page.evaluate(() => document.getElementById('p2Chatbox')?.textContent || '');
const waitChat = (c, needle, timeout) => waitFor(c.page, (n) => (document.getElementById('p2Chatbox')?.textContent || '').includes(n), timeout, needle);
// The roomReject overlay is the last thing appended to <body>.
const overlayText = (c) => waitFor(c.page, () => document.body.lastElementChild?.matches('div') && document.body.lastElementChild.querySelector(':scope > div > p')?.textContent || '', 5000);
const dismissOverlay = (c) => c.page.evaluate(() => document.body.lastElementChild?.click());
const shot = (c, n) => (OUT ? c.page.screenshot({ path: `${OUT}/${n}.png` }) : null);
const loadDeck = (c, prefix) => c.page.evaluate(async (p) => {
  const { e2eFixtureDeck } = await import('/src/setup/general/e2e-mode.mjs');
  const rows = e2eFixtureDeck(p).slice(0, 5).map((row) => ['4', ...row.slice(1)]);
  window.__ptcg.loadDeckList(rows, 'build-battle');
}, prefix);
const playSetup = async (a, b) => {
  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const deadline = Date.now() + 15000; let called = false;
  while (Date.now() < deadline && !called) {
    for (const c of [a, b]) {
      if (!called && (await c.page.locator(callBtn).isVisible().catch(() => false))) { await c.page.locator(callBtn).click(); called = true; }
    }
    if (!called) await a.page.waitForTimeout(200);
    if (!called && (await a.page.evaluate(() => window.__ptcg.observe().phase !== 'setup'))) break;
  }
  return waitFor(a.page, () => window.__ptcg.observe().phase !== 'setup' && window.__ptcg.zone('self', 'hand').count >= 7);
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const watcher = await openClient(browser, 'Oak');
  const listed = await waitFor(watcher.page, () => document.querySelectorAll('#publicRoomList .public-room').length);
  T('row 1: the lobby lists eight rooms', listed === 8, String(listed));
  T('Room 1 starts open', (await roomText(watcher)).includes('Open'), JSON.stringify(await roomText(watcher)));
  await shot(watcher, '1-lobby');

  const ash = await openClient(browser, 'Ash');
  T('Join clicked', await join(ash, 'Ash'));
  T('Ash is seated', Boolean(await seated(ash)));
  T('the header names the room', (await ash.page.textContent('#roomHeaderText')) === 'Room 1');
  T('the watcher sees Ash waiting', Boolean(await waitRoomText(watcher, 'Ash is waiting')));

  const impostor = await openClient(browser, 'Impostor');
  await join(impostor, 'Ash');
  T('rows 5-6: a second "Ash" is refused', (await overlayText(impostor)).includes('already using that name'));
  T('the impostor stays in the lobby', !(await impostor.page.evaluate(() => window.__ptcg.counters().twoPlayer)));
  await dismissOverlay(impostor);

  const gary = await openClient(browser, 'Gary');
  await join(gary, 'Gary');
  T('Gary is seated', Boolean(await seated(gary)));
  T('the watcher sees the room full', Boolean(await waitRoomText(watcher, 'Full')) && (await roomText(watcher)).includes('Ash vs Gary'), JSON.stringify(await roomText(watcher)));
  T('a full room offers no Join to a stranger', !(await join(impostor, 'Brock')));
  await shot(watcher, '2-full');

  T('Watch clicked', await join(impostor, 'Brock', true));
  T('the spectator joins', Boolean(await waitFor(impostor.page, () => document.getElementById('connectedRoom').style.display === 'flex')));
  T('row 14: the watcher counts one spectator', Boolean(await waitRoomText(watcher, '1 watching')));
  await impostor.context.close();
  T('a closed spectator tab leaves the count', Boolean(await waitFor(watcher.page, (r) => !(window.__ptcg.publicRoomText(r) || '').includes('watching'), 8000, ROOM)), JSON.stringify(await roomText(watcher)));

  await gary.context.close();
  T('row 9: before set-up a closed tab frees the seat at once', Boolean(await waitChat(ash, 'Gary left the room', 4000)), JSON.stringify(await chat(ash)));
  T('the watcher sees Ash waiting again', Boolean(await waitRoomText(watcher, 'Ash is waiting')));

  const misty = await openClient(browser, 'Misty');
  await join(misty, 'Misty');
  T('Misty is seated', Boolean(await seated(misty)));
  await loadDeck(ash, 'ASH'); await loadDeck(misty, 'MISTY');
  const deckReady = (c) => waitFor(c.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await deckReady(ash); await deckReady(misty);
  await ash.page.waitForTimeout(1200);
  await playSetup(ash, misty);
  const dealt = await waitFor(ash.page, () => window.__ptcg.zone('self', 'prizes').count === 4 && window.__ptcg.zone('self', 'hand').count >= 7);
  T('the game is set up (4 Prizes and a hand dealt)', Boolean(dealt));
  T('the watcher sees the room in game', Boolean(await waitRoomText(watcher, 'In game')));
  await shot(watcher, '3-in-game');

  // Row 7: a reload in the same tab keeps sessionStorage, so the seat token comes back.
  await ash.page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(ash.page, () => window.__ptcg?.ready === true, 30000);
  await ash.page.click('#p2Button');
  T('the watcher sees Ash reconnecting', Boolean(await waitRoomText(watcher, 'Ash (reconnecting)')));
  const rejoin = await waitFor(ash.page, (r) => document.querySelector(`#publicRoomList [data-room-id="${r}"] .public-room-join`)?.textContent || '', 8000, ROOM);
  T('row 7: the reloaded tab is offered Rejoin', rejoin === 'Rejoin', JSON.stringify(rejoin));
  await join(ash, '');
  T('row 7: Ash takes the held seat back', Boolean(await seated(ash)));
  T('Misty did not see Ash leave', !(await chat(misty)).includes('Ash left the room'));

  await misty.context.close();
  await watcher.page.waitForTimeout(1500);
  T('row 3: after set-up the seat is held at first', !(await chat(ash)).includes('Misty left the room') && (await roomText(watcher)).includes('Misty (reconnecting)'), JSON.stringify(await roomText(watcher)));
  T('row 3: the held seat is released after the grace and a sweep', Boolean(await waitChat(ash, 'Misty left the room', 25000)));
  T('the watcher sees Ash waiting', Boolean(await waitRoomText(watcher, 'Ash is waiting')));
  await shot(watcher, '4-released');

  // Row 8: a transport drop before set-up frees the seat at once; the connection recovers
  // (connectionStateRecovery), the reconnect is refused, and the lobby must work again.
  const blip = await openClient(browser, 'Blip');
  await blip.page.evaluate(() => window.__ptcg.joinPublicRoom('public:2', 'Blip'));
  T('Blip is seated in Room 2', Boolean(await seated(blip)));
  await blip.page.evaluate(async () => (await import('/src/state.js')).socket.io.engine.close());
  const blipOverlay = await overlayText(blip);
  T('row 8: the refused reconnect explains the released seat', blipOverlay.includes('seat was released'), JSON.stringify(blipOverlay));
  T('row 8: Blip is back in the lobby', Boolean(await waitFor(blip.page, () => !window.__ptcg.counters().twoPlayer, 5000)));
  await dismissOverlay(blip);
  const pidgey = await openClient(browser, 'Pidgey');
  await pidgey.page.evaluate(() => window.__ptcg.joinPublicRoom('public:2', 'Pidgey'));
  T('Pidgey is seated in Room 2', Boolean(await seated(pidgey)));
  T('row 8: Blip\'s list is live again', Boolean(await waitFor(blip.page, () => (window.__ptcg.publicRoomText('public:2') || '').includes('Pidgey is waiting'), 8000)));
  T('row 8: Blip no longer hears Room 2', !(await blip.page.evaluate(() => document.getElementById('p2Chatbox')?.textContent || '')).includes('Pidgey'));
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
