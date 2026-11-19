// Only Briar's own clause ("Knocked Out by damage from an attack used by your Tera Pokémon, take 1
// more Prize card") may raise the Briar flag; other Trainers whose text mentions Prize cards
// parse to the same kind of passive step and must leave it alone.
// Rows of out/pkmn-trainer-cards.json: Lt. Surge’s Strategy, Hidden Fates 60; Briar, Stellar Crown 132.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';

const LT_SURGE =
  'You can play this card only if you have more Prize cards remaining than your opponent. During this turn, you can play 3 Supporter cards (including this card).';
const BRIAR =
  'You can use this card only if your opponent has exactly 2 Prize cards remaining. During this turn, if your opponent’s Active Pokémon is Knocked Out by damage from an attack used by your Tera Pokémon, take 1 more Prize card.';

function play(name, text, ownPrizes, oppPrizes) {
  const state = createGameState({
    players: { p1: { username: 'A' }, p2: { username: 'B' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(createCard({ instanceId: 1, name: 'Pikachu', subtypes: ['Basic'], hp: 60 }));
  state.players.p2.zones.active.push(createCard({ instanceId: 2, name: 'Squirtle', subtypes: ['Basic'], hp: 60 }));
  state.players.p1.zones.hand.push(
    createCard({
      instanceId: 3,
      name,
      type: 'Trainer',
      trainerType: 'Supporter',
      subtypes: ['Supporter'],
      text,
    })
  );
  for (let i = 0; i < ownPrizes; i++) state.players.p1.zones.prizes.push(createCard({ instanceId: 100 + i, name: `a${i}` }));
  for (let i = 0; i < oppPrizes; i++) state.players.p2.zones.prizes.push(createCard({ instanceId: 200 + i, name: `b${i}` }));
  const res = applyCommand(state, { type: 'playTrainer', payload: { instanceId: 3 }, playerId: 'p1' });
  assert.equal(res.error, null);
  return res.state.players.p1.flags;
}

test('Lt. Surge’s Strategy does not raise the Briar flag', () => {
  assert.notEqual(play('Lt. Surge’s Strategy', LT_SURGE, 4, 2).briarActive, true);
});

test('Briar still raises the flag', () => {
  assert.equal(play('Briar', BRIAR, 3, 2).briarActive, true);
});
