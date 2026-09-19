import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import {
  evolvedView,
  topPokemonCard,
  trainerTargetCounts,
  rareCandyOptions,
  stage2EvolvesFromBasic,
  ownedCards,
} from '../rules/evolved-pokemon.mjs';
import { trainerPlayBlockReason } from '../rules/trainer-play-conditions.mjs';

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  state.players.p1.zones.deck.push(createCard({ instanceId: 900, name: 'Deck Card' }));
  state.players.p2.zones.deck.push(createCard({ instanceId: 901, name: 'Deck Card' }));
  return state;
}

function pokemon(props) {
  return createCard({ supertype: 'Pokémon', stage: 'Basic', ...props });
}

test('evolvedView: reads printed stats from the highest stage, state from the root', () => {
  const basic = pokemon({ instanceId: 1, name: 'Charmander', hp: 70, damage: 30, specialCondition: 'Burned' });
  const stage1 = pokemon({ instanceId: 2, name: 'Charmeleon', stage: 'Stage 1', hp: 100, attachedTo: 1 });
  const stage2 = pokemon({ instanceId: 3, name: 'Charizard ex', stage: 'Stage 2', hp: 330, attachedTo: 1 });
  const zone = [basic, stage2, stage1];

  assert.equal(topPokemonCard(zone, basic), stage2);
  const view = evolvedView(zone, basic);
  assert.equal(view.name, 'Charizard ex');
  assert.equal(view.hp, 330);
  assert.equal(view.instanceId, 1);
  assert.equal(view.damage, 30);
  assert.equal(view.specialCondition, 'Burned');
  assert.equal(basic.name, 'Charmander', 'the root card is not modified');
});

test('evolvedView: an unevolved Pokémon is returned as is', () => {
  const basic = pokemon({ instanceId: 1, name: 'Pikachu' });
  const energy = createCard({ instanceId: 2, supertype: 'Energy', type: 'Energy', attachedTo: 1 });
  assert.equal(evolvedView([basic, energy], basic), basic);
  assert.equal(evolvedView([], null), null);
});

test('evolvedView: a BREAK card inherits the previous evolution and adds its own', () => {
  const basic = pokemon({ instanceId: 1, name: 'Snorlax', hp: 120 });
  const stage1 = pokemon({
    instanceId: 2,
    name: 'Snorlax',
    stage: 'Stage 1',
    hp: 140,
    attachedTo: 1,
    attacks: [
      { name: 'Body Slam', damage: 30 },
      { name: 'Big Appetite', damage: 10 },
    ],
    weakness: { type: 'Fighting', value: 2 },
    retreatCost: ['Colorless', 'Colorless', 'Colorless'],
  });
  const breakCard = pokemon({
    instanceId: 3,
    name: 'Snorlax BREAK',
    stage: 'BREAK',
    hp: 180,
    attachedTo: 1,
    attacks: [{ name: 'Big Appetite', damage: 180 }],
    abilities: [{ name: 'Break Ability' }],
  });
  const zone = [basic, stage1, breakCard];

  assert.equal(topPokemonCard(zone, basic), breakCard);
  const view = evolvedView(zone, basic);
  assert.equal(view.name, 'Snorlax BREAK');
  assert.equal(view.hp, 180);
  assert.equal(view.instanceId, 1, 'state stays on the root');
  assert.deepEqual(
    view.attacks,
    [
      { name: 'Body Slam', damage: 30 },
      { name: 'Big Appetite', damage: 180 },
    ],
    "the BREAK's own attack wins on a name collision"
  );
  assert.deepEqual(view.abilities, [{ name: 'Break Ability' }]);
  assert.deepEqual(view.weakness, { type: 'Fighting', value: 2 });
  assert.deepEqual(view.retreatCost, ['Colorless', 'Colorless', 'Colorless']);
  assert.equal(stage1.name, 'Snorlax', 'the base card is not modified');
});

