// Mega Charizard X ex / Inferno X (discard-to-scale Energy picker) and Meowth ex /
// Tuck Tail (return the attacker and its attachments to hand) on the authoritative path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', ...props });
const energy = (instanceId, attachedTo, name = 'Basic Fire Energy', types = ['Fire']) =>
  createCard({ instanceId, name, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'], types, attachedTo });

const INFERNO_X = {
  name: 'Inferno X',
  cost: [],
  damage: 90,
  text: 'Discard any amount of {R} Energy from among your Pokémon, and this attack does 90 damage for each card you discarded in this way.',
};
const TUCK_TAIL = {
  name: 'Tuck Tail',
  cost: [],
  damage: 60,
  text: 'Put this Pokémon and all attached cards into your hand.',
};

function board({ attack, bench = true }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Attacker', hp: 360, attacks: [attack] }),
    energy(2, 1),
    energy(3, 1, 'Basic Water Energy', ['Water'])
  );
  if (bench) {
    state.players.p1.zones.bench.push(
      pokemon({ instanceId: 10, name: 'Charmander', hp: 70 }),
      energy(11, 10),
      pokemon({ instanceId: 12, name: 'Charmeleon', hp: 90 })
    );
  }
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 400 }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 21, name: 'Opp Bench', hp: 60 }));
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(
        createCard({ instanceId: 1000 + (playerId === 'p1' ? 0 : 50) + i, name: 'Prize' })
      );
      // A deck so the turn hand-off draw does not end the game by deck-out.
      state.players[playerId].zones.deck.push(
        createCard({ instanceId: 2000 + (playerId === 'p1' ? 0 : 50) + i, name: 'Deck Card' })
      );
    }
  }
  return state;
}

const attack = (state) => applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
const choose = (state, selection) =>
  applyCommand(state, {
    type: 'resolveChoice',
    payload: { choiceId: state.pendingChoice.choiceId, selection },
    playerId: 'p1',
  });
const damageOf = (state, instanceId) =>
  state.players.p2.zones.active.find((c) => c.instanceId === instanceId)?.damage || 0;

test('Inferno X offers only {R} Energy from all of your Pokémon', () => {
  const res = attack(board({ attack: INFERNO_X }));
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'expected an Energy discard choice');
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [2, 11]);
  assert.equal(choice.min, 0);
  assert.equal(choice.max, 2);
  assert.equal(damageOf(res.state, 20), 0, 'no damage before the choice');
});

test('Inferno X discards the chosen Energy and deals 90 per card', () => {
  const pending = attack(board({ attack: INFERNO_X }));
  const res = choose(pending.state, [2, 11]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 180);
  const discard = res.state.players.p1.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(discard, [2, 11]);
  assert.equal(res.state.turn.player, 'p2', 'turn ends after the attack');
});

test('Inferno X with nothing chosen deals 0', () => {
  const pending = attack(board({ attack: INFERNO_X }));
  const res = choose(pending.state, []);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 0);
  assert.equal(res.state.players.p1.zones.discard.length, 0);
});

test('Tuck Tail deals damage then puts the attacker and attachments into hand', () => {
  const res = attack(board({ attack: TUCK_TAIL }));
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 60);
  const hand = res.state.players.p1.zones.hand.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(hand, [1, 2, 3]);
  assert.ok(res.state.players.p1.zones.hand.every((c) => !c.attachedTo));
  assert.ok(!res.state.players.p1.zones.active.some((c) => [1, 2, 3].includes(c.instanceId)));
  // Two Benched Pokémon: p1 picks the new Active.
  assert.equal(res.state.pendingChoice?.player, 'p1');
});

test('Tuck Tail with an empty Bench loses the game', () => {
  const res = attack(board({ attack: TUCK_TAIL, bench: false }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.winner, 'p2');
});

const GIGA_HAMMER = {
  name: 'Blastoise Hand Discard',
  cost: [],
  damage: 140,
  text: 'Discard up to 2 Basic {W} Energy cards from your hand. This attack does 140 damage for each card you discarded in this way.',
};

function handBoard() {
  const state = board({ attack: GIGA_HAMMER });
  state.players.p1.zones.hand.push(
    energy(30, null, 'Basic Water Energy', ['Water']),
    energy(31, null, 'Basic Water Energy', ['Water']),
    energy(32, null, 'Basic Water Energy', ['Water']),
    energy(33, null),
    createCard({ instanceId: 34, name: 'Ultra Ball', supertype: 'Trainer', type: 'Trainer' })
  );
  return state;
}

test('hand discard-to-scale offers only matching Energy from hand, capped at the printed max', () => {
  const res = attack(handBoard());
  assert.ok(!res.error, res.error);
  const choice = res.state.pendingChoice;
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [30, 31, 32]);
  assert.equal(choice.max, 2);
});

