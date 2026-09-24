// Audit SE4–SE13: passive special-Energy effects the server previously parsed but
// never executed (status immunity, restrictions, end-of-turn discards, effect and
// bench shields, retreat modifiers, Weakness/Resistance modifiers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { addCondition, hasCondition } from '../rules/special-conditions.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import { getSpecialEnergyDamageReduction } from '../rules/special-energy-parse.mjs';

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

function pokemon(props) {
  return createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...props });
}

function specialEnergy(props) {
  return createCard({ supertype: 'Energy', type: 'Energy', subtypes: ['Special Energy'], ...props });
}

const BUBBLY =
  'As long as this card is attached to a Pokémon, it provides {W} Energy. The {W} Pokémon this card is attached to recovers from all Special Conditions and can’t be affected by any Special Conditions.';
const TEAM_ROCKETS =
  "This card can only be attached to a Team Rocket's Pokémon. If this card is attached to anything other than a Team Rocket's Pokémon, discard this card. As long as this card is attached to a Pokémon, it provides 2 in any combination of {P} Energy and {D} Energy.";
const IGNITION =
  "This card can only be attached to an Evolution Pokémon. If this card is attached to anything other than an Evolution Pokémon, discard this card. As long as this card is attached to a Pokémon, it provides {C}{C}{C} Energy. At the end of your turn, discard this card from the Pokémon it is attached to.";
const MIST =
  'This card provides {C} Energy. Prevent all effects of attacks used by your opponent’s Pokémon done to the Pokémon this card is attached to. (Existing effects are not removed. Damage is not an effect.)';
const SHADOWY =
  'As long as this card is attached to a Pokémon, it provides {D} Energy. As long as the {D} Pokémon this card is attached to is on your Bench, prevent all damage done to it by attacks from your opponent’s Pokémon.';
const MAGNETIC =
  'As long as this card is attached to a Pokémon, it provides {M} Energy. The {M} Pokémon this card is attached to has no Retreat Cost.';
const BOOST =
  'This card can only be attached to an Evolution Pokémon. If this card is attached to anything other than an Evolution Pokémon, discard this card. As long as this card is attached to a Pokémon, it provides {C}{C}{C} Energy. The Pokémon Boost Energy is attached to can’t retreat. Discard this card at the end of the turn it was attached.';
const COATING =
  'As long as this card is attached to a Pokémon, it provides {M} Energy. The {M} Pokémon this card is attached to has no Weakness.';
const SHIELD =
  "This card can only be attached to {M} Pokémon. This card provides {M} Energy only while this card is attached to a {M} Pokémon. The attacks of your opponent's Pokémon do 10 less damage to the {M} Pokémon this card is attached to (before applying Weakness and Resistance). (If this card is attached to anything other than a {M} Pokémon, discard this card.)";
const V_GUARD =
  "As long as this card is attached to a Pokémon, it provides {C} Energy. The Pokémon this card is attached to takes 30 less damage from attacks from your opponent’s Pokémon V (after applying Weakness and Resistance). The effect of V Guard Energy can’t be applied more than once at a time to the same Pokémon.";
const GROWING =
  'As long as this card is attached to a Pokémon, it provides {G} Energy. The {G} Pokémon this card is attached to gets +20 HP.';

