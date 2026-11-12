// Steven's Resolve (HB 634, set.json customhb-634): "Flip 2 coins. For each heads, shuffle a card
// from your discard pile back into your deck." The parsed step carries `coins`, so the legacy client
// executor must flip them and let the heads count — not a default of 5 — size the discard pick.
// trainer-execution.js imports browser paths ('/shared/…') and DOM-bound client modules, so this
// file maps '/shared/' onto the repo and stubs the DOM-bound modules before importing it (the same
// harness as trainer-execution-cost-host.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTrainerEffect } from '../../../../../shared/engine/rules/trainer-effects.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const STUBS = {
  'actions/zones/deck-actions.js': 'export const moveToDeckBottom = () => {};',
  'actions/move-card-bundle/move-card-bundle.js': `export async function moveCardBundle(user, _to, fromZone, toZone, index) {
    const zones = globalThis.__shuffleCoinsZones[user];
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

const STEVENS_RESOLVE = 'Flip 2 coins. For each heads, shuffle a card from your discard pile back into your deck.';
const card = (name, supertype = 'Pokémon') => ({ name, supertype, image: {} });

/** A board whose discard pile holds 4 cards; `faces` are the coin results in order. */
function setupBoard(faces) {
  const zones = {
    self: { hand: [], discard: [card('Beldum'), card('Metal Energy', 'Energy'), card('Potion', 'Trainer'), card('Metang')], deck: [card('Deck card', 'Trainer')], prizes: [] },
    opp: { hand: [], discard: [], deck: [], prizes: [] },
  };
  globalThis.__shuffleCoinsZones = zones;
  const pickers = [];
  const flips = [];
  let shuffles = 0;
  initTrainerExecution({
    getZone: (user, zoneId) => ({ array: zones[user][zoneId], getCount: () => zones[user][zoneId].length }),
    appendMessage: () => {},
    openChoicePicker: (opts) => pickers.push(opts),
    shuffleZone: () => {
      shuffles++;
    },
    matchesSearch: () => true,
    isPokemonCard: (c) => c?.supertype === 'Pokémon',
    playCoinFlip: async () => {
      const face = faces[flips.length];
      flips.push(face);
      return face;
    },
  });
  return { zones, pickers, flips, shuffleCount: () => shuffles };
}

const play = (steps) =>
  new Promise((resolve) => runTrainerSteps({ name: "Steven's Resolve" }, steps, 0, resolve, 'self'));
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

test("Steven's Resolve parses to a coin-driven shuffleFromDiscard step", () => {
  assert.deepEqual(parseTrainerEffect(STEVENS_RESOLVE).steps, [
    { type: 'shuffleFromDiscard', what: 'card', coins: 2, perHeads: 1 },
  ]);
});

test("Steven's Resolve (client): 2 heads let the player shuffle 2 discard cards into the deck", async () => {
  const board = setupBoard(['heads', 'heads']);
  const done = play(parseTrainerEffect(STEVENS_RESOLVE).steps);
  await nextTick();
  assert.deepEqual(board.flips, ['heads', 'heads'], 'both coins are flipped');
  assert.equal(board.pickers.length, 1);
  assert.equal(board.pickers[0].requiredCount, 2);
  assert.equal(board.pickers[0].candidates.length, 4, 'any card in the discard pile qualifies');
  const [first, second] = board.pickers[0].candidates;
  await board.pickers[0].onConfirm([first, second]);
  await done;
  assert.deepEqual(board.zones.self.discard.map((c) => c.name), ['Potion', 'Metang']);
  assert.equal(board.zones.self.deck.length, 3);
  assert.equal(board.shuffleCount(), 1, 'the deck is shuffled once');
});

test("Steven's Resolve (client): 1 heads takes 1 card, 2 tails take none", async () => {
  const oneHead = setupBoard(['tails', 'heads']);
  const oneDone = play(parseTrainerEffect(STEVENS_RESOLVE).steps);
  await nextTick();
  assert.equal(oneHead.pickers[0].requiredCount, 1);
  await oneHead.pickers[0].onConfirm([oneHead.pickers[0].candidates[0]]);
  await oneDone;
  assert.equal(oneHead.zones.self.deck.length, 2);

  const noHeads = setupBoard(['tails', 'tails']);
  await play(parseTrainerEffect(STEVENS_RESOLVE).steps);
  assert.equal(noHeads.pickers.length, 0, 'no picker without a heads');
  assert.equal(noHeads.zones.self.discard.length, 4);
  assert.equal(noHeads.zones.self.deck.length, 1);
});
