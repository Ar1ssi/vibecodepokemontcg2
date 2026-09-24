// Stadium-triggered effects (design 035 slice 10): pure trigger descriptors plus
// integration through the attach / bench / retreat commands and attack W/R.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { computeAttackDamage } from '../rules/attack-engine.mjs';
import {
  stadiumOnAttachTriggers,
  stadiumOnEvolveTriggers,
  stadiumOnBenchTriggers,
  stadiumOnSwitchTriggers,
  stadiumCheckupCoinModifiers,
  stadiumRetreatCoin,
  stadiumTrainerPlayCoin,
  stadiumAttackCoinModifier,
  stadiumWeaknessOverrides,
  stadiumResistanceOverrides,
} from '../rules/stadium-triggers.mjs';

let nextId = 1500;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const stadium = (name, text) => card({ name, type: 'Trainer', trainerType: 'Stadium', text });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const energy = (name = 'Basic Fire Energy', props = {}) =>
  card({ name, type: 'Energy', subtypes: ['Basic'], types: ['Fire'], ...props });

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  p1.zones.active.push(pokemon('Ralts'));
  p2.zones.active.push(pokemon('Riolu'));
  for (let i = 0; i < 6; i++) {
    p1.zones.prizes.push(card({ name: `p1p${i}` }));
    p2.zones.prizes.push(card({ name: `p2p${i}` }));
  }
  for (let i = 0; i < 6; i++) {
    p1.zones.deck.push(card({ name: `p1d${i}` }));
    p2.zones.deck.push(card({ name: `p2d${i}` }));
  }
  return state;
}

test('stadiumOnAttachTriggers: counters and heals by type', () => {
  const snowy = stadium(
    'Calamitous Snowy Mountain',
    'Whenever any player attaches an Energy card from their hand to 1 of their Basic non-{W} Pokémon, put 2 damage counters on that Pokémon.'
  );
  assert.deepEqual(
    stadiumOnAttachTriggers(snowy, { hostTop: pokemon('Charmander', { types: ['Fire'] }), fromZone: 'hand' }),
    [{ kind: 'damage', amount: 20, source: 'Calamitous Snowy Mountain' }]
  );
  assert.deepEqual(
    stadiumOnAttachTriggers(snowy, { hostTop: pokemon('Squirtle', { types: ['Water'] }), fromZone: 'hand' }),
    []
  );
  assert.deepEqual(
    stadiumOnAttachTriggers(snowy, { hostTop: pokemon('Charmander', { types: ['Fire'] }), fromZone: 'deck' }),
    []
  );

  const dawn = stadium(
    'Dawn Stadium',
    'Whenever any player attaches an Energy card from his or her hand to {G} Pokémon or {W} Pokémon, remove 1 damage counter and all Special Conditions from that Pokémon.'
  );
  assert.deepEqual(
    stadiumOnAttachTriggers(dawn, { hostTop: pokemon('Bulbasaur', { types: ['Grass'] }), fromZone: 'hand' }),
    [{ kind: 'heal', amount: 10, cure: true, source: 'Dawn Stadium' }]
  );

  const cave = stadium(
    'Island Cave',
    'Whenever any player attaches an Energy card from his or hand to {W} Pokémon, {F} Pokémon, or {M} Pokémon, remove any Special Conditions from that Pokémon.'
  );
  assert.deepEqual(
    stadiumOnAttachTriggers(cave, { hostTop: pokemon('Beldum', { types: ['Metal'] }), fromZone: 'hand' }),
    [{ kind: 'cure', source: 'Island Cave' }]
  );
});

