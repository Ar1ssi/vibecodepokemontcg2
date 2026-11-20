// HB 608 Acerola and HB 239 Gengar Shadow Pain (customhb set.json), plus the printings that share
// their parser branches (out/pkmn-trainer-cards.json, out/pkmn-pokemon-cards.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { executeTrainer } from '../effects/trainer.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const hbCard = (localId) => SET.cards.find((c) => c.localId === localId);
const ACEROLA = hbCard('608').effect;
const SHADOW_PAIN = hbCard('239').abilities.find((a) => a.name === 'Shadow Pain').effect;

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, types: ['Colorless'], ...extra });

function board() {
  const state = createGameState({ gameId: 'acerola', seed: 1, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 5; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  return state;
}

/** Plays a Trainer for p1, answering each prompt with the next of `answers` (instanceId lists). */
function playTrainer(state, name, text, type, answers = []) {
  const card = createCard({ instanceId: nextId++, name, supertype: 'Trainer', type, trainerType: type, text });
  state.players.p1.zones.hand.push(card);
  const prompts = [];
  let res = executeTrainer(state, { card, playerId: 'p1', events: [] });
  for (const answer of answers) {
    if (!res.pendingChoice) break;
    prompts.push(res.pendingChoice);
    res = executeTrainer(state, { card, playerId: 'p1', events: [], selection: answer, resumeToken: res.pendingChoice.resumeToken });
  }
  if (res.pendingChoice) prompts.push(res.pendingChoice);
  return prompts;
}

test('HB 608 Acerola: only a damaged Pokémon can be picked, and it reaches the hand with no damage counters', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Healthy'));
  const hurt = mon('Hurt', { damage: 70, specialCondition: 'Poisoned' });
  state.players.p1.zones.bench.push(hurt);
  state.players.p2.zones.active.push(mon('Foe'));
  const [prompt] = playTrainer(state, 'Acerola', ACEROLA, 'Supporter', [[hurt.instanceId]]);
  assert.deepEqual(prompt.options.map((o) => o.name), ['Hurt']);
  assert.ok(state.players.p1.zones.hand.includes(hurt));
  assert.equal(hurt.damage, 0);
  assert.equal(hurt.specialCondition ?? null, null);
});

test('HB 608 Acerola: the Pokémon played again from the hand is not Knocked Out at the end of the turn', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Healthy'));
  const hurt = mon('Hurt', { hp: 60, damage: 50 });
  state.players.p1.zones.bench.push(hurt);
  state.players.p2.zones.active.push(mon('Foe'));
  playTrainer(state, 'Acerola', ACEROLA, 'Supporter', [[hurt.instanceId]]);
  let next = applyCommand(state, { type: 'moveCard', playerId: 'p1', payload: { instanceId: hurt.instanceId, from: 'hand', to: 'bench' } }, createRng(1)).state;
  next = applyCommand(next, { type: 'pass', playerId: 'p1', payload: {} }, createRng(1)).state;
  const replayed = next.players.p1.zones.bench.find((c) => c.instanceId === hurt.instanceId);
  assert.ok(replayed, 'still on the Bench');
  assert.equal(replayed.damage, 0);
});

test('a Pokémon moved by hand from the Bench to the hand loses its damage counters', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Active'));
  const hurt = mon('Hurt', { damage: 40 });
  state.players.p1.zones.bench.push(hurt);
  state.players.p2.zones.active.push(mon('Foe'));
  const next = applyCommand(state, { type: 'moveCard', playerId: 'p1', payload: { instanceId: hurt.instanceId, from: 'bench', to: 'hand' } }, createRng(1)).state;
  assert.equal(next.players.p1.zones.hand.find((c) => c.instanceId === hurt.instanceId).damage, 0);
});

