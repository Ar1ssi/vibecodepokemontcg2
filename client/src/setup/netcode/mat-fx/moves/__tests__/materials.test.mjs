import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, materialFor } from '../materials/index.js';
import { jagOutline } from '../materials/electric.js';
import { barrageStamps, streakOutline } from '../materials/fighting.js';
import { leafOutline } from '../materials/grass.js';
import { rippleRings, wavyRing } from '../materials/psychic.js';
import { pulseRings, shardOutline } from '../materials/dark.js';
import { bladeOutline, reticleTicks } from '../materials/steel.js';
import { helixStrands } from '../materials/dragon.js';
import { sigilRotation, starOutline, twinkleOutline, twinklePulse } from '../materials/fairy.js';
import { eyeOpenness, slitEyes } from '../materials/ghost.js';
import { bubbleRise, globOutline, poolSpread, streamGlobs } from '../materials/poison.js';
import { clodOutline, fissureSeams, spikeOutline } from '../materials/ground.js';
import { crystalOutline, litFacet, shadowFacet, spireOutline, stoneOutline } from '../materials/rock.js';
import { crescentOutline, featherOutline } from '../materials/flying.js';
import { auroraAlphas, icicleFacet, icicleOutline, snowflakeSegments } from '../materials/ice.js';
import { needleOutline, needleTip, soundAlphas, wingOpen } from '../materials/bug.js';
import { MATERIAL_KEYS } from '../move-spec.mjs';
import { callsAreFinite, recordingContext, rgbOf } from './recording-context.mjs';

const PROJECTILE = { x: 100, y: 120, r: 30, headingDeg: 20, time: 1.3, seed: 4, alpha: 0.9, tongues: 5, hot: 1 };
const TONGUE = { x: 50, y: 60, angleDeg: -30, length: 120, width: 40, time: 0.7, seed: 3 };

const REQUIRED = ['key', 'palette', 'shade', 'smoke', 'particle', 'glow', 'body', 'tongue', 'projectile', 'grain'];
const inPalette = (material, css) => {
  const rgb = rgbOf(css);
  return Object.values(material.palette).some((entry) => entry.every((v, i) => v === rgb?.[i]));
};

test('the registry covers every spec material key and has a default', () => {
  for (const key of MATERIAL_KEYS) assert.ok(Object.hasOwn(MATERIALS, key), key);
  assert.ok(MATERIALS.default);
  assert.ok(Object.isFrozen(MATERIALS));
  assert.equal(materialFor('fire'), MATERIALS.fire);
  assert.equal(materialFor('no-such-material'), MATERIALS.default);
  assert.equal(materialFor(undefined), MATERIALS.default);
});

test('every material has the full interface and frozen palette colours', () => {
  for (const [name, material] of Object.entries(MATERIALS)) {
    for (const key of REQUIRED) assert.ok(key in material, `${name}.${key}`);
    assert.ok(Object.isFrozen(material), name);
    for (const colour of Object.values(material.palette)) assert.equal(colour.length, 3);
    assert.equal(typeof material.particle.className, 'string');
  }
});

test('every material call draws finite coordinates and leaves the blur filter reset', () => {
  for (const [name, material] of Object.entries(MATERIALS)) {
    const rec = recordingContext();
    material.glow(rec.ctx, 10, 20, 40, 0.8);
    material.body(rec.ctx, 10, 20, 40, 0.8, 0.9);
    material.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1 });
    material.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
    material.projectile(rec.ctx, PROJECTILE);
    material.grain(rec.ctx, 400, 1.2, 0.28);
    assert.ok(rec.calls.length > 20, `${name} drew`);
    assert.ok(callsAreFinite(rec.calls), `${name} finite`);
    assert.equal(rec.target.filter, 'none', `${name} filter`);
  }
});

test('a tongue fills at most three times and blurs once', () => {
  for (const [name, material] of Object.entries(MATERIALS)) {
    const rec = recordingContext();
    const filters = [];
    const probe = new Proxy(rec.ctx, {
      set(target, key, value) {
        if (key === 'filter' && value !== 'none') filters.push(value);
        return Reflect.set(target, key, value);
      },
    });
    material.tongue(probe, TONGUE, { alpha: 1, hot: 1 });
    assert.ok(rec.fills.count <= 3, `${name} fills ${rec.fills.count}`);
    assert.ok(filters.length <= 1, `${name} blurs ${filters.length}`);
    for (const filter of filters) {
      const radius = Number(/blur\(([\d.]+)px\)/.exec(filter)?.[1]);
      assert.ok(radius >= 1 && radius <= Math.max(1, 0.12 * TONGUE.width) + 1e-9, filter);
    }
  }
});

test('every colour a material uses comes from its palette', () => {
  for (const [name, material] of Object.entries(MATERIALS)) {
    const rec = recordingContext();
    material.glow(rec.ctx, 10, 20, 40, 0.8);
    material.body(rec.ctx, 10, 20, 40, 0.8, 0.9);
    material.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1 });
    material.projectile(rec.ctx, PROJECTILE);
    assert.ok(rec.colours.length > 10);
    for (const css of rec.colours) assert.ok(inPalette(material, css), `${name}: ${css}`);
  }
});

test('a degenerate tongue, body or projectile draws nothing', () => {
  for (const [name, material] of Object.entries(MATERIALS)) {
    const rec = recordingContext();
    material.tongue(rec.ctx, { ...TONGUE, length: 0 });
    material.tongue(rec.ctx, TONGUE, { alpha: 0 });
    material.body(rec.ctx, 0, 0, 0, 1);
    material.glow(rec.ctx, 0, 0, 10, 0);
    material.projectile(rec.ctx, { ...PROJECTILE, r: 0 });
    assert.equal(rec.calls.length, 0, name);
  }
});

test('the grain pass is a no-op where no noise tile can be made, and with zero strength', () => {
  const rec = recordingContext();
  MATERIALS.fire.grain(rec.ctx, 400, 1, 0.28);
  MATERIALS.fire.grain(rec.ctx, 400, 1, 0);
  assert.equal(rec.calls.length, 0);
});

test('water uses the recipe palette, a navy shade, mist for smoke and droplet particles', () => {
  const water = MATERIALS.water;
  assert.equal(materialFor('water'), water);
  assert.deepEqual(water.palette.deep, [46, 124, 230]);
  assert.deepEqual(water.palette.body, [82, 180, 255]);
  assert.deepEqual(water.palette.hot, [185, 232, 255]);
  assert.deepEqual(water.palette.white, [255, 255, 255]);
  assert.deepEqual(water.smoke, [190, 215, 235]);
  assert.ok(water.shade.every((v, i) => v <= water.palette.deep[i]), 'shade darker than deep');
  assert.equal(water.particle.className, 'fx-particle--droplet');
  assert.equal(water.particle.aspect, 1);
  assert.deepEqual(rgbOf(water.particle.color), [185, 232, 255]);
});

test('a water sheet never blurs: one fill, a 1.5 px white leading edge, drops shed in one fill', () => {
  const rec = recordingContext();
  const filters = [];
  const probe = new Proxy(rec.ctx, {
    set(target, key, value) {
      if (key === 'filter' && value !== 'none') filters.push(value);
      return Reflect.set(target, key, value);
    },
  });
  MATERIALS.water.tongue(probe, TONGUE, { alpha: 1, hot: 1 });
  assert.deepEqual(filters, []);
  assert.equal(rec.fills.count, 2);
  assert.equal(rec.calls.filter(([name]) => name === 'stroke').length, 1);
  assert.equal(rec.target.lineWidth, 1.5);
  assert.ok(rec.colours.some((css) => rgbOf(css)?.every((v) => v === 255)), 'white edge');
  const drops = rec.calls.filter(([name]) => name === 'arc').length;
  assert.ok(drops >= 3 && drops <= 5, `drops ${drops}`);
});

test('a water sheet with hot 0 drops its white edge', () => {
  const rec = recordingContext();
  MATERIALS.water.tongue(rec.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(rec.calls.filter(([name]) => name === 'stroke').length, 0);
});

test('a water droplet is a sphere with a deep rim and a white specular dot up-left', () => {
  const rec = recordingContext();
  MATERIALS.water.body(rec.ctx, 100, 100, 40, 1, 1);
  const arcs = rec.calls.filter(([name]) => name === 'arc').map(([, args]) => args);
  assert.equal(arcs.length, 3);
  const [x, y, r] = arcs[2];
  assert.ok(x < 100 && y < 100, 'specular up-left');
  assert.ok(Math.abs(r - 40 * 0.18) < 1e-9);
  assert.equal(rec.calls.filter(([name]) => name === 'stroke').length, 1);
});

test('a water projectile with no sheets is a clean drop (a bubble): halo and droplet only', () => {
  const rec = recordingContext();
  MATERIALS.water.projectile(rec.ctx, { ...PROJECTILE, tongues: 0 });
  assert.equal(rec.fills.count, 3);
  const full = recordingContext();
  MATERIALS.water.projectile(full.ctx, PROJECTILE);
  assert.equal(full.fills.count, 1 + PROJECTILE.tongues * 2 + 2 + 1);
});

const strokes = (rec) => rec.calls.filter(([name]) => name === 'stroke').length;
const blurProbe = (rec) => {
  const filters = [];
  const ctx = new Proxy(rec.ctx, {
    set(target, key, value) {
      if (key === 'filter' && value !== 'none') filters.push(value);
      return Reflect.set(target, key, value);
    },
  });
  return { ctx, filters };
};

test('grass uses the recipe palette, a dark-green shade, no smoke and leaf particles', () => {
  const grass = MATERIALS.grass;
  assert.equal(materialFor('grass'), grass);
  assert.deepEqual(grass.palette.deep, [63, 163, 77]);
  assert.deepEqual(grass.palette.body, [126, 217, 87]);
  assert.deepEqual(grass.palette.hot, [201, 242, 122]);
  assert.deepEqual(grass.palette.white, [255, 255, 255]);
  assert.equal(grass.smoke, null);
  assert.ok(grass.shade.every((v, i) => v <= grass.palette.deep[i]), 'shade darker than deep');
  assert.equal(grass.particle.className, 'fx-particle--leaf');
  assert.equal(grass.particle.aspect, 0.5);
  assert.deepEqual(rgbOf(grass.particle.color), [126, 217, 87]);
});

test('a leaf never blurs: a body fill, a lit half and one vein stroke in deep', () => {
  for (const key of ['grass', 'petal']) {
    const rec = recordingContext();
    const probe = blurProbe(rec);
    MATERIALS[key].tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
    assert.deepEqual(probe.filters, [], key);
    assert.equal(rec.fills.count, 2, key);
    assert.equal(strokes(rec), 1, key);
    assert.equal(rec.target.lineWidth, 1, key);
    assert.deepEqual(rgbOf(rec.target.strokeStyle), MATERIALS[key].palette.deep, key);
  }
});

test('a leaf with hot 0 drops its lit half; a tiny leaf drops its veins', () => {
  const dim = recordingContext();
  MATERIALS.grass.tongue(dim.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(dim.fills.count, 1);
  const tiny = recordingContext();
  MATERIALS.grass.tongue(tiny.ctx, { ...TONGUE, length: 6, width: 3 }, { alpha: 1, hot: 1 });
  assert.equal(strokes(tiny), 0);
});

test('leafOutline is pointed at both ends, widest near 45 %, lit on the screen-up side', () => {
  const leaf = leafOutline({ x: 0, y: 0, angleDeg: 0, length: 100, width: 40, time: 0, seed: 0 });
  const halfWidth = (i) => Math.hypot(leaf.left[i][0] - leaf.right[i][0], leaf.left[i][1] - leaf.right[i][1]) / 2;
  const last = leaf.left.length - 1;
  assert.equal(halfWidth(0), 0);
  assert.equal(halfWidth(last), 0);
  const widths = leaf.left.map((_, i) => halfWidth(i));
  const widest = widths.indexOf(Math.max(...widths));
  assert.ok(Math.abs(widest / last - 0.45) <= 1 / last, `widest at ${widest / last}`);
  assert.ok(Math.max(...widths) <= 20 + 1e-9);
  assert.equal(leaf.sunlitLeft, false, 'heading right, the left normal points down the screen');
  assert.equal(leafOutline({ x: 0, y: 0, angleDeg: 180, length: 100, width: 40, time: 0, seed: 0 }).sunlitLeft, true);
});

test('a grass projectile: a bare seed at 0 tongues, one tumbling leaf at 1, a pinwheel and core above', () => {
  const draw = (tongues) => {
    const rec = recordingContext();
    MATERIALS.grass.projectile(rec.ctx, { ...PROJECTILE, tongues });
    return rec;
  };
  const seed = draw(0);
  assert.equal(seed.fills.count, 2, 'halo + seed');
  assert.equal(strokes(seed), 1, 'the seed rim');
  assert.equal(draw(1).fills.count, 1 + 2, 'halo + one leaf');
  assert.equal(draw(5).fills.count, 1 + 5 * 2 + 1, 'halo + five leaves + core');
});

test('a tumbling leaf spins about its centre at 360 deg/s', () => {
  const headingAt = (time) => {
    const moves = [];
    const rec = recordingContext();
    const ctx = new Proxy(rec.ctx, {
      get(target, key) {
        if (key === 'moveTo') return (x, y) => moves.push([x, y]);
        return Reflect.get(target, key);
      },
    });
    MATERIALS.grass.projectile(ctx, { ...PROJECTILE, tongues: 1, time });
    const [bx, by] = moves[0];
    return (Math.atan2(PROJECTILE.y - by, PROJECTILE.x - bx) * 180) / Math.PI;
  };
  const turn = (((headingAt(1.5) - headingAt(1.25)) % 360) + 360) % 360;
  assert.ok(Math.abs(turn - 90) < 1e-6, `a quarter second turns ${turn} deg`);
});

test('petal is the leaf unit in Petal Dance pink with a yellow seed centre', () => {
  const petal = MATERIALS.petal;
  assert.deepEqual(petal.palette.body, [247, 112, 208]);
  assert.deepEqual(petal.palette.hot, [231, 184, 247]);
  assert.deepEqual(petal.palette.core, [247, 208, 0]);
  assert.equal(petal.particle.className, 'fx-particle--leaf');
});

test('solar is the light override on the fire tongue path: three fills, one blur', () => {
  const solar = MATERIALS.solar;
  assert.deepEqual(solar.palette.body, [242, 233, 107]);
  assert.deepEqual(solar.palette.hot, [255, 248, 176]);
  const rec = recordingContext();
  const probe = blurProbe(rec);
  solar.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  assert.equal(rec.fills.count, 3);
  assert.equal(probe.filters.length, 1);
});

test('fire keeps the accepted look-test palette, shade and smoke colours', () => {
  const fire = MATERIALS.fire;
  assert.deepEqual(fire.palette.deep, [210, 41, 8]);
  assert.deepEqual(fire.palette.body, [235, 108, 6]);
  assert.deepEqual(fire.palette.hot, [241, 175, 13]);
  assert.deepEqual(fire.shade, [70, 6, 0]);
  assert.deepEqual(fire.smoke, [120, 96, 84]);
  assert.equal(fire.particle.className, 'fx-particle--ember');
});

test('electric uses the recipe palette with its blue edge, a storm shade, no smoke and spark streaks', () => {
  const electric = MATERIALS.electric;
  assert.equal(materialFor('electric'), electric);
  assert.deepEqual(electric.palette.body, [247, 210, 30]);
  assert.deepEqual(electric.palette.hot, [255, 242, 122]);
  assert.deepEqual(electric.palette.white, [255, 255, 255]);
  assert.deepEqual(electric.palette.deep, [185, 138, 0]);
  assert.deepEqual(electric.palette.edge, [159, 213, 255]);
  assert.equal(electric.smoke, null);
  assert.ok(electric.shade.every((v, i) => v <= electric.palette.deep[i] || v < 40), 'shade is dark');
  assert.equal(electric.particle.className, 'fx-particle--streak');
  assert.equal(electric.particle.aspect, 0.2);
});

test('jagOutline: both ends on the axis, joints within the jag amplitude, tapering to a point', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 120, width: 40, time: 0.7, seed: 3 };
  const points = jagOutline(spec, { jag: 1 });
  assert.ok(points.length >= 4 && points.length <= 11);
  assert.equal(points[0].y, 0);
  assert.equal(points.at(-1).y, 0);
  assert.equal(points.at(-1).x, 120);
  assert.equal(points.at(-1).half, 0);
  assert.equal(points[0].half, 20);
  const amplitude = Math.min(40 * 0.7, 120 * 0.18);
  assert.ok(points.every((p) => Math.abs(p.y) <= amplitude + 1e-9));
  assert.ok(points.some((p) => Math.abs(p.y) > 1), 'the line is jagged');
  for (const p of points) assert.ok(Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-9);
  for (let i = 1; i < points.length; i += 1) assert.ok(points[i].half <= points[i - 1].half);
  const calm = jagOutline(spec, { jag: 0 });
  assert.ok(calm.every((p) => Math.abs(p.y) <= 40 * 0.35 + 1e-9));
});