test('stadiumOnEvolveTriggers: Po Town, Galactic HQ, Wyndon, Battle Tower, Viridian', () => {
  const po = stadium('Po Town', 'Whenever any player plays a Pokémon from their hand to evolve 1 of their Pokémon, put 3 damage counters on that Pokémon.');
  assert.deepEqual(stadiumOnEvolveTriggers(po, { evolvedCard: pokemon('Kirlia', { stage: 'Stage 1' }), hostTop: pokemon('Ralts') }), [
    { kind: 'damage', amount: 30, source: 'Po Town' },
  ]);

  const wyndon = stadium('Wyndon Stadium', 'Whenever either player plays a Pokémon VMAX from their hand to evolve a Pokémon V during their turn, heal 100 damage from that Pokémon.');
  assert.deepEqual(
    stadiumOnEvolveTriggers(wyndon, { evolvedCard: pokemon('Charizard VMAX'), hostTop: pokemon('Charizard V') }),
    [{ kind: 'heal', amount: 100, source: 'Wyndon Stadium' }]
  );
  assert.deepEqual(stadiumOnEvolveTriggers(wyndon, { evolvedCard: pokemon('Kirlia'), hostTop: pokemon('Ralts') }), []);

  const tower = stadium('Battle Tower', 'Whenever any player plays any Pokémon from his or her hand to Level-Up 1 of his or her Pokémon, remove 4 damage counters from that Pokémon.');
  assert.deepEqual(
    stadiumOnEvolveTriggers(tower, { evolvedCard: pokemon('Garchomp LV.X'), hostTop: pokemon('Garchomp') }),
    [{ kind: 'heal', amount: 40, source: 'Battle Tower' }]
  );

  const viridian = stadium('Viridian City Gym', 'Whenever a Pokémon with Giovanni in its name evolves, its owner removes 2 damage counters from that Pokémon (or 1 if it only has 1).');
  assert.deepEqual(
    stadiumOnEvolveTriggers(viridian, { evolvedCard: pokemon("Giovanni's Nidoqueen"), hostTop: pokemon("Giovanni's Nidorina") }),
    [{ kind: 'heal', amount: 20, source: 'Viridian City Gym' }]
  );
  assert.deepEqual(stadiumOnEvolveTriggers(viridian, { evolvedCard: pokemon('Kirlia'), hostTop: pokemon('Ralts') }), []);
});

test('stadiumOnBenchTriggers: Gapejaw, Miasma Valley, Team Magma', () => {
  const gapejaw = stadium('Gapejaw Bog', 'Whenever either player puts a Basic Pokémon from their hand onto their Bench, put 2 damage counters on that Pokémon.');
  assert.deepEqual(stadiumOnBenchTriggers(gapejaw, { pokemon: pokemon('Pikachu') }), [
    { kind: 'damage', amount: 20, source: 'Gapejaw Bog' },
  ]);

  const miasma = stadium('Miasma Valley', 'Whenever any player puts a Basic Pokémon (excluding {G} or {P} Pokémon) from his or hand onto his or her Bench, put 2 damage counters on that Pokémon.');
  assert.deepEqual(stadiumOnBenchTriggers(miasma, { pokemon: pokemon('Pikachu', { types: ['Lightning'] }) }), [
    { kind: 'damage', amount: 20, source: 'Miasma Valley' },
  ]);
  assert.deepEqual(stadiumOnBenchTriggers(miasma, { pokemon: pokemon('Bulbasaur', { types: ['Grass'] }) }), []);

  const base = stadium("Team Magma's Secret Base", 'Whenever any player puts a Basic Pokémon (except for Team Magma Pokémon) from his or her hand onto his or her Bench, put 2 damage counters on that Pokémon.');
  assert.deepEqual(stadiumOnBenchTriggers(base, { pokemon: pokemon('Pikachu') }), [
    { kind: 'damage', amount: 20, source: "Team Magma's Secret Base" },
  ]);
  assert.deepEqual(stadiumOnBenchTriggers(base, { pokemon: pokemon("Team Magma's Poochyena") }), []);
});

