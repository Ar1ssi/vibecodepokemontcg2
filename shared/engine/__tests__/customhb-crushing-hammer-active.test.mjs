// Homebrew Crushing Hammer, reworded (source: the user's scan of the card, 2026-11-20, verbatim):
// "Flip a coin. If heads, discard an Energy from your opponent's Active Pokémon."
// The printed Crushing Hammer (corpus: Crown Zenith 125) reaches "1 of your opponent's Pokémon".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

const ACTIVE_TEXT = 'Flip a coin. If heads, discard an Energy from your opponent’s Active Pokémon.';
const PRINTED_TEXT = 'Flip a coin. If heads, discard an Energy from 1 of your opponent’s Pokémon.';
// Seeds whose first coin is heads / tails with this test's createRng.
const HEADS_SEED = 15849;
const TAILS_SEED = 11;

let nextId = 1;
const mon = (name) => createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, types: ['Colorless'] });
const energy = (host) =>
  createCard({ instanceId: nextId++, name: 'Basic Fire Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Fire', attachedTo: host.instanceId });

function play(text, seed) {
  const state = createGameState({ gameId: 'hammer', seed, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon('prize'));
  }
  const defender = mon('Def');
  const benched = mon('Bench');
  const activeEnergy = energy(defender);
  const benchEnergy = energy(benched);
  state.players.p1.zones.active.push(mon('Atk'));
  state.players.p2.zones.active.push(defender, activeEnergy);
  state.players.p2.zones.bench.push(benched, benchEnergy);
  const hammer = createCard({
    instanceId: nextId++, name: 'Crushing Hammer', supertype: 'Trainer', subtypes: ['Item'], type: 'Item', trainerType: 'Item', text,
  });
  state.players.p1.zones.hand.push(hammer);
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const res = applyCommand(state, { type: 'playTrainer', playerId: 'p1', payload: { instanceId: hammer.instanceId } }, createRng(seed));
  return { res, activeEnergy, benchEnergy };
}

test('the Active wording parses to a coin flip whose heads discards from the Active only', () => {
  const effect = parseTrainerEffect(ACTIVE_TEXT);
  const flip = (effect.steps || [effect]).find((s) => s.type === 'coinFlip') || effect;
  assert.equal(flip.type, 'coinFlip');
  assert.deepEqual(flip.heads, [{ type: 'discardEnergyFromOpponent', energy: 'any Energy', count: 1, scope: 'Active' }]);
  assert.deepEqual(flip.tails, []);
});

test('heads: only the Active Pokémon’s Energy is offered, and it is discarded', () => {
  const { res, activeEnergy } = play(ACTIVE_TEXT, HEADS_SEED);
  assert.equal(res.error ?? null, null, res.reason);
  const choice = res.state.pendingChoice;
  assert.deepEqual(choice.options.map((o) => o.instanceId), [activeEnergy.instanceId]);
  const done = applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: choice.choiceId, selection: [activeEnergy.instanceId] } },
    createRng(4)
  );
  assert.equal(done.error ?? null, null, done.reason);
  assert.ok(done.state.players.p2.zones.discard.some((c) => c.instanceId === activeEnergy.instanceId));
});

test('tails: nothing is discarded', () => {
  const { res } = play(ACTIVE_TEXT, TAILS_SEED);
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(res.state.players.p2.zones.discard.length, 0);
});

test('the printed wording still reaches any of the opponent’s Pokémon', () => {
  const { res, activeEnergy, benchEnergy } = play(PRINTED_TEXT, HEADS_SEED);
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.instanceId).sort(), [activeEnergy.instanceId, benchEnergy.instanceId].sort());
});
