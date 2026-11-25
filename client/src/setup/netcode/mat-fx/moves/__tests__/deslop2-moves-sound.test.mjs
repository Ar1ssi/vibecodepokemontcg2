import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LUNGE_CONTACT_MS, attackSoundFields } from '../attack-sound.mjs';

test('a pick without a score still reports its own tier, not one re-derived from the card', () => {
  const stage1 = { name: 'Wartortle', types: ['Water'], stage: 'Stage 1' };
  const fields = attackSoundFields({ pick: { tier: 3, family: 'quake', score: null }, card: stage1 });
  assert.deepEqual(fields, { family: 'quake', attackTier: 3, contactMs: LUNGE_CONTACT_MS, attackType: 'Water' });
});
