// Pushes a fabricated authoritative view through the real applyView so persistent
// board effects (Tera crystal skin, holo foil, ...) render, then screenshots the board.
// See SKILL.md in this folder.
// usage: node .claude/skills/fx-preview/capture-board.mjs [outPrefix]
// env:   CARD_IMG, TYPE, BASE_URL, CHROMIUM, SIO_JS  (same as capture-entry.mjs)
//        A foil is a scene material fed by the TCG Live foil manifest, which a fabricated card
//        has no entry in, so this shows the Tera skins only.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { launchOptions, openBoard } from './board-mode.mjs';

const [out = 'fx-board'] = process.argv.slice(2);
const {
  CARD_IMG,
  TYPE = 'Darkness',
  BASE_URL = 'http://localhost:4000',
  SIO_JS,
} = process.env;
if (!CARD_IMG) throw new Error('set CARD_IMG to a card image file or URL');

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
if (SIO_JS) {
  await page.route('https://cdn.socket.io/**', (r) =>
    r.fulfill({ path: SIO_JS, contentType: 'application/javascript' })
  );
}
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
const localImg = existsSync(CARD_IMG);
if (localImg) {
  await page.route('**/__fx-card', (r) =>
    r.fulfill({ path: path.resolve(CARD_IMG) })
  );
}
page.on('pageerror', (e) => console.log('pageerror', e.message));

await openBoard(page, BASE_URL);

const report = await page.evaluate(
  async ([src, type]) => {
    const { applyView } = await import('/src/setup/netcode/apply-view.js');
    const tera = (instanceId) => ({
      instanceId,
      name: 'Tera ex',
      src,
      supertype: 'Pokémon',
      subtypes: ['Stage 2', 'ex', 'Tera'],
      types: [type],
      rarity: 'Double Rare',
      hp: '310',
    });
    const plain = (instanceId) => ({
      instanceId,
      name: 'Plain',
      src,
      supertype: 'Pokémon',
      subtypes: ['Stage 1'],
      types: ['Water'],
      rarity: 'Uncommon',
      hp: '90',
    });
    applyView(
      {
        stateVersion: 99,
        you: {
          playerId: 'p1',
          zones: {
            active: [tera(101)],
            bench: [plain(102), tera(103)],
            hand: [],
          },
        },
        them: {
          playerId: 'p2',
          zones: { active: [plain(201)], bench: [], hand: [] },
        },
      },
      [],
      {}
    );
    await new Promise((r) => setTimeout(r, 600));

    // The 3D scene draws a few frames a second under SwiftShader: give the skins time to paint.
    await new Promise((r) => setTimeout(r, 3000));
    const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
    const skins = [...getBoardScene().inspect().uiState.values()].filter(
      (state) => state?.teraSkin
    );
    return `${skins.length} tera skins on the board`;
  },
  [localImg ? '/__fx-card' : CARD_IMG, TYPE]
);
console.log(report);

const clip = await page.evaluate(async () => {
  // The scene's projected zone footprints, already in page px.
  const a = await window.__fxBoard.zoneRect('self', 'active');
  const b = await window.__fxBoard.zoneRect('self', 'bench');
  const left = Math.min(a.left, b.left) - 20;
  const top = Math.min(a.top, b.top) - 20;
  const width = Math.max(a.left + a.width, b.left + b.width) - Math.min(a.left, b.left) + 40;
  const height = Math.max(a.top + a.height, b.top + b.height) - Math.min(a.top, b.top) + 40;
  return { x: Math.max(0, left), y: Math.max(0, top), width, height };
});
await page.screenshot({ path: `${out}-board.png`, clip });
await page.screenshot({ path: `${out}-full.png` });
await browser.close();
console.log(`wrote ${out}-board.png and ${out}-full.png`);