test('hand discard-to-scale discards from hand and scales damage', () => {
  const pending = attack(handBoard());
  const res = choose(pending.state, [30, 32]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 280);
  const discard = res.state.players.p1.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(discard, [30, 32]);
  assert.ok(res.state.players.p1.zones.active.some((c) => c.instanceId === 3), 'attached Energy untouched');
});

test('hand discard-to-scale with no matching Energy in hand deals 0 without a choice', () => {
  const res = attack(board({ attack: GIGA_HAMMER }));
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res.state, 20), 0);
});

test('"N more damage for each card" adds to the printed base (Mega Clefable ex)', () => {
  const state = board({
    attack: {
      name: 'Clefable Hand Discard',
      cost: [],
      damage: 40,
      text: 'You may discard up to 4 Energy cards from your hand, and this attack does 40 more damage for each card you discarded in this way.',
    },
  });
  state.players.p1.zones.hand.push(energy(40, null), energy(41, null), energy(42, null));
  const pending = attack(state);
  assert.equal(pending.state.pendingChoice.max, 3);
  const res = choose(pending.state, [40, 41]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 120);
});

test('Groudon ex: "as many Energy cards as you like" from hand, 50 plus 10 each ("50+" printed)', () => {
  const state = board({
    attack: {
      name: 'Crushing Mantle',
      cost: [],
      damage: '50+',
      text: 'You may discard from your hand as many Energy cards as you like. If you do, this attack does 50 damage plus 10 more damage for each Energy card you discarded.',
    },
  });
  state.players.p1.zones.hand.push(energy(50, null), energy(51, null), energy(52, null));
  const pending = attack(state);
  assert.equal(pending.state.pendingChoice.max, 3);
  const res = choose(pending.state, [50, 51, 52]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 80);
});

const TRICOLOR_PUMP = {
  name: 'Tricolor Pump',
  cost: [],
  damage: 0,
  text: "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)",
};

test('Wugtrio ex: discarding 2 from hand snipes the chosen Pokémon for 120', () => {
  const state = board({ attack: TRICOLOR_PUMP });
  state.players.p1.zones.hand.push(energy(60, null), energy(61, null));
  const pending = attack(state);
  const targetChoice = choose(pending.state, [60, 61]).state;
  assert.deepEqual(
    targetChoice.pendingChoice.options.map((o) => o.instanceId).sort((a, b) => a - b),
    [20, 21]
  );
  const res = choose(targetChoice, [21]);
  assert.ok(!res.error, res.error);
  const bench = res.state.players.p2.zones.bench.find((c) => c.instanceId === 21);
  // 120 knocks out the 60-HP Benched Pokémon.
  assert.ok(!bench, 'Benched Pokémon should be Knocked Out');
  assert.equal(damageOf(res.state, 20), 0);
});

test('Wugtrio ex: discarding nothing does no damage and asks for no target', () => {
  const state = board({ attack: TRICOLOR_PUMP });
  state.players.p1.zones.hand.push(energy(60, null));
  const pending = attack(state);
  const res = choose(pending.state, []);
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res.state, 20), 0);
  assert.ok(res.state.players.p2.zones.bench.some((c) => c.instanceId === 21 && !c.damage));
});

// ── Deck mill: discard from the top of the deck, count the printed kind ──
const trainer = (instanceId, name, trainerType = 'Item') =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Trainer', trainerType, subtypes: [trainerType] });

function millBoard(attackDef, p1Deck, p2Deck = null) {
  const state = board({ attack: attackDef });
  state.players.p1.zones.deck = [...p1Deck, ...state.players.p1.zones.deck];
  if (p2Deck) state.players.p2.zones.deck = [...p2Deck, ...state.players.p2.zones.deck];
  return state;
}

test('Flareon VMAX: discards the top 5 and deals 100 per Energy among them', () => {
  const state = millBoard(
    {
      name: 'Max Detonation',
      cost: [],
      damage: 0,
      text: 'Discard the top 5 cards of your deck. This attack does 100 damage for each Energy card you discarded in this way.',
    },
    [energy(70, null), trainer(71, 'Ultra Ball'), energy(72, null), trainer(73, 'Potion'), trainer(74, 'Judge', 'Supporter')]
  );
  const res = attack(state);
  assert.ok(!res.error, res.error);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(damageOf(res.state, 20), 200);
  const discard = res.state.players.p1.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(discard, [70, 71, 72, 73, 74]);
});

