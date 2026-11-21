// SM-LOT audit: Sun & Moon through Lost Thunder Trainers, Tools and Stadiums whose TCGdex text
// (type words: "Basic Grass Pokémon", "is Colorless more") the readers missed. Every text is the
// TCGdex card the game loads (id named per case); each runs through the reducer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { listConditions } from '../rules/special-conditions.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', subtypes: ['Basic'], hp: 200, types: ['Colorless'], ...extra });
const energy = (type, attachedTo = null) =>
  createCard({ instanceId: nextId++, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType: type, attachedTo });
const trainer = (name, subtype, text, attachedTo = null) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, trainerType: subtype, text, effect: text, attachedTo });
const weakTo = (type) => ({ weakness: { type, value: 2 }, weaknesses: [{ type, value: '×2' }] });

function board() {
  nextId = 1;
  const state = createGameState({ gameId: 'sm-lot-trainers', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 8; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}
const command = (state, playerId, type, payload) => applyCommand(state, { type, playerId, payload }, createRng(3));
function resolveAll(res, pick) {
  for (let n = 0; n < 10 && !res.error && res.state.pendingChoice; n++) {
    const pc = res.state.pendingChoice;
    const selection = pick ? pick(pc) : pc.options.slice(0, Math.max(1, pc.min || 0)).map((o) => o.instanceId);
    res = command(res.state, pc.player, 'resolveChoice', { choiceId: pc.choiceId, selection });
  }
  return res;
}

/** Damage p1's 100-damage attack deals to p2's Active after `setup(state, attacker, defender)`. */
function dealt(setup, attackerExtra = {}, defenderExtra = {}) {
  const state = board();
  const attacker = mon('Attacker', { attacks: [{ name: 'Hit', cost: [], damage: '100', text: '' }], ...attackerExtra });
  const defender = mon('Defender', { hp: 500, ...defenderExtra });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(mon('Opponent Bench'));
  setup(state, attacker, defender);
  const res = resolveAll(command(state, 'p1', 'attack', { attackIndex: 0 }));
  assert.equal(res.error ?? null, null, res.reason);
  return res.state.players.p2.zones.active.find((c) => c.instanceId === defender.instanceId).damage || 0;
}

/** Retreat result for p1's Active (built by `extra`) after `setup`, paying `setup`'s returned Energy ids. */
function retreat(setup, extra = {}) {
  const state = board();
  const active = mon('Active', { retreatCost: [], ...extra });
  const bench = mon('Bench');
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(bench);
  state.players.p2.zones.active.push(mon('Opponent'));
  const discardEnergyIds = setup(state, active) || [];
  return command(state, 'p1', 'retreat', { benchInstanceId: bench.instanceId, discardEnergyIds });
}

const stadium = (name, text) => trainer(name, 'Stadium', text);

test('Aether Paradise Conservation Area (sm2-116): Basic Grass and Lightning Pokémon take 30 less', () => {
  const text = 'Basic Grass Pokémon and Basic Lightning Pokémon (both yours and your opponent’s) take 30 less damage from the opponent’s attacks (after applying Weakness and Resistance).';
  const withStadium = (types, stage = {}) => dealt((state) => { state.stadium = stadium('Aether Paradise Conservation Area', text); }, {}, { types, ...stage });
  assert.equal(withStadium(['Grass']), 70);
  assert.equal(withStadium(['Lightning']), 70);
  assert.equal(withStadium(['Water']), 100);
  assert.equal(withStadium(['Grass'], { stage: 'Stage 1', subtypes: ['Stage 1'] }), 100);
});

test('Devoured Field (sm4-93): Darkness and Dragon attacks do 10 more to the Active Pokémon', () => {
  const text = 'The attacks of Darkness Pokémon and Dragon Pokémon (both yours and your opponent’s) do 10 more damage to the opponent’s Active Pokémon (before applying Weakness and Resistance).';
  const withStadium = (types) => dealt((state) => { state.stadium = stadium('Devoured Field', text); }, { types });
  assert.equal(withStadium(['Darkness']), 110);
  assert.equal(withStadium(['Dragon']), 110);
  assert.equal(withStadium(['Fire']), 100);
});

test('Mount Lanakila (sm3-118): a Basic Pokémon’s Retreat Cost is Colorless more', () => {
  const text = 'The Retreat Cost of each Basic Pokémon in play (both yours and your opponent’s) is Colorless more.';
  assert.match(retreat((state) => { state.stadium = stadium('Mount Lanakila', text); }).error || '', /costs 1/);
  assert.equal(retreat(() => {}).error ?? null, null);
});

test('Brooklet Hill (sm2-120) benches only a Basic Water or Fighting Pokémon', () => {
  const state = board();
  state.stadium = stadium('Brooklet Hill', 'Once during each player’s turn, that player may search their deck for a Basic Water Pokémon or Basic Fighting Pokémon, put it onto their Bench, and shuffle their deck.');
  state.players.p1.zones.active.push(mon('Active'));
  state.players.p2.zones.active.push(mon('Opponent'));
  state.players.p1.zones.deck.push(mon('Wishiwashi', { types: ['Water'] }));
  let offered = [];
  const res = resolveAll(command(state, 'p1', 'stadium-effect', {}), (pc) => {
    offered = pc.options.map((o) => o.name);
    return [pc.options[0].instanceId];
  });
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(offered, ['Wishiwashi']);
  assert.deepEqual(res.state.players.p1.zones.bench.map((c) => c.name), ['Wishiwashi']);
});

test('Life Forest ◇ (sm8-180) heals 60 and cures 1 of the player’s Grass Pokémon, Benched too', () => {
  const state = board();
  state.stadium = stadium('Life Forest ◇', 'Once during each player’s turn, that player may heal 60 damage and remove all Special Conditions from 1 of their Grass Pokémon.  Whenever any player plays an Item or Supporter card from their hand, prevent all effects of that card done to this Stadium card.');
  const active = mon('Active', { types: ['Grass'], damage: 100 });
  active.specialCondition = 'Asleep';
  const benched = mon('Benched Fire', { types: ['Fire'], damage: 50 });
  state.players.p1.zones.active.push(active);
  state.players.p1.zones.bench.push(benched);
  state.players.p2.zones.active.push(mon('Opponent'));
  const res = resolveAll(command(state, 'p1', 'stadium-effect', {}), (pc) => {
    assert.ok(pc.options.every((o) => o.name === 'Active'), 'only Grass Pokémon are offered');
    return [pc.options[0].instanceId];
  });
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.players.p1.zones.active[0].damage, 40);
  assert.equal(res.state.players.p1.zones.bench[0].damage, 50);
  assert.deepEqual(listConditions(res.state.players.p1.zones.active[0]), []);
});

test('Electropower (sm8-172): Lightning attacks do 30 more this turn', () => {
  const state = board();
  const attacker = mon('Pikachu', { types: ['Lightning'], attacks: [{ name: 'Hit', cost: [], damage: '50', text: '' }] });
  state.players.p1.zones.active.push(attacker);
  state.players.p2.zones.active.push(mon('Opponent'));
  const card = trainer('Electropower', 'Item', 'During this turn, your Lightning Pokémon’s attacks do 30 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).');
  state.players.p1.zones.hand.push(card);
  let res = resolveAll(command(state, 'p1', 'playTrainer', { instanceId: card.instanceId }));
  assert.equal(res.error ?? null, null, res.reason);
  res = resolveAll(command(res.state, 'p1', 'attack', { attackIndex: 0 }));
  assert.equal(res.state.players.p2.zones.active[0].damage, 80);
});

test('Lysandre ◇ (sm6-110) Lost Zones a card from the opponent’s discard per Fire Pokémon', () => {
  const state = board();
  state.players.p1.zones.active.push(mon('Fire A', { types: ['Fire'] }));
  state.players.p1.zones.bench.push(mon('Fire B', { types: ['Fire'] }), mon('Water', { types: ['Water'] }));
  state.players.p2.zones.active.push(mon('Opponent'));
  state.players.p2.zones.discard.push(energy('Grass'), energy('Grass'), energy('Grass'));
  const card = trainer('Lysandre ◇', 'Supporter', 'For each of your Fire Pokémon in play, put a card from your opponent’s discard pile in the Lost Zone.');
  state.players.p1.zones.hand.push(card);
  const res = resolveAll(command(state, 'p1', 'playTrainer', { instanceId: card.instanceId }), (pc) =>
    pc.options.slice(0, pc.max || 1).map((o) => o.instanceId)
  );
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.players.p2.zones.lostZone.length, 2);
});