test("the other return-to-hand Trainers keep their printed limits (Cheren's Care, Penny, Scoop Up Net)", () => {
  const optionsFor = (name, text, type, pokemon) => {
    const state = board();
    state.players.p1.zones.active.push(...pokemon.slice(0, 1));
    state.players.p1.zones.bench.push(...pokemon.slice(1));
    state.players.p2.zones.active.push(mon('Foe'));
    return playTrainer(state, name, text, type)[0]?.options.map((o) => o.name) ?? [];
  };
  // Cheren's Care (out/pkmn-trainer-cards.json)
  assert.deepEqual(
    optionsFor("Cheren's Care", 'Put 1 of your {C} Pokémon that has any damage counters on it and all attached cards into your hand.', 'Supporter', [
      mon('Hurt Colorless', { damage: 10 }),
      mon('Healthy Colorless'),
      mon('Hurt Fire', { damage: 10, types: ['Fire'] }),
    ]),
    ['Hurt Colorless']
  );
  // Penny
  assert.deepEqual(
    optionsFor('Penny', 'Put 1 of your Basic Pokémon and all attached cards into your hand.', 'Supporter', [
      mon('Basic One'),
      mon('Evolved', { stage: 'Stage 1' }),
    ]),
    ['Basic One']
  );
  // Scoop Up Net
  assert.deepEqual(
    optionsFor('Scoop Up Net', 'Put 1 of your Pokémon that isn’t a Pokémon V or a Pokémon-GX into your hand. (Discard all attached cards.)', 'Item', [
      mon('Plain'),
      mon('Zacian V', { subtypes: ['V'] }),
      mon('Pikachu-GX', { subtypes: ['GX'] }),
    ]),
    ['Plain']
  );
});

function evolveGengar(text) {
  const state = board();
  const haunter = mon('Haunter', { stage: 'Stage 1', evolvesFrom: 'Gastly', hp: 80 });
  state.players.p1.zones.active.push(haunter);
  const foes = [mon('Foe A'), mon('Foe B'), mon('Foe C')];
  state.players.p2.zones.active.push(foes[0]);
  state.players.p2.zones.bench.push(foes[1], foes[2]);
  const gengar = mon('Gengar', { stage: 'Stage 2', evolvesFrom: 'Haunter', hp: 130, abilities: [{ name: 'Shadow Pain', type: 'Ability', text }] });
  state.players.p1.zones.hand.push(gengar);
  let res = applyCommand(state, { type: 'attachCard', playerId: 'p1', payload: { instanceId: gengar.instanceId, targetInstanceId: haunter.instanceId } }, createRng(3));
  assert.equal(res.error, null);
  res = applyCommand(res.state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: gengar.instanceId } }, createRng(3));
  assert.equal(res.error, null);
  return { res, foes };
}

function pickEach(res, ids) {
  for (const id of ids) {
    const pc = res.state.pendingChoice;
    assert.ok(pc, 'a prompt for each counter');
    assert.equal(pc.max, 1);
    res = applyCommand(res.state, { type: 'resolveChoice', playerId: pc.player, payload: { choiceId: pc.choiceId, selection: [id] } }, createRng(3));
    assert.equal(res.error ?? null, null);
  }
  return res;
}

const damageOf = (state, foe) =>
  [...state.players.p2.zones.active, ...state.players.p2.zones.bench].find((c) => c.instanceId === foe.instanceId)?.damage ?? 0;

test('HB 239 Gengar Shadow Pain: the 6 counters split across the opponent\'s Pokémon any way you like', () => {
  const { res, foes } = evolveGengar(SHADOW_PAIN);
  const [a, b, c] = foes;
  const done = pickEach(res, [a, b, b, c, c, c].map((f) => f.instanceId));
  assert.equal(done.state.pendingChoice ?? null, null, 'six counters, then done');
  assert.deepEqual(foes.map((f) => damageOf(done.state, f)), [10, 20, 30]);
});

test('Gengar [UNM] Shadow Pain: only the opponent\'s Pokémon-GX and Pokémon-EX are offered', () => {
  // out/pkmn-pokemon-cards.json, Gengar "Shadow Pain".
  const printed =
    "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may put 6 damage counters on your opponent's Pokémon-GX and Pokémon-EX in any way you like.";
  const state = board();
  const haunter = mon('Haunter', { stage: 'Stage 1', evolvesFrom: 'Gastly', hp: 80 });
  state.players.p1.zones.active.push(haunter);
  state.players.p2.zones.active.push(mon('Plain Foe'));
  state.players.p2.zones.bench.push(mon('Mewtwo-EX', { hp: 170 }), mon('Pikachu-GX', { subtypes: ['GX'], hp: 170 }));
  const gengar = mon('Gengar', { stage: 'Stage 2', evolvesFrom: 'Haunter', hp: 130, abilities: [{ name: 'Shadow Pain', type: 'Ability', text: printed }] });
  state.players.p1.zones.hand.push(gengar);
  let res = applyCommand(state, { type: 'attachCard', playerId: 'p1', payload: { instanceId: gengar.instanceId, targetInstanceId: haunter.instanceId } }, createRng(3));
  res = applyCommand(res.state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: gengar.instanceId } }, createRng(3));
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.name).sort(), ['Mewtwo-EX', 'Pikachu-GX']);
});
