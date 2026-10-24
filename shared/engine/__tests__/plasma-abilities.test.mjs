// Team Plasma era activated abilities, through the real applyCommand path. Card text is quoted
// from out/pkmn-pokemon-cards.json (set, number):
//   Electrode (Plasma Freeze 33) Magnetic Draw
//   Salamence (Plasma Blast 64) Breakwing
//   Archen (Plasma Blast 53), Tirtouga (Plasma Blast 27), Lileep (Plasma Blast 3) Prehistoric Call
//   Porygon-Z (Plasma Blast 74) Plasma Transfer
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

const rng = createRng(7);

function baseState(turnNumber = 3) {
  const state = createGameState({ gameId: 'plasma-abilities', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: turnNumber, phase: 'main' };
  state.players.p2.zones.active.push(createCard({ instanceId: 900, name: 'Opposing Active', hp: 100, supertype: 'Pokémon', stage: 'Basic' }));
  return state;
}

const pokemon = (instanceId, name, abilityText, extra = {}) =>
  createCard({
    instanceId,
    name,
    hp: 120,
    supertype: 'Pokémon',
    stage: 'Basic',
    types: ['Colorless'],
    abilities: abilityText ? [{ name: 'Ability', type: 'Ability', text: abilityText }] : [],
    ...extra,
  });

const tool = (instanceId, attachedTo) =>
  createCard({ instanceId, name: 'Rocky Helmet', supertype: 'Trainer', subtypes: ['Pokémon Tool'], isTool: true, attachedTo });

const plasmaEnergy = (instanceId, attachedTo) =>
  createCard({ instanceId, name: 'Plasma Energy', supertype: 'Energy', subtypes: ['Special'], attachedTo });

const useAbility = (state, instanceId, abilityIndex = 0) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId, abilityIndex }, playerId: 'p1' }, rng);

test('Electrode (Plasma Freeze 33) Magnetic Draw: draws from 1 card up to 4 in hand', () => {
  // Corpus: "Once during your turn (before your attack), you may draw cards until you have 4 cards in your hand."
  const state = baseState();
  state.players.p1.zones.active.push(
    pokemon(10, 'Electrode', 'Once during your turn (before your attack), you may draw cards until you have 4 cards in your hand.')
  );
  for (let i = 0; i < 6; i++) state.players.p1.zones.deck.push(createCard({ instanceId: 100 + i, name: `Deck ${i}`, supertype: 'Pokémon' }));
  state.players.p1.zones.hand.push(createCard({ instanceId: 50, name: 'Hand Card', supertype: 'Trainer' }));

  const res = useAbility(state, 10);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 4);
  assert.equal(res.state.players.p1.zones.deck.length, 3);
  assert.ok(res.events.some((e) => e.type === 'cardsDrawn' && e.count === 3));
});

test('Electrode (Plasma Freeze 33) Magnetic Draw: a hand already at 4 draws nothing', () => {
  const state = baseState();
  state.players.p1.zones.active.push(
    pokemon(10, 'Electrode', 'Once during your turn (before your attack), you may draw cards until you have 4 cards in your hand.')
  );
  for (let i = 0; i < 6; i++) state.players.p1.zones.deck.push(createCard({ instanceId: 100 + i, name: `Deck ${i}`, supertype: 'Pokémon' }));
  for (let i = 0; i < 4; i++) state.players.p1.zones.hand.push(createCard({ instanceId: 50 + i, name: `Hand ${i}`, supertype: 'Trainer' }));

  const res = useAbility(state, 10);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p1.zones.hand.length, 4);
  assert.equal(res.state.players.p1.zones.deck.length, 6);
});

const BREAKWING_TEXT =
  "When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may discard all Pokémon Tool cards attached to each of your opponent's Pokémon.";

test("Salamence (Plasma Blast 64) Breakwing: discards every Tool on the opponent's Pokémon only, on the evolve turn", () => {
  // Corpus: "When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may discard all Pokémon Tool
  // cards attached to each of your opponent's Pokémon."
  const state = baseState(4);
  const salamence = pokemon(10, 'Salamence', BREAKWING_TEXT, { stage: 'Stage 2', enteredPlayTurn: 4 });
  state.players.p1.zones.active.push(salamence);
  const oppActive = state.players.p2.zones.active[0];
  const oppBench = createCard({ instanceId: 901, name: 'Opposing Bench', hp: 90, supertype: 'Pokémon', stage: 'Basic' });
  state.players.p2.zones.bench.push(oppBench);
  state.players.p2.zones.active.push(tool(910, oppActive.instanceId));
  state.players.p2.zones.bench.push(tool(911, oppBench.instanceId));
  state.players.p1.zones.active.push(tool(920, salamence.instanceId));

  const res = useAbility(state, 10);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active.some((c) => c.instanceId === 910), false, 'opponent Active Tool discarded');
  assert.equal(res.state.players.p2.zones.bench.some((c) => c.instanceId === 911), false, 'opponent Bench Tool discarded');
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.instanceId === 910));
  assert.equal(res.state.players.p1.zones.active.some((c) => c.instanceId === 920), true, 'own Tool stays on own Pokémon');
});

