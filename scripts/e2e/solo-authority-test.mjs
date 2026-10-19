// Design 074 D7 / slice A3: the Solo tab plays one browser as both seats of a server-
// authoritative solo room. Spawns its own server (authority on, e2e bridge armed) on a free
// port, joins solo, loads a deck into each seat, runs the opening coin through its real
// prompts (as opening-coin-choice-test.mjs does), plays a Basic from the FAR seat's hand,
// then flips the board and checks the hands changed sides.
// Usage: pnpm test:solo   (PTCG_URL=http://host:port reuses a running server instead;
//        CHROMIUM_PATH=/path/to/chrome picks the browser, as the other e2e harnesses do)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

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
  const port = await freePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), PTCG_E2E: '1', SERVER_AUTHORITATIVE: '1' },
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

async function waitFor(page, fn, timeout = 25000, arg) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg);
    if (last) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`timeout waiting for ${fn.toString().slice(0, 80)} (last=${JSON.stringify(last)})`);
}

const hand = (page, side) => page.evaluate((s) => window.__ptcg.zone(s, 'hand'), side);

async function firstVisible(page, selector, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

const server = process.env.PTCG_URL ? { base: process.env.PTCG_URL, child: null } : await startServer();
let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${server.base}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);

  await page.evaluate(() => window.__ptcg.joinSolo('Solo-E2E'));
  await waitFor(page, () => window.__ptcg.soloSeat().solo === true);
  const seat = await page.evaluate(() => ({
    ...window.__ptcg.soloSeat(),
    twoPlayer: window.__ptcg.counters().twoPlayer,
    roomId: window.__ptcg.systemState.roomId,
    p1BoxShown: getComputedStyle(document.getElementById('p1Box')).display !== 'none',
  }));
  T('1. the Solo tab joined a solo room', seat.twoPlayer && /^solo-[0-9a-z]{8}$/.test(seat.roomId), seat.roomId);
  T('2. near seat starts as p1 and the Solo sidebox stays', seat.nearSeat === 'p1' && seat.p1BoxShown);

  await page.evaluate(() => {
    window.__ptcg.loadFixtureDeck('Near', 'self');
    window.__ptcg.loadFixtureDeck('Far', 'opp');
  });
  // Under authority the view redacts decks to a count and the server sends no view for a
  // deck load, so wait on the server's per-seat instance maps instead (one per loaded deck).
  const maps = await waitFor(page, () => {
    const loaded = window.__ptcg.instanceMapSeats();
    return loaded.includes('p1') && loaded.includes('p2') ? loaded : null;
  });
  T('3. a deck loaded into each seat', maps.length === 2, maps.join(','));

  // Real prompts, as opening-coin-choice-test.mjs drives them: rules on, e2e auto-answers off.
  await page.evaluate(() => {
    window.__ptcg.debugMode(false);
    history.replaceState(null, '', location.pathname);
  });
  // Not awaited: readyUp resolves only once the deal is in, which waits on our clicks.
  await page.evaluate(() => {
    window.__ptcg.readyUp();
  });

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  T('4. the coin call opens for whichever seat calls', await firstVisible(page, callBtn));
  await page.locator(callBtn).first().click();
  // The far seat must start, so it may play: the winner goes first if it is the far seat.
  const anyChoice = '#rulesTurnOrderChoiceOverlay button[data-turn-order-choice]';
  T('5. the coin winner is asked "Do you want to go first?"', await firstVisible(page, anyChoice));
  const farWon = await waitFor(page, () => {
    const chat = document.getElementById('chatbox')?.textContent || '';
    if (chat.includes('Your opponent won the coin toss.')) return 'far';
    if (chat.includes('You won the coin toss.')) return 'near';
    return null;
  });
  const choice = farWon === 'far' ? 'first' : 'second';
  console.log(`coin winner: ${farWon} seat, choosing ${choice}`);
  await page.locator(`#rulesTurnOrderChoiceOverlay button[data-turn-order-choice="${choice}"]`).click();

  await waitFor(page, () => window.__ptcg.zone('self', 'hand').count >= 7 && window.__ptcg.zone('opp', 'hand').count >= 7, 30000);
  const nearHand = await hand(page, 'self');
  const farHand = await hand(page, 'opp');
  T(
    '6. both seats were dealt an opening hand of 7 (the starter has drawn its turn card)',
    [nearHand.count, farHand.count].sort().join('/') === '7/8',
    `${nearHand.count}/${farHand.count}`
  );
  T('7. the far hand is face up for the solo player', farHand.names.every((name) => name.startsWith('Far')));

  T('8a. the far seat starts', (await waitFor(page, () => window.__ptcg.rulesState.turnPlayer)) === 'opp');
  // The Starting Active pickers are open (setup phase); debug mode lets options() list the
  // far seat's Basics now rather than after both picks.
  await page.evaluate(() => window.__ptcg.debugMode(true));
  const played = await page.evaluate(async () => {
    const options = await window.__ptcg.options('opp');
    const basic = options.find((option) => option.kind === 'playBasic' && option.targetZone === 'active');
    if (!basic) {
      return {
        error: 'no playBasic option for the far seat',
        options,
        phase: window.__ptcg.rulesState.phase,
        turnPlayer: window.__ptcg.rulesState.turnPlayer,
        picker: window.__ptcg.picker(),
        chat: window.__ptcg.chatTail(8),
      };
    }
    const name = window.__ptcg.zone('opp', 'hand').names[basic.handIndex];
    const result = await window.__ptcg.act({ ...basic, user: 'opp' });
    return { name, result };
  });
  T('8b. the far seat played a Basic through act()', played.result?.ok === true, JSON.stringify(played.result ?? played));
  const farActive = await waitFor(page, () => {
    const active = window.__ptcg.zone('opp', 'active');
    return active.count >= 1 ? active : null;
  });
  T('9. it moved to the far Active Spot', farActive.names[0] === played.name, played.name);
  const lastCmd = await page.evaluate(() => window.__ptcg.cmdLog.at(-1));
  const rejections = await page.evaluate(() => window.__ptcg.cmdRejections);
  T(
    '10. the command named the far seat and was not rejected',
    lastCmd?.type === 'moveCard' && lastCmd?.seat === 'p2' && rejections.length === 0,
    JSON.stringify({ lastCmd, rejections })
  );

  const before = { self: await hand(page, 'self'), opp: await hand(page, 'opp') };
  // The Starting Active picker and the chat can cover the button; the click is what counts.
  await page.locator('#flipBoardButton').dispatchEvent('click');
  await waitFor(page, () => window.__ptcg.soloSeat().nearSeat === 'p2');
  await waitFor(
    page,
    (expected) => {
      const self = window.__ptcg.zone('self', 'hand');
      return JSON.stringify(self.names) === JSON.stringify(expected) ? self : null;
    },
    15000,
    before.opp.names
  );
  const after = { self: await hand(page, 'self'), opp: await hand(page, 'opp') };
  T(
    '11. after the flip the hands swapped sides',
    JSON.stringify(after.self.names) === JSON.stringify(before.opp.names) &&
      JSON.stringify(after.opp.names) === JSON.stringify(before.self.names)
  );
  const activeAfter = await page.evaluate(() => window.__ptcg.zone('self', 'active').names[0]);
  T('12. the far Basic is now drawn at the bottom', activeAfter === played.name, activeAfter);
  T('13. initiator stays self (the iframes did not swap)', (await page.evaluate(() => window.__ptcg.systemState.initiator)) === 'self');
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
} finally {
  await browser?.close();
  server.child?.kill('SIGTERM');
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
