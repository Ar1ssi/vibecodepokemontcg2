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
  TERAHB,
  canEvolve,
  canPlayPokemonFromHand,
  isNextStage,
  isRareCandyJump,
  markEvolvedThisTurn,
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

function evolveState(base, evo, evolved = {}, turnNumber = 3) {
  const zones = () => ({ active: [], bench: [], hand: [], deck: [], discard: [], prizes: [], lostZone: [] });
  const state = {
    rulesEnabled: true,
    stateVersion: 1,
    turn: { number: turnNumber, player: 'p1', phase: 'turn' },
    commandLog: [],
    stadium: null,
    players: {
      p1: { playerId: 'p1', zones: zones(), flags: { evolved: evolved.p1 ?? {} } },
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

// The homebrew Tera stage (TERAHB): places like MEGAHB and follows the ordinary evolution timing gates.
// No Tera card is in customhb yet: cardback's edit.py defines stage 4 (Tera) and its export writes subtypes ex, Tera.
const tera = (name, evolvesFrom) => ({ name, stage: 'TERAHB', evolvesFrom, category: 'Pokemon', subtypes: ['ex', 'Tera'] });

test('TERAHB places like MEGAHB, never on another homebrew top stage', () => {
  assert.equal(normalizeStage('TERAHB'), TERAHB);
  for (const stage of ['Basic', 'Stage 1', 'Stage 2']) assert.equal(isNextStage(stage, TERAHB), true);
  assert.equal(isNextStage(TERAHB, TERAHB), false);
  assert.equal(isNextStage(MEGAHB, TERAHB), false);
  assert.equal(isNextStage(TERAHB, MEGAHB), false);
});

test('canEvolve: a TERAHB waits like any evolution — not on a Pokémon played or evolved this turn', async () => {
  rulesOnTurn3();
  const evo = tera('Tera Dragonite ex', 'Dragonite');
  const base = { stage: 'Stage 2', name: 'Dragonite', instanceId: 'dragonite-1' };
  assert.equal((await canEvolve('self', base, evo, false)).allowed, true);
  assert.equal((await canEvolve('self', base, evo, true)).allowed, false);
  markEvolvedThisTurn('self', base);
  assert.equal((await canEvolve('self', base, evo, false)).allowed, false);
  assert.equal((await canEvolve('self', { stage: 'Stage 1', name: 'Dragonair' }, evo, true)).allowed, false);
  assert.equal(
    (await canEvolve('self', { stage: 'Basic', name: 'Dratini' }, { stage: 'Stage 1', name: 'Dragonair', evolvesFrom: 'Dratini' }, true)).allowed,
    false
  );
});

test('canEvolve: the first-turn gate still stops a TERAHB; not from hand, not by Rare Candy', async () => {
  startGame();
  beginTurn('self');
  rulesState.enabled = true;
  const evo = tera('Tera Dragonite ex', 'Dragonite');
  assert.equal((await canEvolve('self', { stage: 'Stage 2', name: 'Dragonite' }, evo, true)).allowed, false);
  rulesOnTurn3();
  assert.equal((await canPlayPokemonFromHand(evo)).allowed, false);
  assert.equal(isBasicPokemon({ ...evo, supertype: 'Pokémon' }), false);
  assert.equal(isRareCandyJump({ stage: 'Basic', name: 'Dratini' }, evo), false);
});

test('server legality: TERAHB hits the just-played and already-evolved gates like a Stage 1', () => {
  const played = { name: 'Dragonite', stage: 'Stage 2', enteredPlayTurn: 3 };
  assert.equal(evolveState(played, tera('Tera Dragonite ex', 'Dragonite')).allowed, false);
  assert.equal(evolveState({ ...played, enteredPlayTurn: 1 }, tera('Tera Dragonite ex', 'Dragonite')).allowed, true);
  assert.equal(evolveState({ ...played, name: 'Kirlia' }, tera('Tera Dragonite ex', 'Dragonite')).allowed, false);
  assert.equal(
    evolveState({ name: 'Dratini', stage: 'Basic', enteredPlayTurn: 3 }, { name: 'Dragonair', stage: 'Stage 1', evolvesFrom: 'Dratini' }).allowed,
    false
  );
  const evolved = { p1: { 501: true } };
  assert.equal(evolveState({ ...played, enteredPlayTurn: 1 }, tera('Tera Dragonite ex', 'Dragonite'), evolved).allowed, false);
  assert.equal(evolveState({ name: 'Dragonite', stage: 'Stage 2' }, mega('Mega Dragonite ex', 'Dragonite'), evolved).allowed, false);
  assert.equal(evolveState({ ...played, enteredPlayTurn: 1 }, tera('Tera Dragonite ex', 'Dragonite'), {}, 1).allowed, false);
});

test('TERAHB tops its stack, the move FX tier and the carousel', () => {
  const root = { instanceId: 1, name: 'Dratini', stage: 'Basic', supertype: 'Pokémon' };
  const cards = [
    root,
    { instanceId: 4, name: 'Tera Dragonite ex', stage: 'TERAHB', supertype: 'Pokémon', attachedTo: 1 },
    { instanceId: 3, name: 'Dragonite', stage: 'Stage 2', supertype: 'Pokémon', attachedTo: 1 },
  ];
  assert.equal(topPokemonCard(cards, root).name, 'Tera Dragonite ex');
  assert.equal(tierFor({ name: 'Dragonite', stage: 'TERAHB' }), 3);
  const order = orderAttachedForCarousel([
    { name: 'Tera Dragonite ex', stage: 'TERAHB', supertype: 'Pokémon' },
    { name: 'Dragonite', stage: 'Stage 2', supertype: 'Pokémon' },
  ]);
  assert.deepEqual(order.map((card) => card.name), ['Dragonite', 'Tera Dragonite ex']);
});

test('custom sets: a cardback Tera (edits.stage 4) loads as TERAHB', () => {
  const set = sampleSet();
  set.cards[0] = { ...set.cards[0], name: 'Tera Tyranitar ex', evolveFrom: 'Tyranitar', custom: { edits: { stage: 4 } } };
  const result = validateCustomSet(set, { setDirName: 'customhbw' });
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.set.cards[0].stage, 'TERAHB');
  assert.equal(set.cards[0].stage, 'Stage2');
});
