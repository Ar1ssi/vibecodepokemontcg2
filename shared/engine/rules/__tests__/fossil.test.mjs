// Fossil Items played as Basic Pokémon, and the Stadiums/Items that fetch them. Card text from
// out/pkmn-trainer-cards.json; evolution lines from TCGdex (sv07-037 Tirtouga evolves from Antique
// Cover Fossil, sm11-44 Tirtouga from Unidentified Fossil, dp2-117 Skull Fossil is 50 HP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../../state.mjs';
import { createCard, isPokemon, isTrainer } from '../../cards.mjs';
import { createRng } from '../../rng.mjs';
import { applyCommand } from '../../reduce.mjs';
import { parseTrainerEffect } from '../trainer-effects.mjs';
import { parseStadiumOncePerTurn } from '../stadium-effects.mjs';
import { addCondition, hasCondition } from '../special-conditions.mjs';
import { matchesSearch } from '../search-match.mjs';
import { parseDamagePrevention } from '../ability-executors.mjs';

const ANTIQUE_COVER_TEXT =
  'Play this card as if it were a 60-HP Basic {C} Pokémon. This card can’t be affected by any Special Conditions and can’t retreat. At any time during your turn, you may discard this card from play.';
const UNIDENTIFIED_TEXT =
  'Play this card as if it were a 60-HP {C} Basic Pokémon. At any time during your turn (before your attack), you may discard this card from play. This card can’t retreat.';
const SKULL_FOSSIL_TEXT =
  'Play Skull Fossil as if it were a {C} Basic Pokémon. (Skull Fossil counts as a Trainer card as well, but if Skull Fossil is Knocked Out, this counts as a Knocked Out Pokémon.) Skull Fossil can’t be affected by any Special Conditions and can’t retreat. At any time during your turn before your attack, you may discard Skull Fossil from play. (This doesn’t count as a Knocked Out Pokémon.) Poké-BODY ⇢ Rock Skull';
const FOSSIL_QUARRY_TEXT =
  'Once during each player’s turn, that player may search their deck for up to 2 Item cards that have “Antique” in their name and put them onto their Bench. Then, that player shuffles their deck.';
const RESEARCH_LAB_TEXT =
  'Once during each player’s turn, that player may search their deck for up to 2 Pokémon that evolve from Unidentified Fossil, put those Pokémon onto their Bench, and shuffle their deck. If a player searches their deck in this way, their turn ends.';
const CARA_LISS_TEXT =
  'Search your deck for up to 2 Rare Fossil cards and put them onto your Bench. Then, shuffle your deck.';

let nextId = 100;
const card = (props) => createCard({ instanceId: nextId++, ...props });
// Deck rows arrive with type 'Trainer' (shadow.mjs / loadDeck), not just a supertype.
const fossilItem = (name, text, props = {}) =>
  card({ name, type: 'Trainer', supertype: 'Trainer', trainerType: 'Item', text, ...props });
