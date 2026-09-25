import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  COIN_FLIP_OVERLAY_ID,
  coinFlipCeremonyMarkup,
  playCoinFlipCeremony,
} from '../coin-flip-ceremony.js';

const COIN = {
  id: 'SVC_Gold_Pikachu_Coin',
  name: 'SVC Gold Pikachu',
  thumb: 'src/assets/coins/SVC_Gold_Pikachu_Coin.png',
  material: 'gold',
};

test('markup resolves the catalog art and carries the four material layers', () => {
  const html = coinFlipCeremonyMarkup({ coin: COIN, ownerLabel: 'Your' });
  assert.match(html, /\/src\/assets\/coins\/SVC_Gold_Pikachu_Coin\.png/);
  assert.match(html, /turn-order-coin-flip-label">Your coin/);
  assert.match(html, /coin-backc/);
  for (const cls of ['coin__env', 'coin__spec', 'coin__holo', 'coin__grain']) {
    assert.ok(html.includes(cls), `missing decorative layer ${cls}`);
  }
});

test('markup falls back to the coin back when no coin is supplied', () => {
  const html = coinFlipCeremonyMarkup({});
  assert.match(html, /coin-back\.png/);
  assert.match(html, /Flipping the coin/);
});

test('the ceremony mounts a material-stamped coin and removes itself', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const { document } = dom.window;

  const done = playCoinFlipCeremony({
    coin: COIN,
    result: 'tails',
    winnerLabel: 'You go',
    revealMs: 5,
    // Wide hold so the 40 ms probe below lands mid-reveal even when the full suite starves timers.
    holdMs: 500,
    fadeMs: 5,
    doc: document,
  });

  const overlay = document.getElementById(COIN_FLIP_OVERLAY_ID);
  assert.ok(overlay, 'overlay should be mounted synchronously');
  const coinEl = overlay.querySelector('[data-coin-flip-el]');
  assert.equal(coinEl.dataset.coinMaterial, 'gold');

  await new Promise((resolve) => setTimeout(resolve, 40));

  const live = document.getElementById(COIN_FLIP_OVERLAY_ID);
  assert.ok(live, 'overlay should still be visible during the reveal');
  const resultEl = live.querySelector('.turn-order-coin-flip-result');
  assert.match(resultEl.textContent, /Tails! You go first\./);
  assert.ok(resultEl.classList.contains('visible'));
  assert.match(
    live.querySelector('[data-coin-flip-el]').getAttribute('style') || '',
    /1980deg/,
    'tails should land on the 5-tumble + 180deg offset'
  );

  await done;
  assert.equal(document.getElementById(COIN_FLIP_OVERLAY_ID), null);
  dom.window.close();
});

test('a second ceremony replaces any overlay still on screen', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const { document } = dom.window;

  const first = playCoinFlipCeremony({ coin: COIN, result: 'heads', revealMs: 5, holdMs: 5, fadeMs: 5, doc: document });
  const firstEl = document.getElementById(COIN_FLIP_OVERLAY_ID);
  const second = playCoinFlipCeremony({ coin: COIN, result: 'tails', revealMs: 5, holdMs: 5, fadeMs: 5, doc: document });

  assert.notEqual(document.getElementById(COIN_FLIP_OVERLAY_ID), firstEl);

  await Promise.all([first, second]);
  assert.equal(document.getElementById(COIN_FLIP_OVERLAY_ID), null);
  dom.window.close();
});

test('the coin commits its start angle before the spin target, so the tumble transitions', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const { document, HTMLElement } = dom.window;
  const flushes = [];
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      if (this.hasAttribute('data-coin-flip-el')) flushes.push(this.style.getPropertyValue('--coin-flip'));
      return 0;
    },
  });

  const done = playCoinFlipCeremony({ coin: COIN, result: 'heads', revealMs: 5, holdMs: 5, fadeMs: 5, doc: document });
  await done;

  // Without the flush the browser first styles the coin already at its end
  // angle and there is nothing to transition from: the coin never turns.
  assert.deepEqual(flushes, [''], 'style flushed once, before --coin-flip was set');
  dom.window.close();
});

test('several flips toss one after another in one overlay with a running tally', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const { document } = dom.window;
  let overlays = 0;
  const observer = new dom.window.MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.id === COIN_FLIP_OVERLAY_ID) overlays++;
    }
  });
  observer.observe(document.body, { childList: true });

  const done = playCoinFlipCeremony({
    coin: COIN,
    results: ['heads', 'tails', 'heads'],
    label: 'Your coin flip — Thunder Jolt',
    passive: true,
    revealMs: 5,
    // Landings at ~5/460/915 ms; the wide hold keeps the probe inside it under a starved suite.
    holdMs: 2000,
    fadeMs: 5,
    doc: document,
  });
  const overlay = document.getElementById(COIN_FLIP_OVERLAY_ID);
  assert.ok(overlay.classList.contains('passive'), 'an in-game flip lets clicks through');
  assert.match(overlay.querySelector('.turn-order-coin-flip-label').textContent, /Thunder Jolt/);
  assert.equal(overlay.querySelector('.turn-order-coin-flip-tally').textContent, 'Flipping 3 coins');

  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(overlay.querySelector('.turn-order-coin-flip-tally').textContent, '3 of 3 · 2 heads');
  assert.equal(overlay.querySelector('.turn-order-coin-flip-result').textContent, 'Heads!');
  assert.match(overlay.querySelector('[data-coin-flip-el]').getAttribute('style') || '', /5400deg/);

  await done;
  observer.disconnect();
  assert.equal(overlays, 1, 'one overlay for the whole run');
  assert.equal(document.getElementById(COIN_FLIP_OVERLAY_ID), null);
  dom.window.close();
});
