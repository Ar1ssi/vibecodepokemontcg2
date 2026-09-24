import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  // Full prize rows so a single KO / trigger never ends the game mid-assertion.
  const base = { p1: 900, p2: 950 };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[pid].zones.prizes.push(
        createCard({ instanceId: base[pid] + i, name: `Prize ${pid}-${i}` })
      );
    }
    for (let i = 0; i < 10; i += 1) {
      state.players[pid].zones.deck.push(
        createCard({ instanceId: base[pid] + 100 + i, name: `Deck ${pid}-${i}` })
      );
    }
  }
  return state;
}

function pokemon(props) {
  return createCard({ supertype: 'Pokémon', stage: 'Basic', hp: 100, ...props });
}

function specialEnergy(props) {
  return createCard({ supertype: 'Energy', subtypes: ['Special Energy'], ...props });
}

test('authoritative special energy: on-attach draw', () => {
  const state = game();
  const pika = pokemon({ instanceId: 1, name: 'Pikachu', types: ['Lightning'] });
  const energy = specialEnergy({
    instanceId: 2,
    name: 'Enriching Energy',
    text: 'This card provides {C} Energy. When you attach this card from your hand to a Pokémon, draw 4 cards.',
  });
  state.players.p1.zones.active.push(pika);
  state.players.p1.zones.hand.push(energy);
  for (let i = 0; i < 5; i += 1) {
    state.players.p1.zones.deck.push(createCard({ instanceId: 100 + i, name: `D${i}` }));
  }
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 1 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 4, 'energy played, 4 drawn');
});

test('authoritative special energy: on-attach heal and damage counter', () => {
  const state = game();
  const host = pokemon({ instanceId: 1, name: 'Snorlax', hp: 150, types: ['Colorless'] });
  host.damage = 40;
  const medical = specialEnergy({
    instanceId: 2,
    name: 'Medical Energy',
    text: 'This card provides {C} Energy. When you attach this card from your hand to 1 of your Pokémon, heal 30 damage from that Pokémon.',
  });
  state.players.p1.zones.active.push(host);
  state.players.p1.zones.hand.push(medical);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 1 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  const after = findCard(res.state, 1).card;
  assert.equal(after.damage, 10, '40 - 30 heal');
});

test('authoritative special energy: on-attach search suspends on a PendingChoice', () => {
  const state = game();
  const host = pokemon({ instanceId: 1, name: 'Mew', types: ['Psychic'] });
  const energy = specialEnergy({
    instanceId: 2,
    name: 'Telepathic Energy',
    text: 'This card provides {P} Energy. When you attach this card from your hand to a {P} Pokémon, search your deck for up to 2 Basic {P} Pokémon and put them onto your Bench.',
  });
  const ralts = pokemon({ instanceId: 50, name: 'Ralts', types: ['Psychic'] });
  const ralts2 = pokemon({ instanceId: 51, name: 'Ralts', types: ['Psychic'] });
  state.players.p1.zones.active.push(host);
  state.players.p1.zones.hand.push(energy);
  state.players.p1.zones.deck.push(ralts, ralts2);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 1 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.ok(res.pendingChoice, 'a search choice is offered');
  assert.equal(res.pendingChoice.max, 2);

  const done = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [50] },
    playerId: 'p1',
  });
  assert.equal(done.error, null);
  assert.ok(done.state.players.p1.zones.bench.some((c) => c.instanceId === 50));
});

test('authoritative special energy: on-attach switch (benched host)', () => {
  const state = game();
  const active = pokemon({ instanceId: 1, name: 'Pikachu', types: ['Lightning'] });
  const benched = pokemon({ instanceId: 3, name: 'Raichu', types: ['Lightning'] });
  const energy = specialEnergy({
    instanceId: 2,
    name: 'Warp Energy',
    text: 'This card provides {C} Energy. When you attach this card from your hand to 1 of your Benched Pokémon, switch that Pokémon with your Active Pokémon.',
  });
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(benched);
  state.players.p1.zones.hand.push(energy);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 3 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active.find((c) => !c.attachedTo).instanceId, 3);
  assert.ok(res.state.players.p1.zones.bench.some((c) => c.instanceId === 1));
});

