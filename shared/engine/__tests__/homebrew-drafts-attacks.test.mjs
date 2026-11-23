// Design 091 slice 2: customhb gap drafts (.agent/scratch/customhb-card-drafts.md) — an owner family
// count ("for each Ranger's Pokémon on your Bench") and "If any of your Benched Pokémon have damage
// counters on them". The draft text is the source (unreleased homebrew cards).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const pokemon = (props) => createCard({ supertype: 'Pokémon', type: 'Pokémon', hp: 100, ...props });
const energy = (instanceId, attachedTo) =>
  createCard({ instanceId, name: 'Basic Lightning Energy', supertype: 'Energy', subtypes: ['Basic'], type: 'Energy', energyType: 'Lightning', attachedTo });

const CAPTURE_SPARK = {
  name: 'Capture Spark',
  cost: ['Colorless', 'Colorless'],
  damage: '30+',
  text: "This attack does 30 more damage for each Ranger's Pokémon on your Bench.",
};
const GRUDGE_STRIKE = {
  name: 'Grudge Strike',
  cost: ['Colorless', 'Colorless'],
  damage: '60+',
  text: 'If any of your Benched Pokémon have damage counters on them, this attack does 90 more damage.',
};

/** p1 Active attacker (2 Energy) vs a 400 HP p2 Active; `bench` is [{ name, damage }]. */
function board(attack, bench) {
  const state = createGameState({ players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } }, rulesEnabled: true });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: "Ranger's Luxio", attacks: [attack] }), energy(50, 1), energy(51, 1));
  bench.forEach(({ name, damage = 0 }, i) => {
    const card = pokemon({ instanceId: 100 + i, name });
    card.damage = damage;
    state.players.p1.zones.bench.push(card);
  });
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Defender', hp: 400 }));
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + i + (playerId === 'p2' ? 10 : 0), name: 'Prize' }));
  }
  return state;
}

const defenderDamage = (state) => {
  const { state: next } = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  return next.players.p2.zones.active.find((c) => c.instanceId === 20).damage || 0;
};

test("an owner family on the Bench counts only that owner's Pokémon (Ranger's Luxio Capture Spark)", () => {
  const bench = [{ name: "Ranger's Pachirisu" }, { name: "Ranger's Staravia" }, { name: 'Pachirisu' }, { name: "Team Rocket's Rattata" }];
  assert.equal(defenderDamage(board(CAPTURE_SPARK, bench)), 90);
  assert.equal(defenderDamage(board(CAPTURE_SPARK, [])), 30);
});

test('a damaged Benched Pokémon adds the bonus; an undamaged Bench does not (Druddigon Grudge Strike)', () => {
  assert.equal(defenderDamage(board(GRUDGE_STRIKE, [{ name: 'Pikachu' }, { name: 'Eevee', damage: 10 }])), 150);
  assert.equal(defenderDamage(board(GRUDGE_STRIKE, [{ name: 'Pikachu' }])), 60);
  assert.equal(defenderDamage(board(GRUDGE_STRIKE, [])), 60);
});
