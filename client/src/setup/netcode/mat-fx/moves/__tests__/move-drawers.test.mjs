import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAWERS } from '../move-drawers.js';
import { laneGeometry, localLane, skyLane } from '../move-geometry.mjs';
import { MATERIALS } from '../materials/index.js';
import { DRAWER_PARAMS, tonguesAt, withDefaults } from '../move-spec.mjs';
import { kitchenSink } from '../specs/__fixtures__/kitchen-sink.mjs';
import { callsAreFinite, recordingContext } from './recording-context.mjs';

const from = { left: 300, top: 500, width: 140, height: 200 };
const to = { left: 320, top: 260, width: 140, height: 200 };
const lane = localLane(laneGeometry(from, to), { left: 100, top: 100 });
const info = (drawer, over = {}) => ({
  elapsedMs: 400,
  beatMs: 600,
  time: 1.1,
  seed: 5,
  material: MATERIALS.fire,
  params: withDefaults(drawer, over),
  spec: kitchenSink,
});

// A glyph needs a material sigil, which fire does not have (design: glyph draws nothing then).
const DRAWS_NOTHING_ON_FIRE = new Set(['glyph']);

test('the registry has exactly the drawers of DRAWER_PARAMS, each with draw / check / tonguesAt', () => {
  assert.deepEqual(Object.keys(DRAWERS).sort(), Object.keys(DRAWER_PARAMS).sort());
  for (const [name, drawer] of Object.entries(DRAWERS)) {
    assert.equal(typeof drawer.draw, 'function', name);
    assert.deepEqual(drawer.check({}), [], name);
    assert.equal(drawer.tonguesAt({}), tonguesAt(name, {}), name);
    assert.ok(drawer.check({ nonsense: 1 }).length > 0, name);
  }
});

test('every drawer draws finite coordinates mid-beat, with balanced save/restore and the filter reset', () => {
  for (const name of Object.keys(DRAWERS)) {
    for (const s of [0.05, 0.3, 0.5, 0.8, 0.97]) {
      const rec = recordingContext();
      DRAWERS[name].draw(rec.ctx, lane, s, info(name));
      assert.ok(callsAreFinite(rec.calls), `${name} at ${s}`);
      assert.equal(rec.state.depth, 0, `${name} save/restore at ${s}`);
      assert.equal(rec.target.filter, 'none', `${name} filter at ${s}`);
      assert.deepEqual(rec.state.composite, [], `${name} must not set the composite operation`);
    }
  }
});

test('every drawer draws something at some point of its beat (a glyph needs a sigil)', () => {
  for (const name of Object.keys(DRAWERS)) {
    let drawn = 0;
    for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const rec = recordingContext();
      DRAWERS[name].draw(rec.ctx, lane, s, info(name));
      drawn += rec.calls.filter(([key]) => key !== 'save' && key !== 'restore').length;
    }
    assert.equal(drawn > 0, !DRAWS_NOTHING_ON_FIRE.has(name), name);
  }
});

test('a drawer draws nothing when the beat progress is out of range', () => {
  for (const name of Object.keys(DRAWERS)) {
    for (const s of [-0.1, 1, 1.5, Number.NaN]) {
      const rec = recordingContext();
      DRAWERS[name].draw(rec.ctx, lane, s, info(name));
      assert.equal(rec.calls.length, 0, `${name} at ${s}`);
    }
  }
});

test('orbitCharge draws each half on its own layer and both together', () => {
  const bodies = (half) => {
    const rec = recordingContext();
    DRAWERS.orbitCharge.draw(rec.ctx, lane, 0.5, info('orbitCharge', { half }));
    return rec.calls.filter(([key]) => key === 'createRadialGradient').length;
  };
  assert.ok(bodies('back') > 0 && bodies('front') > 0);
  assert.equal(bodies('both'), bodies('back') + bodies('front'));
});

test('smoke draws nothing for a material without smoke', () => {
  const rec = recordingContext();
  DRAWERS.smoke.draw(rec.ctx, lane, 0.5, { ...info('smoke'), material: { ...MATERIALS.fire, smoke: null } });
  assert.equal(rec.calls.filter(([key]) => key !== 'save' && key !== 'restore').length, 0);
});

