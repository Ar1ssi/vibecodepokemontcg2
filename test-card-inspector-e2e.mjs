import { chromium } from 'playwright';

const BASE = process.env.PTCG_URL || 'http://localhost:4100';
const ROOM = process.env.PTCG_ROOM || `e2e-inspector-${Date.now()}`;

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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`PAGEERROR ${name}:`, err.message));
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('[vite]') && !text.includes('Download the React DevTools') && !text.includes('cloudflareinsights')) {
      console.log(`[CONSOLE ${name}]`, text);
    }
  });
  await page.goto(`${BASE}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitFor(page, () => window.__ptcg?.ready === true);
  return { context, page, name };
}

const browser = await chromium.launch({ headless: true });

try {
  const a = await openClient(browser, 'A');
  const b = await openClient(browser, 'B');

  // 1. Join room
  await a.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'Player-A']);
  await b.page.evaluate(([room, user]) => window.__ptcg.joinRoom(room, user), [ROOM, 'Player-B']);
  await waitFor(a.page, () => window.__ptcg.counters().twoPlayer === true);
  await waitFor(b.page, () => window.__ptcg.counters().twoPlayer === true);
  T('1. Both clients joined 2P room', true);

  // 2. Load decks
  await a.page.evaluate(() => window.__ptcg.loadFixtureDeck('Alpha'));
  await b.page.evaluate(() => window.__ptcg.loadFixtureDeck('Bravo'));
  await waitFor(a.page, () => (window.__ptcg?.systemState?.selfDeckData?.length || 0) >= 20);
  await waitFor(b.page, () => (window.__ptcg?.systemState?.selfDeckData?.length || 0) >= 20);
  T('2. Decks loaded for both players', true);

  // 3. Ready up
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
  console.log('Coin caller page:', caller);

  await waitFor(a.page, () => window.__ptcg.zone('self', 'hand').count >= 7);
  await waitFor(b.page, () => window.__ptcg.zone('self', 'hand').count >= 7);
  T('3. Opening hands and prizes dealt', true);

  // Determine which player acts
  const aTurn = await a.page.evaluate(() => window.__ptcg.counters().turnPlayer);
  const actor = aTurn === 'self' ? a : b;
  const observer = actor === a ? b : a;
  console.log(`Active actor is Client ${actor.name} (turnPlayer: ${aTurn})`);

  console.log(`${actor.name} placing active card...`);
  await actor.page.evaluate(async () => {
    const { getAuthoritativeZoneArray, hasAuthoritativeView } = await import('./src/setup/netcode/apply-view.js');
    if (hasAuthoritativeView()) {
      const { emitCmd } = await import('./src/setup/netcode/cmd-emitter.js');
      const { socket, systemState } = await import('./src/state.js');
      const hand = getAuthoritativeZoneArray('you', 'hand');
      const card = hand[0];
      if (card?.instanceId != null) {
        await emitCmd({
          socket,
          roomId: systemState.roomId,
          type: 'moveCard',
          payload: { instanceId: card.instanceId, from: 'hand', to: 'active' },
        });
        return;
      }
    }
    await window.__ptcg.playFromHand(0, 'active');
  });
  await waitFor(actor.page, () => window.__ptcg.zone('self', 'active').count === 1);
  T('4. Active Pokémon in play on active actor', true);

  await actor.page.waitForTimeout(500);

  // Stamp Charmander stats on active card
  await actor.page.evaluate(() => {
    const fr = document.querySelector('iframe[src*="self-containers"]')?.contentDocument;
    const stamped = fr?.querySelector('#active img')?.card;
    if (stamped) {
      stamped.hp = 70;
      stamped.types = ['Fire'];
      stamped.attacks = [
        { name: 'Ember', cost: ['Fire'], damage: '30', text: 'Discard a {R} Energy from this Pokémon.' },
        { name: 'Scratch', cost: ['Colorless'], damage: '10', text: '' },
      ];
      stamped.weakness = { type: 'Water', value: 2 };
      stamped.resistance = null;
      stamped.retreatCost = ['Colorless'];
    }
  });

  const actorFrame = actor.page.frames().find((f) => /self-containers/.test(f.url()));

  // Design 067: a click on your own Active opens the TCG Live focus view, not the carousel.
  const clickActive = (events) =>
    actorFrame.evaluate((names) => {
      const img = document.querySelector('#active img');
      const r = img.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      for (const name of names) img.dispatchEvent(new MouseEvent(name, opts));
    }, events);
  const focusOpen = () => actor.page.evaluate(() => Boolean(document.querySelector('.card-focus')));
  // A browse carousel only: the fixture game can already have a server choice picker
  // (`card-picker-choose`) open, which is not what these steps are about.
  const carouselVisible = () =>
    actor.page.evaluate(() => {
      const overlay = document.querySelector('#cardPickerOverlay:not(.card-picker-choose)');
      return Boolean(overlay && getComputedStyle(overlay).display !== 'none');
    });
  const handLowered = () => actorFrame.evaluate(() => document.documentElement.classList.contains('hand-lowered'));
  const sourceHidden = () =>
    actorFrame.evaluate(() => {
      const img = document.querySelector('#active img');
      const target = img.closest('.mat-holo') ?? img;
      return getComputedStyle(target).visibility === 'hidden';
    });
  const waitGone = async () => {
    for (let i = 0; i < 20; i += 1) {
      if (!(await focusOpen())) return true;
      await actor.page.waitForTimeout(50);
    }
    return false;
  };

  // 5. Single click opens the focus view
  console.log('Testing single click on own active card...');
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  T('5. Click on own active opens the focus view', await focusOpen());
  T('5b. ...and not the carousel', !(await carouselVisible()));
  T('5c. Flight finished: backdrop open class set', await actor.page.evaluate(() => document.querySelector('.card-focus')?.classList.contains('card-focus--open')));
  T('5d. The hand is lowered in the self frame', await handLowered());
  T('5e. The source card is hidden while focused', await sourceHidden());

  // 5f. A double-click (click, click, dblclick) keeps one focus view and never opens the carousel
  await actor.page.keyboard.press('Escape');
  T('5f-pre. Escape closes the focus view', await waitGone());
  await clickActive(['click', 'click', 'dblclick']);
  await actor.page.waitForTimeout(800);
  T(
    '5f. Double-click on own active leaves exactly one focus view and no carousel',
    (await actor.page.locator('.card-focus').count()) === 1 && !(await carouselVisible())
  );

  // 6. Pose: the card sits on the pose derived from the game's camera, with chrome sized to it
  const pose = await actor.page.evaluate(async () => {
    const { focusRect, perspectiveFor } = await import('./src/setup/rules/card-focus-geometry.mjs');
    const host = document.querySelector('.card-focus__card');
    const chrome = document.querySelector('.card-focus .ptcg-chrome');
    const rect = host.getBoundingClientRect();
    const expected = focusRect({ width: window.innerWidth, height: window.innerHeight });
    return {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      expected,
      perspective: parseFloat(getComputedStyle(document.querySelector('.card-focus__stage')).perspective),
      expectedPerspective: perspectiveFor(window.innerHeight),
      u: parseFloat(chrome?.style.getPropertyValue('--u')),
      chromeWidth: chrome ? parseFloat(chrome.style.width) : 0,
    };
  });
  console.log('Pose:', JSON.stringify(pose));
  const within = (a, b, tol) => Math.abs(a - b) <= tol;
  T(
    '6. Card rect equals the derived focus pose',
    ['left', 'top', 'width', 'height'].every((k) => within(pose.rect[k], pose.expected[k], 2))
  );
  T('6b. Stage perspective follows the 20-degree camera', within(pose.perspective, pose.expectedPerspective, 1));
  T('6c. Chrome is sized to the unscaled card (--u = width / 100)', within(pose.u * 100, pose.rect.width, 2) && within(pose.chromeWidth, pose.rect.width, 3));

  const inspectorData = await actor.page.evaluate(() => {
    const insp = document.querySelector('.card-focus .ptcg-inspector');
    if (!insp) return null;
    return {
      hp: insp.querySelector('.ptcg-hp')?.textContent,
      atks: [...insp.querySelectorAll('.ptcg-atk')].map((el) => ({
        name: el.querySelector('.ptcg-atk__name')?.textContent,
        receded: el.classList.contains('ptcg-atk--recede'),
        usable: el.classList.contains('ptcg-atk--usable'),
        type: el.dataset.ptcgType,
        hasDmg: Boolean(el.querySelector('.ptcg-atk__dmg')),
      })),
      stats: insp.querySelector('.ptcg-stats')?.textContent,
      retreatType: insp.querySelector('.ptcg-stat[data-ptcg-retreat]')?.dataset.ptcgType,
    };
  });
  console.log('Focus data (0 energy):', JSON.stringify(inspectorData));
  T('7. Every attack panel is greyed and unusable with 0 energy', inspectorData && inspectorData.atks.length === 2 && inspectorData.atks.every((a) => a.receded && !a.usable));
  T('7b. Panels carry the Fire sprite set (data-ptcg-type)', inspectorData && inspectorData.atks.every((a) => a.type === 'fire') && inspectorData.retreatType === 'fire');

  await actor.page.screenshot({ path: 'out/e2e-focus-open.png' });
  console.log('Screenshot saved: out/e2e-focus-open.png');

  // 8. Escape closes with fly-back; the hand and the source card come back
  await actor.page.keyboard.press('Escape');
  T('8. Escape closes the focus view', await waitGone());
  T('8b. The hand is raised again', !(await handLowered()));
  T('8c. The source card is visible again', !(await sourceHidden()));

  // 9. Backdrop click closes (after the double-click arm delay); the close button closes
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  await actor.page.mouse.click(8, 8);
  T('9. Clicking the backdrop closes the focus view', await waitGone());
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  await actor.page.locator('.card-focus__close').click();
  T('9b. The close button closes the focus view', await waitGone());

  // 10. Attach 1 Fire Energy -> attacks become payable; the Stack button opens the carousel
  console.log('Attaching 1 Fire Energy to active...');
  await actor.page.evaluate(() => {
    const fr = document.querySelector('iframe[src*="self-containers"]')?.contentDocument;
    const stamped = fr?.querySelector('#active img')?.card;
    if (stamped) {
      if (!stamped.attachedCards) stamped.attachedCards = [];
      const energyCard = {
        name: 'Basic Fire Energy',
        type: 'Energy',
        image: { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' },
        energyType: 'Fire',
      };
      stamped.attachedCards.push(energyCard);
    }
  });
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  const withEnergy = await actor.page.evaluate(() => ({
    atks: [...document.querySelectorAll('.card-focus .ptcg-atk')].map((el) => ({
      receded: el.classList.contains('ptcg-atk--recede'),
      usable: el.classList.contains('ptcg-atk--usable'),
    })),
    stack: document.querySelector('.card-focus__stack')?.textContent ?? null,
  }));
  console.log('Focus data (1 Fire Energy attached):', JSON.stringify(withEnergy));
  T('10. Ember and Scratch are payable once Fire Energy is attached', withEnergy.atks.length === 2 && withEnergy.atks.every((a) => a.usable && !a.receded));
  T('10b. The HUD shows the Stack button with the attached count', withEnergy.stack === '1');

  await actor.page.screenshot({ path: 'out/e2e-focus-payable.png' });
  console.log('Screenshot saved: out/e2e-focus-payable.png');

  await actor.page.locator('.card-focus__stack').click();
  await actor.page.waitForTimeout(800);
  const slideCount = await actor.page.locator('.card-picker-stage .card-picker-slide').count();
  T('11. Stack closes the focus and opens the carousel with the attached card', !(await focusOpen()) && slideCount >= 2, `slides=${slideCount}`);
  const energySlideHasChrome = await actor.page.evaluate(() => {
    const slides = document.querySelectorAll('.card-picker-stage .card-picker-slide');
    return !!slides[0]?.querySelector('.ptcg-inspector');
  });
  T('12. The attached Energy slide has no inspector chrome', energySlideHasChrome === false);
  await actor.page.keyboard.press('Escape');
  await actor.page.waitForTimeout(500);

  // 13. Click a payable attack with REAL input (locator.click), not el.click(): a programmatic click
  // dispatches no pointerdown, so pointer-capture regressions hide. The focus closes at once.
  console.log('Testing attack click execution...');
  await clickActive(['click']);
  await actor.page.waitForTimeout(800);
  await actor.page.locator('.ptcg-atk.ptcg-atk--usable').first().click();
  T('13. Clicking a payable attack closes the focus view at once', await waitGone());
  T('13b. ...and the hand is raised again', !(await handLowered()));

  // 14. Edge rows: resize, close mid-flight, a picker appearing, turn change. The attack in step 13
  // may have ended the turn, so each case opens its own focus when it can.
  const reopen = async () => {
    await clickActive(['click']);
    await actor.page.waitForTimeout(700);
    return focusOpen();
  };
  if (await reopen()) {
    await actor.page.setViewportSize({ width: 1100, height: 700 });
    await actor.page.waitForTimeout(400);
    const resized = await actor.page.evaluate(async () => {
      const { focusRect } = await import('./src/setup/rules/card-focus-geometry.mjs');
      const r = document.querySelector('.card-focus__card').getBoundingClientRect();
      const e = focusRect({ width: window.innerWidth, height: window.innerHeight });
      const chrome = document.querySelector('.card-focus .ptcg-chrome');
      return {
        ok: ['left', 'top', 'width', 'height'].every((k, i) => Math.abs([r.left, r.top, r.width, r.height][i] - e[k]) <= 2),
        uMatches: Math.abs(parseFloat(chrome.style.getPropertyValue('--u')) * 100 - r.width) <= 2,
      };
    });
    T('14. Resize while open re-fits the card to the new pose', resized.ok);
    T('14b. ...and re-places the chrome (--u follows the new width)', resized.uMatches);
    await actor.page.setViewportSize({ width: 1440, height: 900 });
    await actor.page.waitForTimeout(300);
    await actor.page.keyboard.press('Escape');
    await waitGone();
  } else {
    T('14. Edge rows skipped: focus did not reopen', false);
  }

  if (await reopen()) {
    await actor.page.evaluate(() => document.dispatchEvent(new CustomEvent('rules-turn-began')));
    T('14c. A turn change closes the focus view at once', await waitGone());
    T('14d. ...and the hand is raised again', !(await handLowered()));
  }

  if (await reopen()) {
    await actor.page.evaluate(() => {
      const banner = document.createElement('div');
      banner.className = 'mat-pick-banner';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 600);
    });
    T('14e. A mat-pick banner appearing closes the focus view (the picker must stay reachable)', await waitGone());
  }

  // Close while the flight is still running: no error, nothing left behind.
  await clickActive(['click']);
  await actor.page.waitForTimeout(60);
  await actor.page.keyboard.press('Escape');
  T('14f. Escape mid-flight closes cleanly', await waitGone());
  T('14g. ...and restores the hand and the source card', !(await handLowered()) && !(await sourceHidden()));

} catch (err) {
  failed += 1;
  console.error('TEST ERROR:', err);
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
