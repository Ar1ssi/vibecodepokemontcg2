// Design 023 slice 2: the pure glow model. Every stub card carries hp + attack text so
// ensureCardData() short-circuits and no test reaches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeCardGlows, HAND_GLOW_KINDS } from '../card-glow-model.mjs';
import { computeActionAffordances } from '../action-affordances.mjs';
import { enumerateOptions } from '../../general/e2e-options.mjs';
import { GLOW_RGB, TYPE_GLOW } from '../card-glow-colors.mjs';
import { rulesState } from '../../../../../shared/engine/rules/rules-state.mjs';

function pokemon(name, extra = {}) {
  return {
    name,
    type: 'Pokémon',
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: 60,
    weakness: null,
    attacks: [{ name: 'Tackle', cost: ['Water', 'Colorless'], damage: '20', text: 'Deals damage.' }],
    retreatCost: 1,
    ...extra,
  };
}

function energy(name = 'Water Energy', type = 'Water') {
  return { name, type: 'Energy', supertype: 'Energy', subtypes: ['Basic'], types: [type] };
}

const supporter = (name = "Professor's Research") => ({
  name,
  type: 'Trainer',
  supertype: 'Trainer',
  subtypes: ['Supporter'],
});

const item = (name = 'Ultra Ball') => ({
  name,
  type: 'Trainer',
  supertype: 'Trainer',
  subtypes: ['Item'],
});

const stadium = (name = 'Rough Seas', text = '') => ({
  name,
  type: 'Trainer',
  supertype: 'Trainer',
  subtypes: ['Stadium'],
  text,
});

function resetRules({ turnNumber = 3 } = {}) {
  rulesState.enabled = true;
  rulesState.phase = 'main';
  rulesState.turnPlayer = 'self';
  rulesState.turnNumber = turnNumber;
  rulesState.stadium = null;
  rulesState.pendingEffects = { self: [], opp: [] };
  rulesState.playerTurnCount = { self: 2, opp: 2 };
  for (const player of ['self', 'opp']) {
    rulesState.flags[player] = {
      energyAttached: false,
      attackerAttacked: false,
      retreatedThisTurn: false,
      evolved: {},
      supporterPlayed: false,
      lastSupporterName: '',
      abilitiesUsed: {},
      turnAttackBonus: null,
      stadiumUsed: false,
      stadiumPlayed: false,
    };
  }
}

const PRIZES = { self: 6, opponent: 6 };

test('hand Basic glows when the Active exists and the bench has room', async () => {
  resetRules();
  const charmander = pokemon('Charmander');
  const glows = await computeCardGlows({
    user: 'self',
    handCards: [charmander],
    activeCard: pokemon('Squirtle'),
    benchCards: [],
  });
  assert.deepEqual([...glows.handPlayable.keys()], [charmander]);
  assert.deepEqual(glows.handPlayable.get(charmander), { tone: 'default', rgb: GLOW_RGB.default });
});

test('hand Basic does not glow when the bench is full', async () => {
  resetRules();
  const glows = await computeCardGlows({
    user: 'self',
    handCards: [pokemon('Charmander')],
    activeCard: pokemon('Squirtle'),
    benchCards: Array.from({ length: 5 }, (_, i) => pokemon(`Bench${i}`)),
  });
  assert.equal(glows.handPlayable.size, 0);
});

test('nothing glows for the non-turn player', async () => {
  resetRules();
  rulesState.turnPlayer = 'opp';
  const active = pokemon('Squirtle', {
    types: ['Lightning'],
    attacks: [{ name: 'Zap', cost: ['Lightning'], damage: '30', text: '' }],
    ability: { name: 'Pick Up', text: 'Once during your turn: draw 1 card.' },
  });
  const glows = await computeCardGlows({
    user: 'self',
    handCards: [pokemon('Charmander')],
    activeCard: active,
    attachedEnergyCards: [energy('Basic Lightning Energy', 'Lightning')],
  });
  assert.equal(glows.handPlayable.size, 0);
  assert.equal(glows.activeCanAttack, false);
  assert.deepEqual(glows.abilityCards, []);
});

test('energy glows, then stops once the once-per-turn attach is spent', async () => {
  resetRules();
  const water = energy();
  const board = { user: 'self', handCards: [water], activeCard: pokemon('Squirtle'), benchCards: [] };
  const before = await computeCardGlows(board);
  assert.ok(before.handPlayable.has(water));

  rulesState.flags.self.energyAttached = true;
  const after = await computeCardGlows(board);
  assert.equal(after.handPlayable.has(water), false);
});

