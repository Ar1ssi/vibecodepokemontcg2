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

  // 5. Test Double-click Active -> Inspector Opens with Chrome and Dim
  console.log('Testing double-click on active card...');
  await actorFrame.evaluate(() => {
    const img = document.querySelector('#active img');
    const r = img.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    img.dispatchEvent(new MouseEvent('click', opts));
    img.dispatchEvent(new MouseEvent('click', opts));
    img.dispatchEvent(new MouseEvent('dblclick', opts));
  });

  await actor.page.waitForTimeout(800);
  const inspectorVisible = await actor.page.locator('.ptcg-inspector').isVisible().catch(() => false);
  T('5. Double-click active opens card inspector', inspectorVisible);

  const inspectorData = await actor.page.evaluate(() => {
    const insp = document.querySelector('.ptcg-inspector');
    if (!insp) return null;
    const hp = insp.querySelector('.ptcg-hp')?.textContent;
    const atks = [...insp.querySelectorAll('.ptcg-atk')].map((el) => ({
      name: el.querySelector('.ptcg-atk__name')?.textContent,
      receded: el.classList.contains('ptcg-atk--recede'),
      usable: el.classList.contains('ptcg-atk--usable'),
      className: el.className,
    }));
    const stats = insp.querySelector('.ptcg-stats')?.textContent;
    const isLocked = insp.classList.contains('ptcg-inspector--locked');
    const rect = insp.getBoundingClientRect();
    return { hp, atks, stats, isLocked, inspClass: insp.className, rect: { w: rect.width, h: rect.height, x: rect.left, y: rect.top } };
  });
  console.log('Inspector data (0 energy):', JSON.stringify(inspectorData));
  T('6. Chrome anchored with non-zero geometry', inspectorData && inspectorData.rect.w > 0 && inspectorData.rect.h > 0);
  T('7. Full dim applied when 0 energy attached (all attacks locked)', inspectorData && inspectorData.isLocked === true && inspectorData.atks.every((a) => a.receded && !a.usable));

  await actor.page.screenshot({ path: 'out/e2e-inspector-dimmed.png' });
  console.log('Screenshot saved: out/e2e-inspector-dimmed.png');

  // 7b. Holo flow (D58): the enlarged inspector carousel is a mat card enlarged
  // in place, so its foil must keep flowing with the cursor parked over it —
  // never hold the light or tilt to the pointer. Skipped if the card is not holo.
  const holoCenter = await actor.page.evaluate(() => {
    const visible = [...document.querySelectorAll('.card-picker-overlay .mat-holo')].find((w) => {
      const r = w.getBoundingClientRect();
      return r.width > 0 && r.left < window.innerWidth && r.right > 0;
    });
    if (!visible) return null;
    const r = visible.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (holoCenter) {
    await actor.page.mouse.move(holoCenter.x, holoCenter.y);
    const readHolo = () =>
      actor.page.evaluate(() => {
        const el = [...document.querySelectorAll('.card-picker-overlay .mat-holo')].find((w) =>
          w.style.getPropertyValue('--pointer-x')
        );
        return el
          ? {
              px: el.style.getPropertyValue('--pointer-x'),
              rx: el.style.getPropertyValue('--rotate-x'),
            }
          : null;
      });
    const holoBefore = await readHolo();
    await actor.page.waitForTimeout(1200);
    const holoAfter = await readHolo();
    T(
      '7b. Inspector foil keeps flowing under the cursor',
      holoBefore && holoAfter && holoBefore.px !== holoAfter.px,
      `${holoBefore?.px} -> ${holoAfter?.px}`
    );
    T(
      '7c. Inspector foil does not tilt to the cursor',
      holoAfter && parseFloat(holoAfter.rx) === 0,
      `rotate-x=${holoAfter?.rx}`
    );
  }

  // 6. Test Escape Closes Inspector
  console.log('Testing Escape key to close inspector...');
  await actor.page.keyboard.press('Escape');
  await actor.page.waitForTimeout(400);
  const closedAfterEsc = !(await actor.page.locator('#cardPickerOverlay').isVisible().catch(() => false));
  T('8. Escape closes card inspector', closedAfterEsc);

  // 7. Attach 1 Fire Energy -> Test Dim Lifts
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

  // Double click active again with energy attached
  await actorFrame.evaluate(() => {
    const img = document.querySelector('#active img');
    const r = img.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    img.dispatchEvent(new MouseEvent('click', opts));
    img.dispatchEvent(new MouseEvent('click', opts));
    img.dispatchEvent(new MouseEvent('dblclick', opts));
  });

  await actor.page.waitForTimeout(800);
  const inspectorWithEnergy = await actor.page.evaluate(() => {
    const insp = document.querySelector('.ptcg-inspector');
    if (!insp) return null;
    const isLocked = insp.classList.contains('ptcg-inspector--locked');
    const atks = [...insp.querySelectorAll('.ptcg-atk')].map((el) => ({
      name: el.querySelector('.ptcg-atk__name')?.textContent,
      receded: el.classList.contains('ptcg-atk--recede'),
      usable: el.classList.contains('ptcg-atk--usable'),
      className: el.className,
    }));
    return { isLocked, atks, inspClass: insp.className };
  });
  console.log('Inspector data (1 Fire Energy attached):', JSON.stringify(inspectorWithEnergy));
  T('9. Dim lifts on attach (payable attack unlocks)', inspectorWithEnergy && inspectorWithEnergy.isLocked === false);
  T('10. Ember and Scratch are payable', inspectorWithEnergy && inspectorWithEnergy.atks.every((a) => a.usable && !a.receded));

  await actor.page.screenshot({ path: 'out/e2e-inspector-payable.png' });
  console.log('Screenshot saved: out/e2e-inspector-payable.png');

  // 8. Test Carousel slides: Attached card slide carries NO inspector chrome
  const slideCount = await actor.page.locator('.card-picker-stage .card-picker-slide').count();
  console.log('Carousel slide count:', slideCount);
  T('11. Carousel contains multiple slides (main card + attached energy)', slideCount >= 2);

  // Check the attached Energy slide (slide index 0)
  const energySlideHasChrome = await actor.page.evaluate(() => {
    const slides = document.querySelectorAll('.card-picker-stage .card-picker-slide');
    const attachedSlide = slides[0];
    return !!attachedSlide?.querySelector('.ptcg-inspector');
  });
  T('12. Energy slide has no inspector chrome', energySlideHasChrome === false);

  // 9. Click payable attack -> Executes and closes.
  // Real input (locator.click), NOT el.click(): a programmatic click dispatches
  // no pointerdown, so the carousel never sets pointer capture and the click
  // bubbles normally. A real press captures the pointer and the browser then
  // delivers the click to the capturing stage — the bug this step guards.
  console.log('Testing attack click execution...');
  await actor.page.locator('.ptcg-atk.ptcg-atk--usable').first().click();
  await actor.page.waitForTimeout(600);

  const closedAfterAttack = !(await actor.page.locator('#cardPickerOverlay').isVisible().catch(() => false));
  T('13. Clicking attack panel closes inspector', closedAfterAttack);

} catch (err) {
  failed += 1;
  console.error('TEST ERROR:', err);
} finally {
  await browser.close();
}

console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
