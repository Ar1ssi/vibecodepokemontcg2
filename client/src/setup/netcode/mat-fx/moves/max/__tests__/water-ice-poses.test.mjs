import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROWN_FRAMES, auroraVeilPose, chiCrescentCentre, chiCrescentPose, splashCrownPose, surgeStonesPose } from '../water-ice-poses.mjs';
import { checkParams, tonguesAt } from '../../move-spec.mjs';

const H = 100;
const finite = (rows) => rows.every((row) => Object.values(row).every((v) => typeof v !== 'number' || Number.isFinite(v)));

test('surgeStones / auroraVeil: their defaults are valid params and they add no tongues to the budget', () => {
  assert.deepEqual(checkParams('surgeStones', {}), []);
  assert.deepEqual(checkParams('auroraVeil', {}), []);
  assert.equal(tonguesAt('surgeStones', {}), 0);
  assert.equal(tonguesAt('auroraVeil', {}), 0);
  assert.ok(checkParams('surgeStones', { from: 'ground' }).length > 0);
  assert.ok(checkParams('auroraVeil', { half: 'middle' }).length > 0);
});

test('surgeStonesPose (erupt): flung out of the card, landing round it and standing, then sinking away', () => {
  const p = { from: 'erupt', count: 7, distance: 0.95, height: 0.75, size: [0.06, 0.11] };
  assert.equal(surgeStonesPose(0, H, 3, p).length, 0, 'nothing before the beat');
  const flying = surgeStonesPose(0.12, H, 3, p);
  assert.ok(flying.length > 0 && flying.every((st) => !st.landed));
  // Mid-flight a stone is above its ground point (lifted by the hop and its own height).
  assert.ok(flying.some((st) => st.y < st.gy - st.size));
  const standing = surgeStonesPose(0.6, H, 3, p);
  assert.equal(standing.length, 7);
  for (const st of standing) {
    assert.ok(st.landed);
    assert.equal(st.alpha, 1);
    assert.ok(st.stretch > 1.5, 'a standing stone is a tall sharp stone');
    const reach = Math.hypot(st.gx, st.gy / 0.55);
    assert.ok(reach > 0.6 * H && reach < 1.3 * H, `stands round the card (${reach})`);
  }
  const late = surgeStonesPose(0.99, H, 3, p);
  assert.ok(late.every((st) => st.alpha < 0.1), 'gone by the end');
  assert.ok(finite([...flying, ...standing, ...late]));
});

test('surgeStonesPose (sky): boulders fall onto their ground points in turn and crumble as they land', () => {
  const p = { from: 'sky', count: 4, distance: 0.75, height: 1.5, size: [0.16, 0.24] };
  const early = surgeStonesPose(0.05, H, 9, p);
  assert.ok(early.length >= 1 && early.length < 4, 'they start one after another');
  for (const st of early) assert.ok(st.y < st.gy - 1.0 * H, 'still high in the air');
  // The last lands near 0.64 of the beat (start ≤ 0.39, fall 0.3) and is gone by 0.82.
  const landing = surgeStonesPose(0.66, H, 9, p);
  assert.ok(landing.some((st) => st.landed));
  assert.equal(surgeStonesPose(0.9, H, 9, p).length, 0);
  // A landed boulder rests on its ground point (no longer up in the air) as it breaks.
  for (const st of landing.filter((one) => one.landed)) {
    assert.ok(st.y <= st.gy, 'above or on its point');
    assert.ok(st.gy - st.y <= 1.35 * st.size + 1e-9, 'down on the ground');
  }
  assert.ok(finite([...early, ...landing]));
});

test('surgeStonesPose: deterministic for a seed', () => {
  const p = { from: 'erupt' };
  assert.deepEqual(surgeStonesPose(0.5, H, 4, p), surgeStonesPose(0.5, H, 4, p));
  assert.notDeepEqual(surgeStonesPose(0.5, H, 4, p), surgeStonesPose(0.5, H, 5, p));
});

test('auroraVeilPose: curtains on a ring round the card rise, shimmer and fade', () => {
  const p = { count: 8, r: 1.1, height: 1.6, w: 0.3, half: 'both' };
  assert.ok(auroraVeilPose(0, H, 2, p).every((c) => c.height === 0 && c.alpha === 0));
  const mid = auroraVeilPose(0.5, H, 2, p);
  assert.equal(mid.length, 8);
  for (const c of mid) {
    assert.ok(c.height > 0.8 * H, 'risen');
    assert.ok(c.alpha > 0);
    assert.ok(Math.abs(Math.hypot(c.x, c.y / 0.55) - 1.1 * H) < 1e-6, 'on the ring');
  }
  assert.ok(auroraVeilPose(1, H, 2, p).every((c) => c.alpha === 0), 'faded by the end');
  assert.ok(finite(mid));
});

test('auroraVeilPose: back and front halves split the ring by depth and together make the whole', () => {
  const both = auroraVeilPose(0.5, H, 2, { count: 8, half: 'both' });
  const back = auroraVeilPose(0.5, H, 2, { count: 8, half: 'back' });
  const front = auroraVeilPose(0.5, H, 2, { count: 8, half: 'front' });
  assert.ok(back.every((c) => c.depth < 0));
  assert.ok(front.every((c) => c.depth >= 0));
  assert.equal(back.length + front.length, both.length);
});

