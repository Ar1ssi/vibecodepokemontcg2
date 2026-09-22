import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GAIN, clampGain, voicesFor } from '../fx-audio.mjs';
import { HOLD_MS } from '../fx-holds.mjs';

const every = (voices, fn) => voices.every(fn);
const lowest = (voices) => Math.min(...voices.filter((v) => v.type === 'tone').map((v) => v.freq));
const loudest = (voices) => Math.max(...voices.map((v) => v.gain));

test('fx-audio: every voice is structurally playable', () => {
  const plans = [
    ['damage', { dealt: 60 }],
    ['damage', { healed: 30 }],
    ['coin-flip', { face: 'heads' }],
    ['game-over', { user: 'self' }],
    ['game-over', { user: 'opp' }],
    ['status', { condition: 'Burned' }],
    ...Object.keys(HOLD_MS).map((effect) => [effect, {}]),
  ];
  for (const [effect, plan] of plans) {
    for (const voice of voicesFor(effect, plan)) {
      assert.ok(['tone', 'noise'].includes(voice.type), `${effect}: bad type ${voice.type}`);
      assert.ok(voice.dur > 0 && voice.dur < 2, `${effect}: bad dur ${voice.dur}`);
      assert.ok(voice.gain > 0 && voice.gain <= MAX_GAIN, `${effect}: bad gain ${voice.gain}`);
      assert.ok((voice.delay ?? 0) >= 0, `${effect}: negative delay`);
      if (voice.type === 'tone') {
        assert.ok(voice.freq > 20 && voice.freq < 20000, `${effect}: bad freq ${voice.freq}`);
      } else {
        assert.ok(voice.filter?.type, `${effect}: a noise voice needs a filter`);
      }
    }
  }
});

test('fx-audio: every effect with a hold has a voice, so nothing plays silently', () => {
  for (const effect of Object.keys(HOLD_MS)) {
    const plan =
      effect === 'damage'
        ? { dealt: 30 }
        : effect === 'game-over'
          ? { user: 'self' }
          : { condition: 'Asleep', face: 'heads' };
    assert.ok(voicesFor(effect, plan).length > 0, `${effect} has no voice`);
  }
});

test('fx-audio: an unknown effect is silent rather than a fallback beep', () => {
  assert.deepEqual(voicesFor('nope'), []);
  assert.deepEqual(voicesFor(undefined), []);
  assert.deepEqual(voicesFor('toString'), [], 'prototype keys are not voices');
});

test('fx-audio: a harder hit is lower and louder', () => {
  const light = voicesFor('damage', { dealt: 10 });
  const heavy = voicesFor('damage', { dealt: 200 });
  assert.ok(lowest(heavy) < lowest(light), 'heavy hits drop in pitch');
  assert.ok(loudest(heavy) > loudest(light), 'heavy hits are louder');
});

test('fx-audio: damage scaling is clamped past the top of the range', () => {
  const at200 = voicesFor('damage', { dealt: 200 });
  const absurd = voicesFor('damage', { dealt: 99999 });
  assert.deepEqual(absurd, at200, 'no runaway pitch or gain');
  assert.ok(every(absurd, (v) => v.gain <= MAX_GAIN));
});

test('fx-audio: weakness adds a bright overtone the plain hit lacks', () => {
  const plain = voicesFor('damage', { dealt: 60 });
  const weak = voicesFor('damage', { dealt: 60, weakness: true });
  assert.equal(weak.length, plain.length + 1);
  assert.ok(Math.max(...weak.map((v) => v.freq ?? 0)) > 1000);
});

test('fx-audio: a heal is a rising figure, not a thud', () => {
  const heal = voicesFor('damage', { healed: 30 });
  const freqs = heal.map((v) => v.freq);
  assert.ok(freqs.length >= 2);
  assert.deepEqual(freqs, [...freqs].sort((a, b) => a - b), 'the heal figure rises');
  assert.ok(every(heal, (v) => v.type === 'tone'), 'no noise burst on a heal');
});

test('fx-audio: negative dealt reads as a heal', () => {
  assert.deepEqual(voicesFor('damage', { dealt: -20 }), voicesFor('damage', { healed: 20 }));
});

test('fx-audio: a zero or missing hit is silent', () => {
  assert.deepEqual(voicesFor('damage', { dealt: 0 }), []);
  assert.deepEqual(voicesFor('damage', {}), []);
  assert.deepEqual(voicesFor('damage', { dealt: null }), []);
});

test('fx-audio: win rises, loss falls', () => {
  const win = voicesFor('game-over', { user: 'self' }).map((v) => v.freq);
  const loss = voicesFor('game-over', { user: 'opp' }).map((v) => v.freq);
  assert.deepEqual(win, [...win].sort((a, b) => a - b));
  assert.deepEqual(loss, [...loss].sort((a, b) => b - a));
  assert.deepEqual(voicesFor('game-over', { user: null }), [], 'a draw is silent');
});

test('fx-audio: heads and tails are audibly different', () => {
  const heads = voicesFor('coin-flip', { face: 'heads' }).map((v) => v.freq);
  const tails = voicesFor('coin-flip', { face: 'tails' }).map((v) => v.freq);
  assert.notDeepEqual(heads, tails);
  assert.ok(heads[0] > tails[0], 'heads is the brighter chime');
});

test('fx-audio: each special condition has its own motif, with a safe default', () => {
  const conditions = ['Poisoned', 'Burned', 'Asleep', 'Paralyzed', 'Confused'];
  const seen = new Set();
  for (const condition of conditions) {
    const voices = voicesFor('status', { condition });
    assert.ok(voices.length > 0, `${condition} is silent`);
    seen.add(JSON.stringify(voices));
  }
  assert.equal(seen.size, conditions.length, 'no two conditions sound alike');
  assert.ok(voicesFor('status', { condition: 'Cursed' }).length > 0, 'unknown condition still pops');
});

test('fx-audio: evolve and devolve are mirror figures', () => {
  const up = voicesFor('evolve').map((v) => v.freq);
  const down = voicesFor('devolve').map((v) => v.freq);
  assert.deepEqual(down, [...up].reverse());
});

test('fx-audio: an arpeggio staggers its notes', () => {
  const delays = voicesFor('prize-claim').map((v) => v.delay ?? 0);
  assert.deepEqual(delays, [...delays].sort((a, b) => a - b));
  assert.ok(delays.at(-1) > 0, 'later notes are delayed');
});

test('fx-audio: clampGain bounds the bus and rejects junk', () => {
  assert.equal(clampGain(0.3), 0.3);
  assert.equal(clampGain(5), MAX_GAIN);
  assert.equal(clampGain(-1), 0);
  assert.equal(clampGain(NaN), 0);
  assert.equal(clampGain('loud'), 0);
  assert.equal(clampGain(undefined), 0);
});

test('fx-audio: the palette is frozen, so no caller can corrupt it for later sounds', () => {
  // The tables are shared across every sound in the session.
  const voices = voicesFor('attach');
  assert.ok(Object.isFrozen(voices));
  assert.ok(voices.every((v) => Object.isFrozen(v)));
  assert.throws(() => voices.push({}), TypeError);
  assert.throws(() => {
    voicesFor('damage', { dealt: 30 })[0].gain = 99;
  }, TypeError);
  assert.equal(voicesFor('attach').length, 2, 'the palette is intact');
});