test('Escape Board (sm5-122) lets an Asleep or Paralyzed Pokémon retreat for Colorless less', () => {
  const text = 'The Retreat Cost of the Pokémon this card is attached to is Colorless less, and it can retreat even if it’s Asleep or Paralyzed.';
  for (const condition of ['Asleep', 'Paralyzed']) {
    const res = retreat((state, active) => {
      active.specialCondition = condition;
      state.players.p1.zones.active.push(trainer('Escape Board', 'Pokémon Tool', text, active.instanceId));
    }, { retreatCost: ['Colorless'] });
    assert.equal(res.error ?? null, null, `${condition}: ${res.error}`);
  }
  assert.match(retreat((state, active) => { active.specialCondition = 'Asleep'; }).error || '', /Asleep/);
});

test('Dashing Pouch (sm4-92) returns the Energy paid for the Retreat Cost to the hand', () => {
  const res = retreat((state, active) => {
    const fire = energy('Fire', active.instanceId);
    state.players.p1.zones.active.push(fire, trainer('Dashing Pouch', 'Pokémon Tool', 'If the Pokémon this card is attached to discards Energy for its Retreat Cost, put that Energy into your hand instead of the discard pile.', active.instanceId));
    return [fire.instanceId];
  }, { retreatCost: ['Colorless'] });
  assert.equal(res.error ?? null, null, res.error);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.name), ['Basic Fire Energy']);
  assert.equal(res.state.players.p1.zones.discard.length, 0);
});

