// Homebrew Ting-Lu ex Cursed Land (customhb set.json HB 425): "As long as this Pokémon is in the
// Active Spot, your opponent can't play any Stadium cards from their hand." A Stadium reaches the
// slot two ways — played as a Trainer (playTrainer) or dropped on the slot (moveCard) — and the
// lock holds on both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
const CURSED_LAND = SET.cards.find((c) => c.localId === '425').abilities.find((a) => a.name === 'Cursed Land');

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 200, types: ['Fighting'], ...extra });
const tingLu = () => mon('Ting-Lu ex', { abilities: [{ type: 'Ability', name: 'Cursed Land', text: CURSED_LAND.effect }] });
const stadium = (name) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: ['Stadium'], type: 'Stadium', trainerType: 'Stadium', text: 'Each Pokémon in play gets nothing.' });

function game({ p2Active, p2Bench = [] }) {
  const state = createGameState({ gameId: 'cursed-land', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize`));
  }
  state.players.p1.zones.active.push(mon('Atk'));
  state.players.p2.zones.active.push(p2Active);
  state.players.p2.zones.bench.push(...p2Bench);
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const card = stadium('Test Stadium');
  state.players.p1.zones.hand.push(card);
  return { state, card };
}

const playAsTrainer = (state, card) => applyCommand(state, { type: 'playTrainer', playerId: 'p1', payload: { instanceId: card.instanceId } }, createRng(3));
const dropOnSlot = (state, card) =>
  applyCommand(state, { type: 'moveCard', playerId: 'p1', payload: { instanceId: card.instanceId, from: 'hand', to: 'stadium' } }, createRng(3));

test('HB 425 Cursed Land text is the one under test', () => {
  assert.match(CURSED_LAND.effect, /your opponent can't play any Stadium cards from their hand/);
});

for (const [label, play] of [['played as a Trainer', playAsTrainer], ['dropped on the Stadium slot', dropOnSlot]]) {
  test(`Ting-Lu ex Active: the opponent's Stadium is refused when ${label}`, () => {
    const { state, card } = game({ p2Active: tingLu() });
    const res = play(state, card);
    assert.ok(res.error, 'refused');
    assert.match(String(res.error), /Ting-Lu ex prevents playing Stadium/);
    assert.equal(res.state.stadium ?? null, null);
  });

  test(`Ting-Lu ex on the Bench: the Stadium plays when ${label}`, () => {
    const { state, card } = game({ p2Active: mon('Other'), p2Bench: [tingLu()] });
    const res = play(state, card);
    assert.equal(res.error ?? null, null, String(res.error));
    assert.equal(res.state.stadium?.instanceId, card.instanceId);
  });
}
