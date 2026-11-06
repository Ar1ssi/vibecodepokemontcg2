// Revealed cards stay revealed in their owner's hand (rules/revealed-hand.mjs): the opponent's view
// keeps a card face up once an effect revealed it, until it leaves the hand. Texts are corpus rows
// (out/pkmn-trainer-cards.json), the same ones deck-reveal-events.test.mjs cites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { viewFor } from '../view.mjs';

const art = (id) => `https://img.test/card-${id}.png`;

function setupGame({ rulesEnabled = true } = {}) {
  const rng = createRng(12345);
  const state = createGameState({ gameId: 'deck-reveal', seed: 12345, rulesEnabled });
  for (const id of ['p1', 'p2']) {
    state.players[id] = {
      playerId: id,
      username: id,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {}, supporterPlayed: false },
    };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({ instanceId: 1, name: 'Pikachu', hp: 70, supertype: 'Pokémon', stage: 'Basic', src: art(1) })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 2, name: 'Squirtle', hp: 60, supertype: 'Pokémon', stage: 'Basic', src: art(2) })
  );
  return { state, rng };
}

const pokemon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 90, supertype: 'Pokémon', stage: 'Basic', src: art(instanceId), ...extra });
const basicEnergy = (instanceId, type) =>
  createCard({
    instanceId,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    type: 'Energy',
    src: art(instanceId),
  });
const item = (instanceId, name, text, extra = {}) =>
  createCard({ instanceId, name, supertype: 'Trainer', trainerType: 'Item', type: 'Trainer', text, src: art(instanceId), ...extra });
const supporter = (instanceId, name, text) =>
  createCard({
    instanceId,
    name,
    supertype: 'Trainer',
    trainerType: 'Supporter',
    subtypes: ['Supporter'],
    type: 'Trainer',
    text,
    src: art(instanceId),
  });

const run = (state, rng, type, payload = {}, playerId = 'p1') => {
  const res = applyCommand(state, { type, payload, playerId }, rng);
  assert.equal(res.error, null, `${type}: ${res.reason || res.error}`);
  return res;
};
const pick = (res, rng, selection) =>
  run(res.state, rng, 'resolveChoice', { choiceId: res.pendingChoice.choiceId, selection });
const reveals = (res) => res.events.filter((e) => e.type === 'cardsRevealed');
const movedToHand = (res) =>
  res.events.filter((e) => e.type === 'cardMoved' && e.from === 'deck' && e.to === 'hand').map((e) => e.instanceId);
const handIds = (res, playerId = 'p1') => res.state.players[playerId].zones.hand.map((c) => c.instanceId);


// What p2's view shows of p1's hand: the name when face up, null when redacted.
const oppHandSeenBy = (state, viewer = 'p2') =>
  viewFor(state, viewer).them.zones.hand.map((c) => [c.instanceId, c.name ?? null]);

// Ultra Ball (30th Celebration 128).
const ULTRA_BALL =
  'You can use this card only if you discard 2 other cards from your hand. Search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.';
// Cassiopeia (Shrouded Fable 094).
const CASSIOPEIA =
  'You can use this card only when it is the last card in your hand. Search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.';

const ultraBallFor = (state, rng, targetId = 31) => {
  const played = run(state, rng, 'playTrainer', { instanceId: 7 });
  const discarded = pick(played, rng, [15, 16]);
  return pick(discarded, rng, [targetId]);
};

const ultraBallGame = () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(
    item(7, 'Ultra Ball', ULTRA_BALL),
    basicEnergy(15, 'Lightning'),
    item(16, 'Potion', 'Heal 30 damage from 1 of your Pokémon.'),
    pokemon(17, 'Pichu')
  );
  state.players.p1.zones.deck.push(pokemon(31, 'Raichu', { stage: 'Stage 1' }), basicEnergy(40, 'Fire'), basicEnergy(41, 'Fire'));
  return { state, rng };
};

