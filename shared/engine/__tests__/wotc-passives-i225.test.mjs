// I225: WotC passive Trainers and Gyms, enforced at reducer level. Card text:
// out/tcgdex-wotc-trainers.json (TCGdex id per test), as the engine receives it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { isAbilitySuppressed, sideContextFor } from '../rules/ability-combat.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';

const WOTC = JSON.parse(fs.readFileSync(new URL('../../../out/tcgdex-wotc-trainers.json', import.meta.url), 'utf8'));
const tcgdex = (id) => WOTC.find((row) => row.id === id);

const rngOf = (...values) => {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] ?? 0.9, shuffle: (a) => [...a] };
};
const HEADS = 0.1;
const TAILS = 0.9;

let nextId = 8000;
const card = (props) => createCard({ instanceId: nextId++, ...props });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', hp: 100, stage: 'Basic', ...props });
const attacker = (name, damage = '20', props = {}) =>
  pokemon(name, { types: ['Water'], attacks: [{ name: 'Hit', cost: [], damage }], ...props });
const fire = () => card({ name: 'Fire Energy', type: 'Energy', subtypes: ['Basic'], types: ['Fire'] });
const filler = (name) => card({ name, type: 'Trainer', trainerType: 'Item', text: 'Draw a card.' });
const wotcTrainer = (id) => card({ name: tcgdex(id).name, type: 'Trainer', text: tcgdex(id).effect });
const gym = (id) => card({ name: tcgdex(id).name, type: 'Trainer', trainerType: 'Stadium', text: tcgdex(id).effect });

