// Zygarde's forms play as different Pokémon (pokemon-forms.mjs; user request 2026-11-05): 10% Forme Basic,
// 50% Forme Stage 1, Complete Forme Stage 2, Mega Zygarde ex a MEGAHB from Complete Forme, every card named
// "Zygarde". Forms come from the TCGdex `description` (Pokédex entry), quoted below from the live API records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLegality } from '../reduce.mjs';
import { createCard } from '../cards.mjs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { matchesStadiumEvolveSearch } from '../rules/stadium-effects.mjs';
import { cardStatsCommand } from '../reduce/turn.mjs';
import { rulesState, startGame, beginTurn } from '../rules/rules-state.mjs';
import { canEvolve } from '../rules/evolution.mjs';
import { rareCandyOptions } from '../rules/evolved-pokemon.mjs';
import { formDeckName, formsAllowEvolution, pokemonFormKey } from '../rules/pokemon-forms.mjs';
import { buildCardStatsPayload } from '../../../client/src/setup/netcode/card-stats.js';
import { DECK_FORMATS, validateDeck } from '../../../client/src/setup/deck-builder/core/deck-validation.mjs';

// TCGdex descriptions
const TEN = "This is Zygarde's form when about 10% of its cells have been gathered. It runs across the land at speeds greater than 60 mph."; // sm6-71
const TEN_SWSH = "Born when around 10% of Zygarde's cells have been gathered from all over, this form is skilled in close-range combat."; // swsh12-134
const FIFTY = "It's thought to be monitoring the ecosystem. There are rumors that even greater power lies hidden within it."; // sm6-72
const COMPLETE = "This is Zygarde's form at times when it uses its overwhelming power to suppress those who endanger the ecosystem."; // sm3-100
const COMPLETE_SWSH = "Born when all of Zygarde's cells have been gathered together, it uses force to neutralize those who harm the ecosystem."; // swsh4-93

const z10 = { name: 'Zygarde', stage: 'Basic', form: 'zygarde-10' };
const z50basic = { name: 'Zygarde', stage: 'Basic', form: 'zygarde-50' }; // an official 50% Forme print
const z50 = { name: 'Zygarde', stage: 'Stage 1', evolvesFrom: 'Zygarde', form: 'zygarde-50' };
const zComplete = { name: 'Zygarde', stage: 'Stage 2', evolvesFrom: 'Zygarde', form: 'zygarde-complete' };
const zCompleteBasic = { name: 'Zygarde', stage: 'Basic', form: 'zygarde-complete' }; // sm3-100
const zMega = { name: 'Mega Zygarde ex', stage: 'MEGAHB', evolvesFrom: 'Zygarde' };
const [global10, global50basic, global50, globalComplete, globalMega] = [z10, z50basic, z50, zComplete, zMega];

test('pokemonFormKey reads the form off the Pokédex entry, a Mega off its name', () => {
  assert.equal(pokemonFormKey({ name: 'Zygarde', description: TEN }), 'zygarde-10');
  assert.equal(pokemonFormKey({ name: 'Zygarde', description: TEN_SWSH.replace("'", '’') }), 'zygarde-10');
  assert.equal(pokemonFormKey({ name: 'Zygarde', description: FIFTY }), 'zygarde-50');
  assert.equal(pokemonFormKey({ name: 'Zygarde', description: COMPLETE }), 'zygarde-complete');
  assert.equal(pokemonFormKey({ name: 'Zygarde', description: COMPLETE_SWSH }), 'zygarde-complete');
  assert.equal(pokemonFormKey({ name: 'Mega Zygarde ex' }), 'zygarde-mega');
  assert.equal(pokemonFormKey({ name: 'Zygarde-EX' }), null);
  assert.equal(pokemonFormKey({ name: 'Pikachu', description: TEN }), null);
});

test('formsAllowEvolution: each form goes only onto the one below it', () => {
  assert.equal(formsAllowEvolution(z50, z10), true);
  assert.equal(formsAllowEvolution(z50, z50basic), false);
  assert.equal(formsAllowEvolution(z50, zCompleteBasic), false);
  assert.equal(formsAllowEvolution(zComplete, z50), true);
  assert.equal(formsAllowEvolution(zComplete, z10), false); // only Rare Candy skips the 50% Forme
  assert.equal(formsAllowEvolution(zComplete, z10, { rareCandy: true }), true);
  assert.equal(formsAllowEvolution(zComplete, z50basic, { rareCandy: true }), false);
  assert.equal(formsAllowEvolution(zComplete, z50basic), true);
  assert.equal(formsAllowEvolution(zMega, zComplete), true);
  assert.equal(formsAllowEvolution(zMega, zCompleteBasic), true);
  assert.equal(formsAllowEvolution(zMega, z50), false);
  assert.equal(formsAllowEvolution(zMega, z10), false);
});

