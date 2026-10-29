// The homebrew MEGA stage (MEGAHB): a Stage 3 that evolves from its named Pokémon whatever that one's stage.
// Cards: customhb set.json — Mega Absol ex (customhb-459, from Absol, a Basic), Mega Gardevoir ex (customhb-455,
// from Gardevoir, a Stage 2); cardback marks them custom.edits.stage 3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLegality } from '../reduce.mjs';
import { createCard, isBasicPokemon } from '../cards.mjs';
import { topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { rulesState, startGame, beginTurn } from '../rules/rules-state.mjs';
import {
  MEGAHB,
  canEvolve,
  canPlayPokemonFromHand,
  isNextStage,
  isRareCandyJump,
  normalizeStage,
} from '../rules/evolution.mjs';
import { validateCustomSet } from '../../custom-sets/custom-set-schema.mjs';
import { sampleSet } from '../../custom-sets/__tests__/fixtures.mjs';
import { tierFor } from '../../../client/src/setup/netcode/mat-fx/moves/move-select.mjs';
import { orderAttachedForCarousel } from '../../../client/src/setup/image-logic/carousel-order.mjs';

const mega = (name, evolvesFrom) => ({ name, stage: 'MEGAHB', evolvesFrom, category: 'Pokemon' });

function rulesOnTurn3() {
  startGame();
  for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
  rulesState.enabled = true;
}

test('MEGAHB is its own stage; legacy MEGA still reads as Stage 1', () => {
  assert.equal(normalizeStage('MEGAHB'), MEGAHB);
  assert.equal(normalizeStage('MEGA'), 'Stage 1');
  assert.equal(isNextStage('Basic', MEGAHB), true);
  assert.equal(isNextStage('Stage 1', MEGAHB), true);
  assert.equal(isNextStage('Stage 2', MEGAHB), true);
  assert.equal(isNextStage(MEGAHB, MEGAHB), false);
  assert.equal(isNextStage('Basic', 'Stage 2'), false);
});

for (const [base, evo] of [
  [{ stage: 'Basic', name: 'Absol' }, mega('Mega Absol ex', 'Absol')],
  [{ stage: 'Basic', name: 'Absol ex', suffix: 'ex' }, mega('Mega Absol ex', 'Absol ex')],
  [{ stage: 'Stage 1', name: 'Mawile' }, mega('Mega Mawile ex', 'Mawile')],
  [{ stage: 'Stage2', name: 'Gardevoir' }, mega('Mega Gardevoir ex', 'Gardevoir')],
]) {
  test(`canEvolve: ${evo.name} onto ${base.stage} ${base.name}`, async () => {
    rulesOnTurn3();
    assert.deepEqual((await canEvolve('self', base, evo, false)).allowed, true);
  });
}

test('canEvolve: a MEGAHB still needs its named Pokémon, the turn gates, and no Rare Candy', async () => {
  rulesOnTurn3();
  const evo = mega('Mega Gardevoir ex', 'Gardevoir');
  assert.equal((await canEvolve('self', { stage: 'Stage 1', name: 'Kirlia' }, evo, false)).allowed, false);
  assert.equal((await canEvolve('self', { stage: 'Stage 2', name: 'Gardevoir' }, evo, true)).allowed, false);
  assert.equal((await canEvolve('self', { stage: MEGAHB, name: 'Gardevoir' }, evo, false)).allowed, false);
  assert.equal(isRareCandyJump({ stage: 'Basic', name: 'Ralts' }, evo), false);
  assert.equal(
    (await canEvolve('self', { stage: 'Basic', name: 'Ralts' }, evo, false, { isRareCandy: true })).allowed,
    false
  );
});

test('a MEGAHB is not a Basic: never played from hand', async () => {
  rulesOnTurn3();
  const evo = mega('Mega Absol ex', 'Absol');
  assert.equal((await canPlayPokemonFromHand(evo)).allowed, false);
  assert.equal(isBasicPokemon({ ...evo, supertype: 'Pokémon' }), false);
});

function evolveState(base, evo) {
  const zones = () => ({ active: [], bench: [], hand: [], deck: [], discard: [], prizes: [], lostZone: [] });
  const state = {
    rulesEnabled: true,
    stateVersion: 1,
    turn: { number: 3, player: 'p1', phase: 'turn' },
    commandLog: [],
    stadium: null,
    players: {
      p1: { playerId: 'p1', zones: zones(), flags: {} },
      p2: { playerId: 'p2', zones: zones(), flags: {} },
    },
  };
  state.players.p1.zones.bench.push(createCard({ instanceId: 501, supertype: 'Pokémon', enteredPlayTurn: 1, ...base }));
  state.players.p1.zones.hand.push(createCard({ instanceId: 502, supertype: 'Pokémon', ...evo }));
  return validateLegality(state, { type: 'attachCard', payload: { instanceId: 502, targetInstanceId: 501 }, playerId: 'p1' });
}

test('server legality: MEGAHB evolves onto Basic, Stage 1 and Stage 2 of its name', () => {
  assert.equal(evolveState({ name: 'Absol', stage: 'Basic' }, mega('Mega Absol ex', 'Absol')).allowed, true);
  assert.equal(evolveState({ name: 'Mawile', stage: 'Stage 1' }, mega('Mega Mawile ex', 'Mawile')).allowed, true);
  assert.equal(evolveState({ name: 'Gardevoir', stage: 'Stage 2' }, mega('Mega Gardevoir ex', 'Gardevoir')).allowed, true);
  assert.equal(evolveState({ name: 'Kirlia', stage: 'Stage 1' }, mega('Mega Gardevoir ex', 'Gardevoir')).allowed, false);
});

test('stack top: the MEGAHB card is the evolved Pokémon on a Stage 2', () => {
  const root = { instanceId: 1, name: 'Ralts', stage: 'Basic', supertype: 'Pokémon' };
  const cards = [
    root,
    { instanceId: 2, name: 'Kirlia', stage: 'Stage 1', supertype: 'Pokémon', attachedTo: 1 },
    { instanceId: 4, name: 'Mega Gardevoir ex', stage: 'MEGAHB', supertype: 'Pokémon', attachedTo: 1 },
    { instanceId: 3, name: 'Gardevoir', stage: 'Stage 2', supertype: 'Pokémon', attachedTo: 1 },
  ];
  assert.equal(topPokemonCard(cards, root).name, 'Mega Gardevoir ex');
});

test('move FX tier and carousel order treat MEGAHB as the top stage', () => {
  assert.equal(tierFor({ name: 'Absol Mega', stage: 'MEGAHB' }), 3);
  const order = orderAttachedForCarousel([
    { name: 'Mega Gardevoir ex', stage: 'MEGAHB', supertype: 'Pokémon' },
    { name: 'Gardevoir', stage: 'Stage 2', supertype: 'Pokémon' },
  ]);
  assert.deepEqual(order.map((card) => card.name), ['Gardevoir', 'Mega Gardevoir ex']);
});

test('custom sets: a cardback MEGA (edits.stage 3) loads as MEGAHB whatever the export wrote', () => {
  const set = sampleSet();
  set.cards[0] = {
    ...set.cards[0],
    name: 'Mega Tyranitar ex',
    stage: 'Stage2',
    evolveFrom: 'Tyranitar',
    custom: { edits: { stage: 3 } },
  };
  const result = validateCustomSet(set, { setDirName: 'customhbw' });
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.set.cards[0].stage, 'MEGAHB');
  assert.equal(result.set.cards[1].category, 'Trainer');
  assert.equal(set.cards[0].stage, 'Stage2');
  assert.equal(validateCustomSet(sampleSet({ cards: [{ ...set.cards[0], stage: 'MEGAHB' }] })).ok, true);
});
