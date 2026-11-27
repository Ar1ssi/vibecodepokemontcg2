// Design 092 psychic-fairy: the hoop coil and sky column maths, the star unit's corners, and the
// two drawers' use of a beat's hues.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoopCoilPose, skyColumnPose, strikeRank } from '../psychic-fairy-poses.mjs';
import { hoopCoil, skyColumn } from '../psychic-fairy-drawers.js';
import { starCorners, UNITS } from '../../materials/_units.js';
import { MATERIALS } from '../../materials/index.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { withDefaults } from '../../move-spec.mjs';
import { callsAreFinite, recordingContext, rgbOf } from '../../__tests__/recording-context.mjs';

const H = 100;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('hoopCoilPose: forms over the anchor, falls faster as it comes down, lands on it at `land`', () => {
  const p = { count: 4, height: 1.2, gap: 0.2, land: 0.6 };
  assert.ok(hoopCoilPose(0, H, p).every((hoop) => hoop.alpha === 0), 'it forms from nothing');
  const bottom = (s) => hoopCoilPose(s, H, p)[0].lift;
  assert.ok(near(bottom(0.001), 120, 0.1), 'it starts `height` up');
  assert.ok(bottom(0.1) - bottom(0.2) < bottom(0.4) - bottom(0.5), 'it accelerates');
  assert.ok(near(bottom(0.6), 0), 'it lands on the anchor');
  const hoops = hoopCoilPose(0.3, H, p);
  assert.ok(near(hoops[3].lift - hoops[0].lift, 3 * 0.2 * H), 'stacked `gap` apart');
});

test('hoopCoilPose: after landing the stack collapses onto the ground and ripples out, fading', () => {
  const p = { count: 4, r: 0.6, land: 0.6, spread: 2, squash: 0.3 };
  const collapsed = hoopCoilPose(0.75, H, p);
  assert.ok(collapsed.every((hoop) => hoop.lift < 1), 'collapsed by a quarter of the ripple');
  assert.ok(collapsed[3].rx > collapsed[0].rx, 'the upper hoops ripple farthest');
  const late = hoopCoilPose(0.99, H, p);
  assert.ok(late[3].rx > 0.6 * H * 1.8, 'out toward `spread` × r');
  assert.ok(late.every((hoop) => hoop.alpha < 0.01 && near(hoop.ry, hoop.rx * 0.3)), 'nearly gone, still a ring');
  assert.equal(late[0].landed > 0.9, true);
});

test('strikeRank: the shafts strike in a scattered order, each once', () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    const ranks = Array.from({ length: count }, (_, i) => strikeRank(i, count)).sort((a, b) => a - b);
    assert.deepEqual(ranks, Array.from({ length: count }, (_, i) => i), `count ${count}`);
  }
  assert.notDeepEqual([0, 1, 2, 3].map((i) => strikeRank(i, 4)), [0, 1, 2, 3], 'not left to right');
});

test('skyColumnPose: a shaft from the sky strikes down onto its foot, holds, then sinks and fades', () => {
  const p = { count: 1, height: 2, w: 0.2, from: 'above', beatMs: 600 };
  const struck = skyColumnPose(0.3, H, p)[0];
  assert.ok(near(struck.top, 30 - 200) && near(struck.bottom, 30), 'whole: from the sky to its foot');
  assert.equal(struck.alpha, 1);
  assert.ok(struck.foot > 0, 'its foot lights where it stands');
  const early = skyColumnPose(0.02, H, p)[0];
  assert.ok(early.bottom < struck.bottom && near(early.top, struck.top), 'it grows down from the sky');
  const late = skyColumnPose(0.95, H, p)[0];
  assert.ok(late.alpha < 0.1 && late.width < struck.width && late.top > struck.top, 'it thins and sinks as it fades');
});

test('skyColumnPose: a shaft rising out of the card erupts fast and breaks off upward', () => {
  const p = { count: 1, height: 2, from: 'below', beatMs: 600 };
  const erupted = skyColumnPose(0.08, H, p)[0];
  assert.ok(near(erupted.top, 30 - 200) && near(erupted.bottom, 30), 'whole within 8 % of its beat');
  const late = skyColumnPose(0.9, H, p)[0];
  assert.ok(late.bottom < erupted.bottom && near(late.ground, 30), 'its base climbs away; the light pool stays on the ground');
});

