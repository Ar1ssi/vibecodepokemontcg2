// Design 036 A11/A12: own-hand discards (costs, "If you do" chains, counted discards) and the
// Lost Zone clauses (from a hand or discard pile, this Pokémon, the opponent's Active, and the
// "Lost Zone instead of discarding it" Knock Out replacement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

const parse = (text, selfName = 'Tropius') => {
  const { before, after } = parseAttackSteps(text, { selfName });
  const strip = ({ attackName, ...step }) => step;
  return { before: before.map(strip), after: after.map(strip) };
};

test('parser: a chained draw runs only after the hand discard', () => {
  assert.deepEqual(parse('Discard a card from your hand. If you do, draw 3 cards.'), {
    before: [],
    after: [
      { type: 'atkDiscardOwnHand', count: 1 },
      { type: 'atkDraw', count: 3, requiresHandCost: true },
    ],
  });
});

test('parser: a required hand cost and a counted discard run before damage', () => {
  assert.deepEqual(
    parse("Discard 2 cards from your hand. (If you can't discard 2 cards from your hand, this attack does nothing.)"),
    { before: [{ type: 'atkDiscardOwnHand', count: 2 }], after: [] }
  );
  assert.deepEqual(parse('You may discard a card from your hand. If you do, this attack does 70 more damage.'), {
    before: [{ type: 'atkDiscardOwnHand', count: 1, optional: true, countsForDamage: true }],
    after: [],
  });
  assert.deepEqual(
    parse('Discard your hand. If you discarded 5 or more cards in this way, this attack does 150 more damage.'),
    { before: [{ type: 'atkDiscardOwnHand', count: 'all', countsForDamage: true }], after: [] }
  );
});

test('parser: Lost Zone wordings', () => {
  const types = (text, selfName) => parse(text, selfName).after.map((step) => step.type);
  assert.deepEqual(types("Put a random card from your opponent's hand in the Lost Zone."), ['atkLostZoneOppHandRandom']);
  assert.deepEqual(types('Put this Pokémon and all cards attached to it in the Lost Zone.'), ['atkLostZoneSelf']);
  assert.deepEqual(types("Put your opponent's Active Pokémon and all cards attached to it in the Lost Zone."), [
    'atkLostZoneOppActive',
  ]);
  assert.deepEqual(types("Put 2 cards from your opponent's discard pile in the Lost Zone."), ['atkLostZoneOppDiscard']);
  assert.deepEqual(parse('Put all Energy attached to Magcargo in the Lost Zone.', 'Magcargo').after, [
    { type: 'atkLostZoneEnergy', from: 'self', all: true },
  ]);
  assert.deepEqual(
    parse(
      "Choose 1 Pokémon from your hand and put it in the Lost Zone. (If you can't put a Pokémon in the Lost Zone, this attack does nothing.)"
    ).before,
    [{ type: 'atkLostZoneFromHand', count: 1, what: 'pokemon' }]
  );
});

// ── game flow ────────────────────────────────────────────────────────────────

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const trainer = (instanceId) => createCard({ instanceId, name: 'Potion', supertype: 'Trainer' });

function board({ text, damage = '', hand = [], oppHand = [], oppBench = [], attached = [], defender = {} }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Attacker', hp: 200, attacks: [{ name: 'Hit', cost: [], damage, text }] })
  );
  state.players.p1.zones.bench.push(pokemon({ instanceId: 2, name: 'Backup', hp: 60 }));
  for (const card of attached) state.players.p1.zones.active.push({ ...card, attachedTo: 1 });
  state.players.p1.zones.hand.push(...hand);
  state.players.p2.zones.hand.push(...oppHand);
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 200, ...defender }));
  for (const props of oppBench) state.players.p2.zones.bench.push(pokemon(props));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const rng = () => createRng(5);
const attack = (state) => {
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng());
  assert.ok(!res.error, res.error);
  return res.state;
};
const choose = (state, selection) => {
  const res = applyCommand(
    state,
    { type: 'resolveChoice', payload: { choiceId: state.pendingChoice.choiceId, selection }, playerId: 'p1' },
    rng()
  );
  assert.ok(!res.error, res.error);
  return res.state;
};
const ids = (cards) => cards.map((c) => c.instanceId);

const FRUIT_BEARING = 'Discard a card from your hand. If you do, draw 3 cards.';

