// Design 072: the opening coin with real prompts (not the e2e auto-answers). Joins two clients with the
// e2e bridge for setup, then drops ?e2e=1 from the URL and turns rules back on, so the
// call picker, the ceremony and the "Do you want to go first?" prompt run as for players.
// Usage: SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js &
//        PTCG_URL=http://localhost:4100 CHOICE=second|first node opening-coin-choice-test.mjs
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4100';
const ROOM = `probe-coin-${Date.now()}`;
const CHOICE = process.env.CHOICE === 'first' ? 'first' : 'second';
const SHOTS = process.env.SHOTS || '';

let failed = 0;
const T = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` ${extra}` : ''}`);
  if (!cond) failed += 1;
};

async function waitFor(page, fn, timeout = 25000, arg) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await page.evaluate(fn, arg);
    if (value) return value;
    await page.waitForTimeout(100);
  }
  return null;
}

async function openClient(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);
  return { page, name };
}

const chatText = (page) =>
  page.evaluate(() => document.getElementById('p2Chatbox')?.textContent || '');

const browser = await chromium.launch({ headless: true });
try {
  const a = await openClient(browser, 'A');
  const b = await openClient(browser, 'B');
  await a.page.evaluate(([room]) => window.__ptcg.joinRoom(room, 'Probe-A'), [ROOM]);
  await b.page.evaluate(([room]) => window.__ptcg.joinRoom(room, 'Probe-B'), [ROOM]);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);
  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);

  for (const { page } of [a, b]) {
    await page.evaluate(() => {
      window.__ptcg.debugMode(false); // rules on
      history.replaceState(null, '', location.pathname); // isE2eMode() now false
    });
  }
  // Not awaited: readyUp resolves only once the deal is in, which waits on our clicks.
  await a.page.evaluate(() => { window.__ptcg.readyUp(); });
  await b.page.evaluate(() => { window.__ptcg.readyUp(); });

  const callBtn = '#rulesCoinCallOverlay button[data-coin-call="heads"]';
  let caller = null;
  const callDeadline = Date.now() + 20000;
  while (!caller && Date.now() < callDeadline) {
    for (const client of [a, b]) {
      if (await client.page.locator(callBtn).isVisible().catch(() => false)) {
        caller = client;
        break;
      }
    }
    if (!caller) await a.page.waitForTimeout(150);
  }
  T('call picker opens on exactly one seat', Boolean(caller), caller?.name);
  const other = caller === a ? b : a;
  T(
    'the other seat has no call picker',
    !(await other.page.locator('#rulesCoinCallOverlay').count())
  );
  T(
    'the call picker speaks TCG Live',
    (await caller.page.locator('#rulesCoinCallOverlay').innerText()).includes(
      'Call the starting coin flip. Choose heads or tails.'
    )
  );
  if (SHOTS) await caller.page.screenshot({ path: `${SHOTS}/1-call.png` });
  await caller.page.locator(callBtn).click();

  // The ceremony plays on both seats; the winner's prompt opens after it.
  const choiceSel = `#rulesTurnOrderChoiceOverlay button[data-turn-order-choice="${CHOICE}"]`;
  let winner = null;
  const choiceDeadline = Date.now() + 20000;
  while (!winner && Date.now() < choiceDeadline) {
    for (const client of [a, b]) {
      if (await client.page.locator(choiceSel).isVisible().catch(() => false)) {
        winner = client;
        break;
      }
    }
    if (!winner) await a.page.waitForTimeout(150);
  }
  T('the coin winner is asked "Do you want to go first?"', Boolean(winner), winner?.name);
  const loser = winner === a ? b : a;
  T('the loser gets no prompt', !(await loser.page.locator('#rulesTurnOrderChoiceOverlay').count()));
  T(
    'the loser is told the opponent is deciding',
    (await chatText(loser.page)).includes(
      'Your opponent won the coin flip and is deciding who goes first.'
    )
  );
  T(
    'no hands are dealt before the choice',
    (await winner.page.evaluate(() => window.__ptcg.zone('self', 'hand').count)) === 0
  );
  if (SHOTS) await winner.page.screenshot({ path: `${SHOTS}/2-choice.png` });
  await winner.page.locator(choiceSel).click();

  const expectedStarter = CHOICE === 'first' ? winner : loser;
  const turnOf = (page) => page.evaluate(() => window.__ptcg.counters?.().turnPlayer ?? null);
  await waitFor(winner.page, () => window.__ptcg.zone('self', 'hand').count >= 7, 25000);
  await waitFor(loser.page, () => window.__ptcg.zone('self', 'hand').count >= 7, 25000);
  await winner.page.waitForTimeout(1500);
  const winnerChat = await chatText(winner.page);
  const loserChat = await chatText(loser.page);
  T(
    `winner's chat says they decided to go ${CHOICE}`,
    winnerChat.includes(`You decided to go ${CHOICE}.`)
  );
  T(
    "loser's chat says the opponent decided",
    loserChat.includes(`Your opponent decided to go ${CHOICE}.`)
  );
  T(
    'both chats name the same starter',
    expectedStarter === winner
      ? winnerChat.includes('You will go first.') && loserChat.includes('Your opponent will go first.')
      : loserChat.includes('You will go first.') && winnerChat.includes('Your opponent will go first.')
  );
  const starterHand = await expectedStarter.page.evaluate(() => window.__ptcg.zone('self', 'hand').count);
  const otherHand = await (expectedStarter === a ? b : a).page.evaluate(
    () => window.__ptcg.zone('self', 'hand').count
  );
  T('the starter drew for turn 1 (8 vs 7)', starterHand === 8 && otherHand === 7, `${starterHand}/${otherHand}`);
  console.log('turnPlayer A/B:', await turnOf(a.page), await turnOf(b.page));
  console.log('--- winner chat ---\n' + winnerChat.split('\n').slice(-12).join('\n'));
} catch (err) {
  console.log('PROBE ERROR:', err.message);
  failed += 1;
} finally {
  await browser.close();
  console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
}
