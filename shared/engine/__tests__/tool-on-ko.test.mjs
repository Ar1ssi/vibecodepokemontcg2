// On-damage / on-KO Tool effects (design 035 slice 9, audit F2): real printed texts
// driven through an attack that damages or Knocks Out the defender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

let nextId = 900;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const energy = (name = 'Basic Fire Energy', props = {}) =>
  card({ name, type: 'Energy', subtypes: ['Basic'], types: ['Fire'], ...props });
const tool = (name, text, props = {}) =>
  card({ name, type: 'Trainer', trainerType: 'Tool', text, ...props });

function game({ p1Active, p2Active, p1Bench = [], p2Bench = [], decks = 4, prizes = 6 } = {}) {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.active.push(p1Active);
  state.players.p2.zones.active.push(p2Active);
  state.players.p1.zones.bench.push(...p1Bench);
  state.players.p2.zones.bench.push(...p2Bench);
  for (let i = 0; i < prizes; i++) {
    state.players.p1.zones.prizes.push(card({ name: `p1 prize ${i}` }));
    state.players.p2.zones.prizes.push(card({ name: `p2 prize ${i}` }));
  }
  for (let i = 0; i < decks; i++) {
    state.players.p1.zones.deck.push(card({ name: `p1 deck ${i}` }));
    state.players.p2.zones.deck.push(card({ name: `p2 deck ${i}` }));
  }
  return state;
}

const attacker = (props = {}) =>
  card({
    name: 'Buzzwole',
    hp: 130,
    types: ['Fighting'],
    subtypes: ['Ultra Beast'],
    attacks: [{ name: 'KO Punch', cost: [], damage: 200 }],
    ...props,
  });
const defender = (props = {}) =>
  card({ name: 'Defender', hp: 100, types: ['Colorless'], ...props });

function attack(state, rng) {
  return applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' }, rng);
}

const attach = (state, playerId, cardToAttach, host) => {
  cardToAttach.attachedTo = host.instanceId;
  state.players[playerId].zones.active.push(cardToAttach);
  return cardToAttach;
};
const attachBench = (state, playerId, cardToAttach, host) => {
  cardToAttach.attachedTo = host.instanceId;
  state.players[playerId].zones.bench.push(cardToAttach);
  return cardToAttach;
};

test('Rescue Scarf returns the Knocked Out Pokémon to hand instead of the discard pile', () => {
  const victim = defender();
  const scarf = tool(
    'Rescue Scarf',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack, put that Pokémon into your hand. (Discard all cards attached to that Pokémon.)'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', scarf, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.players.p2.zones.hand.some((c) => c.instanceId === victim.instanceId));
  assert.ok(!res.state.players.p2.zones.discard.some((c) => c.instanceId === victim.instanceId));
});

