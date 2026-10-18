// env: PTCG_BOARD=3d (the three.js board, design 074; default iframe), BASE_URL (default http://localhost:4100),
//      CHROMIUM / CHROMIUM_PATH, CARD_DIR (a folder of PNGs named like the card images, for no network)
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';
const { BASE_URL = 'http://localhost:4100' } = process.env;
const FROM = 'https://images.pokemontcg.io/sv3pt5/4_hires.png';
const TO = 'https://images.pokemontcg.io/sv3pt5/5_hires.png';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
await openBoard(page, BASE_URL);
await page.evaluate(async ([from, to]) => {
  const { playEvolveScene } = await import('/src/setup/netcode/mat-fx/evolve-scene.js');
  const zone = await window.__fxBoard.zoneRect('self', 'active');
  const h = Math.min(zone.height * 0.9, 150), w = h * 0.716;
  const rect = { left: zone.left + (zone.width - w) / 2, top: zone.top + (zone.height - h) / 2, width: w, height: h };
  const img = document.createElement('img');
  img.src = from;
  Object.assign(img.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: w + 'px', height: h + 'px', zIndex: 2400, borderRadius: '4px' });
  document.body.appendChild(img);
  await Promise.all([img.decode(), new Image().decode.call(Object.assign(new Image(), { src: to }))]);
  // Design 066: the board already shows the evolved card when TCG Live's scene plays over it.
  img.src = to;
  window.__go = () => playEvolveScene({ rect });
}, [FROM, TO]);
await page.waitForTimeout(700);
await page.evaluate(() => window.__go());
await page.waitForTimeout(4300);
const v = page.video();
await ctx.close();
renameSync(await v.path(), 'out/evolve-active.webm');
await browser.close();
console.log('ok');
