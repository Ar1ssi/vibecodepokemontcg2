import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COIN_LIGHT,
  applyCoinEffect,
  coinEffectLayerMarkup,
  coinMaskUrl,
  coinSpinTiltY,
  startCoinDrift,
  stopCoinDrift,
  computeCoinLight,
  resolveCoinEffect,
} from '../coin-effects.mjs';

test('resolveCoinEffect maps known materials and falls back for unknown ones', () => {
  assert.deepEqual(resolveCoinEffect({ material: 'gold' }), {
    material: 'gold',
    finish: 'standard',
  });
  assert.equal(resolveCoinEffect({ material: 'GOLD' }).material, 'gold');
  assert.equal(
    resolveCoinEffect({ material: 'unobtainium' }).material,
    'enamel'
  );
  assert.equal(resolveCoinEffect({}).material, 'enamel');
  assert.equal(resolveCoinEffect(null).material, 'enamel');
});

test('resolveCoinEffect derives the surface finish from the description', () => {
  assert.equal(
    resolveCoinEffect({ description: 'Purple Mirror Holofoil Coin' }).finish,
    'mirror'
  );
  assert.equal(
    resolveCoinEffect({ description: 'Regular-sized Holofoil Coin' }).finish,
    'holofoil'
  );
  assert.equal(
    resolveCoinEffect({ description: 'Holo foil, green' }).finish,
    'holofoil'
  );
  assert.equal(
    resolveCoinEffect({ description: 'Plain enamel' }).finish,
    'standard'
  );
  assert.equal(resolveCoinEffect({ name: 'Gold Pikachu' }).finish, 'standard');
  // mirror outranks the holofoil wording that is usually also present
  assert.equal(
    resolveCoinEffect({ description: 'Blue Mirror Holofoil, mirror finish' })
      .finish,
    'mirror'
  );
});

test('coinMaskUrl accepts same-origin and data URLs, rejects unsafe input', () => {
  const origin = 'https://app.test';
  assert.equal(
    coinMaskUrl('src/assets/coins/x.png', origin),
    'https://app.test/src/assets/coins/x.png'
  );
  assert.equal(
    coinMaskUrl('https://app.test/a.png', origin),
    'https://app.test/a.png'
  );
  assert.equal(
    coinMaskUrl('data:image/png;base64,AAAA', origin),
    'data:image/png;base64,AAAA'
  );
  assert.equal(coinMaskUrl('https://cdn.other.test/a.png', origin), null);
  assert.equal(coinMaskUrl('src/assets/coins/x.png'), null);
  assert.equal(coinMaskUrl(''), null);
  assert.equal(coinMaskUrl(null), null);
  assert.equal(coinMaskUrl('a".png', origin), null);
  assert.equal(coinMaskUrl('a b.png', origin), null);
  assert.equal(coinMaskUrl('a\n.png', origin), null);
  assert.equal(coinMaskUrl('ftp://app.test/a.png', origin), null);
});

test('computeCoinLight clamps input and slides the highlight away from the tilt', () => {
  assert.deepEqual(computeCoinLight(), {
    x: COIN_LIGHT.originX,
    y: COIN_LIGHT.originY,
    tiltAmount: 0,
  });
  // pointer/tilt to the right pushes the fixed-light highlight left
  assert.equal(computeCoinLight({ tiltX: 1 }).x, 0);
  assert.equal(computeCoinLight({ tiltX: -1 }).x, 88);
  // out-of-range and non-finite tilt are clamped / treated as 0
  assert.equal(computeCoinLight({ tiltX: 5 }).x, 0);
  assert.equal(computeCoinLight({ tiltX: NaN }).x, COIN_LIGHT.originX);
  assert.equal(computeCoinLight({ tiltY: Infinity }).y, COIN_LIGHT.originY);
  assert.equal(computeCoinLight({ tiltX: 1 }).tiltAmount, 0.707);
});

test('coinEffectLayerMarkup emits the four layers with the requested tag', () => {
  const html = coinEffectLayerMarkup('div');
  for (const cls of ['coin__env', 'coin__spec', 'coin__holo', 'coin__grain']) {
    assert.ok(html.includes(`<div class="${cls}"></div>`), cls);
  }
});

