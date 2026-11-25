import { chromium } from 'playwright';
// View Board inspects without acting: with a pick open and View Board on, a click on a Pokémon
// opens its stack view, a drag moves nothing, and a pile view opens over the parked pick, which
// comes back when the pile closes. Needs a server (PTCG_URL, default :4000). OUT=<dir> screenshots.
const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = `vb-${Date.now()}`;
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
  return { page, name };
}
const joinRoom = async (c) => { await c.page.click('#p2Button'); await c.page.evaluate(([r, u]) => window.__ptcg.joinRoom(r, u), [ROOM, c.name]); await waitFor(c.page, () => window.__ptcg.counters().twoPlayer === true); };
const loadDeck = (c, prefix) => c.page.evaluate(async (p) => {
  const { e2eFixtureDeck } = await import('/src/setup/general/e2e-mode.mjs');
  window.__ptcg.loadDeckList(e2eFixtureDeck(p).slice(0, 5).map((row) => ['4', ...row.slice(1)]), 'tcg');
}, prefix);
const shot = (c, n) => (OUT ? c.page.screenshot({ path: `${OUT}/${n}.png` }) : null);
const activeId = (c, side) => c.page.evaluate(async (s) => {
  const { getAuthoritativeZoneArray } = await import('/src/setup/netcode/apply-view.js');
  return getAuthoritativeZoneArray(s, 'active')[0]?.instanceId ?? null;
}, side);
const centerOf = async (c, id) => {
  const r = await c.page.evaluate((i) => window.__ptcg.cardRect(i), id);
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const a = await openClient(browser, 'Ash');
  const b = await openClient(browser, 'Gary');
  await joinRoom(a); await joinRoom(b);
  await loadDeck(a, 'Alpha'); await loadDeck(b, 'Bravo');
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await a.page.evaluate(() => window.__ptcg.readyUp()); await b.page.evaluate(() => window.__ptcg.readyUp());
  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  for (let i = 0; i < 60; i += 1) {
    let done = false;
    for (const c of [a, b]) if (await c.page.locator(callBtn).isVisible().catch(() => false)) { await c.page.locator(callBtn).click(); done = true; }
    if (done) break;
    await a.page.waitForTimeout(250);
  }
  for (const c of [a, b]) {
    await waitFor(c.page, () => window.__ptcg.picker().open === true, 20000);
    await waitFor(c.page, () => !document.getElementById('turnOrderCoinFlipOverlay'));
    await c.page.evaluate(() => window.__ptcg.pick([0]));
  }
  await waitFor(a.page, () => window.__ptcg.zone('opp', 'active').count === 1 && window.__ptcg.zone('self', 'active').count === 1, 20000);
  await a.page.waitForTimeout(1500);

  // A pick waits (the card picker in choose mode, as every server choice opens it).
  await a.page.evaluate(async () => {
    const { openCardPicker } = await import('/src/setup/image-logic/card-picker.js');
    const { getAuthoritativeZoneArray } = await import('/src/setup/netcode/apply-view.js');
    const { toViewerCards } = await import('/src/setup/image-logic/discard-pile-source.mjs');
    window.__picked = null;
    openCardPicker({ title: 'Choose a card', candidates: toViewerCards(getAuthoritativeZoneArray('you', 'hand')), mode: 'single', onConfirm: (p) => (window.__picked = p) });
  });
  await waitFor(a.page, () => Boolean(document.querySelector('#cardPickerOverlay.card-picker-choose')));
  await a.page.click('#cardPickerOverlay .view-board-button');
  T('View Board turns the pick see-through', await a.page.evaluate(() => document.getElementById('cardPickerOverlay').classList.contains('is-viewing-board')));

  const oppActive = await centerOf(a, await activeId(a, 'them'));
  T('the opponent Active is on screen', Boolean(oppActive));
  await a.page.mouse.click(oppActive.x, oppActive.y);
  T('clicking the opponent Active opens its stack view', Boolean(await waitFor(a.page, () => Boolean(document.querySelector('.tcgl-stack')), 5000)));
  await shot(a, '1-stack');
  await a.page.keyboard.press('Escape');
  await waitFor(a.page, () => !document.querySelector('.tcgl-stack'), 5000);
  T('Escape closes the stack view and keeps the pick', await a.page.evaluate(() => Boolean(document.getElementById('cardPickerOverlay')) && window.__picked === null));

  const ownActive = await centerOf(a, await activeId(a, 'you'));
  await a.page.mouse.click(ownActive.x, ownActive.y);
  const ownOpened = await waitFor(a.page, () => ({ stack: Boolean(document.querySelector('.tcgl-stack')), focus: Boolean(document.querySelector('.tcgl-focus, .card-focus')) }), 5000);
  T('clicking your own Active opens the read-only stack view, not the attack overlay', ownOpened.stack, JSON.stringify(ownOpened));
  await a.page.keyboard.press('Escape');
  await waitFor(a.page, () => !document.querySelector('.tcgl-stack'), 5000);

  const benchBefore = await a.page.evaluate(() => window.__ptcg.zone('self', 'bench').count);
  await a.page.mouse.move(ownActive.x, ownActive.y);
  await a.page.mouse.down();
  await a.page.mouse.move(ownActive.x, ownActive.y + 200, { steps: 12 });
  await a.page.mouse.up();
  await a.page.waitForTimeout(800);
  T('a drag while viewing moves nothing', (await a.page.evaluate(() => [window.__ptcg.zone('self', 'active').count, window.__ptcg.zone('self', 'bench').count])).join() === `1,${benchBefore}`);

  // A pile view over the waiting pick: the pick parks, then returns when the pile closes.
  await a.page.evaluate(async () => {
    const { openCarouselViewer } = await import('/src/setup/image-logic/card-picker.js');
    const { getAuthoritativeZoneArray } = await import('/src/setup/netcode/apply-view.js');
    const { toViewerCards } = await import('/src/setup/image-logic/discard-pile-source.mjs');
    openCarouselViewer({ title: 'Discard Pile', candidates: toViewerCards(getAuthoritativeZoneArray('you', 'hand')).slice(0, 2) });
  });
  const parked = await waitFor(a.page, () => document.getElementById('cardPickerOverlayParked')?.style.display === 'none' && Boolean(document.querySelector('#cardPickerOverlay.card-picker-browse')), 5000);
  T('the pile opens over the parked pick', Boolean(parked));
  await shot(a, '2-pile');
  await a.page.keyboard.press('Escape');
  const restored = await waitFor(a.page, () => {
    const o = document.getElementById('cardPickerOverlay');
    return o && o.classList.contains('card-picker-choose') && !document.getElementById('cardPickerOverlayParked') && o.style.display === '';
  }, 5000);
  T('closing the pile brings the pick back', Boolean(restored));
  await a.page.click('#cardPickerOverlay .view-board-button');
  T('Back returns to the pick, still open', await a.page.evaluate(() => !document.getElementById('cardPickerOverlay').classList.contains('is-viewing-board')));
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
