// Design 062 § C: WotC Pokémon Power wording is rewritten to the modern Ability wording before
// parsing. Power texts are inlined from out/pkmn-wotc-cards.json (pkmncards rows cited per test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAbility, rewriteLegacyPowerWording } from '../rules/abilities.mjs';

const stripGuidance = (parsed) => JSON.parse(JSON.stringify(parsed, (key, value) => (key === 'guidance' ? undefined : value)));
const assertParsesLike = (legacy, modern) => assert.deepEqual(stripGuidance(parseAbility(legacy)), stripGuidance(parseAbility(modern)));
const stepsOf = (text) => parseAbility(text).steps ?? parseAbility(text);

// Blastoise [Base Set 2 2]
const RAIN_DANCE =
  "As often as you like during your turn (before your attack), you may attach 1 {W} Energy card to 1 of your {W} Pokémon. (This doesn't use up your 1 Energy card attachment for the turn.) This power can't be used if Blastoise is Asleep, Confused, or Paralyzed.";
// Venusaur [Base Set 15]
const ENERGY_TRANS =
  "As often as you like during your turn (before your attack), you may take 1 {G} Energy card attached to 1 of your Pokémon and attach it to a different one. This power can't be used if Venusaur is Asleep, Confused, or Paralyzed.";
// Charmander [Team Rocket 50]
const GATHER_FIRE =
  "Once during your turn (before your attack), you may take 1 {R} Energy card attached to 1 of your other Pokémon and attach it to Charmander. This power can't be used if Charmander is Asleep, Confused, or Paralyzed.";
// Erika's Bellsprout [Gym Challenge 38]
const SOAK_UP =
  "Once during your turn (before your attack), you may take up to 2 {G} Energy cards attached to your other Pokémon and attach them to Erika's Bellsprout. This power can't be used if Erika's Bellsprout is Asleep, Confused, or Paralyzed.";
// Lt. Surge's Magneton [Gym Heroes 8]
const ENERGY_CHARGE =
  "As often as you like during your turn (before your attack), if Lt. Surge's Magneton is your Active Pokémon, you may take 1 {L} Energy card attached to 1 of your Pokémon and attach it to Lt. Surge's Magneton. This power can't be used if Lt. Surge's Magneton is Asleep, Confused, or Paralyzed.";
// Magneton [Neo Revelation 10]
const ELECTROMAGNETIC_POWER =
  "As often as you like during your turn (before your attack), you may take 1 Energy card attached to 1 of your Magnemites, Magnetons, or Dark Magnetons and attach it to a different 1 of your Magnemites, Magnetons, and Dark Magnetons. This power can't be used if Magneton is Asleep, Confused, or Paralyzed.";

test('legacy power: Rain Dance parses as a modern hand attach', () => {
  assertParsesLike(
    RAIN_DANCE,
    "As often as you like during your turn (before your attack), you may attach 1 {W} Energy card from your hand to 1 of your {W} Pokémon. (This doesn't use up your 1 Energy card attachment for the turn.) This power can't be used if Blastoise is Asleep, Confused, or Paralyzed."
  );
});

test('legacy power: Energy Trans parses as a modern Energy move', () => {
  assertParsesLike(
    ENERGY_TRANS,
    "As often as you like during your turn, you may move 1 {G} Energy from 1 of your Pokémon to another of your Pokémon. This power can't be used if Venusaur is Asleep, Confused, or Paralyzed."
  );
});

test('legacy power: Gather Fire parses as a modern move to this Pokémon', () => {
  assertParsesLike(
    GATHER_FIRE,
    "Once during your turn (before your attack), you may move 1 {R} Energy from 1 of your other Pokémon to this Pokémon. This power can't be used if Charmander is Asleep, Confused, or Paralyzed."
  );
});

