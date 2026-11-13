// Design 089: attack sequencing and card visibility on the three.js board, through the real client
// pipeline. Each scenario pushes server-shaped views and events through applyView with the
// production advisory hooks (board-mode.mjs `pushView`), then samples the scene while the FX queue
// plays: where each card's mesh is, whether it is drawn, which banners are up.
//   A  an attack Knocks Out the defender in a batch with no card-move event: the defender's mesh
//      stays whole in its slot through the banner and the scene (it used to vanish at once)
//   B  damage, then a self-switch in the same batch: the attacker is still Active while its banner
//      shows, and slides to the Bench afterwards
//   C  an attack suspended on its Bench choice: the banner plays with the first batch; the batch
//      that resumes it (cardSwitched + attackExecuted) slides the cards and shows no second banner
//   D  a discard from the hand flies as a ghost mesh (no HTML clone over the board)
//   E  a hand card put into the deck keeps its mesh and flies there; F  the Prize cards wait hidden
//      and are dealt off the deck; G  the deck riffle-shuffles with its own card layers
// Spawns its own server (e2e bridge armed) on a free port.
// Usage: node scripts/e2e/fx-sequence-test.mjs   (PTCG_URL=http://host:port reuses a running server;
//        CHROMIUM_PATH picks the browser; SHOTS=<dir> also writes a screenshot per sample)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchOptions, openBoard } from '../../.claude/skills/fx-preview/board-mode.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { SHOTS = '' } = process.env;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function startServer() {
  if (process.env.PTCG_URL) return { base: process.env.PTCG_URL.replace(/\/$/, ''), child: null };
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PTCG_E2E: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      const res = await fetch(base);
      if (res.ok) return { base, child };
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill('SIGKILL');
  throw new Error(`server did not start on ${base}:\n${output}`);
}

