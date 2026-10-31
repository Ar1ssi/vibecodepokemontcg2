import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { createPropBuilder } from '../stadium-env-props.mjs';
import { ASSET_NAMES, measureAsset, placeAsset, seededRandom } from '../stadium-kit-assets.mjs';

test('every kit asset builds finite geometry inside its measured reach and height, the same for the same seed', () => {
  for (const name of ASSET_NAMES) {
    const options = { x: 300, y: -40, seed: 5 };
    const props = createPropBuilder();
    const dims = placeAsset(props, name, options);
    assert.deepEqual(dims, measureAsset(name, options));
    const position = props.build(three).getAttribute('position');
    assert.ok(position.count > 0, name);
    for (let i = 0; i < position.count; i += 1) {
      const [x, y, z] = [position.getX(i) - 300, position.getY(i) + 40, position.getZ(i)];
      assert.ok([x, y, z].every(Number.isFinite), `${name}: finite`);
      // Positions are float32: a vertex exactly on the reach may round a hair past it.
      assert.ok(Math.hypot(x, y) <= dims.reach + 1e-3, `${name}: vertex ${i} past its reach (${Math.hypot(x, y)} > ${dims.reach})`);
      if (name !== 'cloud') assert.ok(z <= dims.height * 1.02 + 1e-3, `${name}: vertex ${i} above its height (${z} > ${dims.height})`);
    }
    const again = createPropBuilder();
    placeAsset(again, name, options);
    assert.deepEqual(Array.from(again.build(three).getAttribute('position').array), Array.from(position.array), `${name}: deterministic`);
  }
  assert.throws(() => placeAsset(createPropBuilder(), 'castle'), /unknown Stadium kit asset/);
});

test('placeAsset: shadows: false casts none; the palette takes a #hex or a linear colour', () => {
  const shaded = createPropBuilder();
  placeAsset(shaded, 'treeRound', { size: 40 });
  assert.ok(shaded.shadowCount() > 0);
  const bare = createPropBuilder();
  placeAsset(bare, 'treeRound', { size: 40, shadows: false });
  assert.equal(bare.shadowCount(), 0);
  const hex = createPropBuilder();
  placeAsset(hex, 'boulder', { size: 20, colors: { body: '#ff0000', light: [0, 1, 0, 0], dark: '#0000ff' } });
  const colour = hex.build(three).getAttribute('aColor');
  let sawRed = false;
  let sawGreen = false;
  for (let i = 0; i < colour.count; i += 1) {
    if (colour.getX(i) > 0.5 && colour.getY(i) < 0.1) sawRed = true;
    if (colour.getY(i) === 1 && colour.getX(i) === 0) sawGreen = true;
  }
  assert.ok(sawRed && sawGreen);
});

test('seededRandom: the same seed gives the same stream, in 0..1', () => {
  const a = seededRandom(3);
  const b = seededRandom(3);
  for (let i = 0; i < 50; i += 1) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(seededRandom(4)(), seededRandom(3)());
});
