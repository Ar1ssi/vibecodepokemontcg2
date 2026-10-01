// I232: WotC Super Potion (TCGdex base1-90) parses to discardOwnAttachedEnergy + healAmount
// target 'costHost'; the legacy client executor must heal the Pokémon whose Energy paid the cost.
// trainer-execution.js imports browser paths ('/shared/…') and DOM-bound client modules, so this
// file maps '/shared/' onto the repo and stubs the DOM-bound modules before importing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTrainerEffect } from '../../../../../shared/engine/rules/trainer-effects.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// Zone moves go through moveCardBundle; the stub moves the card between the test's zone arrays.
const STUBS = {
  'actions/zones/deck-actions.js': 'export const moveToDeckBottom = () => {};',
  'actions/move-card-bundle/move-card-bundle.js': `export async function moveCardBundle(user, _to, fromZone, toZone, index) {
    const zones = globalThis.__costHostZones[user];
    const [card] = zones[fromZone].splice(index, 1);
    zones[toZone].push(card);
  }`,
  'actions/counters/damage-counter.js': 'export const addDamageCounter = () => {}; export const updateDamageCounter = () => {};',
  'src/state.js': 'export const systemState = {}; export const socket = null;',
  'setup/rules/mat-picker.js': 'export const openMatPick = () => {}; export const dismissMatPick = () => {};',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('/shared/')) {
      return { url: pathToFileURL(path.join(repoRoot, specifier)).href, shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix.replace(/^src\//, '')}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

const { initTrainerExecution, runTrainerSteps } = await import('../trainer-execution.js');

const WOTC = JSON.parse(fs.readFileSync(path.join(repoRoot, 'out', 'tcgdex-wotc-trainers.json'), 'utf8'));
const SUPER_POTION = WOTC.find((row) => row.id === 'base1-90');

// Client cards: an attached card's image points at its parent's image (getAttachedCards).
const pokemon = (name) => ({ name, supertype: 'Pokémon', hp: 100, image: { attached: false } });
const energyOn = (parent) => ({ name: 'Water Energy', supertype: 'Energy', image: { attached: true, relative: parent.image } });

function setupBoard() {
  const active = pokemon('Squirtle');
  const benched = pokemon('Staryu');
  const zones = {
    self: { active: [active, energyOn(active)], bench: [benched, energyOn(benched)], hand: [], discard: [], deck: [], prizes: [] },
    opp: { active: [], bench: [], hand: [], discard: [], deck: [], prizes: [] },
  };
  globalThis.__costHostZones = zones;
  const healed = [];
  const pickers = [];
  initTrainerExecution({
    getZone: (user, zoneId) => ({ array: zones[user][zoneId], getCount: () => zones[user][zoneId].length }),
    appendMessage: () => {},
    openChoicePicker: (opts) => pickers.push(opts),
    openHealPicker: () => assert.fail('costHost must not open a free heal pick'),
    applyHealToCard: (card, amount) => healed.push({ name: card.name, amount }),
    isPokemonCard: (c) => c?.supertype === 'Pokémon',
  });
  return { zones, active, benched, healed, pickers };
}

test('Super Potion base1-90: the client heals the Pokémon whose Energy paid the cost', async () => {
  const steps = parseTrainerEffect(SUPER_POTION.effect).steps;
  assert.deepEqual(
    steps.map((s) => s.type),
    ['discardOwnAttachedEnergy', 'healAmount']
  );
  const board = setupBoard();
  const done = new Promise((resolve) => runTrainerSteps({ name: 'Super Potion' }, steps, 0, resolve, 'self'));
  assert.equal(board.pickers.length, 1, 'the cost picks an attached Energy');
  const benchEnergy = board.zones.self.bench[1];
  await board.pickers[0].onPick(benchEnergy);
  await done;
  assert.deepEqual(board.healed, [{ name: 'Staryu', amount: 40 }]);
  assert.ok(board.zones.self.discard.includes(benchEnergy));
});

test('Super Potion base1-90: no attached Energy, no heal', async () => {
  const steps = parseTrainerEffect(SUPER_POTION.effect).steps;
  const board = setupBoard();
  board.zones.self.active.splice(1, 1);
  board.zones.self.bench.splice(1, 1);
  await new Promise((resolve) => runTrainerSteps({ name: 'Super Potion' }, steps, 0, resolve, 'self'));
  assert.deepEqual(board.healed, []);
  assert.equal(board.pickers.length, 0);
});