test('a Stage 1 glows only when canEvolve passes, and never on turn 1', async () => {
  resetRules();
  const squirtle = pokemon('Squirtle', { enteredPlayTurn: rulesState.turnNumber - 1 });
  const wartortle = pokemon('Wartortle', { stage: 'Stage 1', evolvesFrom: 'Squirtle' });
  const evolving = await computeCardGlows({
    user: 'self',
    handCards: [wartortle],
    activeCard: squirtle,
    benchCards: [],
  });
  assert.ok(evolving.handPlayable.has(wartortle));

  const noTarget = await computeCardGlows({
    user: 'self',
    handCards: [wartortle],
    activeCard: pokemon('Pikachu'),
    benchCards: [],
  });
  assert.equal(noTarget.handPlayable.has(wartortle), false);

  resetRules({ turnNumber: 1 });
  rulesState.playerTurnCount = { self: 1, opp: 0 };
  const turnOne = await computeCardGlows({
    user: 'self',
    handCards: [wartortle],
    activeCard: squirtle,
    benchCards: [],
  });
  assert.equal(turnOne.handPlayable.has(wartortle), false);
});

test('a Supporter does not glow on turn 1 or once already played', async () => {
  resetRules({ turnNumber: 1 });
  rulesState.playerTurnCount = { self: 1, opp: 0 };
  const prof = supporter();
  const turnOne = await computeCardGlows({
    user: 'self',
    handCards: [prof],
    activeCard: pokemon('Squirtle'),
    prizeCounts: PRIZES,
  });
  assert.equal(turnOne.handPlayable.has(prof), false);

  resetRules();
  rulesState.flags.self.supporterPlayed = true;
  const played = await computeCardGlows({
    user: 'self',
    handCards: [prof],
    activeCard: pokemon('Squirtle'),
    prizeCounts: PRIZES,
  });
  assert.equal(played.handPlayable.has(prof), false);
});

test('a Stadium in hand stops glowing by same name or once already played this turn', async () => {
  resetRules();
  const rough = stadium('Rough Seas');
  const playable = await computeCardGlows({
    user: 'self',
    handCards: [rough],
    activeCard: pokemon('Squirtle'),
    prizeCounts: PRIZES,
  });
  assert.deepEqual(playable.handPlayable.get(rough), { tone: 'stadium', rgb: GLOW_RGB.stadium });

  const sameName = await computeCardGlows({
    user: 'self',
    handCards: [rough],
    activeCard: pokemon('Squirtle'),
    prizeCounts: PRIZES,
    stadiumName: 'Rough Seas',
  });
  assert.equal(sameName.handPlayable.has(rough), false);

  rulesState.flags.self.stadiumPlayed = true;
  const alreadyPlayed = await computeCardGlows({
    user: 'self',
    handCards: [rough],
    activeCard: pokemon('Squirtle'),
    prizeCounts: PRIZES,
  });
  assert.equal(alreadyPlayed.handPlayable.has(rough), false);

  // Authoritative netcode: the server's flag name is `stadiumPlayedThisTurn`
  // (apply-view.js merges view.you.flags), not the client's `stadiumPlayed`.
  resetRules();
  rulesState.flags.self.stadiumPlayedThisTurn = true;
  const serverFlag = await computeCardGlows({
    user: 'self',
    handCards: [rough],
    activeCard: pokemon('Squirtle'),
    prizeCounts: PRIZES,
  });
  assert.equal(serverFlag.handPlayable.has(rough), false);
});

test('hand colours follow the card kind', async () => {
  resetRules();
  const prof = supporter();
  const ball = item();
  const water = energy();
  const mon = pokemon('Charmander');
  const glows = await computeCardGlows({
    user: 'self',
    handCards: [prof, ball, water, mon],
    activeCard: pokemon('Squirtle'),
    benchCards: [],
    prizeCounts: PRIZES,
  });
  assert.deepEqual(glows.handPlayable.get(prof), { tone: 'supporter', rgb: GLOW_RGB.supporter });
  assert.deepEqual(glows.handPlayable.get(ball), { tone: 'item', rgb: GLOW_RGB.item });
  assert.deepEqual(glows.handPlayable.get(water), { tone: 'energy-water', rgb: TYPE_GLOW.water });
  assert.deepEqual(glows.handPlayable.get(mon), { tone: 'default', rgb: GLOW_RGB.default });
});

