// Design 089: stills of the board effects (mat-fx/board-fx.js) and the riffle shuffle on a frozen scene clock.
// Each effect is fired on a fabricated board, the scene clock is stepped to chosen times and the
// page is cropped round the effect, at 2× density. Scene effects run on the scene clock; the DOM
// tags and banners run on their own WAAPI animations, which are paused and seeked to the same time.
// usage: PORT=4100 pnpm start, then node .claude/skills/fx-preview/rec/rec-board-fx.mjs
// env: ONLY=block,heal,…  (default all) · BASE_URL (default http://localhost:4100) · OUT (default
//      .agent/scratch/board-fx) · CHROMIUM / CHROMIUM_PATH · SIO_JS (local socket.io.min.js)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';

const { BASE_URL = 'http://localhost:4100', OUT = '.agent/scratch/board-fx', ONLY = '', SIO_JS } = process.env;
mkdirSync(OUT, { recursive: true });

/** effect → the times (ms) to shoot and what to crop round ('card:<id>' | 'prizes' | 'full'). */
const SHOTS = {
  block: { times: [40, 120, 260, 420, 620], crop: 'card:201' },
  survived: { times: [120, 320], crop: 'card:201' },
  'retreat-blocked': { times: [120, 320], crop: 'card:101' },
  'attack-fail': { times: [120, 300, 520, 760], crop: 'card:101' },
  heal: { times: [120, 300, 520, 760, 1000], crop: 'card:101' },
  landing: { times: [40, 160, 280, 420, 580], crop: 'card:102' },
  'prize-pulse': { times: [150, 350, 550, 750], crop: 'prizes' },
  'power-gx': { times: [140, 320, 560, 880], crop: 'card:101' },
  'power-vstar': { times: [320], crop: 'card:101' },
  shuffle: { times: [0, 130, 255, 420, 600, 780, 930, 1100, 1300, 1500], crop: 'deck' },
  'shuffle-opp': { times: [255, 600, 1100], crop: 'deck-opp' },
  // Slice 9: the registry's other DOM effects (banners, tags, status pops, the Prize claim, game over).
  'turn-banner': { times: [120, 420, 900, 1300], crop: 'full' },
  'turn-banner-opp': { times: [420], crop: 'full' },
  'attack-banner': { times: [120, 420, 900], crop: 'full' },
  'ability-tag': { times: [120, 420, 900, 1300], crop: 'card:101' },
  'status-burned': { times: [120, 320, 620, 900], crop: 'card:201' },
  'status-poisoned': { times: [120, 320, 620, 900], crop: 'card:201' },
  'status-asleep': { times: [320, 620], crop: 'card:201' },
  'status-paralyzed': { times: [320, 620], crop: 'card:201' },
  'status-confused': { times: [320, 620], crop: 'card:201' },
  'status-clear': { times: [120, 320, 620, 900], crop: 'card:201' },
  'prize-claim': { times: [80, 240, 480, 760], crop: 'prizes' },
  'game-over-win': { times: [200, 700, 1400], crop: 'full' },
  'game-over-loss': { times: [200, 700, 1400], crop: 'full' },
};
const wanted = ONLY ? ONLY.split(',').map((name) => name.trim()) : Object.keys(SHOTS);

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text()}`));
if (SIO_JS) await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
await openBoard(page, BASE_URL);

const rects = await page.evaluate(async () => {
  const { applyView, getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
  const { rectForInstance } = await import('/src/setup/image-logic/mat-fx.mjs');
  const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
  const face = (label, hue) => {
    const c = document.createElement('canvas');
    c.width = 245;
    c.height = 342;
    const g = c.getContext('2d');
    g.fillStyle = `hsl(${hue} 55% 38%)`;
    g.fillRect(0, 0, 245, 342);
    g.fillStyle = `hsl(${hue} 60% 78%)`;
    g.fillRect(16, 40, 213, 140);
    g.fillStyle = '#f4f1e6';
    g.fillRect(16, 196, 213, 126);
    g.fillStyle = '#111';
    g.font = 'bold 22px sans-serif';
    g.fillText(label, 18, 30);
    return c.toDataURL('image/png');
  };
  const card = (instanceId, name, hue, types) => ({ instanceId, name, src: face(name, hue), supertype: 'Pokémon', subtypes: ['Basic'], types, hp: '120' });
  const prize = (instanceId) => ({ instanceId });
  applyView(
    {
      stateVersion: 99,
      you: {
        playerId: 'p1',
        zones: {
          active: [card(101, 'Charizard', 14, ['Fire'])],
          bench: [card(102, 'Squirtle', 205, ['Water'])],
          hand: [],
          prizes: [301, 302, 303, 304, 305, 306].map(prize),
          deck: { count: 40 },
        },
      },
      them: { playerId: 'p2', zones: { active: [card(201, 'Venusaur', 120, ['Grass'])], bench: [], hand: [], prizes: [401, 402, 403].map(prize), deck: { count: 40 } } },
    },
    [],
    {}
  );
  await new Promise((r) => setTimeout(r, 2500));
  const registry = getCardRegistry();
  const scene = getBoardScene();
  const clock = scene.inspect().canvas.getAnimations()[0];
  clock.pause();
  // Stepping time takes far longer than the effects' own backstops: hold the long timers back, so
  // no overlay tears down between two shots.
  const realTimeout = window.setTimeout;
  window.setTimeout = (fn, ms, ...rest) => (ms >= 1000 ? 0 : realTimeout(fn, ms, ...rest));
  window.__boardFx = { scene, clock, now: scene.clock.now() };
  const rectOf = (id) => rectForInstance(id, registry);
  const prizes = [301, 302, 303, 304, 305, 306].map(rectOf).filter(Boolean);
  const union = (list) => {
    const left = Math.min(...list.map((r) => r.left));
    const top = Math.min(...list.map((r) => r.top));
    return { left, top, width: Math.max(...list.map((r) => r.left + r.width)) - left, height: Math.max(...list.map((r) => r.top + r.height)) - top };
  };
  const pile = (side) => {
    const rect = scene.rects()[`pile:${side}:deck`];
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  };
  return { 101: rectOf(101), 102: rectOf(102), 201: rectOf(201), prizes: prizes.length ? union(prizes) : null, deck: pile('self'), 'deck-opp': pile('opp') };
});

const clipFor = (crop) => {
  if (crop === 'full') return { x: 0, y: 0, width: 960, height: 720 };
  const rect = crop.startsWith('card:') ? rects[crop.split(':')[1]] : rects[crop];
  const pad = rect.height * (crop === 'prizes' ? 0.35 : crop.startsWith('deck') ? 1.15 : 0.95);
  const x = Math.max(0, Math.round(rect.left - pad));
  const y = Math.max(0, Math.round(rect.top - pad));
  return { x, y, width: Math.round(Math.min(1280 - x, rect.width + 2 * pad)), height: Math.round(Math.min(800 - y, rect.height + 2 * pad)) };
};

/** Fires one effect at the frozen clock's `start`; runs in the page. */
const fire = (name) =>
  page.evaluate(async (effect) => {
    const fx = await import('/src/setup/netcode/mat-fx/board-fx.js');
    const flow = await import('/src/setup/netcode/mat-fx/flow.js');
    const combat = await import('/src/setup/netcode/mat-fx/combat.js');
    const statusFx = await import('/src/setup/netcode/mat-fx/status.js');
    const prizeFx = await import('/src/setup/netcode/mat-fx/prize.js');
    const p = window.__boardFx;
    p.start = p.scene.clock.now();
    p.before = new Set(document.getAnimations());
    const run = {
      block: () => fx.block({ instanceId: 201 }),
      survived: () => fx.block({ instanceId: 201, survived: true }),
      'retreat-blocked': () => fx.retreatBlocked({ instanceId: 101 }),
      'attack-fail': () => fx.attackFail({ attackerId: 101, attackName: 'Fire Spin', cause: 'condition', user: 'self' }),
      heal: () => fx.playHeal(101),
      landing: () => fx.playLanding(102, { types: ['Water'] }),
      'prize-pulse': () => fx.prizePulse({ user: 'self' }),
      'power-gx': () => fx.playPowerFlare(101, 'gx'),
      'power-vstar': () => fx.playPowerFlare(101, 'vstar'),
      shuffle: () => p.scene.playShuffle('self', 'deck', { count: 40 }),
      'shuffle-opp': () => p.scene.playShuffle('opp', 'deck', { count: 40 }),
      'turn-banner': () => flow.turnBanner({ user: 'self', number: 3 }),
      'turn-banner-opp': () => flow.turnBanner({ user: 'opp', number: 4 }),
      'attack-banner': () => combat.attackBanner({ attackerId: 101, defenderId: 201, attackName: 'Fire Spin', user: 'self' }),
      'ability-tag': () => flow.abilityBanner({ instanceId: 101, name: 'Blaze', user: 'self' }),
      'status-clear': () => statusFx.statusClear({ instanceId: 201, condition: 'Poisoned' }),
      'prize-claim': () => prizeFx.prizeClaim({ user: 'self', count: 2 }),
      'game-over-win': () => flow.gameOver({ user: 'self' }),
      'game-over-loss': () => flow.gameOver({ user: 'opp' }),
      ...Object.fromEntries(
        ['Burned', 'Poisoned', 'Asleep', 'Paralyzed', 'Confused'].map((condition) => [`status-${condition.toLowerCase()}`, () => statusFx.status({ instanceId: 201, condition })])
      ),
    }[effect];
    run();
    // The effect's own DOM animations (a tag, a banner): paused, to be seeked with the scene clock.
    p.dom = document.getAnimations().filter((animation) => !p.before.has(animation) && animation !== p.clock);
    for (const animation of p.dom) animation.pause();
  }, name);

const seek = (ms) =>
  page.evaluate(async (t) => {
    const p = window.__boardFx;
    p.clock.currentTime = p.start + t;
    for (const animation of p.dom) animation.currentTime = t;
    p.scene.render();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, ms);

for (const name of wanted) {
  const shot = SHOTS[name];
  if (!shot) {
    console.log('unknown effect', name);
    continue;
  }
  await fire(name);
  for (const ms of shot.times) {
    await seek(ms);
    await page.screenshot({ path: `${OUT}/${name}-${String(ms).padStart(4, '0')}.png`, clip: clipFor(shot.crop) });
  }
  // Let the effect run out before the next one starts.
  await seek(3000);
  await page.evaluate(() => {
    for (const animation of window.__boardFx.dom) animation.finish?.();
  });
  console.log('shot', name, shot.times.join(','));
}
if (errors.length) console.log('errors', errors.slice(0, 8));
await browser.close();
