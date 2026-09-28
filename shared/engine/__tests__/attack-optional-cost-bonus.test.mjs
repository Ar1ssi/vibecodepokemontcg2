// "You may <cost>. If you do, this attack does N more damage." — the cost is offered before
// damage, paid only on acceptance, and the bonus lands only when paid. Texts are corpus rows
// (out/pkmn-pokemon-cards.json) named in each test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { optionalCostBonusClause } from '../rules/optional-cost-bonus.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const trainer = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item', ...extra });
const energy = (type) =>
  createCard({ instanceId: nextId++, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], types: [type] });

function board(name, attack, { attached = [], hand = [] } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'optional-cost', seed: 3, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: [{ cost: [], ...attack }] });
  state.players.p1.zones.active.push(attacker);
  const energyIds = attached.map((type) => {
    const card = energy(type);
    card.attachedTo = attacker.instanceId;
    state.players.p1.zones.active.push(card);
    return card.instanceId;
  });
  state.players.p1.zones.hand.push(...hand);
  state.players.p2.zones.active.push(mon('Defender', { hp: 500 }));
  return { state, attacker, energyIds };
}

const attack = (state) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(3)
  );
const damageOf = (res) => res.events.find((e) => e.type === 'attackExecuted')?.damage;
const attachedTo = (state, attacker) =>
  state.players.p1.zones.active.filter((c) => c.attachedTo === attacker.instanceId).length;

const ELECTRICANNON = {
  name: 'Electricannon',
  damage: '80+',
  text: 'You may discard all {L} Energy attached to this Pokémon. If you do, this attack does 50 more damage.',
};

test('Eelektross Electricannon (Primal Clash 65): accepting discards the {L} Energy for +50', () => {
  const { state, attacker } = board('Eelektross', ELECTRICANNON, { attached: ['Lightning', 'Lightning', 'Fire'] });
  const offered = attack(state);
  assert.equal(offered.error, null);
  assert.ok(offered.state.pendingChoice, 'the cost is offered before damage');
  const paid = choose(offered, [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOf(paid), 130);
  assert.equal(attachedTo(paid.state, attacker), 1, 'only the Fire Energy stays');
});

test('Eelektross Electricannon: declining keeps every Energy and deals the printed 80', () => {
  const { state, attacker } = board('Eelektross', ELECTRICANNON, { attached: ['Lightning', 'Lightning', 'Fire'] });
  const declined = choose(attack(state), [2]);
  assert.equal(declined.error, null);
  assert.equal(damageOf(declined), 80);
  assert.equal(attachedTo(declined.state, attacker), 3);
});

test('Eelektross Electricannon: no {L} Energy attached, no offer, printed damage', () => {
  const { state } = board('Eelektross', ELECTRICANNON, { attached: ['Fire'] });
  const res = attack(state);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res), 80);
});

const OVER_SLICE = {
  name: 'Over Slice',
  damage: '80+',
  text: 'You may discard an Energy from this Pokémon. If you do, this attack does 40 more damage.',
};

test('Garchomp Over Slice (Unified Minds 114): the player picks which Energy pays', () => {
  const { state, attacker, energyIds } = board('Garchomp', OVER_SLICE, { attached: ['Fighting', 'Grass'] });
  const paid = choose(attack(state), [energyIds[1]]);
  assert.equal(paid.error, null);
  assert.equal(damageOf(paid), 120);
  const left = paid.state.players.p1.zones.active.filter((c) => c.attachedTo === attacker.instanceId);
  assert.deepEqual(left.map((c) => c.instanceId), [energyIds[0]]);
});

test('Garchomp Over Slice: picking no Energy declines', () => {
  const { state, attacker } = board('Garchomp', OVER_SLICE, { attached: ['Fighting', 'Grass'] });
  const declined = choose(attack(state), []);
  assert.equal(declined.error, null);
  assert.equal(damageOf(declined), 80);
  assert.equal(attachedTo(declined.state, attacker), 2);
});

test('Cetitan ex Crushing Press (Destined Rivals 210): discarding the Stadium adds 140', () => {
  const text = 'You may discard a Stadium in play. If you do, this attack does 140 more damage.';
  const { state } = board('Cetitan ex', { name: 'Crushing Press', damage: '140+', text });
  state.stadium = trainer('Artazon', { type: 'Trainer', subtypes: ['Stadium'], ownerId: 'p2' });
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOf(paid), 280);
  assert.equal(paid.state.stadium, null);
  const { state: bare } = board('Cetitan ex', { name: 'Crushing Press', damage: '140+', text });
  const noStadium = attack(bare);
  assert.equal(noStadium.state.pendingChoice, null, 'no Stadium, no offer');
  assert.equal(damageOf(noStadium), 140);
});

test('Hisuian Lilligant VSTAR Parallel Spin (Astral Radiance 190): the Energy goes to hand once', () => {
  const text =
    'You may put an Energy attached to this Pokémon into your hand. If you do, this attack does 100 more damage.';
  assert.deepEqual(parseAttackSteps(text), { before: [], after: [], handlesSearch: false });
  const { state, energyIds } = board('Hisuian Lilligant VSTAR', { name: 'Parallel Spin', damage: '130+', text }, {
    attached: ['Grass', 'Grass'],
  });
  const paid = choose(attack(state), [energyIds[0]]);
  assert.equal(paid.error, null);
  assert.equal(paid.state.pendingChoice, null, 'no second return prompt after damage');
  assert.equal(damageOf(paid), 230);
  assert.ok(paid.state.players.p1.zones.hand.some((c) => c.instanceId === energyIds[0]));
});

