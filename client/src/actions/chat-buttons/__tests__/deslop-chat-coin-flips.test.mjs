// Characterization of attack()'s "Flip N coins … for each heads" handling: a replayed roll in
// rngBundle.multiFlips is reused, a missing one is rolled and recorded, and Glimwood Tangle (Darkness
// Ablaze 162: "…they may ignore all results of those coin flips and begin flipping those coins
// again.") rolls a fresh set. Card: Wugtrio, Paradox Rift 053, Triple Whip {W}{W} 70×: "Flip 3 coins.
// This attack does 70 damage for each heads." Module stubbing follows attack-mirror-heal.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// Each stubbed export forwards to globalThis.__coinFlip[name] when the test supplies one.
const forward = (names) =>
  names.map((name) => `export const ${name} = (...args) => globalThis.__coinFlip?.${name}?.(...args);`).join('\n');

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

const TRIPLE_WHIP_TEXT = 'Flip 3 coins. This attack does 70 damage for each heads.';
const GLIMWOOD_TANGLE_TEXT =
  'Once during each player’s turn, after that player flips any coins for an attack, they may ignore all results of those coin flips and begin flipping those coins again.';

const pokemon = (name) => ({
  name,
  type: 'Pokémon',
  supertype: 'Pokémon',
  hp: 190,
  weakness: null,
  resistance: null,
  image: { attached: false, dataset: { cardId: name }, damageCounter: { textContent: '0' } },
});

function setupBoard() {
  const wugtrio = pokemon('Wugtrio');
  wugtrio.attacks = [{ name: 'Triple Whip', cost: ['Water', 'Water'], damage: '70×', text: TRIPLE_WHIP_TEXT }];
  const energy = () => ({ name: 'Water Energy', type: 'Energy', supertype: 'Energy', image: { attached: true, relative: wugtrio.image } });
  const defender = pokemon('Snorlax');
  defender.attacks = [];
  const zones = {
    self: { active: [wugtrio, energy(), energy()], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
    opp: { active: [defender], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
  };
  const messages = [];
  const setCounter = (user, zoneId, index, value) => {
    zones[user][zoneId][index].image.damageCounter.textContent = String(value);
  };
  globalThis.__coinFlip = {
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
    turnNumber: 2,
    phase: 'main',
    startingActiveDone: true,
    stadium: null,
    flags: { self: {}, opp: {} },
  });
  return { defender, messages };
}

const withRandom = async (value, run) => {
  const original = Math.random;
  Math.random = () => value;
  try {
    await run();
  } finally {
    Math.random = original;
  }
};

test('a replayed roll in rngBundle.multiFlips is reused and scales Triple Whip', async () => {
  const { defender, messages } = setupBoard();
  const rng = { multiFlips: ['heads', 'tails', 'heads'] };
  await withRandom(0.9, () => attack('self', 0, rng, true));
  assert.ok(messages.includes('🪙 Flipped 3 coins — 2 heads!'), JSON.stringify(messages));
  assert.equal(defender.image.damageCounter.textContent, '140');
  assert.deepEqual(rng.multiFlips, ['heads', 'tails', 'heads']);
});

test('without a replayed roll, Triple Whip rolls 3 coins and records them in rngBundle', async () => {
  const { defender, messages } = setupBoard();
  const rng = {};
  await withRandom(0.1, () => attack('self', 0, rng, true));
  assert.deepEqual(rng.multiFlips, ['heads', 'heads', 'heads']);
  assert.ok(messages.includes('🪙 Flipped 3 coins — 3 heads!'), JSON.stringify(messages));
  assert.equal(defender.image.damageCounter.textContent, '210');
});

test('Glimwood Tangle re-flips the coins once and the new roll decides the damage', async () => {
  const { defender, messages } = setupBoard();
  rulesState.stadium = { card: { name: 'Glimwood Tangle', text: GLIMWOOD_TANGLE_TEXT } };
  globalThis.window = { confirm: () => true };
  try {
    const rng = { multiFlips: ['tails', 'tails', 'tails'] };
    await withRandom(0.1, () => attack('self', 0, rng, true));
    assert.ok(messages.includes('🪙 Glimwood Tangle re-flip — 3 heads!'), JSON.stringify(messages));
    assert.equal(defender.image.damageCounter.textContent, '210');
    assert.equal(rulesState.flags.self.glimwoodUsed, true);
  } finally {
    delete globalThis.window;
  }
});
