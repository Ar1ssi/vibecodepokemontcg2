// Reveal-hand and shuffle-cost attacks on the server (design 031, I118): the opponent's
// hand is revealed and acted on, and hand/deck shuffles run as attack steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { addCondition } from '../rules/special-conditions.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const energy = (type = 'Fire') =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
  });
const item = (name) => createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Item' });
const supporter = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Supporter', trainerType: 'Supporter' });

/** p1's Active attacks with `text`; `setup` shapes the board before the attack. */
function board(text, { name = 'Attacker', damage = '0', setup = () => {}, seed = 5 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'atk-reveal', seed, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon(name, { hp: 300, attacks: [{ name: 'Test Attack', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 900 });
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

function choose(res, selection, rng) {
  const next = applyCommand(
    res.state,
    {
      type: 'resolveChoice',
      playerId: res.state.pendingChoice.player,
      payload: { choiceId: res.state.pendingChoice.choiceId, selection },
    },
    rng
  );
  assert.equal(next.error, null);
  return next;
}

const zone = (res, pid, name) => res.state.players[pid].zones[name];
const names = (cards) => cards.map((c) => c.name);
const handSetup = (...cards) => ({ p2 }) => p2.zones.hand.push(...cards);
const defenderDamage = (res) => zone(res, 'p2', 'active').find((c) => c.name === 'Defender').damage || 0;

// ── parser ──────────────────────────────────────────────────────────────────

test('parseAttackSteps: every printed reveal-hand follow-up maps to one atkRevealOppHand step', () => {
  const cases = [
    ['Your opponent reveals their hand.', undefined],
    ['Your opponent reveals his or her hand.', undefined],
    ['Your opponent reveals their hand, and you discard a card you find there.', { action: 'discard', count: 1 }],
    ['Your opponent reveals their hand. Discard a card you find there.', { action: 'discard', count: 1 }],
    [
      'Your opponent reveals their hand. Discard a Trainer card you find there.',
      { action: 'discard', count: 1, filter: 'trainer' },
    ],
    [
      'Your opponent reveals their hand. Discard all Supporter cards you find there. (You can\'t use more than 1 GX attack in a game.)',
      { action: 'discard', count: 'all', filter: 'supporter' },
    ],
    ['Your opponent reveals their hand. Discard 2 cards from it.', { action: 'discard', count: 2 }],
    [
      'Your opponent reveals their hand. Choose a card you find there and put it on the bottom of their deck.',
      { action: 'deckBottom', count: 1 },
    ],
    [
      'Your opponent reveals their hand. Add a card you find there to their Prize cards face down.',
      { action: 'prize', count: 1 },
    ],
  ];
  for (const [text, then] of cases) {
    const parsed = parseAttackSteps(text);
    assert.deepEqual(parsed.after, [{ type: 'atkRevealOppHand', ...(then ? { then } : {}) }], text);
  }
});

test('parseAttackSteps: the reveal keeps a following damage sentence out of its step', () => {
  const parsed = parseAttackSteps(
    'Your opponent reveals their hand. This attack does 50 damage for each Trainer card you find there.'
  );
  assert.deepEqual(parsed.after, [{ type: 'atkRevealOppHand' }]);
});

test('parseAttackSteps: shuffle-cost wordings', () => {
  const steps = (text, selfName) => parseAttackSteps(text, { selfName }).after;
  assert.deepEqual(
    steps('You may shuffle Greninja-GX and all cards attached to it into your deck.', 'Greninja-GX'),
    [{ type: 'atkShuffleSelf', optional: true }]
  );
  assert.deepEqual(
    steps('Shuffle your hand into your deck. Then, draw a number of cards equal to the number of cards in your opponent\'s hand.'),
    [{ type: 'atkShuffleHandIntoDeck' }, { type: 'atkDraw', countFrom: 'opponentHand' }]
  );
  assert.deepEqual(steps('Shuffle your hand into your deck. Draw up to 5 cards.'), [
    { type: 'atkShuffleHandIntoDeck' },
    { type: 'atkDraw', count: 5 },
  ]);
  assert.deepEqual(
    steps("Choose 2 random cards from your opponent's hand. Your opponent reveals those cards and shuffles them into their deck."),
    [{ type: 'atkOppHandRandomToDeck', count: 2 }]
  );
  assert.deepEqual(
    steps(
      "Choose 1 card from your opponent's hand without looking. Look at the card you chose, then have your opponent shuffle that card into his or her deck."
    ),
    [{ type: 'atkOppHandRandomToDeck', count: 1 }]
  );
  assert.deepEqual(
    steps("If your opponent's Active Pokémon is Asleep, your opponent shuffles all Energy from it into their deck."),
    [{ type: 'atkShuffleOppActiveEnergy', condition: 'Asleep' }]
  );
});

// ── reveal-hand ─────────────────────────────────────────────────────────────

test('attack: Fearsome Shadow reveals the whole opponent hand', () => {
  const b = board('Your opponent reveals their hand.', { setup: handSetup(item('Nest Ball'), energy()) });
  const res = attack(b);
  const reveal = res.events.find((e) => e.type === 'cardsRevealed');
  assert.equal(reveal.playerId, 'p2');
  assert.deepEqual(names(reveal.cards), ['Nest Ball', 'Basic Fire Energy']);
});

test('attack: a reveal of an empty hand reveals 0 cards and a discard follow-up skips', () => {
  const b = board('Your opponent reveals their hand. Discard a card you find there.');
  const res = attack(b);
  assert.deepEqual(res.events.find((e) => e.type === 'cardsRevealed').cards, []);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(zone(res, 'p2', 'discard').length, 0);
});

test('attack: Fang Snipe discards the only Trainer without asking and keeps the Energy', () => {
  const b = board('Your opponent reveals their hand. Discard a Trainer card you find there.', {
    setup: handSetup(item('Nest Ball'), energy()),
  });
  const res = attack(b);
  assert.deepEqual(names(zone(res, 'p2', 'discard')), ['Nest Ball']);
  assert.ok(zone(res, 'p2', 'hand').some((c) => c.name === 'Basic Fire Energy'));
});

test('attack: Fang Snipe asks the attacker which Trainer when several match', () => {
  const b = board('Your opponent reveals their hand. Discard a Trainer card you find there.', {
    setup: handSetup(item('Nest Ball'), item('Ultra Ball'), energy()),
  });
  const res1 = attack(b);
  assert.equal(res1.state.pendingChoice.player, 'p1');
  const ultra = zone(res1, 'p2', 'hand').find((c) => c.name === 'Ultra Ball');
  const res2 = choose(res1, [ultra.instanceId], b.rng);
  assert.deepEqual(names(zone(res2, 'p2', 'discard')), ['Ultra Ball']);
});

test('attack: Big Eater-GX discards every Supporter and nothing else', () => {
  const b = board('Your opponent reveals their hand. Discard all Supporter cards you find there.', {
    setup: handSetup(supporter('Boss'), supporter('Iono'), item('Nest Ball')),
  });
  const res = attack(b);
  assert.deepEqual(names(zone(res, 'p2', 'discard')).sort(), ['Boss', 'Iono']);
});

test('attack: Unfair-GX discards the 2 chosen cards', () => {
  const b = board('Your opponent reveals their hand. Discard 2 cards from it.', {
    setup: handSetup(item('A'), item('B'), item('C')),
  });
  const res1 = attack(b);
  const [a, , c] = zone(res1, 'p2', 'hand');
  const res2 = choose(res1, [a.instanceId, c.instanceId], b.rng);
  assert.deepEqual(names(zone(res2, 'p2', 'discard')).sort(), ['A', 'C']);
});

test('attack: Max Jammer puts the chosen card on the bottom of the opponent deck', () => {
  const b = board(
    'Your opponent reveals their hand. Choose a card you find there and put it on the bottom of their deck.',
    { setup: handSetup(item('A'), item('B')) }
  );
  const res1 = attack(b);
  const picked = zone(res1, 'p2', 'hand').find((c) => c.name === 'B');
  const res2 = choose(res1, [picked.instanceId], b.rng);
  assert.equal(zone(res2, 'p2', 'deck').at(-1).instanceId, picked.instanceId);
});

test('attack: Lighting-GX adds the only card to the opponent Prize cards', () => {
  const b = board('Your opponent reveals their hand. Add a card you find there to their Prize cards face down.', {
    setup: handSetup(item('A')),
  });
  const res = attack(b);
  assert.equal(zone(res, 'p2', 'prizes').length, 7);
  assert.equal(zone(res, 'p2', 'prizes').at(-1).name, 'A');
});

test('attack: Poltergeist does 50 per Trainer in the opponent hand', () => {
  const b = board(
    'Your opponent reveals their hand. This attack does 50 damage for each Trainer card you find there.',
    { damage: '50×', setup: handSetup(item('A'), supporter('B'), energy()) }
  );
  assert.equal(defenderDamage(attack(b)), 100);
});

test('attack: Liberation-GX counts Energy cards only, not Trainers named "Energy"', () => {
  const b = board(
    'Your opponent reveals their hand. This attack does 120 damage for each Energy card you find there.',
    { damage: '120×', setup: handSetup(energy(), energy('Water'), item('Energy Retrieval')) }
  );
  assert.equal(defenderDamage(attack(b)), 240);
});

test('attack: Wonder Flare adds 40 per Energy card in the opponent hand to its base', () => {
  const b = board(
    "Your opponent reveals his or her hand. This attack does 40 more damage for each Energy card in your opponent's hand.",
    { damage: '40+', setup: handSetup(energy(), item('A')) }
  );
  assert.equal(defenderDamage(attack(b)), 80);
});

// ── shuffle-cost ────────────────────────────────────────────────────────────

test('attack: Hexed Mirror shuffles the hand away and draws as many as the opponent holds', () => {
  const b = board(
    "Shuffle your hand into your deck. Then, draw a number of cards equal to the number of cards in your opponent's hand.",
    {
      setup: ({ p1, p2 }) => {
        p1.zones.hand.push(item('Mine 1'), item('Mine 2'));
        p2.zones.hand.push(item('A'), item('B'), item('C'), item('D'));
      },
    }
  );
  const res = attack(b);
  assert.equal(zone(res, 'p1', 'hand').length, 4);
  assert.equal(zone(res, 'p1', 'deck').length, 8);
});

test('attack: Scattered Shower draws 5 after shuffling the hand in', () => {
  const b = board('Shuffle your hand into your deck. Draw up to 5 cards.', {
    setup: ({ p1 }) => p1.zones.hand.push(item('Mine 1')),
  });
  const res = attack(b);
  assert.equal(zone(res, 'p1', 'hand').length, 5);
  assert.equal(zone(res, 'p1', 'deck').length, 6);
});

test('attack: Night Watch shuffles 2 random opponent hand cards into their deck', () => {
  const b = board(
    "Choose 2 random cards from your opponent's hand. Your opponent reveals those cards and shuffles them into their deck.",
    { setup: handSetup(item('A'), item('B'), item('C')) }
  );
  const res = attack(b);
  const reveal = res.events.find((e) => e.type === 'cardsRevealed');
  assert.equal(reveal.cards.length, 2);
  const kept = zone(res, 'p2', 'hand').filter((c) => ['A', 'B', 'C'].includes(c.name));
  assert.equal(kept.length, 1);
});

test("attack: Dream's Touch shuffles the Asleep Active's Energy into the opponent deck", () => {
  const text = "If your opponent's Active Pokémon is Asleep, your opponent shuffles all Energy from it into their deck.";
  const withEnergy = (asleep) => ({ defender, p2 }) => {
    const e1 = energy();
    const e2 = energy();
    e1.attachedTo = defender.instanceId;
    e2.attachedTo = defender.instanceId;
    p2.zones.active.push(e1, e2);
    if (asleep) addCondition(defender, 'Asleep');
  };
  const asleep = attack(board(text, { setup: withEnergy(true) }));
  assert.equal(zone(asleep, 'p2', 'active').filter((c) => c.supertype === 'Energy').length, 0);
  const awake = attack(board(text, { setup: withEnergy(false) }));
  assert.equal(zone(awake, 'p2', 'active').filter((c) => c.supertype === 'Energy').length, 2);
});