test('a jag holds its shape for one 45 ms flicker frame and re-rolls on the next', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 120, width: 40, time: 1.0, seed: 3 };
  const ys = (time) => jagOutline({ ...spec, time }).map((p) => p.y);
  assert.deepEqual(ys(1.0), ys(1.0 + 0.02));
  assert.notDeepEqual(ys(1.0), ys(1.0 + 0.05));
  assert.notDeepEqual(ys(1.0), jagOutline({ ...spec, seed: 4 }).map((p) => p.y));
});

test('an electric jag: a blurred blue glow, a yellow core, a white centre; hot 0 drops the centre', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.electric.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  assert.equal(rec.fills.count, 3);
  assert.equal(probe.filters.length, 1);
  const fillsInOrder = rec.colours.map(rgbOf);
  assert.deepEqual(fillsInOrder, [MATERIALS.electric.palette.edge, MATERIALS.electric.palette.body, MATERIALS.electric.palette.white]);
  const dim = recordingContext();
  MATERIALS.electric.tongue(dim.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(dim.fills.count, 2);
});

test('an electric ball is a sphere with six radiating jags; a projectile trails `tongues` jags', () => {
  const rec = recordingContext();
  MATERIALS.electric.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 2, 'blue fringe then white');
  assert.equal(rec.calls.filter(([name]) => name === 'moveTo').length, 6);
  const draw = (tongues) => {
    const r = recordingContext();
    MATERIALS.electric.projectile(r.ctx, { ...PROJECTILE, tongues });
    return r.fills.count;
  };
  assert.equal(draw(0), 2, 'halo + ball');
  assert.equal(draw(3), 2 + 3 * 3);
});

test('electric jagStroke draws lightning in three strokes with one blur, and nothing when empty', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  const lines = [[[0, 0], [10, 4], [20, -3], [30, 0]], [[10, 4], [16, 12]]];
  MATERIALS.electric.jagStroke(probe.ctx, lines, { width: 10, alpha: 1 });
  assert.equal(strokes(rec), 3);
  assert.equal(probe.filters.length, 1);
  assert.ok(Number(/blur\(([\d.]+)px\)/.exec(probe.filters[0])[1]) <= 0.12 * 24 + 0.05, "blur rounds to 0.1 px");
  assert.equal(rec.target.filter, 'none');
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.electric, css), css);
  const none = recordingContext();
  MATERIALS.electric.jagStroke(none.ctx, [], { width: 10, alpha: 1 });
  MATERIALS.electric.jagStroke(none.ctx, lines, { width: 10, alpha: 0 });
  assert.equal(none.calls.length, 0);
});

test('fighting uses the recipe palette, an umber shade, dust for smoke and white streaks', () => {
  const fighting = MATERIALS.fighting;
  assert.equal(materialFor('fighting'), fighting);
  assert.deepEqual(fighting.palette.body, [217, 100, 58]);
  assert.deepEqual(fighting.palette.hot, [242, 166, 107]);
  assert.deepEqual(fighting.palette.core, [255, 230, 194]);
  assert.deepEqual(fighting.palette.deep, [140, 58, 31]);
  assert.deepEqual(fighting.smoke, [150, 130, 110]);
  assert.ok(fighting.shade.every((v, i) => v <= fighting.palette.deep[i]), 'shade darker than deep');
  assert.equal(fighting.particle.className, 'fx-particle--streak');
  assert.deepEqual(rgbOf(fighting.particle.color), [255, 255, 255]);
});

test('aura is the recipe blue-white for the ki specials: a navy shade, no smoke, blue streaks', () => {
  const aura = MATERIALS.aura;
  assert.equal(materialFor('aura'), aura);
  assert.deepEqual(aura.palette.body, [127, 183, 255]);
  assert.deepEqual(aura.palette.core, [230, 242, 255]);
  assert.equal(aura.smoke, null);
  assert.ok(aura.shade.every((v, i) => v <= aura.palette.deep[i]), 'shade darker than deep');
  assert.equal(aura.particle.className, 'fx-particle--streak');
  assert.deepEqual(rgbOf(aura.particle.color), aura.palette.hot);
});

test('streakOutline is a straight spindle: pointed both ends, widest at 30 %, narrowed by scale', () => {
  const spec = { x: 10, y: 20, angleDeg: 0, length: 100, width: 40, time: 0, seed: 0 };
  const [base, left, tip, right] = streakOutline(spec);
  assert.deepEqual(base, [10, 20]);
  assert.deepEqual(tip, [110, 20]);
  assert.deepEqual(left, [40, 40]);
  assert.deepEqual(right, [40, 0]);
  const [, innerLeft, innerTip] = streakOutline(spec, 0.5);
  assert.ok(innerTip[0] < tip[0] && innerTip[1] === 20, 'inner pass pulls the tip in on the axis');
  assert.ok(Math.abs(innerLeft[1] - 20) <= 10 + 1e-9, 'inner pass is half as wide');
  const turned = streakOutline({ ...spec, angleDeg: 90 })[2];
  assert.ok(Math.abs(turned[0] - 10) < 1e-9 && Math.abs(turned[1] - 120) < 1e-9);
});

test('a shock streak (both palettes): blurred body, crisp mid, white centre; hot 0 drops the centre', () => {
  for (const key of ['fighting', 'aura']) {
    const material = MATERIALS[key];
    const rec = recordingContext();
    const probe = blurProbe(rec);
    material.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
    assert.equal(rec.fills.count, 3, key);
    assert.equal(probe.filters.length, 1, key);
    assert.ok(Number(/blur\(([\d.]+)px\)/.exec(probe.filters[0])[1]) <= 0.08 * TONGUE.width + 0.05, key);
    assert.deepEqual(rec.colours.map(rgbOf), [material.palette.body, material.palette.hot, material.palette.white], key);
    const dim = recordingContext();
    material.tongue(dim.ctx, TONGUE, { alpha: 1, hot: 0 });
    assert.equal(dim.fills.count, 2, key);
  }
});

test('a fighting impact disc is one fill ringed by three concentric strokes', () => {
  const rec = recordingContext();
  MATERIALS.fighting.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 3);
  const radii = rec.calls.filter(([name]) => name === 'arc').map(([, args]) => args[2]);
  assert.deepEqual(radii, [40, 40 * 0.55, 40 * 0.8, 40 * 1.05]);
});

test('projectiles: a fighting disc or a ki sphere, each trailing `tongues` streaks', () => {
  const draw = (key, tongues) => {
    const rec = recordingContext();
    MATERIALS[key].projectile(rec.ctx, { ...PROJECTILE, tongues });
    return rec;
  };
  assert.equal(draw('fighting', 0).fills.count, 2, 'halo + disc');
  assert.equal(draw('fighting', 3).fills.count, 2 + 3 * 3);
  const ki = draw('aura', 0);
  assert.equal(ki.fills.count, 2, 'halo + sphere');
  assert.equal(strokes(ki), 2, 'the two swirl arcs');
  assert.equal(draw('aura', 4).fills.count, 2 + 4 * 3);
});

test('the ki swirl turns with the scene clock', () => {
  const swirlStart = (time) => {
    const rec = recordingContext();
    MATERIALS.aura.projectile(rec.ctx, { ...PROJECTILE, tongues: 0, time });
    return rec.calls.filter(([name]) => name === 'arc').map(([, args]) => args[3])[2];
  };
  const turn = swirlStart(1.25) - swirlStart(1);
  assert.ok(Math.abs(turn - 0.25 * Math.PI * 2 * 1.6) < 1e-9, `turned ${turn}`);
});

test('barrageStamps: eight stamps land in order inside 0.42 r, at most three at once, the last biggest', () => {
  const r = 100;
  assert.deepEqual(barrageStamps(0, r), []);
  assert.deepEqual(barrageStamps(0.99, r), []);
  let seen = 0;
  let firstAt = null;
  const landed = new Set();
  for (let s = 0; s < 1; s += 0.005) {
    const stamps = barrageStamps(s, r);
    assert.ok(stamps.length <= 3, `${stamps.length} at ${s}`);
    for (const stamp of stamps) {
      assert.ok(Math.hypot(stamp.dx, stamp.dy) <= 0.42 * r + 1e-9);
      assert.ok(stamp.alpha > 0 && stamp.alpha <= 1);
      assert.ok(stamp.hot >= 0.4 - 1e-9 && stamp.hot <= 1);
      landed.add(`${stamp.dx.toFixed(3)},${stamp.dy.toFixed(3)}`);
    }
    if (stamps.length && firstAt === null) firstAt = s;
    seen = Math.max(seen, stamps.length);
  }
  assert.equal(landed.size, 8, 'eight distinct spots');
  assert.ok(firstAt >= 0.15 - 1e-9 && firstAt < 0.16);
  const lastPeak = barrageStamps(0.62 + 0.179, r).at(-1);
  const earlyPeak = barrageStamps(0.15 + 0.179, r)[0];
  assert.ok(lastPeak.r > earlyPeak.r, 'the final stamp lands biggest');
});

test('the fighting sigil draws the barrage as impact discs; nothing before the first stamp', () => {
  const rec = recordingContext();
  MATERIALS.fighting.sigil(rec.ctx, 100, 100, 80, 0.3);
  assert.ok(rec.fills.count >= 1 && rec.fills.count <= 3);
  assert.equal(strokes(rec), rec.fills.count * 3);
  assert.ok(callsAreFinite(rec.calls));
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.fighting, css), css);
  const none = recordingContext();
  MATERIALS.fighting.sigil(none.ctx, 100, 100, 80, 0.05);
  assert.equal(none.calls.length, 0);
});

test('psychic uses the recipe palette, a violet shade, no smoke and lilac motes', () => {
  const psychic = MATERIALS.psychic;
  assert.equal(materialFor('psychic'), psychic);
  assert.deepEqual(psychic.palette.body, [200, 92, 219]);
  assert.deepEqual(psychic.palette.hot, [240, 165, 255]);
  assert.deepEqual(psychic.palette.core, [255, 225, 255]);
  assert.deepEqual(psychic.palette.deep, [91, 30, 122]);
  assert.equal(psychic.smoke, null);
  assert.ok(psychic.shade.every((v, i) => v <= psychic.palette.deep[i]), 'shade darker than deep');
  assert.equal(psychic.particle.className, 'fx-particle--mote');
  assert.deepEqual(rgbOf(psychic.particle.color), psychic.palette.hot);
});

test('a psychic ribbon never blurs: one translucent fill and a bright centre line; hot 0 drops the line', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.psychic.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [MATERIALS.psychic.palette.body, MATERIALS.psychic.palette.core]);
  assert.match(rec.colours[0], /, 0\.45\)$/);
  const dim = recordingContext();
  MATERIALS.psychic.tongue(dim.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(strokes(dim), 0);
});

test('a psychic lens is one disc fill ringed by three broken strokes in hot, deep, hot', () => {
  const rec = recordingContext();
  MATERIALS.psychic.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 3);
  const arcs = rec.calls.filter(([name]) => name === 'arc').map(([, args]) => args);
  assert.deepEqual(
    arcs.map((args) => args[2]),
    [40, 40 * 0.45, 40 * 0.7, 40 * 0.95]
  );
  for (const [, , , start, end] of arcs.slice(1)) assert.ok(end - start < Math.PI * 2 - 0.5, 'a broken ring');
  const { hot, deep } = MATERIALS.psychic.palette;
  assert.deepEqual(rec.colours.slice(-3).map(rgbOf), [hot, deep, hot]);
});