test('formsAllowEvolution: no form carried — the stage stands for it; other Pokémon untouched', () => {
  const bare = ({ form, ...card }) => card;
  assert.equal(formsAllowEvolution(bare(z50), bare(z10)), true);
  assert.equal(formsAllowEvolution(bare(zMega), bare(zComplete)), true);
  assert.equal(formsAllowEvolution(bare(zMega), bare(z50)), false);
  assert.equal(formsAllowEvolution(bare(z50), { name: 'Zygarde', stage: 'Basic', description: FIFTY }), false);
  assert.equal(formsAllowEvolution({ name: 'Kirlia', stage: 'Stage 1', evolvesFrom: 'Ralts' }, { name: 'Ralts', stage: 'Basic' }), true);
  assert.equal(formsAllowEvolution({ name: 'Mega Gardevoir ex', stage: 'MEGAHB' }, { name: 'Gardevoir', stage: 'Stage 2' }), true);
});

test('formsAllowEvolution: Zygarde-EX / -GX are not forms of the line', () => {
  assert.equal(formsAllowEvolution(z50, { name: 'Zygarde-EX', stage: 'Basic' }), false); // xy10-54
  assert.equal(formsAllowEvolution(z50, { name: 'Zygarde-GX', stage: 'Basic' }), false);
});

function rulesOnTurn3() {
  startGame();
  for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
  rulesState.enabled = true;
}

test('canEvolve (client rules): forms gate normal evolution, Rare Candy and the Mega', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404, json: async () => null }));
  rulesOnTurn3();
  const [z10, z50basic, z50, zComplete, zMega] = [global10, global50basic, global50, globalComplete, globalMega].map((c) => ({ ...c }));
  assert.equal((await canEvolve('self', z10, z50, false)).allowed, true);
  const wrong = await canEvolve('self', z50basic, z50, false);
  assert.equal(wrong.allowed, false);
  assert.match(wrong.reason, /50% Forme/);
  assert.equal((await canEvolve('self', z50, zComplete, false)).allowed, true);
  assert.equal((await canEvolve('self', zComplete, zMega, false)).allowed, true);
  assert.equal((await canEvolve('self', z50, zMega, false)).allowed, false);
  assert.equal((await canEvolve('self', z10, zComplete, false)).allowed, false);
  assert.equal((await canEvolve('self', z10, zComplete, false, { isRareCandy: true })).allowed, true);
  assert.equal((await canEvolve('self', z50basic, zComplete, false, { isRareCandy: true })).allowed, false);
});

function evolveState(base, evo) {
  const zones = () => ({ active: [], bench: [], hand: [], deck: [], discard: [], prizes: [], lostZone: [] });
  const state = {
    rulesEnabled: true,
    stateVersion: 1,
    turn: { number: 3, player: 'p1', phase: 'turn' },
    commandLog: [],
    stadium: null,
    players: {
      p1: { playerId: 'p1', zones: zones(), flags: { evolved: {} } },
      p2: { playerId: 'p2', zones: zones(), flags: {} },
    },
  };
  state.players.p1.zones.bench.push(createCard({ instanceId: 501, supertype: 'Pokémon', enteredPlayTurn: 1, ...base }));
  state.players.p1.zones.hand.push(createCard({ instanceId: 502, supertype: 'Pokémon', ...evo }));
  return validateLegality(state, { type: 'attachCard', payload: { instanceId: 502, targetInstanceId: 501 }, playerId: 'p1' });
}

test('server legality: a Zygarde evolves only onto the form below it', () => {
  assert.equal(evolveState(z10, z50).allowed, true);
  assert.equal(evolveState(z50basic, z50).allowed, false);
  assert.equal(evolveState(zCompleteBasic, z50).allowed, false);
  assert.equal(evolveState(z50, zComplete).allowed, true);
  assert.equal(evolveState(zComplete, zMega).allowed, true);
  assert.equal(evolveState(z50, zMega).allowed, false);
  assert.equal(evolveState(z10, zMega).allowed, false);
});

