import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUES, UI_CUES, coinSoundMaterial, cuesFor, pickVariant, withSoundCard } from '../sfx-cues.mjs';
import { FLIGHT_MS } from '../card-flight.mjs';
import { coinCeremonyTimeline } from '../coin-pose.mjs';
import { RETREAT_SLIDE_MS } from '../lifecycle-pose.mjs';
import { PREVIEW_DROP_MS } from '../opp-play.mjs';
import { resetDamageBaselines } from '../damage-hit.mjs';

test('turn-banner maps to the turn prompt for each side', () => {
  assert.deepEqual(cuesFor('turn-banner', { user: 'self' }), [
    { key: 'your-turn', gain: CUES['your-turn'].gain, delayMs: 0 },
  ]);
  assert.equal(cuesFor('turn-banner', { user: 'opp' })[0].key, 'opp-turn');
});

test('turn-banner with no side, or no plan, has no cue', () => {
  assert.deepEqual(cuesFor('turn-banner', { user: null }), []);
  assert.deepEqual(cuesFor('turn-banner', undefined), []);
});

test('attack-banner and damage hits keep their synth voices; an attack plan with no tier has no cue', () => {
  for (const effect of ['attack', 'attack-banner', 'damage']) {
    assert.deepEqual(cuesFor(effect, { user: 'self', dealt: 90, healed: 0 }), [], effect);
  }
});

test('attack hits are sized by tier and land on contact (Addendum A)', () => {
  const hit = (key, alignMs) => ({ key, gain: 0.8, delayMs: 0, alignMs });
  assert.deepEqual(cuesFor('attack', { attackTier: 1, contactMs: 620, attackType: 'Fire' }), [hit('attack-fire-small', 620)]);
  assert.deepEqual(cuesFor('attack', { attackTier: 2, contactMs: 700, attackType: 'Water' }), [hit('attack-water-medium', 700)]);
  assert.deepEqual(cuesFor('attack', { attackTier: 3, contactMs: 1000, attackType: 'Lightning' }), [hit('attack-electric-large', 1000)]);
  assert.deepEqual(cuesFor('attack', { attackTier: 3, contactMs: 202, attackType: 'Darkness' }), [hit('attack-dark-large', 202)]);
});

test('a signature move adds its type sting at the start, then the large hit on contact', () => {
  assert.deepEqual(cuesFor('attack', { attackTier: 'S', contactMs: 1100, attackType: 'Psychic' }), [
    { key: 'sting-psychic', gain: 0.6, delayMs: 0 },
    { key: 'attack-psychic-large', gain: 0.8, delayMs: 0, alignMs: 1100 },
  ]);
});

test('a zero-damage aura plays the small hit unaligned; unknown types are colorless', () => {
  assert.deepEqual(cuesFor('attack', { attackTier: 'aura', contactMs: 0, attackType: 'Grass' }), [
    { key: 'attack-grass-small', gain: 0.8, delayMs: 0 },
  ]);
  assert.deepEqual(cuesFor('attack', { attackTier: 1, contactMs: 500, attackType: null }), [
    { key: 'attack-colorless-small', gain: 0.8, delayMs: 0, alignMs: 500 },
  ]);
  assert.deepEqual(cuesFor('attack', { attackTier: 2, contactMs: Number.NaN, attackType: 'Metal' }), [
    { key: 'attack-metal-medium', gain: 0.8, delayMs: 0, alignMs: 0 },
  ]);
});

test('every attack and sting cue exists on the sfx bus; hits preload, stings load on demand', () => {
  for (const type of ['colorless', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'grass', 'metal', 'psychic', 'water']) {
    for (const size of ['small', 'medium', 'large']) {
      assert.deepEqual(CUES[`attack-${type}-${size}`], { gain: 0.8, preload: true, bus: 'sfx' });
    }
    assert.deepEqual(CUES[`sting-${type}`], { gain: 0.6, preload: false, bus: 'sfx' });
  }
});

test('unmapped effects fall through to the synthesized voices', () => {
  assert.deepEqual(cuesFor('stadium-play', { user: 'self' }), []);
});

test('every cue spec is well formed and UI_CUES is the ui bus', () => {
  for (const [key, spec] of Object.entries(CUES)) {
    assert.ok(spec.gain > 0 && spec.gain <= 1, key);
    assert.ok(['sfx', 'ui', 'crowd', 'status'].includes(spec.bus), key);
    assert.equal(typeof spec.preload, 'boolean', key);
    assert.equal(UI_CUES.has(key), spec.bus === 'ui', key);
  }
});

