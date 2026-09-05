// Ad-hoc UI test for the double-click card preview (`.full-view`), the case that
// used to shrink holofoil cards instead of enlarging them. Not part of `pnpm test`.
//
//   node server/server.js                       # in another shell
//   node fullview-test.mjs <exported-state.json>
//
// The argument is a state file exported from the sim's Options > Export (the
// same JSON the `#jsonFile` input accepts). It must contain at least one
// Pokémon in the self-side active spot; a holofoil-rare one exercises the
// interesting path, and attached energies exercise the panel layout.

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
    const img = document.querySelector(`#${z} img`);
    if (!img) return null;
    const host = img.closest('.play-container');
    const rotator = img.closest('.card__rotator');
    return {
      imgW: Math.round(img.getBoundingClientRect().width),
      holo: !!img.closest('.mat-holo'),
      hostCls: host?.className ?? null,
      hostStyle: host?.getAttribute('style') ?? null,
      rotatorStyle: rotator ? rotator.getAttribute('style') || '' : null,
      fullViews: document.querySelectorAll('.full-view').length,
      fullViewsOnPlayContainer: Array.from(document.querySelectorAll('.full-view')).every(
        (e) => e.classList.contains('play-container')
      ),
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
    // Dispatched directly: the holo auto-sweep keeps the card "unstable", so
    // Playwright's own dblclick() waits for stability until it times out.
    img.dispatchEvent(new MouseEvent('click', o));
    img.dispatchEvent(new MouseEvent('click', o));
    img.dispatchEvent(new MouseEvent('dblclick', o));
  }, zone);

const before = await snap('active');
if (!before) {
  console.error('no card in the self active spot — pick a different state file');
  process.exit(1);
}

// Sample the pop transform across the animation.
await fr.evaluate(() => {
  window.__scales = [];
  const t0 = performance.now();
  const sample = () => {
    const fv = document.querySelector('.full-view');
    if (fv) {
      const m = /scale\(([\d.]+)\)/.exec(fv.style.transform || '');
      if (m) window.__scales.push(Number(m[1]));
    }
    if (performance.now() - t0 < 800) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
await doubleClickCard('active');
await page.waitForTimeout(1200);

const scales = await fr.evaluate(() => window.__scales);
const open = await snap('active');

T('preview enlarges the card', open.imgW > before.imgW * 1.8, `${before.imgW}px -> ${open.imgW}px`);
T('.full-view lands on .play-container', open.fullViewsOnPlayContainer, open.hostCls);
T('exactly one .full-view', open.fullViews === 1);
if (before.holo) {
  T('holo .card__rotator is not resized', open.rotatorStyle === '', `style="${open.rotatorStyle}"`);
}
T('pop starts small', scales[0] <= 0.6, `first=${scales[0]}`);
T('pop overshoots then settles', Math.max(...scales) > 1 && scales.at(-1) === 1, `max=${Math.max(...scales)} last=${scales.at(-1)}`);

await page.keyboard.press('Escape');
await page.waitForTimeout(3000);
const closed = await snap('active');

T('card returns to mat size', closed.imgW === before.imgW, `${closed.imgW}px vs ${before.imgW}px`);
T('no .full-view left behind', closed.fullViews === 0);
T('no leftover pop transform', !/transform/.test(closed.hostStyle || ''), closed.hostStyle);
T('container width restored', closed.hostStyle === before.hostStyle);
if (before.holo) {
  T('holo wrapper survives the close', closed.holo === true);
}

// A viewport resize must not squash a holo card (the resizer used to write the
// container width onto `.card__rotator`).
await page.setViewportSize({ width: 1280, height: 820 });
await page.waitForTimeout(1500);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(1500);
const resized = await snap('active');
T('card survives a viewport resize', Math.abs(resized.imgW - before.imgW) <= 3, `${before.imgW}px -> ${resized.imgW}px`);
if (before.holo) {
  T('resize does not size .card__rotator', !/width/.test(resized.rotatorStyle || ''), resized.rotatorStyle);
}

console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