test('a psychic projectile is a bare lens at 0 tongues and trails `tongues` ribbons; its rings turn with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.psychic.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 2, 'haze + lens');
  assert.equal(draw({ tongues: 3 }).fills.count, 2 + 3);
  const ringStart = (time) =>
    draw({ tongues: 0, time })
      .calls.filter(([name]) => name === 'arc')
      .map(([, args]) => args[3])[2];
  const turn = ringStart(1.25) - ringStart(1);
  assert.ok(Math.abs(turn - 0.25 * Math.PI * 2 * 0.8) < 1e-9, `turned ${turn}`);
});

test('rippleRings: three rings between 0.35 r and r, a third of a cycle apart, fading at both ends', () => {
  const r = 100;
  for (let s = 0; s < 1; s += 0.01) {
    const rings = rippleRings(s, r);
    assert.equal(rings.length, 3);
    for (const ring of rings) {
      assert.ok(ring.radius >= 35 - 1e-9 && ring.radius <= r + 1e-9, `radius ${ring.radius}`);
      assert.ok(ring.alpha >= 0 && ring.alpha <= 1);
      assert.ok(Number.isFinite(ring.phase));
    }
  }
  const [first, second, third] = rippleRings(0, r);
  assert.equal(first.radius, 35);
  assert.equal(first.alpha, 0, 'a ring is born invisible');
  assert.ok(Math.abs(second.radius - (35 + 65 / 3)) < 1e-9 && Math.abs(third.radius - (35 + 130 / 3)) < 1e-9);
  assert.deepEqual(
    rippleRings(0, r).map((ring) => ring.tone),
    ['hot', 'body', 'hot']
  );
  assert.ok(rippleRings(0.2, r)[0].radius > first.radius, 'rings ripple outward');
  assert.deepEqual(rippleRings(-1, r), rippleRings(0, r), 'clamped');
});

test('wavyRing is a closed loop within the wave amplitude of its radius', () => {
  const points = wavyRing(50, 60, 100, 0.4);
  assert.equal(points.length, 49);
  assert.ok(Math.abs(points[0][0] - points[48][0]) < 1e-9 && Math.abs(points[0][1] - points[48][1]) < 1e-9);
  const radii = points.map(([x, y]) => Math.hypot(x - 50, y - 60));
  assert.ok(Math.min(...radii) >= 95 - 1e-9 && Math.max(...radii) <= 105 + 1e-9);
  assert.ok(Math.max(...radii) - Math.min(...radii) > 5, 'the ring waves');
});

test('the psychic sigil strokes its visible wave rings and a lens, in palette colours only', () => {
  const rec = recordingContext();
  MATERIALS.psychic.sigil(rec.ctx, 100, 100, 80, 0.3);
  const visible = rippleRings(0.3, 80).filter((ring) => ring.alpha > 0).length;
  assert.equal(strokes(rec), visible + 3);
  assert.equal(rec.fills.count, 1);
  assert.ok(callsAreFinite(rec.calls));
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.psychic, css), css);
  const none = recordingContext();
  MATERIALS.psychic.sigil(none.ctx, 100, 100, 0, 0.3);
  assert.equal(none.calls.length, 0);
});

/** Records each composite-operation change with the save depth it was made at. */
const compositeProbe = (rec) => {
  const changes = [];
  const ctx = new Proxy(rec.ctx, {
    set(target, key, value) {
      if (key === 'globalCompositeOperation') changes.push({ value, depth: rec.state.depth });
      return Reflect.set(target, key, value);
    },
  });
  return { ctx, changes };
};

test('dark uses the recipe palette with the crimson accent as hot, a violet-black shade, dark smoke and crimson streaks', () => {
  const dark = MATERIALS.dark;
  assert.equal(materialFor('dark'), dark);
  assert.deepEqual(dark.palette.deep, [16, 16, 24]);
  assert.deepEqual(dark.palette.shadow, [59, 59, 79]);
  assert.deepEqual(dark.palette.body, [110, 110, 140]);
  assert.deepEqual(dark.palette.core, [185, 185, 214]);
  assert.deepEqual(dark.palette.hot, [255, 61, 110]);
  assert.deepEqual(dark.smoke, [40, 40, 60]);
  assert.ok(dark.shade.every((v, i) => v <= dark.palette.deep[i]), 'shade darker than deep');
  assert.equal(dark.particle.className, 'fx-particle--streak');
  assert.deepEqual(rgbOf(dark.particle.color), dark.palette.hot);
});

test('dark draws its shadow with source-over only inside its own save/restore, never otherwise touching the composite', () => {
  const rec = recordingContext();
  const probe = compositeProbe(rec);
  const dark = MATERIALS.dark;
  dark.glow(probe.ctx, 10, 20, 40, 0.8);
  dark.body(probe.ctx, 10, 20, 40, 0.8, 0.9);
  dark.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1 });
  dark.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
  dark.projectile(probe.ctx, PROJECTILE);
  assert.ok(probe.changes.length > 0, 'the shadow passes cover what is under them');
  for (const change of probe.changes) {
    assert.equal(change.value, 'source-over');
    assert.ok(change.depth >= 1, 'set inside a save');
  }
  assert.equal(rec.state.depth, 0, 'balanced');
});

test('a shadow slash: a blurred crimson halo, then a near-black blade, then one crimson edge stroke', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.dark.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { deep, hot } = MATERIALS.dark.palette;
  assert.equal(probe.filters.length, 1);
  assert.equal(rec.fills.count, 2);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [hot, deep, hot]);
  const jagged = recordingContext();
  MATERIALS.dark.tongue(jagged.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(jagged.fills.count, 2, 'a splinter keeps the same passes');
  const lineTos = (r) => r.calls.filter(([name]) => name === 'lineTo').length;
  assert.ok(lineTos(jagged) < lineTos(rec), 'a splinter is a few straight edges, not a wobbling outline');
});

test('shardOutline: base, shoulders, tip; both edges end at the tip `length` along the heading', () => {
  const outline = shardOutline({ x: 10, y: 20, angleDeg: 0, length: 100, width: 30, seed: 2 });
  assert.equal(outline.left.length, 3);
  assert.equal(outline.right.length, 3);
  assert.deepEqual(outline.left[0], [10, 20]);
  assert.deepEqual(outline.left[2], [110, 20]);
  assert.deepEqual(outline.right[2], outline.left[2]);
  assert.ok(outline.left[1][1] > 20 && outline.right[1][1] < 20, 'shoulders on either side of the axis');
  for (const [px, py] of [...outline.left, ...outline.right]) assert.ok(Number.isFinite(px) && Number.isFinite(py));
  const other = shardOutline({ x: 10, y: 20, angleDeg: 0, length: 100, width: 30, seed: 5 });
  assert.notDeepEqual(other.left[1], outline.left[1], 'the seed varies the splinter');
});

test('pulseRings: three rings between 0.3 r and r, a third of a cycle apart, born and dying invisible', () => {
  for (let phase = 0; phase < 3; phase += 0.05) {
    const rings = pulseRings(phase, 100);
    assert.equal(rings.length, 3);
    for (const ring of rings) {
      assert.ok(ring.radius >= 30 - 1e-9 && ring.radius <= 100 + 1e-9, `radius ${ring.radius}`);
      assert.ok(ring.alpha >= 0 && ring.alpha <= 1);
    }
  }
  const [first, second] = pulseRings(0, 100);
  assert.equal(first.radius, 30);
  assert.equal(first.alpha, 0);
  assert.ok(Math.abs(second.radius - (30 + 70 / 3)) < 1e-9);
  assert.ok(pulseRings(0.1, 100)[0].radius > first.radius, 'rings ripple outward');
});

test('a dark pulse: a shadow core, dark and crimson ring strokes, a pale centre only when hot', () => {
  const rec = recordingContext();
  MATERIALS.dark.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 2, 'shadow core + pale centre');
  assert.equal(strokes(rec), 6, 'three dark rings, three crimson');
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.dark, css), css);
  const cold = recordingContext();
  MATERIALS.dark.body(cold.ctx, 100, 100, 40, 1, 0);
  assert.equal(cold.fills.count, 1);
});

test('a dark projectile is a bare pulse in a haze at 0 tongues and wreathes `tongues` blades and splinters; it ripples with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.dark.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 3, 'haze + core + centre');
  assert.equal(draw({ tongues: 4 }).fills.count, 3 + 4 * 2);
  const firstRing = (time) =>
    draw({ tongues: 0, time })
      .calls.filter(([name]) => name === 'arc')
      .map(([, args]) => args[2])[2];
  assert.notEqual(firstRing(1), firstRing(1.2), 'the rings move with the scene clock');
});

test('steel uses the recipe palette with a cool blue edge, a blue-black shade, no smoke and white sparks', () => {
  const steel = MATERIALS.steel;
  assert.equal(materialFor('steel'), steel);
  assert.deepEqual(steel.palette.body, [154, 167, 184]);
  assert.deepEqual(steel.palette.hot, [213, 222, 234]);
  assert.deepEqual(steel.palette.white, [255, 255, 255]);
  assert.deepEqual(steel.palette.deep, [74, 85, 99]);
  assert.ok(steel.palette.edge[2] > steel.palette.edge[0], 'the edge tint is blue');
  assert.equal(steel.smoke, null);
  assert.ok(steel.shade.every((v, i) => v <= steel.palette.deep[i]), 'shade darker than deep');
  assert.equal(steel.particle.className, 'fx-particle--streak');
  assert.deepEqual(rgbOf(steel.particle.color), steel.palette.white);
  assert.equal(typeof steel.sigil, 'function');
});

test('bladeOutline: a flat heel, parallel edges from the shoulder, a needle point `length` along the heading', () => {
  const outline = bladeOutline({ x: 10, y: 20, angleDeg: 0, length: 100, width: 40 });
  assert.equal(outline.left.length, 4);
  assert.equal(outline.right.length, 4);
  assert.deepEqual(outline.left[3], [110, 20]);
  assert.deepEqual(outline.right[3], outline.left[3], 'both edges end at the tip');
  const halfAt = (i) => Math.abs(outline.left[i][1] - outline.right[i][1]) / 2;
  assert.ok(halfAt(0) > 0 && halfAt(0) < halfAt(1), 'the heel is narrower than the shoulder');
  assert.ok(Math.abs(halfAt(1) - 20) < 1e-9 && Math.abs(halfAt(2) - 20) < 1e-9, 'full width from shoulder to point');
  assert.ok(outline.left[2][0] - 10 >= 65 - 1e-9, 'the point is at most 35 % of a stubby blade');
  const sword = bladeOutline({ x: 0, y: 0, angleDeg: 0, length: 400, width: 20 });
  assert.ok(Math.abs(sword.left[2][0] - 350) < 1e-9, 'a long blade keeps a point 2.5 widths long');
  const turned = bladeOutline({ x: 0, y: 0, angleDeg: 90, length: 50, width: 10 });
  assert.ok(Math.abs(turned.left[3][0]) < 1e-9 && Math.abs(turned.left[3][1] - 50) < 1e-9, 'points along its heading');
});

test('a steel blade: a blurred blue halo, a brushed body, one white specular line; hot 0 drops the line', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.steel.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { edge, hot, body, deep, white } = MATERIALS.steel.palette;
  assert.equal(probe.filters.length, 1);
  assert.equal(rec.fills.count, 2);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [edge, hot, body, deep, white]);
  assert.ok(rec.calls.some(([name]) => name === 'createLinearGradient'), 'brushed across its width');
  const cold = recordingContext();
  MATERIALS.steel.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(strokes(cold), 0);
  const splinter = recordingContext();
  MATERIALS.steel.tongue(splinter.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(splinter.fills.count, 2, 'a splinter keeps the same passes');
});

test('a steel sphere is one fill with a hard white highlight and one blue rim stroke', () => {
  const rec = recordingContext();
  MATERIALS.steel.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 1);
  const { white, edge } = MATERIALS.steel.palette;
  assert.deepEqual(rgbOf(rec.colours[0]), white);
  assert.deepEqual(rgbOf(rec.colours[1]), white, 'two white stops: a hard-edged highlight');
  assert.deepEqual(rgbOf(rec.colours.at(-1)), edge);
});

test('a steel projectile is a bare sphere in its haze at 0 tongues, then one long streak and `tongues - 1` sparks', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.steel.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 2, 'haze + sphere');
  assert.equal(draw({ tongues: 1 }).fills.count, 2 + 2);
  assert.equal(draw({ tongues: 4 }).fills.count, 2 + 4 * 2);
});

test('reticleTicks: four ticks that turn and close, locking square to the screen at the end', () => {
  for (let s = 0; s <= 1; s += 0.05) {
    const ticks = reticleTicks(s, 100);
    assert.equal(ticks.length, 4);
    for (const tick of ticks) {
      assert.ok(tick.from > 0 && tick.from < tick.to && tick.to <= 120 + 1e-9, `span ${tick.from}-${tick.to}`);
    }
  }
  assert.deepEqual(reticleTicks(1, 100).map((tick) => tick.angleDeg), [0, 90, 180, 270]);
  assert.notDeepEqual(reticleTicks(0.3, 100)[0].angleDeg, 0, 'turning before it locks');
  assert.ok(reticleTicks(0, 100)[0].to > reticleTicks(1, 100)[0].to, 'closes in');
});

test('the steel sigil strokes a ring, the ticks and a pip in palette colours only', () => {
  const rec = recordingContext();
  MATERIALS.steel.sigil(rec.ctx, 100, 100, 60, 0.5);
  assert.equal(rec.fills.count, 0);
  assert.equal(strokes(rec), 3);
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.steel, css), css);
  assert.ok(callsAreFinite(rec.calls));
  const none = recordingContext();
  MATERIALS.steel.sigil(none.ctx, 100, 100, 0, 0.5);
  assert.equal(none.calls.length, 0);
});

test('dragon uses the recipe palette with the ember accent, a violet-black shade, violet smoke and ember particles', () => {
  const dragon = MATERIALS.dragon;
  assert.equal(materialFor('dragon'), dragon);
  assert.deepEqual(dragon.palette.deep, [42, 31, 107]);
  assert.deepEqual(dragon.palette.body, [90, 71, 201]);
  assert.deepEqual(dragon.palette.hot, [143, 124, 245]);
  assert.deepEqual(dragon.palette.core, [210, 200, 255]);
  assert.deepEqual(dragon.palette.ember, [255, 155, 61]);
  assert.deepEqual(dragon.smoke, [90, 70, 120]);
  assert.ok(dragon.shade.every((v, i) => v <= dragon.palette.deep[i]), 'shade darker than deep');
  assert.equal(dragon.particle.className, 'fx-particle--ember');
  assert.deepEqual(rgbOf(dragon.particle.color), dragon.palette.ember);
});

