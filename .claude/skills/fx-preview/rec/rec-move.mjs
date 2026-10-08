// Design 063: record any move spec as a real attack reads — name banner and target ring,
// the move scene, and the damage number / hit flash / table shake landing on its contact
// moment through the impact queue. Both cards are pushed through the real applyView so the
// registry resolves them exactly as in a game.
// env: MOVE (a spec id from specs/index.mjs, or 'kitchen-sink'; default fire-blast),
//      SIGNATURE (design 065: a signature spec id from signature/specs/index.mjs; overrides MOVE),
//      SIDE (self = your Active attacks, opp = the opponent's does; default self),
//      BASE_URL (default http://localhost:4100), CHROMIUM, OUT (default .agent/scratch/moves/<MOVE>),
//      SIO_JS (local socket.io.min.js when cdn.socket.io is unreachable), SEED,
//      CARD_DIR (a folder holding 6_hires.png and 3_hires.png when the browser cannot reach images.pokemontcg.io)
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const {
  BASE_URL = 'http://localhost:4100',
  CHROMIUM,
  MOVE = 'fire-blast',
  SIDE = 'self',
  SIO_JS,
  SEED = '7',
  CARD_DIR,
  SIGNATURE,
} = process.env;
const MOVE_ID = SIGNATURE || MOVE;
const OUT = process.env.OUT || `.agent/scratch/moves/${SIGNATURE ? `signature-${SIGNATURE}` : MOVE}`;
const ATTACKER = 'https://images.pokemontcg.io/sv3pt5/6_hires.png';
const DEFENDER = 'https://images.pokemontcg.io/sv3pt5/3_hires.png';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(
  CHROMIUM ? { executablePath: CHROMIUM } : {}
);
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: {
    dir: path.join(OUT, 'vid'),
    size: { width: 1600, height: 900 },
  },
});
const videoStart = Date.now();
const page = await ctx.newPage();
if (SIO_JS) {
  await page.route('https://cdn.socket.io/**', (r) =>
    r.fulfill({ path: SIO_JS, contentType: 'application/javascript' })
  );
}
await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
if (CARD_DIR) {
  await page.route('https://images.pokemontcg.io/**', (r) =>
    r.fulfill({
      path: path.join(
        CARD_DIR,
        path.basename(new URL(r.request().url()).pathname)
      ),
      contentType: 'image/png',
    })
  );
}
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on(
  'console',
  (m) => m.type() === 'error' && console.log('console', m.text())
);
await page.goto(`${BASE_URL}/?e2e=1`);
await page.waitForFunction(() => window.__ptcg?.ready === true, null, {
  timeout: 30000,
});
await page.waitForTimeout(800);