test('stadiumOnSwitchTriggers: Spikemuth and Dust Island', () => {
  const spikemuth = stadium('Spikemuth', "Whenever a player's Active Pokémon moves to the Bench during their turn, put 2 damage counters on that Pokémon.");
  assert.deepEqual(
    stadiumOnSwitchTriggers(spikemuth, { switchedOut: pokemon('Ralts'), switchedIn: pokemon('Kirlia') }),
    [{ kind: 'damage', amount: 20, target: 'switchedOut', source: 'Spikemuth' }]
  );
  // A switch the opponent forces on their own turn is not "during their turn".
  assert.deepEqual(
    stadiumOnSwitchTriggers(spikemuth, {
      switchedOut: pokemon('Ralts'),
      switchedIn: pokemon('Kirlia'),
      duringOwnersTurn: false,
    }),
    []
  );

  const dust = stadium('Dust Island', 'Whenever either player switches their Poisoned Active Pokémon with 1 of their Benched Pokémon with the effect of a Trainer card, the new Active Pokémon is now affected by that Special Condition.');
  const poisoned = pokemon('Ralts', { poisoned: true });
  assert.deepEqual(
    stadiumOnSwitchTriggers(dust, { switchedOut: poisoned, switchedIn: pokemon('Kirlia') }),
    []
  );
  assert.deepEqual(
    stadiumOnSwitchTriggers(dust, {
      switchedOut: poisoned,
      switchedIn: pokemon('Kirlia'),
      viaTrainer: true,
    }),
    [{ kind: 'copyConditions', condition: 'Poisoned', source: 'Dust Island' }]
  );
  // A non-Poisoned Active copies nothing even under a Trainer switch.
  assert.deepEqual(
    stadiumOnSwitchTriggers(dust, {
      switchedOut: pokemon('Ralts'),
      switchedIn: pokemon('Kirlia'),
      viaTrainer: true,
    }),
    []
  );
});

test('10b coin/condition helpers: Minefield, Wela, Slumbering, Mirage, Chaos, Vermilion', () => {
  const minefield = stadium(
    "Rocket's Minefield Gym",
    'Whenever a player puts a Basic Pokémon onto his or her Bench from his or her hand, he or she flips a coin. If tails, put damage counters on that Pokémon.'
  );
  assert.deepEqual(stadiumOnBenchTriggers(minefield, { pokemon: pokemon('Pikachu') }), [
    { kind: 'damage', amount: 20, coin: 'tails', source: "Rocket's Minefield Gym" },
  ]);

  const wela = stadium(
    'Wela Volcano Park',
    "Whenever a player flips a coin for the Special Condition Burned between turns, that Special Condition isn't removed even if the result is heads."
  );
  assert.deepEqual(stadiumCheckupCoinModifiers(wela, { condition: 'Burned' }), {
    burnedPersists: true,
  });
  assert.equal(stadiumCheckupCoinModifiers(wela, { condition: 'Asleep' }), null);

  const slumbering = stadium(
    'Slumbering Forest',
    'If a Pokémon is Asleep, its owner flips 2 coins instead of 1 for that Special Condition between turns. If either of them is tails, that Pokémon is still Asleep.'
  );
  assert.deepEqual(stadiumCheckupCoinModifiers(slumbering, { condition: 'Asleep' }), {
    asleepFlips: 2,
  });
  assert.equal(stadiumCheckupCoinModifiers(slumbering, { condition: 'Burned' }), null);

  const mirage = stadium(
    'Mirage Stadium',
    "Whenever a player tries to retreat a Pokémon during his or her turn, that player flips a coin. If heads, that player retreats that Pokémon (and discards Energy normally). If tails, that Pokémon can't retreat this turn (the player doesn't discard any Energy)."
  );
  assert.deepEqual(stadiumRetreatCoin(mirage), { source: 'Mirage Stadium' });
  assert.equal(stadiumRetreatCoin(pokemon('Pikachu')), null);

  const chaos = stadium(
    'Chaos Gym',
    "Whenever a player plays a Trainer card other than a Stadium card, he or she flips a coin. If heads, that player plays that card normally. If tails, the player can't play that card."
  );
  assert.deepEqual(stadiumTrainerPlayCoin(chaos, card({ name: 'Item', type: 'Trainer', trainerType: 'Item' })), {
    source: 'Chaos Gym',
  });
  assert.equal(
    stadiumTrainerPlayCoin(chaos, card({ name: 'Stadium', type: 'Trainer', trainerType: 'Stadium' })),
    null
  );

  const vermilion = stadium(
    'Vermilion City Gym',
    "Whenever a player attacks with a Pokémon with Lt. Surge in its name, he or she may flip a coin. If heads, and if that Pokémon's attack does damage to the Defending Pokémon (after applying Weakness and Resistance), that attack does 10 more damage to the Defending Pokémon. If tails, the attacking Pokémon does 10 damage to itself in addition to whatever its attack usually does."
  );
  assert.deepEqual(stadiumAttackCoinModifier(vermilion, { attacker: pokemon("Lt. Surge's Raichu") }), {
    headsBonus: 10,
    tailsSelfDamage: 10,
    source: 'Vermilion City Gym',
  });
  assert.equal(stadiumAttackCoinModifier(vermilion, { attacker: pokemon('Pikachu') }), null);
});