test('pickVariant never repeats the previous index and stays in range', () => {
  for (let last = 0; last < 3; last += 1) {
    for (const roll of [0, 0.34, 0.67, 0.999]) {
      const index = pickVariant(3, last, () => roll);
      assert.notEqual(index, last);
      assert.ok(index >= 0 && index < 3);
    }
  }
});

test('pickVariant handles one variant, none, and a first pick', () => {
  assert.equal(pickVariant(1, 0, () => 0.9), 0);
  assert.equal(pickVariant(0), -1);
  assert.equal(pickVariant(2, -1, () => 0.99), 1);
  assert.equal(pickVariant(2, -1, () => 0), 0);
});

const keyOf = (effect, plan) => cuesFor(effect, plan)[0]?.key ?? null;
const plays = (effect, plan) => cuesFor(effect, plan).map(({ key, delayMs }) => [key, delayMs]);
const registry = (cards) => (id) => cards[id];

test('attach maps to the energy cue per side; the tool effect to the tool cue', () => {
  assert.equal(keyOf('attach', { user: 'self' }), 'attach-energy');
  assert.equal(keyOf('attach', { user: 'opp' }), 'attach-energy-opp');
  assert.equal(keyOf('attach', { user: null }), null);
  assert.equal(keyOf('tool-attach', { user: 'self' }), 'tool-attach');
});

test('withSoundCard renames a Tool attach and leaves Energy and unknown cards alone (row 7)', () => {
  const cardOf = registry({
    tool: { name: 'Choice Band', type: 'Trainer' },
    energy: { name: 'Basic Fire Energy', type: 'Energy' },
  });
  assert.equal(withSoundCard({ effect: 'attach', instanceId: 'tool' }, cardOf).effect, 'tool-attach');
  const energy = { effect: 'attach', instanceId: 'energy' };
  assert.equal(withSoundCard(energy, cardOf), energy);
  const missing = { effect: 'attach', instanceId: 'gone' };
  assert.equal(withSoundCard(missing, cardOf), missing);
  assert.equal(keyOf(withSoundCard(missing, cardOf).effect, { user: 'self' }), 'attach-energy');
});

test('promote and retreat pick the Active type cue; Lightning is electric, unknown is colorless (rows 6, 7)', () => {
  const cardOf = registry({
    a: { types: ['Fire'] },
    b: { types: ['Lightning'] },
    c: { types: ['Darkness'] },
    d: { types: ['Bogus'] },
    e: { types: [] },
  });
  const promote = (id) => withSoundCard({ effect: 'promote', instanceId: id }, cardOf);
  assert.equal(keyOf('promote', promote('a')), 'active-fire');
  assert.equal(keyOf('promote', promote('b')), 'active-electric');
  assert.equal(keyOf('promote', promote('c')), 'active-dark');
  assert.equal(keyOf('promote', promote('d')), 'active-colorless');
  assert.equal(keyOf('promote', promote('e')), 'active-colorless');
  assert.equal(keyOf('promote', promote('missing')), 'active-colorless');
  const retreat = withSoundCard({ effect: 'retreat', activeId: 'x', promotedId: 'a' }, cardOf);
  assert.equal(cuesFor('retreat', retreat)[1].key, 'active-fire');
  const swapped = withSoundCard({ effect: 'retreat', instanceId: 'b', replacedInstanceId: 'x' }, cardOf);
  assert.equal(cuesFor('retreat', swapped)[1].key, 'active-electric');
});

test('every active-<type> cue the importer maps exists in CUES', () => {
  for (const type of ['colorless', 'dark', 'dragon', 'electric', 'fairy', 'fighting', 'fire', 'grass', 'metal', 'psychic', 'water']) {
    assert.ok(CUES[`active-${type}`], type);
  }
});

test('trainer-play, prize-claim, evolve, evolve-scene', () => {
  assert.equal(keyOf('trainer-play', { user: 'self' }), 'trainer-to-board');
  assert.equal(keyOf('trainer-play', { user: 'opp' }), null);
  assert.equal(keyOf('prize-claim', { user: 'opp' }), 'prize-card');
  assert.equal(keyOf('evolve', {}), 'evolve-card');
  assert.equal(cuesFor('evolve-scene', {})[0].gain, 0.8);
});