test('authoritative special energy: on-attach devolve discards the top evolution', () => {
  const state = game();
  const base = pokemon({ instanceId: 10, name: 'Froakie', hp: 60, types: ['Water'] });
  base.damage = 20;
  const top = createCard({
    instanceId: 11,
    name: 'Frogadier',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    hp: 90,
    types: ['Water'],
    attachedTo: 10,
  });
  const energy = specialEnergy({
    instanceId: 12,
    name: 'Retro Energy',
    text: 'This card provides {C} Energy. When you play this card from your hand and attach it to 1 of your Evolved Pokémon, you may remove up to 2 damage counters from that Pokémon and discard the top card from it. (This counts as devolving it.)',
  });
  state.players.p1.zones.active.push(base, top);
  state.players.p1.zones.hand.push(energy);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 12, targetInstanceId: 11 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.ok(
    res.state.players.p1.zones.discard.some((c) => c.instanceId === 11),
    'top evolution discarded'
  );
  assert.ok(
    res.state.players.p1.zones.active.some((c) => c.instanceId === 10),
    'base remains in play'
  );
  assert.equal(findCard(res.state, 10).card.damage, 0, '2 damage counters removed');
});

test('authoritative special energy: on-evolve heal', () => {
  const state = game();
  const base = pokemon({ instanceId: 10, name: 'Froakie V', hp: 180, types: ['Water'] });
  base.damage = 100;
  const energy = specialEnergy({
    instanceId: 12,
    name: 'Regenerative Energy',
    text: 'This card provides {C} Energy. Whenever you play a Pokémon from your hand to evolve the Pokémon V this card is attached to, heal 100 damage from that Pokémon.',
  });
  const evo = createCard({
    instanceId: 11,
    name: 'Frogadier V',
    supertype: 'Pokémon',
    stage: 'Stage 1',
    hp: 250,
    types: ['Water'],
  });
  state.players.p1.zones.active.push(base);
  state.players.p1.zones.hand.push(energy, evo);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  // Attach the energy first.
  const attach = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 12, targetInstanceId: 10 },
    playerId: 'p1',
  });
  assert.equal(attach.error, null);

  // Then evolve the host.
  const evolve = applyCommand(attach.state, {
    type: 'attachCard',
    payload: { instanceId: 11, targetInstanceId: 10 },
    playerId: 'p1',
  });
  assert.equal(evolve.error, null);
  assert.equal(findCard(evolve.state, 10).card.damage, 0, 'healed 100 on evolve');
});

test('authoritative special energy: on-damaged counters go on the attacker', () => {
  const state = game();
  const attacker = pokemon({
    instanceId: 1,
    name: 'Pikachu',
    hp: 120,
    types: ['Lightning'],
    attacks: [{ name: 'Zap', damage: 30, cost: [] }],
  });
  const defender = pokemon({ instanceId: 20, name: 'Squirtle', hp: 200, types: ['Water'] });
  const spiky = specialEnergy({
    instanceId: 21,
    name: 'Spiky Energy',
    attachedTo: 20,
    text: "As long as this card is attached to a Pokémon, it provides {C} Energy. If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 2 damage counters on the Attacking Pokémon.",
  });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender, spiky);

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 1).card.damage, 20, 'Spiky puts 2 counters on attacker');
});

test('authoritative special energy: on-knockout return to hand', () => {
  const state = game();
  const attacker = pokemon({
    instanceId: 1,
    name: 'Pikachu',
    hp: 120,
    types: ['Lightning'],
    attacks: [{ name: 'Big Zap', damage: 100, cost: [] }],
  });
  const defender = pokemon({ instanceId: 20, name: 'Squirtle', hp: 70, types: ['Water'] });
  const splash = specialEnergy({
    instanceId: 21,
    name: 'Splash Energy',
    attachedTo: 20,
    text: "This card provides {W} Energy only while this card is attached to a {W} Pokémon. If the {W} Pokémon this card is attached to is Knocked Out by damage from an opponent's attack, put that Pokémon into your hand.",
  });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender, splash);
  // Give the defender a full prize row so the KO does not end the game.
  state.players.p1.zones.prizes.push(createCard({ instanceId: 30, name: 'Prize 1' }));

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.ok(
    res.state.players.p2.zones.hand.some((c) => c.instanceId === 20),
    'KO\u2019d Pokémon returned to hand'
  );
});

test('authoritative special energy: end-of-turn damage counter (legacy Darkness)', () => {
  const state = game();
  const host = pokemon({ instanceId: 1, name: 'Snorlax', hp: 150, types: ['Colorless'] });
  const dark = specialEnergy({
    instanceId: 2,
    name: 'Darkness Energy',
    attachedTo: 1,
    text: "If the Pokémon Darkness Energy is attached to damages the Defending Pokémon (after applying Weakness and Resistance), the attack does 10 more damage. At the end of every turn, put 1 damage counter on the Pokémon Darkness Energy is attached to, unless it's {D} or has Dark in its name. Darkness Energy provides {D} Energy.",
  });
  state.players.p1.zones.active.push(host, dark);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 1).card.damage, 10);
});