test('activeCanAttack mirrors computeActionAffordances().attackAvailable', async () => {
  resetRules();
  const active = pokemon('Pikachu', {
    types: ['Lightning'],
    attacks: [{ name: 'Zap', cost: ['Lightning'], damage: '30', text: '' }],
  });
  const attached = [energy('Basic Lightning Energy', 'Lightning')];
  const board = { user: 'self', activeCard: active, attachedEnergyCards: attached, benchCards: [] };
  const glows = await computeCardGlows(board);
  const affordance = await computeActionAffordances({
    activeCard: active,
    attachedEnergyCards: attached,
    benchCards: [],
  });
  assert.equal(glows.activeCanAttack, affordance.attackAvailable);
  assert.deepEqual(glows.activeColor, { tone: 'default', rgb: GLOW_RGB.default });
});

test('abilityCards deep-equals computeActionAffordances().usableAbilities', async () => {
  resetRules();
  const active = pokemon('Pikachu', {
    types: ['Lightning'],
    ability: { name: 'Pick Up', text: 'Once during your turn: draw 1 card.' },
  });
  const bench = [{ ...pokemon('Eevee'), ability: { name: 'Energy Notice', text: 'Once during your turn: attach an Energy.' } }];
  const glows = await computeCardGlows({ user: 'self', activeCard: active, benchCards: bench });
  const affordance = await computeActionAffordances({ activeCard: active, benchCards: bench });
  assert.deepEqual(glows.abilityCards, affordance.usableAbilities);
});

test('stadiumUsable follows stadiumActivationStatus gates', async () => {
  resetRules();
  const safari = stadium('Safari Zone', 'Once per turn, search your deck for a Basic Pokémon.');
  const usable = await computeCardGlows({ user: 'self', stadiumCard: safari, yourTurn: true });
  assert.equal(usable.stadiumUsable, true);
  assert.deepEqual(usable.stadiumColor, { tone: 'stadium', rgb: GLOW_RGB.stadium });

  const used = await computeCardGlows({ user: 'self', stadiumCard: safari, yourTurn: true, stadiumUsedThisTurn: true });
  assert.equal(used.stadiumUsable, false);

  // Authoritative netcode: the server's flag name is `stadiumUsedThisTurn`,
  // not the client's `stadiumUsed` (apply-view.js merges view.you.flags).
  resetRules();
  rulesState.flags.self.stadiumUsedThisTurn = true;
  const serverFlag = await computeCardGlows({ user: 'self', stadiumCard: safari, yourTurn: true });
  assert.equal(serverFlag.stadiumUsable, false);
  assert.equal(serverFlag.stadiumReason, 'Already used this turn.');

  const notMyTurn = await computeCardGlows({ user: 'self', stadiumCard: safari, yourTurn: false });
  assert.equal(notMyTurn.stadiumUsable, false);

  const continuous = stadium('Mystic Ruin', 'Your Pokémon in play have +20 HP.');
  const passive = await computeCardGlows({ user: 'self', stadiumCard: continuous, yourTurn: true });
  assert.equal(passive.stadiumUsable, false);
});

test('stadiumUsable is false with no Stadium in play', async () => {
  resetRules();
  const glows = await computeCardGlows({ user: 'self', stadiumCard: null });
  assert.equal(glows.stadiumUsable, false);
  assert.equal(glows.stadiumReason, 'No Stadium in play.');
});

test('parity: handPlayable keys are exactly the enumerated hand-move cards', async () => {
  resetRules();
  const prof = supporter();
  const ball = item();
  const water = energy();
  const charmander = pokemon('Charmander');
  const wartortle = pokemon('Wartortle', { stage: 'Stage 1', evolvesFrom: 'Squirtle' });
  const handCards = [prof, ball, water, charmander, wartortle];
  const activeCard = pokemon('Squirtle');
  const board = { user: 'self', handCards, activeCard, benchCards: [], prizeCounts: PRIZES };

  const glows = await computeCardGlows(board);
  const options = await enumerateOptions({
    user: 'self',
    hand: handCards,
    active: activeCard,
    bench: [],
    prizeCounts: PRIZES,
  });

  // Guard the fixture: if enumerateOptions renames a kind, these fail before the parity check.
  const kinds = new Set(options.map((o) => o.kind));
  for (const kind of ['playBasic', 'evolve', 'attach', 'playTrainer']) assert.ok(kinds.has(kind), kind);

  const expected = new Set(
    options
      .filter((o) => HAND_GLOW_KINDS.has(o.kind) && Number.isInteger(o.handIndex))
      .map((o) => handCards[o.handIndex])
  );
  assert.deepEqual(new Set(glows.handPlayable.keys()), expected);
});