test('SE4: Bubbly Water strips a Special Condition from its {W} host after the next command', () => {
  const state = game();
  const host = pokemon({ instanceId: 1, name: 'Squirtle', types: ['Water'] });
  addCondition(host, 'Poisoned');
  state.players.p1.zones.active.push(host);
  state.players.p1.zones.hand.push(specialEnergy({ instanceId: 2, name: 'Bubbly Water Energy', text: BUBBLY }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(hasCondition(findCard(res.state, 1).card, 'Poisoned'), false);
});

test('SE4: Bubbly Water does nothing for a host that is not {W}', () => {
  const state = game();
  const host = pokemon({ instanceId: 1, name: 'Charmander', types: ['Fire'] });
  addCondition(host, 'Poisoned');
  state.players.p1.zones.active.push(host);
  state.players.p1.zones.hand.push(specialEnergy({ instanceId: 2, name: 'Bubbly Water Energy', text: BUBBLY }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(hasCondition(findCard(res.state, 1).card, 'Poisoned'), true);
});

test("SE8: Team Rocket's Energy can't be attached from hand to another Pokémon", () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Pikachu', types: ['Lightning'], subtypes: ['Basic'] }));
  state.players.p1.zones.bench.push(pokemon({ instanceId: 3, name: "Team Rocket's Mewtwo ex", types: ['Psychic'], subtypes: ['Basic', "Team Rocket's", 'ex'] }));
  state.players.p1.zones.hand.push(specialEnergy({ instanceId: 2, name: "Team Rocket's Energy", text: TEAM_ROCKETS }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const refused = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
  assert.notEqual(refused.error, null);

  const allowed = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 3 }, playerId: 'p1' });
  assert.equal(allowed.error, null);
});

test("SE8: Team Rocket's Energy moved onto another Pokémon is discarded", () => {
  const state = game();
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Pikachu', types: ['Lightning'], subtypes: ['Basic'] }),
    specialEnergy({ instanceId: 2, name: "Team Rocket's Energy", text: TEAM_ROCKETS, attachedTo: 1 })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === 2));
});

test('SE8: Ignition Energy is discarded at the end of its owner’s turn', () => {
  const state = game();
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Charmeleon', stage: 'Stage 1', subtypes: ['Stage 1'], types: ['Fire'] }),
    specialEnergy({ instanceId: 2, name: 'Ignition Energy', text: IGNITION, attachedTo: 1 })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.instanceId === 2));
});

test('SE5: Mist Energy prevents a Special Condition from the opponent’s attack', () => {
  const state = game();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Pikachu',
      types: ['Lightning'],
      attacks: [{ name: 'Thunder Wave', damage: 10, cost: [], text: "Your opponent's Active Pokémon is now Paralyzed." }],
    })
  );
  state.players.p2.zones.active.push(
    pokemon({ instanceId: 9, name: 'Snorlax', hp: 150, types: ['Colorless'] }),
    specialEnergy({ instanceId: 10, name: 'Mist Energy', text: MIST, attachedTo: 9 })
  );

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  const defender = findCard(res.state, 9).card;
  assert.equal(defender.damage, 10, 'damage is not an effect');
  assert.equal(hasCondition(defender, 'Paralyzed'), false);
});

test('SE5: Shadowy Darkness blocks attack damage to its Benched {D} host', () => {
  const state = game();
  state.players.p1.zones.active.push(
    pokemon({
      instanceId: 1,
      name: 'Pikachu',
      types: ['Lightning'],
      attacks: [{ name: 'Spark', damage: 10, cost: [], text: "This attack also does 20 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }],
    })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Snorlax', hp: 150, types: ['Colorless'] }));
  state.players.p2.zones.bench.push(
    pokemon({ instanceId: 11, name: 'Zorua', types: ['Darkness'] }),
    specialEnergy({ instanceId: 12, name: 'Shadowy Darkness Energy', text: SHADOWY, attachedTo: 11 })
  );

  let res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  if (res.state.pendingChoice) {
    res = applyCommand(res.state, {
      type: 'resolveChoice',
      payload: { choiceId: res.state.pendingChoice.choiceId, selection: [11] },
      playerId: res.state.pendingChoice.player,
    });
    assert.equal(res.error, null);
  }
  assert.equal(findCard(res.state, 11).card.damage || 0, 0);
});

test('SE6: Magnetic Metal gives its {M} host no Retreat Cost; Boost Energy forbids retreat', () => {
  const magnetic = game();
  magnetic.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Bronzor', types: ['Metal'], retreatCost: 3 }),
    specialEnergy({ instanceId: 2, name: 'Magnetic Metal Energy', text: MAGNETIC, attachedTo: 1 })
  );
  magnetic.players.p1.zones.bench.push(pokemon({ instanceId: 3, name: 'Pikachu' }));
  magnetic.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));
  assert.equal(validateLegality(magnetic, { type: 'retreat', payload: { benchInstanceId: 3, discardEnergyIds: [] }, playerId: 'p1' }).allowed, true);

  const boost = game();
  boost.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: 'Ivysaur', stage: 'Stage 1', subtypes: ['Stage 1'], types: ['Grass'], retreatCost: 0 }),
    specialEnergy({ instanceId: 2, name: 'Boost Energy', text: BOOST, attachedTo: 1 })
  );
  boost.players.p1.zones.bench.push(pokemon({ instanceId: 3, name: 'Pikachu' }));
  boost.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));
  assert.equal(validateLegality(boost, { type: 'retreat', payload: { benchInstanceId: 3, discardEnergyIds: [] }, playerId: 'p1' }).allowed, false);
});

