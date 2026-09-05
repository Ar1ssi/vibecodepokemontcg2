import { chromium } from 'playwright';
const DATA = 'C:\\Users\\SMG26\\.lmstudio\\scratchpads\\lk\\data.json';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('dialog', async (d) => (d.type() === 'prompt' ? d.accept('T') : d.accept()));
await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
await page.setInputFiles('#jsonFile', DATA);
await page.waitForTimeout(3500);

const fr = page.frames().find((f) => /self-containers/.test(f.url()));

// Instrument: watch the active holo wrapper + rotator + img for width changes, capture stack.
await fr.evaluate(() => {
  const img = document.querySelector('#active img');
  const targets = [img, img.parentElement, img.parentElement?.parentElement, img.parentElement?.parentElement?.parentElement];
  window.__log = [];
  for (const el of targets) {
    if (!el) continue;
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName === 'style' || m.attributeName === 'class') {
          const e = new Error('snap');
          window.__log.push({
            t: performance.now() | 0,
            tag: el.tagName,
            cls: (el.className || '').toString().slice(0, 40),
            w: Math.round(el.getBoundingClientRect().width),
            style: el.getAttribute('style'),
            stack: (e.stack || '').split('\n').slice(2, 7).join(' | '),
          });
        }
      }
    }).observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
  }
});

// Dispatch a real dblclick directly (bypass Playwright stability wait).
await fr.evaluate(() => {
  const img = document.querySelector('#active img');
  const r = img.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  img.dispatchEvent(new MouseEvent('click', opts));
  img.dispatchEvent(new MouseEvent('click', opts));
  img.dispatchEvent(new MouseEvent('dblclick', opts));
});
await page.waitForTimeout(900);

const log = await fr.evaluate(() => window.__log);
console.log('=== MUTATIONS (' + log.length + ') ===');
for (const l of log) console.log(`t=${l.t} ${l.tag}.${l.cls} w=${l.w} style="${l.style}"\n    ${l.stack}`);

const final = await fr.evaluate(() => {
  const img = document.querySelector('#active img');
  return {
    imgW: Math.round(img.getBoundingClientRect().width),
    fullView: Array.from(document.querySelectorAll('.full-view')).map((e) => `${e.tagName}.${(e.className||'').toString().slice(0,40)} w=${Math.round(e.getBoundingClientRect().width)}`),
    fullImage: !!document.getElementById('fullImage'),
  };
});
console.log('FINAL: ' + JSON.stringify(final, null, 2));
await browser.close();
