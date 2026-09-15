// Design 004 slice 2 acceptance: legal-move enumeration for the playtest bot.
//
// Every stub card carries hp + weakness + non-placeholder attack text so
// ensureCardData() (called inside canEvolve/canPlayPokemonFromHand) short-circuits
// and no test ever reaches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { enumerateOptions } from '../e2e-options.mjs';
import { rulesState } from '../../../../../shared/engine/rules/rules-state.mjs';

function pokemon(name, extra = {}) {
  return {
    name,
    type: 'Pokémon',
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: 60,
    weakness: null,
    attacks: [
      { name: 'Tackle', cost: ['Water', 'Colorless'], damage: '20', text: 'Deals damage.' },
    ],
    retreatCost: 1,
    ...extra,
  };
}

function energy(name = 'Water Energy', type = 'Water') {
  return {
    name,
    type: 'Energy',
    supertype: 'Energy',
    subtypes: ['Basic'],
    types: [type],
    hp: null,
    weakness: null,
  };
}

function resetRules({ turnNumber = 3 } = {}) {
  rulesState.enabled = true;
  rulesState.phase = 'main';
  rulesState.turnPlayer = 'self';
  rulesState.turnNumber = turnNumber;
  rulesState.stadium = null;
  rulesState.pendingEffects = { self: [], opp: [] };
  rulesState.playerTurnCount = { self: 2, opp: 2 };
  for (const player of ['self', 'opp']) {
    rulesState.flags[player] = {
      energyAttached: false,
      attackerAttacked: false,
      retreatedThisTurn: false,
      evolved: {},
      supporterPlayed: false,
      lastSupporterName: '',
      abilitiesUsed: {},
      turnAttackBonus: null,
    };
  }
}

const kinds = (options) => options.map((o) => o.kind);

test('e2e options: pass is always present outside setup, and absent during it', async () => {
  resetRules();
  const options = await enumerateOptions({ user: 'self', active: pokemon('Squirtle') });
  assert.ok(kinds(options).includes('pass'));

  rulesState.phase = 'setup';
  assert.deepEqual(await enumerateOptions({ user: 'self', active: pokemon('Squirtle') }), []);

  rulesState.phase = 'ended';
  assert.deepEqual(await enumerateOptions({ user: 'self', active: pokemon('Squirtle') }), []);

  rulesState.phase = 'main';
  rulesState.turnPlayer = 'opp';
  assert.deepEqual(await enumerateOptions({ user: 'self', active: pokemon('Squirtle') }), []);
});

test('e2e options: no attack option when the attached energy is short', async () => {
  resetRules();
  const active = pokemon('Squirtle');

  const short = await enumerateOptions({
    user: 'self',
    active,
    attachedCardsOf: () => [energy()],
  });
  assert.equal(
    short.filter((o) => o.kind === 'attack').length,
    0,
    'one Water pays only half of {Water}{Colorless}'
  );

  const paid = await enumerateOptions({
    user: 'self',
    active,
    attachedCardsOf: () => [energy(), energy('Fire Energy', 'Fire')],
  });
  assert.deepEqual(
    paid.filter((o) => o.kind === 'attack'),
    [{ kind: 'attack', attackIndex: 0 }]
  );
});

test('e2e options: no attack option after this turn already attacked', async () => {
  resetRules();
  rulesState.flags.self.attackerAttacked = true;
  const options = await enumerateOptions({
    user: 'self',
    active: pokemon('Squirtle'),
    attachedCardsOf: () => [energy(), energy()],
  });
  assert.equal(kinds(options).includes('attack'), false);
});

test('e2e options: no attach option once the turn energy is used', async () => {
  resetRules();
  const board = { user: 'self', active: pokemon('Squirtle'), hand: [energy()] };

  const before = await enumerateOptions(board);
  assert.deepEqual(
    before.filter((o) => o.kind === 'attach'),
    [
      {
        kind: 'attach',
        handIndex: 0,
        targetZone: 'active',
        targetIndex: 0,
        instanceId: null,
        targetInstanceId: null,
      },
    ]
  );

  rulesState.flags.self.energyAttached = true;
  const after = await enumerateOptions(board);
  assert.equal(kinds(after).includes('attach'), false);
});

test('e2e options: no evolve onto a Pokémon played this turn', async () => {
  resetRules();
  const wartortle = pokemon('Wartortle', { stage: 'Stage 1', evolvesFrom: 'Squirtle' });

  const settled = pokemon('Squirtle', { enteredPlayTurn: rulesState.turnNumber - 1 });
  const canEvolveNow = await enumerateOptions({
    user: 'self',
    active: settled,
    hand: [wartortle],
  });
  assert.deepEqual(
    canEvolveNow.filter((o) => o.kind === 'evolve'),
    [
      {
        kind: 'evolve',
        handIndex: 0,
        targetZone: 'active',
        targetIndex: 0,
        instanceId: null,
        targetInstanceId: null,
      },
    ]
  );

  const justPlayed = pokemon('Squirtle', { enteredPlayTurn: rulesState.turnNumber });
  const blocked = await enumerateOptions({
    user: 'self',
    active: justPlayed,
    hand: [wartortle],
  });
  assert.equal(kinds(blocked).includes('evolve'), false);
});

test('e2e options: no evolve on the first turn, and none off the evolution line', async () => {
  resetRules({ turnNumber: 1 });
  rulesState.playerTurnCount = { self: 1, opp: 0 };
  const firstTurn = await enumerateOptions({
    user: 'self',
    active: pokemon('Squirtle'),
    hand: [pokemon('Wartortle', { stage: 'Stage 1', evolvesFrom: 'Squirtle' })],
  });
  assert.equal(kinds(firstTurn).includes('evolve'), false);

  resetRules();
  const wrongLine = await enumerateOptions({
    user: 'self',
    active: pokemon('Squirtle', { enteredPlayTurn: 1 }),
    hand: [pokemon('Ivysaur', { stage: 'Stage 1', evolvesFrom: 'Bulbasaur' })],
  });
  assert.equal(kinds(wrongLine).includes('evolve'), false);
});

