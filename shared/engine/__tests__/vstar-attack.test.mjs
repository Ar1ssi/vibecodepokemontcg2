// VSTAR Power attacks spend the once-per-game VSTAR Power (App. 9, design 049 slice 1): the
// printed attack, a copied one and a borrowed one. Marker text: corpus "(You can't use more than
// 1 VSTAR Power in a game.)"; TCGdex swsh11-131 "(Can't use more than 1 VSTAR Power per game.)".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { isVstarPowerAttack } from '../rules/damage-parser.mjs';

const STAR_REQUIEM = {
  name: 'Star Requiem',
  cost: [],
  damage: '',
  text: "Your opponent's Active Pokémon is Knocked Out. (You can't use more than 1 VSTAR Power in a game.)",
};
// A VSTAR Power attack that leaves the Defending Pokémon standing, so no promotion is pending.
const STAR_STRIKE = {
  name: 'Star Strike',
  cost: [],
  damage: '10',
  text: "(You can't use more than 1 VSTAR Power in a game.)",
};
const LOST_IMPACT = { name: 'Lost Impact', cost: [], damage: '10', text: '' };
const GENOME_HACKING = {
  name: 'Genome Hacking',
  cost: [],
  damage: '',
  text: "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack.",
};

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, ...extra });

function board({ attackerAttacks, defenderAttacks = [], rulesEnabled = true }) {
  nextId = 1;
  const state = createGameState({ gameId: 'vstar', seed: 3, rulesEnabled });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 12; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
    state.players[id].zones.bench.push(mon(`${id} bench`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(mon('Attacker', { hp: 300, attacks: attackerAttacks }));
  state.players.p2.zones.active.push(mon('Defender', { hp: 400, attacks: defenderAttacks }));
  return state;
}

const attackCmd = (playerId, attackIndex = 0) => ({ type: 'attack', playerId, payload: { attackIndex } });

test('isVstarPowerAttack reads both the corpus and the TCGdex marker', () => {
  assert.equal(isVstarPowerAttack(STAR_REQUIEM), true);
  assert.equal(
    isVstarPowerAttack({ name: 'Star Requiem', effect: "Your opponent's Active Pokémon is Knocked Out. (Can't use more than 1 VSTAR Power per game.)" }),
    true
  );
  assert.equal(isVstarPowerAttack(LOST_IMPACT), false);
  assert.equal(isVstarPowerAttack(null), false);
});

test('a VSTAR Power attack spends the VSTAR Power; a second one is rejected', () => {
  const state = board({ attackerAttacks: [STAR_STRIKE] });
  const rng = createRng(3);
  const first = applyCommand(state, attackCmd('p1'), rng);
  assert.equal(first.error, null);
  assert.equal(first.state.players.p1.oncePerGame.vstarUsed, true);
  assert.ok(first.events.some((e) => e.type === 'vstarUsed' && e.attackName === 'Star Strike'));

  const later = structuredClone(first.state);
  later.turn = { player: 'p1', number: 5, phase: 'main' };
  later.players.p1.flags.attackerAttacked = false;
  const second = applyCommand(later, attackCmd('p1'), rng);
  assert.equal(second.error, 'VSTAR Power already used this game.');
});

test('Genome Hacking: a spent VSTAR Power removes the VSTAR Power attack from the options (R2)', () => {
  const state = board({ attackerAttacks: [GENOME_HACKING], defenderAttacks: [STAR_REQUIEM, LOST_IMPACT] });
  state.players.p1.oncePerGame = { vstarUsed: true, gxUsed: false };
  const res = applyCommand(state, attackCmd('p1'), createRng(3));
  assert.equal(res.error, null);
  assert.deepEqual(
    res.state.pendingChoice.options.map((o) => o.name),
    ['Defender: Lost Impact']
  );
});

test('Genome Hacking: copying a VSTAR Power attack spends the VSTAR Power', () => {
  const state = board({ attackerAttacks: [GENOME_HACKING], defenderAttacks: [STAR_REQUIEM, LOST_IMPACT] });
  const rng = createRng(3);
  const offered = applyCommand(state, attackCmd('p1'), rng);
  const pick = offered.state.pendingChoice.options.find((o) => o.name === 'Defender: Star Requiem').instanceId;
  const res = applyCommand(
    offered.state,
    {
      type: 'resolveChoice',
      playerId: 'p1',
      payload: { choiceId: offered.state.pendingChoice.choiceId, selection: [pick] },
    },
    rng
  );
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.oncePerGame.vstarUsed, true);
});

test('Memory Helix: a borrowed VSTAR Power attack is rejected once the VSTAR Power is spent', () => {
  const state = board({ attackerAttacks: [{ name: 'Teleportation Burst', cost: [], damage: '30', text: '' }] });
  const mew = state.players.p1.zones.active[0];
  mew.name = 'Mew ex';
  mew.abilities = [
    {
      name: 'Memory Helix',
      text: 'This Pokémon can use the attacks of any of your Benched Pokémon. (You still need the necessary Energy to use each attack.)',
    },
  ];
  state.players.p1.zones.bench[0].attacks = [STAR_STRIKE];
  state.players.p1.oncePerGame = { vstarUsed: true, gxUsed: false };
  const res = applyCommand(state, attackCmd('p1', 1), createRng(3));
  assert.equal(res.error, 'VSTAR Power already used this game.');
});
