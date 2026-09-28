// Attack grants (design 049 slice 4): Abilities, Tools and a Trainer that let other Pokémon use
// attacks they do not print. Card text: corpus rows Relicanth (Temporal Forces 084) Memory Dive,
// Aerodactyl (Neo Revelation 15) Prehistoric Memory, Honchkrow (Mysterious Treasures 10) Dark
// Genes, Memory Capsule (Vivid Voltage 155), Memory Berry (Aquapolis 128, Platinum 110), Recall
// (Gym Heroes 116).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, attackExtrasFor } from '../reduce.mjs';
import { parseAttackGrant } from '../rules/attack-copy.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

const MEMORY_DIVE =
  'Each of your evolved Pokémon can use any attack from its previous Evolutions. (You still need the necessary Energy to use each attack.)';
const PREHISTORIC_MEMORY =
  "Whenever an Evolved Pokémon attacks (even if it's your opponent's), it can use any attack from its Basic Pokémon card or any Evolution card attached to it. It still has to pay for that attack's Energy cost. This power stops working while Aerodactyl is Asleep, Confused, or Paralyzed.";
const DARK_GENES =
  "As long as Honchkrow has the Energy necessary to use its attack, each of your Murkrow can use Honchkrow's attack as its own without the Energy necessary to use that attack.";
const MEMORY_CAPSULE =
  'The Pokémon this card is attached to can use any attack from its previous Evolutions. (You still need the necessary Energy to use each attack.)';
const MEMORY_BERRY_AQ =
  'Attach Memory Berry to 1 of your Pokémon that doesn’t have a Pokémon Tool attached to it. If that Pokémon is Knocked Out, discard this card. The Pokémon this card is attached to can use any attack from its Basic Pokémon card or any Evolution card from which the Pokémon evolved. (You still have to pay for that attack’s Energy cost.) Discard this card at the end of any turn the Pokémon attacks.';
const MEMORY_BERRY_PL =
  'The Pokémon this card is attached to can use any attack from its Basic Pokémon or its Stage 1 Evolution card. (You still have to pay for that attack’s Energy cost.)';
const RECALL =
  'For your attack this turn, your Active Pokémon can use any attack from its Basic Pokémon card or any Evolution card attached to it. (You still have to pay for that attack’s Energy cost.)';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, ...extra });
const attack = (name, damage = '10', cost = []) => ({ name, cost, damage, text: '' });
const withAbility = (name, text, extra = {}) =>
  mon(name, { abilities: [{ name: 'Test', type: 'Ability', text }], ...extra });
