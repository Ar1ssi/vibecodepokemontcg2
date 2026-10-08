// I230 Baby Pokémon. Rule text (pkmncards rules box, Neo Genesis Pichu
// https://pkmncards.com/card/pichu-neo-genesis-n1-12/): "Baby rule: If this Baby Pokémon is your
// Active Pokémon and your opponent tries to attack, your opponent flips a coin (before doing
// anything required in order to use that attack). If tails, your opponent's turn ends without an
// attack." Evolution and ordering rulings: https://compendium.pokegym.net/compendium.html —
// Basic onto a Baby "is an evolution card" (WotC chat Jun 14, 2001, Q14b); the evolved Basic is
// an Evolved Pokémon (Neo Genesis FAQ); not into Erika's Clefairy (Feb 22, 2001, Q24); Confusion
// vs Baby rule: "Baby rule" first (Nov 14, 2002, Q8). Babies: card-markers.generated.mjs (D200).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { createRng, withForcedCoin } from '../../rng.mjs';
import { applyCommand, validateLegality } from '../../reduce.mjs';
import { isBabyEvolution, isBabyPokemon } from '../baby-rule.mjs';

const { rulesState, startGame, beginTurn } = await import('../rules-state.mjs');
const { canEvolve } = await import('../evolution.mjs');

function setupGame(turnNumber = 3) {
  const state = createGameState({ gameId: 'baby-rule', seed: 5, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
    state.players[playerId].zones.deck.push(createCard({ instanceId: `${playerId}-deck`, name: 'Card' }));
  }
  state.turn = { player: 'p2', number: turnNumber, phase: 'main' };
  return state;
}

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, supertype: 'Pokémon', stage: 'Basic', hp: 60, ...extra });
// Neo Genesis Pichu (TCGdex neo1-12): Basic stage, carries the Baby marker; Cleffa neo1-20.
const pichu = (instanceId = 10, extra = {}) => mon(instanceId, 'Pichu', { id: 'neo1-12', hp: 30, ...extra });
const cleffa = (instanceId = 11) => mon(instanceId, 'Cleffa', { id: 'neo1-20', hp: 30 });
const energy = (instanceId, attachedTo) =>
  createCard({ instanceId, name: 'Fighting Energy', supertype: 'Energy', subtypes: ['Basic'], types: ['Fighting'], attachedTo });
const attacker = () =>
  mon(20, 'Attacker', {
    hp: 100,
    attacks: [{ name: 'Slam', cost: ['Colorless'], damage: '20', text: 'Discard an Energy attached to this Pokémon.' }],
  });

function attackState({ babyActive = true, confused = false } = {}) {
  const state = setupGame();
  const atk = attacker();
  if (confused) atk.specialCondition = 'Confused';
  state.players.p2.zones.active.push(atk, energy(21, 20));
  if (babyActive) {
    state.players.p1.zones.active.push(pichu());
  } else {
    state.players.p1.zones.active.push(mon(12, 'Front'));
    state.players.p1.zones.bench.push(pichu());
  }
  return state;
}

const attack = (state, face) =>
  applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' }, withForcedCoin(createRng(1), face));
const babyFlips = (res) => res.events.filter((e) => e.type === 'coinFlipped' && e.source === 'Baby rule');

test('isBabyPokemon reads the Baby marker; isBabyEvolution needs the printed "Evolves into" Basic', () => {
  assert.equal(isBabyPokemon(pichu()), true);
  assert.equal(isBabyPokemon(mon(1, 'Pichu', { id: 'base1-58' })), false);
  assert.equal(isBabyEvolution(pichu(), mon(2, 'Pikachu')), true);
  assert.equal(isBabyEvolution(pichu(), mon(2, 'Raichu', { stage: 'Stage 1', evolvesFrom: 'Pikachu' })), false);
  assert.equal(isBabyEvolution(pichu(), mon(2, 'Pikachu ex')), false);
  assert.equal(isBabyEvolution(cleffa(), mon(2, "Erika's Clefairy")), false);
  assert.equal(isBabyEvolution(mon(3, 'Tyrogue', { id: 'neo2-66' }), mon(2, 'Hitmontop')), true);
});

test('Baby rule: heads, the attack goes ahead', () => {
  const res = attack(attackState(), 'heads');
  assert.equal(res.error, null);
  assert.deepEqual(babyFlips(res).map((e) => [e.playerId, e.face]), [['p2', 'heads']]);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
});