test('Radiant Steelix: mills until 1 card remains, printed + 30 per Energy', () => {
  const state = board({
    attack: {
      name: 'Gigaton Steel',
      cost: [],
      damage: 30,
      text: 'Discard cards from the top of your deck until only 1 card remains. This attack does 30 more damage for each Energy card you discarded in this way.',
    },
  });
  state.players.p1.zones.deck = [energy(80, null), energy(81, null), trainer(82, 'Potion')];
  const res = attack(state);
  assert.ok(!res.error, res.error);
  assert.deepEqual(res.state.players.p1.zones.deck.map((c) => c.instanceId), [82]);
  assert.equal(damageOf(res.state, 20), 90);
});

test('Camerupt ex: mills the top card of each deck, 60 plus 20 per Energy', () => {
  const state = millBoard(
    {
      name: 'Magma Burn',
      cost: [],
      damage: '60+',
      text: 'Each player discards the top card of his or her deck. This attack does 60 damage plus 20 more damage for each Energy card discarded in this way.',
    },
    [energy(90, null)],
    [energy(91, null, 'Basic Water Energy', ['Water'])]
  );
  const res = attack(state);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 100);
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.instanceId === 91));
});

test('Simisear VSTAR: "up to 5" asks for a count, then scales by cards discarded', () => {
  const state = millBoard(
    {
      name: 'Burning Rondo',
      cost: [],
      damage: 20,
      text: 'You may discard up to 5 cards from the top of your deck. This attack does 40 more damage for each card you discarded in this way.',
    },
    [trainer(100, 'A'), trainer(101, 'B'), trainer(102, 'C')]
  );
  const pending = attack(state);
  const choice = pending.state.pendingChoice;
  assert.ok(choice, 'expected a count choice');
  assert.equal(choice.options.length, 6, 'deck of 9 caps at 5: options 0..5');
  const res = choose(pending.state, [4]); // option id 4 = discard 3
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 140);
  assert.equal(res.state.players.p1.zones.discard.length, 3);
});

test('M Camerupt-EX: declining the optional mill discards nothing and adds nothing', () => {
  const state = millBoard(
    {
      name: 'Mega Eruption',
      cost: [],
      damage: 40,
      text: "You may discard the top 3 cards of each player's deck. If you do, this attack does 40 more damage for each Energy card you discarded in this way.",
    },
    [energy(110, null)]
  );
  const pending = attack(state);
  assert.deepEqual(pending.state.pendingChoice.options.map((o) => o.instanceId), [1, 4]);
  const res = choose(pending.state, [1]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 40);
  assert.equal(res.state.players.p1.zones.discard.length, 0);
});

test('Wugtrio ex: sniping the Active applies Weakness', () => {
  const state = board({ attack: TRICOLOR_PUMP });
  state.players.p1.zones.active[0].types = ['Water'];
  state.players.p2.zones.active[0].weakness = { type: 'Water', value: 2 };
  state.players.p1.zones.hand.push(energy(60, null), energy(61, null));
  const targetChoice = choose(attack(state).state, [60, 61]).state;
  const res = choose(targetChoice, [20]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 240);
});

test('Raikou: mills 3, 50 plus 10 per {L} Energy, then attaches them to the chosen Pokémon', () => {
  const state = millBoard(
    {
      name: 'Lightning Rider',
      cost: [],
      damage: '50+',
      text: 'Discard 3 cards from the top of your deck. This attack does 50 damage plus 10 more damage for each {L} Energy card you discarded. Then, attach those {L} Energy cards to 1 of your Pokémon.',
    },
    [
      energy(120, null, 'Basic Lightning Energy', ['Lightning']),
      trainer(121, 'Potion'),
      energy(122, null, 'Basic Lightning Energy', ['Lightning']),
    ]
  );
  const pending = attack(state);
  assert.ok(!pending.error, pending.error);
  assert.equal(damageOf(pending.state, 20), 70);
  assert.equal(pending.state.turn.player, 'p1', 'turn held open for the attach choice');
  const res = choose(pending.state, [12]);
  assert.ok(!res.error, res.error);
  const attached = res.state.players.p1.zones.bench
    .filter((c) => c.attachedTo === 12)
    .map((c) => c.instanceId)
    .sort((a, b) => a - b);
  assert.deepEqual(attached, [120, 122]);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === 121));
  assert.equal(res.state.turn.player, 'p2');
});

