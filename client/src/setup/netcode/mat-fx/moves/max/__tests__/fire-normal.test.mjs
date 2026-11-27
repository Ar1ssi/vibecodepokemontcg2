import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRE_NORMAL_MAX_SPECS } from '../specs/fire-normal.mjs';
import { MAX_MOVES } from '../max-moves.mjs';
import { validateSpec } from '../../move-spec.mjs';
import { withoutImpactBeats } from '../../../impact/impact-select.mjs';
import { UNITS } from '../../materials/_units.js';
import { recordingContext } from '../../__tests__/recording-context.mjs';

const IDS = ['max-flare', 'g-max-wildfire', 'g-max-centiferno', 'g-max-fireball', 'max-strike', 'g-max-cuddle', 'g-max-replenish', 'g-max-gold-rush'];

test('fire-normal ships its eight specs, valid, named and typed as the catalogue', () => {
  assert.deepEqual(Object.keys(FIRE_NORMAL_MAX_SPECS).sort(), [...IDS].sort());
  for (const [id, spec] of Object.entries(FIRE_NORMAL_MAX_SPECS)) {
    assert.deepEqual(validateSpec(spec), [], id);
    assert.equal(spec.name, MAX_MOVES[id].name, id);
    assert.equal(spec.vgType, MAX_MOVES[id].vgType, id);
  }
});

test('in a game the impact keeps each move\'s own matter: coins, berries and the eruption', () => {
  const kept = (id) => withoutImpactBeats(FIRE_NORMAL_MAX_SPECS[id]);
  assert.ok(kept('g-max-gold-rush').particles.some((burst) => burst.kind === 'coin'), 'coins thrown');
  assert.ok(kept('g-max-gold-rush').beats.some((beat) => beat.params?.unit === 'coin' && beat.at > 1100), 'coins rain');
  assert.ok(kept('g-max-replenish').particles.some((burst) => burst.kind === 'berry'), 'berries');
  // The contact bursts of coins and berries ignite before contact, so the impact strip keeps them.
  const burstOf = (id, unit) => kept(id).beats.find((beat) => beat.drawer === 'shards' && beat.params?.unit === unit);
  assert.ok(burstOf('g-max-gold-rush', 'coin')?.at < 1100, 'coin burst at contact');
  assert.ok(burstOf('g-max-replenish', 'berry')?.at < 1100, 'berry burst at contact');
  for (const id of ['max-flare', 'g-max-wildfire', 'g-max-centiferno', 'g-max-fireball']) {
    const after = kept(id).beats.filter((beat) => beat.until > 1100 + 300);
    assert.ok(after.some((beat) => beat.drawer === 'starFlare' || beat.drawer === 'pillar'), `${id} erupts`);
  }
});

test('the fireball flies as an unstretched lit ball about a card height across, with a comet tail', () => {
  const flown = FIRE_NORMAL_MAX_SPECS['g-max-fireball'].beats.filter((beat) => beat.drawer === 'projectile');
  const ball = flown.find((beat) => beat.params.flare !== undefined && beat.params.flare !== 'none');
  const tail = flown.find((beat) => beat !== ball);
  assert.ok(ball && tail, 'a ball and a tail');
  // The fire kit draws a body 1.7× its canvas radius (elements/fire.js FIRE_SCALE.body).
  const diameter = 2 * ball.params.size * ball.params.flareCore * 1.7;
  assert.ok(diameter >= 0.6, `ball ${diameter.toFixed(2)} card heights across`);
  assert.equal(tail.at, ball.at);
  assert.equal(tail.until, ball.until);
});

test('the strike crescents sweep wide round the target', () => {
  const crescents = FIRE_NORMAL_MAX_SPECS['max-strike'].beats.filter((beat) => beat.drawer === 'slashArc');
  assert.equal(crescents.length, 2);
  for (const { params } of crescents) {
    // The blade is the chord of the swept 55 % of the arc: about two card heights at this radius.
    const chord = 2 * params.radius * Math.sin(((0.55 * params.sweep) / 2) * (Math.PI / 180));
    assert.ok(chord >= 1.8, `chord ${chord.toFixed(2)}`);
  }
});

test('the coin rocks but never turns edge-on, and draws nothing at r 0', () => {
  const palette = { deep: [200, 134, 10], body: [242, 194, 48], hot: [255, 233, 138], core: [255, 251, 232] };
  for (const s of [0, 0.2, 1 / 3, 0.5, 2 / 3, 0.99]) {
    const rec = recordingContext();
    UNITS.coin(rec.ctx, 40, 50, 20, 0, s, palette);
    const [, [sx, sy]] = rec.calls.find(([key]) => key === 'scale');
    assert.equal(sy, 1);
    assert.ok(sx >= 0.35 && sx <= 1, `squash ${sx} at ${s}`);
  }
  const none = recordingContext();
  UNITS.coin(none.ctx, 40, 50, 0, 0, 0.5, palette);
  assert.equal(none.calls.length, 0);
});
