import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BED_KEYS,
  CRAZY_KEY,
  GAME_OVER_FADE_SECONDS,
  SWELL_KEY,
  bedStateFor,
  createCrowdBed,
  crowdReactionFor,
} from '../crowd.mjs';
import { CUES } from '../sfx-cues.mjs';
import { resetDamageBaselines } from '../damage-hit.mjs';

const megaCard = { supertype: 'Pokémon', name: 'Mega Gengar ex', subtypes: ['Mega', 'ex'] };
const teraCard = { supertype: 'Pokémon', name: 'Charizard ex', subtypes: ['Stage 2', 'ex', 'Tera'] };
const lugia = { supertype: 'Pokémon', name: 'Lugia V', subtypes: ['Basic', 'V'] };

test('every crowd cue is a crowd-bus row; beds loop, reactions do not', () => {
  for (const key of [...Object.values(BED_KEYS), CRAZY_KEY]) {
    assert.equal(CUES[key].bus, 'crowd', key);
    assert.equal(CUES[key].loop, true, key);
  }
  const reactions = [SWELL_KEY, 'cheer-medium', 'cheer-large', 'cheer-disappoint', 'surprise', 'additional-reactions', 'small-reactions'];
  for (const key of reactions) {
    assert.equal(CUES[key].bus, 'crowd', key);
    assert.equal(CUES[key].loop, undefined, key);
  }
});

test('knockout: your Pokémon draws disappointment; the opponent one a medium cheer, large for a rule box', () => {
  assert.equal(crowdReactionFor('knockout', { user: 'self' }), 'cheer-disappoint');
  assert.equal(crowdReactionFor('knockout', { user: 'self', ruleBoxes: 1 }), 'cheer-disappoint');
  assert.equal(crowdReactionFor('knockout', { user: 'opp', ruleBoxes: 0 }), 'cheer-medium');
  assert.equal(crowdReactionFor('knockout', { user: 'opp' }), 'cheer-medium');
  assert.equal(crowdReactionFor('knockout', { user: 'opp', ruleBoxes: 2 }), 'cheer-large');
  assert.equal(crowdReactionFor('knockout', { user: null }), null);
});

test('damage: 200 or more, or a Weakness hit, surprises; ordinary hits and heals do not', () => {
  resetDamageBaselines();
  assert.equal(crowdReactionFor('damage', { dealt: 200, instanceId: 1 }), 'surprise');
  assert.equal(crowdReactionFor('damage', { dealt: 199, instanceId: 2 }), null);
  assert.equal(crowdReactionFor('damage', { dealt: 40, weakness: true, instanceId: 3 }), 'surprise');
  assert.equal(crowdReactionFor('damage', { healed: 300, instanceId: 4 }), null);
  assert.equal(crowdReactionFor('damage', {}), null);
});

test('enter: only a Mega or Tera signature entry draws additional reactions', () => {
  assert.equal(crowdReactionFor('enter', { soundCard: megaCard }), 'additional-reactions');
  assert.equal(crowdReactionFor('enter', { soundCard: teraCard }), 'additional-reactions');
  assert.equal(crowdReactionFor('enter', { soundCard: lugia }), null);
  assert.equal(crowdReactionFor('enter', {}), null);
});

test('GX and VSTAR use draw additional reactions', () => {
  assert.equal(crowdReactionFor('gx-used', { user: 'self' }), 'additional-reactions');
  assert.equal(crowdReactionFor('vstar-used', { user: 'opp' }), 'additional-reactions');
});

test('evolve and ability banners draw a small reaction half the time (injected rng)', () => {
  for (const effect of ['evolve', 'evolve-scene', 'ability-banner']) {
    assert.equal(crowdReactionFor(effect, {}, () => 0.49), 'small-reactions', effect);
    assert.equal(crowdReactionFor(effect, {}, () => 0.5), null, effect);
  }
});

test('game over: victory cheers large, defeat is disappointment, a draw is silent', () => {
  assert.equal(crowdReactionFor('game-over', { user: 'self' }), 'cheer-large');
  assert.equal(crowdReactionFor('game-over', { user: 'opp' }), 'cheer-disappoint');
  assert.equal(crowdReactionFor('game-over', { user: null }), null);
});

test('effects with no crowd row return null', () => {
  for (const effect of ['attack', 'attack-banner', 'attach', 'turn-banner', 'toString', undefined]) {
    assert.equal(crowdReactionFor(effect, {}), null, String(effect));
  }
});

const prizes = (n) => ({ zones: { prizes: Array.from({ length: n }, (_, i) => ({ instanceId: i })) } });

test('bedStateFor: no prize piles means no battle; the fewest prizes left sets the bed', () => {
  assert.deepEqual(bedStateFor([prizes(0), prizes(0)]), { bed: null, crazy: false });
  assert.deepEqual(bedStateFor([null, undefined]), { bed: null, crazy: false });
  assert.deepEqual(bedStateFor(undefined), { bed: null, crazy: false });
  assert.deepEqual(bedStateFor([prizes(6), prizes(6)]), { bed: 'small', crazy: false });
  assert.deepEqual(bedStateFor([prizes(6), prizes(3)]), { bed: 'small', crazy: false });
  assert.deepEqual(bedStateFor([prizes(6), prizes(2)]), { bed: 'large', crazy: false });
  assert.deepEqual(bedStateFor([prizes(1), prizes(5)]), { bed: 'large', crazy: true });
  assert.deepEqual(bedStateFor([prizes(0), prizes(1)]), { bed: 'large', crazy: true });
  assert.deepEqual(bedStateFor([{}, { zones: { prizes: null } }]), { bed: null, crazy: false });
});

