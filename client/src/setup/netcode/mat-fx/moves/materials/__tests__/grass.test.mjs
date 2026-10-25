import test from 'node:test';
import assert from 'node:assert/strict';

import { grass, petal, solar } from '../grass.js';
import { fxModSpy } from './fx-mod-spy.mjs';

const LEAF = { x: 100, y: 100, angleDeg: 0, length: 80, width: 30, time: 0.3, seed: 1 };

test('a leaf fills under a still fibre layer with a slight wobble; its veins stay clean', () => {
  const spy = fxModSpy();
  grass.tongue(spy.ctx, LEAF, { alpha: 1, hot: 1 });
  const fills = spy.fills();
  assert.equal(fills.length, 2, 'body and lit half');
  for (const fill of fills) {
    assert.ok(fill.fxMod.detail.amount > 0 && fill.fxMod.detail.amount <= 0.4, 'fibre, subtle');
    assert.equal(fill.fxMod.detail.speed, 0);
    assert.ok(fill.fxMod.distort.strength > 0 && fill.fxMod.distort.strength <= 0.02, 'wobble, subtle');
  }
  const veins = spy.paints.find((p) => p.op === 'stroke');
  assert.ok(veins && !veins.fxMod.detail && !veins.fxMod.distort);
  assert.equal(spy.ctx.fxMod, null, 'fxMod restored');
});

test('a seed sphere and its halo carry the sap wobble (distort), no fibre', () => {
  const spy = fxModSpy();
  grass.projectile(spy.ctx, { x: 100, y: 100, r: 20, headingDeg: 0, time: 0, seed: 1, tongues: 0 });
  const [halo, seed] = spy.fills();
  for (const fill of [halo, seed]) {
    assert.ok(fill.fxMod.distort.strength > 0);
    assert.equal(fill.fxMod.detail, undefined);
  }
  assert.equal(spy.ctx.fxMod, null);
});

test('dissolve edges: grass in leaf green, petal in its pink, solar in its light', () => {
  const edgeOf = (kit) => {
    const spy = fxModSpy({ dissolve: { amount: 0.4 } });
    kit.body(spy.ctx, 0, 0, 20, 1, 1);
    const { dissolve } = spy.fills()[0].fxMod;
    assert.equal(dissolve.amount, 0.4, "the drawer's amount survives");
    return dissolve.edge;
  };
  assert.deepEqual(edgeOf(grass), [...grass.palette.body]);
  assert.deepEqual(edgeOf(petal), [...petal.palette.body]);
  assert.deepEqual(edgeOf(solar), [...solar.palette.hot]);
});

test('depth: a leaf is an opaque lit sheet at its own height; a pinwheel stacks its leaves under the seed', () => {
  const lone = fxModSpy();
  grass.tongue(lone.ctx, LEAF, { alpha: 1, hot: 1 });
  for (const fill of lone.fills()) {
    assert.equal(fill.composite, 'source-over', 'matter covers the card art instead of washing it out');
    assert.equal(fill.fxMod.volume.amount, 1);
    assert.ok(fill.z >= 0.02 && fill.z <= 0.12);
  }
  assert.equal(lone.ctx.globalCompositeOperation, 'lighter', 'the caller pass is back');
  assert.equal(lone.ctx.fxLift, null);
  const wheel = fxModSpy();
  grass.projectile(wheel.ctx, { x: 100, y: 100, r: 20, headingDeg: 0, time: 0, seed: 0, tongues: 3 });
  const [halo, ...rest] = wheel.fills();
  assert.equal(halo.z, 0);
  const seed = rest.at(-1);
  assert.ok(seed.fxMod.volume.spec > 0.4, 'a glossy seed');
  assert.ok(rest.every((f) => f.z <= seed.z), 'the seed core on top');
});