/** Page side: card faces, the board states and the sampler. */
function installScenarioHelpers() {
  const face = (label, hue) => {
    const c = document.createElement('canvas');
    c.width = 245;
    c.height = 342;
    const g = c.getContext('2d');
    g.fillStyle = `hsl(${hue} 70% 45%)`;
    g.fillRect(0, 0, 245, 342);
    g.fillStyle = '#fff';
    g.fillRect(14, 14, 217, 150);
    g.fillStyle = '#111';
    g.font = 'bold 26px sans-serif';
    g.fillText(label, 20, 200);
    return c.toDataURL('image/png');
  };
  const pokemon = (instanceId, name, hue, extra = {}) => ({
    instanceId,
    name,
    src: face(name, hue),
    supertype: 'Pokémon',
    subtypes: ['Basic'],
    types: ['Fire'],
    hp: '120',
    ...extra,
  });
  const cards = {
    attacker: pokemon(1, 'Attacker', 10),
    ownBench: pokemon(2, 'Own Bench', 40),
    defender: pokemon(20, 'Defender', 200),
    oppBench: pokemon(21, 'Opp Bench', 260),
    handCard: pokemon(5, 'Hand Card', 120),
  };
  const centre = (rect) => (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null);
  const near = (a, b, tol = 14) => Boolean(a && b) && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

  window.__seq = {
    cards,
    async scene() {
      const { getBoardScene } = await import('/src/setup/board3d/board3d.js');
      return getBoardScene();
    },
    /** Pushes a board; `self` / `opp` are zone maps of the cards above. */
    push(self, opp, events = []) {
      return window.__fxBoard.pushView({ self, opp }, events);
    },
    /** What the scene shows for card `id` now. */
    async look(id) {
      const scene = await window.__seq.scene();
      const pool = scene.inspect().cards;
      const mesh = pool.meshOf(id);
      return {
        mesh: Boolean(mesh),
        visible: Boolean(mesh?.visible),
        pinned: pool.pinned(id),
        at: centre(scene.rects()[id]),
      };
    },
    async zoneCentre(side, zone) {
      return centre(await window.__fxBoard.zoneRect(side, zone));
    },
    async pileCentre(side, zone) {
      const scene = await window.__seq.scene();
      return centre(scene.rects()[`pile:${side}:${zone}`]);
    },
    near,
    banners: () => [...document.querySelectorAll('.fx-banner')].map((el) => el.textContent.trim()).filter(Boolean),
    htmlFlights: () => document.querySelectorAll('.fx-card-flight__card').length,
    async ghosts() {
      const scene = await window.__seq.scene();
      return scene
        .inspect()
        .cards.ids()
        .filter((id) => typeof id === 'number' && id < 0).length;
    },
    async idle() {
      const { whenFxQueueIdle } = await import('/src/setup/netcode/advisory-animations.js');
      await whenFxQueueIdle();
    },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const near = (a, b, tol = 14) => Boolean(a && b) && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

/** Samples `probe()` in the page every `everyMs` until `ms` has passed; returns the samples with their time. */
async function sample(page, probe, { ms, everyMs = 150, label = '' }) {
  const samples = [];
  const start = Date.now();
  let index = 0;
  while (Date.now() - start < ms) {
    const t = Date.now() - start;
    samples.push({ t, ...(await page.evaluate(probe)) });
    if (SHOTS && label) await page.screenshot({ path: path.join(SHOTS, `${label}-${String(index).padStart(2, '0')}.png`) });
    index += 1;
    await wait(everyMs);
  }
  return samples;
}

async function main() {
  const { base, child } = await startServer();
  const browser = await chromium.launch(launchOptions());
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
    await openBoard(page, base);
    await page.evaluate(installScenarioHelpers);

    // ── A: knockout in a batch with no card-move event ─────────────────────────────────────────
    await page.evaluate(() => {
      const { attacker, ownBench, defender, oppBench } = window.__seq.cards;
      return window.__seq.push({ active: [attacker], bench: [ownBench] }, { active: [defender], bench: [oppBench] });
    });
    await wait(1200);
    const slotA = await page.evaluate(() => window.__seq.zoneCentre('opp', 'active'));
    const before = await page.evaluate(() => window.__seq.look(20));
    T('A0: the defender stands in the opponent Active Spot', before.mesh && before.visible, JSON.stringify(before));
    await page.evaluate(() => {
      const { attacker, ownBench, defender, oppBench } = window.__seq.cards;
      return window.__seq.push(
        { active: [attacker], bench: [ownBench] },
        { active: [], bench: [oppBench], discard: [{ ...defender, damage: 120 }] },
        [
          { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Flame Burst' },
          { type: 'damageUpdated', instanceId: 20, damage: 120, dealt: 120 },
          { type: 'pokemonKnockedOut', instanceId: 20, playerId: 'p2' },
          { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 20, attackName: 'Flame Burst', damage: 120 },
        ]
      );
    });
    const seenA = await sample(
      page,
      async () => ({ card: await window.__seq.look(20), banners: window.__seq.banners() }),
      { ms: 2200, label: 'a' }
    );
    const pinnedA = seenA.filter((s) => s.card.pinned);
    T('A1: the knocked-out defender is pinned while its attack plays', pinnedA.length >= 3, `${pinnedA.length}/${seenA.length} samples`);
    T(
      'A2: while pinned its mesh is drawn, in its slot (it used to vanish with the view)',
      pinnedA.length > 0 && pinnedA.every((s) => s.card.mesh && s.card.visible && Math.abs(s.card.at.x - slotA.x) < 30 && Math.abs(s.card.at.y - slotA.y) < 30),
      JSON.stringify(pinnedA.find((s) => !(s.card.mesh && s.card.visible)) ?? pinnedA[0]?.card)
    );
    T('A3: the attack banner shows while the defender still stands', seenA.some((s) => s.banners.length > 0 && s.card.pinned));
    await page.evaluate(() => window.__seq.idle());
    await wait(2600);
    const afterA = await page.evaluate(async () => ({ card: await window.__seq.look(20), pile: await window.__seq.pileCentre('opp', 'discard') }));
    T('A4: after its scene the card lies on the discard pile, unpinned', afterA.card.mesh && !afterA.card.pinned && Math.abs(afterA.card.at.x - afterA.pile.x) < 30, JSON.stringify(afterA));

    // ── B: damage, then a self-switch in the same batch ────────────────────────────────────────
    await page.evaluate(() => {
      const { attacker, ownBench, defender, oppBench } = window.__seq.cards;
      return window.__seq.push({ active: [attacker], bench: [ownBench] }, { active: [oppBench], bench: [], discard: [defender] });
    });
    await wait(1200);
    const spots = await page.evaluate(async () => ({ active: await window.__seq.zoneCentre('self', 'active'), attacker: (await window.__seq.look(1)).at, bench: (await window.__seq.look(2)).at }));
    await page.evaluate(() => {
      const { attacker, ownBench, defender, oppBench } = window.__seq.cards;
      return window.__seq.push(
        { active: [ownBench], bench: [attacker] },
        { active: [{ ...oppBench, damage: 30 }], bench: [], discard: [defender] },
        [
          { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 21, attackName: 'U-turn' },
          { type: 'damageUpdated', instanceId: 21, damage: 30, dealt: 30 },
          { type: 'cardSwitched', playerId: 'p1', activeId: 1, benchId: 2 },
          { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 21, attackName: 'U-turn', damage: 30 },
        ]
      );
    });
    const seenB = await sample(page, async () => ({ card: await window.__seq.look(1), banners: window.__seq.banners() }), { ms: 2200, label: 'b' });
    const withBanner = seenB.filter((s) => s.banners.some((text) => text.includes('U-turn')));
    T('B1: the attack banner shows', withBanner.length > 0, `${withBanner.length} samples`);
    T(
      'B2: while it shows, the attacker is still in the Active Spot (it used to attack from the Bench)',
      withBanner.length > 0 && withBanner.every((s) => Math.abs(s.card.at.x - spots.attacker.x) < 14 && Math.abs(s.card.at.y - spots.attacker.y) < 14),
      JSON.stringify({ was: spots.attacker, seen: withBanner[0]?.card.at })
    );
    await page.evaluate(() => window.__seq.idle());
    await wait(1500);
    const afterB = await page.evaluate(async () => ({ attacker: await window.__seq.look(1), incoming: await window.__seq.look(2) }));
    T('B3: afterwards the attacker rests where the Benched card was', Math.abs(afterB.attacker.at.x - spots.bench.x) < 30 && Math.abs(afterB.attacker.at.y - spots.bench.y) < 30 && !afterB.attacker.pinned, JSON.stringify({ at: afterB.attacker.at, bench: spots.bench }));
    T('B4: and the Benched card is Active', Math.abs(afterB.incoming.at.x - spots.attacker.x) < 30 && Math.abs(afterB.incoming.at.y - spots.attacker.y) < 30, JSON.stringify({ at: afterB.incoming.at, active: spots.attacker }));

    // ── C: an attack suspended on its Bench choice ─────────────────────────────────────────────
    await page.evaluate(() => {
      const { attacker, ownBench, oppBench } = window.__seq.cards;
      return window.__seq.push({ active: [attacker], bench: [ownBench] }, { active: [{ ...oppBench, damage: 30 }], bench: [] });
    });
    await wait(1200);
    await page.evaluate(() => {
      const { attacker, ownBench, oppBench } = window.__seq.cards;
      return window.__seq.push({ active: [attacker], bench: [ownBench] }, { active: [{ ...oppBench, damage: 60 }], bench: [] }, [
        { type: 'attackStarted', playerId: 'p1', attackerId: 1, defenderId: 21, attackName: 'Hit and Run' },
        { type: 'damageUpdated', instanceId: 21, damage: 60, dealt: 30 },
      ]);
    });
    const seenC1 = await sample(page, async () => ({ banners: window.__seq.banners() }), { ms: 1600, label: 'c1' });
    T('C1: the suspended attack shows its banner with the first batch', seenC1.some((s) => s.banners.some((text) => text.includes('Hit and Run'))));
    await page.evaluate(() => window.__seq.idle());
    await wait(800);
    await page.evaluate(() => {
      const { attacker, ownBench, oppBench } = window.__seq.cards;
      return window.__seq.push({ active: [ownBench], bench: [attacker] }, { active: [{ ...oppBench, damage: 60 }], bench: [] }, [
        { type: 'cardSwitched', playerId: 'p1', activeId: 1, benchId: 2 },
        { type: 'attackExecuted', playerId: 'p1', attackerId: 1, defenderId: 21, attackName: 'Hit and Run', damage: 30 },
      ]);
    });
    const seenC2 = await sample(page, async () => ({ banners: window.__seq.banners(), card: await window.__seq.look(1) }), { ms: 1800, label: 'c2' });
    T('C2: the batch that resumes it shows no second attack banner', seenC2.every((s) => !s.banners.some((text) => text.includes('Hit and Run'))), JSON.stringify(seenC2.find((s) => s.banners.length > 0)?.banners ?? []));
    await page.evaluate(() => window.__seq.idle());
    await wait(1500);
    const afterC = await page.evaluate(() => window.__seq.look(1));
    T('C3: and the attacker ends on the Bench, unpinned and drawn', afterC.mesh && afterC.visible && !afterC.pinned, JSON.stringify(afterC));

    // ── D: a discard from the hand flies as a ghost mesh ───────────────────────────────────────
    await page.evaluate(() => {
      const { attacker, ownBench, oppBench, handCard } = window.__seq.cards;
      return window.__seq.push({ active: [ownBench], bench: [attacker], hand: [handCard] }, { active: [oppBench], bench: [] });
    });
    await wait(1200);
    await page.evaluate(() => {
      const { attacker, ownBench, oppBench, handCard } = window.__seq.cards;
      return window.__seq.push({ active: [ownBench], bench: [attacker], hand: [], discard: [handCard] }, { active: [oppBench], bench: [] }, [
        { type: 'cardsDiscarded', playerId: 'p1', cards: [{ instanceId: 5 }] },
      ]);
    });
    const seenD = await sample(page, async () => ({ ghosts: await window.__seq.ghosts(), html: window.__seq.htmlFlights() }), { ms: 1400, everyMs: 80, label: 'd' });
    T('D1: the discarded card flies on a ghost mesh', seenD.some((s) => s.ghosts > 0), JSON.stringify(seenD.map((s) => s.ghosts)));
    T('D2: no HTML clone is laid over the board', seenD.every((s) => s.html === 0));
    await wait(1500);
    const leftD = await page.evaluate(() => window.__seq.ghosts());
    T('D3: the ghost is gone once it has landed', leftD === 0, `${leftD} left`);

    // ── E: a hand card put into the deck flies there on its own mesh ───────────────────────────
    await page.evaluate(() => {
      const { attacker, ownBench, oppBench, handCard } = window.__seq.cards;
      return window.__seq.push({ active: [ownBench], bench: [attacker], hand: [handCard], deck: 30 }, { active: [oppBench], bench: [] });
    });
    await wait(1200);
    const handSpot = await page.evaluate(async () => (await window.__seq.look(5)).at);
    await page.evaluate(() => {
      const { attacker, ownBench, oppBench } = window.__seq.cards;
      return window.__seq.push({ active: [ownBench], bench: [attacker], hand: [], deck: 31 }, { active: [oppBench], bench: [] }, [
        { type: 'cardMoved', playerId: 'p1', instanceId: 5, from: 'hand', to: 'deck' },
      ]);
    });
    const seenE = await sample(page, async () => ({ card: await window.__seq.look(5), deck: await window.__seq.pileCentre('self', 'deck') }), { ms: 1500, everyMs: 80, label: 'e' });
    const meshE = seenE.filter((s) => s.card.mesh);
    T('E1: the card the view dropped keeps its mesh for the flight', meshE.length > 0 && meshE.every((s) => s.card.visible), `${meshE.length}/${seenE.length} samples with a mesh`);
    T('E2: it starts where it was in the hand', near(seenE[0]?.card.at, handSpot, 40), JSON.stringify({ first: seenE[0]?.card.at, hand: handSpot }));
    await wait(1200);
    const afterE = await page.evaluate(() => window.__seq.look(5));
    T('E3: and is gone once it is in the deck', !afterE.mesh, JSON.stringify(afterE));

    // ── F: the Prize cards are dealt off the deck ──────────────────────────────────────────────
    const prizeIds = [301, 302, 303, 304, 305, 306];
    await page.evaluate((ids) => {
      const { attacker, ownBench, oppBench } = window.__seq.cards;
      return window.__seq.push({ active: [ownBench], bench: [attacker], hand: [], deck: 25, prizes: ids.map((instanceId) => ({ instanceId })) }, { active: [oppBench], bench: [] }, [
        { type: 'prizesSet', playerId: 'p1', count: ids.length },
      ]);
    }, prizeIds);
    const seenF = await sample(
      page,
      async () => ({ cards: await Promise.all([301, 302, 303, 304, 305, 306].map((id) => window.__seq.look(id))) }),
      { ms: 1600, everyMs: 80, label: 'f' }
    );
    T('F1: the Prize cards do not all show at once (they wait hidden for their deal)', seenF.some((s) => s.cards.some((card) => card.mesh && !card.visible)), JSON.stringify(seenF[0]?.cards.map((card) => card.visible)));
    await page.evaluate(() => window.__seq.idle());
    await wait(1800);
    const afterF = await page.evaluate(async (ids) => Promise.all(ids.map((id) => window.__seq.look(id))), prizeIds);
    T('F2: after the deal every Prize card lies shown in its slot', afterF.every((card) => card.mesh && card.visible), JSON.stringify(afterF.map((card) => card.visible)));

    // ── G: the deck's riffle shuffle ───────────────────────────────────────────────────────────
    const shuffle = await page.evaluate(async () => {
      const scene = await window.__seq.scene();
      const before = scene.inspect().piles.meshCount();
      const ms = scene.playShuffle('self', 'deck', { count: 25 });
      return { before, ms, during: scene.inspect().piles.meshCount() };
    });
    T('G1: a deck of 25 shuffles for a while with its own cards', shuffle.ms > 1000 && shuffle.during !== shuffle.before, JSON.stringify(shuffle));
    await wait(shuffle.ms + 1500);
    const piledAgain = await page.evaluate(async () => (await window.__seq.scene()).inspect().piles.meshCount());
    T('G2: and is the same pile again afterwards', piledAgain === shuffle.before, `${piledAgain} vs ${shuffle.before}`);

    T('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (error) {
    console.log(`TEST ERROR: ${error?.stack || error}`);
    failed += 1;
  } finally {
    await browser.close();
    child?.kill();
  }
  console.log(failed === 0 ? 'ALL PASSED' : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