const pokemon = (name, props = {}) => card({ name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', hp: 100, ...props });

function setup() {
  const state = createGameState({ gameId: 'fossil', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(card({ name: `Prize ${i}` }));
    for (let i = 0; i < 4; i++) state.players[id].zones.deck.push(card({ name: `Filler ${i}` }));
  }
  state.players.p1.zones.active.push(pokemon('Pidgey'));
  state.players.p2.zones.active.push(pokemon('Rattata'));
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return { state, rng: createRng(7) };
}

const run = (game, command) => {
  const res = applyCommand(game.state, { playerId: 'p1', ...command }, game.rng);
  if (res.state) game.state = res.state;
  return res;
};
const playFromHand = (game, item) => {
  game.state.players.p1.zones.hand.push(item);
  return run(game, { type: 'moveCard', payload: { instanceId: item.instanceId, from: 'hand', to: 'board' } });
};
const evolve = (game, evo, base) =>
  run(game, { type: 'attachCard', payload: { instanceId: evo.instanceId, targetInstanceId: base.instanceId } });
const resolve = (game, res, selection) =>
  run(game, { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection } });
const find = (game, zoneId, instanceId) =>
  game.state.players.p1.zones[zoneId].find((c) => c.instanceId === instanceId);

test('Antique Cover Fossil: played from hand it is a Basic Pokémon a Tirtouga can evolve from', () => {
  const game = setup();
  const fossil = fossilItem('Antique Cover Fossil', ANTIQUE_COVER_TEXT);
  const tirtouga = pokemon('Tirtouga', { stage: 'Stage1', evolvesFrom: 'Antique Cover Fossil' });
  game.state.players.p1.zones.hand.push(tirtouga);

  assert.equal(playFromHand(game, fossil).error, null);
  const benched = find(game, 'bench', fossil.instanceId);
  assert.ok(benched && isPokemon(benched) && !isTrainer(benched), 'the fossil is a Pokémon on the Bench');
  assert.equal(benched.hp, 60);

  assert.match(evolve(game, tirtouga, fossil).error || '', /just played/, 'not the turn it was played');
  game.state.turn.number = 5;
  assert.equal(evolve(game, tirtouga, fossil).error, null);
  assert.equal(find(game, 'bench', tirtouga.instanceId).attachedTo, fossil.instanceId);
});

test('fossil: it cannot retreat, but the Pokémon evolved from it can', () => {
  const game = setup();
  const fossil = fossilItem('Unidentified Fossil', UNIDENTIFIED_TEXT);
  playFromHand(game, fossil);
  const zones = game.state.players.p1.zones;
  // Swap the fossil into the Active Spot.
  const pidgey = zones.active.pop();
  zones.active.push(zones.bench.splice(zones.bench.indexOf(find(game, 'bench', fossil.instanceId)), 1)[0]);
  zones.bench.push(pidgey);
  game.state.turn.number = 5;

  const blocked = run(game, { type: 'retreat', payload: { benchInstanceId: pidgey.instanceId } });
  assert.match(blocked.error || '', /can't retreat/);

  const tirtouga = pokemon('Tirtouga', { stage: 'Stage1', evolvesFrom: 'Unidentified Fossil', retreatCost: [] });
  game.state.players.p1.zones.hand.push(tirtouga);
  assert.equal(evolve(game, tirtouga, fossil).error, null);
  const retreat = run(game, { type: 'retreat', payload: { benchInstanceId: pidgey.instanceId } });
  assert.equal(retreat.error, null);
});

test('fossil: once discarded from play it is the Item card again', () => {
  const game = setup();
  const fossil = fossilItem('Unidentified Fossil', UNIDENTIFIED_TEXT);
  playFromHand(game, fossil);
  assert.equal(run(game, { type: 'moveCard', payload: { instanceId: fossil.instanceId, from: 'bench', to: 'discard' } }).error, null);
  const discarded = find(game, 'discard', fossil.instanceId);
  assert.ok(isTrainer(discarded) && !isPokemon(discarded));
  assert.equal(discarded.playedAsPokemon, undefined);
});

test('fossil: "can’t be affected by any Special Conditions" only where printed', () => {
  const game = setup();
  const cover = fossilItem('Antique Cover Fossil', ANTIQUE_COVER_TEXT);
  const unidentified = fossilItem('Unidentified Fossil', UNIDENTIFIED_TEXT);
  playFromHand(game, cover);
  playFromHand(game, unidentified);
  const benchedCover = find(game, 'bench', cover.instanceId);
  const benchedUnidentified = find(game, 'bench', unidentified.instanceId);
  assert.equal(addCondition(benchedCover, 'Poisoned'), false);
  assert.equal(hasCondition(benchedCover, 'Poisoned'), false);
  assert.equal(addCondition(benchedUnidentified, 'Poisoned'), true);
});

test('legacy Skull Fossil: parsed as a fossil and benched at its printed HP', () => {
  assert.deepEqual(parseTrainerEffect(SKULL_FOSSIL_TEXT).steps, [{ type: 'fossilItem' }]);
  const game = setup();
  const skull = fossilItem('Skull Fossil', SKULL_FOSSIL_TEXT, { hp: 50 });
  playFromHand(game, skull);
  assert.equal(find(game, 'bench', skull.instanceId).hp, 50);
});

test('Fossil Quarry: the Antique Items it benches are Basic Pokémon', () => {
  const game = setup();
  game.state.stadium = card({ name: 'Fossil Quarry', supertype: 'Trainer', subtypes: ['Stadium'], text: FOSSIL_QUARRY_TEXT });
  const cover = fossilItem('Antique Cover Fossil', ANTIQUE_COVER_TEXT, { subtypes: ['Item'] });
  game.state.players.p1.zones.deck.push(cover);
  const res = run(game, { type: 'stadium-effect', payload: {} });
  const done = resolve(game, res, [cover.instanceId]);
  assert.equal(done.error, null);
  const benched = find(game, 'bench', cover.instanceId);
  assert.ok(benched && isPokemon(benched));
  assert.equal(benched.enteredPlayTurn, 3);
});

test('Cara Liss: only Rare Fossil cards are offered, and they land as Pokémon', () => {
  const game = setup();
  const rare = fossilItem('Rare Fossil', 'Play this card as if it were a 70-HP Basic {C} Pokémon.');
  const other = fossilItem('Nest Ball', 'Search your deck for a Basic Pokémon and put it onto your Bench.');
  game.state.players.p1.zones.deck.push(rare, other);
  const res = playFromHand(game, card({ name: 'Cara Liss', type: 'Trainer', trainerType: 'Supporter', text: CARA_LISS_TEXT }));
  assert.deepEqual(res.pendingChoice.options.map((c) => c.instanceId), [rare.instanceId]);
  resolve(game, res, [rare.instanceId]);
  assert.equal(find(game, 'bench', rare.instanceId).hp, 70);
});

test('Pokémon Research Lab: benches Pokémon that evolve from Unidentified Fossil, then the turn ends', () => {
  assert.equal(parseStadiumOncePerTurn({ text: RESEARCH_LAB_TEXT }).kind, 'search-bench');
  const game = setup();
  game.state.stadium = card({ name: 'Pokémon Research Lab', supertype: 'Trainer', subtypes: ['Stadium'], text: RESEARCH_LAB_TEXT });
  const tirtouga = pokemon('Tirtouga', { stage: 'Stage1', evolvesFrom: 'Unidentified Fossil' });
  const carracosta = pokemon('Carracosta', { stage: 'Stage2', evolvesFrom: 'Tirtouga' });
  game.state.players.p1.zones.deck.push(tirtouga, carracosta);
  const res = run(game, { type: 'stadium-effect', payload: {} });
  assert.deepEqual(res.pendingChoice.options.map((c) => c.instanceId), [tirtouga.instanceId]);
  const done = resolve(game, res, [tirtouga.instanceId]);
  assert.ok(find(game, 'bench', tirtouga.instanceId));
  assert.equal(done.state.turn.player, 'p2');
});

// The opponent (p2) attacks p1's Antique Fossil for 50, optionally spreading 30 to the Bench.
function attackFossil(abilityText, { benched = false } = {}) {
  const game = setup();
  const fossil = fossilItem('Antique Fossil', ANTIQUE_COVER_TEXT, {
    abilities: [{ type: 'Ability', name: 'Test Ability', text: abilityText }],
  });
  playFromHand(game, fossil);
  const p1 = game.state.players.p1.zones;
  if (!benched) {
    const pidgey = p1.active.pop();
    p1.active.push(p1.bench.splice(p1.bench.indexOf(find(game, 'bench', fossil.instanceId)), 1)[0]);
    p1.bench.push(pidgey);
  }
  game.state.turn = { player: 'p2', number: 4, phase: 'main' };
  const spread = benched
    ? 'This attack also does 30 damage to each of your opponent’s Benched Pokémon. (Don’t apply Weakness and Resistance for Benched Pokémon.)'
    : '';
  const active = game.state.players.p2.zones.active[0];
  active.attacks = [{ name: 'Hit', cost: [], damage: '50', text: spread }];
  const res = applyCommand(game.state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }, game.rng);
  assert.equal(res.error, null);
  const zones = res.state.players.p1.zones;
  return [...zones.active, ...zones.bench].find((c) => c.instanceId === fossil.instanceId);
}

test('Antique Dome Fossil Domed Armor: its own Ability applies once it is a Pokémon', () => {
  const hit = attackFossil('This Pokémon takes 30 less damage from attacks (after applying Weakness and Resistance).');
  assert.equal(hit.damage, 20);
});

test('Antique Cover Fossil Protective Cover: effects are prevented, damage is not', () => {
  const hit = attackFossil(
    'Prevent all effects of attacks used by your opponent’s Pokémon done to this Pokémon. (Damage is not an effect.)'
  );
  assert.equal(hit.damage, 50);
  // The parser fix holds for any Pokémon with this wording, fossil or not.
  const plain = { abilities: [{ text: 'Prevent all effects of attacks used by your opponent’s Pokémon done to this Pokémon. (Damage is not an effect.)' }] };
  assert.equal(parseDamagePrevention(plain).preventAll, false);
  const withDamage = { abilities: [{ text: 'Prevent all effects of attacks, including damage, done to this Pokémon.' }] };
  assert.equal(parseDamagePrevention(withDamage).preventAll, true);
});

test('Antique Plume Fossil Plume Protection: no attack damage while on the Bench', () => {
  const hit = attackFossil(
    'As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks from your opponent’s Pokémon.',
    { benched: true }
  );
  assert.equal(hit.damage, 0);
});

test('Fossil Excavation Map / Kit: fetch Fossil cards by name, not any card', () => {
  const map = parseTrainerEffect(
    'Choose 1: Search your deck for an Unidentified Fossil card, reveal it, and put it into your hand. Then, shuffle your deck. Put an Unidentified Fossil card from your discard pile into your hand.'
  ).steps[0];
  assert.deepEqual(map, { type: 'searchDeck', what: 'unidentified fossil', count: 1, destination: 'hand', reveal: true });
  const kit = parseTrainerEffect(
    'Put 2 in any combination of Helix Fossil Omanyte, Dome Fossil Kabuto, or Old Amber Aerodactyl cards from your discard pile into your hand.'
  ).steps[0];
  assert.equal(kit.type, 'recursion');
  assert.equal(kit.count, 2);
  assert.ok(matchesSearch({ name: 'Dome Fossil Kabuto', type: 'Trainer' }, kit.what));
  assert.ok(!matchesSearch({ name: 'Nest Ball', type: 'Trainer' }, kit.what));
});

test('Fossil Researcher: "in any combination of Amaura or Tyrunt" matches both', () => {
  const what = parseTrainerEffect(
    'Search your deck for up to 2 in any combination of Amaura or Tyrunt and put them onto your bench. Shuffle your deck afterward.'
  ).steps[0].what;
  assert.ok(matchesSearch({ name: 'Amaura', supertype: 'Pokémon', stage: 'Stage 1' }, what));
  assert.ok(matchesSearch({ name: 'Tyrunt', supertype: 'Pokémon', stage: 'Stage 1' }, what));
  assert.ok(!matchesSearch({ name: 'Pidgey', supertype: 'Pokémon' }, what));
});
