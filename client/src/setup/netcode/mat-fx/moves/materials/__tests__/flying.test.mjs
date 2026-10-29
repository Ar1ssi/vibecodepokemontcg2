import test from 'node:test';
import assert from 'node:assert/strict';

import { flying } from '../flying.js';
import { fxModSpy } from './fx-mod-spy.mjs';

const BLADE = { x: 100, y: 100, angleDeg: 30, length: 90, width: 40, time: 0.2, seed: 1 };

test('a wind blade fills under shear and streaming wisps (distort + detail); its edge stroke stays crisp', () => {
  const spy = fxModSpy();
  flying.tongue(spy.ctx, BLADE, { alpha: 1, hot: 1 });
  const [blade] = spy.fills();
  assert.ok(blade.fxMod.distort.strength > 0);
  assert.ok(blade.fxMod.detail.amount > 0 && blade.fxMod.detail.speed > 0, 'wisps stream');
  // One fixed flow: a flow turned with the blade's spin would sweep the clock-long scroll and boil.
  const spun = fxModSpy();
  flying.tongue(spun.ctx, { ...BLADE, angleDeg: 140 }, { alpha: 1, hot: 1 });
  assert.deepEqual(spun.fills()[0].fxMod, blade.fxMod);
  const edge = spy.paints.find((p) => p.op === 'stroke');
  assert.ok(edge && !edge.fxMod.distort && !edge.fxMod.detail);
  assert.equal(spy.ctx.fxMod, null, 'fxMod restored');
});

test('a gust: its halo and core orb shear; a feather vane takes a still fibre layer', () => {
  const spy = fxModSpy();
  flying.projectile(spy.ctx, { x: 100, y: 100, r: 20, headingDeg: 90, time: 0, seed: 0, tongues: 2 });
  const fills = spy.fills();
  assert.ok(fills[0].fxMod.distort.strength > 0, 'halo');
  assert.ok(fills.at(-1).fxMod.distort.strength > 0, 'core orb');
  assert.equal(fills.at(-1).fxMod.detail, undefined);
  const feather = fxModSpy();
  flying.tongue(feather.ctx, BLADE, { alpha: 1, hot: 1, jag: 1 });
  const [vane] = feather.fills();
  assert.ok(vane.fxMod.detail.amount > 0);
  assert.equal(vane.fxMod.detail.speed, 0);
  assert.equal(feather.ctx.fxMod, null);
});

test('flying air dissolves with a pale sky rim from its palette, the drawer amount kept', () => {
  const outer = { dissolve: { amount: 0.6 } };
  const spy = fxModSpy(outer);
  flying.body(spy.ctx, 50, 50, 20, 1, 1);
  const { dissolve } = spy.fills()[0].fxMod;
  assert.deepEqual(dissolve.edge, [...flying.palette.hot]);
  assert.equal(dissolve.amount, 0.6);
  assert.equal(spy.ctx.fxMod, outer);
});

test('depth: blades are translucent sheets at their own heights; the ribbon and edge are lit tubes; the halo stays down', () => {
  const lone = fxModSpy();
  flying.tongue(lone.ctx, BLADE, { alpha: 1, hot: 1 });
  const [sheet] = lone.fills();
  assert.ok(sheet.z >= 0.04 && sheet.z <= 0.3, `sheet height ${sheet.z}`);
  const [ribbon, edge] = lone.strokes();
  assert.equal(ribbon.z, sheet.z);
  assert.ok(ribbon.fxMod.volume.spec > 0.5 && edge.fxMod.volume.spec > 0.5, 'glossy tubes');
  assert.equal(lone.ctx.fxLift, null, 'lift restored');
  const again = fxModSpy();
  flying.tongue(again.ctx, { ...BLADE, time: 0.9 }, { alpha: 1, hot: 1 });
  assert.equal(again.fills()[0].z, sheet.z, 'a blade holds its height as the clock runs');
  const other = fxModSpy();
  flying.tongue(other.ctx, { ...BLADE, seed: 5 }, { alpha: 1, hot: 1 });
  assert.notEqual(other.fills()[0].z, sheet.z, 'blades of a whirl sit at different heights');
  const gust = fxModSpy();
  flying.projectile(gust.ctx, { x: 100, y: 100, r: 20, headingDeg: 0, time: 0, seed: 0, tongues: 3 });
  const fills = gust.fills();
  assert.equal(fills[0].z, 0, 'the halo stays on the cloth');
  const heights = fills.slice(1).map((f) => f.z);
  assert.ok(heights.every((z, i) => i === 0 || z > heights[i - 1]), `stacked: ${heights}`);
  assert.equal(gust.ctx.fxLift, null);
});
