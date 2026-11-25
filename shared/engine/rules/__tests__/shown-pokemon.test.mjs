// An evolved Pokémon's id is its Basic's; a choice offering it must show the top Evolution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { choiceForChooser } from '../../choice-zone-view.mjs';
import { shownEvolutionCard } from '../shown-pokemon.mjs';

function boardWithCharmeleon() {
  const state = createGameState({ gameId: 'shown', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', zones: createPlayerZones(), flags: {} };
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Charmander', stage: 'Basic', src: 'charmander.png' }),
    createCard({ instanceId: 2, name: 'Charmeleon', stage: 'Stage 1', src: 'charmeleon.png', attachedTo: 1 }),
    createCard({ instanceId: 3, name: 'Fire Energy', supertype: 'Energy', type: 'Energy', attachedTo: 1 })
  );
  state.players.p1.zones.bench.push(createCard({ instanceId: 4, name: 'Pikachu', stage: 'Basic', src: 'pikachu.png' }));
  return state;
}

const option = (card) => ({ instanceId: card.instanceId, name: card.name, src: card.src });

test('an evolved Pokémon offered in a choice shows its top Evolution', () => {
  const state = boardWithCharmeleon();
  const [charmander, , energy] = state.players.p1.zones.active;
  const pikachu = state.players.p1.zones.bench[0];
  const choice = { player: 'p1', options: [option(charmander), option(pikachu), option(energy)] };

  const shown = choiceForChooser(state, choice).options;

  assert.deepEqual(shown[0], { instanceId: 1, name: 'Charmeleon', src: 'charmeleon.png' });
  assert.deepEqual(shown[1], option(pikachu), 'an unevolved Pokémon is unchanged');
  assert.deepEqual(shown[2], option(energy), 'an attached Energy keeps its own name');
});

test("a pick among one Pokémon's own stack cards keeps each card", () => {
  const state = boardWithCharmeleon();
  const [charmander, charmeleon] = state.players.p1.zones.active;
  const choice = { player: 'p1', options: [option(charmander), option(charmeleon)] };

  assert.deepEqual(choiceForChooser(state, choice).options, choice.options);
});

test('a face-down evolved stack is not named', () => {
  const state = boardWithCharmeleon();
  state.players.p1.zones.active[1].faceDown = true;

  assert.equal(shownEvolutionCard(state, 1), null);
});
