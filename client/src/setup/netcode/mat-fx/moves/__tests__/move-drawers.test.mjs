import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIFT } from '../beat-lift.mjs';
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

test('a projectile with a flare flies the flare\'s tongues down the lane instead of the body', () => {
  const tongues = [];
  let bodies = 0;
  const material = {
    ...MATERIALS.fire,
    tongue: (_ctx, tongue) => tongues.push(tongue),
    projectile: () => (bodies += 1),
  };
  const fly = (s) => {
    tongues.length = 0;
    DRAWERS.projectile.draw(recordingContext().ctx, lane, s, { ...info('projectile', { flare: 'dai', size: 0.8 }), material });
    const xs = tongues.map((t) => t.x);
    const ys = tongues.map((t) => t.y);
    return { count: tongues.length, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };
  const early = fly(0.1);
  const late = fly(0.95);
  assert.equal(bodies, 0, 'no fireball body');
  assert.equal(early.count, 15, 'a main and two side tongues per 大 arm');
  assert.equal(tonguesAt('projectile', { flare: 'dai' }), 25);
  assert.ok(Math.hypot(late.x - lane.bx, late.y - lane.by) < Math.hypot(early.x - lane.bx, early.y - lane.by), 'closes on the defender');
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
  const { resolveBeatColours, tintCache } = await import('../beat-colours.js');
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

// ---- design 065 slice 4 ----------------------------------------------------------

const drawAll = (name, over, extra = {}) => {
  const rec = recordingContext();
  for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) DRAWERS[name].draw(rec.ctx, lane, s, { ...info(name, over), ...extra });
  return rec;
};
const balanced = (rec, label) => {
  assert.ok(callsAreFinite(rec.calls), label);
  assert.equal(rec.state.depth, 0, label);
  assert.equal(rec.target.filter, 'none', label);
  assert.deepEqual(rec.state.composite, [], label);
};

test('design 065: every new param value draws finite and balanced', () => {
  const cases = [
    ['coreCharge', { target: 'sky', rings: 2 }],
    ['coreCharge', { target: 'sky-attacker', dx: 0.3, dy: -0.2, rings: 1 }],
    ['orbitCharge', { target: 'defender', unit: 'rings' }],
    ['shockRings', { target: 'defender', dx: 0.2 }],
    ['projectile', { from: 'defender', unit: 'spiked' }],
    ['projectile', { from: 'sky', unit: 'facet' }],
    ['projectile', { from: 'sky-attacker', unit: 'wheel' }],
    ['volley', { unit: 'fist' }],
    ['shards', { mode: 'cluster' }],
    ['shards', { unit: 'hex' }],
    ['pillar', { count: 4, spread: 2, stagger: 60, dx: 0.4 }],
    ['ring', { kind: 'fins', count: 5 }],
    ['bolt', { count: 5, spread: 1, curve: 0.3 }],
    ['glyph', { kind: 'lattice' }],
    ['glyph', { kind: 'hex' }],
    ['glyph', { kind: 'heart', target: 'attacker' }],
    ['starFlare', { target: 'sky', dx: 0.5 }],
    ['fan', { count: 12, spread: 360, spin: 40, flap: 12 }],
    ...['disc', 'dome', 'giant', 'sphere'].map((kind) => ['shade', { kind, eyes: kind === 'giant', fill: 'body', fillAlpha: 0.35 }]),
    ['chain', {}],
    ['grip', {}],
  ];
  for (const [name, over] of cases) {
    assert.deepEqual(DRAWERS[name].check(over), [], `${name} ${JSON.stringify(over)}`);
    const rec = drawAll(name, over);
    balanced(rec, `${name} ${JSON.stringify(over)}`);
    assert.ok(rec.calls.some(([key]) => key !== 'save' && key !== 'restore'), `${name} ${JSON.stringify(over)} draws`);
  }
});

test('design 065: the glyph kinds draw without a material sigil; the material kind still needs one', () => {
  assert.equal(drawAll('glyph', {}).calls.filter(([k]) => k !== 'save' && k !== 'restore').length, 0);
  for (const kind of ['lattice', 'hex', 'heart']) assert.ok(drawAll('glyph', { kind }).calls.some(([k]) => k === 'stroke'), kind);
});

test('design 065: the multi-item drawers ask materialAt for each item', () => {
  for (const [name, over, min] of [
    ['fan', { count: 5 }, 5],
    ['pillar', { count: 3 }, 3],
    ['ring', {}, 2],
    ['ring', { kind: 'fins', count: 4 }, 4],
    ['orbitCharge', {}, 5],
    ['volley', {}, 1],
    ['shards', {}, 8],
    ['splash', {}, 2],
    ['spiral', {}, 10],
  ]) {
    const asked = new Set();
    drawAll(name, over, { materialAt: (i) => (asked.add(i), MATERIALS.water) });
    assert.ok(asked.size >= min, `${name}: ${asked.size} items`);
  }
});

test('design 065: a non-body unit draws in the material palette instead of the material projectile', () => {
  let projectiles = 0;
  const counting = { ...MATERIALS.fire, projectile: (...args) => ((projectiles += 1), MATERIALS.fire.projectile(...args)) };
  drawAll('projectile', {}, { material: counting });
  assert.ok(projectiles > 0);
  projectiles = 0;
  drawAll('projectile', { unit: 'facet' }, { material: counting });
  assert.equal(projectiles, 0);
});

// ---- design 076: dissolve exits ---------------------------------------------------

/** The beats that burn away in their tail, with params that exercise the burning path. */
const BURNING = [
  ['projectile', {}],
  ['volley', {}],
  ['beam', {}],
  ['starFlare', {}],
  ['shockRings', {}],
  ['ring', {}],
  ['ring', { kind: 'fins' }],
  ['splash', {}],
  ['shards', {}],
  ['slashArc', {}],
  ['bolt', {}],
  ['pillar', {}],
  ['fan', {}],
];
/**
 * The caller's own modifiers, which a drawer's dissolve merges over. A probe module no kit sets:
 * kits own detail / distort / volume and may replace those.
 */
const OUTER = Object.freeze({ probe: Object.freeze({ amount: 0.3 }) });

/** Draws one frame on a context that records `ctx.fxMod` at every fill and stroke. */
const paintMods = (drawer, s, params = {}, over = {}) => {
  const rec = recordingContext();
  const mods = [];
  rec.target.fxMod = OUTER;
  rec.target.fill = () => mods.push(rec.target.fxMod);
  rec.target.stroke = () => mods.push(rec.target.fxMod);
  DRAWERS[drawer].draw(rec.ctx, lane, s, { ...info(drawer, params), ...over });
  return { mods, after: rec.target.fxMod };
};
const amountsOf = (mods) => mods.map((mod) => mod?.dissolve?.amount ?? 0);
const peakAmount = (drawer, s, params) => Math.max(0, ...amountsOf(paintMods(drawer, s, params).mods));

test('design 076: a travelling or burst beat paints whole early and burns away in its tail', () => {
  for (const [drawer, params] of BURNING) {
    const label = `${drawer} ${JSON.stringify(params)}`;
    const early = paintMods(drawer, 0.2, params);
    assert.ok(early.mods.length > 0, `${label} paints early`);
    assert.ok(amountsOf(early.mods).every((amount) => amount === 0), `${label} is whole early`);
    const tail = paintMods(drawer, 0.95, params);
    assert.ok(tail.mods.length > 0, `${label} paints in its tail`);
    assert.ok(Math.max(...amountsOf(tail.mods)) > 0, `${label} dissolves in its tail`);
    for (const { mods, after } of [early, tail]) {
      assert.equal(after, OUTER, `${label} restores the caller's fxMod`);
      assert.ok(mods.every((mod) => mod?.probe?.amount === 0.3), `${label} keeps the caller's modules`);
    }
  }
});

test('design 076: the dissolve rises through the tail and is nearly complete at its end', () => {
  for (const drawer of ['projectile', 'beam', 'starFlare', 'shockRings', 'slashArc', 'bolt', 'fan']) {
    const mid = peakAmount(drawer, 0.9, {});
    const late = peakAmount(drawer, 0.99, {});
    assert.ok(late > mid, `${drawer}: ${late} after ${mid}`);
    assert.ok(late > 0.85, `${drawer} is nearly gone at its end (${late})`);
  }
});

test('design 076: a starFlare starts burning where it breaks up, a beam just before it retracts', () => {
  assert.equal(peakAmount('starFlare', 0.69, { breakAt: 0.7 }), 0);
  assert.ok(peakAmount('starFlare', 0.75, { breakAt: 0.7 }) > 0);
  assert.equal(peakAmount('beam', 0.6, { retract: 0.3 }), 0);
  assert.ok(peakAmount('beam', 0.72, { retract: 0.3 }) > 0);
});

test('design 076: a flare projectile lands whole for the starFlare that takes over at contact', () => {
  const tail = paintMods('projectile', 0.99, { flare: 'dai', size: 0.8 });
  assert.ok(tail.mods.length > 0);
  assert.ok(amountsOf(tail.mods).every((amount) => amount === 0));
});

test('design 076: anchored, held and charging beats never touch the dissolve', () => {
  const burning = new Set(BURNING.map(([drawer]) => drawer));
  for (const drawer of Object.keys(DRAWERS)) {
    if (burning.has(drawer)) continue;
    for (const s of [0.2, 0.6, 0.95]) {
      const { mods, after } = paintMods(drawer, s);
      // A kit may layer its own modules (an edge colour, detail) over the caller's; none adds an amount.
      assert.ok(amountsOf(mods).every((amount) => amount === 0), `${drawer} at ${s} never dissolves`);
      assert.ok(mods.every((mod) => mod?.probe?.amount === 0.3), `${drawer} at ${s} keeps the caller's fxMod`);
      assert.equal(after, OUTER);
    }
  }
  const cluster = paintMods('shards', 0.95, { mode: 'cluster' });
  assert.ok(cluster.mods.length > 0);
  assert.ok(amountsOf(cluster.mods).every((amount) => amount === 0), 'a held shard cluster stays whole');
});

test("design 076: a drawer that throws mid-dissolve still restores the caller's fxMod", () => {
  const rec = recordingContext();
  rec.target.fxMod = OUTER;
  const exploding = { ...MATERIALS.fire, tongue: () => { throw new Error('boom'); } };
  assert.throws(() => DRAWERS.splash.draw(rec.ctx, lane, 0.95, { ...info('splash'), material: exploding }), /boom/);
  assert.equal(rec.target.fxMod, OUTER);
});

test('design 076: glows fade whole while the bodies round them burn', () => {
  const glowMods = [];
  const material = {
    ...MATERIALS.fire,
    glow: (ctx, ...args) => {
      glowMods.push(ctx.fxMod);
      return MATERIALS.fire.glow(ctx, ...args);
    },
  };
  for (const drawer of ['starFlare', 'beam']) {
    glowMods.length = 0;
    const { mods } = paintMods(drawer, 0.95, {}, { material });
    assert.ok(glowMods.length > 0, `${drawer} glows`);
    assert.ok(amountsOf(glowMods).every((amount) => amount === 0), `${drawer}: its glow never dissolves`);
    assert.ok(Math.max(...amountsOf(mods)) > 0, `${drawer}: its body does`);
  }
  assert.ok(amountsOf(paintMods('impactFlash', 0.95).mods).every((amount) => amount === 0), 'an impact flash is a glow');
});

// ---- design 076 § Depth: beats lifted off the cloth ------------------------------------

/** Draws one frame recording `ctx.fxLift` at every fill and stroke; the caller's lift is `outer`. */
const paintLifts = (drawer, s, params = {}, over = {}, outer = null) => {
  const rec = recordingContext();
  const lifts = [];
  rec.target.fxLift = outer;
  rec.target.fill = () => lifts.push(rec.target.fxLift);
  rec.target.stroke = () => lifts.push(rec.target.fxLift);
  DRAWERS[drawer].draw(rec.ctx, lane, s, { ...info(drawer, params), ...over });
  return { lifts, after: rec.target.fxLift };
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('design 076 depth: a bolt from the sky rises off the defender; a lane bolt arcs', () => {
  const sky = paintLifts('bolt', 0.5, { from: 'sky' });
  assert.ok(sky.lifts.length > 0);
  for (const lift of sky.lifts) {
    assert.equal(lift.stand, LIFT.upright);
    assert.deepEqual(lift.at, [lane.bx, lane.by]);
  }
  const arcing = paintLifts('bolt', 0.5);
  for (const lift of arcing.lifts) {
    assert.equal(lift.arc, LIFT.boltArc);
    assert.deepEqual(lift.from, [lane.ax, lane.ay]);
    assert.deepEqual(lift.to, [lane.bx, lane.by]);
    assert.ok(!lift.stand);
  }
});

test('design 076 depth: travelling beats arc along the lane at chest height', () => {
  for (const [drawer, params, arc] of [
    ['projectile', {}, LIFT.travelArc],
    ['projectile', { flare: 'dai', size: 0.8 }, LIFT.travelArc],
    ['volley', {}, LIFT.travelArc],
    ['beam', {}, LIFT.beamArc],
  ]) {
    const { lifts } = paintLifts(drawer, 0.5, params);
    assert.ok(lifts.length > 0, drawer);
    for (const lift of lifts) {
      assert.equal(lift.z, LIFT.travelZ, drawer);
      assert.equal(lift.arc, arc, drawer);
      assert.ok(Array.isArray(lift.from) && Array.isArray(lift.to), drawer);
    }
  }
  const body = paintLifts('projectile', 0.5).lifts[0];
  assert.equal(body.stand, LIFT.bodyStand, 'the body faces the camera');
  const meteor = paintLifts('projectile', 0.5, { from: 'sky' }).lifts[0];
  assert.deepEqual([meteor.stand, meteor.at], [LIFT.upright, [lane.bx, lane.by]], 'a sky drop falls onto the defender');
});

test('design 076 depth: bursts, flares, splashes and face rings stand up over their anchor; pillars stand most', () => {
  for (const [drawer, params, stand] of [
    ['starFlare', {}, LIFT.burstStand],
    ['impactFlash', {}, LIFT.burstStand],
    ['splash', {}, LIFT.burstStand],
    ['shards', {}, LIFT.burstStand],
    ['slashArc', {}, LIFT.burstStand],
    ['fan', {}, LIFT.burstStand],
    ['ring', { kind: 'face' }, LIFT.faceStand],
    ['ring', { kind: 'fins' }, LIFT.burstStand],
    ['shards', { mode: 'cluster' }, LIFT.upright],
    ['pillar', {}, LIFT.upright],
  ]) {
    const { lifts } = paintLifts(drawer, 0.4, params);
    assert.ok(lifts.length > 0, `${drawer} paints`);
    for (const lift of lifts) assert.equal(lift.stand, stand, `${drawer} ${JSON.stringify(params)}`);
  }
  const flash = paintLifts('impactFlash', 0.3).lifts[0];
  assert.deepEqual(flash.at, [lane.bx, lane.by]);
  assert.equal(flash.z, LIFT.burstZ);
  const glyph = paintLifts('glyph', 0.5, {}, { material: MATERIALS.psychic }).lifts;
  assert.ok(glyph.length > 0 && glyph.every((lift) => near(lift.stand, LIFT.faceStand)), 'a sigil stands nearly upright');
});

test('design 076 depth: the charge hangs where the shot leaves, at chest height', () => {
  const { lifts } = paintLifts('coreCharge', 0.9);
  assert.ok(lifts.length > 0);
  for (const lift of lifts) {
    assert.equal(lift.z, LIFT.travelZ);
    assert.equal(lift.stand, LIFT.bodyStand);
  }
});

test('design 076 depth: ground waves, cracks and card glows stay on the cloth', () => {
  for (const [drawer, params, s] of [
    ['shockRings', {}, 0.3],
    ['ring', {}, 0.3],
    ['terrain', { kind: 'crack' }, 0.5],
    ['aura', {}, 0.5],
    ['vignette', {}, 0.5],
  ]) {
    const { lifts } = paintLifts(drawer, s, params);
    assert.ok(lifts.length > 0, `${drawer} paints`);
    assert.ok(lifts.every((lift) => lift === null), `${drawer} lies flat`);
  }
});

test("design 076 depth: every drawer leaves the caller's fxLift as it found it, even when it throws", () => {
  const outer = Object.freeze({ z: 0.01 });
  for (const drawer of Object.keys(DRAWERS)) {
    for (const s of [0.2, 0.6, 0.95]) assert.equal(paintLifts(drawer, s, {}, {}, outer).after, outer, `${drawer} at ${s}`);
  }
  const rec = recordingContext();
  rec.target.fxLift = outer;
  const exploding = { ...MATERIALS.fire, tongue: () => { throw new Error('boom'); } };
  assert.throws(() => DRAWERS.splash.draw(rec.ctx, lane, 0.5, { ...info('splash'), material: exploding }), /boom/);
  assert.equal(rec.target.fxLift, outer);
});