const info = await page.evaluate(
  async ([attackerSrc, defenderSrc, seed, moveId, side, signature]) => {
    const { applyView, getCardRegistry } =
      await import('/src/setup/netcode/apply-view.js');
    const { rectForInstance } =
      await import('/src/setup/image-logic/mat-fx.mjs');
    const { attackBanner, announceStrike, damage } =
      await import('/src/setup/netcode/mat-fx/combat.js');
    const { playMove } =
      await import('/src/setup/netcode/mat-fx/moves/move-player.js');
    const { SPECS } = await import('/src/setup/netcode/mat-fx/moves/specs/index.mjs');
    const { kitchenSink } =
      await import('/src/setup/netcode/mat-fx/moves/specs/__fixtures__/kitchen-sink.mjs');
    const { SIGNATURE_SPECS } =
      await import('/src/setup/netcode/mat-fx/moves/signature/specs/index.mjs');
    const spec = signature ? SIGNATURE_SPECS[moveId] : moveId === 'kitchen-sink' ? kitchenSink : SPECS[moveId];
    if (!spec) throw new Error(`no spec for ${signature ? 'SIGNATURE' : 'MOVE'}=${moveId}`);
    const { frameTurnOf } =
      await import('/src/setup/netcode/mat-fx/evolve-scene.js');
    const { holdFor } = await import('/src/setup/netcode/mat-fx/fx-holds.mjs');
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
          zones: {
            active: [
              card(
                101,
                'Charizard ex',
                attackerSrc,
                ['Fire'],
                ['Stage 2', 'ex'],
                '330'
              ),
            ],
            bench: [],
            hand: [],
          },
        },
        them: {
          playerId: 'p2',
          zones: {
            active: [
              card(
                201,
                'Venusaur ex',
                defenderSrc,
                ['Grass'],
                ['Stage 2', 'ex'],
                '340'
              ),
            ],
            bench: [],
            hand: [],
          },
        },
      },
      [],
      {}
    );
    await new Promise((r) => setTimeout(r, 900));
    // SIDE=opp swaps who attacks: 201 (the opponent's Active) hits 101.
    const attackerId = side === 'opp' ? 201 : 101;
    const defenderId = side === 'opp' ? 101 : 201;
    const registry = getCardRegistry();
    const decode = (id) =>
      registry
        .get(id)
        ?.element?.decode?.()
        .catch(() => undefined);
    await Promise.all([decode(101), decode(201)]);
    const from = rectForInstance(attackerId, registry);
    const to = rectForInstance(defenderId, registry);
    window.__move = {
      banner: () =>
        attackBanner({
          attackerId,
          defenderId,
          attackName: spec.name,
          user: side === 'opp' ? 'opp' : 'self',
        }),
      move: () => {
        const partyOf = (id) => {
          const element = registry.get(id)?.element || null;
          return {
            rect: rectForInstance(id, registry),
            src: element?.currentSrc || element?.src,
            turn: frameTurnOf(element),
            element,
          };
        };
        // Frame-time probe: the scene is judged on pacing, so a slow frame matters.
        const deltas = [];
        let last = performance.now();
        const probe = () => {
          const now = performance.now();
          deltas.push(now - last);
          last = now;
          if (deltas.length < 140) requestAnimationFrame(probe);
        };
        requestAnimationFrame(probe);
        window.__frameDeltas = deltas;
        const played = playMove({
          spec,
          attacker: partyOf(attackerId),
          defender: partyOf(defenderId),
          seed: Number(seed),
          impacts: { strikeIn: announceStrike },
          attackerCard: registry.get(attackerId)?.card || null,
        });
        damage({ instanceId: defenderId, damage: 180, dealt: 180, weakness: true });
        return played;
      },
    };
    return { from, to, bannerHoldMs: holdFor('attack-banner') };
  },
  [ATTACKER, DEFENDER, SEED, MOVE_ID, SIDE, Boolean(SIGNATURE)]
);
console.log(JSON.stringify(info));
await page.waitForTimeout(700);
const bannerAt = Date.now() - videoStart;
await page.evaluate(() => window.__move.banner());
await page.waitForTimeout(info.bannerHoldMs);
const moveAt = Date.now() - videoStart;
const played = await page.evaluate(() => window.__move.move());
console.log('played', JSON.stringify(played));
// Video time (ms) of the banner and the move, for cutting sheets and clips.
writeFileSync(
  path.join(OUT, 'rects.json'),
  JSON.stringify({ ...info, bannerAt, moveAt })
);
await page.waitForTimeout((played?.durationMs ?? 1900) + 1400);
const deltas = await page.evaluate(() =>
  window.__frameDeltas.slice(1).sort((a, b) => a - b)
);
console.log(
  'frame ms: median',
  deltas[Math.floor(deltas.length / 2)]?.toFixed(1),
  'p95',
  deltas[Math.floor(deltas.length * 0.95)]?.toFixed(1),
  'max',
  deltas.at(-1)?.toFixed(1)
);
const video = page.video();
await ctx.close();
const target = path.join(OUT, `${MOVE_ID}.webm`);
renameSync(await video.path(), target);
await browser.close();
console.log('wrote', target);