test('Salamence (Plasma Blast 64) Breakwing: refused on a later turn than the evolve', () => {
  // Corpus: same text as above. The evolve trigger is the turn it evolved only.
  const state = baseState(6);
  state.players.p1.zones.active.push(pokemon(10, 'Salamence', BREAKWING_TEXT, { stage: 'Stage 2', enteredPlayTurn: 4 }));
  const res = useAbility(state, 10);
  assert.ok(res.error, 'a stale evolve window is refused');
});

const PREHISTORIC_CALL_TEXT =
  'Once during your turn (before your attack), if this Pokémon is in your discard pile, you may put this Pokémon on the bottom of your deck.';

function discardStateWith(name, instanceId) {
  const state = baseState();
  state.players.p1.zones.active.push(pokemon(90, 'Active Mon', null));
  state.players.p1.zones.discard.push(pokemon(instanceId, name, PREHISTORIC_CALL_TEXT, { stage: 'Basic' }));
  state.players.p1.zones.deck.push(createCard({ instanceId: 200, name: 'Top', supertype: 'Pokémon' }));
  return state;
}

test('Archen (Plasma Blast 53) Prehistoric Call: from the discard pile, goes to the bottom of the deck', () => {
  // Corpus: "Once during your turn (before your attack), if this Pokémon is in your discard pile, you may put this
  // Pokémon on the bottom of your deck." Archen, Plasma Blast 53.
  const state = discardStateWith('Archen', 60);
  const res = useAbility(state, 60);
  assert.equal(res.error, null);
  const deck = res.state.players.p1.zones.deck;
  assert.equal(deck[deck.length - 1].instanceId, 60, 'bottom of the deck');
  assert.equal(res.state.players.p1.zones.discard.some((c) => c.instanceId === 60), false);
});

test('Tirtouga (Plasma Blast 27) Prehistoric Call: same wording, from the discard pile to the bottom', () => {
  // Corpus: Tirtouga, Plasma Blast 27 — Prehistoric Call (same text as Archen above).
  const state = discardStateWith('Tirtouga', 61);
  const res = useAbility(state, 61);
  assert.equal(res.error, null);
  const deck = res.state.players.p1.zones.deck;
  assert.equal(deck[deck.length - 1].instanceId, 61);
});

test('Lileep (Plasma Blast 3) Prehistoric Call: same wording, from the discard pile to the bottom', () => {
  // Corpus: Lileep, Plasma Blast 3 — Prehistoric Call (same text as Archen above).
  const state = discardStateWith('Lileep', 62);
  const res = useAbility(state, 62);
  assert.equal(res.error, null);
  const deck = res.state.players.p1.zones.deck;
  assert.equal(deck[deck.length - 1].instanceId, 62);
});

test('Archen (Plasma Blast 53) Prehistoric Call: refused while Archen is still in play', () => {
  // Corpus: the activation is "if this Pokémon is in your discard pile"; in play it is not legal.
  const state = baseState();
  state.players.p1.zones.active.push(pokemon(60, 'Archen', PREHISTORIC_CALL_TEXT, { stage: 'Basic' }));
  const res = useAbility(state, 60);
  assert.ok(res.error, 'in-play Archen cannot use Prehistoric Call');
  assert.equal(state.players.p1.zones.active.some((c) => c.instanceId === 60), true);
});

const PLASMA_TRANSFER_TEXT =
  'As often as you like during your turn (before your attack), you may move a Plasma Energy attached to 1 of your Pokémon to another of your Pokémon.';

test('Porygon-Z (Plasma Blast 74) Plasma Transfer: moves a Plasma Energy to the one other Pokémon of yours', () => {
  // Corpus: "As often as you like during your turn (before your attack), you may move a Plasma Energy attached to
  // 1 of your Pokémon to another of your Pokémon." Porygon-Z, Plasma Blast 74.
  const state = baseState();
  const porygon = pokemon(10, 'Porygon-Z', PLASMA_TRANSFER_TEXT);
  state.players.p1.zones.active.push(porygon);
  state.players.p1.zones.bench.push(pokemon(11, 'Bench Mon', null));
  state.players.p1.zones.active.push(plasmaEnergy(30, porygon.instanceId));

  const res = useAbility(state, 10);
  assert.equal(res.error, null);
  assert.equal(res.pendingChoice, null);
  const energy = [...res.state.players.p1.zones.active, ...res.state.players.p1.zones.bench].find((c) => c.instanceId === 30);
  assert.equal(energy?.attachedTo, 11, 'Plasma Energy moved from Porygon-Z to the Bench Mon');
});

test('Porygon-Z (Plasma Blast 74) Plasma Transfer: asks where to move it when two other Pokémon qualify', () => {
  // Corpus: Plasma Blast 74, same text as above. Two other Pokémon means a real choice.
  const state = baseState();
  const porygon = pokemon(10, 'Porygon-Z', PLASMA_TRANSFER_TEXT);
  state.players.p1.zones.active.push(porygon);
  state.players.p1.zones.bench.push(pokemon(11, 'Bench A', null), pokemon(12, 'Bench B', null));
  state.players.p1.zones.active.push(plasmaEnergy(30, porygon.instanceId));

  const res = useAbility(state, 10);
  assert.equal(res.error, null);
  assert.ok(res.pendingChoice, 'the player picks the receiving Pokémon');
  assert.deepEqual(res.pendingChoice.options.map((c) => c.instanceId).sort(), [11, 12]);
});