test("a dragon tongue is fire's three passes in violet with an ember core; hot 0 drops the core", () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.dragon.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, hot, ember } = MATERIALS.dragon.palette;
  assert.equal(probe.filters.length, 1);
  assert.equal(rec.fills.count, 3);
  assert.deepEqual(rec.colours.map(rgbOf), [body, hot, ember]);
  const cold = recordingContext();
  MATERIALS.dragon.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(cold.fills.count, 2);
  const scale = recordingContext();
  MATERIALS.dragon.tongue(scale.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(scale.fills.count, 3, 'a scale shard keeps the same passes');
  const lineTos = (r) => r.calls.filter(([name]) => name === 'lineTo').length;
  assert.ok(lineTos(scale) < lineTos(rec), 'a scale shard is a few straight edges, not a flickering flame');
});

test('helixStrands: two mirrored sine strands inside 0.8 r that turn with the phase', () => {
  const strands = helixStrands(100, 0);
  assert.equal(strands.length, 2);
  for (const strand of strands) {
    assert.ok(strand.length >= 8);
    for (const [x, y] of strand) assert.ok(Math.hypot(x, y) <= 80 + 1e-9, `inside the orb: ${x}, ${y}`);
  }
  const unturned = helixStrands(100, 0, 0);
  unturned[0].forEach(([x, y], i) => {
    assert.ok(Math.abs(x - unturned[1][i][0]) < 1e-9 && Math.abs(y + unturned[1][i][1]) < 1e-9, 'strand 2 mirrors strand 1');
  });
  assert.notDeepEqual(helixStrands(100, 1)[0], strands[0], 'the phase turns the helix');
  assert.deepEqual(helixStrands(0, 0), [[], []]);
});

test('a dragon orb is one sphere fill with a helix of two strokes (ember, core) that churns with the clock', () => {
  const rec = recordingContext();
  MATERIALS.dragon.body(rec.ctx, 100, 100, 40, 1, 1, 0.5);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 2);
  const { ember, core } = MATERIALS.dragon.palette;
  assert.deepEqual(rec.colours.slice(-2).map(rgbOf), [ember, core]);
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.dragon, css), css);
  const firstLine = (time) => {
    const probe = recordingContext();
    MATERIALS.dragon.body(probe.ctx, 100, 100, 40, 1, 1, time);
    return probe.calls.find(([name]) => name === 'lineTo')[1];
  };
  assert.notDeepEqual(firstLine(0.5), firstLine(0.7), 'the helix turns with the scene clock');
});

test('a dragon projectile is the orb in its glow trailing `tongues` flame tongues', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.dragon.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 2, 'glow + orb');
  assert.equal(draw({ tongues: 5 }).fills.count, 2 + 5 * 3);
  assert.equal(strokes(draw({ tongues: 5 })), 2, 'one helix');
});

test('fairy uses the recipe palette with the gold accent, a plum shade, no smoke and pink twinkle particles', () => {
  const fairy = MATERIALS.fairy;
  assert.equal(materialFor('fairy'), fairy);
  assert.deepEqual(fairy.palette.body, [244, 143, 177]);
  assert.deepEqual(fairy.palette.hot, [255, 194, 218]);
  assert.deepEqual(fairy.palette.core, [255, 240, 247]);
  assert.deepEqual(fairy.palette.deep, [184, 58, 114]);
  assert.deepEqual(fairy.palette.gold, [255, 224, 102]);
  assert.equal(fairy.smoke, null);
  assert.ok(fairy.shade.every((v, i) => v <= fairy.palette.deep[i]), 'shade darker than deep');
  assert.equal(fairy.particle.className, 'fx-particle--twinkle');
  assert.deepEqual(rgbOf(fairy.particle.color), fairy.palette.hot);
});

test('twinkleOutline: four tips at r on the axes, pinched to the waist between them', () => {
  const points = twinkleOutline(100, 50, 40);
  assert.equal(points.length, 8);
  const radii = points.map(([x, y]) => Math.hypot(x - 100, y - 50));
  radii.forEach((r, k) => assert.ok(Math.abs(r - (k % 2 === 0 ? 40 : 40 * 0.16)) < 1e-9, `point ${k}: ${r}`));
  assert.ok(Math.abs(points[0][0] - 140) < 1e-9 && Math.abs(points[0][1] - 50) < 1e-9, 'first tip along the angle');
  const turned = twinkleOutline(0, 0, 10, 90);
  assert.ok(Math.abs(turned[0][0]) < 1e-9 && Math.abs(turned[0][1] - 10) < 1e-9);
});

test('starOutline: five tips at r (the first straight up), inner corners at 0.42 r', () => {
  const points = starOutline(0, 0, 50);
  assert.equal(points.length, 10);
  assert.ok(Math.abs(points[0][0]) < 1e-9 && Math.abs(points[0][1] + 50) < 1e-9, 'upright');
  points.forEach(([x, y], k) => assert.ok(Math.abs(Math.hypot(x, y) - (k % 2 === 0 ? 50 : 21)) < 1e-9, `point ${k}`));
});

test('twinklePulse beats at 3 Hz within 18 %; the sigil turns a fifth of a turn and ends upright', () => {
  assert.equal(twinklePulse(0), 1);
  assert.ok(Math.abs(twinklePulse(1 / 12) - 1.18) < 1e-9, 'peak a quarter period in');
  assert.ok(Math.abs(twinklePulse(1 / 3) - 1) < 1e-9, 'one period = 1/3 s');
  for (let t = 0; t < 2; t += 0.013) assert.ok(twinklePulse(t, 0.7) >= 0.82 - 1e-9 && twinklePulse(t, 0.7) <= 1.18 + 1e-9);
  assert.equal(sigilRotation(0), -90);
  assert.equal(sigilRotation(1), -90 + 72);
  assert.equal(sigilRotation(-1), -90, 'clamped');
  assert.equal(sigilRotation(0.5), -54);
});

test('a fairy twinkle is a soft sphere and one sparkle fill (two crossed four-point stars) that pulses with the clock', () => {
  const rec = recordingContext();
  MATERIALS.fairy.body(rec.ctx, 100, 100, 40, 1, 1, 0.2);
  assert.equal(rec.fills.count, 2);
  assert.equal(rec.calls.filter(([name]) => name === 'closePath').length, 2, 'a star and its 45 deg cross');
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.fairy, css), css);
  const tip = (time) => {
    const probe = recordingContext();
    MATERIALS.fairy.body(probe.ctx, 100, 100, 40, 1, 1, time);
    return probe.calls.filter(([name]) => name === 'moveTo')[0][1][0];
  };
  assert.notEqual(tip(0.1), tip(0.2), 'the sparkle pulses');
});

test('a sparkle trail: one blurred pink ribbon, a pale pass, gold twinkles in one fill; hot 0 drops the twinkles', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.fairy.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, hot, gold } = MATERIALS.fairy.palette;
  assert.equal(probe.filters.length, 1);
  assert.equal(rec.fills.count, 3);
  assert.deepEqual(rec.colours.map(rgbOf), [body, hot, gold]);
  assert.equal(rec.calls.filter(([name]) => name === 'closePath').length, 2 + 3, 'two ribbon passes + three twinkles');
  const cold = recordingContext();
  MATERIALS.fairy.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(cold.fills.count, 2);
});

test('a fairy sparkle shard (jag) is a stretched four-point star along its heading, unblurred, two fills', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.fairy.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 2);
  const tipAt = rec.calls.find(([name]) => name === 'moveTo')[1];
  const a = (TONGUE.angleDeg * Math.PI) / 180;
  const end = [TONGUE.x + Math.cos(a) * TONGUE.length, TONGUE.y + Math.sin(a) * TONGUE.length];
  assert.ok(Math.hypot(tipAt[0] - end[0], tipAt[1] - end[1]) < 1e-9, 'the long tip reaches the tongue end');
  const cold = recordingContext();
  MATERIALS.fairy.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0, jag: 1 });
  assert.equal(cold.fills.count, 1);
});

test('a fairy projectile is the moon: haze, sphere, a clipped crescent and a rim twinkle, trailing `tongues` sparkle trails', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.fairy.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  const bare = draw({ tongues: 0 });
  assert.equal(bare.fills.count, 4, 'haze + sphere + crescent + twinkle');
  assert.equal(bare.calls.filter(([name]) => name === 'clip').length, 1);
  assert.equal(bare.state.depth, 0, 'the crescent clip is restored');
  assert.equal(draw({ tongues: 4 }).fills.count, 4 + 4 * 3);
});

test('the fairy sigil strokes a star outline twice (pink glow, gold line) and fills the twinkles in one pass', () => {
  const rec = recordingContext();
  MATERIALS.fairy.sigil(rec.ctx, 100, 100, 80, 0.4);
  assert.equal(strokes(rec), 2);
  assert.equal(rec.fills.count, 1);
  assert.equal(rec.calls.filter(([name]) => name === 'closePath').length, 2 + 2 + 5, 'two outlines, a crossed centre, five tips');
  assert.ok(callsAreFinite(rec.calls));
  const { hot, gold } = MATERIALS.fairy.palette;
  assert.deepEqual(rec.colours.slice(0, 2).map(rgbOf), [hot, gold]);
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.fairy, css), css);
  const none = recordingContext();
  MATERIALS.fairy.sigil(none.ctx, 100, 100, 0, 0.4);
  assert.equal(none.calls.length, 0);
});

test('ghost uses the recipe palette, a violet-black shade, violet smoke and violet motes', () => {
  const ghost = MATERIALS.ghost;
  assert.equal(materialFor('ghost'), ghost);
  assert.deepEqual(ghost.palette.body, [107, 79, 168]);
  assert.deepEqual(ghost.palette.hot, [157, 124, 242]);
  assert.deepEqual(ghost.palette.core, [217, 204, 255]);
  assert.deepEqual(ghost.palette.deep, [30, 18, 56]);
  assert.deepEqual(ghost.smoke, [60, 40, 90]);
  assert.ok(ghost.shade.every((v, i) => v <= ghost.palette.deep[i]), 'shade darker than deep');
  assert.equal(ghost.particle.className, 'fx-particle--mote');
  assert.deepEqual(rgbOf(ghost.particle.color), ghost.palette.hot);
  assert.equal(typeof ghost.sigil, 'function');
});

test('ghost draws its shadows with source-over only inside its own save/restore, never otherwise touching the composite', () => {
  const rec = recordingContext();
  const probe = compositeProbe(rec);
  const ghost = MATERIALS.ghost;
  ghost.glow(probe.ctx, 10, 20, 40, 0.8);
  ghost.body(probe.ctx, 10, 20, 40, 0.8, 0.9);
  ghost.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1 });
  ghost.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
  ghost.projectile(probe.ctx, PROJECTILE);
  ghost.sigil(probe.ctx, 100, 100, 80, 0.5);
  assert.ok(probe.changes.length > 0, 'the shadow passes cover what is under them');
  for (const change of probe.changes) {
    assert.equal(change.value, 'source-over');
    assert.ok(change.depth >= 1, 'set inside a save');
  }
  assert.equal(rec.state.depth, 0, 'balanced');
});

test('a ghost wisp: a blurred violet body, a paler inner pass, then a dark core line; hot 0 drops the inner pass', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.ghost.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, hot, deep } = MATERIALS.ghost.palette;
  assert.equal(probe.filters.length, 1);
  assert.ok(Number(/blur\(([\d.]+)px\)/.exec(probe.filters[0])[1]) <= 0.12 * TONGUE.width + 1e-9);
  assert.equal(rec.fills.count, 2);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [body, hot, deep], 'the inner line is darker than the outer pass');
  assert.match(rec.colours[0], /, 0\.65\)$/);
  const cold = recordingContext();
  MATERIALS.ghost.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(cold.fills.count, 1);
  assert.equal(strokes(cold), 1, 'the core line stays');
  const splinter = recordingContext();
  MATERIALS.ghost.tongue(splinter.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(splinter.fills.count, 2, 'a splinter keeps the same passes');
  const lineTos = (r) => r.calls.filter(([name]) => name === 'lineTo').length;
  assert.ok(lineTos(splinter) < lineTos(rec), 'a splinter is a few straight edges, not a wavering wisp');
});

test('a ghost glow is a deep shadow puff (covering) ringed by a faint violet fringe (additive)', () => {
  const rec = recordingContext();
  const probe = compositeProbe(rec);
  MATERIALS.ghost.glow(probe.ctx, 50, 50, 40, 1);
  assert.equal(rec.fills.count, 2);
  const { deep, body } = MATERIALS.ghost.palette;
  assert.deepEqual(rec.colours.slice(0, 3).map(rgbOf), [deep, deep, deep]);
  assert.deepEqual(rgbOf(rec.colours.at(-1)), body);
  assert.equal(probe.changes.length, 1, 'only the shadow is source-over');
});

test('a shadow ball: a violet rim glow, a black-to-deep sphere, a ragged violet edge, a glint only when hot', () => {
  const rec = recordingContext();
  MATERIALS.ghost.body(rec.ctx, 100, 100, 40, 1, 1);
  const { black, deep, hot } = MATERIALS.ghost.palette;
  assert.equal(rec.fills.count, 3, 'rim glow + sphere + glint');
  assert.equal(strokes(rec), 1, 'the ragged edge');
  const colours = rec.colours.map(rgbOf);
  assert.deepEqual(colours.slice(3, 6), [black, deep, deep], 'the sphere is black at the centre');
  assert.deepEqual(colours[6], hot, 'the edge is violet');
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.ghost, css), css);
  const cold = recordingContext();
  MATERIALS.ghost.body(cold.ctx, 100, 100, 40, 1, 0);
  assert.equal(cold.fills.count, 2);
});

test('a ghost projectile is a bare shadow ball in its haze at 0 tongues, trails `tongues` wisps, and its edge churns with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.ghost.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 1 + 3, 'haze + ball');
  assert.equal(draw({ tongues: 4 }).fills.count, 1 + 4 * 2 + 3);
  assert.equal(strokes(draw({ tongues: 4 })), 4 + 1, 'a core line per wisp + the ball edge');
  const edgeStart = (time) => draw({ tongues: 0, time }).calls.find(([name]) => name === 'moveTo')[1];
  assert.notDeepEqual(edgeStart(1), edgeStart(1.4), 'the ragged edge turns with the scene clock');
});