function harness({ enabled = true, ready = true } = {}) {
  const state = { enabled, ready, started: [], stopped: [], samples: [] };
  const bed = createCrowdBed({
    enabled: () => state.enabled,
    playSample: (key, opts) => state.samples.push({ key, ...opts }),
    startLoop: (key, opts) => {
      if (!state.ready) return null;
      state.started.push({ key, ...opts });
      return { stop: (stopOpts) => state.stopped.push({ key, ...stopOpts }) };
    },
  });
  return { state, bed };
}

test('the small bed starts with the battle, on the crowd bus at its cue gain', () => {
  const { state, bed } = harness();
  bed.sync({ bed: null, crazy: false });
  assert.equal(state.started.length, 0);
  bed.sync({ bed: 'small', crazy: false });
  assert.deepEqual(state.started, [{ key: 'crowd-amb-small', gain: CUES['crowd-amb-small'].gain, bus: 'crowd' }]);
  bed.sync({ bed: 'small', crazy: false });
  assert.equal(state.started.length, 1, 'unchanged state does not restart the loop');
});

test('reaching the large bed swells once, swaps the bed, and game point adds the crazy loop', () => {
  const { state, bed } = harness();
  bed.sync({ bed: 'small', crazy: false });
  bed.sync({ bed: 'large', crazy: false });
  assert.deepEqual(state.stopped, [{ key: 'crowd-amb-small' }]);
  assert.deepEqual(state.samples.map((s) => [s.key, s.bus]), [['to-large', 'crowd']]);
  assert.deepEqual(bed.running(), { bed: 'large', crazy: false });
  bed.sync({ bed: 'large', crazy: true });
  assert.deepEqual(state.started.map((s) => s.key), ['crowd-amb-small', 'crowd-amb-large', 'crowd-crazy']);
  assert.equal(state.samples.length, 1, 'no second swell');
  bed.sync({ bed: 'large', crazy: false });
  assert.deepEqual(bed.running(), { bed: 'large', crazy: false });
});

test('joining mid-game straight at the large bed does not swell', () => {
  const { state, bed } = harness();
  bed.sync({ bed: 'large', crazy: true });
  assert.equal(state.samples.length, 0);
  assert.deepEqual(bed.running(), { bed: 'large', crazy: true });
});

test('muted or Crowd off: nothing runs; turning it on starts the remembered state', () => {
  const { state, bed } = harness({ enabled: false });
  bed.sync({ bed: 'small', crazy: false });
  assert.equal(state.started.length, 0);
  state.enabled = true;
  bed.refresh();
  assert.deepEqual(bed.running(), { bed: 'small', crazy: false });
  state.enabled = false;
  bed.refresh();
  assert.deepEqual(bed.running(), { bed: null, crazy: false });
});

test('a bed whose cue is not decoded yet is retried on the next sync', () => {
  const { state, bed } = harness({ ready: false });
  bed.sync({ bed: 'small', crazy: false });
  assert.deepEqual(bed.running(), { bed: null, crazy: false });
  state.ready = true;
  bed.sync({ bed: 'small', crazy: false });
  assert.deepEqual(bed.running(), { bed: 'small', crazy: false });
});

test('hidden tab stops the loops; visible resumes them while the state holds', () => {
  const { bed } = harness();
  bed.sync({ bed: 'small', crazy: true });
  bed.setHidden(true);
  assert.deepEqual(bed.running(), { bed: null, crazy: false });
  bed.setHidden(false);
  assert.deepEqual(bed.running(), { bed: 'small', crazy: true });
});

test('game over fades the beds out over 3 s and holds them off until the next game', () => {
  const { state, bed } = harness();
  bed.sync({ bed: 'large', crazy: true });
  bed.finish();
  assert.deepEqual(state.stopped, [
    { key: 'crowd-amb-large', fadeSeconds: GAME_OVER_FADE_SECONDS },
    { key: 'crowd-crazy', fadeSeconds: GAME_OVER_FADE_SECONDS },
  ]);
  assert.equal(GAME_OVER_FADE_SECONDS, 3);
  bed.sync({ bed: 'large', crazy: true });
  assert.deepEqual(bed.running(), { bed: null, crazy: false }, 'ignored after game over');
  bed.sync({ bed: null, crazy: false });
  bed.sync({ bed: 'small', crazy: false });
  assert.deepEqual(bed.running(), { bed: 'small', crazy: false }, 'a new game re-arms the crowd');
});

test('reset stops everything and re-arms', () => {
  const { bed } = harness();
  bed.sync({ bed: 'small', crazy: false });
  bed.finish();
  bed.reset();
  bed.sync({ bed: 'small', crazy: false });
  assert.deepEqual(bed.running(), { bed: 'small', crazy: false });
});
