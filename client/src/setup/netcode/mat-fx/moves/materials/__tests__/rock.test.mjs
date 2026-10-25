import test from 'node:test';
import assert from 'node:assert/strict';

import { ancient, gem, rock } from '../rock.js';
import { fxModSpy } from './fx-mod-spy.mjs';

const PROJECTILE = { x: 200, y: 200, r: 30, headingDeg: 0, time: 0.4, seed: 3, tongues: 3 };
const SPIRE = { x: 100, y: 300, angleDeg: -90, length: 160, width: 60, time: 0, seed: 2 };

test('rock stone faces fill under fixed grit (detail, no scroll); the outline stroke stays clean', () => {
  const spy = fxModSpy();
  rock.body(spy.ctx, 100, 100, 40, 1, 1);
  const [face, facet, shade] = spy.fills();
  for (const fill of [face, facet, shade]) {
    assert.ok(fill.fxMod.detail.amount > 0, 'grit on every face');
    assert.equal(fill.fxMod.detail.speed, 0, 'grit holds still on stone');
  }
  const strokes = spy.paints.filter((p) => p.op === 'stroke');
  assert.ok(strokes.length > 0);
  assert.ok(strokes.every((s) => !s.fxMod.detail), 'outline and lit edge carry no grit');
  assert.equal(spy.ctx.fxMod, null, 'fxMod restored');
});

test('a rock spire fills under grit; a boulder trails dust that shimmers and rises on a fixed flow', () => {
  const spire = fxModSpy();
  rock.tongue(spire.ctx, SPIRE, { alpha: 1, hot: 1 });
  assert.ok(spire.fills().every((f) => f.fxMod.detail?.amount > 0));
  const flight = fxModSpy();
  rock.projectile(flight.ctx, PROJECTILE);
  const puffs = flight.fills().slice(0, PROJECTILE.tongues);
  for (const puff of puffs) {
    assert.ok(puff.fxMod.distort.strength > 0, 'dust shimmers');
    assert.ok(puff.fxMod.detail.amount > 0);
  }
  assert.equal(flight.ctx.fxMod, null);
  // The flow never follows the heading: the shader scrolls by clock x flow, so a turning flow boils.
  const turned = fxModSpy();
  rock.projectile(turned.ctx, { ...PROJECTILE, headingDeg: 70 });
  assert.deepEqual(turned.fills()[0].fxMod, puffs[0].fxMod);
});

test('rock edges crumble pale and dull; ancient burns violet; gem rims in light — all from the palette', () => {
  const edgeOf = (kit, draw) => {
    const spy = fxModSpy();
    draw(spy.ctx, kit);
    return spy.fills()[0].fxMod.dissolve;
  };
  const rockEdge = edgeOf(rock, (ctx, kit) => kit.body(ctx, 0, 0, 20, 1, 1));
  assert.deepEqual(rockEdge.edge, [...rock.palette.hot]);
  assert.ok(rockEdge.gain < 0.5, 'crumbling, not blooming');
  assert.deepEqual(edgeOf(ancient, (ctx, kit) => kit.body(ctx, 0, 0, 20, 1, 1)).edge, [...ancient.palette.hot]);
  assert.deepEqual(edgeOf(gem, (ctx, kit) => kit.body(ctx, 0, 0, 20, 1, 1)).edge, [...gem.palette.hot]);
  const tinted = rock.withPalette({ ...rock.palette, hot: [10, 20, 30] });
  assert.deepEqual(edgeOf(tinted, (ctx, kit) => kit.body(ctx, 0, 0, 20, 1, 1)).edge, [10, 20, 30], 'a tint carries its edge');
});

test("a drawer's dissolve amount survives the kit's edge and comes back afterwards", () => {
  const outer = { dissolve: { amount: 0.5 } };
  const spy = fxModSpy(outer);
  rock.projectile(spy.ctx, PROJECTILE);
  for (const fill of spy.fills()) assert.equal(fill.fxMod.dissolve.amount, 0.5);
  assert.equal(spy.ctx.fxMod, outer);
});
