// Design 043 video check: the opponent plays a Trainer from their hand onto the
// board, then one that resolved at once (lands on the discard pile).
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
const TRAINER = 'https://images.pokemontcg.io/sv1/166_hires.png';
const ITEM = 'https://images.pokemontcg.io/sv1/181_hires.png';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto('http://localhost:4100/?e2e=1');
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);
const info = await page.evaluate(async ([trainer, item]) => {
  const { playOppTrainer } = await import('/src/setup/netcode/mat-fx/opp-play.js');
  const { captureKnockoutGhost } = await import('/src/setup/image-logic/knockout-flight.js');
  const oppDoc = document.getElementById('oppContainer').contentDocument;
  const put = (zoneId, src, css) => {
    const img = oppDoc.createElement('img');
    img.src = src;
    Object.assign(img.style, { width: '60px', height: '84px', ...css });
    oppDoc.getElementById(zoneId).appendChild(img);
    return img;
  };
  const load = (src) => Object.assign(new Image(), { src }).decode();
  await Promise.all([load(trainer), load(item), load('/src/assets/cardback.png')]);
  const hand1 = put('hand', '/src/assets/cardback.png', {});
  const hand2 = put('hand', '/src/assets/cardback.png', {});
  const slot = put('board', trainer, {});
  const gone = oppDoc.createElement('img');
  gone.dataset.zone = 'discard';
  await new Promise((r) => setTimeout(r, 200));
  const origin1 = captureKnockoutGhost('opp', hand1);
  const origin2 = captureKnockoutGhost('opp', hand2);
  window.__play1 = () => {
    hand1.remove();
    return playOppTrainer({ instanceId: 1, user: 'opp', origin: origin1, src: trainer, registry: new Map([[1, { element: slot }]]) });
  };
  window.__play2 = () => {
    hand2.remove();
    return playOppTrainer({ instanceId: 2, user: 'opp', origin: origin2, src: item, registry: new Map([[2, { element: gone }]]) });
  };
  return { origin1, slot: slot.getBoundingClientRect().toJSON() };
}, [TRAINER, ITEM]);
console.log(JSON.stringify(info));
await page.waitForTimeout(500);
console.log('play1', await page.evaluate(() => window.__play1()));
await page.waitForTimeout(2600);
console.log('play2', await page.evaluate(() => window.__play2()));
await page.waitForTimeout(2600);
const v = page.video();
await ctx.close();
renameSync(await v.path(), 'out/opp-play.webm');
await browser.close();
console.log('ok');
