// Coin-gated attack sentences (design 032, I120): "If heads / If tails / For each heads, …"
// clauses the server attack phase used to skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { parseAttackEnergyDiscard } from '../rules/attack-effects.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const energy = (type = 'Fire', extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
    ...extra,
  });
const trainer = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });

/** p1's Active attacks with `text`; `setup` shapes the board before the attack. */
function board(text, { name = 'Attacker', damage = '0', setup = () => {}, seed = 5 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-gates', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(name, { hp: 300, attacks: [{ name: 'Test Attack', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400 });
  state.players.p2.zones.active.push(defender);
  const ctx = { state, attacker, defender, p1: state.players.p1, p2: state.players.p2 };
  setup(ctx);
  return { ...ctx, rng: createRng(seed) };
}

function attack(b) {
  const res = applyCommand(b.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, b.rng);
  assert.equal(res.error, null);
  return res;
}

const coinOf = (res) => res.events.find((e) => e.type === 'attackCoinFlipped');

/** Attacks with the first seed whose coin lands on `face` ('heads' | 'tails'). */
function attackOn(face, text, options = {}) {
  for (let seed = 1; seed <= 40; seed++) {
    const b = board(text, { ...options, seed });
    const res = attack(b);
    if (coinOf(res)?.coin === face) return { b, res };
  }
  throw new Error(`no seed lands ${face}`);
}

function choose(res, selection, rng, playerId = res.state.pendingChoice.player) {
  const next = applyCommand(
    res.state,
    { type: 'resolveChoice', playerId, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    rng
  );
  assert.equal(next.error, null);
  return next;
}

const zone = (res, pid, name) => res.state.players[pid].zones[name];
const attachedTo = (res, pid, rootId) =>
  [...zone(res, pid, 'active'), ...zone(res, pid, 'bench')].filter((c) => c.attachedTo === rootId);
const turnPassed = (res) => assert.equal(res.state.turn.player, 'p2', 'the attack ends the turn');

const withEnergy = (...types) => ({ attacker, p1 }) => {
  for (const type of types) {
    const e = energy(type);
    e.attachedTo = attacker.instanceId;
    p1.zones.active.push(e);
  }
};

// ── slice 1: self Energy discard behind the coin ────────────────────────────

test('parseAttackSteps: gated self discards are steps; ungated ones stay with the helper', () => {
  const after = (text, selfName) => parseAttackSteps(text, { selfName }).after;
  assert.deepEqual(after('Flip a coin. If tails, discard 2 Energy attached to this Pokémon.'), [
    { type: 'atkDiscardSelfEnergy', count: 2, gate: 'tails' },
  ]);
  assert.deepEqual(after('Flip a coin. If tails, discard all {R} Energy cards attached to Arcanine.', 'Arcanine'), [
    { type: 'atkDiscardSelfEnergy', all: true, energyType: 'R', gate: 'tails' },
  ]);
  assert.deepEqual(after('Flip a coin. If tails, discard a {R} Energy card attached to Ditto.', 'Ditto'), [
    { type: 'atkDiscardSelfEnergy', count: 1, energyType: 'R', gate: 'tails' },
  ]);
  assert.deepEqual(after('Discard 2 Energy from this Pokémon.'), []);
  // Damage counts the discard, or the cost can cancel the attack: left alone.
  assert.deepEqual(
    after(
      'You may flip a coin. If heads, discard all {L} Energy cards attached to Raikou. This attack does 40 damage plus 20 more damage for each Energy card discarded in this way.',
      'Raikou'
    ),
    []
  );
  assert.deepEqual(
    after(
      "Flip a coin. If heads, discard 2 Energy cards attached to Charizard. If tails, discard 4 Energy cards attached to Charizard. (If you can't, this attack does nothing.)",
      'Charizard'
    ),
    []
  );
});

test('parseAttackEnergyDiscard: a coin-gated "discard all" is not the helper\'s (Dynamic Bolt)', () => {
  assert.equal(parseAttackEnergyDiscard({ text: 'Flip a coin. If tails, discard all Energy from this Pokémon.' }), null);
  assert.deepEqual(parseAttackEnergyDiscard({ text: 'Discard all Energy from this Pokémon.' }), {
    all: true,
    count: Infinity,
    energyType: null,
  });
});

test('attack: Dynamic Bolt keeps its Energy on heads and discards all on tails', () => {
  const text = 'Flip a coin. If tails, discard all Energy from this Pokémon.';
  const heads = attackOn('heads', text, { name: 'Pikachu ex', damage: '220', setup: withEnergy('Lightning', 'Fire') });
  assert.equal(attachedTo(heads.res, 'p1', heads.b.attacker.instanceId).length, 2);
  const tails = attackOn('tails', text, { name: 'Pikachu ex', damage: '220', setup: withEnergy('Lightning', 'Fire') });
  assert.equal(attachedTo(tails.res, 'p1', tails.b.attacker.instanceId).length, 0);
  assert.equal(zone(tails.res, 'p1', 'discard').length, 2);
  turnPassed(tails.res);
});

test('attack: Aeroscream discards the 2 chosen Energy on tails only', () => {
  const text = 'Flip a coin. If tails, discard 2 Energy attached to this Pokémon.';
  const heads = attackOn('heads', text, { setup: withEnergy('Fire', 'Water', 'Grass') });
  assert.equal(attachedTo(heads.res, 'p1', heads.b.attacker.instanceId).length, 3);
  assert.equal(heads.res.state.pendingChoice, null);

  const { b, res } = attackOn('tails', text, { setup: withEnergy('Fire', 'Water', 'Grass') });
  assert.equal(res.state.pendingChoice.player, 'p1');
  const [fire, water] = attachedTo(res, 'p1', b.attacker.instanceId);
  const res2 = choose(res, [fire.instanceId, water.instanceId], b.rng);
  assert.deepEqual(
    attachedTo(res2, 'p1', b.attacker.instanceId).map((c) => c.energyType),
    ['Grass']
  );
  turnPassed(res2);
});

test('attack: a typed gated discard with fewer matches discards what there is', () => {
  const text = 'Flip a coin. If tails, discard 2 {R} Energy attached to this Pokémon.';
  const { b, res } = attackOn('tails', text, { setup: withEnergy('Fire', 'Water') });
  assert.equal(res.state.pendingChoice, null);
  assert.deepEqual(
    attachedTo(res, 'p1', b.attacker.instanceId).map((c) => c.energyType),
    ['Water']
  );
});

// ── slice 1: until-tails flips ──────────────────────────────────────────────

test('attack: "Flip a coin until you get tails" counts every heads for damage', () => {
  const text = 'Flip a coin until you get tails. This attack does 20 damage for each heads.';
  let sawRun = false;
  for (let seed = 1; seed <= 20; seed++) {
    const res = attack(board(text, { damage: '20×', seed }));
    const flip = coinOf(res);
    assert.equal(flip.flips[flip.flips.length - 1], 'tails', `seed ${seed}`);
    assert.equal(flip.headsCount, flip.flips.length - 1);
    sawRun ||= flip.headsCount >= 2;
    assert.equal(zone(res, 'p2', 'active')[0].damage, 20 * flip.headsCount, `seed ${seed}`);
  }
  assert.ok(sawRun, 'the seeds cover a run of 2+ heads');
});

// ── slice 1: coin-gated deck search ─────────────────────────────────────────

test('attack: Chase Up searches the deck on heads only', () => {
  const text = 'Flip a coin. If heads, search your deck for any 1 card and put it into your hand. Shuffle your deck afterward.';
  const tails = attackOn('tails', text, { name: 'Manaphy' });
  assert.equal(tails.res.state.pendingChoice, null);
  turnPassed(tails.res);
  const heads = attackOn('heads', text, { name: 'Manaphy' });
  assert.equal(heads.res.state.pendingChoice?.player, 'p1');
});