test('Weakness Policy (sm3-126) and Metal Frying Pan (sm6-112) remove Weakness', () => {
  const policy = 'The Pokémon this card is attached to has no Weakness.';
  const pan = 'The Metal Pokémon this card is attached to takes 30 less damage from your opponent’s attacks (after applying Weakness and Resistance) and has no Weakness.';
  const tool = (name, text) => (state, attacker, defender) => state.players.p2.zones.active.push(trainer(name, 'Pokémon Tool', text, defender.instanceId));
  assert.equal(dealt(() => {}, { types: ['Fire'] }, weakTo('Fire')), 200);
  assert.equal(dealt(tool('Weakness Policy', policy), { types: ['Fire'] }, weakTo('Fire')), 100);
  assert.equal(dealt(tool('Metal Frying Pan', pan), { types: ['Fire'] }, { types: ['Metal'], ...weakTo('Fire') }), 70);
  assert.equal(dealt(tool('Metal Frying Pan', pan), { types: ['Fire'] }, { types: ['Grass'], ...weakTo('Fire') }), 200);
});

test('Fighting Memory (sm4-94) makes Silvally-GX a Fighting Pokémon', () => {
  const memory = (state, attacker) =>
    state.players.p1.zones.active.push(trainer('Fighting Memory', 'Pokémon Tool', 'The Silvally-GX this card is attached to is a Fighting Pokémon.', attacker.instanceId));
  assert.equal(dealt(memory, { name: 'Silvally-GX', subtypes: ['Basic', 'GX'] }, weakTo('Fighting')), 200);
  assert.equal(dealt(memory, { name: 'Type: Null' }, weakTo('Fighting')), 100);
});

/** p1 plays the Trainer `makeCard()` builds (after the board, so ids stay unique) once `setup` ran. */
function play(makeCard, setup, pick) {
  const state = board();
  const card = makeCard();
  state.players.p1.zones.active.push(mon('Active'));
  state.players.p2.zones.active.push(mon('Opponent'));
  state.players.p1.zones.hand.push(card);
  setup(state);
  return resolveAll(command(state, 'p1', 'playTrainer', { instanceId: card.instanceId }), pick);
}

