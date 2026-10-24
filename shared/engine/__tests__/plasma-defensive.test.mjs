// Team Plasma-era defensive, triggered and disruptive Abilities (cluster C). Card text is the
// corpus row named in each test (out/pkmn-pokemon-cards.json, set + number).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';
import { hasCardMarker } from '../rules/card-markers.mjs';

const ability = (name, text) => ({ name, type: 'Ability', text });
const basic = (overrides) =>
  createCard({ supertype: 'Pokémon', subtypes: ['Basic'], types: ['Psychic'], hp: 100, attacks: [], ...overrides });
const plasmaEnergy = (instanceId, extra = {}) =>
  createCard({ instanceId, name: 'Plasma Energy', supertype: 'Energy', subtypes: ['Special'], type: 'Energy', ...extra });
const basicEnergy = (instanceId, extra = {}) =>
  createCard({ instanceId, name: 'Basic Psychic Energy', supertype: 'Energy', subtypes: ['Basic'], types: ['Psychic'], ...extra });
const charizardEx = (instanceId = 1) =>
  createCard({
    instanceId,
    name: 'Charizard ex',
    subtypes: ['Stage 2', 'ex'],
    types: ['Fire'],
    hp: 330,
    attacks: [{ name: 'Burning Darkness', cost: [], damage: 180 }],
  });
const prizes = (startId) => [0, 1].map((i) => basic({ instanceId: startId + i, name: 'Prize' }));

function game() {
  const state = createGameState({
    players: { p1: { username: 'Player 1' }, p2: { username: 'Player 2' } },
    rulesEnabled: true,
  });
  state.players.p1.zones = createPlayerZones();
  state.players.p2.zones = createPlayerZones();
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.prizes.push(...prizes(900));
  state.players.p2.zones.prizes.push(...prizes(950));
  return state;
}

const attach = (state, instanceId, targetInstanceId) =>
  applyCommand(state, { type: 'attachCard', payload: { instanceId, targetInstanceId }, playerId: 'p1' });

// Pokémon-EX attack, Safeguard text: Suicune PLB 20 and Sigilyph PLF 118 print the same Ability.
const SAFEGUARD = 'Prevent all effects of attacks, including damage, done to this Pokémon by Pokémon-EX.';

test('Plasma Blast 20 Suicune Safeguard: a Pokémon-EX attack does no damage, a non-EX attack does (Plasma Freeze 118 Sigilyph too)', () => {
  for (const [name, instanceId] of [['Suicune', 20], ['Sigilyph', 118]]) {
    const exAttack = game();
    exAttack.players.p1.zones.active.push(charizardEx(1));
    exAttack.players.p2.zones.active.push(basic({ instanceId: 2, name, hp: 120, abilities: [ability('Safeguard', SAFEGUARD)] }));
    const blocked = applyCommand(exAttack, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
    assert.equal(blocked.error, null, name);
    assert.equal(blocked.state.players.p2.zones.active[0].damage || 0, 0, `${name} takes no damage from Charizard ex`);
    assert.ok(blocked.events.some((e) => e.type === 'damagePrevented'), name);

    const plainAttack = game();
    plainAttack.players.p1.zones.active.push(basic({ instanceId: 10, name: 'Pikachu', attacks: [{ name: 'Thunder Jolt', cost: [], damage: 30 }] }));
    plainAttack.players.p2.zones.active.push(basic({ instanceId: instanceId + 100, name, hp: 120, abilities: [ability('Safeguard', SAFEGUARD)] }));
    const hit = applyCommand(plainAttack, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
    assert.equal(hit.state.players.p2.zones.active[0].damage, 30, `${name} takes damage from a non-EX attacker`);
  }
});

test('Plasma Storm 31 Ludicolo Rain Dish: between turns (Pokémon Checkup) heals 20 damage from it', () => {
  const state = game();
  state.players.p1.zones.active.push(
    basic({ instanceId: 1, name: 'Ludicolo', hp: 130, damage: 30, abilities: [ability('Rain Dish', 'At any times between turns, heal 20 damage from this Pokémon.')] })
  );
  state.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Pikachu', hp: 60 }));
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].damage, 10);
  assert.ok(res.events.some((e) => e.type === 'damageUpdated' && e.healed === 20));
});

