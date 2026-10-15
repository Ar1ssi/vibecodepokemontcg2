// Design 068: one real attack on the e2e board, through combat.js — banner, move scene (or the
// lunge), then the hits landing on the impact queue with TCG Live's impact prefab on the Active
// and, with BENCH=1, the condensed one on a Bench card. Cards go through the real applyView.
// WebGL runs on SwiftShader. Writes frames around the contact to OUT and prints what played.
// Design 069: SPREAD=<n> puts n Bench cards (30 damage each) behind the same attack, with the
// plan's `hits` and `strike` as advisory-animations builds them, and feeds the damage plans in the
// FX queue's order and holds (after the attack's hold) — the live path. Prints each number's time
// after contact, the branch canvas, the recoils and the 063 frame-time probe.
// env: TYPE (attacker's printed type; default Fire), DAMAGE (default 180), BENCH=1, SPREAD=<n>, SIDE (self | opp),
//      WEBGL=0 (launch without WebGL: today's dressing must play), BASE_URL (default http://localhost:4100),
//      CHROMIUM, OUT (default .agent/scratch/attack-hit), SIO_JS, CARD_IMG (default the repo's card back)
// Exit code 1 when the prefab did not play (or, with WEBGL=0, when it did), or on a page error;
// with SPREAD, also when a Bench card got no number, recoil or (for a travelling move) no branch lane.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const { BASE_URL = 'http://localhost:4100', CHROMIUM, TYPE = 'Fire', DAMAGE = '180', BENCH, SPREAD = '0', SIDE = 'self', WEBGL, SIO_JS, CARD_IMG = '/src/assets/cardback.png' } = process.env;
const SPREAD_COUNT = Math.max(0, Math.min(5, Number(SPREAD) || 0));
const OUT = process.env.OUT || '.agent/scratch/attack-hit';
const FRAME_OFFSETS_MS = [60, 160, 320, 600, 1000];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  args: WEBGL === '0' ? ['--disable-webgl', '--disable-webgl2'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.text().includes('attack impact FX') || message.text().includes('impact prefab failed')) problems.push(`${message.type()}: ${message.text().slice(0, 600)}`);
});
if (SIO_JS) await page.route('https://cdn.socket.io/**', (route) => route.fulfill({ path: SIO_JS, contentType: 'application/javascript' }));
await page.route('https://static.cloudflareinsights.com/**', (route) => route.abort());

await page.goto(`${BASE_URL}/?e2e=1`);
await page.waitForFunction(() => window.__ptcg?.ready === true, null, { timeout: 30000 });
await page.waitForTimeout(800);