test('legacy power: Soak Up parses as a modern "up to 2" move to this Pokémon', () => {
  assertParsesLike(
    SOAK_UP,
    "Once during your turn (before your attack), you may move up to 2 {G} Energy from your other Pokémon to this Pokémon. This power can't be used if Erika's Bellsprout is Asleep, Confused, or Paralyzed."
  );
});

test('legacy power: Energy Charge moves Lightning Energy to self, unlimited', () => {
  const step = stepsOf(ENERGY_CHARGE).find((s) => s.type === 'moveEnergyAbility');
  assert.ok(step, JSON.stringify(parseAbility(ENERGY_CHARGE)));
  assert.equal(step.target, 'self');
  assert.equal(step.energyType, 'lightning');
  assert.equal(parseAbility(ENERGY_CHARGE).oncePerTurn === true, false, 'usable as often as you like');
});

test('legacy power: Electromagnetic Power moves between the tagged Pokémon', () => {
  const step = stepsOf(ELECTROMAGNETIC_POWER).find((s) => s.type === 'moveEnergyAbility');
  assert.ok(step, JSON.stringify(parseAbility(ELECTROMAGNETIC_POWER)));
  assert.equal(step.target, 'between');
  assert.equal(step.targetTag, 'magnemites, magnetons, and dark magnetons');
});

test('legacy power: empty input rewrites to empty', () => {
  assert.equal(rewriteLegacyPowerWording(''), '');
  assert.equal(rewriteLegacyPowerWording(undefined), '');
});

test('legacy power: modern wordings pass through unchanged', () => {
  const modern = [
    // Deluge (ability-one-offs.test.mjs fixture)
    "as often as you like during your turn, you may attach a basic {W} energy card from your hand to 1 of your {W} pokémon. this pokémon power can't be used if this pokémon is asleep, confused, or paralyzed.",
    'as often as you like during your turn, you may move 1 {G} energy from 1 of your pokémon to another of your pokémon.',
    "once during your turn, you may attach a basic {R} energy card from your hand to 1 of your benched {R} pokémon.",
  ];
  for (const text of modern) assert.equal(rewriteLegacyPowerWording(text), text);
});

function setupRainDance() {
  const rng = createRng(42);
  const state = createGameState({ gameId: 'legacy-power', seed: 42, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { playerId, username: playerId, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 70,
      name: 'Blastoise',
      hp: 100,
      supertype: 'Pokémon',
      types: ['Water'],
      abilities: [{ name: 'Rain Dance', type: 'Pokémon Power', text: RAIN_DANCE }],
    })
  );
  state.players.p2.zones.active.push(createCard({ instanceId: 71, name: 'Opp', hp: 100, supertype: 'Pokémon' }));
  const water = (instanceId) =>
    createCard({ instanceId, name: 'Water Energy', supertype: 'Energy', subtypes: ['Basic'], energyType: 'Water', type: 'Energy' });
  state.players.p1.zones.hand.push(water(81), water(82));
  return { state, rng };
}

const resolveWith = (res, selection, rng) =>
  applyCommand(res.state, { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection }, playerId: res.pendingChoice.player }, rng);

function useRainDance(state, rng, energyId) {
  const res = applyCommand(state, { type: 'useAbility', payload: { instanceId: 70 }, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.ok(res.pendingChoice, 'asks which Energy to attach');
  const done = resolveWith(res, [energyId], rng);
  assert.equal(done.error, null);
  return done.state;
}

test('legacy power: Rain Dance attaches a Water Energy from hand, and again the same turn', () => {
  const { state, rng } = setupRainDance();
  const once = useRainDance(state, rng, 81);
  assert.deepEqual(once.players.p1.zones.hand.map((c) => c.instanceId), [82]);
  assert.equal(once.players.p1.zones.active.find((c) => c.instanceId === 81)?.attachedTo, 70);
  const twice = useRainDance(once, rng, 82);
  assert.equal(twice.players.p1.zones.hand.length, 0);
  assert.equal(twice.players.p1.zones.active.find((c) => c.instanceId === 82)?.attachedTo, 70);
});