function setup() {
  const state = createGameState({ gameId: 'wotc-i225', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {}, supporterPlayed: false } };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(card({ name: `${id} Prize ${i}` }));
    for (let i = 0; i < 20; i++) state.players[id].zones.deck.push(filler(`${id} Deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return { state, p1: state.players.p1, p2: state.players.p2 };
}

const command = (state, type, payload, playerId = 'p1', rng = rngOf(TAILS)) =>
  applyCommand(state, { type, payload, playerId }, rng);
const playOn = (state, trainer, rng) => {
  state.players.p1.zones.hand.push(trainer);
  return command(state, 'playTrainer', { instanceId: trainer.instanceId }, 'p1', rng);
};
const attack = (state, playerId = 'p1', rng = rngOf(TAILS)) => command(state, 'attack', { attackIndex: 0 }, playerId, rng);
const damageOf = (res, instanceId) => findCard(res.state, instanceId)?.card?.damage ?? 0;

test('Misty gym1-18: +20 after W/R to an attack by a Pokémon with Misty in its name', () => {
  const run = (name) => {
    const game = setup();
    const seel = attacker(name);
    const target = pokemon('Rattata');
    game.p1.zones.active.push(seel);
    game.p2.zones.active.push(target);
    game.p1.zones.hand.push(filler('cost 1'), filler('cost 2'));
    const ask = playOn(game.state, wotcTrainer('gym1-18'));
    const paid = command(ask.state, 'resolveChoice', { choiceId: ask.pendingChoice.choiceId, selection: ask.pendingChoice.options.slice(0, 2).map((o) => o.instanceId) });
    assert.equal(paid.error, null);
    return damageOf(attack(paid.state), target.instanceId);
  };
  assert.equal(run("Misty's Seel"), 40);
  assert.equal(run('Seel'), 20);
});

test('Koga gym2-19: a Koga Pokémon that damages the Defending Pokémon this turn Poisons it', () => {
  const run = (name) => {
    const game = setup();
    game.p1.zones.active.push(attacker(name, '10'));
    const target = pokemon('Rattata');
    game.p2.zones.active.push(target);
    const played = playOn(game.state, wotcTrainer('gym2-19'));
    assert.equal(played.error, null);
    return findCard(attack(played.state).state, target.instanceId).card;
  };
  assert.equal(hasCondition(run("Koga's Grimer"), 'Poisoned'), true);
  assert.equal(hasCondition(run('Grimer'), 'Poisoned'), false);
});

test('Giovanni gym2-18: the chosen Pokémon may evolve the turn it was played', () => {
  const run = (withGiovanni) => {
    const game = setup();
    game.p1.zones.active.push(pokemon('Rattata'));
    game.p2.zones.active.push(pokemon('Pidgey'));
    const meowth = pokemon("Giovanni's Meowth", { enteredPlayTurn: 3 });
    game.p1.zones.bench.push(meowth);
    let state = game.state;
    if (withGiovanni) {
      const played = playOn(state, wotcTrainer('gym2-18'));
      assert.equal(played.error, null);
      state = played.state;
    }
    const persian = pokemon("Giovanni's Persian", { stage: 'Stage 1', evolvesFrom: "Giovanni's Meowth" });
    state.players.p1.zones.hand.push(persian);
    return command(state, 'attachCard', { instanceId: persian.instanceId, targetInstanceId: meowth.instanceId });
  };
  assert.match(run(false).error || '', /just played/);
  assert.equal(run(true).error, null);
});

test('Blaine gym2-17: the turn’s attachment may be 2 Fire Energy cards on a Pokémon with Blaine in its name', () => {
  const run = (withBlaine, secondTarget) => {
    const game = setup();
    const charmander = pokemon("Blaine's Charmander", { types: ['Fire'] });
    const other = pokemon("Blaine's Growlithe", { types: ['Fire'] });
    game.p1.zones.active.push(charmander);
    game.p1.zones.bench.push(other);
    game.p2.zones.active.push(pokemon('Pidgey'));
    const energies = [fire(), fire(), fire()];
    game.p1.zones.hand.push(...energies);
    let state = game.state;
    if (withBlaine) state = playOn(state, wotcTrainer('gym2-17')).state;
    const first = command(state, 'attachCard', { instanceId: energies[0].instanceId, targetInstanceId: charmander.instanceId });
    assert.equal(first.error, null);
    const target = secondTarget === 'other' ? other : charmander;
    const second = command(first.state, 'attachCard', { instanceId: energies[1].instanceId, targetInstanceId: target.instanceId });
    if (second.error) return { second };
    const third = command(second.state, 'attachCard', { instanceId: energies[2].instanceId, targetInstanceId: charmander.instanceId });
    return { second, third };
  };
  assert.ok(run(false).second.error, 'one attachment without Blaine');
  const planned = run(true);
  assert.equal(planned.second.error, null);
  assert.ok(planned.third.error, 'the plan allows 2, not 3');
  assert.ok(run(true, 'other').second.error, 'both go to the same Pokémon');
});

test('Goop Gas Attack base5-78: every Pokémon Power stops until the end of the opponent’s next turn', () => {
  const game = setup();
  const power = { name: 'Test Power', type: 'Pokémon Power', text: 'Once during your turn (before your attack), you may draw a card.' };
  const holder = pokemon('Holder', { abilities: [power] });
  const ability = pokemon('Modern', { abilities: [{ name: 'Test', type: 'Ability', text: power.text }] });
  game.p1.zones.active.push(holder);
  game.p1.zones.bench.push(ability);
  game.p2.zones.active.push(pokemon('Opp', { abilities: [power] }));
  assert.equal(command(game.state, 'useAbility', { instanceId: holder.instanceId }).error, null);

  const played = playOn(game.state, wotcTrainer('base5-78'));
  assert.equal(played.error, null);
  assert.ok(command(played.state, 'useAbility', { instanceId: holder.instanceId }).error, 'Powers are off');
  assert.equal(command(played.state, 'useAbility', { instanceId: ability.instanceId }).error, null, 'Abilities are not Pokémon Powers');
  assert.equal(isAbilitySuppressed(holder, sideContextFor(played.state, 'p1')), true, 'passive Powers stop too');

  const oppTurn = { ...played.state, turn: { ...played.state.turn, player: 'p2', number: 4 } };
  const oppHolder = oppTurn.players.p2.zones.active[0];
  assert.ok(command(oppTurn, 'useAbility', { instanceId: oppHolder.instanceId }, 'p2').error);
  const later = { ...played.state, turn: { ...played.state.turn, number: 5 } };
  assert.equal(isAbilitySuppressed(holder, sideContextFor(later, 'p1')), false);
});

test('Transparent Walls gym2-125: Benched Pokémon take no attack damage through the opponent’s next turn', () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Rattata'));
  const benched = pokemon('Pidgey');
  game.p1.zones.bench.push(benched);
  const spreader = pokemon('Spreader', {
    attacks: [{ name: 'Spread', cost: [], damage: '10', text: "This attack does 10 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }],
  });
  game.p2.zones.active.push(spreader);
  const played = playOn(game.state, wotcTrainer('gym2-125'));
  assert.equal(played.error, null);
  const oppTurn = { ...played.state, turn: { ...played.state.turn, player: 'p2', number: 4 } };
  const hit = attack(oppTurn, 'p2');
  assert.equal(hit.error, null);
  assert.equal(damageOf(hit, benched.instanceId), 0);
  assert.ok(hit.events.some((e) => e.type === 'damagePrevented' && e.reason === 'trainer-bench-shield'));
  const later = { ...played.state, turn: { ...played.state.turn, player: 'p2', number: 6 } };
  assert.equal(damageOf(attack(later, 'p2'), benched.instanceId), 10);
});

test('Sabrina gym2-20: all Energy cards move between Pokémon with Sabrina in their names', () => {
  const game = setup();
  const abra = pokemon("Sabrina's Abra");
  const kadabra = pokemon("Sabrina's Kadabra");
  const pikachu = pokemon('Pikachu');
  game.p1.zones.active.push(abra);
  game.p1.zones.bench.push(kadabra, pikachu);
  game.p2.zones.active.push(pokemon('Opp'));
  const energies = [fire(), fire(), card({ name: 'Double Colorless Energy', type: 'Energy', subtypes: ['Special'] })];
  for (const e of energies) {
    e.attachedTo = abra.instanceId;
    game.p1.zones.active.push(e);
  }
  const res = playOn(game.state, wotcTrainer('gym2-20'));
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null, 'the only other Sabrina Pokémon is the target');
  for (const e of energies) assert.equal(findCard(res.state, e.instanceId).card.attachedTo, kadabra.instanceId);
});

test('Chaos Gym gym2-102: on tails the opponent may use the card instead; it goes to its owner’s discard', () => {
  const game = setup();
  game.p1.zones.active.push(pokemon('Rattata'));
  game.p2.zones.active.push(pokemon('Pidgey'));
  game.state.stadium = gym('gym2-102');
  const bill = card({ name: 'Bill', type: 'Trainer', text: 'Draw 2 cards.' });
  const offer = playOn(game.state, bill, rngOf(TAILS));
  assert.equal(offer.error, null);
  assert.equal(offer.pendingChoice.player, 'p2');
  const used = command(offer.state, 'resolveChoice', { choiceId: offer.pendingChoice.choiceId, selection: [bill.instanceId] }, 'p2');
  assert.equal(used.error, null);
  assert.equal(used.state.players.p2.zones.hand.length, 2);
  assert.equal(used.state.players.p1.zones.hand.length, 0);
  assert.ok(used.state.players.p1.zones.discard.some((c) => c.instanceId === bill.instanceId));
});

test('Gyms as TCGdex prints them: Cinnabar, Pewter, Resistance, Vermilion, Viridian, Minefield, Healing Field', () => {
  const versus = (stadiumId, atk, def) => {
    const game = setup();
    game.state.stadium = gym(stadiumId);
    game.p1.zones.active.push(atk);
    game.p2.zones.active.push(def);
    return damageOf(attack(game.state), def.instanceId);
  };
  // Cinnabar City Gym gym2-113: "Water Pokémon" (word form) vs a Blaine Pokémon ignores Weakness.
  const weakToWater = (name) => pokemon(name, { types: ['Fire'], weakness: { type: 'Water', value: 2 } });
  assert.equal(versus('gym2-113', attacker('Squirtle'), weakToWater("Blaine's Vulpix")), 20);
  assert.equal(versus('gym2-113', attacker('Squirtle'), weakToWater('Vulpix')), 40);
  // Pewter City Gym gym1-115 / Resistance Gym gym2-109.
  const resists = () => pokemon('Pidgey', { resistance: { type: 'Water', value: -30 } });
  assert.equal(versus('gym1-115', attacker("Brock's Onix", '40'), resists()), 40);
  assert.equal(versus('gym1-115', attacker('Onix', '40'), resists()), 10);
  assert.equal(versus('gym2-109', attacker('Onix', '40'), resists()), 30);
  // Vermilion City Gym gym1-120: heads +10 after W/R.
  const game = setup();
  game.state.stadium = gym('gym1-120');
  game.p1.zones.active.push(attacker("Lt. Surge's Pikachu"));
  const victim = pokemon('Rattata');
  game.p2.zones.active.push(victim);
  assert.equal(damageOf(attack(game.state, 'p1', rngOf(HEADS)), victim.instanceId), 30);

  // Viridian City Gym gym2-123: a Giovanni Pokémon heals 20 when it evolves.
  const viridian = setup();
  viridian.state.stadium = gym('gym2-123');
  viridian.state.turn.number = 5;
  const meowth = pokemon("Giovanni's Meowth", { damage: 30 });
  viridian.p1.zones.active.push(meowth);
  viridian.p2.zones.active.push(pokemon('Pidgey'));
  const persian = pokemon("Giovanni's Persian", { stage: 'Stage 1', evolvesFrom: "Giovanni's Meowth" });
  viridian.p1.zones.hand.push(persian);
  const evolved = command(viridian.state, 'attachCard', { instanceId: persian.instanceId, targetInstanceId: meowth.instanceId });
  assert.equal(evolved.error, null);
  assert.equal(damageOf(evolved, meowth.instanceId), 10);

  // Rocket's Minefield Gym gym2-119: tails puts 2 damage counters on a Basic benched from hand.
  const field = setup();
  field.state.stadium = gym('gym2-119');
  field.p1.zones.active.push(pokemon('Rattata'));
  field.p2.zones.active.push(pokemon('Pidgey'));
  const benched = pokemon('Zubat');
  field.p1.zones.hand.push(benched);
  const placed = command(field.state, 'moveCard', { instanceId: benched.instanceId, from: 'hand', to: 'bench' }, 'p1', rngOf(TAILS));
  assert.equal(placed.error, null);
  assert.equal(damageOf(placed, benched.instanceId), 20);

  // Healing Field neo3-61: heads removes 2 damage counters from the Active.
  const heal = setup();
  heal.state.stadium = gym('neo3-61');
  const hurt = pokemon('Rattata', { damage: 30 });
  heal.p1.zones.active.push(hurt);
  heal.p2.zones.active.push(pokemon('Pidgey'));
  const healed = command(heal.state, 'stadium-effect', {}, 'p1', rngOf(HEADS));
  assert.equal(healed.error, null);
  assert.equal(damageOf(healed, hurt.instanceId), 10);
});

test('parse: the passive WotC Trainers carry their mechanism, not a passive marker', () => {
  const types = (id) => parseTrainerEffect(tcgdex(id).effect).steps.map((s) => s.type);
  assert.deepEqual(types('base5-78'), ['powersOff']);
  assert.deepEqual(types('gym2-125'), ['benchAttackShield']);
  assert.deepEqual(types('gym2-18'), ['freeEvolve']);
  assert.deepEqual(types('gym2-17'), ['energyAttachPlan']);
  assert.deepEqual(parseTrainerEffect(tcgdex('gym2-17').effect).steps[0], { type: 'energyAttachPlan', count: 2, energyType: 'fire', nameTag: 'blaine' });
});
