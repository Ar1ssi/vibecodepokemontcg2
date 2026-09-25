// Design 036 E: attacks that use a Supporter's effect, "for the rest of this game" effects and
// the Bench / coin-gated copy-attack wordings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';
import { parseCopyAttack } from '../rules/attack-copy.mjs';

const stepsOf = (text, selfName = 'Attacker') => {
  const { before, after } = parseAttackSteps(text, { selfName });
  return [...before, ...after].map(({ attackName, ...step }) => step);
};

const IMPERSONATION =
  'Discard a Supporter card from your hand. If you do, use the effect of that card as the effect of this attack.';
const PRIMATE_ACTING =
  "Choose a Supporter card from your opponent's discard pile and use the effect of that card as the effect of this attack.";
const SHAPESHIFTER =
  'Discard the top card of your deck, and if that card is a Supporter card, use the effect of that card as the effect of this attack.';
const ALTERED_CREATION =
  "For the rest of this game, your Pokémon's attacks do 30 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).";

test('parser: Supporter-effect and rest-of-game wordings', () => {
  assert.deepEqual(stepsOf(IMPERSONATION), [{ type: 'atkUseSupporter', source: 'hand', discard: true }]);
  assert.deepEqual(stepsOf(PRIMATE_ACTING), [{ type: 'atkUseSupporter', source: 'oppDiscard' }]);
  assert.deepEqual(stepsOf(SHAPESHIFTER), [{ type: 'atkUseSupporter', source: 'deckTop', discard: true }]);
  assert.deepEqual(stepsOf(ALTERED_CREATION), [
    { type: 'atkRestOfGame', effect: { kind: 'damageBonus', amount: 30 } },
  ]);
  assert.deepEqual(
    stepsOf("For the rest of this game, your {M} Pokémon take 30 less damage from your opponent's attacks."),
    [{ type: 'atkRestOfGame', effect: { kind: 'damageReduce', amount: 30, pokemonType: 'm' } }]
  );
  assert.deepEqual(stepsOf("For the rest of this game, your opponent can't use any GX attacks."), [
    { type: 'atkRestOfGame', effect: { kind: 'gxLock' } },
  ]);
});

test('parseCopyAttack: Bench, coin-gated and filtered copy wordings', () => {
  const cases = [
    [
      "Flip a coin. If heads, choose 1 of your Benched Pokémon's attacks and use it as this attack.",
      { source: 'ownBench', coinGate: 'heads' },
    ],
    [
      "Flip a coin. If heads, choose 1 of your opponent's Active Pokémon's attacks and use it as this attack.",
      { source: 'oppActive', coinGate: 'heads' },
    ],
    [
      "Flip a coin. If heads, choose an attack from 1 of your opponent's Pokémon in play and use it as this attack.",
      { source: 'oppInPlay', coinGate: 'heads' },
    ],
    ["Choose 1 of the Defending Pokémon's attacks and use it as this attack.", { source: 'oppActive' }],
    [
      "Choose 1 of your opponent's Pokémon's attacks and use it as this attack. If this Pokémon doesn't have the necessary Energy to use that attack, this attack does nothing.",
      { source: 'oppInPlay', needsEnergy: true },
    ],
    [
      "Choose 1 of your opponent's Active Pokémon's non-GX attacks and use it as this attack.",
      { source: 'oppActive', excludeGx: true },
    ],
  ];
  for (const [text, expected] of cases) assert.deepEqual(parseCopyAttack(text), expected, text);
  // A coin prefix on a non-copy sentence stays unparsed.
  assert.equal(parseCopyAttack('Flip a coin. If heads, draw a card.'), null);
});

// ── game flow ────────────────────────────────────────────────────────────────

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', hp: 200, ...props });
const supporter = (instanceId, name, text) =>
  createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Supporter'], text });
const item = (instanceId, name) => createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Item'] });

function board({ attacks, own = {}, opp = {}, ownBench = [], hand = [], deck = [], oppDiscard = [] }) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const p1 = state.players.p1.zones;
  const p2 = state.players.p2.zones;
  p1.active.push(pokemon({ instanceId: 1, name: 'Attacker', attacks, ...own }));
  for (const props of ownBench) p1.bench.push(pokemon(props));
  p2.active.push(pokemon({ instanceId: 20, name: 'Defender', ...opp }));
  p1.hand.push(...hand);
  p1.deck.push(...deck);
  p2.discard.push(...oppDiscard);
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

const textAttack = (text, extra = {}) => [{ name: 'Hit', cost: [], damage: '', text, ...extra }];
const attackRes = (state, seed = 5) =>
  applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, createRng(seed));
const attack = (state, seed) => {
  const res = attackRes(state, seed);
  assert.ok(!res.error, res.error);
  return res.state;
};
const choose = (state, selection) => {
  const res = applyCommand(
    state,
    { type: 'resolveChoice', payload: { choiceId: state.pendingChoice.choiceId, selection }, playerId: 'p1' },
    createRng(5)
  );
  assert.ok(!res.error, res.error);
  return res.state;
};
const ids = (cards) => cards.map((c) => c.instanceId);