test('a glyph draws through the material sigil when it has one', () => {
  const sigils = [];
  const material = { ...MATERIALS.fire, sigil: (...args) => sigils.push(args) };
  const rec = recordingContext();
  DRAWERS.glyph.draw(rec.ctx, lane, 0.5, { ...info('glyph'), material });
  assert.equal(sigils.length, 1);
  assert.ok(sigils[0].slice(1, 4).every(Number.isFinite));
});

test('the defender-targeted drawers centre on the defender, the attacker-targeted on the attacker', () => {
  const centreOfFirstCall = (name, params) => {
    const rec = recordingContext();
    DRAWERS[name].draw(rec.ctx, lane, 0.5, info(name, params));
    return rec.calls.find(([key]) => key === 'arc')?.[1].slice(0, 2);
  };
  assert.deepEqual(centreOfFirstCall('vignette', { target: 'defender' }), [lane.bx, lane.by]);
  assert.deepEqual(centreOfFirstCall('vignette', { target: 'attacker' }), [lane.ax, lane.ay]);
});

test('the kitchen sink plays every drawer on fire without throwing', () => {
  for (const beat of kitchenSink.beats) {
    for (const s of [0.2, 0.6]) {
      const rec = recordingContext();
      assert.doesNotThrow(() => DRAWERS[beat.drawer].draw(rec.ctx, lane, s, info(beat.drawer, beat.params)), beat.drawer);
    }
  }
});

test('a drawer that throws still restores the context state', () => {
  const rec = recordingContext();
  const exploding = { ...MATERIALS.fire, tongue: () => { throw new Error('boom'); } };
  assert.throws(() => DRAWERS.splash.draw(rec.ctx, lane, 0.5, { ...info('splash'), material: exploding }), /boom/);
  assert.equal(rec.state.depth, 0);
  assert.equal(rec.target.filter, 'none');
});

test('a volley from the defender flies back up the lane toward the attacker (drains)', () => {
  const firstBody = (from, s) => {
    const projectiles = [];
    const material = { ...MATERIALS.fire, projectile: (_ctx, ball) => projectiles.push(ball) };
    const params = { count: 2, stagger: 30, from };
    DRAWERS.volley.draw(recordingContext().ctx, lane, s, { ...info('volley', params), material });
    return projectiles[0];
  };
  const distance = (ball, x, y) => Math.hypot(ball.x - x, ball.y - y);
  const outbound = firstBody('attacker', 0.05);
  const drain = firstBody('defender', 0.05);
  assert.ok(distance(outbound, lane.ax, lane.ay) < distance(outbound, lane.bx, lane.by), 'outbound starts at the attacker');
  assert.ok(distance(drain, lane.bx, lane.by) < distance(drain, lane.ax, lane.ay), 'drain starts at the defender');
  assert.ok(Math.abs((((drain.headingDeg - outbound.headingDeg) % 360) + 360) % 360 - 180) < 1e-9, 'drain heads the other way');
  const late = firstBody('defender', 0.6);
  assert.ok(distance(late, lane.ax, lane.ay) < distance(drain, lane.ax, lane.ay), 'drain closes on the attacker');
});

test('a volley from the sky falls onto the defender from above it on screen (meteors)', () => {
  const bodies = (s) => {
    const projectiles = [];
    const material = { ...MATERIALS.fire, projectile: (_ctx, ball) => projectiles.push(ball) };
    DRAWERS.volley.draw(recordingContext().ctx, lane, s, { ...info('volley', { count: 2, stagger: 30, from: 'sky' }), material });
    return projectiles;
  };
  const [early] = bodies(0.05);
  const [late] = bodies(0.6);
  assert.ok(early.y < lane.by - lane.h, 'starts well above the defender');
  assert.ok(Math.hypot(late.x - lane.bx, late.y - lane.by) < Math.hypot(early.x - lane.bx, early.y - lane.by), 'closes on it');
  const sky = skyLane(lane);
  assert.ok(Math.abs(early.headingDeg - sky.angleDeg) < 1e-9, 'heads down the sky lane');
  assert.ok(early.headingDeg > 0 && early.headingDeg < 90, 'falls down and to the right on screen');
});

