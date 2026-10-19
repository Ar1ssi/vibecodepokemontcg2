// Parity: one board boot, then every move in moves.json (slice SHARD/SHARDS) played back to back on
// a frozen clock; 8 stills per move across its scene → ours/<id>-<k>.png (cropped to the two cards).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';
// Outputs (videos, stills, sheets) go to the gitignored parity work dir.
const here = process.env.PARITY_DIR || new URL('../../../../.agent/scratch/075/parity/', import.meta.url).pathname;
const { SHARD = '0', SHARDS = '1', ONLY } = process.env;
mkdirSync(`${here}ours`, { recursive: true });
let rows = JSON.parse(readFileSync(`${here}moves.json`, 'utf8')).filter((_, i) => i % Number(SHARDS) === Number(SHARD));
if (ONLY) rows = rows.filter((r) => ONLY.split(',').includes(r.id));
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await openBoard(page, process.env.BASE_URL || 'http://localhost:4100');
await page.evaluate(async () => {
  const { applyView } = await import('/src/setup/netcode/apply-view.js');
  const card = (instanceId, name, src, types) => ({ instanceId, name, src, supertype: 'Pokémon', subtypes: ['Basic'], types, hp: '330' });
  applyView({ stateVersion: 99, you: { playerId: 'p1', zones: { active: [card(101, 'Charizard', 'https://images.pokemontcg.io/sv3pt5/6_hires.png', ['Fire'])], bench: [], hand: [] } },
    them: { playerId: 'p2', zones: { active: [card(201, 'Venusaur', 'https://images.pokemontcg.io/sv3pt5/3_hires.png', ['Grass'])], bench: [], hand: [] } } }, [], {});
  await new Promise((r) => setTimeout(r, 4000));
  const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
  const scene = getBoardScene();
  const clock = scene.inspect().canvas.getAnimations()[0];
  clock.pause();
  window.__parity = { scene, clock, now: scene.clock.now() };
});
await page.evaluate((on) => { window.__withImpact = on; }, Boolean(process.env.IMPACT));
for (const row of rows) {
  const times = Array.from({ length: 8 }, (_, k) => Math.round(((k + 0.5) / 8) * (row.durationMs + 200)));
  if (times.every((_, k) => existsSync(`${here}ours/${row.id}-${k}.png`))) continue;
  const ok = await page.evaluate(async ([id, sig]) => {
    const { playMoveInScene } = await import('/src/setup/netcode/mat-fx/moves/scene-move-player.js');
    const { SPECS } = await import('/src/setup/netcode/mat-fx/moves/specs/index.mjs');
    const { SIGNATURE_SPECS } = await import('/src/setup/netcode/mat-fx/moves/signature/specs/index.mjs');
    const select = await import('/src/setup/netcode/mat-fx/impact/impact-select.mjs');
    const stage = await import('/src/setup/netcode/mat-fx/impact/impact-stage.js');
    const p = window.__parity;
    p.start = p.now + 50;
    p.clock.currentTime = p.start;
    p.scene.render();
    // As the game plays it: the TCG Live impact of the move's type at contact, and the spec
    // without the contact dressing that impact replaces.
    const full = sig ? SIGNATURE_SPECS[id] : SPECS[id];
    const type = select.impactTypeFor(null, full.vgType);
    // The impact itself is TCG Live's asset (the same for every move of a type) and very slow under
    // SwiftShader: render the in-game spec only (IMPACT=1 adds the impact).
    p.impactType = window.__withImpact && (await stage.prepareImpact(type)) ? type : null;
    p.impact = null;
    p.contactMs = full.contactMs;
    p.stage = stage;
    const spec = select.withoutImpactBeats(full);
    return Boolean(playMoveInScene({ scene: p.scene, spec, attackerId: 101, defenderId: 201, seed: 7 }));
  }, [row.id, row.sig]);
  if (!ok) { console.log('FAILED', row.id); continue; }
  for (const [k, ms] of times.entries()) {
    await page.evaluate((t) => {
      const p = window.__parity;
      p.clock.currentTime = p.start + t;
      if (p.impactType && !p.impact && t >= p.contactMs) {
        p.impact = p.stage.playImpact({ type: p.impactType, variant: 'Medium', cardId: 201, seed: 3 });
        p.impact?.clock.pause();
      }
      if (p.impact) p.impact.clock.currentTime = t - p.contactMs;
      p.scene.render();
    }, ms);
    await page.screenshot({ path: `${here}ours/${row.id}-${k}.png`, clip: { x: 300, y: 120, width: 400, height: 560 } });
  }
  await page.evaluate((end) => {
    const p = window.__parity;
    p.impact?.clock.finish();
    p.now = p.start + end;
    p.clock.currentTime = p.now;
    p.scene.render();
  }, row.durationMs + 3000);
  console.log('done', row.id);
}
console.log('errors', errors.slice(0, 3));
await browser.close();
