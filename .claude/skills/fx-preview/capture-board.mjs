// Pushes a fabricated authoritative view through the real applyView so persistent
// board effects (Tera crystal skin, holo foil, ...) render, then screenshots the board.
// See SKILL.md in this folder.
// usage: node .claude/skills/fx-preview/capture-board.mjs [outPrefix]
// env:   CARD_IMG, TYPE, BASE_URL, CHROMIUM, SIO_JS  (same as capture-entry.mjs)
//        HOLO=0    skip the emulated holo wrap on the active card
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [out = 'fx-board'] = process.argv.slice(2);
const {
  CARD_IMG,
  TYPE = 'Darkness',
  BASE_URL = 'http://localhost:4000',
  CHROMIUM,
  SIO_JS,
} = process.env;
if (!CARD_IMG) throw new Error('set CARD_IMG to a card image file or URL');

const browser = await chromium.launch(
  CHROMIUM ? { executablePath: CHROMIUM } : {}
);
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

await page.goto(`${BASE_URL}/?e2e=1`);
await page.waitForFunction(() => window.__ptcg?.ready === true, null, {
  timeout: 30000,
});
await page.waitForTimeout(800);

const report = await page.evaluate(
  async ([src, type, holo]) => {
    const { applyView, getCardRegistry } =
      await import('/src/setup/netcode/apply-view.js');
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

    if (holo) {
      // TCGdex foil data is not fetched for fabricated cards, so repeat hydrateHolo's
      // DOM moves by hand for the active card and announce the new wrapper.
      const { buildHoloCard, startHoloAnimation } =
        await import('/src/setup/deck-builder/core/holo.mjs');
      const rec = getCardRegistry().get(101);
      const img = rec.holoCard.image;
      const wrapper = buildHoloCard(img.src, 'double rare');
      wrapper.classList.add('mat-holo');
      const rotator = wrapper.querySelector('.card__rotator');
      const { parentElement, nextSibling } = img;
      rotator.insertBefore(img, rotator.firstChild);
      rotator.querySelectorAll('img').forEach((el) => {
        if (el !== img) el.remove();
      });
      parentElement.insertBefore(wrapper, nextSibling);
      rec.holoCard.wrapper = wrapper;
      startHoloAnimation(wrapper, { auto: true, tilt: false });
      document.dispatchEvent(new CustomEvent('holo-wrapper-changed'));
    }
    await new Promise((r) => setTimeout(r, 900));
    const doc = document.getElementById('selfContainer').contentDocument;
    return `${doc.querySelectorAll('.fx-tera-crystal').length} tera skins on the board`;
  },
  [localImg ? '/__fx-card' : CARD_IMG, TYPE, process.env.HOLO !== '0']
);
console.log(report);

const clip = await page.evaluate(() => {
  const frame = document.getElementById('selfContainer');
  const doc = frame.contentDocument;
  const fr = frame.getBoundingClientRect();
  const a = doc.getElementById('active').getBoundingClientRect();
  const b = doc.getElementById('bench').getBoundingClientRect();
  const left = fr.left + Math.min(a.left, b.left) - 20;
  const top = fr.top + Math.min(a.top, b.top) - 20;
  const width = Math.max(a.right, b.right) - Math.min(a.left, b.left) + 40;
  const height = Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top) + 40;
  return { x: Math.max(0, left), y: Math.max(0, top), width, height };
});
await page.screenshot({ path: `${out}-board.png`, clip });
await page.screenshot({ path: `${out}-full.png` });
await browser.close();
console.log(`wrote ${out}-board.png and ${out}-full.png`);