test('damage sounds heal-card for a heal only; a hit stays synthesized', () => {
  resetDamageBaselines();
  assert.equal(keyOf('damage', { instanceId: 'h', healed: 30 }), 'heal-card');
  assert.equal(keyOf('damage', { instanceId: 'h2', dealt: 30 }), null);
});

test('status and status-clear map each condition to intro and outro', () => {
  const conditions = { Poisoned: 'poison', Burned: 'burn', Asleep: 'sleep', Paralyzed: 'paralyze', Confused: 'confusion' };
  for (const [condition, name] of Object.entries(conditions)) {
    assert.equal(keyOf('status', { condition }), `${name}-intro`);
    assert.equal(keyOf('status-clear', { condition }), `${name}-outro`);
  }
  assert.equal(keyOf('status', { condition: 'Frozen' }), null);
  assert.equal(keyOf('status-clear', {}), null);
});

test('game-over maps victory and defeat; a draw has no cue', () => {
  assert.equal(keyOf('game-over', { user: 'self' }), 'victory');
  assert.equal(keyOf('game-over', { user: 'opp' }), 'defeat');
  assert.equal(keyOf('game-over', { user: null }), null);
});

test('cuesFor ignores inherited property names', () => {
  assert.deepEqual(cuesFor('constructor', {}), []);
  assert.deepEqual(cuesFor('toString', {}), []);
});

test('opp-trainer-play flips the card, then sounds the played cue when it lands', () => {
  assert.equal(PREVIEW_DROP_MS, 260);
  assert.deepEqual(plays('opp-trainer-play', { user: 'opp' }), [
    ['card-flip', 0],
    ['opp-card-played', PREVIEW_DROP_MS],
  ]);
});

test('discard rows: self, opp, with and without a sweep, no side', () => {
  assert.equal(FLIGHT_MS, 620);
  assert.deepEqual(plays('discard', { user: 'self' }), [['discard-whoosh', 0], ['discard-finished', FLIGHT_MS]]);
  assert.deepEqual(plays('discard', { user: 'self', sweep: 'hand' }), [['discard-whoosh', 0], ['discard-deposit', FLIGHT_MS]]);
  assert.deepEqual(plays('discard', { user: 'opp' }), [['opp-pending-discard', 0]]);
  assert.deepEqual(plays('discard', { user: 'opp', sweep: 'hand' }), [['opp-pending-discard', 0], ['discard-deposit', FLIGHT_MS]]);
  assert.deepEqual(plays('discard', { user: null }), []);
});

test('retreat swooshes the outgoing card, then the incoming type cue after the slide', () => {
  assert.equal(RETREAT_SLIDE_MS, 520);
  assert.deepEqual(plays('retreat', { soundCard: { types: ['Water'] } }), [
    ['card-swoosh', 0],
    ['active-water', RETREAT_SLIDE_MS],
  ]);
  assert.deepEqual(plays('retreat', {}), [['card-swoosh', 0], ['active-colorless', RETREAT_SLIDE_MS]]);
});

test('coinSoundMaterial: metals ring, everything else clacks', () => {
  for (const material of ['gold', 'silver', 'metal']) assert.equal(coinSoundMaterial(material), 'metal');
  for (const material of ['enamel', 'cardboard', 'wood', '', undefined]) assert.equal(coinSoundMaterial(material), 'plastic');
});

test('coin-flip: one flip tosses at 0 and lands at 2200', () => {
  assert.deepEqual(plays('coin-flip', { faces: ['heads'], coinMaterial: 'metal' }), [
    ['coin-appear', 0],
    ['coin-toss-metal', 0],
    ['coin-win', 2200],
  ]);
  assert.deepEqual(plays('coin-flip', { face: 'tails', coinMaterial: 'plastic' }), [
    ['coin-appear', 0],
    ['coin-toss-plastic', 0],
    ['coin-loss', 2200],
  ]);
});

test('coin-flip: three flips keep the full toss, each starting tossMs before its landing', () => {
  const list = plays('coin-flip', { faces: ['heads', 'tails', 'heads'], coinMaterial: 'plastic' });
  const { landsAt, tossMs } = coinCeremonyTimeline(3);
  assert.equal(tossMs, 1500);
  assert.deepEqual(list, [
    ['coin-appear', 0],
    ['coin-toss-plastic', landsAt[0] - tossMs],
    ['coin-win', landsAt[0]],
    ['coin-toss-plastic', landsAt[1] - tossMs],
    ['coin-loss', landsAt[1]],
    ['coin-toss-plastic', landsAt[2] - tossMs],
    ['coin-win', landsAt[2]],
  ]);
});