const tool = (name, text, attachedTo) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Pokémon Tool'], text, attachedTo });
const energy = (type, attachedTo) =>
  createCard({ instanceId: nextId++, name: `${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], types: [type], attachedTo });

function board() {
  nextId = 1;
  const state = createGameState({ gameId: 'attack-grants', seed: 4, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 8; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

/** A Stage 2 stack in `zone`: Basic root (Basic Hit 30 {R}), Stage 1 (Mid Hit 40), Stage 2 (Top Hit 90). */
function stage2(state, playerId, zone = 'active') {
  const basic = mon('Basic Mon', { attacks: [attack('Basic Hit', '30', ['Fire'])] });
  const mid = mon('Mid Mon', { stage: 'Stage 1', attachedTo: basic.instanceId, attacks: [attack('Mid Hit', '40')] });
  const top = mon('Top Mon', { stage: 'Stage 2', hp: 300, attachedTo: basic.instanceId, attacks: [attack('Top Hit', '90')] });
  state.players[playerId].zones[zone].push(basic, mid, top);
  return basic;
}

const extras = (state, card) => attackExtrasFor(state, card).map((a) => a.name);
const attackCmd = (state, attackIndex) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex } }, createRng(4));

test('parseAttackGrant: every grant wording', () => {
  assert.deepEqual(parseAttackGrant(MEMORY_DIVE), { recipients: 'ownEvolved', from: 'priorEvolutions', powerStatus: null });
  assert.deepEqual(parseAttackGrant(PREHISTORIC_MEMORY), {
    recipients: 'allEvolved',
    from: 'priorEvolutions',
    powerStatus: 'rotation',
  });
  assert.deepEqual(parseAttackGrant(DARK_GENES), {
    recipients: 'ownNamed',
    recipientName: 'murkrow',
    from: 'holderAttacks',
    costFree: true,
    holderMustPay: true,
    powerStatus: null,
  });
  assert.equal(parseAttackGrant(MEMORY_CAPSULE).discardAfterAttack, false);
  assert.equal(parseAttackGrant(MEMORY_BERRY_AQ).discardAfterAttack, true);
  assert.equal(parseAttackGrant(MEMORY_BERRY_PL).recipients, 'host');
  assert.equal(parseAttackGrant(RECALL).recipients, 'active');
  assert.equal(parseAttackGrant('Draw 2 cards.'), null);
  assert.deepEqual(parseTrainerEffect(RECALL).steps, [{ type: 'evolutionAttacksTurn' }]);
});

test('Memory Dive: an evolved Pokémon lists its previous Evolutions and pays their cost', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  state.players.p1.zones.bench.push(withAbility('Relicanth', MEMORY_DIVE));
  state.players.p2.zones.active.push(mon('Foe', { hp: 200 }));
  assert.deepEqual(extras(state, basic), ['Basic Hit', 'Mid Hit']);
  assert.ok(attackCmd(state, 1).error, 'Basic Hit still costs {R}');
  state.players.p1.zones.active.push(energy('Fire', basic.instanceId));
  const res = attackCmd(state, 1);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 30);
});

test('Memory Dive: nothing for an unevolved Pokémon or for the other player', () => {
  const state = board();
  const lone = mon('Lone Basic', { attacks: [attack('Tackle')] });
  state.players.p1.zones.active.push(lone);
  state.players.p1.zones.bench.push(withAbility('Relicanth', MEMORY_DIVE));
  const oppBasic = stage2(state, 'p2');
  assert.deepEqual(extras(state, lone), []);
  assert.deepEqual(extras(state, oppBasic), [], "the opponent's Relicanth grants only its owner");
});

test("Prehistoric Memory: both players' evolved Pokémon; off while Aerodactyl is Confused", () => {
  const state = board();
  const aerodactyl = withAbility('Aerodactyl', PREHISTORIC_MEMORY);
  state.players.p1.zones.bench.push(aerodactyl);
  const own = stage2(state, 'p1');
  const opp = stage2(state, 'p2');
  assert.deepEqual(extras(state, own), ['Basic Hit', 'Mid Hit']);
  assert.deepEqual(extras(state, opp), ['Basic Hit', 'Mid Hit']);
  aerodactyl.specialCondition = 'Confused';
  assert.deepEqual(extras(state, own), []);
});

test("Dark Genes: Murkrow uses Honchkrow's attack at no cost while Honchkrow can pay for it", () => {
  const state = board();
  const murkrow = mon('Murkrow', { attacks: [attack('Peck')] });
  const honchkrow = withAbility('Honchkrow', DARK_GENES, {
    stage: 'Stage 1',
    attacks: [attack('Dark Wing Flaps', '50', ['Darkness', 'Darkness', 'Colorless'])],
  });
  state.players.p1.zones.active.push(murkrow);
  state.players.p1.zones.bench.push(honchkrow);
  state.players.p2.zones.active.push(mon('Foe', { hp: 200 }));
  assert.deepEqual(extras(state, murkrow), [], 'Honchkrow has no Energy');

  state.players.p1.zones.bench.push(
    energy('Darkness', honchkrow.instanceId),
    energy('Darkness', honchkrow.instanceId),
    energy('Darkness', honchkrow.instanceId)
  );
  const granted = attackExtrasFor(state, murkrow);
  assert.deepEqual(granted.map((a) => [a.name, a.cost.length, a.grantedBy]), [['Dark Wing Flaps', 0, 'Honchkrow']]);
  const res = attackCmd(state, 1);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 50);
  assert.deepEqual(extras(state, honchkrow), [], 'Honchkrow is not a Murkrow');
});

test('Memory Capsule: an evolved host lists prior attacks; a Basic host gets nothing', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  state.players.p1.zones.active.push(tool('Memory Capsule', MEMORY_CAPSULE, basic.instanceId));
  const lone = mon('Lone Basic', { attacks: [attack('Tackle')] });
  state.players.p1.zones.bench.push(lone, tool('Memory Capsule', MEMORY_CAPSULE, lone.instanceId));
  assert.deepEqual(extras(state, basic), ['Basic Hit', 'Mid Hit']);
  assert.deepEqual(extras(state, lone), []);
});

test('Memory Capsule: a Tool-negating Stadium turns the grant off', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  state.players.p1.zones.active.push(tool('Memory Capsule', MEMORY_CAPSULE, basic.instanceId));
  state.stadium = createCard({
    instanceId: 999,
    name: 'Tool Jammer Stadium',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: 'Pokémon Tools attached to each Pokémon (both yours and your opponent’s) have no effect.',
  });
  assert.deepEqual(extras(state, basic), []);
});

test('Memory Berry: the Aquapolis print is discarded at the end of a turn its Pokémon attacks', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  state.players.p1.zones.active.push(tool('Memory Berry', MEMORY_BERRY_AQ, basic.instanceId));
  state.players.p2.zones.active.push(mon('Foe', { hp: 300 }));
  const res = attackCmd(state, 2);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 40, 'Mid Hit');
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.name === 'Memory Berry'));
});

test('Memory Berry: the Platinum print stays after its Pokémon attacks', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  state.players.p1.zones.active.push(tool('Memory Berry', MEMORY_BERRY_PL, basic.instanceId));
  state.players.p2.zones.active.push(mon('Foe', { hp: 300 }));
  const res = attackCmd(state, 2);
  assert.equal(res.error, null);
  assert.ok(res.state.players.p1.zones.active.some((c) => c.name === 'Memory Berry'));
});

test('Recall: the flag grants the Active prior attacks this turn only', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  const benched = stage2(state, 'p1', 'bench');
  state.players.p2.zones.active.push(mon('Foe', { hp: 300 }));
  state.players.p1.flags.evolutionAttacksTurn = true;
  assert.deepEqual(extras(state, basic), ['Basic Hit', 'Mid Hit']);
  assert.deepEqual(extras(state, benched), [], 'only the Active');
  const res = attackCmd(state, 2);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.flags.evolutionAttacksTurn, undefined, 'cleared when the turn ends');
});

test('an evolved Pokémon with no grant cannot use its previous Evolutions (evolution cards are not Tools)', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  state.players.p2.zones.active.push(mon('Foe', { hp: 300 }));
  assert.deepEqual(extras(state, basic), []);
  assert.equal(attackCmd(state, 1).error, 'Unknown attack.');
});

test('Memory Berry: a Tool-negating Stadium keeps it attached (it has no effect)', () => {
  const state = board();
  const basic = stage2(state, 'p1');
  state.players.p1.zones.active.push(tool('Memory Berry', MEMORY_BERRY_AQ, basic.instanceId));
  state.players.p2.zones.active.push(mon('Foe', { hp: 300 }));
  state.stadium = createCard({
    instanceId: 999,
    name: 'Tool Jammer Stadium',
    supertype: 'Trainer',
    subtypes: ['Stadium'],
    text: 'Pokémon Tools attached to each Pokémon (both yours and your opponent’s) have no effect.',
  });
  const res = attackCmd(state, 0);
  assert.equal(res.error, null);
  assert.ok(res.state.players.p1.zones.active.some((c) => c.name === 'Memory Berry'));
});