test('Billowing Smoke denies the Prizes for the Knock Out', () => {
  const victim = defender();
  const smoke = tool(
    'Billowing Smoke',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, that player discards any Prize cards they would take for that Knock Out instead of putting those cards into their hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', smoke, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  const ko = res.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(ko.prizeCount, 0);
  assert.ok(!res.state.players.p1.flags.prizesOwed);
});

test('Energy Pouch puts all basic Energy on the victim into hand', () => {
  const victim = defender();
  const pouch = tool(
    'Energy Pouch',
    'If the Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, put all basic Energy attached to that Pokémon into your hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  const e1 = energy();
  const e2 = energy();
  attach(state, 'p2', pouch, victim);
  attach(state, 'p2', e1, victim);
  attach(state, 'p2', e2, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(res.state.players.p2.zones.hand.some((c) => c.instanceId === e1.instanceId));
  assert.ok(res.state.players.p2.zones.hand.some((c) => c.instanceId === e2.instanceId));
  assert.ok(!res.state.players.p2.zones.discard.some((c) => c.instanceId === e1.instanceId));
});

test("Exp. Share (on a Benched Pokémon) moves a Basic Energy from the KO'd Active", () => {
  const benchMon = defender({ name: 'Bench Holder' });
  const state = game({ p1Active: attacker(), p2Active: defender(), p2Bench: [benchMon] });
  const share = tool(
    'Exp. Share',
    'When your Active Pokémon is Knocked Out by damage from an attack from your opponent’s Pokémon, you may move a Basic Energy from that Pokémon to the Pokémon this card is attached to.'
  );
  const basic = energy();
  attachBench(state, 'p2', share, benchMon);
  attach(state, 'p2', basic, state.players.p2.zones.active[0]);
  const res = attack(state);
  assert.equal(res.error, null);
  const moved = [...res.state.players.p2.zones.active, ...res.state.players.p2.zones.bench].find(
    (c) => c.instanceId === basic.instanceId
  );
  assert.equal(moved?.attachedTo, benchMon.instanceId, 'the Energy follows the holder');
  assert.ok(!res.state.players.p2.zones.discard.some((c) => c.instanceId === basic.instanceId));
});

test('Cursed Shovel mills the top 2 of the attacker deck', () => {
  const victim = defender();
  const shovel = tool(
    'Cursed Shovel',
    'If the Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, discard the top 2 cards of your opponent’s deck.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, decks: 5 });
  attach(state, 'p2', shovel, victim);
  const top = state.players.p1.zones.deck.slice(0, 2).map((c) => c.instanceId);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.deepEqual(
    res.state.players.p1.zones.discard
      .filter((c) => top.includes(c.instanceId))
      .map((c) => c.instanceId)
      .sort(),
    top.sort()
  );
});

test('Cursed Duster discards a random card from the attacker hand', () => {
  const victim = defender();
  const duster = tool(
    'Cursed Duster',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, discard a random card from your opponent’s hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', duster, victim);
  state.players.p1.zones.hand.push(card({ name: 'h1' }), card({ name: 'h2' }), card({ name: 'h3' }));
  const res = attack(state, { next: () => 0.5, shuffle: (a) => [...a] });
  assert.equal(res.error, null);
  assert.equal(
    res.state.players.p1.zones.hand.filter((c) => String(c.name).startsWith('h')).length,
    2,
    'one of the three hand cards was discarded'
  );
  assert.equal(res.state.players.p1.zones.discard.length >= 1, true);
});

test('Lucky Egg draws the victim up to 7 cards on Knock Out', () => {
  const victim = defender();
  const egg = tool(
    'Lucky Egg',
    'If the Pokémon this card is attached to is Knocked Out by damage from an opponent’s attack, draw cards until you have 7 cards in your hand.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, decks: 9 });
  attach(state, 'p2', egg, victim);
  state.players.p2.zones.hand.push(card({ name: 'p2 h1' }));
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.hand.length, 7);
});

test('Amulet of Hope searches up to 3 cards on Knock Out', () => {
  const victim = defender();
  const amulet = tool(
    'Amulet of Hope',
    'If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent’s Pokémon, search your deck for up to 3 cards and put them into your hand. Then, shuffle your deck.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, decks: 6 });
  attach(state, 'p2', amulet, victim);
  const res = attack(state, { next: () => 0.5, shuffle: (a) => [...a] });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.hand.length, 3);
  assert.equal(res.state.players.p2.zones.deck.length, 3);
});

test("Beast Bringer (attacker-side) takes 1 more Prize when the Ultra Beast KOs a GX", () => {
  const victim = defender({ name: 'Charizard-GX', hp: 100, subtypes: ['GX'] });
  const bringer = tool(
    'Beast Bringer',
    'If you have exactly 6 Prize cards remaining, and if your opponent’s Active Pokémon-GX or Pokémon-EX is Knocked Out by damage from an attack of the Ultra Beast this card is attached to, take 1 more Prize card.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p1', bringer, state.players.p1.zones.active[0]);
  const res = attack(state);
  assert.equal(res.error, null);
  const ko = res.events.find((e) => e.type === 'pokemonKnockedOut');
  assert.equal(ko.prizeCount, 3, 'GX base 2 + Beast Bringer 1');
});

test("Team Rocket's Hypnotizer puts the Attacking Pokémon to Sleep on damage", () => {
  const victim = defender({ name: "Team Rocket's Mewtwo", hp: 200 });
  const hypnotizer = tool(
    "Team Rocket's Hypnotizer",
    'If the Team Rocket’s Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Team Rocket’s Pokémon is Knocked Out), the Attacking Pokémon is now Asleep.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', hypnotizer, victim);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(
    res.events.some(
      (e) => e.type === 'statusApplied' && e.condition === 'Asleep' && e.instanceId === state.players.p1.zones.active[0].instanceId
    ),
    'the Attacking Pokémon is put to Sleep'
  );
});

test('Handheld Fan moves an Energy from the Attacking Pokémon to the attacker Bench', () => {
  const benchMon = defender({ name: 'p1 Bench' });
  const victim = defender({ name: 'Tank', hp: 300 });
  const fan = tool(
    'Handheld Fan',
    'If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent’s Pokémon (even if this Pokémon is Knocked Out), move an Energy from the Attacking Pokémon to 1 of your opponent’s Benched Pokémon.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim, p1Bench: [benchMon] });
  attach(state, 'p2', fan, victim);
  const basic = energy();
  attach(state, 'p1', basic, state.players.p1.zones.active[0]);
  const res = attack(state);
  assert.equal(res.error, null);
  const moved = res.state.players.p1.zones.bench.find((c) => c.instanceId === basic.instanceId);
  assert.equal(moved?.attachedTo, benchMon.instanceId);
});

test('Focus Band flips a coin and prevents the Knock Out on heads (F6)', () => {
  const victim = defender();
  const band = tool(
    'Focus Band',
    'If the Pokémon Focus Band is attached to would be Knocked Out by your opponent’s attack, flip a coin. If heads, that Pokémon is not Knocked Out and its remaining HP become 10 instead. Then, discard Focus Band.'
  );
  const state = game({ p1Active: attacker(), p2Active: victim });
  attach(state, 'p2', band, victim);
  const heads = attack(state, { next: () => 0.1, shuffle: (a) => [...a] });
  assert.equal(heads.error, null);
  assert.equal(heads.state.players.p2.zones.active[0]?.damage, 90, 'survives at 10 HP');
  assert.ok(heads.events.some((e) => e.type === 'koPrevented' && e.tool === 'Focus Band'));
  assert.ok(!heads.state.players.p2.zones.active.some((c) => c.instanceId === band.instanceId), 'Focus Band is discarded');

  const state2 = game({ p1Active: attacker(), p2Active: defender() });
  attach(state2, 'p2', tool('Focus Band', band.text), state2.players.p2.zones.active[0]);
  const tails = attack(state2, { next: () => 0.9, shuffle: (a) => [...a] });
  assert.equal(tails.error, null);
  assert.equal(tails.state.players.p2.zones.active.length, 0, 'tails is a Knock Out');
});
