// attack()'s legacy path: a recoil clause that names the attacker's OWN Bench hurts that Bench, never
// the opponent's; and the win sweep does not read deck-out (decided at turn start, reduce/turn.mjs).
// Card (out/pkmn-pokemon-cards.json): Swampert, Fusion Strike 064, Earthquake {W}{C}{C} 180:
// "This attack also does 20 damage to each of your Benched Pokémon. (Don't apply Weakness and
// Resistance for Benched Pokémon.)" Module stubbing follows deslop-chat-bench-damage.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const forward = (names) =>
  names.map((name) => `export const ${name} = (...args) => globalThis.__recoil?.${name}?.(...args);`).join('\n');

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

const { attack, evaluateWinCondition } = await import('../chat-buttons.js');
globalThis.document ??= { dispatchEvent: () => true };
const { rulesState } = await import('../../../../../shared/engine/rules/rules-state.mjs');
const { resetStatuses } = await import('../../../../../shared/engine/rules/status.mjs');

const EARTHQUAKE_TEXT =
  "This attack also does 20 damage to each of your Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";

const pokemon = (name, damage, hp = 190) => ({
  name,
  type: 'Pokémon',
  supertype: 'Pokémon',
  hp,
  weakness: null,
  resistance: null,
  image: { attached: false, dataset: { cardId: name }, damageCounter: { textContent: String(damage) } },
});

function useBoard(zones, turnNumber = 2) {
  const messages = [];
  const setCounter = (user, zoneId, index, value) => {
    zones[user][zoneId][index].image.damageCounter.textContent = String(value);
  };
  globalThis.__recoil = {
    getZone: (user, zoneId) => {
      const array = zones[user][zoneId] ?? [];
      return { array, getCount: () => array.length, getRenderedCount: () => array.length };
    },
    appendMessage: (_user, text) => messages.push(text),
    dispatchAuthoritativeAction: () => false,
    addDamageCounter: setCounter,
    updateDamageCounter: setCounter,
    removeDamageCounter: (user, zoneId, index) => setCounter(user, zoneId, index, 0),
  };
  resetStatuses();
  Object.assign(rulesState, {
    enabled: true,
    turnPlayer: 'self',
    turnNumber,
    phase: 'main',
    startingActiveDone: true,
    stadium: null,
    flags: { self: {}, opp: {} },
  });
  return messages;
}

const emptyZones = () => ({ active: [], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] });

test('Swampert Earthquake (Fusion Strike 064) damages the attacker\'s own Bench, not the opponent\'s', async () => {
  const attacker = pokemon('Swampert', 0);
  attacker.attacks = [{ name: 'Earthquake', cost: [], damage: 180, text: EARTHQUAKE_TEXT }];
  const ownBench = pokemon('Mudkip', 0);
  const oppBench = pokemon('Pidgey', 0);
  const defender = pokemon('Snorlax', 0);
  defender.attacks = [];
  useBoard({
    self: { ...emptyZones(), active: [attacker], bench: [ownBench] },
    opp: { ...emptyZones(), active: [defender], bench: [oppBench] },
  });
  await attack('self', true, 0);
  assert.equal(oppBench.image.damageCounter.textContent, '0');
  assert.equal(ownBench.image.damageCounter.textContent, '20');
});

test('the win sweep does not end the game because a player has an empty deck', () => {
  const alive = () => pokemon('Pidgey', 0);
  const messages = useBoard(
    {
      self: { ...emptyZones(), active: [alive()], hand: [alive()] },
      opp: { ...emptyZones(), active: [alive()], deck: [alive()] },
    },
    5
  );
  assert.equal(evaluateWinCondition('self'), false);
  assert.equal(rulesState.phase, 'main');
  assert.deepEqual(messages, []);
});
