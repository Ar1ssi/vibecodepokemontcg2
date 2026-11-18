// Characterization of attack()'s bench-damage blocks (single chosen Benched Pokémon, and every
// Benched Pokémon): damage, then a KO resolves into a "Bench KO!" line plus a prize, otherwise a
// "damage to <name> on the bench!" line. Cards (out/pkmn-pokemon-cards.json): Buzzwole-GX, 30th
// Celebration 57, Jet Punch {F} 30: "This attack does 30 damage to 1 of your opponent's Benched
// Pokémon."; Articuno, 151 144, Blizzard 110: "This attack also does 10 damage to each of your
// opponent's Benched Pokémon." (the corpus drops that attack's cost symbols, so the test gives it
// no cost). Module stubbing follows attack-mirror-heal.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// Each stubbed export forwards to globalThis.__benchDmg[name] when the test supplies one.
const forward = (names) =>
  names.map((name) => `export const ${name} = (...args) => globalThis.__benchDmg?.${name}?.(...args);`).join('\n');

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

const JET_PUNCH_TEXT = "This attack does 30 damage to 1 of your opponent's Benched Pokémon.";
const BLIZZARD_TEXT = "This attack also does 10 damage to each of your opponent's Benched Pokémon.";

const pokemon = (name, damage, hp = 190) => ({
  name,
  type: 'Pokémon',
  supertype: 'Pokémon',
  hp,
  weakness: null,
  resistance: null,
  image: { attached: false, dataset: { cardId: name }, damageCounter: { textContent: String(damage) } },
});

function setupBoard(attackSpec, benchCards) {
  const attacker = pokemon('Attacker', 0);
  attacker.attacks = [attackSpec];
  const energies = (attackSpec.cost ?? []).map((type) => ({ name: `${type} Energy`, type: 'Energy', supertype: 'Energy', image: { attached: true, relative: attacker.image } }));
  const defender = pokemon('Snorlax', 0);
  defender.attacks = [];
  const zones = {
    self: { active: [attacker, ...energies], bench: [], hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
    opp: { active: [defender], bench: benchCards, hand: [], discard: [], deck: [], prizes: [], lostZone: [], board: [] },
  };
  const messages = [];
  const setCounter = (user, zoneId, index, value) => {
    zones[user][zoneId][index].image.damageCounter.textContent = String(value);
  };
  globalThis.__benchDmg = {
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
  return { messages };
}

const benchLines = (messages) => messages.filter((text) => /on the bench!|Bench KO!/.test(text));

test('Jet Punch (Buzzwole-GX 30th Celebration 57) puts 30 on the lone Benched Pokémon', async () => {
  const bench = pokemon('Pidgey', 0);
  const { messages } = setupBoard({ name: 'Jet Punch', cost: ['Fighting'], damage: 30, text: JET_PUNCH_TEXT }, [bench]);
  await attack('self', true, 0);
  assert.equal(bench.image.damageCounter.textContent, '30');
  assert.deepEqual(benchLines(messages), ['💥 30 damage to Pidgey on the bench!']);
});

test('Jet Punch KOs a Benched Pokémon with 30 HP or less and takes a prize', async () => {
  const bench = pokemon('Pidgey', 0, 30);
  const { messages } = setupBoard({ name: 'Jet Punch', cost: ['Fighting'], damage: 30, text: JET_PUNCH_TEXT }, [bench]);
  await attack('self', true, 0);
  assert.equal(bench.image.damageCounter.textContent, '30');
  assert.deepEqual(benchLines(messages), ['🎯 Bench KO! Pidgey — 1 prize taken.']);
});

test('Blizzard (Articuno 151 144) hits every Benched Pokémon and KOs only the weak one', async () => {
  const weak = pokemon('Pidgey', 0, 10);
  const sturdy = pokemon('Onix', 0);
  const { messages } = setupBoard({ name: 'Blizzard', cost: [], damage: 110, text: BLIZZARD_TEXT }, [weak, sturdy]);
  await attack('self', true, 0);
  assert.equal(weak.image.damageCounter.textContent, '10');
  assert.equal(sturdy.image.damageCounter.textContent, '10');
  assert.ok(messages.includes("🎯 10 damage to each of the opponent's 2 benched Pokémon."), JSON.stringify(messages));
  assert.deepEqual(benchLines(messages), ['🎯 Bench KO! Pidgey — 1 prize taken.', '💥 10 damage to Onix on the bench!']);
});

test('Blizzard fizzles with a message when the opponent has no Bench', async () => {
  const { messages } = setupBoard({ name: 'Blizzard', cost: [], damage: 110, text: BLIZZARD_TEXT }, []);
  await attack('self', true, 0);
  assert.ok(messages.includes("💤 Blizzard's spread damage fizzles — opponent has no benched Pokémon."), JSON.stringify(messages));
});

test('Blizzard puts 10 on a lone Benched Pokémon once, not once as a chosen target and again as a spread', async () => {
  const only = pokemon('Onix', 0);
  const { messages } = setupBoard({ name: 'Blizzard', cost: [], damage: 110, text: BLIZZARD_TEXT }, [only]);
  await attack('self', true, 0);
  assert.equal(only.image.damageCounter.textContent, '10');
  assert.deepEqual(benchLines(messages), ['💥 10 damage to Onix on the bench!']);
});
