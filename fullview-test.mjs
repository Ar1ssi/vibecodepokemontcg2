// Ad-hoc UI test for card preview flows. Not part of `pnpm test`.
//
//   node server/server.js
//   node fullview-test.mjs <exported-state.json>
//
// Needs a self-side active Pokémon with attachments (holo preferred).

import { chromium } from 'playwright';

const DATA = process.argv[2];
if (!DATA) {
  console.error('usage: node fullview-test.mjs <exported-state.json>');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('dialog', async (d) => (d.type() === 'prompt' ? d.accept('T') : d.accept()));
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.setInputFiles('#jsonFile', DATA);
await page.waitForTimeout(5000);

const fr = page.frames().find((f) => /self-containers/.test(f.url()));
const T = (name, ok, extra = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? '  [' + extra + ']' : ''}`);

const snap = (zone) =>
  fr.evaluate((z) => {
    const host = document.querySelector(`#${z} .play-container`);
    const previewImg = document.querySelector('.card-preview-pop img');
    const matImg = document.querySelector(`#${z} img`);
    const rotator = matImg?.closest('.card__rotator');
    return {
      matImgW: matImg ? Math.round(matImg.getBoundingClientRect().width) : null,
      previewImgW: previewImg
        ? Math.round(previewImg.getBoundingClientRect().width)
        : null,
      holo: !!matImg?.closest('.mat-holo'),
      hostCls: host?.className ?? null,
      previewOpen: !!document.querySelector('.card-preview-overlay'),
      fullViews: document.querySelectorAll('.full-view').length,
      rotatorStyle: rotator ? rotator.getAttribute('style') || '' : null,
    };
  }, zone);

const doubleClickCard = (zone) =>
  fr.evaluate((z) => {
    const img = document.querySelector(`#${z} img`);
    const r = img.getBoundingClientRect();
    const o = {
      bubbles: true,
      cancelable: true,
      clientX: r.x + r.width / 2,
      clientY: r.y + r.height / 2,
    };
    img.dispatchEvent(new MouseEvent('click', o));
    img.dispatchEvent(new MouseEvent('click', o));
    img.dispatchEvent(new MouseEvent('dblclick', o));
  }, zone);

const openAttachedViaContext = async () => {
  await fr.evaluate(() => {
    const img = document.querySelector('#active img');
    img.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    );
  });
  await page.waitForTimeout(300);
  await page.hover('#attachedCardsButton');
  await page.click('#viewAttachedCardsButton', { force: true });
  return fr.evaluate(() => document.querySelectorAll('.full-view').length);
};

const before = await snap('active');
if (!before || before.matImgW == null) {
  console.error('no card in the self active spot');
  process.exit(1);
}

await fr.evaluate(() => {
  window.__scales = [];
  const t0 = performance.now();
  const sample = () => {
    const pop = document.querySelector('.card-preview-pop');
    if (pop) {
      const m = /scale\(([\d.]+)\)/.exec(pop.style.transform || '');
      if (m) window.__scales.push(Number(m[1]));
    }
    if (performance.now() - t0 < 800) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
await doubleClickCard('active');
await page.waitForTimeout(1200);

const scales = await fr.evaluate(() => window.__scales);
const dblOpen = await snap('active');

T('double-click opens card preview overlay', dblOpen.previewOpen === true);
T('double-click does not open .full-view panel', dblOpen.fullViews === 0);
T(
  'preview enlarges the card',
  dblOpen.previewImgW > before.matImgW * 1.8,
  `${before.matImgW}px -> ${dblOpen.previewImgW}px`
);
T('pop starts small', scales[0] <= 0.6, `first=${scales[0]}`);
T(
  'pop overshoots then settles',
  Math.max(...scales) > 1 && scales.at(-1) === 1,
  `max=${Math.max(...scales)} last=${scales.at(-1)}`
);
if (before.holo) {
  T(
    'holo .card__rotator is not resized on mat',
    dblOpen.rotatorStyle === '',
    `style="${dblOpen.rotatorStyle}"`
  );
}

await page.keyboard.press('Escape');
await page.waitForTimeout(3000);
const dblClosed = await snap('active');
T('card returns to mat after preview', dblClosed.matImgW === before.matImgW);
T('preview overlay removed', dblClosed.previewOpen === false);

const fullViewCount = await openAttachedViaContext();
T('context menu can open attached-cards panel', fullViewCount === 1);
await page.waitForTimeout(1200);
const panelOpen = await snap('active');
T('attached panel uses .full-view', panelOpen.fullViews === 1, panelOpen.hostCls);
T(
  'attached panel enlarges the card',
  panelOpen.matImgW > before.matImgW * 1.8,
  `${before.matImgW}px -> ${panelOpen.matImgW}px`
);

await page.keyboard.press('Escape');
await page.waitForTimeout(3000);
const panelClosed = await snap('active');
T('attached panel closes cleanly', panelClosed.fullViews === 0);

console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
