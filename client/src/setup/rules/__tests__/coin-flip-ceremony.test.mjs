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
    /1620deg/,
    'tails should land on the 4-tumble + 180deg offset'
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
