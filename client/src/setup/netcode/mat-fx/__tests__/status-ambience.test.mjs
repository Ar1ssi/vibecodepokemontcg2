import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatusAmbience, heldStatusKeys, loopKeyFor } from '../status-ambience.mjs';
import { CUES } from '../sfx-cues.mjs';

function harness({ enabled = true, ready = true } = {}) {
  const state = { enabled, ready, started: [], stopped: [] };
  const ambience = createStatusAmbience({
    enabled: () => state.enabled,
    startLoop: (key, opts) => {
      if (!state.ready) return null;
      state.started.push({ key, ...opts });
      return { stop: () => state.stopped.push(key.replace('-loop', '')) };
    },
  });
  return { state, ambience };
}

test('heldStatusKeys: unique sorted keys across both boards; bench counts, hand does not', () => {
  const you = { zones: { active: [{ poisoned: true }], bench: [{ burned: true }], hand: [{ poisoned: true, specialCondition: 'Confused' }] } };
  const them = { zones: { active: [{ poisoned: true, specialCondition: 'Asleep' }] } };
  assert.deepEqual(heldStatusKeys([you, them]), ['burn', 'poison', 'sleep']);
  assert.deepEqual(heldStatusKeys([null, {}, { zones: { active: null } }]), []);
  assert.deepEqual(heldStatusKeys(undefined), []);
});

test('loops are status-bus beds at gain 0.25 with a cue row', () => {
  for (const key of ['poison', 'burn', 'sleep', 'paralyze', 'confusion']) {
    assert.deepEqual(CUES[loopKeyFor(key)], { gain: 0.25, preload: true, bus: 'status', loop: true });
  }
});

test('row 10: two Pokémon sharing a condition run one loop, stopped with the last marker', () => {
  const { state, ambience } = harness();
  ambience.sync(['poison', 'poison']);
  assert.deepEqual(state.started.map((s) => s.key), ['poison-loop']);
  assert.deepEqual(state.started[0], { key: 'poison-loop', gain: 0.25, bus: 'status' });
  ambience.sync(['poison']);
  assert.equal(state.started.length, 1, 'still held: loop is not restarted');
  ambience.sync([]);
  assert.deepEqual(state.stopped, ['poison']);
  assert.deepEqual(ambience.running(), []);
});

test('one loop per condition, not per Pokémon; a new condition adds its own loop', () => {
  const { state, ambience } = harness();
  ambience.sync(['burn']);
  ambience.sync(['burn', 'sleep']);
  assert.deepEqual(ambience.running(), ['burn', 'sleep']);
  assert.equal(state.started.length, 2);
});

test('a loop whose sample is not ready is retried on the next sync', () => {
  const { state, ambience } = harness({ ready: false });
  ambience.sync(['burn']);
  assert.deepEqual(ambience.running(), []);
  state.ready = true;
  ambience.sync(['burn']);
  assert.deepEqual(ambience.running(), ['burn']);
});

test('row 8: muting or turning ambience off stops loops at once; turning it on resumes', () => {
  const { state, ambience } = harness();
  ambience.sync(['poison']);
  state.enabled = false;
  ambience.refresh();
  assert.deepEqual(state.stopped, ['poison']);
  ambience.sync(['poison']);
  assert.deepEqual(ambience.running(), [], 'disabled: a view apply does not start loops');
  state.enabled = true;
  ambience.refresh();
  assert.deepEqual(ambience.running(), ['poison']);
});

test('row 11: hidden tab stops loops; visible resumes those still held', () => {
  const { state, ambience } = harness();
  ambience.sync(['poison', 'burn']);
  ambience.setHidden(true);
  assert.deepEqual(ambience.running(), []);
  ambience.sync(['poison']);
  assert.deepEqual(ambience.running(), [], 'hidden: syncs only remember');
  ambience.setHidden(false);
  assert.deepEqual(ambience.running(), ['poison']);
  assert.equal(state.started.filter((s) => s.key === 'burn-loop').length, 1);
});

test('game over halts loops until reset', () => {
  const { ambience } = harness();
  ambience.sync(['poison']);
  ambience.halt();
  assert.deepEqual(ambience.running(), []);
  ambience.sync(['poison']);
  assert.deepEqual(ambience.running(), []);
  ambience.reset();
  ambience.sync(['poison']);
  assert.deepEqual(ambience.running(), ['poison']);
});
