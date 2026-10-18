// Design 045 video check: your prize fan flies up on the arc, a pick flips out of
// the fan into the preview and drops into the hand; then the opponent takes two
// prizes (sleeves arc from their prize slots to their hand).
// env: BASE_URL (default http://localhost:4100),
//      CHROMIUM / CHROMIUM_PATH, CARD_DIR (a folder of PNGs named like the card images, for no network)
// Iframe board: fake <img>s in the iframes' prize zones, moved by hand. 3D board: the prizes are
// stubs in fabricated views (the scene draws them) and each take is a view that moves them to the hand.
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';
const { BASE_URL = 'http://localhost:4100' } = process.env;
const FACE = 'https://images.pokemontcg.io/sv1/166_hires.png';
const BACK = '/src/assets/cardback.png';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await openBoard(page, BASE_URL);
await page.evaluate(async ([face, back]) => {
  const { promptServerPrizeChoice, pickPrizeTakeIndices } = await import('/src/actions/zones/prize-take-prompt.js');
  const { playDrawBatch, takePrizeHandoff } = await import('/src/setup/image-logic/draw-flight.js');
  const { captureKnockoutGhost } = await import('/src/setup/image-logic/knockout-flight.js');
  const load = (src) => Object.assign(new Image(), { src }).decode().catch(() => {});
  await Promise.all([face, back].map(load));
  const stub = (instanceId) => ({ instanceId });
  const mineIds = [1, 2, 3, 4, 5, 6];
  const theirIds = [11, 12, 13, 14, 15, 16];
  const state = { self: { prizes: mineIds.map(stub), hand: [] }, opp: { prizes: theirIds.map(stub), hand: [] } };
  await window.__fxBoard.pushView(state);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const withImages = (ids) => Promise.all(ids.map(async (instanceId) => ({ instanceId, image: await window.__fxBoard.imageOf(instanceId) })));
  const mine = await withImages(mineIds);
  const theirs = await withImages(theirIds);
  window.__fan = () =>
    promptServerPrizeChoice({
      cards: mine,
      needed: 1,
      // Stands in for the server: the picked prize moves to the hand face up, then the
      // advisory draw plan plays it from its fan sleeve.
      onResolve: ([id]) =>
        setTimeout(async () => {
          state.self.prizes = state.self.prizes.filter((card) => card.instanceId !== id);
          state.self.hand = [{ instanceId: id, name: 'Prize', src: face, supertype: 'Trainer', subtypes: ['Item'], types: [] }];
          await window.__fxBoard.pushView(state);
          playDrawBatch('self', [{ image: await window.__fxBoard.imageOf(id), from: takePrizeHandoff(id) }]);
        }, 150),
    });
  window.__pick = () => pickPrizeTakeIndices([2]);
  window.__opp = async () => {
    const taken = theirs.slice(0, 2).map((card) => ({ id: card.instanceId, ghost: captureKnockoutGhost('opp', card.image) }));
    state.opp.prizes = state.opp.prizes.slice(2);
    state.opp.hand = taken.map(({ id }) => stub(id));
    await window.__fxBoard.pushView(state);
    const items = await Promise.all(
      taken.map(async ({ id, ghost }) => ({ image: await window.__fxBoard.imageOf(id), redacted: true, from: { rect: ghost.rect, turn: ghost.turn } }))
    );
    return playDrawBatch('opp', items);
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
