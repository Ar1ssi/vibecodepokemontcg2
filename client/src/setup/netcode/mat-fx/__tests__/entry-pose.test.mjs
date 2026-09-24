import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEGA_BURST_AT,
  MEGA_ENTRY_MS,
  megaFieldPlacement,
  megaFieldPose,
  megaFlashPose,
  megaLensPose,
  megaSilhouettePose,
  megaStageRect,
  megaWavePose,
} from '../entry-pose.mjs';

const ALL = {
  megaFieldPose,
  megaWavePose,
  megaLensPose,
  megaSilhouettePose,
  megaFlashPose,
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('entry poses: every layer is invisible at the start and the end', () => {
  for (const [name, pose] of Object.entries(ALL)) {
    assert.ok(near(pose(0).opacity, 0), `${name} at 0`);
    assert.ok(near(pose(1).opacity, 0), `${name} at 1`);
  }
});

test('entry poses: opacity stays within [0, 1] and out-of-range t is clamped', () => {
  for (const [name, pose] of Object.entries(ALL)) {
    for (let i = 0; i <= 200; i += 1) {
      const { opacity } = pose(i / 200);
      assert.ok(
        opacity >= 0 && opacity <= 1,
        `${name} at ${i / 200}: ${opacity}`
      );
    }
    assert.deepEqual(pose(-1), pose(0), `${name} below 0`);
    assert.deepEqual(pose(2), pose(1), `${name} above 1`);
  }
});

test('entry duration and burst beat are in range', () => {
  assert.ok(MEGA_ENTRY_MS > 0);
  assert.ok(MEGA_BURST_AT > 0 && MEGA_BURST_AT < 1);
});

// TCG Live's Mega beat: the hex field floods the mat from the card, the card
// goes two-tone and rounds into the orb, which bursts into an orbiting vortex.
test('mega: the field is revealed outward from the card and holds until the end', () => {
  assert.equal(megaFieldPose(0).reveal, 0);
  assert.ok(megaFieldPose(0.08).reveal > 0.5 && megaFieldPose(0.08).reveal < 1);
  assert.ok(near(megaFieldPose(0.2).reveal, 1));
  for (const t of [0.1, 0.5, 0.75])
    assert.ok(megaFieldPose(t).opacity > 0.99, `field at ${t}`);
  assert.ok(
    megaWavePose(0.12).scale > megaWavePose(0.04).scale,
    'wavefront rides the reveal'
  );
  assert.equal(megaWavePose(0.3).opacity, 0);
});

test('mega: the lens pops in around the card and kicks at the burst', () => {
  assert.ok(megaLensPose(0.5).opacity > 0.99);
  assert.ok(megaLensPose(MEGA_BURST_AT + 0.05).scale > megaLensPose(0.3).scale);
});

test('mega: the card flashes white-hot and swells as the orb forms around it', () => {
  assert.equal(megaSilhouettePose(0.01).opacity, 0);
  assert.ok(megaSilhouettePose(0.08).opacity > 0.99);
  assert.ok(megaSilhouettePose(0.12).scale > megaSilhouettePose(0.03).scale);
  assert.equal(megaSilhouettePose(0.16).opacity, 0);
});

test('mega: the white flash peaks at the burst', () => {
  assert.equal(megaFlashPose(0.3).opacity, 0);
  assert.equal(megaFlashPose(MEGA_BURST_AT + 0.01).opacity, 1);
  assert.equal(megaFlashPose(0.7).opacity, 0);
});

test('megaStageRect: a stage around the card, clipped to the viewport', () => {
  const card = { left: 100, top: 100, width: 70, height: 100 };
  assert.deepEqual(megaStageRect(card, null), {
    left: -115,
    top: -20,
    width: 500,
    height: 340,
  });
  assert.deepEqual(
    megaStageRect(card, { left: 0, top: 0, width: 300, height: 1000 }),
    {
      left: 0,
      top: 0,
      width: 300,
      height: 320,
    }
  );
  const off = megaStageRect(
    { left: 5000, top: 0, width: 70, height: 100 },
    { left: 0, top: 0, width: 800, height: 600 }
  );
  assert.equal(off.width, 0, 'a card off-screen leaves an empty stage');
});

test('megaFieldPlacement: maps the card centre into the (tilted) field box', () => {
  const card = { left: 140, top: 90, width: 20, height: 20 };
  const flat = megaFieldPlacement(
    card,
    { left: 100, top: 50, width: 200, height: 100 },
    { width: 200, height: 100 }
  );
  assert.deepEqual(flat, {
    x: 50,
    y: 50,
    unit: 20,
    reach: Math.hypot(150, 50),
  });
  // Foreshortened on screen: 200x100 on screen, 400x300 in layout pixels.
  const tilted = megaFieldPlacement(
    card,
    { left: 100, top: 50, width: 200, height: 100 },
    { width: 400, height: 300 }
  );
  assert.equal(tilted.x, 100);
  assert.equal(tilted.y, 150);
  assert.equal(tilted.unit, 40);
});

test('megaFieldPlacement: unusable boxes return null', () => {
  const card = { left: 0, top: 0, width: 20, height: 20 };
  const box = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(megaFieldPlacement(null, box, box), null);
  assert.equal(megaFieldPlacement(card, { ...box, width: 0 }, box), null);
  assert.equal(megaFieldPlacement(card, box, { width: 0, height: 100 }), null);
  assert.equal(megaFieldPlacement(card, box, null), null);
  assert.equal(megaFieldPlacement({ ...card, left: NaN }, box, box), null);
});
