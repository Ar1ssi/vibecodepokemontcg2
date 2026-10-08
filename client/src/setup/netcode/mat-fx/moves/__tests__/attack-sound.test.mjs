import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LUNGE_CONTACT_MS, attackSoundFields } from '../attack-sound.mjs';
import { LUNGE_IMPACT, LUNGE_MS } from '../../combat-pose.mjs';

const fireBasic = { name: 'Charmander', types: ['Fire'], stage: 'Basic' };
const waterStage1 = { name: 'Wartortle', types: ['Water'], stage: 'Stage 1' };

test('a signature scene is tier S and contacts at its spec time', () => {
  const fields = attackSoundFields({
    signatureSpec: { family: 'beam', contactMs: 1100 },
    pick: { tier: 1, family: 'punch', score: { contactMs: 500 } },
    card: fireBasic,
  });
  assert.deepEqual(fields, { family: 'beam', attackTier: 'S', contactMs: 1100, attackType: 'Fire' });
});

test('a zero-damage attack is the aura: no family, contact 0', () => {
  assert.deepEqual(attackSoundFields({ zeroDamage: true, card: waterStage1 }), {
    family: undefined,
    attackTier: 'aura',
    contactMs: 0,
    attackType: 'Water',
  });
});

test('a generic move reports its tier and its spec contact', () => {
  const fields = attackSoundFields({ pick: { tier: 3, family: 'quake', score: { contactMs: 980 } }, card: waterStage1 });
  assert.deepEqual(fields, { family: 'quake', attackTier: 3, contactMs: 980, attackType: 'Water' });
});

test('with no move spec the lunge plays: tier from the card, contact at the lunge impact', () => {
  assert.equal(LUNGE_CONTACT_MS, Math.round(LUNGE_MS * LUNGE_IMPACT));
  assert.deepEqual(attackSoundFields({ pick: null, card: waterStage1 }), {
    family: undefined,
    attackTier: 2,
    contactMs: LUNGE_CONTACT_MS,
    attackType: 'Water',
  });
  assert.deepEqual(attackSoundFields({ pick: { tier: 1, family: undefined, score: null }, card: fireBasic }).attackTier, 1);
});

test('a missing card or typeless card still sounds: tier 1, type null', () => {
  assert.deepEqual(attackSoundFields({}), { family: undefined, attackTier: 1, contactMs: LUNGE_CONTACT_MS, attackType: null });
  assert.equal(attackSoundFields({ card: { name: 'X', types: [] } }).attackType, null);
});
