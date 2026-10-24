// Non-Plasma cards the Plasma-era parser changes must leave working (review of the Plasma merge).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { combinedToolAttackBonus } from '../rules/tool-combat.mjs';
import { toolGrantHolderMatches } from '../rules/tool-attacks.mjs';
import { parseMoveEnergyShape } from '../rules/abilities.mjs';

const tool = (name, text) =>
  createCard({ instanceId: 90, name, supertype: 'Trainer', subtypes: ['Pokémon Tool'], text });

test('Choice Band (Guardians Rising 121) still adds 30 against an Active Pokémon-GX', () => {
  const band = tool(
    'Choice Band',
    'The attacks of the Pokémon this card is attached to do 30 more damage to your opponent’s Active Pokémon-GX or Active Pokémon-EX (before applying Weakness and Resistance).'
  );
  const attacker = createCard({ instanceId: 1, name: 'Zoroark', supertype: 'Pokémon', subtypes: ['Stage 1'] });
  band.attachedTo = attacker.instanceId;
  const gx = createCard({ instanceId: 2, name: 'Tapu Lele-GX', supertype: 'Pokémon', subtypes: ['Basic', 'GX'] });
  assert.equal(combinedToolAttackBonus(attacker, [attacker, band], gx), 30);
});

test('Aqua Diffuser (Double Crisis 23) grants its attack to a Team Aqua Pokémon', () => {
  const diffuser = tool(
    'Aqua Diffuser',
    'The Team Aqua Pokémon this card is attached to can also use the attack on this card. (You still need the necessary Energy to use this attack.)'
  );
  assert.equal(toolGrantHolderMatches(diffuser, { name: "Team Aqua's Kyogre-EX" }), true);
  assert.equal(toolGrantHolderMatches(diffuser, { name: 'Kyogre-EX' }), false);
});

test('Power Memory (Fates Collide 108) matches Zygarde-EX however the name is hyphenated', () => {
  const memory = tool('Power Memory', 'The Zygarde-EX this card is attached to can also use the attack on this card.');
  assert.equal(toolGrantHolderMatches(memory, { name: 'Zygarde EX' }), true);
  assert.equal(toolGrantHolderMatches(memory, { name: 'Zygarde' }), false);
});

test('Heatran Flash Fire (Legends Awakened 6) moves Energy to Heatran only, not between any Pokémon', () => {
  const shape = parseMoveEnergyShape(
    'once during your turn (before your attack), you may move a {r} energy attached to 1 of your pokémon to heatran.'
  );
  assert.equal(shape.target, 'self');
  assert.equal(shape.source, 'others');
});

test('Weezing Aftermath (Plasma Storm 58) does not trigger on a Knock Out by placed damage counters', () => {
  const state = createGameState({
    players: { p1: { username: 'Player 1' }, p2: { username: 'Player 2' } },
    rulesEnabled: true,
  });
  state.players.p1.zones = createPlayerZones();
  state.players.p2.zones = createPlayerZones();
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  for (const [pid, base] of [['p1', 900], ['p2', 950]]) {
    state.players[pid].zones.prizes.push(
      ...[0, 1].map((i) => createCard({ instanceId: base + i, name: 'Prize', supertype: 'Pokémon', subtypes: ['Basic'] }))
    );
  }
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      name: 'Counter Placer',
      supertype: 'Pokémon',
      subtypes: ['Basic'],
      hp: 100,
      attacks: [{ name: 'Curse', cost: [], damage: 0, text: "Put 2 damage counters on your opponent's Active Pokémon." }],
    })
  );
  state.players.p1.zones.deck.push(
    ...[50, 51, 52, 53].map((id) => createCard({ instanceId: id, name: `D${id}`, supertype: 'Pokémon', subtypes: ['Basic'] }))
  );
  state.players.p2.zones.active.push(
    createCard({
      instanceId: 2,
      name: 'Weezing',
      supertype: 'Pokémon',
      subtypes: ['Basic'],
      hp: 90,
      damage: 80,
      abilities: [
        {
          name: 'Aftermath',
          type: 'Ability',
          text: "When this Pokémon is Knocked Out by damage from an opponent's attack, discard the top 3 cards of your opponent's deck.",
        },
      ],
    })
  );
  state.players.p2.zones.bench.push(createCard({ instanceId: 3, name: 'Bench', supertype: 'Pokémon', subtypes: ['Basic'], hp: 60 }));
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.ok(!res.state.players.p2.zones.active.some((c) => c.instanceId === 2), 'Weezing was Knocked Out');
  assert.equal(res.state.players.p1.zones.discard.length, 0, 'Aftermath did not mill');
  assert.deepEqual(res.state.players.p1.zones.deck.map((c) => c.instanceId), [50, 51, 52, 53]);
});
