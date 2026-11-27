import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FURNITURE,
  crackleArcs,
  domeEyes,
  domePose,
  furniturePose,
  hexRgb,
  hexesRgb,
  ribbonPaths,
  tornadoPose,
} from '../ghost-dark-dragon-poses.mjs';
import { laneGeometry } from '../../move-geometry.mjs';
import { DRAWERS } from '../../move-drawers.js';
import { DRAWER_PARAMS, tonguesAt, withDefaults } from '../../move-spec.mjs';
import { MATERIALS } from '../../materials/index.js';
import { recordingContext } from '../../__tests__/recording-context.mjs';

const lane = laneGeometry({ left: 300, top: 500, width: 140, height: 200 }, { left: 320, top: 160, width: 140, height: 200 });
const finite = (...values) => values.every(Number.isFinite);
const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

test('hexRgb: #RRGGBB to rgb, anything else the fallback', () => {
  assert.deepEqual(hexRgb('#FF8000'), [255, 128, 0]);
  assert.equal(hexRgb('red'), null);
  assert.deepEqual(hexRgb('#12345', [1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(hexesRgb(['#000000', '#FFFFFF'], 1, null), [255, 255, 255]);
  assert.deepEqual(hexesRgb(['#000000'], 1, null), [0, 0, 0], 'a short list repeats its last colour');
  assert.deepEqual(hexesRgb(null, 0, [9, 9, 9]), [9, 9, 9]);
});

test('furniturePose: one piece per count, every shape, all finite and deterministic', () => {
  const pieces = furniturePose(0.5, lane, { count: 7 }, 3);
  assert.equal(pieces.length, 7);
  assert.deepEqual(new Set(pieces.map((p) => p.piece)), new Set(FURNITURE));
  for (const p of pieces) assert.ok(finite(p.x, p.y, p.z, p.r, p.angleDeg, p.alpha), JSON.stringify(p));
  assert.deepEqual(furniturePose(0.5, lane, { count: 7 }, 3), pieces);
});

test('furniturePose: floats round the attacker, ends closing in on the defender', () => {
  const early = furniturePose(0.3, lane, { count: 6, float: 0.4, r0: 0.75 }, 1);
  for (const p of early) assert.ok(dist(p, lane.ax, lane.ay) < lane.h * 1.1, 'near the attacker while floating');
  const late = furniturePose(0.97, lane, { count: 6, r1: 0.8 }, 1);
  for (const p of late) assert.ok(dist(p, lane.bx, lane.by) < lane.h * 0.5, 'piled into the defender at the end');
  assert.ok(early.every((p) => p.z > 0.2), 'they hang in the air');
});

test('furniturePose: fades in at the start and is gone at contact', () => {
  assert.ok(furniturePose(0, lane, {}, 1).every((p) => p.alpha < 0.2));
  assert.ok(furniturePose(0.6, lane, {}, 1).every((p) => p.alpha > 0.95));
  assert.ok(furniturePose(0.999, lane, {}, 1).every((p) => p.alpha < 0.05));
});

test('domePose: rises with an overshoot, then fades, bursts or holds by its end', () => {
  const h = 200;
  const grown = domePose(0.1, h, { r: 0.8, grow: 0.2 });
  const full = domePose(0.4, h, { r: 0.8, grow: 0.2 });
  assert.ok(domePose(0.02, h, { r: 0.8 }).r < full.r, 'starts small');
  assert.ok(Math.abs(full.r - 0.8 * h) < 1e-6, 'settles at r');
  assert.ok(domePose(0.17, h, { r: 0.8, grow: 0.2 }).r > full.r, 'overshoots as it rises');
  assert.ok(grown.alpha > 0.5);
  assert.ok(domePose(0.999, h, { end: 'fade' }).alpha < 0.02, 'faded out by its end');
  const burst = domePose(0.88, h, { end: 'burst' });
  assert.ok(burst.flash > 0.5 && burst.r > full.r * 1.1, 'bursts open, swelling');
  assert.equal(domePose(0.5, h, { end: 'burst' }).flash, 0, 'no flash before it breaks');
  assert.equal(domePose(0.999, h, { end: 'hold' }).alpha, 1, 'a held dome is whole to its end');
});

test('domePose: veins grow toward the end and add to the arcs; eyes only when asked', () => {
  const p = { veins: 1, arcs: 0.2 };
  assert.equal(domePose(0.3, 200, p).veins, 0);
  assert.ok(domePose(0.85, 200, p).veins > 0.5);
  assert.ok(domePose(0.85, 200, p).arcs > domePose(0.3, 200, p).arcs);
  assert.equal(domePose(0.5, 200, { eyes: 0 }).eyes, 0);
  assert.ok(domePose(0.5, 200, { eyes: 3, grow: 0.1 }).eyes > 0.9);
  assert.equal(domeEyes(4, 2).length, 4);
  assert.deepEqual(domeEyes(4, 2), domeEyes(4, 2));
});

test('ribbonPaths: none before launch, along the lane mid-beat, wrapped and spent at the end', () => {
  assert.equal(ribbonPaths(0, lane, { count: 4 }, 1).length, 0);
  const mid = ribbonPaths(0.5, lane, { count: 4, stagger: 0 }, 1);
  assert.equal(mid.length, 4);
  for (const ribbon of mid) {
    assert.equal(ribbon.points.length, 41);
    assert.ok(ribbon.points.every((p) => finite(p.x, p.y, p.u)));
  }
  const head = mid[0].points.at(-1);
  assert.ok(dist(head, lane.ax, lane.ay) > lane.h * 0.3, 'the head has left the attacker');
  const late = ribbonPaths(0.95, lane, { count: 4, stagger: 0, wrap: 180 }, 1);
  for (const ribbon of late) {
    for (const p of ribbon.points) assert.ok(dist(p, lane.bx, lane.by) < lane.h * 0.8, 'wrapping the defender');
  }
  assert.equal(ribbonPaths(0.9999, lane, { count: 4, stagger: 0 }, 1).every((r) => r.points.length === 41), true);
});

test('tornadoPose: bands rise bottom-up, a funnel widening upward, and unwind at the end', () => {
  const h = 200;
  const p = { height: 1.5, r0: 0.3, r1: 1, bands: 6, fins: 2, debris: 4, crackle: 1 };
  const full = tornadoPose(0.5, h, p, 1.2, 3);
  assert.equal(full.bands.length, 6);
  assert.equal(full.fins.length, 2);
  assert.equal(full.debris.length, 4);
  assert.ok(full.bands[5].y > full.bands[0].y && full.bands[5].rx > full.bands[0].rx, 'wider as it rises');
  assert.ok(full.bands.every((b) => b.to > b.from && b.alpha > 0.9));
  assert.ok(full.crackle > 0.9);
  const early = tornadoPose(0.05, h, p, 0, 3);
  assert.ok(early.bands[5].alpha < early.bands[0].alpha || early.bands[5].alpha === 0, 'the top comes last');
  const late = tornadoPose(0.95, h, p, 1.2, 3);
  assert.ok(late.bands[3].rx > full.bands[3].rx, 'it widens as it unwinds');
  assert.ok(late.bands[3].to - late.bands[3].from < full.bands[3].to - full.bands[3].from, 'its bands shorten');
  assert.equal(tornadoPose(1, h, p, 2, 3).env, 0);
});

test('crackleArcs: standing spikes re-struck in steps', () => {
  const a = crackleArcs(5, 60, 100, 1);
  assert.equal(a.length, 5);
  assert.ok(a.every((spike) => spike.length === 6 && spike.at(-1).y > spike[0].y), 'each rises from its root');
  assert.deepEqual(crackleArcs(5, 60, 110, 1), a, 'the same within a step');
  assert.notDeepEqual(crackleArcs(5, 60, 150, 1), a, 'struck again in the next');
});

test('the four drawers: registered, costed, and drawing on a 2D context without elements', () => {
  const names = ['hauntedFurniture', 'darkDome', 'darkRibbons', 'wyrmTornado'];
  for (const name of names) {
    assert.ok(DRAWERS[name] && DRAWER_PARAMS[name], name);
    let fills = 0;
    for (const s of [0.1, 0.4, 0.7, 0.9]) {
      const rec = recordingContext();
      DRAWERS[name].draw(rec.ctx, lane, s, { elapsedMs: 300, beatMs: 1000, time: 0.3, seed: 4, material: MATERIALS.ghost, params: withDefaults(name, { eyes: 2, fins: 2, crackle: 1 }) });
      fills += rec.fills.count;
      assert.equal(rec.state.depth, 0, `${name} at ${s}`);
    }
    assert.ok(fills > 0, `${name} draws`);
  }
  assert.equal(tonguesAt('hauntedFurniture', { count: 5 }), 5);
  assert.equal(tonguesAt('darkRibbons', {}), 5);
  assert.equal(tonguesAt('wyrmTornado', { bands: 6, fins: 2 }), 8);
  assert.equal(tonguesAt('darkDome', {}), 0);
});

test('the dome emits its ink, shell and arcs as elements on a live GPU pass', () => {
  const emitted = [];
  const rec = recordingContext();
  rec.target.fxElements = { live: true, emit: (kind, params) => emitted.push([kind, params]) || true };
  rec.target.stagePoint = (x, y) => ({ x, y, z: 0 });
  rec.target.stageScale = () => 1;
  DRAWERS.darkDome.draw(rec.ctx, lane, 0.5, { elapsedMs: 500, beatMs: 1000, time: 0.5, seed: 2, material: MATERIALS.dark, params: withDefaults('darkDome', { eyes: 1, arcs: 0.5 }) });
  const kinds = emitted.map(([kind]) => kind);
  assert.ok(kinds.includes('smoke'), 'ink');
  assert.equal(kinds.filter((k) => k === 'plasma').length, 2, 'a shell and its arcs');
  assert.equal(kinds.filter((k) => k === 'flameJet').length, 2, 'a pair of flame-eyes over the ink');
});