const setup = await page.evaluate(
  async ([type, damageAmount, withBench, side, cardImg, spread]) => {
    const { applyView, getCardRegistry } = await import('/src/setup/netcode/apply-view.js');
    const combat = await import('/src/setup/netcode/mat-fx/combat.js');
    const stage = await import('/src/setup/netcode/mat-fx/impact/impact-stage.js');
    const select = await import('/src/setup/netcode/mat-fx/impact/impact-select.mjs');
    const card = (instanceId, name, types, subtypes, hp) => ({ instanceId, name, src: cardImg, supertype: 'Pokémon', subtypes, types, rarity: 'Double Rare', hp });
    const mine = [card(101, 'Charizard ex', [type], ['Stage 2', 'ex'], '330')];
    const theirs = [card(201, 'Venusaur ex', ['Grass'], ['Stage 2', 'ex'], '340')];
    const benchIds = spread > 0 ? Array.from({ length: spread }, (_, i) => 202 + i) : withBench ? [202] : [];
    const bench = benchIds.map((id) => card(id, 'Bulbasaur', ['Grass'], ['Basic'], '70'));
    const attackerSide = side === 'opp' ? 'opp' : 'self';
    applyView(
      {
        stateVersion: 99,
        you: { playerId: 'p1', zones: { active: attackerSide === 'self' ? mine : theirs, bench: attackerSide === 'self' ? [] : bench, hand: [] } },
        them: { playerId: 'p2', zones: { active: attackerSide === 'self' ? theirs : mine, bench: attackerSide === 'self' ? bench : [], hand: [] } },
      },
      [],
      {}
    );
    await new Promise((resolve) => setTimeout(resolve, 900));
    const registry = getCardRegistry();
    await Promise.all([101, 201, ...benchIds].map((id) => registry.get(id)?.element?.decode?.().catch(() => undefined)));
    const plan = { attackerId: 101, defenderId: 201, attackName: 'Burning Darkness', damage: damageAmount, benchDealt: benchIds.length * 30, user: attackerSide };
    const damagePlans = [
      { instanceId: 201, damage: damageAmount, dealt: damageAmount },
      ...benchIds.map((id) => ({ instanceId: id, damage: 30, dealt: 30 })),
    ];
    if (spread > 0) {
      plan.hits = damagePlans.map((hit) => ({ ...hit }));
      plan.strike = { type: 'attackExecuted' };
      for (const damagePlan of damagePlans) damagePlan.strike = plan.strike;
    }
    combat.attackBanner(plan);
    // The banner starts loading the type its move will hit with (the move's type, not always
    // the card's printed one). Wait, as the banner's hold does in a game, until no further type
    // has become ready for a while.
    const started = performance.now();
    const readyTypes = () => select.IMPACT_TYPES.filter((entry) => stage.impactReady(entry));
    let known = -1;
    let stableSince = performance.now();
    while (performance.now() - stableSince < 600 && performance.now() - started < 15000) {
      if (readyTypes().length !== known) {
        known = readyTypes().length;
        stableSince = performance.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // What showed, watched from inside the page: a screenshot can take longer than the hit lasts.
    const seen = { stageShown: false, dressing: 0, moveScene: 0, numbers: 0, branchCanvas: 0, recoiled: [], numberTimes: [], frameMs: [] };
    let contactAt = 0;
    const watchSpread = () => {
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!node.classList?.contains('fx-damage-pop')) continue;
            const box = node.getBoundingClientRect();
            seen.numberTimes.push({ ms: Math.round(performance.now() - contactAt), x: Math.round(box.left) });
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
      for (const id of benchIds) {
        const element = registry.get(id)?.element;
        const original = element?.animate?.bind(element);
        if (!original) continue;
        element.animate = (frames, options) => {
          if (Array.isArray(frames) && frames.some((frame) => frame.translate)) seen.recoiled.push(id);
          return original(frames, options);
        };
      }
      const deltas = seen.frameMs;
      let last = performance.now();
      const probe = (now) => {
        deltas.push(now - last);
        last = now;
        if (deltas.length < 140) requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    };
    const watch = () => {
      seen.branchCanvas = Math.max(seen.branchCanvas, document.querySelectorAll('canvas.fx-move__canvas--branch').length);
      seen.stageShown ||= [...document.querySelectorAll('canvas.fx-impact-stage')].some((canvas) => getComputedStyle(canvas).display !== 'none');
      seen.dressing = Math.max(seen.dressing, document.querySelectorAll('.fx-hit').length);
      seen.moveScene = Math.max(seen.moveScene, document.querySelectorAll('.fx-move').length);
      seen.numbers = Math.max(seen.numbers, document.querySelectorAll('.fx-damage-pop').length);
    };
    window.__hit = {
      seen,
      play: () => {
        if (spread > 0) watchSpread();
        const holdMs = combat.attack(plan);
        contactAt = performance.now() + (holdMs || 0) - 40;
        if (spread > 0) {
          // The FX queue: each damage plan after the previous plan's hold (180 ms unless it returns one).
          const feed = (index) => {
            if (index >= damagePlans.length) return;
            const hold = combat.damage(damagePlans[index]);
            setTimeout(() => feed(index + 1), typeof hold === 'number' ? hold : 180);
          };
          setTimeout(() => feed(0), holdMs || 0);
        } else {
          for (const damagePlan of damagePlans) combat.damage(damagePlan);
        }
        setInterval(watch, 16);
        return holdMs;
      },
    };
    return { readyTypes: readyTypes(), waitedMs: Math.round(performance.now() - started) };
  },
  [TYPE, Number(DAMAGE), BENCH === '1', SIDE, CARD_IMG, SPREAD_COUNT]
);
console.log('setup', JSON.stringify(setup));

const holdMs = await page.evaluate(() => window.__hit.play());
console.log('contact after', holdMs, 'ms');
// Frames are a best effort at these offsets after the contact (a screenshot is not instant).
const playedAt = Date.now();
for (const [index, offset] of FRAME_OFFSETS_MS.entries()) {
  await page.waitForTimeout(Math.max(0, (holdMs || 0) + offset - (Date.now() - playedAt)));
  await page.screenshot({ path: path.join(OUT, `f${index + 1}-contact+${offset}.png`) });
}
await page.waitForTimeout(Math.max(0, (holdMs || 0) + 1500 - (Date.now() - playedAt)));
const seen = await page.evaluate(() => window.__hit.seen);
console.log('seen', JSON.stringify(seen));
await browser.close();

const wantPrefab = WEBGL !== '0';
if (wantPrefab && !seen.stageShown) problems.push('the impact prefab did not play');
if (wantPrefab && seen.dressing > 0) problems.push('the old hit dressing played beside the prefab');
if (!wantPrefab && (setup.readyTypes.length > 0 || seen.stageShown)) problems.push('the prefab played without WebGL');
if (!wantPrefab && seen.dressing === 0) problems.push('no hit dressing without WebGL');
if (seen.numbers === 0) problems.push('no damage number');
if (SPREAD_COUNT > 0) {
  const sorted = [...seen.frameMs].sort((a, b) => a - b);
  const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1) : 'n/a');
  console.log('numbers ms after contact', JSON.stringify(seen.numberTimes));
  console.log('branch canvas', seen.branchCanvas, '· recoiled', JSON.stringify([...new Set(seen.recoiled)]));
  console.log('frame ms: median', at(0.5), 'p95', at(0.95));
  if (seen.numberTimes.length < SPREAD_COUNT + 1) problems.push(`${seen.numberTimes.length} numbers for ${SPREAD_COUNT + 1} hits`);
  if (new Set(seen.recoiled).size < SPREAD_COUNT) problems.push('a Bench card did not recoil');
}
for (const problem of problems) console.log(problem);
process.exit(problems.length > 0 ? 1 : 0);