test('Plasma Blast 23 Froslass Cursed Glare: while Active it stops Special Energy from the opponent hand, Basic Energy still attaches', () => {
  const active = game();
  active.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Froslass', hp: 90, abilities: [ability('Cursed Glare', "As long as this Pokémon is your Active Pokémon, your opponent can't attach any Special Energy cards from his or her hand to his or her Pokémon.")] }));
  active.players.p1.zones.active.push(basic({ instanceId: 1, name: 'Pikachu', hp: 60 }));
  active.players.p1.zones.hand.push(plasmaEnergy(5), basicEnergy(6));
  const blocked = attach(active, 5, 1);
  assert.match(blocked.error, /stops Special Energy/);
  assert.equal(attach(active, 6, 1).error, null, 'a Basic Energy attaches');

  const benched = game();
  benched.players.p2.zones.active.push(basic({ instanceId: 3, name: 'Opp Active', hp: 100 }));
  benched.players.p2.zones.bench.push(basic({ instanceId: 2, name: 'Froslass', hp: 90, abilities: [ability('Cursed Glare', "As long as this Pokémon is your Active Pokémon, your opponent can't attach any Special Energy cards from his or her hand to his or her Pokémon.")] }));
  benched.players.p1.zones.active.push(basic({ instanceId: 1, name: 'Pikachu', hp: 60 }));
  benched.players.p1.zones.hand.push(plasmaEnergy(5));
  assert.equal(attach(benched, 5, 1).error, null, 'Cursed Glare needs Froslass in the Active Spot');
});

test('Plasma Blast 35 Drifblim Drifting Balloon: each opponent Team Plasma Pokémon in play takes {C} off its attacks', () => {
  // Team Plasma printing: TCGdex id bw10-11 (shared/engine/rules/card-markers.generated.mjs), asserted below.
  const teamPlasma = basic({ instanceId: 9, name: 'Team Plasma Probe', id: 'bw10-11', hp: 100 });
  assert.equal(hasCardMarker(teamPlasma, 'Team Plasma'), true);
  const drifblim = (instanceId = 1) =>
    basic({
      instanceId,
      name: 'Drifblim',
      hp: 100,
      abilities: [ability('Drifting Balloon', "This Pokémon's attacks cost {C} less for each of your opponent's Team Plasma Pokémon in play.")],
      attacks: [{ name: 'Derail', cost: ['Colorless', 'Colorless', 'Colorless'], damage: 70 }],
    });
  const twoEnergy = () => [basicEnergy(7, { attachedTo: 1 }), basicEnergy(8, { attachedTo: 1 })];

  const withPlasma = game();
  withPlasma.players.p1.zones.active.push(drifblim(), ...twoEnergy());
  withPlasma.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Opp Active', hp: 100 }));
  withPlasma.players.p2.zones.bench.push(teamPlasma);
  const discounted = applyCommand(withPlasma, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(discounted.error, null, 'CCC less one {C} is payable with two Energy');

  const withoutPlasma = game();
  withoutPlasma.players.p1.zones.active.push(drifblim(), ...twoEnergy());
  withoutPlasma.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Opp Active', hp: 100 }));
  withoutPlasma.players.p2.zones.bench.push(basic({ instanceId: 9, name: 'Plain Benched', hp: 100 }));
  const full = applyCommand(withoutPlasma, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.match(full.error, /Not enough energy/, 'no Team Plasma Pokémon in play: the full CCC cost stays');
});

test('Plasma Blast 11 and 97 Genesect-EX Red Signal: attaching a Plasma Energy from hand offers the switch, the pick swaps Actives', () => {
  const genesect = basic({ instanceId: 1, name: 'Genesect-EX', hp: 200, abilities: [ability('Red Signal', "When you attach a Plasma Energy from your hand to this Pokémon, you may switch 1 of your opponent's Benched Pokémon with his or her Active Pokémon.")] });
  const state = game();
  state.players.p1.zones.active.push(genesect);
  state.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Opp Active', hp: 100 }));
  state.players.p2.zones.bench.push(basic({ instanceId: 3, name: 'Opp Bench', hp: 100 }));
  state.players.p1.zones.hand.push(plasmaEnergy(5), basicEnergy(6));

  const basicAttach = attach(state, 6, 1);
  assert.equal(basicAttach.error, null);
  assert.equal(basicAttach.state.pendingChoice ?? null, null, 'a Basic Energy does not trigger Red Signal');

  const res = attach(state, 5, 1);
  assert.equal(res.error, null);
  assert.ok(res.state.pendingChoice, 'Red Signal raises the optional switch');
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.instanceId), [3]);

  const picked = applyCommand(res.state, {
    type: 'resolveChoice',
    playerId: 'p1',
    payload: { choiceId: res.state.pendingChoice.choiceId, selection: [3] },
  });
  assert.equal(picked.error, null);
  assert.equal(picked.state.players.p2.zones.active[0].instanceId, 3, 'the Benched Pokémon is now Active');
  assert.deepEqual(picked.state.players.p2.zones.bench.map((c) => c.instanceId), [2]);
});