test('SE6: Coating Metal removes Weakness; Shield Energy reduces damage by 10', () => {
  const attacker = { name: 'Charmander', types: ['Fire'], instanceId: 1 };
  const steelix = { name: 'Steelix', types: ['Metal'], hp: 200, weaknesses: [{ type: 'Fire', value: '×2' }], instanceId: 20 };
  const coated = computeAttackDamage(attacker, steelix, { name: 'Ember', damage: 30 }, {
    defenderZoneCards: [steelix, { name: 'Coating Metal Energy', type: 'Energy', subtypes: ['Special'], text: COATING, attachedTo: 20 }],
  });
  assert.equal(coated.total, 30);

  const shielded = computeAttackDamage({ name: 'Pikachu', types: ['Lightning'], instanceId: 1 }, { ...steelix, weaknesses: [] }, { name: 'Zap', damage: 30 }, {
    defenderZoneCards: [steelix, { name: 'Shield Energy', type: 'Energy', subtypes: ['Special'], text: SHIELD, attachedTo: 20 }],
  });
  assert.equal(shielded.total, 20);
});

test('SE13c: two V Guard Energy reduce once, and VMAX attackers count as Pokémon V', () => {
  const host = { name: 'Snorlax', instanceId: 20 };
  const zone = [
    host,
    { name: 'V Guard Energy', type: 'Energy', subtypes: ['Special'], text: V_GUARD, attachedTo: 20 },
    { name: 'V Guard Energy', type: 'Energy', subtypes: ['Special'], text: V_GUARD, attachedTo: 20 },
  ];
  const vmax = { name: 'Zacian VMAX', subtypes: ['VMAX'] };
  assert.equal(getSpecialEnergyDamageReduction(host, zone, { attacker: vmax }), 30);
});

test('SE13e: Growing Grass HP reads the evolved top card, not the Basic', () => {
  const state = game();
  state.turn = { player: 'p2', number: 4, phase: 'main' };
  const root = pokemon({ instanceId: 1, name: 'Eevee', hp: 60, types: ['Colorless'] });
  const leafeon = createCard({ instanceId: 2, name: 'Leafeon', supertype: 'Pokémon', stage: 'Stage 1', subtypes: ['Stage 1'], hp: 110, types: ['Grass'], attachedTo: 1 });
  state.players.p1.zones.active.push(root, leafeon, specialEnergy({ instanceId: 3, name: 'Growing Grass Energy', text: GROWING, attachedTo: 1 }));
  state.players.p1.zones.bench.push(pokemon({ instanceId: 4, name: 'Pikachu' }));
  state.players.p2.zones.active.push(
    pokemon({ instanceId: 9, name: 'Machamp', types: ['Fighting'], attacks: [{ name: 'Chop', damage: 120, cost: [] }] })
  );

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 1).card.damage, 120);
  assert.ok(res.state.players.p1.zones.active.some((c) => c.instanceId === 1), '120 damage < 130 HP: still in play');
});