test('weakness/resistance overrides', () => {
  const tomb = stadium('Ancient Tomb', "Don't apply Weakness for all Pokémon in play (excluding Pokémon-ex and Pokémon that has an owner in its name).");
  assert.deepEqual(stadiumWeaknessOverrides(tomb, { attacker: pokemon('Machamp'), defender: pokemon('Snorlax') }), { ignore: true });
  assert.deepEqual(
    stadiumWeaknessOverrides(tomb, { attacker: pokemon('Machamp'), defender: pokemon('Rocket’s Snorlax') }),
    { ignore: false }
  );

  const cinnabar = stadium('Cinnabar City Gym', 'Ignore Weakness when a {W} Pokémon does damage to a Pokémon with Blaine in its name.');
  assert.deepEqual(
    stadiumWeaknessOverrides(cinnabar, { attacker: pokemon('Blastoise', { types: ['Water'] }), defender: pokemon("Blaine's Ninetales") }),
    { ignore: true }
  );
  assert.deepEqual(
    stadiumWeaknessOverrides(cinnabar, { attacker: pokemon('Charizard', { types: ['Fire'] }), defender: pokemon("Blaine's Ninetales") }),
    { ignore: false }
  );

  const storm = stadium('Magnetic Storm', 'Each Pokémon in play has no Resistance.');
  assert.deepEqual(stadiumResistanceOverrides(storm, { attacker: pokemon('Pikachu') }), { ignore: true });

  const resistance = stadium('Resistance Gym', "Each Pokémon's Resistance is reduced by 20. (If a Pokémon's Resistance is -30, it becomes -10.)");
  assert.deepEqual(stadiumResistanceOverrides(resistance, { attacker: pokemon('Pikachu') }), { reduce: 20 });

  const pewter = stadium('Pewter City Gym', "Don't apply Resistance to any attacks made by Pokémon with Brock in their names.");
  assert.deepEqual(stadiumResistanceOverrides(pewter, { attacker: pokemon("Brock's Golbat") }), { ignore: true });
  assert.deepEqual(stadiumResistanceOverrides(pewter, { attacker: pokemon('Pikachu') }), { ignore: false });
});

