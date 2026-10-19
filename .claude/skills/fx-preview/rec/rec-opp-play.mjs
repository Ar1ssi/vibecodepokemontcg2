// Design 043 video check: the opponent plays a Trainer from their hand onto the
// board, then one that resolved at once (lands on the discard pile).
// env: BASE_URL (default http://localhost:4100),
//      CHROMIUM / CHROMIUM_PATH, CARD_DIR (a folder of PNGs named like the card images, for no network)
// Iframe board: fake <img>s in the opponent's iframe zones and playOppTrainer called directly.
// 3D board: fabricated views with `trainerPlayed` events through the production advisory hooks.
import { chromium } from 'playwright';
import { renameSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';
const { BASE_URL = 'http://localhost:4100' } = process.env;
const TRAINER = 'https://images.pokemontcg.io/sv1/166_hires.png';
const ITEM = 'https://images.pokemontcg.io/sv1/181_hires.png';
const browser = await chromium.launch(launchOptions());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.agent/scratch/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await openBoard(page, BASE_URL);
const info = await page.evaluate(async ([trainer, item]) => {
  const load = (src) => Object.assign(new Image(), { src }).decode();
  // Both Trainers sit in the opponent's hand as redacted stubs; each play moves one out of it and
  // names it in a trainerPlayed event, which is when the origin is read off the hand card.
  await Promise.all([load(trainer), load(item), load('/src/assets/cardback.png')]);
  const card = (instanceId, name, src) => ({ instanceId, name, src, supertype: 'Trainer', subtypes: ['Item'], types: [] });
  const push = (opp, id) => window.__fxBoard.pushView({ opp }, [{ type: 'trainerPlayed', playerId: 'p2', instanceId: id }]);
  await window.__fxBoard.pushView({ opp: { hand: [{ instanceId: 1 }, { instanceId: 2 }] } });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const hand1 = await window.__fxBoard.imageOf(1);
  window.__play1 = () => push({ hand: [{ instanceId: 2 }], board: [card(1, 'Trainer', trainer)] }, 1).then(() => true);
  window.__play2 = () => push({ hand: [], board: [card(1, 'Trainer', trainer)], discard: [card(2, 'Item', item)] }, 2).then(() => true);
  return { origin1: hand1.getBoundingClientRect().toJSON(), slot: await window.__fxBoard.zoneRect('opp', 'board') };
}, [TRAINER, ITEM]);
console.log(JSON.stringify(info));
await page.waitForTimeout(500);
const fxNodes = () => page.evaluate(() => document.querySelectorAll('[class*="fx-opp-play"]').length);
console.log('play1', await page.evaluate(() => window.__play1()));
await page.waitForTimeout(1000);
console.log('opp-play scene nodes', await fxNodes());
await page.waitForTimeout(1600);
console.log('play2', await page.evaluate(() => window.__play2()));
await page.waitForTimeout(1000);
console.log('opp-play scene nodes', await fxNodes());
await page.waitForTimeout(1600);
const v = page.video();
await ctx.close();
renameSync(await v.path(), 'out/opp-play.webm');
await browser.close();
console.log('ok');
