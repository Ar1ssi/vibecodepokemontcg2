// Design 058: the engine reads the Ancient/Future tag from the printing (TCGdex id), not from a
// hand-set subtype. Every Pokémon here carries only what TCGdex gives (`subtypes: ['ex']` at most).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import {
  combinedToolAttackBonus,
  combinedToolHpBonus,
  combinedToolRetreatCost,
} from '../rules/tool-combat.mjs';
import { abilityDamageBonus, isAbilitySuppressed } from '../rules/ability-combat.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { matchesSearch } from '../rules/search-match.mjs';

// Printings (pokemontcg.io subtypes; TCGdex ids): sv04-124 Roaring Moon ex Ancient, sv04-086 Scream
// Tail Ancient, sv01-123 Great Tusk ex untagged, sv04-070 Iron Hands ex Future, sv05-081 Iron Crown
// ex Future, sv06-077 Iron Thorns ex Future, sv05-061 Iron Hands Future.
const pokemon = (instanceId, name, id, extra = {}) =>
  createCard({
    instanceId,
    name,
    id,
    supertype: 'Pokémon',
    type: 'Pokémon',
    hp: 200,
    stage: 'Basic',
    subtypes: / ex$/.test(name) ? ['ex'] : [],
    retreatCost: ['Colorless', 'Colorless'],
    ...extra,
  });

const tool = (instanceId, name, text, attachedTo) =>
  createCard({ instanceId, name, supertype: 'Trainer', type: 'Trainer', trainerType: 'Tool', text, attachedTo });

