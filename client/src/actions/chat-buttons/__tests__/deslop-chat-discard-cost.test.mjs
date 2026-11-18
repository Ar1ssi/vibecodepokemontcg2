// Characterization of attack()'s discard-cost step (energy first, then hand cards; a shortfall is a
// ⛔ fizzle that does not end the turn). Cards (out/pkmn-pokemon-cards.json): Moltres, 30th Celebration
// 130, Fire Spin {R}{R}{C} 130: "Discard 2 Energy from this Pokémon."; Lugia V, Silver Tempest 186,
// Read the Wind {C}: "Discard a card from your hand. If you do, draw 3 cards." Module stubbing
// follows attack-mirror-heal.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// Each stubbed export forwards to globalThis.__discardCost[name] when the test supplies one.
const forward = (names) =>
  names.map((name) => `export const ${name} = (...args) => globalThis.__discardCost?.${name}?.(...args);`).join('\n');

const STUBS = {
  'state.js': 'export const systemState = { isTwoPlayer: false };',
  'setup/chatbox/append-message.js': forward(['appendMessage']),
  'setup/general/determine-username.js': forward(['determineUsername']),
  'setup/general/process-action.js': forward(['processAction']),
  'actions/counters/reset-counters.js': forward(['resetAbilityCounters']),
  'actions/general/board-actions.js': forward(['discardBoard']),
  'actions/zones/deck-actions.js': forward(['draw']),
  'actions/zones/prizes-actions.js': forward(['takePrizes']),
  'actions/zones/prize-take-prompt.js': forward(['promptPrizeTake']),
  'actions/zones/hand-actions.js': forward(['shuffleAndDraw']),
  'actions/move-card-bundle/move-card.js': forward(['moveCard']),
  'actions/move-card-bundle/move-card-bundle.js': forward(['moveCardBundle']),
  'setup/zones/get-zone.js': forward(['getZone']),
  'setup/image-logic/card-picker.js': forward(['openCardPicker']),
  'actions/zones/shuffle-zone.js': forward(['shuffleZone']),
  'actions/counters/damage-counter.js': forward(['addDamageCounter', 'updateDamageCounter', 'removeDamageCounter']),
  'setup/netcode/authoritative-dispatch.js': forward(['dispatchAuthoritativeAction', 'readCardInstanceId']),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('/shared/')) {
      return { url: pathToFileURL(path.join(repoRoot, specifier)).href, shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

const { attack } = await import('../chat-buttons.js');
// An attack ends the turn, which announces it with a DOM event.
globalThis.document ??= { dispatchEvent: () => true };
const { rulesState } = await import('../../../../../shared/engine/rules/rules-state.mjs');
const { resetStatuses } = await import('../../../../../shared/engine/rules/status.mjs');

const FIRE_SPIN_TEXT = 'Discard 2 Energy from this Pokémon.';
const READ_THE_WIND_TEXT = 'Discard a card from your hand. If you do, draw 3 cards.';

const pokemon = (name) => ({
  name,
  type: 'Pokémon',
  supertype: 'Pokémon',
  hp: 190,
  weakness: null,
  resistance: null,
  image: { attached: false, dataset: { cardId: name }, damageCounter: { textContent: '0' } },
});

function setupBoard(attackSpec, energyCount, handSize) {
  const attacker = pokemon('Attacker');
  attacker.attacks = [attackSpec];
  const energies = Array.from({ length: energyCount }, () => ({
    name: 'Fire Energy',
    type: 'Energy',
    supertype: 'Energy',
    image: { attached: true, relative: attacker.image },
  }));
  const defender = pokemon('Snorlax');
  defender.attacks = [];
  const hand = Array.from({ length: handSize }, (_, i) => ({ name: `Card ${i}`, type: 'Trainer', supertype: 'Trainer', image: {} }));
  const zones = {
    self: { active: [attacker, ...energies], bench: [], hand, discard: [], deck: [], prizes: [], lostZone: [], board: [] },
    opp: { active: [defender], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
  };
  const messages = [];
  const moves = [];
  const setCounter = (user, zoneId, index, value) => {
    zones[user][zoneId][index].image.damageCounter.textContent = String(value);
  };
  globalThis.__discardCost = {
    getZone: (user, zoneId) => {
      const array = zones[user][zoneId] ?? [];
      return { array, getCount: () => array.length, getRenderedCount: () => array.length };
    },
    appendMessage: (_user, text) => messages.push(text),
    dispatchAuthoritativeAction: () => false,
    moveCard: (user, _initiator, from, to, index) => {
      const [card] = zones[user][from].splice(index, 1);
      zones[user][to].push(card);
      moves.push(`${from}->${to}:${card.name}`);
    },
    addDamageCounter: setCounter,
    updateDamageCounter: setCounter,
    removeDamageCounter: (user, zoneId, index) => setCounter(user, zoneId, index, 0),
  };
  resetStatuses();
  Object.assign(rulesState, {
    enabled: true,
    turnPlayer: 'self',
    turnNumber: 2,
    phase: 'main',
    startingActiveDone: true,
    stadium: null,
    flags: { self: {}, opp: {} },
  });
  return { messages, moves };
}

test('Fire Spin (Moltres 30th Celebration 130) discards 2 attached Energy as its cost', async () => {
  const { messages, moves } = setupBoard(
    { name: 'Fire Spin', cost: ['Fire', 'Fire', 'Colorless'], damage: 130, text: FIRE_SPIN_TEXT },
    3,
    0
  );
  await attack('self', true, 0);
  assert.deepEqual(moves, ['active->discard:Fire Energy', 'active->discard:Fire Energy']);
  assert.ok(messages.includes("🗑 Discarded 2 Energy as Fire Spin's cost."), JSON.stringify(messages));
});

test('Read the Wind (Lugia V Silver Tempest 186) discards the last card of the hand as its cost', async () => {
  const { messages, moves } = setupBoard(
    { name: 'Read the Wind', cost: ['Colorless'], damage: '', text: READ_THE_WIND_TEXT },
    1,
    2
  );
  await attack('self', true, 0);
  assert.deepEqual(moves, ['hand->discard:Card 1']);
  assert.ok(messages.includes("🗑 Discarded 1 card(s) from your hand as Read the Wind's cost."), JSON.stringify(messages));
});

test('Read the Wind with an empty hand fizzles without moving a card or ending the turn', async () => {
  const { messages, moves } = setupBoard(
    { name: 'Read the Wind', cost: ['Colorless'], damage: '', text: READ_THE_WIND_TEXT },
    1,
    0
  );
  await attack('self', true, 0);
  assert.deepEqual(moves, []);
  assert.deepEqual(messages, ["⛔ Not enough cards in hand to pay Read the Wind's discard cost (need 1)."]);
  assert.equal(rulesState.turnPlayer, 'self');
});