test('Fruit Bearing: the chosen card is discarded, then 3 cards are drawn', () => {
  const asked = attack(board({ text: FRUIT_BEARING, hand: [trainer(50), trainer(51)] }));
  assert.ok(asked.pendingChoice, 'two cards in hand: choose one');
  const state = choose(asked, [50]);
  const p1 = state.players.p1.zones;
  assert.ok(ids(p1.discard).includes(50));
  assert.ok(!ids(p1.discard).includes(51));
  assert.ok(ids(p1.hand).includes(51));
  assert.equal(p1.deck.length, 3, '3 of the 6 deck cards were drawn');
});

test('Fruit Bearing with an empty hand draws nothing', () => {
  const state = attack(board({ text: FRUIT_BEARING }));
  assert.equal(state.players.p1.zones.deck.length, 6);
});

test('Tail Spank is refused without 2 cards in hand, and pays them before damage', () => {
  const text =
    "Discard 2 cards from your hand. (If you can't discard 2 cards from your hand, this attack does nothing.)";
  const short = board({ text, damage: '30', hand: [trainer(50)] });
  const verdict = validateLegality(short, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(verdict.allowed, false);

  const state = attack(board({ text, damage: '30', hand: [trainer(50), trainer(51)] }));
  assert.deepEqual(ids(state.players.p1.zones.discard).sort(), [50, 51]);
  assert.equal(state.players.p2.zones.active[0].damage, 30);
});

test('Spill Out counts the discarded hand for its bonus', () => {
  const text = 'Discard your hand. If you discarded 5 or more cards in this way, this attack does 150 more damage.';
  const big = attack(board({ text, damage: '30', hand: [50, 51, 52, 53, 54].map(trainer) }));
  assert.equal(big.players.p1.zones.hand.length, 0);
  assert.equal(big.players.p2.zones.active[0].damage, 180);

  const small = attack(board({ text, damage: '30', hand: [50, 51].map(trainer) }));
  assert.equal(small.players.p2.zones.active[0].damage, 30);
});

test('Lost Claw puts a random card from the opponent\'s hand in the Lost Zone', () => {
  const state = attack(
    board({ text: "Put a random card from your opponent's hand in the Lost Zone.", oppHand: [trainer(70), trainer(71)] })
  );
  const kept = ids(state.players.p2.zones.hand).filter((id) => id === 70 || id === 71);
  assert.equal(kept.length, 1);
  assert.equal(state.players.p2.zones.lostZone.length, 1);
});

test('Lost Blast puts this Pokémon and its attached cards in the Lost Zone', () => {
  const energy = createCard({ instanceId: 40, name: 'Grass Energy', supertype: 'Energy', subtypes: ['Basic'] });
  const state = attack(
    board({ text: 'Put this Pokémon and all cards attached to it in the Lost Zone.', damage: '120', attached: [energy] })
  );
  assert.deepEqual(ids(state.players.p1.zones.lostZone).sort(), [1, 40]);
  assert.ok(!ids(state.players.p1.zones.discard).includes(1));
  assert.equal(state.players.p2.zones.active[0].damage, 120);
});

test('Lost Purge-GX puts the opponent\'s Active in the Lost Zone without a Prize', () => {
  const state = attack(
    board({
      text: "Put your opponent's Active Pokémon and all cards attached to it in the Lost Zone.",
      oppBench: [{ instanceId: 21, name: 'Bench', hp: 60 }],
    })
  );
  assert.deepEqual(ids(state.players.p2.zones.lostZone), [20]);
  assert.equal(state.players.p1.flags?.prizesOwed, undefined);
});

test('Broken-space Blow sends a Knocked Out Defending Pokémon to the Lost Zone', () => {
  const text =
    'If the Defending Pokémon is Knocked Out by this attack, put the Defending Pokémon and all cards attached to it in the Lost Zone instead of the discard pile.';
  const state = attack(
    board({ text, damage: '80', defender: { hp: 60 }, oppBench: [{ instanceId: 21, name: 'Bench', hp: 60 }] })
  );
  assert.ok(ids(state.players.p2.zones.lostZone || []).includes(20));
  assert.ok(!ids(state.players.p2.zones.discard).includes(20));
  assert.equal(state.players.p1.flags?.prizesOwed, 1);

  const plain = attack(
    board({ text: '', damage: '80', defender: { hp: 60 }, oppBench: [{ instanceId: 21, name: 'Bench', hp: 60 }] })
  );
  assert.ok(ids(plain.players.p2.zones.discard).includes(20), 'without the clause it is discarded');
});

test('Vicious Claw is refused without a Pokémon in hand', () => {
  const text =
    "Choose 1 Pokémon from your hand and put it in the Lost Zone. (If you can't put a Pokémon in the Lost Zone, this attack does nothing.)";
  const verdict = validateLegality(board({ text, hand: [trainer(50)] }), {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(verdict.allowed, false);
});
