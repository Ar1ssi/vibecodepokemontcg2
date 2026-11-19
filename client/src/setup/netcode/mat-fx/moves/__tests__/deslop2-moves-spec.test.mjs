import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAVELLING_MOTIONS } from '../card-motion.mjs';
import { MAX_NODES, resolveArmCount, validateSpec } from '../move-spec.mjs';
import { resolveArms } from '../move-poses.mjs';
import { fireBlast } from '../specs/fire.mjs';

const clone = (value) => structuredClone(value);
const has = (errors, text) => errors.some((message) => message.includes(text));

test('the node budget counts the two trails of every travelling motion, as the player draws them', () => {
  const burst = (count) => ({ ...clone(fireBlast.particles[0]), count });
  for (const motion of TRAVELLING_MOTIONS) {
    const travelling = { ...clone(fireBlast), attacker: { motion, params: {} }, family: 'burst' };
    assert.ok(!has(validateSpec({ ...travelling, particles: [burst(24)] }), 'DOM nodes'), `${motion} fits`);
    assert.ok(has(validateSpec({ ...travelling, particles: [burst(24), burst(4)] }), `exceeds ${MAX_NODES}`), motion);
  }
  const standing = { ...clone(fireBlast), attacker: { motion: 'lunge', params: {} }, family: 'burst' };
  assert.ok(!has(validateSpec({ ...standing, particles: [burst(23), burst(4)] }), 'DOM nodes'));
});

test('the cost rule counts the same arms the starFlare pose draws', () => {
  for (const arms of ['dai', 'cross', 'ring', [{ angle: 0, reach: 1 }, { angle: 90, reach: 1 }]]) {
    assert.equal(resolveArmCount(arms), resolveArms(arms).length, JSON.stringify(arms));
  }
});