test('revealed hand: the Pokémon Ultra Ball revealed shows face up in the opponent\'s view', () => {
  const { state, rng } = ultraBallGame();
  const searched = ultraBallFor(state, rng);
  assert.deepEqual(oppHandSeenBy(searched.state), [
    [17, null],
    [31, 'Raichu'],
  ]);
});

test('revealed hand: the card stays revealed through later commands; a drawn card stays hidden', () => {
  const { state, rng } = ultraBallGame();
  const searched = ultraBallFor(state, rng);
  const drew = run(searched.state, rng, 'draw', { count: 1 });
  const seen = new Map(oppHandSeenBy(drew.state));
  assert.equal(seen.get(31), 'Raichu');
  assert.equal(seen.get(17), null);
  const drawnId = drew.events.find((e) => e.type === 'cardsDrawn').cards[0].instanceId;
  assert.equal(seen.get(drawnId), null);
});

test('revealed hand: a revealed card that leaves the hand and is drawn again is hidden again', () => {
  const { state, rng } = ultraBallGame();
  const searched = ultraBallFor(state, rng);
  searched.state.rulesEnabled = false; // manual moves for the round trip
  const toDeck = run(searched.state, rng, 'moveCard', { instanceId: 31, from: 'hand', to: 'deck' });
  const inDeck = toDeck.state.players.p1.zones.deck.find((c) => c.instanceId === 31);
  assert.ok(inDeck, 'Raichu is in the deck');
  assert.equal(inDeck.revealed, undefined, 'the deck copy forgets the reveal');
  toDeck.state.players.p1.zones.deck.sort((a, b) => (a.instanceId === 31 ? -1 : b.instanceId === 31 ? 1 : 0));
  const back = run(toDeck.state, rng, 'draw', { count: 1 });
  assert.deepEqual(new Map(oppHandSeenBy(back.state)).get(31), null);
});

test('revealed hand: a search that does not reveal (Cassiopeia) stays hidden', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.hand.push(supporter(8, 'Cassiopeia', CASSIOPEIA));
  state.players.p1.zones.deck.push(pokemon(31, 'Raichu'), basicEnergy(40, 'Fire'));
  const played = run(state, rng, 'playTrainer', { instanceId: 8 });
  const searched = pick(played, rng, [31]);
  assert.deepEqual(oppHandSeenBy(searched.state), [[31, null]]);
});

test('revealed hand: a hand shuffled into the deck and redrawn in one command forgets its reveals', async () => {
  const { settleRevealedHandCards } = await import('../rules/revealed-hand.mjs');
  const card = (instanceId, revealed) => ({ instanceId, ...(revealed ? { revealed: true } : {}) });
  const before = { players: { p1: { zones: { hand: [card(1, true), card(2, true)] } } } };
  const draft = { players: { p1: { zones: { hand: [card(1, true), card(2, true)] } } } };
  settleRevealedHandCards(before, draft, [
    { type: 'deckShuffled', playerId: 'p1' },
    { type: 'cardsDrawn', playerId: 'p1', cards: [{ instanceId: 1 }] },
  ]);
  assert.equal(draft.players.p1.zones.hand[0].revealed, undefined, 'redrawn card is unknown');
  assert.equal(draft.players.p1.zones.hand[1].revealed, true, 'a card that stayed keeps its reveal');
});

test('revealed hand: a peek is not a reveal; a look the opponent had is', async () => {
  const { settleRevealedHandCards } = await import('../rules/revealed-hand.mjs');
  const state = () => ({ players: { p1: { zones: { hand: [{ instanceId: 1 }, { instanceId: 2 }] } }, p2: { zones: { hand: [] } } } });
  const draft = state();
  settleRevealedHandCards(state(), draft, [
    { type: 'cardsRevealed', playerId: 'p1', peek: true, cards: [{ instanceId: 1 }] },
    { type: 'cardsRevealed', playerId: 'p1', revealedTo: 'p2', cards: [{ instanceId: 2 }] },
  ]);
  assert.deepEqual(draft.players.p1.zones.hand.map((c) => Boolean(c.revealed)), [false, true]);
});
