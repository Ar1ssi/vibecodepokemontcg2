// customhb Poison Barb (customhb-346, set.json effect): a {D} holder heals 10, any other holder
// takes 20, both during Pokémon Checkup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { toolCheckupEffect } from '../rules/tool-attacks.mjs';

const TEXT =
  'If the Pokémon this card is attached to is a {D} Pokémon, heal 10 damage from that Pokémon during Pokémon Checkup. Otherwise, that Pokémon takes 20 damage during Pokémon Checkup.';

let nextId = 3000;
const mon = (name, type, extra = {}) =>
  createCard({ instanceId: nextId++, name, type: 'Pokémon', stage: 'Basic', types: [type], hp: 100, ...extra });
const barbOn = (holder) =>
  createCard({
    instanceId: nextId++,
    name: 'Poison Barb',
    type: 'Trainer',
    supertype: 'Trainer',
    trainerType: 'Tool',
    text: TEXT,
    effect: TEXT,
    attachedTo: holder.instanceId,
  });

/** p1 passes; `p2` lists the opponent's cards (Active first, then Bench and Tools). */
function passTurn({ p2Active, p2Rest = [] }) {
  const state = createGameState({ gameId: 'barb', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    const zones = createPlayerZones();
    if (id === 'p1') zones.active.push(mon('Own', 'Colorless'));
    else {
      zones.active.push(p2Active);
      for (const card of p2Rest) (card.attachedTo != null && card.supertype === 'Trainer' ? zones.active : zones.bench).push(card);
    }
    zones.bench.push(mon(`${id} bench`, 'Colorless'));
    for (let i = 0; i < 6; i++) zones.prizes.push(mon(`${id} prize`, 'Colorless'));
    for (let i = 0; i < 10; i++) zones.deck.push(mon(`${id} deck`, 'Colorless'));
    state.players[id] = { playerId: id, username: id, zones, flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const res = applyCommand(state, { type: 'pass', payload: {}, playerId: 'p1' }, createRng(1));
  assert.equal(res.error, null);
  return res.state;
}
const find = (state, card) => {
  for (const player of Object.values(state.players)) {
    for (const cards of Object.values(player.zones)) {
      const found = cards.find((c) => c.instanceId === card.instanceId);
      if (found) return found;
    }
  }
  return null;
};

test('parses the Poison Barb text and ignores other Tools', () => {
  assert.deepEqual(toolCheckupEffect({ name: 'Poison Barb', supertype: 'Trainer', text: TEXT }), {
    symbol: 'D',
    heal: 10,
    damage: 20,
  });
  assert.equal(toolCheckupEffect({ name: 'Float Stone', supertype: 'Trainer', text: 'No retreat cost.' }), null);
});

test('a non-{D} holder takes 20 damage at Checkup', () => {
  const holder = mon('Wooper', 'Water');
  const state = passTurn({ p2Active: holder, p2Rest: [barbOn(holder)] });
  assert.equal(find(state, holder).damage, 20);
});

test('a {D} holder heals 10 and takes no damage (Mareanie)', () => {
  const damaged = mon('Mareanie', 'Darkness', { damage: 30 });
  const clean = mon('Mareanie', 'Darkness');
  const state = passTurn({ p2Active: damaged, p2Rest: [barbOn(damaged), clean, barbOn(clean)] });
  assert.equal(find(state, damaged).damage, 20);
  assert.equal(find(state, clean).damage || 0, 0);
});

test('the Barb also hits a Benched holder', () => {
  const benched = mon('Wooper', 'Water');
  const state = passTurn({ p2Active: mon('Opp', 'Colorless'), p2Rest: [benched, barbOn(benched)] });
  assert.equal(find(state, benched).damage, 20);
});

test('Checkup damage from Poison Barb can Knock Out its holder', () => {
  const holder = mon('Wooper', 'Water', { hp: 20 });
  const state = passTurn({ p2Active: holder, p2Rest: [barbOn(holder)] });
  assert.equal(find(state, holder)?.zoneId ?? null, null);
  assert.ok(state.players.p2.zones.discard.some((c) => c.instanceId === holder.instanceId));
});