test('coin-flip: six flips use the short spin toss (tossMs 1000)', () => {
  const faces = ['heads', 'tails', 'heads', 'tails', 'heads', 'tails'];
  const { landsAt, tossMs } = coinCeremonyTimeline(6);
  assert.equal(tossMs, 1000);
  const list = plays('coin-flip', { faces, coinMaterial: 'metal' });
  assert.equal(list.length, 1 + 2 * 6);
  assert.deepEqual(list.slice(1, 3), [['coin-spin-metal', landsAt[0] - tossMs], ['coin-win', landsAt[0]]]);
  assert.ok(list.every(([key]) => !key.startsWith('coin-toss')));
});

test('coin-flip with reduced motion has no toss cues and lands at 0 / 700 / 1400', () => {
  const list = plays('coin-flip', { faces: ['heads', 'tails', 'heads'], coinReducedMotion: true });
  assert.deepEqual(list, [['coin-appear', 0], ['coin-win', 0], ['coin-loss', 700], ['coin-win', 1400]]);
});

test('coin-flip: a missing material is metal, an unknown one is plastic', () => {
  assert.equal(plays('coin-flip', { faces: ['heads'] })[1][0], 'coin-toss-metal');
  assert.equal(plays('coin-flip', { faces: ['heads'], coinMaterial: 'mystery' })[1][0], 'coin-toss-plastic');
});

test('cuesFor results are frozen and every multi-cue key is a preloaded sfx cue at 0.7', () => {
  const sample = cuesFor('coin-flip', { faces: ['heads'], coinMaterial: 'metal' });
  assert.ok(Object.isFrozen(sample));
  assert.ok(Object.isFrozen(sample[0]));
  const keys = ['card-flip', 'opp-card-played', 'discard-whoosh', 'discard-finished', 'discard-deposit', 'opp-pending-discard', 'card-swoosh', 'coin-appear', 'coin-toss-metal', 'coin-toss-plastic', 'coin-spin-metal', 'coin-spin-plastic', 'coin-win', 'coin-loss'];
  for (const key of keys) assert.deepEqual([CUES[key].bus, CUES[key].gain, CUES[key].preload], ['sfx', 0.7, true], key);
});

const keysOf = (effect, plan) => cuesFor(effect, plan).map((cue) => cue.key);

test('design 064 non-fx moments: draw, shuffle, prizes, reveal, setup, retreat lock', () => {
  assert.deepEqual(keysOf('draw-start', { user: 'self' }), ['deck-to-hand']);
  assert.deepEqual(keysOf('draw-card', { user: 'self' }), ['card-drawn']);
  assert.deepEqual(keysOf('opp-draw', { user: 'opp' }), ['opp-deck-to-hand']);
  assert.deepEqual(keysOf('shuffle-flight', { user: 'self' }), ['shuffle-deck']);
  assert.deepEqual(keysOf('search-shuffle', { user: 'self' }), ['shuffle']);
  assert.deepEqual(keysOf('prizes-set', { user: 'self' }), ['cards-to-prizes']);
  assert.deepEqual(keysOf('deck-reveal', { user: 'self' }), ['card-reveal']);
  assert.deepEqual(keysOf('setup-begin', {}), ['setup-phase']);
  assert.deepEqual(keysOf('retreat-blocked', { user: 'opp' }), ['retreat-lock-flare']);
});

test('design 064 knockout: yours is one sound, theirs adds the rival sting and a rule-box whistle', () => {
  assert.deepEqual(keysOf('knockout', { user: 'self', ruleBoxes: 1 }), ['knocked-out']);
  assert.deepEqual(keysOf('knockout', { user: 'opp', ruleBoxes: 0 }), ['knocked-out', 'rival-ko-ding']);
  assert.deepEqual(keysOf('knockout', { user: 'opp' }), ['knocked-out', 'rival-ko-ding']);
  assert.deepEqual(keysOf('knockout', { user: 'opp', ruleBoxes: 2 }), [
    'knocked-out',
    'rival-ko-ding',
    'rival-ko-whistle',
  ]);
});