test('eyeOpenness: shut at both ends, wide open from a quarter to four fifths, clamped', () => {
  assert.equal(eyeOpenness(0), 0);
  assert.equal(eyeOpenness(0.25), 1);
  assert.equal(eyeOpenness(0.5), 1);
  assert.equal(eyeOpenness(0.8), 1);
  assert.equal(eyeOpenness(1), 0);
  assert.equal(eyeOpenness(-1), 0);
  assert.equal(eyeOpenness(2), 0);
  let last = 0;
  for (let s = 0; s <= 0.25; s += 0.01) {
    assert.ok(eyeOpenness(s) >= last - 1e-12, `opening at ${s}`);
    last = eyeOpenness(s);
  }
  last = 1;
  for (let s = 0.8; s <= 1; s += 0.01) {
    assert.ok(eyeOpenness(s) <= last + 1e-12, `closing at ${s}`);
    last = eyeOpenness(s);
  }
});

test('slitEyes: two mirrored almonds inside r, inner corners lower than the outer (a glare), shut flat at 0', () => {
  const [left, right] = slitEyes(100, 100, 50, 1);
  assert.ok(Math.abs(left.pupil.x - 100 + (right.pupil.x - 100)) < 1e-9, 'mirrored about x');
  assert.ok(left.pupil.x < 100 && right.pupil.x > 100);
  for (const eye of [left, right]) {
    assert.ok(eye.inner[1] > eye.outer[1], 'the inner corner sits lower');
    assert.ok(Math.abs(eye.inner[0] - 100) < Math.abs(eye.outer[0] - 100), 'the inner corner faces the middle');
    assert.ok(eye.top[1] < eye.pupil.y && eye.bottom[1] > eye.pupil.y, 'controls above and below');
    for (const [px, py] of [eye.inner, eye.outer, eye.top, eye.bottom]) assert.ok(Math.hypot(px - 100, py - 100) <= 50 + 1e-9);
    assert.ok(eye.pupil.ry > eye.pupil.rx, 'a vertical slit');
  }
  assert.ok(Math.abs(left.inner[1] - right.inner[1]) < 1e-9 && Math.abs(left.outer[1] - right.outer[1]) < 1e-9);
  const shut = slitEyes(100, 100, 50, 0);
  for (const eye of shut) {
    assert.ok(Math.abs(eye.top[0] - eye.bottom[0]) < 1e-9 && Math.abs(eye.top[1] - eye.bottom[1]) < 1e-9, 'no height');
    assert.equal(eye.pupil.ry, 0);
  }
});

test('the ghost sigil: a shadow puff, the eye whites in one fill with one violet outline, pupils in one shadow fill', () => {
  const rec = recordingContext();
  MATERIALS.ghost.sigil(rec.ctx, 100, 100, 80, 0.5);
  assert.equal(rec.fills.count, 2 + 1 + 1);
  assert.equal(strokes(rec), 1);
  assert.equal(rec.calls.filter(([name]) => name === 'quadraticCurveTo').length, 4);
  assert.equal(rec.calls.filter(([name]) => name === 'ellipse').length, 2);
  assert.ok(callsAreFinite(rec.calls));
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.ghost, css), css);
  const none = recordingContext();
  MATERIALS.ghost.sigil(none.ctx, 100, 100, 80, 0);
  MATERIALS.ghost.sigil(none.ctx, 100, 100, 0, 0.5);
  assert.equal(none.calls.length, 0);
});

test('poison uses the recipe palette, a violet-black shade, fume smoke and lilac glob particles', () => {
  const poison = MATERIALS.poison;
  assert.equal(materialFor('poison'), poison);
  assert.deepEqual(poison.palette.deep, [75, 30, 107]);
  assert.deepEqual(poison.palette.body, [155, 77, 202]);
  assert.deepEqual(poison.palette.hot, [199, 125, 255]);
  assert.deepEqual(poison.palette.core, [240, 214, 255]);
  assert.deepEqual(poison.smoke, [120, 70, 150]);
  assert.ok(poison.shade.every((v, i) => v <= poison.palette.deep[i]), 'shade darker than deep');
  assert.equal(poison.particle.className, 'fx-particle--glob');
  assert.equal(poison.particle.aspect, 1);
  assert.deepEqual(rgbOf(poison.particle.color), poison.palette.hot);
  assert.equal(typeof poison.sigil, 'function');
});

test('poison draws its dark rims with source-over only inside its own save/restore, never otherwise touching the composite', () => {
  const rec = recordingContext();
  const probe = compositeProbe(rec);
  const poison = MATERIALS.poison;
  poison.glow(probe.ctx, 10, 20, 40, 0.8);
  poison.body(probe.ctx, 10, 20, 40, 0.8, 0.9);
  poison.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1 });
  poison.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
  poison.projectile(probe.ctx, PROJECTILE);
  poison.sigil(probe.ctx, 100, 100, 80, 0.5);
  assert.ok(probe.changes.length > 0, 'the goo rims cover what is under them');
  for (const change of probe.changes) {
    assert.equal(change.value, 'source-over');
    assert.ok(change.depth >= 1, 'set inside a save');
  }
  assert.equal(rec.state.depth, 0, 'balanced');
});

test('globOutline: a closed loop within the wobble of its radius that quivers with the phase', () => {
  const points = globOutline(50, 60, 100, 0.7);
  assert.equal(points.length, 25);
  assert.ok(Math.abs(points[0][0] - points[24][0]) < 1e-9 && Math.abs(points[0][1] - points[24][1]) < 1e-9, 'closed');
  const radii = points.map(([x, y]) => Math.hypot(x - 50, y - 60));
  assert.ok(Math.min(...radii) >= 92 - 1e-9 && Math.max(...radii) <= 108 + 1e-9);
  assert.ok(Math.max(...radii) - Math.min(...radii) > 4, 'the outline wobbles');
  assert.notDeepEqual(globOutline(50, 60, 100, 1.4), points, 'the phase turns the wobble');
});

test('a poison glob: a lit fill, a drip hanging under it, one dark rim stroke and a glint only when hot', () => {
  const rec = recordingContext();
  MATERIALS.poison.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 3, 'glob + drip + glint');
  assert.equal(strokes(rec), 1, 'the rim');
  const arcs = rec.calls.filter(([name]) => name === 'arc').map(([, args]) => args);
  const [, dripY, dripR] = arcs[0];
  assert.ok(dripY > 100 + 40 * 0.9 && dripR < 40 * 0.3, 'a small drip under the glob');
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.poison, css), css);
  const cold = recordingContext();
  MATERIALS.poison.body(cold.ctx, 100, 100, 40, 1, 0);
  assert.equal(cold.fills.count, 2);
});

test('streamGlobs: 5 to 7 globs from base to tip, shrinking toward the tip', () => {
  const long = streamGlobs({ x: 0, y: 0, angleDeg: 0, length: 400, width: 40, time: 0.5, seed: 2 });
  const short = streamGlobs({ x: 0, y: 0, angleDeg: 0, length: 60, width: 40, time: 0.5, seed: 2 });
  assert.equal(long.length, 7);
  assert.equal(short.length, 5);
  for (const globs of [long, short]) {
    for (let i = 1; i < globs.length; i += 1) {
      assert.ok(globs[i].r < globs[i - 1].r, 'shrinks toward the tip');
      assert.ok(globs[i].x > globs[i - 1].x, 'runs base to tip');
    }
    assert.ok(globs[0].r <= 20 + 1e-9);
    for (const g of globs) assert.ok(Math.abs(g.y) <= 40 * 0.18 + 1e-9, 'sways within the stream');
  }
  assert.ok(long.at(-1).x < 400, 'the last glob short of the tip');
  assert.deepEqual(streamGlobs({ x: 0, y: 0, angleDeg: 0, length: 0, width: 40, time: 0, seed: 0 }), []);
  const turned = streamGlobs({ x: 0, y: 0, angleDeg: 90, length: 100, width: 10, time: 0, seed: 0 });
  assert.ok(turned.every((g) => g.y > 0), 'follows its heading');
});

test('a poison stream never blurs: an ooze band, the globs in one fill, their glints in one fill; hot 0 drops the glints', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.poison.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, core } = MATERIALS.poison.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 3);
  assert.deepEqual(rec.colours.map(rgbOf), [body, body, core]);
  const globs = streamGlobs(TONGUE).length;
  assert.equal(rec.calls.filter(([name]) => name === 'arc').length, globs * 2, 'a glint per glob');
  const cold = recordingContext();
  MATERIALS.poison.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(cold.fills.count, 2);
});

test('a poison barb (jag) is a violet spine with a lilac core: two straight-edged fills, no globs', () => {
  const rec = recordingContext();
  MATERIALS.poison.tongue(rec.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  const { body, hot } = MATERIALS.poison.palette;
  assert.equal(rec.fills.count, 2);
  assert.deepEqual(rec.colours.map(rgbOf), [body, hot]);
  assert.equal(rec.calls.filter(([name]) => name === 'arc').length, 0);
});

test('a poison projectile: haze + glob at 0 tongues, `tongues` drips trailing behind it in one fill, quivering with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.poison.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 3, 'haze + glob + glint');
  const dripping = draw({ tongues: 3 });
  assert.equal(dripping.fills.count, 4, 'the drips share one fill');
  const arcs = dripping.calls.filter(([name]) => name === 'arc').map(([, args]) => args);
  const drips = arcs.slice(1, 4);
  const heading = (PROJECTILE.headingDeg * Math.PI) / 180;
  for (const [x, y] of drips) {
    assert.ok((x - PROJECTILE.x) * Math.cos(heading) + (y - PROJECTILE.y) * Math.sin(heading) < 0, 'behind the glob');
  }
  assert.equal(strokes(dripping), 1, 'one rim, no drip under a flying glob');
  const outlineStart = (time) => draw({ tongues: 0, time }).calls.find(([name]) => name === 'moveTo')[1];
  assert.notDeepEqual(outlineStart(1), outlineStart(1.3), 'the glob quivers with the scene clock');
});

test('poolSpread: shut at 0, fully spread from a quarter on, clamped and never shrinking', () => {
  assert.equal(poolSpread(0), 0);
  assert.equal(poolSpread(0.25), 1);
  assert.equal(poolSpread(0.9), 1);
  assert.equal(poolSpread(-1), 0);
  assert.equal(poolSpread(2), 1);
  let last = 0;
  for (let s = 0; s <= 1; s += 0.02) {
    assert.ok(poolSpread(s) >= last - 1e-12);
    last = poolSpread(s);
  }
});

test('bubbleRise: none at either end, at most seven, all above the pool and rising, popping as they go', () => {
  const r = 100;
  assert.deepEqual(bubbleRise(0, r), []);
  assert.deepEqual(bubbleRise(0.96, r), []);
  assert.deepEqual(bubbleRise(-1, r), []);
  let seen = 0;
  for (let s = 0; s < 1; s += 0.01) {
    const bubbles = bubbleRise(s, r);
    seen = Math.max(seen, bubbles.length);
    for (const b of bubbles) {
      assert.ok(b.dy < 0, 'above the pool');
      assert.ok(b.dy >= -1.25 * r - 1e-9);
      assert.ok(Math.abs(b.dx) <= r + 1e-9);
      assert.ok(b.radius > 0 && b.radius <= 0.12 * r);
      assert.ok(b.alpha > 0 && b.alpha <= 1);
    }
  }
  assert.ok(seen >= 3 && seen <= 7, `at most ${seen} at once`);
  const [early] = bubbleRise(0.1, r);
  const [later] = bubbleRise(0.15, r);
  assert.equal(bubbleRise(0.15, r).length, 1, 'only the first bubble is out');
  assert.ok(later.dy < early.dy, 'it rises');
  assert.ok(bubbleRise(0.47, r)[0].alpha < 1, 'and pops at the end of its life');
});

test('the poison sigil: a pool fill with a lilac rim, then each bubble filled and skinned, in palette colours only', () => {
  const rec = recordingContext();
  MATERIALS.poison.sigil(rec.ctx, 100, 100, 80, 0.5);
  const bubbles = bubbleRise(0.5, 80).length;
  assert.ok(bubbles > 0);
  assert.equal(rec.fills.count, 1 + bubbles);
  assert.equal(strokes(rec), 1 + bubbles);
  assert.ok(callsAreFinite(rec.calls));
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.poison, css), css);
  const none = recordingContext();
  MATERIALS.poison.sigil(none.ctx, 100, 100, 80, 0);
  MATERIALS.poison.sigil(none.ctx, 100, 100, 0, 0.5);
  assert.equal(none.calls.length, 0);
});

test('ground uses the recipe palette, an umber shade, dust for smoke and sand-coloured shard particles', () => {
  const ground = MATERIALS.ground;
  assert.equal(materialFor('ground'), ground);
  assert.deepEqual(ground.palette.deep, [92, 58, 23]);
  assert.deepEqual(ground.palette.body, [181, 121, 60]);
  assert.deepEqual(ground.palette.hot, [217, 160, 102]);
  assert.deepEqual(ground.palette.core, [240, 217, 181]);
  assert.deepEqual(ground.smoke, [150, 130, 110]);
  assert.ok(ground.shade.every((v, i) => v <= ground.palette.deep[i]), 'shade darker than deep');
  assert.equal(ground.particle.className, 'fx-particle--shard');
  assert.deepEqual(rgbOf(ground.particle.color), ground.palette.hot);
  assert.equal(typeof ground.sigil, 'function');
});

test('mud is the ground browns one step darker: its hot and core are ground body and hot, glob particles, no sigil', () => {
  const { ground, mud } = MATERIALS;
  assert.equal(materialFor('mud'), mud);
  assert.deepEqual(mud.palette.hot, ground.palette.body);
  assert.deepEqual(mud.palette.core, ground.palette.hot);
  for (const key of ['deep', 'body']) {
    assert.ok(mud.palette[key].every((v, i) => v < ground.palette[key][i]), `mud ${key} darker`);
  }
  assert.ok(mud.shade.every((v, i) => v <= mud.palette.deep[i]));
  assert.equal(mud.particle.className, 'fx-particle--glob');
  assert.deepEqual(rgbOf(mud.particle.color), mud.palette.body);
  assert.equal(mud.sigil, undefined);
});

