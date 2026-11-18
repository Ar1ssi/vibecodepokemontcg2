// A before-damage cost that scales damage (Rotom V Scrap Short) is counted from the events of the
// command that paid it. When the attack pauses again before damage lands (Charity's reduction
// offer), the resumed command carries the count in ctx and must not recount it from its own,
// empty, event list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { createRng } from '../../rng.mjs';
import { applyCommand } from '../../reduce.mjs';

// TCGdex gym1-99 (Charity), the same wording wotc-attach-trainers.test.mjs uses.
const CHARITY =
  'Attach Charity to your Active Pokémon. Unless that Pokémon gets Knocked Out, return Charity to your hand at the end of your turn. If that Pokémon attacks and does damage to the Defending Pokémon, you may reduce that damage by any amount (rounded to the nearest 10).';
// Rotom V Scrap Short wording, as attack-steps.test.mjs (I111) pins it.
const SCRAP_SHORT =
  'Put any number of Pokémon Tool cards from your discard pile in the Lost Zone. This attack does 40 more damage for each card you put in the Lost Zone in this way.';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 400, ...extra });
const tool = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Pokémon Tool'], type: 'Pokémon Tool' });

function scrapShortBoard() {
  nextId = 1;
  const state = createGameState({ gameId: 'reduce-resume-counts', seed: 5, rulesEnabled: false });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon('Rotom V', {
    attacks: [{ name: 'Scrap Short', cost: [], damage: '40+', text: SCRAP_SHORT }],
  });
  const charity = createCard({
    instanceId: nextId++,
    name: 'Charity',
    type: 'Trainer',
    text: CHARITY,
    attachedTo: attacker.instanceId,
  });
  state.players.p1.zones.active.push(attacker, charity);
  state.players.p2.zones.active.push(mon('Defender'));
  const tools = [tool('Tool 1'), tool('Tool 2')];
  state.players.p1.zones.discard.push(...tools);
  return { state, rng: createRng(5), tools };
}

function run(state, command, rng) {
  const res = applyCommand(state, command, rng);
  assert.equal(res.error, null);
  return res;
}

test('Scrap Short keeps its Lost Zone count across a Charity pause before damage', () => {
  const { state, rng, tools } = scrapShortBoard();
  const first = run(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, rng);
  const costChoice = first.state.pendingChoice;
  const paid = run(
    first.state,
    {
      type: 'resolveChoice',
      playerId: 'p1',
      payload: { choiceId: costChoice.choiceId, selection: tools.map((t) => t.instanceId) },
    },
    rng
  );
  const charityChoice = paid.state.pendingChoice;
  assert.equal(charityChoice.resumeToken.effectType, 'attackCharityReduction');
  assert.equal(charityChoice.resumeToken.values.lostZoned, 2);
  assert.equal(
    charityChoice.options.at(-1).name,
    'Reduce by 120',
    '40 + 2 x 40 damage is offered, so Charity can reduce all of it'
  );

  const declined = run(
    paid.state,
    {
      type: 'resolveChoice',
      playerId: 'p1',
      payload: { choiceId: charityChoice.choiceId, selection: [charityChoice.options[0].instanceId] },
    },
    rng
  );
  const defender = declined.state.players.p2.zones.active.find((c) => !c.attachedTo);
  assert.equal(defender.damage, 120, 'the resumed attack still counts both Tools');
});

// pkmn-trainer-cards: Bravery Charm [Stellar Crown 175] "The Basic Pokémon this card is attached
// to gets +50 HP."
test('Confused self-damage is checked against effective HP, Tool bonus included', () => {
  nextId = 1;
  const state = createGameState({ gameId: 'reduce-confused-hp', seed: 5, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const attacker = mon('Wobbly', { hp: 30, attacks: [{ name: 'Tackle', cost: [], damage: '10', text: '' }] });
  attacker.specialCondition = 'Confused';
  const charm = createCard({
    instanceId: nextId++,
    name: 'Bravery Charm',
    supertype: 'Trainer',
    type: 'Pokémon Tool',
    trainerType: 'Pokémon Tool',
    subtypes: ['Pokémon Tool'],
    text: 'The Basic Pokémon this card is attached to gets +50 HP.',
    attachedTo: attacker.instanceId,
  });
  state.players.p1.zones.active.push(attacker, charm);
  state.players.p2.zones.active.push(mon('Defender'));

  const res = run(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, {
    next: () => 0.9,
    shuffle: (cards) => [...cards],
  });
  assert.ok(res.events.some((e) => e.type === 'attackConfusedFizzle'), 'the confusion flip came up tails');
  assert.ok(!res.events.some((e) => e.type === 'pokemonKnockedOut'), '30 damage on 80 effective HP is not a KO');
  const active = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.equal(active?.instanceId, attacker.instanceId);
  assert.equal(active.damage, 30);
});