test('authoritative special energy: Legacy once-per-game reduction is not re-applied', () => {
  const state = game();
  const attacker = pokemon({
    instanceId: 1,
    name: 'Pikachu',
    hp: 120,
    types: ['Lightning'],
    attacks: [{ name: 'Big Zap', damage: 100, cost: [] }],
  });
  const defender = pokemon({ instanceId: 20, name: 'Squirtle', hp: 70, types: ['Water'] });
  const legacy = specialEnergy({
    instanceId: 21,
    name: 'Legacy Energy',
    attachedTo: 20,
    text: "This card provides every type of Energy but provides only 1 Energy at a time. If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, that player takes 1 fewer Prize card. This effect of your Legacy Energy can't be applied more than once per game.",
  });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender, legacy);
  // A Benched Pokémon keeps the game alive after the KO.
  state.players.p2.zones.bench.push(pokemon({ instanceId: 22, name: 'Wartortle', types: ['Water'] }));
  // The once-per-game effect has already been spent.
  state.players.p2.flags = { ...(state.players.p2.flags || {}), legacyPrizeReductionUsed: true };

  const res = applyCommand(state, {
    type: 'attack',
    payload: { attackIndex: 0 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.flags.prizesOwed, 1, 'full prize owed');
});

test('authoritative special energy: on-discard return to hand (Recycle)', () => {
  const state = game();
  const host = pokemon({ instanceId: 1, name: 'Snorlax', hp: 150, types: ['Colorless'] });
  const recycle = specialEnergy({
    instanceId: 2,
    name: 'Recycle Energy',
    attachedTo: 1,
    text: 'This card provides {C} Energy. If this card is discarded from play, put it into your hand instead of the discard pile.',
  });
  state.players.p1.zones.active.push(host, recycle);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: 2, from: 'active', to: 'discard' },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.ok(
    res.state.players.p1.zones.hand.some((c) => c.instanceId === 2),
    'Recycle returned to hand'
  );
  assert.equal(res.state.players.p1.zones.discard.length, 0);
});

test('authoritative special energy: a lethal end-of-turn tick Knocks Out and awards a prize', () => {
  const state = game();
  const host = pokemon({ instanceId: 1, name: 'Snorlax', hp: 150, types: ['Colorless'] });
  host.damage = 140;
  const dark = specialEnergy({
    instanceId: 2,
    name: 'Darkness Energy',
    attachedTo: 1,
    text: "If the Pokémon Darkness Energy is attached to damages the Defending Pokémon (after applying Weakness and Resistance), the attack does 10 more damage. At the end of every turn, put 1 damage counter on the Pokémon Darkness Energy is attached to, unless it's {D} or has Dark in its name. Darkness Energy provides {D} Energy.",
  });
  state.players.p1.zones.active.push(host, dark);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active.length, 0, '0-HP Pokémon left play');
  assert.ok(
    res.state.players.p1.zones.discard.some((c) => c.instanceId === 1),
    'Knocked Out Pokémon is in the discard pile'
  );
  // The KO awards a real prize. p1 has no remaining Pokémon, so the game ends
  // and the entitlement is collected instead of waiting on a prize-choice prompt.
  assert.equal(res.state.players.p2.zones.prizes.length, 5, 'opponent was awarded a prize');
});

test('authoritative special energy: Legacy once-per-game marker survives the turn handoff', () => {
  const state = game();
  state.players.p2.flags = {
    ...(state.players.p2.flags || {}),
    legacyPrizeReductionUsed: true,
  };
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Pikachu', hp: 60 }));
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew', hp: 60 }));

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.turn.player, 'p2', 'the handoff rebuilt p2 flags');
  assert.equal(
    res.state.players.p2.flags.legacyPrizeReductionUsed,
    true,
    'the once-per-game marker was not erased by advanceTurn'
  );
});

test('authoritative special energy: type-gated triggers read the top evolution, not the Basic', () => {
  const state = game();
  const eevee = pokemon({ instanceId: 1, name: 'Eevee', hp: 70, types: ['Colorless'] });
  const espeon = createCard({
    instanceId: 3,
    name: 'Espeon',
    hp: 110,
    supertype: 'Pokémon',
    stage: 'Stage 1',
    types: ['Psychic'],
    attachedTo: 1,
  });
  const energy = specialEnergy({
    instanceId: 2,
    name: 'Telepathic Energy',
    text: 'This card provides {P} Energy. When you attach this card from your hand to a {P} Pokémon, search your deck for up to 2 Basic {P} Pokémon and put them onto your Bench.',
  });
  const ralts = pokemon({ instanceId: 50, name: 'Ralts', types: ['Psychic'] });
  state.players.p1.zones.active.push(eevee, espeon);
  state.players.p1.zones.hand.push(energy);
  state.players.p1.zones.deck.push(ralts);
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: 1 },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.ok(res.pendingChoice, 'the {P} host gate matched the Psychic evolution on a Colorless Basic');
});

