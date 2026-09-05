import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DATA = 'C:\\Users\\SMG26\\.lmstudio\\scratchpads\\lk\\data.json';
const OUT = 'out';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});
page.on('dialog', async (d) => {
  if (d.type() === 'prompt') await d.accept('Test');
  else await d.accept();
});

const log = (m) => console.log(m);

await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);

// ---- import the game state ----
await page.setInputFiles('#jsonFile', DATA);
await page.waitForTimeout(3500); // allow hydration (holo async)

// ---- locate the active card image (search top page + all frames) ----
async function findActiveCard() {
  // top page first
  const top = await page.locator('#active img').count();
  if (top > 0) return { frame: page, selector: '#active img', count: top, origin: 'top' };
  for (const fr of page.frames()) {
    const c = await fr.locator('#active img').count().catch(() => 0);
    if (c > 0) return { frame: fr, selector: '#active img', count: c, origin: fr.url() };
  }
  return null;
}

const active = await findActiveCard();
log('ACTIVE CARD: ' + JSON.stringify(active));

// dump zone summary across frames
const zoneDump = [];
for (const fr of [page, ...page.frames()]) {
  const r = await fr.evaluate(() => {
    const ids = ['active', 'bench', 'hand', 'attachedCards'];
    return ids.map((id) => {
      const el = document.getElementById(id);
      return el ? `${id}:imgs=${el.querySelectorAll('img').length}` : null;
    }).filter(Boolean);
  }).catch(() => null);
  if (r && r.length) zoneDump.push(`${fr === page ? 'TOP' : fr.url().split('/').pop()}: ${r.join(' ')}`);
}
log('ZONES:\n  ' + zoneDump.join('\n  '));

await page.screenshot({ path: `${OUT}/01-imported.png` });

if (!active) {
  log('NO ACTIVE CARD FOUND — aborting interaction tests');
  log('ERRORS: ' + JSON.stringify(errors.slice(0, 10)));
  await browser.close();
  process.exit(0);
}

const card = active.frame.locator(active.selector).first();

// ---- DOUBLE CLICK -> pop animation ----
await card.dblclick();
await page.waitForTimeout(120); // mid-pop (overshoot)
await page.screenshot({ path: `${OUT}/02-dblclick-midpop.png` });
await page.waitForTimeout(600); // settled
await page.screenshot({ path: `${OUT}/03-dblclick-settled.png` });

const popInfo = await active.frame.evaluate(() => {
  const fv = document.querySelector('.full-view');
  const holo = document.querySelector('.mat-holo');
  return {
    fullView: !!fv,
    fullViewRect: fv ? fv.getBoundingClientRect() : null,
    holoPresent: !!holo,
    holoScale: holo ? getComputedStyle(holo).getPropertyValue('--card-scale') : null,
  };
});
log('POP INFO: ' + JSON.stringify(popInfo));

// ---- right click -> context menu with attached-cards button ----
// close full view first (click off) to get a clean context menu
await page.mouse.click(20, 20);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/04-deselected.png` });

await card.click({ button: 'right' });
await page.waitForTimeout(400);

const menuInfo = await (async () => {
  const top = await page.evaluate(() => {
    const m = document.getElementById('cardContextMenu');
    const b = document.getElementById('attachedCardsButton');
    if (!m) return { found: false };
    return {
      found: true,
      display: getComputedStyle(m).display,
      attachedBtn: b ? { display: getComputedStyle(b).display, text: b.textContent.trim() } : null,
      left: m.style.left, top: m.style.top,
    };
  });
  if (top.found) return { origin: 'top', ...top };
  for (const fr of page.frames()) {
    const r = await fr.evaluate(() => {
      const m = document.getElementById('cardContextMenu');
      const b = document.getElementById('attachedCardsButton');
      if (!m) return null;
      return { display: getComputedStyle(m).display, attachedBtn: b ? getComputedStyle(b).display : null };
    }).catch(() => null);
    if (r) return { origin: fr.url().split('/').pop(), ...r };
  }
  return { found: false };
})();
log('MENU INFO: ' + JSON.stringify(menuInfo));
await page.screenshot({ path: `${OUT}/05-context-menu.png` });

// hover the attached-cards button to reveal submenu (top page)
try {
  await page.locator('#attachedCardsButton').hover();
  await page.waitForTimeout(300);
  const sub = await page.evaluate(() => {
    const b = document.getElementById('attachedCardsButton');
    const sub = b && b.querySelector('.card-sub-menu');
    return {
      subPresent: !!sub,
      subDisplay: sub ? getComputedStyle(sub).display : null,
      items: sub ? Array.from(sub.querySelectorAll('li')).map((li) => li.textContent.trim()) : null,
    };
  });
  log('SUBMENU: ' + JSON.stringify(sub));
  await page.screenshot({ path: `${OUT}/06-submenu.png` });
} catch (e) {
  log('SUBMENU hover failed: ' + e.message);
}

log('\n=== PAGE ERRORS (' + errors.length + ') ===');
log(errors.slice(0, 15).join('\n') || 'none');

await browser.close();
log('DONE');
