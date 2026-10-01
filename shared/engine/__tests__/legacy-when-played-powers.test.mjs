// Design 062 tranche 2 (I228): WotC "When you play <name> from your hand" Powers are one-shot
// triggers. Power texts from out/pkmn-wotc-cards.json; the modern reference from
// out/pkmn-pokemon-cards.json (rows cited).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';
import { cardAbilityText, isEvolvePlayedTrigger, isBenchPlayedTrigger } from '../rules/ability-executors.mjs';

// Feraligatr [Neo Genesis 4] Berserk
const BERSERK =
  "When you play Feraligatr from your hand, flip a coin. If heads, discard the top 5 cards from your opponent's deck. If tails, discard the top 5 cards from your deck.";
// Feraligatr [Fusion Strike 057] Rowdy
const ROWDY =
  "When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you must flip a coin. If heads, discard the top 5 cards of your opponent's deck. If tails, discard the top 5 cards of your deck.";
// Unown V [Neo Destiny 89] [Vanish]
const VANISH =
  'When you play Unown V from your hand, you may flip a coin. If heads, return 1 of your Pokémon with Unown in its name (other than Unown V) to your hand. (Discard all cards attached to that card.)';

const stripGuidance = (parsed) => JSON.parse(JSON.stringify(parsed, (key, value) => (key === 'guidance' ? undefined : value)));
const power = (name, text) => ({ name, type: 'Pokémon Power', text });

function setupGame() {
  const state = createGameState({ gameId: 'legacy-when-played', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  state.players.p2.zones.active.push(createCard({ instanceId: 90, name: 'Opp', supertype: 'Pokémon', stage: 'Basic', hp: 100 }));
  for (let i = 0; i < 10; i += 1) {
    state.players.p1.zones.deck.push(createCard({ instanceId: 100 + i, name: 'Card' }));
    state.players.p2.zones.deck.push(createCard({ instanceId: 200 + i, name: 'Card' }));
  }
  return state;
}

test('legacy when-played: Berserk parses like Feraligatr Rowdy', () => {
  assert.deepEqual(
    stripGuidance(parseAbility(cardAbilityText({ name: 'Feraligatr', abilities: [{ text: BERSERK }] }))),
    stripGuidance(parseAbility(ROWDY))
  );
});

test('legacy when-played: the window follows how the card is played (Evolution vs Basic)', () => {
  const feraligatr = { name: 'Feraligatr', supertype: 'Pokémon', stage: 'Stage 2', abilities: [power('Berserk', BERSERK)] };
  const unownV = { name: 'Unown V', supertype: 'Pokémon', stage: 'Basic', abilities: [power('[Vanish]', VANISH)] };
  assert.equal(isEvolvePlayedTrigger(feraligatr), true);
  assert.equal(isBenchPlayedTrigger(feraligatr), false);
  assert.equal(isBenchPlayedTrigger(unownV), true);
  assert.equal(isEvolvePlayedTrigger(unownV), false);
  // Another Pokémon's name is no trigger on this card.
  assert.equal(isBenchPlayedTrigger({ ...unownV, name: 'Unown W' }), false);
});

test('legacy when-played: Berserk only works the turn Feraligatr evolved', () => {
  const state = setupGame();
  const croconaw = createCard({ instanceId: 10, name: 'Croconaw', supertype: 'Pokémon', stage: 'Stage 1', hp: 80 });
  const feraligatr = createCard({
    instanceId: 11,
    name: 'Feraligatr',
    supertype: 'Pokémon',
    stage: 'Stage 2',
    attachedTo: 10,
    enteredPlayTurn: 5,
    abilities: [power('Berserk', BERSERK)],
  });
  state.players.p1.zones.active.push(croconaw, feraligatr);
  const use = () => validateLegality(state, { type: 'useAbility', payload: { instanceId: 11 }, playerId: 'p1' });
  assert.equal(use().allowed, true);
  feraligatr.enteredPlayTurn = 3;
  const late = use();
  assert.equal(late.allowed, false);
  assert.match(late.reason, /turn it evolved/);
});

test('legacy when-played: Berserk flips and discards the top 5 of one deck', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(
    createCard({ instanceId: 10, name: 'Croconaw', supertype: 'Pokémon', stage: 'Stage 1', hp: 80 }),
    createCard({
      instanceId: 11,
      name: 'Feraligatr',
      supertype: 'Pokémon',
      stage: 'Stage 2',
      attachedTo: 10,
      enteredPlayTurn: 5,
      abilities: [power('Berserk', BERSERK)],
    })
  );
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 11 }, playerId: 'p1' });
  assert.equal(res.error, null);
  const coin = res.events.find((e) => e.type === 'coinFlipped');
  assert.ok(coin, 'the coin is flipped');
  const milled = coin.face === 'heads' ? 'p2' : 'p1';
  const kept = milled === 'p1' ? 'p2' : 'p1';
  assert.equal(res.state.players[milled].zones.discard.length, 5);
  assert.equal(res.state.players[milled].zones.deck.length, 5);
  assert.equal(res.state.players[kept].zones.deck.length, 10);
});

test('legacy when-played: Unown V only works the turn it was played onto the Bench', () => {
  const state = setupGame();
  state.players.p1.zones.active.push(createCard({ instanceId: 10, name: 'Unown A', supertype: 'Pokémon', stage: 'Basic', hp: 50 }));
  const unownV = createCard({
    instanceId: 11,
    name: 'Unown V',
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: 50,
    playedToBenchTurn: 5,
    abilities: [power('[Vanish]', VANISH)],
  });
  state.players.p1.zones.bench.push(unownV);
  const use = () => validateLegality(state, { type: 'useAbility', payload: { instanceId: 11 }, playerId: 'p1' });
  assert.equal(use().allowed, true);
  unownV.playedToBenchTurn = 4;
  assert.equal(use().allowed, false);
});
