import test from 'node:test';
import assert from 'node:assert/strict';

import { ground, mud } from '../ground.js';
import { litSideLight } from '../_kit-mod.js';
import { fxModSpy } from './fx-mod-spy.mjs';

const SPIKE = { x: 100, y: 300, angleDeg: -90, length: 150, width: 60, time: 0, seed: 4 };

test('a clod and a spike of earth fill under fixed grit; the lit chip and edge stay clean', () => {
  const clod = fxModSpy();
  ground.body(clod.ctx, 100, 100, 40, 1, 1);
  const [lump, chip] = clod.fills();
  assert.ok(lump.fxMod.detail.amount > 0);
  assert.equal(lump.fxMod.detail.speed, 0);
  assert.equal(chip.fxMod.detail, undefined, 'the lit chip is a highlight, not earth');
  assert.equal(clod.ctx.fxMod, null, 'fxMod restored');
  const spike = fxModSpy();
  ground.tongue(spike.ctx, SPIKE, { alpha: 1, hot: 1 });
  assert.ok(spike.fills().every((f) => f.fxMod.detail?.amount > 0));
  assert.ok(spike.paints.filter((p) => p.op === 'stroke').every((s) => !s.fxMod.detail));
});

test('dust shimmers: trail puffs rise on a fixed flow; the halo and the fissure pool waver', () => {
  const flight = fxModSpy();
  ground.projectile(flight.ctx, { x: 200, y: 200, r: 30, headingDeg: 90, time: 0.3, seed: 2, tongues: 2 });
  const [first, second] = flight.fills();
  for (const puff of [first, second]) {
    assert.ok(puff.fxMod.distort.strength > 0);
    assert.equal(puff.fxMod.distort.angle, -90, 'rising, whatever the heading');
    assert.ok(puff.fxMod.detail.amount > 0);
  }
  const halo = fxModSpy();
  ground.glow(halo.ctx, 0, 0, 40, 1);
  assert.ok(halo.fills()[0].fxMod.distort.strength > 0);
  const sigil = fxModSpy();
  ground.sigil(sigil.ctx, 100, 100, 80, 0.5);
  assert.ok(sigil.fills()[0].fxMod.distort.strength > 0, 'the pool shimmers');
  assert.ok(sigil.paints.filter((p) => p.op === 'stroke').every((s) => !s.fxMod.distort), 'seams stay sharp');
  assert.equal(sigil.ctx.fxMod, null);
});

test('ground crumbles in sand and mud in its wet brown, both dull; a drawer amount is kept', () => {
  for (const [kit, key] of [
    [ground, 'hot'],
    [mud, 'core'],
  ]) {
    const outer = { dissolve: { amount: 0.3 } };
    const spy = fxModSpy(outer);
    kit.projectile(spy.ctx, { x: 0, y: 0, r: 20, headingDeg: 0, time: 0, seed: 0, tongues: 1 });
    for (const fill of spy.fills()) {
      assert.deepEqual(fill.fxMod.dissolve.edge, [...kit.palette[key]], kit.key);
      assert.ok(fill.fxMod.dissolve.gain < 0.5, `${kit.key} crumbles, not blooms`);
      assert.equal(fill.fxMod.dissolve.amount, 0.3);
    }
    assert.equal(spy.ctx.fxMod, outer);
  }
});

test('a mud glob wobbles wet (distort) with no grit', () => {
  const spy = fxModSpy();
  mud.body(spy.ctx, 0, 0, 20, 1, 1);
  const [glob] = spy.fills();
  assert.ok(glob.fxMod.distort.strength > 0);
  assert.equal(glob.fxMod.detail, undefined);
});

test('depth: a clod is an unstyled radial lit as a matte bumped sphere; a spike a bumped sheet; a mud glob a wet sphere', () => {
  const clod = fxModSpy();
  ground.body(clod.ctx, 100, 100, 40, 1, 1);
  const [lump] = clod.fills();
  assert.equal(lump.fxStyle, null);
  assert.equal(lump.composite, 'source-over');
  assert.ok(lump.fxMod.volume.bump > 0.5 && lump.fxMod.volume.spec < 0.3);
  const spike = fxModSpy();
  ground.tongue(spike.ctx, SPIKE, { alpha: 1, hot: 1 });
  assert.ok(spike.fills().every((f) => f.fxMod.volume?.amount === 1));
  const [column] = spike.fills();
  assert.ok(column.fxMod.volume.radius > 0, 'the body is lit as a tube round its axis');
  const light = litSideLight(SPIKE.angleDeg);
  assert.ok([...spike.fills(), ...spike.strokes()].every((p) => p.fxMod.volume.light === light), 'lit from its drawn lit edge');
  assert.equal(column.fxStyle, null, "the kit's linear style would facet it like crystal");
  assert.equal(spike.strokes()[0].fxMod.volume.bump, 0, 'a smooth bevel on the lit edge');
  const glob = fxModSpy();
  mud.body(glob.ctx, 0, 0, 20, 1, 1);
  assert.ok(glob.fills()[0].fxMod.volume.spec > 0.5, 'wet: a tight glint');
});
