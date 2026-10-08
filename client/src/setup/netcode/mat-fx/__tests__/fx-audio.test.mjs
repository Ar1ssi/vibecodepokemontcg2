import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILY_VOICES, MAX_GAIN, clampGain, voicesFor } from '../fx-audio.mjs';
import { HOLD_MS } from '../fx-holds.mjs';
import { resetDamageBaselines } from '../damage-hit.mjs';

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
    ['deck-reveal', { user: 'opp' }],
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

test('fx-audio: evolve (under a Mega/Tera entry) and devolve are mirror figures', () => {
  const up = voicesFor('evolve').map((v) => v.freq);
  const down = voicesFor('devolve').map((v) => v.freq);
  assert.deepEqual(down, [...up].reverse());
});

// Design 041: the evolution scene's score (3.2 s, flare peak at ~2.0 s).
const sounding = (voices, at) => voices.filter((v) => (v.delay ?? 0) <= at && at < (v.delay ?? 0) + v.dur);

test('fx-audio: the evolution score swells and rises into the flare', () => {
  const score = voicesFor('evolve-scene');
  const swells = score.filter((v) => v.attack >= 1);
  assert.ok(swells.length >= 3, 'a pad and a riser swell in');
  for (const v of swells) assert.ok(v.attack < v.dur, 'a swell still decays');
  assert.ok(
    score.some((v) => v.type === 'noise' && v.filter.freqTo > v.filter.freq),
    'a noise riser sweeps upward'
  );
  assert.ok(score.some((v) => v.type === 'tone' && v.freqTo > v.freq), 'a rising tone');
});

test('fx-audio: the evolution score hits on the flare peak and ends with the scene', () => {
  const score = voicesFor('evolve-scene');
  const hit = score.filter((v) => v.delay === 2);
  assert.ok(hit.length >= 5, 'a chord, a shimmer and a boom at 2.0 s');
  assert.ok(hit.some((v) => v.type === 'tone' && v.freqTo < v.freq), 'the boom falls');
  const end = Math.max(...score.map((v) => (v.delay ?? 0) + v.dur));
  assert.ok(end > 2.8 && end <= 3.4, `score ends at ${end}s`);
});

test('fx-audio: the evolution score never stacks past the bus', () => {
  const score = voicesFor('evolve-scene');
  for (let at = 0; at <= 3.4; at += 0.02) {
    const total = sounding(score, at).reduce((sum, v) => sum + v.gain, 0);
    assert.ok(total <= 0.8, `${total.toFixed(2)} at ${at.toFixed(2)}s`);
  }
});

