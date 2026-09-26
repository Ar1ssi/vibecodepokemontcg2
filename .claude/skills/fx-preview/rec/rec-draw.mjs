// Design 044 video check: your 7-card opening hand, a single turn draw, then
// the opponent drawing 2 (sleeves flying to their hand).
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
const FACES = [166, 181, 190, 196, 198, 200, 210].map((n) => `https://images.pokemontcg.io/sv1/${n}_hires.png`);
const TURN = 'https://images.pokemontcg.io/sv1/172_hires.png';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto('http://localhost:4100/?e2e=1');
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);
const info = await page.evaluate(async ([faces, turn]) => {
  const { playDrawBatch } = await import('/src/setup/image-logic/draw-flight.js');
  const docs = {
    self: document.getElementById('selfContainer').contentDocument,
    opp: document.getElementById('oppContainer').contentDocument,
  };
  const put = (user, src) => {
    const img = docs[user].createElement('img');
    img.src = src;
    img.user = user;
    Object.assign(img.style, { width: '60px', height: '84px' });
    docs[user].getElementById('hand').appendChild(img);
    return { image: img, redacted: user === 'opp' };
  };
  const load = (src) => Object.assign(new Image(), { src }).decode().catch(() => {});
  await Promise.all([...faces, turn, '/src/assets/cardback.png'].map(load));
  const deckCover = (user) => docs[user].getElementById('deckCover')?.getBoundingClientRect().toJSON() || null;
  window.__opening = () => playDrawBatch('self', faces.map((src) => put('self', src)));
  window.__turn = () => playDrawBatch('self', [put('self', turn)]);
  window.__opp = () => playDrawBatch('opp', [put('opp', '/src/assets/cardback.png'), put('opp', '/src/assets/cardback.png')]);
  return { selfDeck: deckCover('self'), oppDeck: deckCover('opp') };
}, [FACES, TURN]);
console.log(JSON.stringify(info));
await page.waitForTimeout(400);
console.log('opening', await page.evaluate(() => window.__opening()));
await page.waitForTimeout(2600);
console.log('turn', await page.evaluate(() => window.__turn()));
await page.waitForTimeout(1600);
console.log('opp', await page.evaluate(() => window.__opp()));
await page.waitForTimeout(1500);
const v = page.video();
await ctx.close();
renameSync(await v.path(), 'out/draw-scene.webm');
await browser.close();
console.log('ok');
