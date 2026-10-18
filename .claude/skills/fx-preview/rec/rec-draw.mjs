// Design 044 video check: your 7-card opening hand, a single turn draw, then
// the opponent drawing 2 (sleeves flying to their hand).
// env: BASE_URL (default http://localhost:4100),
//      CHROMIUM / CHROMIUM_PATH, CARD_DIR (a folder of PNGs named like the card images, for no network)
// Iframe board: fake <img>s are dropped into the iframes' hand zones and played through playDrawBatch.
// 3D board: the cards arrive in fabricated views with `cardsDrawn` events, through the production
// advisory hooks (the hand is drawn by the scene, so a fake DOM image would be invisible).
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';
const { BASE_URL = 'http://localhost:4100' } = process.env;
const FACES = [166, 181, 190, 196, 198, 200, 210].map((n) => `https://images.pokemontcg.io/sv1/${n}_hires.png`);
const TURN = 'https://images.pokemontcg.io/sv1/172_hires.png';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await openBoard(page, BASE_URL);
const info = await page.evaluate(async ([faces, turn]) => {
  const load = (src) => Object.assign(new Image(), { src }).decode().catch(() => {});
  await Promise.all([...faces, turn, '/src/assets/cardback.png'].map(load));
  const card = (instanceId, src) => ({ instanceId, name: `Card ${instanceId}`, src, supertype: 'Trainer', subtypes: ['Item'], types: [] });
  const hands = { self: [], opp: [] };
  const draw = async (user, cards) => {
    hands[user].push(...cards);
    await window.__fxBoard.pushView(hands, [{ type: 'cardsDrawn', playerId: user === 'self' ? 'p1' : 'p2', cards: cards.map(({ instanceId }) => ({ instanceId })) }]);
    return cards.length;
  };
  window.__opening = () => draw('self', faces.map((src, i) => card(101 + i, src)));
  window.__turn = () => draw('self', [card(110, turn)]);
  // The opponent's cards are redacted: stubs, drawn as sleeves.
  window.__opp = () => draw('opp', [{ instanceId: 201 }, { instanceId: 202 }]);
  return { selfDeck: await window.__fxBoard.zoneRect('self', 'deck'), oppDeck: await window.__fxBoard.zoneRect('opp', 'deck') };
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