test('e2e options: a Basic goes Active when the Active slot is empty, else to the bench', async () => {
  resetRules();
  const hand = [pokemon('Squirtle')];

  const empty = await enumerateOptions({ user: 'self', active: null, hand });
  assert.deepEqual(
    empty.filter((o) => o.kind === 'playBasic'),
    [{ kind: 'playBasic', handIndex: 0, targetZone: 'active', instanceId: null }]
  );

  const benched = await enumerateOptions({ user: 'self', active: pokemon('Psyduck'), hand });
  assert.deepEqual(
    benched.filter((o) => o.kind === 'playBasic'),
    [{ kind: 'playBasic', handIndex: 0, targetZone: 'bench', instanceId: null }]
  );

  const full = await enumerateOptions({
    user: 'self',
    active: pokemon('Psyduck'),
    bench: Array.from({ length: 5 }, (_, i) => pokemon(`Bench${i}`)),
    hand,
  });
  assert.equal(kinds(full).includes('playBasic'), false);
});

test('e2e options: Stage 1 cards are never offered as a bench play', async () => {
  resetRules();
  const options = await enumerateOptions({
    user: 'self',
    active: pokemon('Psyduck'),
    hand: [pokemon('Wartortle', { stage: 'Stage 1', evolvesFrom: 'Squirtle' })],
  });
  assert.equal(kinds(options).includes('playBasic'), false);
});

test('e2e options: one Supporter per turn; Items stay available', async () => {
  resetRules();
  const supporter = { name: 'Professor', type: 'Supporter', supertype: 'Trainer' };
  const item = { name: 'Poké Ball', type: 'Item', supertype: 'Trainer' };
  const board = { user: 'self', active: pokemon('Squirtle'), hand: [supporter, item] };

  const before = await enumerateOptions(board);
  assert.deepEqual(
    before.filter((o) => o.kind === 'playTrainer'),
    [
      { kind: 'playTrainer', handIndex: 0, instanceId: null },
      { kind: 'playTrainer', handIndex: 1, instanceId: null },
    ]
  );

  rulesState.flags.self.supporterPlayed = true;
  const after = await enumerateOptions(board);
  assert.deepEqual(
    after.filter((o) => o.kind === 'playTrainer'),
    [{ kind: 'playTrainer', handIndex: 1, instanceId: null }]
  );
});

test('e2e options: retreat needs a bench and enough energy, and is blocked after attacking', async () => {
  resetRules();
  const active = pokemon('Squirtle'); // retreatCost 1
  const bench = [pokemon('Psyduck')];

  const noBench = await enumerateOptions({
    user: 'self',
    active,
    attachedCardsOf: () => [energy()],
  });
  assert.equal(kinds(noBench).includes('retreat'), false);

  const noEnergy = await enumerateOptions({ user: 'self', active, bench });
  assert.equal(kinds(noEnergy).includes('retreat'), false);

  const ok = await enumerateOptions({
    user: 'self',
    active,
    bench,
    attachedCardsOf: () => [energy()],
  });
  assert.deepEqual(
    ok.filter((o) => o.kind === 'retreat'),
    [{ kind: 'retreat', benchIndex: 0 }]
  );

  rulesState.flags.self.attackerAttacked = true;
  const afterAttack = await enumerateOptions({
    user: 'self',
    active,
    bench,
    attachedCardsOf: () => [energy()],
  });
  assert.equal(kinds(afterAttack).includes('retreat'), false);
});

test('e2e options: every option is plain JSON, as the page boundary requires', async () => {
  resetRules();
  const options = await enumerateOptions({
    user: 'self',
    active: pokemon('Squirtle', { enteredPlayTurn: 1 }),
    bench: [pokemon('Psyduck')],
    hand: [energy(), pokemon('Magikarp'), pokemon('Wartortle', { stage: 'Stage 1', evolvesFrom: 'Squirtle' })],
    attachedCardsOf: () => [energy(), energy()],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(options)), options);
  assert.ok(options.length > 1);
});

// Under SERVER_AUTHORITATIVE the option's index addresses the SERVER view array, while
// moveCardBundle's legacy fallback indexes the local DOM zone array — so an index alone
// cannot address a card. Options therefore carry the server's instanceId when the cards
// they were built from have one, which act() forwards as the authoritative dispatch's
// { moving, target } bundle.
test('e2e options: carry the server instanceId when the cards have one', async () => {
  rulesState.enabled = true;
  rulesState.turnPlayer = 'self';
  rulesState.turnNumber = 3;
  rulesState.flags = { self: {}, opp: {} };

  const basic = { ...pokemon('Charmander'), instanceId: 77 };
  const activeCard = { ...pokemon('Squirtle'), instanceId: 12 };
  const energy = { name: 'Water Energy', type: 'Energy', supertype: 'Energy', instanceId: 99 };

  const benchPlay = (
    await enumerateOptions({ user: 'self', hand: [basic], active: activeCard, bench: [] })
  ).find((o) => o.kind === 'playBasic');
  assert.equal(benchPlay.instanceId, 77);

  const attach = (
    await enumerateOptions({ user: 'self', hand: [energy], active: activeCard, bench: [] })
  ).find((o) => o.kind === 'attach');
  assert.equal(attach.instanceId, 99);
  assert.equal(attach.targetInstanceId, 12);
});