test('Calamitous Snowy Mountain: attaching an Energy from hand damages the host', () => {
  const state = game();
  state.stadium = stadium(
    'Calamitous Snowy Mountain',
    'Whenever any player attaches an Energy card from their hand to 1 of their Basic non-{W} Pokémon, put 2 damage counters on that Pokémon.'
  );
  const host = state.players.p1.zones.active[0];
  const basic = energy();
  state.players.p1.zones.hand.push(basic);
  const res = applyCommand(state, {
    type: 'attachCard',
    payload: { instanceId: basic.instanceId, targetInstanceId: host.instanceId, from: 'hand' },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
});

test('Gapejaw Bog: a Basic benched with 20 HP is Knocked Out by the counters', () => {
  const state = game();
  state.stadium = stadium('Gapejaw Bog', 'Whenever either player puts a Basic Pokémon from their hand onto their Bench, put 2 damage counters on that Pokémon.');
  const fragile = pokemon('Fragile', { hp: 20 });
  state.players.p1.zones.hand.push(fragile);
  const res = applyCommand(state, {
    type: 'moveCard',
    payload: { instanceId: fragile.instanceId, from: 'hand', to: 'bench' },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  assert.ok(res.events.some((e) => e.type === 'pokemonKnockedOut' && e.instanceId === fragile.instanceId));
});

test('Spikemuth: retreating damages the Pokémon that moved to the Bench', () => {
  const state = game();
  state.stadium = stadium('Spikemuth', "Whenever a player's Active Pokémon moves to the Bench during their turn, put 2 damage counters on that Pokémon.");
  const benchMon = pokemon('Bench');
  state.players.p1.zones.bench.push(benchMon);
  const res = applyCommand(state, {
    type: 'retreat',
    payload: { benchInstanceId: benchMon.instanceId },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  const retired = res.state.players.p1.zones.bench.find((c) => c.name === 'Ralts');
  assert.equal(retired?.damage, 20);
});

test('computeAttackDamage honours the Stadium W/R overrides', () => {
  const storm = stadium('Magnetic Storm', 'Each Pokémon in play has no Resistance.');
  const base = computeAttackDamage(
    { types: ['Lightning'] },
    { name: 'Defender', resistance: { type: 'Lightning', value: 30 } },
    { damage: '50' },
    { stadium: storm }
  );
  assert.equal(base.total, 50, 'Resistance ignored');
  const without = computeAttackDamage(
    { types: ['Lightning'] },
    { name: 'Defender', resistance: { type: 'Lightning', value: 30 } },
    { damage: '50' },
    {}
  );
  assert.equal(without.total, 20);

  const tomb = stadium('Ancient Tomb', "Don't apply Weakness for all Pokémon in play (excluding Pokémon-ex and Pokémon that has an owner in its name).");
  const weakened = computeAttackDamage(
    { types: ['Fighting'] },
    { name: 'Snorlax', weakness: { type: 'Fighting', value: 2 } },
    { damage: '50' },
    { stadium: tomb }
  );
  assert.equal(weakened.total, 50);
});

// ── Slice 10b: coin/condition overrides and switch-effect hooks ─────────────

const rngOf = (...values) => {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)], shuffle: (a) => [...a] };
};

test("Rocket's Minefield Gym: tails counters the Basic benched from hand", () => {
  const setup = () => {
    const state = game();
    state.stadium = stadium(
      "Rocket's Minefield Gym",
      'Whenever a player puts a Basic Pokémon onto his or her Bench from his or her hand, he or she flips a coin. If tails, put damage counters on that Pokémon.'
    );
    const basic = pokemon('Pikachu');
    state.players.p1.zones.hand.push(basic);
    return { state, basic };
  };

  const tails = setup();
  const tailsRes = applyCommand(
    tails.state,
    {
      type: 'moveCard',
      payload: { instanceId: tails.basic.instanceId, from: 'hand', to: 'bench' },
      playerId: 'p1',
    },
    rngOf(0.9)
  );
  assert.equal(tailsRes.error, null);
  assert.equal(findCard(tailsRes.state, tails.basic.instanceId).card.damage, 20);

  const heads = setup();
  const headsRes = applyCommand(
    heads.state,
    {
      type: 'moveCard',
      payload: { instanceId: heads.basic.instanceId, from: 'hand', to: 'bench' },
      playerId: 'p1',
    },
    rngOf(0.1)
  );
  assert.equal(headsRes.error, null);
  assert.equal(findCard(headsRes.state, heads.basic.instanceId).card.damage ?? 0, 0);
});

test('Wela Volcano Park: Burned survives the heads flip; it clears without the Stadium', () => {
  const wela = stadium(
    'Wela Volcano Park',
    "Whenever a player flips a coin for the Special Condition Burned between turns, that Special Condition isn't removed even if the result is heads."
  );

  const state = game();
  state.stadium = wela;
  const active = state.players.p1.zones.active[0];
  active.burned = true;
  const res = applyCommand(
    state,
    { type: 'pass', payload: {}, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.equal(res.error, null);
  const after = findCard(res.state, active.instanceId).card;
  assert.equal(after.burned, true);
  assert.equal(after.damage, 20);

  const plain = game();
  const plainActive = plain.players.p1.zones.active[0];
  plainActive.burned = true;
  const cleared = applyCommand(
    plain,
    { type: 'pass', payload: {}, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.notEqual(findCard(cleared.state, plainActive.instanceId).card.burned, true);
});

test('Slumbering Forest: 2 coins, either tails keeps it Asleep', () => {
  const slumbering = stadium(
    'Slumbering Forest',
    'If a Pokémon is Asleep, its owner flips 2 coins instead of 1 for that Special Condition between turns. If either of them is tails, that Pokémon is still Asleep.'
  );

  const stayedState = game();
  stayedState.stadium = slumbering;
  const stayedMon = stayedState.players.p1.zones.active[0];
  stayedMon.specialCondition = 'Asleep';
  const stayed = applyCommand(
    stayedState,
    { type: 'pass', payload: {}, playerId: 'p1' },
    rngOf(0.1, 0.9)
  );
  assert.equal(
    findCard(stayed.state, stayedMon.instanceId).card.specialCondition,
    'Asleep'
  );

  const wokeState = game();
  wokeState.stadium = slumbering;
  const wokeMon = wokeState.players.p1.zones.active[0];
  wokeMon.specialCondition = 'Asleep';
  const woke = applyCommand(
    wokeState,
    { type: 'pass', payload: {}, playerId: 'p1' },
    rngOf(0.1, 0.1)
  );
  assert.notEqual(findCard(woke.state, wokeMon.instanceId).card.specialCondition, 'Asleep');
});

test('Mirage Stadium: tails blocks the retreat for the turn', () => {
  const mirage = stadium(
    'Mirage Stadium',
    "Whenever a player tries to retreat a Pokémon during his or her turn, that player flips a coin. If heads, that player retreats that Pokémon (and discards Energy normally). If tails, that Pokémon can't retreat this turn (the player doesn't discard any Energy)."
  );

  const blockedState = game();
  blockedState.stadium = mirage;
  const blockedMon = blockedState.players.p1.zones.active[0];
  const benchMon = pokemon('Bench');
  blockedState.players.p1.zones.bench.push(benchMon);
  const tails = applyCommand(
    blockedState,
    { type: 'retreat', payload: { benchInstanceId: benchMon.instanceId }, playerId: 'p1' },
    rngOf(0.9)
  );
  assert.equal(tails.error, null);
  assert.equal(
    tails.state.players.p1.zones.active.find((c) => !c.attachedTo).instanceId,
    blockedMon.instanceId
  );
  assert.equal(findCard(tails.state, blockedMon.instanceId).card.cannotRetreatUntilTurn, 3);
  const again = applyCommand(
    tails.state,
    { type: 'retreat', payload: { benchInstanceId: benchMon.instanceId }, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.match(String(again.error), /can't retreat/);

  const headsState = game();
  headsState.stadium = mirage;
  const headsBench = pokemon('Bench');
  headsState.players.p1.zones.bench.push(headsBench);
  const heads = applyCommand(
    headsState,
    { type: 'retreat', payload: { benchInstanceId: headsBench.instanceId }, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.equal(heads.error, null);
  assert.equal(
    heads.state.players.p1.zones.active.find((c) => !c.attachedTo).instanceId,
    headsBench.instanceId
  );
});

test('Chaos Gym: tails stops the Trainer card and discards it', () => {
  const chaos = stadium(
    'Chaos Gym',
    "Whenever a player plays a Trainer card other than a Stadium card, he or she flips a coin. If heads, that player plays that card normally. If tails, the player can't play that card."
  );
  const item = () =>
    card({ name: 'Test Draw', type: 'Trainer', trainerType: 'Item', text: 'Draw 2 cards.' });

  const tailsState = game();
  tailsState.stadium = chaos;
  const tailsItem = item();
  tailsState.players.p1.zones.hand.push(tailsItem);
  const tails = applyCommand(
    tailsState,
    { type: 'playTrainer', payload: { instanceId: tailsItem.instanceId }, playerId: 'p1' },
    rngOf(0.9)
  );
  assert.equal(tails.error, null);
  assert.ok(!tails.events.some((e) => e.type === 'cardsDrawn'));
  assert.ok(
    tails.state.players.p1.zones.discard.some((c) => c.instanceId === tailsItem.instanceId)
  );

  const headsState = game();
  headsState.stadium = chaos;
  const headsItem = item();
  headsState.players.p1.zones.hand.push(headsItem);
  const heads = applyCommand(
    headsState,
    { type: 'playTrainer', payload: { instanceId: headsItem.instanceId }, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.equal(heads.error, null);
  assert.ok(heads.events.some((e) => e.type === 'cardsDrawn'));
  assert.ok(
    heads.state.players.p1.zones.discard.some((c) => c.instanceId === headsItem.instanceId)
  );
});

test('Vermilion City Gym: heads adds 10, tails deals 10 to the attacker', () => {
  const vermilion = stadium(
    'Vermilion City Gym',
    "Whenever a player attacks with a Pokémon with Lt. Surge in its name, he or she may flip a coin. If heads, and if that Pokémon's attack does damage to the Defending Pokémon (after applying Weakness and Resistance), that attack does 10 more damage to the Defending Pokémon. If tails, the attacking Pokémon does 10 damage to itself in addition to whatever its attack usually does."
  );
  const setup = () => {
    const state = game();
    state.stadium = vermilion;
    const surge = card({
      name: "Lt. Surge's Raichu",
      supertype: 'Pokémon',
      hp: 120,
      stage: 'Basic',
      types: ['Lightning'],
      attacks: [{ name: 'Zap', cost: [], damage: '30' }],
    });
    state.players.p1.zones.active.splice(0, 1, surge);
    const victim = state.players.p2.zones.active[0];
    return { state, surge, victim };
  };

  const heads = setup();
  const headsRes = applyCommand(
    heads.state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.equal(headsRes.error, null);
  assert.equal(findCard(headsRes.state, heads.victim.instanceId).card.damage, 40);
  assert.equal(findCard(headsRes.state, heads.surge.instanceId).card.damage ?? 0, 0);

  const tails = setup();
  const tailsRes = applyCommand(
    tails.state,
    { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' },
    rngOf(0.9)
  );
  assert.equal(tailsRes.error, null);
  assert.equal(findCard(tailsRes.state, tails.victim.instanceId).card.damage, 30);
  assert.equal(findCard(tailsRes.state, tails.surge.instanceId).card.damage, 10);
});

test('Dust Island: a Trainer switch copies Poisoned to the new Active', () => {
  const state = game();
  state.stadium = stadium(
    'Dust Island',
    'Whenever either player switches their Poisoned Active Pokémon with 1 of their Benched Pokémon with the effect of a Trainer card, the new Active Pokémon is now affected by that Special Condition.'
  );
  const active = state.players.p1.zones.active[0];
  active.poisoned = true;
  const benchMon = pokemon('Bench');
  state.players.p1.zones.bench.push(benchMon);
  const sw = card({
    name: 'Switch',
    type: 'Trainer',
    trainerType: 'Item',
    text: 'Switch your Active Pokémon with 1 of your Benched Pokémon.',
  });
  state.players.p1.zones.hand.push(sw);
  const res = applyCommand(
    state,
    { type: 'playTrainer', payload: { instanceId: sw.instanceId }, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, benchMon.instanceId).card.poisoned, true);
  assert.notEqual(findCard(res.state, active.instanceId).card.poisoned, true);
});

test('Spikemuth: a Trainer switch counters the Pokémon moving to the Bench', () => {
  const state = game();
  state.stadium = stadium(
    'Spikemuth',
    "Whenever a player's Active Pokémon moves to the Bench during their turn, put 2 damage counters on that Pokémon."
  );
  const active = state.players.p1.zones.active[0];
  const benchMon = pokemon('Bench');
  state.players.p1.zones.bench.push(benchMon);
  const sw = card({
    name: 'Switch',
    type: 'Trainer',
    trainerType: 'Item',
    text: 'Switch your Active Pokémon with 1 of your Benched Pokémon.',
  });
  state.players.p1.zones.hand.push(sw);
  const res = applyCommand(
    state,
    { type: 'playTrainer', payload: { instanceId: sw.instanceId }, playerId: 'p1' },
    rngOf(0.1)
  );
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, active.instanceId).card.damage, 20);
});