test('isBasicPokemon: a BREAK stage card is not Basic', async () => {
  const { isBasicPokemon } = await import('../cards.mjs');
  assert.equal(isBasicPokemon(pokemon({ name: 'Snorlax BREAK', stage: 'BREAK' })), false);
});

test('attack: an evolved Pokémon attacks with the Evolution card attacks', () => {
  const state = game();
  const basic = pokemon({ instanceId: 1, name: 'Charmander', hp: 70, attacks: [{ name: 'Ember', cost: [], damage: 10 }] });
  const evolved = pokemon({ instanceId: 2, name: 'Charmeleon', stage: 'Stage 1', hp: 100, attachedTo: 1, attacks: [{ name: 'Flare', cost: [], damage: 50 }] });
  state.players.p1.zones.active.push(basic, evolved);
  state.players.p2.zones.active.push(pokemon({ instanceId: 20, name: 'Blastoise', hp: 200 }));

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].damage, 50);
});

test('attack: damage is checked against the evolved HP, not the Basic HP', () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Machamp', hp: 200, attacks: [{ name: 'Punch', cost: [], damage: 80 }] }));
  const basic = pokemon({ instanceId: 20, name: 'Charmander', hp: 70 });
  const evolved = pokemon({ instanceId: 21, name: 'Charmeleon', stage: 'Stage 1', hp: 100, attachedTo: 20 });
  state.players.p2.zones.active.push(basic, evolved);
  state.players.p2.zones.bench.push(pokemon({ instanceId: 30, name: 'Squirtle', hp: 60 }));

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  const defender = res.state.players.p2.zones.active.find((c) => c.instanceId === 20);
  assert.ok(defender, 'an 80-damage hit does not knock out a 100 HP Charmeleon');
  assert.equal(defender.damage, 80);
});

test('knockout: an evolved Pokémon ex gives up 2 Prize cards', () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Machamp', hp: 200, attacks: [{ name: 'Smash', cost: [], damage: 400 }] }));
  for (let i = 0; i < 6; i++) state.players.p1.zones.prizes.push(createCard({ instanceId: 100 + i, name: 'Prize' }));
  const basic = pokemon({ instanceId: 20, name: 'Charmander', hp: 70 });
  const evolved = pokemon({ instanceId: 21, name: 'Charizard ex', stage: 'Stage 2', hp: 330, subtypes: ['Stage 2', 'ex'], attachedTo: 20 });
  state.players.p2.zones.active.push(basic, evolved);
  state.players.p2.zones.bench.push(pokemon({ instanceId: 30, name: 'Squirtle', hp: 60 }));

  const attackRes = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(attackRes.error, null);
  assert.equal(attackRes.state.pendingChoice.min, 2);
  const choice = attackRes.state.pendingChoice;
  const res = applyCommand(attackRes.state, {
    type: 'resolveChoice',
    payload: { choiceId: choice.choiceId, selection: choice.options.slice(0, 2).map((o) => o.instanceId) },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.prizes.length, 4);
});

test('retreat: legality uses the evolved Retreat Cost', () => {
  const state = game();
  const basic = pokemon({ instanceId: 1, name: 'Charmander', hp: 70, retreatCost: ['Colorless'] });
  const evolved = pokemon({ instanceId: 2, name: 'Charizard', stage: 'Stage 2', hp: 180, retreatCost: ['Colorless', 'Colorless', 'Colorless'], attachedTo: 1 });
  const energy = createCard({ instanceId: 3, name: 'Fire Energy', supertype: 'Energy', type: 'Energy', attachedTo: 1 });
  state.players.p1.zones.active.push(basic, evolved, energy);
  state.players.p1.zones.bench.push(pokemon({ instanceId: 10, name: 'Pikachu', hp: 60 }));

  const res = applyCommand(state, { type: 'retreat', payload: { discardEnergyIds: [3] }, playerId: 'p1' });
  assert.equal(res.error, 'Not enough energy to retreat (costs 3).');
});