test('ground and mud draw their solid earth with source-over only inside their own save/restore', () => {
  for (const name of ['ground', 'mud']) {
    const rec = recordingContext();
    const probe = compositeProbe(rec);
    const material = MATERIALS[name];
    material.glow(probe.ctx, 10, 20, 40, 0.8);
    material.body(probe.ctx, 10, 20, 40, 0.8, 0.9);
    material.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1 });
    material.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
    material.projectile(probe.ctx, PROJECTILE);
    material.sigil?.(probe.ctx, 100, 100, 80, 0.5);
    assert.ok(probe.changes.length > 0, `${name}: the earth covers what is under it`);
    for (const change of probe.changes) {
      assert.equal(change.value, 'source-over', name);
      assert.ok(change.depth >= 1, `${name}: set inside a save`);
    }
    assert.equal(rec.state.depth, 0, `${name}: balanced`);
  }
});

test('clodOutline: seven corners between 0.8 r and 1.2 r, stable per seed, turned by spin', () => {
  const points = clodOutline(50, 60, 100, 3);
  assert.equal(points.length, 7);
  const radii = points.map(([x, y]) => Math.hypot(x - 50, y - 60));
  for (const r of radii) assert.ok(r >= 80 - 1e-9 && r <= 120 + 1e-9, String(r));
  assert.ok(Math.max(...radii) - Math.min(...radii) > 5, 'a lump, not a circle');
  assert.deepEqual(clodOutline(50, 60, 100, 3), points, 'stable for one seed');
  assert.notDeepEqual(clodOutline(50, 60, 100, 4), points, 'each seed its own lump');
  const turned = clodOutline(50, 60, 100, 3, Math.PI / 2);
  const angle = ([x, y]) => Math.atan2(y - 60, x - 50);
  const delta = (((angle(turned[0]) - angle(points[0])) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(Math.abs(delta - Math.PI / 2) < 1e-9, 'spin turns it');
});

test('a ground clod: one flat-shaded fill (body above, deep below a hard terminator), a lit chip only when hot', () => {
  const rec = recordingContext();
  MATERIALS.ground.body(rec.ctx, 100, 100, 40, 1, 1);
  const { body, deep, core } = MATERIALS.ground.palette;
  assert.equal(rec.fills.count, 2);
  assert.deepEqual(rec.colours.map(rgbOf), [body, body, deep, deep, core]);
  const gradient = rec.calls.find(([name]) => name === 'createLinearGradient')[1];
  assert.deepEqual(gradient, [100, 60, 100, 140], 'lit from straight above');
  const cold = recordingContext();
  MATERIALS.ground.body(cold.ctx, 100, 100, 40, 1, 0);
  assert.equal(cold.fills.count, 1);
});

test('spikeOutline: a base `width` wide on the origin, straight to the shoulders, a jagged top, both chains ending at one tip', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 100, width: 40, seed: 2 };
  const { left, right } = spikeOutline(spec);
  assert.equal(left.length, 5);
  assert.equal(right.length, 5);
  assert.deepEqual(left.at(-1), right.at(-1), 'one tip');
  assert.ok(Math.abs(left[0][0]) < 1e-9 && Math.abs(left[0][1] - 20) < 1e-9);
  assert.ok(Math.abs(right[0][0]) < 1e-9 && Math.abs(right[0][1] + 20) < 1e-9);
  assert.ok(Math.abs(left.at(-1)[0] - 100) < 1e-9 && Math.abs(left.at(-1)[1]) <= 40 * 0.08 + 1e-9, 'the tip leans a little');
  for (const chain of [left, right]) {
    for (let i = 1; i < chain.length; i += 1) assert.ok(chain[i][0] > chain[i - 1][0], 'runs base to tip');
  }
  assert.ok(left[2][1] < left[3][1], 'a notch then a tooth on the left');
  assert.ok(right[2][1] > right[3][1], 'a notch then a tooth on the right');
  const up = spikeOutline({ ...spec, angleDeg: -90 });
  assert.ok(up.left.at(-1)[1] < -99, 'follows its heading');
});

test('a ground spike never blurs: a solid fill, a shaded facet and one lit edge; hot 0 drops the edge; a chip is two fills', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.ground.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, deep, hot } = MATERIALS.ground.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 2);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [body, deep, hot]);
  const cold = recordingContext();
  MATERIALS.ground.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(strokes(cold), 0);
  const chip = recordingContext();
  MATERIALS.ground.tongue(chip.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(chip.fills.count, 2);
});

test('a ground projectile: `tongues` dust puffs behind its heading, then a clod that tumbles with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.ground.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 2, 'clod + chip');
  const trailing = draw({ tongues: 3 });
  assert.equal(trailing.fills.count, 5);
  const puffs = trailing.calls.filter(([name]) => name === 'arc').map(([, args]) => args).slice(0, 3);
  const heading = (PROJECTILE.headingDeg * Math.PI) / 180;
  for (const [x, y] of puffs) {
    assert.ok((x - PROJECTILE.x) * Math.cos(heading) + (y - PROJECTILE.y) * Math.sin(heading) < 0, 'behind the clod');
  }
  const outlineStart = (time) => draw({ tongues: 0, time }).calls.find(([name]) => name === 'moveTo')[1];
  assert.notDeepEqual(outlineStart(1), outlineStart(1.3), 'the clod tumbles');
});

test('fissureSeams: none at 0, six seams from the pool centre grown full by 0.35, inside r and squashed to the floor', () => {
  assert.deepEqual(fissureSeams(0, 100), { spread: 0, seams: [] });
  assert.deepEqual(fissureSeams(0.5, 0), { spread: 0, seams: [] });
  const full = fissureSeams(0.35, 100);
  assert.equal(full.spread, 1);
  assert.deepEqual(fissureSeams(0.9, 100), full, 'holds once open');
  assert.equal(full.seams.length, 6);
  for (const line of full.seams) {
    assert.ok(Math.hypot(...line[0]) < 1e-9, 'from the pool centre');
    for (const [x, y] of line) {
      assert.ok(Math.hypot(x, y) <= 101);
      assert.ok(Math.abs(y) <= 0.42 * 101);
    }
  }
  const early = fissureSeams(0.1, 100);
  const reach = (pose) => Math.max(...pose.seams.map((line) => Math.hypot(...line.at(-1))));
  assert.ok(early.spread > 0 && early.spread < 1 && reach(early) < reach(full), 'the seams grow');
});

test('the ground sigil: a glowing pool fill and two seam strokes, in palette colours only; nothing before it opens', () => {
  const rec = recordingContext();
  MATERIALS.ground.sigil(rec.ctx, 100, 100, 80, 0.5);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 2);
  assert.ok(callsAreFinite(rec.calls));
  for (const css of rec.colours) assert.ok(inPalette(MATERIALS.ground, css), css);
  const none = recordingContext();
  MATERIALS.ground.sigil(none.ctx, 100, 100, 80, 0);
  MATERIALS.ground.sigil(none.ctx, 100, 100, 0, 0.5);
  assert.equal(none.calls.length, 0);
});

test('a mud stream never blurs: a dark band, the globs riding it in one fill, their glints in one fill; hot 0 drops the glints; a chunk is two fills', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.mud.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { deep, body, core } = MATERIALS.mud.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 3);
  assert.deepEqual(rec.colours.map(rgbOf), [deep, body, core]);
  assert.equal(rec.calls.filter(([name]) => name === 'arc').length, streamGlobs(TONGUE).length * 2, 'a glint per glob');
  const cold = recordingContext();
  MATERIALS.mud.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(cold.fills.count, 2);
  const chunk = recordingContext();
  MATERIALS.mud.tongue(chunk.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(chunk.fills.count, 2);
});

test('a mud glob is a glossy sphere with a sheen dot; a mud projectile trails `tongues` drips behind it in one fill', () => {
  const glob = recordingContext();
  MATERIALS.mud.body(glob.ctx, 100, 100, 40, 1, 1);
  assert.equal(glob.fills.count, 2);
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.mud.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 2);
  const dripping = draw({ tongues: 3 });
  assert.equal(dripping.fills.count, 3, 'the drips share one fill');
  const drips = dripping.calls.filter(([name]) => name === 'arc').map(([, args]) => args).slice(0, 3);
  const heading = (PROJECTILE.headingDeg * Math.PI) / 180;
  for (const [x, y] of drips) {
    assert.ok((x - PROJECTILE.x) * Math.cos(heading) + (y - PROJECTILE.y) * Math.sin(heading) < 0, 'behind the glob');
  }
});

test('rock uses the recipe palette, a slate shade, grey stone dust for smoke and pale shard particles', () => {
  const rock = MATERIALS.rock;
  assert.equal(materialFor('rock'), rock);
  assert.deepEqual(rock.palette.deep, [62, 67, 76]);
  assert.deepEqual(rock.palette.body, [138, 143, 153]);
  assert.deepEqual(rock.palette.hot, [184, 190, 201]);
  assert.deepEqual(rock.palette.core, [232, 236, 242]);
  assert.ok(rock.shade.every((v, i) => v <= rock.palette.deep[i]), 'shade darker than deep');
  assert.ok(Array.isArray(rock.smoke) && rock.smoke.length === 3, 'dust');
  assert.equal(rock.particle.className, 'fx-particle--shard');
  assert.deepEqual(rgbOf(rock.particle.color), rock.palette.hot);
});

test('ancient is the rock stone in a violet aura: rock face, deep and lit facet, violet hot and shard particles', () => {
  const { rock, ancient } = MATERIALS;
  assert.equal(materialFor('ancient'), ancient);
  assert.deepEqual(ancient.palette.body, rock.palette.body);
  assert.deepEqual(ancient.palette.deep, rock.palette.deep);
  assert.deepEqual(ancient.palette.lit, rock.palette.hot, 'the stone stays stone');
  const [r, g, b] = ancient.palette.hot;
  assert.ok(r > g && b > g, 'hot is violet');
  assert.deepEqual(rgbOf(ancient.particle.color), ancient.palette.hot);
});

test('gem is light: a lilac-white palette, no smoke, twinkle particles, never touching the composite', () => {
  const gem = MATERIALS.gem;
  assert.equal(materialFor('gem'), gem);
  assert.equal(gem.smoke, null);
  assert.equal(gem.particle.className, 'fx-particle--twinkle');
  assert.deepEqual(rgbOf(gem.particle.color), gem.palette.hot);
  for (const key of ['body', 'hot', 'core']) {
    const [r, g, b] = gem.palette[key];
    assert.ok(b >= r && b >= g && Math.min(r, g, b) > 160, `gem ${key} is pale and cool`);
  }
  const rec = recordingContext();
  gem.glow(rec.ctx, 10, 20, 40, 0.8);
  gem.body(rec.ctx, 10, 20, 40, 0.8, 0.9);
  gem.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1 });
  gem.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
  gem.projectile(rec.ctx, PROJECTILE);
  assert.deepEqual(rec.state.composite, [], 'additive throughout');
  assert.equal(rec.state.depth, 0);
});

test('rock and ancient draw their stone with source-over only inside their own save/restore', () => {
  for (const name of ['rock', 'ancient']) {
    const rec = recordingContext();
    const probe = compositeProbe(rec);
    const material = MATERIALS[name];
    material.glow(probe.ctx, 10, 20, 40, 0.8);
    material.body(probe.ctx, 10, 20, 40, 0.8, 0.9);
    material.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1 });
    material.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
    material.projectile(probe.ctx, PROJECTILE);
    assert.ok(probe.changes.length > 0, `${name}: the stone covers what is under it`);
    for (const change of probe.changes) {
      assert.equal(change.value, 'source-over', name);
      assert.ok(change.depth >= 1, `${name}: set inside a save`);
    }
    assert.equal(rec.state.depth, 0, `${name}: balanced`);
  }
});

test('stoneOutline: five corners between 0.78 r and 1.1 r, stable per seed, turned by spin', () => {
  const points = stoneOutline(50, 60, 100, 3);
  assert.equal(points.length, 5);
  const radii = points.map(([x, y]) => Math.hypot(x - 50, y - 60));
  for (const r of radii) assert.ok(r >= 78 - 1e-9 && r <= 110 + 1e-9, String(r));
  assert.deepEqual(stoneOutline(50, 60, 100, 3), points, 'stable for one seed');
  assert.notDeepEqual(stoneOutline(50, 60, 100, 4), points, 'each seed its own stone');
  const turned = stoneOutline(50, 60, 100, 3, Math.PI / 3);
  const angle = ([x, y]) => Math.atan2(y - 60, x - 50);
  const delta = (((angle(turned[0]) - angle(points[0])) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(Math.abs(delta - Math.PI / 3) < 1e-9, 'spin turns it');
});

test('litFacet: a ridge point then a contiguous run of the corners facing the upper-left light, at any spin', () => {
  for (let spin = 0; spin < Math.PI * 2; spin += 0.37) {
    const points = stoneOutline(0, 0, 100, 5, spin);
    const facet = litFacet(points, 0, 0, 100);
    assert.ok(facet.length >= 3, `spin ${spin.toFixed(2)}: a facet`);
    const [ridge, ...lit] = facet;
    assert.ok(ridge[0] > 0 && ridge[1] > 0, 'the ridge sits down-right of the centre');
    for (const [x, y] of lit) assert.ok(x + y < 0.35 * 100, `spin ${spin.toFixed(2)}: lit corner faces up-left`);
    const indices = lit.map((p) => points.indexOf(p));
    for (let k = 1; k < indices.length; k += 1) {
      assert.equal(indices[k], (indices[k - 1] + 1) % points.length, 'contiguous, in outline order');
    }
  }
  assert.deepEqual(litFacet([[10, 10], [20, 0], [0, 20]], 0, 0, 10), [], 'nothing faces the light');
});

test('shadowFacet: the lit facet ridge point, then a contiguous run of corners facing down-right, never a lit one', () => {
  for (let spin = 0; spin < Math.PI * 2; spin += 0.37) {
    const points = stoneOutline(0, 0, 100, 5, spin);
    const shade = shadowFacet(points, 0, 0, 100, 5);
    const lit = litFacet(points, 0, 0, 100, 5);
    if (shade.length === 0) continue;
    assert.deepEqual(shade[0], lit[0], 'one ridge');
    for (const corner of shade.slice(1)) {
      assert.ok(corner[0] + corner[1] > 0, `spin ${spin.toFixed(2)}: faces down-right`);
      assert.ok(!lit.includes(corner), 'never lit');
    }
  }
  assert.deepEqual(shadowFacet([[-10, -10], [-20, 0], [0, -20]], 0, 0, 10), [], 'nothing faces away');
});

test('spireOutline: a base `width` wide on the origin, narrowing shoulders, both chains ending at one sharp tip', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 100, width: 40, seed: 2 };
  const { left, right } = spireOutline(spec);
  assert.equal(left.length, 3);
  assert.equal(right.length, 3);
  assert.deepEqual(left.at(-1), right.at(-1), 'one tip');
  assert.ok(Math.abs(left[0][1] - 20) < 1e-9 && Math.abs(right[0][1] + 20) < 1e-9, 'the base is `width` wide');
  assert.ok(Math.abs(left.at(-1)[0] - 100) < 1e-9 && Math.abs(left.at(-1)[1]) <= 40 * 0.07 + 1e-9, 'the tip leans a little');
  for (const chain of [left, right]) {
    for (let i = 1; i < chain.length; i += 1) assert.ok(chain[i][0] > chain[i - 1][0], 'runs base to tip');
  }
  assert.ok(left[1][1] < 20 && right[1][1] > -20, 'narrowing at the shoulders');
  const up = spireOutline({ ...spec, angleDeg: -90 });
  assert.ok(up.left.at(-1)[1] < -99, 'follows its heading');
});

