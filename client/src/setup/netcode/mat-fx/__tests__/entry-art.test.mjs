import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEX_TINT_CELLS,
  HEX_WHITE_CELLS,
  hexPoints,
  hexTile,
  svgDataUrl,
} from '../entry-art.mjs';

const pointsOf = (str) =>
  str.split(' ').map((pair) => pair.split(',').map(Number));

test('hexPoints: six corners at the radius, pointy top', () => {
  const pts = pointsOf(hexPoints(10, 20, 5));
  assert.equal(pts.length, 6);
  for (const [x, y] of pts)
    assert.ok(Math.abs(Math.hypot(x - 10, y - 20) - 5) < 0.01);
  assert.deepEqual(pts[0], [10, 15], 'first corner straight up');
});

test('hexTile: tile size is whole lattice periods of the cell grid', () => {
  for (const cells of [HEX_WHITE_CELLS, HEX_TINT_CELLS]) {
    assert.equal(
      cells.length % 2,
      0,
      'offset rows need an even row count to tile'
    );
    const tile = hexTile(10, cells);
    assert.ok(
      Math.abs(tile.width - Math.sqrt(3) * 10 * cells[0].length) < 0.01
    );
    assert.equal(tile.height, 15 * cells.length);
  }
});

test('hexTile: cells cut by the tile edge are redrawn so the seams line up', () => {
  const cells = [
    ['#a', '#b'],
    ['#c', '#d'],
  ];
  const tile = hexTile(10, cells);
  assert.ok(tile.cells > 4, `edge cells repeated (${tile.cells} polygons)`);
  assert.equal((tile.svg.match(/fill='#a'/g) || []).length > 1, true);
});

test('hexTile: two layers with different periods share one lattice', () => {
  const white = hexTile(10, HEX_WHITE_CELLS);
  const tint = hexTile(10, HEX_TINT_CELLS);
  const colW = Math.sqrt(3) * 10;
  assert.ok(
    Math.abs(white.width / colW - Math.round(white.width / colW)) < 0.01
  );
  assert.ok(Math.abs(tint.width / colW - Math.round(tint.width / colW)) < 0.01);
  assert.notEqual(white.width, tint.width);
});

test('svgDataUrl: escapes characters that break a CSS url()', () => {
  const url = svgDataUrl(`<svg fill="#fff"></svg>`);
  assert.ok(url.startsWith('url("data:image/svg+xml,'));
  assert.ok(!/[<>#]/.test(url.slice(5, -2)));
  assert.equal(
    (url.match(/"/g) || []).length,
    2,
    'only the wrapping quotes remain'
  );
});