test('checkup: Poison knocks out against the evolved HP', () => {
  const state = game();
  state.players.p1.zones.active.push(pokemon({ instanceId: 1, name: 'Pikachu', hp: 60 }));
  const basic = pokemon({ instanceId: 20, name: 'Charmander', hp: 70, damage: 60, specialCondition: 'Poisoned' });
  const evolved = pokemon({ instanceId: 21, name: 'Charmeleon', stage: 'Stage 1', hp: 100, attachedTo: 20 });
  state.players.p2.zones.active.push(basic, evolved);

  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' });
  assert.equal(res.error, null);
  const defender = res.state.players.p2.zones.active.find((c) => c.instanceId === 20);
  assert.ok(defender, '70 damage does not knock out a 100 HP Charmeleon');
  assert.equal(defender.damage, 70);
});

test('trainerTargetCounts: counts Rare Candy options and Tool-free Pokémon', () => {
  const state = game();
  const p1 = state.players.p1;
  p1.zones.hand.push(pokemon({ instanceId: 50, name: 'Charizard', stage: 'Stage 2' }));
  p1.zones.active.push(pokemon({ instanceId: 1, name: 'Charmander' }));
  p1.zones.active.push(pokemon({ instanceId: 2, name: 'Charmeleon', stage: 'Stage 1', attachedTo: 1 }));
  p1.zones.bench.push(pokemon({ instanceId: 10, name: 'Pikachu' }));
  p1.zones.bench.push(createCard({ instanceId: 11, name: 'Air Balloon', supertype: 'Trainer', trainerType: 'Tool', attachedTo: 10 }));

  assert.deepEqual(trainerTargetCounts(p1), { rareCandyOptionCount: 1, toolTargetCount: 1 });
});

test('stage2EvolvesFromBasic: traces the line through a known Stage 1, allows untraceable lines', () => {
  const froakie = pokemon({ name: 'Froakie' });
  const budew = pokemon({ name: 'Budew' });
  const greninja = pokemon({ name: 'Mega Greninja ex', stage: 'Stage 2', evolvesFrom: 'Frogadier' });
  const frogadier = pokemon({ name: 'Frogadier', stage: 'Stage 1', evolvesFrom: 'Froakie' });

  assert.equal(stage2EvolvesFromBasic(greninja, froakie, [frogadier]), true);
  assert.equal(stage2EvolvesFromBasic(greninja, budew, [frogadier]), false);
  assert.equal(stage2EvolvesFromBasic(greninja, budew, []), true, 'no Stage 1 seen');
  assert.equal(stage2EvolvesFromBasic(pokemon({ name: 'X', stage: 'Stage 2' }), budew, [frogadier]), true, 'no evolvesFrom');
});

test('rareCandyOptions: offers only Basics on the Stage 2 line', () => {
  const state = game();
  const p1 = state.players.p1;
  p1.zones.active.push(pokemon({ instanceId: 1, name: 'Budew' }));
  p1.zones.bench.push(pokemon({ instanceId: 2, name: 'Froakie' }));
  p1.zones.hand.push(pokemon({ instanceId: 50, name: 'Mega Greninja ex', stage: 'Stage2', evolvesFrom: 'Frogadier' }));
  p1.zones.discard.push(pokemon({ instanceId: 51, name: 'Frogadier', stage: 'Stage 1', evolvesFrom: 'Froakie' }));

  const options = rareCandyOptions(p1, ownedCards(p1));
  assert.equal(options.length, 1);
  assert.deepEqual(options[0].basics.map((c) => c.instanceId), [2]);
  p1.zones.bench.length = 0;
  assert.deepEqual(rareCandyOptions(p1, ownedCards(p1)), []);
});

const rareCandy = {
  name: 'Rare Candy',
  trainerType: 'Item',
  text: "Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it, skipping the Stage 1. You can't use this card during your first turn or on a Basic Pokémon that was put into play this turn.",
};

test('trainerPlayBlockReason: Rare Candy needs a Stage 2 that evolves from a Basic in play', () => {
  const base = { card: rareCandy, turnNumber: 5, myPrizes: 6, opponentPrizes: 6 };
  assert.match(trainerPlayBlockReason({ ...base, rareCandyOptionCount: 0 }), /Stage 2/);
  assert.equal(trainerPlayBlockReason({ ...base, rareCandyOptionCount: 1 }), null);
  assert.equal(trainerPlayBlockReason(base), null, 'unknown counts do not block');
});

