import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEGA_BURST_AT,
  MEGA_ENTRY_MS,
  TERA_BURST_AT,
  TERA_ENTRY_MS,
  TERA_GLINT_AT,
  megaFieldPlacement,
  megaFieldPose,
  megaFlashPose,
  megaLensPose,
  megaSilhouettePose,
  megaSlashPose,
  megaStageRect,
  megaWavePose,
  teraFillPose,
  teraFlashPose,
  teraJewelPose,
  teraRaysPose,
  teraRingPose,
  teraSlabPose,
  teraSmokePose,
  teraStreakPose,
  teraWhiteoutPose,
} from '../entry-pose.mjs';

const ALL = {
  teraFlashPose,
  teraSlabPose,
  teraStreakPose,
  teraJewelPose,
  teraRingPose,
  teraFillPose,
  teraWhiteoutPose,
  teraRaysPose,
  teraSmokePose,
  megaFieldPose,
  megaWavePose,
  megaLensPose,
  megaSilhouettePose,
  megaFlashPose,
  megaSlashPose,
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

test('entry durations and beats are ordered', () => {
  assert.ok(TERA_ENTRY_MS > 0 && MEGA_ENTRY_MS > 0);
  assert.ok(
    TERA_BURST_AT > 0 && TERA_BURST_AT < TERA_GLINT_AT && TERA_GLINT_AT < 1
  );
  assert.ok(MEGA_BURST_AT > 0 && MEGA_BURST_AT < 1);
});

// TCG Live's Tera beat: flash, mint crystal, jewel rises, white fills the
// crystal from the bottom, burst into smoke/rays, twinkles on the reveal.
test('tera: the flash hands over to the crystal', () => {
  assert.equal(teraFlashPose(0.04).opacity, 1);
  assert.equal(teraFlashPose(0.15).opacity, 0);
  assert.equal(teraSlabPose(0.02).opacity, 0);
  assert.ok(teraSlabPose(0.1).opacity > 0.99);
});

test('tera: the crystal holds, then vanishes exactly under a full whiteout', () => {
  for (const t of [0.15, 0.3, 0.5])
    assert.ok(teraSlabPose(t).opacity > 0.99, `slab at ${t}`);
  assert.equal(teraSlabPose(TERA_BURST_AT).opacity, 0);
  assert.ok(teraWhiteoutPose(TERA_BURST_AT).opacity > 0.99);
  assert.ok(teraWhiteoutPose(TERA_BURST_AT - 0.08).opacity < 0.5);
  assert.ok(teraWhiteoutPose(0.75).opacity < 1e-9);
});

test('tera: lens streaks shoot outward as the crystal forms and are gone before the fill', () => {
  assert.ok(teraStreakPose(0.2).scaleX > teraStreakPose(0.05).scaleX);
  assert.ok(teraStreakPose(0.15).opacity > 0.99);
  assert.equal(teraStreakPose(0.5).opacity, 0);
});

test('tera: the jewel grows after the crystal lands, whitens, and is gone at the burst', () => {
  assert.equal(teraJewelPose(0.1).scale, 0);
  assert.equal(teraJewelPose(0.1).opacity, 0);
  assert.ok(teraJewelPose(0.3).opacity > 0.99);
  assert.ok(near(teraJewelPose(0.26).scale, 1));
  assert.equal(teraJewelPose(0.3).white, 0);
  assert.ok(teraJewelPose(0.55).white > 0.99);
  assert.equal(teraJewelPose(TERA_BURST_AT).opacity, 0);
});

test('tera: white light rises through the crystal from the bottom before the burst', () => {
  assert.equal(teraFillPose(0.25).scaleY, 0);
  assert.ok(teraFillPose(0.4).scaleY > teraFillPose(0.32).scaleY);
  assert.ok(near(teraFillPose(0.52).scaleY, 1));
  assert.equal(teraFillPose(TERA_BURST_AT).opacity, 0);
});

test('tera: arcs orbit forward while charging', () => {
  assert.ok(teraRingPose(0.45).rotate > teraRingPose(0.25).rotate);
  assert.ok(teraRingPose(0.3).opacity > 0.99);
});

test('tera: rays and smoke only appear at the burst and grow outward', () => {
  assert.equal(teraRaysPose(TERA_BURST_AT - 0.01).opacity, 0);
  assert.equal(teraSmokePose(TERA_BURST_AT - 0.03).opacity, 0);
  assert.ok(teraRaysPose(0.62).opacity > 0.99);
  assert.ok(teraSmokePose(0.64).opacity > 0.8);
  assert.ok(teraRaysPose(0.78).scale > teraRaysPose(0.61).scale);
  assert.ok(teraSmokePose(0.8).scale > teraSmokePose(0.62).scale);
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

test('mega: slashes launch at the burst, fly out to orbit, and decelerate', () => {
  assert.equal(megaSlashPose(MEGA_BURST_AT - 0.02).opacity, 0);
  assert.ok(megaSlashPose(0.6).opacity > 0.99);
  assert.ok(megaSlashPose(0.6).radius > megaSlashPose(MEGA_BURST_AT).radius);
  assert.ok(near(megaSlashPose(0.7).radius, 1));
  assert.equal(megaSlashPose(0.3, { phase: 90 }).rotate, 90);
  assert.ok(megaSlashPose(0.6, { spin: 1 }).rotate > 0);
  assert.ok(megaSlashPose(0.6, { spin: -1 }).rotate < 0);
  const early = megaSlashPose(0.58).rotate - megaSlashPose(0.54).rotate;
  const late = megaSlashPose(0.9).rotate - megaSlashPose(0.86).rotate;
  assert.ok(early > late, 'spin decelerates');
  assert.ok(megaSlashPose(MEGA_BURST_AT + 0.02).opacity > 0);
  assert.equal(
    megaSlashPose(MEGA_BURST_AT + 0.02, { lag: 0.05 }).opacity,
    0,
    'lag delays the launch'
  );
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
