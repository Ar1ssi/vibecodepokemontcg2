import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { createPropBuilder } from '../stadium-env-props.mjs';
import { ASSET_NAMES, measureAsset, placeAsset, seededRandom } from '../stadium-kit-assets.mjs';

/**
 * The options each asset is swept over: the ones the boards pass, and past them both ways
 * (undefined: the asset's default).
 */
const OPTION_GRID = {
  treeRound: { size: [20, 40, 60, 90], height: [undefined, 50, 120, 200] },
  pine: { size: [20, 34, 50], height: [undefined, 60, 120], tiers: [2, 3, 4], snow: [false, true] },
  palm: { height: [80, 150, 220], lean: [0, 0.22, 0.45], fronds: [6, 8, 10] },
  bush: { size: [10, 26, 40], berries: [null, ['#ff0000']] },
  hedge: { size: [10, 18, 30], length: [30, 80, 160] },
  fern: { size: [10, 30, 50], fronds: [4, 5, 6, 7, 8] },
  tallGrass: { size: [10, 18, 24, 30, 40], blade: [10, 15, 16, 17, 22] },
  flowers: { size: [7, 16, 24], head: [3, 4.5, 6, 8], count: [3, 5, 6, 8, 10] },
  flowerBed: { size: [12, 30, 50], depth: [0.3, 0.6, 1, 1.4], head: [4, 6, 8] },
  ledgeRock: { size: [14, 30, 50], slabs: [1, 2, 3, 4] },
  bollard: { size: [4, 6, 9], height: [10, 16, 24] },
  boulder: { size: [10, 24, 40], height: [undefined, 10, 30], depth: [0.6, 0.8, 0.86, 1] },
  pebbles: { size: [8, 14, 24], count: [2, 4, 7] },
  spire: { size: [12, 26, 40], height: [undefined, 50, 120] },
  crystals: { size: [20, 40, 60], count: [3, 4, 5, 6, 7, 8] },
  mushroom: { size: [5, 9, 15] },
  stump: { size: [8, 14, 24], height: [undefined, 6, 20] },
  deadTree: { height: [50, 90, 150] },
  cloud: { size: [20, 50, 80], shadow: [false, true] },
  pokeBall: { size: [5, 10, 16] },
  beachBall: { size: [5, 9, 14] },
  starfish: { size: [5, 8, 12] },
  shell: { size: [4, 6, 9] },
  towel: { size: [30, 40, 60] },
  surfboard: { size: [40, 60, 80] },
  lamp: { height: [40, 70, 110], style: ['globe', 'lantern'] },
  bench: { size: [24, 40, 60] },
  parasol: { size: [20, 30, 45], height: [undefined, 40, 70], table: [true, false] },
  planter: { size: [10, 18, 30], plant: ['bush', 'tree', 'flowers', 'topiary'] },
  topiary: { size: [8, 16, 24], pot: [true, false] },
  fence: { path: [[[0, 0], [60, 0]], [[0, 0], [40, 30], [90, 30]]], height: [10, 16, 24], spacing: [10, 14, 20] },
  signpost: { size: [16, 24, 36] },
  gravestone: { size: [10, 16, 24], style: ['round', 'square'] },
  reeds: { size: [6, 10, 16], height: [18, 28, 40], count: [4, 7, 10] },
  lilyPad: { size: [6, 12, 20], bloom: [false, true] },
};
const combos = (grid) =>
  Object.entries(grid).reduce((all, [key, values]) => all.flatMap((o) => values.map((v) => (v === undefined ? { ...o } : { ...o, [key]: v }))), [{}]);
/** Seeds as the boards' own (seed × 997 and the like) and a few others. */
const SEEDS = [1, 38, 983, 991, 997, 1013];

test('every kit asset, over its options and seeds, builds finite geometry inside its measured reach and height', () => {
  assert.deepEqual(Object.keys(OPTION_GRID).sort(), [...ASSET_NAMES].sort(), 'every asset is swept');
  for (const name of ASSET_NAMES) {
    for (const options of combos(OPTION_GRID[name])) {
      for (const seed of SEEDS) {
        const props = createPropBuilder();
        const placed = { ...options, x: 300, y: -40, seed };
        const dims = placeAsset(props, name, placed);
        assert.deepEqual(dims, measureAsset(name, placed));
        const position = props.build(three).getAttribute('position');
        assert.ok(position.count > 0, name);
        const label = `${name} ${JSON.stringify(options)} seed ${seed}`;
        for (let i = 0; i < position.count; i += 1) {
          const [x, y, z] = [position.getX(i) - 300, position.getY(i) + 40, position.getZ(i)];
          assert.ok([x, y, z].every(Number.isFinite), `${label}: finite`);
          // Positions are float32: a vertex exactly on the reach may round a hair past it.
          assert.ok(Math.hypot(x, y) <= dims.reach + 1e-3, `${label}: vertex ${i} past its reach (${Math.hypot(x, y)} > ${dims.reach})`);
          assert.ok(z <= dims.height + 1e-3, `${label}: vertex ${i} above its height (${z} > ${dims.height})`);
        }
      }
    }
  }
  assert.throws(() => placeAsset(createPropBuilder(), 'castle'), /unknown Stadium kit asset/);
});

test('every kit asset builds the same geometry for the same seed', () => {
  for (const name of ASSET_NAMES) {
    const build = () => {
      const props = createPropBuilder();
      placeAsset(props, name, { x: 300, y: -40, seed: 5 });
      return Array.from(props.build(three).getAttribute('position').array);
    };
    assert.deepEqual(build(), build(), name);
  }
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
    // The linear green as given, only ever darkened in a crease between lumps.
    if (colour.getX(i) === 0 && colour.getZ(i) === 0 && colour.getY(i) > 0.3) sawGreen = true;
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
