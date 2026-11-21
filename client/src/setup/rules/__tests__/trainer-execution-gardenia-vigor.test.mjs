// Gardenia's Vigor (corpus out/pkmn-trainer-cards.json, Astral Radiance 143): "Draw 2 cards. If you
// drew any cards in this way, attach up to 2 {G} Energy cards from your hand to 1 of your Benched
// Pokémon." The legacy client executor did not await the draw, so the attach read a hand without the
// drawn Energy ("no matching Energy in hand"), and it ignored the {G} type and the Benched-only target.
// DOM-bound modules are stubbed as in trainer-execution-cost-host.test.mjs; the moveCardBundle stub
// lands its move on a later tick, like the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTrainerEffect } from '../../../../../shared/engine/rules/trainer-effects.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const STUBS = {
  'actions/zones/deck-actions.js': 'export const moveToDeckBottom = () => {};',
  'actions/move-card-bundle/move-card-bundle.js': `export async function moveCardBundle(user, _to, fromZone, toZone, index) {
    const zones = globalThis.__gardeniaZones[user];
    const [card] = zones[fromZone].slice(index, index + 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    zones[fromZone].splice(zones[fromZone].indexOf(card), 1);
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

const CORPUS = JSON.parse(fs.readFileSync(path.join(repoRoot, 'out', 'pkmn-trainer-cards.json'), 'utf8'));
const rows = Array.isArray(CORPUS) ? CORPUS : CORPUS.cards;
const GARDENIAS_VIGOR = rows.find((row) => row.name === 'Gardenia’s Vigor' && row.set === 'Astral Radiance' && row.number === '143');

const pokemon = (name) => ({ name, supertype: 'Pokémon', hp: 100, image: { attached: false } });
const energy = (name) => ({ name, supertype: 'Energy', image: { attached: false } });

function setupBoard({ deck, hand = [] }) {
  const active = pokemon('Active Mon');
  const benched = pokemon('Bench Mon');
  const zones = {
    self: { active: [active], bench: [benched], hand, discard: [], deck, prizes: [] },
    opp: { active: [], bench: [], hand: [], discard: [], deck: [], prizes: [] },
  };
  globalThis.__gardeniaZones = zones;
  const pickers = [];
  initTrainerExecution({
    getZone: (user, zoneId) => ({ array: zones[user][zoneId], getCount: () => zones[user][zoneId].length }),
    appendMessage: () => {},
    openChoicePicker: (opts) => pickers.push(opts),
    isPokemonCard: (c) => c?.supertype === 'Pokémon',
  });
  return { zones, active, benched, pickers };
}

const steps = () => parseTrainerEffect(GARDENIAS_VIGOR.text).steps;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("Gardenia's Vigor: a Grass Energy drawn by the card can be attached to a Benched Pokémon", async () => {
  assert.ok(GARDENIAS_VIGOR, 'corpus row Astral Radiance 143');
  const drawnEnergy = energy('Grass Energy');
  const board = setupBoard({ deck: [drawnEnergy, pokemon('Drawn Mon')] });
  runTrainerSteps({ name: 'Gardenia’s Vigor' }, steps(), 0, () => {}, 'self');
  await settle();
  assert.equal(board.pickers.length, 1, 'the attach offers the Energy drawn by this card');
  assert.deepEqual(board.pickers[0].candidates, [drawnEnergy]);
  board.pickers[0].onConfirm([drawnEnergy]);
  assert.equal(board.pickers.length, 2);
  assert.deepEqual(board.pickers[1].candidates, [board.benched], 'Benched Pokémon only, not the Active');
});

test("Gardenia's Vigor: only {G} Energy is offered", async () => {
  const grass = energy('Grass Energy');
  const board = setupBoard({
    deck: [energy('Fire Energy'), energy('Water Energy')],
    hand: [grass, energy('Lightning Energy')],
  });
  runTrainerSteps({ name: 'Gardenia’s Vigor' }, steps(), 0, () => {}, 'self');
  await settle();
  assert.deepEqual(board.pickers[0].candidates, [grass]);
});

test("Gardenia's Vigor: an empty deck draws nothing, so nothing is attached", async () => {
  const board = setupBoard({ deck: [], hand: [energy('Grass Energy')] });
  await new Promise((resolve) => runTrainerSteps({ name: 'Gardenia’s Vigor' }, steps(), 0, resolve, 'self'));
  assert.equal(board.pickers.length, 0);
});
