// Homebrew Teras (customhb, stage "TERAHB") count as Tera Pokémon. Tera Orb's text is read from
// client/src/assets/custom-sets/customhb/set.json (HB 612): "Search your deck for a Tera Pokémon,
// reveal it, and put it into your hand. Then, shuffle your deck." The Tera card is built the way
// the client's cardStats sends it: its stage, never its subtypes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { isTeraCard } from '../rules/card-classify.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const TERA_ORB = SET.cards.find((c) => c.localId === '612');

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, types: ['Colorless'], ...extra });

function game() {
  const state = createGameState({ gameId: 'customhb-tera-orb', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    state.players[id].zones.active.push(mon(`${id} active`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}

const run = (state, type, payload, seed = 3) => applyCommand(state, { type, playerId: 'p1', payload }, createRng(seed));

test('HB 612 is Tera Orb with the printed search text', () => {
  assert.equal(TERA_ORB?.name, 'Tera Orb');
  assert.match(TERA_ORB.effect, /^Search your deck for a Tera Pokémon/);
});

test('a homebrew Tera (stage TERAHB, no subtypes) is a Tera Pokémon; a plain ex is not', () => {
  assert.equal(isTeraCard({ name: 'Dragonite ex', stage: 'TERAHB' }), true);
  assert.equal(isTeraCard({ name: 'Dragonite ex', stage: 'Stage 2' }), false);
});

test('Tera Orb finds a homebrew Tera in the deck', () => {
  const state = game();
  const tera = mon('Dragonite ex', { stage: 'TERAHB', evolvesFrom: 'Dragonite', id: 'customhb-500' });
  const plain = mon('Garchomp', { stage: 'Stage 2' });
  state.players.p1.zones.deck.push(plain, tera, mon('Filler'));
  const orb = createCard({
    instanceId: nextId++, name: 'Tera Orb', supertype: 'Trainer', subtypes: ['Item'], type: 'Item',
    trainerType: 'Item', text: TERA_ORB.effect, id: TERA_ORB.id,
  });
  state.players.p1.zones.hand.push(orb);

  let res = run(state, 'playTrainer', { instanceId: orb.instanceId });
  assert.equal(res.error ?? null, null, res.reason);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'Tera Orb asks which Tera to take');
  assert.deepEqual(choice.options.map((o) => o.instanceId), [tera.instanceId]);
  res = run(res.state, 'resolveChoice', { choiceId: choice.choiceId, selection: [tera.instanceId] }, 4);
  assert.equal(res.error ?? null, null, res.reason);
  assert.ok(res.state.players.p1.zones.hand.some((c) => c.instanceId === tera.instanceId));
  assert.ok(!res.state.players.p1.zones.deck.some((c) => c.instanceId === tera.instanceId));
});
