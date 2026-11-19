import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_FX, SOUND_ONLY_FX } from '../../advisory-animations.mjs';
import { HOLD_MS } from '../fx-holds.mjs';

// Effects advisory-animations.mjs plans without an EVENT_FX entry (fxPlan(..., effect) calls).
const PLANNED_DIRECTLY = ['attack-banner', 'enter', 'coin-flip', 'transit', 'pile-catch', 'discard'];
// `enter` has no table hold on purpose: a Pokémon landing on its slot overlaps what follows, and
// entry.js returns its own hold for a pile flight or a Mega/Tera entry scene. Every key of HOLD_MS
// must have a synth voice (fx-audio.test.mjs), which `enter` (sampled by sfx-cues) does not.
const HOLD_RETURNED_BY_EFFECT = new Set(['enter']);

test('fx-holds: every visual effect the planner can send has a hold entry or returns its own', () => {
  const effects = new Set([...Object.values(EVENT_FX), ...PLANNED_DIRECTLY]);
  const missing = [...effects].filter(
    (effect) => !SOUND_ONLY_FX.has(effect) && !HOLD_RETURNED_BY_EFFECT.has(effect) && !Object.hasOwn(HOLD_MS, effect)
  );
  assert.deepEqual(missing, []);
});