test('design 064 enter: Bench, mid-game Active, opening Active per side', () => {
  assert.deepEqual(keysOf('enter', { user: 'self', to: 'bench' }), ['place-bench']);
  assert.deepEqual(keysOf('enter', { user: 'opp', to: 'bench', setup: true }), ['place-bench']);
  assert.deepEqual(keysOf('enter', { user: 'opp', to: 'active' }), ['place-active']);
  assert.deepEqual(keysOf('enter', { user: 'self', to: 'active', setup: true }), ['place-active-opening']);
  assert.deepEqual(keysOf('enter', { user: 'opp', to: 'active', setup: true }), ['opp-place-active']);
  assert.deepEqual(keysOf('enter', { user: 'self', to: 'discard' }), []);
  assert.deepEqual(keysOf('enter', undefined), []);
});

test('design 064: every key the non-fx moments name has a cue spec', () => {
  for (const key of [
    'deck-to-hand', 'card-drawn', 'opp-deck-to-hand', 'shuffle-deck', 'shuffle', 'cards-to-prizes',
    'knocked-out', 'rival-ko-ding', 'rival-ko-whistle', 'card-reveal', 'place-active-opening',
    'opp-place-active', 'place-active', 'place-bench', 'retreat-lock-flare', 'setup-phase',
  ]) {
    assert.ok(CUES[key], key);
  }
});

test('design 064 slice 7b: play-lock sounds Item locks only', () => {
  const hand = [{ key: 'itchy-pollen-hand', gain: 0.7, delayMs: 0 }];
  assert.deepEqual(cuesFor('play-lock', { kinds: ['item'] }), hand);
  assert.deepEqual(cuesFor('play-lock', { kinds: ['any'] }), hand);
  assert.deepEqual(cuesFor('play-lock', { kinds: ['trainer'] }), hand);
  assert.deepEqual(cuesFor('play-lock', { kinds: ['supporter'] }), []);
  assert.deepEqual(cuesFor('play-lock', {}), []);
});

test('design 064 slice 7b: deferred KO marker and resolution', () => {
  assert.deepEqual(cuesFor('attack-marker', { markerKind: 'deferredKnockOut' }), [
    { key: 'doom-curse-1', gain: 0.7, delayMs: 0 },
  ]);
  assert.deepEqual(cuesFor('attack-marker', { markerKind: 'other' }), []);
  assert.deepEqual(cuesFor('deferred-ko', {}), [{ key: 'doom-curse-2', gain: 0.7, delayMs: 0 }]);
});

test('design 064 slice 7b: an effect knockout swaps the fall sound, rival rows stay', () => {
  assert.deepEqual(cuesFor('knockout', { user: 'self', effectKo: true }).map((c) => c.key), ['instant-ko-impact']);
  assert.deepEqual(
    cuesFor('knockout', { user: 'opp', effectKo: true, ruleBoxes: 1 }).map((c) => c.key),
    ['instant-ko-impact', 'rival-ko-ding', 'rival-ko-whistle']
  );
  assert.deepEqual(cuesFor('knockout', { user: 'self' }).map((c) => c.key), ['knocked-out']);
});

test('design 064 slice 7b: Darkrai ex replaces the place cue, by exact name only', () => {
  const keys = (plan) => cuesFor('enter', plan).map((c) => c.key);
  assert.deepEqual(keys({ to: 'bench', soundCard: { name: 'Darkrai ex' } }), ['darkrai-ex-entrance']);
  assert.deepEqual(keys({ to: 'active', setup: true, user: 'opp', soundCard: { name: 'Darkrai ex' } }), ['darkrai-ex-entrance']);
  assert.deepEqual(keys({ to: 'bench', soundCard: { name: 'Mega Darkrai ex' } }), ['place-bench']);
  assert.deepEqual(keys({ to: 'bench' }), ['place-bench']);
  const card = { name: 'Darkrai ex' };
  assert.deepEqual(withSoundCard({ effect: 'enter', instanceId: 3 }, () => card).soundCard, card);
});

test('design 064 slice 7b: new cues sit on their buses', () => {
  assert.equal(CUES['itchy-pollen-hand-card'].bus, 'ui');
  for (const key of ['itchy-pollen-hand', 'doom-curse-1', 'doom-curse-2', 'instant-ko-impact', 'darkrai-ex-entrance']) {
    assert.equal(CUES[key].bus, 'sfx', key);
    assert.equal(CUES[key].gain, 0.7, key);
  }
  assert.equal(CUES['instant-ko-impact'].preload, true);
});
