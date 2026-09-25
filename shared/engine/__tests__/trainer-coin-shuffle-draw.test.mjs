// "Shuffle your hand into your deck [and/. Then,] flip a coin. If heads, draw X cards. If tails,
// draw Y cards." (Professor Birch's Observations, Drasna, Gambler). The shuffle-hand-then-draw
// parser branch used to swallow the sentence before parseCoinFlipStep read it, so the card always
// drew the heads count and never flipped. The coin picks the count; the shuffle happens once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';

const BIRCH =
  "Shuffle your hand into your deck and flip a coin. If heads, draw 7 cards. If tails, draw 4 cards.";
const DRASNA =
  'Shuffle your hand into your deck. Then, flip a coin. If heads, draw 8 cards. If tails, draw 3 cards.';
const GAMBLER =
  'Shuffle your hand into your deck. Flip a coin. If heads, draw 8 cards. If tails, draw 1 card.';

const coinDraw = (heads, tails) => ({
  type: 'coinFlip',
  heads: [{ type: 'shuffleHandThenDraw', count: heads }],
  tails: [{ type: 'shuffleHandThenDraw', count: tails }],
});

test("parsers: Birch's Observations / Drasna / Gambler shuffle then flip for the count", () => {
  assert.deepEqual(parseTrainerEffect(BIRCH).steps, [coinDraw(7, 4)]);
  assert.deepEqual(parseTrainerEffect(DRASNA).steps, [coinDraw(8, 3)]);
  assert.deepEqual(parseTrainerEffect(GAMBLER).steps, [coinDraw(8, 1)]);
});

test('parsers: the no-coin shuffle wordings stay a single shuffleHandThenDraw', () => {
  const lillie = parseTrainerEffect(
    'Shuffle your hand into your deck. Then, draw 6 cards. If you have exactly 6 Prize cards remaining, draw 8 cards instead.'
  );
  assert.equal(lillie.steps[0].type, 'shuffleHandThenDraw');
  assert.equal(lillie.steps[0].count, 6);
  assert.equal(lillie.steps[0].bonusCount, 8);
  const plain = parseTrainerEffect('Shuffle your hand into your deck. Then, draw 5 cards.');
  assert.deepEqual(plain.steps, [{ type: 'shuffleHandThenDraw', count: 5, bonusCount: null, bonusWhen: 'prizesRemaining==6' }]);
});

/** Plays a Birch's Observations with `seed`; returns the applyCommand result. */
function playBirch(seed) {
  const rng = createRng(seed);
  const state = createGameState({ gameId: 'birch-coin', seed, rulesEnabled: true });
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
    createCard({ instanceId: 1, name: 'Pikachu', hp: 70, supertype: 'Pokémon' })
  );
  state.players.p2.zones.active.push(
    createCard({ instanceId: 2, name: 'Squirtle', hp: 60, supertype: 'Pokémon' })
  );
  for (let i = 0; i < 6; i++) {
    state.players.p1.zones.prizes.push(
      createCard({ instanceId: 10 + i, name: `p1 prize ${i}`, supertype: 'Pokémon' })
    );
    state.players.p2.zones.prizes.push(
      createCard({ instanceId: 20 + i, name: `p2 prize ${i}`, supertype: 'Pokémon' })
    );
  }
  for (let i = 0; i < 20; i++) {
    state.players.p1.zones.deck.push(
      createCard({ instanceId: 100 + i, name: `deck ${i}`, supertype: 'Pokémon' })
    );
  }
  const birch = createCard({
    instanceId: 200,
    name: "Professor Birch's Observations",
    supertype: 'Trainer',
    trainerType: 'Supporter',
    subtypes: ['Supporter'],
    text: BIRCH,
  });
  for (let i = 0; i < 3; i++) {
    state.players.p1.zones.hand.push(
      createCard({ instanceId: 210 + i, name: `hand ${i}`, supertype: 'Pokémon' })
    );
  }
  state.players.p1.zones.hand.push(birch);

  const res = applyCommand(
    state,
    { type: 'playTrainer', payload: { instanceId: 200 }, playerId: 'p1' },
    rng
  );
  assert.equal(res.error, null);
  return res;
}

test("Professor Birch's Observations: the coin picks 7 or 4 after the shuffle", () => {
  const seen = new Map();
  for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
    const res = playBirch(seed);
    const flip = res.events.find((e) => e.type === 'coinFlipped');
    assert.ok(flip, `seed ${seed}: the Supporter must flip a coin`);
    assert.ok(res.events.some((e) => e.type === 'deckShuffled'), 'the hand was shuffled in');
    assert.equal(
      res.state.players.p1.zones.hand.length,
      flip.face === 'heads' ? 7 : 4,
      `seed ${seed}: ${flip.face} draws ${flip.face === 'heads' ? 7 : 4}`
    );
    assert.ok(
      res.state.players.p1.zones.discard.some((c) => c.instanceId === 200),
      'the Supporter is discarded after resolving'
    );
    seen.set(flip.face, res);
  }
  assert.deepEqual([...seen.keys()].sort(), ['heads', 'tails'], 'both faces were observed');
});