test('crystalOutline: six corners, pointed at both ends of its axis, squared at the waist', () => {
  const points = crystalOutline(0, 0, 100, -90);
  assert.equal(points.length, 6);
  assert.ok(Math.abs(points[0][0]) < 1e-9 && Math.abs(points[0][1] + 100) < 1e-9, 'top point');
  assert.ok(Math.abs(points[3][0]) < 1e-9 && Math.abs(points[3][1] - 100) < 1e-9, 'bottom point');
  for (const [x] of points) assert.ok(Math.abs(x) <= 32 + 1e-9, 'within the waist');
  const flat = crystalOutline(0, 0, 100, 0);
  assert.ok(Math.abs(flat[0][0] - 100) < 1e-9, 'follows its axis');
});

test('a rock stone: a face, a lit facet and a shadow sliver (source-over), a dark outline, a pale rim only when hot', () => {
  const rec = recordingContext();
  MATERIALS.rock.body(rec.ctx, 100, 100, 40, 1, 1);
  const { body, hot, deep, core } = MATERIALS.rock.palette;
  assert.equal(rec.fills.count, 3);
  assert.equal(strokes(rec), 2);
  assert.deepEqual(rec.colours.map(rgbOf), [body, hot, deep, deep, core]);
  const cold = recordingContext();
  MATERIALS.rock.body(cold.ctx, 100, 100, 40, 1, 0);
  assert.equal(strokes(cold), 1, 'no rim when cold');
  assert.equal(cold.fills.count, 3, 'the facet tones stay');
});

test('a rock spire never blurs: a solid fill, a shaded half and one lit edge; hot 0 drops the edge; a chip is two fills', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.rock.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, deep, core } = MATERIALS.rock.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 2);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [body, deep, core]);
  const cold = recordingContext();
  MATERIALS.rock.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(strokes(cold), 0);
  const chip = recordingContext();
  MATERIALS.rock.tongue(chip.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(chip.fills.count, 2);
});

test('a rock projectile: `tongues` dust puffs behind its heading, then a boulder that tumbles with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.rock.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 3, 'face + lit facet + shadow');
  const trailing = draw({ tongues: 3 });
  assert.equal(trailing.fills.count, 6);
  const puffs = trailing.calls.filter(([name]) => name === 'arc').map(([, args]) => args).slice(0, 3);
  const heading = (PROJECTILE.headingDeg * Math.PI) / 180;
  for (const [x, y] of puffs) {
    assert.ok((x - PROJECTILE.x) * Math.cos(heading) + (y - PROJECTILE.y) * Math.sin(heading) < 0, 'behind the boulder');
  }
  const outlineStart = (time) => draw({ tongues: 0, time }).calls.find(([name]) => name === 'moveTo')[1];
  assert.notDeepEqual(outlineStart(1), outlineStart(1.3), 'the boulder tumbles');
});

test('an ancient stone sits in a violet halo with a violet rim; its projectile trails violet wisps', () => {
  const rec = recordingContext();
  MATERIALS.ancient.body(rec.ctx, 100, 100, 40, 1, 1);
  const { hot } = MATERIALS.ancient.palette;
  assert.equal(rec.fills.count, 4, 'halo, face, lit facet, shadow');
  assert.deepEqual(rgbOf(rec.colours[0]), hot, 'the halo comes first, behind the stone');
  assert.deepEqual(rgbOf(rec.colours.at(-1)), hot, 'the rim is violet');
  const trail = recordingContext();
  MATERIALS.ancient.projectile(trail.ctx, { ...PROJECTILE, tongues: 2 });
  // Two wisps, the halo, then the stone: its face, its lit facet, and a shadow sliver when a
  // corner faces away from the light at this turn of the tumble.
  assert.ok(trail.fills.count >= 2 + 1 + 2 && trail.fills.count <= 2 + 1 + 3, `fills ${trail.fills.count}`);
});

test('a gem crystal: a body fill, a bright facet only when hot, one pale rim stroke', () => {
  const rec = recordingContext();
  MATERIALS.gem.body(rec.ctx, 100, 100, 40, 1, 1);
  const { body, core, hot } = MATERIALS.gem.palette;
  assert.equal(rec.fills.count, 2);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [body, core, hot]);
  const cold = recordingContext();
  MATERIALS.gem.body(cold.ctx, 100, 100, 40, 1, 0);
  assert.equal(cold.fills.count, 1);
});

test('a gem streak never blurs: a spindle, a bright core, a white centre line; hot 0 drops the line; a chip is two fills', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.gem.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, hot, white } = MATERIALS.gem.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 2);
  assert.deepEqual(rec.colours.map(rgbOf), [body, hot, white]);
  const cold = recordingContext();
  MATERIALS.gem.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(strokes(cold), 0);
  const chip = recordingContext();
  MATERIALS.gem.tongue(chip.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(chip.fills.count, 2);
});

test('a gem projectile: a halo, `tongues` crystal streaks behind its heading, a crystal that turns with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.gem.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 1 + 2, 'halo + crystal');
  assert.equal(draw({ tongues: 3 }).fills.count, 1 + 3 * 2 + 2);
  const tip = (time) => draw({ tongues: 0, time }).calls.filter(([name]) => name === 'moveTo')[0][1];
  assert.notDeepEqual(tip(1), tip(1.4), 'the crystal turns');
});

test('flying uses the recipe palette, a navy shade, no smoke, no grain and pale feather particles', () => {
  const flying = MATERIALS.flying;
  assert.equal(materialFor('flying'), flying);
  assert.deepEqual(flying.palette.deep, [143, 179, 217]);
  assert.deepEqual(flying.palette.body, [207, 227, 247]);
  assert.deepEqual(flying.palette.hot, [234, 243, 255]);
  assert.deepEqual(flying.palette.white, [255, 255, 255]);
  assert.ok(flying.shade.every((v, i) => v <= flying.palette.deep[i]), 'shade darker than deep');
  assert.equal(flying.smoke, null);
  assert.equal(flying.particle.className, 'fx-particle--feather');
  assert.equal(flying.particle.aspect, 0.35);
  assert.deepEqual(rgbOf(flying.particle.color), flying.palette.hot);
  const rec = recordingContext();
  flying.glow(rec.ctx, 10, 20, 40, 0.8);
  flying.body(rec.ctx, 10, 20, 40, 0.8, 0.9);
  flying.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1 });
  flying.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
  flying.projectile(rec.ctx, PROJECTILE);
  assert.deepEqual(rec.state.composite, [], 'additive throughout');
  assert.equal(rec.state.depth, 0);
});

test('crescentOutline: pointed at both ends, both edges bowed the same way (a crescent), the outer edge left', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 100, width: 40, time: 0, seed: 0 };
  const { left, right } = crescentOutline(spec);
  assert.deepEqual(left[0], right[0], 'one base point');
  assert.deepEqual(left.at(-1), right.at(-1), 'one tip');
  assert.ok(Math.abs(left.at(-1)[0] - 100) < 1e-9 && Math.abs(left.at(-1)[1]) < 1e-9, 'the tip sits `length` along the heading');
  const mid = Math.floor(left.length / 2);
  assert.ok(Math.abs(left[mid][1] - 40 * (0.3 + 0.225)) < 1e-9, 'outer edge: bow 0.3 w + half of 0.45 w');
  assert.ok(Math.abs(right[mid][1] - 40 * (0.3 - 0.225)) < 1e-9, 'inner edge still bowed outward');
  for (let i = 1; i < left.length - 1; i += 1) {
    assert.ok(left[i][1] > right[i][1], 'left is the outer edge');
    assert.ok(right[i][1] > 0, 'both edges curve the same way');
  }
  const breathing = crescentOutline({ ...spec, time: 0.26 });
  assert.notDeepEqual(breathing.left[mid], left[mid], 'the bow breathes with the clock');
  const up = crescentOutline({ ...spec, angleDeg: -90 });
  assert.ok(up.left.at(-1)[1] < -99, 'follows its heading');
});

test('featherOutline: a bare quill, a vane at most `width` wide rounding to one tip, a rachis base to tip', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 100, width: 30 };
  const { left, right, rachis } = featherOutline(spec);
  assert.deepEqual(rachis[0], [0, 0], 'the rachis starts at the base');
  assert.ok(Math.abs(rachis.at(-1)[0] - 100) < 1e-9, 'and ends at the tip');
  assert.deepEqual(left.at(-1), right.at(-1), 'one tip');
  assert.ok(left[0][0] >= 100 * 0.12 - 1e-9, 'the vane starts after the quill');
  for (let i = 0; i < left.length; i += 1) {
    assert.ok(Math.abs(left[i][1] - right[i][1]) <= 30 + 1e-9, 'never wider than `width`');
    assert.ok(left[i][1] >= right[i][1]);
  }
  const widths = left.map((p, i) => p[1] - right[i][1]);
  const widest = widths.indexOf(Math.max(...widths));
  assert.ok(widest > 0 && widest < widths.length - 1, 'widest inside the vane, tapering to the tip');
});

test('a wind blade never blurs: one translucent fill and one white outer-edge stroke; hot 0 drops the edge', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.flying.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, white } = MATERIALS.flying.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [body, white]);
  assert.match(rec.colours[0], /, 0\.45\)$/, 'the blade is translucent (alpha 0.45)');
  const cold = recordingContext();
  MATERIALS.flying.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(strokes(cold), 0);
});

test('a feather (jag) is one vane fill and one vein stroke in deep', () => {
  const rec = recordingContext();
  MATERIALS.flying.tongue(rec.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  const { body, deep } = MATERIALS.flying.palette;
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 1);
  assert.deepEqual(rec.colours.map(rgbOf), [body, deep]);
});

test('a wind orb is one sphere fill wrapped by two swirl strokes that turn as it moves', () => {
  const rec = recordingContext();
  MATERIALS.flying.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 2);
  const firstArc = (x) => {
    const r = recordingContext();
    MATERIALS.flying.body(r.ctx, x, 100, 40, 1, 1);
    return r.calls.filter(([name]) => name === 'arc')[1][1];
  };
  assert.notDeepEqual(firstArc(100), firstArc(140), 'the swirl turns as it travels');
});

test('a flying projectile is a bare orb in its halo at 0 tongues, else a pinwheel of `tongues` blades that turns with the clock', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.flying.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  assert.equal(draw({ tongues: 0 }).fills.count, 2, 'halo + orb');
  const wheel = draw({ tongues: 3 });
  assert.equal(wheel.fills.count, 1 + 3 + 1, 'halo, three blades, the core orb');
  assert.equal(strokes(wheel), 3 + 2, 'three blade edges, two swirl arcs');
  const bladeStart = (time) => draw({ tongues: 3, time }).calls.find(([name]) => name === 'moveTo')[1];
  assert.notDeepEqual(bladeStart(1), bladeStart(1.2), 'the pinwheel turns');
});

test('ice uses the recipe palette, a navy shade, cold mist for smoke and pale shard particles', () => {
  const ice = MATERIALS.ice;
  assert.equal(materialFor('ice'), ice);
  assert.deepEqual(ice.palette.deep, [62, 143, 209]);
  assert.deepEqual(ice.palette.body, [143, 211, 255]);
  assert.deepEqual(ice.palette.hot, [214, 243, 255]);
  assert.deepEqual(ice.palette.white, [255, 255, 255]);
  assert.deepEqual(ice.smoke, [200, 230, 245]);
  assert.ok(ice.shade.every((v, i) => v <= ice.palette.deep[i]), 'shade darker than deep');
  assert.equal(ice.particle.className, 'fx-particle--shard');
  assert.deepEqual(rgbOf(ice.particle.color), [214, 243, 255]);
  const rec = recordingContext();
  ice.glow(rec.ctx, 10, 20, 40, 0.8);
  ice.body(rec.ctx, 10, 20, 40, 0.8, 0.9);
  ice.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1 });
  ice.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
  ice.projectile(rec.ctx, PROJECTILE);
  assert.deepEqual(rec.state.composite, [], 'additive throughout');
  assert.equal(rec.state.depth, 0);
});

test('icicleOutline: five corners, a squared base `width` wide, straight sides to one tip on the axis', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 100, width: 40 };
  const { left, right } = icicleOutline(spec);
  assert.equal(left.length, 3);
  assert.equal(right.length, 3);
  assert.deepEqual(left.at(-1), right.at(-1), 'one tip');
  assert.ok(Math.abs(left.at(-1)[0] - 100) < 1e-9 && Math.abs(left.at(-1)[1]) < 1e-9, 'the tip sits `length` along the axis');
  assert.ok(Math.abs(left[0][1] - right[0][1] - 40) < 1e-9 && left[0][0] === 0 && right[0][0] === 0, 'a squared base `width` wide');
  assert.ok(Math.abs(left[1][1]) < 20 && Math.abs(left[1][1]) > 10, 'the sides narrow a little to the shoulders');
  assert.ok(left[1][0] > 50 && left[1][0] < 80, 'shoulders two thirds along');
  const up = icicleOutline({ ...spec, angleDeg: -90 });
  assert.ok(up.left.at(-1)[1] < -99, 'follows its heading');
  const facet = icicleFacet(spec);
  assert.equal(facet.length, 4, 'the left edge plus a ridge point at the base');
  assert.ok(facet.every(([, y]) => y >= -1e-9), 'the facet lies on the left half');
});

