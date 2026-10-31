// vfx-design skill: the seven rubric frames of one move spec on a frozen scene clock (the parity
// renderer's method): rest · anticipation peak · travel · contact · contact + 120 ms · mid-dissipation
// · settle, each a PNG cropped to the two cards at 2× pixel density. SwiftShader draws about one
// frame a second, so a real-time recording holds too few states to judge; freezing the WAAPI scene
// clock and seeking it is the only way to see a chosen beat here.
// env: MOVE (spec id; default hydro-pump), SIGNATURE (signature spec id; overrides MOVE),
//      SIDE (self | opp: who attacks; opp = the far seat), SEED, IMPACT=1 (TCG Live impact at contact,
//      slow), BASE_URL (default http://localhost:4100), OUT (default .agent/scratch/vfx-frames/<move>[-opp]),
//      CHROMIUM / CHROMIUM_PATH, CARD_IMG / CARD_DIR (card art when images.pokemontcg.io is blocked),
//      SIO_JS (local socket.io.min.js when the CDN is).
// Pair with rec/seven-sheet.sh to label, tile and stack the frames under a reference row.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';

const { MOVE = 'hydro-pump', SIGNATURE, BASE_URL = 'http://localhost:4100', SEED = '7', IMPACT, SIDE = 'self', SIO_JS } = process.env;
const MOVE_ID = SIGNATURE || MOVE;
const OUT = process.env.OUT || `.agent/scratch/vfx-frames/${SIGNATURE ? `signature-${SIGNATURE}` : MOVE}${SIDE === 'opp' ? '-opp' : ''}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console ${m.text()}`));
if (SIO_JS) await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
await openBoard(page, BASE_URL);

const info = await page.evaluate(async ([side]) => {
  const { applyView, getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
  const { rectForInstance } = await import('/src/setup/image-logic/mat-fx.mjs');
  const card = (instanceId, name, src, types) => ({ instanceId, name, src, supertype: 'Pokémon', subtypes: ['Basic'], types, hp: '330', rarity: 'Double Rare' });
  applyView(
    {
      stateVersion: 99,
      you: { playerId: 'p1', zones: { active: [card(101, 'Charizard', 'https://images.pokemontcg.io/sv3pt5/6_hires.png', ['Fire'])], bench: [], hand: [] } },
      them: { playerId: 'p2', zones: { active: [card(201, 'Venusaur', 'https://images.pokemontcg.io/sv3pt5/3_hires.png', ['Grass'])], bench: [], hand: [] } },
    },
    [],
    {}
  );
  await new Promise((r) => setTimeout(r, 4000));
  const registry = getCardRegistry();
  const decode = (id) => registry.get(id)?.element?.decode?.().catch(() => undefined);
  await Promise.all([decode(101), decode(201)]);
  const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
  const scene = getBoardScene();
  const clock = scene.inspect().canvas.getAnimations()[0];
  clock.pause();
  window.__sevenFrames = { scene, clock, now: scene.clock.now(), attackerId: side === 'opp' ? 201 : 101, defenderId: side === 'opp' ? 101 : 201 };
  return { attacker: rectForInstance(101, registry), defender: rectForInstance(201, registry) };
}, [SIDE]);

// Crop: both cards plus a card height around them (where the effect lives).
const pad = Math.max(info.attacker.height, info.defender.height) * 1.05;
const left = Math.max(0, Math.min(info.attacker.left, info.defender.left) - pad);
const top = Math.max(0, Math.min(info.attacker.top, info.defender.top) - pad);
const right = Math.min(1280, Math.max(info.attacker.left + info.attacker.width, info.defender.left + info.defender.width) + pad);
const bottom = Math.min(800, Math.max(info.attacker.top + info.attacker.height, info.defender.top + info.defender.height) + pad);
const clip = { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };

const spec = await page.evaluate(
  async ([id, signature]) => {
    const { SPECS } = await import('/src/setup/netcode/mat-fx/moves/specs/index.mjs');
    const { SIGNATURE_SPECS } = await import('/src/setup/netcode/mat-fx/moves/signature/specs/index.mjs');
    const s = signature ? SIGNATURE_SPECS[id] : SPECS[id];
    return s ? { contactMs: s.contactMs, durationMs: s.durationMs } : null;
  },
  [MOVE_ID, Boolean(SIGNATURE)]
);
if (!spec) {
  console.log('no spec for', MOVE_ID);
  await browser.close();
  process.exit(1);
}
const c = spec.contactMs;
const d = spec.durationMs;
const beats = [
  ['1-rest', -50],
  ['2-anticipation', Math.round(0.55 * c)],
  ['3-travel', Math.max(1, c - 100)],
  ['4-contact', c],
  ['5-contact+120', c + 120],
  ['6-dissipation', Math.round((c + d) / 2)],
  ['7-settle', d + 300],
];

// The rest frame first, before the move exists on the scene.
await page.evaluate(() => {
  const p = window.__sevenFrames;
  p.start = p.now + 50;
  p.clock.currentTime = p.start - 50;
  p.scene.render();
});
await page.screenshot({ path: `${OUT}/${beats[0][0]}.png`, clip });

const played = await page.evaluate(
  async ([id, signature, seed, withImpact]) => {
    const { playMoveInScene } = await import('/src/setup/netcode/mat-fx/moves/scene-move-player.js');
    const { SPECS } = await import('/src/setup/netcode/mat-fx/moves/specs/index.mjs');
    const { SIGNATURE_SPECS } = await import('/src/setup/netcode/mat-fx/moves/signature/specs/index.mjs');
    const select = await import('/src/setup/netcode/mat-fx/impact/impact-select.mjs');
    const stage = await import('/src/setup/netcode/mat-fx/impact/impact-stage.js');
    const p = window.__sevenFrames;
    p.clock.currentTime = p.start;
    p.scene.render();
    const full = signature ? SIGNATURE_SPECS[id] : SPECS[id];
    // As the game plays it: the TCG Live impact of the type at contact (IMPACT=1), and the spec
    // without the contact dressing that impact replaces.
    const type = select.impactTypeFor(null, full.vgType);
    p.impactType = withImpact && (await stage.prepareImpact(type)) ? type : null;
    p.impact = null;
    p.contactMs = full.contactMs;
    p.stage = stage;
    const spec = select.withoutImpactBeats(full);
    return Boolean(playMoveInScene({ scene: p.scene, spec, attackerId: p.attackerId, defenderId: p.defenderId, seed: Number(seed) }));
  },
  [MOVE_ID, Boolean(SIGNATURE), SEED, Boolean(IMPACT)]
);
if (!played) {
  console.log('FAILED to play', MOVE_ID);
  await browser.close();
  process.exit(1);
}
for (const [name, ms] of beats.slice(1)) {
  await page.evaluate((t) => {
    const p = window.__sevenFrames;
    p.clock.currentTime = p.start + t;
    if (p.impactType && !p.impact && t >= p.contactMs) {
      p.impact = p.stage.playImpact({ type: p.impactType, variant: 'Medium', cardId: p.defenderId, seed: 3 });
      p.impact?.clock.pause();
    }
    if (p.impact) p.impact.clock.currentTime = t - p.contactMs;
    p.scene.render();
  }, ms);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip });
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ move: MOVE_ID, side: SIDE, impact: Boolean(IMPACT), spec, beats, clip, rects: info, errors }, null, 1));
console.log('wrote', OUT, JSON.stringify({ beats: beats.map(([n, ms]) => `${n}@${ms}`), clip }));
if (errors.length) console.log('errors', errors.slice(0, 6));
await browser.close();
