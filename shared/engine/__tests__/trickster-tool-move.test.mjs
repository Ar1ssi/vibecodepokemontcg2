// Trickster (Sableye, Grafaiai, Whimsicott): move this Pokémon's Tool to the opponent's Active
// Pokémon. Card text: the user's scan, verbatim; same text in customhb/set.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAbility } from '../rules/abilities.mjs';

const TRICKSTER =
  "Once during your turn, if this Pokémon is in the Active Spot, you may move the Pokémon Tool attached to this Pokémon to your opponent's Active Pokémon. If that Pokémon already has a Pokémon Tool attached to it, discard that Pokémon Tool and attach the moved Pokémon Tool to it instead.";

function setupGame() {
  const rng = createRng(7);
  const state = createGameState({ gameId: 'trickster', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = {
      playerId,
      username: playerId,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {} },
    };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return { state, rng };
}

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', stage: 'Basic', ...extra });
const tool = (instanceId, name, attachedTo) =>
  createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Pokémon Tool'], attachedTo });
const sableye = (instanceId) =>
  mon(instanceId, 'Sableye', { abilities: [{ name: 'Trickster', type: 'Ability', text: TRICKSTER }] });

const use = (state, rng, instanceId) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId }, playerId: 'p1' }, rng);

const find = (state, instanceId) => {
  for (const player of Object.values(state.players)) {
    for (const [zoneId, cards] of Object.entries(player.zones)) {
      const card = cards.find((c) => c.instanceId === instanceId);
      if (card) return { card, zoneId, player };
    }
  }
  return null;
};

function board({ mine = [tool(80, 'Rocky Helmet', 70)], theirs = [], active = true } = {}) {
  const { state, rng } = setupGame();
  const holder = sableye(70);
  if (active) state.players.p1.zones.active.push(holder, ...mine);
  else {
    state.players.p1.zones.active.push(mon(72, 'Pikachu'));
    state.players.p1.zones.bench.push(holder, ...mine);
  }
  state.players.p2.zones.active.push(mon(71, 'Opp'), ...theirs);
  return { state, rng };
}

test('parses to a moveToolToOpponentAbility step', () => {
  assert.deepEqual(parseAbility(TRICKSTER).map((s) => s.type), ['moveToolToOpponentAbility']);
});

test('moves the Tool onto the opponent Active Pokémon', () => {
  const { state, rng } = board();
  const res = use(state, rng, 70);
  assert.equal(res.error, null);
  assert.equal(find(res.state, 80).card.attachedTo, 71);
  assert.equal(find(res.state, 80).player.playerId, 'p2');
  assert.ok(res.state.players.p1.flags.abilitiesUsed[70]);
});

test("discards the opponent's Tool and attaches the moved one instead", () => {
  const { state, rng } = board({ theirs: [tool(81, 'Float Stone', 71)] });
  const res = use(state, rng, 70);
  assert.equal(find(res.state, 81).zoneId, 'discard');
  assert.equal(find(res.state, 80).card.attachedTo, 71);
});

test('without a Tool on this Pokémon the Ability does nothing and is not spent', () => {
  const { state, rng } = board({ mine: [] });
  const res = use(state, rng, 70);
  assert.equal(Boolean(res.state.players.p1.flags.abilitiesUsed[70]), false);
  assert.equal(find(res.state, 71).card.attachedTo ?? null, null);
});

test('cannot be used from the Bench', () => {
  const { state, rng } = board({ active: false });
  assert.ok(use(state, rng, 70).error);
  assert.equal(find(state, 80).card.attachedTo, 70);
});