test('SE10: on-attach search caps at the open Bench slots and shuffles the deck', () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Mew', types: ['Psychic'] }));
  for (let i = 0; i < 4; i += 1) {
    state.players.p1.zones.bench.push(pokemon({ instanceId: 60 + i, name: `Bench ${i}` }));
  }
  state.players.p1.zones.hand.push(
    specialEnergy({
      instanceId: 2,
      name: 'Telepathic Psychic Energy',
      text: 'As long as this card is attached to a Pokémon, it provides {P} Energy. When you attach this card from your hand to a {P} Pokémon, search your deck for up to 2 Basic {P} Pokémon and put them onto your Bench. Then, shuffle your deck.',
    })
  );
  state.players.p1.zones.deck.push(
    pokemon({ instanceId: 50, name: 'Ralts', types: ['Psychic'] }),
    pokemon({ instanceId: 51, name: 'Ralts', types: ['Psychic'] })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.max, 1, 'one Bench slot left');

  const done = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [50] },
    playerId: 'p1',
  });
  assert.equal(done.error, null);
  assert.equal(done.state.players.p1.zones.bench.filter((c) => !c.attachedTo).length, 5);
  assert.ok(done.events.some((e) => e.type === 'deckShuffled' && e.playerId === 'p1'));
});

test('SE11d: Warp Energy attached to a Benched Pokémon does not switch', () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Pikachu' }));
  state.players.p1.zones.bench.push(pokemon({ instanceId: 3, name: 'Raichu' }), pokemon({ instanceId: 4, name: 'Eevee' }));
  state.players.p1.zones.hand.push(
    specialEnergy({
      instanceId: 2,
      name: 'Warp Energy',
      text: 'Warp Energy provides {C} Energy. When you attach Warp Energy from your hand to your Active Pokémon, switch your Active Pokémon with 1 of your Benched Pokémon.',
    })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 3 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice ?? null, null);
  assert.equal(res.state.players.p1.zones.active.find((c) => !c.attachedTo).instanceId, 1);
});

test('SE11f: Cyclone Energy lets the opponent choose their new Active', () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Pikachu' }));
  state.players.p1.zones.hand.push(
    specialEnergy({
      instanceId: 2,
      name: 'Cyclone Energy',
      text: 'Cyclone Energy provides {C} Energy. When you play Cyclone Energy from your hand and attach it to your Active Pokémon, your opponent switches his or her Active Pokémon with 1 of his or her Benched Pokémon.',
    })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));
  state.players.p2.zones.bench.push(pokemon({ instanceId: 10, name: 'Roselia' }), pokemon({ instanceId: 11, name: 'Roserade' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice.player, 'p2');

  const done = applyCommand(res.state, {
    type: 'resolveChoice',
    payload: { choiceId: res.pendingChoice.choiceId, selection: [11] },
    playerId: 'p2',
  });
  assert.equal(done.error, null);
  assert.equal(done.state.players.p2.zones.active.find((c) => !c.attachedTo).instanceId, 11);
});

test('SE11b: Regenerative Energy does not heal when a non-V Pokémon evolves', () => {
  const state = game();
  const base = pokemon({ instanceId: 10, name: 'Charmander', hp: 70, types: ['Fire'] });
  base.damage = 50;
  state.players.p1.zones.active.push(
    base,
    specialEnergy({
      instanceId: 12,
      name: 'Regenerative Energy',
      attachedTo: 10,
      text: 'As long as this card is attached to a Pokémon, it provides {C} Energy. Whenever you play a Pokémon from your hand to evolve the Pokémon V this card is attached to, heal 100 damage from that Pokémon.',
    })
  );
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 11, name: 'Charmeleon', supertype: 'Pokémon', stage: 'Stage 1', evolvesFrom: 'Charmander', hp: 100, types: ['Fire'] })
  );
  state.players.p2.zones.active.push(pokemon({ instanceId: 9, name: 'Budew' }));

  const res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 11, targetInstanceId: 10 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 10).card.damage, 50);
});