function boardState() {
  const state = createGameState({ gameId: 'paradox', seed: 1, rulesEnabled: true });
  state.players.p1 = { playerId: 'p1', username: 'A', zones: createPlayerZones(), flags: {} };
  state.players.p2 = { playerId: 'p2', username: 'B', zones: createPlayerZones(), flags: {} };
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

// Source: out/pkmn-trainer-cards.json "Awakening Drum" (Temporal Forces).
const AWAKENING_DRUM = 'Draw a card for each of your Ancient Pokémon in play.';

test('Awakening Drum draws one card per Ancient Pokémon in play, by printing', () => {
  const state = boardState();
  const p1 = state.players.p1;
  p1.zones.active.push(pokemon(1, 'Roaring Moon ex', 'sv04-124'));
  p1.zones.bench.push(pokemon(2, 'Scream Tail', 'sv04-086'), pokemon(3, 'Great Tusk ex', 'sv01-123'));
  for (let i = 0; i < 5; i += 1) p1.zones.deck.push(createCard({ instanceId: 10 + i, name: `Card ${i}` }));
  executeSteps(state, {
    steps: parseTrainerEffect(AWAKENING_DRUM).steps,
    fromStepIndex: 0,
    effectType: 'trainer',
    sourceCard: { name: 'Awakening Drum' },
    playerId: 'p1',
    activeRng: createRng(1),
    events: [],
  });
  assert.equal(p1.zones.hand.length, 2, 'Roaring Moon ex + Scream Tail; sv01 Great Tusk ex is untagged');
});

// Source: out/pkmn-trainer-cards.json "Ancient Booster Energy Capsule" / "Future Booster Energy
// Capsule" (Paradox Rift).
const ANCIENT_CAPSULE =
  'The Ancient Pokémon this card is attached to gets +60 HP, recovers from all Special Conditions, and can’t be affected by any Special Conditions.';
const FUTURE_CAPSULE =
  'The Future Pokémon this card is attached to has no Retreat Cost, and the attacks it uses do 20 more damage to your opponent’s Active Pokémon (before applying Weakness and Resistance).';

test('Ancient Booster Energy Capsule gives +60 HP to an Ancient holder only', () => {
  const moon = pokemon(1, 'Roaring Moon ex', 'sv04-124');
  const tusk = pokemon(2, 'Great Tusk ex', 'sv01-123');
  const zone = [moon, tusk, tool(3, 'Ancient Booster Energy Capsule', ANCIENT_CAPSULE, 1), tool(4, 'Ancient Booster Energy Capsule', ANCIENT_CAPSULE, 2)];
  assert.equal(combinedToolHpBonus(moon, zone), 60);
  assert.equal(combinedToolHpBonus(tusk, zone), 0);
});

test('Future Booster Energy Capsule: no Retreat Cost and +20 damage on a Future holder only', () => {
  const hands = pokemon(1, 'Iron Hands ex', 'sv04-070');
  const tusk = pokemon(2, 'Great Tusk ex', 'sv01-123');
  const defender = pokemon(9, 'Defender', 'sv01-001');
  const zone = [hands, tusk, tool(3, 'Future Booster Energy Capsule', FUTURE_CAPSULE, 1), tool(4, 'Future Booster Energy Capsule', FUTURE_CAPSULE, 2)];
  assert.equal(combinedToolRetreatCost(2, hands, zone), 0);
  assert.equal(combinedToolRetreatCost(2, tusk, zone), 2);
  assert.equal(combinedToolAttackBonus(hands, zone, defender), 20);
  assert.equal(combinedToolAttackBonus(tusk, zone, defender), 0);
});

// Source: out/pkmn-pokemon-cards.json "Iron Crown ex" (Temporal Forces) — Cobalt Command.
const COBALT_COMMAND =
  "Attacks used by your Future Pokémon, except any Iron Crown ex, do 20 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).";

test('Iron Crown ex Cobalt Command (printed text) boosts Future attackers except Iron Crown ex', () => {
  const crown = pokemon(1, 'Iron Crown ex', 'sv05-081', {
    abilities: [{ name: 'Cobalt Command', text: COBALT_COMMAND }],
  });
  const hands = pokemon(2, 'Iron Hands', 'sv05-061');
  const tusk = pokemon(3, 'Great Tusk ex', 'sv01-123');
  const defender = pokemon(9, 'Defender', 'sv01-001');
  const team = { sideCards: [crown, hands, tusk] };
  assert.equal(abilityDamageBonus(hands, defender, team), 20);
  assert.equal(abilityDamageBonus(tusk, defender, team), 0, 'untagged printing');
  assert.equal(abilityDamageBonus(crown, defender, team), 0, 'except any Iron Crown ex');
});

// Source: out/pkmn-pokemon-cards.json "Iron Thorns ex" (Twilight Masquerade) — Initialization.
const INITIALIZATION =
  "As long as this Pokémon is in the Active Spot, Pokémon with a Rule Box in play (both yours and your opponent's) have no Abilities, except for Future Pokémon. (Pokémon ex, Pokémon V, etc. have Rule Boxes.)";

test('Iron Thorns ex Initialization spares Future Pokémon, by printing', () => {
  const thorns = pokemon(1, 'Iron Thorns ex', 'sv06-077', {
    abilities: [{ name: 'Initialization', text: INITIALIZATION }],
  });
  const handsEx = pokemon(2, 'Iron Hands ex', 'sv04-070', { abilities: [{ name: 'x', text: 'y' }] });
  const tuskEx = pokemon(3, 'Great Tusk ex', 'sv01-123', { abilities: [{ name: 'x', text: 'y' }] });
  const base = { opponentSideCards: [thorns], opponentActive: [thorns] };
  assert.equal(isAbilitySuppressed(handsEx, { ...base, sideCards: [handsEx] }), false);
  assert.equal(isAbilitySuppressed(tuskEx, { ...base, sideCards: [tuskEx] }), true);
});

test('attack context counts Ancient Pokémon in play by printing', () => {
  const state = boardState();
  const p1 = state.players.p1;
  const moon = pokemon(1, 'Roaring Moon ex', 'sv04-124');
  p1.zones.active.push(moon);
  p1.zones.bench.push(pokemon(2, 'Scream Tail', 'sv04-086'), pokemon(3, 'Great Tusk ex', 'sv01-123'));
  state.players.p2.zones.active.push(pokemon(9, 'Defender', 'sv01-001'));
  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker: moon,
    defender: state.players.p2.zones.active[0],
  });
  assert.equal(ctx.ancientCount, 2);
});

