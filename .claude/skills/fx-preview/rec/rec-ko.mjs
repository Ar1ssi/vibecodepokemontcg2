// Design 042 video check: the knockout scene on the opponent's Active (with two
// Energy attached), then a discard of two cards from your side.
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
const CARD = 'https://images.pokemontcg.io/sv3pt5/6_hires.png';
const FIRE = 'https://images.pokemontcg.io/sve/2_hires.png';
const TRAINER = 'https://images.pokemontcg.io/sv1/166_hires.png';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto('http://localhost:4100/?e2e=1');
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);
const info = await page.evaluate(async ([card, fire, trainer]) => {
  const { visualRectOf } = await import('/src/setup/image-logic/iframe-rect.mjs');
  const { playKnockoutScene } = await import('/src/setup/netcode/mat-fx/ko-scene.js');
  const { pileOf, playDiscardFlights } = await import('/src/setup/netcode/mat-fx/card-flight.js');
  const { frameTurnOf } = await import('/src/setup/netcode/mat-fx/evolve-scene.js');
  const oppDoc = document.getElementById('oppContainer').contentDocument;
  const selfDoc = document.getElementById('selfContainer').contentDocument;
  const slot = (doc) => {
    const zone = visualRectOf(doc.getElementById('active'));
    const h = Math.min(zone.height * 0.9, 150), w = h * 0.716;
    return { left: zone.left + (zone.width - w) / 2, top: zone.top + (zone.height - h) / 2, width: w, height: h };
  };
  const oppRect = slot(oppDoc);
  const selfRect = slot(selfDoc);
  const turn = frameTurnOf(oppDoc.getElementById('active'));
  const img = document.createElement('img');
  img.src = card;
  Object.assign(img.style, { position: 'fixed', left: oppRect.left + 'px', top: oppRect.top + 'px', width: oppRect.width + 'px', height: oppRect.height + 'px', zIndex: 2400, borderRadius: '4px', transform: `rotate(${turn}deg)` });
  document.body.appendChild(img);
  const load = (src) => Object.assign(new Image(), { src }).decode();
  await Promise.all([img.decode(), load(fire), load(trainer)]);
  const pile = pileOf('opp', 'discard');
  const selfPile = pileOf('self', 'discard');
  window.__ko = () => {
    img.remove();
    playKnockoutScene({ rect: oppRect, src: card, user: 'opp', turn, attached: [{ src: fire }, { src: fire }] });
  };
  window.__discard = () => {
    const from = { ...selfRect, left: selfRect.left - selfRect.width * 1.5, top: selfRect.top + selfRect.height * 1.3 };
    const from2 = { ...from, left: from.left + selfRect.width * 1.1 };
    playDiscardFlights([{ src: trainer, rect: from, turn: 0 }, { src: fire, rect: from2, turn: 0 }], selfPile);
  };
  return { pile, selfPile, turn, oppRect };
}, [CARD, FIRE, TRAINER]);
console.log(JSON.stringify(info));
await page.waitForTimeout(600);
await page.evaluate(() => window.__ko());
await page.waitForTimeout(2300);
await page.evaluate(() => window.__discard());
await page.waitForTimeout(1500);
const v = page.video();
await ctx.close();
renameSync(await v.path(), 'out/ko-scene.webm');
await browser.close();
console.log('ok');
