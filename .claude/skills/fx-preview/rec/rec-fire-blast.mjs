// Design 063 look test: Fire Blast from your Active to the opponent's Active, as a
// real attack reads — name banner and target ring, the move scene, and the damage
// number / hit flash / table shake landing on its contact moment through the
// impact queue. Both cards are pushed through the real applyView so the registry
// resolves them exactly as in a game.
// env: BASE_URL (default http://localhost:4100), CHROMIUM, OUT (default .agent/scratch/fire-blast),
//      SIO_JS (local socket.io.min.js when cdn.socket.io is unreachable), SEED,
//      CARD_DIR (a folder holding 6_hires.png and 3_hires.png when the browser cannot reach images.pokemontcg.io)
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const { BASE_URL = 'http://localhost:4100', CHROMIUM, OUT = '.agent/scratch/fire-blast', SIO_JS, SEED = '7', CARD_DIR } = process.env;
const ATTACKER = 'https://images.pokemontcg.io/sv3pt5/6_hires.png';
const DEFENDER = 'https://images.pokemontcg.io/sv3pt5/3_hires.png';
const BANNER_HOLD_MS = 620;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: path.join(OUT, 'vid'), size: { width: 1600, height: 900 } },
});
const page = await ctx.newPage();
if (SIO_JS) {
  await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
}
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
if (CARD_DIR) {
  await page.route('https://images.pokemontcg.io/**', (r) =>
    r.fulfill({ path: path.join(CARD_DIR, path.basename(new URL(r.request().url()).pathname)), contentType: 'image/png' })
  );
}
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto(`${BASE_URL}/?e2e=1`);
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);

const info = await page.evaluate(
  async ([attackerSrc, defenderSrc, seed]) => {
    const { applyView, getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
    const { rectForInstance } = await import('/src/setup/image-logic/mat-fx.mjs');
    const { attackBanner, announceStrike, damage } = await import('/src/setup/netcode/mat-fx/combat.js');
    const { playFireBlast } = await import('/src/setup/netcode/mat-fx/moves/fire-blast.js');
    const card = (instanceId, name, src, types, subtypes, hp) => ({
      instanceId,
      name,
      src,
      supertype: 'Pokémon',
      subtypes,
      types,
      rarity: 'Double Rare',
      hp,
    });
    applyView(
      {
        stateVersion: 99,
        you: {
          playerId: 'p1',
          zones: { active: [card(101, 'Charizard ex', attackerSrc, ['Fire'], ['Stage 2', 'ex'], '330')], bench: [], hand: [] },
        },
        them: {
          playerId: 'p2',
          zones: { active: [card(201, 'Venusaur ex', defenderSrc, ['Grass'], ['Stage 2', 'ex'], '340')], bench: [], hand: [] },
        },
      },
      [],
      {}
    );
    await new Promise((r) => setTimeout(r, 900));
    const registry = getCardRegistry();
    const decode = (id) => registry.get(id)?.element?.decode?.().catch(() => undefined);
    await Promise.all([decode(101), decode(201)]);
    const from = rectForInstance(101, registry);
    const to = rectForInstance(201, registry);
    window.__fireBlast = {
      banner: () => attackBanner({ attackerId: 101, defenderId: 201, attackName: 'Fire Blast', user: 'self' }),
      move: () => {
        const played = playFireBlast({
          from: rectForInstance(101, registry),
          to: rectForInstance(201, registry),
          seed: Number(seed),
          impacts: { strikeIn: announceStrike },
          attackerCard: registry.get(101)?.card || null,
        });
        damage({ instanceId: 201, damage: 180, dealt: 180, weakness: true });
        return played;
      },
    };
    return { from, to };
  },
  [ATTACKER, DEFENDER, SEED]
);
console.log(JSON.stringify(info));
writeFileSync(path.join(OUT, 'rects.json'), JSON.stringify(info));
await page.waitForTimeout(700);
await page.evaluate(() => window.__fireBlast.banner());
await page.waitForTimeout(BANNER_HOLD_MS);
const played = await page.evaluate(() => window.__fireBlast.move());
console.log('played', JSON.stringify(played));
await page.waitForTimeout((played?.durationMs ?? 1900) + 1400);
const video = page.video();
await ctx.close();
const target = path.join(OUT, 'fire-blast.webm');
renameSync(await video.path(), target);
await browser.close();
console.log('wrote', target);