test('Mysterious Treasure (sm6-113) discards a card, then finds only a Psychic or Dragon Pokémon', () => {
  const card = () => trainer('Mysterious Treasure', 'Item', 'Discard a card from your hand. If you do, search your deck for a Psychic or Dragon Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.');
  const prompts = [];
  const res = play(card, (state) => {
    state.players.p1.zones.hand.push(mon('Junk'));
    state.players.p1.zones.deck.push(mon('Mew', { types: ['Psychic'] }), mon('Charmander', { types: ['Fire'] }));
  }, (pc) => {
    prompts.push(pc.options.map((o) => o.name));
    return [pc.options.find((o) => o.name !== 'Charmander').instanceId];
  });
  assert.equal(res.error ?? null, null, res.reason);
  assert.deepEqual(prompts.at(-1), ['Mew']);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.name), ['Mew']);
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.name === 'Junk'));
});

test('The Masked Royal (sm7-139) attaches only to a Stage 2 Grass, Fire or Water Pokémon', () => {
  const card = () => trainer('The Masked Royal', 'Item', 'Attach a basic Energy card from your hand to one of your Stage 2 Grass, Fire, or Water Pokémon.');
  const res = play(card, (state) => {
    Object.assign(state.players.p1.zones.active[0], { stage: 'Stage 2', subtypes: ['Stage 2'], types: ['Psychic'] });
    state.players.p1.zones.bench.push(mon('Venusaur', { stage: 'Stage 2', subtypes: ['Stage 2'], types: ['Grass'] }));
    state.players.p1.zones.hand.push(energy('Grass'));
  }, (pc) => {
    assert.ok(!pc.options.some((o) => o.name === 'Active'), 'the Psychic Stage 2 is not a target');
    return [pc.options[0].instanceId];
  });
  assert.equal(res.error ?? null, null, res.reason);
  const venusaur = res.state.players.p1.zones.bench.find((c) => c.name === 'Venusaur');
  assert.ok(res.state.players.p1.zones.bench.some((c) => c.attachedTo === venusaur.instanceId));
});

test('Blaine’s Last Stand (sm7.5-58) draws 2 cards for each Fire Pokémon in play', () => {
  const card = () => trainer('Blaine’s Last Stand', 'Supporter', 'You can play this card only when it is the last card in your hand.\n\nDraw 2 cards for each Fire Pokémon you have in play.');
  const res = play(card, (state) => {
    state.players.p1.zones.active[0].types = ['Fire'];
    state.players.p1.zones.bench.push(mon('Fire 2', { types: ['Fire'] }), mon('Water', { types: ['Water'] }));
  });
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.players.p1.zones.hand.length, 4);
});

test('Switch Raft (sm7.5-62) needs a Water Active and heals the Pokémon moved to the Bench', () => {
  const card = () => trainer('Switch Raft', 'Item', 'Switch your Active Water Pokémon with 1 of your Benched Pokémon. If you do, heal 30 damage from the Pokémon you moved to your Bench.');
  const setup = (type) => (state) => {
    Object.assign(state.players.p1.zones.active[0], { types: [type], damage: 50 });
    state.players.p1.zones.bench.push(mon('Bench', { damage: 50 }));
  };
  assert.match(play(card, setup('Fire')).error || '', /Active Pokémon must be/);
  const res = play(card, setup('Water'));
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.players.p1.zones.active[0].name, 'Bench');
  assert.equal(res.state.players.p1.zones.active[0].damage, 50);
  assert.equal(res.state.players.p1.zones.bench.find((c) => c.name === 'Active').damage, 20);
});

test('Cyrus ◇ (sm5-120) gets its printed play condition in place of TCGdex’s wording', async () => {
  const { withPrintedStageFix } = await import('../rules/rules-state.mjs');
  const tcgdex = 'You can’t play this card if you don’t have any Water or Metal Pokémon in play.\n\nYour opponent chooses 2 Benched Pokémon and shuffles the others, and all cards attached to them, into their deck.';
  const text = withPrintedStageFix({ id: 'sm5-120', effect: tcgdex }).effect;
  const card = () => trainer('Cyrus ◇', 'Supporter', text);
  const setup = (type) => (state) => {
    state.players.p1.zones.active[0].types = [type];
    state.players.p1.zones.bench.push(mon('Benched Water', { types: ['Water'] }));
  };
  // A Water Pokémon on the Bench is not enough: the Active must be Water or Metal (pkmncards UPR 120).
  assert.match(play(card, setup('Fire')).error || '', /Active Pokémon must be/);
  assert.equal(play(card, setup('Metal')).error ?? null, null);
});
