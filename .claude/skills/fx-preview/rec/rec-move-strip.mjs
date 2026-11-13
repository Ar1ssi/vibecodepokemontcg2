// Design 089: a quick strip of many moves on one page, each frozen at a few scene times — what
// seven-frames.mjs does for one move at 2× density, done at 1× for a whole list, to compare how
// moves differ (card motion, contact style, aftermath) rather than to score one.
// usage: PORT=4100 pnpm start, then
//   MOVES=flamethrower,thunder,hydro-pump node .claude/skills/fx-preview/rec/rec-move-strip.mjs
// env: MOVES (spec ids; `sig:<id>` for a signature spec) · TIMES (ms after the scene starts; the
//      default is by each spec: wind-up, travel, contact + 60, + 250, + 500, + 800) · SIDE (self | opp)
//      · IMPACT=0 keeps the spec's own contact dressing (default: stripped, as in a game the TCG
//      Live impact replaces it; the impact itself is not drawn here) · BASE_URL · OUT
//      (default .agent/scratch/move-strip) · DPR (device pixel ratio, default 1; 2 to read detail)
//      · CHROMIUM / CHROMIUM_PATH · SIO_JS · CARD_IMG / CARD_DIR
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { launchOptions, openBoard } from '../board-mode.mjs';

const {
  MOVES = 'flamethrower,thunder,hydro-pump',
  TIMES = '',
  SIDE = 'self',
  IMPACT = '1',
  BASE_URL = 'http://localhost:4100',
  OUT = '.agent/scratch/move-strip',
  DPR = '1',
  SIO_JS,
} = process.env;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: Number(DPR) || 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
if (SIO_JS) await page.route('https://cdn.socket.io/**', (r) => r.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
await openBoard(page, BASE_URL);

const rects = await page.evaluate(async ([side]) => {
  const { applyView, getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
  const { rectForInstance } = await import('/src/setup/image-logic/mat-fx.mjs');
  const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
  const face = (label, hue) => {
    const c = document.createElement('canvas');
    c.width = 245;
    c.height = 342;
    const g = c.getContext('2d');
    g.fillStyle = `hsl(${hue} 45% 30%)`;
    g.fillRect(0, 0, 245, 342);
    g.fillStyle = `hsl(${hue} 50% 62%)`;
    g.fillRect(16, 40, 213, 140);
    g.fillStyle = '#d9d4c4';
    g.fillRect(16, 196, 213, 126);
    g.fillStyle = '#111';
    g.font = 'bold 22px sans-serif';
    g.fillText(label, 18, 30);
    return c.toDataURL('image/png');
  };
  const card = (instanceId, name, hue) => ({ instanceId, name, src: face(name, hue), supertype: 'Pokémon', subtypes: ['Basic'], types: ['Colorless'], hp: '200' });
  applyView(
    {
      stateVersion: 99,
      you: { playerId: 'p1', zones: { active: [card(101, 'Attacker', 22)], bench: [], hand: [] } },
      them: { playerId: 'p2', zones: { active: [card(201, 'Defender', 205)], bench: [], hand: [] } },
    },
    [],
    {}
  );
  await new Promise((r) => setTimeout(r, 2500));
  const scene = getBoardScene();
  const clock = scene.inspect().canvas.getAnimations()[0];
  clock.pause();
  window.__strip = { scene, clock, attackerId: side === 'opp' ? 201 : 101, defenderId: side === 'opp' ? 101 : 201 };
  const registry = getCardRegistry();
  return { attacker: rectForInstance(101, registry), defender: rectForInstance(201, registry) };
}, [SIDE]);

const pad = Math.max(rects.attacker.height, rects.defender.height) * 0.9;
const left = Math.max(0, Math.min(rects.attacker.left, rects.defender.left) - pad);
const top = Math.max(0, Math.min(rects.attacker.top, rects.defender.top) - pad * 0.75);
const right = Math.min(1280, Math.max(rects.attacker.left + rects.attacker.width, rects.defender.left + rects.defender.width) + pad);
const bottom = Math.min(800, Math.max(rects.attacker.top + rects.attacker.height, rects.defender.top + rects.defender.height) + pad * 0.75);
const clip = { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };

for (const entry of MOVES.split(',').map((name) => name.trim()).filter(Boolean)) {
  const signature = entry.startsWith('sig:');
  const id = signature ? entry.slice(4) : entry;
  const spec = await page.evaluate(
    async ([moveId, isSignature, stripImpact]) => {
      const { playMoveInScene } = await import('/src/setup/netcode/mat-fx/moves/scene-move-player.js');
      const { SPECS } = await import('/src/setup/netcode/mat-fx/moves/specs/index.mjs');
      const { SIGNATURE_SPECS } = await import('/src/setup/netcode/mat-fx/moves/signature/specs/index.mjs');
      const { withoutImpactBeats } = await import('/src/setup/netcode/mat-fx/impact/impact-select.mjs');
      const p = window.__strip;
      const full = isSignature ? SIGNATURE_SPECS[moveId] : SPECS[moveId];
      if (!full) return null;
      // Let the last move's drives and entry run out before this one starts.
      p.clock.currentTime = (p.clock.currentTime ?? 0) + 6000;
      p.scene.render();
      p.start = p.scene.clock.now();
      const played = playMoveInScene({ scene: p.scene, spec: stripImpact ? withoutImpactBeats(full) : full, attackerId: p.attackerId, defenderId: p.defenderId, seed: 7 });
      return played ? { contactMs: full.contactMs, durationMs: played.durationMs, attacker: full.attacker.motion, defender: full.defender.motion, material: full.material, tier: full.tier } : null;
    },
    [id, signature, IMPACT !== '0']
  );
  if (!spec) {
    console.log('no spec / could not play', entry);
    continue;
  }
  const c = spec.contactMs;
  const times = TIMES ? TIMES.split(',').map(Number) : [Math.round(0.5 * c), Math.round(0.85 * c), c + 60, c + 250, c + 500, c + 800];
  for (const ms of times) {
    await page.evaluate(async (t) => {
      const p = window.__strip;
      p.clock.currentTime = p.start + t;
      p.scene.render();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, ms);
    await page.screenshot({ path: `${OUT}/${id}-${String(ms).padStart(4, '0')}.png`, clip });
  }
  console.log('shot', entry, JSON.stringify(spec), times.join(','));
}
if (errors.length) console.log('errors', errors.slice(0, 6));
await browser.close();