test('Palossand-GX: pick Pokémon from the top 13 of the opponent deck, 60 each, rest shuffled', () => {
  const state = millBoard(
    {
      name: 'Barren Sands GX',
      cost: [],
      damage: 0,
      text: "Look at the top 13 cards of your opponent's deck and discard any number of Pokémon you find there. This attack does 60 damage for each card you discarded in this way. Your opponent shuffles the other cards back into their deck. (You can't use more than 1 GX attack in a game.)",
    },
    [],
    [pokemon({ instanceId: 130, name: 'Froakie', hp: 60 }), trainer(131, 'Potion'), pokemon({ instanceId: 132, name: 'Staryu', hp: 60 })]
  );
  const pending = attack(state);
  const choice = pending.state.pendingChoice;
  assert.deepEqual(choice.options.map((o) => o.instanceId).sort((a, b) => a - b), [130, 132]);
  const res = choose(pending.state, [130, 132]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 120);
  const oppDiscard = res.state.players.p2.zones.discard.map((c) => c.instanceId).sort((a, b) => a - b);
  assert.deepEqual(oppDiscard, [130, 132]);
});

test('Flygon ex: discards only React Energy from itself, 40 plus 30 each', () => {
  const state = board({
    attack: {
      name: 'Sand Storm',
      cost: [],
      damage: '40+',
      text: 'You may discard any number of React Energy cards attached to Flygon ex. If you do, this attack does 40 damage plus 30 more damage for each Energy card you discarded.',
    },
  });
  state.players.p1.zones.active.push(
    createCard({ instanceId: 140, name: 'React Energy', supertype: 'Energy', type: 'Energy', subtypes: ['Special'], attachedTo: 1 }),
    createCard({ instanceId: 141, name: 'React Energy', supertype: 'Energy', type: 'Energy', subtypes: ['Special'], attachedTo: 1 })
  );
  const pending = attack(state);
  assert.deepEqual(pending.state.pendingChoice.options.map((o) => o.instanceId).sort((a, b) => a - b), [140, 141]);
  const res = choose(pending.state, [140, 141]);
  assert.ok(!res.error, res.error);
  assert.equal(damageOf(res.state, 20), 100);
});

test('Aura Jab: attaches up to 3 discarded {F} Energy to Benched Pokémon one pick at a time', () => {
  const state = board({
    attack: {
      name: 'Aura Jab',
      cost: [],
      damage: 130,
      text: 'Attach up to 3 Basic {F} Energy cards from your discard pile to your Benched Pokémon in any way you like.',
    },
  });
  state.players.p1.zones.discard.push(
    energy(60, null, 'Basic Fighting Energy', ['Fighting']),
    energy(61, null, 'Basic Fighting Energy', ['Fighting']),
    energy(62, null, 'Basic Fighting Energy', ['Fighting']),
    energy(63, null, 'Basic Water Energy', ['Water'])
  );
  const first = attack(state);
  assert.ok(!first.error, first.error);
  assert.equal(damageOf(first.state, 20), 130);
  assert.equal(first.state.turn.player, 'p1', 'turn held open for the attach picks');
  assert.deepEqual(first.state.pendingChoice.options.map((o) => o.instanceId).sort((a, b) => a - b), [10, 12]);
  assert.equal(first.state.pendingChoice.min, 0);
  const second = choose(first.state, [10]);
  assert.ok(!second.error, second.error);
  const third = choose(second.state, [12]);
  assert.ok(!third.error, third.error);
  const last = choose(third.state, [12]);
  assert.ok(!last.error, last.error);
  const onBench = (id) => last.state.players.p1.zones.bench.filter((c) => c.attachedTo === id).map((c) => c.instanceId);
  assert.deepEqual(onBench(10).filter((i) => i >= 60), [60]);
  assert.deepEqual(onBench(12).sort((a, b) => a - b), [61, 62]);
  assert.deepEqual(last.state.players.p1.zones.discard.map((c) => c.instanceId), [63]);
  assert.equal(last.state.turn.player, 'p2');
});

test('Aura Jab: choosing nothing stops early and ends the turn', () => {
  const state = board({
    attack: {
      name: 'Aura Jab',
      cost: [],
      damage: 130,
      text: 'Attach up to 3 Basic {F} Energy cards from your discard pile to your Benched Pokémon in any way you like.',
    },
  });
  state.players.p1.zones.discard.push(energy(60, null, 'Basic Fighting Energy', ['Fighting']));
  const res = choose(attack(state).state, []);
  assert.ok(!res.error, res.error);
  assert.equal(res.state.players.p1.zones.discard.length, 1);
  assert.equal(res.state.turn.player, 'p2');
});
