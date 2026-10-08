// Design 062 § A. Effect strings are TCGdex `effect` verbatim (out/tcgdex-wotc-trainers.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyTrainerType } from '../legacy-trainer-type.mjs';
import { applyCommand } from '../../reduce.mjs';
import { createGameState, createPlayerZones } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { createRng } from '../../rng.mjs';
import { isStadiumCard } from '../../effects/trainer-steps.mjs';

// TCGdex neo1-84 Ecogym
const ECOGYM =
  "This card stays in play when you play it. Discard this card if another Stadium card comes into play. Whenever an attack, Pokémon Power, or Trainer card discards another player's non-Colorless Energy card from a Pokémon, return that Energy card to its owner's hand. (Energy cards that are discarded when that Pokémon is Knocked Out don't count.)";
// TCGdex gym2-102 Chaos Gym
const CHAOS_GYM =
  "This card stays in play after being played. Discard this card if another Stadium card comes into play. Whenever a player plays a Trainer card other than a Stadium card, he or she flips a coin. If heads, that player plays that card normally. If tails, the player can't play that card. If the card isn't put into play, the player's opponent may use that card instead, if he or she does everything required in order to play that card (like discarding cards). Either way, the card goes to its owner's discard pile.";
// TCGdex neo1-86 Focus Band
const FOCUS_BAND =
  "Attach Focus Band to 1 of your Pokémon that doesn't have a Pokémon Tool attached to it. If the Pokémon Focus Band is attached to would be Knocked Out by your opponent's attack, flip a coin. If heads, that Pokémon is not Knocked Out and its remaining HP become 10 instead. Then, discard Focus Band.";
// TCGdex neo4-93 EXP.ALL
const EXP_ALL =
  "Attach EXP.ALL to 1 of your Pokémon that doesn't have a Pokémon Tool attached to it. During your opponent's turn, if your Active Pokémon would be Knocked Out by your opponent's attack, you may take 1 of the basic Energy cards attached to your Active Pokémon and attach it to the Pokémon with EXP.ALL attached to it. If you do, discard EXP.ALL.";
// TCGdex base1-84 PlusPower
const PLUSPOWER =
  "Attach PlusPower to your Active Pokémon. At the end of your turn, discard PlusPower. If this Pokémon's attack does damage to the Defending Pokémon (after applying Weakness and Resistance), the attack does 10 more damage to the Defending Pokémon.";
// TCGdex base1-80 Defender
const DEFENDER =
  "Attach Defender to 1 of your Pokémon. At the end of your opponent's next turn, discard Defender. Damage done to that Pokémon by attacks is reduced by 20 (after applying Weakness and Resistance).";

test('untyped WotC Stadium wordings derive Stadium', () => {
  assert.equal(legacyTrainerType({ category: 'Trainer', effect: ECOGYM }), 'Stadium');
  assert.equal(legacyTrainerType({ category: 'Trainer', effect: CHAOS_GYM }), 'Stadium');
});

test('untyped WotC Tool wordings derive Tool (curly apostrophes normalized)', () => {
  assert.equal(legacyTrainerType({ category: 'Trainer', effect: FOCUS_BAND }), 'Tool');
  assert.equal(legacyTrainerType({ category: 'Trainer', effect: EXP_ALL }), 'Tool');
  assert.equal(
    legacyTrainerType({ type: 'Trainer', text: EXP_ALL.replace("doesn't", 'doesn’t') }),
    'Tool',
  );
});

test('attach-style Items without the Tool clause stay untyped', () => {
  assert.equal(legacyTrainerType({ category: 'Trainer', effect: PLUSPOWER }), null);
  assert.equal(legacyTrainerType({ category: 'Trainer', effect: DEFENDER }), null);
});

test('typed Trainers, non-Trainers and empty input return null', () => {
  assert.equal(
    legacyTrainerType({ category: 'Trainer', trainerType: 'Stadium', effect: CHAOS_GYM }),
    null,
  );
  assert.equal(legacyTrainerType({ category: 'Pokemon', effect: ECOGYM }), null);
  assert.equal(legacyTrainerType({}), null);
  assert.equal(legacyTrainerType(null), null);
});

test('cardStats derives Stadium for an untyped WotC Trainer', () => {
  const state = createGameState({ gameId: 'legacy-tt', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const ecogym = createCard({ instanceId: 1, name: 'Ecogym', type: 'Trainer', ownerId: 'p1' });
  ecogym.syncInstance = 11;
  state.players.p1.zones.hand.push(ecogym);

  const res = applyCommand(
    state,
    { type: 'cardStats', payload: { stats: [{ syncInstance: 11, text: ECOGYM }] }, playerId: 'p1' },
    createRng(1),
  );
  const card = res.state.players.p1.zones.hand[0];
  assert.equal(card.trainerType, 'Stadium');
  assert.equal(isStadiumCard(card), true);
});
