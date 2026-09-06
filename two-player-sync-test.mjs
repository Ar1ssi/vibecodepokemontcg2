import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4000';
const ROOM = process.env.PTCG_ROOM || `e2e-${Date.now()}`;

const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

let failed = 0;

async function waitFor(page, fn, timeout = 25000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for page predicate (last=${JSON.stringify(last)})`);
}

async function openClient(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (err) => {
    console.log(`PAGEERROR ${name}:`, err.message);
  });
  await page.goto(`${BASE}/?e2e=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await waitFor(page, () => window.__ptcg?.ready === true);
  await waitFor(page, () => {
    try {
      return window.__ptcg.zone('self', 'deck').count >= 0;
    } catch {
      return false;
    }
  });
  return { context, page, name };
}

const browser = await chromium.launch({ headless: true });

try {
  const a = await openClient(browser, 'A');
  const b = await openClient(browser, 'B');

  await a.page.evaluate(
    ([room, user]) => window.__ptcg.joinRoom(room, user),
    [ROOM, 'E2E-A']
  );
  await b.page.evaluate(
    ([room, user]) => window.__ptcg.joinRoom(room, user),
    [ROOM, 'E2E-B']
  );

  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);
  T('1. both clients joined the room', true);

  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  T('2. both fixture decks loaded', true);

  await a.page.evaluate(() => window.__ptcg.readyUp());
  await b.page.evaluate(() => window.__ptcg.readyUp());
  await waitFor(a.page, () => window.__ptcg.zone('self', 'prizes').count === 6);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'prizes').count === 6);

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  const overlayDeadline = Date.now() + 15000;
  let caller = null;
  while (Date.now() < overlayDeadline && !caller) {
    await a.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    await b.page.evaluate(() => window.__ptcg.nudgeCoinSetup());
    if (await a.page.locator(callBtn).isVisible().catch(() => false)) {
      await a.page.locator(callBtn).click();
      caller = 'A';
      break;
    }
    if (await b.page.locator(callBtn).isVisible().catch(() => false)) {
      await b.page.locator(callBtn).click();
      caller = 'B';
      break;
    }
    await a.page.waitForTimeout(200);
  }
  if (!caller) throw new Error('coin call overlay never opened');
  console.log('coin caller page:', caller);

  try {
    await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count === 7);
    await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count === 7);
  } catch (err) {
    console.log(
      'hand wait debug A',
      await a.page.evaluate(() => ({
        self: window.__ptcg.zone('self', 'hand').count,
        opp: window.__ptcg.zone('opp', 'hand').count,
        phase: window.__ptcg.rulesState.phase,
        ev: window.__ptcg.lastRulesEvent,
      }))
    );
    console.log(
      'hand wait debug B',
      await b.page.evaluate(() => ({
        self: window.__ptcg.zone('self', 'hand').count,
        opp: window.__ptcg.zone('opp', 'hand').count,
        phase: window.__ptcg.rulesState.phase,
        ev: window.__ptcg.lastRulesEvent,
      }))
    );
    throw err;
  }
  const aOppHand = await waitFor(
    a.page,
    () => {
      const hand = window.__ptcg.zone('opp', 'hand');
      return hand.count === 7 ? hand : null;
    }
  );
  const bOppHand = await waitFor(
    b.page,
    () => {
      const hand = window.__ptcg.zone('opp', 'hand');
      return hand.count === 7 ? hand : null;
    }
  );
  T('3. each client sees 7 opponent hand cards', aOppHand.count === 7 && bOppHand.count === 7);

  const aTurn = await a.page.evaluate(() => window.__ptcg.counters().turnPlayer);
  const actor = aTurn === 'self' ? a : b;
  const observer = actor === a ? b : a;
  const playedName = await actor.page.evaluate(async () => {
    const name = window.__ptcg.zone('self', 'hand').names[0];
    await window.__ptcg.playFromHand(0, 'active');
    return name;
  });

  const observerActive = await waitFor(
    observer.page,
    () => {
      const active = window.__ptcg.zone('opp', 'active');
      return active.count >= 1 && active.names[0] ? active : null;
    }
  );
  T(
    '4. opponent sees the Active Pokémon that was played',
    observerActive.names[0] === playedName,
    `(${playedName})`
  );

  const actorActive = await actor.page.evaluate(() => window.__ptcg.zone('self', 'active'));
  T('5. local Active matches the played card', actorActive.names[0] === playedName);
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
