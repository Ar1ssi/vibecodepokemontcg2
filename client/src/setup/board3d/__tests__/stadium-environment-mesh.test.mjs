import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatLayout } from '../board-layout.mjs';
import { tableBounds } from '../table-uv.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { craterBowl, mountainPeaks } from '../stadium-environment-layout.mjs';
import { strikePath, strikePower } from '../stadium-environment-mesh.js';

// The no-mat profile the board draws by default, at the board width board3d.js lays out beside the
// sidebox (0.755 of 1920).
const layout = flatLayout(getMatLayout(NO_MAT_LAYOUT_ID), { w: 1449.6, h: 540 });
const bowl = craterBowl(layout);
const peaks = mountainPeaks(layout, bowl);
const table = tableBounds(layout);

test('strikePower: a full first stroke, two fainter return strokes, nothing outside the strike', () => {
  assert.equal(strikePower(0), 1);
  assert.equal(strikePower(-0.01), 0);
  assert.equal(strikePower(0.61), 0);
  assert.equal(strikePower(Number.NaN), 0);
  assert.ok(strikePower(0.13) > strikePower(0.125), 'the first return stroke flares');
  assert.ok(strikePower(0.27) > strikePower(0.265), 'the second return stroke flares');
  assert.ok(strikePower(0.13) < 1 && strikePower(0.27) < 1);
});

test('strikePath falls onto a summit from over the crater, or arcs low over the cloud sea inside the table', () => {
  const summits = [peaks.left, peaks.right];
  let onPeaks = 0;
  let arcs = 0;
  for (let index = 0; index < 300; index += 1) {
    for (const slot of [0, 1]) {
      const path = strikePath(index, slot, { bowl, peaks }, table);
      if (!path) continue;
      assert.deepEqual(strikePath(index, slot, { bowl, peaks }, table), path, 'the same strike every frame');
      const summit = summits.find((peak) => peak.x === path.to.x && peak.y === path.to.y);
      if (summit) {
        onPeaks += 1;
        assert.equal(path.to.z, summit.h);
        assert.ok(path.from.z > summit.h, 'from the storm above');
        const fromCentre = Math.hypot(path.from.x - bowl.x, path.from.y - bowl.y);
        assert.ok(fromCentre < Math.hypot(summit.x - bowl.x, summit.y - bowl.y), 'from the crater side of the peak');
        continue;
      }
      arcs += 1;
      for (const end of [path.from, path.to]) {
        assert.ok(end.x > table.x && end.x < table.x + table.w && end.y > table.y && end.y < table.y + table.h, 'over the table');
        assert.ok(Math.hypot(end.x - bowl.x, end.y - bowl.y) >= bowl.rim + 90, 'out over the cloud sea');
        assert.ok(end.z > 0, 'above the cloud sea');
      }
    }
  }
  assert.ok(onPeaks > 0 && arcs > 0, `${onPeaks} peak strikes, ${arcs} arcs`);
});

test('strikePath is null without a mountain, and arcs need the table', () => {
  assert.equal(strikePath(0, 0, { bowl: null, peaks }, table), null);
  for (let index = 0; index < 50; index += 1) {
    const path = strikePath(index, 0, { bowl, peaks: { left: null, right: null } }, null);
    assert.equal(path, null);
  }
});