test('a bolt strokes through the material jagStroke when it has one, main line first', () => {
  const strokes = [];
  const material = { ...MATERIALS.fire, jagStroke: (_ctx, lines, opts) => strokes.push({ lines, opts }) };
  const rec = recordingContext();
  DRAWERS.bolt.draw(rec.ctx, lane, 0.4, { ...info('bolt', { branches: 2 }), material });
  assert.equal(strokes.length, 1);
  assert.equal(strokes[0].lines.length, 3, 'main line + two forks');
  assert.ok(strokes[0].opts.width > 0 && strokes[0].opts.alpha > 0);
  assert.equal(rec.calls.filter(([key]) => key === 'stroke').length, 0, 'the drawer adds no passes of its own');
});

test('every drawer plays on the electric material within the drawer rules', () => {
  for (const name of Object.keys(DRAWERS)) {
    for (const s of [0.1, 0.5, 0.9]) {
      const rec = recordingContext();
      DRAWERS[name].draw(rec.ctx, lane, s, { ...info(name), material: MATERIALS.electric });
      assert.ok(callsAreFinite(rec.calls), `${name} at ${s}`);
      assert.equal(rec.state.depth, 0, `${name} save/restore at ${s}`);
      assert.equal(rec.target.filter, 'none', `${name} filter at ${s}`);
      assert.deepEqual(rec.state.composite, [], `${name} composite`);
    }
  }
});

test('every drawer plays on the dark material; its shadow passes switch to source-over only inside a save', () => {
  for (const name of Object.keys(DRAWERS)) {
    for (const s of [0.1, 0.5, 0.9]) {
      const rec = recordingContext();
      const changes = [];
      const ctx = new Proxy(rec.ctx, {
        set(target, key, value) {
          if (key === 'globalCompositeOperation') changes.push({ value, depth: rec.state.depth });
          return Reflect.set(target, key, value);
        },
      });
      DRAWERS[name].draw(ctx, lane, s, { ...info(name), material: MATERIALS.dark });
      assert.ok(callsAreFinite(rec.calls), `${name} at ${s}`);
      assert.equal(rec.state.depth, 0, `${name} save/restore at ${s}`);
      assert.equal(rec.target.filter, 'none', `${name} filter at ${s}`);
      // The drawer's own save is depth 1; a material's shadow pass nests inside it.
      for (const change of changes) {
        assert.equal(change.value, 'source-over', `${name} composite`);
        assert.ok(change.depth >= 2, `${name} sets the composite outside the material's own save`);
      }
    }
  }
});

test('design 065: the player resolves a beat tint and hues into materials; drawers never see them', async () => {
  const { resolveBeatColours, tintCache } = await import('../move-player.js');
  const { MATERIALS } = await import('../materials/index.js');
  const fire = MATERIALS.fire;
  const cachedTint = tintCache();
  const plain = resolveBeatColours(fire, { r0: 0.2, tint: null, hues: null }, cachedTint);
  assert.equal(plain.material, fire);
  assert.equal(plain.materialAt(3), fire);
  assert.deepEqual(plain.params, { r0: 0.2 });
  const blue = resolveBeatColours(fire, { tint: { body: '#0000ff' }, hues: null }, cachedTint);
  assert.deepEqual(blue.material.palette.body, [0, 0, 255]);
  assert.equal(blue.material.key, 'fire');
  assert.equal(resolveBeatColours(fire, { tint: { body: '#0000ff' } }, cachedTint).material, blue.material, 'memoised');
  assert.ok(!('tint' in blue.params) && !('hues' in blue.params));
  const hued = resolveBeatColours(fire, { hues: ['#ff0000', '#00ff00'] }, cachedTint);
  assert.deepEqual(hued.materialAt(0).palette.body, [255, 0, 0]);
  assert.deepEqual(hued.materialAt(1).palette.body, [0, 255, 0]);
  assert.deepEqual(hued.materialAt(2).palette.body, [255, 0, 0]);
  assert.deepEqual(hued.materialAt(1).palette.hot, [89, 255, 89]);
  assert.equal(hued.material, fire);
});