test('Mimikyu Impersonation: discards the chosen hand Supporter and runs its effect', () => {
  let state = attack(
    board({
      attacks: textAttack(IMPERSONATION),
      hand: [supporter(40, 'Hop', 'Draw 3 cards.'), item(41, 'Potion')],
    })
  );
  assert.deepEqual(ids(state.pendingChoice.options), [40], 'only the Supporter is offered');
  state = choose(state, [40]);
  const p1 = state.players.p1.zones;
  assert.ok(ids(p1.discard).includes(40), 'the Supporter is discarded');
  assert.equal(p1.hand.length, 4, 'Potion plus 3 drawn cards');
  assert.equal(p1.deck.length, 3);
  assert.equal(state.turn.player, 'p2');
});

test("Oranguru Primate Acting: uses a Supporter from the opponent's discard pile, which stays there", () => {
  let state = attack(
    board({
      attacks: textAttack(PRIMATE_ACTING),
      oppDiscard: [supporter(60, 'Cheren', 'Draw 2 cards.')],
    })
  );
  state = choose(state, [60]);
  assert.equal(state.players.p1.zones.hand.length, 2);
  assert.deepEqual(ids(state.players.p2.zones.discard), [60]);
});

test('Ninetales Supernatural Shapeshifter: a non-Supporter top card is only discarded', () => {
  const state = attack(board({ attacks: textAttack(SHAPESHIFTER), deck: [item(45, 'Potion')] }));
  const p1 = state.players.p1.zones;
  assert.deepEqual(ids(p1.discard), [45]);
  assert.equal(p1.hand.length, 0);
  assert.equal(state.pendingChoice, null);
});

test('Ninetales Supernatural Shapeshifter: a Supporter top card is discarded and its effect used', () => {
  const state = attack(board({ attacks: textAttack(SHAPESHIFTER), deck: [supporter(46, 'Hop', 'Draw 3 cards.')] }));
  const p1 = state.players.p1.zones;
  assert.deepEqual(ids(p1.discard), [46]);
  assert.equal(p1.hand.length, 3);
});

test('Altered Creation GX: later attacks do 30 more damage to the Active', () => {
  const after = attack(board({ attacks: textAttack(ALTERED_CREATION) }));
  assert.deepEqual(after.players.p1.restOfGame, [{ kind: 'damageBonus', amount: 30 }]);

  const state = board({ attacks: [{ name: 'Tackle', cost: [], damage: '20', text: '' }] });
  state.players.p1.restOfGame = [{ kind: 'damageBonus', amount: 30 }];
  const hit = attack(state);
  assert.equal(hit.players.p2.zones.active[0].damage, 50);
});

test('rest-of-game reduction applies only to Pokémon of the named type', () => {
  const hitFor = (types) => {
    const state = board({ attacks: [{ name: 'Tackle', cost: [], damage: '50', text: '' }], opp: { types } });
    state.players.p2.restOfGame = [{ kind: 'damageReduce', amount: 30, pokemonType: 'm' }];
    return attack(state).players.p2.zones.active[0].damage;
  };
  assert.equal(hitFor(['Metal']), 20);
  assert.equal(hitFor(['Fire']), 50);
});

test("rest-of-game GX lock refuses the opponent's GX attacks only", () => {
  const locked = (name) => {
    const state = board({ attacks: [{ name, cost: [], damage: '10', text: '' }] });
    state.players.p2.restOfGame = [{ kind: 'gxLock' }];
    return attackRes(state).error;
  };
  assert.match(String(locked('Tag Bolt-GX')), /GX attacks/);
  assert.ok(!locked('Tackle'));
});

const ASSIST = "Flip a coin. If heads, choose 1 of your Benched Pokémon's attacks and use it as this attack.";

test('Liepard Assist: heads offers any Benched Pokémon attack, tails ends the turn', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 12 && outcomes.size < 2; seed += 1) {
    const state = attack(
      board({
        attacks: textAttack(ASSIST),
        ownBench: [{ instanceId: 3, name: 'Helper', attacks: [{ name: 'Scratch', cost: [], damage: '10', text: '' }] }],
      }),
      seed
    );
    if (state.pendingChoice) {
      assert.deepEqual(
        state.pendingChoice.options.map((o) => o.name),
        ['Helper: Scratch']
      );
      outcomes.add('heads');
    } else {
      assert.equal(state.turn.player, 'p2');
      outcomes.add('tails');
    }
  }
  assert.equal(outcomes.size, 2, 'both coin results seen');
});

test('Marshadow Shadow Imitation: GX attacks are not offered', () => {
  const state = attack(
    board({
      attacks: textAttack("Choose 1 of your opponent's Active Pokémon's non-GX attacks and use it as this attack."),
      opp: {
        attacks: [
          { name: 'Slash', cost: [], damage: '30', text: '' },
          { name: 'Big Storm-GX', cost: [], damage: '200', text: '' },
        ],
      },
    })
  );
  assert.deepEqual(
    state.pendingChoice.options.map((o) => o.name),
    ['Defender: Slash']
  );
});
