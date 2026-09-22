import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEGA_ENTRY_MS,
  TERA_ENTRY_MS,
  TERA_GLINT_AT,
  TERA_SHATTER_AT,
  megaFlashPose,
  megaHexPose,
  megaSpherePose,
  megaSwirlPose,
  teraArcPose,
  teraCrownPose,
  teraFlashPose,
  teraRaysPose,
  teraSlabPose,
  teraSmokePose,
  teraWhiteoutPose,
} from '../entry-pose.mjs';

const ALL = {
  teraFlashPose,
  teraSlabPose,
  teraCrownPose,
  teraArcPose,
  teraWhiteoutPose,
  teraRaysPose,
  teraSmokePose,
  megaSpherePose,
  megaHexPose,
  megaSwirlPose,
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

test('entry durations and beats are ordered', () => {
  assert.ok(TERA_ENTRY_MS > 0 && MEGA_ENTRY_MS > 0);
  assert.ok(
    TERA_SHATTER_AT > 0 && TERA_SHATTER_AT < TERA_GLINT_AT && TERA_GLINT_AT < 1
  );
});

test('tera: the flash peaks before the slab takes over', () => {
  assert.equal(teraFlashPose(0.12).opacity, 1);
  assert.equal(teraFlashPose(0.3).opacity, 0);
  assert.equal(teraSlabPose(0.05).opacity, 0);
  assert.ok(teraSlabPose(0.22).opacity > 0.99);
});

test('tera: the slab holds opaque, then vanishes exactly under a full whiteout', () => {
  for (const t of [0.25, 0.4, 0.55])
    assert.ok(teraSlabPose(t).opacity > 0.99, `slab at ${t}`);
  assert.equal(teraSlabPose(TERA_SHATTER_AT).opacity, 0);
  assert.ok(teraWhiteoutPose(TERA_SHATTER_AT).opacity > 0.99);
  assert.ok(teraWhiteoutPose(TERA_SHATTER_AT - 0.1).opacity < 0.5);
  assert.ok(teraWhiteoutPose(0.85).opacity < 1e-9);
});

test('tera: the crown grows only after the slab lands and is gone by the shatter', () => {
  assert.equal(teraCrownPose(0.2).scale, 0);
  assert.equal(teraCrownPose(0.2).opacity, 0);
  assert.ok(teraCrownPose(0.45).opacity > 0.99);
  assert.ok(near(teraCrownPose(0.45).scale, 1));
  assert.equal(teraCrownPose(TERA_SHATTER_AT).opacity, 0);
});

test('tera: arcs orbit forward while charging', () => {
  assert.ok(teraArcPose(0.5).rotate > teraArcPose(0.3).rotate);
  assert.ok(teraArcPose(0.4).opacity > 0.99);
});

test('tera: rays and smoke only appear after the shatter and grow outward', () => {
  assert.equal(teraRaysPose(TERA_SHATTER_AT - 0.01).opacity, 0);
  assert.equal(teraSmokePose(TERA_SHATTER_AT - 0.01).opacity, 0);
  assert.ok(teraRaysPose(0.7).opacity > 0.99);
  assert.ok(teraSmokePose(0.7).opacity > 0.7);
  assert.ok(teraRaysPose(0.9).scale > teraRaysPose(0.66).scale);
  assert.ok(teraSmokePose(0.9).scale > teraSmokePose(0.66).scale);
});

test('mega: the sphere swells in, holds full, then bursts outward as it fades', () => {
  assert.ok(megaSpherePose(0).scale < 0.5);
  assert.equal(megaSpherePose(0.5).opacity, 1);
  assert.ok(megaSpherePose(0.95).scale > 1.2);
  assert.ok(megaSpherePose(0.95).opacity < 0.1);
});

test('mega: swooshes orbit in their spin direction from their phase', () => {
  assert.equal(megaSwirlPose(0, { phase: 90 }).rotate, 90);
  assert.ok(megaSwirlPose(0.5, { phase: 0, spin: 1 }).rotate > 0);
  assert.ok(megaSwirlPose(0.5, { phase: 0, spin: -1 }).rotate < 0);
  assert.ok(megaSwirlPose(0.4).opacity > 0.99);
});

test('mega: hex pattern shows while the sphere holds', () => {
  assert.ok(megaHexPose(0.5).opacity > 0.79);
  assert.equal(megaHexPose(0.1).opacity, 0);
});

test('mega: the closing flash pops late and settles back to size', () => {
  assert.equal(megaFlashPose(0.5).opacity, 0);
  assert.equal(megaFlashPose(0.81).opacity, 1);
  assert.equal(megaFlashPose(0.5).scale, 1);
  assert.ok(near(megaFlashPose(1).scale, 1));
  assert.ok(megaFlashPose(0.87).scale > 1.05);
});