test('applyCoinEffect stamps material/finish and the relief mask', () => {
  const makeEl = () => ({
    dataset: {},
    classList: {
      set: new Set(),
      add(c) {
        this.set.add(c);
      },
      remove(...cs) {
        for (const c of cs) this.set.delete(c);
      },
      contains(c) {
        return this.set.has(c);
      },
    },
    style: {
      props: {},
      setProperty(k, v) {
        this.props[k] = v;
      },
      removeProperty(k) {
        delete this.props[k];
      },
    },
  });

  const el = makeEl();
  el.classList.add('coin-mat-gold');
  const out = applyCoinEffect(
    el,
    {
      material: 'metal',
      description: 'Metal Holofoil Coin',
      thumb: 'https://app.test/c.png',
    },
    'https://app.test'
  );
  assert.deepEqual(out, { material: 'metal', finish: 'holofoil' });
  assert.equal(el.dataset.coinMaterial, 'metal');
  assert.equal(el.dataset.coinFinish, 'holofoil');
  assert.ok(el.classList.contains('coin-mat-metal'));
  assert.ok(!el.classList.contains('coin-mat-gold'));
  assert.equal(el.dataset.coinRelief, 'true');
  assert.equal(
    el.style.props['--coin-relief'],
    'url("https://app.test/c.png")'
  );

  // no usable thumb -> no relief mask, and a stale one is cleared
  const el2 = makeEl();
  el2.dataset.coinRelief = 'true';
  el2.style.props['--coin-relief'] = 'url("old")';
  applyCoinEffect(el2, { material: 'enamel' });
  assert.equal(el2.dataset.coinRelief, undefined);
  assert.equal(el2.style.props['--coin-relief'], undefined);
  assert.equal(applyCoinEffect(null, {}), null);
});

test('coinSpinTiltY reads the sine of the coin rotateX from a computed transform', () => {
  const quarter = Math.PI / 2;
  // perspective(700px) rotateX(90deg): m22 = cos, m23 = sin, m24 = -sin/700.
  const m3d = `matrix3d(1, 0, 0, 0, 0, ${Math.cos(quarter)}, ${Math.sin(quarter)}, -0.00142857, 0, -1, 0, 0, 0, 0, 0, 1)`;
  assert.ok(Math.abs(coinSpinTiltY(m3d) - 1) < 1e-9);
  assert.ok(Math.abs(coinSpinTiltY('matrix(1, -0.5, 0.5, 1, 0, 0)') + 0.5) < 1e-9);
  assert.equal(coinSpinTiltY('none'), 0);
  assert.equal(coinSpinTiltY(''), 0);
  assert.equal(coinSpinTiltY(undefined), 0);
  assert.equal(coinSpinTiltY('matrix3d(garbage)'), 0);
});

test('startCoinDrift with followSpin moves the light with the coin face', () => {
  const frames = [];
  let transform = 'none';
  const style = new Map();
  const view = {
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ transform }),
  };
  const el = { ownerDocument: { defaultView: view }, style: { setProperty: (k, v) => style.set(k, v) } };

  startCoinDrift(el, { followSpin: true });
  frames.shift()(0);
  const flatY = style.get('--coin-light-y');
  // rotateX(-90deg): the idle drift already leans the light toward the top edge, so turn the other way.
  transform = 'matrix3d(1, 0, 0, 0, 0, 0, -1, 0.00142857, 0, 1, 0, 0, 0, 0, 0, 1)';
  frames.shift()(0);
  assert.notEqual(style.get('--coin-light-y'), flatY, 'a face turned edge-on moves the highlight');

  stopCoinDrift(el);
  assert.equal(frames.length, 1, 'the loop requested one more frame before it stopped');
  const before = style.get('--coin-light-y');
  transform = 'none';
  frames.shift()(0);
  assert.equal(style.get('--coin-light-y'), before, 'a stopped loop no longer writes the light');
});