test('Rare Candy options: a Complete Forme goes only onto a 10% Forme', () => {
  const player = {
    zones: {
      active: [{ instanceId: 1, ...z10, enteredPlayTurn: 1 }],
      bench: [{ instanceId: 2, ...z50basic, enteredPlayTurn: 1 }],
      hand: [{ instanceId: 3, ...zComplete, category: 'Pokemon', supertype: 'Pokémon' }],
    },
  };
  const options = rareCandyOptions(player, [], 3);
  assert.equal(options.length, 1);
  assert.deepEqual(options[0].basics.map((c) => c.instanceId), [1]);
});

// Salvatore-style search: "evolves from 1 of your Pokémon" never offers a skip across forms.
test('searchEvolve: a Complete Forme in the deck has no 10% Forme to go onto; a 50% Forme does', () => {
  let id = 900;
  const card = (props) => createCard({ instanceId: id++, supertype: 'Pokémon', hp: 100, ...props });
  const state = createGameState({ gameId: 'zygarde', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {}, supporterPlayed: false } };
    state.players[playerId].zones.active.push(card({ ...z10, enteredPlayTurn: 1 }));
    for (let i = 0; i < 6; i++) state.players[playerId].zones.prizes.push(card({ name: 'Prize', supertype: 'Trainer' }));
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  const complete = card(zComplete);
  const fifty = card(z50);
  state.players.p1.zones.deck.push(complete, fifty);
  const salvatore = card({ name: 'Test Trainer', supertype: undefined, type: 'Trainer', trainerType: 'Supporter',
    text: 'Search your deck for a card that has no Abilities and evolves from 1 of your Pokémon, and put it onto that Pokémon to evolve it. Then, shuffle your deck.' });
  state.players.p1.zones.hand.push(salvatore);
  const res = applyCommand(state, { type: 'moveCard', payload: { instanceId: salvatore.instanceId, from: 'hand', to: 'board' }, playerId: 'p1' }, createRng(7));
  assert.deepEqual(res.pendingChoice.options.map((c) => c.instanceId), [fifty.instanceId]);
});

test('Grand Tree search: a deck Zygarde matches only a host of the form below it', () => {
  assert.equal(matchesStadiumEvolveSearch(z50, [z10]), true);
  assert.equal(matchesStadiumEvolveSearch(z50, [z50basic]), false);
  assert.equal(matchesStadiumEvolveSearch(zComplete, [z10]), false);
});

test('cardStats carries the form to the server card', () => {
  const payload = buildCardStatsPayload([{ syncInstance: 7, name: 'Zygarde', stage: 'Basic', form: 'zygarde-10', hp: 90 }]);
  assert.equal(payload.stats[0].form, 'zygarde-10');
  const card = { syncInstance: 7, name: 'Zygarde' };
  const draft = { players: { p1: { zones: { hand: [card] } } } };
  cardStatsCommand({ draft, playerId: 'p1', payload, events: [] });
  assert.equal(card.form, 'zygarde-10');
});

test('deck limit: each Zygarde form keeps its own 4 copies', () => {
  const row = (data, count) => ({ data: { supertype: 'Pokémon', category: 'Pokemon', ...data }, count });
  const energy = { name: 'Fighting Energy', supertype: 'Energy', energyType: 'Normal' };
  const deck = (zygardes) => ({
    Zygarde: { cards: zygardes, totalCount: zygardes.reduce((n, r) => n + r.count, 0) },
    'Fighting Energy': { cards: [{ data: energy, count: 60 - zygardes.reduce((n, r) => n + r.count, 0) }], totalCount: 60 - zygardes.reduce((n, r) => n + r.count, 0) },
  });
  const line = deck([row({ id: 'customhb-1', ...z10 }, 4), row({ id: 'customhb-2', ...z50 }, 4), row({ id: 'customhb-3', ...zComplete }, 4)]);
  assert.deepEqual(validateDeck(line, DECK_FORMATS.TCG).errors, []);
  const tooMany = deck([row({ id: 'customhb-1', ...z10 }, 3), row({ id: 'sm6-71', ...z10 }, 2)]);
  assert.deepEqual(validateDeck(tooMany, DECK_FORMATS.TCG).errors, ['Zygarde (10% Forme) has 5 copies (max 4).']);
  assert.equal(formDeckName('Zygarde-EX', { name: 'Zygarde-EX', stage: 'Basic' }), 'Zygarde-EX');
  assert.equal(formDeckName('Mega Zygarde ex', zMega), 'Mega Zygarde ex');
});
