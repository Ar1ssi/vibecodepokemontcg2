// Design 083: clumps in place of an even scatter (stadium-env-clumps.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clumpPieces, scaledKinds } from '../stadium-env-clumps.mjs';
import { measureAsset } from '../stadium-kit-assets.mjs';

const area = { x: -900, y: -200, w: 1800, h: 1400 };
const mix = [
  { asset: 'fern', weight: 3, size: [50, 80], options: { fronds: 6 } },
  { asset: 'bush', weight: 2, size: [22, 36] },
  { asset: 'boulder', weight: 1, size: [12, 20] },
];
const card = { x: -300, y: 200, w: 600, h: 500 };
const fits = (x, y, reach) => Math.hypot(Math.max(card.x - x, 0, x - card.x - card.w), Math.max(card.y - y, 0, y - card.y - card.h)) >= reach + 14;

test('clumpPieces: pieces clear of the cards, spaced, sized from their kind, with true dims', () => {
  const pieces = clumpPieces(area, { step: 180, mix, fits, cap: 60, salt: 3 });
  assert.ok(pieces.length >= 12, `${pieces.length} pieces`);
  for (const piece of pieces) {
    assert.ok(fits(piece.x, piece.y, piece.reach), 'clear of the card');
    const kind = mix.find((k) => k.asset === piece.asset);
    assert.ok(piece.size <= kind.size[1] + 1e-9 && piece.size >= kind.size[0] * 0.45 - 1e-9, `${piece.asset} size ${piece.size}`);
    const dims = measureAsset(piece.asset, { ...kind.options, size: piece.size });
    assert.equal(piece.reach, dims.reach);
    assert.equal(piece.height, dims.height);
  }
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const [a, b] = [pieces[i], pieces[j]];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= (a.reach + b.reach) * 0.85 - 1e-9, 'spaced');
    }
  }
  assert.ok(new Set(pieces.map((p) => p.asset)).size >= 2, 'mixed kinds');
  assert.deepEqual(clumpPieces(area, { step: 180, mix, fits, cap: 60, salt: 3 }), pieces, 'deterministic');
});

test('clumpPieces: they gather — satellites sit by their hero, and heroes are fewer than all pieces', () => {
  const pieces = clumpPieces(area, { step: 180, mix, fits, cap: 80, salt: 5 });
  const heroes = pieces.filter((p) => p.hero);
  assert.ok(heroes.length > 0 && heroes.length < pieces.length * 0.6, `${heroes.length} heroes of ${pieces.length}`);
  for (const piece of pieces.filter((p) => !p.hero)) {
    const nearest = Math.min(...heroes.map((h) => Math.hypot(h.x - piece.x, h.y - piece.y)));
    assert.ok(nearest < 220, `a satellite within its clump (${nearest})`);
  }
});

test('clumpPieces: the cap, the taken spots and bad input', () => {
  assert.ok(clumpPieces(area, { step: 120, mix, fits, cap: 7, salt: 1 }).length <= 7);
  const taken = [{ x: 0, y: 900, r: 400 }];
  for (const piece of clumpPieces(area, { step: 150, mix, fits, cap: 50, salt: 2, taken })) {
    assert.ok(Math.hypot(piece.x, piece.y - 900) >= (400 + piece.reach) * 0.85 - 1e-9, 'off the taken spot');
  }
  assert.deepEqual(clumpPieces(null, { step: 100, mix, fits }), []);
  assert.deepEqual(clumpPieces(area, { step: 0, mix, fits }), []);
  assert.deepEqual(clumpPieces(area, { step: 100, mix: [], fits }), []);
  assert.deepEqual(clumpPieces(area, { step: 100, mix }), []);
});

test('scaledKinds: sizes, flower heads and grass blades (given or the asset\'s default) at the card scale', () => {
  const [fern, flowers, grass, bed] = scaledKinds(
    [
      { asset: 'fern', size: [40, 60], options: { fronds: 5 } },
      { asset: 'flowers', size: [10, 14] },
      { asset: 'tallGrass', size: [12, 18], options: { blade: 14 } },
      { asset: 'flowerBed', size: [16, 24], options: { head: 7 } },
    ],
    0.5
  );
  assert.deepEqual(fern, { asset: 'fern', size: [20, 30], options: { fronds: 5 } });
  assert.deepEqual(flowers.options, { head: 3 });
  assert.deepEqual(grass.options, { blade: 7 });
  assert.deepEqual(bed.options, { head: 3.5 });
  assert.deepEqual(scaledKinds([{ asset: 'bush', size: [10, 20] }], NaN)[0].size, [10, 20], 'a bad scale is 1');
});