test('an ice crystal never blurs: one ice fill, one lit facet, one 1 px white edge; hot 0 drops the facet', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.ice.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, hot, white } = MATERIALS.ice.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 2);
  assert.equal(strokes(rec), 1);
  assert.equal(rec.target.lineWidth, 1);
  assert.deepEqual(rec.colours.map(rgbOf), [body, hot, white]);
  assert.match(rec.colours[1], /, 0\.6\)$/, 'the facet is hot at alpha 0.6');
  const cold = recordingContext();
  MATERIALS.ice.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(cold.fills.count, 1);
  assert.equal(strokes(cold), 1, 'the white edge stays');
  const splinter = recordingContext();
  MATERIALS.ice.tongue(splinter.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(splinter.fills.count, 2, 'a splinter: fill and facet');
  assert.equal(strokes(splinter), 1);
});

test('snowflakeSegments: six spokes of length r, three V branches each, turned by the phase', () => {
  const segments = snowflakeSegments(0, 0, 50, 0);
  assert.equal(segments.length, 6 * (1 + 3 * 2));
  const spokes = segments.filter(([[x0, y0]]) => x0 === 0 && y0 === 0);
  assert.equal(spokes.length, 6);
  for (const [, [x, y]] of spokes) assert.ok(Math.abs(Math.hypot(x, y) - 50) < 1e-9);
  for (const [[x0, y0], [x1, y1]] of segments) assert.ok(Math.hypot(x1, y1) <= 50 + 1e-9 && Math.hypot(x0, y0) <= 50 + 1e-9, 'inside r');
  assert.notDeepEqual(snowflakeSegments(0, 0, 50, 0.4)[0], segments[0], 'the phase turns it');
});

test('a snowflake is a bright centre and two stroke passes (ice blue, then white) that turn as it moves', () => {
  const rec = recordingContext();
  MATERIALS.ice.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 2);
  const firstTip = (x) => {
    const r = recordingContext();
    MATERIALS.ice.body(r.ctx, x, 100, 40, 1, 1);
    return r.calls.filter(([name]) => name === 'lineTo')[0][1];
  };
  assert.notDeepEqual(firstTip(100), firstTip(140), 'the flake turns as it travels');
});

test('an ice projectile is a snowflake in mist at 0 tongues, else a crystal head trailing `tongues` crystals', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.ice.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  const flake = draw({ tongues: 0 });
  assert.equal(flake.fills.count, 2, 'mist + the flake centre');
  assert.equal(strokes(flake), 2);
  assert.notDeepEqual(
    draw({ tongues: 0, time: 1 }).calls.find(([name]) => name === 'lineTo')[1],
    draw({ tongues: 0, time: 1.4 }).calls.find(([name]) => name === 'lineTo')[1],
    'a flying flake turns with the clock'
  );
  const head = draw({ tongues: 4 });
  assert.equal(head.fills.count, 1 + 5 * 2, 'mist, four trailing crystals and the head');
  assert.equal(strokes(head), 5);
});

test('aurora: ice crystals with a pastel aurora palette; its ring is three hues breathing out of phase', () => {
  const aurora = MATERIALS.aurora;
  assert.equal(materialFor('aurora'), aurora);
  assert.deepEqual(aurora.palette.body, MATERIALS.ice.palette.body);
  assert.deepEqual(aurora.palette.mint, [168, 240, 214]);
  assert.deepEqual(aurora.palette.lilac, [200, 180, 255]);
  assert.equal(aurora.smoke, null);
  assert.deepEqual(rgbOf(aurora.particle.color), aurora.palette.lilac);
  const rec = recordingContext();
  aurora.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1, 'a faint mist');
  assert.equal(strokes(rec), 3, 'three rings');
  const strokeColours = rec.colours.filter((css) => !/, 0\)$/.test(css)).slice(-3).map(rgbOf);
  assert.deepEqual(strokeColours, [aurora.palette.body, aurora.palette.mint, aurora.palette.lilac]);
  const alphas = auroraAlphas(0.7);
  assert.equal(alphas.length, 3);
  assert.ok(alphas.every((a) => a >= 0.35 - 1e-9 && a <= 1 + 1e-9));
  assert.notDeepEqual(alphas, auroraAlphas(1.7), 'the hues breathe');
  assert.ok(new Set(alphas.map((a) => a.toFixed(6))).size === 3, 'out of phase');
  const crystal = recordingContext();
  aurora.tongue(crystal.ctx, TONGUE, { alpha: 1, hot: 1 });
  assert.equal(crystal.fills.count, 2);
});

test('bug uses the recipe palette, a forest-black shade, no smoke and yellow-green shard particles', () => {
  const bug = MATERIALS.bug;
  assert.equal(materialFor('bug'), bug);
  assert.deepEqual(bug.palette.deep, [74, 107, 16]);
  assert.deepEqual(bug.palette.body, [140, 191, 38]);
  assert.deepEqual(bug.palette.hot, [191, 227, 77]);
  assert.deepEqual(bug.palette.core, [240, 247, 176]);
  assert.deepEqual(bug.palette.white, [255, 255, 255]);
  assert.equal(bug.smoke, null);
  assert.ok(bug.shade.every((v, i) => v <= bug.palette.deep[i]), 'shade darker than deep');
  assert.equal(bug.particle.className, 'fx-particle--shard');
  assert.deepEqual(rgbOf(bug.particle.color), bug.palette.hot);
});

test('bug and buzz draw the dark needle tip with source-over only inside their own save/restore; silver never touches the composite', () => {
  for (const name of ['bug', 'buzz']) {
    const rec = recordingContext();
    const probe = compositeProbe(rec);
    const material = MATERIALS[name];
    material.glow(probe.ctx, 10, 20, 40, 0.8);
    material.body(probe.ctx, 10, 20, 40, 0.8, 0.9);
    material.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1 });
    material.tongue(probe.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
    material.projectile(probe.ctx, PROJECTILE);
    assert.ok(probe.changes.length > 0, `${name}: the dark tip covers what is under it`);
    for (const change of probe.changes) {
      assert.equal(change.value, 'source-over');
      assert.ok(change.depth >= 1, `${name}: set inside a save`);
    }
    assert.equal(rec.state.depth, 0, `${name}: balanced`);
  }
  const rec = recordingContext();
  const silver = MATERIALS.silver;
  silver.glow(rec.ctx, 10, 20, 40, 0.8);
  silver.body(rec.ctx, 10, 20, 40, 0.8, 0.9);
  silver.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1 });
  silver.tongue(rec.ctx, TONGUE, { alpha: 0.9, hot: 1, jag: 1 });
  silver.projectile(rec.ctx, PROJECTILE);
  assert.deepEqual(rec.state.composite, [], 'silver is additive throughout');
});

test('needleOutline: slim (0.6 of the width it is handed), a blunt base, widest at 28 %, one sharp tip on the axis; needleTip is its last fifth', () => {
  const spec = { x: 0, y: 0, angleDeg: 0, length: 100, width: 40 };
  const { left, right } = needleOutline(spec);
  assert.equal(left.length, 3);
  assert.equal(right.length, 3);
  assert.deepEqual(left.at(-1), right.at(-1), 'one tip');
  assert.ok(Math.abs(left.at(-1)[0] - 100) < 1e-9 && Math.abs(left.at(-1)[1]) < 1e-9, 'the tip sits `length` along the axis');
  assert.ok(Math.abs(left[1][0] - 28) < 1e-9 && Math.abs(left[1][1] - right[1][1] - 0.6 * 40) < 1e-9, 'widest (0.6 `width`) at 28 %');
  assert.ok(left[0][0] === 0 && Math.abs(left[0][1] - right[0][1] - 0.2 * 40) < 1e-9, 'a blunt base 0.2 `width` across');
  const up = needleOutline({ ...spec, angleDeg: -90 });
  assert.ok(up.left.at(-1)[1] < -99, 'follows its heading');
  const tip = needleTip(spec);
  assert.equal(tip.length, 3);
  assert.deepEqual(tip[1].map((v) => Math.round(v * 1e9) / 1e9), [100, 0], 'the tip triangle ends at the point');
  assert.ok(Math.abs(tip[0][0] - 80) < 1e-9 && tip[0][1] > 0 && Math.abs(tip[0][1] + tip[2][1]) < 1e-9, 'it starts 80 % along, symmetric');
  // The tip's corners lie on the needle's edges (half-width at 80 % = 12 x 0.2 / 0.72).
  assert.ok(Math.abs(tip[0][1] - (12 * 0.2) / 0.72) < 1e-9);
});

test('a bug needle never blurs: one fill, a pale centre line, a dark tip; hot 0 drops the line; a chip is one fill and an edge', () => {
  const rec = recordingContext();
  const probe = blurProbe(rec);
  MATERIALS.bug.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  const { body, core, deep } = MATERIALS.bug.palette;
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 2, 'needle and tip');
  assert.equal(strokes(rec), 1, 'the centre line');
  assert.deepEqual(rec.colours.map(rgbOf), [body, core, deep]);
  const cold = recordingContext();
  MATERIALS.bug.tongue(cold.ctx, TONGUE, { alpha: 1, hot: 0 });
  assert.equal(cold.fills.count, 2);
  assert.equal(strokes(cold), 0, 'no centre line');
  const chip = recordingContext();
  MATERIALS.bug.tongue(chip.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(chip.fills.count, 1);
  assert.equal(strokes(chip), 1);
});

test('wingOpen spans shut (0.55) to spread (1) and beats; a wing disc is wings in one fill, veins in one stroke, a bright core', () => {
  for (let k = 0; k <= 40; k += 1) {
    const open = wingOpen(k * 0.31);
    assert.ok(open >= 0.55 - 1e-9 && open <= 1 + 1e-9);
  }
  assert.equal(wingOpen(0), 0.55);
  assert.equal(wingOpen(Math.PI / 2), 1);
  const rec = recordingContext();
  MATERIALS.bug.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 2, 'wings + core');
  assert.equal(strokes(rec), 1, 'veins');
  assert.equal(rec.calls.filter(([name]) => name === 'ellipse').length, 2, 'two wings');
  const span = (x) => {
    const r = recordingContext();
    MATERIALS.bug.body(r.ctx, x, 100, 40, 1, 1);
    return r.calls.find(([name]) => name === 'ellipse')[1][2];
  };
  assert.notEqual(span(100), span(117), 'the wings beat as the disc travels');
});

test('a bug projectile is a wing disc beating on the clock at 0 tongues, else a needle trailing `tongues` after-images', () => {
  const draw = (over) => {
    const rec = recordingContext();
    MATERIALS.bug.projectile(rec.ctx, { ...PROJECTILE, ...over });
    return rec;
  };
  const disc = draw({ tongues: 0 });
  assert.equal(disc.fills.count, 3, 'halo, wings, core');
  const wingAt = (time) => draw({ tongues: 0, time }).calls.find(([name]) => name === 'ellipse')[1][2];
  assert.notEqual(wingAt(1), wingAt(1.02), 'the wings beat at 12 Hz');
  const head = draw({ tongues: 2 });
  assert.equal(head.fills.count, 1 + 3 * 2, 'halo, two after-images and the head (needle + tip each)');
  assert.equal(strokes(head), 1, 'only the head has a centre line');
});

test('buzz: the bug needle, but its round unit is three sound rings breathing out of phase', () => {
  const buzz = MATERIALS.buzz;
  assert.equal(materialFor('buzz'), buzz);
  assert.equal(buzz.palette, MATERIALS.bug.palette);
  assert.equal(buzz.tongue, MATERIALS.bug.tongue);
  assert.equal(buzz.smoke, null);
  const rec = recordingContext();
  buzz.body(rec.ctx, 100, 100, 40, 1, 1);
  assert.equal(rec.fills.count, 1, 'a faint halo');
  assert.equal(strokes(rec), 3, 'three rings');
  const strokeColours = rec.colours.slice(-3).map(rgbOf);
  assert.deepEqual(strokeColours, [buzz.palette.hot, buzz.palette.body, buzz.palette.core]);
  const alphas = soundAlphas(0.7);
  assert.equal(alphas.length, 3);
  assert.ok(alphas.every((a) => a >= 0.35 - 1e-9 && a <= 1 + 1e-9));
  assert.notDeepEqual(alphas, soundAlphas(1.7), 'the rings breathe');
  assert.equal(new Set(alphas.map((a) => a.toFixed(6))).size, 3, 'out of phase');
  const train = recordingContext();
  buzz.projectile(train.ctx, { ...PROJECTILE, tongues: 2 });
  assert.equal(strokes(train), 3 * 3, 'the head and two trailing discs');
});

test('silver: a silver-white palette, a slate shade, no smoke, powder motes; a scale is a sphere and a glint, a streak one fill and a line', () => {
  const silver = MATERIALS.silver;
  assert.equal(materialFor('silver'), silver);
  assert.deepEqual(silver.palette.deep, [124, 138, 150]);
  assert.deepEqual(silver.palette.body, [200, 210, 218]);
  assert.deepEqual(silver.palette.hot, [232, 238, 242]);
  assert.equal(silver.smoke, null);
  assert.ok(silver.shade.every((v, i) => v <= silver.palette.deep[i]), 'shade darker than deep');
  assert.equal(silver.particle.className, 'fx-particle--mote');
  assert.deepEqual(rgbOf(silver.particle.color), silver.palette.hot);
  const scale = recordingContext();
  silver.body(scale.ctx, 100, 100, 40, 1, 1);
  assert.equal(scale.fills.count, 1);
  assert.equal(strokes(scale), 1, 'the glint');
  const dull = recordingContext();
  silver.body(dull.ctx, 100, 100, 40, 1, 0);
  assert.equal(strokes(dull), 0, 'hot 0 drops the glint');
  const rec = recordingContext();
  const probe = blurProbe(rec);
  silver.tongue(probe.ctx, TONGUE, { alpha: 1, hot: 1 });
  assert.deepEqual(probe.filters, []);
  assert.equal(rec.fills.count, 1);
  assert.equal(strokes(rec), 1, 'the white centre line');
  const flake = recordingContext();
  silver.tongue(flake.ctx, TONGUE, { alpha: 1, hot: 1, jag: 1 });
  assert.equal(flake.fills.count, 1);
  assert.equal(strokes(flake), 1);
  const gust = recordingContext();
  silver.projectile(gust.ctx, { ...PROJECTILE, tongues: 2 });
  assert.equal(gust.fills.count, 1 + 2 + 1, 'halo, two streaks, the scale');
});
