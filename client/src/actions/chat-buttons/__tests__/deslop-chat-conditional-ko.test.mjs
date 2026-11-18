// Characterization of attack()'s conditional-KO ladder: its arms run only when the attack did not
// already KO the Defending Pokémon. Card: Mega Darkrai ex, Mega Evolution Promos 090 / Pitch Black 120
// (out/pkmn-pokemon-cards.json), Abyss Eye {D}{D}{D}: "If your opponent's Active Pokémon is affected by
// a Special Condition, it is Knocked Out." The already-KO case uses a synthetic 300-damage attack with
// that same text (no printed card has both). Module stubbing follows attack-mirror-heal.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// Each stubbed export forwards to globalThis.__condKo[name] when the test supplies one.
const forward = (names) =>
  names.map((name) => `export const ${name} = (...args) => globalThis.__condKo?.${name}?.(...args);`).join('\n');

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
const { applyStatus, resetStatuses } = await import('../../../../../shared/engine/rules/status.mjs');

const ABYSS_EYE_TEXT = "If your opponent's Active Pokémon is affected by a Special Condition, it is Knocked Out.";

const pokemon = (name, damage) => ({
  name,
  type: 'Pokémon',
  supertype: 'Pokémon',
  hp: 190,
  weakness: null,
  resistance: null,
  image: { attached: false, dataset: { cardId: name }, damageCounter: { textContent: String(damage) } },
});

function setupBoard(attackSpec) {
  const darkrai = pokemon('Mega Darkrai ex', 0);
  darkrai.attacks = [attackSpec];
  const energy = () => ({ name: 'Darkness Energy', type: 'Energy', supertype: 'Energy', image: { attached: true, relative: darkrai.image } });
  const defender = pokemon('Snorlax', 0);
  defender.attacks = [];
  const zones = {
    self: { active: [darkrai, energy(), energy(), energy()], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
    opp: { active: [defender], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
  };
  const messages = [];
  const moves = [];
  const setCounter = (user, zoneId, index, value) => {
    zones[user][zoneId][index].image.damageCounter.textContent = String(value);
  };
  globalThis.__condKo = {
    getZone: (user, zoneId) => {
      const array = zones[user][zoneId] ?? [];
      return { array, getCount: () => array.length, getRenderedCount: () => array.length };
    },
    appendMessage: (_user, text) => messages.push(text),
    dispatchAuthoritativeAction: () => false,
    moveCard: (...args) => moves.push(args),
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
  return { defender, messages, moves };
}

const conditionalKoMessage = (messages) => messages.find((text) => text.includes('Conditional KO!'));
// An attack that was gated off (turn state, energy) would leave no trace; this proves it ran.
const attackRan = (messages) => messages.some((text) => /deals \d+ damage/.test(text));

test('Abyss Eye KOs a Defending Pokémon that has a Special Condition', async () => {
  const { defender, messages } = setupBoard({
    name: 'Abyss Eye',
    cost: ['Darkness', 'Darkness', 'Darkness'],
    damage: '',
    text: ABYSS_EYE_TEXT,
  });
  applyStatus('opp', defender.image.dataset.cardId, 'poisoned');
  await attack('self', true, 0);
  assert.ok(attackRan(messages), JSON.stringify(messages));
  assert.match(conditionalKoMessage(messages) ?? '', /had a Special Condition — 1 prize taken/, JSON.stringify(messages));
});

test('Abyss Eye does nothing to a Defending Pokémon with no Special Condition', async () => {
  const { messages, moves } = setupBoard({
    name: 'Abyss Eye',
    cost: ['Darkness', 'Darkness', 'Darkness'],
    damage: '',
    text: ABYSS_EYE_TEXT,
  });
  await attack('self', true, 0);
  assert.ok(attackRan(messages), JSON.stringify(messages));
  assert.equal(conditionalKoMessage(messages), undefined, JSON.stringify(messages));
  assert.equal(moves.length, 0, 'no card is moved');
});

test('the conditional KO is skipped when the attack already KO\'d the Defending Pokémon', async () => {
  const { defender, messages } = setupBoard({
    name: 'Synthetic Abyss Eye',
    cost: ['Darkness', 'Darkness', 'Darkness'],
    damage: 300,
    text: ABYSS_EYE_TEXT,
  });
  applyStatus('opp', defender.image.dataset.cardId, 'poisoned');
  await attack('self', true, 0);
  assert.ok(attackRan(messages), JSON.stringify(messages));
  assert.equal(conditionalKoMessage(messages), undefined, JSON.stringify(messages));
});