test('splashCrownPose: the geyser rises 2-3 card heights in a fifth of the beat, overshooting, then fades clean', () => {
  const p = { height: 2.4, width: 1.1, copies: 3, spread: 20, drops: 6 };
  assert.ok(splashCrownPose(0, H, 1, p).plumes.every((pl) => pl.alpha === 0 && pl.rise === 0), 'nothing before the beat');
  const risen = splashCrownPose(0.2, H, 1, p).plumes;
  assert.equal(risen.length, 3);
  const centre = risen[1];
  assert.ok(centre.rise > 2 * H && centre.rise < 3 * H, `stands 2-3 h (${centre.rise})`);
  assert.ok(Math.abs(centre.headingDeg + 90) < 4, 'the middle plume goes straight up');
  assert.ok(risen[0].headingDeg < -100 && risen[2].headingDeg > -80, 'the side plumes fan out');
  const overshoot = Math.max(...[0.1, 0.12, 0.14, 0.16, 0.18].map((s) => splashCrownPose(s, H, 1, p).plumes[1].rise));
  assert.ok(overshoot > centre.rise, 'it overshoots and settles (the mass of the water)');
  assert.ok(splashCrownPose(1, H, 1, p).plumes.every((pl) => pl.alpha === 0), 'faded by the end');
  assert.ok(splashCrownPose(0.5, H, 1, p).plumes.every((pl) => pl.alpha > 0.9), 'whole mid-beat: no burn');
});

test('splashCrownPose: the flipbook steps from the chunky mass to scattered drops', () => {
  const p = { copies: 1 };
  const frames = [0.02, 0.3, 0.55, 0.95].map((s) => splashCrownPose(s, H, 1, p).plumes[0].frame);
  assert.equal(frames[0], 0);
  assert.equal(frames[frames.length - 1], CROWN_FRAMES - 1);
  for (let k = 1; k < frames.length; k += 1) assert.ok(frames[k] >= frames[k - 1]);
});

test('splashCrownPose: drops are thrown off the top late and fall under gravity', () => {
  const p = { drops: 8, height: 2.4 };
  assert.equal(splashCrownPose(0.2, H, 4, p).drops.length, 0, 'none before a quarter of the beat');
  const early = splashCrownPose(0.55, H, 4, p).drops;
  const late = splashCrownPose(0.85, H, 4, p).drops;
  assert.ok(early.length > 0 && late.length > 0);
  const meanY = (drops) => drops.reduce((sum, d) => sum + d.y, 0) / drops.length;
  assert.ok(meanY(late) > meanY(early), 'they come down');
  assert.ok(early.every((d) => d.y < 0), 'thrown up off the crown');
});

test('chiCrescentPose: a crescent sweeps round the card, pointed at both ends, then fades clean', () => {
  const p = { radius: 0.85, sweep: 150, angle: 45, thick: 0.18, count: 2, gapDeg: 30 };
  assert.equal(chiCrescentPose(0, H, p).length, 0, 'nothing at the start');
  const mid = chiCrescentPose(0.35, H, p);
  assert.equal(mid.length, 2);
  for (const blade of mid) {
    const { points } = blade;
    assert.ok(points[0].half < 1e-6 && points[points.length - 1].half < 1e-6, 'pointed ends');
    assert.ok(Math.max(...points.map((pt) => pt.half)) > 0.07 * H, 'thick in the middle');
    for (const pt of points) assert.ok(Math.abs(Math.hypot(pt.x, pt.y) - 0.85 * H * (1 + 0.06 * blade.index)) < 1e-6, 'on its arc');
    assert.ok(blade.alpha > 0.9);
  }
  assert.ok(chiCrescentPose(0.9, H, p).every((blade) => blade.alpha < 0.3), 'fading out, not burning');
  assert.ok(finite(mid.flatMap((blade) => blade.points)));
});

test('chiCrescentCentre: at cross 1 the blade slashes across the card, at 0 it sweeps round it', () => {
  const length = ({ x, y }) => Math.hypot(x, y);
  assert.equal(length(chiCrescentCentre({}, H)), 0, 'default: centred on the card, as before');
  for (const angle of [0, 70, 200, 315]) {
    const p = { radius: 1.1, angle, cross: 1 };
    const off = chiCrescentCentre(p, H);
    // The arc's point at `angle` (its middle) lands on the struck card's centre.
    const midX = off.x + Math.cos((angle * Math.PI) / 180) * 1.1 * H;
    const midY = off.y + Math.sin((angle * Math.PI) / 180) * 1.1 * H;
    assert.ok(Math.hypot(midX, midY) < 1e-6, `angle ${angle}: the blade's middle crosses the centre`);
  }
  assert.ok(Math.abs(length(chiCrescentCentre({ radius: 1, cross: 0.5 }, H)) - 0.5 * H) < 1e-6, 'half a radius back');
  assert.deepEqual(checkParams('chiCrescent', { cross: 1 }), []);
  assert.ok(checkParams('chiCrescent', { cross: 2 }).length > 0, 'no further back than 1.2 radii');
});

test('splashCrown / chiCrescent: valid defaults; the crown counts one stream per plume', () => {
  assert.deepEqual(checkParams('splashCrown', {}), []);
  assert.deepEqual(checkParams('chiCrescent', {}), []);
  assert.equal(tonguesAt('splashCrown', { copies: 3 }), 3);
  assert.equal(tonguesAt('chiCrescent', {}), 0);
  assert.ok(checkParams('splashCrown', { height: 4 }).length > 0, 'no taller than 3 card heights');
});
