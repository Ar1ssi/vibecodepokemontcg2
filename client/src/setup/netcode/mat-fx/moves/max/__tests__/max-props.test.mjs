import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROP_KINDS, PROP_WIDTH, propPose, tornadoPose, vinePose } from '../max-props.mjs';
import { butterflyUnit } from '../max-drawers-gbf.js';
import { DRAWERS } from '../../move-drawers.js';
import { laneGeometry, localLane } from '../../move-geometry.mjs';
import { MATERIALS } from '../../materials/index.js';
import { UNITS } from '../../materials/_units.js';
import { UNIT_NAMES, withDefaults } from '../../move-spec.mjs';
import { recordingContext } from '../../__tests__/recording-context.mjs';

const H = 100;
const steps = (n = 50) => Array.from({ length: n }, (_, i) => i / n);

test('propPose: buried at the start, standing mid-beat, sunk again at the end', () => {
  const at = (s) => propPose(s, H, 3, { count: 3, grow: 0.2, stagger: 0.05, sink: 0.25 });
  assert.ok(at(0).every((p) => p.rise === 0 && p.alpha === 0));
  assert.ok(at(0.5).every((p) => Math.abs(p.rise - 1) < 1e-9 && p.alpha === 1));
  assert.ok(at(0.9999).every((p) => p.rise < 0.01 && p.alpha < 0.01));
});

test('propPose: each prop bounces a little over its height as it comes up', () => {
  const peak = Math.max(...steps(200).map((s) => propPose(s, H, 1, { count: 1, grow: 0.2 })[0].rise));
  assert.ok(peak > 1.02 && peak < 1.2, `peak ${peak}`);
});

test('propPose: props stand on a ring round the card, clear of it, far ones first', () => {
  const props = propPose(0.5, H, 9, { count: 5, spread: 0.85, arc: [150, 390] });
  assert.equal(props.length, 5);
  for (let i = 1; i < props.length; i += 1) assert.ok(props[i].y >= props[i - 1].y, 'sorted far to near');
  for (const p of props) {
    const outside = Math.abs(p.x) > 0.36 * H || p.y < -0.5 * H || p.y > 0.5 * H;
    assert.ok(outside || Math.hypot(p.x / 0.85, p.y / (0.85 * 0.62)) > 0.99 * H, `prop at (${p.x}, ${p.y})`);
  }
});

test('propPose: an outward tilt leans each prop away from the card', () => {
  for (const p of propPose(0.5, H, 4, { count: 4, arc: [180, 360], tilt: 20 })) {
    if (Math.abs(p.x) < 1) continue;
    assert.equal(Math.sign(p.lean), Math.sign(p.x), `lean ${p.lean} at x ${p.x}`);
  }
});

test('propPose: deterministic for a seed; widths follow each kind', () => {
  assert.deepEqual(propPose(0.4, H, 7), propPose(0.4, H, 7));
  for (const kind of PROP_KINDS) assert.ok(PROP_WIDTH[kind] > 0, kind);
});

test('vinePose: rears out, lashes onto the defender just after whipAt, is drawn back', () => {
  assert.ok(vinePose(0.3).f < 0.8);
  assert.ok(vinePose(0.3).bow > vinePose(0.6).bow, 'it arches wide while it rears');
  assert.ok(Math.abs(vinePose(0.6).f - 1) < 1e-9, 'lashed onto the defender');
  assert.ok(vinePose(0.6).lashed > 0.99);
  assert.ok(vinePose(0.999).alpha < 0.01);
  assert.equal(vinePose(0).alpha, 0);
});

test('tornadoPose: grows out of the attacker, reaches the defender, unwinds from its tail', () => {
  const grow = tornadoPose(0.15, H, { growIn: 0.35 });
  assert.equal(grow.tail, 0);
  assert.ok(grow.head > 0.3 && grow.head < 1);
  const held = tornadoPose(0.55, H, { growIn: 0.35, retract: 0.3 });
  assert.ok(Math.abs(held.head - 1) < 1e-9 && held.tail === 0);
  const unwinding = tornadoPose(0.9, H, { retract: 0.3 });
  assert.ok(unwinding.tail > 0.2);
  assert.equal(tornadoPose(1, H).rings.length, 0, 'gone at its end');
});

test('tornadoPose: rings flare toward the defender and fade where the tube ends', () => {
  const { rings } = tornadoPose(0.55, H, { rings: 9, w: 0.6 });
  assert.equal(rings.length, 9);
  assert.ok(rings[8].r > rings[0].r);
  for (const ring of rings) assert.ok(ring.alpha >= 0 && ring.alpha <= 1);
});

const lane = localLane(laneGeometry({ left: 300, top: 500, width: 140, height: 200 }, { left: 320, top: 260, width: 140, height: 200 }), { left: 100, top: 100 });
const info = (drawer, params, material = MATERIALS.grass) => ({ elapsedMs: 400, beatMs: 1000, time: 1.1, seed: 5, material, params: withDefaults(drawer, params), spec: { id: 'probe' } });

test('every prop kind draws solid matter, stood off its foot, clipped at the ground line', () => {
  for (const kind of PROP_KINDS) {
    const rec = recordingContext();
    DRAWERS.prop.draw(rec.ctx, lane, 0.5, info('prop', { kind, count: 3, grass: true }));
    const fills = rec.calls.filter(([key]) => key === 'fill').length;
    assert.ok(fills >= 3, `${kind} fills ${fills}`);
    assert.ok(rec.calls.some(([key]) => key === 'clip'), `${kind} clips at the ground`);
    assert.equal(rec.state.depth, 0);
  }
});

test('vine and tornado draw mid-beat and nothing out of range', () => {
  for (const [drawer, material] of [['vine', MATERIALS.petal], ['tornado', MATERIALS.flying]]) {
    const rec = recordingContext();
    DRAWERS[drawer].draw(rec.ctx, lane, 0.5, info(drawer, {}, material));
    assert.ok(rec.calls.filter(([key]) => key === 'stroke' || key === 'fill').length > 4, drawer);
    const none = recordingContext();
    DRAWERS[drawer].draw(none.ctx, lane, 1, info(drawer, {}, material));
    assert.equal(none.calls.length, 0, drawer);
  }
});

test('the tornado draws each ring as filled sheets, and streak sheets only when asked', () => {
  const fillsOf = (params) => {
    const rec = recordingContext();
    DRAWERS.tornado.draw(rec.ctx, lane, 0.55, info('tornado', { rings: 6, ...params }, MATERIALS.flying));
    return rec.calls.filter(([key]) => key === 'fill').length;
  };
  assert.ok(fillsOf({}) >= 6 * 3, 'three sheets a ring');
  assert.equal(fillsOf({ streak: true }), fillsOf({}), 'a streak recolours a sheet, it adds none');
});

test('the butterfly unit is registered, draws its wings and leaves the context balanced', () => {
  assert.ok(UNIT_NAMES.includes('butterfly'));
  assert.equal(UNITS.butterfly, butterflyUnit);
  const rec = recordingContext();
  butterflyUnit(rec.ctx, 10, 10, 8, 30, 0.4, MATERIALS.bug.palette);
  assert.ok(rec.calls.filter(([key]) => key === 'fill').length >= 5);
  assert.equal(rec.state.depth, 0);
  const none = recordingContext();
  butterflyUnit(none.ctx, 10, 10, 0, 30, 0.4, MATERIALS.bug.palette);
  assert.equal(none.calls.length, 0);
});
