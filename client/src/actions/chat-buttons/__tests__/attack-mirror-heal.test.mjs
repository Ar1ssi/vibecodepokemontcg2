// I251: the legacy client attack() read `dmg` in its mirror-heal branch outside the block that
// declares it, so every attack whose text heals "the same amount of damage you did" threw a
// ReferenceError after dealing its damage. Card: Yveltal-GX, Forbidden Light 137, Absorb Vitality
// (out/pkmn-pokemon-cards.json): "{D} → Absorb Vitality : 20 / Heal from this Pokémon the same
// amount of damage you did to your opponent's Active Pokémon."
// chat-buttons.js imports browser paths ('/shared/…') and DOM-bound client modules, so this file
// maps '/shared/' onto the repo and stubs the DOM-bound modules before importing it (the
// trainer-execution-cost-host.test.mjs pattern).
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// Each stubbed export forwards to globalThis.__mirrorHeal[name] when the test supplies one.
const forward = (names) =>
  names.map((name) => `export const ${name} = (...args) => globalThis.__mirrorHeal?.${name}?.(...args);`).join('\n');

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

const ABSORB_VITALITY_TEXT =
  "Heal from this Pokémon the same amount of damage you did to your opponent's Active Pokémon.";

// Client cards: an attached card's image points at its host's image; counters live on the image.
const pokemon = (name, damage) => ({
  name,
  type: 'Pokémon',
  supertype: 'Pokémon',
  hp: 190,
  weakness: null,
  resistance: null,
  image: { attached: false, dataset: { cardId: name }, damageCounter: { textContent: String(damage) } },
});

function setupBoard() {
  const yveltal = pokemon('Yveltal-GX', 50);
  yveltal.attacks = [{ name: 'Absorb Vitality', cost: ['Darkness'], damage: 20, text: ABSORB_VITALITY_TEXT }];
  const darkness = { name: 'Darkness Energy', type: 'Energy', supertype: 'Energy', image: { attached: true, relative: yveltal.image } };
  const defender = pokemon('Snorlax', 0);
  defender.attacks = [];
  const zones = {
    self: { active: [yveltal, darkness], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
    opp: { active: [defender], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
  };
  const messages = [];
  const setCounter = (user, zoneId, index, value) => {
    zones[user][zoneId][index].image.damageCounter.textContent = String(value);
  };
  globalThis.__mirrorHeal = {
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
  Object.assign(rulesState, {
    enabled: true,
    turnPlayer: 'self',
    turnNumber: 2,
    phase: 'main',
    startingActiveDone: true,
    stadium: null,
  });
  return { yveltal, defender, messages };
}

test('Absorb Vitality (Yveltal-GX FLI 137) heals the attacker by the damage it dealt', async () => {
  const { yveltal, defender, messages } = setupBoard();
  await attack('self', true, 0);
  assert.equal(defender.image.damageCounter.textContent, '20', 'the Defending Pokémon takes 20');
  assert.equal(yveltal.image.damageCounter.textContent, '30', '50 damage on Yveltal-GX, healed by the 20 dealt');
  assert.ok(
    messages.some((text) => text.includes('Absorb Vitality heals 20 damage')),
    `expected the heal message, got: ${JSON.stringify(messages)}`
  );
});