test('search "Future Pokémon" / "Ancient Pokémon" matches tagged Pokémon, not tagged Trainers', () => {
  const hands = pokemon(1, 'Iron Hands ex', 'sv04-070');
  const tusk = pokemon(2, 'Great Tusk ex', 'sv01-123');
  const moon = pokemon(3, 'Roaring Moon ex', 'sv04-124');
  // Techno Radar itself is a Future Item (pokemontcg.io sv4-180 Item/Future).
  const radar = createCard({ instanceId: 4, name: 'Techno Radar', id: 'sv04-180', supertype: 'Trainer', type: 'Trainer', trainerType: 'Item' });
  assert.equal(matchesSearch(hands, 'Future Pokémon'), true);
  assert.equal(matchesSearch(tusk, 'Future Pokémon'), false);
  assert.equal(matchesSearch(moon, 'Future Pokémon'), false);
  assert.equal(matchesSearch(radar, 'Future Pokémon'), false);
  assert.equal(matchesSearch(moon, 'Ancient Pokémon'), true);
  assert.equal(matchesSearch(tusk, 'Ancient Pokémon'), false);
});

// ── Slice 3: the Trainers that pick by tag ──────────────────────────────────────────────────

const basicEnergy = (instanceId, type = 'Fighting') =>
  createCard({ instanceId, name: `Basic ${type} Energy`, supertype: 'Energy', type: 'Energy', subtypes: ['Basic'] });

// Plays parsed steps to completion; `pick(choice)` returns each selection. Every resume starts a
// fresh events array, as a real resolveChoice does.
function play(state, text, name, pick) {
  const steps = parseTrainerEffect(text).steps;
  const base = { steps, effectType: 'trainer', sourceCard: { name }, playerId: 'p1', activeRng: createRng(1) };
  const choices = [];
  let res = executeSteps(state, { ...base, fromStepIndex: 0, events: [] });
  while (res.pendingChoice) {
    const choice = res.pendingChoice;
    choices.push(choice);
    const token = choice.resumeToken;
    res = executeSteps(state, {
      ...base,
      fromStepIndex: token.stepIndex,
      context: token.context,
      budget: { count: token.budgetCount || 0 },
      selection: pick(choice, choices.length),
      events: [],
    });
  }
  return choices;
}

const firstOption = (choice) => [choice.options[0].instanceId];
const attachedTo = (p1, root) =>
  [...p1.zones.active, ...p1.zones.bench].filter((c) => c.attachedTo === root.instanceId).length;

function sadaBoard({ energy = 2 } = {}) {
  const state = boardState();
  const p1 = state.players.p1;
  const moon = pokemon(1, 'Roaring Moon ex', 'sv04-124');
  const tail = pokemon(2, 'Scream Tail', 'sv04-086');
  const tusk = pokemon(3, 'Great Tusk ex', 'sv01-123');
  p1.zones.active.push(moon);
  p1.zones.bench.push(tail, tusk);
  for (let i = 0; i < energy; i += 1) p1.zones.discard.push(basicEnergy(20 + i));
  for (let i = 0; i < 5; i += 1) p1.zones.deck.push(createCard({ instanceId: 40 + i, name: `Card ${i}` }));
  return { state, p1, moon, tail, tusk };
}

// Source: out/pkmn-trainer-cards.json "Professor Sada’s Vitality" (Paradox Rift).
const SADA =
  'Choose up to 2 of your Ancient Pokémon and attach a Basic Energy card from your discard pile to each of them. If you attached any Energy in this way, draw 3 cards.';

test("Professor Sada's Vitality parses as up to 2 Ancient targets and a conditional draw", () => {
  const { steps } = parseTrainerEffect(SADA);
  assert.deepEqual(steps, [
    {
      type: 'attachFromDiscard',
      energy: 'Basic Energy',
      target: 'up to 2 of your Ancient Pokémon',
      count: 2,
      distinctTargets: true,
      upTo: true,
    },
    { type: 'draw', count: 3, requiresAttach: true },
  ]);
});

test("Professor Sada's Vitality attaches to 2 different Ancient Pokémon (Active and Bench), then draws 3", () => {
  const { state, p1, moon, tail, tusk } = sadaBoard();
  const choices = play(state, SADA, "Professor Sada's Vitality", firstOption);
  const targetPrompts = choices.filter((c) => /Choose/.test(c.prompt));
  assert.deepEqual(
    targetPrompts[0].options.map((o) => o.instanceId).sort(),
    [moon.instanceId, tail.instanceId],
    'only the Ancient printings are offered; sv01 Great Tusk ex is not'
  );
  assert.deepEqual([moon, tail, tusk].map((root) => attachedTo(p1, root)), [1, 1, 0]);
  assert.equal(p1.zones.discard.length, 0);
  assert.equal(p1.zones.hand.length, 3);
  assert.ok(choices.every((c) => (c.min === 0) === !/Choose/.test(c.prompt)), 'Energy picks are optional, target picks are not');
});

