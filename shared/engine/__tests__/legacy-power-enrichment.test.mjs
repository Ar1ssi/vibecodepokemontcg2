// Live-game path for WotC Pokémon Powers: TCGdex detail → tcgAbilityFromDetail (client
// enrichment) → buildCardStatsPayload → reduce.mjs 'cardStats' → useAbility. Enrichment kept only
// type "Ability", so a Power never reached the server, and cardStats dropped the printed type
// that Toxic Gas reads to tell a Pokémon Power from anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { tcgAbilityFromDetail } from '../rules/rules-state.mjs';
import { buildCardStatsPayload } from '../../../client/src/setup/netcode/card-stats.js';

// Ability entries shaped as TCGdex returns them (type strings checked live on base1-2 / base3-13);
// texts from out/pkmn-wotc-cards.json (Blastoise Base Set 2, Muk Fossil 13).
const BLASTOISE_DETAIL = {
  id: 'base1-2',
  abilities: [
    {
      type: 'Pokemon Power',
      name: 'Rain Dance',
      effect:
        "As often as you like during your turn (before your attack), you may attach 1 {W} Energy card to 1 of your {W} Pokémon. (This doesn't use up your 1 Energy card attachment for the turn.) This power can't be used if Blastoise is Asleep, Confused, or Paralyzed.",
    },
  ],
};
const MUK_DETAIL = {
  id: 'base3-13',
  abilities: [
    {
      type: 'Pokemon Power',
      name: 'Toxic Gas',
      effect:
        'Ignore all Pokémon Powers other than Toxic Gases. This power stops working while Muk is Asleep, Confused, or Paralyzed.',
    },
  ],
};

function setupGame() {
  const state = createGameState({ gameId: 'legacy-power-enrichment', seed: 9, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

// A server card as loadDeck builds it: identity only, printed data arrives via cardStats.
const serverPokemon = (instanceId, syncInstance, name) =>
  createCard({ instanceId, syncInstance, name, supertype: 'Pokémon' });

// The client side: enrich from the TCGdex detail, then send what the server needs.
function sendStats(state, playerId, syncInstance, detail, types) {
  const clientCard = { syncInstance, hp: 100, stage: 'Basic', types, ability: tcgAbilityFromDetail(detail) };
  const res = applyCommand(state, { type: 'cardStats', playerId, payload: buildCardStatsPayload([clientCard]) });
  assert.equal(res.error, null);
  return res.state;
}

function blastoiseBoard() {
  let state = setupGame();
  state.players.p1.zones.active.push(serverPokemon(20, 0, 'Blastoise'));
  state.players.p1.zones.hand.push(
    createCard({ instanceId: 21, syncInstance: 1, name: 'Water Energy', supertype: 'Energy', subtypes: ['Basic'], types: ['Water'] })
  );
  state.players.p2.zones.active.push(serverPokemon(40, 0, 'Opp'));
  state = sendStats(state, 'p1', 0, BLASTOISE_DETAIL, ['Water']);
  return state;
}

const useBlastoise = (state, rng) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId: 20 }, playerId: 'p1' }, rng);

test('enriched Blastoise base1-2 reaches the server with its Pokémon Power and printed type', () => {
  const state = blastoiseBoard();
  const blastoise = state.players.p1.zones.active[0];
  assert.deepEqual(blastoise.abilities, [
    { name: 'Rain Dance', text: BLASTOISE_DETAIL.abilities[0].effect, type: 'Pokemon Power' },
  ]);
});

test('enriched Blastoise base1-2 can use Rain Dance in a live game', () => {
  const rng = createRng(9);
  const res = useBlastoise(blastoiseBoard(), rng);
  assert.equal(res.error, null, res.reason);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [21]);
  const after = applyCommand(
    res.state,
    { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection: [21] }, playerId: 'p1' },
    rng
  );
  assert.equal(after.error, null, after.reason);
  const energy = after.state.players.p1.zones.active.find((c) => c.instanceId === 21);
  assert.equal(energy?.attachedTo, 20, 'the Water Energy is attached to Blastoise');
});

test('enriched Muk Fossil 13 Toxic Gas ignores the enriched Blastoise Pokémon Power', () => {
  let state = blastoiseBoard();
  state.players.p2.zones.bench.push(serverPokemon(41, 1, 'Muk'));
  state = sendStats(state, 'p2', 1, MUK_DETAIL, ['Grass']);
  assert.equal(state.players.p2.zones.bench[0].abilities[0].type, 'Pokemon Power');

  const res = useBlastoise(state, createRng(9));
  assert.ok(res.error, 'Rain Dance is ignored while Toxic Gas works');
  assert.match(res.reason || res.error, /suppressed/);
});
