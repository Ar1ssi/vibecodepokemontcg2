// Design 045 video check: your prize fan flies up on the arc, a pick flips out of
// the fan into the preview and drops into the hand; then the opponent takes two
// prizes (sleeves arc from their prize slots to their hand).
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
const FACE = 'https://images.pokemontcg.io/sv1/166_hires.png';
const BACK = '/src/assets/cardback.png';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto('http://localhost:4100/?e2e=1');
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(async ([face, back]) => {
  const { promptServerPrizeChoice, pickPrizeTakeIndices } = await import('/src/actions/zones/prize-take-prompt.js');
  const { playDrawBatch, takePrizeHandoff } = await import('/src/setup/image-logic/draw-flight.js');
  const { captureKnockoutGhost } = await import('/src/setup/image-logic/knockout-flight.js');
  const docs = {
    self: document.getElementById('selfContainer').contentDocument,
    opp: document.getElementById('oppContainer').contentDocument,
  };
  const load = (src) => Object.assign(new Image(), { src }).decode().catch(() => {});
  await Promise.all([face, back].map(load));
  const put = (user, zoneId, src, id) => {
    const img = docs[user].createElement('img');
    img.src = src;
    img.user = user;
    Object.assign(img.style, { width: '60px', height: '84px' });
    docs[user].getElementById(zoneId).appendChild(img);
    return { instanceId: id, image: img };
  };
  const mine = [1, 2, 3, 4, 5, 6].map((id) => put('self', 'prizes', back, id));
  const theirs = [11, 12, 13, 14, 15, 16].map((id) => put('opp', 'prizes', back, id));
  window.__fan = () =>
    promptServerPrizeChoice({
      cards: mine,
      needed: 1,
      // Stands in for the server: the picked prize moves to the hand face up,
      // then the advisory draw plan plays it from its fan sleeve.
      onResolve: ([id]) =>
        setTimeout(() => {
          const card = mine.find((c) => c.instanceId === id);
          card.image.src = face;
          docs.self.getElementById('hand').appendChild(card.image);
          playDrawBatch('self', [{ image: card.image, from: takePrizeHandoff(id) }]);
        }, 150),
    });
  window.__pick = () => pickPrizeTakeIndices([2]);
  window.__opp = () => {
    const taken = theirs.slice(0, 2).map((card) => {
      const ghost = captureKnockoutGhost('opp', card.image);
      docs.opp.getElementById('hand').appendChild(card.image);
      return { image: card.image, redacted: true, from: { rect: ghost.rect, turn: ghost.turn } };
    });
    return playDrawBatch('opp', taken);
  };
}, [FACE, BACK]);
await page.waitForTimeout(400);
await page.evaluate(() => { void window.__fan(); });
await page.waitForTimeout(1300);
console.log('pick', await page.evaluate(() => window.__pick()));
await page.waitForTimeout(2200);
console.log('opp', await page.evaluate(() => window.__opp()));
await page.waitForTimeout(1500);
const v = page.video();
await ctx.close();
renameSync(await v.path(), 'out/prize-flight.webm');
await browser.close();
console.log('ok');