test("Professor Sada's Vitality: attach 1, decline the 2nd, still draws 3", () => {
  const { state, p1 } = sadaBoard();
  // Picks: Energy 1, its target, then an empty Energy pick declines the second attach.
  const choices = play(state, SADA, "Professor Sada's Vitality", (choice, n) => (n === 3 ? [] : firstOption(choice)));
  assert.equal(choices.length, 3);
  assert.equal(choices[2].min, 0, 'the second Energy pick is optional');
  assert.equal(p1.zones.discard.length, 1);
  assert.equal(p1.zones.hand.length, 3);
});

test("Professor Sada's Vitality: declining the first pick attaches nothing and draws nothing", () => {
  const { state, p1 } = sadaBoard();
  play(state, SADA, "Professor Sada's Vitality", () => []);
  assert.equal(p1.zones.discard.length, 2);
  assert.equal(p1.zones.hand.length, 0);
});

test("Professor Sada's Vitality with no Ancient Pokémon or no Basic Energy does nothing", () => {
  const noEnergy = sadaBoard({ energy: 0 });
  assert.equal(play(noEnergy.state, SADA, 'Sada', () => []).length, 0);
  assert.equal(noEnergy.p1.zones.hand.length, 0);

  const state = boardState();
  const p1 = state.players.p1;
  p1.zones.active.push(pokemon(3, 'Great Tusk ex', 'sv01-123'));
  p1.zones.discard.push(basicEnergy(20));
  p1.zones.deck.push(createCard({ instanceId: 40, name: 'Card' }));
  assert.equal(play(state, SADA, 'Sada', () => []).length, 0);
  assert.equal(p1.zones.hand.length, 0);
  assert.equal(p1.zones.discard.length, 1);
});

// Source: out/pkmn-trainer-cards.json "Techno Radar" (Paradox Rift).
const TECHNO_RADAR =
  'You can use this card only if you discard another card from your hand. Search your deck for up to 2 Future Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.';

test('Techno Radar searches up to 2 Future Pokémon only', () => {
  const state = boardState();
  const p1 = state.players.p1;
  p1.zones.hand.push(createCard({ instanceId: 30, name: 'Discard Fodder' }));
  p1.zones.deck.push(
    pokemon(1, 'Iron Hands ex', 'sv04-070'),
    pokemon(2, 'Iron Crown ex', 'sv05-081'),
    pokemon(3, 'Iron Thorns ex', 'sv06-077'),
    pokemon(4, 'Roaring Moon ex', 'sv04-124'),
    pokemon(5, 'Miraidon ex', 'sv01-081'),
    createCard({ instanceId: 6, name: 'Techno Radar', id: 'sv04-180', supertype: 'Trainer', type: 'Trainer', trainerType: 'Item' })
  );
  const choices = play(state, TECHNO_RADAR, 'Techno Radar', (choice) =>
    choice.options.slice(0, choice.max).map((o) => o.instanceId)
  );
  const search = choices.at(-1);
  assert.equal(search.max, 2);
  assert.deepEqual(search.options.map((o) => o.instanceId).sort(), [1, 2, 3], 'sv01 Miraidon ex is untagged');
  assert.deepEqual(p1.zones.hand.map((c) => c.instanceId).sort(), [1, 2]);
});

// Source: out/pkmn-trainer-cards.json "Reboot Pod" (Temporal Forces).
const REBOOT_POD = 'Attach a Basic Energy card from your discard pile to each of your Future Pokémon.';

test('Reboot Pod parses as one Energy to each Future Pokémon', () => {
  assert.deepEqual(parseTrainerEffect(REBOOT_POD).steps, [
    {
      type: 'attachFromDiscard',
      energy: 'Basic Energy',
      target: 'each of your Future Pokémon',
      each: true,
      distinctTargets: true,
    },
  ]);
});

function podBoard(energy) {
  const state = boardState();
  const p1 = state.players.p1;
  const roots = [
    pokemon(1, 'Iron Hands ex', 'sv04-070'),
    pokemon(2, 'Iron Crown ex', 'sv05-081'),
    pokemon(3, 'Iron Thorns ex', 'sv06-077'),
    pokemon(4, 'Roaring Moon ex', 'sv04-124'),
  ];
  p1.zones.active.push(roots[0]);
  p1.zones.bench.push(...roots.slice(1));
  for (let i = 0; i < energy; i += 1) p1.zones.discard.push(basicEnergy(20 + i, 'Lightning'));
  return { state, p1, roots };
}