test('fx-audio: evolve-scene differs from the signature arpeggio', () => {
  assert.ok(voicesFor('evolve-scene').length > voicesFor('evolve').length * 4);
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

// ── Review fix: sound and visuals must agree on what a hit was ─────────────

test('fx-audio: a cumulative-only damageUpdated is heard, not just seen', () => {
  // Most emitters (checkup Poison/Burn, Tool pings, special energy) send only
  // the running total. Reading `dealt` alone left those hits silent while the
  // number still popped and the table still shook.
  resetDamageBaselines();
  const card = 'c1';
  assert.deepEqual(voicesFor('damage', { instanceId: card, damage: 20 }), [], 'no baseline yet');
  const second = voicesFor('damage', { instanceId: card, damage: 50 });
  assert.ok(second.length > 0, 'the 30-damage tick is audible');
});

test('fx-audio: the delta fallback is consumed once, so sound and visual match', () => {
  resetDamageBaselines();
  const plan = { instanceId: 'c2', damage: 40 };
  voicesFor('damage', { instanceId: 'c2', damage: 10 });
  const first = voicesFor('damage', plan);
  const again = voicesFor('damage', plan);
  assert.ok(first.length > 0);
  assert.deepEqual(again, first, 'the same plan classifies the same way twice');
});

test('fx-audio: a cumulative heal is a rising figure, same as an explicit one', () => {
  resetDamageBaselines();
  voicesFor('damage', { instanceId: 'c3', damage: 60 });
  const healed = voicesFor('damage', { instanceId: 'c3', damage: 20 });
  assert.deepEqual(
    healed.map((v) => v.freq),
    voicesFor('damage', { healed: 40 }).map((v) => v.freq)
  );
});

test('fx-audio: a cumulative no-op is silent', () => {
  resetDamageBaselines();
  voicesFor('damage', { instanceId: 'c4', damage: 30 });
  assert.deepEqual(voicesFor('damage', { instanceId: 'c4', damage: 30 }), []);
});

test('fx-audio: coin chimes wait for each coin to land, one per flip', () => {
  const one = voicesFor('coin-flip', { faces: ['heads'] });
  assert.equal(one.length, 2);
  assert.ok(one[0].delay >= 1, 'the chime does not give the result away mid-toss');
  const three = voicesFor('coin-flip', { faces: ['heads', 'tails', 'heads'] });
  assert.equal(three.length, 6);
  assert.ok(three[2].delay > three[0].delay && three[4].delay > three[2].delay);
  assert.ok(three[0].freq > three[2].freq, 'heads and tails still chime differently');
});

const UNBOX_EFFECTS = [
  'unbox-tear',
  'unbox-lid',
  'unbox-unwrap',
  'unbox-flip',
  'unbox-hit-1',
  'unbox-hit-2',
  'unbox-hit-3',
  'unbox-done',
];

test('fx-audio: every unboxing beat (design 052) has a playable voice', () => {
  for (const effect of UNBOX_EFFECTS) {
    const voices = voicesFor(effect);
    assert.ok(voices.length > 0, `${effect} has no voice`);
    for (const voice of voices) {
      assert.ok(voice.dur > 0 && voice.dur < 2, `${effect}: bad dur ${voice.dur}`);
      assert.ok(voice.gain > 0 && voice.gain <= MAX_GAIN, `${effect}: bad gain ${voice.gain}`);
      if (voice.type === 'noise') assert.ok(voice.filter?.type, `${effect}: noise needs a filter`);
    }
  }
});

test('fx-audio: the 3D pack rip tick (design 055) is one short band-passed noise', () => {
  const voices = voicesFor('unbox-rip-tick');
  assert.equal(voices.length, 1);
  assert.equal(voices[0].type, 'noise');
  assert.equal(voices[0].dur, 0.04);
  assert.equal(voices[0].gain, 0.12);
  assert.deepEqual([voices[0].filter.type, voices[0].filter.freq], ['bandpass', 2400]);
});

test('fx-audio: the unboxing hit chime climbs with the tier', () => {
  const highest = (voices) => Math.max(...voices.map((v) => v.freq || 0));
  const [one, two, three] = [1, 2, 3].map((tier) => voicesFor(`unbox-hit-${tier}`));
  assert.deepEqual(one.map((v) => v.freq), [523, 659, 784]);
  assert.ok(highest(two) > highest(one), 'tier 2 is an octave up');
  assert.ok(two.length > one.length, 'tier 2 adds a fourth note');
  assert.ok(three.length >= 2);
  const swell = three.find((v) => v.wave === 'sawtooth');
  assert.equal(swell?.freq, 262);
  assert.equal(swell?.dur, 1.2);
  assert.equal(swell?.gain, 0.18);
});

test('fx-audio: the Elite Trainer Box props have voices (design 057)', () => {
  const dice = voicesFor('unbox-dice');
  assert.deepEqual(dice.map((voice) => voice.delay), [0, 0.07, 0.15], 'three clicks');
  for (const voice of dice) {
    assert.equal(voice.type, 'noise');
    assert.equal(voice.dur, 0.04);
    assert.deepEqual({ type: voice.filter.type, freq: voice.filter.freq }, { type: 'bandpass', freq: 2400 });
  }
  const [coin] = voicesFor('unbox-coin');
  assert.deepEqual(
    { wave: coin.wave, freq: coin.freq, freqTo: coin.freqTo, dur: coin.dur, gain: coin.gain },
    { wave: 'sine', freq: 2600, freqTo: 2200, dur: 0.32, gain: 0.18 }
  );
});

test('fx-audio: a deck reveal swooshes off the deck, then chimes at the reveal spot (design 059)', () => {
  const voices = voicesFor('deck-reveal', { user: 'self' });
  assert.equal(voices[0].type, 'noise');
  assert.equal(voices[0].delay ?? 0, 0, 'the swoosh starts with the flight');
  const chime = voices.filter((v) => v.type === 'tone');
  assert.equal(chime.length, 3);
  assert.ok(chime.every((v) => v.delay >= 0.3 && v.delay < 0.7), 'the chime lands as the card reaches the spot');
  assert.deepEqual(voicesFor('deck-reveal', { user: 'opp' }), voices, 'both seats hear the same reveal');
});

test('fx-audio: all 14 move families have a voice set, within the gain and 0.6 s limits (design 063)', () => {
  const families = ['slash', 'punch', 'dash', 'beam', 'projectile', 'burst', 'quake', 'splash', 'wind', 'electric', 'ghost', 'chime', 'roar', 'charge'];
  assert.deepEqual(Object.keys(FAMILY_VOICES).sort(), [...families].sort());
  for (const family of families) {
    const voices = FAMILY_VOICES[family];
    assert.ok(voices.length > 0, family);
    for (const voice of voices) assert.ok(voice.gain <= MAX_GAIN, `${family} gain`);
    const end = Math.max(...voices.map((v) => (v.delay ?? 0) + v.dur));
    assert.ok(end <= 0.6 + 1e-9, `${family} ends at ${end}`);
  }
});

test('fx-audio: an attack plan sounds its family, an unknown or missing family keeps the generic attack voice', () => {
  const today = voicesFor('attack', {});
  assert.ok(today.length > 0);
  assert.equal(voicesFor('attack', { family: 'beam' }), FAMILY_VOICES.beam);
  assert.equal(voicesFor('attack', { family: 'nope' }), today);
  assert.equal(voicesFor('attack', { family: 'toString' }), today);
  assert.equal(voicesFor('attack', undefined), today);
  assert.deepEqual(voicesFor('attack-banner', { family: 'beam' }), voicesFor('attack-banner', {}));
});
