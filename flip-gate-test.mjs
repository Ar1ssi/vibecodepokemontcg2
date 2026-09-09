// Design 002 slice 3.12 — the flip gate. Plays a full 2-browser game with
// SERVER_AUTHORITATIVE=1 (server owns rendering + gameplay resolution, per O4-A/D11) to a
// real win condition, asserting per-turn cross-client hash agreement and zero cmdRejected.
//
// Usage:
//   SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js &
//   PTCG_URL=http://localhost:4100 node flip-gate-test.mjs
//
// Fixture deck (client/src/setup/general/e2e-mode.mjs): 20 uniquely named Basics, 60 HP,
// one 'Tackle' attack for 10 damage, no bench played. 6 unanswered attacks on the same
// active KOs it with an empty bench, which reduce.mjs's handleKnockout resolves as an
// instant win — no manual prize-picker needed.
import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4100';
const ROOM = process.env.PTCG_ROOM || `e2e-flip-${Date.now()}`;

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
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

// The cross-client invariant: each side's own public board must equal the other side's
// view of it. Owner-secret zones (deck/hand/prizes) are redacted per recipient (O4-A/I5)
// and can never hash equal across clients, so they are compared by count instead.
async function crossClientDivergence(a, b) {
  const [aSelf, aOpp, bSelf, bOpp] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.publicBoardHash('self')),
    a.page.evaluate(() => window.__ptcg.publicBoardHash('opp')),
    b.page.evaluate(() => window.__ptcg.publicBoardHash('self')),
    b.page.evaluate(() => window.__ptcg.publicBoardHash('opp')),
  ]);
  const problems = [];
  if (aSelf !== bOpp) problems.push("A's own board != B's view of A");
  if (bSelf !== aOpp) problems.push("B's own board != A's view of B");

  const [aSelfCounts, aOppCounts, bSelfCounts, bOppCounts] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.secretZoneCounts('self')),
    a.page.evaluate(() => window.__ptcg.secretZoneCounts('opp')),
    b.page.evaluate(() => window.__ptcg.secretZoneCounts('self')),
    b.page.evaluate(() => window.__ptcg.secretZoneCounts('opp')),
  ]);
  for (const zoneId of Object.keys(aSelfCounts)) {
    if (aSelfCounts[zoneId] !== bOppCounts[zoneId]) {
      problems.push(`A's ${zoneId} count ${aSelfCounts[zoneId]} != B's view ${bOppCounts[zoneId]}`);
    }
    if (bSelfCounts[zoneId] !== aOppCounts[zoneId]) {
      problems.push(`B's ${zoneId} count ${bSelfCounts[zoneId]} != A's view ${aOppCounts[zoneId]}`);
    }
  }
  return problems;
}

async function dumpPublicZones(a, b, label) {
  const [aSelf, aOpp, bSelf, bOpp] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.publicZones('self')),
    a.page.evaluate(() => window.__ptcg.publicZones('opp')),
    b.page.evaluate(() => window.__ptcg.publicZones('self')),
    b.page.evaluate(() => window.__ptcg.publicZones('opp')),
  ]);
  console.log(`${label} A.self:`, JSON.stringify(aSelf));
  console.log(`${label} B.opp :`, JSON.stringify(bOpp));
  console.log(`${label} B.self:`, JSON.stringify(bSelf));
  console.log(`${label} A.opp :`, JSON.stringify(aOpp));
}

const browser = await chromium.launch({ headless: true });
let a;
let b;

