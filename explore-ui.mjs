import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('dialog', async (d) => {
  if (d.type() === 'prompt') await d.accept('Test Deck');
  else await d.accept();
});
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

fs.mkdirSync('out', { recursive: true });
await page.screenshot({ path: 'out/00-initial.png', fullPage: false });

// Dump top-level interactive controls so we understand the flow.
const controls = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, [id$="Button"], input, #deckImportButton').forEach((el) => {
    const id = el.id || el.getAttribute('id') || '';
    const txt = (el.textContent || el.value || '').trim().slice(0, 40);
    const vis = el.offsetParent !== null;
    if (id || txt) out.push({ tag: el.tagName, id, txt, vis });
  });
  return out.slice(0, 60);
});
console.log('CONTROLS:\n' + controls.map((c) => `  ${c.tag}#${c.id} "${c.txt}" vis=${c.vis}`).join('\n'));

// Is there a game/board already?
const zones = await page.evaluate(() => {
  const ids = ['active', 'bench', 'hand', 'deck', 'attachedCards'];
  return ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) return `${id}: missing`;
    const imgs = el.querySelectorAll('img').length;
    return `${id}: imgs=${imgs} display=${getComputedStyle(el).display}`;
  });
});
console.log('ZONES:\n' + zones.join('\n'));

console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
