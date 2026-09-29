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
