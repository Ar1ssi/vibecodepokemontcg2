// Regressions from the S295 hostile review of the special-Energy audit fixes. Card texts
// come from out/pkmn-special-energy-cards.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { specialEnergyProvision, parseSpecialEnergyEffects } from '../rules/special-energy-parse.mjs';
import { buildCardStatsPayload } from '../../../client/src/setup/netcode/card-stats.js';

const BEAST =
  'This card provides {C} Energy. While this card is attached to an Ultra Beast, it provides every type of Energy but provides only 1 Energy at a time. The attacks of the Ultra Beast this card is attached to do 30 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).';
const DOUBLE_DRAGON =
  'This card can only be attached to {N} Pokémon. This card provides every type of Energy, but provides only 2 Energy at a time, only while this card is attached to a {N} Pokémon. (If this card is attached to anything other than a {N} Pokémon, discard this card.)';
const SHIELD =
  'This card can only be attached to {M} Pokémon. This card provides {M} Energy only while this card is attached to a {M} Pokémon. The attacks of your opponent’s Pokémon do 10 less damage to the {M} Pokémon this card is attached to (before applying Weakness and Resistance). (If this card is attached to anything other than a {M} Pokémon, discard this card.)';
const SUPER_BOOST =
  'This card provides {C} Energy. While this card is attached to a Stage 2 Pokémon, it provides every type of Energy but provides only 1 Energy at a time. If you have 3 or more Stage 2 Pokémon in play, it provides every type of Energy but provides 4 Energy at a time.';
const IGNITION =
  'If this card is attached to 1 of your Pokémon, discard it at the end of your turn. As long as this card is attached to a Pokémon, it provides {C} Energy. If this card is attached to an Evolution Pokémon, it provides {C}{C}{C} Energy instead.';
const CALL =
  'Call Energy provides {C} Energy. Once during your turn, if the Pokémon Call Energy is attached to is your Active Pokémon, you may search your deck for up to 2 Basic Pokémon and put them onto your Bench. If you do, shuffle your deck and your turn ends.';
const CYCLONE_SF =
  'Cyclone Energy provides {C} Energy. When you attach this card from your hand to your Active Pokémon, switch 1 of the Defending Pokémon with 1 of your opponent’s Benched Pokémon. Your opponent chooses the Benched Pokémon to switch.';

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const base = { p1: 900, p2: 950 };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[pid].zones.prizes.push(createCard({ instanceId: base[pid] + i, name: `Prize ${pid}-${i}` }));
    }
    for (let i = 0; i < 10; i += 1) {
      state.players[pid].zones.deck.push(createCard({ instanceId: base[pid] + 100 + i, name: `Deck ${pid}-${i}` }));
    }
  }
  return state;
}

const pokemon = (props) => createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...props });
const specialEnergy = (props) =>
  createCard({ supertype: 'Energy', type: 'Energy', subtypes: ['Special Energy'], ...props });
const energyCard = (name, text) => ({ name, text, type: 'Energy', subtypes: ['Special'], instanceId: 77 });

test('review: Beast Energy works on an Ultra Beast synced through cardStats', () => {
  const payload = buildCardStatsPayload([
    { syncInstance: 0, name: 'Buzzwole-GX', subtypes: ['Basic', 'GX', 'Ultra Beast'], hp: 190, types: ['Fighting'], stage: 'Basic' },
  ]);
  assert.deepEqual(payload.stats[0].subtypes, ['Basic', 'GX', 'Ultra Beast']);

  const state = game();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, syncInstance: 0, supertype: 'Pokémon', name: 'Buzzwole-GX', stage: 'Basic' }),
    specialEnergy({ instanceId: 2, name: 'Beast Energy Prism Star', text: BEAST, attachedTo: 1 })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Snorlax', hp: 300, types: ['Colorless'] }));

  const synced = applyCommand(state, { type: 'cardStats', payload, playerId: 'p1' });
  findCard(synced.state, 1).card.attacks = [{ name: 'Punch', damage: 30, cost: ['Fighting'] }];
  const res = applyCommand(synced.state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 9).card.damage, 60);
});

test('review: type gates read every printed type, not the name, once types are known', () => {
  const dragonite = { instanceId: 1, name: 'Dragonite', types: ['Colorless'], stage: 'Stage 2' };
  assert.deepEqual(specialEnergyProvision(energyCard('Double Dragon Energy', DOUBLE_DRAGON), { host: dragonite }), []);
  const dual = { instanceId: 1, name: 'Foo', types: ['Psychic', 'Metal'] };
  assert.deepEqual(specialEnergyProvision(energyCard('Shield Energy', SHIELD), { host: dual }), ['Metal']);
});

test('review: Super Boost gives 4 Energy only on a Stage 2 host', () => {
  const boost = energyCard('Super Boost Energy Prism Star', SUPER_BOOST);
  const board = { ownStage2InPlay: 3 };
  assert.deepEqual(specialEnergyProvision(boost, { host: { instanceId: 1, name: 'Pikachu', stage: 'Basic' }, board }), ['Colorless']);
  assert.equal(specialEnergyProvision(boost, { host: { instanceId: 1, name: 'Gardevoir', stage: 'Stage 2' }, board }).length, 4);
});

test('review: "for each Energy" damage counts Ignition as {C}{C}{C} on an Evolution', () => {
  const state = game();
  const burst = [{ name: 'Energy Burst', damage: '10×', cost: ['Colorless'], text: 'This attack does 10 damage for each Energy attached to this Pokémon.' }];
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Charmander', hp: 60, types: ['Fire'] }),
    createCard({ instanceId: 2, name: 'Charmeleon', supertype: 'Pokémon', stage: 'Stage 1', subtypes: ['Stage 1'], hp: 90, types: ['Fire'], attachedTo: 1, attacks: burst }),
    specialEnergy({ instanceId: 3, name: 'Ignition Energy', text: IGNITION, attachedTo: 1 })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Snorlax', hp: 300, types: ['Colorless'] }));

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 9).card.damage, 30);
});

test('review: Call Energy is not an on-attach search', () => {
  assert.ok(!parseSpecialEnergyEffects(energyCard('Call Energy', CALL)).steps.some((s) => s.type === 'onAttachSearch'));

  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Pikachu' }));
  state.players.p1.zones.bench.push(pokemon({ instanceId: 3, name: 'Eevee' }));
  state.players.p1.zones.hand.push(specialEnergy({ instanceId: 2, name: 'Call Energy', text: CALL }));
  state.players.p1.zones.deck.push(pokemon({ instanceId: 50, name: 'Ralts' }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice ?? null, null);
});

test('review: Stormfront Cyclone Energy lets the opponent choose', () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Pikachu' }));
  state.players.p1.zones.hand.push(specialEnergy({ instanceId: 2, name: 'Cyclone Energy', text: CYCLONE_SF }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 10, name: 'Roselia' }), pokemon({ instanceId: 11, name: 'Roserade' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.player, 'p2');
});