test('Reboot Pod attaches one Energy to each Future Pokémon and none to an Ancient one', () => {
  const { state, p1, roots } = podBoard(4);
  const choices = play(state, REBOOT_POD, 'Reboot Pod', firstOption);
  assert.deepEqual(roots.map((root) => attachedTo(p1, root)), [1, 1, 1, 0]);
  assert.equal(p1.zones.discard.length, 1);
  assert.ok(choices.every((c) => c.min === 1), 'each is mandatory');
});

test('Reboot Pod with 3 Future Pokémon and 2 Energy attaches 2 and stops', () => {
  const { state, p1, roots } = podBoard(2);
  play(state, REBOOT_POD, 'Reboot Pod', firstOption);
  assert.equal(roots.slice(0, 3).reduce((n, root) => n + attachedTo(p1, root), 0), 2);
  assert.equal(p1.zones.discard.length, 0);
});

// ── The Booster Energy Capsules are Pokémon Tools, not Energy ───────────────────────────────
import { applyCommand } from '../reduce.mjs';
import { isEnergy } from '../cards.mjs';

test('attaching Ancient Booster Energy Capsule does not use the turn’s Energy attachment', () => {
  const state = boardState();
  const p1 = state.players.p1;
  const moon = pokemon(1, 'Roaring Moon ex', 'sv04-124');
  p1.zones.active.push(moon);
  // A server deck row carries type 'Trainer' (loadDeck); cardStats adds trainerType + text.
  const capsule = createCard({ instanceId: 2, name: 'Ancient Booster Energy Capsule', type: 'Trainer', trainerType: 'Tool', text: ANCIENT_CAPSULE, ownerId: 'p1' });
  const energy = basicEnergy(3);
  p1.zones.hand.push(capsule, energy);

  let res = applyCommand(state, { type: 'attachCard', payload: { instanceId: 2, targetInstanceId: 1 }, playerId: 'p1' }, createRng(1));
  assert.equal(res.state.players.p1.flags.energyAttached ?? false, false);
  res = applyCommand(res.state, { type: 'attachCard', payload: { instanceId: 3, targetInstanceId: 1 }, playerId: 'p1' }, createRng(1));
  assert.equal(res.state.players.p1.zones.hand.length, 0, 'the Basic Energy still attaches this turn');
  assert.equal(res.state.players.p1.flags.energyAttached, true);
});

test('isEnergy: Trainers with "Energy" in the name are not Energy', () => {
  for (const name of ['Ancient Booster Energy Capsule', 'Future Booster Energy Capsule', 'Energy Retrieval', 'Energy Switch']) {
    assert.equal(isEnergy({ name, type: 'Trainer' }), false, name);
    assert.equal(isEnergy({ name, supertype: 'Trainer' }), false, name);
    assert.equal(isEnergy({ name, trainerType: 'Tool' }), false, name);
  }
  assert.equal(isEnergy({ name: 'Basic Fire Energy' }), true, 'a bare Energy row still classifies by name');
  assert.equal(isEnergy({ name: 'Jet Energy', type: 'Energy' }), true);
  assert.equal(isEnergy({ name: 'Scoop Up Net', type: 'Trainer', asEnergy: true, attachedTo: 5 }), true, 'attached as Energy wins');
});

test('isEnergyCard (client attach observer): Booster Energy Capsules are Tools', async () => {
  const { isEnergyCard } = await import('../rules/energy-effects.mjs');
  assert.equal(isEnergyCard({ name: 'Ancient Booster Energy Capsule', type: 'Trainer' }), false);
  assert.equal(isEnergyCard({ name: 'Future Booster Energy Capsule', trainerType: 'Tool', subtypes: ['Tool'] }), false);
  assert.equal(isEnergyCard({ name: 'Energy Retrieval', supertype: 'Trainer' }), false);
  assert.equal(isEnergyCard({ name: 'Basic Fire Energy', type: 'Energy' }), true);
  assert.equal(isEnergyCard({ name: 'Jet Energy' }), true);
});