test('Baby rule: tails ends the turn without an attack and pays no cost', () => {
  const res = attack(attackState(), 'tails');
  assert.equal(res.error, null);
  assert.deepEqual(babyFlips(res).map((e) => e.face), ['tails']);
  assert.ok(res.events.some((e) => e.type === 'attackPrevented' && e.source === 'Baby rule'));
  assert.equal(res.state.players.p1.zones.active[0].damage, 0);
  // The Energy the attack would discard stays attached.
  assert.ok(res.state.players.p2.zones.active.some((c) => c.instanceId === 21 && c.attachedTo === 20));
  assert.equal(res.state.players.p2.zones.discard.length, 0);
  assert.equal(res.state.turn.player, 'p1');
});

test('Baby rule: flipped before Confusion — tails, no Confusion flip or self-damage', () => {
  const res = attack(attackState({ confused: true }), 'tails');
  const flips = res.events.filter((e) => e.type === 'coinFlipped');
  assert.deepEqual(flips.map((e) => e.source), ['Baby rule']);
  assert.equal(res.state.players.p2.zones.active.find((c) => c.instanceId === 20).damage, 0);
});

test('Baby rule: a Baby on the Bench makes no flip', () => {
  const res = attack(attackState({ babyActive: false }), 'tails');
  assert.equal(res.error, null);
  assert.equal(babyFlips(res).length, 0);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
});

test('Baby rule: a Baby evolved into its Basic is no longer a Baby — no flip', () => {
  const state = attackState();
  state.players.p1.zones.active.push(mon(13, 'Pikachu', { id: 'base1-58', attachedTo: 10 }));
  const res = attack(state, 'tails');
  assert.equal(babyFlips(res).length, 0);
  assert.equal(res.state.players.p1.zones.active[0].damage, 20);
});

function evolveState({ turnNumber = 3, enteredPlayTurn = 1 } = {}) {
  const state = setupGame(turnNumber);
  state.turn.player = 'p1';
  state.players.p1.zones.active.push(pichu(10, { enteredPlayTurn }));
  state.players.p1.zones.bench.push(Object.assign(cleffa(), { enteredPlayTurn }));
  state.players.p1.zones.hand.push(
    mon(30, 'Pikachu', { id: 'base1-58' }),
    mon(31, "Erika's Clefairy", { id: 'gym1-34' }),
    mon(32, 'Raichu', { id: 'base1-14', stage: 'Stage 1', evolvesFrom: 'Pikachu' })
  );
  return state;
}

const evolve = (instanceId, targetInstanceId) => ({
  type: 'attachCard',
  payload: { instanceId, targetInstanceId },
  playerId: 'p1',
});

test('Baby evolution: the printed Basic evolves the Baby, under the normal evolution gates', () => {
  assert.equal(validateLegality(evolveState(), evolve(30, 10)).allowed, true);
  assert.equal(validateLegality(evolveState({ turnNumber: 2 }), evolve(30, 10)).allowed, false);
  assert.equal(validateLegality(evolveState({ enteredPlayTurn: 3 }), evolve(30, 10)).allowed, false);
  assert.equal(validateLegality(evolveState(), evolve(31, 11)).allowed, false);
  assert.equal(validateLegality(evolveState(), evolve(32, 10)).allowed, false);
  // A Basic that is not this Baby's evolution is still not an Evolution card.
  assert.equal(validateLegality(evolveState(), evolve(30, 11)).allowed, false);

  const res = applyCommand(evolveState(), evolve(30, 10), createRng(1));
  assert.equal(res.error, null);
  assert.ok(res.events.some((e) => e.type === 'pokemonEvolved'));
  const next = res.state;
  next.turn = { player: 'p1', number: 5, phase: 'main' };
  next.players.p1.flags.evolved = {};
  assert.equal(validateLegality(next, evolve(32, 10)).allowed, true);
});

test('Baby evolution: the client canEvolve mirror allows the Basic onto its Baby', async () => {
  startGame();
  for (let i = 0; i < 4; i++) beginTurn(i % 2 ? 'opp' : 'self');
  rulesState.enabled = true;
  assert.equal((await canEvolve('self', pichu(), mon(30, 'Pikachu'), false)).allowed, true);
  assert.equal((await canEvolve('self', pichu(), mon(30, 'Pikachu'), true)).allowed, false);
  assert.equal((await canEvolve('self', cleffa(), mon(31, "Erika's Clefairy"), false)).allowed, false);
});