test('trainerPlayBlockReason: a Tool needs a Pokémon with no Tool attached', () => {
  const tool = { name: 'Air Balloon', trainerType: 'Tool', text: 'The Retreat Cost of the Pokémon this card is attached to is 2 less.' };
  const base = { card: tool, turnNumber: 5, myPrizes: 6, opponentPrizes: 6 };
  assert.equal(trainerPlayBlockReason({ ...base, toolTargetCount: 0 }), 'No Pokémon to attach this Tool to.');
  assert.equal(trainerPlayBlockReason({ ...base, toolTargetCount: 1 }), null);
});

test('playTrainer: server rejects Rare Candy with no Stage 2 in hand', () => {
  const state = game();
  const p1 = state.players.p1;
  p1.zones.active.push(pokemon({ instanceId: 1, name: 'Charmander' }));
  p1.zones.hand.push(createCard({ instanceId: 60, supertype: 'Trainer', type: 'Trainer', ...rareCandy }));

  const res = applyCommand(state, { type: 'playTrainer', payload: { instanceId: 60 }, playerId: 'p1' });
  assert.match(res.error || '', /Stage 2/);
});

// ── Rulebook 30c 1.4: server enforces the legacy Mega/Primal turn-end ──

function evolve(state, evo, base) {
  return applyCommand(
    state,
    { type: 'attachCard', payload: { instanceId: evo, targetInstanceId: base }, playerId: 'p1' }
  );
}

function megaGame(baseName, baseProps = {}) {
  const state = game();
  state.players.p1.zones.active.push(
    pokemon({ instanceId: 1, name: baseName, hp: 180, ...baseProps })
  );
  return state;
}

test('evolve: a legacy M Venusaur-EX ends the turn when no Spirit Link is attached', () => {
  const state = megaGame('Venusaur-EX');
  state.players.p1.zones.hand.push(
    pokemon({ instanceId: 2, name: 'M Venusaur-EX', stage: 'Stage 1', hp: 230, evolvesFrom: 'Venusaur-EX' })
  );

  const res = evolve(state, 2, 1);
  assert.equal(res.error, null);
  assert.ok(res.events.some((e) => e.type === 'turnEndedByMegaEvolve'));
  assert.equal(res.state.turn.player, 'p2', 'the Mega Evolution ends the turn');
  assert.equal(res.state.turn.number, 4);
});

test('evolve: a matching Spirit Link keeps the turn after a legacy Mega Evolution', () => {
  const state = megaGame('Venusaur-EX');
  state.players.p1.zones.active.push(
    createCard({ instanceId: 3, name: 'Venusaur Spirit Link', supertype: 'Trainer', trainerType: 'Tool', attachedTo: 1 })
  );
  state.players.p1.zones.hand.push(
    pokemon({ instanceId: 2, name: 'M Venusaur-EX', stage: 'Stage 1', hp: 230, evolvesFrom: 'Venusaur-EX' })
  );

  const res = evolve(state, 2, 1);
  assert.equal(res.error, null);
  assert.ok(!res.events.some((e) => e.type === 'turnEndedByMegaEvolve'));
  assert.equal(res.state.turn.player, 'p1', 'the Spirit Link suppresses the turn-end');
});

test('evolve: a modern Mega Venusaur ex does not end the turn', () => {
  const state = megaGame('Venusaur ex');
  state.players.p1.zones.hand.push(
    pokemon({ instanceId: 2, name: 'Mega Venusaur ex', stage: 'Stage 1', hp: 280, evolvesFrom: 'Venusaur ex' })
  );

  const res = evolve(state, 2, 1);
  assert.equal(res.error, null);
  assert.ok(!res.events.some((e) => e.type === 'turnEndedByMegaEvolve'));
  assert.equal(res.state.turn.player, 'p1');
});