test('Slaking Dynamic Swing (Unified Minds 170): +100 now, +100 taken next turn', () => {
  const text =
    "You may do 100 more damage. If you do, during your opponent's next turn, this Pokémon takes 100 more damage from attacks (after applying Weakness and Resistance).";
  const { state } = board('Slaking', { name: 'Dynamic Swing', damage: '100+', text });
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOf(paid), 200);
  assert.ok(paid.events.some((e) => e.type === 'attackMarkerAdded'));
  const { state: again } = board('Slaking', { name: 'Dynamic Swing', damage: '100+', text });
  const declined = choose(attack(again), [2]);
  assert.equal(damageOf(declined), 100);
  assert.ok(!declined.events.some((e) => e.type === 'attackMarkerAdded'));
});

test('Copperajah Nasal Lariat (Shrouded Fable 042): +100 only with the next-turn attack lock', () => {
  const text = "You may do 100 more damage. If you do, during your next turn, this Pokémon can't attack.";
  const { state, attacker } = board('Copperajah', { name: 'Nasal Lariat', damage: '130+', text });
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOf(paid), 230);
  const locked = paid.state.players.p1.zones.active.find((c) => c.instanceId === attacker.instanceId);
  assert.equal(locked.cannotAttackUntilTurn, 7, "can't attack during p1's next turn (turn 7)");
  const { state: again, attacker: fresh } = board('Copperajah', { name: 'Nasal Lariat', damage: '130+', text });
  const declined = choose(attack(again), [2]);
  assert.equal(damageOf(declined), 130);
  const free = declined.state.players.p1.zones.active.find((c) => c.instanceId === fresh.instanceId);
  assert.ok(!free.cannotAttackUntilTurn, 'declining the offer sets no lock');
});

test('Banette Loneliness (Platinum 19): the bonus also needs a hand with no Pokémon', () => {
  const text =
    "You may show your hand to your opponent. If you do and if you don't have any Pokémon in your hand, this attack does 30 damage plus 30 more damage.";
  const empty = board('Banette', { name: 'Loneliness', damage: '30+', text }, { hand: [trainer('Potion')] });
  assert.equal(damageOf(choose(attack(empty.state), [1])), 60);
  const withMon = board('Banette', { name: 'Loneliness', damage: '30+', text }, { hand: [mon('Shuppet')] });
  assert.equal(damageOf(choose(attack(withMon.state), [1])), 30);
});

test('Yanmega Wind Return (Supreme Victors 14): scales by the Energy returned', () => {
  const text =
    'You may return all {G} Energy attached to Yanmega to your hand. If you do, this attack does 20 damage plus 20 more damage for each Energy card you returned.';
  const { state } = board('Yanmega', { name: 'Wind Return', damage: '20+', text }, { attached: ['Grass', 'Grass', 'Water'] });
  const paid = choose(attack(state), [1]);
  assert.equal(paid.error, null);
  assert.equal(damageOf(paid), 60);
  const declined = board('Yanmega', { name: 'Wind Return', damage: '20+', text }, { attached: ['Grass'] });
  assert.equal(damageOf(choose(attack(declined.state), [2])), 20);
});

test('Meganium Bouncy Move (Unseen Forces 9): counters placed on itself scale the damage', () => {
  const text =
    'You may put up to 5 damage counters on Meganium. If you do, this attack does 50 damage plus 10 more damage for each damage counter you put on Meganium in this way.';
  const { state, attacker } = board('Meganium', { name: 'Bouncy Move', damage: '50+', text });
  const paid = choose(attack(state), [4]); // option k+1 → 3 counters
  assert.equal(paid.error, null);
  assert.equal(damageOf(paid), 80);
  assert.equal(paid.state.players.p1.zones.active.find((c) => c.instanceId === attacker.instanceId).damage, 30);
});

test('clause reader: named attackers, typed Energy, and per-card discards it leaves alone', () => {
  assert.deepEqual(
    optionalCostBonusClause(
      'You may discard an Energy card attached to Salamence. If you do, this attack does 40 damage plus 20 more damage.',
      'Salamence'
    ),
    {
      cost: { kind: 'discardEnergy', count: 1, energyType: null, basicOnly: false },
      bonus: 20,
      extraCondition: null,
      perEach: false,
      consumed: ['you may discard an energy card attached to this pokémon'],
    }
  );
  // Deoxys ex Psyburst (Deoxys 98): the "for each" scaling is gated on the paid cost.
  assert.equal(
    optionalCostBonusClause(
      'You may discard 2 Energy attached to Deoxys ex. If you do, this attack does 50 damage plus 20 more damage for each Energy attached to the Defending Pokémon.',
      'Deoxys ex'
    ).perEach,
    true
  );
  // "up to" / "as many as you like" discards are the discard-scaling parser's.
  assert.equal(
    optionalCostBonusClause(
      'You may discard up to 2 Energy from this Pokémon. If you do, this attack does 120 more damage for each card you discarded in this way.'
    ),
    null
  );
});