test('skyColumnPose: shafts stand across `spread`, strike `stagger` apart, and keep their row index', () => {
  const p = { count: 3, spread: 1, stagger: 120, from: 'above', beatMs: 600 };
  const first = skyColumnPose(0.05, H, p);
  assert.equal(first.length, 1, 'one has struck');
  assert.equal(first[0].index, 2, 'the first to strike is the one at the right (rank 0)');
  assert.ok(near(first[0].x, 50));
  const all = skyColumnPose(0.5, H, p);
  assert.deepEqual(all.map((shaft) => shaft.index), [0, 1, 2]);
  assert.deepEqual(all.map((shaft) => shaft.x), [-50, 0, 50]);
});

test('starCorners: ten corners, tips at r and notches at inner × r, the first straight up', () => {
  const corners = starCorners(10, 0.5);
  assert.equal(corners.length, 10);
  assert.ok(near(corners[0][0], 0) && near(corners[0][1], -10));
  corners.forEach(([x, y], k) => assert.ok(near(Math.hypot(x, y), k % 2 ? 5 : 10), `corner ${k}`));
});

test('the star unit draws in its palette, balanced, and nothing at r 0', () => {
  const palette = MATERIALS.fairy.palette;
  const rec = recordingContext();
  UNITS.star(rec.ctx, 50, 50, 12, 0, 0.4, palette);
  assert.equal(rec.state.depth, 0);
  assert.ok(rec.fills.count >= 3);
  assert.ok(callsAreFinite(rec.calls));
  const none = recordingContext();
  UNITS.star(none.ctx, 50, 50, 0, 0, 0.4, palette);
  assert.equal(none.calls.length, 0);
});

// Item i's material carries its own colour, so a drawing shows which item each piece used.
const HUED = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
const huedInfo = (drawer, params) => {
  const base = MATERIALS.psychic;
  const at = (i) => ({ ...base, palette: { ...base.palette, deep: HUED[i % 3], body: HUED[i % 3], hot: HUED[i % 3], core: HUED[i % 3] } });
  return {
    elapsedMs: 400,
    beatMs: 600,
    time: 1,
    seed: 3,
    material: base,
    materialAt: at,
    params: withDefaults(drawer, params),
  };
};
const lane = localLane(laneGeometry({ left: 300, top: 500, width: 140, height: 200 }, { left: 320, top: 260, width: 140, height: 200 }), { left: 100, top: 100 });
const huesDrawn = (rec) => new Set(rec.colours.map(rgbOf).filter(Boolean).map((rgb) => HUED.findIndex((h) => h.every((v, k) => v === rgb[k]))).filter((i) => i >= 0));

test('skyColumn: shaft i takes item i\'s colour, even while the shafts before it have not struck', () => {
  // Rank order for 3 shafts is [2, 0, 1]: early on only shaft 2 has struck. It must keep hue 2.
  const rec = recordingContext();
  skyColumn(rec.ctx, lane, 0.05, huedInfo('skyColumn', { count: 3, stagger: 120 }));
  assert.deepEqual([...huesDrawn(rec)], [2]);
  const all = recordingContext();
  skyColumn(all.ctx, lane, 0.5, huedInfo('skyColumn', { count: 3, stagger: 120 }));
  assert.deepEqual([...huesDrawn(all)].sort(), [0, 1, 2]);
  assert.ok(callsAreFinite(all.calls));
});

test('hoopCoil: hoop k takes item k\'s colour; nothing drawn before it forms or after its beat', () => {
  const rec = recordingContext();
  hoopCoil(rec.ctx, lane, 0.3, huedInfo('hoopCoil', { count: 3 }));
  assert.deepEqual([...huesDrawn(rec)].sort(), [0, 1, 2]);
  assert.ok(callsAreFinite(rec.calls));
  const unformed = recordingContext();
  hoopCoil(unformed.ctx, lane, 0, huedInfo('hoopCoil', { count: 3 }));
  assert.equal(unformed.calls.filter(([key]) => key === 'stroke').length, 0);
});