try {
  a = await openClient(browser, 'A');
  b = await openClient(browser, 'B');

  await a.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-A']);
  await b.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'E2E-B']);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);
  T('1. both clients joined the room', true);

  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => window.__ptcg.zone('self', 'deck').count >= 20);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'deck').count >= 20);

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

  await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count === 7);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count === 7);
  T('2. both hands dealt (7 cards each)', true);

  // Until the first server view lands, rulesState.turnPlayer is still the local coin
  // flip's guess, which the server never agreed to (I27) — both clients can believe it is
  // their own turn at once. Views are only pushed in response to a command, so pull one
  // explicitly and wait for server-derived turn state before deciding who goes first.
  await a.page.evaluate(() => window.__ptcg.requestView());
  await b.page.evaluate(() => window.__ptcg.requestView());
  await waitFor(a.page, () => window.__ptcg.turnState().fromServer === true);
  await waitFor(b.page, () => window.__ptcg.turnState().fromServer === true);

  const aTurn = await a.page.evaluate(() => window.__ptcg.turnState().turnPlayer);
  const attacker = aTurn === 'self' ? a : b;
  const defender = attacker === a ? b : a;
  console.log('attacker page:', attacker.name);

  // moveCard is turn-gated server-side ("It's not your turn."), so the two sides cannot
  // place their actives simultaneously — each does it on its own first turn and passes.
  // Once both have an active, the attacker attacks every turn and the defender passes.
  let attacks = 0;
  let turns = 0;
  const maxTurns = 40;
  let sawBothActive = false;
  let lastDefenderActive = null;
  while (turns < maxTurns) {
    turns += 1;
    // Single-sourced on purpose: both pages derive turnPlayer from the same server view,
    // so asking both only invites a disagreement whenever one view is a beat behind.
    // The attacker's own localised view of whose turn it is settles it for both sides.
    const attackerTurn = await attacker.page.evaluate(() => window.__ptcg.turnState());
    const active = attackerTurn.turnPlayer === 'self' ? attacker : defender;
    const idle = active === attacker ? defender : attacker;

    const [hasActive, idleHasActive] = await Promise.all([
      active.page.evaluate(() => window.__ptcg.zone('self', 'active').count === 1),
      idle.page.evaluate(() => window.__ptcg.zone('self', 'active').count === 1),
    ]);
    let did;
    if (!hasActive) {
      await active.page.evaluate(() => window.__ptcg.playFromHand(0, 'active'));
      await waitFor(active.page, () => window.__ptcg.zone('self', 'active').count === 1);
      await active.page.evaluate(() => window.__ptcg.passTurn());
      did = 'place+pass';
    } else if (active === attacker && idleHasActive) {
      await active.page.evaluate(() => window.__ptcg.attack(0));
      attacks += 1;
      did = `attack ${attacks}`;
    } else {
      await active.page.evaluate(() => window.__ptcg.passTurn());
      did = 'pass';
    }
    console.log(`turn ${turns}: ${active.name} (turn ${attackerTurn.turnNumber}) ${did}`);

    // Wait on the same page the turn is read from, so the next iteration reads a view
    // that has already moved on. A game-ending attack never yields a next turn.
    const expected = active === attacker ? 'opp' : 'self';
    await attacker.page
      .waitForFunction(
        (want) => window.__ptcg.turnState().turnPlayer === want || window.__ptcg.gameEndedInfo,
        expected,
        { timeout: 10000 }
      )
      .catch(() => console.log(`turn ${turns}: turn never became ${expected} within 10s`));

    const ended = await attacker.page.evaluate(() => window.__ptcg.gameEndedInfo);
    if (ended) break;

    if (!sawBothActive) {
      const [attackerHasActive, defenderHasActive] = await Promise.all([
        attacker.page.evaluate(() => window.__ptcg.zone('self', 'active').count === 1),
        defender.page.evaluate(() => window.__ptcg.zone('self', 'active').count === 1),
      ]);
      if (attackerHasActive && defenderHasActive) sawBothActive = true;
    }

    if (active === attacker && attacks > 0) {
      const defenderActive = await defender.page.evaluate(
        () => window.__ptcg.publicZones('self').active
      );
      console.log(`  after attack ${attacks}, defender active:`, JSON.stringify(defenderActive));
      if (defenderActive[0]) {
        lastDefenderActive = defenderActive[0];
      }
      const problems = await crossClientDivergence(a, b);
      T(`4.${attacks} boards agree after attack ${attacks}`, problems.length === 0, problems.join('; '));
      if (problems.length) {
        await dumpPublicZones(a, b, `attack ${attacks}`);
        break;
      }
    }
  }
  T('3. both sides have an active Pokemon', sawBothActive);
  for (const client of [a, b]) {
    const types = await client.page.evaluate(() =>
      window.__ptcg.cmdLog.map((c) => c.type)
    );
    console.log(`${client.name} commands sent:`, types.join(', '));
    const firstStats = await client.page.evaluate(() => {
      const entry = window.__ptcg.cmdLog.find((c) => c.type === 'cardStats');
      return entry ? { count: entry.payload.stats.length, sample: entry.payload.stats.slice(0, 2) } : null;
    });
    console.log(`${client.name} cardStats payload:`, JSON.stringify(firstStats));
  }

  // The loop breaks as soon as the attacker sees the game end; the defender's own
  // 'gameEnded' is a separate socket delivery, so give it a bounded moment to land
  // before asserting both clients know.
  for (const client of [attacker, defender]) {
    await client.page
      .waitForFunction(() => !!window.__ptcg.gameEndedInfo, undefined, { timeout: 10000 })
      .catch(() => console.log(`${client.name} never received gameEnded within 10s`));
  }

  const [attackerEnded, defenderEnded] = await Promise.all([
    attacker.page.evaluate(() => window.__ptcg.gameEndedInfo),
    defender.page.evaluate(() => window.__ptcg.gameEndedInfo),
  ]);
  T(
    '5. game ended on both clients',
    !!attackerEnded && !!defenderEnded,
    JSON.stringify({ attackerEnded, defenderEnded })
  );
  // The server reports the winner as an absolute playerId; both clients must name the
  // same one, and each must localise it correctly in its own announcement.
  T(
    '6. both clients agree on the winner',
    !!attackerEnded?.winner && attackerEnded.winner === defenderEnded?.winner,
    JSON.stringify({ winner: attackerEnded?.winner, reason: attackerEnded?.reason })
  );

  const [aRejected, bRejected] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.cmdRejectedCount),
    b.page.evaluate(() => window.__ptcg.cmdRejectedCount),
  ]);
  const [aLastReject, bLastReject] = await Promise.all([
    a.page.evaluate(() => window.__ptcg.lastCmdRejected),
    b.page.evaluate(() => window.__ptcg.lastCmdRejected),
  ]);
  T(
    '7. zero cmdRejected on either client',
    aRejected === 0 && bRejected === 0,
    `(A=${aRejected}, B=${bRejected})` +
      (aRejected || bRejected
        ? ` last: ${JSON.stringify(aLastReject || bLastReject)}`
        : '')
  );

  // The real fidelity check, and the one 3.12 currently fails (I26): the server's card
  // model carries no hp or attacks, because loadDeck transmits only the 7-field deck row
  // ([quantity, name, type, imageURL, number, set, tcgId]). Damage still accumulates —
  // every attack falls back to reduce.mjs's { name: 'Attack', damage: 10 } — but
  // reduce.mjs's KO check is `koHp > 0 && defender.damage >= koHp`, and koHp is always 0,
  // so no knockout can ever fire and deck-out is the only reachable win condition.
  T(
    '8. server knows the defending Pokemon HP',
    lastDefenderActive?.hp != null,
    `(hp=${JSON.stringify(lastDefenderActive?.hp ?? null)} — I26 if null)`
  );
  T(
    '9. knockout ends the game at 60 damage, not deck-out',
    attackerEnded?.reason !== 'deck-out' && attacks === 6,
    `(attacks=${attacks}, reason=${attackerEnded?.reason})`
  );
} catch (err) {
  failed += 1;
  console.log('TEST ERROR:', err.message);
  try {
    for (const [label, client] of [['A', a], ['B', b]]) {
      if (!client) continue;
      const dbg = await client.page.evaluate(() => ({
        selfActive: window.__ptcg.zone('self', 'active'),
        oppActive: window.__ptcg.zone('opp', 'active'),
        selfHand: window.__ptcg.zone('self', 'hand'),
        cmdRejectedCount: window.__ptcg.cmdRejectedCount,
        cmdLog: window.__ptcg.cmdLog,
        cmdRejections: window.__ptcg.cmdRejections,
        turnPlayer: window.__ptcg.counters().turnPlayer,
      }));
      console.log(`debug ${label}:`, JSON.stringify(dbg));
    }
  } catch (e2) {
    console.log('debug capture failed:', e2.message);
  }
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