test('Plasma Storm 39 Jellicent Spiteful Spirit: when Active and Knocked Out by an opponent attack, the Attacking Pokémon is Confused and Poisoned', () => {
  const state = game();
  state.players.p1.zones.active.push(charizardEx(1));
  state.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Jellicent', hp: 100, damage: 80, abilities: [ability('Spiteful Spirit', "If this Pokémon is your Active Pokémon and is Knocked Out by damage from an opponent's attack, the Attacking Pokémon is now Confused and Poisoned.")] }));
  state.players.p2.zones.bench.push(basic({ instanceId: 3, name: 'Bench', hp: 60 }));
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  const attacker = res.state.players.p1.zones.active[0];
  assert.equal(hasCondition(attacker, 'Confused'), true);
  assert.equal(hasCondition(attacker, 'Poisoned'), true);
});

test('Plasma Storm 58 Weezing Aftermath: when Knocked Out by an opponent attack, discard the top 3 cards of the opponent deck', () => {
  const state = game();
  state.players.p1.zones.active.push(charizardEx(1));
  state.players.p1.zones.deck.push(basic({ instanceId: 50, name: 'D1' }), basic({ instanceId: 51, name: 'D2' }), basic({ instanceId: 52, name: 'D3' }), basic({ instanceId: 53, name: 'D4' }));
  state.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Weezing', hp: 90, damage: 80, abilities: [ability('Aftermath', "When this Pokémon is Knocked Out by damage from an opponent's attack, discard the top 3 cards of your opponent's deck.")] }));
  state.players.p2.zones.bench.push(basic({ instanceId: 3, name: 'Bench', hp: 60 }));
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.deepEqual(res.state.players.p1.zones.deck.map((c) => c.instanceId), [53]);
  assert.deepEqual(res.state.players.p1.zones.discard.map((c) => c.instanceId).sort(), [50, 51, 52]);
});

test('Plasma Storm 34 Manaphy Final Wish: when Knocked Out by an opponent attack, its owner searches the deck for a card into hand, then shuffles', () => {
  const state = game();
  state.players.p1.zones.active.push(charizardEx(1));
  state.players.p2.zones.active.push(basic({ instanceId: 2, name: 'Manaphy', hp: 90, damage: 80, abilities: [ability('Final Wish', "When this Pokémon is Knocked Out by damage from an opponent's attack, search your deck for a card and put it into your hand. Shuffle your deck afterward.")] }));
  state.players.p2.zones.bench.push(basic({ instanceId: 3, name: 'Bench', hp: 60 }));
  state.players.p2.zones.deck.push(basic({ instanceId: 60, name: 'Deck A' }), basic({ instanceId: 61, name: 'Deck B' }), basic({ instanceId: 62, name: 'Deck C' }));
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.ok(res.state.pendingChoice, 'Final Wish raises a card choice for the owner');
  assert.equal(res.state.pendingChoice.player, 'p2');
  // The search comes before the turn ends: the whole deck is offered and nothing was drawn yet.
  assert.equal(res.state.turn.player, 'p1');
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.instanceId).sort(), [60, 61, 62]);
  assert.deepEqual(res.state.players.p2.zones.hand, []);

  const picked = applyCommand(res.state, {
    type: 'resolveChoice',
    playerId: 'p2',
    payload: { choiceId: res.state.pendingChoice.choiceId, selection: [62] },
  });
  assert.equal(picked.error, null);
  assert.ok(picked.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p2'));
  // Then the turn passes to p2, who draws 1 of the 2 cards left.
  assert.equal(picked.state.turn.player, 'p2');
  const hand = picked.state.players.p2.zones.hand.map((c) => c.instanceId);
  assert.equal(hand.length, 2);
  assert.ok(hand.includes(62));
  assert.equal(picked.state.players.p2.zones.deck.length, 1);
});
